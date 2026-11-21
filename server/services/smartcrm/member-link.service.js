/**
 * A Mediqzy user ↔ a SmartCRM member, and the refresh that reads through it.
 *
 * How a link is made, and why each step is there:
 *   1. The member is on their employer's roster in Mediqzy (corporate_employees,
 *      userId = them, active, not exited). The roster supplies emp_id — the
 *      member never types it, so they cannot name somebody else's.
 *   2. Their employer has a SmartCRM binding with read_enabled.
 *   3. They have given explicit consent to share between Mediqzy and SmartCRM,
 *      recorded in patient_consents (DATA_SHARING), withdrawn on unlink.
 *   4. The first successful read records SmartCRM's own member id. Every later
 *      read must return the same id; a different one means the emp_id now
 *      points at another person (re-issued code, roster error) and the link is
 *      put into 'mismatch' and the projected rows hidden, not followed.
 */
import pool from '../../db/pgPool.js';
import {
  SOURCE_SYSTEM, SmartCrmError, integrationEnabled, loadBinding, schemaAvailable,
} from './config.js';
import { partnerRequest } from './partner-client.js';
import { mapSummary, policiesNeedingDetail } from './summary-mapper.js';
import { applyProjection, retireProjection } from './projection.service.js';
import { auditPartnerEvent } from './audit.js';
import { withRlsTransaction } from '../../middleware/rls-context.middleware.js';

export const CONSENT_POLICY_VERSION = 'smartcrm-insurance-link-2026-11';
const REFRESH_MIN_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const lastRefreshAt = new Map();
export const _resetRefreshThrottle = () => lastRefreshAt.clear();

const positiveInt = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function ensureReady(db) {
  if (!(await schemaAvailable(db))) {
    throw new SmartCrmError('SCHEMA_NOT_MIGRATED', 'Insurance sync is not available yet.', 503);
  }
}

export async function getActiveLink(userId, db = pool) {
  const id = positiveInt(userId);
  if (!id || !(await schemaAvailable(db))) return null;
  const { rows } = await db.query(
    `SELECT * FROM insurance_member_links
      WHERE user_id = $1 AND source_system = $2 AND status = 'active'
      ORDER BY id DESC LIMIT 1`,
    [id, SOURCE_SYSTEM]
  );
  return rows[0] || null;
}

/** What the member sees about their link — no emp_id echo beyond the last 4. */
export function describeLink(link, binding = null) {
  if (!link) return { linked: false };
  const synced = link.last_synced_at ? new Date(link.last_synced_at) : null;
  return {
    linked: link.status === 'active',
    status: link.status,
    source: SOURCE_SYSTEM,
    employeeCodeHint: link.emp_id ? `••${String(link.emp_id).slice(-4)}` : null,
    linkedAt: link.linked_at,
    syncedAt: synced ? synced.toISOString() : null,
    stale: !synced || Date.now() - synced.getTime() > STALE_AFTER_MS,
    lastError: link.last_error || null,
    readEnabled: Boolean(binding?.read_enabled),
  };
}

/** The roster rows that could be linked: active, not exited, employer bound. */
async function eligibleRosterRows(userId, db) {
  const { rows } = await db.query(
    `SELECT ce.corporate_id, ce."employeeId" AS emp_id
       FROM corporate_employees ce
       JOIN smartcrm_corporate_bindings b ON b.corporate_id = ce.corporate_id
      WHERE ce."userId" = $1
        AND COALESCE(ce."isActive", TRUE) = TRUE
        AND (ce."exitDate" IS NULL OR ce."exitDate" > CURRENT_DATE)
        AND NULLIF(btrim(ce."employeeId"), '') IS NOT NULL
        AND b.read_enabled = TRUE`,
    [userId]
  );
  return rows;
}

export async function eligibility(userId, db = pool) {
  const id = positiveInt(userId);
  if (!id || !integrationEnabled() || !(await schemaAvailable(db))) return { eligible: false, reason: 'unavailable' };
  const rows = await eligibleRosterRows(id, db);
  if (rows.length === 0) return { eligible: false, reason: 'employer_not_connected' };
  const corporates = new Set(rows.map((r) => r.corporate_id));
  if (corporates.size > 1 || rows.length > 1) return { eligible: false, reason: 'ambiguous_roster' };
  return { eligible: true, consentPolicyVersion: CONSENT_POLICY_VERSION };
}

