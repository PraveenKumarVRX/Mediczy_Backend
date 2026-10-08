// Checks for migrations/20261008000000-care-units.sql — database invariants first (direct SQL, so they hold for every writer), then the
// operator service and routers against the migrated schema. Runs inside the checked runner's rolled-back transaction.
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { createCareUnitService } from '../../../services/care-units/care-unit.service.js';
import { buildCareUnitsRouter } from '../../../routes/care-units/care-units.router.js';
import { buildCorporateOhcRouter } from '../../../routes/care-units/corporate-ohc.router.js';

const CLINIC = 'KT5EUW';      // SmartHealth Clinic (tenants 3)
const HOSPITAL = 'HLH9CT';    // Smart Hospital (tenants 11)
const CORP = 'CAF030';        // Test Corporate Ltd (corporates #3, active, no employees)
const CORP2 = 'C9TV9Y';       // Equitas Bank Ltd (corporates #5, active, no employees)
const HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

export async function behaviour({ q, ok, bad, expectError, fillInsert }) {
  const check = (n, c, d = '') => (c ? ok(n, d) : bad(n, d));
  let sp = 0; const stack = [];
  const client = { async query(sql, params) {
    if (sql === 'BEGIN') { const n = `cu_${++sp}`; stack.push(n); return q(`SAVEPOINT ${n}`); }
    if (sql === 'COMMIT') return q(`RELEASE SAVEPOINT ${stack.pop()}`);
    if (sql === 'ROLLBACK') { const n = stack.pop(); await q(`ROLLBACK TO SAVEPOINT ${n}`); return q(`RELEASE SAVEPOINT ${n}`); }
    return q(sql, params); }, release() {} };
  const pool = { query: (s, p) => q(s, p), connect: async () => client };
  const svc = createCareUnitService({ pool });
  const opClinic = { type: 'operator', ownerUid: CLINIC, ref: 'operator:clinic' };
  const opHospital = { type: 'operator', ownerUid: HOSPITAL, ref: 'operator:hospital' };
  const corp = { type: 'corporate', corporateUid: CORP, ref: 'corporate:testcorp' };
  const corp2 = { type: 'corporate', corporateUid: CORP2, ref: 'corporate:equitas' };
  const tid = async (uid) => Number((await q(`SELECT source_id FROM entity_registry WHERE uid = $1`, [uid])).rows[0].source_id);
  const insertUnit = (o) => q(
    `INSERT INTO hospital_branch (organization_id, owner_uid, unit_type, name, parent_unit_id, visit_pattern, brand_name, co_owner_uid, ownership, corporate_uid, contract_status, initiated_by, accepted_by_corporate_at, accepted_by_operator_at)
     VALUES ((SELECT source_id FROM entity_registry WHERE uid = $1), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, unique_id`,
    [o.owner ?? CLINIC, o.type, o.name ?? `u-${crypto.randomUUID().slice(0, 8)}`, o.parent ?? null, o.visit ?? null, o.brand ?? null, o.coOwner ?? null, o.ownership ?? null,
      o.corp ?? null, o.status ?? null, o.initiatedBy ?? null, o.accC ?? null, o.accO ?? null]).then((r) => r.rows[0]);

  console.log('  the database refuses what the rules forbid (direct SQL):');
  const outreach = await insertUnit({ type: 'outreach_clinic', visit: 'weekly' });
  const medical = await insertUnit({ type: 'medical_centre', brand: 'Corp1-SmartHealth Care', coOwner: CORP });
  check('units get a DB-issued uid with the J prefix, registered as kind care_unit', /^J[A-Z0-9]{5}$/.test(outreach.unique_id)
    && (await q(`SELECT kind FROM entity_registry WHERE uid = $1`, [outreach.unique_id])).rows[0].kind === 'care_unit', outreach.unique_id);
  const med = (await q(`SELECT ownership FROM hospital_branch WHERE id = $1`, [medical.id])).rows[0];
  check('a medical centre is co-owned by definition', med.ownership === 'co_owned');
  await expectError('a unit cannot be owned by a corporate', '23514', () => insertUnit({ owner: CORP, type: 'branch' }));
  await expectError('an outreach clinic needs a visit pattern', '23502', () => insertUnit({ type: 'outreach_clinic' }));
  await expectError('a medical centre needs a brand name', '23502', () => insertUnit({ type: 'medical_centre', coOwner: CORP }));
  await expectError('a medical centre needs a co-owner', '23502', () => insertUnit({ type: 'medical_centre', brand: 'X' }));
  await expectError('the co-owner cannot be the operator itself', '23514', () => insertUnit({ type: 'medical_centre', brand: 'X', coOwner: CLINIC }));
  await expectError('a branch is 100% owned (co_owned refused)', '23514', () => insertUnit({ type: 'branch', ownership: 'co_owned' }));
  await expectError('a visit pattern belongs to an outreach clinic only', '23514', () => insertUnit({ type: 'branch', visit: 'daily' }));
  await expectError('an OHC needs a parent', '23514', () => insertUnit({ type: 'ohc', corp: CORP, status: 'proposed', initiatedBy: 'operator' }));
  const plainBranch = await insertUnit({ type: 'branch' });
  await expectError('an OHC cannot hang under a plain branch', '23514', () => insertUnit({ type: 'ohc', parent: plainBranch.id, corp: CORP, status: 'proposed', initiatedBy: 'operator' }));
  await expectError('an OHC needs its corporate', '23502', () => insertUnit({ type: 'ohc', parent: outreach.id, status: 'proposed', initiatedBy: 'operator' }));
  await expectError('an OHC\'s corporate must be a corporate (a hospital is refused)', '23514', () => insertUnit({ type: 'ohc', parent: outreach.id, corp: HOSPITAL, status: 'proposed', initiatedBy: 'operator' }));
  await expectError('an OHC\'s corporate must be the company record, not its hosting corporate TENANT (CXFXJC)', '23514', () => insertUnit({ type: 'ohc', parent: outreach.id, corp: 'CXFXJC', status: 'proposed', initiatedBy: 'operator' }));
  await expectError('an OHC records who initiated it', '23502', () => insertUnit({ type: 'ohc', parent: outreach.id, corp: CORP, status: 'proposed' }));
  await expectError('a unit and its parent must have the same operator', '23514', () => insertUnit({ owner: HOSPITAL, type: 'ohc', parent: outreach.id, corp: CORP, status: 'proposed', initiatedBy: 'operator' }));
  await expectError('a contract cannot be active before BOTH sides accepted', '23514', () => insertUnit({ type: 'ohc', parent: outreach.id, corp: CORP, status: 'active', initiatedBy: 'corporate', accO: new Date() }));
  await expectError('corporate fields belong to an OHC only', '23514', () => insertUnit({ type: 'branch', corp: CORP }));
  const ohc = await insertUnit({ type: 'ohc', parent: outreach.id, corp: CORP, status: 'proposed', initiatedBy: 'corporate', accO: new Date() });
  await expectError('one proposed/active OHC per corporate per parent', '23505', () => insertUnit({ type: 'ohc', parent: outreach.id, corp: CORP, status: 'proposed', initiatedBy: 'operator' }));
  const ohc2 = await insertUnit({ type: 'ohc', parent: medical.id, corp: CORP, status: 'proposed', initiatedBy: 'operator' });
  check('the same corporate can have another OHC under a different parent', Boolean(ohc2.unique_id));
  await expectError('a unit\'s type cannot change', '23514', () => q(`UPDATE hospital_branch SET unit_type = 'branch', parent_unit_id = NULL WHERE id = $1`, [ohc.id]));
  await expectError('an OHC\'s corporate cannot change', '23514', () => q(`UPDATE hospital_branch SET corporate_uid = $2 WHERE id = $1`, [ohc.id, CORP2]));
  const hospitalTenantId = await tid(HOSPITAL);
  await expectError('a unit\'s operator cannot change', '23514', () => q(`UPDATE hospital_branch SET owner_uid = $2, organization_id = $3 WHERE id = $1`, [outreach.id, HOSPITAL, hospitalTenantId]));
  await expectError('a unit\'s uid is immutable', null, () => q(`UPDATE hospital_branch SET unique_id = 'JAAAAAA' WHERE id = $1`, [outreach.id]));
  // the legacy writer (hospital-branch.service.createBranch) keeps working and is derived correctly
  const legacy = (await q(`INSERT INTO hospital_branch (organization_id, name, address, is_main) VALUES ($1, 'Legacy main', 'x', true) RETURNING owner_uid, unit_type, unique_id`, [await tid(HOSPITAL)])).rows[0];
  check('the legacy createBranch insert still works: owner_uid derived, type main, J uid', legacy.owner_uid === HOSPITAL && legacy.unit_type === 'main' && /^J/.test(legacy.unique_id), JSON.stringify(legacy));

  console.log('\n  staff ↔ unit invariants:');
  const mkUser = (role, org, orgType, extra = {}) => fillInsert('users', { role, organization_uid: org, organization_type: orgType, organization_id: 0, email: `${role}.${crypto.randomUUID().slice(0, 6)}@probe.invalid`, username: `u_${crypto.randomUUID().slice(0, 8)}`, password: HASH, status: 'active', ...extra });
  await expectError('an OHC role cannot belong to a corporate', '23514', () => mkUser('ohc_doctor', CORP, 'corporate'));
  await expectError('an OHC role needs an organisation', '23502', () => mkUser('ohc_staff', null, 'clinic'));
  const doc = await mkUser('ohc_doctor', CLINIC, 'clinic');
  const nurse = await mkUser('ohc_staff', CLINIC, 'clinic');
  const hospStaff = await mkUser('ohc_staff', HOSPITAL, 'hospital');
  const plainDoctor = await mkUser('doctor', CLINIC, 'clinic');
  const assign = (user, unit, role) => q(`INSERT INTO staff_branch_assignment (user_id, branch_id, role, is_active) VALUES ($1, $2, $3, true)`, [user.id, unit.id, role]);
  await assign(doc, ohc, 'ohc_doctor'); ok('an OHC doctor of the operator can be assigned to its OHC');
  await expectError('an OHC doctor cannot be assigned to a non-OHC unit', '23514', () => assign(doc, outreach, 'ohc_doctor'));
  await expectError('a plain doctor cannot be assigned to an OHC', '23514', () => assign(plainDoctor, ohc, 'doctor'));
  await expectError('the assignment role must equal the user role', '23514', () => assign(nurse, ohc, 'ohc_doctor'));
  await expectError('staff of ANOTHER operator cannot be assigned', '23514', () => assign(hospStaff, ohc, 'ohc_staff'));

  console.log('\n  operator service:');
  const created = await svc.createUnit(opClinic, { type: 'outreach_clinic', name: 'Probe Outreach (service)', visitPattern: 'monthly', city: 'Chennai', services: ['Pre-employment checkup', 'Vaccination'] });
  const outUid = created.body.unit.uid;
  check('createUnit: an outreach clinic is created with a J uid, owner and visit pattern', created.status === 201 && /^J/.test(outUid) && created.body.unit.visitPattern === 'monthly' && created.body.unit.ownerUid === CLINIC);
  const fails = async (n, fn, status, code) => { try { await fn(); bad(n, 'did not fail'); } catch (e) { check(n, e.status === status && (!code || e.code === code), `${e.status}/${e.code}: ${String(e.message).slice(0, 100)}`); } };
  await fails('createUnit: unknown fields are refused', () => svc.createUnit(opClinic, { type: 'branch', name: 'x1', owner: HOSPITAL }), 422, 'validation_failed');
  await fails('createUnit: an OHC under a plain branch is a 422 from the database invariant', () => svc.createUnit(opClinic, { type: 'ohc', name: 'bad ohc', parentUid: plainBranch.unique_id, corporateUid: CORP }), 422);
  await fails('createUnit: a parent of ANOTHER operator looks absent', () => svc.createUnit(opHospital, { type: 'ohc', name: 'sneaky', parentUid: outUid, corporateUid: CORP }), 404, 'not_found');
  await fails('a corporate cannot create units', () => svc.createUnit(corp, { type: 'branch', name: 'nope' }), 403, 'forbidden');
  const o = await svc.createUnit(opClinic, { type: 'ohc', name: 'Corp1 Jamnagar OHC', parentUid: outUid, corporateUid: CORP, initiatedBy: 'corporate', contractRef: 'RIL-OHC-2026-01', contractStart: '2026-10-01' });
  const ohcUid = o.body.unit.uid;
  check('createUnit: an OHC starts with a proposed contract, accepted by the operator only', o.body.unit.contract.status === 'proposed' && o.body.unit.contract.acceptedByOperatorAt && !o.body.unit.contract.acceptedByCorporateAt && o.body.unit.corporateUid === CORP);
  await fails('createUnit: a second OHC for the same corporate under the same parent is a conflict', () => svc.createUnit(opClinic, { type: 'ohc', name: 'dup', parentUid: outUid, corporateUid: CORP }), 409);
  const lst = await svc.list(opClinic, {});
  check('list: only this operator\'s units, ordered by type, with child and staff counts', lst.units.every((u) => u.ownerUid === CLINIC) && lst.units.some((u) => u.uid === ohcUid) && lst.units.find((u) => u.uid === outUid).childCount === 1);
  const lstH = await svc.list(opHospital, {});
  check('list: another operator sees none of them', !lstH.units.some((u) => u.uid === outUid || u.uid === ohcUid));
  await fails('get: another operator\'s unit is 404', () => svc.get(opHospital, ohcUid), 404, 'not_found');
  const upd = await svc.updateUnit(opClinic, ohcUid, { name: 'Corp1 Jamnagar OHC (renamed)', services: ['Fitness certificates', 'Periodic medical exam'], contractEnd: '2027-09-30' });
  check('updateUnit: name, services and contract end change', upd.body.unit.name.endsWith('(renamed)') && upd.body.unit.services.length === 2 && upd.body.unit.contract.end === '2027-09-30');
  await fails('updateUnit: the type cannot be changed through the API', () => svc.updateUnit(opClinic, ohcUid, { type: 'branch' }), 422, 'validation_failed');
  await fails('updateUnit: contract fields on a non-OHC are refused', () => svc.updateUnit(opClinic, outUid, { contractRef: 'x' }), 422);
  await fails('updateUnit: another operator cannot edit it', () => svc.updateUnit(opHospital, ohcUid, { name: 'hijack' }), 404);

  const asg = await svc.assignStaff(opClinic, ohcUid, { userUid: doc.unique_id, role: 'ohc_doctor', registrationNumber: 'TN-12345' });
  check('assignStaff: an OHC doctor is assigned and their registration number stored', asg.status === 201 && (await q(`SELECT metadata->>'registrationNumber' r FROM users WHERE id = $1`, [doc.id])).rows[0].r === 'TN-12345');
  await fails('assignStaff: staff of another operator look absent', () => svc.assignStaff(opClinic, ohcUid, { userUid: hospStaff.unique_id, role: 'ohc_staff' }), 404, 'not_found');
  await fails('assignStaff: a registration number belongs to an OHC doctor', () => svc.assignStaff(opClinic, ohcUid, { userUid: nurse.unique_id, role: 'ohc_staff', registrationNumber: 'x' }), 422);
  await svc.assignStaff(opClinic, ohcUid, { userUid: nurse.unique_id, role: 'ohc_staff' });
  const staff = await svc.listStaff(opClinic, ohcUid);
  check('listStaff: both assigned, with roles', staff.staff.length === 2 && staff.staff.some((s) => s.role === 'ohc_doctor'));
  const rm = await svc.removeStaff(opClinic, ohcUid, nurse.unique_id);
  check('removeStaff: deactivates the assignment', rm.body.removed === true && (await svc.listStaff(opClinic, ohcUid)).staff.find((s) => s.role === 'ohc_staff').active === false);

  console.log('\n  contract and the corporate\'s view:');
  await fails('acceptContract: another corporate cannot accept it', () => svc.acceptContract(corp2, ohcUid), 404, 'not_found');
  await fails('acceptContract: the operator cannot accept on the corporate\'s behalf', () => svc.acceptContract(opClinic, ohcUid), 403, 'forbidden');
  const acc = await svc.acceptContract(corp, ohcUid);
  check('acceptContract: with both acceptances the contract is active', acc.body.unit.contract.status === 'active' && acc.body.unit.contract.acceptedByCorporateAt);
  const cu = await svc.corporateUnits(corp);
  check('corporateUnits: the corporate sees ITS OHCs with operator name and counts', cu.units.some((u) => u.uid === ohcUid && u.operatorName && u.staffCount >= 1));
  check('corporateUnits: another corporate sees none of them', !(await svc.corporateUnits(corp2)).units.some((u) => u.uid === ohcUid));
  const dash = await svc.corporateUnitDashboard(corp, ohcUid);
  check('corporateUnitDashboard: unit, contract, services and linked staff', dash.unit.uid === ohcUid && dash.services.length === 2 && dash.staff.length >= 1 && dash.stats.total === 0);
  await fails('corporateUnitDashboard: another corporate gets 404', () => svc.corporateUnitDashboard(corp2, ohcUid), 404, 'not_found');
  const log = await svc.accessLog(corp, ohcUid, {});
  check('every corporate read is in the access log (contract accept, dashboard read)', log.entries.some((e) => e.action === 'contract.accept') && log.entries.some((e) => e.action === 'dashboard.read'));
  await expectError('the access log is append-only', '55000', () => q(`DELETE FROM ohc_access_log WHERE unit_uid = $1`, [ohcUid]));
  const end = await svc.endContract(opClinic, ohcUid, { reason: 'Contract not renewed' });
  check('endContract: ended, inactive, staff deactivated', end.body.unit.contract.status === 'ended' && end.body.unit.active === false
    && (await svc.listStaff(opClinic, ohcUid)).staff.every((s) => s.active === false));
  const again = await svc.endContract(corp, ohcUid, { reason: 'again' });
  check('endContract: ending twice is a replay, not an error', again.body.replayed === true);
  await fails('acceptContract: an ended contract cannot be accepted', () => svc.acceptContract(corp, ohcUid), 409, 'contract_ended');

  console.log('\n  HTTP:');
  const app = express(); app.use(express.json());
  app.use('/api/care-units', buildCareUnitsRouter({ service: svc, authenticate: (req, res, next) => { req.operator = opClinic; next(); } }));
  app.use('/api/corporate/ohc-units', buildCorporateOhcRouter({
    service: svc, authenticate: (req, res, next) => { req.user = { role: req.get('X-Test-Role') || 'corporate_admin' }; next(); },
    resolvePrincipal: async () => corp }));
  let r = await request(app).get('/api/care-units');
  check('GET /api/care-units → the operator\'s units', r.status === 200 && r.body.units.some((u) => u.uid === outUid));
  r = await request(app).post('/api/care-units').send({ type: 'outreach_clinic', name: 'HTTP outreach', visitPattern: 'daily' });
  check('POST /api/care-units → 201', r.status === 201 && r.body.unit.type === 'outreach_clinic');
  r = await request(app).post('/api/care-units').send({ type: 'outreach_clinic', name: 'bad' });
  check('POST without a visit pattern → 422 with the reason', r.status === 422 && /visit pattern/i.test(r.body.message), r.body.message);
  r = await request(app).get('/api/care-units/not-a-uid');
  check('a malformed uid → 404, never a SQL error', r.status === 404);
  r = await request(app).get('/api/corporate/ohc-units');
  check('GET /api/corporate/ohc-units → the corporate\'s OHCs', r.status === 200 && Array.isArray(r.body.units));
  r = await request(app).get('/api/corporate/ohc-units').set('X-Test-Role', 'hr_staff');
  check('hr_staff of the corporate cannot see OHC data (403)', r.status === 403);
  r = await request(app).post(`/api/corporate/ohc-units/${ohcUid}/accept`).set('X-Test-Role', 'corporate_cmo');
  check('a CMO can read but not accept/end a contract (403)', r.status === 403);
}

