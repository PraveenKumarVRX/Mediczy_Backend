/**
 * Health checkup booking notifier (shared by the member route and the reminder cron).
 *
 * notifyBooking(row, kind) — best-effort, multi-channel dispatch for one booking row.
 *   kind ∈ 'confirmed' | 'rescheduled' | 'cancelled' | 'reminder'
 *
 * Channels, in order of what each recipient can receive:
 *   - email      → the beneficiary's email (always, when present)
 *   - WhatsApp   → the beneficiary's phone (when the WhatsApp provider is configured)
 *   - SMS        → the beneficiary's phone (fallback; self-guards if no SMS provider)
 *   - employee   → for non-self beneficiary bookings, the booking employee is also notified
 *                  on their own email/phone (resolved from the users row).
 *
 * Every send is wrapped so a provider outage never fails the booking that triggered it.
 */

import emailServiceModule from './emailService.js';
import whatsappProductionService from './whatsapp-production.service.js';
import { SMSService } from './sms.service.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { recordAutomatedSend } from './team-sent-folder.service.js';

// SMSService requires a config; `new SMSService()` would throw on first use ("reading 'provider'").
// Build the same config queue-notify uses, and leave it null (fallback skips) when SMS is unconfigured.
const smsConfig = {
  provider: process.env.SMS_PROVIDER || 'twilio',
  apiKey: process.env.SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID,
  apiSecret: process.env.SMS_API_SECRET || process.env.TWILIO_AUTH_TOKEN,
  smsFrom: process.env.TWILIO_SMS_NUMBER || null,
  messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_SMS_MESSAGING_SERVICE_SID || null,
  senderId: process.env.SMS_SENDER_ID || process.env.TWILIO_SMS_NUMBER || null,
  allowDiscover: String(process.env.TWILIO_SMS_AUTO_DISCOVER ?? 'true').toLowerCase() !== 'false',
};
const smsService = (smsConfig.apiKey && smsConfig.apiSecret) ? new SMSService(smsConfig) : null;

