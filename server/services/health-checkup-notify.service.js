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

const smsService = new SMSService();

const obj = (v) => { if (!v) return {}; if (typeof v === 'object' && !Array.isArray(v)) return v; try { const x = JSON.parse(v); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// Per-kind copy. `line` is the one-sentence status statement; `subject` prefixes the reference.
const COPY = {
  confirmed:   { subject: 'confirmed',   line: 'is confirmed',             closing: 'Please arrive 10 minutes early and carry a valid photo ID.' },
  rescheduled: { subject: 'rescheduled', line: 'has been rescheduled',     closing: 'Please arrive 10 minutes early and carry a valid photo ID.' },
  cancelled:   { subject: 'cancelled',   line: 'has been cancelled',       closing: 'If this was a mistake you can book again from your Benefits page.' },
  reminder:    { subject: 'reminder',    line: 'is scheduled for tomorrow', closing: 'Please arrive 10 minutes early and carry a valid photo ID.' },
};

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

async function sendToRecipient({ name, email, phone }, booking, kind) {
  const { copy, packageName, date, location } = render(booking, kind);
  const jobs = [];
  let smsSent = false;

  if (email) {
    const html = `<p>Dear ${escapeHtml(name || 'Member')},</p>` +
      `<p>Your <strong>${escapeHtml(packageName)}</strong> health checkup ${copy.line}.</p>` +
      `<p><strong>Centre:</strong> ${escapeHtml(location)}<br>` +
      `<strong>Date:</strong> ${escapeHtml(date)}<br>` +
      `<strong>Time:</strong> ${escapeHtml(booking.timeSlot)}<br>` +
      `<strong>Reference:</strong> ${escapeHtml(booking.bookingReference)}</p>` +
      `<p>${escapeHtml(copy.closing)}</p>`;
    jobs.push(emailServiceModule.sendOutboundEmail(1, {
      to: email,
      subject: `Health checkup booking ${copy.subject} — ${booking.bookingReference}`,
      htmlContent: html,
    }).catch((error) => ({ channel: 'email', error: error.message })));
  }

  const phoneE164 = normalisePhone(phone);
  if (phoneE164 && whatsappProductionService?.configured) {
    if (kind === 'reminder') {
      jobs.push(whatsappProductionService.sendAppointmentReminder({ to: phoneE164, patientName: name || 'Member', doctorName: location || 'the diagnostic centre', time: booking.timeSlot, location }).catch((error) => ({ channel: 'whatsapp', error: error.message })));
    } else {
      jobs.push(whatsappProductionService.sendAppointmentConfirmation({ to: phoneE164, patientName: name || 'Member', date, time: booking.timeSlot, location, isHealthCheckup: true }).catch((error) => ({ channel: 'whatsapp', error: error.message })));
    }
  } else if (phoneE164) {
    // SMS fallback when WhatsApp is not configured — self-guards (returns {success:false}) if no SMS provider.
    const smsText = `Mediczy: Your ${packageName} health checkup ${copy.line} on ${date} at ${booking.timeSlot}, ${location || 'the diagnostic centre'}. Ref ${booking.bookingReference}.`;
    jobs.push(smsService.sendSMS({ to: phoneE164, message: smsText }).catch((error) => ({ channel: 'sms', error: error.message })));
    smsSent = true;
  }

  const results = await Promise.all(jobs);
  return { attempted: jobs.length, failed: results.filter((r) => r?.error || r?.success === false).length, smsSent };
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

  // Booking employee — for non-self bookings, always keep the employee in the loop on their own contacts.
  if (booking.relation && booking.relation !== 'self' && booking.userId) {
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

  return summary;
}

export default { notifyBooking };
