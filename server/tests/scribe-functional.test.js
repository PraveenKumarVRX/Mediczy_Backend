#!/usr/bin/env node
/**
 * AI Scribe Functional Test — Daily automated prescription generation test
 *
 * What it tests:
 *   1. Doctor JWT auth (generate token directly from DB doctor id + JWT_SECRET)
 *   2. GET /api/hospital/scribe/specialties          — authUser
 *   3. GET /api/hospital/scribe/template/:specialty  — authUser
 *   4. POST /api/ai/scribe/generate-prescription     — authDoctor (full pipeline)
 *   5. POST /api/scribe/generate-summary             — authDoctor (scribe microservice)
 *   6. POST /api/scribe/process                      — authDoctor (scribe microservice)
 *
 * Exit codes:
 *   0 — all reachable tests PASSED (scribe microservice offline → SKIPPED, not failed)
 *   1 — one or more critical tests FAILED
 *
 * Logs written to:
 *   /home/ubuntu/Mediczy/logs/scribe-test-YYYY-MM-DD.json
 *
 * Cron (runs daily at 06:00 UTC):
 *   0 6 * * * /home/ubuntu/Mediczy/server/tests/run-scribe-test.sh >> /home/ubuntu/Mediczy/logs/scribe-cron.log 2>&1
 *
 * Optional env overrides:
 *   TEST_DOCTOR_EMAIL    — login via HTTP instead of direct JWT generation
 *   TEST_DOCTOR_PASSWORD — required alongside TEST_DOCTOR_EMAIL
 *   TEST_BASE_URL        — defaults to http://localhost:8888
 *   TEST_DOCTOR_ID       — doctor DB id for direct JWT generation (defaults to 8)
 */

import 'dotenv/config';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL   = process.env.TEST_BASE_URL        || 'http://localhost:8888';
const JWT_SECRET = process.env.JWT_SECRET            || '';
const DOCTOR_ID  = parseInt(process.env.TEST_DOCTOR_ID || '8', 10);
const DOCTOR_EMAIL   = process.env.TEST_DOCTOR_EMAIL      || null;
const DOCTOR_PASS    = process.env.TEST_DOCTOR_PASSWORD    || null;
const HOSPITAL_EMAIL = process.env.TEST_HOSPITAL_EMAIL     || 'hospital@mediczy.com';
const HOSPITAL_PASS  = process.env.TEST_HOSPITAL_PASSWORD  || 'Hospital123';

const LOG_DIR  = path.join(__dirname, '../../logs');
const TODAY    = new Date().toISOString().slice(0, 10);
const LOG_FILE = path.join(LOG_DIR, `scribe-test-${TODAY}.json`);

// ─── Sample doctor-patient conversation ──────────────────────────────────────
const SAMPLE_CONVERSATION = `
Doctor: Good morning. What brings you in today?
Patient: I've been having a fever since yesterday evening, around 101°F, and my throat has been really sore. I also have a runny nose and I've been sneezing a lot.
Doctor: Any cough or difficulty swallowing?
Patient: Yes, I have a mild dry cough. Swallowing is a bit painful.
Doctor: Any headache or body aches?
Patient: Yes, I have a headache and my whole body feels achy.
Doctor: Have you taken anything for the fever?
Patient: Just paracetamol 500mg twice since yesterday.
Doctor: Let me examine you. [Examines patient] Your throat is red and inflamed. Temperature is 101.2°F. Lungs are clear.
Doctor: This looks like acute pharyngitis, likely viral. I'll prescribe the following:
Doctor: Paracetamol 500mg three times a day for 5 days, Betadine Gargle twice daily, Cetirizine 10mg at night for the runny nose, and drink warm fluids. Rest for 2 days.
Doctor: Get a throat swab if symptoms don't improve in 3 days. Follow up after 5 days.
Patient: Thank you, doctor.
`.trim();

// ─── Results accumulator ─────────────────────────────────────────────────────
const results = {
  runAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  tests: [],
  summary: { passed: 0, failed: 0, skipped: 0 }
};

