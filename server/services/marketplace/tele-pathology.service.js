/**
 * Tele-Pathology Module (Model 6, Tier 2).
 * Greenfield but modeled directly on the existing imaging workflow:
 * specimen → slide (digital image / scanner) → pathologist consult → report.
  * Commissions accrue via the shared revenue-share ledger.
 */
import pool from '../../db/pgPool.js';


export const TELEPATH_DOMAIN = 'telepathology';
export const SLIDE_STAINS = ['H&E', 'IHC', 'PAP', 'Giemsa', 'PAS', 'Ziehl-Neelsen', 'other'];
export const CONSULT_STATUSES = ['assigned', 'in_progress', 'reported', 'second_review', 'amended'];
export const PRIORITIES = ['routine', 'urgent', 'stat'];

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** Build a structured synoptic report skeleton for a specimen type. */
export function buildSynopticTemplate(specimenType, findings = {}) {
  if (!specimenType) throw new Error('specimenType is required');
  const base = {
    specimenType: String(specimenType),
    specimenId: findings.specimenId ?? null,
    grossDescription: findings.grossDescription ?? '',
    microscopicDescription: findings.microscopicDescription ?? '',
    diagnosis: findings.diagnosis ?? '',
    comment: findings.comment ?? '',
    margins: findings.margins ?? 'not applicable',
    tnmStage: findings.tnmStage ?? null,
    blocksExamined: Number.isFinite(Number(findings.blocksExamined)) ? Number(findings.blocksExamined) : null,
  };
  if (specimenType === 'biopsy') base.grade = findings.grade ?? null;
  if (specimenType === 'cytology') base.adequacy = findings.adequacy ?? 'satisfactory';
  if (specimenType === 'resection') base.lymphNodes = findings.lymphNodes ?? null;
  return base;
}

/** WHO/cap-style slide adequacy check before a consult can be reported. */
export function isSlideAdequate(slide) {
  if (!slide) throw new Error('slide is required');
  const resolutionOk = Number(slide.scanResolutionX ?? 0) >= 1920 && Number(slide.scanResolutionY ?? 0) >= 1080;
  const hasImage = Boolean(slide.imageUrl || slide.digitalImageUrl);
  const tissueVisible = slide.tissuePresent !== false;
  const foldsOccluding = slide.artifacts?.foldsOccludingTissue === true;
  return resolutionOk && hasImage && tissueVisible && !foldsOccluding;
}

// ── DB ───────────────────────────────────────────────────────────────────────

let tablesEnsured = null;
export async function ensureTables() {
  if (!tablesEnsured) {
    tablesEnsured = pool.query(`
      CREATE TABLE IF NOT EXISTS pathology_slides (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        specimen_id VARCHAR(80) NOT NULL,
        accession_no VARCHAR(80),
        specimen_type VARCHAR(40) NOT NULL DEFAULT 'biopsy',
        stain VARCHAR(30) NOT NULL DEFAULT 'H&E',
        body_site VARCHAR(80),
        image_url TEXT,
        digital_image_url TEXT,
        scan_resolution_x INTEGER,
        scan_resolution_y INTEGER,
        scanner_vendor VARCHAR(80),
        tissue_present BOOLEAN NOT NULL DEFAULT TRUE,
        artifacts JSONB DEFAULT '{}'::jsonb,
        clinical_history TEXT,
        prior_biopsy_ref VARCHAR(80),
        status VARCHAR(20) NOT NULL DEFAULT 'received',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_psl_org ON pathology_slides(organization_id, status);

      CREATE TABLE IF NOT EXISTS pathology_consults (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        slide_id BIGINT NOT NULL REFERENCES pathology_slides(id),
        pathologist_id INTEGER NOT NULL,
        pathologist_name VARCHAR(160),
        priority VARCHAR(10) NOT NULL DEFAULT 'routine',
        status VARCHAR(20) NOT NULL DEFAULT 'assigned',
        report JSONB DEFAULT '{}'::jsonb,
        reported_at TIMESTAMPTZ,
        amended_at TIMESTAMPTZ,
        fee NUMERIC(14,2),
        ledger_entry_id BIGINT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pcn_slide ON pathology_consults(slide_id, status);
    `).catch(err => { tablesEnsured = null; throw err; });
  }
  return tablesEnsured;
}

// ── Slides ───────────────────────────────────────────────────────────────────

