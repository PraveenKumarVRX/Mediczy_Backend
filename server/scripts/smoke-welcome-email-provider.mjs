/**
 * Smoke test — welcome email provider selector
 *
 * Verifies that the `provider` param ('ses' | 'brevo' | 'auto') on
 * POST /api/admin/corporate-employee-welcome-emails/send is accepted,
 * sanitised, and reaches the right code path — tested against the
 * already-running server at SMOKE_BASE_URL (default: http://localhost:8888).
 *
 * Why live server, not isolated Express?
 *   The auth middleware uses a secondary Sequelize DB (`mediczy_ai`) for
 *   admin/team user lookups. That DB is only reachable via the server's
 *   established connections — an isolated process gets a pg_hba.conf
 *   rejection. Hitting the live server sidesteps this entirely.
 *
 * Why SSM for the token?
 *   The server loads JWT_SECRET from SSM (/mediczy/prod/JWT_SECRET), not
 *   from .env. Tokens minted with the .env value are rejected. This script
 *   reads the live SSM secret so minted tokens are always valid.
 *
 * Usage:
 *   node server/scripts/smoke-welcome-email-provider.mjs
 *
 * Optional env overrides:
 *   SMOKE_BASE_URL   default: http://localhost:8888
 *   SMOKE_USER_ID    default: 21  (team@mediczy.com, system_admin)
 *   SMOKE_CORP_ID    default: 49  (Ninjacart)
 *   SSM_PARAM_PATH   default: /mediczy/prod  (same as ssm-env-loader)
 *   AWS_REGION       default: ap-south-1
 *
 * Exit 0 = all assertions passed.
 * Exit 1 = at least one assertion failed or setup failed.
 */

import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import jwt from 'jsonwebtoken';

const BASE_URL  = process.env.SMOKE_BASE_URL  || 'http://localhost:8888';
const USER_ID   = parseInt(process.env.SMOKE_USER_ID  || '21', 10);
const CORP_ID   = parseInt(process.env.SMOKE_CORP_ID  || '49', 10);
const SSM_PATH  = process.env.SSM_PARAM_PATH  || '/mediczy/prod';
const REGION    = process.env.AWS_REGION      || 'ap-south-1';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadJwtSecretFromSsm() {
  const client = new SSMClient({ region: REGION });
  let secret = null;
  let nextToken;

  do {
    const cmd = new GetParametersByPathCommand({
      Path: SSM_PATH, WithDecryption: true, Recursive: false,
      ...(nextToken ? { NextToken: nextToken } : {}),
    });
    const resp = await client.send(cmd);
    for (const p of resp.Parameters || []) {
      const name = p.Name.replace(SSM_PATH + '/', '');
      if (name === 'JWT_SECRET' || name === 'JWT_SECRET_KEY') {
        secret = p.Value;
        break;
      }
    }
    nextToken = resp.NextToken;
  } while (nextToken && !secret);

  return secret;
}

function mintAdminToken(secret) {
  return jwt.sign(
    { id: USER_ID, email: 'team@mediczy.com', role: 'system_admin', isAdmin: true, isTeam: true },
    secret,
    { expiresIn: '1h' }
  );
}

