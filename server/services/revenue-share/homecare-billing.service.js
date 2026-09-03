/**
 * Hospital-at-Home Billing (Model 2 monetisation wrapper).
 * Booking / programs / telemetry already exist (HomecareBooking.tsx, api-v1-homecare.js,
 * device.route.js telemetry). This adds the missing billing wrapper:
 *   - episode-based fee per admission-to-homecare
 *   - 24/7 helpline per-call billable event hook
 *   - chronic-care subscription cycle billing
 * All fees accrue in the shared revenue-share ledger.
 */
import pool from '../../db/pgPool.js';
import { recordRevenueEvent, ledgerSummary } from './revenue-share-ledger.service.js';

export const HOMECARE_DOMAIN = 'homecare';

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** Episode fee = (base + per-visit × visits) × acuity multiplier, 2dp. */
export function computeEpisodeFee({ baseFee = 0, perVisitFee = 0, visitCount = 0, acuityMultiplier = 1 }) {
  const base = Number(baseFee); const per = Number(perVisitFee); const visits = Number(visitCount); const mult = Number(acuityMultiplier);
  if (!Number.isFinite(base) || base < 0) throw new Error(`invalid baseFee: ${baseFee}`);
  if (!Number.isFinite(per) || per < 0) throw new Error(`invalid perVisitFee: ${perVisitFee}`);
  if (!Number.isFinite(visits) || visits < 0 || !Number.isInteger(visits)) throw new Error(`invalid visitCount: ${visitCount}`);
  if (!Number.isFinite(mult) || mult <= 0) throw new Error(`invalid acuityMultiplier: ${acuityMultiplier}`);
  return Math.round(((base + per * visits) * mult + Number.EPSILON) * 100) / 100;
}

/** How many billing cycles fit between two dates for a given interval (e.g., 30 days). */
export function cyclesBetween(startDate, endDate, intervalDays = 30) {
  const start = new Date(startDate); const end = new Date(endDate); const iv = Number(intervalDays);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('invalid dates');
  if (!Number.isFinite(iv) || iv <= 0) throw new Error(`invalid intervalDays: ${intervalDays}`);
  const elapsedDays = Math.floor((end - start) / 86400000);
  return Math.max(0, Math.floor(elapsedDays / iv));
}

// ── DB ───────────────────────────────────────────────────────────────────────

let tableEnsured = null;
async function ensureTable() {
  if (!tableEnsured) {
    tableEnsured = pool.query(`
      CREATE TABLE IF NOT EXISTS homecare_billing_events (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        patient_id INTEGER,
        episode_id VARCHAR(80),
        program_id INTEGER,
        event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('episode','helpline_call','subscription_cycle')),
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        currency VARCHAR(8) NOT NULL DEFAULT 'INR',
        ledger_entry_id BIGINT,
        idempotency_key VARCHAR(160) UNIQUE,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_hbe_org ON homecare_billing_events(organization_id, event_type, created_at);
    `).catch(err => { tableEnsured = null; throw err; });
  }
  return tableEnsured;
}

async function recordBillingEvent({ organizationId, eventType, amount, episodeId = null, patientId = null, programId = null, sourceId, metadata = {} }) {
  await ensureTable();
  const key = `${HOMECARE_DOMAIN}:${eventType}:${sourceId}`;
  const existing = await pool.query(`SELECT * FROM homecare_billing_events WHERE idempotency_key = $1`, [key]);
  if (existing.rowCount) return { ...existing.rows[0], duplicate: true };

  const entry = await recordRevenueEvent({
    organizationId,
    domain: HOMECARE_DOMAIN,
    sourceType: eventType,
    sourceId: String(sourceId),
    grossAmount: amount,
    description: `Homecare ${eventType.replace(/_/g, ' ')} ${sourceId}`,
    fallbackAgreement: { fee_type: 'percent', fee_rate: 15, counterparty_type: 'platform' },
    metadata: { ...metadata, billingSide: 'gross' },
  });

  const { rows } = await pool.query(
    `INSERT INTO homecare_billing_events
       (organization_id, patient_id, episode_id, program_id, event_type, amount, currency, ledger_entry_id, idempotency_key, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
    [organizationId, patientId, episodeId, programId, eventType, amount, entry.currency || 'INR', entry.id, key, JSON.stringify(metadata)]
  );
  return { ...rows[0], ledgerEntry: entry, duplicate: false };
}

// ── Billing operations ───────────────────────────────────────────────────────

/** Bill an episode of hospital-at-home care (idempotent per episode). */
export async function billHomecareEpisode({ organizationId, episodeId, patientId = null, baseFee, perVisitFee = 0, visitCount = 0, acuityMultiplier = 1, metadata = {} }) {
  const amount = computeEpisodeFee({ baseFee, perVisitFee, visitCount, acuityMultiplier });
  return recordBillingEvent({
    organizationId, eventType: 'episode', amount,
    episodeId: String(episodeId), patientId, sourceId: episodeId,
    metadata: { baseFee, perVisitFee, visitCount, acuityMultiplier, ...metadata },
  });
}

/** 24/7 helpline hook — bill each billable helpline contact (idempotent per call). */
export async function billHelplineCall({ organizationId, episodeId = null, patientId = null, callId, fee, metadata = {} }) {
  const amount = Number(fee);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`invalid helpline fee: ${fee}`);
  return recordBillingEvent({
    organizationId, eventType: 'helpline_call', amount,
    episodeId: episodeId ? String(episodeId) : null, patientId, sourceId: callId,
    metadata: { channel: metadata.channel || 'phone', ...metadata },
  });
}

/**
 * Chronic subscription billing — charge one cycle per eligible enrollment.
 * `enrollments`: [{ enrollmentId, patientId, programId, monthlyFee }]
 * Idempotent per (enrollment, periodKey).
 */
export async function runSubscriptionBilling({ organizationId, periodKey, enrollments = [], metadata = {} }) {
  if (!periodKey) throw new Error('periodKey is required (e.g., "2026-08")');
  const results = [];
  for (const e of enrollments) {
    const amount = Number(e.monthlyFee);
    if (!Number.isFinite(amount) || amount <= 0) {
      results.push({ enrollmentId: e.enrollmentId, skipped: `invalid monthlyFee ${e.monthlyFee}` });
      continue;
    }
    try {
      const billed = await recordBillingEvent({
        organizationId, eventType: 'subscription_cycle', amount,
        patientId: e.patientId ?? null, programId: e.programId ?? null,
        sourceId: `${e.enrollmentId}:${periodKey}`,
        metadata: { periodKey, ...metadata },
      });
      results.push({ enrollmentId: e.enrollmentId, billed: !billed.duplicate, ...billed });
    } catch (err) {
      results.push({ enrollmentId: e.enrollmentId, error: err.message });
    }
  }
  return { periodKey, processed: results.length, results };
}

export async function listBillingEvents(organizationId, { eventType = null, limit = 100, offset = 0 } = {}) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT * FROM homecare_billing_events
     WHERE organization_id = $1 AND ($2::VARCHAR IS NULL OR event_type = $2)
     ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
    [organizationId, eventType, limit, offset]
  );
  return rows;
}

export async function getHomecareRevenueSummary(organizationId) {
  return ledgerSummary(organizationId, { domain: HOMECARE_DOMAIN });
}
