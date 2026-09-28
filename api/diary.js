import { createHash } from 'node:crypto';

const UPSTREAM = 'https://wellness-booking-site.onrender.com';
const ALLOWED_ORIGINS = new Set(['https://soultosolebylouise.com', 'https://www.soultosolebylouise.com', 'https://soul-to-sole-by-louise.vercel.app']);
const METHODS = { session: 'GET', login: 'POST', logout: 'POST', settings: 'GET PUT', blocks: 'POST DELETE', bookings: 'GET', status: 'PATCH' };
const STATUSES = new Set(['pending', 'confirmed', 'completed', 'cancelled', 'no-show']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 24 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const header = (req, name) => typeof req.headers?.[name] === 'string' ? req.headers[name] : '';

function allowedOrigin(origin, env) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (env.NODE_ENV === 'production' || env.VERCEL_ENV) return false;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
function keysOnly(value, keys) {
  if (!isObject(value) || Object.keys(value).some(key => !keys.includes(key))) throw fail(400, 'Some details were not recognised. Please refresh the diary.');
}

export function validateDiarySettings(body) {
  keysOnly(body, ['booking', 'services']);
  if (!Object.keys(body).length) throw fail(400, 'There are no changes to save.');
  if (body.booking !== undefined) {
    const b = body.booking;
    keysOnly(b, ['workingDays', 'workingHours', 'bufferBetweenAppointmentsMinutes', 'minNoticeHours', 'maxAdvanceBookingDays']);
    if (b.workingDays !== undefined && (!Array.isArray(b.workingDays) || b.workingDays.length > 7 || b.workingDays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || new Set(b.workingDays).size !== b.workingDays.length)) throw fail(400, 'Choose valid working days.');
    if (b.workingHours !== undefined) {
      keysOnly(b.workingHours, ['start', 'end']);
      if (!validTime(b.workingHours.start) || !validTime(b.workingHours.end) || b.workingHours.start >= b.workingHours.end) throw fail(400, 'The finish time must be later than the start time.');
    }
    for (const [key, min, max] of [['bufferBetweenAppointmentsMinutes', 0, 120], ['minNoticeHours', 0, 168], ['maxAdvanceBookingDays', 1, 365]]) {
      if (b[key] !== undefined && (!Number.isInteger(b[key]) || b[key] < min || b[key] > max)) throw fail(400, 'Check the time-between-appointments, notice and advance-booking values.');
    }
  }
  if (body.services !== undefined) {
    if (!Array.isArray(body.services) || !body.services.length || body.services.length > 30) throw fail(400, 'Please keep at least one service in the diary.');
    const ids = new Set();
    for (const service of body.services) {
      keysOnly(service, ['id', 'name', 'durationMinutes', 'priceGBP', 'shortDescription', 'benefits', 'active']);
      if (typeof service.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service.id) || service.id.length > 80 || ids.has(service.id)) throw fail(400, 'Each service needs a unique reference.');
      ids.add(service.id);
      if (typeof service.name !== 'string' || !service.name.trim() || service.name.length > 120) throw fail(400, 'Enter a service name, up to 120 characters.');
      if (!Number.isInteger(service.durationMinutes) || service.durationMinutes < 5 || service.durationMinutes > 480) throw fail(400, 'Service lengths must be between 5 and 480 minutes.');
      if (!Number.isInteger(service.priceGBP) || service.priceGBP < 0 || service.priceGBP > 10000) throw fail(400, 'Enter a whole-euro service price from 0 to 10,000.');
      if (typeof service.active !== 'boolean' || (service.shortDescription !== undefined && (typeof service.shortDescription !== 'string' || service.shortDescription.length > 2000)) || (service.benefits !== undefined && (!Array.isArray(service.benefits) || service.benefits.length > 20 || service.benefits.some(b => typeof b !== 'string' || b.length > 500)))) throw fail(400, 'Check the service details.');
    }
  }
  return body;
}

async function readBody(req) {
  if (!header(req, 'content-type').toLowerCase().startsWith('application/json')) throw fail(415, 'Please use the diary form.');
  if (Number(header(req, 'content-length')) > MAX_BODY) throw fail(413, 'There is too much information to save at once.');
  let body = req.body;
  if (body === undefined) {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_BODY) throw fail(413, 'There is too much information to save at once.');
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks).toString();
  }
  if (Buffer.isBuffer(body)) body = body.toString();
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY) throw fail(413, 'There is too much information to save at once.');
    try { body = JSON.parse(body); } catch { throw fail(400, 'The request could not be read. Please try again.'); }
  }
  if (!isObject(body) || Buffer.byteLength(JSON.stringify(body)) > MAX_BODY) throw fail(400, 'The request could not be read. Please try again.');
  return body;
}

