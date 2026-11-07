/**
 * PM-JAY / state-scheme package master + scheme pre-authorisation (TMS) — RCM Phase 3.
 *
 * scheme_packages is national/state REFERENCE data (load real HBP masters via
 * bulkImportPackages); scheme_preauths is the hospital-scoped pre-auth lifecycle.
 * Neither table is RLS-protected, so queries are scoped by hospital_id explicitly
 * (mirrors the other RCM operational services).
 */
import pool from './../db/pgPool.js';

const PREAUTH_STATES = new Set(['initiated', 'submitted', 'query', 'approved', 'rejected', 'bed_blocked', 'claimed', 'closed', 'cancelled']);
const PREAUTH_TRANSITIONS = {
  initiated: ['submitted', 'cancelled'],
  submitted: ['query', 'approved', 'rejected'],
  query: ['submitted', 'rejected'],       // respond to a payer query / resubmit
  approved: ['bed_blocked', 'cancelled'],
  bed_blocked: ['claimed', 'cancelled'],  // admission blocked under TMS
  rejected: ['submitted'],                // correct and resubmit
  claimed: ['closed'],
  closed: [],
  cancelled: [],
};

const histEntry = (action, detail, actor) => ({ at: new Date().toISOString(), action, detail: detail || null, by: actor?.name || actor?.id || 'system' });

// ───────────────────────── Package master ─────────────────────────

export async function listPackages({ scheme, stateCode, q, specialty, active = true, limit = 100 } = {}) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  const term = q ? `%${String(q).trim().toLowerCase()}%` : null;
  const { rows } = await pool.query(
    `SELECT * FROM scheme_packages
      WHERE ($1::text IS NULL OR scheme = $1)
        AND ($2::text IS NULL OR COALESCE(state_code,'') = $2)
        AND ($3::text IS NULL OR specialty ILIKE $3)
        AND ($4::text IS NULL OR (LOWER(package_name) LIKE $4 OR LOWER(package_code) LIKE $4 OR LOWER(COALESCE(procedure_name,'')) LIKE $4))
        AND ($5::boolean IS NULL OR active = $5)
      ORDER BY scheme, specialty NULLS LAST, package_name
      LIMIT $6`,
    [scheme || null, stateCode == null ? null : String(stateCode), specialty ? `%${specialty}%` : null, term, active == null ? null : Boolean(active), lim]);
  return rows;
}

export async function getPackage(id) {
  const { rows } = await pool.query(`SELECT * FROM scheme_packages WHERE id = $1`, [Number(id)]);
  return rows[0] || null;
}

function normalizePackage(input) {
  const scheme = String(input.scheme || '').trim().toUpperCase();
  const packageCode = String(input.packageCode || input.package_code || '').trim();
  const packageName = String(input.packageName || input.package_name || '').trim();
  if (!scheme || !packageCode || !packageName) throw new Error('scheme, packageCode and packageName are required');
  const rate = Number(input.packageRate ?? input.package_rate ?? 0);
  if (!Number.isFinite(rate) || rate < 0) throw new Error('packageRate must be a non-negative number');
  const los = input.maxLosDays ?? input.max_los_days;
  return {
    scheme,
    stateCode: input.stateCode || input.state_code || null,
    packageCode,
    packageName: packageName.slice(0, 300),
    specialty: (input.specialty || null)?.slice?.(0, 120) ?? null,
    procedureName: (input.procedureName || input.procedure_name || null)?.slice?.(0, 300) ?? null,
    packageRate: Math.round(rate * 100) / 100,
    stratification: (input.stratification || null)?.slice?.(0, 40) ?? null,
    implantAllowed: Boolean(input.implantAllowed ?? input.implant_allowed ?? false),
    preAuthRequired: input.preAuthRequired ?? input.pre_auth_required ?? true,
    maxLosDays: los == null ? null : Number(los),
    revision: String(input.revision || 'HBP').slice(0, 40),
    active: input.active !== false,
    source: (input.source || null)?.slice?.(0, 80) ?? null,
  };
}

export async function upsertPackage(input) {
  const p = normalizePackage(input);
  const { rows } = await pool.query(
    `INSERT INTO scheme_packages
       (scheme, state_code, package_code, package_name, specialty, procedure_name, package_rate,
        stratification, implant_allowed, pre_auth_required, max_los_days, revision, active, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (scheme, COALESCE(state_code,''), package_code, revision) DO UPDATE SET
       package_name = EXCLUDED.package_name, specialty = EXCLUDED.specialty, procedure_name = EXCLUDED.procedure_name,
       package_rate = EXCLUDED.package_rate, stratification = EXCLUDED.stratification, implant_allowed = EXCLUDED.implant_allowed,
       pre_auth_required = EXCLUDED.pre_auth_required, max_los_days = EXCLUDED.max_los_days, active = EXCLUDED.active,
       source = EXCLUDED.source, updated_at = now()
     RETURNING *`,
    [p.scheme, p.stateCode, p.packageCode, p.packageName, p.specialty, p.procedureName, p.packageRate,
     p.stratification, p.implantAllowed, p.preAuthRequired, p.maxLosDays, p.revision, p.active, p.source]);
  return rows[0];
}