const obj = (v) => { if (!v) return {}; if (typeof v === 'object' && !Array.isArray(v)) return v; try { const x = JSON.parse(v); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// Per-kind copy. `line` is the one-sentence status statement; `subject` prefixes the reference.
const COPY = {
  submitted:   { subject: 'submitted',   line: 'has been submitted and is awaiting confirmation', closing: 'We will notify you as soon as it is confirmed.' },
  confirmed:   { subject: 'confirmed',   line: 'is confirmed',             closing: 'Please arrive 10 minutes early and carry a valid photo ID. You can view the checkup instructions in the app.' },
  approved:    { subject: 'confirmed',   line: 'is confirmed',             closing: 'Please arrive 10 minutes early and carry a valid photo ID. You can view the checkup instructions in the app.' },
  rescheduled: { subject: 'rescheduled', line: 'has been rescheduled',     closing: 'Please arrive 10 minutes early and carry a valid photo ID.' },
  cancelled:   { subject: 'cancelled',   line: 'has been cancelled',       closing: 'If this was a mistake you can book again from your Benefits page.' },
  completed:   { subject: 'completed',   line: 'is marked completed',      closing: 'Your reports will be shared here as soon as they are ready.' },
  reports_available: { subject: 'reports ready', line: 'reports are now available', closing: 'You can download and share your report from the app.' },
  reminder:    { subject: 'reminder',    line: 'is scheduled for tomorrow', closing: 'Please arrive 10 minutes early and carry a valid photo ID.' },
};
const CONFIRMATION_KINDS = new Set(['confirmed', 'approved']);
// Wellness-team inbox that should hear about every new booking awaiting confirmation.
const TEAM_NOTIFY_EMAIL = process.env.CORPORATE_CARE_EMAIL || 'care@mysmarthealth.in';

const normalisePhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('91') ? `+${digits}` : `+91${digits}`;
};

function render(booking, kind) {
  const copy = COPY[kind] || COPY.confirmed;
  const packageName = booking.package?.name || 'Health checkup';
  const lab = booking.lab || {};
  const date = (() => { try { return new Date(`${booking.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return String(booking.date || ''); } })();
  const location = [lab.name, typeof lab.address === 'string' ? lab.address : Object.values(lab.address || {}).filter(Boolean).join(', ')].filter(Boolean).join(' — ');
  return { copy, packageName, date, location };
}

/** Light mapping of a raw health_checkup_bookings row to the fields the notifier needs. */
function mapRow(row) {
  return {
    bookingReference: row.booking_reference,
    userId: row.user_id,
    relation: row.beneficiary_relation || 'self',
    date: row.appointment_date,
    timeSlot: row.time_slot,
    package: { name: row.package_name, ...obj(row.package_snapshot) },
    lab: { ...obj(row.lab_snapshot) },
    patient: obj(row.patient_details),
  };
}

const PATIENT_APP_URL = process.env.PATIENT_APP_URL || 'https://app.mediqzy.com';
const ok = (r) => !(r && r.success === false); // provider helpers return {success:false} when self-disabled

/**
 * Send the right WhatsApp message for a lifecycle kind. Each path uses the proper
 * provider template method, so once the matching GUPSHUP_TEMPLATE_* id is configured
 * these deliver cold; without it the provider throws and we fall back to SMS.
 *   confirmed/approved → sendAppointmentConfirmation (GUPSHUP_TEMPLATE_HEALTH_CHECKUP)
 *   reports_available  → sendHealthReportReady       (GUPSHUP_TEMPLATE_HEALTH_REPORT)
 *   reminder           → sendAppointmentReminder     (GUPSHUP_TEMPLATE_APPOINTMENT_REMINDER)
 *   submitted/completed→ session message (delivers inside the 24h window; else falls back to SMS)
 */
function sendWhatsappForKind(kind, { to, name, date, time, location, plainText }) {
  const patientName = name || 'Member';
  if (kind === 'reminder') return whatsappProductionService.sendHealthCheckupReminder({ to, patientName, date, time, location });
  if (CONFIRMATION_KINDS.has(kind)) return whatsappProductionService.sendAppointmentConfirmation({ to, patientName, date, time, location, isHealthCheckup: true });
  if (kind === 'reports_available') return whatsappProductionService.sendHealthReportReady({ to, patientName, reportUrl: PATIENT_APP_URL });
  if (typeof whatsappProductionService.sendSessionMessage === 'function') return whatsappProductionService.sendSessionMessage({ to, body: `Dear ${patientName},\n${plainText}` });
  return Promise.reject(new Error('no WhatsApp method for kind'));
}

async function sendToRecipient({ name, email, phone }, booking, kind) {
  const { copy, packageName, date, location } = render(booking, kind);
  let attempted = 0, failed = 0, smsSent = false;

  // Email — always, when present.
  if (email) {
    attempted += 1;
    const html = `<p>Dear ${escapeHtml(name || 'Member')},</p>` +
      `<p>Your <strong>${escapeHtml(packageName)}</strong> health checkup ${copy.line}.</p>` +
      `<p><strong>Centre:</strong> ${escapeHtml(location)}<br>` +
      `<strong>Date:</strong> ${escapeHtml(date)}<br>` +
      `<strong>Time:</strong> ${escapeHtml(booking.timeSlot)}<br>` +
      `<strong>Reference:</strong> ${escapeHtml(booking.bookingReference)}</p>` +
      `<p>${escapeHtml(copy.closing)}</p>`;
    try {
      const subject = `Health checkup booking ${copy.subject} — ${booking.bookingReference}`;
      const sent = await emailServiceModule.sendOutboundEmail(1, { to: email, subject, htmlContent: html });
      await recordAutomatedSend({ to: email, subject, htmlBody: html, messageId: sent?.messageId || null, labels: ['sent', 'health-checkup', kind] });
    } catch (error) { failed += 1; console.error('[health-checkups] email send failed', error.message); }
  }

  // Phone — try WhatsApp (kind-appropriate template/session), then fall back to SMS so a
  // missing template or closed session window never leaves the member with no mobile notice.
  const phoneE164 = normalisePhone(phone);
  if (phoneE164) {
    attempted += 1;
    const plainText = `My SmartHealth: Your ${packageName} health checkup ${copy.line} on ${date} at ${booking.timeSlot}, ${location || 'the diagnostic centre'}. Ref ${booking.bookingReference}. ${copy.closing}`.trim();
    let delivered = false;
    if (whatsappProductionService?.configured) {
      try { delivered = ok(await sendWhatsappForKind(kind, { to: phoneE164, name, date, time: booking.timeSlot, location, plainText })); }
      catch (error) { console.error(`[health-checkups] WhatsApp (${kind}) failed, falling back to SMS:`, error.message); }
    }
    if (!delivered && smsService) {
      // SMS fallback — only when SMS is actually configured.
      try { smsSent = ok(await smsService.sendSMS({ to: phoneE164, message: plainText })); delivered = smsSent; }
      catch (error) { console.error('[health-checkups] SMS fallback failed', error.message); }
    }
    if (!delivered) failed += 1;
  }

  return { attempted, failed, smsSent };
}

/**
 * Notify everyone who should hear about a booking state change.
 * Accepts a raw DB row; returns a small summary (best-effort, never throws for provider issues).
 */
export async function notifyBooking(row, kind = 'confirmed') {
  if (!row) return { attempted: 0, failed: 0 };
  const booking = mapRow(row);
  const patient = booking.patient || {};

  // Beneficiary (the person being checked).
  const summary = await sendToRecipient({ name: patient.name, email: patient.email, phone: patient.phone }, booking, kind);

  // Booking employee — always keep the employee in the loop on their own account contacts (their
  // profile email/phone may differ from, or be richer than, the beneficiary details on the booking).
  // Deduped below so a self-booking with identical contacts is not notified twice.
  if (booking.userId) {
    try {
      const [emp] = await postgresSequelize.query(
        `SELECT "firstName","lastName",email,"phoneNumber" FROM users WHERE id=:userId LIMIT 1`,
        { replacements: { userId: booking.userId }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (emp && (emp.email || emp.phoneNumber)) {
        const empName = [emp.firstName, emp.lastName].filter(Boolean).join(' ') || 'Member';
        // Skip if the employee's own contacts are identical to the beneficiary's (avoid duplicates).
        const sameEmail = emp.email && patient.email && emp.email.toLowerCase() === String(patient.email).toLowerCase();
        const samePhone = emp.phoneNumber && patient.phone && normalisePhone(emp.phoneNumber) === normalisePhone(patient.phone);
        if (!(sameEmail && samePhone)) {
          const empSummary = await sendToRecipient({ name: empName, email: sameEmail ? null : emp.email, phone: samePhone ? null : emp.phoneNumber }, booking, kind);
          summary.attempted += empSummary.attempted;
          summary.failed += empSummary.failed;
        }
      }
    } catch (error) {
      console.error('[health-checkups] employee notification lookup failed', error.message);
    }
  }

  // A new booking awaiting confirmation also goes to the wellness-team inbox.
  if (kind === 'submitted' && TEAM_NOTIFY_EMAIL) {
    try {
      const { date, location } = render(booking, kind);
      const html = `<p>A new health checkup booking is awaiting confirmation.</p>` +
        `<p><strong>Employee:</strong> ${escapeHtml(patient.name || 'Employee')}<br>` +
        `<strong>Package:</strong> ${escapeHtml(booking.package?.name || 'Health checkup')}<br>` +
        `<strong>Centre:</strong> ${escapeHtml(location)}<br>` +
        `<strong>Date:</strong> ${escapeHtml(date)} at ${escapeHtml(booking.timeSlot)}<br>` +
        `<strong>Reference:</strong> ${escapeHtml(booking.bookingReference)}</p>` +
        `<p>Open the Team portal → Corporate Health Booking → <strong>Approvals</strong> to confirm or reject it.</p>`;
      await emailServiceModule.sendOutboundEmail(1, {
        to: TEAM_NOTIFY_EMAIL,
        subject: `New health checkup awaiting confirmation — ${booking.bookingReference}`,
        htmlContent: html,
      });
      summary.attempted += 1;
    } catch (error) {
      console.error('[health-checkups] team notification failed', error.message);
      summary.failed += 1;
    }
  }

  return summary;
}

export default { notifyBooking };
