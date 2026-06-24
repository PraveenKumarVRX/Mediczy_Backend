#!/usr/bin/env node
/**
 * Records a COMPLETE Mediqzy Hospital OS demo — all major flows.
 * Uses LIVE_MODE against native PostgreSQL + Node (no Docker, no API mocks).
 *
 * Usage:
 *   LIVE_MODE=1 node scripts/demo/record-hospital-os-full-demo.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, readdir, rename, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:9443';
const API_URL = process.env.API_URL || 'http://localhost:8000';
const LIVE_MODE = true;
const OUTPUT_DIR = process.env.DEMO_OUTPUT_DIR || '/opt/cursor/artifacts/hospital-os-demo';
const SLOW_MO = Number(process.env.DEMO_SLOW_MO || 280);
const DEMO = { firstName: 'Priya', lastName: 'Singh', phone: '9876543211', patientId: '1', admissionId: '1' };

async function pause(page, ms = 2000) {
  await page.waitForTimeout(ms);
}

async function showTitleCard(page, title, subtitle, part) {
  await page.evaluate(({ title, subtitle, part }) => {
    const existing = document.getElementById('demo-title-card');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'demo-title-card';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:linear-gradient(135deg,#0f766e 0%,#134e4a 45%,#0c4a6e 100%)',
      'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
      'color:white', 'font-family:system-ui,-apple-system,sans-serif', 'text-align:center', 'padding:2rem',
    ].join(';');
    overlay.innerHTML = `
      ${part ? `<div style="font-size:0.85rem;letter-spacing:0.15em;text-transform:uppercase;opacity:0.7;margin-bottom:0.5rem">${part}</div>` : ''}
      <div style="font-size:0.9rem;letter-spacing:0.2em;text-transform:uppercase;opacity:0.75;margin-bottom:1rem">Mediqzy Hospital OS</div>
      <h1 style="font-size:clamp(1.8rem,3.5vw,3rem);margin:0;font-weight:800">${title}</h1>
      <p style="font-size:clamp(0.95rem,1.8vw,1.35rem);opacity:0.88;margin-top:1rem;max-width:42rem;line-height:1.5">${subtitle}</p>
    `;
    document.body.appendChild(overlay);
  }, { title, subtitle, part });
  await pause(page, 3200);
  await page.evaluate(() => document.getElementById('demo-title-card')?.remove());
}

async function setupHospitalAuth(page) {
  const loginRes = await fetch(`${API_URL}/api/hospital/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hospital@mediczy.com', password: 'Hospital123' }),
  });
  const loginJson = await loginRes.json();
  if (!loginJson.token) throw new Error('Hospital login failed — start server + seed demo data');
  await page.addInitScript(({ hospitalToken, hospital }) => {
    localStorage.setItem('hospitalToken', hospitalToken);
    localStorage.setItem('userType', 'hospital');
    localStorage.setItem('hospitalData', JSON.stringify(hospital || { id: 3, name: 'Mediqzy Demo Hospital' }));
  }, { hospitalToken: loginJson.token, hospital: loginJson.hospital });
}

async function visit(page, url, { waitMs = 2800, scroll = false, waitFor } = {}) {
  await page.goto(`${BASE_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (waitFor) {
    await page.getByText(waitFor).first().waitFor({ timeout: 25000 }).catch(() => {});
  }
  if (scroll) {
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 3, behavior: 'smooth' }));
    await pause(page, 800);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
  await pause(page, waitMs);
}

const PHASES = [
  {
    part: 'Overview',
    title: 'Hospital OS Command Hub',
    subtitle: 'One integrated platform for the entire hospital — 40+ modules, live data',
    url: '/hospital/os',
    waitFor: 'World-Class HMIS',
    waitMs: 4000,
    scroll: true,
  },
  {
    part: 'Patient Journey · 1/8',
    title: 'Walk-in Kiosk',
    subtitle: 'Paperless self check-in — UHID, token, consent',
    fn: async (page) => {
      await visit(page, '/kiosk/checkin', { waitMs: 1500 });
      const touch = page.getByText('Touch to Start');
      if (await touch.isVisible({ timeout: 5000 }).catch(() => false)) await touch.click();
      else await page.locator('body').click();
      await pause(page, 1000);
      await page.getByRole('button', { name: /Walk-in/i }).click();
      await pause(page, 800);
      await page.getByPlaceholder('Mobile (10 digits)').fill('9876509999');
      await page.getByPlaceholder('First name *').fill('Demo');
      await page.getByPlaceholder('Last name').fill('Walkin');
      await page.getByPlaceholder('Chief complaint').fill('Fever and cough');
      await page.locator('input[type="checkbox"]').first().check();
      await page.getByRole('button', { name: /Register & Get Token/i }).click();
      await page.getByText(/checked in|Token/i).first().waitFor({ timeout: 25000 }).catch(() => {});
      await pause(page, 3000);
    },
  },
  {
    part: 'Patient Journey · 2/8',
    title: 'OPD Queue Display',
    subtitle: 'Real-time waiting room board for patients and staff',
    url: '/display/queue?zone=opd-waiting',
    waitMs: 4000,
  },
  {
    part: 'Patient Journey · 3/8',
    title: 'Practice Management',
    subtitle: 'Live OPD/IPD roster — convert outpatient to inpatient',
    url: '/hospital/practice-management',
    waitFor: 'Priya Singh',
    waitMs: 3500,
  },
  {
    part: 'Patient Journey · 4/8',
    title: 'Admission & Bed Management',
    subtitle: 'ADT with bed allocation, reservation token, and ward census',
    fn: async (page) => {
      await visit(page, '/hmis/beds/map', { waitFor: 'Bed', waitMs: 3000 });
      await visit(page, '/hospital/ward', { waitFor: 'Ward', waitMs: 3500, scroll: true });
      await visit(page, '/hospital/adt/admit?patientId=1&type=op_converted&name=Priya%20Singh', { waitFor: 'Admit', waitMs: 3000 });
    },
  },
  {
    part: 'Clinical · ER',
    title: 'Emergency Department',
    subtitle: 'ESI triage queue — red, yellow, green with emergency OT activation',
    url: '/hospital/er/queue',
    waitMs: 4000,
    scroll: true,
  },
  {
    part: 'Clinical · ICU',
    title: 'ICU Command Board',
    subtitle: 'Critical care census and ventilator monitoring',
    url: '/hospital/icu-board',
    waitMs: 3000,
  },
  {
    part: 'Clinical · OT',
    title: 'Operation Theatre',
    subtitle: 'Surgery schedule, anesthesia, and OT command center',
    url: '/hmis/ot/command-center',
    waitMs: 3500,
  },
  {
    part: 'Clinical · Nursing',
    title: 'Nurse Station',
    subtitle: 'Vitals, medications due, alerts, and nursing tasks',
    url: '/hospital/nurse-station',
    waitMs: 3500,
    scroll: true,
  },
  {
    part: 'Clinical · Doctor',
    title: 'Doctor Workspace',
    subtitle: 'Inpatient rounds, orders, prescriptions, and imaging',
    url: '/hospital/doctor-workspace',
    waitFor: 'Doctor Workspace',
    waitMs: 3500,
  },
  {
    part: 'AI · Clinical Intelligence',
    title: 'AI Scribe',
    subtitle: 'Ambient voice-to-clinical-document — hands-free documentation',
    url: '/hospital/ai-scribe',
    waitMs: 3500,
  },
  {
    part: 'AI · Clinical Intelligence',
    title: 'Clinical CDSS',
    subtitle: 'AI triage and clinical decision support for physicians',
    url: '/hospital/clinical-cdss',
    waitMs: 3500,
    scroll: true,
  },
  {
    part: 'AI · Clinical Intelligence',
    title: 'AI Voice Assistant',
    subtitle: 'Voice commands for orders, queries, and ward round briefings',
    url: '/hospital/voice-assistant',
    waitMs: 3000,
  },
  {
    part: 'Diagnostics',
    title: 'Lab Orders & Reports',
    subtitle: 'Inpatient lab requisitions and result tracking',
    url: '/hospital/lab-order',
    waitMs: 3500,
    scroll: true,
  },
  {
    part: 'Diagnostics',
    title: 'RIS / PACS — DICOM',
    subtitle: 'Radiology information system and imaging worklist',
    url: '/hospital/radiology',
    waitMs: 3500,
  },
  {
    part: 'Pharmacy',
    title: 'IP Pharmacy Dispense',
    subtitle: 'Medication orders from eMAR to pharmacy queue',
    url: '/hospital/pharmacy-dispense',
    waitMs: 3000,
  },
  {
    part: 'Inpatient Care',
    title: 'Clinical Workspace',
    subtitle: 'Vitals trend, active medications, allergies, and care plan',
    url: `/hmis/patient/${DEMO.patientId}/workspace`,
    waitFor: 'Priya Singh',
    waitMs: 4000,
  },
  {
    part: 'Inpatient Care',
    title: 'eMAR — Medication Administration',
    subtitle: 'Electronic medication administration record with 5-rights checks',
    url: '/hmis/emar',
    waitMs: 3000,
  },
  {
    part: 'Inpatient Care',
    title: 'e-Charting',
    subtitle: 'Nursing documentation and bedside charting',
    url: '/hmis/echart',
    waitMs: 3000,
  },
  {
    part: 'Revenue',
    title: 'IP Billing & Charge Master',
    subtitle: 'Bed-day charges, clearance, and final bill preparation',
    url: '/hospital/billing',
    waitMs: 3500,
  },
  {
    part: 'Revenue',
    title: 'Insurance Claims Cockpit',
    subtitle: 'Pre-authorization, NHCX, and TPA discharge clearance',
    url: '/hospital/insurance-claims',
    waitMs: 3500,
    scroll: true,
  },
  {
    part: 'Operations',
    title: 'Ambulance Dispatch',
    subtitle: 'Fleet management, ETA tracking, and emergency response',
    url: '/hospital/ambulance',
    waitMs: 3000,
    scroll: true,
  },
  {
    part: 'Telehealth',
    title: 'Post-Discharge Teleconsult',
    subtitle: 'Follow-up video visits for discharged patients',
    url: '/hospital/teleconsult',
    waitFor: 'Teleconsultation',
    waitMs: 3500,
  },
  {
    part: 'Operations',
    title: 'Security & Surveillance',
    subtitle: 'CCTV command, access control, and incident management',
    url: '/hospital/security',
    waitMs: 3000,
  },
  {
    part: 'Corporate',
    title: 'Corporate Health & CRM',
    subtitle: 'Employer contracts, health checkup camps, and lounge CRM',
    url: '/hospital/corporate-crm',
    waitMs: 3000,
  },
  {
    part: 'Leadership',
    title: 'Command Center',
    subtitle: 'Hospital-wide KPIs — occupancy, OT, alerts, discharges',
    url: '/hmis/command-center',
    waitFor: 'Command Center',
    waitMs: 4000,
  },
  {
    part: 'Discharge · 7/8',
    title: 'Discharge Workflow',
    subtitle: 'Readiness checklist, AI discharge summary, sign & send packet',
    url: `/hmis/admission/${DEMO.admissionId}/discharge`,
    waitFor: 'Discharge',
    waitMs: 4500,
    scroll: true,
  },
  {
    part: 'Discharge · 8/8',
    title: 'Discharge Board',
    subtitle: 'Pending discharges across all wards',
    url: '/hmis/discharge-board',
    waitMs: 3000,
  },
];

async function main() {
  console.log('🏥 Mediqzy Hospital OS — FULL demo recording');
  console.log(`   API: ${API_URL}  UI: ${BASE_URL}`);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const videoDir = path.join(OUTPUT_DIR, 'raw-full');
  await mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, slowMo: SLOW_MO });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = await context.newPage();
  await setupHospitalAuth(page);

  await showTitleCard(page,
    'Mediqzy Hospital OS',
    'Complete HMIS demo — patient journey, clinical departments, AI, billing, and operations',
    'Full Platform Tour'
  );

  let step = 0;
  for (const phase of PHASES) {
    step += 1;
    console.log(`  [${step}/${PHASES.length}] ${phase.title}`);
    try {
      if (phase.fn) {
        await showTitleCard(page, phase.title, phase.subtitle, phase.part);
        await phase.fn(page);
      } else {
        await showTitleCard(page, phase.title, phase.subtitle, phase.part);
        await visit(page, phase.url, {
          waitMs: phase.waitMs ?? 3000,
          scroll: phase.scroll,
          waitFor: phase.waitFor,
        });
      }
    } catch (err) {
      console.warn(`    ⚠️  Phase skipped (${phase.title}): ${err.message}`);
      await pause(page, 1500);
    }
  }

  await showTitleCard(page,
    'Complete Hospital Operating System',
    'Walk-in → OPD → ER → ICU → OT → AI-assisted care → Billing → Insurance → Discharge — Mediqzy',
    'Thank You'
  );

  const video = page.video();
  await context.close();
  await browser.close();

  const webmPath = path.join(OUTPUT_DIR, 'mediqzy-hospital-os-full-demo.webm');
  const mp4Path = path.join(OUTPUT_DIR, 'mediqzy-hospital-os-full-demo.mp4');

  if (video) {
    const raw = await video.path();
    try { await rename(raw, webmPath); } catch { await copyFile(raw, webmPath); }
    console.log(`\n✅ Full demo WEBM: ${webmPath}`);
  }

  try {
    execSync(`ffmpeg -y -i "${webmPath}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p "${mp4Path}"`, { stdio: 'pipe' });
    console.log(`✅ Full demo MP4:  ${mp4Path}`);
  } catch (e) {
    console.warn('ffmpeg conversion skipped:', e.message);
  }

  const guide = `# Mediqzy Hospital OS — Full Platform Demo

**Files:**
- \`mediqzy-hospital-os-full-demo.webm\`
- \`mediqzy-hospital-os-full-demo.mp4\`

## Flows covered (${PHASES.length} modules)

${PHASES.map((p, i) => `${i + 1}. **${p.title}** — ${p.subtitle}`).join('\n')}

## Re-record
\`\`\`bash
cd server && npm run demo:seed
# start server :8000 + client :9443
cd tests && LIVE_MODE=1 node ../scripts/demo/record-hospital-os-full-demo.mjs
\`\`\`

**Login:** hospital@mediczy.com / Hospital123  
**Hub:** /hospital/os
`;
  await writeFile(path.join(OUTPUT_DIR, 'FULL_DEMO_SCRIPT.md'), guide, 'utf8');
  console.log(`📄 Guide: ${path.join(OUTPUT_DIR, 'FULL_DEMO_SCRIPT.md')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
