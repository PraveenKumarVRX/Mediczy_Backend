/**
 * Sends booking alerts to the care operations inbox so team users can assist patients.
 * Reuses existing SMTP identities (hello@, support@, noreply@, etc.) from email_configs,
 * email_settings, or environment variables — same pattern as marketing-leads / CRM email.
 */

import nodemailer from 'nodemailer';
import sharedPool from '../db/pgPool.js';

const DEFAULT_CARE_TEAM_EMAIL = 'care@mysmarthealth.in';
const DEFAULT_REPLY_TO = 'support@mediqzy.com';

const KNOWN_SYSTEM_SENDERS = [
  'hello@mysmarthealth.in',
  'support@mediqzy.com',
  'noreply@mediqzy.com',
  'donotreply@mediqzy.com',
  'support@mysmarthealth.in',
  'notification@mayden.in'
];

const SENDER_DISPLAY_NAMES = {
  'hello@mysmarthealth.in': 'Mediqzy Corporate Health',
  'support@mediqzy.com': 'Mediczy Support',
  'noreply@mediqzy.com': 'Mediqzy Notifications',
  'donotreply@mediqzy.com': 'Mediqzy Notifications',
  'support@mysmarthealth.in': 'SmartHealth Support',
  'notification@mayden.in': 'Mediqzy Notifications'
};

function getCareTeamEmail() {
  return (process.env.CARE_TEAM_EMAIL || DEFAULT_CARE_TEAM_EMAIL).trim().toLowerCase();
}

function getPreferredSenderEmails() {
  const override = (process.env.CARE_TEAM_SMTP_FROM || process.env.SMTP_FROM || '').trim().toLowerCase();
  if (override) return [override];
  return KNOWN_SYSTEM_SENDERS;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSmtpConfig({ source, host, port, secure, user, pass, fromEmail, fromName, replyTo }) {
  if (!host || !user || !pass) return null;
  const normalizedFrom = normalizeEmail(fromEmail || user);
  return {
    source,
    host,
    port: Number(port || 587),
    secure: secure === true || Number(port) === 465,
    user,
    pass,
    fromEmail: normalizedFrom,
    fromName: fromName || SENDER_DISPLAY_NAMES[normalizedFrom] || 'Mediqzy Bookings',
    replyTo: replyTo || DEFAULT_REPLY_TO
  };
}

async function getEmailConfigForAddress(email) {
  const target = normalizeEmail(email);
  if (!target) return null;

  try {
    const { rows } = await sharedPool.query(
      `SELECT host, port, secure, username, password, "fromEmail", "fromName", "replyTo"
       FROM email_configs
       WHERE "isActive" = true
         AND (
           LOWER(username) = $1
           OR LOWER("fromEmail") = $1
         )
       ORDER BY "isDefault" DESC, id ASC
       LIMIT 1`,
      [target]
    );

    const row = rows[0];
    if (!row?.username || !row?.password) return null;

    return buildSmtpConfig({
      source: `email_configs:${target}`,
      host: row.host,
      port: row.port,
      secure: row.secure,
      user: row.username,
      pass: row.password,
      fromEmail: row.fromEmail || row.username,
      fromName: row.fromName,
      replyTo: row.replyTo
    });
  } catch (error) {
    console.warn(`[CareTeam] email_configs lookup failed for ${target}:`, error.message);
    return null;
  }
}

async function getEmailSettingsForAddress(email) {
  const target = normalizeEmail(email);
  if (!target) return null;

  try {
    const { rows } = await sharedPool.query(
      `SELECT email, display_name, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password
       FROM email_settings
       WHERE deleted_at IS NULL
         AND is_active = true
         AND LOWER(email) = $1
       ORDER BY is_default DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT 1`,
      [target]
    );

    const row = rows[0];
    if (!row?.smtp_host || !row?.smtp_password) return null;

    return buildSmtpConfig({
      source: `email_settings:${target}`,
      host: row.smtp_host,
      port: row.smtp_port,
      secure: row.smtp_secure,
      user: row.smtp_username || row.email,
      pass: row.smtp_password,
      fromEmail: row.email,
      fromName: row.display_name
    });
  } catch (error) {
    console.warn(`[CareTeam] email_settings lookup failed for ${target}:`, error.message);
    return null;
  }
}

async function getDefaultEmailConfig() {
  try {
    const { rows } = await sharedPool.query(
      `SELECT host, port, secure, username, password, "fromEmail", "fromName", "replyTo"
       FROM email_configs
       WHERE "isActive" = true
       ORDER BY "isDefault" DESC, id ASC
       LIMIT 1`
    );

    const row = rows[0];
    if (!row?.username || !row?.password) return null;

    return buildSmtpConfig({
      source: 'email_configs:default',
      host: row.host,
      port: row.port,
      secure: row.secure,
      user: row.username,
      pass: row.password,
      fromEmail: row.fromEmail || row.username,
      fromName: row.fromName,
      replyTo: row.replyTo
    });
  } catch (error) {
    console.warn('[CareTeam] default email_configs lookup failed:', error.message);
    return null;
  }
}

function getEnvSmtpConfig() {
  const host = (process.env.SMTP_HOST || 'smtppro.zoho.in').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim();
  if (!user || !pass) return null;

  const port = Number(process.env.SMTP_PORT || 465);
  const fromEmail = normalizeEmail(process.env.SMTP_FROM || user);

  return buildSmtpConfig({
    source: 'environment',
    host,
    port,
    secure: port === 465,
    user,
    pass,
    fromEmail,
    fromName: process.env.EMAIL_FROM_NAME || SENDER_DISPLAY_NAMES[fromEmail] || 'Mediqzy Bookings'
  });
}

async function resolveSmtpConfigs() {
  const configs = [];
  const seen = new Set();

  const addConfig = (config) => {
    if (!config) return;
    const key = `${config.host}|${config.user}|${config.fromEmail}`;
    if (seen.has(key)) return;
    seen.add(key);
    configs.push(config);
  };

  for (const email of getPreferredSenderEmails()) {
    addConfig(await getEmailConfigForAddress(email));
    addConfig(await getEmailSettingsForAddress(email));
  }

  addConfig(await getDefaultEmailConfig());
  addConfig(getEnvSmtpConfig());

  return configs;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pick(source, ...keys) {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function formatSymptoms(value) {
  if (!value) return '—';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '—';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '—';
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).join(', ') || '—';
    } catch (_) {
      /* plain text */
    }
    return trimmed;
  }
  return String(value);
}

