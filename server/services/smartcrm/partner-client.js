/**
 * The only code that calls SmartCRM's partner API (ADR-001).
 *
 * Contract (SmartCRM, backend/api_v2/partner_mediqzy_views.py):
 *   base      <SMARTCRM_PARTNER_BASE_URL>/api/v2/partner/mediqzy/
 *   auth      X-API-Key: <the corporate's partner key>
 *   identity  tenant_slug, corporate, emp_id on every call (query string)
 *   actor     X-Mediqzy-User-Id: <the Mediqzy user acting>, recorded in
 *             SmartCRM's per-broker partner audit row
 *
 * Paths are an allow-list, so nothing a member sends can steer the call to a
 * different SmartCRM endpoint. Every outcome is classified:
 *   - network error, timeout, 5xx  -> counts against the tenant's breaker
 *   - 4xx                          -> SmartCRM's answer; returned, not counted
 * One breaker per SmartCRM tenant, so a broker whose SmartCRM is down does not
 * take every other broker's members with it.
 */
import { CircuitBreaker } from '../../utils/circuit-breaker.js';
import { currentDemoAccountId, DemoAccountBlockedError } from '../../utils/demo-context.js';
import {
  PARTNER_PREFIX, SmartCrmError, apiKeyFor, integrationEnabled, partnerBaseUrl,
} from './config.js';
import { createTlsTransport } from './tls-transport.js';

export const PARTNER_PATHS = Object.freeze({
  summary:          { path: 'insurance/summary/',          methods: ['GET'] },
  // Scoped to the member's own corporate's policy numbers since SmartCRM
  // db971d1 (the emp_id-only leak of 2026-11-13 is fixed there, with tests).
  claims:           { path: 'insurance/claims/',           methods: ['GET'] },
  // A PDF as base64 (or an insurer URL): bigger and slower than the rest,
  // since SmartCRM may fall back to the insurer's live API.
  ecard:            { path: 'insurance/ecard/',            methods: ['GET'], maxBodyBytes: 12 * 1024 * 1024, timeoutMs: 25_000 },
  window:           { path: 'enrollment/window/',          methods: ['GET'] },
  session:          { path: 'enrollment/session/',         methods: ['POST'] },
  draft:            { path: 'enrollment/draft/',           methods: ['GET', 'PUT', 'DELETE'] },
  quote:            { path: 'enrollment/quote/',           methods: ['POST'] },
  paymentInitiate:  { path: 'enrollment/payment/initiate/', methods: ['POST'] },
  paymentStatus:    { path: 'enrollment/payment/status/',  methods: ['GET'] },
  submit:           { path: 'enrollment/submit/',          methods: ['POST'] },
});
// Not here: adding, changing or removing a covered dependant. SmartCRM has no
// partner endpoint for it yet (its member portal raises an HR request), so the
// old 'dependents/' entry pointed at a path that does not exist.

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 1024 * 1024;
const breakers = new Map();

export function breakerFor(tenantSlug) {
  const key = String(tenantSlug || '').toLowerCase();
  if (!breakers.has(key)) {
    breakers.set(key, new CircuitBreaker({ name: `smartcrm:${key}`, threshold: 5, cooldownMs: 60_000 }));
  }
  return breakers.get(key);
}
export const _resetBreakers = () => breakers.clear();
export const breakerStates = () => [...breakers.values()].map((b) => b.toJSON());

/**
 * @param {object}  binding   smartcrm_corporate_bindings row
 * @param {object}  link      { emp_id } of the member being acted for
 * @param {object}  options   { op, method, userId, query, body, idempotencyKey, requestId, timeoutMs, fetchImpl }
 * @returns {Promise<{ status:number, body:any, ms:number }>}
 */
/**
 * SmartCRM companies that are demo data on SmartCRM's side, as tenant|corporate (owner approval
 * 2026-11-22: the shared sales demo login may enrol there). Comma-separated; case and spaces ignored.
 */
const DEMO_BINDINGS = String(process.env.SMARTCRM_DEMO_BINDINGS ?? 'medibharat|My SmartHealth Corporate')
  .split(',').map((x) => x.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean);
export const isDemoBinding = (binding) =>
  DEMO_BINDINGS.includes(`${String(binding?.tenant_slug || '').trim().toLowerCase()}|${String(binding?.smartcrm_corporate || '').trim().toLowerCase().replace(/\s+/g, ' ')}`);

