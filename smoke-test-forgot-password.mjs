/**
 * Forgot Password - Sanity & Smoke Test
 * Run: node smoke-test-forgot-password.mjs
 */

const BASE = 'https://mediqzy.com/api/password-reset';
const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';

let passed = 0, failed = 0;

async function req(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

function check(label, condition, got) {
  if (condition) {
    console.log(`${PASS}  ${label}`);
    passed++;
  } else {
    console.log(`${FAIL}  ${label}`);
    console.log(`       Got: ${JSON.stringify(got)}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════════════');
console.log(' Forgot Password — Sanity & Smoke Test');
console.log('═══════════════════════════════════════════════════\n');

// ── REQUEST STEP ─────────────────────────────────────────────────────────────
console.log('── Step 1: /request ──────────────────────────────\n');

// 1. Missing email AND phone → 400
let r = await req('/request', {});
check('[1] Missing email+phone → 400', r.status === 400 && r.data.success === false, r);

// 2. Invalid email format → 400
r = await req('/request', { email: 'not-an-email', userType: 'user' });
check('[2] Invalid email format → 400', r.status === 400 && r.data.success === false, r);

// 3. Unknown email, userType=user → 200 masked (security: don't reveal account existence)
r = await req('/request', { email: 'smoke_nonexistent99@example.com', userType: 'user' });
check('[3] Unknown email / user → 200 masked', r.status === 200 && r.data.success === true, r);

// 4. Unknown email, userType=team → 200 masked
r = await req('/request', { email: 'smoke_nonexistent99@example.com', userType: 'team' });
check('[4] Unknown email / team → 200 masked', r.status === 200 && r.data.success === true, r);

// 5. Unknown email, userType=doctor → 200 masked
r = await req('/request', { email: 'smoke_nonexistent99@example.com', userType: 'doctor' });
check('[5] Unknown email / doctor → 200 masked', r.status === 200 && r.data.success === true, r);

// 6. Invalid userType → 400 validation error
r = await req('/request', { email: 'test@example.com', userType: 'hacker' });
check('[6] Invalid userType → 400', r.status === 400 && r.data.success === false, r);

// ── VERIFY-OTP STEP ───────────────────────────────────────────────────────────
console.log('\n── Step 2: /verify-otp ───────────────────────────\n');

// 7. Missing email+phone → 400
r = await req('/verify-otp', { code: '123456', userType: 'user' });
check('[7] verify-otp: missing email+phone → 400', r.status === 400 && r.data.success === false, r);

// 8. OTP too short → 400
r = await req('/verify-otp', { email: 'test@example.com', code: '12', userType: 'user' });
check('[8] verify-otp: short OTP → 400', r.status === 400 && r.data.success === false, r);

// 9. Wrong OTP for non-existent account → 200 false (OTP not found/expired)
r = await req('/verify-otp', { email: 'smoke_nonexistent99@example.com', code: '000000', userType: 'user' });
check('[9] verify-otp: bad OTP → fails gracefully (200 false or 400)', 
  (r.status === 200 || r.status === 400) && r.data.success === false, r);

// ── RESET STEP ────────────────────────────────────────────────────────────────
console.log('\n── Step 3: /reset ────────────────────────────────\n');

// 10. Missing resetToken → 400
r = await req('/reset', { newPassword: 'newpass1' });
check('[10] reset: missing token → 400', r.status === 400 && r.data.success === false, r);

// 11. Password too short → 400
r = await req('/reset', { resetToken: 'sometoken', newPassword: '12' });
check('[11] reset: password too short → 400', r.status === 400 && r.data.success === false, r);

// 12. Fake/invalid token → 200 false (token not in DB)
r = await req('/reset', { resetToken: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899', newPassword: 'newValidPass1', userType: 'user' });
check('[12] reset: invalid token → fails gracefully', 
  (r.status === 200 || r.status === 400 || r.status === 404) && r.data.success === false, r);

// ── FRONTEND REDIRECT CHECK ───────────────────────────────────────────────────
console.log('\n── Frontend bundle redirect check ────────────────\n');
const fs = await import('fs');
const path = await import('path');
const clientDist = new URL('./client/dist/assets/', import.meta.url).pathname;
const files = fs.readdirSync(clientDist).filter(f => f.endsWith('.js'));
let foundTeamRedirect = false;
for (const f of files) {
  const content = fs.readFileSync(path.join(clientDist, f), 'utf-8');
  if (content.includes('/team/login')) { foundTeamRedirect = true; break; }
}
check('[13] Built JS contains /team/login redirect', foundTeamRedirect, 'not found');

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log(` Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════\n');
process.exit(failed > 0 ? 1 : 0);
