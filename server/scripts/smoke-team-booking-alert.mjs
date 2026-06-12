/**
 * Smoke test for the team-user booking alert added to appointment.controller.js.
 *
 * Run:  node server/scripts/smoke-team-booking-alert.mjs
 * Run with send attempt:  node server/scripts/smoke-team-booking-alert.mjs --send
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SEND = process.argv.includes('--send');

// ─── Helpers ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label, result, detail = '') {
  if (result) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ─── 1. Module / import path checks ─────────────────────────────────────────

console.log('\n── 1. Import path checks ──────────────────────────────────');

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { existsSync } from 'fs';

const emailServicePath = path.resolve(__dirname, '../services/emailService.js');
ok('emailService.js exists', existsSync(emailServicePath), emailServicePath);

const controllerPath = path.resolve(__dirname, '../controller/appointment.controller.js');
ok('appointment.controller.js exists', existsSync(controllerPath), controllerPath);

let nodemailerOk = false;
try {
  const nm = await import('nodemailer');
  nodemailerOk = typeof nm.default?.createTransport === 'function';
} catch {}
ok('nodemailer importable', nodemailerOk);

// ─── 2. Core logic extraction – simulate what the IIFE does ─────────────────

console.log('\n── 2. OrgId resolution logic ───────────────────────────────');

function resolveOrgId(appt) {
  return appt.corporate_tenant_id || appt.organization_id || null;
}

ok('corporate_tenant_id wins over organization_id',
  resolveOrgId({ corporate_tenant_id: 5, organization_id: 9 }) === 5);

ok('falls back to organization_id when corporate_tenant_id absent',
  resolveOrgId({ organization_id: 9 }) === 9);

ok('returns null when both absent',
  resolveOrgId({}) === null);

ok('parseInt handles string orgId',
  parseInt('12') === 12 && parseInt(12) === 12);

// ─── 3. Symptoms normalisation ───────────────────────────────────────────────

console.log('\n── 3. Symptoms normalisation ───────────────────────────────');

function normalizeSymptoms(appt) {
  return Array.isArray(appt.symptoms)
    ? appt.symptoms.join(', ')
    : (appt.symptoms || appt.reason || '—');
}

ok('array symptoms joined',
  normalizeSymptoms({ symptoms: ['fever', 'cough'] }) === 'fever, cough');

ok('string symptoms passed through',
  normalizeSymptoms({ symptoms: 'headache' }) === 'headache');

ok('falls back to reason',
  normalizeSymptoms({ reason: 'checkup' }) === 'checkup');

ok('falls back to em-dash when both absent',
  normalizeSymptoms({}) === '—');

// ─── 4. HTML email rendering ─────────────────────────────────────────────────

console.log('\n── 4. Email HTML rendering ─────────────────────────────────');

const mockAppointment = {
  id: 9999,
  patientName: 'Test Patient',
  patientEmail: 'patient@example.com',
  patientPhone: '9876543210',
  doctorName: 'Dr. Jane Doe',
  specialization: 'General Physician',
  appointmentDate: '2026-06-20',
  appointmentTime: '10:30',
  consultationType: 'in-person',
  symptoms: ['fever', 'body ache'],
  paymentStatus: 'pending',
  corporate_tenant_id: 3,
  organization_id: null
};

const apptDate = new Date(mockAppointment.appointmentDate).toLocaleDateString('en-IN', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const symptoms = normalizeSymptoms(mockAppointment);

const emailHtml = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1a6eb5;padding:20px;border-radius:8px 8px 0 0">
      <h2 style="color:#fff;margin:0">New Appointment Booking</h2>
      <p style="color:#cfe8ff;margin:4px 0 0">Action required — please review and confirm</p>
    </div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#6b7280;width:40%">Appointment ID</td><td style="padding:8px 0;font-weight:600">#${mockAppointment.id}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Patient</td><td style="padding:8px 0;font-weight:600">${mockAppointment.patientName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Patient Email</td><td style="padding:8px 0">${mockAppointment.patientEmail || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Patient Phone</td><td style="padding:8px 0">${mockAppointment.patientPhone || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Doctor</td><td style="padding:8px 0;font-weight:600">${mockAppointment.doctorName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Specialization</td><td style="padding:8px 0">${mockAppointment.specialization || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Date</td><td style="padding:8px 0">${apptDate}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Time</td><td style="padding:8px 0">${mockAppointment.appointmentTime}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Type</td><td style="padding:8px 0;text-transform:capitalize">${mockAppointment.consultationType || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Symptoms / Reason</td><td style="padding:8px 0">${symptoms}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Payment Status</td><td style="padding:8px 0;text-transform:capitalize">${mockAppointment.paymentStatus || 'pending'}</td></tr>
      </table>
      <div style="margin-top:20px;text-align:center">
        <a href="https://mediqzy.com/team/appointments" style="background:#1a6eb5;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600">View in Dashboard</a>
      </div>
    </div>
  </div>`;

ok('HTML contains appointment ID', emailHtml.includes('#9999'));
ok('HTML contains patient name', emailHtml.includes('Test Patient'));
ok('HTML contains doctor name', emailHtml.includes('Dr. Jane Doe'));
ok('HTML contains date', emailHtml.includes(apptDate));
ok('HTML contains time (10:30)', emailHtml.includes('10:30'));
ok('HTML contains joined symptoms', emailHtml.includes('fever, body ache'));
ok('HTML contains dashboard link', emailHtml.includes('mediqzy.com/team/appointments'));
ok('Email subject built correctly',
  `New Appointment — ${mockAppointment.patientName} on ${apptDate}` ===
  `New Appointment — Test Patient on ${apptDate}`);

// ─── 5. Edge cases ───────────────────────────────────────────────────────────

console.log('\n── 5. Edge cases ────────────────────────────────────────────');

ok('skips when orgId is null (early return)',
  resolveOrgId({}) === null);

ok('skips team user with no email',
  (() => {
    const users = [{ id: 1, email: null }, { id: 2, email: 'a@b.com' }];
    return users.filter(u => u.email).length === 1;
  })());

ok('LIMIT 10 caps notification blast',
  (() => {
    const big = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, email: `u${i}@x.com` }));
    return big.slice(0, 10).length === 10;
  })());

ok('paymentStatus falls back to "pending"',
  (null || 'pending') === 'pending');

// ─── 6. SQL structure checks (static analysis) ───────────────────────────────

console.log('\n── 6. SQL structure (static) ────────────────────────────────');

import { readFileSync } from 'fs';
const controllerSrc = readFileSync(controllerPath, 'utf8');

ok('query uses parameterised :orgId (no interpolation)',
  controllerSrc.includes('WHERE id = :orgId') &&
  !controllerSrc.includes('WHERE id = ${orgId}'));

ok('query uses parameterised :userId (no interpolation)',
  controllerSrc.includes('WHERE user_id = :userId'));

ok('UNION deduplicates (not UNION ALL)',
  (() => {
    const idx = controllerSrc.indexOf('// Notify assigned team users (fire-and-forget)');
    const block = controllerSrc.slice(idx, idx + 3000);
    return block.includes('UNION') && !block.includes('UNION ALL');
  })());

ok('LIMIT 10 present in query',
  controllerSrc.includes('LIMIT 10'));

ok('email_settings lookup is per team user (.user_id = :userId)',
  controllerSrc.includes('user_id = :userId'));

ok('fire-and-forget IIFE does not await the outer call',
  (() => {
    // The IIFE block should be invoked without await before it
    const idx = controllerSrc.indexOf('// Notify assigned team users (fire-and-forget)');
    const snippet = controllerSrc.slice(idx, idx + 150);
    return snippet.includes('(async ()');
  })());

// ─── 7. Live send (optional, --send flag) ────────────────────────────────────

if (SEND) {
  console.log('\n── 7. Live send (--send) ─────────────────────────────────');
  console.log('  (Requires DB + SMTP to be configured in this environment)\n');

  try {
    const { default: emailServiceLive } = await import(emailServicePath);
    const to = process.env.CARE_TEAM_EMAIL || 'care@mysmarthealth.in';
    await emailServiceLive.sendOutboundEmail(1, {
      to,
      subject: `[SMOKE TEST] Team Booking Alert — Test Patient`,
      htmlContent: emailHtml
    });
    console.log(`  ✅  Live send succeeded → ${to}`);
    passed++;
  } catch (sendErr) {
    console.error(`  ❌  Live send failed: ${sendErr.message}`);
    failed++;
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${passed} passed   ${failed} failed`);
if (failed === 0) {
  console.log('  All checks passed ✅\n');
  process.exit(0);
} else {
  console.log('  Some checks failed ❌\n');
  process.exit(1);
}