export function createDiaryHandler({ fetchImpl = fetch, env = process.env, now = Date.now } = {}) {
  // A warm-instance safeguard only. The original host still owns authentication.
  const loginAttempts = new Map();
  const secure = env.NODE_ENV === 'production' || Boolean(env.VERCEL_ENV);
  const cookieName = secure ? '__Host-louise_diary' : 'louise_diary';
  const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;

  return async function diary(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Vary', 'Cookie');
    try {
      const url = new URL(req.url || '/api/diary', 'https://soultosolebylouise.com');
      const route = url.searchParams.get('route') || '';
      const method = req.method || 'GET';
      if (!Object.hasOwn(METHODS, route)) throw fail(404, 'Diary page not found.');
      if (!METHODS[route].split(' ').includes(method)) {
        res.setHeader('Allow', METHODS[route].replaceAll(' ', ', '));
        throw fail(405, 'This action is not supported.');
      }
      const origin = header(req, 'origin');
      if ((method !== 'GET' || origin) && !allowedOrigin(origin, env)) throw fail(403, 'Please open the diary on Louise’s website and try again.');
      const cookies = header(req, 'cookie').split(';').map(part => part.trim());
      const rawToken = cookies.find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const token = UUID.test(rawToken || '') ? rawToken : '';
      if (route === 'logout') {
        res.setHeader('Set-Cookie', cookie('', 0));
        if (token) {
          try { await fetchImpl(`${UPSTREAM}/api/admin/logout`, { method: 'POST', headers: { cookie: `admin_session=${token}`, 'Content-Type': 'application/json' }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(10000) }); } catch { /* The local cookie is still cleared if the old host is unavailable. */ }
        }
        return res.status(200).json({ success: true });
      }
      if (!token && route !== 'login') {
        if (route === 'session') return res.status(200).json({ authenticated: false });
        throw fail(401, 'Please sign in to your diary.');
      }
      let body;
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') body = await readBody(req);
      const upstreamSignal = AbortSignal.timeout(50000);
      let upstreamPath = `/api/admin/${route}`;
      let query = new URLSearchParams();
      if (route === 'login') {
        keysOnly(body, ['username', 'password']);
        if (typeof body.username !== 'string' || !body.username.trim() || body.username.length > 254 || typeof body.password !== 'string' || !body.password || body.password.length > 1024) throw fail(400, 'Enter your diary username and password.');
        const key = createHash('sha256').update(header(req, 'x-vercel-forwarded-for') || header(req, 'x-forwarded-for') || 'unknown').digest('hex');
        for (const [entry, value] of loginAttempts) if (now() > value.until) loginAttempts.delete(entry);
        const attempt = loginAttempts.get(key) || { count: 0, until: now() + 15 * 60 * 1000 };
        if (attempt.count >= 8 || loginAttempts.size >= 2000) { res.setHeader('Retry-After', '900'); throw fail(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.'); }
        attempt.count += 1;
        loginAttempts.set(key, attempt);
        body = { username: body.username.trim(), password: body.password };
      }
      if (route === 'settings' && method === 'PUT') body = validateDiarySettings(body);
      if (route === 'blocks') {
        const block = method === 'POST' ? body : Object.fromEntries(['type', 'date', 'start', 'end'].map(k => [k, url.searchParams.get(k) || '']));
        keysOnly(block, ['type', 'date', 'start', 'end']);
        if (!['day', 'range'].includes(block.type) || !validDate(block.date)) throw fail(400, 'Choose a valid date and type of time off.');
        if (block.type === 'range' && (!validTime(block.start) || !validTime(block.end) || block.start >= block.end)) throw fail(400, 'The finish time must be later than the start time.');
        if (method === 'DELETE') query = new URLSearchParams(block);
      }
      if (route === 'status') {
        const id = url.searchParams.get('id') || '';
        if (!UUID.test(id)) throw fail(400, 'Select a booking from your diary.');
        keysOnly(body, ['status']);
        if (!STATUSES.has(body.status)) throw fail(400, 'Choose a valid booking status.');
        upstreamPath = `/api/admin/bookings/${id}/status`;
        if (body.status !== 'cancelled') {
          const current = await fetchImpl(`${UPSTREAM}/api/admin/bookings/${id}`, { headers: { Accept: 'application/json', cookie: `admin_session=${token}` }, redirect: 'error', cache: 'no-store', signal: upstreamSignal });
          if (current.status === 401) throw fail(401, 'Your session has ended. Please sign in again.');
          if (!current.ok) throw fail(503, 'The booking could not be checked. Please refresh and try again.');
          const detail = await current.json();
          if (!detail.booking || detail.booking.status === 'cancelled') throw fail(409, 'Cancelled appointments cannot be reopened here. Please check availability and make a new request.');
        }
      }
      const response = await fetchImpl(`${UPSTREAM}${upstreamPath}${query.size ? `?${query}` : ''}`, {
        method, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { cookie: `admin_session=${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', cache: 'no-store', signal: upstreamSignal
      });
      let payload;
      try { payload = await response.json(); } catch { throw fail(503, 'The diary is waking up. Please wait a moment, then try again.'); }
      if (route === 'login' && response.ok) {
        const upstreamCookie = response.headers.get('set-cookie') || '';
        const session = upstreamCookie.match(/(?:^|,\s*)admin_session=([^;]+)/)?.[1];
        if (!UUID.test(session || '')) throw fail(503, 'Sign-in could not be completed. Please try again.');
        res.setHeader('Set-Cookie', cookie(session, 12 * 60 * 60));
        return res.status(200).json({ success: true });
      }
      if (response.status === 401) {
        res.setHeader('Set-Cookie', cookie('', 0));
        throw fail(401, route === 'login' ? 'That username and password were not recognised. Please try again.' : 'Your session has ended. Please sign in again.');
      }
      if (!response.ok) throw fail(response.status >= 500 ? 503 : response.status, response.status >= 500 ? 'The diary is temporarily unavailable. Please try again shortly.' : String(payload.error || 'That change could not be saved. Please refresh and try again.'));
      return res.status(response.status).json(payload);
    } catch (error) {
      return res.status(error.status || 503).json({ error: error.status ? error.message : 'The diary is temporarily unavailable. Please try again shortly.' });
    }
  };
}

export default createDiaryHandler();
