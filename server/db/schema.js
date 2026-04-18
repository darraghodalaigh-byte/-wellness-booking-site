import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import { minutesToTime, parseTimeToMinutes } from './time.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEGACY_BOOKINGS_FILE = path.join(__dirname, '..', '..', 'data', 'bookings.json');

function asDbBoolean(value, dialect) {
  if (dialect === 'postgres') {
    return Boolean(value);
  }

  return value ? 1 : 0;
}

function coerceDateString(value) {
  return String(value || '').slice(0, 10);
}

function timeWithSeconds(value) {
  if (!value) return null;
  const time = String(value);
  return time.length === 5 ? `${time}:00` : time;
}

function toTimeValue(value) {
  return String(value || '').slice(0, 5);
}

function buildBookingInsert({ booking, dialect }) {
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
        timeWithSeconds(booking.startTime),
        timeWithSeconds(booking.endTime),
        booking.startMinute,
        booking.endMinute,
        booking.duration,
        booking.status,
        booking.notes,
        asDbBoolean(booking.firstTimeClient, dialect),
        booking.preferredContactMethod,
        asDbBoolean(booking.consentAccepted, dialect),
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
      asDbBoolean(booking.firstTimeClient, dialect),
      booking.preferredContactMethod,
      asDbBoolean(booking.consentAccepted, dialect),
      booking.createdAt
    ]
  };
}

