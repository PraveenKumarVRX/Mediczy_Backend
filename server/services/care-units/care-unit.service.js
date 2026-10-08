/**
 * Care units: outreach clinics, medical centres and OHCs of a hospital or clinic (the OPERATOR), and the corporate's view of the OHC
 * it contracted. Design: docs/architecture/OHC_UNDER_HOSPITAL_UNITS_DESIGN.md.
 *
 * Authority comes from the principal, never the request:
 *   { type: 'operator',  ownerUid, ref }    a hospital/clinic administrator            → manage that operator's units and staff
 *   { type: 'corporate', corporateUid, ref } a corporate's super-HR / account owner       → see and accept the OHCs that serve it
 * The invariants (types, hierarchy, one corporate per OHC, contract acceptance, staff↔unit) are enforced by the database trigger
 * `care_unit_guard`; this layer validates input and turns a trigger refusal into a 4xx.
 */
import { CollectionError, notFound, forbidden, invalid, conflict } from '../collection/errors.js';
import * as v from '../collection/validation.js';

const UNIT_TYPES = ['main', 'branch', 'outreach_clinic', 'medical_centre', 'ohc'];
const CREATABLE = ['branch', 'outreach_clinic', 'medical_centre', 'ohc'];
const OHC_ROLES = ['ohc_doctor', 'ohc_staff'];
const UNIT_UID = /^J[A-Z0-9]{5}$/;

const COLUMNS = `b.id, b.unique_id, b.owner_uid, b.unit_type, b.name, b.is_active, b.ownership, b.brand_name, b.co_owner_uid, b.visit_pattern, b.services,
  b.address, b.city, b.state, b.pincode, b.phone, b.email, b.manager, b.corporate_uid, b.contract_ref, b.contract_start::text AS contract_start, b.contract_end::text AS contract_end,
  b.contract_status, b.initiated_by, b.accepted_by_corporate_at, b.accepted_by_operator_at, b.created_at,
  p.unique_id AS parent_uid, p.name AS parent_name, p.unit_type AS parent_type`;
const FROM = `FROM hospital_branch b LEFT JOIN hospital_branch p ON p.id = b.parent_unit_id`;

export const projectUnit = (r) => ({
  uid: r.unique_id, type: r.unit_type, name: r.name, active: r.is_active, ownerUid: r.owner_uid,
  parent: r.parent_uid ? { uid: r.parent_uid, name: r.parent_name, type: r.parent_type } : null,
  ownership: r.ownership, brandName: r.brand_name, coOwnerUid: r.co_owner_uid, visitPattern: r.visit_pattern, services: r.services || [],
  address: { line: r.address, city: r.city, state: r.state, pincode: r.pincode }, phone: r.phone, email: r.email, manager: r.manager,
  ...(r.unit_type === 'ohc' ? {
    corporateUid: r.corporate_uid,
    contract: {
      status: r.contract_status, ref: r.contract_ref, start: r.contract_start, end: r.contract_end, initiatedBy: r.initiated_by,
      acceptedByCorporateAt: r.accepted_by_corporate_at, acceptedByOperatorAt: r.accepted_by_operator_at,
    },
  } : {}),
  createdAt: r.created_at,
});

/** Turn a database refusal from the guard triggers into a 422 the caller can show. */
function dbError(err) {
  if (err && ['23514', '23502', '23503', '23505'].includes(err.code)) {
    const message = String(err.message || '').replace(/^care unit: /, '').replace(/^users: /, '');
    return new CollectionError(err.code === '23505' ? 'duplicate' : 'validation_failed', err.code === '23505' ? 409 : 422, message);
  }
  return err;
}

