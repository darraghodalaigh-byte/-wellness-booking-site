import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { CONTACT_RECIPIENT, MAX_BODY_BYTES, createContactHandler, isAllowedOrigin, validateContact } from '../api/contact.js';

// All provider requests are mocked. This suite never sends an email.
const origin = 'https://soultosolebylouise.com';
const environment = { NODE_ENV: 'production', AGENTMAIL_API_KEY: 'test-secret', AGENTMAIL_INBOX_ID: 'website@agentmail.to' };
const accepted = () => new Response(JSON.stringify({ message_id: 'test-provider-message', thread_id: 'test-thread' }), { status: 200 });
function payload(changes = {}) {
  return { fullName: 'Test Visitor', email: 'visitor@example.test', topic: 'general', message: 'Hello Louise, I would like to learn more.', consentAccepted: true, website: '', requestId: randomUUID(), ...changes };
}
function request(body = payload(), changes = {}) {
  return { method: 'POST', headers: { origin, 'content-type': 'application/json' }, socket: { remoteAddress: '192.0.2.1' }, body, ...changes };
}
async function invoke(handler, req = request()) {
  const result = { headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
    end(value) { result.status = this.statusCode; result.body = JSON.parse(value); }
  };
  await handler(req, res);
  return result;
}
function harness(options = {}) {
  const calls = [];
  const handler = createContactHandler({ env: environment, fetchImpl: async (...args) => { calls.push(args); return accepted(); }, ...options });
  return { handler, calls };
}

test('readiness checks credentials only and never contacts the provider or exposes secrets', async () => {
  for (const [env, ready] of [[environment, true], [{}, false], [{ ...environment, AGENTMAIL_INBOX_ID: '' }, false], [{ ...environment, AGENTMAIL_API_KEY: 'invalid\r\nkey' }, false]]) {
    const { handler, calls } = harness({ env });
    const response = await invoke(handler, { method: 'GET', headers: {} });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ready });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(calls.length, 0);
    assert.ok(!JSON.stringify(response.body).includes('test-secret'));
  }
});