export async function registerSlide({ organizationId, specimenId, accessionNo = null, specimenType = 'biopsy', stain = 'H&E', bodySite = null, imageUrl = null, digitalImageUrl = null, scanResolutionX = null, scanResolutionY = null, scannerVendor = null, tissuePresent = true, artifacts = {}, clinicalHistory = null, priorBiopsyRef = null, metadata = {} }) {
  await ensureTables();
  if (!specimenId) throw new Error('specimenId is required');
  if (!SLIDE_STAINS.includes(stain)) throw new Error(`invalid stain: ${stain}`);
  const { rows } = await pool.query(
    `INSERT INTO pathology_slides
       (organization_id, specimen_id, accession_no, specimen_type, stain, body_site, image_url, digital_image_url,
        scan_resolution_x, scan_resolution_y, scanner_vendor, tissue_present, artifacts, clinical_history, prior_biopsy_ref, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16::jsonb) RETURNING *`,
    [organizationId, specimenId, accessionNo, specimenType, stain, bodySite, imageUrl, digitalImageUrl,
     scanResolutionX, scanResolutionY, scannerVendor, !!tissuePresent, JSON.stringify(artifacts), clinicalHistory, priorBiopsyRef, JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function listSlides(organizationId, { status = null, specimenType = null, limit = 100 } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM pathology_slides
     WHERE organization_id = $1
       AND ($2::VARCHAR IS NULL OR status = $2)
       AND ($3::VARCHAR IS NULL OR specimen_type = $3)
     ORDER BY created_at DESC LIMIT $4`,
    [organizationId, status, specimenType, limit]
  );
  return rows;
}

// ── Consults ─────────────────────────────────────────────────────────────────

export async function createConsult({ organizationId, slideId, pathologistId, pathologistName = null, priority = 'routine', fee = 0 }) {
  await ensureTables();
  if (!PRIORITIES.includes(priority)) throw new Error(`invalid priority: ${priority}`);
  const { rows: slide } = await pool.query(
    `SELECT id, image_url, digital_image_url, scan_resolution_x, scan_resolution_y, tissue_present, artifacts
     FROM pathology_slides WHERE id = $1 AND organization_id = $2`,
    [slideId, organizationId]
  );
  if (!slide.length) throw new Error(`slide ${slideId} not found`);
  if (!isSlideAdequate(slide[0])) {
    throw new Error(`slide ${slideId} is not adequate for reporting (resolution/image/tissue/artifacts)`);
  }
  const { rows } = await pool.query(
    `INSERT INTO pathology_consults (organization_id, slide_id, pathologist_id, pathologist_name, priority, fee)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [organizationId, slideId, pathologistId, pathologistName, priority, fee]
  );
  await pool.query(`UPDATE pathology_slides SET status = 'in_consult', updated_at = NOW() WHERE id = $1`, [slideId]);
  return rows[0];
}

export async function submitReport(consultId, organizationId, { report = {}, pathologistId }) {
  await ensureTables();
  const { rows: c } = await pool.query(
    `SELECT * FROM pathology_consults WHERE id = $1 AND organization_id = $2`,
    [consultId, organizationId]
  );
  if (!c.length) throw new Error(`consult ${consultId} not found`);
  if (String(c[0].pathologist_id) !== String(pathologistId)) throw new Error('only the assigned pathologist can submit the report');
  if (c[0].status === 'reported') throw new Error(`consult ${consultId} already reported — use amend`);

  const slideRow = await pool.query(`SELECT * FROM pathology_slides WHERE id = $1`, [c[0].slide_id]);
  const synoptic = buildSynopticTemplate(slideRow.rows[0]?.specimen_type || 'biopsy', report);

  const { rows } = await pool.query(
    `UPDATE pathology_consults SET report = $3::jsonb, status = 'reported', reported_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [consultId, organizationId, JSON.stringify(synoptic)]
  );
  await pool.query(`UPDATE pathology_slides SET status = 'reported', updated_at = NOW() WHERE id = $1`, [c[0].slide_id]);
  return rows[0];
}

export async function amendReport(consultId, organizationId, { report = {}, pathologistId, reason = null }) {
  await ensureTables();
  const { rows: c } = await pool.query(
    `SELECT * FROM pathology_consults WHERE id = $1 AND organization_id = $2`,
    [consultId, organizationId]
  );
  if (!c.length) throw new Error(`consult ${consultId} not found`);
  if (String(c[0].pathologist_id) !== String(pathologistId)) throw new Error('only the assigned pathologist can amend the report');
  if (!['reported', 'second_review', 'amended'].includes(c[0].status)) throw new Error(`consult ${consultId} is ${c[0].status}, cannot amend`);

  const merged = { ...(c[0].report || {}), ...report, amendedReason: reason, amendedAt: new Date().toISOString() };
  const { rows } = await pool.query(
    `UPDATE pathology_consults SET report = $3::jsonb, status = 'amended', amended_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [consultId, organizationId, JSON.stringify(merged)]
  );
  return rows[0];
}

export async function listConsults(organizationId, { status = null, pathologistId = null, limit = 100 } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT c.*, s.specimen_id, s.specimen_type, s.stain, s.accession_no FROM pathology_consults c
     JOIN pathology_slides s ON s.id = c.slide_id
     WHERE c.organization_id = $1
       AND ($2::VARCHAR IS NULL OR c.status = $2)
       AND ($3::BIGINT IS NULL OR c.pathologist_id = $3)
     ORDER BY c.created_at DESC LIMIT $4`,
    [organizationId, status, pathologistId, limit]
  );
  return rows;
}
