import { BUSINESS_CONFIG } from '../../../config/business.config.js';
import {
  escapeHtml,
  formatDateTime,
  formatDuration,
  htmlCallout,
  htmlKeyValueTable,
  htmlList,
  htmlShell,
  plainSection
} from './utils.js';

export function renderClientConfirmationTemplate({ booking, service, emailSettings }) {
  const dateTime = formatDateTime(booking.date, booking.time);
  const duration = formatDuration(service.durationMinutes);
  const whatToExpect = [
    BUSINESS_CONFIG.policies.arrival,
    'Your session starts at the booked time and is tailored to your stated goals/notes.',
    BUSINESS_CONFIG.policies.privacy
  ];

  const html = htmlShell({
    heading: 'Your Booking Is Confirmed',
    brandName: emailSettings.senderName,
    intro: `<p style=\"margin:0\">Thank you for booking with ${escapeHtml(BUSINESS_CONFIG.business.name)}. Your appointment details are below.</p>`,
    sections: [
      htmlKeyValueTable([
        { label: 'Booking Reference', value: booking.bookingReference, emphasize: true },
        { label: 'Service', value: service.name },
        { label: 'Date & Time', value: dateTime, emphasize: true },
        { label: 'Duration', value: duration },
        { label: 'Location', value: BUSINESS_CONFIG.business.location }
      ]),
      htmlList('What To Expect', whatToExpect),
      htmlCallout({
        title: 'Need To Change Or Cancel?',
        body: `${escapeHtml(BUSINESS_CONFIG.policies.cancellation)}<br/><br/>Reply to this email or contact us directly.`
      }),
      htmlList('Contact Details', [
        `Phone: ${BUSINESS_CONFIG.business.phone}`,
        `Email: ${emailSettings.replyToEmail}`,
        `Address: ${BUSINESS_CONFIG.business.location}`
      ])
    ],
    footerLines: [
      `${BUSINESS_CONFIG.business.name} | ${BUSINESS_CONFIG.business.tagline}`,
      `Reference: ${booking.bookingReference}`
    ]
  });

  const text = [
    `Booking Confirmed - ${BUSINESS_CONFIG.business.name}`,
    '',
    plainSection('Appointment Details', [
      `Booking Reference: ${booking.bookingReference}`,
      `Service: ${service.name}`,
      `Date & Time: ${dateTime}`,
      `Duration: ${duration}`,
      `Location: ${BUSINESS_CONFIG.business.location}`
    ]),
    '',
    plainSection('What To Expect', whatToExpect.map((item) => `- ${item}`)),
    '',
    plainSection('Cancellation / Reschedule', [
      BUSINESS_CONFIG.policies.cancellation,
      `Reply-to: ${emailSettings.replyToEmail}`
    ]),
    '',
    plainSection('Contact Details', [
      `Phone: ${BUSINESS_CONFIG.business.phone}`,
      `Email: ${emailSettings.replyToEmail}`,
      `Address: ${BUSINESS_CONFIG.business.location}`
    ])
  ].join('\n');

  return { html, text };
}
