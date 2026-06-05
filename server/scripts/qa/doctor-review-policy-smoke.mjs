#!/usr/bin/env node

/**
 * Doctor review consultation policy smoke test
 *
 * Validates end-to-end booking behavior:
 * 1) Book one base consultation (online)
 * 2) Book first review consultation => free (fee 0, freeReviewApplied true)
 * 3) Book second review consultation => billable (fee > 0, freeReviewApplied false)
 *
 * The script is resilient to slot conflicts: it discovers candidate slots from
 * /api/enhanced-appointments/available-slots and skips conflicting 409 bookings.
 *
 * Usage:
 *   BASE_URL=https://app.mediqzy.com \
 *   DOCTOR_EMAIL=doctor@mediczy.com \
 *   DOCTOR_PASSWORD=Doctor123 \
 *   node scripts/qa/doctor-review-policy-smoke.mjs
 */

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8888').replace(/\/$/, '');
const DOCTOR_EMAIL = process.env.DOCTOR_EMAIL || 'testdoctor@mediczy.com';
const DOCTOR_PASSWORD = process.env.DOCTOR_PASSWORD || 'Doctor123!';
const MAX_LOOKAHEAD_DAYS = Number.parseInt(process.env.MAX_LOOKAHEAD_DAYS || '180', 10);
const MAX_CANDIDATES = Number.parseInt(process.env.MAX_CANDIDATES || '25', 10);

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

  return { status: res.status, body };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function collectCandidateSlots(token, doctorId) {
  const candidates = [];
  const today = new Date();

  for (let i = 1; i <= MAX_LOOKAHEAD_DAYS && candidates.length < MAX_CANDIDATES; i += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dateText = formatDate(date);

    const slotsResp = await request(
      `/api/enhanced-appointments/available-slots?doctorId=${doctorId}&date=${dateText}&consultationType=online`,
      { headers: authHeaders(token) }
    );

    if (slotsResp.status !== 200 || !Array.isArray(slotsResp.body?.availableSlots)) {
      continue;
    }

    const free = slotsResp.body.availableSlots.find((slot) => {
      if (!slot || typeof slot.timeSlot !== 'string') return false;
      return slot.availability === 'Available' || slot.available === true;
    });

    if (free) {
      candidates.push({ date: dateText, timeSlot: free.timeSlot });
    }
  }

  return candidates;
}

async function bookWithRetry({ token, doctorId, consultationType, symptoms, candidates, used }) {
  for (const candidate of candidates) {
    const key = `${candidate.date}|${candidate.timeSlot}`;
    if (used.has(key)) continue;

    const booking = await request('/api/enhanced-appointments/book', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        doctorId,
        appointmentDate: candidate.date,
        timeSlot: candidate.timeSlot,
        consultationType,
        symptoms,
      }),
    });

    if (booking.status === 201) {
      used.add(key);
      return { ok: true, booking, candidate };
    }

    if (booking.status === 409) {
      continue;
    }

    return { ok: false, booking, candidate };
  }

  return {
    ok: false,
    candidate: null,
    booking: {
      status: 409,
      body: { message: 'No non-conflicting candidate slots found' },
    },
  };
}

async function run() {
  console.log(`Running doctor review policy smoke against ${BASE_URL}`);

  const login = await request('/api/doctors/login', {
    method: 'POST',
    body: JSON.stringify({ email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD }),
  });

  if (login.status !== 200 || !login.body?.token || !login.body?.doctor?.id) {
    fail('Doctor login', `status=${login.status} body=${JSON.stringify(login.body)}`);
    printAndExit();
    return;
  }

  const token = login.body.token;
  const doctorId = login.body.doctor.id;
  pass('Doctor login', `doctorId=${doctorId}`);

  const candidates = await collectCandidateSlots(token, doctorId);
  if (candidates.length < 3) {
    fail('Candidate slots discovery', `found=${candidates.length}`);
    printAndExit();
    return;
  }
  pass('Candidate slots discovery', candidates.slice(0, 8).map((slot) => `${slot.date} ${slot.timeSlot}`).join(' | '));

  const used = new Set();

  const base = await bookWithRetry({
    token,
    doctorId,
    consultationType: 'online',
    symptoms: 'Base consultation smoke',
    candidates,
    used,
  });

  if (!base.ok) {
    fail(
      'Base consultation booking',
      `status=${base.booking.status} message=${base.booking.body?.message || 'n/a'} error=${base.booking.body?.error || 'n/a'}`
    );
    printAndExit();
    return;
  }

  pass(
    'Base consultation booking',
    `appointmentId=${base.booking.body?.appointment?.id || 'n/a'} slot=${base.candidate.date} ${base.candidate.timeSlot}`
  );

  const firstReview = await bookWithRetry({
    token,
    doctorId,
    consultationType: 'review',
    symptoms: 'First review smoke',
    candidates,
    used,
  });

  if (!firstReview.ok) {
    fail(
      'First review booking',
      `status=${firstReview.booking.status} message=${firstReview.booking.body?.message || 'n/a'} error=${firstReview.booking.body?.error || 'n/a'}`
    );
    printAndExit();
    return;
  }

  const firstReviewFee = Number(firstReview.booking.body?.appointment?.fees?.totalFee ?? NaN);
  const firstReviewApplied = Boolean(firstReview.booking.body?.appointment?.freeReviewApplied);

  if (firstReviewFee === 0 && firstReviewApplied) {
    pass(
      'First review is free',
      `appointmentId=${firstReview.booking.body?.appointment?.id || 'n/a'} fee=${firstReviewFee} freeReviewApplied=${firstReviewApplied}`
    );
  } else {
    fail(
      'First review is free',
      `fee=${Number.isNaN(firstReviewFee) ? 'n/a' : firstReviewFee} freeReviewApplied=${firstReviewApplied}`
    );
  }

  const secondReview = await bookWithRetry({
    token,
    doctorId,
    consultationType: 'review',
    symptoms: 'Second review smoke',
    candidates,
    used,
  });

  if (!secondReview.ok) {
    fail(
      'Second review booking',
      `status=${secondReview.booking.status} message=${secondReview.booking.body?.message || 'n/a'} error=${secondReview.booking.body?.error || 'n/a'}`
    );
    printAndExit();
    return;
  }

  const secondReviewFee = Number(secondReview.booking.body?.appointment?.fees?.totalFee ?? NaN);
  const secondReviewApplied = Boolean(secondReview.booking.body?.appointment?.freeReviewApplied);

  if (Number.isFinite(secondReviewFee) && secondReviewFee > 0 && !secondReviewApplied) {
    pass(
      'Second review is billable',
      `appointmentId=${secondReview.booking.body?.appointment?.id || 'n/a'} fee=${secondReviewFee} freeReviewApplied=${secondReviewApplied}`
    );
  } else {
    fail(
      'Second review is billable',
      `fee=${Number.isNaN(secondReviewFee) ? 'n/a' : secondReviewFee} freeReviewApplied=${secondReviewApplied}`
    );
  }

  printAndExit();
}

function printAndExit() {
  console.log('\nDoctor Review Policy Smoke');
  console.log('==========================');
  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name} - ${result.detail}`);
  }

  const failed = results.filter((result) => !result.ok).length;
  console.log(`\nSummary: ${results.length - failed}/${results.length} PASS`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  fail('Smoke runtime', error.message || String(error));
  printAndExit();
  process.exitCode = 1;
});
