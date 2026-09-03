/**
 * Denial-Prediction → Follow-up Workflow Automation (Model 4).
 * The denial-risk prediction already exists (GET /api/v1/ai-revenue/denial-risk).
 * This closes the loop: high-risk claims automatically get a prioritised follow-up
 * task queue; resolving a follow-up as "recovered" bills the success fee via the
 * shared ledger (rcm-success-fee.service).
 */
import pool from '../../db/pgPool.js';
import { getDenialRiskScoring } from '../ai-revenue-intelligence.service.js';
import { recordRecoveredRevenue } from './rcm-success-fee.service.js';

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

export const FOLLOWUP_STATUSES = ['open', 'in_progress', 'resolved_recovered', 'resolved_written_off', 'dismissed'];

/** Bucket a 0..100 denial risk score into a work queue priority. */
export function classifyRiskBucket(score) {
  const s = Number(score);
  if (!Number.isFinite(s) || s < 0 || s > 100) throw new Error(`invalid denial risk score: ${score}`);
  if (s >= 75) return 'critical';
  if (s >= 50) return 'high';
  if (s >= 25) return 'medium';
  return 'low';
}

/** Recommended actions per denial reason (claims-rules-engine vocabulary + generic fallback). */
export function buildFollowupActions({ denialReason = null, riskScore = 0 }) {
  const bucket = classifyRiskBucket(riskScore);
  const actions = [];
  const reason = String(denialReason || '').toLowerCase();
  if (reason.includes('auth') || reason.includes('pre-auth')) actions.push('obtain_retro_preauth');
  if (reason.includes('room')) actions.push('room_rent_ceilingship_advisory');
  if (reason.includes('document') || reason.includes('record')) actions.push('attach_missing_documents');
  if (reason.includes('coding') || reason.includes('code')) actions.push('recoding_review');
  if (reason.includes('eligibility') || reason.includes('policy')) actions.push('reverify_eligibility');
  if (!actions.length) actions.push('tpa_followup_call');
  if (bucket === 'critical') actions.push('escalate_to_rcm_lead');
  return { bucket, actions };
}

