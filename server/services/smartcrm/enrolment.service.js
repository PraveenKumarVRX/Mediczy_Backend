/**
 * In-app enrolment for SmartCRM corporates: a pass-through (ADR-001).
 *
 * SmartCRM keeps the window, the family rules, the premium and the HR
 * approval. Mediqzy adds what only it can: who the member is (the link), the
 * consent behind the link, an audit row per call, idempotency for the calls
 * that cost money or create a request, and a refusal — not a queue — when the
 * window is closed or SmartCRM is unreachable.
 *
 * SmartCRM's partner enrolment endpoints (enrollment/window, session, draft,
 * quote, payment/initiate, payment/status, submit) exist as of SmartCRM
 * db971d1 (backend/api_v2/partner_mediqzy_enrollment.py). Every one of them
 * requires X-Mediqzy-Consent-Id: we send the consent recorded with the link.
 * Their answers come wrapped as { success, data } (window) or as the web
 * enrolment view's own body (the rest), and are passed to the app unchanged.
 * There is no partner endpoint for adding or removing a covered dependant.
 */
import crypto from 'node:crypto';
import pool from '../../db/pgPool.js';
import {
  SmartCrmError, effectiveEnrolmentMode, loadBinding, schemaAvailable,
} from './config.js';
import { partnerRequest } from './partner-client.js';
import { toSmartCrmQuote, fromSmartCrmQuote, withAppPolicyOptions } from './enrolment-translate.js';
import { getActiveLink } from './member-link.service.js';
import { auditPartnerEvent } from './audit.js';

/** route operation -> partner op, method, and the guards it needs. */
export const OPERATIONS = Object.freeze({
  window:          { op: 'window',          method: 'GET' },
  session:         { op: 'session',         method: 'POST' },
  draftGet:        { op: 'draft',           method: 'GET' },
  draftPut:        { op: 'draft',           method: 'PUT',    needsOpen: true },
  draftDelete:     { op: 'draft',           method: 'DELETE' },
  quote:           { op: 'quote',           method: 'POST',   needsOpen: true },
  paymentInitiate: { op: 'paymentInitiate', method: 'POST',   needsOpen: true, idempotent: true },
  paymentStatus:   { op: 'paymentStatus',   method: 'GET' },
  submit:          { op: 'submit',          method: 'POST',   needsOpen: true, idempotent: true },
});

const WINDOW_CACHE_MS = 60_000;
const windowCache = new Map();
export const _resetWindowCache = () => windowCache.clear();
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};
const hashRequest = (body, query) =>
  crypto.createHash('sha256').update(stableStringify({ body: body ?? null, query: query ?? null })).digest('hex');

/** The member's link + binding, refused unless in-app enrolment is on for them. */
export async function enrolmentContext(userId, db = pool) {
  if (!(await schemaAvailable(db))) {
    throw new SmartCrmError('SCHEMA_NOT_MIGRATED', 'Enrolment is not available yet.', 503);
  }
  const link = await getActiveLink(userId, db);
  if (!link) throw new SmartCrmError('NOT_LINKED', 'Link your insurance membership before enrolling.', 409);
  const binding = await loadBinding(link.corporate_id, db);
  const mode = effectiveEnrolmentMode(binding);
  if (mode !== 'in_app') {
    throw new SmartCrmError('ENROLMENT_NOT_IN_APP', 'Enrolment for your employer is not available in the app.', 409, {
      mode, webUrl: mode === 'web' ? binding.web_enrolment_url : null,
    });
  }
  if (binding.tenant_slug !== link.source_tenant || binding.smartcrm_corporate !== link.source_corporate) {
    throw new SmartCrmError('NOT_CONFIGURED', 'Enrolment is not configured correctly for your employer.', 503);
  }
  return { link, binding };
}

/** A 401/403 from SmartCRM is our key, not the member's fault: never shown as theirs. */
function guardUpstream(response) {
  if (response.status === 401 || response.status === 403) {
    throw new SmartCrmError('NOT_CONFIGURED', 'Enrolment is not configured correctly for your employer.', 503);
  }
  return response;
}

