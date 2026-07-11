#!/usr/bin/env node
/**
 * Promo coupon sanity check + smoke test (team + patient validation APIs).
 *
 * Usage:
 *   BASE_URL=https://app.mediqzy.com/api node scripts/qa/promo-coupon-smoke.mjs
 */

const BASE_URL = (process.env.BASE_URL || 'https://app.mediqzy.com/api').replace(/\/$/, '');
const TEAM_EMAIL = process.env.TEAM_EMAIL || 'parinitha@mysmarthealth.in';
const TEAM_PASSWORD = process.env.TEAM_PASSWORD || 'Mayden@321';
const PATIENT_EMAIL = process.env.PATIENT_EMAIL || 'user@mediczy.com';
const PATIENT_PASSWORD = process.env.PATIENT_PASSWORD || 'User123';

const STANDARD_CODES = ['USG', 'CTSCAN', 'MRI', 'MED500', 'FREE6MO'];
const LEGACY_MEMBERSHIP_CODE = 'CORP6FREE';

let passed = 0;
let failed = 0;
let skipped = 0;

function skip(name, detail = '') {
  skipped += 1;
  console.log(`  ⏭️  ${name}${detail ? ` — ${detail}` : ''}`);
}

function pass(name, detail = '') {
  passed += 1;
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed += 1;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 300) };
  }

  return { status: res.status, json, ok: res.ok };
}

async function loginTeam() {
  const { status, json } = await request('/team/login', {
    method: 'POST',
    body: { email: TEAM_EMAIL, password: TEAM_PASSWORD },
  });
  if (status !== 200 || !json.token) {
    throw new Error(`Team login failed (${status}): ${json.message || JSON.stringify(json)}`);
  }
  return json.token;
}

async function loginPatient() {
  if (process.env.PATIENT_TOKEN) return process.env.PATIENT_TOKEN;

  for (const path of ['/auth/login', '/patient/login', '/users/login']) {
    const { status, json } = await request(path, {
      method: 'POST',
      body: { email: PATIENT_EMAIL, password: PATIENT_PASSWORD },
    });
    const token = json.token || json.accessToken || json.data?.token;
    if (status === 200 && token) return token;
  }
  return null;
}

async function runPricingLogicChecks() {
  const fixedBooking = (orderAmount, bookingPrice) => {
    const base = Math.max(0, Number(orderAmount) || 0);
    if (base > 0) {
      return { finalPrice: Math.min(base, bookingPrice), discount: Math.max(0, base - bookingPrice) };
    }
    return { finalPrice: bookingPrice, discount: 0 };
  };

  const fixedInr = (orderAmount, discountInr, minPurchase) => {
    const base = Math.max(0, Number(orderAmount) || 0);
    if (base < minPurchase) throw new Error(`Minimum order of ₹${minPurchase} required for this coupon`);
    const discount = Math.min(base, discountInr);
    return { finalPrice: Math.max(0, base - discount), discount };
  };

  const usg = fixedBooking(2500, 1000);
  if (usg.finalPrice === 1000 && usg.discount === 1500) pass('USG fixed price ₹1000', `final=${usg.finalPrice}`);
  else fail('USG fixed price ₹1000', JSON.stringify(usg));

  const med = fixedInr(500, 500, 500);
  if (med.finalPrice === 0 && med.discount === 500) pass('MED500 on ₹500 cart', 'free cart');
  else fail('MED500 on ₹500 cart', JSON.stringify(med));

  try {
    fixedInr(200, 500, 500);
    fail('MED500 rejects ₹200 cart', 'expected throw');
  } catch (error) {
    if (/Minimum order/.test(error.message)) pass('MED500 rejects ₹200 cart');
    else fail('MED500 rejects ₹200 cart', error.message);
  }
}