export async function leak({ q }) {
  const n = async (s) => Number((await q(s)).rows[0].n);
  return {
    probe_units: await n(`SELECT count(*) n FROM hospital_branch WHERE name ~ '^(u-|Probe Outreach|Corp1 Jamnagar|HTTP outreach|Legacy main)'`),
    probe_users: await n(`SELECT count(*) n FROM users WHERE email LIKE '%@probe.invalid'`),
    registry_units: await n(`SELECT count(*) n FROM entity_registry WHERE kind = 'care_unit' AND source_table = 'hospital_branch' AND retired_at IS NULL AND source_id NOT IN (SELECT id FROM hospital_branch)`),
    access_log: await n(`SELECT count(*) n FROM ohc_access_log`).catch(() => 0),
  };
}

export async function state({ q, ok, bad }) {
  const kind = (await q(`SELECT prefix, is_org FROM entity_kinds WHERE kind = 'care_unit'`)).rows[0];
  kind && kind.prefix === 'J' && kind.is_org === true ? ok('entity kind care_unit = J (organisation-like)') : bad('kind', JSON.stringify(kind));
  const rule = (await q(`SELECT kind, strict FROM entity_uid_rules WHERE table_name = 'hospital_branch'`)).rows[0];
  rule && rule.kind === 'care_unit' ? ok('hospital_branch is under the entity uid rule') : bad('rule', JSON.stringify(rule));
  const { ENTITY_KIND_PREFIXES } = await import('../../../utils/uniqueIdGenerator.js');
  ENTITY_KIND_PREFIXES.care_unit === 'J' ? ok('code and database agree on the care_unit prefix') : bad('prefix drift');
  const copied = (await q(`SELECT count(*)::int n FROM hospital_branch`)).rows[0].n;
  const eligible = (await q(`SELECT count(*)::int n FROM hospital_branches b JOIN entity_registry r ON r.uid = b.hospital_uid AND r.source_table = 'tenants' AND r.kind IN ('hospital','clinic')`)).rows[0].n;
  copied === eligible ? ok(`the ${eligible} legacy hospital_branches rows with a hospital/clinic owner were copied (${4 - eligible} left behind: their owner is not a hospital or clinic)`) : bad('copied rows', `${copied} vs ${eligible}`);
  const nouid = (await q(`SELECT count(*)::int n FROM hospital_branch WHERE unique_id IS NULL OR owner_uid IS NULL`)).rows[0].n;
  nouid === 0 ? ok('every unit has its uid and owner uid') : bad('units without uid', nouid);
}
