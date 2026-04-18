import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  buildSlotsForDate,
  checkBookingConflict,
  generateCalendarSummary,
  getPublicBusinessData,
  validateBookingWindow
} from './scheduling.js';
import { validateBookingInput } from './validation.js';
import { sendBookingNotification } from './email.js';
import { getBusinessConfig, saveBusinessConfig } from './runtime-config.js';
import { createBookingRepository } from './repositories/bookingRepository.js';
import {
  createAdminSession,
  clearAdminSession,
  hasValidAdminSession,
  requireAdminAuth,
  validateAdminLoginAttempt
} from './admin-auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
const port = Number(process.env.PORT || 8000);
const runtimeConfig = await getBusinessConfig();
const bookingRepository = await createBookingRepository({ businessConfig: runtimeConfig });

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(publicDir));

const BOOKING_STATUSES = new Set(['pending', 'confirmed', 'completed', 'cancelled', 'no-show']);

function normalizeDate(value) {
  return String(value || '').trim().slice(0, 10);
}

function normalizeTime(value) {
  return String(value || '').trim().slice(0, 5);
}

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeekDateString() {
  const now = new Date();
  const currentDay = now.getDay();
  const diff = currentDay === 0 ? -6 : 1 - currentDay;
  now.setDate(now.getDate() + diff);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfMonthDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function bookingDateTimeSort(a, b) {
  const aStamp = `${a.date}T${a.time}`;
  const bStamp = `${b.date}T${b.time}`;
  return aStamp.localeCompare(bStamp);
}

function getMonthDateRange(month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0));

  const start = `${firstDay.getUTCFullYear()}-${String(firstDay.getUTCMonth() + 1).padStart(2, '0')}-${String(firstDay.getUTCDate()).padStart(2, '0')}`;
  const end = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay.getUTCDate()).padStart(2, '0')}`;
  return { start, end };
}

function groupBlockedTimesByDate(rows) {
  return rows.reduce((acc, row) => {
    if (!acc[row.date]) acc[row.date] = [];
    acc[row.date].push(row);
    return acc;
  }, {});
}

function formatBookingForList(booking) {
  return {
    id: booking.id,
    bookingReference: booking.bookingReference,
    fullName: booking.fullName,
    email: booking.email,
    phone: booking.phone,
    serviceId: booking.serviceId,
    serviceName: booking.serviceName,
    date: booking.date,
    time: booking.time,
    durationMinutes: booking.durationMinutes,
    status: booking.status,
    notes: booking.notes,
    createdAt: booking.createdAt,
    preferredContactMethod: booking.preferredContactMethod
  };
}

function extractPublicBookingPayload(body) {
  return {
    fullName: String(body.fullName || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    serviceId: String(body.serviceId || '').trim(),
    date: normalizeDate(body.date),
    time: normalizeTime(body.time),
    notes: String(body.notes || '').trim(),
    preferredContactMethod: String(body.preferredContactMethod || '').trim(),
    consentAccepted: Boolean(body.consentAccepted),
    website: String(body.website || '').trim()
  };
}

function applyBookingFilters(bookings, query = {}) {
  const search = String(query.search || '').trim().toLowerCase();
  const date = String(query.date || '').trim();
  const serviceId = String(query.serviceId || '').trim();
  const status = String(query.status || '').trim().toLowerCase();
  const sortDirection = String(query.sort || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

  const filtered = bookings.filter((booking) => {
    if (search) {
      const haystack = `${booking.fullName} ${booking.email}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    if (date && booking.date !== date) return false;
    if (serviceId && booking.serviceId !== serviceId) return false;
    if (status && booking.status !== status) return false;

    return true;
  });

  filtered.sort(bookingDateTimeSort);
  if (sortDirection === 'desc') filtered.reverse();

  return filtered;
}