export function createCareUnitService({ pool }) {
  async function tx(fn) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; }
    catch (err) { await c.query('ROLLBACK').catch(() => {}); throw dbError(err); }
    finally { c.release(); }
  }
  const one = async (c, sql, params) => (await c.query(sql, params)).rows[0] || null;

  function assertOperator(p) { if (!p || p.type !== 'operator' || !p.ownerUid) throw forbidden('Only a hospital or clinic administrator can manage care units'); }
  function assertCorporate(p) { if (!p || p.type !== 'corporate' || !p.corporateUid) throw forbidden('Only the corporate account can do this'); }

  async function loadOwned(c, p, uid, { lock = false } = {}) {
    if (!UNIT_UID.test(String(uid))) throw notFound('Unit');
    const row = await one(c, `SELECT ${COLUMNS} ${FROM} WHERE b.unique_id = $1 AND b.owner_uid = $2 ${lock ? 'FOR UPDATE OF b' : ''}`, [uid, p.ownerUid]);
    if (!row) throw notFound('Unit');
    return row;
  }

  // ── operator: units ───────────────────────────────────────────────────────
  async function list(p, { type, parent } = {}) {
    assertOperator(p);
    const t = type ? v.oneOf(type, 'type', UNIT_TYPES) : null;
    const par = parent ? String(parent) : null;
    const { rows } = await pool.query(
      `SELECT ${COLUMNS},
              (SELECT count(*)::int FROM staff_branch_assignment s WHERE s.branch_id = b.id AND s.is_active) AS staff_count,
              (SELECT count(*)::int FROM hospital_branch k WHERE k.parent_unit_id = b.id) AS child_count
         ${FROM} WHERE b.owner_uid = $1 AND ($2::text IS NULL OR b.unit_type = $2) AND ($3::text IS NULL OR p.unique_id = $3)
        ORDER BY CASE b.unit_type WHEN 'main' THEN 0 WHEN 'branch' THEN 1 WHEN 'outreach_clinic' THEN 2 WHEN 'medical_centre' THEN 3 ELSE 4 END, b.name`,
      [p.ownerUid, t, par]);
    return { units: rows.map((r) => ({ ...projectUnit(r), staffCount: r.staff_count, childCount: r.child_count })) };
  }

  async function get(p, uid) {
    assertOperator(p);
    const c = await pool.connect();
    try { return { unit: projectUnit(await loadOwned(c, p, uid)) }; } finally { c.release(); }
  }

  const CREATE_KEYS = ['type', 'name', 'parentUid', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'manager', 'services',
    'visitPattern', 'brandName', 'coOwnerUid', 'corporateUid', 'contractRef', 'contractStart', 'contractEnd', 'initiatedBy'];

  function createUnit(p, input) {
    assertOperator(p);
    const b = v.exactly(v.body(input), 'body', CREATE_KEYS);
    const type = v.oneOf(b.type, 'type', CREATABLE);
    const name = v.str(b.name, 'name', { min: 2, max: 120 });
    const services = Array.isArray(b.services) ? [...new Set(b.services.map((s) => v.str(s, 'services[]', { max: 60 })))].slice(0, 30) : [];
    return tx(async (c) => {
      let parentId = null;
      if (b.parentUid) {
        const parent = await loadOwned(c, p, b.parentUid);
        parentId = parent.id;
      }
      const ohc = type === 'ohc';
      const corporateUid = ohc ? v.ownerUid(b.corporateUid, 'corporateUid') : null;
      const initiatedBy = ohc ? v.oneOf(b.initiatedBy ?? 'operator', 'initiatedBy', ['corporate', 'operator']) : null;
      if (type === 'medical_centre') { v.str(b.brandName, 'brandName', { max: 120 }); v.ownerUid(b.coOwnerUid, 'coOwnerUid'); }
      const row = await one(c,
        `INSERT INTO hospital_branch
           (organization_id, owner_uid, unit_type, name, parent_unit_id, address, city, state, pincode, phone, email, manager, services,
            visit_pattern, brand_name, co_owner_uid, corporate_uid, contract_ref, contract_start, contract_end, contract_status, initiated_by, accepted_by_operator_at)
         VALUES ((SELECT source_id FROM entity_registry WHERE uid = $1), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::text[],
                 $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         RETURNING id`,
        [p.ownerUid, type, name, parentId, v.str(b.address, 'address', { max: 300, optional: true }), v.str(b.city, 'city', { max: 80, optional: true }),
          v.str(b.state, 'state', { max: 80, optional: true }), v.str(b.pincode, 'pincode', { max: 12, optional: true }), v.str(b.phone, 'phone', { max: 20, optional: true }),
          v.str(b.email, 'email', { max: 160, optional: true }), b.manager ? JSON.stringify(v.exactly(b.manager, 'manager', ['name', 'phone'])) : null, services,
          b.visitPattern === undefined ? null : v.oneOf(b.visitPattern, 'visitPattern', ['daily', 'weekly', 'monthly', 'mobile']),
          b.brandName === undefined ? null : v.str(b.brandName, 'brandName', { max: 120 }), b.coOwnerUid === undefined ? null : v.ownerUid(b.coOwnerUid, 'coOwnerUid'),
          corporateUid, ohc ? v.str(b.contractRef, 'contractRef', { max: 80, optional: true }) : null,
          ohc && b.contractStart ? v.date(b.contractStart, 'contractStart').toISOString().slice(0, 10) : null,
          ohc && b.contractEnd ? v.date(b.contractEnd, 'contractEnd').toISOString().slice(0, 10) : null,
          ohc ? 'proposed' : null, initiatedBy, ohc ? new Date() : null]);
      return { status: 201, body: { unit: projectUnit(await loadOwned(c, p, (await one(c, 'SELECT unique_id FROM hospital_branch WHERE id = $1', [row.id])).unique_id)) } };
    });
  }

  const PATCH_KEYS = ['name', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'manager', 'services', 'visitPattern', 'active', 'contractRef', 'contractEnd'];
  function updateUnit(p, uid, input) {
    assertOperator(p);
    const b = v.exactly(v.body(input), 'body', PATCH_KEYS);
    return tx(async (c) => {
      const unit = await loadOwned(c, p, uid, { lock: true });
      const sets = []; const params = [unit.id];
      const set = (col, val, cast = '') => { params.push(val); sets.push(`${col} = $${params.length}${cast}`); };
      if (b.name !== undefined) set('name', v.str(b.name, 'name', { min: 2, max: 120 }));
      for (const [k, col, max] of [['address', 'address', 300], ['city', 'city', 80], ['state', 'state', 80], ['pincode', 'pincode', 12], ['phone', 'phone', 20], ['email', 'email', 160]]) {
        if (b[k] !== undefined) set(col, v.str(b[k], k, { max, optional: true }));
      }
      if (b.manager !== undefined) set('manager', b.manager ? JSON.stringify(v.exactly(b.manager, 'manager', ['name', 'phone'])) : null, '::jsonb');
      if (b.services !== undefined) set('services', [...new Set((b.services || []).map((s) => v.str(s, 'services[]', { max: 60 })))].slice(0, 30), '::text[]');
      if (b.visitPattern !== undefined) set('visit_pattern', v.oneOf(b.visitPattern, 'visitPattern', ['daily', 'weekly', 'monthly', 'mobile']));
      if (b.active !== undefined) set('is_active', v.bool(b.active, 'active', { optional: false }));
      if (unit.unit_type === 'ohc') {
        if (b.contractRef !== undefined) set('contract_ref', v.str(b.contractRef, 'contractRef', { max: 80, optional: true }));
        if (b.contractEnd !== undefined) set('contract_end', b.contractEnd ? v.date(b.contractEnd, 'contractEnd').toISOString().slice(0, 10) : null);
      } else if (b.contractRef !== undefined || b.contractEnd !== undefined) throw invalid('Contract fields belong to an OHC only');
      if (!sets.length) throw invalid('Nothing to update');
      await c.query(`UPDATE hospital_branch SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
      return { status: 200, body: { unit: projectUnit(await loadOwned(c, p, uid)) } };
    });
  }

  // ── operator: staff of a unit ─────────────────────────────────────────────
  async function listStaff(p, uid) {
    assertOperator(p);
    const c = await pool.connect();
    try {
      const unit = await loadOwned(c, p, uid);
      const { rows } = await c.query(
        `SELECT u.id, u."firstName", u."lastName", u.email, u.unique_id, s.role, s.is_active, u.status::text AS user_status
           FROM staff_branch_assignment s JOIN users u ON u.id = s.user_id WHERE s.branch_id = $1 ORDER BY s.role, u."firstName"`, [unit.id]);
      return { staff: rows.map((r) => ({ uid: r.unique_id, name: `${r.firstName || ''} ${r.lastName || ''}`.trim(), email: r.email, role: r.role, active: r.is_active && r.user_status === 'active' })) };
    } finally { c.release(); }
  }

  function assignStaff(p, uid, input) {
    assertOperator(p);
    const b = v.exactly(v.body(input), 'body', ['userUid', 'role', 'registrationNumber']);
    const role = v.oneOf(b.role, 'role', [...OHC_ROLES, 'doctor', 'nurse', 'staff']);
    const registration = b.registrationNumber === undefined ? null : v.str(b.registrationNumber, 'registrationNumber', { max: 60 });
    if (registration && role !== 'ohc_doctor') throw invalid('A registration number belongs to an OHC doctor', { field: 'registrationNumber' });
    return tx(async (c) => {
      const unit = await loadOwned(c, p, uid, { lock: true });
      const user = await one(c, `SELECT id, role, organization_uid, status::text AS status FROM users WHERE unique_id = $1`, [v.str(b.userUid, 'userUid', { max: 12 })]);
      if (!user || user.organization_uid !== p.ownerUid) throw notFound('User');   // another operator's staff look absent
      if (user.status !== 'active') throw conflict('user_inactive', 'That user is not active');
      const row = await one(c,
        `INSERT INTO staff_branch_assignment (user_id, branch_id, role, is_active) VALUES ($1, $2, $3, true)
         ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role, is_active = true RETURNING id`, [user.id, unit.id, role]);
      if (registration) await c.query(`UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('registrationNumber', $2::text) WHERE id = $1`, [user.id, registration]);
      return { status: 201, body: { assigned: true, assignmentId: row.id } };
    });
  }

  function removeStaff(p, uid, userUid) {
    assertOperator(p);
    return tx(async (c) => {
      const unit = await loadOwned(c, p, uid, { lock: true });
      const r = await c.query(
        `UPDATE staff_branch_assignment s SET is_active = false FROM users u
          WHERE s.user_id = u.id AND u.unique_id = $1 AND s.branch_id = $2 AND s.is_active`, [v.str(userUid, 'userUid', { max: 12 }), unit.id]);
      if (!r.rowCount) throw notFound('Assignment');
      return { status: 200, body: { removed: true } };
    });
  }

  // ── contract ──────────────────────────────────────────────────────────────
  /** The corporate accepts the OHC contract proposed by the operator. With both acceptances the contract becomes active. */
  function acceptContract(p, uid) {
    assertCorporate(p);
    return tx(async (c) => {
      const row = await one(c, `SELECT ${COLUMNS} ${FROM} WHERE b.unique_id = $1 AND b.corporate_uid = $2 AND b.unit_type = 'ohc' FOR UPDATE OF b`, [uid, p.corporateUid]);
      if (!row) throw notFound('OHC');
      if (row.contract_status === 'ended') throw conflict('contract_ended', 'This contract has ended');
      await c.query(
        `UPDATE hospital_branch SET accepted_by_corporate_at = COALESCE(accepted_by_corporate_at, now()),
                contract_status = CASE WHEN accepted_by_operator_at IS NOT NULL THEN 'active' ELSE contract_status END, updated_at = now() WHERE id = $1`, [row.id]);
      const fresh = await one(c, `SELECT ${COLUMNS} ${FROM} WHERE b.id = $1`, [row.id]);
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action) VALUES ($1, 'corporate', $2, 'contract.accept')`, [uid, p.ref]);
      return { status: 200, body: { unit: projectUnit(fresh) } };
    });
  }

  /** Either party can end the contract. The OHC stops working at once (staff lose access: ohc.service re-checks the unit on every request). */
  function endContract(p, uid, input) {
    const b = v.exactly(v.body(input), 'body', ['reason']);
    const reason = v.str(b.reason, 'reason', { max: 300 });
    return tx(async (c) => {
      let row;
      if (p.type === 'operator') row = await one(c, `SELECT ${COLUMNS} ${FROM} WHERE b.unique_id = $1 AND b.owner_uid = $2 AND b.unit_type = 'ohc' FOR UPDATE OF b`, [uid, p.ownerUid]);
      else if (p.type === 'corporate') row = await one(c, `SELECT ${COLUMNS} ${FROM} WHERE b.unique_id = $1 AND b.corporate_uid = $2 AND b.unit_type = 'ohc' FOR UPDATE OF b`, [uid, p.corporateUid]);
      if (!row) throw notFound('OHC');
      if (row.contract_status === 'ended') return { status: 200, body: { unit: projectUnit(row), replayed: true } };
      await c.query(`UPDATE hospital_branch SET contract_status = 'ended', is_active = false, contract_end = COALESCE(contract_end, CURRENT_DATE), updated_at = now() WHERE id = $1`, [row.id]);
      await c.query(`UPDATE staff_branch_assignment SET is_active = false WHERE branch_id = $1`, [row.id]);
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action, subject) VALUES ($1, $2, $3, 'contract.end', $4)`, [uid, p.type, p.ref, reason]);
      return { status: 200, body: { unit: projectUnit(await one(c, `SELECT ${COLUMNS} ${FROM} WHERE b.id = $1`, [row.id])) } };
    });
  }

  // ── corporate view ────────────────────────────────────────────────────────
  /** The OHCs that serve this corporate, with their operator and the numbers a corporate admin looks at. */
  async function corporateUnits(p) {
    assertCorporate(p);
    const { rows } = await pool.query(
      `SELECT ${COLUMNS}, o.name AS operator_name,
              (SELECT count(*)::int FROM staff_branch_assignment s WHERE s.branch_id = b.id AND s.is_active) AS staff_count,
              (SELECT count(*)::int FROM fitness_certificates f WHERE f.issued_by_unit_uid = b.unique_id) AS certificates,
              (SELECT count(*)::int FROM fitness_certificates f WHERE f.issued_by_unit_uid = b.unique_id AND f.created_at > now() - interval '30 days') AS certificates_30d
         ${FROM} LEFT JOIN tenants o ON o.unique_id = b.owner_uid
        WHERE b.corporate_uid = $1 AND b.unit_type = 'ohc' ORDER BY b.name`, [p.corporateUid]);
    return { units: rows.map((r) => ({ ...projectUnit(r), operatorName: r.operator_name, staffCount: r.staff_count, certificates: r.certificates, certificates30d: r.certificates_30d })) };
  }

  /** Everything the corporate may see of one OHC: unit, contract, services, the staff linked to it, and the certificates it issued. Every read is logged. */
  async function corporateUnitDashboard(p, uid) {
    assertCorporate(p);
    if (!UNIT_UID.test(String(uid))) throw notFound('OHC');
    const c = await pool.connect();
    try {
      const row = await one(c, `SELECT ${COLUMNS}, o.name AS operator_name ${FROM} LEFT JOIN tenants o ON o.unique_id = b.owner_uid WHERE b.unique_id = $1 AND b.corporate_uid = $2 AND b.unit_type = 'ohc'`, [uid, p.corporateUid]);
      if (!row) throw notFound('OHC');
      const staff = (await c.query(
        `SELECT u."firstName", u."lastName", u.unique_id, s.role, s.is_active FROM staff_branch_assignment s JOIN users u ON u.id = s.user_id
          WHERE s.branch_id = $1 ORDER BY s.role, u."firstName"`, [row.id])).rows;
      const certs = (await c.query(
        `SELECT id, patient_name, employee_id, certificate_type, fitness_status, restrictions, valid_from, valid_until, examination_date, issued_by, doctor_reg_no, remarks, created_at
           FROM fitness_certificates WHERE issued_by_unit_uid = $1 ORDER BY created_at DESC LIMIT 100`, [uid])).rows;
      const stats = (await c.query(
        `SELECT count(*)::int total, count(*) FILTER (WHERE created_at > now() - interval '30 days')::int last_30d,
                count(*) FILTER (WHERE fitness_status ILIKE 'fit')::int fit,
                count(*) FILTER (WHERE fitness_status ILIKE '%restrict%' OR fitness_status ILIKE '%conditional%')::int restricted,
                count(*) FILTER (WHERE fitness_status ILIKE 'unfit' OR fitness_status ILIKE 'not fit%')::int unfit
           FROM fitness_certificates WHERE issued_by_unit_uid = $1`, [uid])).rows[0];
      await c.query(`INSERT INTO ohc_access_log (unit_uid, actor_kind, actor_ref, action) VALUES ($1, 'corporate', $2, 'dashboard.read')`, [uid, p.ref]);
      return {
        unit: { ...projectUnit(row), operatorName: row.operator_name },
        staff: staff.map((s) => ({ uid: s.unique_id, name: `${s.firstName || ''} ${s.lastName || ''}`.trim(), role: s.role, active: s.is_active })),
        services: row.services || [], stats,
        certificates: certs.map((x) => ({
          id: x.id, patientName: x.patient_name, employeeId: x.employee_id, type: x.certificate_type, fitnessStatus: x.fitness_status, restrictions: x.restrictions,
          validFrom: x.valid_from, validUntil: x.valid_until, examinationDate: x.examination_date, issuedBy: x.issued_by, doctorRegNo: x.doctor_reg_no, remarks: x.remarks, issuedAt: x.created_at,
        })),
      };
    } finally { c.release(); }
  }

  async function accessLog(p, uid, { limit = 100 } = {}) {
    const lim = v.int(limit, 'limit', { min: 1, max: 500 });
    const where = p.type === 'corporate' ? 'b.corporate_uid = $2' : 'b.owner_uid = $2';
    const key = p.type === 'corporate' ? p.corporateUid : p.ownerUid;
    const { rows } = await pool.query(
      `SELECT l.actor_kind, l.actor_ref, l.action, l.subject, l.at FROM ohc_access_log l JOIN hospital_branch b ON b.unique_id = l.unit_uid
        WHERE l.unit_uid = $1 AND ${where} ORDER BY l.at DESC LIMIT ${lim}`, [uid, key]);
    return { entries: rows.map((r) => ({ actorKind: r.actor_kind, actor: r.actor_ref, action: r.action, subject: r.subject, at: r.at })) };
  }

  return { list, get, createUnit, updateUnit, listStaff, assignStaff, removeStaff, acceptContract, endContract, corporateUnits, corporateUnitDashboard, accessLog };
}
