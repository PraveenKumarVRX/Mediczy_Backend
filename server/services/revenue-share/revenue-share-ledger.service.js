/**
 * Revenue-Share Ledger — the shared monetisation primitive (Feasibility Plan Phase 0).
 *
 * One abstraction for every revenue-share / commission / success-fee flow:
 *   M1 Tele-ICU   — per-round / per-bed-day specialist fees
 *   M2 Homecare   — episode fees, helpline hook, chronic subscriptions
 *   M3 Equipment  — per-procedure usage fees (future)
 *   M4 RCM        — success fee on recovered revenue
 *   M5 Sterile    — per-tray fees (future)
 *   M6 Marketplace — commission on specialist engagements
 *   M7 Uttarakhand — outcome-based NHM payments (future)
 *
 * Lifecycle: accrued -> invoiced -> paid   (accrued -> voided)
 * Idempotent by (organization_id, idempotency_key).
 */
import pool from '../../db/pgPool.js';

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

export const FEE_TYPES = ['percent', 'flat', 'per_unit'];
export const LEDGER_STATUSES = ['accrued', 'invoiced', 'paid', 'voided'];

export const LEDGER_TRANSITIONS = {
  accrued: ['invoiced', 'voided'],
  invoiced: ['paid', 'voided'],
  paid: [],
  voided: [],
};

/** Validate a ledger status transition; returns { ok, reason? }. */
export function canTransition(from, to) {
  if (!LEDGER_STATUSES.includes(from)) return { ok: false, reason: `unknown status "${from}"` };
  if (!LEDGER_STATUSES.includes(to)) return { ok: false, reason: `unknown status "${to}"` };
  if (from === to) return { ok: false, reason: 'no-op transition' };
  if (!LEDGER_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `illegal transition ${from} -> ${to}` };
  }
  return { ok: true };
}

/**
 * Compute the fee for a gross amount.
 *  - percent:  feeRate is a percentage (4.5 => 4.5%)
 *  - flat:     feeRate is an absolute amount per event
 *  - per_unit: feeRate is an absolute amount × units (defaults to 1)
 * Rounds half-up to 2dp; negative/NaN inputs throw.
 */
export function computeFee({ amount, feeType, feeRate, units = 1 }) {
  const gross = Number(amount);
  const rate = Number(feeRate);
  if (!Number.isFinite(gross) || gross < 0) throw new Error(`invalid amount: ${amount}`);
  if (!Number.isFinite(rate) || rate < 0) throw new Error(`invalid feeRate: ${feeRate}`);
  if (!FEE_TYPES.includes(feeType)) throw new Error(`invalid feeType: ${feeType}`);

  let fee;
  switch (feeType) {
    case 'percent': fee = (gross * rate) / 100; break;
    case 'flat': fee = rate; break;
    case 'per_unit': {
      const u = Number(units);
      if (!Number.isFinite(u) || u <= 0) throw new Error(`invalid units: ${units}`);
      fee = rate * u;
      break;
    }
    default: throw new Error(`invalid feeType: ${feeType}`);
  }
  // Round half-up to 2 decimal places (never float-drift the ledger)
  return Math.round((fee + Number.EPSILON) * 100) / 100;
}

export function isAgreementEffective(agreement, at = new Date()) {
  if (!agreement || agreement.active === false) return false;
  const from = agreement.effective_from ? new Date(agreement.effective_from) : null;
  const to = agreement.effective_to ? new Date(agreement.effective_to) : null;
  if (from && at < from) return false;
  if (to && at > to) return false;
  return true;
}

/** Build a deterministic idempotency key fragment. */
export function idempotencyKey(domain, sourceType, sourceId, suffix = '') {
  return [domain, sourceType, sourceId, suffix].filter(Boolean).join(':');
}

// ── DB bootstrap ─────────────────────────────────────────────────────────────

let tablesEnsured = null;
export async function ensureLedgerTables() {
  if (!tablesEnsured) {
    tablesEnsured = pool.query(`
      CREATE TABLE IF NOT EXISTS revenue_share_agreements (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        counterparty_type VARCHAR(30) NOT NULL DEFAULT 'platform',
        counterparty_id INTEGER,
        scope_domain VARCHAR(40) NOT NULL,
        scope_entity_id VARCHAR(80),
        fee_type VARCHAR(20) NOT NULL DEFAULT 'percent',
        fee_rate NUMERIC(12,4) NOT NULL DEFAULT 0,
        currency VARCHAR(8) NOT NULL DEFAULT 'INR',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        effective_from TIMESTAMPTZ,
        effective_to TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rsa_lookup
        ON revenue_share_agreements(organization_id, scope_domain, active);
    `).catch(err => { tablesEnsured = null; throw err; });
  }
  return tablesEnsured;
}

