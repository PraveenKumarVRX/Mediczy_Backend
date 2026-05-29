/**
 * Mediczy Video Call E2E Test
 * Tests the complete video consultation flow between patient and doctor
 * 
 * Usage: cd /home/ubuntu/Mediczy/server && node tests/video-e2e-test.mjs
 */

import jwt from 'jsonwebtoken';
import pg from 'pg';

const BASE = 'http://localhost:8888/api';
const DB_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'mediczy_helper',
  password: process.env.POSTGRES_PASSWORD || (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined),
  database: process.env.POSTGRES_DATABASE || process.env.POSTGRES_DB || 'mediczy_ai',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

const PATIENT_EMAIL = process.env.VIDEO_TEST_PATIENT_EMAIL || 'user@mediczy.com';
const PATIENT_PASSWORD = process.env.VIDEO_TEST_PATIENT_PASSWORD || 'User123';
const DOCTOR_EMAIL = process.env.VIDEO_TEST_DOCTOR_EMAIL || 'doctor@mediczy.com';
const DOCTOR_PASSWORD = process.env.VIDEO_TEST_DOCTOR_PASSWORD || 'Doctor123';

let activePatientEmail = PATIENT_EMAIL;
let activePatientPassword = PATIENT_PASSWORD;

let testAppointmentId = null;
let passed = 0;
let failed = 0;
let warnings = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}` + (detail ? ` (${detail})` : ''));
    passed++;
  } else {
    console.log(`  ❌ ${label}` + (detail ? ` (${detail})` : ''));
    failed++;
  }
}

function warn(label, detail = '') {
  console.log(`  ⚠️  ${label}` + (detail ? ` (${detail})` : ''));
  warnings++;
}

async function cleanup() {
  if (testAppointmentId) {
    try {
      const c = new pg.Client(DB_CONFIG);
      await c.connect();
      await c.query('DELETE FROM appointments WHERE id=$1', [testAppointmentId]);
      await c.end();
      console.log(`\n🧹 Cleaned up test appointment ${testAppointmentId}`);
    } catch (e) {
      console.log(`\n⚠️  Cleanup failed: ${e.message}`);
    }
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loginWithRetry(url, payload, maxAttempts = 3) {
  let lastRes = null;
  let lastData = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    lastRes = res;
    lastData = data;

    if (res.status !== 429) return { res, data, attempt };

    const retryAfter = Number(res.headers.get('retry-after') || 0);
    const backoffMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 1500;
    warn('Rate limited on login, retrying', `attempt ${attempt}/${maxAttempts}, wait ${backoffMs}ms`);
    await sleep(backoffMs);
  }

  return { res: lastRes, data: lastData, attempt: maxAttempts };
}

async function registerFallbackPatient() {
  const seed = Date.now();
  const email = `video.e2e.${seed}@mediczy.test`;
  const password = `AutoUser123!${seed.toString().slice(-2)}`;
  const phone = `+91${String(seed).slice(-10)}`;

  const res = await fetch(`${BASE}/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'Video',
      lastName: 'E2EUser',
      phoneNumber: phone,
      dateOfBirth: '1994-05-10',
      gender: 'Male'
    })
  });

  const data = await res.json().catch(() => ({}));
  if (res.status >= 200 && res.status < 300) {
    activePatientEmail = email;
    activePatientPassword = password;
    console.log(`  ✅ Fallback patient created (${email})`);
    return true;
  }

  warn('Fallback patient registration failed', `HTTP ${res.status} ${data?.message || ''} ${JSON.stringify(data).slice(0, 220)}`);
  return false;
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   MEDICZY VIDEO CALL E2E TEST                      ║');
  console.log(`║   Patient: ${PATIENT_EMAIL} / ${PATIENT_PASSWORD.padStart(7, '*')}              ║`);
  console.log(`║   Doctor:  ${DOCTOR_EMAIL} / ${DOCTOR_PASSWORD.padStart(7, '*')}           ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Run at: ${new Date().toISOString()}\n`);

  // ── STEP 1: Patient Login ──
  console.log('── STEP 1: Patient Login ──');
  let patientToken;
  let patientId;
  try {
    let { res, data } = await loginWithRetry(
      `${BASE}/users/login`,
      { email: activePatientEmail, password: activePatientPassword }
    );

    if (!(res.status === 200 && data?.token && data?.user)) {
      const created = await registerFallbackPatient();
      if (created) {
        ({ res, data } = await loginWithRetry(
          `${BASE}/users/login`,
          { email: activePatientEmail, password: activePatientPassword }
        ));
      }
    }

    assert('Patient login HTTP 200', res.status === 200, `got ${res.status}`);
    assert('Patient login success', !!data.token && !!data.user, data.message || '');
    assert('Patient token received', !!data.token, data.token ? 'JWT present' : 'missing');
    patientToken = data.token;
    patientId = data.user?.id;
    assert('Patient ID extracted', !!patientId, `id=${patientId}`);
  } catch (e) {
    assert('Patient login request', false, e.message);
    await cleanup();
    return;
  }

  // ── STEP 2: Doctor Login ──
  console.log('\n── STEP 2: Doctor Login ──');
  let doctorToken;
  let doctorId;
  try {
    const { res, data } = await loginWithRetry(
      `${BASE}/doctors/login`,
      { email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD }
    );
    assert('Doctor login HTTP 200', res.status === 200, `got ${res.status}`);
    assert('Doctor login success', !!data.token && !!data.doctor, data.message || '');
    assert('Doctor token received', !!data.token, data.token ? 'JWT present' : 'missing');
    doctorToken = data.token;
    doctorId = data.doctor?.id;
    assert('Doctor ID extracted', !!doctorId, `id=${doctorId}`);
  } catch (e) {
    assert('Doctor login request', false, e.message);
    await cleanup();
    return;
  }

  // ── STEP 3: Book Online Appointment ──
  console.log('\n── STEP 3: Book Online Appointment ──');
  try {
    const now = new Date();
    // book for 5 mins from now to be within the join window
    const future = new Date(now.getTime() + 5 * 60 * 1000);
    const aptDate = future.toISOString().split('T')[0];
    const aptTime = `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`;

    const res = await fetch(`${BASE}/consultation/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify({
        doctorId,
        appointmentDate: aptDate,
        appointmentTime: aptTime,
        consultationType: 'online',
        symptoms: 'E2E test - video call verification',
        reason: 'Automated video call test'
      })
    });
    const data = await res.json();
    assert('Booking HTTP 2xx', res.status >= 200 && res.status < 300, `got ${res.status}`);
    assert('Booking success', data.success === true, data.message || '');
    testAppointmentId = data.appointment?.id;
    assert('Appointment ID received', !!testAppointmentId, `id=${testAppointmentId}`);
    assert('Appointment status', data.appointment?.status !== undefined, `status=${data.appointment?.status}`);

    if (!testAppointmentId) {
      console.log('  FULL RESPONSE:', JSON.stringify(data, null, 2));
      await cleanup();
      return;
    }
  } catch (e) {
    assert('Book appointment request', false, e.message);
    await cleanup();
    return;
  }

  // ── STEP 4: Confirm & Mark Paid (simulate payment) ──
  console.log('\n── STEP 4: Confirm & Mark Paid ──');
  try {
    const c = new pg.Client(DB_CONFIG);
    await c.connect();
    const updateRes = await c.query(
      `UPDATE appointments SET status='confirmed', "paymentStatus"='paid' WHERE id=$1 RETURNING status, "paymentStatus"`,
      [testAppointmentId]
    );
    assert('DB update succeeded', updateRes.rowCount === 1);
    assert('Status = confirmed', updateRes.rows[0]?.status === 'confirmed');
    assert('Payment = paid', updateRes.rows[0]?.paymentStatus === 'paid');
    await c.end();
  } catch (e) {
    assert('DB update', false, e.message);
    await cleanup();
    return;
  }

  // ── STEP 5: Patient Joins Video ──
  console.log('\n── STEP 5: Patient Joins Video ──');
  let patientVideoData;
  try {
    const res = await fetch(`${BASE}/consultation/video/join/${testAppointmentId}`, {
      headers: { 'Authorization': `Bearer ${patientToken}` }
    });
    const data = await res.json();
    patientVideoData = data;
    assert('Patient join HTTP 200', res.status === 200, `got ${res.status}`);
    assert('Patient join success', data.success === true, data.message || '');
    assert('Meeting ID present', !!data.video?.meetingId, data.video?.meetingId || 'missing');
    assert('LiveKit token present', !!data.video?.livekit?.token, data.video?.livekit?.token ? 'JWT present' : 'missing');
    assert('LiveKit serverUrl present', !!data.video?.livekit?.serverUrl, data.video?.livekit?.serverUrl || 'missing');
    assert('LiveKit roomName present', !!data.video?.livekit?.roomName, data.video?.livekit?.roomName || 'missing');
    assert('ServerUrl is wss://', data.video?.livekit?.serverUrl?.startsWith('wss://'), data.video?.livekit?.serverUrl || '');

    if (data.video?.livekit?.token) {
      const decoded = jwt.decode(data.video.livekit.token);
      assert('Patient token has video grant', !!decoded?.video, JSON.stringify(decoded?.video || {}));
      assert('Patient canPublish=true', decoded?.video?.canPublish === true);
      assert('Patient canSubscribe=true', decoded?.video?.canSubscribe === true);
    }
  } catch (e) {
    assert('Patient join request', false, e.message);
  }

  // ── STEP 6: Doctor Joins Video ──
  console.log('\n── STEP 6: Doctor Joins Video ──');
  let doctorVideoData;
  try {
    const res = await fetch(`${BASE}/consultation/video/join/${testAppointmentId}`, {
      headers: { 'Authorization': `Bearer ${doctorToken}` }
    });
    const data = await res.json();
    doctorVideoData = data;
    assert('Doctor join HTTP 200', res.status === 200, `got ${res.status}`);
    assert('Doctor join success', data.success === true, data.message || '');
    assert('Meeting ID present', !!data.video?.meetingId, data.video?.meetingId || 'missing');
    assert('LiveKit token present', !!data.video?.livekit?.token, data.video?.livekit?.token ? 'JWT present' : 'missing');
    assert('LiveKit serverUrl present', !!data.video?.livekit?.serverUrl, data.video?.livekit?.serverUrl || 'missing');
    assert('LiveKit roomName present', !!data.video?.livekit?.roomName, data.video?.livekit?.roomName || 'missing');

    if (data.video?.livekit?.token) {
      const decoded = jwt.decode(data.video.livekit.token);
      assert('Doctor token has video grant', !!decoded?.video, JSON.stringify(decoded?.video || {}));
      assert('Doctor canPublish=true', decoded?.video?.canPublish === true);
    }
  } catch (e) {
    assert('Doctor join request', false, e.message);
  }

  // ── STEP 7: Cross-validate Tokens ──
  console.log('\n── STEP 7: Cross-validate Tokens ──');
  try {
    const pToken = jwt.decode(patientVideoData?.video?.livekit?.token);
    const dToken = jwt.decode(doctorVideoData?.video?.livekit?.token);

    assert('Both tokens decoded', !!pToken && !!dToken);
    assert('Same room assigned', pToken?.video?.room === dToken?.video?.room, 
      `patient=${pToken?.video?.room} doctor=${dToken?.video?.room}`);
    assert('Different identities', pToken?.sub !== dToken?.sub, 
      `patient=${pToken?.sub} doctor=${dToken?.sub}`);
    assert('Patient token not expired', (pToken?.exp || 0) > Date.now() / 1000);
    assert('Doctor token not expired', (dToken?.exp || 0) > Date.now() / 1000);
  } catch (e) {
    assert('Token cross-validation', false, e.message);
  }

  // ── STEP 8: LiveKit Server Health ──
  console.log('\n── STEP 8: LiveKit Server Health ──');
  try {
    const res = await fetch('http://localhost:7880');
    assert('LiveKit HTTP reachable', res.status === 200, `status=${res.status}`);
  } catch (e) {
    assert('LiveKit local reachable', false, e.message);
  }

  try {
    const res = await fetch('https://video.mediqzy.com', { redirect: 'manual' });
    assert('LiveKit HTTPS reachable', res.status >= 200 && res.status < 400, `status=${res.status}`);
  } catch (e) {
    warn('LiveKit HTTPS check', e.message);
  }

  // ── STEP 9: Video Token API (direct) ──
  console.log('\n── STEP 9: Direct Video Token API ──');
  try {
    const res = await fetch(`${BASE}/video/room/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify({ roomId: 'test-room-e2e' })
    });
    const data = await res.json();
    assert('Direct token API responds', res.status === 200 || res.status === 201, `status=${res.status}`);
    if (res.status === 200) {
      assert('Direct token has room data', !!data.roomToken || !!data.livekit || !!data.token, `keys=${Object.keys(data).join(',')}`);
    }
  } catch (e) {
    warn('Direct video token API', e.message);
  }

  // ── STEP 10: Video System Test Endpoint ──
  console.log('\n── STEP 10: Video System Test ──');
  try {
    const res = await fetch(`${BASE}/video/test`, {
      headers: { 'Authorization': `Bearer ${patientToken}` }
    });
    const data = await res.json();
    assert('Video test endpoint', res.status === 200, `status=${res.status}`);
    assert('Video system healthy', data.success === true || data.status === 'ok', JSON.stringify(data).substring(0, 100));
  } catch (e) {
    warn('Video test endpoint', e.message);
  }

  // ── Cleanup ──
  await cleanup();

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log('╚══════════════════════════════════════════════════════╝');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(e => {
  console.error('Fatal error:', e);
  cleanup().then(() => process.exit(2));
});
