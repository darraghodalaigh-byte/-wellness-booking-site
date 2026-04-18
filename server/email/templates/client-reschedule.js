import { BUSINESS_CONFIG } from '../../../config/business.config.js';
import { formatDateTime, formatDuration, htmlKeyValueTable, htmlShell, plainSection } from './utils.js';

export function renderClientRescheduleTemplate({ booking, service, previousDate, previousTime, emailSettings }) {
  const newDateTime = formatDateTime(booking.date, booking.time);
  const oldDateTime = formatDateTime(previousDate, previousTime);
  const duration = formatDuration(service.durationMinutes);

  const html = htmlShell({
    heading: 'Your Booking Has Been Rescheduled',
    brandName: emailSettings.senderName,
    intro: '<p style="margin:0">Your appointment has been successfully moved. Please review the updated details below.</p>',
    sections: [
      htmlKeyValueTable([
        { label: 'Booking Reference', value: booking.bookingReference, emphasize: true },
        { label: 'Service', value: service.name },
        { label: 'Previous Date & Time', value: oldDateTime },
        { label: 'New Date & Time', value: newDateTime, emphasize: true },
        { label: 'Duration', value: duration },
        { label: 'Location', value: BUSINESS_CONFIG.business.location }
      ])
    ],
    footerLines: [
      `${BUSINESS_CONFIG.business.name} | ${BUSINESS_CONFIG.business.phone}`,
      `Questions? Reply to ${emailSettings.replyToEmail}`
    ]
  });

  const text = [
    `Booking Rescheduled - ${BUSINESS_CONFIG.business.name}`,
    '',
    plainSection('Updated Appointment', [
      `Booking Reference: ${booking.bookingReference}`,
      `Service: ${service.name}`,
      `Previous Date & Time: ${oldDateTime}`,
      `New Date & Time: ${newDateTime}`,
      `Duration: ${duration}`,
      `Location: ${BUSINESS_CONFIG.business.location}`
    ]),
    '',
    `Questions? Reply to ${emailSettings.replyToEmail}.`
  ].join('\n');

  return { html, text };
}
