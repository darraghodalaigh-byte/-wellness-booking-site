import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiaryHandler, validateDiarySettings } from '../api/diary.js';

const origin = 'https://soultosolebylouise.com';
const token = 'a78a92f1-59d3-4718-a86c-13c304634313';
const bookingId = '73a4e7cf-3f42-4b93-8689-f3bb022f5f44';
const sessionCookie = `__Host-louise_diary=${token}`;
const bodyLimit = 24 * 1024;
const clone = value => structuredClone(value);
const failure = (status, message) => Object.assign(new Error(message), { status });

function fixtureConfig() {
  return {
    business: { ownerEmail: 'owner@example.test', privateConfiguration: 'not public diary settings' },
    booking: {
      workingDays: [0, 1, 2, 3, 4, 5, 6], workingHours: { start: '09:00', end: '18:00' },
      bufferBetweenAppointmentsMinutes: 15, minNoticeHours: 24, maxAdvanceBookingDays: 90,
      disabledDates: [], blockedTimeRangesByDate: {}, slotIntervalMinutes: 15,
    },
    services: [{ id: 'reflexology', name: 'Reflexology', durationMinutes: 60, priceGBP: 45,
      shortDescription: 'A session', benefits: ['Time to pause'], active: true }],
  };
}

function fixtureBooking(status = 'pending') {
  return { id: bookingId, bookingReference: 'TEST-ONLY', fullName: 'Test Person',
    email: 'person@example.test', phone: 'test-only', serviceName: 'Reflexology',
    date: '2099-10-15', time: '10:00', durationMinutes: 60, status, notes: 'A test note' };
}

// PostgreSQL transactions and constraints have separate integration coverage.
// This small storage double tests the public HTTP contract without a database.
function harness({ config = fixtureConfig(), bookings = [], notifications = {}, auth = {}, failOperation, env } = {}) {
  const state = { config: clone(config), bookings: clone(bookings) };
  const calls = { operations: [], authenticate: [], login: [], logout: [], transactions: 0 };
  async function queryOn(target, text, params = []) {
    let operation;
    if (/^SELECT\b/i.test(text) && /FROM diary_config\b/i.test(text)) operation = 'readConfig';
    else if (/^SELECT\b/i.test(text) && /FROM diary_bookings\b/i.test(text)) operation = params.length ? 'readBooking' : 'readBookings';
    else if (/^UPDATE diary_config\b/i.test(text)) operation = 'saveConfig';
    else if (/^UPDATE diary_bookings\b/i.test(text)) operation = 'saveBooking';
    else throw new Error('Unexpected storage operation in diary test');
    calls.operations.push(operation);
    if (failOperation === operation || failOperation === 'all') throw new Error('Private database connection detail');
    if (operation === 'readConfig') return { rows: target.config ? [{ data: clone(target.config) }] : [], rowCount: target.config ? 1 : 0 };
    if (operation === 'readBookings') return { rows: clone(target.bookings).map(data => ({ data, notification_status: notifications[data.id] })), rowCount: target.bookings.length };
    if (operation === 'readBooking') {
      const booking = target.bookings.find(item => item.id === params[0]);
      return { rows: booking ? [{ data: clone(booking) }] : [], rowCount: booking ? 1 : 0 };
    }
    if (operation === 'saveConfig') target.config = JSON.parse(params[0]);
    if (operation === 'saveBooking') {
      const index = target.bookings.findIndex(item => item.id === params[0]);
      if (index < 0) return { rows: [], rowCount: 0 };
      target.bookings[index] = JSON.parse(params[1]);
    }
    return { rows: [], rowCount: 1 };
  }
  const store = {
    query: (text, params) => queryOn(state, text, params),
    async transaction(work) {
      calls.transactions += 1;
      const draft = clone(state);
      const result = await work((text, params) => queryOn(draft, text, params));
      Object.assign(state, draft);
      return result;
    },
  };
  const account = {
    async authenticate(value) { calls.authenticate.push(value); return auth.authenticate ? auth.authenticate(value) : true; },
    async login(value) { calls.login.push(value); return auth.login ? auth.login(value) : token; },
    async logout(value) { calls.logout.push(value); if (auth.logout) return auth.logout(value); },
  };
  const handler = createDiaryHandler({ store, auth: account,
    env: env || { NODE_ENV: 'production', VERCEL_ENV: 'production' } });
  return { state, calls, handler };
}

