import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUSINESS_CONFIG } from '../config/business.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ''));
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function sanitizeService(service, fallback = {}) {
  const idRaw = String(service?.id || fallback.id || '')
    .trim()
    .toLowerCase();

  const id = idRaw
    .replace(/[^a-z0-9\-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback.id;

  return {
    id,
    name: String(service?.name || fallback.name || '').trim(),
    durationMinutes: toInt(service?.durationMinutes, fallback.durationMinutes || 60),
    priceGBP: toInt(service?.priceGBP, fallback.priceGBP || 0),
    shortDescription: String(service?.shortDescription || fallback.shortDescription || '').trim(),
    benefits: Array.isArray(service?.benefits)
      ? service.benefits.map((item) => String(item || '').trim()).filter(Boolean)
      : Array.isArray(fallback.benefits)
      ? fallback.benefits
      : [],
    active: typeof service?.active === 'boolean' ? service.active : (fallback.active ?? true)
  };
}

function normalizeConfig(inputConfig = {}) {
  const merged = {
    ...clone(BUSINESS_CONFIG),
    ...clone(inputConfig),
    business: {
      ...clone(BUSINESS_CONFIG.business),
      ...(inputConfig.business || {})
    },
    booking: {
      ...clone(BUSINESS_CONFIG.booking),
      ...(inputConfig.booking || {})
    },
    policies: {
      ...clone(BUSINESS_CONFIG.policies),
      ...(inputConfig.policies || {})
    }
  };

  const baselineServices = clone(BUSINESS_CONFIG.services);
  const sourceServices = Array.isArray(inputConfig.services) ? inputConfig.services : baselineServices;

  const services = sourceServices
    .map((service, index) => sanitizeService(service, baselineServices[index]))
    .filter((service) => service.id && service.name && service.durationMinutes > 0);

  const serviceIds = new Set();
  const dedupedServices = services.filter((service) => {
    if (serviceIds.has(service.id)) return false;
    serviceIds.add(service.id);
    return true;
  });

  const workingDays = Array.isArray(merged.booking.workingDays)
    ? [...new Set(merged.booking.workingDays.map((d) => toInt(d, -1)).filter((d) => d >= 0 && d <= 6))]
    : clone(BUSINESS_CONFIG.booking.workingDays);

  const disabledDates = Array.isArray(merged.booking.disabledDates)
    ? [...new Set(merged.booking.disabledDates.map((d) => String(d || '').trim()).filter(validDate))]
    : clone(BUSINESS_CONFIG.booking.disabledDates);

  const blockedTimeRangesByDate = {};
  const rangesByDate = merged.booking.blockedTimeRangesByDate || {};
  for (const [date, ranges] of Object.entries(rangesByDate)) {
    if (!validDate(date) || !Array.isArray(ranges)) continue;
    const cleaned = [...new Set(ranges.map((item) => String(item || '').trim()).filter((range) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(range)))];
    if (cleaned.length > 0) {
      blockedTimeRangesByDate[date] = cleaned;
    }
  }

  return {
    ...merged,
    business: {
      ...merged.business,
      ownerEmail: String(merged.business.ownerEmail || BUSINESS_CONFIG.business.ownerEmail).trim()
    },
    booking: {
      ...merged.booking,
      slotIntervalMinutes: toInt(merged.booking.slotIntervalMinutes, BUSINESS_CONFIG.booking.slotIntervalMinutes),
      bufferBetweenAppointmentsMinutes: toInt(
        merged.booking.bufferBetweenAppointmentsMinutes,
        BUSINESS_CONFIG.booking.bufferBetweenAppointmentsMinutes
      ),
      minNoticeHours: toInt(merged.booking.minNoticeHours, BUSINESS_CONFIG.booking.minNoticeHours),
      maxAdvanceBookingDays: toInt(merged.booking.maxAdvanceBookingDays, BUSINESS_CONFIG.booking.maxAdvanceBookingDays),
      workingHours: {
        start: validTime(merged.booking.workingHours?.start)
          ? merged.booking.workingHours.start
          : BUSINESS_CONFIG.booking.workingHours.start,
        end: validTime(merged.booking.workingHours?.end)
          ? merged.booking.workingHours.end
          : BUSINESS_CONFIG.booking.workingHours.end
      },
      workingDays,
      disabledDates,
      blockedTimeRangesByDate
    },
    services: dedupedServices.length > 0 ? dedupedServices : baselineServices.map((service) => ({ ...service, active: true }))
  };
}

async function ensureSettingsFile() {
  try {
    await fs.access(SETTINGS_FILE);
  } catch {
    await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    const initial = normalizeConfig(BUSINESS_CONFIG);
    await fs.writeFile(SETTINGS_FILE, `${JSON.stringify(initial, null, 2)}\n`, 'utf8');
  }
}

export async function getBusinessConfig() {
  await ensureSettingsFile();
  const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
  const parsed = raw ? JSON.parse(raw) : {};
  const normalized = normalizeConfig(parsed);
  return normalized;
}

export async function saveBusinessConfig(config) {
  await ensureSettingsFile();
  const normalized = normalizeConfig(config);
  await fs.writeFile(SETTINGS_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export function normalizeBusinessConfig(config) {
  return normalizeConfig(config);
}
