import pool from '../db/pgPool.js';

let schemaReady = false;
const REQUIRED = ['hr_staff_qualifications', 'hr_staff_privileges'];

const fail = (message, code, status) => Object.assign(new Error(message), { code, status });
const dateOnly = (value) => value == null || value === '' ? null : String(value).slice(0, 10);
const text = (value, max = 160) => String(value || '').trim().slice(0, max);

export async function ensureHrmsQualificationSchemaReady() {
  if (schemaReady) return true;
  try {
    const { rows } = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
    `, [REQUIRED]);
    const present = new Set(rows.map((row) => row.table_name));
    const missing = REQUIRED.filter((name) => !present.has(name));
    if (missing.length) throw fail(`HRMS qualification schema is not migrated: ${missing.join(', ')}`, 'SCHEMA_NOT_MIGRATED', 503);
    schemaReady = true;
    return true;
  } catch (error) {
    if (error.code === 'SCHEMA_NOT_MIGRATED') throw error;
    throw fail('HRMS qualification schema is not migrated', 'SCHEMA_NOT_MIGRATED', 503);
  }
}

function qualificationInput(input = {}) {
  const qualificationCode = text(input.qualificationCode, 80);
  const qualificationName = text(input.qualificationName, 180);
  if (!qualificationCode || !qualificationName || !input.staffUserId) {
    throw fail('staffUserId, qualificationCode and qualificationName are required', 'VALIDATION_FAILED', 400);
  }
  const expiresAt = dateOnly(input.expiresAt);
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) throw fail('expiresAt must use YYYY-MM-DD', 'VALIDATION_FAILED', 400);
  return {
    staffUserId: Number(input.staffUserId), qualificationCode, qualificationName,
    registrationNumber: text(input.registrationNumber, 120) || null,
    issuedAt: dateOnly(input.issuedAt), expiresAt,
    status: ['active', 'expired', 'suspended', 'revoked'].includes(input.status) ? input.status : 'active',
    verificationStatus: ['pending', 'verified', 'rejected'].includes(input.verificationStatus) ? input.verificationStatus : 'pending',
    metadata: JSON.stringify(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
  };
}

export async function listStaffQualifications(tenantId, { staffUserId = null, expiringWithinDays = null } = {}) {
  await ensureHrmsQualificationSchemaReady();
  const days = expiringWithinDays == null ? null : Math.max(0, Math.min(3650, Number(expiringWithinDays)));
  const { rows } = await pool.query(`
    SELECT q.*, u."firstName", u."lastName", u.email
    FROM hr_staff_qualifications q LEFT JOIN users u ON u.id = q.staff_user_id
    WHERE q.tenant_id = $1
      AND ($2::bigint IS NULL OR q.staff_user_id = $2)
      AND ($3::int IS NULL OR q.status = 'active' AND q.expires_at IS NOT NULL
           AND q.expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + ($3::int * INTERVAL '1 day'))
    ORDER BY q.expires_at NULLS LAST, q.created_at DESC
  `, [tenantId, staffUserId ? Number(staffUserId) : null, days]);
  return rows;
}

export async function createStaffQualification(tenantId, input, actorId = null) {
  await ensureHrmsQualificationSchemaReady();
  const data = qualificationInput(input);
  const { rows } = await pool.query(`
    INSERT INTO hr_staff_qualifications
      (tenant_id, staff_user_id, qualification_code, qualification_name, registration_number,
       issued_at, expires_at, status, verification_status, verified_by, verified_at, metadata, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
      CASE WHEN $9 = 'verified' THEN $10 ELSE NULL END,
      CASE WHEN $9 = 'verified' THEN NOW() ELSE NULL END,
      $11::jsonb,$10)
    RETURNING *
  `, [tenantId, data.staffUserId, data.qualificationCode, data.qualificationName, data.registrationNumber,
    data.issuedAt, data.expiresAt, data.status, data.verificationStatus, actorId, data.metadata]);
  return rows[0];
}

export async function updateStaffQualification(tenantId, id, input, actorId = null) {
  await ensureHrmsQualificationSchemaReady();
  const status = input.status && ['active', 'expired', 'suspended', 'revoked'].includes(input.status) ? input.status : null;
  const verificationStatus = input.verificationStatus && ['pending', 'verified', 'rejected'].includes(input.verificationStatus) ? input.verificationStatus : null;
  const expiresAt = input.expiresAt === undefined ? null : dateOnly(input.expiresAt);
  const { rows } = await pool.query(`
    UPDATE hr_staff_qualifications
    SET status = COALESCE($3, status), verification_status = COALESCE($4, verification_status),
        expires_at = CASE WHEN $5::text IS NULL THEN expires_at ELSE $5::date END,
        verified_by = CASE WHEN $4 = 'verified' THEN $6 ELSE verified_by END,
        verified_at = CASE WHEN $4 = 'verified' THEN NOW() ELSE verified_at END,
        updated_at = NOW()
    WHERE tenant_id = $1 AND id = $2
    RETURNING *
  `, [tenantId, id, status, verificationStatus, expiresAt, actorId]);
  if (!rows[0]) throw fail('Qualification not found', 'NOT_FOUND', 404);
  return rows[0];
}

export async function listStaffPrivileges(tenantId, { staffUserId = null, privilegeCode = null } = {}) {
  await ensureHrmsQualificationSchemaReady();
  const { rows } = await pool.query(`
    SELECT p.*, q.qualification_code AS "qualificationCode", q.qualification_name AS "qualificationName",
           u."firstName", u."lastName", u.email
    FROM hr_staff_privileges p
    LEFT JOIN hr_staff_qualifications q ON q.id = p.qualification_id
    LEFT JOIN users u ON u.id = p.staff_user_id
    WHERE p.tenant_id = $1 AND ($2::bigint IS NULL OR p.staff_user_id = $2)
      AND ($3::text IS NULL OR p.privilege_code = $3)
    ORDER BY p.created_at DESC
  `, [tenantId, staffUserId ? Number(staffUserId) : null, privilegeCode ? text(privilegeCode, 120) : null]);
  return rows;
}

export async function grantStaffPrivilege(tenantId, input, actorId = null) {
  await ensureHrmsQualificationSchemaReady();
  const staffUserId = Number(input.staffUserId);
  const privilegeCode = text(input.privilegeCode, 120);
  if (!staffUserId || !privilegeCode) throw fail('staffUserId and privilegeCode are required', 'VALIDATION_FAILED', 400);
  const validFrom = dateOnly(input.validFrom) || new Date().toISOString().slice(0, 10);
  const validUntil = dateOnly(input.validUntil);
  const { rows } = await pool.query(`
    INSERT INTO hr_staff_privileges
      (tenant_id, staff_user_id, privilege_code, department, qualification_id, valid_from, valid_until, granted_by, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING *
  `, [tenantId, staffUserId, privilegeCode, text(input.department, 120) || null, input.qualificationId || null,
    validFrom, validUntil, actorId, JSON.stringify(input.metadata && typeof input.metadata === 'object' ? input.metadata : {})]);
  return rows[0];
}

export async function revokeStaffPrivilege(tenantId, id, actorId = null) {
  await ensureHrmsQualificationSchemaReady();
  const { rows } = await pool.query(`
    UPDATE hr_staff_privileges
    SET status = 'revoked', revoked_by = $3, revoked_at = NOW(), updated_at = NOW()
    WHERE tenant_id = $1 AND id = $2 AND status <> 'revoked'
    RETURNING *
  `, [tenantId, id, actorId]);
  if (!rows[0]) throw fail('Active privilege not found', 'NOT_FOUND', 404);
  return rows[0];
}

/** Authoritative check: expired/revoked/suspended qualifications never satisfy a privilege. */
export async function checkStaffPrivilege(tenantId, staffUserId, privilegeCode, onDate = new Date().toISOString().slice(0, 10)) {
  await ensureHrmsQualificationSchemaReady();
  const { rows } = await pool.query(`
    SELECT p.id, p.privilege_code AS "privilegeCode", p.department, p.valid_from AS "validFrom", p.valid_until AS "validUntil",
           q.id AS "qualificationId", q.qualification_code AS "qualificationCode", q.expires_at AS "qualificationExpiresAt"
    FROM hr_staff_privileges p
    LEFT JOIN hr_staff_qualifications q ON q.id = p.qualification_id
    WHERE p.tenant_id = $1 AND p.staff_user_id = $2 AND p.privilege_code = $3
      AND p.status = 'active' AND p.valid_from <= $4::date AND (p.valid_until IS NULL OR p.valid_until >= $4::date)
      AND (p.qualification_id IS NULL OR (q.status = 'active' AND q.verification_status = 'verified'
        AND (q.expires_at IS NULL OR q.expires_at >= $4::date)))
    ORDER BY p.valid_until NULLS LAST, p.id DESC LIMIT 1
  `, [tenantId, Number(staffUserId), text(privilegeCode, 120), onDate]);
  return { allowed: Boolean(rows[0]), privilege: rows[0] || null, reason: rows[0] ? null : 'missing_or_expired_qualification' };
}

export function resetHrmsQualificationReadinessForTests() { schemaReady = false; }

