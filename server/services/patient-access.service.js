/**
 * Who may read or write a patient's clinical safety data (allergies, problem list, reconciliation).
 *
 * The allergy table's row-level-security policy admits "own user OR same organization", and the service runs in the
 * patient's context, so RLS alone does not answer "may THIS caller touch THIS patient". That decision is made here, with
 * an explicit predicate, and the existence checks run under the platform context because they only ask a yes/no question.
 *
 *   patient        themself
 *   platform admin any patient
 *   doctor         has an appointment or a prescription with the patient
 *   org staff      the patient belongs to the organization: user record, admission or appointment there
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { resolveActor } from './appointment-identity.service.js';
import { orgOfRequest } from './prescription-safety.service.js';

const isPlatformAdmin = (req) => ['super_admin', 'superadmin', 'platform_admin'].includes(req.user?.role);

export async function canAccessPatient(req, patientId) {
  const pid = Number(patientId);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (isPlatformAdmin(req)) return true;
  if (!req.doctor && Number(req.user?.id) === pid && !req.user?.organization_id) return true;

  const org = orgOfRequest(req);
  const isDoctor = Boolean(req.doctor) || req.userRole === 'doctor' || req.user?.role === 'doctor';
  let candidates = [];
  if (isDoctor) { try { candidates = (await resolveActor(req)).candidateIds.map(Number).filter(Number.isFinite); } catch { candidates = []; } }
  if (!org && !candidates.length) return false;

  return sequelize.transaction(async (transaction) => {
    await setRlsContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
    const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction })).length > 0;
    if (candidates.length) {
      if (await one(`SELECT 1 FROM appointments WHERE "userId" = :pid AND "doctorId" IN (:cands) LIMIT 1`, { pid, cands: candidates })) return true;
      if (await one(`SELECT 1 FROM prescriptions WHERE "patientId" = :pid AND "doctorId" IN (:cands) LIMIT 1`, { pid, cands: candidates })) return true;
    }
    if (org) {
      if (await one(`SELECT 1 FROM users WHERE id = :pid AND organization_id = :org LIMIT 1`, { pid, org })) return true;
      if (await one(`SELECT 1 FROM ip_admissions WHERE patient_id = :pid AND organization_id = :org LIMIT 1`, { pid, org })) return true;
      if (await one(`SELECT 1 FROM appointments WHERE "userId" = :pid AND organization_id = :org LIMIT 1`, { pid, org })) return true;
    }
    return false;
  });
}

/** Express guard: 403 unless the caller may access req.params.patientId (or body.patientId). */
export const requirePatientAccess = (getId = (req) => req.params.patientId ?? req.body?.patientId) => async (req, res, next) => {
  try {
    if (await canAccessPatient(req, getId(req))) return next();
    return res.status(403).json({ success: false, message: 'You do not have access to this patient' });
  } catch (e) {
    console.error('[patient-access] check failed:', e.message);
    return res.status(503).json({ success: false, message: 'Access check unavailable' });
  }
};
