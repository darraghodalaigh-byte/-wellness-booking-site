import { BUSINESS_CONFIG } from '../config/business.config.js';

function buildLocalDate(date, time) {
  return new Date(`${date}T${time}:00`);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, 0, 0, 0);
}

export function buildReminderPlan({ booking, service, now = new Date() }) {
  const appointment = buildLocalDate(booking.date, booking.time);
  if (Number.isNaN(appointment.getTime())) {
    return [];
  }

  const reminderDefinitions = [
    {
      type: '24h',
      sendAt: new Date(appointment.getTime() - (24 * 60 * 60 * 1000))
    },
    {
      type: 'same-day',
      sendAt: startOfDay(appointment)
    }
  ];

  return reminderDefinitions.map((definition) => ({
    bookingId: booking.id,
    bookingReference: booking.bookingReference,
    clientEmail: booking.email,
    serviceId: service.id,
    reminderType: definition.type,
    scheduledAt: definition.sendAt.toISOString(),
    channel: 'email',
    template: definition.type === '24h' ? 'client-reminder-24h' : 'client-reminder-same-day',
    status: definition.sendAt.getTime() <= now.getTime() ? 'skipped-past' : 'scheduled',
    timezone: BUSINESS_CONFIG.business.timezone || 'Europe/London'
  }));
}

export function registerReminderPlan({ booking, service }) {
  const reminders = buildReminderPlan({ booking, service });

  // Placeholder for future queue/cron integration.
  const active = reminders.filter((item) => item.status === 'scheduled');
  if (active.length > 0) {
    console.log('[reminder] prepared', {
      bookingReference: booking.bookingReference,
      count: active.length,
      reminderTypes: active.map((item) => item.reminderType)
    });
  }

  return reminders;
}
