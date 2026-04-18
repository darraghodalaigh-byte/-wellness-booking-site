import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDbMode() {
  const mode = String(process.env.DB_CLIENT || 'sqlite').trim().toLowerCase();
  return mode === 'postgres' ? 'postgres' : 'sqlite';
}

function getSqlitePath() {
  const configured = String(process.env.SQLITE_PATH || '').trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(__dirname, '..', '..', configured);
  }

  return path.join(__dirname, '..', '..', 'data', 'bookings.sqlite');
}

async function createSqliteClient() {
  const sqlitePath = getSqlitePath();
  await fs.mkdir(path.dirname(sqlitePath), { recursive: true });

  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  const client = {
    dialect: 'sqlite',
    sqlitePath,
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params);
    },
    async run(sql, params = []) {
      return db.prepare(sql).run(...params);
    },
    async transaction(work) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await work(client);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      db.close();
    }
  };

  return client;
}

async function createPostgresClient() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set when DB_CLIENT=postgres');
  }

  const sslMode = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  const forceSsl = String(process.env.DATABASE_SSL || '').trim().toLowerCase() === 'true';
  const shouldUseSsl = forceSsl || sslMode === 'require' || connectionString.includes('sslmode=require');

  const pool = new Pool({
    connectionString,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined
  });

  const client = {
    dialect: 'postgres',
    async all(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows;
    },
    async get(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows[0] || null;
    },
    async run(sql, params = []) {
      const result = await pool.query(sql, params);
      return {
        rowCount: result.rowCount,
        rows: result.rows
      };
    },
    async transaction(work) {
      const tx = await pool.connect();
      const txClient = {
        dialect: 'postgres',
        async all(sql, params = []) {
          const result = await tx.query(sql, params);
          return result.rows;
        },
        async get(sql, params = []) {
          const result = await tx.query(sql, params);
          return result.rows[0] || null;
        },
        async run(sql, params = []) {
          const result = await tx.query(sql, params);
          return {
            rowCount: result.rowCount,
            rows: result.rows
          };
        }
      };

      try {
        await tx.query('BEGIN');
        const result = await work(txClient);
        await tx.query('COMMIT');
        return result;
      } catch (error) {
        await tx.query('ROLLBACK');
        throw error;
      } finally {
        tx.release();
      }
    },
    async close() {
      await pool.end();
    }
  };

  return client;
}

export async function createDbClient() {
  const mode = getDbMode();
  if (mode === 'postgres') {
    return createPostgresClient();
  }

  return createSqliteClient();
}