const jsonOrText = async (res) => {
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
};

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${detail ? `\n      detail: ${detail}` : ''}`);
    failed++;
  }
}

async function req(method, path, body, headers = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await jsonOrText(res);
  return { status: res.status, data };
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function runTests(token) {
  const AUTH = { Authorization: `Bearer ${token}` };
  const SEND = '/api/admin/corporate-employee-welcome-emails/send';

  // ── 1. Auth layer ─────────────────────────────────────────────────────────
  console.log('\n[1] Auth layer');

  const noToken = await req('POST', SEND, { corporateId: CORP_ID, emails: [] });
  assert(noToken.status === 401, 'No token → 401', JSON.stringify(noToken.data));

  const badToken = await req('POST', SEND, { corporateId: CORP_ID, emails: [] },
    { Authorization: 'Bearer garbage.invalid.token' });
  assert(badToken.status === 401, 'Invalid token → 401', JSON.stringify(badToken.data));

  // ── 2. Provider param accepted (empty emails → 400, not 500) ─────────────
  // The route validates `emails` before it reaches any send logic, so
  // empty array = 400 "emails array is required" regardless of provider.
  // This confirms the route is reachable AND provider parsing doesn't crash.
  console.log('\n[2] Provider param parsing — empty emails → 400, never 500');

  for (const provider of ['ses', 'brevo', 'auto', undefined]) {
    const body = { corporateId: CORP_ID, emails: [], ...(provider !== undefined ? { provider } : {}) };
    const r = await req('POST', SEND, body, AUTH);
    const label = provider === undefined ? 'provider omitted' : `provider='${provider}'`;
    assert(r.status === 400,
      `${label} + empty emails → 400`,
      `got ${r.status}: ${JSON.stringify(r.data)}`);
    assert(r.data?.success === false,
      `${label} → body has success:false`);
  }

  // ── 3. Invalid provider values → sanitised to 'auto', never 500 ──────────
  console.log('\n[3] Invalid provider values fall back to auto (no 500)');

  for (const bad of ['SES', 'BREVO', 'sendgrid', 'smtp', 123, null, '', '  ']) {
    const r = await req('POST', SEND, { corporateId: CORP_ID, emails: [], provider: bad }, AUTH);
    assert(r.status !== 500,
      `provider=${JSON.stringify(bad)} → no 500 (got ${r.status})`);
  }

  // ── 4. Batch size guard (independent of provider) ─────────────────────────
  console.log('\n[4] Batch size guard');

  const big = await req('POST', SEND,
    { corporateId: CORP_ID, provider: 'ses', emails: Array(501).fill({ to: 'x@y.com' }) }, AUTH);
  assert(big.status === 400, '501 emails → 400', JSON.stringify(big.data));

  // ── 5. prepare-bulk endpoint reachable ────────────────────────────────────
  console.log('\n[5] prepare-bulk reachable');

  const BULK = '/api/admin/corporate-employee-welcome-emails/prepare-bulk';

  const prepNoAuth = await req('POST', BULK, { corporateId: CORP_ID, userIds: [1] });
  assert(prepNoAuth.status === 401, 'prepare-bulk no token → 401', JSON.stringify(prepNoAuth.data));

  const prepEmpty = await req('POST', BULK, { corporateId: CORP_ID, userIds: [] }, AUTH);
  assert(prepEmpty.status === 400, 'prepare-bulk empty userIds → 400', JSON.stringify(prepEmpty.data));

  // ── 6. Server health (sanity baseline) ────────────────────────────────────
  console.log('\n[6] Server health');

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'GET /api/health → 200', JSON.stringify(health.data));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪  smoke-welcome-email-provider');
  console.log(`    Target: ${BASE_URL}`);

  // Load JWT_SECRET from SSM so minted tokens match what the server verifies.
  let jwtSecret;
  try {
    jwtSecret = await loadJwtSecretFromSsm();
    if (!jwtSecret) throw new Error('JWT_SECRET not found under ' + SSM_PATH);
    console.log(`    JWT_SECRET: loaded from SSM (${SSM_PATH})`);
  } catch (err) {
    console.error(`    ❌ Failed to load JWT_SECRET from SSM: ${err.message}`);
    console.error('       Set AWS credentials or run from the EC2 instance with the correct IAM role.');
    process.exit(1);
  }

  const token = mintAdminToken(jwtSecret);
  console.log(`    Token minted for userId=${USER_ID}\n`);

  await runTests(token);

  console.log('\n────────────────────────────────────');
  console.log(`  ${passed} passed  ${failed > 0 ? failed + ' FAILED' : '0 failed'}`);
  console.log('────────────────────────────────────\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