export async function partnerRequest(binding, link, {
  op, method = 'GET', userId, query = {}, body, idempotencyKey, requestId, consentId,
  timeoutMs, fetchImpl,
} = {}) {
  if (!integrationEnabled()) throw new SmartCrmError('DISABLED', 'Insurance sync is switched off.', 503);
  // The demo-account guard (utils/demo-context.js) lists SmartCRM as blocked, but these calls use
  // their own mTLS transport and never passed through it. Enforced here: the sales demo login may
  // reach only SmartCRM's demo company, never a real employer's insurance.
  if (currentDemoAccountId() !== null && !isDemoBinding(binding)) throw new DemoAccountBlockedError('the insurer (SmartCRM)');
  const spec = PARTNER_PATHS[op];
  if (!spec || !spec.methods.includes(method)) {
    throw new SmartCrmError('UNSUPPORTED_OPERATION', `No partner operation ${op} ${method}.`, 500);
  }
  const base = partnerBaseUrl();
  const key = apiKeyFor(binding);
  if (!base || !key || !binding?.tenant_slug || !binding?.smartcrm_corporate) {
    throw new SmartCrmError('NOT_CONFIGURED', 'Insurance sync is not configured for this employer.', 503);
  }
  if (!link?.emp_id) throw new SmartCrmError('NOT_LINKED', 'No insurance membership is linked.', 409);
  const actor = Number(userId);
  if (!Number.isSafeInteger(actor) || actor <= 0) {
    throw new SmartCrmError('NO_ACTOR', 'Partner calls must name the Mediqzy user acting.', 500);
  }

  // Default transport = HTTPS with mutual TLS over the private link (see
  // tls-transport.js). Refused, before anything is sent, when mTLS is
  // required and not configured. Tests inject fetchImpl.
  const send = fetchImpl || createTlsTransport();

  const breaker = breakerFor(binding.tenant_slug);
  if (breaker.isOpen()) {
    throw new SmartCrmError('CIRCUIT_OPEN', 'Insurance details are temporarily unavailable.', 503);
  }

  const url = new URL(PARTNER_PREFIX + spec.path, base);
  // Identity params last, so a caller-supplied query cannot override them.
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && !['tenant_slug', 'corporate', 'emp_id'].includes(k)) {
      url.searchParams.set(k, String(v));
    }
  }
  url.searchParams.set('tenant_slug', binding.tenant_slug);
  url.searchParams.set('corporate', binding.smartcrm_corporate);
  url.searchParams.set('emp_id', link.emp_id);

  const headers = {
    Accept: 'application/json',
    'X-API-Key': key,
    'X-Mediqzy-User-Id': String(actor),
  };
  if (requestId) headers['X-Request-Id'] = String(requestId).slice(0, 120);
  // SmartCRM refuses enrolment calls without it and stores it with the request.
  if (consentId) headers['X-Mediqzy-Consent-Id'] = String(consentId).slice(0, 128);
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey);
  let payload;
  if (body !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? spec.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  let response;
  try {
    response = await send(url.toString(), { method, headers, body: payload, signal: controller.signal, redirect: 'error' });
  } catch (error) {
    breaker.onFailure();
    const timedOut = error?.name === 'AbortError';
    throw new SmartCrmError(
      timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
      'Insurance details are temporarily unavailable.', 503
    );
  } finally {
    clearTimeout(timer);
  }

  const ms = Date.now() - started;
  const text = await response.text().catch(() => '');
  if (response.status >= 500) {
    breaker.onFailure();
    throw new SmartCrmError('UPSTREAM_ERROR', 'Insurance details are temporarily unavailable.', 502, { upstreamStatus: response.status });
  }
  breaker.onSuccess();
  if (response.status >= 300 && response.status < 400) {
    // Never followed: a redirect would carry the partner key somewhere else.
    throw new SmartCrmError('UPSTREAM_REDIRECT', 'The insurer system answered unexpectedly.', 502, { upstreamStatus: response.status });
  }
  if (text.length > (spec.maxBodyBytes ?? MAX_BODY_BYTES)) {
    throw new SmartCrmError('BAD_UPSTREAM_PAYLOAD', 'The insurer system sent an oversized response.', 502);
  }
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch {
      throw new SmartCrmError('BAD_UPSTREAM_PAYLOAD', 'The insurer system sent an unreadable response.', 502, { upstreamStatus: response.status });
    }
  }
  return { status: response.status, body: parsed, ms };
}

export default { partnerRequest, PARTNER_PATHS, breakerFor, breakerStates };
