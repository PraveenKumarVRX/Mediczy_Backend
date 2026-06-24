#!/usr/bin/env node
/**
 * Verifies Hospital OS demo pages load and core APIs work against a live stack.
 * Usage: BASE_URL=http://localhost:9443 API_URL=http://localhost:8000 node scripts/demo/verify-hospital-os-flow.mjs
 */
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:9443';
const API_URL = process.env.API_URL || 'http://localhost:8000';
const FAILURES = [];

function ok(label) { console.log(`  ✅ ${label}`); }
function fail(label, err) {
  console.log(`  ❌ ${label}: ${err}`);
  FAILURES.push(`${label}: ${err}`);
}

async function apiLogin() {
  const res = await fetch(`${API_URL}/api/hospital/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hospital@mediczy.com', password: 'Hospital123' }),
  });
  const json = await res.json();
  if (!json.token) throw new Error(json.message || 'login failed');
  return json.token;
}

async function testPublicPages(browser) {
  console.log('\n📺 Public surfaces');
  const page = await browser.newPage();
  try {
    await page.goto(`${BASE_URL}/kiosk/checkin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (page.url().includes('/login')) fail('Kiosk route', 'redirected to login');
    else ok('Kiosk check-in loads without auth redirect');

    await page.goto(`${BASE_URL}/display/queue?zone=opd-waiting`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (page.url().includes('/login')) fail('Queue display', 'redirected to login');
    else ok('OPD queue display loads without auth redirect');
  } catch (e) {
    fail('Public pages', e.message);
  } finally {
    await page.close();
  }
}

async function testKioskRegister() {
  console.log('\n🎫 Kiosk registration API');
  try {
    const res = await fetch(`${API_URL}/api/display/kiosk/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Demo',
        lastName: 'Walkin',
        phone: '9876501234',
        gender: 'female',
        chiefComplaint: 'Fever',
        consent: true,
      }),
    });
    const json = await res.json();
    if (!json.success && !json.token) throw new Error(json.message || JSON.stringify(json));
    ok(`Kiosk register returns token (${json.token?.tokenNumber || json.entry?.tokenNumber || 'ok'})`);
  } catch (e) {
    fail('Kiosk register', e.message);
  }
}

async function testHospitalFlow(browser, token) {
  console.log('\n🏥 Hospital staff flow');
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript((t) => {
    localStorage.setItem('hospitalToken', t);
    localStorage.setItem('userType', 'hospital');
    localStorage.setItem('hospitalData', JSON.stringify({ id: 3, name: 'Mediqzy Demo Hospital' }));
  }, token);

  try {
    await page.goto(`${BASE_URL}/hospital/practice-management`, { waitUntil: 'networkidle', timeout: 45000 });
    if (page.url().includes('/hospital/login')) fail('Practice management', 'redirected to login');
    else ok('Practice management loads with hospital token');

    // Switch to Patients tab for live roster
    const patientsTab = page.locator('button, [role="tab"]').filter({ hasText: /^Patients$/i }).first();
    if (await patientsTab.count()) await patientsTab.click();
    await page.waitForTimeout(800);

    const body = await page.textContent('body');
    if (body?.includes('Priya Singh')) ok('Practice management shows live patient Priya Singh');
    else fail('Practice management patients', 'Priya Singh not visible');

    await page.goto(`${BASE_URL}/hospital/ward`, { waitUntil: 'networkidle', timeout: 45000 });
    ok('Ward dashboard loads');

    await page.goto(`${BASE_URL}/hmis/patient/1/workspace`, { waitUntil: 'networkidle', timeout: 45000 });
    const wsBody = await page.textContent('body');
    if (wsBody?.includes('Priya Singh')) ok('Inpatient workspace shows Priya Singh');
    else fail('Inpatient workspace', 'patient name not visible');
    if (wsBody?.includes('Ceftriaxone') || wsBody?.includes('Paracetamol')) ok('Inpatient workspace shows medications');
    else fail('Inpatient workspace meds', 'medications not visible');

    await page.goto(`${BASE_URL}/hmis/admission/1/discharge`, { waitUntil: 'networkidle', timeout: 45000 });
    const dcBody = await page.textContent('body');
    if (dcBody?.includes('Discharge Readiness')) ok('Discharge workflow loads');
    else fail('Discharge workflow', 'readiness section missing');
    if (dcBody?.match(/\d+\/\d+ criteria met/)) ok('Discharge readiness shows progress');
    else fail('Discharge readiness', 'criteria count missing');
  } catch (e) {
    fail('Hospital flow', e.message);
  } finally {
    await context.close();
  }
}

async function main() {
  console.log(`🔍 Verifying Hospital OS at ${BASE_URL} (API ${API_URL})`);
  let token;
  try {
    token = await apiLogin();
    ok('Hospital login API');
  } catch (e) {
    fail('Hospital login API', e.message);
    process.exit(1);
  }

  await testKioskRegister();

  const browser = await chromium.launch({ headless: true });
  await testPublicPages(browser);
  await testHospitalFlow(browser, token);
  await browser.close();

  console.log('\n' + (FAILURES.length ? `❌ ${FAILURES.length} failure(s)` : '✅ All checks passed'));
  if (FAILURES.length) {
    FAILURES.forEach((f) => console.log('  -', f));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
