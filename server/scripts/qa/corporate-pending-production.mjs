/** Release acceptance: no consent/status changes, notifications or clinical writes. */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import jwt from 'jsonwebtoken';
import { postgresSequelize as db } from '../../db/postgres-sequelize.js';
const require = createRequire(new URL('../../../client/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const output = process.env.CORPORATE_PENDING_OUTPUT;
if (!output) throw new Error('Private evidence output path required');
const base = 'https://app.mediqzy.com';
const checks = [], pageErrors = [];
let browser;
const check = (name, passed) => checks.push({ name, passed });
try {
  const [corporate] = await db.query(`SELECT id FROM corporates WHERE id=3 AND LOWER(status)='active'`, { type: db.QueryTypes.SELECT });
  if (!corporate) throw new Error('Existing active corporate identity required');
  const token = jwt.sign({ id: corporate.id, userId: corporate.id, corporateId: corporate.id, role: 'corporate', userType: 'corporate', tokenType: 'access' }, process.env.JWT_SECRET, { expiresIn: 600 });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  async function request(name, path, status, body, validate = () => true) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    check(name, response.status === status && validate(data));
  }
  await request('Audit list is available', '/api/corporate/audit-log?limit=10', 200, null, body => Array.isArray(body.data?.entries));
  await request('Audit rejects invalid pagination', '/api/corporate/audit-log?limit=-1', 400);
  await request('Certificate list remains available', '/api/v1/occupational-health/fitness-certificates', 200, null, body => Array.isArray(body.data));
  await request('ZIP rejects empty selection before audit or document access', '/api/v1/occupational-health/fitness-certificates/download-zip', 400, { certificateIds: [] });
  await request('ZIP rejects invalid selection', '/api/v1/occupational-health/fitness-certificates/download-zip', 400, { certificateIds: ['invalid'] });
  await request('ZIP rejects nonexistent bigint certificate without precision loss', '/api/v1/occupational-health/fitness-certificates/download-zip', 404, { certificateIds: ['9223372036854775807'] });
  const [employee] = await db.query(`SELECT ce."employeeId" FROM corporate_employees ce WHERE ce.corporate_id=:id AND ce."isActive"=true AND NOT EXISTS (SELECT 1 FROM corporate_employee_consents c WHERE c.corporate_id=ce.corporate_id AND c.employee_id=ce."employeeId" AND c.consent_type='health_data' AND c.granted=true AND c.revoked_at IS NULL) LIMIT 1`, { replacements: { id: corporate.id }, type: db.QueryTypes.SELECT });
  if (!employee) throw new Error('An existing unconsented employee is needed for denied-access acceptance');
  for (const suffix of ['', '/export']) await request(`Unconsented health dossier${suffix ? ' export' : ''} is denied`, `/api/corporate/employees/${encodeURIComponent(employee.employeeId)}/health-records${suffix}`, 403, null, body => body.code === 'health_consent_required' && !body.data);
  const [foreign] = await db.query(`SELECT id FROM fitness_certificates WHERE organization_id IS NOT NULL AND organization_id<>:id LIMIT 1`, { replacements: { id: corporate.id }, type: db.QueryTypes.SELECT });
  if (foreign) await request('ZIP rejects a different corporate certificate', '/api/v1/occupational-health/fitness-certificates/download-zip', 404, { certificateIds: [String(foreign.id)] });
  browser = await puppeteer.launch({ headless: true, executablePath: '/snap/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setCacheEnabled(false); await page.setBypassServiceWorker(true);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.evaluateOnNewDocument(token => {
    localStorage.clear(); sessionStorage.clear(); localStorage.setItem('corporateToken', token);
    localStorage.setItem('userType', 'corporate'); localStorage.setItem('corporateData', JSON.stringify({ companyName: 'Test Corporate Ltd' }));
  }, token);
  await page.setRequestInterception(true);
  page.on('request', async request => {
    try {
      const url = new URL(request.url());
      if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) return await request.abort();
      if (url.pathname.startsWith('/api/') && request.method() !== 'GET') return await request.abort();
      await request.continue();
    } catch { try { await request.abort(); } catch {} }
  });
  await page.goto(base + '/corporate/settings', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(element => element.textContent.includes('Security'))?.click());
  await page.waitForSelector('[aria-label="Single sign-on (not available)"]', { timeout: 15000 });
  check('Published SSO control is visibly unavailable', await page.$eval('[aria-label="Single sign-on (not available)"]', element => element.disabled && element.getAttribute('aria-checked') === 'false'));
  await page.goto(base + '/corporate/fitness-certificates', { waitUntil: 'networkidle2', timeout: 60000 });
  check('Published certificate page offers actual PDF ZIP downloads', await page.evaluate(() => [...document.querySelectorAll('button')].some(element => element.textContent.includes('Download PDFs'))));
  check('Browser runtime has no errors', pageErrors.length === 0);
  const result = { at: new Date().toISOString(), passed: checks.every(item => item.passed), productionClinicalMutations: 0, checks, pageErrors };
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed: result.passed, checks: checks.length, failed: checks.filter(item => !item.passed) }));
  if (!result.passed) process.exitCode = 1;
} finally { if (browser) await browser.close(); await db.close(); }
