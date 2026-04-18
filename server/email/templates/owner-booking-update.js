import { BUSINESS_CONFIG } from '../../../config/business.config.js';
import { formatDateTime, htmlCallout, htmlKeyValueTable, htmlShell, plainSection } from './utils.js';

export function renderOwnerBookingUpdateTemplate({ booking, service, updateType, changeSummary = 'No summary provided.' }) {
  const dateTime = formatDateTime(booking.date, booking.time);

  const html = htmlShell({
    heading: 'Booking Update',
    brandName: BUSINESS_CONFIG.business.name,
    intro: '<p style="margin:0">A booking record has been updated.</p>',
    sections: [
      htmlKeyValueTable([
        { label: 'Update Type', value: updateType, emphasize: true },
        { label: 'Booking Ref', value: booking.bookingReference },
        { label: 'Client', value: booking.fullName },
        { label: 'Service', value: service.name },
        { label: 'Date & Time', value: dateTime, emphasize: true }
      ]),
      htmlCallout({
        title: 'Change Summary',
        body: String(changeSummary).replace(/\n/g, '<br/>')
      })
    ],
    footerLines: [`${BUSINESS_CONFIG.business.name} internal booking update`]
  });

  const text = [
    'Booking Update',
    '',
    plainSection('Details', [
      `Update Type: ${updateType}`,
      `Booking Ref: ${booking.bookingReference}`,
      `Client: ${booking.fullName}`,
      `Service: ${service.name}`,
      `Date & Time: ${dateTime}`
    ]),
    '',
    plainSection('Change Summary', [changeSummary])
  ].join('\n');

  return { html, text };
}
