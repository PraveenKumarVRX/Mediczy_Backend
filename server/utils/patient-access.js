import pool from '../db/pgPool.js';

const GLOBAL_PATIENT_ACCESS_ROLES = new Set([
  'admin',
  'super_admin',
  'medical_director',
]);

const CLINICIAN_ROLES = new Set([
  'doctor',
  'hospital_doctor',
  'nurse',
  'assistant',
  'doctor_assistant',
]);

function getUserRole(req) {
  return String(req.user?.role || req.userRole || '').trim().toLowerCase();
}

function getActorId(req) {
  const raw = req.user?.id || req.user?.userId || req.user?.doctorId || req.doctor?.id;
  const parsed = parseInt(String(raw || ''), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function hasGlobalPatientAccess(req) {
  return GLOBAL_PATIENT_ACCESS_ROLES.has(getUserRole(req));
}

export async function getPatientOwner(patientId) {
  const parsedPatientId = parseInt(String(patientId || ''), 10);
  if (Number.isNaN(parsedPatientId)) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT id, "userId"
       FROM patients
      WHERE id = $1
      LIMIT 1`,
    [parsedPatientId]
  );

  return rows[0] || null;
}

export async function canAccessPatientRecord(req, patientId) {
  const patient = await getPatientOwner(patientId);
  if (!patient) {
    return { allowed: false, status: 404, reason: 'Patient not found' };
  }

  if (hasGlobalPatientAccess(req)) {
    return { allowed: true, patient, reason: 'global-role' };
  }

  const actorId = getActorId(req);
  if (!actorId) {
    return { allowed: false, status: 401, reason: 'Authenticated user id missing' };
  }

  if (Number(patient.userId) === Number(actorId)) {
    return { allowed: true, patient, reason: 'patient-self' };
  }

  const role = getUserRole(req);
  if (!CLINICIAN_ROLES.has(role)) {
    return { allowed: false, status: 403, reason: 'No patient access role' };
  }

  const { rows } = await pool.query(
    `SELECT 1
       FROM appointments
      WHERE "doctorId" = $1
        AND "userId" = $2
      LIMIT 1`,
    [actorId, patient.userId]
  );

  if (rows.length > 0) {
    return { allowed: true, patient, reason: 'treating-relationship' };
  }

  return { allowed: false, status: 403, reason: 'No treating relationship with this patient' };
}

export async function requirePatientRecordAccess(req, res, patientId) {
  const access = await canAccessPatientRecord(req, patientId);
  if (!access.allowed) {
    res.status(access.status || 403).json({ error: access.reason || 'Not authorized to access this patient record' });
    return null;
  }
  return access;
}
