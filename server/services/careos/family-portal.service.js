/**
 * CareOS — Family collaboration portal (clinician-approved updates only)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function listFamilyUpdates(patientId, { familyVisibleOnly = true } = {}) {
  await ensure();
  let sql = `SELECT * FROM careos_family_updates WHERE patient_id = $1`;
  if (familyVisibleOnly) sql += ` AND visible_to_family = true AND published_at IS NOT NULL`;
  sql += ` ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 50`;
  const { rows } = await pool.query(sql, [patientId]);
  return rows;
}

export async function publishFamilyUpdate({
  organizationId,
  patientId,
  title,
  body,
  stage,
  approvedBy,
  visibleToFamily = true,
}) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_family_updates (organization_id, patient_id, title, body, stage, approved_by, visible_to_family, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
    [organizationId, patientId, title, body, stage || null, approvedBy, visibleToFamily]
  );
  if (visibleToFamily) {
    await appendClinicalEvent({
      organizationId,
      patientId,
      eventType: 'family_update',
      title,
      body,
      actorType: 'clinician',
      actorId: approvedBy,
      severity: 'info',
    });
  }
  return rows[0];
}

export async function verifyFamilyAccess(patientId, accessCode) {
  await ensure();
  const pid = Number(patientId);
  if (!pid || !accessCode?.trim()) {
    return { valid: false, reason: 'Patient ID and access code required' };
  }

  const { rows: patients } = await pool.query(
    `SELECT id, phone, mobile FROM patients WHERE id = $1 LIMIT 1`,
    [pid]
  );
  const patient = patients[0];
  if (!patient) {
    return { valid: false, reason: 'Patient not found' };
  }

  const code = accessCode.trim();
  const phone = String(patient.phone || patient.mobile || '').replace(/\D/g, '');
  const last4 = phone.slice(-4);
  const idSuffix = String(pid).slice(-4).padStart(4, '0');

  const valid = code === last4 || code === idSuffix || code === String(pid);
  return {
    valid,
    patientId: pid,
    reason: valid ? undefined : 'Invalid access code — use the code shared by your care team',
  };
}

export default { listFamilyUpdates, publishFamilyUpdate, verifyFamilyAccess };