async function invoke(handler, { route = 'session', method = 'GET', body, cookie = '',
  requestOrigin = origin, extraQuery = '', headers = {}, chunks, remoteAddress = '192.0.2.3' } = {}) {
  const out = { headers: {} };
  const res = {
    setHeader(key, value) { out.headers[key] = value; },
    status(code) { out.status = code; return this; },
    json(value) { out.body = value; return this; },
  };
  const req = { method, url: `/api/diary?route=${route}${extraQuery}`,
    headers: { origin: requestOrigin, cookie, 'content-type': 'application/json',
      'x-vercel-forwarded-for': '192.0.2.1', ...headers }, body, socket: { remoteAddress } };
  if (chunks) req[Symbol.asyncIterator] = async function* () { yield* chunks; };
  await handler(req, res);
  return out;
}

function assertPrivate(result) {
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.equal(result.headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(result.headers.Vary, 'Cookie');
}

test('signed-out and malformed-cookie visitors cannot read bookings or change availability', async () => {
  const { handler, calls } = harness();
  assert.deepEqual((await invoke(handler)).body, { authenticated: false });
  for (const cookie of ['', '__Host-louise_diary=invalid', `louise_diary=${token}`]) {
    assert.equal((await invoke(handler, { route: 'bookings', cookie })).status, 401);
    assert.equal((await invoke(handler, { route: 'settings', method: 'PUT', cookie, body: { booking: { workingDays: [] } } })).status, 401);
  }
  assert.equal(calls.authenticate.length + calls.operations.length, 0);
});

test('session checks use only the correct cookie and expired sessions cannot access data', async () => {
  const { handler, calls } = harness({ auth: { authenticate: () => false } });
  const session = await invoke(handler, { cookie: `unrelated=private; ${sessionCookie}` });
  assert.deepEqual(session.body, { authenticated: false });
  const result = await invoke(handler, { route: 'bookings', cookie: sessionCookie });
  assert.equal(result.status, 401);
  assert.match(result.headers['Set-Cookie'], /Max-Age=0/);
  assert.deepEqual(calls.authenticate, [token, token]);
  assert.equal(calls.operations.length, 0);
});

test('cross-site and missing-origin writes are denied before authentication or storage', async () => {
  const { handler, calls } = harness();
  for (const requestOrigin of ['', 'null', 'https://attacker.example', 'http://localhost:8000', `${origin}.attacker.example`]) {
    for (const action of [
      { route: 'blocks', method: 'POST', body: { type: 'day', date: '2099-10-15' } },
      { route: 'login', method: 'POST', body: { username: 'Test', password: 'fake-only' } },
      { route: 'logout', method: 'POST' },
    ]) assert.equal((await invoke(handler, { ...action, cookie: sessionCookie, requestOrigin })).status, 403);
  }
  assert.equal(calls.authenticate.length + calls.login.length + calls.logout.length + calls.operations.length, 0);
});

test('GET permits navigation without Origin but rejects a foreign Origin', async () => {
  const { handler } = harness();
  assert.equal((await invoke(handler, { route: 'bookings', cookie: sessionCookie, requestOrigin: '' })).status, 200);
  assert.equal((await invoke(handler, { route: 'bookings', cookie: sessionCookie, requestOrigin: 'https://attacker.example' })).status, 403);
});

test('unknown routes, permanent deletion and wrong methods never touch private data', async () => {
  const { handler, calls } = harness();
  assert.equal((await invoke(handler, { route: '../settings', cookie: sessionCookie })).status, 404);
  for (const [route, method, allow] of [['bookings', 'DELETE', 'GET'], ['status', 'POST', 'PATCH'], ['settings', 'PATCH', 'GET, PUT'], ['login', 'GET', 'POST']]) {
    const result = await invoke(handler, { route, method, cookie: sessionCookie });
    assert.equal(result.status, 405);
    assert.equal(result.headers.Allow, allow);
  }
  assert.equal(calls.authenticate.length + calls.operations.length, 0);
});

test('login passes credentials and client IP to auth and sets a private host-only cookie', async () => {
  const { handler, calls } = harness();
  const result = await invoke(handler, { route: 'login', method: 'POST',
    body: { username: ' Test Owner ', password: 'fake-only-password' }, cookie: 'unrelated=private',
    headers: { 'x-vercel-forwarded-for': '192.0.2.7, 192.0.2.9' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true });
  assert.deepEqual(calls.login, [{ username: ' Test Owner ', password: 'fake-only-password', ip: '192.0.2.7' }]);
  assert.equal(calls.authenticate.length + calls.operations.length, 0);
  assert.ok(result.headers['Set-Cookie'].startsWith(`__Host-louise_diary=${token};`));
  for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/', 'Max-Age=43200']) assert.ok(result.headers['Set-Cookie'].includes(attribute));
  assert.ok(!result.headers['Set-Cookie'].includes('Domain='));
  assertPrivate(result);
});

test('failed credentials clear cookies and auth limits return 429 with retry guidance', async () => {
  const denied = harness({ auth: { login: () => { throw failure(401, 'Invalid username or password.'); } } });
  const result = await invoke(denied.handler, { route: 'login', method: 'POST', body: { username: 'Test', password: 'wrong' } });
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: 'Invalid username or password.' });
  assert.match(result.headers['Set-Cookie'], /Max-Age=0/);
  const limited = harness({ auth: { login: () => { throw failure(429, 'Too many sign-in attempts. Please try again later.'); } } });
  const blocked = await invoke(limited.handler, { route: 'login', method: 'POST', body: { username: 'Test', password: 'wrong' } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['Retry-After'], '900');
  assert.equal(blocked.headers['Set-Cookie'], undefined);
  assert.equal(blocked.body.success, undefined);
});

test('logout revokes the exact session and clears its cookie, including an anonymous logout', async () => {
  const { handler, calls } = harness();
  const result = await invoke(handler, { route: 'logout', method: 'POST', cookie: sessionCookie });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true });
  assert.match(result.headers['Set-Cookie'], /Max-Age=0/);
  assert.deepEqual(calls.logout, [token]);
  assert.equal((await invoke(handler, { route: 'logout', method: 'POST' })).status, 200);
  assert.deepEqual(calls.logout, [token]);
});

