import crypto from 'node:crypto';

import { createDbClient } from '../db/client.js';
import { initializeSchema } from '../db/schema.js';
import { minutesToTime, parseTimeToMinutes } from '../db/time.js';

function coerceDate(value) {
  return String(value || '').slice(0, 10);
}

function coerceTime(value) {
  return String(value || '').slice(0, 5);
}

function fromDbBoolean(value) {
  if (typeof value === 'boolean') return value;
  return Number(value) === 1;
}

function mapBookingRow(row, services) {
  const serviceId = String(row.service || '');
  const service = services.find((entry) => entry.id === serviceId);
  const startTime = coerceTime(row.start_time);

  return {
    id: String(row.id),
    bookingReference: String(row.reference),
    fullName: String(row.name),
    email: String(row.email),
    phone: String(row.phone),
    serviceId,
    serviceName: service?.name || serviceId,
    date: coerceDate(row.date),
    time: startTime,
    durationMinutes: Number(row.duration),
    notes: row.notes ? String(row.notes) : '',
    preferredContactMethod: row.preferred_contact_method ? String(row.preferred_contact_method) : 'email',
    consentAccepted: row.consent_accepted == null ? true : fromDbBoolean(row.consent_accepted),
    firstTimeClient: row.first_time_client == null ? true : fromDbBoolean(row.first_time_client),
    status: String(row.status),
    createdAt: String(row.created_at)
  };
}

function mapBlockedTimeRow(row) {
  return {
    id: String(row.id),
    date: coerceDate(row.date),
    start_time: coerceTime(row.start_time),
    end_time: coerceTime(row.end_time),
    reason: row.reason ? String(row.reason) : ''
  };
}

function buildOverlapCheck({ dialect, date, startMinute, endMinute, bufferMinutes }) {
  if (dialect === 'postgres') {
    return {
      sql: `
        SELECT id
        FROM bookings
        WHERE date = $1
          AND status IN ('pending', 'confirmed')
          AND $2 < (end_minute + $4)
          AND start_minute < ($3 + $4)
        LIMIT 1
      `,
      params: [date, startMinute, endMinute, bufferMinutes]
    };
  }

  return {
    sql: `
      SELECT id
      FROM bookings
      WHERE date = ?
        AND status IN ('pending', 'confirmed')
        AND ? < (end_minute + ?)
        AND start_minute < (? + ?)
      LIMIT 1
    `,
    params: [date, startMinute, bufferMinutes, endMinute, bufferMinutes]
  };
}

function buildInsertBooking({ dialect, booking }) {
  if (dialect === 'postgres') {
    return {
      sql: `
        INSERT INTO bookings (
          id, reference, name, email, phone, service, date,
          start_time, end_time, start_minute, end_minute, duration,
          status, notes, first_time_client, preferred_contact_method,
          consent_accepted, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18
        )
      `,
      params: [
        booking.id,
        booking.reference,
        booking.name,
        booking.email,
        booking.phone,
        booking.service,
        booking.date,
        `${booking.startTime}:00`,
        `${booking.endTime}:00`,
        booking.startMinute,
        booking.endMinute,
        booking.duration,
        booking.status,
        booking.notes,
        booking.firstTimeClient,
        booking.preferredContactMethod,
        booking.consentAccepted,
        booking.createdAt
      ]
    };
  }

  return {
    sql: `
      INSERT INTO bookings (
        id, reference, name, email, phone, service, date,
        start_time, end_time, start_minute, end_minute, duration,
        status, notes, first_time_client, preferred_contact_method,
        consent_accepted, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `,
    params: [
      booking.id,
      booking.reference,
      booking.name,
      booking.email,
      booking.phone,
      booking.service,
      booking.date,
      booking.startTime,
      booking.endTime,
      booking.startMinute,
      booking.endMinute,
      booking.duration,
      booking.status,
      booking.notes,
      booking.firstTimeClient ? 1 : 0,
      booking.preferredContactMethod,
      booking.consentAccepted ? 1 : 0,
      booking.createdAt
    ]
  };
}

