/**
 * The OHC workspace: what an `ohc_doctor` / `ohc_staff` (a hospital- or clinic-portal user assigned to an OHC unit) can do.
 *
 * The unit and the corporate are NEVER taken from a request. Every call re-reads, from the database, that the user is active, still has
 * an active assignment to an OHC whose contract is active, and that the operator is still the user's organisation; suspending the user,
 * unassigning them or ending the contract stops the next request, not the token's expiry.
 */
import bcrypt from 'bcrypt';
import { CollectionError, notFound, forbidden, invalid } from '../collection/errors.js';
import * as v from '../collection/validation.js';

export const OHC_PORTAL = 'ohc';
export const OHC_AUDIENCE = 'mediczy-ohc';
const FITNESS = ['fit', 'fit_with_restrictions', 'temporarily_unfit', 'unfit'];
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
    if (!['ohc_doctor', 'ohc_staff'].includes(u.role)) return { reason: 'not_an_ohc_role' };
    const { rows: units } = await pool.query(
      `SELECT b.id, b.unique_id, b.name, b.corporate_uid, b.owner_uid, b.services, s.role AS assigned_role, c."companyName" AS corporate_name, o.name AS operator_name
         FROM staff_branch_assignment s
         JOIN hospital_branch b ON b.id = s.branch_id AND b.unit_type = 'ohc' AND b.is_active AND b.contract_status = 'active'
              AND (b.contract_end IS NULL OR b.contract_end >= CURRENT_DATE) AND b.owner_uid = $2
         LEFT JOIN corporates c ON c.unique_id = b.corporate_uid
         LEFT JOIN tenants o ON o.unique_id = b.owner_uid
        WHERE s.user_id = $1 AND s.is_active AND s.role = $3`, [u.id, u.organization_uid, u.role]);
    if (!units.length) return { reason: 'no_active_ohc_assignment' };
    return {
      principal: {
        type: 'ohc_staff', id: u.id, uid: u.unique_id, ref: `ohc:${u.unique_id}`, role: u.role,
        displayName: `${u.firstName || ''} ${u.lastName || ''}`.trim(), registrationNumber: u.metadata?.registrationNumber || null,
        units: units.map((b) => ({ id: b.id, uid: b.unique_id, name: b.name, corporateUid: b.corporate_uid, corporateName: b.corporate_name, operatorUid: b.owner_uid, operatorName: b.operator_name, services: b.services || [] })),
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
    return { ...pair, worker: { uid: principal.uid, displayName: principal.displayName, role: principal.role }, units: principal.units };
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

  const me = (principal) => ({
    worker: { uid: principal.uid, displayName: principal.displayName, role: principal.role, registrationNumberOnFile: Boolean(principal.registrationNumber), canSign: principal.role === 'ohc_doctor' && Boolean(principal.registrationNumber) },
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

  const CERT_KEYS = ['unit', 'employeeUserId', 'jobDescription', 'examinationDate', 'fitnessStatus', 'restrictions', 'validFrom', 'validUntil', 'remarks', 'certificateType'];
  /** Issue a fitness certificate. Only an ohc_doctor with a registration number on file; the employee must belong to the unit's corporate. */
  function issueCertificate(principal, input) {
    const b = v.exactly(v.body(input), 'body', CERT_KEYS);
    if (principal.role !== 'ohc_doctor') throw forbidden('Only an OHC doctor can sign a fitness certificate');
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
          JSON.stringify({ source: 'ohc', unitUid: u.uid, issuedByUserUid: principal.uid }), u.uid, principal.id]);
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action, subject) VALUES ($1, 'ohc_staff', $2, 'certificate.issue', $3)`, [u.uid, principal.ref, String(ins.rows[0].id)]);
      return { status: 201, body: { certificate: ins.rows[0] } };
    });
  }

  async function certificates(principal, { unit, limit = 50 } = {}) {
    const u = unitOf(principal, unit);
    const lim = v.int(limit, 'limit', { min: 1, max: 200 });
    const { rows } = await pool.query(`SELECT * FROM fitness_certificates WHERE issued_by_unit_uid = $1 ORDER BY created_at DESC LIMIT ${lim}`, [u.uid]);
    return { unit: { uid: u.uid }, certificates: rows };
  }

  async function certificateById(principal, id) {
    const n = v.int(id, 'id', { min: 1 });
    const { rows } = await pool.query(`SELECT * FROM fitness_certificates WHERE id = $1 AND issued_by_unit_uid = ANY($2::text[])`, [n, principal.units.map((x) => x.uid)]);
    if (!rows[0]) throw notFound('Certificate');
    return rows[0];
  }

  return { loadPrincipal, login, refresh, logout, me, employees, issueCertificate, certificates, certificateById };
}