test('POST requires an exact approved origin; cross-site metadata and production localhost are rejected', async () => {
  const { handler, calls } = harness();
  for (const value of [undefined, 'null', 'https://evil.example', 'https://soultosolebylouise.com.evil.example', `${origin}/`, `${origin}?x=1`, 'http://localhost:8818', [origin]]) {
    const response = await invoke(handler, request(payload(), { headers: { origin: value, 'content-type': 'application/json' } }));
    assert.equal(response.status, 403, String(value));
  }
  const crossSite = await invoke(handler, request(payload(), { headers: { origin, 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' } }));
  assert.equal(crossSite.status, 403);
  assert.equal(calls.length, 0);
  for (const value of [origin, 'https://www.soultosolebylouise.com', 'https://soul-to-sole-by-louise.vercel.app']) assert.equal(isAllowedOrigin(value, environment), true);
  for (const value of ['http://localhost:8818', 'http://127.0.0.1:3000', 'http://[::1]:3000']) assert.equal(isAllowedOrigin(value, { NODE_ENV: 'development' }), true);
  assert.equal(isAllowedOrigin('http://localhost.attacker.test:8818', { NODE_ENV: 'development' }), false);
  assert.equal(isAllowedOrigin('http://localhost:8818', { VERCEL_ENV: 'production' }), false);
});

test('unsupported methods and content types never send', async () => {
  const { handler, calls } = harness();
  for (const method of ['PUT', 'DELETE', 'OPTIONS']) {
    const response = await invoke(handler, request(payload(), { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, POST');
  }
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', '', 'application/json\r\nX-Test: 1']) {
    const response = await invoke(handler, request(payload(), { headers: { origin, 'content-type': type } }));
    assert.equal(response.status, 415);
  }
  assert.equal(calls.length, 0);
});

test('malformed JSON, invalid UTF-8, and oversized parsed/raw/streamed bodies are rejected', async () => {
  const { handler, calls } = harness();
  for (const body of ['{bad json', Buffer.from([0x7b, 0xff, 0x7d])]) {
    assert.equal((await invoke(handler, request(body))).status, 400);
  }
  for (const body of [payload({ message: 'x'.repeat(MAX_BODY_BYTES) }), 'x'.repeat(MAX_BODY_BYTES + 1), Buffer.alloc(MAX_BODY_BYTES + 1)]) {
    assert.equal((await invoke(handler, request(body))).status, 413);
  }
  const declared = request(payload(), { headers: { origin, 'content-type': 'application/json', 'content-length': String(MAX_BODY_BYTES + 1) } });
  assert.equal((await invoke(handler, declared)).status, 413);
  const raw = Readable.from([Buffer.alloc(8000, 32), Buffer.alloc(8000, 32)]);
  Object.assign(raw, { method: 'POST', headers: { origin, 'content-type': 'application/json' } });
  assert.equal((await invoke(handler, raw)).status, 413);
  assert.equal(calls.length, 0);
});

test('a valid streamed JSON body is supported as well as Vercel-parsed objects', async () => {
  const { handler, calls } = harness();
  const value = payload();
  const json = JSON.stringify(value);
  const raw = Readable.from([Buffer.from(json.slice(0, 35)), Buffer.from(json.slice(35))]);
  Object.assign(raw, { method: 'POST', headers: { origin, 'content-type': 'application/json; charset=utf-8' } });
  const response = await invoke(handler, raw);
  assert.equal(response.status, 200);
  assert.equal(response.body.requestId, value.requestId);
  assert.equal(calls.length, 1);
});

test('strict field limits, types, consent, honeypot and request IDs produce 422 field errors', async () => {
  const { handler, calls } = harness();
  const invalid = [
    ['fullName', 'A'], ['fullName', 'a'.repeat(121)], ['fullName', { toString: true }],
    ['email', ['one@example.test', 'two@example.test']], ['email', { toString: false }],
    ['email', 'a'.repeat(65) + '@example.test'], ['email', 'one@example.test,two@example.test'],
    ['email', 'Visitor <one@example.test>'], ['email', 'first..last@example.test'],
    ['email', 'a@' + 'b'.repeat(250) + '.test'], ['topic', 'unknown'], ['topic', '__proto__'],
    ['message', 'too short'], ['message', 'x'.repeat(2001)], ['message', null],
    ['consentAccepted', 'true'], ['consentAccepted', false], ['website', 'https://spam.example'],
    ['website', ' '], ['requestId', 'not-a-uuid']
  ];
  for (const [field, value] of invalid) {
    const response = await invoke(handler, request(payload({ [field]: value })));
    assert.equal(response.status, 422, field);
    assert.ok(response.body.fieldErrors[field], field);
  }
  for (const body of [[], '[]', '{}']) assert.equal((await invoke(handler, request(body))).status, 422);
  assert.equal(calls.length, 0);
});

test('header injection, control characters and malformed Unicode are rejected before sending', async () => {
  const { handler, calls } = harness();
  for (const changes of [
    { fullName: 'Visitor\r\nBcc: evil@example.test' },
    { email: 'visitor@example.test\r\nBcc:evil@example.test' },
    { email: '\nvisitor@example.test' },
    { fullName: 'Visitor\u0000Name' },
    { fullName: 'Visitor\ud800Name' },
    { message: 'Hello Louise\u0000 there' },
    { message: 'Hello Louise\rthere' },
    { message: 'Hello Louise\u202Ethere' }
  ]) assert.equal((await invoke(handler, request(payload(changes)))).status, 422);
  assert.equal(calls.length, 0);
});

test('provider recipient and subject are fixed; visitor address is only a safe reply-to field', async () => {
  const { handler, calls } = harness();
  const value = payload({ fullName: 'Louise O\'Dalaigh <b>', email: 'visitor+enquiry@example.test', topic: 'book', message: 'Hello Louise,\r\nI would like to read the book.\r\nThank you.' });
  const response = await invoke(handler, request(value));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, status: 'accepted', requestId: value.requestId, message: 'Your message has been accepted for delivery to Louise.' });
  const [url, options] = calls[0];
  assert.equal(url, 'https://api.agentmail.to/v0/inboxes/website%40agentmail.to/messages/send');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, 'Bearer test-secret');
  const outgoing = JSON.parse(options.body);
  assert.deepEqual(outgoing.to, [CONTACT_RECIPIENT]);
  assert.deepEqual(outgoing.reply_to, [value.email]);
  assert.equal(outgoing.subject, 'Soul to Sole website — Book enquiry');
  assert.ok(!('html' in outgoing) && !('cc' in outgoing) && !('bcc' in outgoing));
  assert.ok(outgoing.text.includes(value.fullName));
  assert.ok(outgoing.text.includes('Hello Louise,\nI would like to read the book.\nThank you.'));
  assert.ok(!outgoing.text.includes('\r'));
  assert.equal(options.signal.aborted, false);
});

test('arbitrary recipient and reply-to fields in a request cannot be forwarded', async () => {
  const { handler, calls } = harness();
  for (const field of ['to', 'cc', 'bcc', 'reply_to', 'subject', 'html']) {
    const response = await invoke(handler, request(payload({ [field]: 'attacker@example.test' })));
    assert.equal(response.status, 422);
  }
  assert.equal(calls.length, 0);
});

test('missing credentials fail truthfully without invoking a provider', async () => {
  const { handler, calls } = harness({ env: { NODE_ENV: 'production' } });
  const response = await invoke(handler);
  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.deliveryUnknown, false);
  assert.equal(calls.length, 0);
});

test('provider success requires a nonempty valid message_id, not merely a 2xx response', async () => {
  for (const value of [{}, { message_id: '' }, { message_id: ' ' }, { message_id: null }, { message_id: 'bad\r\nid' }]) {
    const { handler } = harness({ fetchImpl: async () => new Response(JSON.stringify(value), { status: 200 }) });
    const response = await invoke(handler);
    assert.equal(response.status, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.deliveryUnknown, true);
  }
  const { handler } = harness({ fetchImpl: async () => new Response('not JSON', { status: 200 }) });
  assert.equal((await invoke(handler)).body.deliveryUnknown, true);
});

test('definite provider 4xx rejection allows same-ID retry without exposing provider details', async () => {
  let attempts = 0;
  const { handler } = harness({ fetchImpl: async () => ++attempts === 1
    ? new Response(JSON.stringify({ error: 'PRIVATE PROVIDER DETAILS' }), { status: 400 }) : accepted() });
  const value = payload();
  const rejected = await invoke(handler, request(value));
  assert.equal(rejected.status, 503);
  assert.equal(rejected.body.deliveryUnknown, false);
  assert.ok(!JSON.stringify(rejected.body).includes('PRIVATE'));
  assert.equal((await invoke(handler, request(value))).status, 200);
  assert.equal(attempts, 2);
});

test('provider 5xx and network failures are uncertain and suppress a blind retry', async () => {
  for (const failure of [async () => new Response('PRIVATE FAILURE', { status: 503 }), async () => { throw new Error('PRIVATE NETWORK DETAILS'); }]) {
    let attempts = 0;
    const { handler } = harness({ fetchImpl: (...args) => { attempts++; return failure(...args); } });
    const value = payload();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await invoke(handler, request(value));
      assert.equal(response.status, 503);
      assert.equal(response.body.deliveryUnknown, true);
      assert.ok(!JSON.stringify(response.body).includes('PRIVATE'));
    }
    assert.equal(attempts, 1);
  }
});

test('a slow provider request is aborted and returns an uncertain failure', async () => {
  let signal;
  const { handler } = harness({ timeoutMs: 10, fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
  } });
  const response = await invoke(handler);
  assert.equal(signal.aborted, true);
  assert.equal(response.status, 503);
  assert.equal(response.body.deliveryUnknown, true);
});

