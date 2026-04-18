import { BUSINESS_CONFIG } from '../../../config/business.config.js';
import { formatDateTime, formatDuration, htmlKeyValueTable, htmlShell, plainSection } from './utils.js';

export function renderClientReminderTemplate({ booking, service, reminderType, emailSettings }) {
  const dateTime = formatDateTime(booking.date, booking.time);
  const duration = formatDuration(service.durationMinutes);

  const heading = reminderType === 'same-day'
    ? 'Reminder: Your Appointment Is Today'
    : 'Reminder: Upcoming Appointment (24 Hours)';

  const html = htmlShell({
    heading,
    brandName: emailSettings.senderName,
    intro: '<p style="margin:0">A quick reminder about your upcoming appointment.</p>',
    sections: [
      htmlKeyValueTable([
        { label: 'Booking Reference', value: booking.bookingReference, emphasize: true },
        { label: 'Service', value: service.name },
        { label: 'Date & Time', value: dateTime, emphasize: true },
        { label: 'Duration', value: duration },
        { label: 'Location', value: BUSINESS_CONFIG.business.location }
      ])
    ],
    footerLines: [
      `${BUSINESS_CONFIG.business.name} | ${BUSINESS_CONFIG.business.phone}`,
      `Need to change your booking? ${emailSettings.replyToEmail}`
    ]
  });

  const text = [
    `${heading} - ${BUSINESS_CONFIG.business.name}`,
    '',
    plainSection('Appointment', [
      `Booking Reference: ${booking.bookingReference}`,
      `Service: ${service.name}`,
      `Date & Time: ${dateTime}`,
      `Duration: ${duration}`,
      `Location: ${BUSINESS_CONFIG.business.location}`
    ]),
    '',
    `Need to change your booking? Reply to ${emailSettings.replyToEmail}.`
  ].join('\n');

  return { html, text };
}
