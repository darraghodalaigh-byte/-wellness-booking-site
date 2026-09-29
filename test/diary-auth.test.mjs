import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, createDiaryAuth } from '../lib/diary-auth.js';

// These are test-only inputs, never deployment credentials.
const password = 'Test-only diary phrase — á 123';
const username = 'test-diary-owner';
let encoded;
before(async () => { encoded = await hashPassword(password); });
const digest = (value) => createHash('sha256').update(value).digest('hex');

function database() {
  const sessions = new Map();
  const limits = new Map();
  const calls = [];
  const query = async (sql, values) => {
    calls.push({ sql, values: [...values] });
    if (/INSERT INTO diary_limits/.test(sql)) {
      assert.match(sql, /ON CONFLICT \(key\) DO UPDATE SET/);
      const [key, now, expires] = values;
      const existing = limits.get(key);
      const row = !existing || new Date(existing.expires_at) <= new Date(now)
        ? { count: 1, expires_at: expires }
        : { count: Math.min(existing.count, 8) + 1, expires_at: existing.expires_at };
      limits.set(key, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }
    if (/INSERT INTO diary_sessions/.test(sql)) {
      const [token_hash, expires_at] = values;
      assert.match(token_hash, /^[a-f0-9]{64}$/);
      assert.ok(!sessions.has(token_hash));
      sessions.set(token_hash, { token_hash, expires_at });
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT token_hash FROM diary_sessions/.test(sql)) {
      const row = sessions.get(values[0]);
      const valid = row && new Date(row.expires_at) > new Date(values[1]);
      return { rows: valid ? [{ ...row }] : [], rowCount: valid ? 1 : 0 };
    }
    if (/DELETE FROM diary_sessions/.test(sql)) {
      return { rows: [], rowCount: Number(sessions.delete(values[0])) };
    }
    throw new Error('Unexpected database operation in diary-auth test.');
  };
  return { query, sessions, limits, calls };
}

function harness({ db = database(), env, now: suppliedNow } = {}) {
  let time = Date.parse('2026-09-29T12:00:00Z');
  const now = suppliedNow || (() => time);
  const configuration = env || { DIARY_USERNAME: username, DIARY_PASSWORD_HASH: encoded };
  return {
    db,
    auth: createDiaryAuth({ query: db.query, env: configuration, now }),
    now: () => time,
    advance: (milliseconds) => { time += milliseconds; },
  };
}

test('password hashing uses random salts and verifies exact UTF-8 input asynchronously', async () => {
  let finished = false;
  const pending = hashPassword(password).then((value) => { finished = true; return value; });
  assert.ok(pending instanceof Promise);
  await new Promise(setImmediate);
  assert.equal(finished, false, 'password derivation must not block the event loop');
  const other = await pending;
  assert.match(other, /^scrypt\$1\$131072\$8\$1\$/);
  assert.notEqual(other, encoded);
  assert.ok(!other.includes(password));
  assert.equal(await verifyPassword(password, other), true);
  assert.equal(await verifyPassword(`${password} `, other), false);
  assert.equal(await verifyPassword('wrong-test-password', other), false);
});

test('malformed hashes and unsupported work factors fail closed', async () => {
  for (const value of [null, {}, '', encoded.replace('131072', '1073741824'), encoded.replace('$1$', '$2$'), encoded.slice(0, -1), `${encoded}=`, 'x'.repeat(10000)]) {
    assert.equal(await verifyPassword(password, value), false);
  }
});

test('password inputs are bounded by type and UTF-8 bytes without truncation', async () => {
  for (const value of ['', null, {}, 12, 'x'.repeat(1025), 'é'.repeat(513)]) {
    await assert.rejects(hashPassword(value), TypeError);
    assert.equal(await verifyPassword(value, encoded), false);
  }
  const boundary = 'é'.repeat(512);
  assert.equal(await verifyPassword(boundary, await hashPassword(boundary)), true);
});

test('valid login stores only a token digest and a twelve-hour expiry', async () => {
  const { auth, db, now } = harness();
  const token = await auth.login({ username: ` ${username} `, password, ip: '192.0.2.1' });
  assert.match(token, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(db.sessions.size, 1);
  assert.deepEqual(db.sessions.get(digest(token)), { token_hash: digest(token), expires_at: new Date(now() + 12 * 60 * 60 * 1000).toISOString() });
  const allParameters = JSON.stringify(db.calls.map((call) => call.values));
  for (const privateValue of [token, password, encoded, '192.0.2.1']) assert.ok(!allParameters.includes(privateValue));
  assert.equal(await auth.authenticate(token), true);
});

test('wrong username, wrong password, malformed input and missing configuration share a generic failure', async () => {
  const { auth, db } = harness();
  const inputs = [
    { username: 'someone-else', password },
    { username, password: 'incorrect-test-password' },
    { username: 'x'.repeat(129), password },
    { username: {}, password },
    { username, password: null },
    { username: ' ', password },
    null,
  ];
  for (const input of inputs) await assert.rejects(auth.login(input), { message: 'Invalid username or password.', status: 401 });
  const missing = harness({ env: {} });
  await assert.rejects(missing.auth.login({ username, password }), { message: 'Invalid username or password.', status: 401 });
  assert.equal(db.sessions.size, 0);
  assert.equal(missing.db.sessions.size, 0);
});

test('eight attempts are allowed per IP and the ninth is limited across helper instances', async () => {
  const db = database();
  const first = harness({ db });
  const second = harness({ db });
  // Empty passwords still consume attempts but do not spend scrypt work.
  for (let index = 0; index < 8; index++) {
    const auth = index % 2 ? second.auth : first.auth;
    await assert.rejects(auth.login({ username, password: '', ip: '192.0.2.10' }), { status: 401 });
  }
  await assert.rejects(second.auth.login({ username, password, ip: '192.0.2.10' }), { status: 429, retryAfter: 900 });
  assert.equal(db.sessions.size, 0);
  assert.equal(db.calls.filter((call) => call.sql.includes('diary_limits')).length, 9);
  await assert.rejects(first.auth.login({ username, password: '', ip: '192.0.2.11' }), { status: 401 });
  assert.equal(db.limits.size, 2);
});

test('concurrent attempts consume a single atomic bucket', async () => {
  const db = database();
  const { auth } = harness({ db });
  const results = await Promise.allSettled(Array.from({ length: 16 }, () => auth.login({ username, password: '', ip: '192.0.2.20' })));
  assert.equal(results.filter((result) => result.reason?.status === 401).length, 8);
  assert.equal(results.filter((result) => result.reason?.status === 429).length, 8);
  assert.equal(db.limits.size, 1);
  assert.equal([...db.limits.values()][0].count, 9);
  assert.ok(db.calls.every((call) => call.sql.includes('INSERT INTO diary_limits') && call.sql.includes('RETURNING count, expires_at')));
});

test('the fixed fifteen-minute window is not extended by blocked attempts and resets at its boundary', async () => {
  const { auth, db, advance } = harness();
  for (let index = 0; index < 8; index++) await assert.rejects(auth.login({ password: '', ip: '192.0.2.30' }), { status: 401 });
  const originalExpiry = [...db.limits.values()][0].expires_at;
  advance(14 * 60 * 1000);
  await assert.rejects(auth.login({ username, password, ip: '192.0.2.30' }), { status: 429, retryAfter: 60 });
  assert.equal([...db.limits.values()][0].expires_at, originalExpiry);
  advance(60 * 1000);
  const token = await auth.login({ username, password, ip: '192.0.2.30' });
  assert.equal(await auth.authenticate(token), true);
  assert.equal([...db.limits.values()][0].count, 1);
});

test('missing or oversized IP addresses share a bounded fallback bucket', async () => {
  const { auth, db } = harness();
  for (let index = 0; index < 8; index++) await assert.rejects(auth.login({ username, password: '', ip: index % 2 ? 'x'.repeat(1000) : undefined }), { status: 401 });
  await assert.rejects(auth.login({ username, password, ip: null }), { status: 429 });
  assert.equal(db.limits.size, 1);
  assert.ok([...db.limits.keys()][0].length < 100);
});

test('sessions expire exactly after twelve hours and logout revokes only the matching token', async () => {
  const { auth, db, advance } = harness();
  const token = await auth.login({ username, password, ip: '192.0.2.40' });
  const unrelated = randomUUID();
  db.sessions.set(digest(unrelated), { token_hash: digest(unrelated), expires_at: '2026-10-01T12:00:00Z' });
  advance(12 * 60 * 60 * 1000 - 1);
  assert.equal(await auth.authenticate(token), true);
  advance(1);
  assert.equal(await auth.authenticate(token), false);
  await auth.logout(token);
  assert.equal(db.sessions.has(digest(token)), false);
  assert.equal(await auth.authenticate(unrelated), true);
  await auth.logout(token);
  await auth.logout(unrelated);
  assert.equal(await auth.authenticate(unrelated), false);
});

test('malformed tokens never reach the database and unknown UUIDs are unauthenticated', async () => {
  const { auth, db } = harness();
  for (const token of [undefined, null, {}, '', 'not-a-session', 'a'.repeat(10000), "'; DROP TABLE diary_sessions; --"]) {
    assert.equal(await auth.authenticate(token), false);
    await auth.logout(token);
  }
  assert.equal(db.calls.length, 0);
  assert.equal(await auth.authenticate(randomUUID()), false);
  assert.equal(db.calls.length, 1);
});

test('Date-returning clocks work and database errors do not authenticate or create sessions', async () => {
  const h = harness({ now: () => new Date('2026-09-29T12:00:00Z') });
  const token = await h.auth.login({ username, password });
  assert.equal(await h.auth.authenticate(token), true);
  const offline = new Error('Database unavailable in test');
  const auth = createDiaryAuth({ query: async () => { throw offline; }, env: { DIARY_USERNAME: username, DIARY_PASSWORD_HASH: encoded } });
  await assert.rejects(auth.login({ username, password }), (error) => error === offline);
  await assert.rejects(auth.authenticate(token), (error) => error === offline);
  await assert.rejects(auth.logout(token), (error) => error === offline);
});
