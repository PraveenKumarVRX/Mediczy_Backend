/**
 * CareOS — Medical Passport (patient-owned portable profile)
 */
import crypto from 'crypto';
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-ecosystem.migration.js';
import { getPatientWorkspace } from '../clinical-workspace.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

function makePatientCareId(patientId) {
  return `CPAT-${crypto.createHash('sha256').update(`pat-${patientId}`).digest('hex').slice(0, 16).toUpperCase()}`;
}

export async function getOrSyncPassport(patientId, organizationId) {
  await ensure();
  let { rows } = await pool.query(`SELECT * FROM careos_patient_passports WHERE patient_id = $1`, [patientId]);

  if (!rows[0]) {
    const workspace = await getPatientWorkspace(patientId, organizationId).catch(() => null);
    const meds = (workspace?.medications || []).map((m) => ({
      name: m.drug_name || m.drugName || m.name,
      dose: m.dose,
      status: m.status,
    }));
    const ins = await pool.query(
      `INSERT INTO careos_patient_passports
        (patient_id, careos_patient_id, organization_id, medications, summary_text, last_synced_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,NOW()) RETURNING *`,
      [
        patientId,
        makePatientCareId(patientId),
        organizationId,
        JSON.stringify(meds),
        workspace?.activeAdmission?.diagnosis || workspace?.admission?.diagnosis || null,
      ]
    );
    rows = ins.rows;
  }

  return rows[0];
}

export async function updatePassport(patientId, updates) {
  await ensure();
  const passport = await getOrSyncPassport(patientId, updates.organizationId);
  const fields = ['allergies', 'diagnoses', 'medications', 'surgeries', 'vaccinations', 'imaging_summaries', 'lab_summaries', 'emergency_contacts', 'summary_text'];
  const sets = [];
  const params = [passport.id];
  for (const f of fields) {
    if (updates[f] !== undefined) {
      params.push(typeof updates[f] === 'string' ? updates[f] : JSON.stringify(updates[f]));
      sets.push(`${f} = $${params.length}${f === 'summary_text' ? '' : '::jsonb'}`);
    }
  }
  if (!sets.length) return passport;
  sets.push('updated_at = NOW()', 'last_synced_at = NOW()');
  const { rows } = await pool.query(
    `UPDATE careos_patient_passports SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0];
}

export async function sharePassport({ passportId, sharedWithOrgId, sharedWithUserId, purpose, scopes, grantedBy, expiresInHours = 72 }) {
  await ensure();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 3600000);
  const { rows } = await pool.query(
    `INSERT INTO careos_passport_shares
      (passport_id, shared_with_org_id, shared_with_user_id, purpose, share_token, scopes, granted_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [passportId, sharedWithOrgId || null, sharedWithUserId || null, purpose, token, scopes || ['summary'], grantedBy, expiresAt]
  );
  return { share: rows[0], shareToken: token, expiresAt };
}

export async function getPassportByShareToken(token) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT p.*, s.purpose, s.scopes, s.expires_at
     FROM careos_passport_shares s
     JOIN careos_patient_passports p ON p.id = s.passport_id
     WHERE s.share_token = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [token]
  );
  return rows[0] || null;
}

export default { getOrSyncPassport, updatePassport, sharePassport, getPassportByShareToken };
