#!/usr/bin/env node
// Browser regression for the attached patient QA report. All API data is mocked;
// this test never creates bookings, charges payments or accesses patient records.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || undefined, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
page.setDefaultTimeout(25000);
await page.setBypassServiceWorker(true);
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6OTk5LCJyb2xlIjoidXNlciIsInVzZXJUeXBlIjoidXNlciIsImV4cCI6NDcyMzY2MDgwMH0.c2ln');
  localStorage.setItem('userType', 'user');
  localStorage.setItem('connectedDevices', JSON.stringify([{ id: 'offline-watch', name: 'VL45PRO', battery: 100, status: 'connected' }]));
});
const errors = [];
const recordedVitals = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (/NaN|Expected moveto/.test(message.text())) errors.push(message.text()); });
await page.setRequestInterception(true);
page.on('request', request => {
  const url = new URL(request.url());
  const path = url.pathname;
  const headers = { 'access-control-allow-origin': request.headers().origin || base, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'Authorization,Content-Type,X-Tenant-ID' };
  if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
  if (path.includes('/api/')) {
    let body = { success: true, data: [] };
    if (path.endsWith('/users/profile')) body = { id: 999, firstName: 'QA', lastName: 'Patient', role: 'user', email: 'qa@example.invalid' };
    else if (path.endsWith('/health-score/today')) body = { success: true, score: null, domains: {}, dataQuality: { status: 'insufficient', observedDomains: [] } };
    else if (path.endsWith('/health-data/summary')) body = { latest: { steps: { value: '3450.00', unit: 'steps' }, heart_rate: { value: '78.00', unit: 'bpm' }, sleep: { value: 7.5, unit: 'hours' } }, period: {}, averages: {} };
    else if (path.endsWith('/health/latest')) body = { steps: '3450.00', heartRate: '78.00', sleepHours: 7.5, sleepScore: 94, timestamp: '2026-10-28T04:30:00Z' };
    else if (path.endsWith('/health-intelligence')) body = { success: true, data: { summary: { overall_score: null, total_reminders: 0, high_priority: 0, actionable: 0 }, appreciations: [], hazards: [], categories: {}, all_reminders: [] } };
    else if (path.endsWith('/wallet')) body = { success: true, data: { balance: 558, totalEarned: 561, streakDays: 3, recentTransactions: [] } };
    else if (path.endsWith('/notifications/unread-count')) body = { success: true, unreadCount: 0 };
    else if (path.endsWith('/notifications')) body = { success: true, notifications: [] };
    else if (path.includes('/appointments')) body = { success: true, appointments: [], data: [], analytics: {} };
    else if (path.endsWith('/reports')) body = { success: true, data: [{ id: 1, fileName: 'rn_image_picker_lib_temp_test.pdf', testName: 'Uploaded prescription', reportType: 'prescription' }] };
    else if (path.endsWith('/health-diary')) body = { success: true, entries: [] };
    else if (path.endsWith('/health-assessment')) body = { success: true, assessment: null };
    else if (path.endsWith('/doctors')) body = { success: true, data: [], doctors: [] };
    else if (path.endsWith('/lab-tests')) body = { success: true, data: [], pagination: { total: 0, hasMore: false } };
    else if (path.endsWith('/prescriptions/patient')) body = { success: true, prescriptions: [] };
    else if (path.endsWith('/family-members')) body = { success: true, data: [], familyMembers: [] };
    else if (path.endsWith('/health-data/vitals')) {
      if (request.method() === 'POST') {
        const vital = { ...JSON.parse(request.postData()), id: 'test-vital', unit: 'mmHg', status: 'critical', timestamp: '2026-10-28T04:30:00Z', recordedBy: 'Self' };
        recordedVitals.push(vital); body = { success: true, vital };
      } else body = { success: true, vitals: recordedVitals };
    }
    else if (path.endsWith('/employee/benefits')) body = { success: true, plans: [] };
    else if (path.endsWith('/employee/claims')) body = { success: true, claims: [] };
    else if (path.endsWith('/employee/claims/eligibility')) body = { success: true, eligible: false, reason: 'No active employer plan' };
    else if (path.endsWith('/membership/my/current')) body = { success: true, plan: { id: 99, name: 'Silver', price: 1499, durationMonths: 12, metadata: { coverageDetails: { onlineConsult: { limit: 6, unit: 'GP/year' }, emergencyConsult: { limit: 3 }, pharmacy: { limitINR: 0, discountPct: 15 }, insurance: { health: 0 } } }, benefits: ['3 emergency consultations/year'] }, userPlan: { status: 'active', endDate: '2099-12-31' } };
    else if (path.endsWith('/billing/invoices')) body = { success: true, data: { invoices: [], pagination: { total: 0 } } };
    else if (path.endsWith('/lab-tests/catalog')) body = { success: true, data: [], pagination: { total: 0 }, categories: [] };
    return request.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
  }
  if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
  return request.continue();
});
try {
  for (const path of ['/privacy', '/terms', '/compliance', '/', '/health-dashboard', '/health-intelligence', '/patient/vital-reports', '/calorie-calculator', '/patient/devices', '/patient/network-hospitals', '/patient/network-clinics', '/wellness-rewards', '/health-risk-assessment', '/contact-us', '/benefits', '/claims-express', '/family-hub', '/billing/invoices', '/my-prescriptions', '/smart-health', '/patient/watch-analytics', '/diet', '/patient/lab-tests', '/appointments', '/health-diary', '/doctors', '/smart-opd', '/membership-card']) {
    const before = errors.length;
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle2' });
    const body = await page.evaluate(() => document.body.innerText);
    assert(!/Oops! Something went wrong|404 Page not found/.test(body), `${path}: crashed or missing route: ${body.slice(-1800)}; errors=${errors.join("; ")}`);
    assert.equal(errors.length, before, `${path}: ${errors.slice(before).join('; ')}`);
    const headers = await page.$$eval('main > header', elements => elements.length);
    assert(headers <= 1, `${path}: duplicate app headers (${headers})`);
    if (path === '/') {
      assert(body.includes('Not enough data yet'), 'Home must show missing-score state');
      assert(!body.includes('High Risk'), 'Home must not infer high risk from a missing score');
      assert(body.includes('3,450'), 'Home should format steps');
    }
    if (path === '/health-dashboard') { assert(body.includes('Not enough data yet')); assert(body.includes('94%')); }
    if (path === '/wellness-rewards') { assert(body.includes('Level 2')); assert(!/Rahul Sharma|Amazon|Starbucks/.test(body)); }
    if (path === '/health-risk-assessment') assert(!body.includes('Low 100%'), 'Incomplete form must not claim low risk');
    if (path === '/patient/vital-reports') assert(!body.includes('70.5'), 'Vitals must not show sample readings');
    if (path === '/patient/watch-analytics') {
      assert(body.includes('Offline · paired'), 'Saved device must not imply a live Bluetooth connection');
      assert(!body.includes('100%'), 'Offline device must not display a cached battery value');
    }
    console.log(`PASS ${path}`);
  }
  await page.goto(`${base}/`, { waitUntil: 'networkidle2' });
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
  await page.waitForSelector('[cmdk-input]'); await page.type('[cmdk-input]', 'bo');
  await page.waitForFunction(() => document.querySelector('[cmdk-item]')?.textContent?.includes('Book Appointment'));
  const results = await page.$$eval('[cmdk-item]', items => items.map(item => item.textContent));
  assert(!results.includes('Home'), 'Short search must exclude accidental dashboard substring matches');
  await page.keyboard.press('Enter'); await page.waitForFunction(() => location.pathname === '/doctors');
  console.log('PASS short search + Enter');

  await page.goto(`${base}/patient/vital-reports`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Record Vital').click());
  await page.waitForSelector('#value'); await page.type('#value', '200/120');
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Record').click());
  await page.waitForFunction(() => document.body.innerText.includes('200/120') && document.body.innerText.includes('Critical'));
  await page.reload({ waitUntil: 'networkidle2' });
  assert((await page.evaluate(() => document.body.innerText)).includes('200/120'), 'Recorded vital must survive refresh through API');
  assert.equal(recordedVitals.length, 1);
  console.log('PASS vital save + critical flag + refresh');

  console.log('Patient QA browser checks passed.');
} finally { await browser.close(); }
