import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiaryHandler, validateDiarySettings } from '../api/diary.js';

const origin = 'https://soultosolebylouise.com';
const token = 'a78a92f1-59d3-4718-a86c-13c304634313';
const sessionCookie = `__Host-louise_diary=${token}`;
const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
function harness(reply = () => jsonResponse({ success: true })) {
  const calls = [];
  const handler = createDiaryHandler({ env: { NODE_ENV: 'production', VERCEL_ENV: 'production' }, fetchImpl: async (...args) => { calls.push(args); return reply(...args); } });
  return { calls, handler };
}
async function invoke(handler, { route = 'session', method = 'GET', body, cookie = '', requestOrigin = origin, extraQuery = '', headers = {} } = {}) {
  const out = { headers: {} };
  const res = { setHeader(k, v) { out.headers[k] = v; }, status(code) { out.status = code; return this; }, json(value) { out.body = value; return this; } };
  await handler({ method, url: `/api/diary?route=${route}${extraQuery}`, headers: { origin: requestOrigin, cookie, 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.1', ...headers }, body }, res);
  return out;
}

test('signed-out visitors cannot read bookings or change availability', async () => {
  const { handler, calls } = harness();
  assert.deepEqual((await invoke(handler)).body, { authenticated: false });
  assert.equal((await invoke(handler, { route: 'bookings' })).status, 401);
  assert.equal((await invoke(handler, { route: 'settings', method: 'PUT', body: { booking: { workingDays: [] } } })).status, 401);
  assert.equal(calls.length, 0);
});
test('cross-site and missing-origin writes are denied before reaching the diary', async () => {
  const { handler, calls } = harness();
  for (const requestOrigin of ['', 'https://attacker.example', 'http://localhost:8000']) {
    assert.equal((await invoke(handler, { route: 'blocks', method: 'POST', cookie: sessionCookie, requestOrigin, body: { type: 'day', date: '2026-10-15' } })).status, 403);
  }
  assert.equal(calls.length, 0);
});
test('unknown paths, permanent deletion and wrong methods are never proxied', async () => {
  const { handler, calls } = harness();
  assert.equal((await invoke(handler, { route: '../settings', cookie: sessionCookie })).status, 404);
  assert.equal((await invoke(handler, { route: 'bookings', method: 'DELETE', cookie: sessionCookie })).status, 405);
  assert.equal(calls.length, 0);
});
test('login transfers only the upstream session into an HttpOnly host-only cookie', async () => {
  const { handler, calls } = harness(() => jsonResponse({ success: true }, 200, { 'Set-Cookie': `admin_session=${token}; Path=/; HttpOnly` }));
  const result = await invoke(handler, { route: 'login', method: 'POST', body: { username: ' Louise ', password: 'a-test-password' }, cookie: 'unrelated=private' });
  assert.equal(result.status, 200);
  assert.match(result.headers['Set-Cookie'], /^__Host-louise_diary=/);
  for (const attr of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/', 'Max-Age=43200']) assert.ok(result.headers['Set-Cookie'].includes(attr));
  assert.ok(!result.headers['Set-Cookie'].includes('Domain='));
  assert.deepEqual(result.body, { success: true });
  assert.deepEqual(JSON.parse(calls[0][1].body), { username: 'Louise', password: 'a-test-password' });
  assert.equal(calls[0][1].headers.cookie, undefined);
});
test('failed login never exposes upstream credential configuration or creates a session', async () => {
  const { handler } = harness(() => jsonResponse({ error: 'Secret environment configuration detail' }, 401));
  const result = await invoke(handler, { route: 'login', method: 'POST', body: { username: 'Louise', password: 'wrong' } });
  assert.equal(result.status, 401);
  assert.ok(!result.body.error.includes('Secret'));
  assert.match(result.headers['Set-Cookie'], /Max-Age=0/);
});
test('malformed upstream session cookies fail closed', async () => {
  const { handler } = harness(() => jsonResponse({ success: true }, 200, { 'Set-Cookie': 'admin_session=invalid; Path=/' }));
  assert.equal((await invoke(handler, { route: 'login', method: 'POST', body: { username: 'Louise', password: 'test' } })).status, 503);
});
test('private requests forward only the diary token and forbid caching', async () => {
  const { handler, calls } = harness(() => jsonResponse({ items: [] }));
  const result = await invoke(handler, { route: 'bookings', cookie: `other=secret; ${sessionCookie}` });
  assert.equal(result.status, 200);
  assert.equal(calls[0][1].headers.cookie, `admin_session=${token}`);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.equal(calls[0][1].redirect, 'error');
});
test('logout clears the browser cookie even when the upstream host is unavailable', async () => {
  const { handler } = harness(() => { throw new Error('Offline'); });
  const result = await invoke(handler, { route: 'logout', method: 'POST', cookie: sessionCookie });
  assert.equal(result.status, 200);
  assert.match(result.headers['Set-Cookie'], /Max-Age=0/);
});
test('invalid hours and settings cannot reach the backend', () => {
  for (const body of [{ business: { ownerEmail: 'changed@example.test' } }, { booking: { workingHours: { start: '18:00', end: '09:00' } } }, { booking: { workingHours: { start: '09:00', end: '25:00' } } }, { booking: { workingDays: [8] } }, { booking: { minNoticeHours: -1 } }, { booking: { maxAdvanceBookingDays: 0 } }, { booking: { slotIntervalMinutes: 0 } }]) assert.throws(() => validateDiarySettings(body), { status: 400 });
  assert.deepEqual(validateDiarySettings({ booking: { workingDays: [] } }), { booking: { workingDays: [] } });
});
test('invalid calendar dates and reverse time blocks are rejected', async () => {
  const { handler, calls } = harness();
  for (const body of [{ type: 'day', date: '2026-02-30' }, { type: 'range', date: '2026-10-15', start: '14:00', end: '13:00' }]) assert.equal((await invoke(handler, { route: 'blocks', method: 'POST', cookie: sessionCookie, body })).status, 400);
  assert.equal(calls.length, 0);
});
test('availability changes use the original authenticated booking API', async () => {
  const { handler, calls } = harness();
  const body = { booking: { workingDays: [1, 3, 5], workingHours: { start: '10:00', end: '16:00' } } };
  assert.equal((await invoke(handler, { route: 'settings', method: 'PUT', cookie: sessionCookie, body })).status, 200);
  assert.equal(calls[0][0], 'https://wellness-booking-site.onrender.com/api/admin/settings');
  assert.deepEqual(JSON.parse(calls[0][1].body), body);
});
test('appointments already cancelled at the time of the read are not reopened', async () => {
  const { handler, calls } = harness(() => jsonResponse({ booking: { status: 'cancelled' } }));
  assert.equal((await invoke(handler, { route: 'status', method: 'PATCH', cookie: sessionCookie, extraQuery: `&id=${token}`, body: { status: 'confirmed' } })).status, 409);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].method, undefined);
});
test('upstream failure is never reported as saved', async () => {
  const { handler } = harness(() => { throw new Error('Network timeout'); });
  const result = await invoke(handler, { route: 'blocks', method: 'POST', cookie: sessionCookie, body: { type: 'day', date: '2026-10-15' } });
  assert.equal(result.status, 503);
  assert.equal(result.body.success, undefined);
});
test('warm-instance login throttling prevents repeated forwarding', async () => {
  const { handler, calls } = harness(() => jsonResponse({ error: 'Invalid credentials' }, 401));
  for (let i = 0; i < 8; i++) await invoke(handler, { route: 'login', method: 'POST', body: { username: 'Louise', password: 'wrong' } });
  assert.equal((await invoke(handler, { route: 'login', method: 'POST', body: { username: 'Louise', password: 'wrong' } })).status, 429);
  assert.equal(calls.length, 8);
});
