/**
 * Specialist Registry & Marketplace (Model 6, Tier 2).
 * Second-opinion and tele-radiology workflows already exist (imaging-platform,
 * DoctorServices). This adds the missing exchange: a registry of specialists
 * with rate cards, a request/match workflow, and commission accrual through
 * the shared revenue-share ledger (fallback 10% platform commission).
 *
 * Note: hypergrid-marketplace.route.js is an unrelated plugin marketplace.
 */
import pool from '../../db/pgPool.js';
import { recordRevenueEvent, ledgerSummary } from '../revenue-share/revenue-share-ledger.service.js';

export const MARKETPLACE_DOMAIN = 'marketplace';
export const SERVICE_TYPES = ['second_opinion', 'tele_radiology', 'tele_pathology', 'locum'];
export const REQUEST_STATUSES = ['open', 'matched', 'accepted', 'in_progress', 'completed', 'cancelled', 'expired'];

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** Resolve the effective fee for a request against a specialist's rate card. */
export function resolveFee(rateCard = {}, request = {}) {
  const type = request.serviceType;
  const urgent = String(request.urgency || '').toLowerCase() === 'urgent';
  const entry = rateCard?.[type];
  let base;
  if (typeof entry === 'number') base = entry;
  else if (entry && typeof entry === 'object') base = entry.fee;
  else base = rateCard?.default ?? 0;
  base = Number(base);
  if (!Number.isFinite(base) || base < 0) throw new Error(`invalid rate card entry for ${type}`);
  let multiplier = 1;
  if (urgent) {
    const m = entry?.urgentMultiplier ?? rateCard?.urgentMultiplier ?? 1;
    multiplier = Number(m);
    if (!Number.isFinite(multiplier) || multiplier < 1) throw new Error('urgentMultiplier must be >= 1');
  }
  return Math.round(base * multiplier * 100) / 100;
}

/** Match score: specialty + modality + service type overlap, 0..100. */
export function scoreSpecialist(specialist, request) {
  let score = 0;
  const specialties = (specialist.specialties || []).map(s => String(s).toLowerCase());
  if (request.specialty && specialties.includes(String(request.specialty).toLowerCase())) score += 50;
  const modalities = (specialist.modalities || []).map(s => String(s).toLowerCase());
  if (request.modality && modalities.includes(String(request.modality).toLowerCase())) score += 30;
  if ((specialist.serviceTypes || []).includes(request.serviceType)) score += 20;
  if (specialist.acceptingRequests === false) score = Math.min(score, 10);
  return score;
}