/**
 * The window state. Fails closed: anything other than an explicit
 * state === 'open' is treated as closed, including a shape we do not know.
 */
export async function getWindow(userId, { requestId, fetchImpl, ctx } = {}, db = pool) {
  const context = ctx || await enrolmentContext(userId, db);
  const cached = windowCache.get(userId);
  if (cached && Date.now() - cached.at < WINDOW_CACHE_MS) return cached.value;
  const response = guardUpstream(await partnerRequest(context.binding, context.link, {
    op: 'window', method: 'GET', userId, requestId, fetchImpl, consentId: context.link.consent_id,
  }));
  // SmartCRM: { success: true, data: { isOpen, state, message, window, webEnrollUrl, submission } }
  const raw = response.body && typeof response.body === 'object' ? response.body : {};
  const body = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const value = {
    status: response.status,
    open: response.status === 200 && body.state === 'open' && body.isOpen !== false,
    state: typeof body.state === 'string' ? body.state : null,
    reason: typeof body.reason === 'string' ? body.reason : (typeof body.message === 'string' ? body.message : null),
    body: response.body,
  };
  if (response.status === 200) windowCache.set(userId, { at: Date.now(), value });
  return value;
}

async function claimIdempotency(db, { userId, linkId, operation, key, hash }) {
  const { rows } = await db.query(
    `INSERT INTO insurance_enrolment_requests (user_id, link_id, operation, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, operation, idempotency_key) DO NOTHING
     RETURNING id`,
    [userId, linkId, operation, key, hash]
  );
  if (rows[0]) return { id: rows[0].id };

  const { rows: [prior] } = await db.query(
    `SELECT id, request_hash, state, status_code, response
       FROM insurance_enrolment_requests
      WHERE user_id = $1 AND operation = $2 AND idempotency_key = $3`,
    [userId, operation, key]
  );
  if (!prior) throw new SmartCrmError('IDEMPOTENCY_RACE', 'Please retry.', 409);
  if (prior.request_hash !== hash) {
    throw new SmartCrmError('IDEMPOTENCY_KEY_REUSED', 'This request key was already used for a different request.', 422);
  }
  if (prior.state === 'done') {
    return { replay: { status: prior.status_code, body: prior.response, replayed: true } };
  }
  if (prior.state === 'in_flight') {
    throw new SmartCrmError('REQUEST_IN_PROGRESS', 'This request is still being processed.', 409);
  }
  // 'failed' = SmartCRM was never reached or did not answer. Retrying with the
  // same key is safe: the key is forwarded, so SmartCRM can de-duplicate too.
  const { rows: [retry] } = await db.query(
    `UPDATE insurance_enrolment_requests SET state = 'in_flight', completed_at = NULL
      WHERE id = $1 AND state = 'failed' RETURNING id`,
    [prior.id]
  );
  if (!retry) throw new SmartCrmError('REQUEST_IN_PROGRESS', 'This request is still being processed.', 409);
  return { id: retry.id };
}

/**
 * Runs one enrolment operation for the member.
 * @returns {{ status:number, body:any, replayed?:boolean }}
 */