function buildBlockedTimeInsert({ blockedTime, dialect }) {
  if (dialect === 'postgres') {
    return {
      sql: `
        INSERT INTO blocked_times (
          id, date, start_time, end_time, start_minute, end_minute, reason
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (date, start_time, end_time) DO NOTHING
      `,
      params: [
        blockedTime.id,
        blockedTime.date,
        timeWithSeconds(blockedTime.startTime),
        timeWithSeconds(blockedTime.endTime),
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

function buildSettingUpsert({ key, value, dialect }) {
  const serialized = JSON.stringify(value);

  if (dialect === 'postgres') {
    return {
      sql: `
        INSERT INTO settings (key, value_json, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `,
      params: [key, serialized]
    };
  }

  return {
    sql: `
      INSERT INTO settings (key, value_json, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
    `,
    params: [key, serialized]
  };
}

function getSchemaStatements(dialect) {
  if (dialect === 'postgres') {
    return [
      `
        CREATE TABLE IF NOT EXISTS bookings (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          service TEXT NOT NULL,
          date DATE NOT NULL,
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          start_minute INTEGER NOT NULL,
          end_minute INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          status TEXT NOT NULL,
          notes TEXT,
          first_time_client BOOLEAN NOT NULL DEFAULT TRUE,
          preferred_contact_method TEXT,
          consent_accepted BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS blocked_times (
          id TEXT PRIMARY KEY,
          date DATE NOT NULL,
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          start_minute INTEGER NOT NULL,
          end_minute INTEGER NOT NULL,
          reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (date, start_time, end_time)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      'CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings(date, status)',
      'CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings(date, start_minute, end_minute)',
      'CREATE INDEX IF NOT EXISTS idx_blocked_times_date_time ON blocked_times(date, start_minute, end_minute)'
    ];
  }

  return [
    `
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        service TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        first_time_client INTEGER NOT NULL DEFAULT 1,
        preferred_contact_method TEXT,
        consent_accepted INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS blocked_times (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, start_time, end_time)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings(date, status)',
    'CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings(date, start_minute, end_minute)',
    'CREATE INDEX IF NOT EXISTS idx_blocked_times_date_time ON blocked_times(date, start_minute, end_minute)'
  ];
}

function normalizeLegacyBooking(raw, services) {
  const serviceId = String(raw.serviceId || raw.service || '').trim();
  if (!serviceId) return null;

  const service = services.find((entry) => entry.id === serviceId);
  const duration = Number(raw.durationMinutes || raw.duration || service?.durationMinutes || 30);
  const startTime = toTimeValue(raw.time || raw.start_time);

  if (!raw.date || !startTime || !Number.isFinite(duration)) {
    return null;
  }

  const startMinute = parseTimeToMinutes(startTime);
  const endMinute = startMinute + duration;

  return {
    id: String(raw.id || crypto.randomUUID()),
    reference: String(raw.bookingReference || raw.reference || `SBW-MIG-${Date.now()}`),
    name: String(raw.fullName || raw.name || '').trim(),
    email: String(raw.email || '').trim().toLowerCase(),
    phone: String(raw.phone || '').trim(),
    service: serviceId,
    date: coerceDateString(raw.date),
    startTime,
    endTime: minutesToTime(endMinute),
    startMinute,
    endMinute,
    duration,
    status: String(raw.status || 'pending').trim(),
    notes: String(raw.notes || '').trim(),
    firstTimeClient: raw.first_time_client == null ? true : Boolean(raw.first_time_client),
    preferredContactMethod: String(raw.preferredContactMethod || raw.preferred_contact_method || 'email'),
    consentAccepted: raw.consentAccepted == null ? true : Boolean(raw.consentAccepted),
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString())
  };
}

async function migrateLegacyBookingsIfNeeded(db, businessConfig) {
  const countRow = await db.get('SELECT COUNT(*) AS count FROM bookings');
  const count = Number(countRow?.count || 0);
  if (count > 0) return;

  let raw;
  try {
    raw = await fs.readFile(LEGACY_BOOKINGS_FILE, 'utf8');
  } catch {
    return;
  }

  let legacyBookings = [];
  try {
    legacyBookings = JSON.parse(raw || '[]');
  } catch {
    legacyBookings = [];
  }

  if (!Array.isArray(legacyBookings) || legacyBookings.length === 0) {
    return;
  }

  for (const item of legacyBookings) {
    const booking = normalizeLegacyBooking(item, businessConfig.services);
    if (!booking || !booking.name || !booking.email || !booking.phone) {
      continue;
    }

    const { sql, params } = buildBookingInsert({ booking, dialect: db.dialect });
    try {
      await db.run(sql, params);
    } catch {
      // Skip malformed or duplicate legacy records to keep startup resilient.
    }
  }
}

async function seedBlockedTimesFromConfig(db, businessConfig) {
  const blockedByDate = businessConfig.booking?.blockedTimeRangesByDate || {};

  for (const [date, ranges] of Object.entries(blockedByDate)) {
    if (!Array.isArray(ranges)) continue;

    for (const range of ranges) {
      const [start, end] = String(range).split('-');
      if (!start || !end) continue;

      const blockedTime = {
        id: crypto.randomUUID(),
        date,
        startTime: start,
        endTime: end,
        startMinute: parseTimeToMinutes(start),
        endMinute: parseTimeToMinutes(end),
        reason: 'Configured block'
      };

      const { sql, params } = buildBlockedTimeInsert({ blockedTime, dialect: db.dialect });
      await db.run(sql, params);
    }
  }
}

async function seedSettings(db, businessConfig) {
  const seeds = [
    {
      key: 'booking.disabledDates',
      value: businessConfig.booking?.disabledDates || []
    },
    {
      key: 'booking.rules',
      value: {
        slotIntervalMinutes: businessConfig.booking?.slotIntervalMinutes,
        bufferBetweenAppointmentsMinutes: businessConfig.booking?.bufferBetweenAppointmentsMinutes,
        minNoticeHours: businessConfig.booking?.minNoticeHours,
        maxAdvanceBookingDays: businessConfig.booking?.maxAdvanceBookingDays,
        workingDays: businessConfig.booking?.workingDays,
        workingHours: businessConfig.booking?.workingHours
      }
    }
  ];

  for (const entry of seeds) {
    const { sql, params } = buildSettingUpsert({ key: entry.key, value: entry.value, dialect: db.dialect });
    await db.run(sql, params);
  }
}

export async function initializeSchema({ db, businessConfig }) {
  for (const statement of getSchemaStatements(db.dialect)) {
    await db.run(statement);
  }

  await migrateLegacyBookingsIfNeeded(db, businessConfig);
  await seedBlockedTimesFromConfig(db, businessConfig);
  await seedSettings(db, businessConfig);
}
