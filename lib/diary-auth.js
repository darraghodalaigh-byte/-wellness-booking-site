import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const SCRYPT = Object.freeze({ N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
const HASH_PREFIX = 'scrypt$1$131072$8$1$';
const HASH_PATTERN = /^scrypt\$1\$131072\$8\$1\$([A-Za-z0-9_-]{43})\$([A-Za-z0-9_-]{86})$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PASSWORD_BYTES = 1024;
const USERNAME_BYTES = 128;
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function boundedString(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
    && Buffer.byteLength(value, 'utf8') <= maximum;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function credentialError() {
  return Object.assign(new Error('Invalid username or password.'), { status: 401 });
}

function decodeHash(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 200) return null;
  const match = HASH_PATTERN.exec(encoded);
  if (!match) return null;
  const salt = Buffer.from(match[1], 'base64url');
  const expected = Buffer.from(match[2], 'base64url');
  if (salt.length !== 32 || expected.length !== 64
    || salt.toString('base64url') !== match[1] || expected.toString('base64url') !== match[2]) return null;
  return { salt, expected };
}

/** Returns a versioned, salted scrypt hash suitable for DIARY_PASSWORD_HASH. */
export async function hashPassword(password) {
  if (!boundedString(password, PASSWORD_BYTES)) {
    throw new TypeError(`Password must contain between 1 and ${PASSWORD_BYTES} UTF-8 bytes.`);
  }
  const salt = randomBytes(32);
  const derived = await deriveKey(password, salt, 64, SCRYPT);
  return `${HASH_PREFIX}${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

/** Unsupported or malformed hashes fail closed without accepting their work factors. */
export async function verifyPassword(password, encoded) {
  if (!boundedString(password, PASSWORD_BYTES)) return false;
  const decoded = decodeHash(encoded);
  if (!decoded) return false;
  const derived = await deriveKey(password, decoded.salt, decoded.expected.length, SCRYPT);
  return timingSafeEqual(derived, decoded.expected);
}

/** Cookie handling, trusted-IP extraction and database connections belong to the caller. */
export function createDiaryAuth({ query, env = process.env, now = Date.now } = {}) {
  if (typeof query !== 'function') throw new TypeError('A database query function is required.');
  if (typeof now !== 'function') throw new TypeError('A clock function is required.');

  function timestamp() {
    const value = now();
    const milliseconds = value instanceof Date ? value.getTime() : Number(value);
    if (!Number.isFinite(milliseconds)) throw new TypeError('The diary clock returned an invalid time.');
    return milliseconds;
  }

  async function recordAttempt(ip) {
    // Missing or malformed addresses share one bucket, rather than bypassing throttling.
    const address = boundedString(ip, 256) && ip.trim() ? ip.trim().toLowerCase() : 'unknown';
    const key = `diary-login:${sha256(address)}`;
    const time = timestamp();
    const current = new Date(time).toISOString();
    const expires = new Date(time + LOGIN_WINDOW_MS).toISOString();
    // The conflict update holds the row lock. Never split this into a read and a write.
    const result = await query(`
      INSERT INTO diary_limits (key, count, expires_at)
      VALUES ($1, 1, $3::timestamptz)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN diary_limits.expires_at <= $2::timestamptz
          THEN 1 ELSE LEAST(diary_limits.count, 8) + 1 END,
        expires_at = CASE WHEN diary_limits.expires_at <= $2::timestamptz
          THEN EXCLUDED.expires_at ELSE diary_limits.expires_at END
      RETURNING count, expires_at
    `, [key, current, expires]);
    const attempt = result.rows?.[0];
    const count = Number(attempt?.count);
    if (!Number.isInteger(count) || count < 1) throw new Error('Could not verify the diary login limit.');
    if (count > LOGIN_LIMIT) {
      const remaining = Math.ceil((new Date(attempt.expires_at).getTime() - time) / 1000);
      throw Object.assign(new Error('Too many sign-in attempts. Please try again later.'), {
        status: 429,
        retryAfter: Number.isFinite(remaining) ? Math.max(1, Math.min(900, remaining)) : 900,
      });
    }
  }

  async function login(input = {}) {
    const { username, password, ip } = input && typeof input === 'object' ? input : {};
    await recordAttempt(ip);
    const expectedUsername = typeof env.DIARY_USERNAME === 'string' ? env.DIARY_USERNAME.trim() : '';
    if (!boundedString(username, USERNAME_BYTES) || !boundedString(password, PASSWORD_BYTES)
      || !boundedString(expectedUsername, USERNAME_BYTES)) throw credentialError();

    // Both username digests have the same length; a wrong username still incurs scrypt.
    const usernameMatches = timingSafeEqual(Buffer.from(sha256(username.trim()), 'hex'), Buffer.from(sha256(expectedUsername), 'hex'));
    const passwordMatches = await verifyPassword(password, env.DIARY_PASSWORD_HASH);
    if (!usernameMatches || !passwordMatches) throw credentialError();

    const token = randomUUID();
    const expires = new Date(timestamp() + SESSION_TTL_MS).toISOString();
    await query('INSERT INTO diary_sessions (token_hash, expires_at) VALUES ($1, $2::timestamptz)', [sha256(token), expires]);
    return token;
  }

  async function authenticate(token) {
    if (typeof token !== 'string' || !UUID_PATTERN.test(token)) return false;
    const result = await query('SELECT token_hash FROM diary_sessions WHERE token_hash = $1 AND expires_at > $2::timestamptz', [sha256(token), new Date(timestamp()).toISOString()]);
    return Boolean(result.rows?.length);
  }

  async function logout(token) {
    if (typeof token !== 'string' || !UUID_PATTERN.test(token)) return;
    await query('DELETE FROM diary_sessions WHERE token_hash = $1', [sha256(token)]);
  }

  return { login, authenticate, logout };
}
