/**
 * Discharge summaries written through the hospital practice screen (audit CLN-06).
 *
 * Fixes: (1) patient/admission ids are verified against the caller's hospital instead of trusted from the body;
 * (2) saving twice or saving-then-submitting updates ONE row instead of inserting duplicates (production already had
 * 4 summaries for 2 admissions); (3) `status` can only move draft → pending_approval here — 'approved' can no longer be
 * written by any hospital user through this route; (4) an approved summary is immutable through this route.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const EDITABLE = ['draft', 'pending_approval'];
const json = (v) => JSON.stringify(v || []);

/** Admission must belong to this hospital; patient must be visible in this hospital's tenant. */
export async function assertScope(hospitalId, { patientId, admissionId }) {
  if (admissionId != null && admissionId !== '') {
    const { rows } = await pool.query('SELECT id FROM ip_admissions WHERE id = $1 AND organization_id = $2', [Number(admissionId), hospitalId]);
    if (!rows[0]) throw err(404, 'ADMISSION_NOT_FOUND', 'Admission not found in this hospital');
  }
  if (patientId == null || patientId === '') throw err(400, 'PATIENT_REQUIRED', 'Patient ID is required');
  const pid = Number(patientId);
  if (!Number.isInteger(pid) || pid <= 0) throw err(400, 'PATIENT_INVALID', 'Patient ID is invalid');
  const found = await withRlsTransaction(pool, { orgId: hospitalId, userId: 0, isPlatformAdmin: false }, async (client) =>
    (await client.query(
      `SELECT 1 FROM patients p JOIN users u ON u.id = p."userId" WHERE p.id = $1 OR p."userId" = $1 LIMIT 1`, [pid])).rows[0]);
  if (!found) throw err(404, 'PATIENT_NOT_FOUND', 'Patient not found in this hospital');
  return pid;
}

async function findOpen(hospitalId, pid, admissionId) {
  const { rows } = admissionId != null && admissionId !== ''
    ? await pool.query(
      `SELECT * FROM discharge_summaries WHERE hospital_id = $1 AND admission_id = $2 AND status = ANY($3) ORDER BY id DESC LIMIT 1`,
      [hospitalId, Number(admissionId), EDITABLE])
    : await pool.query(
      `SELECT * FROM discharge_summaries WHERE hospital_id = $1 AND patient_id = $2 AND admission_id IS NULL AND status = ANY($3) ORDER BY id DESC LIMIT 1`,
      [hospitalId, pid, EDITABLE]);
  return rows[0] || null;
}

/**
 * Save as draft, or submit for approval. Idempotent: returns the existing open summary for the admission (updated),
 * never a second row. `submittedNow` is true only on the transition into pending_approval, so callers send the
 * patient survey invitation exactly once.
 */
export async function saveSummary(hospitalId, body, { submit = false } = {}) {
  const pid = await assertScope(hospitalId, body);
  const admissionId = body.admissionId != null && body.admissionId !== '' ? Number(body.admissionId) : null;
  const fields = [json(body.diagnosis), json(body.procedures), json(body.medications), body.followUp ?? null,
    body.attendingDoctor || null, body.admissionDate || null, body.ward || null, body.bed || null];

  const existing = await findOpen(hospitalId, pid, admissionId);
  if (existing?.status === 'pending_approval') {
    if (submit) return { summary: existing, submittedNow: false, alreadySubmitted: true };
    throw err(409, 'SUMMARY_ALREADY_SUBMITTED', 'This summary is already submitted for approval');
  }
  if (existing) {
    const { rows } = await pool.query(
      `UPDATE discharge_summaries SET diagnosis = $3, procedures = $4, medications = $5, follow_up = $6,
              attending_doctor = $7, admission_date = $8, ward = $9, bed = $10,
              status = $11, submitted_at = CASE WHEN $12 THEN NOW() ELSE submitted_at END, updated_at = NOW()
        WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [existing.id, hospitalId, ...fields, submit ? 'pending_approval' : 'draft', submit]);
    return { summary: rows[0], submittedNow: submit, updatedExisting: true };
  }
  const { rows } = await pool.query(
    `INSERT INTO discharge_summaries (patient_id, admission_id, diagnosis, procedures, medications, follow_up,
        attending_doctor, admission_date, ward, bed, status, hospital_id, submitted_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $13 THEN NOW() END, NOW(), NOW()) RETURNING *`,
    [pid, admissionId, ...fields, submit ? 'pending_approval' : 'draft', hospitalId, submit]);
  return { summary: rows[0], submittedNow: submit, created: true };
}

/** Edit an open summary. Status may only be draft or pending_approval; approved summaries are immutable here. */
export async function updateSummary(hospitalId, id, body) {
  if (body.status != null && !EDITABLE.includes(body.status)) {
    throw err(400, 'STATUS_NOT_ALLOWED', `status can only be ${EDITABLE.join(' or ')} here; approval is a separate step`);
  }
  const { rows } = await pool.query(
    `UPDATE discharge_summaries SET diagnosis = $3, procedures = $4, medications = $5, follow_up = $6,
            status = COALESCE($7, status), updated_at = NOW()
      WHERE id = $1 AND hospital_id = $2 AND status = ANY($8) RETURNING *`,
    [Number(id), hospitalId, json(body.diagnosis), json(body.procedures), json(body.medications), body.followUp ?? null, body.status || null, EDITABLE]);
  if (!rows[0]) throw err(404, 'SUMMARY_NOT_EDITABLE', 'Discharge summary not found, already approved, or not yours');
  return rows[0];
}

export default { assertScope, saveSummary, updateSummary };
