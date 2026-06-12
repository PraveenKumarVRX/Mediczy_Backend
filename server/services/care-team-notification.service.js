/**
 * Sends booking alerts to the care operations inbox so team users can assist patients.
 */

import nodemailer from 'nodemailer';

const DEFAULT_CARE_TEAM_EMAIL = 'care@mysmarthealth.in';

let _transporter = null;

function getCareTeamEmail() {
  return (process.env.CARE_TEAM_EMAIL || DEFAULT_CARE_TEAM_EMAIL).trim();
}

function getTransporter() {
  if (_transporter) return _transporter;

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = port === 465;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtppro.zoho.in',
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false }
  });

  return _transporter;
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

export async function sendCareTeamBookingAlert(input = {}) {
  const details = normalizeCareTeamBookingDetails(input);
  const to = getCareTeamEmail();

  if (!process.env.SMTP_USER || !(process.env.SMTP_PASSWORD || process.env.SMTP_PASS)) {
    console.warn('[CareTeam] SMTP not configured; skipping booking alert email');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const subject = `[Mediqzy] New booking — ${details.patientName} with ${details.doctorName} on ${details.appointmentDate} ${details.appointmentTime}`;
  const html = buildBookingEmailHtml(details);
  const text = buildPlainText(details);

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Mediqzy Bookings" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });

  console.log(`[CareTeam] Booking alert sent to ${to} for appointment ${details.appointmentId ?? 'unknown'}`);
  return { sent: true, to };
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
  normalizeCareTeamBookingDetails
};
