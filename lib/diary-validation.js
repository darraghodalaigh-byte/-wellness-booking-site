const ALLOWED_ORIGINS = new Set(['https://soultosolebylouise.com', 'https://www.soultosolebylouise.com', 'https://soul-to-sole-by-louise.vercel.app']);
const MAX_BODY = 24 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const header = (req, name) => typeof req.headers?.[name] === 'string' ? req.headers[name] : '';

export function allowedOrigin(origin, env) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (env.NODE_ENV === 'production' || env.VERCEL_ENV) return false;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function keysOnly(value, keys) {
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

export async function readBody(req) {
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