test('concurrent identical requests and later retries await or reuse one provider acceptance', async () => {
  let release;
  let announce;
  const started = new Promise((resolve) => { announce = resolve; });
  let attempts = 0;
  const { handler } = harness({ fetchImpl: () => { attempts++; announce(); return new Promise((resolve) => { release = resolve; }); } });
  const value = payload();
  const first = invoke(handler, request(value));
  await started;
  const second = invoke(handler, request(value));
  await setImmediate();
  assert.equal(attempts, 1);
  release(accepted());
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, b.body);
  assert.deepEqual((await invoke(handler, request(value))).body, a.body);
  assert.equal(attempts, 1);
});

test('a reused request ID with changed content is rejected even while the original is in flight', async () => {
  let release;
  const { handler } = harness({ fetchImpl: () => new Promise((resolve) => { release = resolve; }) });
  const value = payload();
  const original = invoke(handler, request(value));
  await setImmediate();
  const changed = await invoke(handler, request({ ...value, message: 'A different enquiry with the same reference.' }));
  assert.equal(changed.status, 409);
  release(accepted());
  assert.equal((await original).status, 200);
});

test('email rate limit rejects a fourth new request, sets Retry-After, and expires after fifteen minutes', async () => {
  let time = 1_000_000;
  const { handler, calls } = harness({ now: () => time });
  for (let index = 0; index < 3; index++) {
    const response = await invoke(handler, request(payload(), { socket: { remoteAddress: `192.0.2.${index + 1}` } }));
    assert.equal(response.status, 200);
  }
  const limited = await invoke(handler, request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '900');
  assert.equal(calls.length, 3);
  time += 15 * 60 * 1000 + 1;
  assert.equal((await invoke(handler)).status, 200);
  assert.equal(calls.length, 4);
});

test('IP rate limit rejects a sixth new request even when visitor email addresses differ', async () => {
  const { handler, calls } = harness();
  for (let index = 0; index < 5; index++) assert.equal((await invoke(handler, request(payload({ email: `visitor${index}@example.test` })))).status, 200);
  const response = await invoke(handler, request(payload({ email: 'another@example.test' })));
  assert.equal(response.status, 429);
  assert.equal(calls.length, 5);
});

test('names with accents, valid plus-addresses and multiline messages remain usable', () => {
  const checked = validateContact(payload({ fullName: 'Áine O’Dálaigh', email: 'aine+coaching@example.ie', message: 'Hello Louise,\nI would love to discuss coaching.' }));
  assert.ok(checked.value);
  assert.equal(checked.value.fullName, 'Áine O’Dálaigh');
});
