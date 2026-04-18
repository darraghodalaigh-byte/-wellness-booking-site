import { BUSINESS_CONFIG } from '../config/business.config.js';
import { minutesToTime, parseTimeToMinutes } from './db/time.js';

function parseDateOnly(input) {
  const [year, month, day] = input.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dayDiff(dateA, dateB) {
  const ms = dateA.getTime() - dateB.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function getService(config, serviceId, includeInactive = false) {
  const services = Array.isArray(config?.services) ? config.services : [];
  return services.find((service) => {
    if (service.id !== serviceId) return false;
    if (includeInactive) return true;
    return service.active !== false;
  }) || null;
}

function getBlockedRanges(date, config, blockedTimes = []) {
  const staticRanges = config.booking.blockedTimeRangesByDate?.[date] || [];
  const dbRanges = blockedTimes
    .filter((range) => range.date === date)
    .map((range) => `${range.start_time}-${range.end_time}`);

  const ranges = Array.from(new Set([...staticRanges, ...dbRanges]));
  return ranges.map((range) => {
    const [start, end] = range.split('-');
    return {
      start: parseTimeToMinutes(start),
      end: parseTimeToMinutes(end)
    };
  });
}

function getBookingRange(booking) {
  const start = parseTimeToMinutes(booking.time);
  const end = start + Number(booking.durationMinutes || 0);
  return { start, end };
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function validateBookingWindow(date, config = BUSINESS_CONFIG) {
  const today = new Date();
  const localToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const bookingDay = parseDateOnly(date);
  const advanceDays = dayDiff(bookingDay, localToday);

  if (advanceDays < 0) {
    return { valid: false, reason: 'Please choose a future date.' };
  }

  if (advanceDays > config.booking.maxAdvanceBookingDays) {
    return {
      valid: false,
      reason: `Bookings are available up to ${config.booking.maxAdvanceBookingDays} days in advance.`
    };
  }

  if ((config.booking.disabledDates || []).includes(date)) {
    return { valid: false, reason: 'This date is unavailable.' };
  }

  const weekday = parseDateOnly(date).getUTCDay();
  if (!(config.booking.workingDays || []).includes(weekday)) {
    return { valid: false, reason: 'Appointments are not offered on this day.' };
  }

  return { valid: true };
}

export function buildSlotsForDate({ serviceId, date, bookings, blockedTimes = [], config = BUSINESS_CONFIG }) {
  const service = getService(config, serviceId);
  if (!service) {
    return { error: 'Invalid service selected.' };
  }

  const dateWindow = validateBookingWindow(date, config);
  if (!dateWindow.valid) {
    return {
      service,
      date,
      slots: [],
      unavailableReason: dateWindow.reason
    };
  }

  const slotInterval = config.booking.slotIntervalMinutes;
  const buffer = config.booking.bufferBetweenAppointmentsMinutes;
  const open = parseTimeToMinutes(config.booking.workingHours.start);
  const close = parseTimeToMinutes(config.booking.workingHours.end);
  const blockedRanges = getBlockedRanges(date, config, blockedTimes);

  const occupiedStatuses = new Set(['pending', 'confirmed', 'completed', 'no-show']);

  const dateBookings = bookings
    .filter((booking) => booking.date === date && occupiedStatuses.has(String(booking.status || '').toLowerCase()))
    .map((booking) => ({ ...getBookingRange(booking), id: booking.id }));

  const now = new Date();
  const minNoticeCutoff = now.getTime() + (config.booking.minNoticeHours * 60 * 60 * 1000);

  const slots = [];
  for (let candidate = open; candidate + service.durationMinutes <= close; candidate += slotInterval) {
    const appointmentRange = {
      start: candidate,
      end: candidate + service.durationMinutes
    };

    const blockedBufferRange = {
      start: appointmentRange.start,
      end: appointmentRange.end + buffer
    };

    let available = true;
    let reason = '';

    for (const blockedRange of blockedRanges) {
      if (overlaps(appointmentRange, blockedRange)) {
        available = false;
        reason = 'Blocked period';
        break;
      }
    }

    if (available) {
      for (const existing of dateBookings) {
        const existingWithBuffer = { start: existing.start, end: existing.end + buffer };
        if (overlaps(blockedBufferRange, existingWithBuffer)) {
          available = false;
          reason = 'Already booked';
          break;
        }
      }
    }

    if (available) {
      const slotDateTime = new Date(`${date}T${minutesToTime(candidate)}:00`);
      if (slotDateTime.getTime() < minNoticeCutoff) {
        available = false;
        reason = `Requires ${config.booking.minNoticeHours}h notice`;
      }
    }

    slots.push({
      time: minutesToTime(candidate),
      label: minutesToTime(candidate),
      available,
      reason
    });
  }

  return {
    service,
    date,
    slots,
    unavailableReason: ''
  };
}

export function generateCalendarSummary({
  serviceId,
  month,
  bookings,
  blockedTimesByDate = {},
  config = BUSINESS_CONFIG
}) {
  const service = getService(config, serviceId);
  if (!service) {
    return { error: 'Invalid service selected.' };
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const days = [];

  for (let day = 1; day <= 31; day += 1) {
    const candidate = new Date(Date.UTC(year, monthNumber - 1, day));
    if (candidate.getUTCMonth() !== firstDay.getUTCMonth()) break;

    const dateStr = `${year.toString().padStart(4, '0')}-${monthNumber
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    const slotResult = buildSlotsForDate({
      serviceId,
      date: dateStr,
      bookings,
      blockedTimes: blockedTimesByDate[dateStr] || [],
      config
    });
    const availableCount = slotResult.slots.filter((slot) => slot.available).length;

    days.push({
      date: dateStr,
      availableCount,
      isUnavailable: Boolean(slotResult.unavailableReason),
      unavailableReason: slotResult.unavailableReason || ''
    });
  }

  return {
    service,
    month,
    days
  };
}

export function checkBookingConflict({
  serviceId,
  date,
  time,
  bookings,
  blockedTimes = [],
  config = BUSINESS_CONFIG
}) {
  const service = getService(config, serviceId);
  if (!service) {
    return { conflict: true, reason: 'Invalid service.' };
  }

  const slotResult = buildSlotsForDate({ serviceId, date, bookings, blockedTimes, config });
  const slot = slotResult.slots.find((candidate) => candidate.time === time);

  if (!slot) {
    return { conflict: true, reason: 'Selected time does not exist.' };
  }

  if (!slot.available) {
    return { conflict: true, reason: slot.reason || 'Selected time is unavailable.' };
  }

  return { conflict: false };
}

export function getPublicBusinessData(config = BUSINESS_CONFIG) {
  return {
    business: config.business,
    services: (config.services || []).filter((service) => service.active !== false),
    policies: config.policies,
    faq: config.faq,
    testimonials: config.testimonials,
    bookingRules: {
      workingDays: config.booking.workingDays,
      workingHours: config.booking.workingHours,
      bufferBetweenAppointmentsMinutes: config.booking.bufferBetweenAppointmentsMinutes,
      minNoticeHours: config.booking.minNoticeHours,
      maxAdvanceBookingDays: config.booking.maxAdvanceBookingDays
    }
  };
}
