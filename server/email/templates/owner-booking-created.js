import { BUSINESS_CONFIG } from '../../../config/business.config.js';
import {
  formatDateTime,
  formatDuration,
  formatIsoDate,
  htmlCallout,
  htmlKeyValueTable,
  htmlShell,
  plainSection
} from './utils.js';

export function renderOwnerBookingCreatedTemplate({ booking, service, isFirstTimeClient, emailSettings }) {
  const dateTime = formatDateTime(booking.date, booking.time);
  const duration = formatDuration(service.durationMinutes);
  const notes = booking.notes || 'No notes provided.';

  const sections = [
    htmlKeyValueTable([
      { label: 'Time', value: dateTime, emphasize: true },
      { label: 'Service', value: service.name, emphasize: true },
      { label: 'Duration', value: duration },
      { label: 'Booking Ref', value: booking.bookingReference },
      { label: 'Client', value: booking.fullName },
      { label: 'Email', value: booking.email },
      { label: 'Phone', value: booking.phone },
      { label: 'Preferred Contact', value: booking.preferredContactMethod || 'Not specified' },
      { label: 'Submitted At', value: formatIsoDate(booking.createdAt) }
    ])
  ];

  if (isFirstTimeClient) {
    sections.push(
      htmlCallout({
        tone: 'warning',
        title: 'First-time client',
        body: 'This appears to be this client\'s first booking in the system.'
      })
    );
  }

  sections.push(
    htmlCallout({
      title: 'Client Notes',
      body: notes.replace(/\n/g, '<br/>')
    })
  );

  const html = htmlShell({
    heading: 'New Booking Request',
    brandName: BUSINESS_CONFIG.business.name,
    intro: '<p style="margin:0">A new booking request has been submitted via the website.</p>',
    sections,
    footerLines: [
      `Notification recipient: ${emailSettings.ownerEmail}`,
      `Client reference: ${booking.bookingReference}`
    ]
  });

  const text = [
    'New Booking Request',
    '',
    plainSection('Key Info', [
      `Time: ${dateTime}`,
      `Service: ${service.name}`,
      `Duration: ${duration}`,
      `Booking Ref: ${booking.bookingReference}`
    ]),
    '',
    plainSection('Client', [
      `Name: ${booking.fullName}`,
      `Email: ${booking.email}`,
      `Phone: ${booking.phone}`,
      `Preferred Contact: ${booking.preferredContactMethod || 'Not specified'}`
    ]),
    '',
    `First-time client: ${isFirstTimeClient ? 'YES' : 'No'}`,
    '',
    plainSection('Client Notes', [notes]),
    '',
    `Submitted at: ${formatIsoDate(booking.createdAt)}`
  ].join('\n');

  return { html, text };
}
