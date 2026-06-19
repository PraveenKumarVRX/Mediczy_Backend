#!/usr/bin/env node
/**
 * Targeted smoke test for doctor availability, vitals, and Dr. iSHA fixes.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');
const results = [];

function record(check, ok, detail = '') {
  results.push({ check, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? '✓' : '✗'} ${check}${detail ? ` — ${detail}` : ''}`);
}

function readServerFile(relPath) {
  return readFileSync(path.join(serverRoot, relPath), 'utf8');
}

function runStaticChecks() {
  const doctorRoute = readServerFile('routes/doctor.route.js');
  record(
    'vitals-history uses shared pool',
    doctorRoute.includes('await pool.query(') &&
      doctorRoute.includes('patient_vitals') &&
      !doctorRoute.includes('req.app.locals.pgPool'),
  );

  const llmProvider = readServerFile('services/ai-brain/llm-provider.js');
  record('SIB default port is 8001', llmProvider.includes("'http://localhost:8001'"));
  record('callSib forwards history array', llmProvider.includes('history: history.slice(-15)'));

  const medicalAi = readServerFile('routes/medical-ai.route.js');
  record(
    'medical-ai fallback includes conversation history',
    medicalAi.includes('historyMessages') && medicalAi.includes('conversationHistory'),
  );

  const availabilityRoute = readServerFile('routes/doctor-availability.route.js');
  record('availability router is defined', availabilityRoute.includes('const router = express.Router()'));
  record('dashboard returns slotDuration', availabilityRoute.includes('slotDuration: doctor.slotDuration'));
  record('bulk-update preserves slotDuration fields', availabilityRoute.includes('normalized.slotDuration = explicitDuration'));

  const doctorSettings = readServerFile('routes/doctor-settings.route.js');
  record('slot-duration accepts slotDuration alias', doctorSettings.includes('req.body.duration ?? req.body.slotDuration'));

  const welcomeEmail = readServerFile('services/welcome-email-template.util.js');
  record('welcome email supports {{employeeName}}', welcomeEmail.includes("'{{employeeName}}': employeeName"));
  record('welcome email legacy password literal supported', welcomeEmail.includes("'[generated securely at send time]'"));

  const welcomeTemplates = readServerFile('routes/welcomeEmailTemplates.route.js');
  record('template docs list {{employeeName}}', welcomeTemplates.includes('"{{employeeName}}"'));
}

async function runWelcomeEmailTemplateChecks() {
  const { renderTemplate, buildCorporateEmployeeTemplateVars } = await import('../../services/welcome-email-template.util.js');
  const vars = buildCorporateEmployeeTemplateVars({
    email: 'alice@corp.com',
    firstName: 'Alice',
    lastName: 'Singh',
    companyName: 'Ninjacart',
    employeeId: 'NC001',
    department: 'Ops',
  }, 'SecretPass12!');

  const html = renderTemplate(
    '<p>Dear {{employeeName}}, user {{email}} / {{ username }} pass {{temporaryPassword}}</p>',
    vars,
  );
  record('employeeName placeholder renders on send', html.includes('Dear Alice Singh,'));
  record('email placeholder renders on send', html.includes('alice@corp.com'));
  record('password placeholder renders on send', html.includes('SecretPass12!'));
  record(
    'legacy generated-password literal renders on send',
    renderTemplate('Password: [generated securely at send time]', vars).includes('SecretPass12!'),
  );
}

function runJestSuite() {
  const jestRun = spawnSync(
    'node',
    [
      '--experimental-vm-modules',
      './node_modules/jest/bin/jest.js',
      '--runInBand',
      '__tests__/doctor-availability-bulk-update.test.js',
    ],
    { cwd: serverRoot, encoding: 'utf8' }
  );

  const output = `${jestRun.stdout || ''}\n${jestRun.stderr || ''}`.trim();
  record('availability bulk-update jest suite', jestRun.status === 0, jestRun.status === 0 ? 'all tests passed' : output.slice(-400));
}

function runSyntaxChecks() {
  const files = [
    'routes/doctor-availability.route.js',
    'routes/doctor.route.js',
    'routes/doctor-settings.route.js',
    'routes/medical-ai.route.js',
    'services/ai-brain/llm-provider.js',
    'models/doctor.model.intelligent.js',
    'services/welcome-email.service.js',
    'services/welcome-email-template.util.js',
    'routes/welcomeEmailTemplates.route.js',
  ];

  for (const file of files) {
    const check = spawnSync('node', ['--check', file], { cwd: serverRoot, encoding: 'utf8' });
    record(`syntax ${file}`, check.status === 0, check.stderr?.trim() || '');
  }
}

console.log('=== Fix regression smoke test ===\n');
runSyntaxChecks();
console.log('');
runStaticChecks();
console.log('');
await runWelcomeEmailTemplateChecks();
console.log('');
runJestSuite();
console.log('\n=== Summary ===');
console.table(results);

const failed = results.filter((r) => r.status === 'FAIL');
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed.');
}