test('success and error responses forbid private caching and indexing', async () => {
  const { handler } = harness();
  for (const action of [{}, { route: 'bookings', cookie: sessionCookie }, { route: 'settings' },
    { route: 'missing' }, { route: 'login', method: 'GET' },
    { route: 'login', method: 'POST', requestOrigin: 'https://attacker.example' }]) assertPrivate(await invoke(handler, action));
});

test('bookings include notification state and settings expose only the intended business field', async () => {
  const booking = fixtureBooking();
  const { handler, state } = harness({ bookings: [booking], notifications: { [bookingId]: 'sent' } });
  assert.deepEqual((await invoke(handler, { route: 'bookings', cookie: sessionCookie })).body,
    { items: [{ ...booking, notificationStatus: 'sent' }] });
  const result = await invoke(handler, { route: 'settings', cookie: sessionCookie });
  assert.deepEqual(result.body.settings, { business: { ownerEmail: 'owner@example.test' }, booking: state.config.booking, services: state.config.services });
  assert.equal(result.body.settings.business.privateConfiguration, undefined);
});

test('JSON media type, malformed bodies and unexpected login fields are rejected before login', async () => {
  const { handler, calls } = harness();
  for (const [body, headers, status] of [
    ['{}', { 'content-type': 'text/plain' }, 415], ['{broken', {}, 400],
    [null, {}, 400], [[], {}, 400], ['"text"', {}, 400],
    [{ username: 'Test', password: 'fake-only', role: 'admin' }, {}, 400],
  ]) assert.equal((await invoke(handler, { route: 'login', method: 'POST', body, headers })).status, status);
  assert.equal(calls.login.length + calls.operations.length, 0);
});