export async function linkMember({ userId, consent, policyVersion, ip = null, userAgent = null, requestId = null }, db = pool) {
  const id = positiveInt(userId);
  if (!id) throw new SmartCrmError('BAD_REQUEST', 'Unknown user.', 400);
  if (!integrationEnabled()) throw new SmartCrmError('DISABLED', 'Insurance sync is switched off.', 503);
  await ensureReady(db);
  if (consent !== true) {
    throw new SmartCrmError('CONSENT_REQUIRED', 'Consent to share insurance details is required to link.', 400);
  }
  if (policyVersion !== CONSENT_POLICY_VERSION) {
    throw new SmartCrmError('CONSENT_OUTDATED', 'Please review the current consent text and try again.', 400,
      { policyVersion: CONSENT_POLICY_VERSION });
  }

  const existing = await getActiveLink(id, db);
  if (existing) return { link: existing, created: false };

  const rows = await eligibleRosterRows(id, db);
  if (rows.length === 0) {
    throw new SmartCrmError('NOT_ELIGIBLE', 'Your employer\'s insurance is not connected to the app yet.', 404);
  }
  if (rows.length > 1) {
    // Two roster rows (two employers, or two codes) — do not pick one.
    await auditPartnerEvent({ action: 'smartcrm.link.refused_ambiguous', userId: id, requestId, metadata: { candidates: rows.length } }, db);
    throw new SmartCrmError('AMBIGUOUS_ROSTER', 'We found more than one employee record for you. Please contact your HR team.', 409);
  }
  const [roster] = rows;
  const binding = await loadBinding(roster.corporate_id, db);

  const client = await db.connect();
  let link;
  try {
    await client.query('BEGIN');
    // patient_consents has forced row-level security keyed on app.current_user_id.
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(id)]);
    const { rows: [consentRow] } = await client.query(
      `INSERT INTO patient_consents
         (id, user_id, consent_type, consent_category, consented, consented_at,
          policy_version, ip_address, user_agent, consent_method, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'DATA_SHARING', 'explicit', TRUE, NOW(),
               $2, $3, $4, 'digital', $5::jsonb, NOW(), NOW())
       RETURNING id`,
      // organization_id is left NULL on purpose: it is a tenants/organisations
      // reference, and a corporates id in it is the id-collision bug the
      // entity uid rule exists to prevent. The corporate goes in metadata.
      [id, CONSENT_POLICY_VERSION, ip ? String(ip).slice(0, 64) : null,
        userAgent ? String(userAgent).slice(0, 500) : null,
        JSON.stringify({ scope: 'smartcrm_insurance_link', corporate_id: roster.corporate_id, source_tenant: binding.tenant_slug, source_corporate: binding.smartcrm_corporate })]
    );
    const { rows: [created] } = await client.query(
      `INSERT INTO insurance_member_links
         (user_id, corporate_id, source_system, source_tenant, source_corporate, emp_id, consent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, roster.corporate_id, SOURCE_SYSTEM, binding.tenant_slug, binding.smartcrm_corporate,
        String(roster.emp_id).trim(), consentRow.id]
    );
    link = created;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === '23505') {
      await auditPartnerEvent({ action: 'smartcrm.link.refused_taken', userId: id, corporateId: roster.corporate_id, requestId, metadata: { constraint: error.constraint } }, db);
      throw new SmartCrmError('ALREADY_LINKED', 'This employee record is already linked to another account. Please contact your HR team.', 409);
    }
    throw error;
  } finally {
    client.release();
  }

  await auditPartnerEvent({ action: 'smartcrm.link.created', userId: id, corporateId: link.corporate_id, requestId, resourceId: link.id, metadata: { consent_id: link.consent_id } }, db);
  return { link, created: true };
}

export async function unlinkMember({ userId, requestId = null }, db = pool) {
  const id = positiveInt(userId);
  await ensureReady(db);
  const link = await getActiveLink(id, db);
  if (!link) return { unlinked: false };
  await db.query(
    `UPDATE insurance_member_links SET status = 'unlinked', unlinked_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [link.id]
  );
  if (link.consent_id) {
    const withdraw = (q) => q.query(
      `UPDATE patient_consents SET consented = FALSE, withdrawn_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2`,
      [link.consent_id, id]
    );
    // patient_consents has forced row-level security keyed on app.current_user_id.
    if (typeof db.connect === 'function') await withRlsTransaction(db, { userId: id }, withdraw);
    else await withdraw(db);
  }
  const hidden = await retireProjection(link, db);
  await auditPartnerEvent({ action: 'smartcrm.link.removed', userId: id, corporateId: link.corporate_id, requestId, resourceId: link.id, metadata: { members_hidden: hidden } }, db);
  return { unlinked: true, membersHidden: hidden };
}