export async function bulkImportPackages(rowsInput, { source = 'bulk-import' } = {}) {
  if (!Array.isArray(rowsInput) || !rowsInput.length) throw new Error('A non-empty array of packages is required');
  if (rowsInput.length > 5000) throw new Error('A batch may contain at most 5000 packages');
  let imported = 0;
  const errors = [];
  for (let i = 0; i < rowsInput.length; i += 1) {
    try { await upsertPackage({ ...rowsInput[i], source: rowsInput[i].source || source }); imported += 1; }
    catch (e) { errors.push({ row: i + 1, message: e.message }); }
  }
  return { imported, failed: errors.length, errors: errors.slice(0, 100) };
}

// ───────────────────────── Scheme pre-auth (TMS) ─────────────────────────

export async function createSchemePreauth(input) {
  const { hospitalId, patientId = null, scheme, beneficiaryId = null, admissionDate = null, losDays = null, createdByUserId = null, actor } = input || {};
  if (!hospitalId || !scheme) throw new Error('hospitalId and scheme are required');
  let pkg = null;
  if (input.packageId) pkg = await getPackage(input.packageId);
  else if (input.packageCode) {
    const found = await listPackages({ scheme, q: input.packageCode, limit: 1 });
    pkg = found.find((r) => r.package_code === input.packageCode) || found[0] || null;
  }
  if ((input.packageId || input.packageCode) && !pkg) throw new Error('Package not found in the scheme master');
  const { rows } = await pool.query(
    `INSERT INTO scheme_preauths
       (hospital_id, patient_id, scheme, beneficiary_id, package_id, package_code, package_name, package_rate,
        status, admission_date, los_days, created_by_user_id, history)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'initiated',$9,$10,$11,$12::jsonb)
     RETURNING *`,
    [hospitalId, patientId, String(scheme).toUpperCase(), beneficiaryId,
     pkg?.id || null, pkg?.package_code || input.packageCode || null, pkg?.package_name || null,
     Number(pkg?.package_rate || 0), admissionDate, losDays == null ? null : Number(losDays),
     createdByUserId, JSON.stringify([histEntry('created', `Pre-auth initiated (${pkg?.package_code || 'no package'})`, actor)])]);
  return rows[0];
}

export async function listSchemePreauths(hospitalId, { status, scheme, limit = 100 } = {}) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  const { rows } = await pool.query(
    `SELECT * FROM scheme_preauths
      WHERE hospital_id = $1 AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR scheme = $3)
      ORDER BY created_at DESC LIMIT $4`,
    [hospitalId, status || null, scheme ? String(scheme).toUpperCase() : null, lim]);
  return rows;
}

export async function transitionSchemePreauth(hospitalId, id, toStatus, patch = {}, actor) {
  const to = String(toStatus || '').trim();
  if (!PREAUTH_STATES.has(to)) throw new Error('Invalid target status');
  const cur = await pool.query(`SELECT * FROM scheme_preauths WHERE id = $1 AND hospital_id = $2`, [Number(id), hospitalId]);
  const row = cur.rows[0];
  if (!row) throw new Error('Scheme pre-auth not found');
  const allowed = PREAUTH_TRANSITIONS[row.status] || [];
  if (!allowed.includes(to)) throw new Error(`Cannot move a ${row.status} pre-auth to ${to}`);

  const approvedAmount = to === 'approved'
    ? (patch.approvedAmount != null ? Number(patch.approvedAmount) : Number(row.package_rate || 0))
    : null;
  const entry = JSON.stringify(histEntry(`status:${to}`, patch.note || null, actor));
  const { rows } = await pool.query(
    `UPDATE scheme_preauths SET
        status          = $1,
        tms_reference   = COALESCE($2, tms_reference),
        query_note      = CASE WHEN $1 = 'query' THEN $3 ELSE query_note END,
        approved_amount = CASE WHEN $1 = 'approved' THEN $4 ELSE approved_amount END,
        approved_at     = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
        blocked_at      = CASE WHEN $1 = 'bed_blocked' THEN now() ELSE blocked_at END,
        claim_id        = COALESCE($5, claim_id),
        history         = history || $6::jsonb,
        updated_at      = now()
      WHERE id = $7 AND hospital_id = $8
      RETURNING *`,
    [to, patch.tmsReference || null, patch.note || null, approvedAmount,
     patch.claimId != null ? Number(patch.claimId) : null, entry, Number(id), hospitalId]);
  return rows[0];
}

export default {
  listPackages, getPackage, upsertPackage, bulkImportPackages,
  createSchemePreauth, listSchemePreauths, transitionSchemePreauth,
  PREAUTH_TRANSITIONS,
};
