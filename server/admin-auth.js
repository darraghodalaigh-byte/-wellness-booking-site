import crypto from 'node:crypto';

const SESSION_COOKIE_NAME = 'admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map();

function shouldUseSecureCookies() {
  if (String(process.env.FORCE_SECURE_COOKIES || '').trim() === 'true') return true;
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function parseCookieHeader(header = '') {
  const cookies = {};
  header.split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return;
    cookies[rawKey] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

function expectedAdminCredentials() {
  return {
    username: String(process.env.ADMIN_USERNAME || '').trim(),
    password: String(process.env.ADMIN_PASSWORD || '').trim()
  };
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

export function createAdminSession(res) {
  cleanExpiredSessions();
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { expiresAt });

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookies(),
    maxAge: SESSION_TTL_MS
  });
}

export function clearAdminSession(req, res) {
  const cookies = parseCookieHeader(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) sessions.delete(token);
  res.clearCookie(SESSION_COOKIE_NAME);
}

export function hasValidAdminSession(req) {
  cleanExpiredSessions();
  const cookies = parseCookieHeader(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return false;

  const session = sessions.get(token);
  if (!session) return false;

  return session.expiresAt > Date.now();
}

export function requireAdminAuth(req, res, next) {
  if (hasValidAdminSession(req)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

export function validateAdminLoginAttempt({ username, password }) {
  const expected = expectedAdminCredentials();

  if (!expected.username || !expected.password) {
    return {
      valid: false,
      reason: 'Admin credentials are not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.'
    };
  }

  const valid = username === expected.username && password === expected.password;
  if (!valid) {
    return { valid: false, reason: 'Invalid admin credentials.' };
  }

  return { valid: true };
}