export async function runOperation(name, {
  userId, body, query, idempotencyKey, requestId, fetchImpl,
} = {}, db = pool) {
  const spec = OPERATIONS[name];
  if (!spec) throw new SmartCrmError('UNSUPPORTED_OPERATION', 'Unknown enrolment operation.', 404);
  const ctx = await enrolmentContext(userId, db);
  const audit = (action, metadata) => auditPartnerEvent({
    action, userId, corporateId: ctx.link.corporate_id, requestId,
    resourceType: 'smartcrm_enrolment', resourceId: ctx.link.source_member_id || ctx.link.id,
    metadata: { operation: name, ...metadata },
  }, db);

  if (name === 'window') {
    const w = await getWindow(userId, { requestId, fetchImpl, ctx }, db);
    await audit('smartcrm.enrolment.window', { status: w.status, state: w.state });
    return { status: w.status, body: w.body };
  }

  if (spec.idempotent && !IDEMPOTENCY_KEY.test(String(idempotencyKey || ''))) {
    throw new SmartCrmError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header (8-128 letters, digits, _ or -) is required.', 400);
  }

  // Replays are answered before the window check: a submit that already
  // succeeded must still read as succeeded after the window closes.
  let claim = null;
  if (spec.idempotent) {
    claim = await claimIdempotency(db, {
      userId, linkId: ctx.link.id, operation: name, key: idempotencyKey, hash: hashRequest(body, query),
    });
    if (claim.replay) {
      await audit('smartcrm.enrolment.replayed', { status: claim.replay.status });
      return claim.replay;
    }
  }

  const release = async (state, response = null) => {
    if (!claim?.id) return;
    await db.query(
      `UPDATE insurance_enrolment_requests
          SET state = $2, status_code = $3, response = $4::jsonb, completed_at = NOW()
        WHERE id = $1`,
      [claim.id, state, response?.status ?? null, response ? JSON.stringify(response.body ?? null) : null]
    );
  };

  try {
    if (spec.needsOpen) {
      const w = await getWindow(userId, { requestId, fetchImpl, ctx }, db);
      if (!w.open) {
        await audit('smartcrm.enrolment.refused_closed', { state: w.state, reason: w.reason });
        throw new SmartCrmError('ENROLMENT_CLOSED', 'Enrolment is not open for you right now.', 409, {
          state: w.state, reason: w.reason,
        });
      }
    }

    // The app's quote and option shapes differ from SmartCRM's; see enrolment-translate.js.
    const upstreamBody = name === 'quote' ? toSmartCrmQuote(body) : body;
    const response = guardUpstream(await partnerRequest(ctx.binding, ctx.link, {
      op: spec.op, method: spec.method, userId, query, body: upstreamBody,
      idempotencyKey: spec.idempotent ? idempotencyKey : undefined, requestId, fetchImpl,
      consentId: ctx.link.consent_id,
    }));
    if (response.status === 200 && name === 'quote') response.body = fromSmartCrmQuote(response.body);
    if (response.status >= 200 && response.status < 300 && name === 'session') response.body = withAppPolicyOptions(response.body);
    await release('done', response);
    if (name === 'submit' || name === 'draftPut' || name === 'draftDelete') windowCache.delete(userId);
    await audit('smartcrm.enrolment.passed', {
      status: response.status, ms: response.ms,
      request_id: response.body?.request_id ?? null,
    });
    return { status: response.status, body: response.body };
  } catch (error) {
    // A refusal we made (closed window) is a final answer for this key only
    // if SmartCRM was not consulted; mark failed so a retry re-checks.
    await release('failed').catch(() => {});
    if (error instanceof SmartCrmError && !['ENROLMENT_CLOSED'].includes(error.code)) {
      await audit('smartcrm.enrolment.failed', { code: error.code });
    }
    throw error;
  }
}

/** What the last submit said, for the wallet's enrolment block. */
export async function lastSubmission(userId, db = pool) {
  if (!(await schemaAvailable(db))) return null;
  const { rows: [row] } = await db.query(
    `SELECT status_code, response, completed_at
       FROM insurance_enrolment_requests
      WHERE user_id = $1 AND operation = 'submit' AND state = 'done'
      ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1`,
    [userId]
  );
  if (!row) return null;
  const state = { 201: 'saved', 202: 'pending_hr', 402: 'payment_pending' }[row.status_code] || 'rejected';
  return {
    state,
    requestId: row.response?.request_id ?? null,
    detail: state === 'rejected' ? (row.response?.detail ?? null) : null,
    at: row.completed_at,
  };
}

export default { OPERATIONS, enrolmentContext, getWindow, runOperation, lastSubmission };