function buildInsertBlockedTime({ dialect, blockedTime }) {
  if (dialect === 'postgres') {
    return {
      sql: `
        INSERT INTO blocked_times (
          id, date, start_time, end_time, start_minute, end_minute, reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (date, start_time, end_time) DO NOTHING
      `,
      params: [
        blockedTime.id,
        blockedTime.date,
        `${blockedTime.startTime}:00`,
        `${blockedTime.endTime}:00`,
        blockedTime.startMinute,
        blockedTime.endMinute,
        blockedTime.reason
      ]
    };
  }

  return {
    sql: `
      INSERT OR IGNORE INTO blocked_times (
        id, date, start_time, end_time, start_minute, end_minute, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    params: [
      blockedTime.id,
      blockedTime.date,
      blockedTime.startTime,
      blockedTime.endTime,
      blockedTime.startMinute,
      blockedTime.endMinute,
      blockedTime.reason
    ]
  };
}

export async function createBookingRepository({ businessConfig }) {
  const db = await createDbClient();
  await initializeSchema({ db, businessConfig });

  const services = businessConfig.services || [];

  async function getBookings() {
    const rows = await db.all('SELECT * FROM bookings ORDER BY created_at DESC');
    return rows.map((row) => mapBookingRow(row, services));
  }

  async function queryBookingsByDate(date) {
    const normalizedDate = coerceDate(date);
    const sql = db.dialect === 'postgres'
      ? 'SELECT * FROM bookings WHERE date = $1 ORDER BY start_minute ASC'
      : 'SELECT * FROM bookings WHERE date = ? ORDER BY start_minute ASC';

    const rows = await db.all(sql, [normalizedDate]);
    return rows.map((row) => mapBookingRow(row, services));
  }

  async function queryBookingsByDateRange(startDate, endDate) {
    const start = coerceDate(startDate);
    const end = coerceDate(endDate);
    const sql = db.dialect === 'postgres'
      ? 'SELECT * FROM bookings WHERE date >= $1 AND date <= $2 ORDER BY date ASC, start_minute ASC'
      : 'SELECT * FROM bookings WHERE date >= ? AND date <= ? ORDER BY date ASC, start_minute ASC';

    const rows = await db.all(sql, [start, end]);
    return rows.map((row) => mapBookingRow(row, services));
  }

  async function queryBlockedTimesByDate(date) {
    const normalizedDate = coerceDate(date);
    const sql = db.dialect === 'postgres'
      ? 'SELECT * FROM blocked_times WHERE date = $1 ORDER BY start_minute ASC'
      : 'SELECT * FROM blocked_times WHERE date = ? ORDER BY start_minute ASC';

    const rows = await db.all(sql, [normalizedDate]);
    return rows.map(mapBlockedTimeRow);
  }

  async function queryBlockedTimesByDateRange(startDate, endDate) {
    const start = coerceDate(startDate);
    const end = coerceDate(endDate);
    const sql = db.dialect === 'postgres'
      ? 'SELECT * FROM blocked_times WHERE date >= $1 AND date <= $2 ORDER BY date ASC, start_minute ASC'
      : 'SELECT * FROM blocked_times WHERE date >= ? AND date <= ? ORDER BY date ASC, start_minute ASC';

    const rows = await db.all(sql, [start, end]);
    return rows.map(mapBlockedTimeRow);
  }

  async function createBooking(input, { bufferMinutes = 0 } = {}) {
    const duration = Number(input.duration);
    const startTime = coerceTime(input.startTime);
    const startMinute = parseTimeToMinutes(startTime);
    const endMinute = startMinute + duration;

    const booking = {
      id: input.id || crypto.randomUUID(),
      reference: String(input.reference),
      name: String(input.name),
      email: String(input.email).toLowerCase(),
      phone: String(input.phone),
      service: String(input.service),
      date: coerceDate(input.date),
      startTime,
      endTime: minutesToTime(endMinute),
      startMinute,
      endMinute,
      duration,
      status: String(input.status || 'pending'),
      notes: String(input.notes || ''),
      firstTimeClient: input.firstTimeClient == null ? true : Boolean(input.firstTimeClient),
      preferredContactMethod: String(input.preferredContactMethod || 'email'),
      consentAccepted: input.consentAccepted == null ? true : Boolean(input.consentAccepted),
      createdAt: String(input.createdAt || new Date().toISOString())
    };

    return db.transaction(async (tx) => {
      const overlapCheck = buildOverlapCheck({
        dialect: tx.dialect,
        date: booking.date,
        startMinute: booking.startMinute,
        endMinute: booking.endMinute,
        bufferMinutes
      });

      const conflict = await tx.get(overlapCheck.sql, overlapCheck.params);
      if (conflict) {
        const err = new Error('Selected time is unavailable.');
        err.code = 'DOUBLE_BOOKING';
        throw err;
      }

      const insert = buildInsertBooking({ dialect: tx.dialect, booking });
      await tx.run(insert.sql, insert.params);

      return mapBookingRow(
        {
          id: booking.id,
          reference: booking.reference,
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          service: booking.service,
          date: booking.date,
          start_time: booking.startTime,
          end_time: booking.endTime,
          duration: booking.duration,
          status: booking.status,
          notes: booking.notes,
          first_time_client: booking.firstTimeClient,
          preferred_contact_method: booking.preferredContactMethod,
          consent_accepted: booking.consentAccepted,
          created_at: booking.createdAt
        },
        services
      );
    });
  }

  async function updateBooking(id, changes) {
    const existingSql = db.dialect === 'postgres'
      ? 'SELECT * FROM bookings WHERE id = $1'
      : 'SELECT * FROM bookings WHERE id = ?';

    const existing = await db.get(existingSql, [id]);
    if (!existing) {
      return null;
    }

    const nextStatus = changes.status == null ? existing.status : String(changes.status);
    const nextNotes = changes.notes == null ? existing.notes : String(changes.notes);

    const sql = db.dialect === 'postgres'
      ? 'UPDATE bookings SET status = $1, notes = $2 WHERE id = $3'
      : 'UPDATE bookings SET status = ?, notes = ? WHERE id = ?';

    await db.run(sql, [nextStatus, nextNotes, id]);

    return mapBookingRow({ ...existing, status: nextStatus, notes: nextNotes }, services);
  }

  async function deleteBooking(id) {
    const sql = db.dialect === 'postgres'
      ? 'DELETE FROM bookings WHERE id = $1'
      : 'DELETE FROM bookings WHERE id = ?';

    const result = await db.run(sql, [id]);
    if (db.dialect === 'postgres') {
      return Number(result.rowCount || 0) > 0;
    }

    return Number(result.changes || 0) > 0;
  }

  async function getSetting(key) {
    const sql = db.dialect === 'postgres'
      ? 'SELECT value_json FROM settings WHERE key = $1'
      : 'SELECT value_json FROM settings WHERE key = ?';

    const row = await db.get(sql, [key]);
    if (!row) return null;

    try {
      return JSON.parse(row.value_json);
    } catch {
      return row.value_json;
    }
  }

  async function setSetting(key, value) {
    const payload = JSON.stringify(value);
    const sql = db.dialect === 'postgres'
      ? `
        INSERT INTO settings (key, value_json, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `
      : `
        INSERT INTO settings (key, value_json, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key)
        DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
      `;

    await db.run(sql, [key, payload]);
  }

  async function createBlockedTime(input) {
    const startTime = coerceTime(input.startTime);
    const endTime = coerceTime(input.endTime);
    const blockedTime = {
      id: input.id || crypto.randomUUID(),
      date: coerceDate(input.date),
      startTime,
      endTime,
      startMinute: parseTimeToMinutes(startTime),
      endMinute: parseTimeToMinutes(endTime),
      reason: String(input.reason || 'Manual block')
    };

    const insert = buildInsertBlockedTime({ dialect: db.dialect, blockedTime });
    await db.run(insert.sql, insert.params);
    return blockedTime;
  }

  async function deleteBlockedTime({ date, startTime, endTime }) {
    const normalizedDate = coerceDate(date);
    const normalizedStart = coerceTime(startTime);
    const normalizedEnd = coerceTime(endTime);

    const sql = db.dialect === 'postgres'
      ? 'DELETE FROM blocked_times WHERE date = $1 AND start_time = $2 AND end_time = $3'
      : 'DELETE FROM blocked_times WHERE date = ? AND start_time = ? AND end_time = ?';

    const params = db.dialect === 'postgres'
      ? [normalizedDate, `${normalizedStart}:00`, `${normalizedEnd}:00`]
      : [normalizedDate, normalizedStart, normalizedEnd];

    const result = await db.run(sql, params);
    if (db.dialect === 'postgres') {
      return Number(result.rowCount || 0) > 0;
    }

    return Number(result.changes || 0) > 0;
  }

  return {
    dialect: db.dialect,
    sqlitePath: db.sqlitePath,
    getBookings,
    createBooking,
    updateBooking,
    deleteBooking,
    queryBookingsByDate,
    queryBookingsByDateRange,
    queryBlockedTimesByDate,
    queryBlockedTimesByDateRange,
    createBlockedTime,
    deleteBlockedTime,
    getSetting,
    setSetting,
    close: () => db.close()
  };
}