function buildDashboardMetrics(bookings, services) {
  const today = todayDateString();
  const startWeek = startOfWeekDateString();
  const startMonth = startOfMonthDateString();

  const activeStatuses = new Set(['pending', 'confirmed', 'completed', 'no-show']);
  const todayBookings = bookings
    .filter((booking) => booking.date === today && activeStatuses.has(booking.status))
    .sort(bookingDateTimeSort);

  const upcomingBooking = bookings
    .filter((booking) => activeStatuses.has(booking.status) && `${booking.date}T${booking.time}` >= `${today}T00:00`)
    .sort(bookingDateTimeSort)[0] || null;

  const weekBookings = bookings.filter((booking) => booking.date >= startWeek && booking.status !== 'cancelled');
  const monthBookings = bookings.filter((booking) => booking.date >= startMonth && booking.status !== 'cancelled');
  const cancelledBookings = bookings.filter((booking) => booking.status === 'cancelled').length;

  const serviceMap = new Map(services.map((service) => [service.id, service]));
  const estimatedRevenue = bookings
    .filter((booking) => booking.status !== 'cancelled')
    .reduce((sum, booking) => {
      const service = serviceMap.get(booking.serviceId);
      return sum + Number(service?.priceGBP || 0);
    }, 0);

  return {
    today,
    todayBookings,
    upcomingBooking,
    totals: {
      week: weekBookings.length,
      month: monthBookings.length,
      cancelled: cancelledBookings,
      estimatedRevenueGBP: estimatedRevenue
    }
  };
}

app.get('/admin', (req, res) => {
  if (hasValidAdminSession(req)) {
    return res.sendFile(path.join(publicDir, 'admin.html'));
  }
  return res.sendFile(path.join(publicDir, 'admin-login.html'));
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/public-config', async (_req, res) => {
  try {
    const config = await getBusinessConfig();
    res.json(getPublicBusinessData(config));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load public config.' });
  }
});

app.get('/api/availability/summary', async (req, res) => {
  const { serviceId, month } = req.query;

  if (!serviceId || !month) {
    return res.status(400).json({ error: 'serviceId and month are required.' });
  }

  try {
    const { start, end } = getMonthDateRange(month);
    const [config, blockedTimes] = await Promise.all([
      getBusinessConfig(),
      bookingRepository.queryBlockedTimesByDateRange(start, end)
    ]);
    const bookings = await bookingRepository.queryBookingsByDateRange(start, end);
    const blockedTimesByDate = groupBlockedTimesByDate(blockedTimes);
    const summary = generateCalendarSummary({ serviceId, month, bookings, blockedTimesByDate, config });

    if (summary.error) {
      return res.status(400).json({ error: summary.error });
    }

    return res.json(summary);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load calendar summary.' });
  }
});

app.get('/api/availability/slots', async (req, res) => {
  const { serviceId, date } = req.query;

  if (!serviceId || !date) {
    return res.status(400).json({ error: 'serviceId and date are required.' });
  }

  try {
    const [bookings, blockedTimes, config] = await Promise.all([
      bookingRepository.queryBookingsByDate(date),
      bookingRepository.queryBlockedTimesByDate(date),
      getBusinessConfig()
    ]);
    const result = buildSlotsForDate({ serviceId, date, bookings, blockedTimes, config });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load slots.' });
  }
});

