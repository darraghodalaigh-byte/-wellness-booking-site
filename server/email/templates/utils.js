import { BUSINESS_CONFIG } from '../../../config/business.config.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDuration(minutes) {
  const value = Number(minutes || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 'Not specified';
  }
  if (value < 60) {
    return `${value} minutes`;
  }
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  if (remainder === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'} ${remainder} minutes`;
}

export function formatDateTime(date, time) {
  if (!date || !time) return 'Date/time not set';
  const raw = new Date(`${date}T${time}:00`);
  if (Number.isNaN(raw.getTime())) {
    return `${date} ${time}`;
  }

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: BUSINESS_CONFIG.business.timezone || 'Europe/London'
  }).format(raw);
}

export function formatIsoDate(isoDate) {
  if (!isoDate) return 'Unknown';
  const raw = new Date(isoDate);
  if (Number.isNaN(raw.getTime())) return isoDate;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: BUSINESS_CONFIG.business.timezone || 'Europe/London'
  }).format(raw);
}

export function htmlShell({ heading, intro, brandName, sections = [], footerLines = [] }) {
  const sectionHtml = sections.join('');
  const footerHtml = footerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');

  return `
    <div style="background:#f6f7fb;padding:24px;font-family:Arial,sans-serif;color:#1f2937">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
        <tr>
          <td style="padding:20px 24px;background:#111827;color:#ffffff">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85">${escapeHtml(brandName)}</div>
            <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25">${escapeHtml(heading)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px 10px;font-size:15px;line-height:1.6;color:#374151">${intro}</td>
        </tr>
        <tr>
          <td style="padding:0 24px 20px">${sectionHtml}</td>
        </tr>
        <tr>
          <td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5">${footerHtml}</td>
        </tr>
      </table>
    </div>
  `;
}

export function htmlKeyValueTable(rows) {
  const body = rows
    .map(({ label, value, emphasize = false }) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;width:42%;font-weight:600;color:#111827">${escapeHtml(label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;${emphasize ? 'font-size:16px;font-weight:700;' : ''}">${escapeHtml(value)}</td>
      </tr>
    `)
    .join('');

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;border-collapse:separate;background:#ffffff">
      ${body}
    </table>
  `;
}

export function htmlCallout({ title, body, tone = 'info' }) {
  const theme = tone === 'warning'
    ? { bg: '#fff7ed', border: '#fdba74', title: '#9a3412' }
    : { bg: '#ecfeff', border: '#67e8f9', title: '#155e75' };

  return `
    <div style="margin-top:14px;padding:12px 14px;border-radius:8px;background:${theme.bg};border:1px solid ${theme.border}">
      <div style="font-weight:700;color:${theme.title};margin-bottom:4px">${escapeHtml(title)}</div>
      <div style="color:#374151;line-height:1.55">${body}</div>
    </div>
  `;
}

export function htmlList(title, items) {
  const list = items.map((item) => `<li style="margin-bottom:6px">${escapeHtml(item)}</li>`).join('');
  return `
    <div style="margin-top:16px">
      <h2 style="font-size:16px;margin:0 0 8px;color:#111827">${escapeHtml(title)}</h2>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.55">${list}</ul>
    </div>
  `;
}

export function plainSection(title, lines) {
  return [title, ...lines].join('\n');
}

export function toIcsDate(date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('') + 'T' + [pad(date.getUTCHours()), pad(date.getUTCMinutes()), pad(date.getUTCSeconds())].join('') + 'Z';
}