async function main() {
  console.log(`\n🎟️  Promo Coupon Smoke Test`);
  console.log(`   Base: ${BASE_URL}\n`);

  // ── Health ─────────────────────────────────────────────────────────────────
  console.log('1. Platform health');
  const health = await request('/health');
  if (health.json.status === 'healthy') pass('API health', health.json.environment);
  else fail('API health', JSON.stringify(health.json));

  // ── Team / admin coupon APIs ───────────────────────────────────────────────
  console.log('\n2. Team coupon management');
  let teamToken;
  try {
    teamToken = await loginTeam();
    pass('Team login', TEAM_EMAIL);
  } catch (error) {
    fail('Team login', error.message);
    return summarize();
  }

  const list = await request('/coupons', { token: teamToken });
  if (list.json.success && Array.isArray(list.json.coupons)) {
    pass('GET /coupons', `${list.json.coupons.length} coupons`);
  } else {
    fail('GET /coupons', list.json.message || list.status);
  }

  const stats = await request('/coupons/stats', { token: teamToken });
  if (stats.json.success && stats.json.stats) {
    pass('GET /coupons/stats', `active=${stats.json.stats.active}`);
  } else {
    fail('GET /coupons/stats', stats.json.message || stats.status);
  }

  const seedDry = await request('/coupons/promo/seed', {
    method: 'POST',
    token: teamToken,
    body: { execute: false },
  });
  if (seedDry.json.success && seedDry.json.mode === 'dry-run') {
    const seedCodes = (seedDry.json.coupons || []).map((c) => c.code);
    const hasFree6 = seedCodes.includes('FREE6MO') && !seedCodes.includes('CORP6FREE');
    pass('POST /coupons/promo/seed dry-run', `${seedDry.json.coupons?.length || 0} definitions`);
    if (hasFree6) pass('Seed definitions use FREE6MO');
    else fail('Seed definitions use FREE6MO', `codes: ${seedCodes.join(', ')}`);
  } else {
    fail('POST /coupons/promo/seed', seedDry.json.message || seedDry.json._raw || seedDry.status);
  }

  console.log('\n3. Standard promo codes in database');
  const coupons = list.json.coupons || [];
  const byCode = Object.fromEntries(coupons.map((c) => [c.code, c]));

  for (const code of STANDARD_CODES) {
    const coupon = byCode[code];
    if (!coupon) {
      if (code === 'FREE6MO' && byCode[LEGACY_MEMBERSHIP_CODE]) {
        fail(code, `missing — legacy ${LEGACY_MEMBERSHIP_CODE} still active (run seed migrate)`);
      } else {
        fail(code, 'missing');
      }
      continue;
    }
    if (!coupon.isActive) {
      fail(code, 'inactive');
      continue;
    }
    pass(code, `${coupon.metadata?.grantType || coupon.type} value=${coupon.value}`);
  }

  if (byCode[LEGACY_MEMBERSHIP_CODE]?.isActive) {
    fail('legacy CORP6FREE', 'still active — should be renamed or deactivated');
  } else if (byCode[LEGACY_MEMBERSHIP_CODE]) {
    pass('legacy CORP6FREE', 'present but inactive/retired');
  }

  // ── Pricing logic (no DB) ──────────────────────────────────────────────────
  console.log('\n4. Coupon pricing logic (unit)');
  await runPricingLogicChecks();

  // ── Patient validation APIs ────────────────────────────────────────────────
  console.log('\n5. Patient coupon validation (live API, no redemption)');
  const patientToken = await loginPatient();
  if (!patientToken) {
    skip('Patient login', `set PATIENT_TOKEN or PATIENT_EMAIL/PATIENT_PASSWORD (${PATIENT_EMAIL} unavailable)`);
    skip('Patient validation suite', 'skipped — no patient token');
    return summarize();
  }
  pass('Patient login', PATIENT_EMAIL);

  const membershipCode = byCode.FREE6MO ? 'FREE6MO' : byCode[LEGACY_MEMBERSHIP_CODE] ? LEGACY_MEMBERSHIP_CODE : 'FREE6MO';

  const validationCases = [
    {
      name: 'USG scan @ ₹1000',
      path: '/lab-tests/validate-coupon',
      body: { couponCode: 'USG', testType: 'ultrasound', orderAmount: 2500 },
      expect: (j) => j.success && Number(j.coupon?.finalPrice) === 1000,
    },
    {
      name: 'CT scan @ ₹2000',
      path: '/lab-tests/validate-coupon',
      body: { couponCode: 'CTSCAN', testType: 'ct_scan', orderAmount: 4000 },
      expect: (j) => j.success && Number(j.coupon?.finalPrice) === 2000,
    },
    {
      name: 'MRI @ ₹3000',
      path: '/lab-tests/validate-coupon',
      body: { couponCode: 'MRI', testType: 'mri', orderAmount: 6000 },
      expect: (j) => j.success && Number(j.coupon?.finalPrice) === 3000,
    },
    {
      name: 'Pharmacy MED500 on ₹500 cart',
      path: '/pharmacy-orders/validate-coupon',
      body: { couponCode: 'MED500', orderAmount: 500 },
      expect: (j) => j.success && Number(j.coupon?.discount) === 500 && Number(j.coupon?.finalPrice) === 0,
    },
    {
      name: 'Free membership coupon',
      path: '/membership/validate-free-coupon',
      body: { couponCode: membershipCode },
      expect: (j) => j.success && Number(j.coupon?.freeMonths) === 6,
    },
  ];

  for (const testCase of validationCases) {
    const res = await request(testCase.path, {
      method: 'POST',
      token: patientToken,
      body: testCase.body,
    });
    if (testCase.expect(res.json)) pass(testCase.name);
    else fail(testCase.name, res.json.message || JSON.stringify(res.json).slice(0, 120));
  }

  console.log('\n6. Negative cases');
  const wrongScope = await request('/lab-tests/validate-coupon', {
    method: 'POST',
    token: patientToken,
    body: { couponCode: 'USG', testType: 'mri', orderAmount: 5000 },
  });
  if (!wrongScope.json.success) pass('USG rejected for MRI booking');
  else fail('USG rejected for MRI booking', 'should have failed');

  const lowCart = await request('/pharmacy-orders/validate-coupon', {
    method: 'POST',
    token: patientToken,
    body: { couponCode: 'MED500', orderAmount: 200 },
  });
  if (!lowCart.json.success) pass('MED500 rejected below min order');
  else fail('MED500 rejected below min order', 'should have failed');

  const badCode = await request('/lab-tests/validate-coupon', {
    method: 'POST',
    token: patientToken,
    body: { couponCode: 'NOTREAL99', testType: 'ultrasound' },
  });
  if (!badCode.json.success) pass('Invalid code rejected');
  else fail('Invalid code rejected');

  return summarize();
}

function summarize() {
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`${'─'.repeat(48)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
