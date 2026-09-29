import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { BUSINESS_CONFIG } from '../config/business.config.js';
import { createDiaryStore, DIARY_SCHEMA } from '../lib/diary-store.js';
import { hashPassword } from '../lib/diary-auth.js';
import { createDiaryHandler } from '../api/diary.js';
import { createBookingHandler } from '../api/bookings.js';
import { createAvailabilityHandler } from '../api/availability.js';

// Explicit opt-in only: never fall back to DATABASE_URL or load an env file here.
// Every application query runs with search_path restricted to our new schema.
// Only a disposable LOCAL server is permitted; reject remote targets before I/O.
const connectionString = process.env.DIARY_TEST_DATABASE_URL;
const origin = 'https://soultosolebylouise.com';
const now = () => new Date('2030-01-01T08:00:00Z');
const password = 'test-only-secret';

async function invoke(handler, { url, method = 'GET', body, cookie = '', ip = '192.0.2.1', requestOrigin = origin } = {}) {
  const result = { headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name] = value; },
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; }
  };
  await handler({ method, url, headers: { origin: requestOrigin, cookie, 'content-type': 'application/json', 'x-vercel-forwarded-for': ip }, body }, res);
  return result;
}

function appointment(number, overrides = {}) {
  return {
    fullName: `Integration Test Client ${number}`,
    email: `diary-integration-${number}@example.test`,
    phone: '+353000000000',
    serviceId: 'reflexology',
    date: '2030-01-05',
    time: '10:00',
    notes: 'Synthetic integration-test appointment; no email is sent.',
    preferredContactMethod: 'email',
    consentAccepted: true,
    website: '',
    ...overrides
  };
}

