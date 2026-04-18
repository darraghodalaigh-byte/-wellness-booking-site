import nodemailer from 'nodemailer';
import { BUSINESS_CONFIG } from '../config/business.config.js';
import { getBusinessConfig } from './runtime-config.js';
import { createBookingIcsContent } from './email/ics.js';
import { renderClientCancellationTemplate } from './email/templates/client-cancellation.js';
import { renderClientConfirmationTemplate } from './email/templates/client-confirmation.js';
import { renderClientReminderTemplate } from './email/templates/client-reminder.js';
import { renderClientRescheduleTemplate } from './email/templates/client-reschedule.js';
import { renderOwnerBookingCreatedTemplate } from './email/templates/owner-booking-created.js';
import { renderOwnerBookingUpdateTemplate } from './email/templates/owner-booking-update.js';

const RETRYABLE_ERROR_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveEmailSettings() {
  const config = await getBusinessConfig();
  const businessName = config.business?.name || BUSINESS_CONFIG.business.name;
  const ownerEmailFromConfig = config.business?.ownerEmail || BUSINESS_CONFIG.business.ownerEmail;
  const emailConfig = config.email || BUSINESS_CONFIG.email || {};

  const senderName = process.env.EMAIL_SENDER_NAME
    || process.env.BOOKING_SENDER_NAME
    || emailConfig.senderName
    || businessName;

  const fromAddress = process.env.EMAIL_FROM_ADDRESS
    || process.env.EMAIL_FROM
    || process.env.BOOKING_FROM_EMAIL
    || emailConfig.fromEmail
    || 'no-reply@localhost';

  const replyToEmail = process.env.EMAIL_REPLY_TO
    || process.env.BOOKING_REPLY_TO
    || emailConfig.replyToEmail
    || ownerEmailFromConfig;

  const ownerEmail = process.env.OWNER_EMAIL
    || process.env.BOOKING_OWNER_EMAIL
    || emailConfig.ownerEmail
    || ownerEmailFromConfig;

  return {
    businessName,
    senderName,
    from: `"${senderName}" <${fromAddress}>`,
    replyToEmail,
    ownerEmail
  };
}

function getOwnerRecipients(emailSettings) {
  if (process.env.BOOKING_NOTIFICATION_TO) {
    const recipients = process.env.BOOKING_NOTIFICATION_TO
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (recipients.length > 0) {
      return recipients;
    }
  }

  return [emailSettings.ownerEmail];
}

async function createTransport() {
  const emailMode = (process.env.EMAIL_MODE || 'console').toLowerCase();

  if (emailMode === 'smtp') {
    return {
      mode: 'smtp',
      transporter: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false') === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      })
    };
  }

  return {
    mode: 'console',
    transporter: nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true
    })
  };
}

function isRetryableError(error) {
  if (!error) return false;
  if (RETRYABLE_ERROR_CODES.has(error.code)) return true;
  if (typeof error.responseCode === 'number' && error.responseCode >= 500) return true;
  return false;
}

async function sendWithRetry({ transporter, mode, message, logLabel }) {
  const maxAttempts = Math.max(1, Number(process.env.EMAIL_RETRY_ATTEMPTS || 2));
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const info = await transporter.sendMail(message);

      if (mode === 'console') {
        const text = info.message?.toString() || '';
        console.log(`\n----- ${logLabel} (console mode) -----\n`);
        console.log(text);
        console.log(`\n----- End ${logLabel} -----\n`);
      }

      return {
        ok: true,
        messageId: info.messageId || 'local-dev',
        accepted: info.accepted || [],
        rejected: info.rejected || []
      };
    } catch (error) {
      lastError = error;
      console.error('[email] send attempt failed', {
        label: logLabel,
        attempt,
        maxAttempts,
        code: error.code,
        message: error.message
      });

      if (attempt < maxAttempts && isRetryableError(error)) {
        await delay(attempt * 250);
        continue;
      }

      break;
    }
  }

  return {
    ok: false,
    messageId: 'failed',
    accepted: [],
    rejected: Array.isArray(message.to) ? message.to : [message.to],
    error: {
      code: lastError?.code || 'EMAIL_SEND_FAILED',
      message: lastError?.message || 'Unknown email send failure'
    }
  };
}

async function sendEmail({ transporter, mode, emailSettings, to, subject, template, attachments = [], logLabel }) {
  const message = {
    from: emailSettings.from,
    replyTo: emailSettings.replyToEmail,
    to,
    subject,
    text: template.text,
    html: template.html,
    attachments
  };

  return sendWithRetry({ transporter, mode, message, logLabel });
}

function summarizeResults(mode, results) {
  return {
    mode,
    sent: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results
  };
}