app.post('/api/bookings', async (req, res) => {
  const payload = extractPublicBookingPayload(req.body);

  try {
    const config = await getBusinessConfig();
    const validation = validateBookingInput(payload, { services: config.services });
    if (!validation.valid) {
      return res.status(422).json({ error: 'Validation failed.', fieldErrors: validation.errors });
    }

    const dateWindow = validateBookingWindow(payload.date, config);
    if (!dateWindow.valid) {
      return res.status(400).json({ error: dateWindow.reason });
    }

    const [bookings, blockedTimes] = await Promise.all([
      bookingRepository.queryBookingsByDate(payload.date),
      bookingRepository.queryBlockedTimesByDate(payload.date)
    ]);
    const conflict = checkBookingConflict({
      serviceId: payload.serviceId,
      date: payload.date,
      time: payload.time,
      bookings,
      blockedTimes,
      config
    });

    if (conflict.conflict) {
      return res.status(409).json({ error: conflict.reason || 'Slot unavailable.' });
    }

    const service = config.services.find((item) => item.id === payload.serviceId);
    const now = new Date();
    const bookingReference = `SBW-${now.getTime().toString().slice(-7)}`;

    const booking = await bookingRepository.createBooking(
      {
        id: crypto.randomUUID(),
        reference: bookingReference,
        name: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        service: payload.serviceId,
        date: payload.date,
        startTime: payload.time,
        duration: service.durationMinutes,
        status: 'pending',
        notes: payload.notes,
        preferredContactMethod: payload.preferredContactMethod || 'email',
        consentAccepted: true,
        firstTimeClient: true,
        createdAt: now.toISOString()
      },
      { bufferMinutes: Number(config.booking?.bufferBetweenAppointmentsMinutes || 0) }
    );

    let emailStatus = { mode: 'console', messageId: 'not-sent' };
    try {
      emailStatus = await sendBookingNotification({ booking, service });
    } catch (mailError) {
      console.error('Email notification failed:', mailError);
    }

    return res.status(201).json({
      success: true,
      booking: {
        bookingReference: booking.bookingReference,
        serviceName: booking.serviceName,
        date: booking.date,
        time: booking.time,
        fullName: booking.fullName
      },
      emailStatus
    });
  } catch (error) {
    if (error?.code === 'DOUBLE_BOOKING') {
      return res.status(409).json({ error: 'Selected time is unavailable.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Could not complete booking request.' });
  }
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: hasValidAdminSession(req) });
});

app.post('/api/admin/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  const authResult = validateAdminLoginAttempt({ username, password });
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.reason });
  }

  createAdminSession(res);
  return res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  clearAdminSession(req, res);
  res.json({ success: true });
});