export function normalizeCareTeamBookingDetails(input = {}) {
  const appointment = input.appointment || input;
  const patient = input.patient || {};
  const doctor = input.doctor || {};

  const appointmentDate = pick(appointment, 'appointmentDate', 'appointment_date', 'date') || '—';
  const appointmentTime = pick(appointment, 'appointmentTime', 'appointment_time', 'time', 'timeSlot') || '—';

  return {
    appointmentId: pick(appointment, 'id', 'appointmentId', 'appointment_id'),
    patientName: pick(appointment, 'patientName', 'patient_name') || pick(patient, 'name', 'patientName') || '—',
    patientEmail: pick(appointment, 'patientEmail', 'patient_email') || pick(patient, 'email') || '—',
    patientPhone: pick(appointment, 'patientPhone', 'patient_phone', 'phoneNumber', 'phone') || pick(patient, 'phone', 'phoneNumber') || '—',
    doctorName: pick(appointment, 'doctorName', 'doctor_name') || pick(doctor, 'name', 'doctorName') || '—',
    doctorEmail: pick(appointment, 'doctorEmail', 'doctor_email') || pick(doctor, 'email') || '—',
    specialization: pick(appointment, 'specialization', 'specialty') || pick(doctor, 'specialization') || '—',
    appointmentDate,
    appointmentTime,
    consultationType: pick(appointment, 'consultationType', 'consultation_type', 'type') || '—',
    status: pick(appointment, 'status') || 'pending',
    paymentStatus: pick(appointment, 'paymentStatus', 'payment_status') || '—',
    symptoms: formatSymptoms(pick(appointment, 'symptoms', 'reason')),
    notes: pick(appointment, 'notes', 'reason') || '—',
    bookingSource: input.bookingSource || input.source || 'web'
  };
}

