#!/usr/bin/env node
/**
 * Records a Mediqzy Hospital OS demo: walk-in → OPD → admission → inpatient care → discharge.
 * Uses Playwright video capture with mocked API responses for a smooth demo on any environment.
 *
 * Usage:
 *   node scripts/demo/record-hospital-os-patient-flow.mjs
 *   BASE_URL=https://mediqzy.com node scripts/demo/record-hospital-os-patient-flow.mjs
 */

import { chromium } from '@playwright/test';
import { mkdir, readdir, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:9443';
const DEMO_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXJlY29yZGluZyIsImV4cCI6NDEwMjQ0NDgwMH0.recording';
const OUTPUT_DIR = process.env.DEMO_OUTPUT_DIR || '/opt/cursor/artifacts/hospital-os-demo';
const SLOW_MO = Number(process.env.DEMO_SLOW_MO || 350);

const DEMO = {
  firstName: 'Priya',
  lastName: 'Singh',
  phone: '9876543211',
  complaint: 'Abdominal pain and fever',
  token: 'A-047',
  uhid: 'UHID-DEMO-2847',
  patientId: '2',
  admissionId: '1042',
};

async function pause(page, ms = 1200) {
  await page.waitForTimeout(ms);
}

async function showTitleCard(page, title, subtitle) {
  await page.evaluate(({ title, subtitle }) => {
    const existing = document.getElementById('demo-title-card');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'demo-title-card';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:linear-gradient(135deg,#0f766e 0%,#134e4a 50%,#0c4a6e 100%)',
      'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
      'color:white', 'font-family:system-ui,-apple-system,sans-serif', 'text-align:center', 'padding:2rem',
    ].join(';');
    overlay.innerHTML = `
      <div style="font-size:0.9rem;letter-spacing:0.2em;text-transform:uppercase;opacity:0.75;margin-bottom:1rem">Mediqzy Hospital OS</div>
      <h1 style="font-size:clamp(2rem,4vw,3.5rem);margin:0;font-weight:800">${title}</h1>
      <p style="font-size:clamp(1rem,2vw,1.5rem);opacity:0.85;margin-top:1rem;max-width:40rem">${subtitle}</p>
    `;
    document.body.appendChild(overlay);
  }, { title, subtitle });
  await pause(page, 2800);
  await page.evaluate(() => document.getElementById('demo-title-card')?.remove());
}

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function setupAuthBypass(page) {
  await page.addInitScript((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('userType', 'user');
  }, DEMO_JWT);
}

async function setupApiMocks(page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/users/profile')) {
      return route.fulfill(json({
        id: 1,
        firstName: DEMO.firstName,
        lastName: DEMO.lastName,
        email: 'demo@mediqzy.com',
      }));
    }

    if (url.includes('/api/display/kiosk/register') && method === 'POST') {
      return route.fulfill(json({
        success: true,
        live: false,
        uhid: DEMO.uhid,
        token: { tokenNumber: DEMO.token },
        entry: {
          tokenNumber: DEMO.token,
          patientName: `${DEMO.firstName} ${DEMO.lastName}`,
          estimatedWaitMinutes: 18,
        },
      }));
    }

    if (url.includes('/api/display/checkin/appointments')) {
      return route.fulfill(json({ success: true, live: false, appointments: [] }));
    }

    if ((url.includes('/hospital/login') || url.includes('/hospital/auth/login')) && method === 'POST') {
      return route.fulfill(json({
        success: true,
        token: DEMO_JWT,
        refreshToken: DEMO_JWT,
        hospital: {
          id: 'demo-hospital-1',
          name: 'Mediqzy Demo Hospital',
          role: 'admin',
        },
      }));
    }

    if (url.includes('/api/hospital/practice') || url.includes('/api/hospital/appointments')) {
      return route.fulfill(json({
        success: true,
        data: {
          patients: [],
          staff: [],
          resources: [],
          appointments: [],
        },
      }));
    }

    if (url.includes('/api/v1/beds/map')) {
      return route.fulfill(json({
        success: true,
        data: [
          { id: 1, bed_number: 'ICU-01', bed_type: 'ICU', status: 'available', ward_id: 1, ward_name: 'ICU', ward_type: 'critical', floor: 3 },
          { id: 2, bed_number: 'ICU-05', bed_type: 'ICU', status: 'occupied', ward_id: 1, ward_name: 'ICU', ward_type: 'critical', floor: 3, admission_id: 1041, patient_id: 1, patient_status: 'stable', admission_number: 'IP-2026-1041' },
          { id: 3, bed_number: 'GEN-12', bed_type: 'General', status: 'occupied', ward_id: 2, ward_name: 'General Ward A', ward_type: 'general', floor: 2, admission_id: Number(DEMO.admissionId), patient_id: Number(DEMO.patientId), patient_status: 'improving', admission_number: `IP-2026-${DEMO.admissionId}`, expected_discharge: new Date(Date.now() + 86400000).toISOString() },
          { id: 4, bed_number: 'GEN-14', bed_type: 'General', status: 'available', ward_id: 2, ward_name: 'General Ward A', ward_type: 'general', floor: 2 },
          { id: 5, bed_number: 'ORTHO-08', bed_type: 'Private', status: 'occupied', ward_id: 3, ward_name: 'Orthopedics', ward_type: 'surgical', floor: 4, admission_id: 1038, patient_id: 4, patient_status: 'post-op' },
        ],
      }));
    }

    if (url.includes('/api/v1/beds/census')) {
      return route.fulfill(json({
        success: true,
        data: [
          { ward_id: 1, ward_name: 'ICU', ward_type: 'critical', capacity: 12, available: 4, occupied: 8, occupancy_pct: 67 },
          { ward_id: 2, ward_name: 'General Ward A', ward_type: 'general', capacity: 24, available: 9, occupied: 15, occupancy_pct: 63 },
          { ward_id: 3, ward_name: 'Orthopedics', ward_type: 'surgical', capacity: 16, available: 6, occupied: 10, occupancy_pct: 63 },
        ],
      }));
    }

    if (url.includes('/api/v1/vitals/alerts')) {
      return route.fulfill(json({
        success: true,
        data: [
          { id: 1, alert_type: 'NEWS2', severity: 'high', news2_score: 7, alert_message: 'Elevated respiratory rate', triggered_at: new Date().toISOString(), bed_number: 'ICU-05', ward_name: 'ICU', admission_number: 'IP-2026-1041' },
        ],
      }));
    }

    if (url.includes('/api/v1/emar/due')) {
      return route.fulfill(json({
        success: true,
        data: [
          { schedule_id: 1, drug_name: 'Paracetamol', dose: '500mg', route: 'PO', scheduled_time: new Date().toISOString(), is_overdue: false, patient_id: Number(DEMO.patientId), admission_id: Number(DEMO.admissionId) },
          { schedule_id: 2, drug_name: 'Ceftriaxone', dose: '1g', route: 'IV', scheduled_time: new Date(Date.now() - 900000).toISOString(), is_overdue: true, patient_id: 1, admission_id: 1041 },
        ],
      }));
    }

    if (url.includes('/api/v1/analytics/command-center')) {
      return route.fulfill(json({
        success: true,
        data: {
          bedOccupancyPct: 72,
          activeAdmissions: 33,
          todayOTCases: 6,
          criticalAlerts: 2,
          pendingDischarges: 4,
          preAuthsPending: 3,
        },
      }));
    }

    if (url.includes('/api/v1/analytics/operational')) {
      return route.fulfill(json({
        success: true,
        data: [
          { name: 'Bed Turnover', value: '4.2 days', target: '< 5 days', status: 'on-track' },
          { name: 'ER Wait Time', value: '22 min', target: '< 30 min', status: 'on-track' },
          { name: 'Discharge Before Noon', value: '68%', target: '> 75%', status: 'needs-attention' },
        ],
      }));
    }

    if (url.includes('/api/v1/analytics/clinical')) {
      return route.fulfill(json({
        success: true,
        data: [
          { label: 'eMAR Compliance', value: 94 },
          { label: 'Vitals Documented', value: 88 },
          { label: 'Care Plans Signed', value: 91 },
        ],
      }));
    }

    if (url.includes('/api/v1/analytics/quality')) {
      return route.fulfill(json({
        success: true,
        data: [
          { label: 'HAI Rate', value: '0.8%', trend: 'down', good: 'down' },
          { label: '30-day Readmission', value: '6.1%', trend: 'flat', good: 'down' },
        ],
      }));
    }

    if (url.includes('/clinical-workspace/patient/')) {
      return route.fulfill(json({
        success: true,
        data: {
          name: `${DEMO.firstName} ${DEMO.lastName}`,
          age: 32,
          bed: 'GEN-12',
          ward: 'General Ward A',
          diagnosis: 'Acute appendicitis — post laparoscopic appendectomy',
          allergies: ['Penicillin'],
          admittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          admissionId: Number(DEMO.admissionId),
        },
      }));
    }

    if (url.includes('/vitals/') && url.includes('/latest')) {
      return route.fulfill(json({
        success: true,
        data: [
          { label: 'Temperature', value: '37.1', unit: '°C' },
          { label: 'Pulse', value: '78', unit: 'bpm' },
          { label: 'BP', value: '118/76', unit: 'mmHg' },
          { label: 'SpO₂', value: '98', unit: '%' },
        ],
      }));
    }

    if (url.includes('/emar/orders/')) {
      return route.fulfill(json({
        success: true,
        data: [
          { orderId: 1, drugName: 'Paracetamol', dose: '500mg', route: 'PO', frequency: 'Q6H', status: 'active' },
          { orderId: 2, drugName: 'Ceftriaxone', dose: '1g', route: 'IV', frequency: 'OD', status: 'active' },
        ],
      }));
    }

    if (url.includes('/lab-rules/alerts/')) {
      return route.fulfill(json({ success: true, data: [] }));
    }

    if (url.includes('/api/v1/adt/admissions') && method === 'GET') {
      return route.fulfill(json({
        success: true,
        data: [
          {
            id: Number(DEMO.admissionId),
            patientName: `${DEMO.firstName} ${DEMO.lastName}`,
            ward: 'General Ward A',
            bed: 'GEN-12',
            admittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
            checklist: {
              clinical: true,
              nursing_education: true,
              medication_reconciliation: true,
              billing: true,
              tpa: true,
              discharge_summary: true,
            },
          },
          {
            id: 1041,
            patientName: 'Rajesh Kumar',
            ward: 'ICU',
            bed: 'ICU-05',
            admittedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
            checklist: {
              clinical: true,
              nursing_education: true,
              medication_reconciliation: true,
              billing: false,
              tpa: true,
              discharge_summary: false,
            },
          },
        ],
      }));
    }

    if (url.includes('/adt/discharge/readiness') || url.includes('/discharge/readiness')) {
      return route.fulfill(json({
        success: true,
        data: {
          checks: [
            { key: 'clinical', label: 'Clinical clearance', met: true },
            { key: 'nursing_education', label: 'Nursing education complete', met: true },
            { key: 'medication_reconciliation', label: 'Medication reconciliation', met: true },
            { key: 'billing', label: 'Billing cleared', met: true },
            { key: 'discharge_summary', label: 'Discharge summary drafted', met: true },
          ],
        },
      }));
    }

    if (url.includes('/api/v1/discharge/draft')) {
      if (method === 'GET') {
        return route.fulfill(json({
          success: true,
          data: {
            id: 501,
            admission_id: Number(DEMO.admissionId),
            status: 'draft',
            content: `DISCHARGE SUMMARY\n\nPatient: ${DEMO.firstName} ${DEMO.lastName}\nDiagnosis: Acute appendicitis\nProcedure: Laparoscopic appendectomy\n\nCondition on discharge: Stable, ambulatory\nFollow-up: Surgical OPD in 7 days\nMedications: Paracetamol 500mg TDS x 5 days`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }));
      }
      if (method === 'POST') {
        return route.fulfill(json({
          success: true,
          data: {
            id: 501,
            admission_id: Number(DEMO.admissionId),
            status: 'draft',
            content: `DISCHARGE SUMMARY\n\nPatient: ${DEMO.firstName} ${DEMO.lastName}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }));
      }
    }

    if (url.includes('/api/v1/adt/discharge') && method === 'POST') {
      return route.fulfill(json({ success: true, message: 'Discharge initiated' }));
    }

    if (url.includes('/api/v1/discharge/sign')) {
      return route.fulfill(json({
        success: true,
        data: { id: 501, admission_id: Number(DEMO.admissionId), status: 'signed', content: 'Signed discharge summary' },
      }));
    }

    if (url.includes('/api/v1/discharge/packet/send')) {
      return route.fulfill(json({
        success: true,
        data: { id: 501, admission_id: Number(DEMO.admissionId), status: 'sent', content: 'Sent to patient' },
      }));
    }

    if (url.includes('/api/display/queue') || url.includes('/api/display/opd')) {
      return route.fulfill(json({
        success: true,
        live: false,
        nowServing: DEMO.token,
        waiting: [
          { token_number: 'A-048', patient_name: 'Amit Verma', doctor_name: 'Dr. Mehta', status: 'waiting' },
          { token_number: 'A-049', patient_name: 'Neha Gupta', doctor_name: 'Dr. Joshi', status: 'waiting' },
        ],
        recentlyCalled: [
          { token_number: DEMO.token, patient_name: `${DEMO.firstName} ${DEMO.lastName}`, doctor_name: 'Dr. Patel', status: 'called' },
        ],
      }));
    }

    // Allow other requests to continue (static assets, etc. are not under /api/)
    return route.continue();
  });
}

async function setHospitalSession(page) {
  await page.evaluate((token) => {
    localStorage.setItem('hospitalToken', token);
    localStorage.setItem('hospitalData', JSON.stringify({
      id: 'demo-hospital-1',
      hospitalId: 'demo-hospital-1',
      name: 'Mediqzy Demo Hospital',
      role: 'admin',
    }));
  }, DEMO_JWT);
}

async function injectHospitalSession(page) {
  await page.addInitScript((token) => {
    localStorage.setItem('hospitalToken', token);
    localStorage.setItem('hospitalData', JSON.stringify({
      id: 'demo-hospital-1',
      hospitalId: 'demo-hospital-1',
      name: 'Mediqzy Demo Hospital',
      role: 'admin',
    }));
  }, DEMO_JWT);
}

async function phaseWalkIn(page) {
  await showTitleCard(page, '1 · Walk-in Registration', 'Paperless kiosk check-in for new patients');
  await page.goto(`${BASE_URL}/kiosk/checkin`, { waitUntil: 'networkidle' });
  await pause(page, 2000);

  const touchStart = page.getByText('Touch to Start');
  const paperless = page.getByText(/Paperless check-in/i);
  if (await touchStart.isVisible({ timeout: 5000 }).catch(() => false)) {
    await touchStart.click();
  } else if (await paperless.isVisible().catch(() => false)) {
    await page.locator('body').click();
  } else {
    throw new Error(`Kiosk did not load at ${page.url()}`);
  }
  await pause(page);
  await page.getByRole('button', { name: /Walk-in/i }).click();
  await pause(page);

  await page.getByPlaceholder('Mobile (10 digits)').fill(DEMO.phone);
  await page.getByPlaceholder('First name *').fill(DEMO.firstName);
  await page.getByPlaceholder('Last name').fill(DEMO.lastName);
  await page.getByPlaceholder('Chief complaint').fill(DEMO.complaint);
  await page.locator('input[type="checkbox"]').first().check();
  await pause(page, 800);
  await page.getByRole('button', { name: /Register & Get Token/i }).click();

  await page.getByText("You're checked in!").waitFor({ timeout: 20000 });
  await pause(page, 2500);
}

async function phaseOpdQueue(page) {
  await showTitleCard(page, '2 · OPD Queue', 'Real-time waiting room display for staff and patients');
  await page.goto(`${BASE_URL}/display/queue`, { waitUntil: 'domcontentloaded' });
  await pause(page, 3500);
}

async function phaseHospitalOpd(page) {
  await showTitleCard(page, '3 · OPD Consultation', 'Hospital staff manage appointments and convert to inpatient');

  await page.goto(`${BASE_URL}/hospital/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('hospital@example.com').fill('hospital@mediczy.com');
  await page.getByPlaceholder('Enter your password').fill('Hospital123');
  await pause(page, 800);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await page.waitForURL(/\/hospital\/(dashboard|practice-management)/, { timeout: 15000 }).catch(() => {});
  await pause(page, 1500);

  await page.goto(`${BASE_URL}/hospital/practice-management`, { waitUntil: 'networkidle' });
  await page.getByText('Practice Management').waitFor({ timeout: 20000 }).catch(() => {});
  await pause(page, 2000);

  const patientsTab = page.getByRole('tab', { name: /Patients/i });
  if (await patientsTab.isVisible().catch(() => false)) {
    await patientsTab.click();
    await pause(page);
  }

  const priyaCard = page.getByText('Priya Singh').first();
  if (await priyaCard.isVisible().catch(() => false)) {
    await priyaCard.scrollIntoViewIfNeeded();
    await pause(page, 1000);
    const convertBtn = page.getByRole('button', { name: /Convert to IPD/i }).first();
    if (await convertBtn.isVisible().catch(() => false)) {
      await convertBtn.click();
      await pause(page, 2000);
    }
  }
}

async function phaseAdmission(page) {
  await showTitleCard(page, '4 · Admission & Bed Assignment', 'ADT workflow with live bed map and ward census');
  await setHospitalSession(page);
  await page.goto(`${BASE_URL}/hospital/ward`, { waitUntil: 'networkidle' });
  await page.getByText(/Ward Dashboard|Bed Map/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  await pause(page, 3000);

  await page.goto(`${BASE_URL}/hmis/command-center`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Command Center|Hospital OS/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  await pause(page, 3000);
}

async function phaseInpatientCare(page) {
  await showTitleCard(page, '5 · Inpatient Care', 'Clinical workspace with vitals, medications, and care plans');
  await setHospitalSession(page);
  await page.goto(`${BASE_URL}/hmis/patient/${DEMO.patientId}/workspace`, { waitUntil: 'networkidle' });
  await page.getByText(/Inpatient Workspace|Priya Singh/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  await pause(page, 3500);
}

async function phaseDischarge(page) {
  await showTitleCard(page, '6 · Discharge', 'Readiness checklist, discharge summary, and patient packet');
  await setHospitalSession(page);
  await page.goto(`${BASE_URL}/hmis/discharge-board`, { waitUntil: 'networkidle' });
  await page.getByText(/Discharge Readiness|Discharge Board/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  await pause(page, 2500);

  const initiateBtn = page.getByRole('button', { name: /Initiate Discharge/i }).first();
  if (await initiateBtn.isVisible().catch(() => false)) {
    await initiateBtn.scrollIntoViewIfNeeded();
    await pause(page, 1500);
  }

  await page.goto(`${BASE_URL}/hmis/admission/${DEMO.admissionId}/discharge`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Discharge Workflow/i).waitFor({ timeout: 20000 }).catch(() => {});
  await pause(page, 2000);

  const signBtn = page.getByRole('button', { name: /Sign & Finalise|Sign & Finalize/i });
  if (await signBtn.isVisible().catch(() => false)) {
    await signBtn.scrollIntoViewIfNeeded();
    await pause(page, 1500);
  }

  const sendBtn = page.getByRole('button', { name: /Send to Patient/i });
  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.scrollIntoViewIfNeeded();
    await pause(page, 1500);
  }
}

async function phaseClosing(page) {
  await showTitleCard(page, 'Complete Patient Journey', 'Walk-in → OPD → Admission → Care → Discharge — powered by Mediqzy Hospital OS');
  await page.goto(`${BASE_URL}/display/discharge-status`, { waitUntil: 'domcontentloaded' });
  await pause(page, 2500);
  await page.goto(`${BASE_URL}/patient/care-journey`, { waitUntil: 'domcontentloaded' });
  await pause(page, 3000);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const videoDir = path.join(OUTPUT_DIR, 'raw');
  await mkdir(videoDir, { recursive: true });

  console.log(`Recording Mediqzy Hospital OS demo against ${BASE_URL}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  const browser = await chromium.launch({
    headless: true,
    slowMo: SLOW_MO,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1920, height: 1080 },
    },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = await context.newPage();
  await setupAuthBypass(page);
  await setupApiMocks(page);

  try {
    await phaseWalkIn(page);
    await phaseOpdQueue(page);
    await phaseHospitalOpd(page);
    await phaseAdmission(page);
    await phaseInpatientCare(page);
    await phaseDischarge(page);
    await phaseClosing(page);
  } catch (err) {
    console.error('Recording error (partial video may still be saved):', err);
  }

  const video = page.video();
  await context.close();
  await browser.close();

  let finalPath = path.join(OUTPUT_DIR, 'mediqzy-hospital-os-patient-flow-demo.webm');
  if (video) {
    const rawPath = await video.path();
    try {
      await rename(rawPath, finalPath);
    } catch {
      await copyFile(rawPath, finalPath);
    }
    console.log(`\n✅ Demo recording saved: ${finalPath}`);
  } else {
    const files = await readdir(videoDir).catch(() => []);
    const webm = files.find((f) => f.endsWith('.webm'));
    if (webm) {
      finalPath = path.join(OUTPUT_DIR, webm);
      console.log(`\n✅ Demo recording saved: ${finalPath}`);
    } else {
      console.error('No video file was produced.');
      process.exit(1);
    }
  }

  // Write a short companion guide for the presenter
  const guidePath = path.join(OUTPUT_DIR, 'DEMO_SCRIPT.md');
  const guide = `# Mediqzy Hospital OS — Patient Flow Demo

**Recording:** mediqzy-hospital-os-patient-flow-demo.webm (also available as .mp4)

## Flow covered
1. **Walk-in kiosk** (\`/kiosk/checkin\`) — ${DEMO.firstName} ${DEMO.lastName} registers and receives token **${DEMO.token}**
2. **OPD queue display** (\`/display/queue\`) — waiting room board
3. **Practice management** (\`/hospital/practice-management\`) — OPD → IPD conversion
4. **Ward dashboard + command center** — bed map and hospital KPIs
5. **Inpatient workspace** — vitals, medications, clinical view
6. **Discharge board + workflow** — readiness checklist and discharge packet
7. **Patient-facing views** — discharge status and care journey

## Demo patient
- **Name:** ${DEMO.firstName} ${DEMO.lastName}
- **Phone:** ${DEMO.phone}
- **UHID:** ${DEMO.uhid}
- **Token:** ${DEMO.token}

## Re-record locally
\`\`\`bash
cd tests && npm install && npx playwright install chromium
node scripts/demo/record-hospital-os-patient-flow.mjs
\`\`\`

Set \`BASE_URL=http://localhost:9443\` to record against a local dev server.
`;
  await import('node:fs/promises').then((fs) => fs.writeFile(guidePath, guide, 'utf8'));
  console.log(`📄 Demo script guide: ${guidePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
