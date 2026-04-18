import crypto from 'node:crypto';
import { BUSINESS_CONFIG } from '../../config/business.config.js';
import { toIcsDate } from './templates/utils.js';

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function createBookingIcsContent({ booking, service }) {
  const start = new Date(`${booking.date}T${booking.time}:00`);
  const end = new Date(start.getTime() + (service.durationMinutes * 60 * 1000));
  const now = new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const uid = `${booking.id || crypto.randomUUID()}@${(BUSINESS_CONFIG.business.name || 'booking').replace(/\s+/g, '-').toLowerCase()}`;
  const organizer = process.env.EMAIL_REPLY_TO
    || process.env.BOOKING_REPLY_TO
    || process.env.EMAIL_FROM_ADDRESS
    || BUSINESS_CONFIG.email?.replyToEmail
    || BUSINESS_CONFIG.business.ownerEmail;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wellness Booking Platform//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(service.name)}`,
    `LOCATION:${escapeIcsText(BUSINESS_CONFIG.business.location || 'Location to be confirmed')}`,
    `DESCRIPTION:${escapeIcsText(`Booking reference ${booking.bookingReference}`)}`,
    `ORGANIZER:MAILTO:${escapeIcsText(organizer)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n');
}
