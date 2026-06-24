#!/usr/bin/env node
/**
 * Scan Hospital OS routes for NotFound / ErrorBoundary "Oops" pages.
 */
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:9443';
const API_URL = process.env.API_URL || 'http://localhost:8000';

const ROUTES = [
  '/hospital/os',
  '/hospital/ceo', '/hospital/coo', '/hospital/ms', '/hospital/cfo',
  '/hospital/mrd', '/hospital/ehr', '/hospital/communication',
  '/hospital/adt/admit', '/hospital/adt/wristband?patientId=1&name=Priya%20Singh&admissionNumber=IP2026000001&bed=GEN-11&ward=General%20Ward%20A',
  '/hospital/practice-management', '/hospital/ward', '/hospital/billing',
  '/hospital/er/queue', '/hospital/icu-board', '/hospital/nurse-station',
  '/hospital/doctor-workspace', '/hospital/ai-scribe', '/hospital/clinical-cdss',
  '/hospital/voice-assistant', '/hospital/teleconsult', '/hospital/radiology',
  '/hospital/pharmacy-dispense', '/hospital/security', '/hospital/ambulance',
  '/hospital/corporate-management', '/hospital/corporate-crm', '/hospital/insurance-claims',
  '/hmis/beds/map', '/hmis/patient/1/workspace', '/hmis/admission/1/discharge',
  '/hmis/ot/command-center', '/hmis/emar', '/hmis/echart', '/hmis/command-center',
  '/hmis/discharge-board', '/hmis/ai-ops',
];

async function login(page) {
  const res = await fetch(`${API_URL}/api/hospital/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hospital@mediczy.com', password: 'Hospital123' }),
  });
  const json = await res.json();
  if (!json.token) throw new Error(json.message || 'login failed');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, hospital }) => {
    localStorage.setItem('hospitalToken', token);
    localStorage.setItem('hospitalData', JSON.stringify(hospital || {}));
  }, { token: json.token, hospital: json.hospital });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (err) => console.log('  PAGEERROR:', err.message));

await login(page);
const failures = [];

for (const route of ROUTES) {
  try {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(800);
    const body = await page.textContent('body') || '';
    const url = page.url();
    if (body.includes("Oops!") || body.includes("doesn't exist")) {
      failures.push({ route, issue: 'Oops/NotFound', url });
      console.log(`❌ ${route}`);
    } else if (url.includes('/hospital/login')) {
      failures.push({ route, issue: 'login redirect', url });
      console.log(`🔒 ${route} -> login`);
    } else {
      console.log(`✅ ${route}`);
    }
  } catch (e) {
    failures.push({ route, issue: e.message });
    console.log(`💥 ${route}: ${e.message}`);
  }
}

await browser.close();
console.log('\n--- Summary ---');
console.log(`Failed: ${failures.length}/${ROUTES.length}`);
if (failures.length) console.log(JSON.stringify(failures, null, 2));
process.exit(failures.length ? 1 : 0);
