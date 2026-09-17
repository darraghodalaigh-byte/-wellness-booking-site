import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export const MAX_BODY_BYTES = 12 * 1024;
export const CONTACT_RECIPIENT = 'soultosolebylouise@gmail.com';
const ORIGINS = new Set([
  'https://soultosolebylouise.com',
  'https://www.soultosolebylouise.com',
  'https://soul-to-sole-by-louise.vercel.app'
]);
const TOPICS = Object.freeze({ general: 'General enquiry', reflexology: 'Reflexology enquiry', coaching: 'Coaching enquiry', book: 'Book enquiry' });
const FIELDS = new Set(['fullName', 'email', 'topic', 'message', 'consentAccepted', 'website', 'requestId']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SINGLE_LINE_CONTROLS = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u;
const MESSAGE_CONTROLS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\p{Cf}\p{Cs}\u2028\u2029]/u;
const EMAIL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1024;

const hash = (value) => createHash('sha256').update(value).digest('hex');
const header = (req, name) => typeof req.headers?.[name] === 'string' ? req.headers[name] : '';

export function isAllowedOrigin(origin, env = process.env) {
  if (typeof origin !== 'string') return false;
  if (ORIGINS.has(origin)) return true;
  if (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return url.origin === origin && ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

export function validateContact(body) {
  const fieldErrors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { fieldErrors: { form: 'Please submit the contact form again.' } };
  }
  if (Object.keys(body).some((key) => !FIELDS.has(key))) fieldErrors.form = 'The form contains an unexpected field.';
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.replace(/\r\n/g, '\n').trim() : '';
  const topic = typeof body.topic === 'string' ? body.topic : '';
  const requestId = typeof body.requestId === 'string' ? body.requestId.toLowerCase() : '';
  if (fullName.length < 2 || fullName.length > 120 || SINGLE_LINE_CONTROLS.test(typeof body.fullName === 'string' ? body.fullName : '')) {
    fieldErrors.fullName = 'Enter your name using 2–120 characters on one line.';
  }
  if (email.length > 254 || email.split('@')[0].length > 64 || !EMAIL.test(email) || SINGLE_LINE_CONTROLS.test(typeof body.email === 'string' ? body.email : '')) {
    fieldErrors.email = 'Enter one valid email address, up to 254 characters.';
  }
  if (!Object.hasOwn(TOPICS, topic)) fieldErrors.topic = 'Choose a topic from the list.';
  if (message.length < 10 || message.length > 2000 || MESSAGE_CONTROLS.test(typeof body.message === 'string' ? body.message.replace(/\r\n/g, '\n') : '')) {
    fieldErrors.message = 'Enter a message of 10–2,000 characters using ordinary text and line breaks.';
  }
  if (body.consentAccepted !== true) fieldErrors.consentAccepted = 'Please agree to being contacted about this enquiry.';
  if (body.website !== '') fieldErrors.website = 'Please leave this field empty.';
  if (!UUID.test(requestId)) fieldErrors.requestId = 'Please refresh the form and try again.';
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return { value: { fullName, email, topic, message, requestId } };
}

function requestError(status, message) {
  return Object.assign(new Error(message), { status });
}

function readStream(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const cleanup = () => {
      clearTimeout(timer);
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
    };
    const fail = (error) => { cleanup(); req.resume?.(); reject(error); };
    const onData = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BODY_BYTES) return fail(requestError(413, 'Your message is too large. Please shorten it and try again.'));
      chunks.push(bytes);
    };
    const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const onError = () => fail(requestError(400, 'The request could not be read. Please try again.'));
    const onAborted = () => fail(requestError(400, 'The request was interrupted. Please try again.'));
    const timer = setTimeout(() => fail(requestError(408, 'The request took too long. Please try again.')), 5000);
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAborted);
  });
}

export async function readJsonBody(req) {
  const declaredSize = header(req, 'content-length');
  if (declaredSize && !/^\d+$/.test(declaredSize)) throw requestError(400, 'Invalid request size.');
  if (declaredSize && Number(declaredSize) > MAX_BODY_BYTES) throw requestError(413, 'Your message is too large. Please shorten it and try again.');
  let raw = req.body;
  if (raw === undefined) raw = await readStream(req);
  if (raw !== null && typeof raw === 'object' && !Buffer.isBuffer(raw)) {
    try {
      if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > MAX_BODY_BYTES) throw requestError(413, 'Your message is too large. Please shorten it and try again.');
    } catch (error) {
      if (error.status) throw error;
      throw requestError(400, 'Invalid JSON request.');
    }
    return raw;
  }
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) throw requestError(400, 'Invalid JSON request.');
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw requestError(413, 'Your message is too large. Please shorten it and try again.');
  try {
    // Fatal decoding rejects malformed UTF-8 instead of silently replacing it.
    const text = Buffer.isBuffer(raw) ? new TextDecoder('utf-8', { fatal: true }).decode(raw) : raw;
    return JSON.parse(text);
  } catch { throw requestError(400, 'Invalid JSON request.'); }
}

function credentials(env) {
  const key = env.AGENTMAIL_API_KEY;
  const inbox = env.AGENTMAIL_INBOX_ID;
  if (typeof key !== 'string' || typeof inbox !== 'string' || !key.trim() || !inbox.trim()
    || key.length > 4096 || inbox.length > 254 || SINGLE_LINE_CONTROLS.test(key + inbox)
    || ['.', '..'].includes(inbox.trim())) return null;
  return { key: key.trim(), inbox: inbox.trim() };
}