test('the 24 KiB limit covers declared, raw, Buffer, parsed and streamed request bodies', async () => {
  const { handler, calls } = harness();
  const raw = JSON.stringify({ username: 'Test', password: 'é'.repeat(bodyLimit) });
  for (const { status, ...input } of [
    { body: {}, headers: { 'content-length': String(bodyLimit + 1) }, status: 413 },
    { body: raw, status: 413 }, { body: Buffer.from(raw), status: 413 },
    { body: JSON.parse(raw), status: 400 },
    { chunks: [Buffer.from(raw.slice(0, 100)), Buffer.from(raw.slice(100))], status: 413 },
  ]) {
    const result = await invoke(handler, { route: 'login', method: 'POST', ...input });
    assert.equal(result.status, status);
    assert.equal(result.body.success, undefined);
  }
  assert.equal(calls.login.length, 0);
  const fixedBytes = Buffer.byteLength(JSON.stringify({ username: 'Test', password: '' }));
  const boundary = JSON.stringify({ username: 'Test', password: 'x'.repeat(bodyLimit - fixedBytes) });
  assert.equal(Buffer.byteLength(boundary), bodyLimit);
  assert.equal((await invoke(handler, { route: 'login', method: 'POST', body: boundary })).status, 200);
  // The real auth helper separately rejects oversized credentials.
  assert.equal(calls.login.length, 1);
});

test('a valid streamed JSON request is parsed and passed to authentication', async () => {
  const { handler, calls } = harness();
  const result = await invoke(handler, { route: 'login', method: 'POST',
    chunks: [Buffer.from('{"username":"Test",'), Buffer.from('"password":"fake-only"}')] });
  assert.equal(result.status, 200);
  assert.equal(calls.login[0].password, 'fake-only');
});

test('invalid hours, days, numeric bounds and disallowed settings fields are rejected without writes', async () => {
  const invalid = [
    {}, { business: { ownerEmail: 'changed@example.test' } },
    { booking: { workingHours: { start: '18:00', end: '09:00' } } },
    { booking: { workingHours: { start: '09:00', end: '25:00' } } },
    { booking: { workingHours: { start: '09:00', end: '17:00', timezone: 'other' } } },
    { booking: { workingDays: [8] } }, { booking: { workingDays: [1, 1] } },
    { booking: { workingDays: ['1'] } }, { booking: { minNoticeHours: -1 } },
    { booking: { minNoticeHours: 169 } }, { booking: { bufferBetweenAppointmentsMinutes: 121 } },
    { booking: { maxAdvanceBookingDays: 0 } }, { booking: { maxAdvanceBookingDays: 366 } },
    { booking: { maxAdvanceBookingDays: 1.5 } }, { booking: { slotIntervalMinutes: 0 } },
    { booking: { disabledDates: ['2099-10-15'] } },
  ];
  const { handler, calls, state } = harness();
  const before = clone(state.config);
  for (const body of invalid) {
    assert.throws(() => validateDiarySettings(body), { status: 400 });
    assert.equal((await invoke(handler, { route: 'settings', method: 'PUT', cookie: sessionCookie, body })).status, 400);
  }
  assert.ok(!calls.operations.includes('saveConfig'));
  assert.deepEqual(state.config, before);
  assert.deepEqual(validateDiarySettings({ booking: { workingDays: [] } }), { booking: { workingDays: [] } });
});

test('service validation rejects unsupported fields, duplicate IDs and invalid prices or durations', () => {
  const service = fixtureConfig().services[0];
  for (const services of [[], [{ ...service, role: 'admin' }], [service, service],
    [{ ...service, durationMinutes: 4 }], [{ ...service, durationMinutes: 481 }],
    [{ ...service, priceGBP: 1.5 }], [{ ...service, priceGBP: 10001 }],
    [{ ...service, active: 'true' }], [{ ...service, name: 'x'.repeat(121) }]]) {
    assert.throws(() => validateDiarySettings({ services }), { status: 400 });
  }
});