async function markLink(link, fields, db) {
  const sets = [];
  const params = [link.id];
  for (const [col, value] of Object.entries(fields)) {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  }
  await db.query(`UPDATE insurance_member_links SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
}

/**
 * Reads the member's summary from SmartCRM and projects it.
 * @param {{ userId:number, force?:boolean, requestId?:string, fetchImpl?:Function }} options
 */
export async function refreshMember({ userId, force = false, requestId = null, fetchImpl } = {}, db = pool) {
  const id = positiveInt(userId);
  await ensureReady(db);
  const link = await getActiveLink(id, db);
  if (!link) throw new SmartCrmError('NOT_LINKED', 'No insurance membership is linked.', 409);
  const binding = await loadBinding(link.corporate_id, db);
  if (!binding?.read_enabled || binding.tenant_slug !== link.source_tenant || binding.smartcrm_corporate !== link.source_corporate) {
    throw new SmartCrmError('NOT_CONFIGURED', 'Insurance sync is not enabled for your employer.', 503);
  }

  const last = lastRefreshAt.get(id) || 0;
  if (!force && Date.now() - last < REFRESH_MIN_INTERVAL_MS) {
    return { refreshed: false, throttled: true, link: describeLink(link, binding) };
  }
  lastRefreshAt.set(id, Date.now());

  const audit = (action, metadata = {}) => auditPartnerEvent(
    { action, userId: id, corporateId: link.corporate_id, requestId, resourceId: link.source_member_id || link.id, metadata }, db
  );

  let response;
  try {
    response = await partnerRequest(binding, link, { op: 'summary', method: 'GET', userId: id, requestId, fetchImpl });
  } catch (error) {
    await markLink(link, { last_error: String(error.code || 'error').slice(0, 200) }, db);
    await audit('smartcrm.summary.failed', { code: error.code });
    throw error;
  }

  if (response.status === 404) {
    // SmartCRM no longer has this member under this corporate (left, moved).
    // Hide what was projected rather than keep showing cover that may be gone.
    const hidden = await retireProjection(link, db);
    await markLink(link, { last_error: 'member_not_found' }, db);
    await audit('smartcrm.summary.not_found', { status: 404, ms: response.ms, members_hidden: hidden });
    throw new SmartCrmError('MEMBER_NOT_FOUND', 'Your insurer has no active membership for you. Please contact your HR team.', 404);
  }
  if (response.status === 401 || response.status === 403) {
    await markLink(link, { last_error: `partner_auth_${response.status}` }, db);
    await audit('smartcrm.summary.auth_refused', { status: response.status, ms: response.ms });
    throw new SmartCrmError('NOT_CONFIGURED', 'Insurance sync is not configured correctly for your employer.', 503);
  }
  if (response.status !== 200) {
    await markLink(link, { last_error: `upstream_${response.status}` }, db);
    await audit('smartcrm.summary.rejected', { status: response.status, ms: response.ms });
    throw new SmartCrmError('UPSTREAM_REJECTED', 'Your insurance details could not be refreshed.', 502, { upstreamStatus: response.status });
  }

  // Dependants come one policy per call: read each other active policy too.
  // Any of these failing fails the refresh, and the last good projection stays.
  const byPolicy = {};
  for (const { key, policyNo } of policiesNeedingDetail(response.body)) {
    let detail;
    try {
      detail = await partnerRequest(binding, link, { op: 'summary', method: 'GET', userId: id, requestId, fetchImpl, query: { policy_no: policyNo } });
    } catch (error) {
      await markLink(link, { last_error: String(error.code || 'error').slice(0, 200) }, db);
      await audit('smartcrm.summary.failed', { code: error.code, policy: 'detail' });
      throw error;
    }
    if (detail.status !== 200) {
      await markLink(link, { last_error: `upstream_${detail.status}` }, db);
      await audit('smartcrm.summary.rejected', { status: detail.status, policy: 'detail' });
      throw new SmartCrmError('UPSTREAM_REJECTED', 'Your insurance details could not be refreshed.', 502, { upstreamStatus: detail.status });
    }
    byPolicy[key] = detail.body;
  }

  const mapped = mapSummary(response.body, byPolicy);
  if (!mapped.ok) {
    // Keep what was last projected (it came from a good read) but say so.
    await markLink(link, { last_error: `payload_shape: ${mapped.reason}`.slice(0, 200) }, db);
    await audit('smartcrm.summary.bad_payload', { reason: mapped.reason, contract: mapped.contract, ms: response.ms });
    throw new SmartCrmError('BAD_UPSTREAM_PAYLOAD', 'Your insurance details could not be read. We have been notified.', 502);
  }

  if (link.source_member_id && link.source_member_id !== mapped.memberId) {
    const hidden = await retireProjection(link, db);
    await markLink(link, { status: 'mismatch', last_error: 'member_id_changed' }, db);
    await audit('smartcrm.summary.member_mismatch', { expected: link.source_member_id, received: mapped.memberId, members_hidden: hidden });
    throw new SmartCrmError('MEMBER_MISMATCH', 'Your insurance record could not be verified. Please contact your HR team.', 409);
  }

  let result;
  try {
    result = await applyProjection(link, mapped, db);
  } catch (error) {
    if (error.code === 'MEMBER_CONFLICT' || error.code === 'POLICY_CONFLICT') {
      await markLink(link, { status: 'mismatch', last_error: error.code.toLowerCase() }, db);
      await audit('smartcrm.summary.conflict', { code: error.code, received: mapped.memberId });
    }
    throw error;
  }
  await audit('smartcrm.summary.projected', { ...result, ms: response.ms, contract: mapped.contract });
  const fresh = await getActiveLink(id, db);
  return { refreshed: true, ...result, link: describeLink(fresh, binding) };
}

export default {
  CONSENT_POLICY_VERSION, getActiveLink, describeLink, eligibility, linkMember, unlinkMember, refreshMember,
};