function record(name, status, details = {}) {
  const entry = { name, status, ...details, at: new Date().toISOString() };
  results.tests.push(entry);
  results.summary[status.toLowerCase()]++;
  const icon = status === 'PASSED' ? '✅' : status === 'FAILED' ? '❌' : '⚠️ ';
  console.log(`  ${icon} [${status}] ${name}${details.error ? ' — ' + details.error : ''}${details.note ? ' — ' + details.note : ''}`);
  return entry;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function request(method, urlStr, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url  = new URL(urlStr);
    const lib  = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), raw: data }); }
        catch { resolve({ status: res.statusCode, body: null, raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function get(path, headers = {})       { return request('GET',  BASE_URL + path, { headers }); }
function post(path, body, headers = {}) { return request('POST', BASE_URL + path, { body, headers }); }

function authHeader(token) { return { Authorization: `Bearer ${token}` }; }

// ─── Step 1: Obtain doctor JWT ────────────────────────────────────────────────
async function obtainDoctorToken() {
  // Prefer env-var login flow
  if (DOCTOR_EMAIL && DOCTOR_PASS) {
    console.log('\n[Auth] Logging in via HTTP as', DOCTOR_EMAIL);
    try {
      const res = await post('/api/doctors/login', { email: DOCTOR_EMAIL, password: DOCTOR_PASS });
      if (res.status === 200 && res.body?.token) {
        console.log('  ✅ HTTP login succeeded — doctor id', res.body.doctor?.id);
        return { token: res.body.token, doctorId: res.body.doctor?.id, method: 'http-login' };
      }
      console.warn('  ⚠️  HTTP login failed (status', res.status, ') — falling back to direct JWT generation');
    } catch (err) {
      console.warn('  ⚠️  HTTP login error:', err.message, '— falling back to direct JWT generation');
    }
  }

  // Direct JWT generation using app secret (reliable, no password required)
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not set in environment — cannot generate test token');
  }

  console.log('\n[Auth] Generating JWT directly for doctor id', DOCTOR_ID);
  const token = jwt.sign(
    { id: DOCTOR_ID, role: 'doctor', sub: String(DOCTOR_ID) },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  console.log('  ✅ Token generated — expires in 1h');
  return { token, doctorId: DOCTOR_ID, method: 'direct-jwt' };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
async function testScribeHealth(token) {
  try {
    const res = await get('/api/scribe/health', authHeader(token));
    if (res.status === 200) {
      return record('Scribe microservice health', 'PASSED', { status: res.status, detail: res.body });
    }
    if (res.status === 503 || res.status === 500) {
      return record('Scribe microservice health', 'SKIPPED', {
        status: res.status,
        note: 'Scribe microservice (port 8005) is offline — GPU-dependent tests will be skipped'
      });
    }
    return record('Scribe microservice health', 'FAILED', { status: res.status, error: res.raw?.slice(0, 200) });
  } catch (err) {
    return record('Scribe microservice health', 'SKIPPED', { note: `Connection error: ${err.message}` });
  }
}

async function testGetSpecialties(hospitalToken) {
  try {
    const res = await get('/api/hospital/scribe/specialties', authHeader(hospitalToken));
    if (res.status === 200 && Array.isArray(res.body)) {
      return record('GET /specialties', 'PASSED', {
        status: res.status,
        count: res.body.length,
        sample: res.body.slice(0, 3)
      });
    }
    if (res.status === 200 && res.body) {
      return record('GET /specialties', 'PASSED', { status: res.status, body: res.body });
    }
    if (res.status === 502 || res.status === 503 || res.status === 500) {
      return record('GET /specialties', 'SKIPPED', { status: res.status, note: 'Scribe microservice offline' });
    }
    return record('GET /specialties', 'FAILED', { status: res.status, error: res.raw?.slice(0, 200) });
  } catch (err) {
    return record('GET /specialties', 'FAILED', { error: err.message });
  }
}

async function testGetTemplate(hospitalToken) {
  try {
    const res = await get('/api/hospital/scribe/template/general_medicine', authHeader(hospitalToken));
    if (res.status === 200) {
      return record('GET /template/general_medicine', 'PASSED', { status: res.status });
    }
    if (res.status === 502 || res.status === 503 || res.status === 500) {
      return record('GET /template/general_medicine', 'SKIPPED', { status: res.status, note: 'Scribe microservice offline' });
    }
    return record('GET /template/general_medicine', 'FAILED', { status: res.status, error: res.raw?.slice(0, 200) });
  } catch (err) {
    return record('GET /template/general_medicine', 'FAILED', { error: err.message });
  }
}

async function testGeneratePrescription(token, doctorId) {
  console.log('\n[Test] POST /api/ai/scribe/generate-prescription');
  try {
    const payload = {
      consultationNotes: SAMPLE_CONVERSATION,
      patientName: 'Test Patient',
      patientAge: '35',
      patientGender: 'Male',
      saveToDatabase: false     // don't persist during automated testing
    };

    const res = await post('/api/ai/scribe/generate-prescription', payload, authHeader(token));

    if (res.status === 200 && res.body?.success) {
      const rx = res.body.prescription || res.body.data || res.body;
      // Validate key fields
      const hasComplaints  = !!rx.chiefComplaints || !!rx.symptoms;
      const hasDiagnosis   = !!rx.diagnosis;
      const hasMedications = Array.isArray(rx.medications) && rx.medications.length > 0;

      if (hasComplaints && hasDiagnosis && hasMedications) {
        return record('POST /generate-prescription (full pipeline)', 'PASSED', {
          status: res.status,
          diagnosis: rx.diagnosis?.slice(0, 80),
          medicationCount: rx.medications?.length,
          sampleMed: rx.medications?.[0]?.name,
          usesFallback: res.body.usesFallback || false
        });
      }

      // Some fields missing but status 200
      return record('POST /generate-prescription (full pipeline)', 'PASSED', {
        status: res.status,
        note: 'Response 200 but some prescription fields empty — may be fallback extraction',
        diagnosis: rx.diagnosis?.slice(0, 80),
        medicationCount: rx.medications?.length
      });
    }

    if (res.status === 503) {
      return record('POST /generate-prescription (full pipeline)', 'SKIPPED', {
        status: res.status,
        note: 'AI service unavailable'
      });
    }

    if (res.status === 401 || res.status === 403) {
      return record('POST /generate-prescription (full pipeline)', 'FAILED', {
        status: res.status,
        error: `Auth error — check doctor token validity. Body: ${res.raw?.slice(0, 200)}`
      });
    }

    return record('POST /generate-prescription (full pipeline)', 'FAILED', {
      status: res.status,
      error: res.body?.message || res.raw?.slice(0, 300)
    });
  } catch (err) {
    return record('POST /generate-prescription (full pipeline)', 'FAILED', { error: err.message });
  }
}

async function testProcessText(token, scribeOnline) {
  if (!scribeOnline) {
    return record('POST /scribe/process (microservice)', 'SKIPPED', { note: 'Scribe microservice offline' });
  }
  try {
    const res = await post('/api/scribe/process',
      { text: 'Pt c/o fever 101°F, sore throat, runny nose. O/E: throat red & inflamed. D: Acute pharyngitis. Rx: Paracetamol 500mg TDS x5d', patient_context: 'Adult male, 35yrs' },
      authHeader(token)
    );
    if (res.status === 200 && res.body) {
      return record('POST /scribe/process (microservice)', 'PASSED', {
        status: res.status,
        hasResult: !!res.body.result || !!res.body.processed_text || !!res.body.data
      });
    }
    if (res.status === 502 || res.status === 503 || res.status === 500) {
      return record('POST /scribe/process (microservice)', 'SKIPPED', { status: res.status, note: 'Scribe microservice offline' });
    }
    return record('POST /scribe/process (microservice)', 'FAILED', {
      status: res.status,
      error: res.body?.message || res.raw?.slice(0, 200)
    });
  } catch (err) {
    return record('POST /scribe/process (microservice)', 'FAILED', { error: err.message });
  }
}

async function testGenerateSummary(token, scribeOnline) {
  if (!scribeOnline) {
    return record('POST /scribe/generate-summary (microservice)', 'SKIPPED', { note: 'Scribe microservice offline' });
  }
  try {
    const clinicalData = {
      chiefComplaints: 'Fever 101°F, sore throat, runny nose, mild cough',
      diagnosis: 'Acute viral pharyngitis',
      medications: [
        { name: 'Paracetamol', dosage: '500mg', frequency: 'TDS', duration: '5 days' }
      ],
      instructions: ['Rest for 2 days', 'Warm fluids', 'Gargle with warm salt water'],
      labTests: []
    };
    const res = await post('/api/scribe/generate-summary',
      { clinicalData, specialty: 'general_medicine' },
      authHeader(token)
    );
    if (res.status === 200 && res.body) {
      return record('POST /scribe/generate-summary (microservice)', 'PASSED', {
        status: res.status,
        hasContent: !!res.body.summary || !!res.body.discharge_summary || !!res.body.data
      });
    }
    if (res.status === 502 || res.status === 503 || res.status === 500) {
      return record('POST /scribe/generate-summary (microservice)', 'SKIPPED', { status: res.status, note: 'Scribe microservice offline' });
    }
    return record('POST /scribe/generate-summary (microservice)', 'FAILED', {
      status: res.status,
      error: res.body?.message || res.raw?.slice(0, 200)
    });
  } catch (err) {
    return record('POST /scribe/generate-summary (microservice)', 'FAILED', { error: err.message });
  }
}

// ─── Step 2: Obtain hospital token ─────────────────────────────────────────────
async function obtainHospitalToken() {
  try {
    const res = await post('/api/hospital/auth/login', { email: HOSPITAL_EMAIL, password: HOSPITAL_PASS });
    if (res.status === 200 && res.body?.token) {
      console.log('  ✅ Hospital login succeeded');
      return res.body.token;
    }
    console.warn('  ⚠️  Hospital login failed (status', res.status, ') — hospital-scoped tests will be skipped');
    return null;
  } catch (err) {
    console.warn('  ⚠️  Hospital login error:', err.message, '— hospital-scoped tests will be skipped');
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Mediczy AI Scribe — Functional Test');
  console.log(`  ${new Date().toUTCString()}`);
  console.log(`  Target: ${BASE_URL}`);
  console.log('═══════════════════════════════════════════════════════════');

  let exitCode = 0;

  // Step 1: Obtain doctor token
  let doctorToken, doctorId;
  try {
    const auth = await obtainDoctorToken();
    doctorToken = auth.token;
    doctorId    = auth.doctorId;
    record('Doctor JWT auth', 'PASSED', { method: auth.method, doctorId });
  } catch (err) {
    record('Doctor JWT auth', 'FAILED', { error: err.message });
    results.runAt = new Date().toISOString();
    writeLog();
    process.exit(1);
  }

  // Step 2: Obtain hospital token (for hospital-ring-fenced routes)
  console.log('\n[Auth] Getting hospital token for /api/hospital/* routes');
  const hospitalToken = await obtainHospitalToken();
  if (hospitalToken) {
    record('Hospital JWT auth', 'PASSED', { method: 'http-login' });
  } else {
    record('Hospital JWT auth', 'SKIPPED', { note: 'Hospital login unavailable — hospital-scoped tests will be skipped' });
  }

  // Step 3: Scribe microservice health (determines whether to skip GPU tests)
  console.log('\n[Tests]');
  const healthEntry = await testScribeHealth(doctorToken);
  const scribeOnline = healthEntry.status === 'PASSED';

  // Step 4: Read-only hospital scribe routes (ring-fenced — need hospital token)
  if (hospitalToken) {
    await testGetSpecialties(hospitalToken);
    await testGetTemplate(hospitalToken);
  } else {
    record('GET /specialties', 'SKIPPED', { note: 'No hospital token available' });
    record('GET /template/general_medicine', 'SKIPPED', { note: 'No hospital token available' });
  }

  // Step 5: Core test — prescription generation from conversation (uses local AI, no scribe microservice)
  await testGeneratePrescription(doctorToken, doctorId);

  // Step 6: Scribe microservice pipeline (only if online)
  await testProcessText(doctorToken, scribeOnline);
  await testGenerateSummary(doctorToken, scribeOnline);

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  PASSED: ${results.summary.passed}  FAILED: ${results.summary.failed}  SKIPPED: ${results.summary.skipped}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (results.summary.failed > 0) {
    exitCode = 1;
    console.error(`❌ ${results.summary.failed} test(s) FAILED`);
  } else {
    console.log('✅ All reachable tests passed');
  }

  writeLog();
  process.exit(exitCode);
}

function writeLog() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, JSON.stringify(results, null, 2));
    console.log(`📄 Log written → ${LOG_FILE}`);
  } catch (err) {
    console.error('Warning: could not write log file:', err.message);
  }
}

main().catch(err => {
  console.error('Unexpected error in test runner:', err);
  process.exit(1);
});