test('partial settings updates preserve other rules and services and return saved values', async () => {
  const { handler, state } = harness();
  const original = clone(state.config);
  const body = { booking: { workingDays: [1, 3, 5], workingHours: { start: '10:00', end: '16:00' } } };
  const result = await invoke(handler, { route: 'settings', method: 'PUT', cookie: sessionCookie, body });
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(state.config.booking, { ...original.booking, ...body.booking });
  assert.deepEqual(state.config.services, original.services);
  assert.deepEqual(result.body.settings.booking, state.config.booking);
  const services = [{ ...original.services[0], priceGBP: 50, active: false }];
  assert.equal((await invoke(handler, { route: 'settings', method: 'PUT', cookie: sessionCookie, body: { services } })).status, 200);
  assert.deepEqual(state.config.services, services);
});

test('invalid calendar dates, reversed times and unexpected block fields cannot be saved', async () => {
  const { handler, calls } = harness();
  for (const body of [
    { type: 'day', date: '2026-02-30' }, { type: 'day', date: '2026-2-15' },
    { type: 'day', date: '2025-02-29' }, { type: 'day', date: 'not-a-date' },
    { type: 'week', date: '2099-10-15' }, { type: 'day', date: '2099-10-15', extra: true },
    { type: 'range', date: '2099-10-15', start: '14:00', end: '13:00' },
    { type: 'range', date: '2099-10-15', start: '13:00', end: '13:00' },
    { type: 'range', date: '2099-10-15', start: '24:00', end: '25:00' },
  ]) assert.equal((await invoke(handler, { route: 'blocks', method: 'POST', cookie: sessionCookie, body })).status, 400);
  assert.equal((await invoke(handler, { route: 'blocks', method: 'DELETE', cookie: sessionCookie, extraQuery: '&type=day&date=2026-02-30' })).status, 400);
  assert.ok(!calls.operations.includes('saveConfig'));
});

test('whole-day and time-range blocks add once and can be removed', async () => {
  const { handler, state } = harness();
  for (const body of [{ type: 'day', date: '2028-02-29' }, { type: 'range', date: '2099-10-15', start: '13:00', end: '14:30' }]) {
    for (let i = 0; i < 2; i++) assert.equal((await invoke(handler, { route: 'blocks', method: 'POST', cookie: sessionCookie, body })).status, 200);
  }
  assert.deepEqual(state.config.booking.disabledDates, ['2028-02-29']);
  assert.deepEqual(state.config.booking.blockedTimeRangesByDate, { '2099-10-15': ['13:00-14:30'] });
  for (const extraQuery of ['&type=day&date=2028-02-29', '&type=range&date=2099-10-15&start=13%3A00&end=14%3A30']) {
    assert.equal((await invoke(handler, { route: 'blocks', method: 'DELETE', cookie: sessionCookie, extraQuery })).status, 200);
  }
  assert.deepEqual(state.config.booking.disabledDates, []);
  assert.deepEqual(state.config.booking.blockedTimeRangesByDate, {});
});

test('working-hours and time-off conflicts return 409 without changing availability', async () => {
  const { handler, state } = harness({ bookings: [fixtureBooking()] });
  const before = clone(state.config.booking);
  for (const action of [
    { route: 'settings', method: 'PUT', body: { booking: { workingHours: { start: '11:00', end: '18:00' } } } },
    { route: 'blocks', method: 'POST', body: { type: 'day', date: '2099-10-15' } },
    { route: 'blocks', method: 'POST', body: { type: 'range', date: '2099-10-15', start: '10:30', end: '11:30' } },
  ]) assert.equal((await invoke(handler, { ...action, cookie: sessionCookie })).status, 409);
  assert.deepEqual(state.config.booking, before);
  assert.equal((await invoke(handler, { route: 'blocks', method: 'POST', cookie: sessionCookie,
    body: { type: 'range', date: '2099-10-15', start: '11:00', end: '12:00' } })).status, 200);
});

