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
import { CollectionError, conflict, notFound, forbidden, invalid } from '../collection/errors.js';
import * as v from '../collection/validation.js';
import { passwordProblem } from '../collection/phlebotomist.service.js';

export const OHC_PORTAL = 'ohc';
export const OHC_AUDIENCE = 'mediczy-ohc';
const FITNESS = ['fit', 'fit_with_restrictions', 'temporarily_unfit', 'unfit'];
const OHC_ROLES = ['ohc_doctor', 'ohc_staff', 'corporate_cmo'];
const EMERGENCY_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const EMERGENCY_STATUSES = ['open', 'triaged', 'resolved', 'transferred', 'closed'];
const RESPONDER_AVAILABILITY = ['available', 'busy', 'off_duty'];
const ASSIGNMENT_RESPONSES = ['acknowledged', 'responding', 'on_scene', 'cleared', 'declined'];
const EMERGENCY_NOTE_TYPES = ['operational', 'handover', 'clinical_summary'];
const OHC_APPOINTMENT_TYPES = ['occupational_visit', 'pre_employment', 'periodic', 'return_to_work', 'screening', 'dot_testing'];
const OHC_APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];
const OHC_SCREENING_TYPES = ['audiometry', 'spirometry', 'vision', 'drug_alcohol', 'dot_testing', 'other'];
const OHC_SCREENING_RESULTS = ['normal', 'abnormal', 'pending', 'not_fit'];
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

  async function employeeAt(c, u, employeeUserId) {
    const id = v.int(employeeUserId, 'employeeUserId', { min: 1 });
    const result = await c.query(
      `SELECT us.id, COALESCE(us."firstName" || ' ' || us."lastName", '') AS name, e."employeeId"
         FROM corporate_employees e JOIN users us ON us.id = e."userId"
        WHERE e."userId" = $1 AND e.corporate_uid = $2 AND e."isActive"`, [id, u.corporateUid]);
    if (!result.rows[0]) throw notFound('Employee');
    return result.rows[0];
  }

  async function appointments(principal, { unit, from, to, limit = 200 } = {}) {
    const u = unitOf(principal, unit);
    const lim = v.int(limit, 'limit', { min: 1, max: 500 });
    const params = [u.uid];
    const where = ['a.unit_uid = $1'];
    if (from) { params.push(v.date(from, 'from').toISOString()); where.push(`a.scheduled_at >= $${params.length}`); }
    if (to) { params.push(v.date(to, 'to').toISOString()); where.push(`a.scheduled_at <= $${params.length}`); }
    params.push(lim);
    const { rows } = await pool.query(
      `SELECT a.*, COALESCE(us."firstName" || ' ' || us."lastName", '') AS employee_name, e."employeeId" AS employee_id
         FROM ohc_appointments a JOIN users us ON us.id = a.employee_user_id
         LEFT JOIN corporate_employees e ON e."userId" = a.employee_user_id AND e.corporate_uid = $1
        WHERE ${where.join(' AND ')} ORDER BY a.scheduled_at, a.id LIMIT $${params.length}`, params);
    return { unit: { uid: u.uid }, appointments: rows };
  }

  function createAppointment(principal, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'employeeUserId', 'scheduledAt', 'durationMinutes', 'appointmentType', 'location', 'reason']);
    const u = unitOf(principal, b.unit);
    const scheduledAt = v.date(b.scheduledAt, 'scheduledAt').toISOString();
    const duration = b.durationMinutes == null ? 30 : v.int(b.durationMinutes, 'durationMinutes', { min: 5, max: 480 });
    const type = v.oneOf(b.appointmentType || 'occupational_visit', 'appointmentType', OHC_APPOINTMENT_TYPES);
    return tx(async (c) => {
      await employeeAt(c, u, b.employeeUserId);
      const { rows } = await c.query(
        `INSERT INTO ohc_appointments (unit_uid, employee_user_id, scheduled_at, duration_minutes, appointment_type, location, reason, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [u.uid, b.employeeUserId, scheduledAt, duration, type, v.str(b.location, 'location', { max: 200, optional: true }), v.str(b.reason, 'reason', { max: 1000, optional: true }), principal.id]);
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action, subject) VALUES ($1,$2,$3,'appointment.create',$4)`, [u.uid, principal.role === 'corporate_cmo' ? 'corporate_cmo' : 'ohc_staff', principal.ref, String(rows[0].id)]);
      return rows[0];
    });
  }

  function updateAppointment(principal, id, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'scheduledAt', 'durationMinutes', 'status', 'location', 'reason']);
    const u = unitOf(principal, b.unit);
    const appointmentId = v.int(id, 'id', { min: 1 });
    const scheduledAt = b.scheduledAt === undefined ? null : v.date(b.scheduledAt, 'scheduledAt').toISOString();
    const duration = b.durationMinutes === undefined ? null : v.int(b.durationMinutes, 'durationMinutes', { min: 5, max: 480 });
    const status = b.status === undefined ? null : v.oneOf(b.status, 'status', OHC_APPOINTMENT_STATUSES);
    return tx(async (c) => {
      const { rows } = await c.query(
        `UPDATE ohc_appointments SET scheduled_at = COALESCE($1, scheduled_at), duration_minutes = COALESCE($2, duration_minutes), status = COALESCE($3, status), location = COALESCE($4, location), reason = COALESCE($5, reason), updated_at = now()
          WHERE id = $6 AND unit_uid = $7 RETURNING *`,
        [scheduledAt, duration, status, b.location === undefined ? null : v.str(b.location, 'location', { max: 200, optional: true }), b.reason === undefined ? null : v.str(b.reason, 'reason', { max: 1000, optional: true }), appointmentId, u.uid]);
      if (!rows[0]) throw notFound('Occupational appointment');
      return rows[0];
    });
  }

  async function remindAppointment(principal, id, input) {
    const b = v.exactly(v.body(input), 'body', ['unit']);
    const u = unitOf(principal, b.unit);
    const appointmentId = v.int(id, 'id', { min: 1 });
    const { rows } = await pool.query(
      `SELECT a.*, COALESCE(us."firstName" || ' ' || us."lastName", '') AS employee_name
         FROM ohc_appointments a JOIN users us ON us.id = a.employee_user_id
        WHERE a.id = $1 AND a.unit_uid = $2 AND a.status = 'scheduled'`, [appointmentId, u.uid]);
    const appointment = rows[0];
    if (!appointment) throw notFound('Scheduled occupational appointment');
    let notificationSent = false;
    try {
      const notificationService = (await import('../notification.service.js')).default;
      await notificationService.sendNotification({
        userId: appointment.employee_user_id, userType: 'patient', title: 'Occupational health appointment reminder',
        body: `Reminder: your ${appointment.appointment_type.replaceAll('_', ' ')} is scheduled for ${new Date(appointment.scheduled_at).toLocaleString()}.`,
        type: 'appointment_reminder', data: { ohcAppointmentId: appointment.id, unitUid: u.uid },
      });
      notificationSent = true;
      await pool.query(`UPDATE ohc_appointments SET reminder_sent_at = now(), updated_at = now() WHERE id = $1`, [appointment.id]);
    } catch (err) { console.error('[ohc] appointment reminder failed:', err.message); }
    return { appointmentId: appointment.id, notificationSent };
  }

  async function encounters(principal, { unit, employeeUserId, limit = 100 } = {}) {
    const u = unitOf(principal, unit);
    const lim = v.int(limit, 'limit', { min: 1, max: 200 });
    const params = [u.uid]; const where = ['e.unit_uid = $1'];
    if (employeeUserId) { params.push(v.int(employeeUserId, 'employeeUserId', { min: 1 })); where.push(`e.employee_user_id = $${params.length}`); }
    params.push(lim);
    const { rows } = await pool.query(
      `SELECT e.*, COALESCE(us."firstName" || ' ' || us."lastName", '') AS employee_name
         FROM ohc_encounters e JOIN users us ON us.id = e.employee_user_id
        WHERE ${where.join(' AND ')} ORDER BY e.created_at DESC LIMIT $${params.length}`, params);
    return { unit: { uid: u.uid }, encounters: rows };
  }

  function createEncounter(principal, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'employeeUserId', 'appointmentId', 'encounterType', 'observations', 'assessment', 'treatment', 'followUpAt']);
    if (!['ohc_doctor', 'corporate_cmo'].includes(principal.role)) throw forbidden('Only an OHC doctor or corporate CMO can create an occupational encounter');
    const u = unitOf(principal, b.unit);
    const type = v.oneOf(b.encounterType || 'occupational_visit', 'encounterType', OHC_APPOINTMENT_TYPES);
    if (b.observations !== undefined && (typeof b.observations !== 'object' || b.observations === null || Array.isArray(b.observations))) throw invalid('observations must be an object', { field: 'observations' });
    return tx(async (c) => {
      await employeeAt(c, u, b.employeeUserId);
      const appointmentId = b.appointmentId == null ? null : v.int(b.appointmentId, 'appointmentId', { min: 1 });
      if (appointmentId) {
        const appointment = await c.query(`SELECT 1 FROM ohc_appointments WHERE id = $1 AND unit_uid = $2 AND employee_user_id = $3`, [appointmentId, u.uid, b.employeeUserId]);
        if (!appointment.rowCount) throw notFound('Occupational appointment');
      }
      const { rows } = await c.query(
        `INSERT INTO ohc_encounters (unit_uid, employee_user_id, appointment_id, clinician_user_id, encounter_type, observations, assessment, treatment, follow_up_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING *`,
        [u.uid, b.employeeUserId, appointmentId, principal.id, type, JSON.stringify(b.observations || {}), v.str(b.assessment, 'assessment', { max: 4000, optional: true }), v.str(b.treatment, 'treatment', { max: 4000, optional: true }), b.followUpAt ? v.date(b.followUpAt, 'followUpAt').toISOString() : null]);
      if (appointmentId) await c.query(`UPDATE ohc_appointments SET status = 'completed', updated_at = now() WHERE id = $1`, [appointmentId]);
      return rows[0];
    });
  }

  function finalizeEncounter(principal, id, input) {
    const b = v.exactly(v.body(input), 'body', ['unit']);
    if (!['ohc_doctor', 'corporate_cmo'].includes(principal.role)) throw forbidden('Only an OHC doctor or corporate CMO can finalize an occupational encounter');
    const u = unitOf(principal, b.unit);
    return tx(async (c) => {
      const { rows } = await c.query(
        `UPDATE ohc_encounters SET status = 'finalized', finalized_at = now(), finalized_by_user_id = $1, updated_at = now()
          WHERE id = $2 AND unit_uid = $3 AND status = 'draft' AND ($4 = 'corporate_cmo' OR clinician_user_id = $1) RETURNING *`,
        [principal.id, v.int(id, 'id', { min: 1 }), u.uid, principal.role]);
      if (!rows[0]) throw conflict('encounter_not_finalizable', 'The encounter was not found, is already finalized, or belongs to another clinician');
      return rows[0];
    });
  }

  function addScreeningResult(principal, encounterId, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'screeningType', 'resultStatus', 'resultData', 'performedAt']);
    const u = unitOf(principal, b.unit);
    const type = v.oneOf(b.screeningType, 'screeningType', OHC_SCREENING_TYPES);
    const result = v.oneOf(b.resultStatus, 'resultStatus', OHC_SCREENING_RESULTS);
    if (b.resultData !== undefined && (typeof b.resultData !== 'object' || b.resultData === null || Array.isArray(b.resultData))) throw invalid('resultData must be an object', { field: 'resultData' });
    return tx(async (c) => {
      const encounter = await c.query(`SELECT id FROM ohc_encounters WHERE id = $1 AND unit_uid = $2`, [v.int(encounterId, 'encounterId', { min: 1 }), u.uid]);
      if (!encounter.rowCount) throw notFound('Occupational encounter');
      const { rows } = await c.query(
        `INSERT INTO ohc_screening_results (encounter_id, screening_type, result_status, result_data, performed_at, recorded_by_user_id)
         VALUES ($1,$2,$3,$4::jsonb,COALESCE($5::timestamptz,now()),$6) RETURNING *`,
        [encounter.rows[0].id, type, result, JSON.stringify(b.resultData || {}), b.performedAt ? v.date(b.performedAt, 'performedAt').toISOString() : null, principal.id]);
      return rows[0];
    });
  }

  async function staffMessages(principal, { unit, limit = 100 } = {}) {
    const u = unitOf(principal, unit);
    const lim = v.int(limit, 'limit', { min: 1, max: 200 });
    const { rows } = await pool.query(
      `SELECT m.*, COALESCE(author."firstName" || ' ' || author."lastName", '') AS author_name
         FROM ohc_staff_messages m JOIN users author ON author.id = m.author_user_id
        WHERE m.unit_uid = $1 AND (m.recipient_user_id IS NULL OR m.recipient_user_id = $2)
        ORDER BY m.created_at DESC, m.id DESC LIMIT $3`, [u.uid, principal.id, lim]);
    return { unit: { uid: u.uid }, messages: rows };
  }

  function createStaffMessage(principal, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'recipientUid', 'messageType', 'title', 'body']);
    const u = unitOf(principal, b.unit);
    const messageType = v.oneOf(b.messageType || 'announcement', 'messageType', ['announcement', 'operational', 'handover']);
    return tx(async (c) => {
      let recipientId = null;
      if (b.recipientUid) {
        const recipient = await c.query(
          `SELECT us.id FROM staff_branch_assignment s JOIN users us ON us.id = s.user_id
            WHERE s.branch_id = $1 AND s.is_active AND us.status = 'active' AND us.unique_id = $2`, [u.id, v.str(b.recipientUid, 'recipientUid', { min: 6, max: 64 })]);
        if (!recipient.rowCount) throw notFound('OHC staff recipient');
        recipientId = recipient.rows[0].id;
      }
      const { rows } = await c.query(
        `INSERT INTO ohc_staff_messages (unit_uid, author_user_id, recipient_user_id, message_type, title, body) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [u.uid, principal.id, recipientId, messageType, v.str(b.title, 'title', { min: 2, max: 160 }), v.str(b.body, 'body', { min: 2, max: 4000 })]);
      return rows[0];
    });
  }

  async function occupationalSummary(principal, { unit, from, to } = {}) {
    const u = unitOf(principal, unit);
    const params = [u.uid]; const period = [];
    if (from) { params.push(v.date(from, 'from').toISOString()); period.push(`created_at >= $${params.length}`); }
    if (to) { params.push(v.date(to, 'to').toISOString()); period.push(`created_at <= $${params.length}`); }
    const clause = period.length ? ` AND ${period.join(' AND ')}` : '';
    const [appointmentStats, encounterStats, screenings] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'completed')::int AS completed, COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show FROM ohc_appointments WHERE unit_uid = $1${clause}`, params),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'finalized')::int AS finalized FROM ohc_encounters WHERE unit_uid = $1${clause}`, params),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE result_status IN ('abnormal','not_fit'))::int AS attention_required FROM ohc_screening_results s JOIN ohc_encounters e ON e.id = s.encounter_id WHERE e.unit_uid = $1${clause.replaceAll('created_at', 's.performed_at')}`, params),
    ]);
    return { unit: { uid: u.uid }, summary: { appointments: appointmentStats.rows[0], encounters: encounterStats.rows[0], screenings: screenings.rows[0] } };
  }

  const CERT_KEYS = ['unit', 'employeeUserId', 'jobDescription', 'examinationDate', 'examinationPlace', 'issuedDate', 'fitnessStatus', 'restrictions', 'validFrom', 'validUntil', 'remarks', 'certificateType'];
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
      const issuedDate = b.issuedDate ? v.date(b.issuedDate, 'issuedDate').toISOString() : null;
      const ins = await c.query(
        `INSERT INTO fitness_certificates
           (organization_id, patient_id, certificate_type, issued_by, doctor_reg_no, patient_name, employee_id, employer_name, job_description, examination_date,
            fitness_status, restrictions, valid_from, valid_until, remarks, certificate_data, signed_at, issued_by_unit_uid, issued_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE), $11, $12, $13, $14, $15, $16::jsonb, COALESCE($19::timestamptz, now()), $17, $18) RETURNING *`,
        [emp.corporate_id, emp.id, b.certificateType ? v.str(b.certificateType, 'certificateType', { max: 60 }) : 'ohc_fitness', principal.displayName, principal.registrationNumber,
          `${emp.firstName || ''} ${emp.lastName || ''}`.trim(), emp.employeeId, emp.companyName, v.str(b.jobDescription, 'jobDescription', { max: 300, optional: true }),
          b.examinationDate ? v.date(b.examinationDate, 'examinationDate').toISOString().slice(0, 10) : null, status,
          v.str(b.restrictions, 'restrictions', { max: 500, optional: true }), validFrom, validUntil, v.str(b.remarks, 'remarks', { max: 1000, optional: true }),
          JSON.stringify({ source: 'ohc', unitUid: u.uid, issuedByUserUid: principal.uid, examinationPlace: v.str(b.examinationPlace, 'examinationPlace', { max: 200, optional: true }) || undefined }), u.uid, principal.id, issuedDate]);
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

  /** Responders are active staff assigned to this OHC. Availability is scoped to
   * the OHC unit, so an employee's status at one workplace cannot leak into another. */
  async function responders(principal, { unit } = {}) {
    const u = unitOf(principal, unit);
    const { rows } = await pool.query(
      `SELECT us.id, us.unique_id AS uid, us."firstName", us."lastName", s.role,
              COALESCE(rs.availability, 'available') AS availability, rs.updated_at
         FROM staff_branch_assignment s
         JOIN users us ON us.id = s.user_id
         LEFT JOIN ohc_responder_statuses rs ON rs.unit_uid = $1 AND rs.user_id = us.id
        WHERE s.branch_id = $2 AND s.is_active AND us.status = 'active'
          AND s.role IN ('ohc_doctor', 'ohc_staff')
        ORDER BY s.role, us."firstName", us."lastName"`, [u.uid, u.id]);
    return { unit: { uid: u.uid }, responders: rows.map((r) => ({
      uid: r.uid, name: `${r.firstName || ''} ${r.lastName || ''}`.trim(), role: r.role,
      availability: r.availability, updatedAt: r.updated_at,
    })) };
  }

  function responderAvailability(principal, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'availability']);
    const u = unitOf(principal, b.unit);
    if (principal.role === 'corporate_cmo') throw forbidden('The corporate CMO cannot set OHC staff availability');
    const availability = v.oneOf(b.availability, 'availability', RESPONDER_AVAILABILITY);
    return tx(async (c) => {
      const assigned = await c.query(
        `SELECT 1 FROM staff_branch_assignment WHERE branch_id = $1 AND user_id = $2 AND is_active AND role IN ('ohc_doctor', 'ohc_staff')`,
        [u.id, principal.id]);
      if (!assigned.rowCount) throw forbidden('You are not an active responder at this OHC');
      const { rows } = await c.query(
        `INSERT INTO ohc_responder_statuses (unit_uid, user_id, availability)
         VALUES ($1, $2, $3)
         ON CONFLICT (unit_uid, user_id) DO UPDATE SET availability = EXCLUDED.availability, updated_at = now()
         RETURNING availability, updated_at`, [u.uid, principal.id, availability]);
      return { availability: rows[0].availability, updatedAt: rows[0].updated_at };
    });
  }

  async function emergencyAt(c, u, id) {
    const { rows } = await c.query(
      `SELECT id, status, severity, location FROM ohc_workplace_emergencies WHERE id = $1 AND unit_uid = $2`,
      [v.int(id, 'id', { min: 1 }), u.uid]);
    if (!rows[0]) throw notFound('Emergency');
    return rows[0];
  }

  async function event(c, emergencyId, actorId, eventType, detail = {}) {
    await c.query(
      `INSERT INTO ohc_emergency_events (emergency_id, event_type, actor_user_id, detail) VALUES ($1, $2, $3, $4::jsonb)`,
      [emergencyId, eventType, actorId || null, JSON.stringify(detail)]);
  }

  async function emergencies(principal, { unit, status, limit = 50 } = {}) {
    const u = unitOf(principal, unit);
    const lim = v.int(limit, 'limit', { min: 1, max: 200 });
    const params = [u.uid, principal.id];
    const where = ['e.unit_uid = $1'];
    if (status) { where.push(`e.status = $${params.length + 1}`); params.push(v.oneOf(status, 'status', EMERGENCY_STATUSES)); }
    params.push(lim);
    const { rows } = await pool.query(
      `SELECT e.*, COALESCE(u."firstName" || ' ' || u."lastName", '') AS employee_name, u.unique_id AS employee_uid,
              (SELECT COUNT(*)::int FROM ohc_emergency_assignments a WHERE a.emergency_id = e.id AND a.status NOT IN ('cancelled', 'cleared')) AS active_assignment_count,
              (SELECT COUNT(*)::int FROM ohc_emergency_assignments a WHERE a.emergency_id = e.id AND a.status IN ('acknowledged', 'responding', 'on_scene')) AS acknowledged_assignment_count,
              (SELECT a.id FROM ohc_emergency_assignments a WHERE a.emergency_id = e.id AND a.responder_user_id = $2 LIMIT 1) AS my_assignment_id,
              (SELECT a.status FROM ohc_emergency_assignments a WHERE a.emergency_id = e.id AND a.responder_user_id = $2 LIMIT 1) AS my_assignment_status,
              (SELECT a.id FROM ohc_emergency_assignments a WHERE a.emergency_id = e.id AND a.responder_user_id = $2 AND a.status = 'assigned' LIMIT 1) AS my_pending_assignment_id
         FROM ohc_workplace_emergencies e LEFT JOIN users u ON u.id = e.employee_user_id
        WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC, e.id DESC LIMIT $${params.length}`, params);
    return { unit: { uid: u.uid }, emergencies: rows };
  }

  /** Unit-scoped operational measures. These are calculated from actual assignment
   * timestamps, not client-provided or estimated response times. */
  async function emergencyAnalytics(principal, { unit } = {}) {
    const u = unitOf(principal, unit);
    const { rows } = await pool.query(
      `SELECT
         COUNT(DISTINCT e.id) FILTER (WHERE e.status IN ('open', 'triaged'))::int AS active_incidents,
         COUNT(DISTINCT e.id) FILTER (WHERE e.status IN ('open', 'triaged') AND e.severity = 'critical')::int AS critical_active_incidents,
         COUNT(DISTINCT e.id) FILTER (WHERE e.occurred_at >= date_trunc('day', now()))::int AS incidents_today,
         ROUND(AVG(EXTRACT(EPOCH FROM (a.acknowledged_at - a.assigned_at))) FILTER (WHERE a.acknowledged_at IS NOT NULL))::int AS average_acknowledgement_seconds
       FROM ohc_workplace_emergencies e
       LEFT JOIN ohc_emergency_assignments a ON a.emergency_id = e.id
       WHERE e.unit_uid = $1`, [u.uid]);
    const metrics = rows[0] || {};
    return { unit: { uid: u.uid }, metrics: {
      activeIncidents: metrics.active_incidents || 0,
      criticalActiveIncidents: metrics.critical_active_incidents || 0,
      incidentsToday: metrics.incidents_today || 0,
      averageAcknowledgementSeconds: metrics.average_acknowledgement_seconds ?? null,
    } };
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
      await event(c, rows[0].id, principal.id, 'emergency_reported', { severity, incidentType, location: location || null });
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
      await event(c, rows[0].id, principal.id, 'emergency_updated', {
        status: status || undefined, triageNoteAdded: triageNotes !== null, resolutionAdded: resolution !== null,
      });
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action, subject) VALUES ($1, $2, $3, 'emergency.update', $4)`, [u.uid, principal.role === 'corporate_cmo' ? 'corporate_cmo' : 'ohc_staff', principal.ref, String(rows[0].id)]);
      return rows[0];
    });
  }

  async function emergencyDetail(principal, id, { unit } = {}) {
    const u = unitOf(principal, unit);
    const emergency = await emergencyAt(pool, u, id);
    const [assignments, events, notes, reports, amendments] = await Promise.all([
      pool.query(
        `SELECT a.*, us.unique_id AS responder_uid, COALESCE(us."firstName" || ' ' || us."lastName", '') AS responder_name
           FROM ohc_emergency_assignments a JOIN users us ON us.id = a.responder_user_id
          WHERE a.emergency_id = $1 ORDER BY a.assigned_at, a.id`, [emergency.id]),
      pool.query(
        `SELECT ev.*, COALESCE(us."firstName" || ' ' || us."lastName", '') AS actor_name
           FROM ohc_emergency_events ev LEFT JOIN users us ON us.id = ev.actor_user_id
          WHERE ev.emergency_id = $1 ORDER BY ev.created_at, ev.id`, [emergency.id]),
      pool.query(
        `SELECT n.*, COALESCE(us."firstName" || ' ' || us."lastName", '') AS author_name
           FROM ohc_emergency_notes n JOIN users us ON us.id = n.author_user_id
          WHERE n.emergency_id = $1 ORDER BY n.created_at, n.id`, [emergency.id]),
      pool.query(`SELECT * FROM ohc_emergency_reports WHERE emergency_id = $1`, [emergency.id]),
      pool.query(
        `SELECT a.*, COALESCE(us."firstName" || ' ' || us."lastName", '') AS author_name
           FROM ohc_emergency_report_amendments a JOIN users us ON us.id = a.author_user_id
          WHERE a.emergency_id = $1 ORDER BY a.created_at, a.id`, [emergency.id]),
    ]);
    return { emergency, assignments: assignments.rows, events: events.rows, notes: notes.rows, report: reports.rows[0] || null, amendments: amendments.rows };
  }

  function addEmergencyNote(principal, id, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'body', 'noteType']);
    const u = unitOf(principal, b.unit);
    const body = v.str(b.body, 'body', { min: 2, max: 4000 });
    const noteType = v.oneOf(b.noteType || 'operational', 'noteType', EMERGENCY_NOTE_TYPES);
    return tx(async (c) => {
      const emergency = await emergencyAt(c, u, id);
      const { rows } = await c.query(
        `INSERT INTO ohc_emergency_notes (emergency_id, author_user_id, note_type, body) VALUES ($1, $2, $3, $4) RETURNING *`,
        [emergency.id, principal.id, noteType, body]);
      await event(c, emergency.id, principal.id, 'emergency_note_added', { noteType, noteId: rows[0].id });
      return rows[0];
    });
  }

  function saveEmergencyReportDraft(principal, id, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'summary']);
    const u = unitOf(principal, b.unit);
    const summary = v.str(b.summary, 'summary', { max: 8000 });
    return tx(async (c) => {
      const emergency = await emergencyAt(c, u, id);
      const { rows } = await c.query(
        `INSERT INTO ohc_emergency_reports (emergency_id, summary) VALUES ($1, $2)
         ON CONFLICT (emergency_id) DO UPDATE SET summary = EXCLUDED.summary, updated_at = now()
           WHERE ohc_emergency_reports.status = 'draft' RETURNING *`, [emergency.id, summary]);
      if (!rows[0]) throw conflict('report_finalized', 'A finalized report cannot be overwritten; add an amendment instead');
      await event(c, emergency.id, principal.id, 'emergency_report_draft_saved', { reportLength: summary.length });
      return rows[0];
    });
  }

  function finalizeEmergencyReport(principal, id, input) {
    const b = v.exactly(v.body(input), 'body', ['unit']);
    const u = unitOf(principal, b.unit);
    if (!['ohc_doctor', 'corporate_cmo'].includes(principal.role)) throw forbidden('Only an OHC doctor or corporate CMO can finalize an emergency report');
    return tx(async (c) => {
      const emergency = await emergencyAt(c, u, id);
      if (!['resolved', 'transferred', 'closed'].includes(emergency.status)) throw conflict('emergency_not_resolved', 'Resolve or transfer the emergency before finalizing its report');
      const { rows } = await c.query(
        `UPDATE ohc_emergency_reports SET status = 'finalized', finalized_by_user_id = $1, finalized_at = now(), updated_at = now()
          WHERE emergency_id = $2 AND status = 'draft' AND length(trim(summary)) >= 10 RETURNING *`, [principal.id, emergency.id]);
      if (!rows[0]) throw conflict('report_not_ready', 'Save a meaningful draft report before finalizing, or the report is already finalized');
      await event(c, emergency.id, principal.id, 'emergency_report_finalized', {});
      return rows[0];
    });
  }

  function amendEmergencyReport(principal, id, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'reason', 'amendment']);
    const u = unitOf(principal, b.unit);
    if (!['ohc_doctor', 'corporate_cmo'].includes(principal.role)) throw forbidden('Only an OHC doctor or corporate CMO can amend a finalized emergency report');
    const reason = v.str(b.reason, 'reason', { min: 2, max: 500 });
    const amendment = v.str(b.amendment, 'amendment', { min: 2, max: 4000 });
    return tx(async (c) => {
      const emergency = await emergencyAt(c, u, id);
      const report = await c.query(`SELECT 1 FROM ohc_emergency_reports WHERE emergency_id = $1 AND status = 'finalized'`, [emergency.id]);
      if (!report.rowCount) throw conflict('report_not_finalized', 'Only finalized reports can be amended');
      const { rows } = await c.query(
        `INSERT INTO ohc_emergency_report_amendments (emergency_id, author_user_id, reason, amendment) VALUES ($1, $2, $3, $4) RETURNING *`,
        [emergency.id, principal.id, reason, amendment]);
      await event(c, emergency.id, principal.id, 'emergency_report_amended', { amendmentId: rows[0].id, reason });
      return rows[0];
    });
  }

  function assignEmergency(principal, id, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'responderUid', 'note']);
    const u = unitOf(principal, b.unit);
    const responderUid = v.str(b.responderUid, 'responderUid', { min: 6, max: 64 });
    const note = v.str(b.note, 'note', { max: 500, optional: true });
    return tx(async (c) => {
      const emergency = await emergencyAt(c, u, id);
      if (['resolved', 'transferred', 'closed'].includes(emergency.status)) throw conflict('emergency_closed', 'Responders cannot be assigned after this emergency is closed or transferred');
      const { rows: candidates } = await c.query(
        `SELECT us.id, us.unique_id, COALESCE(rs.availability, 'available') AS availability
           FROM staff_branch_assignment s JOIN users us ON us.id = s.user_id
           LEFT JOIN ohc_responder_statuses rs ON rs.unit_uid = $1 AND rs.user_id = us.id
          WHERE s.branch_id = $2 AND s.is_active AND us.status = 'active' AND us.unique_id = $3
            AND s.role IN ('ohc_doctor', 'ohc_staff')`, [u.uid, u.id, responderUid]);
      const responder = candidates[0];
      if (!responder) throw notFound('Responder');
      if (responder.availability === 'off_duty') throw conflict('responder_off_duty', 'This responder is off duty');
      const existing = await c.query(
        `SELECT id, status FROM ohc_emergency_assignments WHERE emergency_id = $1 AND responder_user_id = $2 FOR UPDATE`,
        [emergency.id, responder.id]);
      if (existing.rowCount && !['declined', 'cancelled', 'cleared'].includes(existing.rows[0].status)) {
        throw conflict('already_assigned', 'This responder is already assigned to the emergency');
      }
      const result = existing.rowCount
        ? await c.query(`UPDATE ohc_emergency_assignments SET assigned_by_user_id = $1, status = 'assigned', assigned_at = now(), acknowledged_at = NULL, responded_at = NULL, cleared_at = NULL, note = $2, updated_at = now() WHERE id = $3 RETURNING *`, [principal.id, note, existing.rows[0].id])
        : await c.query(`INSERT INTO ohc_emergency_assignments (emergency_id, responder_user_id, assigned_by_user_id, note) VALUES ($1, $2, $3, $4) RETURNING *`, [emergency.id, responder.id, principal.id, note]);
      await event(c, emergency.id, principal.id, 'responder_assigned', { responderUid: responder.unique_id, note: note || undefined });
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action, subject) VALUES ($1, $2, $3, 'emergency.assign', $4)`, [u.uid, principal.role === 'corporate_cmo' ? 'corporate_cmo' : 'ohc_staff', principal.ref, String(emergency.id)]);
      return result.rows[0];
    });
  }

  function respondToAssignment(principal, id, assignmentId, input) {
    const b = v.exactly(v.body(input), 'body', ['unit', 'status', 'note']);
    const u = unitOf(principal, b.unit);
    if (principal.role === 'corporate_cmo') throw forbidden('The corporate CMO cannot respond to an OHC emergency assignment');
    const status = v.oneOf(b.status, 'status', ASSIGNMENT_RESPONSES);
    const note = v.str(b.note, 'note', { max: 500, optional: true });
    return tx(async (c) => {
      const emergency = await emergencyAt(c, u, id);
      const permittedPriorStatuses = {
        acknowledged: ['assigned'],
        declined: ['assigned'],
        responding: ['acknowledged', 'responding'],
        on_scene: ['acknowledged', 'responding', 'on_scene'],
        cleared: ['acknowledged', 'responding', 'on_scene'],
      }[status];
      const { rows } = await c.query(
        `UPDATE ohc_emergency_assignments SET status = $1, note = COALESCE($2, note),
                acknowledged_at = CASE WHEN $1 = 'acknowledged' THEN now() ELSE acknowledged_at END,
                responded_at = CASE WHEN $1 IN ('responding', 'on_scene') THEN COALESCE(responded_at, now()) ELSE responded_at END,
                cleared_at = CASE WHEN $1 = 'cleared' THEN now() ELSE cleared_at END, updated_at = now()
           WHERE id = $3 AND emergency_id = $4 AND responder_user_id = $5 AND status = ANY($6::text[])
         RETURNING *`, [status, note, v.int(assignmentId, 'assignmentId', { min: 1 }), emergency.id, principal.id, permittedPriorStatuses]);
      if (!rows[0]) throw conflict('assignment_not_pending', 'This assignment is no longer waiting for your response');
      if (['acknowledged', 'responding', 'on_scene'].includes(status)) await c.query(
        `INSERT INTO ohc_responder_statuses (unit_uid, user_id, availability) VALUES ($1, $2, 'busy')
         ON CONFLICT (unit_uid, user_id) DO UPDATE SET availability = 'busy', updated_at = now()`, [u.uid, principal.id]);
      if (status === 'cleared') {
        const active = await c.query(
          `SELECT 1 FROM ohc_emergency_assignments a JOIN ohc_workplace_emergencies e ON e.id = a.emergency_id
            WHERE e.unit_uid = $1 AND a.responder_user_id = $2 AND a.status IN ('assigned', 'acknowledged', 'responding', 'on_scene') LIMIT 1`, [u.uid, principal.id]);
        if (!active.rowCount) await c.query(
          `INSERT INTO ohc_responder_statuses (unit_uid, user_id, availability) VALUES ($1, $2, 'available')
           ON CONFLICT (unit_uid, user_id) DO UPDATE SET availability = 'available', updated_at = now()`, [u.uid, principal.id]);
      }
      await event(c, emergency.id, principal.id, `responder_${status}`, { assignmentId: rows[0].id, note: note || undefined });
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

  return { loadPrincipal, login, refresh, logout, changePassword, me, employees, appointments, createAppointment, updateAppointment, remindAppointment, encounters, createEncounter, finalizeEncounter, addScreeningResult, staffMessages, createStaffMessage, occupationalSummary, responders, responderAvailability, emergencies, emergencyAnalytics, emergencyDetail, addEmergencyNote, saveEmergencyReportDraft, finalizeEmergencyReport, amendEmergencyReport, createEmergency, updateEmergency, assignEmergency, respondToAssignment, issueCertificate, certificates, certificateById, certificateLetterhead, resolveCmoForCorporate };
}