function buildBookingEmailHtml(details) {
  const rows = [
    ['Appointment ID', details.appointmentId ?? '—'],
    ['Patient', details.patientName],
    ['Patient email', details.patientEmail],
    ['Patient phone', details.patientPhone],
    ['Doctor', details.doctorName],
    ['Specialization', details.specialization],
    ['Date', details.appointmentDate],
    ['Time', details.appointmentTime],
    ['Consultation type', details.consultationType],
    ['Status', details.status],
    ['Payment status', details.paymentStatus],
    ['Symptoms / reason', details.symptoms],
    ['Notes', details.notes],
    ['Booking source', details.bookingSource]
  ];

  const tableRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;width:180px;">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;">${escapeHtml(value)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;max-width:640px;">
      <h2 style="margin:0 0 12px;color:#0B1120;">New appointment booking request</h2>
      <p style="margin:0 0 16px;color:#374151;">A patient has submitted a booking request. Please review and assist if needed.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${tableRows}</table>
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">Mediqzy care operations alert</p>
    </div>
  `;
}

function buildPlainText(details) {
  return [
    'New appointment booking request',
    '',
    `Appointment ID: ${details.appointmentId ?? '—'}`,
    `Patient: ${details.patientName}`,
    `Patient email: ${details.patientEmail}`,
    `Patient phone: ${details.patientPhone}`,
    `Doctor: ${details.doctorName}`,
    `Specialization: ${details.specialization}`,
    `Date: ${details.appointmentDate}`,
    `Time: ${details.appointmentTime}`,
    `Consultation type: ${details.consultationType}`,
    `Status: ${details.status}`,
    `Payment status: ${details.paymentStatus}`,
    `Symptoms / reason: ${details.symptoms}`,
    `Notes: ${details.notes}`,
    `Booking source: ${details.bookingSource}`
  ].join('\n');
}

async function sendWithSmtpConfig(config, mailOptions) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' }
  });

  await transporter.sendMail({
    ...mailOptions,
    from: `"${config.fromName}" <${config.fromEmail}>`,
    replyTo: mailOptions.replyTo || config.replyTo || DEFAULT_REPLY_TO,
    headers: {
      'X-Mediqzy-System': 'true',
      'X-Sender-Type': 'care-team-booking-alert',
      ...(mailOptions.headers || {})
    }
  });

  return config.source;
}

export async function sendCareTeamBookingAlert(input = {}) {
  const details = normalizeCareTeamBookingDetails(input);
  const to = getCareTeamEmail();
  const subject = `[Mediqzy] New booking — ${details.patientName} with ${details.doctorName} on ${details.appointmentDate} ${details.appointmentTime}`;
  const html = buildBookingEmailHtml(details);
  const text = buildPlainText(details);

  const smtpConfigs = await resolveSmtpConfigs();
  if (!smtpConfigs.length) {
    console.warn('[CareTeam] No SMTP configuration found (email_configs, email_settings, or env); skipping booking alert');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const mailOptions = { to, subject, text, html };
  let lastError = null;

  for (const config of smtpConfigs) {
    try {
      const source = await sendWithSmtpConfig(config, mailOptions);
      console.log(
        `[CareTeam] Booking alert sent to ${to} for appointment ${details.appointmentId ?? 'unknown'} via ${source} (${config.fromEmail})`
      );
      return { sent: true, to, from: config.fromEmail, source };
    } catch (error) {
      lastError = error;
      console.warn(`[CareTeam] Send failed via ${config.source} (${config.fromEmail}):`, error.message);
    }
  }

  throw lastError || new Error('All SMTP configurations failed');
}

/**
 * Fire-and-forget wrapper — never throws; safe to call from booking handlers.
 */
export function notifyCareTeamOfBooking(input = {}) {
  sendCareTeamBookingAlert(input).catch((err) => {
    console.error('[CareTeam] Failed to send booking alert:', err?.message || err);
  });
}

export default {
  notifyCareTeamOfBooking,
  sendCareTeamBookingAlert,
  normalizeCareTeamBookingDetails,
  resolveSmtpConfigs
};
