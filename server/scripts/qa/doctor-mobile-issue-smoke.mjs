#!/usr/bin/env node

/**
 * Doctor mobile issue smoke test
 *
 * Checks and reports pass/fail for:
 * 1) Availability toggle update
 * 2) Weekly schedule save
 * 3) Home status update (available/busy/offline)
 * 4) Prescription create
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:8888 DOCTOR_EMAIL=testdoctor@mediczy.com DOCTOR_PASSWORD=Doctor123! node scripts/qa/doctor-mobile-issue-smoke.mjs
 */

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8888').replace(/\/$/, '');
const DOCTOR_EMAIL = process.env.DOCTOR_EMAIL || 'testdoctor@mediczy.com';
const DOCTOR_PASSWORD = process.env.DOCTOR_PASSWORD || 'Doctor123!';

const results = [];

function record(check, ok, detail) {
  results.push({ check, status: ok ? 'PASS' : 'FAIL', detail });
}

async function request(path, init = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  };

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  return { res, body, url };
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function run() {
  console.log(`Running doctor mobile issue smoke against ${BASE_URL}`);

  // 0) Login
  const login = await request('/api/doctors/login', {
    method: 'POST',
    body: JSON.stringify({ email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD }),
  });

  if (!login.res.ok || !login.body?.token) {
    record('Doctor login', false, `HTTP ${login.res.status} ${JSON.stringify(login.body)}`);
    console.table(results);
    process.exitCode = 1;
    return;
  }

  const token = login.body.token;
  record('Doctor login', true, `HTTP ${login.res.status}`);

  // Snapshot current values for cleanup.
  const profile = await request('/api/doctors/profile', {
    headers: bearer(token),
  });
  const initialIsOnline = profile.body?.doctor?.isOnline;

  const availabilityBefore = await request('/api/doctors/availability', {
    headers: bearer(token),
  });
  const weeklyAvailabilityBefore = availabilityBefore.body?.data?.weeklyAvailability || null;

  // 1) Home status update -> busy
  const statusBusy = await request('/api/doctors/status', {
    method: 'PUT',
    headers: bearer(token),
    body: JSON.stringify({ status: 'busy' }),
  });

  const statusBusyOk = statusBusy.res.ok && statusBusy.body?.data?.status === 'busy';
  record('Home status update (busy)', statusBusyOk, `HTTP ${statusBusy.res.status}`);

  // Restore status to previous logical state.
  if (typeof initialIsOnline === 'boolean') {
    const restoreStatus = await request('/api/doctors/status', {
      method: 'PUT',
      headers: bearer(token),
      body: JSON.stringify({ isOnline: initialIsOnline }),
    });
    const restoreOk = restoreStatus.res.ok;
    record('Home status restore', restoreOk, `HTTP ${restoreStatus.res.status}`);
  }

  // 2) Availability toggle update
  const availabilityToggle = await request('/api/doctors/availability', {
    method: 'PUT',
    headers: bearer(token),
    body: JSON.stringify({ isAvailable: true }),
  });
  const availabilityToggleOk = availabilityToggle.res.ok && availabilityToggle.body?.success === true;
  record('Availability toggle update', availabilityToggleOk, `HTTP ${availabilityToggle.res.status}`);

  // 3) Weekly schedule save
  const weeklyPayload = {
    monday: {
      isAvailable: true,
      slots: [
        {
          startTime: '10:00',
          endTime: '12:00',
          consultationType: 'online',
          slotDuration: 30,
          maxPatients: 1,
        },
      ],
    },
  };

  const weeklySave = await request('/api/doctors/availability/bulk-update', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(weeklyPayload),
  });
  const weeklySaveOk = weeklySave.res.ok && weeklySave.body?.success === true;
  record('Weekly schedule save', weeklySaveOk, `HTTP ${weeklySave.res.status}`);

  // Restore original weekly availability if we captured it.
  if (weeklyAvailabilityBefore && typeof weeklyAvailabilityBefore === 'object') {
    const restoreWeekly = await request('/api/doctors/availability/bulk-update', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ weeklyAvailability: weeklyAvailabilityBefore }),
    });
    record('Weekly schedule restore', restoreWeekly.res.ok, `HTTP ${restoreWeekly.res.status}`);
  }

  // 4) Prescription create (mobile payload aliases)
  let createdPrescriptionId = null;
  const createRx = await request('/api/prescriptions', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({
      diagnosis: 'Smoke test diagnosis',
      patientName: 'Smoke Test Patient',
      medications: [
        {
          drugName: 'Paracetamol',
          dose: '500mg',
          freq: 'Twice daily',
          days: '3 days',
        },
      ],
      instructions: ['Take after food'],
      notes: 'Auto-cleanup smoke test',
    }),
  });

  const createRxOk = createRx.res.ok && createRx.body?.success === true && createRx.body?.prescription?.id;
  if (createRxOk) {
    createdPrescriptionId = createRx.body.prescription.id;
  }
  record('Prescription create', createRxOk, `HTTP ${createRx.res.status}`);

  if (createdPrescriptionId) {
    const cleanupRx = await request(`/api/prescriptions/${createdPrescriptionId}`, {
      method: 'DELETE',
      headers: bearer(token),
    });
    record('Prescription cleanup', cleanupRx.res.ok, `HTTP ${cleanupRx.res.status}`);
  }

  console.table(results);

  const failed = results.filter((r) => r.status === 'FAIL');
  if (failed.length > 0) {
    console.error(`\nDoctor mobile issue smoke failed: ${failed.length} check(s) failed.`);
    process.exitCode = 1;
    return;
  }

  console.log('\nDoctor mobile issue smoke passed.');
}

run().catch((error) => {
  console.error('Doctor mobile issue smoke crashed:', error);
  process.exitCode = 1;
});