/** Priority order for the work queue: critical first, then age (oldest first). */
export const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
export function prioritizeFollowups(rows) {
  return [...rows].sort((a, b) => {
    const ra = PRIORITY_RANK[a.priority_bucket] ?? 99;
    const rb = PRIORITY_RANK[b.priority_bucket] ?? 99;
    if (ra !== rb) return ra - rb;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

// ── DB ───────────────────────────────────────────────────────────────────────

let tableEnsured = null;
async function ensureTable() {
  if (!tableEnsured) {
    tableEnsured = pool.query(`
      CREATE TABLE IF NOT EXISTS rcm_denial_followups (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        claim_id VARCHAR(80) NOT NULL,
        patient_id INTEGER,
        risk_score NUMERIC(6,2),
        priority_bucket VARCHAR(12) NOT NULL,
        denial_reason TEXT,
        recommended_actions JSONB DEFAULT '[]'::jsonb,
        status VARCHAR(30) NOT NULL DEFAULT 'open',
        assigned_to INTEGER,
        outcome VARCHAR(30),
        recovered_amount NUMERIC(14,2),
        ledger_entry_id BIGINT,
        resolved_at TIMESTAMPTZ,
        resolved_by INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (organization_id, claim_id)
      );
      CREATE INDEX IF NOT EXISTS idx_rdf_queue ON rcm_denial_followups(organization_id, status, priority_bucket);
    `).catch(err => { tableEnsured = null; throw err; });
  }
  return tableEnsured;
}

// ── Workflow operations ──────────────────────────────────────────────────────

/**
 * Run the prediction→workflow bridge: pull denial-risk scoring and upsert an
 * open follow-up task for every claim above the threshold. Idempotent per claim.
 */
export async function runDenialRiskWorkflow(organizationId, { threshold = 50, minRiskScore = null } = {}) {
  await ensureTable();
  const scoring = await getDenialRiskScoring(organizationId);
  const claims = Array.isArray(scoring?.claims) ? scoring.claims
    : Array.isArray(scoring) ? scoring : [];

  const effectiveThreshold = minRiskScore ?? threshold;
  const created = [];
  for (const c of claims) {
    const score = Number(c.riskScore ?? c.risk_score ?? c.score ?? 0);
    if (score < effectiveThreshold) continue;
    const claimId = String(c.claimId ?? c.claim_id ?? c.id ?? '');
    if (!claimId) continue;
    const denialReason = c.denialReason ?? c.denial_reason ?? c.topRiskFactor ?? null;
    const { bucket, actions } = buildFollowupActions({ denialReason, riskScore: score });
    const { rows } = await pool.query(
      `INSERT INTO rcm_denial_followups
         (organization_id, claim_id, patient_id, risk_score, priority_bucket, denial_reason, recommended_actions, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'open')
       ON CONFLICT (organization_id, claim_id)
         DO UPDATE SET risk_score = EXCLUDED.risk_score,
                       priority_bucket = EXCLUDED.priority_bucket,
                       recommended_actions = EXCLUDED.recommended_actions,
                       updated_at = NOW()
       RETURNING *, (xmax = 0) AS inserted`,
      [organizationId, claimId, c.patientId ?? c.patient_id ?? null, score, bucket, denialReason, JSON.stringify(actions)]
    );
    created.push(rows[0]);
  }
  return { scanned: claims.length, threshold: effectiveThreshold, followups: created };
}

export async function getFollowupQueue(organizationId, { status = 'open', assignedTo = null } = {}) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT * FROM rcm_denial_followups
     WHERE organization_id = $1
       AND ($2::VARCHAR IS NULL OR status = $2)
       AND ($3::INTEGER IS NULL OR assigned_to = $3)
     ORDER BY created_at DESC
     LIMIT 500`,
    [organizationId, status, assignedTo]
  );
  return prioritizeFollowups(rows);
}

export async function claimFollowup(followupId, organizationId, userId) {
  await ensureTable();
  const { rows } = await pool.query(
    `UPDATE rcm_denial_followups
       SET status = 'in_progress', assigned_to = $3, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND status = 'open'
     RETURNING *`,
    [followupId, organizationId, userId]
  );
  if (!rows.length) throw new Error(`follow-up ${followupId} not open or not found`);
  return rows[0];
}

/**
 * Resolve a follow-up. When outcome = 'recovered' and recoveredAmount > 0,
 * the RCM success fee is automatically accrued in the shared ledger.
 */
export async function resolveFollowup(followupId, organizationId, { outcome, recoveredAmount = 0, notes = null, resolvedBy = null } = {}) {
  await ensureTable();
  if (!FOLLOWUP_STATUSES.includes(outcome)) throw new Error(`invalid outcome: ${outcome}`);
  const recovered = outcome === 'resolved_recovered';
  if (recovered && !(Number(recoveredAmount) > 0)) {
    throw new Error('recoveredAmount is required when outcome is resolved_recovered');
  }

  let ledgerEntry = null;
  if (recovered) {
    const { rows: cur } = await pool.query(
      `SELECT claim_id FROM rcm_denial_followups WHERE id = $1 AND organization_id = $2`,
      [followupId, organizationId]
    );
    if (!cur.length) throw new Error(`follow-up ${followupId} not found`);
    ledgerEntry = await recordRecoveredRevenue({
      organizationId,
      claimId: cur[0].claim_id,
      recoveredAmount,
      metadata: { via: 'denial-workflow', followupId },
    });
  }

  const { rows } = await pool.query(
    `UPDATE rcm_denial_followups
       SET status = $2, outcome = $2, recovered_amount = $3, notes = $4,
           ledger_entry_id = $5, resolved_at = NOW(), resolved_by = $6, updated_at = NOW()
     WHERE id = $1 AND organization_id = $7
     RETURNING *`,
    [followupId, outcome, recovered ? recoveredAmount : null, notes, ledgerEntry?.id ?? null, resolvedBy, organizationId]
  );
  if (!rows.length) throw new Error(`follow-up ${followupId} not found`);
  return { followup: rows[0], ledgerEntry };
}
