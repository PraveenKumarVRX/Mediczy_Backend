/**
 * The OHC workspace: what an `ohc_doctor` / `ohc_staff` (a hospital- or clinic-portal user assigned to an OHC unit),
 * or the corporate CMO (corporate-side super-admin of the OHC services serving their company), can do.
 *
 * The unit and the corporate are NEVER taken from a request. Every call re-reads, from the database, that the user is active and the
 * OHC contract is active. Hospital/clinic staff must still have an active assignment owned by their operator; a corporate CMO is scoped
 * to OHC units serving the CMO's corporate. The OHC remains owned by the hospital/clinic tenant (`owner_uid`); CMO access never changes
 * that ownership or grants tenant-level unit/contract administration. Suspending the user, unassigning staff or ending a contract stops the next request.
 */
import bcrypt from 'bcrypt';
import { CollectionError, notFound, forbidden, invalid } from '../collection/errors.js';
import * as v from '../collection/validation.js';
import { passwordProblem } from '../collection/phlebotomist.service.js';

export const OHC_PORTAL = 'ohc';
export const OHC_AUDIENCE = 'mediczy-ohc';
const FITNESS = ['fit', 'fit_with_restrictions', 'temporarily_unfit', 'unfit'];
const OHC_ROLES = ['ohc_doctor', 'ohc_staff', 'corporate_cmo'];
const EMERGENCY_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const EMERGENCY_STATUSES = ['open', 'triaged', 'resolved', 'transferred', 'closed'];
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function createOhcService({ pool, tokens, now = () => new Date() }) {
  async function tx(fn) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; }
    catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; }
    finally { c.release(); }
  }

  /** The user, their active OHC assignments, and why not when they have none. */
  async function loadPrincipal(userUid) {
    const { rows: us } = await pool.query(
      `SELECT id, unique_id, "firstName", "lastName", email, role, status::text AS status, organization_uid, metadata FROM users WHERE unique_id = $1`, [userUid]);
    const u = us[0];
    if (!u) return { reason: 'unknown_user' };
    if (u.status !== 'active') return { reason: `user_${u.status}` };
    if (!OHC_ROLES.includes(u.role)) return { reason: 'not_an_ohc_role' };
    const isCmo = u.role === 'corporate_cmo';
    // Each branch's param list must hold exactly the placeholders its own SQL text references —
    // passing an extra bound value Postgres can't see used anywhere leaves it untyped ("could not
    // determine data type of parameter $1").
    const unitParams = isCmo ? [u.organization_uid] : [u.id, u.organization_uid, u.role];
    const unitScope = isCmo
      ? `FROM hospital_branch b`
      : `FROM staff_branch_assignment s
         JOIN hospital_branch b ON b.id = s.branch_id`;
    const unitWhere = isCmo
      ? `WHERE b.corporate_uid = $1`
      : `WHERE s.user_id = $1 AND s.is_active AND s.role = $3 AND b.owner_uid = $2`;
    const { rows: units } = await pool.query(
      `SELECT b.id, b.unique_id, b.name, b.corporate_uid, b.owner_uid, b.services, c."companyName" AS corporate_name,
              o.id AS operator_id, o.name AS operator_name, o.address AS operator_address, o.phone AS operator_phone
         ${unitScope}
         LEFT JOIN corporates c ON c.unique_id = b.corporate_uid
         LEFT JOIN tenants o ON o.unique_id = b.owner_uid
        ${unitWhere}
          AND b.unit_type = 'ohc' AND b.is_active AND b.contract_status = 'active'
          AND (b.contract_end IS NULL OR b.contract_end >= CURRENT_DATE)`, unitParams);
    if (!units.length) return { reason: 'no_active_ohc_assignment' };
    return {
      principal: {
        type: 'ohc_staff', id: u.id, uid: u.unique_id, ref: `ohc:${u.unique_id}`, role: u.role,
        displayName: `${u.firstName || ''} ${u.lastName || ''}`.trim(), registrationNumber: u.metadata?.registrationNumber || null,
        mustChangePassword: u.metadata?.mustChangePassword === true,
        units: units.map((b) => ({
          id: b.id, uid: b.unique_id, name: b.name, corporateUid: b.corporate_uid, corporateName: b.corporate_name,
          operatorUid: b.owner_uid, operatorId: b.operator_id, operatorName: b.operator_name,
          operatorAddress: b.operator_address || null, operatorPhone: b.operator_phone || null, services: b.services || [],
        })),
      },
    };
  }

  const tokenPayload = (p) => ({ id: p.uid, role: p.role, userType: 'ohc', aud: OHC_AUDIENCE, name: p.displayName });

  async function login({ email, password, deviceId }) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || typeof password !== 'string' || !password) throw invalid('Email and password are required');
    const bad = () => new CollectionError('invalid_credentials', 401, 'Invalid email or password');
    const { rows } = await pool.query(`SELECT unique_id, password, role FROM users WHERE lower(email) = $1 AND role IN ('ohc_doctor', 'ohc_staff') LIMIT 1`, [e]);
    const row = rows[0];
    const ok = await bcrypt.compare(password, row?.password || DUMMY_HASH);
    if (!row || !ok) throw bad();
    const { principal, reason } = await loadPrincipal(row.unique_id);
    if (!principal) throw new CollectionError('account_unavailable', 403, 'This account cannot sign in. Contact your administrator.', { reason });
    await pool.query(`UPDATE users SET "lastLoginAt" = now(), "loginCount" = COALESCE("loginCount", 0) + 1 WHERE unique_id = $1`, [row.unique_id]);
    const pair = await tokens.issuePortalTokenPair(tokenPayload(principal), { portal: OHC_PORTAL, deviceFp: deviceId || null, accessTtl: '30m', refreshTtl: '7d' });
    return { ...pair, mustChangePassword: principal.mustChangePassword, worker: { uid: principal.uid, displayName: principal.displayName, role: principal.role }, units: principal.units };
  }

  async function refresh({ refreshToken, deviceId }) {
    const rotated = await tokens.rotatePortalRefreshToken(refreshToken, {
      portal: OHC_PORTAL, deviceFp: deviceId || null, accessTtl: '30m',
      resolvePayload: async (decoded) => { const { principal } = await loadPrincipal(decoded.userId); return principal ? tokenPayload(principal) : null; },
    });
    if (!rotated) throw new CollectionError('invalid_refresh_token', 401, 'Session expired. Sign in again.');
    return rotated;
  }
  async function logout({ refreshToken }) {
    const jti = tokens.decodeRefreshJti ? tokens.decodeRefreshJti(refreshToken) : null;
    if (jti) await tokens.revokeToken(jti);
    return { ok: true };
  }

  /** Change the password (required on first sign-in). Revokes every session of this worker; they sign in again with the new one. */
  async function changePassword(principal, input) {
    const b = v.exactly(v.body(input), 'body', ['currentPassword', 'newPassword']);
    const { rows } = await pool.query('SELECT password, email FROM users WHERE unique_id = $1', [principal.uid]);
    if (!rows[0] || !(await bcrypt.compare(String(b.currentPassword || ''), rows[0].password))) throw new CollectionError('invalid_credentials', 401, 'Current password is incorrect');
    const problem = passwordProblem(b.newPassword, rows[0].email);
    if (problem) throw invalid(problem, { field: 'newPassword' });
    if (await bcrypt.compare(b.newPassword, rows[0].password)) throw invalid('Choose a password you have not used', { field: 'newPassword' });
    await pool.query(`UPDATE users SET password = $2, metadata = COALESCE(metadata, '{}'::jsonb) - 'mustChangePassword' WHERE unique_id = $1`, [principal.uid, await bcrypt.hash(b.newPassword, 12)]);
    await tokens.revokeAllForUser(principal.uid, OHC_PORTAL);
    return { ok: true };
  }

  const me = (principal) => ({
    worker: { uid: principal.uid, displayName: principal.displayName, role: principal.role, mustChangePassword: principal.mustChangePassword, registrationNumberOnFile: Boolean(principal.registrationNumber), canSign: ['ohc_doctor', 'corporate_cmo'].includes(principal.role) && Boolean(principal.registrationNumber), isSuperAdmin: principal.role === 'corporate_cmo', canManage: principal.role === 'corporate_cmo' },
    units: principal.units, serverTime: now().toISOString(),
  });

  /** Resolve which of the caller's units a request means. One unit → implicit; several → must be named, and must be one of theirs. */
  function unitOf(principal, unitUid) {
    if (unitUid) {
      const u = principal.units.find((x) => x.uid === String(unitUid));
      if (!u) throw notFound('OHC');
      return u;
    }
    if (principal.units.length === 1) return principal.units[0];
    throw invalid('You work at more than one OHC: say which one (unit)', { field: 'unit', units: principal.units.map((x) => x.uid) });
  }

  async function employees(principal, { unit, search = '', limit = 30 } = {}) {
    const u = unitOf(principal, unit);
    const lim = v.int(limit, 'limit', { min: 1, max: 100 });
    const term = `%${String(search).trim().toLowerCase().replace(/[%_]/g, '')}%`;
    const { rows } = await pool.query(
      `SELECT us.id, us.unique_id, us."firstName", us."lastName", e."employeeId", e.department, e.designation, us."dateOfBirth"
         FROM corporate_employees e JOIN users us ON us.id = e."userId"
        WHERE e.corporate_uid = $1 AND e."isActive" AND (lower(us."firstName" || ' ' || us."lastName") LIKE $2 OR lower(e."employeeId") LIKE $2)
        ORDER BY us."firstName", us."lastName" LIMIT ${lim}`, [u.corporateUid, term]);
    return {
      unit: { uid: u.uid, corporateName: u.corporateName },
      employees: rows.map((r) => ({ id: r.id, uid: r.unique_id, name: `${r.firstName || ''} ${r.lastName || ''}`.trim(), employeeId: r.employeeId, department: r.department, designation: r.designation })),
    };
  }

  const CERT_KEYS = ['unit', 'employeeUserId', 'jobDescription', 'examinationDate', 'examinationPlace', 'fitnessStatus', 'restrictions', 'validFrom', 'validUntil', 'remarks', 'certificateType'];
  /** Issue a fitness certificate. Only an OHC doctor or corporate CMO with a registration number on file; the employee must belong to the unit's corporate. */
  function issueCertificate(principal, input) {
    const b = v.exactly(v.body(input), 'body', CERT_KEYS);
    if (!['ohc_doctor', 'corporate_cmo'].includes(principal.role)) throw forbidden('Only an OHC doctor or corporate CMO can sign a fitness certificate');
    if (!principal.registrationNumber) throw new CollectionError('registration_missing', 422, 'Your medical registration number is not on file. Ask your administrator to add it.');
    const u = unitOf(principal, b.unit);
    const status = v.oneOf(b.fitnessStatus, 'fitnessStatus', FITNESS);
    const empUserId = v.int(b.employeeUserId, 'employeeUserId', { min: 1 });
    return tx(async (c) => {
      const { rows } = await c.query(
        `SELECT us.id, us."firstName", us."lastName", e."employeeId", co.id AS corporate_id, co."companyName"
           FROM corporate_employees e JOIN users us ON us.id = e."userId" JOIN corporates co ON co.unique_id = e.corporate_uid
          WHERE us.id = $1 AND e.corporate_uid = $2 AND e."isActive"`, [empUserId, u.corporateUid]);
      const emp = rows[0];
      if (!emp) throw notFound('Employee');   // an employee of another company looks absent
      const validFrom = b.validFrom ? v.date(b.validFrom, 'validFrom').toISOString().slice(0, 10) : null;
      const validUntil = b.validUntil ? v.date(b.validUntil, 'validUntil').toISOString().slice(0, 10) : null;
      if (validFrom && validUntil && validUntil < validFrom) throw invalid('validUntil must not be before validFrom', { field: 'validUntil' });
      const ins = await c.query(
        `INSERT INTO fitness_certificates
           (organization_id, patient_id, certificate_type, issued_by, doctor_reg_no, patient_name, employee_id, employer_name, job_description, examination_date,
            fitness_status, restrictions, valid_from, valid_until, remarks, certificate_data, signed_at, issued_by_unit_uid, issued_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE), $11, $12, $13, $14, $15, $16::jsonb, now(), $17, $18) RETURNING *`,
        [emp.corporate_id, emp.id, b.certificateType ? v.str(b.certificateType, 'certificateType', { max: 60 }) : 'ohc_fitness', principal.displayName, principal.registrationNumber,
          `${emp.firstName || ''} ${emp.lastName || ''}`.trim(), emp.employeeId, emp.companyName, v.str(b.jobDescription, 'jobDescription', { max: 300, optional: true }),
          b.examinationDate ? v.date(b.examinationDate, 'examinationDate').toISOString().slice(0, 10) : null, status,
          v.str(b.restrictions, 'restrictions', { max: 500, optional: true }), validFrom, validUntil, v.str(b.remarks, 'remarks', { max: 1000, optional: true }),
          JSON.stringify({ source: 'ohc', unitUid: u.uid, issuedByUserUid: principal.uid, examinationPlace: v.str(b.examinationPlace, 'examinationPlace', { max: 200, optional: true }) || undefined }), u.uid, principal.id]);
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action, subject) VALUES ($1, $2, $3, 'certificate.issue', $4)`, [u.uid, principal.role === 'corporate_cmo' ? 'corporate_cmo' : 'ohc_staff', principal.ref, String(ins.rows[0].id)]);
      return { status: 201, body: { certificate: ins.rows[0] } };
    });
  }

  async function certificates(principal, { unit, limit = 50 } = {}) {
    const u = unitOf(principal, unit);
    const lim = v.int(limit, 'limit', { min: 1, max: 200 });
    const { rows } = await pool.query(`SELECT * FROM fitness_certificates WHERE issued_by_unit_uid = $1 ORDER BY created_at DESC LIMIT ${lim}`, [u.uid]);
    return { unit: { uid: u.uid }, certificates: rows };
  }

  async function staff(principal, { unit } = {}) {
    const u = unitOf(principal, unit);
    const { rows } = await pool.query(
      `SELECT us.unique_id AS uid, us."firstName", us."lastName", us.email, s.role, s.is_active, us.status::text AS user_status
         FROM staff_branch_assignment s JOIN users us ON us.id = s.user_id
        WHERE s.branch_id = (SELECT id FROM hospital_branch WHERE unique_id = $1) ORDER BY s.role, us."firstName"`, [u.uid]);
    return { unit: { uid: u.uid }, staff: rows.map((r) => ({ uid: r.uid, name: `${r.firstName || ''} ${r.lastName || ''}`.trim(), email: r.email, role: r.role, active: r.is_active && r.user_status === 'active' })) };
  }

  async function emergencies(principal, { unit, status, limit = 50 } = {}) {
    const u = unitOf(principal, unit);
    const lim = v.int(limit, 'limit', { min: 1, max: 200 });
    const params = [u.uid];
    const where = ['e.unit_uid = $1'];
    if (status) { where.push(`e.status = $${params.length + 1}`); params.push(v.oneOf(status, 'status', EMERGENCY_STATUSES)); }
    params.push(lim);
    const { rows } = await pool.query(
      `SELECT e.*, COALESCE(u."firstName" || ' ' || u."lastName", '') AS employee_name, u.unique_id AS employee_uid
         FROM ohc_workplace_emergencies e LEFT JOIN users u ON u.id = e.employee_user_id
        WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC, e.id DESC LIMIT $${params.length}`, params);
    return { unit: { uid: u.uid }, emergencies: rows };
  }

  function createEmergency(principal, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'employeeUserId', 'incidentType', 'severity', 'description', 'location', 'occurredAt']);
    const u = unitOf(principal, b.unit);
    const severity = v.oneOf(b.severity || 'medium', 'severity', EMERGENCY_SEVERITIES);
    const incidentType = v.str(b.incidentType || 'medical_emergency', 'incidentType', { max: 80 });
    const description = v.str(b.description, 'description', { min: 2, max: 2000 });
    const location = v.str(b.location, 'location', { max: 200, optional: true });
    const occurredAt = b.occurredAt ? v.date(b.occurredAt, 'occurredAt').toISOString() : null;
    const employeeUserId = b.employeeUserId == null ? null : v.int(b.employeeUserId, 'employeeUserId', { min: 1 });
    return tx(async (c) => {
      if (employeeUserId) {
        const employee = await c.query(`SELECT 1 FROM corporate_employees WHERE "userId" = $1 AND corporate_uid = $2 AND "isActive"`, [employeeUserId, u.corporateUid]);
        if (!employee.rowCount) throw notFound('Employee');
      }
      const { rows } = await c.query(
        `INSERT INTO ohc_workplace_emergencies (unit_uid, corporate_uid, employee_user_id, incident_type, severity, description, location, occurred_at, reported_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, now()),$9) RETURNING *`,
        [u.uid, u.corporateUid, employeeUserId, incidentType, severity, description, location, occurredAt, principal.id]);
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action, subject) VALUES ($1, $2, $3, 'emergency.create', $4)`, [u.uid, principal.role === 'corporate_cmo' ? 'corporate_cmo' : 'ohc_staff', principal.ref, String(rows[0].id)]);
      return { status: 201, body: { emergency: rows[0] } };
    });
  }

  function updateEmergency(principal, id, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'status', 'triageNotes', 'resolution']);
    const u = unitOf(principal, b.unit);
    const status = b.status === undefined ? null : v.oneOf(b.status, 'status', EMERGENCY_STATUSES);
    const triageNotes = b.triageNotes === undefined ? null : v.str(b.triageNotes, 'triageNotes', { max: 2000, optional: true });
    const resolution = b.resolution === undefined ? null : v.str(b.resolution, 'resolution', { max: 2000, optional: true });
    return tx(async (c) => {
      const { rows } = await c.query(
        `UPDATE ohc_workplace_emergencies SET status = COALESCE($1, status), triage_notes = COALESCE($2, triage_notes), resolution = COALESCE($3, resolution), resolved_at = CASE WHEN $1 IN ('resolved','closed') THEN now() ELSE resolved_at END, updated_at = now()
          WHERE id = $4 AND unit_uid = $5 RETURNING *`, [status, triageNotes, resolution, v.int(id, 'id', { min: 1 }), u.uid]);
      if (!rows.length) throw notFound('Emergency');
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action, subject) VALUES ($1, $2, $3, 'emergency.update', $4)`, [u.uid, principal.role === 'corporate_cmo' ? 'corporate_cmo' : 'ohc_staff', principal.ref, String(rows[0].id)]);
      return rows[0];
    });
  }

  async function certificateById(principal, id) {
    const n = v.int(id, 'id', { min: 1 });
    const { rows } = await pool.query(`SELECT * FROM fitness_certificates WHERE id = $1 AND issued_by_unit_uid = ANY($2::text[])`, [n, principal.units.map((x) => x.uid)]);
    if (!rows[0]) throw notFound('Certificate');
    return rows[0];
  }

  function formatClinicAddress(address) {
    if (!address || typeof address !== 'object') return '';
    return [address.street, address.city, address.state, address.pincode].filter(Boolean).join(', ');
  }

  /** Everything the certificate PDF needs about the issuing clinic and doctor, besides what's already
   * stored flat on the `fitness_certificates` row. `unit` is the OHC unit (from `principal.units`) the
   * certificate was issued through — its operator tenant supplies the clinic's logo/address/phone. Its
   * city is only a fallback "place of issue" for certificates with no manual examinationPlace on file
   * (fitness-certificate-pdf.service.js prefers the manual value); the actual exam can happen anywhere
   * (e.g. a camp on the corporate's own premises), so the clinic's registered city is not assumed to be
   * where the doctor actually examined the employee. The signing doctor's qualifications/title come
   * from a real `doctors` profile when their OHC login is linked to one (`linked_user_uid`); most
   * ohc_doctor/corporate_cmo accounts have no such link, so those fields are simply blank for them —
   * the template already renders fine without them. */
  async function certificateLetterhead(principal, unit) {
    const { rows } = await pool.query(`SELECT id, qualification, specialization, metadata FROM doctors WHERE linked_user_uid = $1 LIMIT 1`, [principal.uid]);
    const d = rows[0];
    const clinicName = unit.operatorName || unit.name;
    return {
      // The signature file convention (doctor-signature.service.js) keys off the REAL doctors.id, not
      // this OHC login's own users.id — they're different rows even when linked_user_uid connects them.
      doctorId: d?.id || undefined,
      clinicName,
      tenantId: unit.operatorId || undefined,
      clinicAddress: formatClinicAddress(unit.operatorAddress) || undefined,
      clinicPhone: unit.operatorPhone || undefined,
      issuePlace: unit.operatorAddress?.city || clinicName,
      doctorQualifications: d?.qualification || undefined,
      doctorSpecialty: d?.metadata?.title || d?.specialization || undefined,
    };
  }

  /** The real CMO/ohc_doctor mapped to this corporate's active OHC contract, for callers outside the
   * OHC workspace itself (the Team camp-issuance flow) that need to credit the actual clinician rather
   * than whoever is operating the tool. `corporateId` is the NUMERIC `corporates.id` such callers hold;
   * returns null when the corporate has no active OHC unit or no staff assigned to it yet — callers
   * must not silently substitute the operator's own identity in that case. */
  async function resolveCmoForCorporate(corporateId) {
    const { rows: units } = await pool.query(
      `SELECT b.unique_id, b.name, o.id AS operator_id, o.name AS operator_name, o.address AS operator_address, o.phone AS operator_phone
         FROM hospital_branch b JOIN corporates c ON c.unique_id = b.corporate_uid
         LEFT JOIN tenants o ON o.unique_id = b.owner_uid
        WHERE c.id = $1 AND b.unit_type = 'ohc' AND b.is_active AND b.contract_status = 'active'
          AND (b.contract_end IS NULL OR b.contract_end >= CURRENT_DATE)
        ORDER BY b.created_at LIMIT 1`, [corporateId]);
    const unit = units[0];
    if (!unit) return null;
    const { rows: staff } = await pool.query(
      `SELECT us.unique_id, us."firstName", us."lastName", us.metadata,
              d.id AS doctor_id, d.qualification, d.specialization, d.metadata AS doctor_metadata, d."registrationNumber" AS doctor_reg_no
         FROM staff_branch_assignment s JOIN users us ON us.id = s.user_id
         LEFT JOIN doctors d ON d.linked_user_uid = us.unique_id
        WHERE s.branch_id = (SELECT id FROM hospital_branch WHERE unique_id = $1) AND s.role = 'ohc_doctor' AND s.is_active
        ORDER BY d.id NULLS LAST LIMIT 1`, [unit.unique_id]);
    const w = staff[0];
    if (!w) return null;
    const clinicName = unit.operator_name || unit.name;
    return {
      doctorId: w.doctor_id || undefined,
      doctorName: `${w.firstName || ''} ${w.lastName || ''}`.trim(),
      doctorRegNo: w.doctor_reg_no || w.metadata?.registrationNumber || undefined,
      doctorQualifications: w.qualification || undefined,
      doctorSpecialty: w.doctor_metadata?.title || w.specialization || undefined,
      clinicName,
      tenantId: unit.operator_id || undefined,
      clinicAddress: formatClinicAddress(unit.operator_address) || undefined,
      clinicPhone: unit.operator_phone || undefined,
      issuePlace: unit.operator_address?.city || clinicName,
    };
  }

  return { loadPrincipal, login, refresh, logout, changePassword, me, employees, staff, emergencies, createEmergency, updateEmergency, issueCertificate, certificates, certificateById, certificateLetterhead, resolveCmoForCorporate };
}