function clientAddress(req) {
  const forwarded = header(req, 'x-vercel-forwarded-for') || header(req, 'x-forwarded-for');
  const address = forwarded.split(',')[0].trim() || req.socket?.remoteAddress || '';
  return isIP(address) ? address : 'unknown';
}

function writeJson(res, status, body, extraHeaders = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

export function createContactHandler({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 8000 } = {}) {
  // Best effort only: these limits/results belong to this warm instance. A
  // cold start, another instance or a deployment does not share this memory.
  // Store hashes/results rather than visitor names, addresses or messages.
  const rateBuckets = new Map();
  const requests = new Map();
  const prune = (map, time) => { for (const [key, value] of map) if (value.expiresAt <= time) map.delete(key); };

  async function deliver(value, auth) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let deliveryUnknown = true;
    try {
      const response = await fetchImpl(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(auth.inbox)}/messages/send`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${auth.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [CONTACT_RECIPIENT], reply_to: [value.email],
          subject: `Soul to Sole website — ${TOPICS[value.topic]}`,
          text: `Website enquiry\n\nName: ${value.fullName}\nEmail: ${value.email}\nTopic: ${TOPICS[value.topic]}\nReference: ${value.requestId}\n\n${value.message}`
        })
      });
      if (!response.ok) {
        deliveryUnknown = response.status >= 500;
        throw new Error('Provider declined or could not confirm the request');
      }
      const result = await response.json();
      if (typeof result?.message_id !== 'string' || !result.message_id.trim() || SINGLE_LINE_CONTROLS.test(result.message_id)) {
        throw new Error('Provider did not confirm acceptance');
      }
      return { status: 200, body: {
        success: true, status: 'accepted', requestId: value.requestId,
        message: 'Your message has been accepted for delivery to Louise.'
      } };
    } catch {
      return { status: 503, body: {
        success: false, deliveryUnknown, requestId: value.requestId,
        error: deliveryUnknown
          ? 'We could not confirm whether your message was sent. Please keep your text and contact Louise directly before trying again.'
          : 'Your message was not accepted. Please keep your text and try again later, or contact Louise directly.'
      } };
    } finally { clearTimeout(timer); }
  }

  return async function contact(req, res) {
    const method = String(req.method || '').toUpperCase();
    if (!['GET', 'POST'].includes(method)) return writeJson(res, 405, { error: 'Use POST to send a message.' }, { Allow: 'GET, POST' });
    const origin = header(req, 'origin');
    if ((method === 'POST' || origin || req.headers?.origin) && !isAllowedOrigin(origin, env)
      || header(req, 'sec-fetch-site') === 'cross-site') {
      return writeJson(res, 403, { error: 'Please use the contact form on the Soul to Sole website.' });
    }
    const auth = credentials(env);
    if (method === 'GET') return writeJson(res, 200, { ready: Boolean(auth) });
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(header(req, 'content-type'))) {
      return writeJson(res, 415, { error: 'Submit the form as JSON.' });
    }
    let body;
    try { body = await readJsonBody(req); }
    catch (error) { return writeJson(res, error.status || 400, { error: error.message || 'Invalid request.' }); }
    const validated = validateContact(body);
    if (validated.fieldErrors) return writeJson(res, 422, { error: 'Please check the highlighted fields.', fieldErrors: validated.fieldErrors });
    if (!auth) return writeJson(res, 503, { success: false, deliveryUnknown: false, error: 'The contact form is temporarily unavailable. Please keep your text and contact Louise directly.' });
    const value = validated.value;
    const time = now();
    prune(requests, time);
    prune(rateBuckets, time);
    const fingerprint = hash(JSON.stringify([value.fullName, value.email, value.topic, value.message]));
    const existing = requests.get(value.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return writeJson(res, 409, { error: 'This request reference was already used for different content. Please refresh the form before sending a new message.' });
      const result = await existing.result;
      return writeJson(res, result.status, result.body);
    }
    const limits = [[`ip:${hash(clientAddress(req))}`, 5], [`email:${hash(value.email.toLowerCase())}`, 3]];
    const limited = limits.find(([key, limit]) => (rateBuckets.get(key)?.count || 0) >= limit);
    if (limited || rateBuckets.size + 2 > MAX_ENTRIES || requests.size >= MAX_ENTRIES) {
      const retryAfter = limited ? Math.max(1, Math.ceil((rateBuckets.get(limited[0]).expiresAt - time) / 1000)) : 900;
      return writeJson(res, 429, { error: 'Too many messages have been submitted. Please wait a little before trying again, or contact Louise directly.' }, { 'Retry-After': String(retryAfter) });
    }
    for (const [key] of limits) {
      const entry = rateBuckets.get(key) || { count: 0, expiresAt: time + RATE_WINDOW_MS };
      entry.count += 1;
      rateBuckets.set(key, entry);
    }
    // Register before starting the provider request so concurrent duplicates
    // await the same result. Never automatically retry an uncertain delivery.
    const entry = { fingerprint, expiresAt: time + RESULT_TTL_MS, result: null };
    requests.set(value.requestId, entry);
    entry.result = deliver(value, auth);
    const result = await entry.result;
    // A definite provider rejection can be retried with this same request ID.
    // Retain both acceptance and uncertain outcomes for the full local TTL.
    if (result.status !== 200 && !result.body.deliveryUnknown) requests.delete(value.requestId);
    return writeJson(res, result.status, result.body);
  };
}

export default createContactHandler();