app.get('/api/admin/dashboard', requireAdminAuth, async (_req, res) => {
  try {
    const [bookings, config] = await Promise.all([bookingRepository.getBookings(), getBusinessConfig()]);
    const metrics = buildDashboardMetrics(bookings, config.services);

    res.json({
      metrics,
      services: config.services,
      bookingCount: bookings.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load dashboard metrics.' });
  }
});

app.get('/api/admin/bookings', requireAdminAuth, async (req, res) => {
  try {
    const bookings = await bookingRepository.getBookings();
    const filtered = applyBookingFilters(bookings, req.query);
    res.json({ items: filtered.map(formatBookingForList) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load bookings.' });
  }
});

app.get('/api/admin/bookings/:id', requireAdminAuth, async (req, res) => {
  try {
    const bookings = await bookingRepository.getBookings();
    const booking = bookings.find((item) => item.id === req.params.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    return res.json({ booking: formatBookingForList(booking) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load booking.' });
  }
});

app.patch('/api/admin/bookings/:id/status', requireAdminAuth, async (req, res) => {
  const nextStatus = String(req.body.status || '').trim().toLowerCase();
  if (!BOOKING_STATUSES.has(nextStatus)) {
    return res.status(400).json({ error: 'Invalid booking status.' });
  }

  try {
    const updated = await bookingRepository.updateBooking(req.params.id, {
      status: nextStatus,
      updatedAt: new Date().toISOString()
    });

    if (!updated) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    return res.json({ success: true, booking: formatBookingForList(updated) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update booking status.' });
  }
});

app.delete('/api/admin/bookings/:id', requireAdminAuth, async (req, res) => {
  try {
    const deleted = await bookingRepository.deleteBooking(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete booking.' });
  }
});

app.post('/api/admin/bookings', requireAdminAuth, async (req, res) => {
  const payload = {
    ...extractPublicBookingPayload(req.body),
    consentAccepted: true,
    website: ''
  };

  try {
    const config = await getBusinessConfig();
    const validation = validateBookingInput(payload, { services: config.services });
    if (!validation.valid) {
      return res.status(422).json({ error: 'Validation failed.', fieldErrors: validation.errors });
    }

    const dateWindow = validateBookingWindow(payload.date, config);
    if (!dateWindow.valid) {
      return res.status(400).json({ error: dateWindow.reason });
    }

    const [bookings, blockedTimes] = await Promise.all([
      bookingRepository.queryBookingsByDate(payload.date),
      bookingRepository.queryBlockedTimesByDate(payload.date)
    ]);
    const conflict = checkBookingConflict({
      serviceId: payload.serviceId,
      date: payload.date,
      time: payload.time,
      bookings,
      blockedTimes,
      config
    });

    if (conflict.conflict) {
      return res.status(409).json({ error: conflict.reason || 'Slot unavailable.' });
    }

    const service = config.services.find((item) => item.id === payload.serviceId);
    const now = new Date();
    const booking = await bookingRepository.createBooking(
      {
        id: crypto.randomUUID(),
        reference: `ADM-${now.getTime().toString().slice(-7)}`,
        name: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        service: payload.serviceId,
        date: payload.date,
        startTime: payload.time,
        duration: service.durationMinutes,
        status: 'confirmed',
        notes: payload.notes,
        preferredContactMethod: payload.preferredContactMethod || 'email',
        consentAccepted: true,
        firstTimeClient: true,
        createdAt: now.toISOString()
      },
      { bufferMinutes: Number(config.booking?.bufferBetweenAppointmentsMinutes || 0) }
    );

    return res.status(201).json({ success: true, booking: formatBookingForList(booking) });
  } catch (error) {
    if (error?.code === 'DOUBLE_BOOKING') {
      return res.status(409).json({ error: 'Selected time is unavailable.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Could not create booking.' });
  }
});

app.post('/api/admin/blocks', requireAdminAuth, async (req, res) => {
  const type = String(req.body.type || '').trim().toLowerCase();
  const date = normalizeDate(req.body.date);
  const start = normalizeTime(req.body.start);
  const end = normalizeTime(req.body.end);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Valid date is required.' });
  }

  if (!['day', 'range'].includes(type)) {
    return res.status(400).json({ error: 'Invalid block type.' });
  }

  if (type === 'range' && (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end)) {
    return res.status(400).json({ error: 'Valid start/end times are required for range blocking.' });
  }

  try {
    const config = await getBusinessConfig();
    const nextConfig = {
      ...config,
      booking: {
        ...config.booking,
        disabledDates: [...config.booking.disabledDates],
        blockedTimeRangesByDate: { ...config.booking.blockedTimeRangesByDate }
      }
    };

    if (type === 'day') {
      if (!nextConfig.booking.disabledDates.includes(date)) {
        nextConfig.booking.disabledDates.push(date);
      }
    } else {
      const value = `${start}-${end}`;
      const ranges = new Set(nextConfig.booking.blockedTimeRangesByDate[date] || []);
      ranges.add(value);
      nextConfig.booking.blockedTimeRangesByDate[date] = Array.from(ranges).sort();
    }

    const saved = await saveBusinessConfig(nextConfig);
    if (type === 'day') {
      await bookingRepository.setSetting('booking.disabledDates', nextConfig.booking.disabledDates);
    } else {
      await bookingRepository.createBlockedTime({
        date,
        startTime: start,
        endTime: end,
        reason: 'Admin block'
      });
    }
    return res.json({ success: true, booking: saved.booking });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to block time.' });
  }
});

app.delete('/api/admin/blocks', requireAdminAuth, async (req, res) => {
  const type = String(req.query.type || '').trim().toLowerCase();
  const date = normalizeDate(req.query.date);
  const start = normalizeTime(req.query.start);
  const end = normalizeTime(req.query.end);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Valid date is required.' });
  }

  try {
    const config = await getBusinessConfig();
    const nextConfig = {
      ...config,
      booking: {
        ...config.booking,
        disabledDates: [...config.booking.disabledDates],
        blockedTimeRangesByDate: { ...config.booking.blockedTimeRangesByDate }
      }
    };

    if (type === 'day') {
      nextConfig.booking.disabledDates = nextConfig.booking.disabledDates.filter((item) => item !== date);
    } else {
      const value = `${start}-${end}`;
      const ranges = (nextConfig.booking.blockedTimeRangesByDate[date] || []).filter((item) => item !== value);
      if (ranges.length === 0) {
        delete nextConfig.booking.blockedTimeRangesByDate[date];
      } else {
        nextConfig.booking.blockedTimeRangesByDate[date] = ranges;
      }
    }

    const saved = await saveBusinessConfig(nextConfig);
    if (type === 'day') {
      await bookingRepository.setSetting('booking.disabledDates', nextConfig.booking.disabledDates);
    } else {
      await bookingRepository.deleteBlockedTime({ date, startTime: start, endTime: end });
    }
    return res.json({ success: true, booking: saved.booking });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to unblock time.' });
  }
});

app.get('/api/admin/settings', requireAdminAuth, async (_req, res) => {
  try {
    const config = await getBusinessConfig();
    res.json({
      settings: {
        business: {
          ownerEmail: config.business.ownerEmail
        },
        booking: {
          workingHours: config.booking.workingHours,
          workingDays: config.booking.workingDays,
          bufferBetweenAppointmentsMinutes: config.booking.bufferBetweenAppointmentsMinutes,
          minNoticeHours: config.booking.minNoticeHours,
          maxAdvanceBookingDays: config.booking.maxAdvanceBookingDays,
          disabledDates: config.booking.disabledDates,
          blockedTimeRangesByDate: config.booking.blockedTimeRangesByDate
        },
        services: config.services
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

app.put('/api/admin/settings', requireAdminAuth, async (req, res) => {
  try {
    const config = await getBusinessConfig();

    const payload = req.body || {};
    const nextConfig = {
      ...config,
      business: {
        ...config.business,
        ...(payload.business || {})
      },
      booking: {
        ...config.booking,
        ...(payload.booking || {}),
        workingHours: {
          ...config.booking.workingHours,
          ...((payload.booking && payload.booking.workingHours) || {})
        }
      },
      services: Array.isArray(payload.services) ? payload.services : config.services
    };

    const saved = await saveBusinessConfig(nextConfig);
    await bookingRepository.setSetting('booking.disabledDates', saved.booking.disabledDates || []);
    await bookingRepository.setSetting('booking.rules', {
      slotIntervalMinutes: saved.booking.slotIntervalMinutes,
      bufferBetweenAppointmentsMinutes: saved.booking.bufferBetweenAppointmentsMinutes,
      minNoticeHours: saved.booking.minNoticeHours,
      maxAdvanceBookingDays: saved.booking.maxAdvanceBookingDays,
      workingDays: saved.booking.workingDays,
      workingHours: saved.booking.workingHours
    });
    res.json({ success: true, settings: saved });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

app.get('/api/admin/calendar', requireAdminAuth, async (req, res) => {
  const view = String(req.query.view || 'daily').toLowerCase();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : todayDateString();

  try {
    const bookings = await bookingRepository.getBookings();

    if (view === 'weekly') {
      const start = new Date(`${date}T00:00:00`);
      const day = start.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + mondayOffset);

      const days = [];
      for (let i = 0; i < 7; i += 1) {
        const current = new Date(start);
        current.setDate(start.getDate() + i);
        const dayStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        const items = bookings
          .filter((booking) => booking.date === dayStr)
          .sort(bookingDateTimeSort)
          .map(formatBookingForList);

        days.push({ date: dayStr, items });
      }

      return res.json({ view: 'weekly', date, days });
    }

    const items = bookings
      .filter((booking) => booking.date === date)
      .sort(bookingDateTimeSort)
      .map(formatBookingForList);

    return res.json({ view: 'daily', date, items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load calendar view.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Wellness booking site running on port ${port}`);
});
