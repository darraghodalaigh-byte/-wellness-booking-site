import pg from 'pg';

export const DIARY_SCHEMA = `
CREATE TABLE IF NOT EXISTS diary_config (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS diary_bookings (id uuid PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS diary_booking_date ON diary_bookings ((data->>'date'));
CREATE TABLE IF NOT EXISTS diary_sessions (token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS diary_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS diary_notifications (booking_id uuid PRIMARY KEY REFERENCES diary_bookings(id), state text NOT NULL DEFAULT 'pending', updated_at timestamptz NOT NULL DEFAULT now());
`;

export function createDiaryStore({ connectionString = process.env.DATABASE_URL, schema } = {}) {
  if (!connectionString) throw new Error('Diary database is not configured');
  if (schema && !/^[a-z][a-z0-9_]+$/.test(schema)) throw new Error('Invalid schema');
  const url = new URL(connectionString);
  // Disposable local tests can explicitly disable TLS on a literal loopback
  // address. Remote connections always retain certificate verification.
  const localWithoutTls = ['127.0.0.1', '[::1]'].includes(url.hostname)
    && !url.searchParams.has('host') && !url.searchParams.has('hostaddr')
    && url.searchParams.get('sslmode') === 'disable';
  if (!localWithoutTls) url.searchParams.set('sslmode', 'verify-full');
  const pool = new pg.Pool({ connectionString: url.toString(), max: 3, idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 10000, statement_timeout: 10000,
    ...(schema ? { options: `-c search_path=${schema}` } : {}) });
  // Log no query text, connection strings or client information.
  pool.on('error', () => console.error('diary_database_connection_error'));
  return {
    query: (text, params) => pool.query(text, params),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // One short calendar lock makes booking insertion, closures and rule
        // changes mutually exclusive across every deployed function instance.
        await client.query('SELECT pg_advisory_xact_lock(72160455)');
        const result = await work((text, params) => client.query(text, params));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
    close: () => pool.end()
  };
}
let shared;
export function getDiaryStore() { return shared ||= createDiaryStore(); }
export async function readDiaryConfig(query) {
  const { rows } = await query("SELECT data FROM diary_config WHERE id='main'");
  if (!rows[0]?.data?.booking || !Array.isArray(rows[0].data.services)) throw new Error('Diary configuration missing');
  return rows[0].data;
}
export async function readDiaryBookings(query) {
  const { rows } = await query("SELECT b.data, n.state AS notification_status FROM diary_bookings b LEFT JOIN diary_notifications n ON n.booking_id=b.id ORDER BY b.data->>'date', b.data->>'time'");
  return rows.map(row => ({ ...row.data, ...(row.notification_status ? { notificationStatus: row.notification_status } : {}) }));
}
export async function saveDiaryConfig(query, config) {
  await query("UPDATE diary_config SET data=$1::jsonb, updated_at=now() WHERE id='main'", [JSON.stringify(config)]);
}
