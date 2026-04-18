import { BUSINESS_CONFIG } from '../../../config/business.config.js';
import { formatDateTime, formatDuration, htmlKeyValueTable, htmlShell, plainSection } from './utils.js';

export function renderClientCancellationTemplate({ booking, service, reason, emailSettings }) {
  const dateTime = formatDateTime(booking.date, booking.time);
  const duration = formatDuration(service.durationMinutes);

  const html = htmlShell({
    heading: 'Your Booking Has Been Cancelled',
    brandName: emailSettings.senderName,
    intro: '<p style="margin:0">This email confirms that your appointment has been cancelled.</p>',
    sections: [
      htmlKeyValueTable([
        { label: 'Booking Reference', value: booking.bookingReference, emphasize: true },
        { label: 'Service', value: service.name },
        { label: 'Original Date & Time', value: dateTime },
        { label: 'Duration', value: duration },
        { label: 'Cancellation Reason', value: reason || 'No reason provided' }
      ])
    ],
    footerLines: [
      `${BUSINESS_CONFIG.business.name} | ${BUSINESS_CONFIG.business.phone}`,
      `Need support? Reply to ${emailSettings.replyToEmail}`
    ]
  });

  const text = [
    `Booking Cancelled - ${BUSINESS_CONFIG.business.name}`,
    '',
    plainSection('Details', [
      `Booking Reference: ${booking.bookingReference}`,
      `Service: ${service.name}`,
      `Original Date & Time: ${dateTime}`,
      `Duration: ${duration}`,
      `Cancellation Reason: ${reason || 'No reason provided'}`
    ]),
    '',
    `Contact us at ${emailSettings.replyToEmail} if you need help rebooking.`
  ].join('\n');

  return { html, text };
}
