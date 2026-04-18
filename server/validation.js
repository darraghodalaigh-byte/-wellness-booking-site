import { BUSINESS_CONFIG } from '../config/business.config.js';

export function validateBookingInput(payload, options = {}) {
  const errors = {};
  const required = ['fullName', 'email', 'phone', 'serviceId', 'date', 'time'];
  const services = Array.isArray(options.services) && options.services.length > 0
    ? options.services
    : BUSINESS_CONFIG.services;

  for (const field of required) {
    if (!payload[field] || !String(payload[field]).trim()) {
      errors[field] = 'Required';
    }
  }

  if (payload.fullName && payload.fullName.trim().length < 2) {
    errors.fullName = 'Please provide your full name.';
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.email = 'Please enter a valid email address.';
  }

  if (payload.phone && !/^[+\d()\-\s]{7,20}$/.test(payload.phone)) {
    errors.phone = 'Please enter a valid contact number.';
  }

  if (payload.date && !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    errors.date = 'Date format must be YYYY-MM-DD.';
  }

  if (payload.time && !/^\d{2}:\d{2}$/.test(payload.time)) {
    errors.time = 'Time format must be HH:MM.';
  }

  const service = services.find((item) => item.id === payload.serviceId && item.active !== false);
  if (!service) {
    errors.serviceId = 'Please select a valid service.';
  }

  if (!payload.consentAccepted) {
    errors.consentAccepted = 'Consent is required before booking.';
  }

  if (payload.website && String(payload.website).trim()) {
    errors.website = 'Spam detected.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
