/**
 * Denial management — insurance claim denials workflow
 */
import pool from '../db/pgPool.js';

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS claim_denials (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      claim_id INTEGER,
      claim_number VARCHAR(80),
      patient_id INTEGER,
      denial_code VARCHAR(40),
      denial_reason TEXT,
      denied_amount NUMERIC(14,2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'open',
      appeal_letter TEXT,
      appealed_at TIMESTAMPTZ,
      appealed_by INTEGER,
      resolved_at TIMESTAMPTZ,
      resolution_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_denials_hospital ON claim_denials(hospital_id, status);
  `);
}

export async function listDenials(hospitalId, { status, limit = 50 } = {}) {
  await ensureTables();
  const params = [hospitalId];
  let clause = '';
  if (status) {
    params.push(status);
    clause = ` AND status = $${params.length}`;
  }
  params.push(Math.min(100, limit));
  const { rows } = await pool.query(
    `SELECT * FROM claim_denials WHERE hospital_id = $1 ${clause}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function createDenial(hospitalId, data, actorId) {
  await ensureTables();
  const r = await pool.query(
    `INSERT INTO claim_denials
       (hospital_id, claim_id, claim_number, patient_id, denial_code, denial_reason, denied_amount, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'open') RETURNING *`,
    [
      hospitalId, data.claimId || null, data.claimNumber || null, data.patientId || null,
      data.denialCode || null, data.denialReason || null, Number(data.deniedAmount) || 0,
    ]
  );
  if (data.claimId) {
    await pool.query(`UPDATE insurance_claims SET status = 'denied', updated_at = NOW() WHERE id = $1`, [data.claimId]).catch(() => {});
  }
  return r.rows[0];
}

export async function draftAppeal(hospitalId, denialId, actorId) {
  await ensureTables();
  const d = await pool.query(`SELECT * FROM claim_denials WHERE id = $1 AND hospital_id = $2`, [denialId, hospitalId]);
  if (!d.rows[0]) throw new Error('Denial not found');

  const letter = `Appeal for claim ${d.rows[0].claim_number || denialId}
Denial code: ${d.rows[0].denial_code || 'N/A'}
Reason cited: ${d.rows[0].denial_reason || 'Not specified'}
Amount disputed: ₹${d.rows[0].denied_amount}

We respectfully request reconsideration based on medical necessity and policy coverage.
Please find enclosed clinical documentation supporting this claim.`;

  await pool.query(
    `UPDATE claim_denials SET appeal_letter = $2, status = 'appeal_drafted', appealed_at = NOW(), appealed_by = $3, updated_at = NOW() WHERE id = $1`,
    [denialId, letter, actorId || null]
  );
  return { denialId, appealLetter: letter };
}

export async function resolveDenial(hospitalId, denialId, { resolution, notes }, actorId) {
  await ensureTables();
  await pool.query(
    `UPDATE claim_denials SET status = $2, resolution_notes = $3, resolved_at = NOW(), updated_at = NOW() WHERE id = $1 AND hospital_id = $4`,
    [denialId, resolution || 'resolved', notes || null, hospitalId]
  );
  return { success: true, denialId };
}

export default { listDenials, createDenial, draftAppeal, resolveDenial };