test('invalid status updates and unknown bookings are rejected without updates', async () => {
  const { handler, calls, state } = harness({ bookings: [fixtureBooking()] });
  for (const [extraQuery, body, status] of [
    ['&id=invalid', { status: 'confirmed' }, 400], [`&id=${bookingId}`, { status: 'deleted' }, 400],
    [`&id=${bookingId}`, { status: 'confirmed', fullName: 'Changed' }, 400],
    [`&id=${token}`, { status: 'confirmed' }, 404],
  ]) assert.equal((await invoke(handler, { route: 'status', method: 'PATCH', cookie: sessionCookie, extraQuery, body })).status, status);
  assert.ok(!calls.operations.includes('saveBooking'));
  assert.equal(state.bookings[0].status, 'pending');
});

test('status changes preserve booking details and a cancelled appointment cannot reopen', async () => {
  const booking = fixtureBooking();
  const { handler, state } = harness({ bookings: [booking] });
  const changeStatus = status => invoke(handler, { route: 'status', method: 'PATCH', cookie: sessionCookie,
    extraQuery: `&id=${bookingId}`, body: { status } });
  const confirmed = await changeStatus('confirmed');
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.booking.status, 'confirmed');
  assert.deepEqual(state.bookings[0], { ...booking, status: 'confirmed', updatedAt: state.bookings[0].updatedAt });
  assert.ok(Number.isFinite(Date.parse(state.bookings[0].updatedAt)));
  assert.equal((await changeStatus('cancelled')).status, 200);
  for (const status of ['pending', 'confirmed', 'completed', 'no-show']) assert.equal((await changeStatus(status)).status, 409);
  assert.equal(state.bookings[0].status, 'cancelled');
  assert.equal((await changeStatus('cancelled')).status, 200);
});

test('database read/write and auth failures return 503, never empty data or saved success', async t => {
  t.mock.method(console, 'error', () => {});
  const cases = [
    [{ failOperation: 'readBookings' }, { route: 'bookings', cookie: sessionCookie }],
    [{ failOperation: 'readConfig' }, { route: 'settings', cookie: sessionCookie }],
    [{ config: null }, { route: 'settings', cookie: sessionCookie }],
    [{ failOperation: 'saveConfig' }, { route: 'settings', method: 'PUT', cookie: sessionCookie, body: { booking: { minNoticeHours: 12 } } }],
    [{ failOperation: 'saveConfig' }, { route: 'blocks', method: 'POST', cookie: sessionCookie, body: { type: 'day', date: '2099-10-15' } }],
    [{ failOperation: 'saveBooking', bookings: [fixtureBooking()] }, { route: 'status', method: 'PATCH', cookie: sessionCookie, extraQuery: `&id=${bookingId}`, body: { status: 'confirmed' } }],
    [{ auth: { authenticate: () => { throw new Error('Private database detail'); } } }, { cookie: sessionCookie }],
    [{ auth: { login: () => { throw new Error('Private database detail'); } } }, { route: 'login', method: 'POST', body: { username: 'Test', password: 'fake-only' } }],
    [{ auth: { logout: () => { throw new Error('Private database detail'); } } }, { route: 'logout', method: 'POST', cookie: sessionCookie }],
  ];
  for (const [options, action] of cases) {
    const { handler, state } = harness(options);
    const before = clone(state);
    const result = await invoke(handler, action);
    assert.equal(result.status, 503);
    assert.deepEqual(Object.keys(result.body), ['error']);
    assert.match(result.body.error, /temporarily unavailable/);
    assert.ok(!result.body.error.includes('Private'));
    assertPrivate(result);
    assert.deepEqual(state, before);
    if (action.route === 'logout') assert.match(result.headers['Set-Cookie'], /Max-Age=0/);
  }
});

test('local development accepts loopback Origin and uses a local HttpOnly cookie', async () => {
  const { handler } = harness({ env: { NODE_ENV: 'development' } });
  const result = await invoke(handler, { route: 'login', method: 'POST', requestOrigin: 'http://127.0.0.1:8835',
    body: { username: 'Test', password: 'fake-only' } });
  assert.equal(result.status, 200);
  assert.ok(result.headers['Set-Cookie'].startsWith(`louise_diary=${token};`));
  assert.ok(result.headers['Set-Cookie'].includes('HttpOnly'));
  assert.ok(!result.headers['Set-Cookie'].includes('; Secure'));
});