async function ensureLedgerTable() {
  await ensureLedgerTables();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenue_share_ledger (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      agreement_id BIGINT REFERENCES revenue_share_agreements(id),
      domain VARCHAR(40) NOT NULL,
      counterparty_type VARCHAR(30),
      counterparty_id INTEGER,
      source_type VARCHAR(50) NOT NULL,
      source_id VARCHAR(80) NOT NULL,
      description TEXT,
      gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      currency VARCHAR(8) NOT NULL DEFAULT 'INR',
      status VARCHAR(20) NOT NULL DEFAULT 'accrued',
      invoice_id BIGINT,
      paid_at TIMESTAMPTZ,
      voided_reason TEXT,
      idempotency_key VARCHAR(160) UNIQUE,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rsl_org_domain ON revenue_share_ledger(organization_id, domain, status);
    CREATE INDEX IF NOT EXISTS idx_rsl_source ON revenue_share_ledger(source_type, source_id);
  `);
}

// ── Agreements ───────────────────────────────────────────────────────────────

export async function upsertAgreement({ organizationId, counterpartyType = 'platform', counterpartyId = null, scopeDomain, scopeEntityId = null, feeType, feeRate, currency = 'INR', effectiveFrom = null, effectiveTo = null, metadata = {} }) {
  await ensureLedgerTables();
  if (!FEE_TYPES.includes(feeType)) throw new Error(`invalid feeType: ${feeType}`);
  const { rows } = await pool.query(
    `INSERT INTO revenue_share_agreements
       (organization_id, counterparty_type, counterparty_id, scope_domain, scope_entity_id, fee_type, fee_rate, currency, effective_from, effective_to, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     RETURNING *`,
    [organizationId, counterpartyType, counterpartyId, scopeDomain, scopeEntityId, feeType, feeRate, currency, effectiveFrom, effectiveTo, JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function listAgreements(organizationId, { scopeDomain = null, active = null } = {}) {
  await ensureLedgerTables();
  const { rows } = await pool.query(
    `SELECT * FROM revenue_share_agreements
     WHERE organization_id = $1
       AND ($2::VARCHAR IS NULL OR scope_domain = $2)
       AND ($3::BOOLEAN IS NULL OR active = $3)
     ORDER BY created_at DESC`,
    [organizationId, scopeDomain, active]
  );
  return rows;
}

/** Resolve the best active agreement for a domain (entity/counterparty-scoped beats generic). */
export async function resolveAgreement({ organizationId, scopeDomain, scopeEntityId = null, counterpartyId = null }) {
  await ensureLedgerTables();
  const { rows } = await pool.query(
    `SELECT * FROM revenue_share_agreements
     WHERE organization_id = $1 AND scope_domain = $2 AND active = TRUE
       AND (effective_from IS NULL OR effective_from <= NOW())
       AND (effective_to IS NULL OR effective_to >= NOW())
       AND ($3::VARCHAR IS NULL OR scope_entity_id = $3)
       AND ($4::INTEGER IS NULL OR counterparty_id = $4)
     ORDER BY (scope_entity_id IS NULL) ASC, created_at DESC
     LIMIT 1`,
    [organizationId, scopeDomain, scopeEntityId, counterpartyId]
  );
  return rows[0] || null;
}

// ── Ledger writes ────────────────────────────────────────────────────────────

/**
 * Record a revenue event and accrue the fee per the active agreement.
 * Falls back to `fallbackAgreement` (inline {fee_type, fee_rate, counterparty_*}) when no DB agreement exists.
 * Idempotent: re-recording the same key returns the original entry with `duplicate: true`.
 */
export async function recordRevenueEvent({
  organizationId, domain, sourceType, sourceId, grossAmount,
  description = null, metadata = {}, suffix = '',
  fallbackAgreement = null, scopeEntityId = null,
}) {
  await ensureLedgerTable();
  const key = idempotencyKey(domain, sourceType, sourceId, suffix);

  const existing = await pool.query(
    `SELECT * FROM revenue_share_ledger WHERE idempotency_key = $1 LIMIT 1`, [key]
  );
  if (existing.rowCount) return { ...existing.rows[0], duplicate: true };

  const agreement = await resolveAgreement({ organizationId, scopeDomain: domain, scopeEntityId });
  let feeType = agreement?.fee_type;
  let feeRate = agreement?.fee_rate;
  let counterpartyType = agreement?.counterparty_type;
  let counterpartyId = agreement?.counterparty_id;
  const agreementId = agreement?.id || null;
  let currency = agreement?.currency || 'INR';

  if (!agreement && fallbackAgreement) {
    feeType = fallbackAgreement.fee_type;
    feeRate = fallbackAgreement.fee_rate;
    counterpartyType = fallbackAgreement.counterparty_type || 'platform';
    counterpartyId = fallbackAgreement.counterparty_id ?? null;
    currency = fallbackAgreement.currency || currency;
  }
  if (!feeType || feeRate == null) {
    throw new Error(`no revenue-share agreement configured for domain "${domain}" (org ${organizationId})`);
  }

  const fee = computeFee({ amount: grossAmount, feeType, feeRate, units: metadata.units });

  const { rows } = await pool.query(
    `INSERT INTO revenue_share_ledger
       (organization_id, agreement_id, domain, counterparty_type, counterparty_id, source_type, source_id, description, gross_amount, fee_amount, currency, status, idempotency_key, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'accrued',$12,$13::jsonb)
     RETURNING *`,
    [organizationId, agreementId, domain, counterpartyType, counterpartyId, sourceType, sourceId, description, grossAmount, fee, currency, key, JSON.stringify({ ...metadata, feeType, feeRate })]
  );
  return { ...rows[0], duplicate: false };
}

// ── Ledger lifecycle ─────────────────────────────────────────────────────────

export async function transitionEntry(entryId, organizationId, toStatus, { invoiceId = null, voidedReason = null } = {}) {
  await ensureLedgerTable();
  const { rows } = await pool.query(
    `SELECT * FROM revenue_share_ledger WHERE id = $1 AND organization_id = $2`,
    [entryId, organizationId]
  );
  if (!rows.length) throw new Error(`ledger entry ${entryId} not found`);
  const check = canTransition(rows[0].status, toStatus);
  if (!check.ok) throw new Error(check.reason);

  const { rows: updated } = await pool.query(
    `UPDATE revenue_share_ledger
       SET status = $3,
           invoice_id = COALESCE($4, invoice_id),
           paid_at = CASE WHEN $3 = 'paid' THEN NOW() ELSE paid_at END,
           voided_reason = $5,
           updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [entryId, organizationId, toStatus, invoiceId, voidedReason]
  );
  return updated[0];
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listLedger(organizationId, { domain = null, status = null, sourceType = null, limit = 100, offset = 0 } = {}) {
  await ensureLedgerTable();
  const { rows } = await pool.query(
    `SELECT * FROM revenue_share_ledger
     WHERE organization_id = $1
       AND ($2::VARCHAR IS NULL OR domain = $2)
       AND ($3::VARCHAR IS NULL OR status = $3)
       AND ($4::VARCHAR IS NULL OR source_type = $4)
     ORDER BY created_at DESC
     LIMIT $5 OFFSET $6`,
    [organizationId, domain, status, sourceType, limit, offset]
  );
  return rows;
}

export async function ledgerSummary(organizationId, { domain = null } = {}) {
  await ensureLedgerTable();
  const { rows } = await pool.query(
    `SELECT domain, status, currency,
            COUNT(*) AS entry_count,
            COALESCE(SUM(gross_amount),0) AS gross_amount,
            COALESCE(SUM(fee_amount),0) AS fee_amount
     FROM revenue_share_ledger
     WHERE organization_id = $1 AND ($2::VARCHAR IS NULL OR domain = $2)
     GROUP BY domain, status, currency
     ORDER BY domain, status`,
    [organizationId, domain]
  );
  const totals = rows.reduce((acc, r) => {
    acc.gross += Number(r.gross_amount);
    acc.fee += Number(r.fee_amount);
    acc.entries += Number(r.entry_count);
    return acc;
  }, { gross: 0, fee: 0, entries: 0 });
  return { breakdown: rows, totals, currency: rows[0]?.currency || 'INR' };
}