/** Rank candidates: score desc, then completedRequests desc, then name asc. */
export function rankCandidates(candidates, request) {
  return candidates
    .map(c => ({ ...c, score: scoreSpecialist(c, request) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score || (b.completedRequests || 0) - (a.completedRequests || 0) || String(a.name || '').localeCompare(String(b.name || '')));
}

// ── DB ───────────────────────────────────────────────────────────────────────

let tablesEnsured = null;
export async function ensureTables() {
  if (!tablesEnsured) {
    tablesEnsured = pool.query(`
      CREATE TABLE IF NOT EXISTS specialist_registry (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        doctor_id INTEGER NOT NULL,
        name VARCHAR(160) NOT NULL,
        specialties JSONB DEFAULT '[]'::jsonb,
        modalities JSONB DEFAULT '[]'::jsonb,
        service_types JSONB DEFAULT '[]'::jsonb,
        languages JSONB DEFAULT '[]'::jsonb,
        license_no VARCHAR(60),
        accepting_requests BOOLEAN NOT NULL DEFAULT TRUE,
        rate_card JSONB DEFAULT '{}'::jsonb,
        commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
        completed_requests INTEGER NOT NULL DEFAULT 0,
        rating NUMERIC(3,2),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (organization_id, doctor_id)
      );
      CREATE INDEX IF NOT EXISTS idx_spr_org ON specialist_registry(organization_id, status);

      CREATE TABLE IF NOT EXISTS marketplace_requests (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        service_type VARCHAR(20) NOT NULL,
        specialty VARCHAR(80),
        modality VARCHAR(40),
        urgency VARCHAR(20) NOT NULL DEFAULT 'routine',
        patient_ref VARCHAR(80),
        case_summary TEXT,
        attachments JSONB DEFAULT '[]'::jsonb,
        requested_by INTEGER,
        specialist_id BIGINT REFERENCES specialist_registry(id),
        agreed_fee NUMERIC(14,2),
        currency VARCHAR(8) NOT NULL DEFAULT 'INR',
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        commission_entry_id BIGINT,
        matched_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mpr_org ON marketplace_requests(organization_id, status);
      CREATE INDEX IF NOT EXISTS idx_mpr_specialist ON marketplace_requests(specialist_id, status);
    `).catch(err => { tablesEnsured = null; throw err; });
  }
  return tablesEnsured;
}

// ── Specialist registry ──────────────────────────────────────────────────────

export async function registerSpecialist({ organizationId, doctorId, name, specialties = [], modalities = [], serviceTypes = [], languages = [], licenseNo = null, rateCard = {}, commissionPercent = 10, metadata = {} }) {
  await ensureTables();
  if (!name) throw new Error('name is required');
  for (const st of serviceTypes) {
    if (!SERVICE_TYPES.includes(st)) throw new Error(`invalid serviceType: ${st}`);
  }
  const rate = Number(commissionPercent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('commissionPercent must be 0..100');
  const { rows } = await pool.query(
    `INSERT INTO specialist_registry
       (organization_id, doctor_id, name, specialties, modalities, service_types, languages, license_no, rate_card, commission_percent, metadata)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10,$11::jsonb)
     ON CONFLICT (organization_id, doctor_id)
       DO UPDATE SET name = EXCLUDED.name, specialties = EXCLUDED.specialties, modalities = EXCLUDED.modalities,
                     service_types = EXCLUDED.service_types, languages = EXCLUDED.languages,
                     license_no = EXCLUDED.license_no, rate_card = EXCLUDED.rate_card,
                     commission_percent = EXCLUDED.commission_percent,
                     accepting_requests = TRUE, updated_at = NOW()
     RETURNING *`,
    [organizationId, doctorId, name, JSON.stringify(specialties), JSON.stringify(modalities), JSON.stringify(serviceTypes), JSON.stringify(languages), licenseNo, JSON.stringify(rateCard), rate, JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function searchSpecialists({ organizationId = null, specialty = null, serviceType = null, modality = null, limit = 50 } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM specialist_registry
     WHERE status = 'active' AND accepting_requests = TRUE
       AND ($1::INT IS NULL OR organization_id = $1)
       AND ($2::VARCHAR IS NULL OR specialties::TEXT ILIKE '%' || $2 || '%')
       AND ($3::VARCHAR IS NULL OR service_types::TEXT ILIKE '%' || $3 || '%')
       AND ($4::VARCHAR IS NULL OR modalities::TEXT ILIKE '%' || $4 || '%')
     ORDER BY completed_requests DESC, rating DESC NULLS LAST
     LIMIT $5`,
    [organizationId, specialty, serviceType, modality, limit]
  );
  return rows;
}

export async function updateSpecialistStatus(specialistId, organizationId, { acceptingRequests = null, status = null } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `UPDATE specialist_registry SET
       accepting_requests = COALESCE($3, accepting_requests),
       status = COALESCE($4, status),
       updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [specialistId, organizationId, acceptingRequests, status]
  );
  if (!rows.length) throw new Error(`specialist ${specialistId} not found`);
  return rows[0];
}

// ── Requests & matching ──────────────────────────────────────────────────────

export async function createRequest({ organizationId, serviceType, specialty = null, modality = null, urgency = 'routine', patientRef = null, caseSummary = null, attachments = [], requestedBy = null }) {
  await ensureTables();
  if (!SERVICE_TYPES.includes(serviceType)) throw new Error(`invalid serviceType: ${serviceType}`);
  const { rows } = await pool.query(
    `INSERT INTO marketplace_requests
       (organization_id, service_type, specialty, modality, urgency, patient_ref, case_summary, attachments, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,
    [organizationId, serviceType, specialty, modality, urgency, patientRef, caseSummary, JSON.stringify(attachments), requestedBy]
  );
  return rows[0];
}

/** Rank registry specialists for a request (pure scoreSpecialist/rankCandidates). */
export async function matchRequest(requestId, organizationId, { persist = false } = {}) {
  await ensureTables();
  const { rows: reqRows } = await pool.query(
    `SELECT * FROM marketplace_requests WHERE id = $1 AND organization_id = $2`,
    [requestId, organizationId]
  );
  if (!reqRows.length) throw new Error(`request ${requestId} not found`);
  const request = reqRows[0];
  const candidates = await searchSpecialists({ serviceType: request.service_type });
  const ranked = rankCandidates(candidates, {
    serviceType: request.service_type,
    specialty: request.specialty,
    modality: request.modality,
    urgency: request.urgency,
  }).map(c => ({
    specialistId: c.id, name: c.name, score: c.score,
    fee: resolveFee(c.rate_card || {}, { serviceType: request.service_type, urgency: request.urgency }),
    commissionPercent: c.commission_percent,
  }));
  if (persist && ranked.length) {
    await pool.query(
      `UPDATE marketplace_requests SET specialist_id = $3, agreed_fee = $4, status = 'matched',
         matched_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'open'`,
      [requestId, organizationId, ranked[0].specialistId, ranked[0].fee]
    );
  }
  return {
    requestId,
    request: { serviceType: request.service_type, specialty: request.specialty, urgency: request.urgency },
    matches: ranked,
  };
}

export async function assignSpecialist(requestId, organizationId, specialistId, { fee = null } = {}) {
  await ensureTables();
  const { rows: sp } = await pool.query(
    `SELECT id, rate_card, commission_percent, accepting_requests FROM specialist_registry WHERE id = $1`,
    [specialistId]
  );
  if (!sp.length) throw new Error(`specialist ${specialistId} not found`);
  if (!sp[0].accepting_requests) throw new Error(`specialist ${specialistId} is not accepting requests`);
  const { rows: r } = await pool.query(
    `SELECT * FROM marketplace_requests WHERE id = $1 AND organization_id = $2`,
    [requestId, organizationId]
  );
  if (!r.length) throw new Error(`request ${requestId} not found`);
  if (!['open', 'matched'].includes(r[0].status)) throw new Error(`request ${requestId} is ${r[0].status}, cannot assign`);
  const resolvedFee = fee != null ? Number(fee) : resolveFee(sp[0].rate_card || {}, { serviceType: r[0].service_type, urgency: r[0].urgency });
  const { rows } = await pool.query(
    `UPDATE marketplace_requests SET specialist_id = $3, agreed_fee = $4, status = 'matched', matched_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [requestId, organizationId, specialistId, resolvedFee]
  );
  return rows[0];
}

export async function listRequests(organizationId, { status = null, serviceType = null, specialistId = null, limit = 100 } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT r.*, s.name AS specialist_name FROM marketplace_requests r
     LEFT JOIN specialist_registry s ON s.id = r.specialist_id
     WHERE r.organization_id = $1
       AND ($2::VARCHAR IS NULL OR r.status = $2)
       AND ($3::VARCHAR IS NULL OR r.service_type = $3)
       AND ($4::BIGINT IS NULL OR r.specialist_id = $4)
     ORDER BY r.created_at DESC LIMIT $5`,
    [organizationId, status, serviceType, specialistId, limit]
  );
  return rows;
}

/** Complete a request → accrue specialist fee + platform commission in the ledger. */
export async function completeRequest(requestId, organizationId, { outcome = null, reportRef = null } = {}) {
  await ensureTables();
  const { rows: r } = await pool.query(
    `SELECT * FROM marketplace_requests WHERE id = $1 AND organization_id = $2`,
    [requestId, organizationId]
  );
  if (!r.length) throw new Error(`request ${requestId} not found`);
  const request = r[0];
  if (!['matched', 'accepted', 'in_progress'].includes(request.status)) {
    throw new Error(`request ${requestId} is ${request.status}, cannot complete`);
  }
  if (!request.specialist_id) throw new Error(`request ${requestId} has no assigned specialist`);
  if (request.completed_at) return { requestId: Number(requestId), status: 'completed', duplicate: true };

  const { rows: sp } = await pool.query(`SELECT * FROM specialist_registry WHERE id = $1`, [request.specialist_id]);
  const specialist = sp[0];
  const fee = Number(request.agreed_fee || 0);
  const commissionRate = Number(specialist.commission_percent || 10);

  let entry = null;
  if (fee > 0) {
    entry = await recordRevenueEvent({
      organizationId,
      domain: MARKETPLACE_DOMAIN,
      sourceType: 'specialist_service',
      sourceId: String(requestId),
      grossAmount: fee,
      description: `${request.service_type} — ${specialist.name} (${request.specialty || 'general'})`,
      fallbackAgreement: { fee_type: 'percent', fee_rate: commissionRate, counterparty_type: 'platform' },
      metadata: { requestId, specialistId: specialist.id, serviceType: request.service_type, outcome, reportRef },
    });
    await pool.query(
      `UPDATE marketplace_requests SET commission_entry_id = $3 WHERE id = $1 AND organization_id = $2`,
      [requestId, organizationId, entry.id]
    );
  }

  await pool.query(
    `UPDATE marketplace_requests SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [requestId]
  );
  await pool.query(
    `UPDATE specialist_registry SET completed_requests = completed_requests + 1, updated_at = NOW() WHERE id = $1`,
    [specialist.id]
  );

  return {
    requestId: Number(requestId),
    status: 'completed',
    fee,
    commissionPercent: commissionRate,
    platformCommission: Math.round(fee * commissionRate) / 100,
    ledgerEntry: entry,
  };
}

export async function getMarketplaceRevenueSummary(organizationId) {
  return ledgerSummary(organizationId, { domain: MARKETPLACE_DOMAIN });
}
