/**
 * Demo-account guard (2026-11-17).
 *
 * A sales demo login — a corporate employee of "My SmartHealth" marked users.metadata.demoAccount = true
 * (scripts/demo/setup-corporate-demo-employee.mjs) — is shared with prospective clients on the live
 * system. Prospects should be able to try everything, and what they do must stay inside the app:
 *
 *   1. Requests that would move money, call a doctor live, submit to an insurer/TPA, open a support
 *      ticket or change the shared account are refused here with a plain message (403, code
 *      DEMO_ACCOUNT). SOS is acknowledged without alerting anyone.
 *   2. Every other request runs inside the demo context (utils/demo-context.js): the integration layer
 *      refuses vendors that reach people or move money, and the notification service only notifies the
 *      demo account itself. Bookings and orders are still written, so they show in the app.
 *   3. Partner work queues and their reminder jobs leave demo-account rows out (SQL is_demo_account(),
 *      migration 20261117000100), so no doctor, lab or Team member is asked to act on them.
 *
 * Mounted on /api and /v1 before any router (app.js). For everyone else it adds one cached set lookup.
 */
import jwt from 'jsonwebtoken';
import pool from '../db/pgPool.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { COOKIE_NAMES } from '../config/cookies.config.js';
import { runAsDemoAccount } from '../utils/demo-context.js';

const REFRESH_MS = 60_000;
let demoIds = new Set();
let loadedAt = 0;
let loading = null;

/** Ids of demo accounts, refreshed at most once a minute; a failed refresh keeps the last good set. */
export async function demoAccountIds() {
  if (Date.now() - loadedAt < REFRESH_MS) return demoIds;
  if (!loading) {
    loading = pool.query(`SELECT id FROM users WHERE metadata->>'demoAccount' = 'true'`)
      .then(({ rows }) => { demoIds = new Set(rows.map((r) => Number(r.id))); loadedAt = Date.now(); })
      .catch((error) => { console.warn('[demo-guard] could not refresh demo account ids:', error.message); loadedAt = Date.now() - REFRESH_MS + 5_000; })
      .finally(() => { loading = null; });
  }
  await loading;
  return demoIds;
}

/** Test seam. */
export function __setDemoAccountIds(ids) { demoIds = new Set(ids.map(Number)); loadedAt = Date.now(); }

const WRITE = /^(POST|PUT|PATCH|DELETE)$/;
const PAYMENT = 'Payments are switched off on the demo account, so no payment page opens and nothing is charged. On your company\'s account this step takes you to payment.';
const LIVE_DOCTOR = 'Live doctor calls are switched off on the demo account, so no doctor is called. On your company\'s account an on-call doctor joins within minutes.';
const INSURER = 'Insurer and TPA requests are switched off on the demo account, so nothing is sent to an insurer.';
const SUPPORT = 'Support requests are switched off on the demo account, so the support team is not contacted.';
const ACCOUNT = 'Account settings cannot be changed on the demo account, so every visitor sees the same demo.';

/** [methods regex, path regex, message] — first match refuses the request. */
export const DEMO_BLOCKED_REQUESTS = [
  [WRITE, /^\/api\/payments(\/|$)/, PAYMENT],
  [WRITE, /^\/api\/billing\/payments\//, PAYMENT],
  [WRITE, /^\/api\/billing\/orders\/[^/]+\/refund$/, PAYMENT],
  [WRITE, /^\/api\/wallet\/(create-order|verify-payment)$/, PAYMENT],
  [WRITE, /^\/api\/membership\/(payment-order|upgrade(\/.*)?)$/, PAYMENT],
  [WRITE, /^\/api\/membership-plans\/plans\/[^/]+\/create-order$/, PAYMENT],
  [WRITE, /^\/api\/health-checkups\/bookings\/[^/]+\/payment(\/verify)?$/, PAYMENT],
  [WRITE, /^\/api\/consultation\/payment\//, PAYMENT],
  [WRITE, /^\/api\/corporate\/benefit-wallet\/authorizations/, PAYMENT],
  [WRITE, /^\/api\/medical-ai\/instant-triage-call$/, LIVE_DOCTOR],
  [WRITE, /^\/api\/video\/room\/invite$/, LIVE_DOCTOR],
  [WRITE, /^\/api\/employee\/insurance\/(link|refresh)$/, INSURER],
  [WRITE, /^\/api\/employee\/enrolment(\/|$)/, INSURER],
  [/./, /^\/api\/tpa(\/|$)/, INSURER],
  [WRITE, /^\/api\/tickets(\/|$)/, SUPPORT],
  [WRITE, /^\/api\/support\/chat(\/|$)/, SUPPORT],
  [WRITE, /^\/api\/customer-care(\/|$)/, SUPPORT],
  [WRITE, /^\/api\/medical-ai\/intent-escalation$/, SUPPORT],
  [WRITE, /^\/v1\//, SUPPORT],
  [WRITE, /^\/api\/users\/(change-password|security\/.*|data\/erasure|profile-picture(\/.*)?)$/, ACCOUNT],
  [/^DELETE$/, /^\/api\/users\/account$/, ACCOUNT],
  [/^(PUT|PATCH)$/, /^\/api\/users(\/|$)/, ACCOUNT],
  [/^DELETE$/, /^\/api\/privacy\/(delete-account|consents(\/.*)?)$/, ACCOUNT],
  [/^POST$/, /^\/api\/auth\/logout-all$/, ACCOUNT],
];

const fullPath = (req) => String(req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '') || '/';

/** What the guard does with one demo-account request: { block: message } | { simulate: body } | null. */
export function demoDecision(method, path) {
  if (method === 'POST' && path === '/api/medical-ai/emergency-sos') {
    return { simulate: {
      success: true, demo: true, notifiedContacts: [], timestamp: new Date().toISOString(),
      message: 'Demo account: your SOS was received. On a real account your doctor, your organisation and your emergency contacts are alerted straight away; this time no one was contacted.',
    } };
  }
  const rule = DEMO_BLOCKED_REQUESTS.find(([methods, pattern]) => methods.test(method) && pattern.test(path));
  return rule ? { block: rule[2] } : null;
}

function tokenUserId(req) {
  const header = String(req.headers?.authorization || '');
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || req.cookies?.[COOKIE_NAMES.ACCESS];
  if (!token || !JWT_CONFIG.SECRET) return null;
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    // Only patient-side tokens can belong to a demo employee; ids of other kinds live in other tables.
    const kind = String(decoded.userType || decoded.role || 'user').toLowerCase();
    if (!['user', 'patient', 'employee'].includes(kind)) return null;
    return Number(decoded.id ?? decoded.userId) || null;
  } catch {
    return null; // unauthenticated or invalid: the route's own auth answers
  }
}

export async function demoAccountGuard(req, res, next) {
  const userId = tokenUserId(req);
  if (!userId) return next();
  const ids = await demoAccountIds();
  if (!ids.has(userId)) return next();

  const decision = demoDecision(req.method, fullPath(req));
  if (decision?.block) return res.status(403).json({ success: false, code: 'DEMO_ACCOUNT', demo: true, message: decision.block });
  if (decision?.simulate) return res.json(decision.simulate);
  res.setHeader('X-Demo-Account', 'true');
  return runAsDemoAccount(userId, () => next());
}

export default demoAccountGuard;