export async function sendBookingCreatedEmails({ booking, service, isFirstTimeClient = false }) {
  const emailSettings = await resolveEmailSettings();
  const ownerRecipients = getOwnerRecipients(emailSettings);
  const { mode, transporter } = await createTransport();

  const clientTemplate = renderClientConfirmationTemplate({ booking, service, emailSettings });
  const ownerTemplate = renderOwnerBookingCreatedTemplate({
    booking,
    service,
    isFirstTimeClient,
    emailSettings
  });

  const icsContent = createBookingIcsContent({ booking, service });
  const clientAttachments = [];
  if (icsContent) {
    clientAttachments.push({
      filename: `booking-${booking.bookingReference}.ics`,
      content: icsContent,
      contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
    });
  }

  const [clientResult, ownerResult] = await Promise.all([
    sendEmail({
      transporter,
      mode,
      emailSettings,
      to: booking.email,
      subject: `${emailSettings.businessName} booking confirmed (${booking.bookingReference})`,
      template: clientTemplate,
      attachments: clientAttachments,
      logLabel: 'Client Confirmation Email'
    }),
    sendEmail({
      transporter,
      mode,
      emailSettings,
      to: ownerRecipients,
      subject: `New booking: ${service.name} at ${booking.time} (${booking.bookingReference})`,
      template: ownerTemplate,
      logLabel: 'Owner Booking Email'
    })
  ]);

  return summarizeResults(mode, [
    { type: 'client-confirmation', ...clientResult },
    { type: 'owner-booking-created', ...ownerResult }
  ]);
}

export async function sendClientCancellationEmail({ booking, service, reason }) {
  const emailSettings = await resolveEmailSettings();
  const { mode, transporter } = await createTransport();
  const template = renderClientCancellationTemplate({ booking, service, reason, emailSettings });

  const result = await sendEmail({
    transporter,
    mode,
    emailSettings,
    to: booking.email,
    subject: `${emailSettings.businessName} booking cancellation (${booking.bookingReference})`,
    template,
    logLabel: 'Client Cancellation Email'
  });

  return summarizeResults(mode, [{ type: 'client-cancellation', ...result }]);
}

export async function sendClientRescheduleEmail({ booking, service, previousDate, previousTime }) {
  const emailSettings = await resolveEmailSettings();
  const { mode, transporter } = await createTransport();
  const template = renderClientRescheduleTemplate({
    booking,
    service,
    previousDate,
    previousTime,
    emailSettings
  });

  const icsContent = createBookingIcsContent({ booking, service });
  const attachments = icsContent
    ? [{
      filename: `booking-${booking.bookingReference}-updated.ics`,
      content: icsContent,
      contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
    }]
    : [];

  const result = await sendEmail({
    transporter,
    mode,
    emailSettings,
    to: booking.email,
    subject: `${emailSettings.businessName} booking rescheduled (${booking.bookingReference})`,
    template,
    attachments,
    logLabel: 'Client Reschedule Email'
  });

  return summarizeResults(mode, [{ type: 'client-reschedule', ...result }]);
}

export async function sendOwnerBookingUpdateEmail({ booking, service, updateType, changeSummary }) {
  const emailSettings = await resolveEmailSettings();
  const { mode, transporter } = await createTransport();
  const ownerRecipients = getOwnerRecipients(emailSettings);
  const template = renderOwnerBookingUpdateTemplate({
    booking,
    service,
    updateType,
    changeSummary
  });

  const result = await sendEmail({
    transporter,
    mode,
    emailSettings,
    to: ownerRecipients,
    subject: `Booking update: ${updateType} (${booking.bookingReference})`,
    template,
    logLabel: 'Owner Booking Update Email'
  });

  return summarizeResults(mode, [{ type: 'owner-booking-update', ...result }]);
}

export async function sendClientReminderEmail({ booking, service, reminderType = '24h' }) {
  const emailSettings = await resolveEmailSettings();
  const { mode, transporter } = await createTransport();
  const template = renderClientReminderTemplate({ booking, service, reminderType, emailSettings });

  const result = await sendEmail({
    transporter,
    mode,
    emailSettings,
    to: booking.email,
    subject: `${emailSettings.businessName} appointment reminder (${booking.bookingReference})`,
    template,
    logLabel: 'Client Reminder Email'
  });

  return summarizeResults(mode, [{ type: `client-reminder-${reminderType}`, ...result }]);
}

// Backwards-compatible export name used by existing route handlers.
export async function sendBookingNotification({ booking, service, isFirstTimeClient = false }) {
  return sendBookingCreatedEmails({ booking, service, isFirstTimeClient });
}