test('real Postgres diary integration in an isolated temporary schema', {
  skip: connectionString ? false : 'Set DIARY_TEST_DATABASE_URL to run isolated Postgres integration tests.',
  timeout: 180000
}, async (t) => {
  const schema = `diary_test_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  assert.match(schema, /^diary_test_[0-9]+_[a-f0-9]{20}$/);
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), 'Integration tests require a literal loopback database address.');
  assert.ok(!url.searchParams.has('host') && !url.searchParams.has('hostaddr'), 'Host overrides are not permitted in the test database URL.');
  if (url.searchParams.get('sslmode') !== 'disable') url.searchParams.set('sslmode', 'verify-full');
  const administrator = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  const stores = new Set();
  let schemaCreated = false;
  let administratorConnected = false;
  let store;
  let cookie;
  let winningPayload;
  let winningReference;
  let sent = 0;
  const env = { NODE_ENV: 'production', VERCEL_ENV: 'production', DIARY_USERNAME: 'integration-test-owner', DIARY_PASSWORD_HASH: await hashPassword(password) };
  const deliver = async () => { sent += 1; return true; };
  const noNetwork = async () => { throw new Error('External email/network access is forbidden in this integration test.'); };
  const diary = db => createDiaryHandler({ store: db, env });
  const booking = (db, send = deliver) => createBookingHandler({ store: db, env, now, deliver: send, fetchImpl: noNetwork });
  const availability = db => createAvailabilityHandler({ store: db, now });
  const openStore = async () => {
    const db = createDiaryStore({ connectionString, schema });
    stores.add(db);
    const { rows } = await db.query('SELECT current_schema() AS schema, current_setting(\'search_path\') AS path');
    assert.equal(rows[0].schema, schema, 'test queries must not resolve to a production schema');
    assert.equal(rows[0].path, schema, 'the search path must contain only the test schema');
    return db;
  };
  const closeStore = async db => { await db.close(); stores.delete(db); };
  const countBookings = async () => Number((await store.query('SELECT count(*) AS count FROM diary_bookings')).rows[0].count);
  const rowForReference = async reference => (await store.query("SELECT id, data FROM diary_bookings WHERE data->>'bookingReference'=$1", [reference])).rows[0];
  const getSlots = async date => invoke(availability(store), { url: `/api/availability?action=slots&serviceId=reflexology&date=${date}` });
  const admin = (route, method = 'GET', body, extra = '') => invoke(diary(store), { url: `/api/diary?route=${route}${extra}`, method, body, cookie });

  try {
    await administrator.connect();
    administratorConnected = true;
    // No IF NOT EXISTS: only a schema successfully created by this run may be dropped.
    await administrator.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    store = await openStore();
    await store.query(DIARY_SCHEMA);
    const config = structuredClone(BUSINESS_CONFIG);
    config.booking = { ...config.booking, workingDays: [0, 1, 2, 3, 4, 5, 6], workingHours: { start: '09:00', end: '18:00' }, minNoticeHours: 0, maxAdvanceBookingDays: 90, disabledDates: [], blockedTimeRangesByDate: {} };
    await store.query("INSERT INTO diary_config(id,data) VALUES('main',$1::jsonb)", [JSON.stringify(config)]);

    await t.test('login creates a private cookie and stores only a session digest; unauthenticated reads are denied', async () => {
      for (const route of ['settings', 'bookings']) {
        const response = await invoke(diary(store), { url: `/api/diary?route=${route}` });
        assert.equal(response.status, 401);
        assert.equal(response.body.items, undefined);
        assert.equal(response.body.settings, undefined);
      }
      const wrong = await invoke(diary(store), { url: '/api/diary?route=login', method: 'POST', body: { username: env.DIARY_USERNAME, password: 'incorrect-test-only-secret' } });
      assert.equal(wrong.status, 401);
      const login = await invoke(diary(store), { url: '/api/diary?route=login', method: 'POST', body: { username: env.DIARY_USERNAME, password } });
      assert.equal(login.status, 200);
      assert.deepEqual(login.body, { success: true });
      for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/']) assert.ok(login.headers['Set-Cookie'].includes(attribute));
      cookie = login.headers['Set-Cookie'].split(';')[0];
      const token = cookie.split('=')[1];
      const rows = (await store.query('SELECT token_hash FROM diary_sessions')).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].token_hash, createHash('sha256').update(token).digest('hex'));
      assert.notEqual(rows[0].token_hash, token);
      assert.deepEqual((await admin('session')).body, { authenticated: true });
    });

    await t.test('saved hours, a time range and a day closure survive a new connection and control public slots', async () => {
      const hours = { start: '10:00', end: '16:00' };
      assert.equal((await admin('settings', 'PUT', { booking: { workingHours: hours } })).status, 200);
      assert.equal((await admin('blocks', 'POST', { type: 'range', date: '2030-01-03', start: '12:00', end: '13:00' })).status, 200);
      assert.equal((await admin('blocks', 'POST', { type: 'day', date: '2030-01-04' })).status, 200);
      await closeStore(store);
      store = await openStore();
      assert.deepEqual((await admin('session')).body, { authenticated: true }, 'the login must also survive new function/connection instances');
      const settings = await admin('settings');
      assert.equal(settings.status, 200);
      assert.deepEqual(settings.body.settings.booking.workingHours, hours);
      assert.deepEqual(settings.body.settings.booking.blockedTimeRangesByDate['2030-01-03'], ['12:00-13:00']);
      assert.ok(settings.body.settings.booking.disabledDates.includes('2030-01-04'));
      const openDay = await getSlots('2030-01-03');
      assert.equal(openDay.status, 200);
      assert.equal(openDay.body.slots[0].time, '10:00');
      assert.equal(openDay.body.slots.at(-1).time, '15:00');
      assert.equal(openDay.body.slots.find(s => s.time === '12:00').available, false);
      assert.equal(openDay.body.slots.find(s => s.time === '13:00').available, true);
      const closedDay = await getSlots('2030-01-04');
      assert.equal(closedDay.status, 200);
      assert.deepEqual(closedDay.body.slots, []);
      const summary = await invoke(availability(store), { url: '/api/availability?action=summary&serviceId=reflexology&month=2030-01' });
      assert.equal(summary.status, 200);
      assert.equal(summary.body.days.find(d => d.date === '2030-01-04').availableCount, 0);
      assert.ok(summary.body.days.find(d => d.date === '2030-01-03').availableCount > 0);
    });

    await t.test('two real database pools cannot accept overlapping requests from different clients and services', async () => {
      const other = await openStore();
      const payloads = [appointment(1), appointment(2, { serviceId: 'pregnancy-reflexology' })];
      const results = await Promise.all([
        invoke(booking(store), { url: '/api/bookings', method: 'POST', body: payloads[0], ip: '192.0.2.11' }),
        invoke(booking(other), { url: '/api/bookings', method: 'POST', body: payloads[1], ip: '192.0.2.12' })
      ]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      const index = results.findIndex(r => r.status === 201);
      winningPayload = payloads[index];
      winningReference = results[index].body.booking.bookingReference;
      assert.equal(await countBookings(), 1);
      assert.equal((await rowForReference(winningReference)).data.status, 'pending');
      assert.equal(sent, 1);
      assert.equal((await getSlots('2030-01-05')).body.slots.find(s => s.time === '10:00').available, false);
      await closeStore(other);
    });

    await t.test('concurrent retries return the saved reference without extra bookings or notifications', async () => {
      const other = await openStore();
      const results = await Promise.all([store, other, store].map(db => invoke(booking(db), { url: '/api/bookings', method: 'POST', body: winningPayload, ip: '192.0.2.13' })));
      for (const response of results) {
        assert.equal(response.status, 201);
        assert.equal(response.body.booking.bookingReference, winningReference);
        assert.equal(response.body.emailStatus.status, 'previously-recorded');
      }
      assert.equal(await countBookings(), 1);
      assert.equal(Number((await store.query('SELECT count(*) AS count FROM diary_notifications')).rows[0].count), 1);
      assert.equal(sent, 1);
      await closeStore(other);
    });

    await t.test('confirmation and cancellation persist, and a cancelled booking cannot be reactivated over a replacement', async () => {
      const original = await rowForReference(winningReference);
      const extra = `&id=${original.id}`;
      assert.equal((await admin('status', 'PATCH', { status: 'confirmed' }, extra)).status, 200);
      assert.equal((await admin('status', 'PATCH', { status: 'cancelled' }, extra)).status, 200);
      const replacement = await invoke(booking(store), { url: '/api/bookings', method: 'POST', body: appointment(3), ip: '192.0.2.14' });
      assert.equal(replacement.status, 201);
      assert.notEqual(replacement.body.booking.bookingReference, winningReference);
      for (const status of ['pending', 'confirmed']) assert.equal((await admin('status', 'PATCH', { status }, extra)).status, 409);
      assert.equal((await rowForReference(winningReference)).data.status, 'cancelled');
      assert.equal(Number((await store.query("SELECT count(*) AS count FROM diary_bookings WHERE data->>'date'='2030-01-05' AND data->>'status' IN ('pending','confirmed')")).rows[0].count), 1);
    });

    await t.test('failed notification delivery still reports a saved pending request and retries do not send again', async () => {
      let attempted = 0;
      const failedDelivery = async () => { attempted += 1; return false; };
      const body = appointment(4, { date: '2030-01-06' });
      const response = await invoke(booking(store, failedDelivery), { url: '/api/bookings', method: 'POST', body, ip: '192.0.2.15' });
      assert.equal(response.status, 201);
      assert.equal(response.body.success, true);
      assert.equal(response.body.emailStatus.status, 'unconfirmed');
      const saved = await rowForReference(response.body.booking.bookingReference);
      assert.equal(saved.data.status, 'pending');
      assert.equal((await store.query('SELECT state FROM diary_notifications WHERE booking_id=$1', [saved.id])).rows[0].state, 'unconfirmed');
      const retry = await invoke(booking(store, failedDelivery), { url: '/api/bookings', method: 'POST', body, ip: '192.0.2.15' });
      assert.equal(retry.status, 201);
      assert.equal(retry.body.booking.bookingReference, response.body.booking.bookingReference);
      assert.equal(attempted, 1);
    });

    await t.test('invalid submissions return field errors without inserting, and private booking details remain protected', async () => {
      const before = await countBookings();
      const response = await invoke(booking(store), { url: '/api/bookings', method: 'POST', body: appointment(5, { email: 'not-an-email', time: '25:00', consentAccepted: 'true', website: 'spam' }), ip: '192.0.2.16' });
      assert.equal(response.status, 422);
      for (const key of ['email', 'time', 'consentAccepted', 'website']) assert.ok(response.body.fieldErrors[key]);
      const multipleRecipients = await invoke(booking(store), { url: '/api/bookings', method: 'POST', body: appointment(5, { email: 'first@example.test,second@example.test' }), ip: '192.0.2.16' });
      assert.equal(multipleRecipients.status, 422);
      assert.ok(multipleRecipients.body.fieldErrors.email);
      assert.equal(await countBookings(), before);
      const privateRead = await invoke(diary(store), { url: '/api/diary?route=bookings', cookie: `__Host-louise_diary=${randomUUID()}` });
      assert.equal(privateRead.status, 401);
      assert.equal(privateRead.body.items, undefined);
      const crossSite = await invoke(diary(store), { url: '/api/diary?route=blocks', method: 'POST', cookie, requestOrigin: 'https://attacker.example', body: { type: 'day', date: '2030-01-08' } });
      assert.equal(crossSite.status, 403);
      assert.ok(!(await admin('settings')).body.settings.booking.disabledDates.includes('2030-01-08'));
      const publicSlots = JSON.stringify((await getSlots('2030-01-06')).body);
      assert.ok(!publicSlots.includes('Integration Test Client'));
      assert.ok(!publicSlots.includes('@example.test'));
      assert.ok(!publicSlots.includes('Synthetic integration-test'));
    });

    await t.test('existing appointments prevent conflicting closures and hours changes without partial settings writes', async () => {
      for (const body of [{ type: 'day', date: '2030-01-06' }, { type: 'range', date: '2030-01-06', start: '10:00', end: '11:00' }]) assert.equal((await admin('blocks', 'POST', body)).status, 409);
      assert.equal((await admin('settings', 'PUT', { booking: { workingHours: { start: '11:00', end: '16:00' } } })).status, 409);
      const settings = (await admin('settings')).body.settings.booking;
      assert.deepEqual(settings.workingHours, { start: '10:00', end: '16:00' });
      assert.ok(!settings.disabledDates.includes('2030-01-06'));
      assert.equal(settings.blockedTimeRangesByDate['2030-01-06'], undefined);
    });

    await t.test('a concurrent closure and public request cannot both reserve the same time', async () => {
      const other = await openStore();
      const [request, closure] = await Promise.all([
        invoke(booking(other), { url: '/api/bookings', method: 'POST', body: appointment(6, { date: '2030-01-07' }), ip: '192.0.2.17' }),
        admin('blocks', 'POST', { type: 'range', date: '2030-01-07', start: '10:00', end: '11:00' })
      ]);
      assert.ok((request.status === 201 && closure.status === 409) || (request.status === 409 && closure.status === 200), `Expected one accepted operation, got booking ${request.status} and closure ${closure.status}`);
      assert.equal((await getSlots('2030-01-07')).body.slots.find(s => s.time === '10:00').available, false);
      await closeStore(other);
    });

    await t.test('logout revokes the durable session for a new handler', async () => {
      assert.equal((await admin('logout', 'POST', {})).status, 200);
      assert.deepEqual((await admin('session')).body, { authenticated: false });
      assert.equal((await admin('bookings')).status, 401);
    });
  } finally {
    // All stores are closed before dropping ONLY the exact schema created above.
    const failures = [];
    for (const db of stores) {
      try { await db.close(); } catch { failures.push('Could not close an isolated test connection.'); }
    }
    if (schemaCreated) {
      try {
        await administrator.query(`DROP SCHEMA "${schema}" CASCADE`);
        assert.equal((await administrator.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rowCount, 0);
      } catch { failures.push(`Could not remove isolated test schema ${schema}.`); }
    }
    if (administratorConnected) {
      try { await administrator.end(); } catch { failures.push('Could not close the test schema administrator connection.'); }
    }
    assert.deepEqual(failures, [], 'Temporary-schema cleanup must finish successfully.');
  }
});
