// OHC workspace checks: staff login, the standing re-checks, employees, certificates, isolation, ring-fencing. Runs after care-units.checks.
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { JWT_CONFIG } from '../../../config/auth.config.js';
import { createCareUnitService } from '../../../services/care-units/care-unit.service.js';
import { createOhcService, OHC_AUDIENCE } from '../../../services/care-units/ohc.service.js';
import { createAuthOhc } from '../../../middleware/ohcAuth.middleware.js';
import { buildOhcWorkspaceRouter } from '../../../routes/care-units/ohc-workspace.router.js';
import { ringFencingMiddleware } from '../../../middleware/ringFencing.js';

const CLINIC = 'KT5EUW'; const HOSPITAL = 'HLH9CT'; const CORP = 'CAF030'; const CORP2 = 'C9TV9Y';
const PW = 'Ohc-demo-2026';

export async function behaviour({ q, ok, bad, expectError, fillInsert }) {
  const check = (n, c, d = '') => (c ? ok(n, d) : bad(n, d));
  let sp = 0; const stack = [];
  const client = { async query(sql, params) {
    if (sql === 'BEGIN') { const n = `ow_${++sp}`; stack.push(n); return q(`SAVEPOINT ${n}`); }
    if (sql === 'COMMIT') return q(`RELEASE SAVEPOINT ${stack.pop()}`);
    if (sql === 'ROLLBACK') { const n = stack.pop(); await q(`ROLLBACK TO SAVEPOINT ${n}`); return q(`RELEASE SAVEPOINT ${n}`); }
    return q(sql, params); }, release() {} };
  const pool = { query: (s, p) => q(s, p), connect: async () => client };
  const jtis = new Map();
  const issue = async (payload, { portal, accessTtl = '30m', refreshTtl = '7d' } = {}) => {
    const jti = crypto.randomUUID();
    const accessToken = jwt.sign({ ...payload, jti, tokenType: 'access' }, JWT_CONFIG.SECRET, { expiresIn: accessTtl });
    const refreshToken = jwt.sign({ jti, userId: String(payload.id), portal, tokenType: 'refresh' }, JWT_CONFIG.SECRET, { expiresIn: refreshTtl });
    jtis.set(jti, { userId: String(payload.id), portal, revoked: false }); return { accessToken, refreshToken, jti };
  };
  const tokens = { issuePortalTokenPair: issue,
    async rotatePortalRefreshToken(t, { portal, resolvePayload, accessTtl }) { let d; try { d = jwt.verify(t, JWT_CONFIG.SECRET); } catch { return null; }
      const r = jtis.get(d.jti); if (!r || r.revoked || d.portal !== portal) return null; const n = await resolvePayload(d); if (!n) return null; r.revoked = true; return issue(n, { portal, accessTtl }); },
    async revokeToken(jti) { const r = jtis.get(jti); if (r) r.revoked = true; }, async revokeAllForUser() {},
    decodeRefreshJti(t) { try { const d = jwt.verify(t, JWT_CONFIG.SECRET); return d.tokenType === 'refresh' ? d.jti : null; } catch { return null; } } };
  const units = createCareUnitService({ pool });
  const ohc = createOhcService({ pool, tokens });
  const opClinic = { type: 'operator', ownerUid: CLINIC, ref: 'operator:clinic' };
  const opHospital = { type: 'operator', ownerUid: HOSPITAL, ref: 'operator:hospital' };
  const corp = { type: 'corporate', corporateUid: CORP, ref: 'corporate:testcorp' };
  const corp2 = { type: 'corporate', corporateUid: CORP2, ref: 'corporate:equitas' };
  const fails = async (n, fn, status, code) => { try { await fn(); bad(n, 'did not fail'); } catch (e) { check(n, e.status === status && (!code || e.code === code), `${e.status}/${e.code}: ${String(e.message).slice(0, 90)}`); } };
  const hash = bcrypt.hashSync(PW, 4);
  const mkUser = (role, org, orgType, extra = {}) => fillInsert('users', { role, organization_uid: org, organization_type: orgType, organization_id: 0, firstName: extra.first || role, lastName: 'Probe', email: `${role}.${crypto.randomUUID().slice(0, 6)}@probe.invalid`, username: `u_${crypto.randomUUID().slice(0, 8)}`, password: hash, status: 'active', ...extra.cols });
  const corpId = async (uid) => Number((await q(`SELECT id FROM corporates WHERE unique_id = $1`, [uid])).rows[0].id);
  const mkEmployee = async (corpUid, name, empId) => {
    const u = await fillInsert('users', { role: 'user', firstName: name, lastName: 'Employee', email: `emp.${crypto.randomUUID().slice(0, 6)}@probe.invalid`, username: `e_${crypto.randomUUID().slice(0, 8)}`, password: hash, status: 'active' });
    await fillInsert('corporate_employees', { corporate_id: await corpId(corpUid), userId: u.id, employeeId: empId, isActive: true, department: 'Operations', designation: 'Operator' });
    return u;
  };

  // fixtures: clinic → outreach → OHC for Corp1; hospital → outreach → OHC for Corp2
  const out1 = (await units.createUnit(opClinic, { type: 'outreach_clinic', name: 'Probe Outreach A', visitPattern: 'daily' })).body.unit;
  const ohc1 = (await units.createUnit(opClinic, { type: 'ohc', name: 'Probe OHC Corp1', parentUid: out1.uid, corporateUid: CORP, initiatedBy: 'corporate' })).body.unit;
  const out2 = (await units.createUnit(opHospital, { type: 'outreach_clinic', name: 'Probe Outreach B', visitPattern: 'weekly' })).body.unit;
  const ohc2 = (await units.createUnit(opHospital, { type: 'ohc', name: 'Probe OHC Corp2', parentUid: out2.uid, corporateUid: CORP2, initiatedBy: 'operator' })).body.unit;
  const doc = await mkUser('ohc_doctor', CLINIC, 'clinic', { first: 'Dr Asha' });
  const noReg = await mkUser('ohc_doctor', CLINIC, 'clinic', { first: 'Dr NoReg' });
  const nurse = await mkUser('ohc_staff', CLINIC, 'clinic', { first: 'Nurse Bina' });
  const doc2 = await mkUser('ohc_doctor', HOSPITAL, 'hospital', { first: 'Dr Other' });
  const plain = await mkUser('doctor', CLINIC, 'clinic');
  await units.assignStaff(opClinic, ohc1.uid, { userUid: doc.unique_id, role: 'ohc_doctor', registrationNumber: 'TN-77001' });
  await units.assignStaff(opClinic, ohc1.uid, { userUid: noReg.unique_id, role: 'ohc_doctor' });
  await units.assignStaff(opClinic, ohc1.uid, { userUid: nurse.unique_id, role: 'ohc_staff' });
  await units.assignStaff(opHospital, ohc2.uid, { userUid: doc2.unique_id, role: 'ohc_doctor', registrationNumber: 'MH-5' });
  const empA = await mkEmployee(CORP, 'Anil', 'RIL-001');
  const empB = await mkEmployee(CORP, 'Bhavna', 'RIL-002');
  const empT = await mkEmployee(CORP2, 'Tarun', 'TAT-001');

  console.log('  sign-in and the standing checks:');
  const emailOf = async (u) => (await q(`SELECT email FROM users WHERE id = $1`, [u.id])).rows[0].email;
  await fails('an OHC whose contract is only PROPOSED cannot sign anyone in', async () => ohc.login({ email: await emailOf(doc), password: PW }), 403, 'account_unavailable');
  await units.acceptContract(corp, ohc1.uid); await units.acceptContract(corp2, ohc2.uid);
  const li = await ohc.login({ email: (await emailOf(doc)).toUpperCase(), password: PW, deviceId: 'dev-ohc-0001' });
  check('login (case-insensitive email) issues tokens, the worker and their unit', Boolean(li.accessToken && li.refreshToken) && li.worker.role === 'ohc_doctor' && li.units.length === 1 && li.units[0].corporateName);
  await fails('a wrong password is a generic 401', async () => ohc.login({ email: await emailOf(doc), password: 'nope-nope-1' }), 401, 'invalid_credentials');
  await fails('an unknown email is the same 401', () => ohc.login({ email: 'nobody@probe.invalid', password: PW }), 401, 'invalid_credentials');
  await fails('a plain doctor cannot use the OHC login', async () => ohc.login({ email: await emailOf(plain), password: PW }), 401, 'invalid_credentials');
  const claims = jwt.verify(li.accessToken, JWT_CONFIG.SECRET);
  check('the token carries identity only (uid, role, audience): no unit, no corporate', claims.aud === OHC_AUDIENCE && claims.id === doc.unique_id && !('units' in claims) && !('corporateUid' in claims));
  const rf = await ohc.refresh({ refreshToken: li.refreshToken });
  check('refresh rotates the pair', rf.accessToken && rf.refreshToken !== li.refreshToken);
  await fails('a used refresh token is refused', () => ohc.refresh({ refreshToken: li.refreshToken }), 401, 'invalid_refresh_token');

  const p = (await ohc.loadPrincipal(doc.unique_id)).principal;
  const pn = (await ohc.loadPrincipal(nurse.unique_id)).principal;
  const pnr = (await ohc.loadPrincipal(noReg.unique_id)).principal;
  const pd2 = (await ohc.loadPrincipal(doc2.unique_id)).principal;
  check('the principal is rebuilt from the database: role, registration, the assigned unit and its corporate', p.role === 'ohc_doctor' && p.registrationNumber === 'TN-77001' && p.units[0].uid === ohc1.uid && p.units[0].corporateUid === CORP);
  const me = ohc.me(p);
  check('me: canSign for a doctor with a registration number only', me.worker.canSign === true && ohc.me(pnr).worker.canSign === false && ohc.me(pn).worker.canSign === false);

  console.log('\n  employees:');
  const emps = await ohc.employees(p, {});
  check('employees: only the corporate the OHC serves (Corp1), none of Corp2\'s', emps.employees.length === 2 && emps.employees.every((e) => /^RIL-/.test(e.employeeId)) && !emps.employees.some((e) => e.id === empT.id), emps.employees.map((e) => e.employeeId).join(','));
  check('employees: search narrows', (await ohc.employees(p, { search: 'bhav' })).employees.length === 1);
  check('employees: no date of birth or contact details are exposed', !JSON.stringify(emps).match(/dateOfBirth|phone|email/i));
  const empsCorp2 = await ohc.employees(pd2, {});
  check('another OHC (Corp2) sees only its own corporate\'s employees', empsCorp2.employees.length === 1 && empsCorp2.employees[0].employeeId === 'TAT-001');
  await fails('naming a unit that is not yours looks absent', () => ohc.employees(p, { unit: ohc2.uid }), 404, 'not_found');

  console.log('\n  fitness certificates:');
  const body = { employeeUserId: empA.id, jobDescription: 'Crane operator', fitnessStatus: 'fit_with_restrictions', restrictions: 'No work at height', validFrom: '2026-10-08', validUntil: '2027-10-07', remarks: 'BP borderline, review in 6 months' };
  await fails('an OHC nurse cannot sign a certificate', () => ohc.issueCertificate(pn, body), 403, 'forbidden');
  await fails('a doctor with no registration number on file cannot sign', () => ohc.issueCertificate(pnr, body), 422, 'registration_missing');
  await fails('an employee of ANOTHER company looks absent', () => ohc.issueCertificate(p, { ...body, employeeUserId: empT.id }), 404, 'not_found');
  await fails('an unknown fitness status is refused', () => ohc.issueCertificate(p, { ...body, fitnessStatus: 'kinda' }), 422, 'validation_failed');
  await fails('unknown fields (e.g. a forged employer) are refused', () => ohc.issueCertificate(p, { ...body, organizationId: 1 }), 422, 'validation_failed');
  await fails('validUntil before validFrom is refused', () => ohc.issueCertificate(p, { ...body, validUntil: '2026-01-01' }), 422);
  const issued = await ohc.issueCertificate(p, body);
  const cert = issued.body.certificate;
  check('issue: 201, signed by the doctor with their registration number', issued.status === 201 && cert.doctor_reg_no === 'TN-77001' && cert.issued_by === p.displayName);
  check('issue: the employer is the OHC\'s corporate (by uid) and the issuing unit is recorded', cert.employer_uid === CORP && cert.issued_by_unit_uid === ohc1.uid && cert.employer_name);
  await expectError('the database refuses a certificate whose employer is not the OHC\'s corporate', '23514', async () => q(`INSERT INTO fitness_certificates (organization_id, patient_id, fitness_status, issued_by_unit_uid) VALUES ($1, $2, 'fit', $3)`, [await corpId(CORP2), empT.id, ohc1.uid]));
  await expectError('the database refuses a certificate "issued" by a non-OHC unit', '23514', async () => q(`INSERT INTO fitness_certificates (organization_id, patient_id, fitness_status, issued_by_unit_uid) VALUES ($1, $2, 'fit', $3)`, [await corpId(CORP), empA.id, out1.uid]));
  const mine = await ohc.certificates(p, {});
  check('the unit lists its own certificates', mine.certificates.length === 1 && mine.certificates[0].id === cert.id);
  check('a different OHC sees none of them', (await ohc.certificates(pd2, {})).certificates.length === 0);
  await fails('a different OHC cannot fetch the certificate by id', () => ohc.certificateById(pd2, cert.id), 404, 'not_found');
  check('the same unit can fetch it', (await ohc.certificateById(pn, cert.id)).id === cert.id);

  console.log('\n  what the corporate sees (D5):');
  const dash = await units.corporateUnitDashboard(corp, ohc1.uid);
  check('the corporate sees the certificate in full (status, restrictions, validity, remarks, doctor)', dash.certificates.length === 1 && dash.certificates[0].remarks.includes('BP borderline') && dash.certificates[0].restrictions === 'No work at height' && dash.certificates[0].doctorRegNo === 'TN-77001');
  check('…the stats count it as restricted', dash.stats.total === 1 && dash.stats.restricted === 1, JSON.stringify(dash.stats));
  check('…and the staff linked to the OHC, with roles', dash.staff.length === 3 && dash.staff.some((s) => s.role === 'ohc_doctor'));
  await fails('the other corporate cannot see Corp1\'s OHC', () => units.corporateUnitDashboard(corp2, ohc1.uid), 404, 'not_found');
  const log = await units.accessLog(corp, ohc1.uid, {});
  const opLog = await units.accessLog(opClinic, ohc1.uid, {});
  check('both parties can read the access log of the unit: the corporate\'s reads and the staff\'s certificate issue are in it', log.entries.some((e) => e.actorKind === 'corporate') && opLog.entries.some((e) => e.action === 'certificate.issue'));
  check('the other operator cannot read this unit\'s access log', (await units.accessLog(opHospital, ohc1.uid, {})).entries.length === 0);

  console.log('\n  HTTP and standing re-checks:');
  const isTokenRevoked = async (jti) => jtis.get(jti)?.revoked === true;
  const app = express(); app.use(express.json());
  app.use('/api/ohc-workspace', buildOhcWorkspaceRouter({ ohc, authenticate: createAuthOhc({ ohc, isTokenRevoked }) }));
  let r = await request(app).post('/api/ohc-workspace/auth/login').send({ email: await emailOf(doc), password: PW });
  const tok = r.body.accessToken;
  check('POST /auth/login → 200', r.status === 200 && Boolean(tok));
  const as = (rq) => rq.set('Authorization', `Bearer ${tok}`);
  r = await as(request(app).get('/api/ohc-workspace/me'));
  check('GET /me → worker, units, canSign', r.status === 200 && r.body.worker.canSign === true && r.body.units[0].uid === ohc1.uid);
  r = await as(request(app).get('/api/ohc-workspace/employees'));
  check('GET /employees → the corporate\'s employees', r.status === 200 && r.body.employees.length === 2);
  r = await as(request(app).post('/api/ohc-workspace/certificates')).send({ ...body, employeeUserId: empB.id, fitnessStatus: 'fit', restrictions: undefined });
  check('POST /certificates → 201', r.status === 201 && r.body.certificate.fitness_status === 'fit');
  r = await request(app).get('/api/ohc-workspace/me');
  check('no token → 401', r.status === 401);
  r = await request(app).get('/api/ohc-workspace/me').set('Authorization', `Bearer ${jwt.sign({ id: 1, role: 'lab' }, JWT_CONFIG.SECRET, { expiresIn: '5m' })}`);
  check('a lab token → 403 wrong_account_type', r.status === 403 && r.body.code === 'wrong_account_type');
  r = await request(app).get('/api/ohc-workspace/me').set('Authorization', `Bearer ${jwt.sign({ id: doc.unique_id, role: 'ohc_doctor', userType: 'ohc', tokenType: 'access', jti: crypto.randomUUID() }, JWT_CONFIG.SECRET, { expiresIn: '5m' })}`);
  check('a token with the right role but no OHC audience → 403', r.status === 403);
  await q(`UPDATE users SET status = 'suspended' WHERE id = $1`, [doc.id]);
  r = await as(request(app).get('/api/ohc-workspace/me'));
  check('suspending the user stops the very next request (403 account_unavailable)', r.status === 403 && r.body.code === 'account_unavailable');
  await q(`UPDATE users SET status = 'active' WHERE id = $1`, [doc.id]);
  r = await as(request(app).get('/api/ohc-workspace/me'));
  check('…and reinstating restores it', r.status === 200);
  await units.endContract(opClinic, ohc1.uid, { reason: 'Test: contract ended' });
  r = await as(request(app).get('/api/ohc-workspace/employees'));
  check('ending the contract cuts access immediately (403)', r.status === 403 && r.body.code === 'account_unavailable');

  console.log('\n  ring-fencing:');
  const rfCall = (path, token) => new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { resolve(this.statusCode); return this; } };
    ringFencingMiddleware({ originalUrl: path, method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {}, query: {}, body: {} }, res, () => resolve('next'));
  });
  const ohcTok = jwt.sign({ id: doc.unique_id, role: 'ohc_doctor', userType: 'ohc', aud: OHC_AUDIENCE, tokenType: 'access' }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
  const hospTok = jwt.sign({ id: 5, role: 'hospital_admin', userType: 'hospital' }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
  const clinTok = jwt.sign({ id: 6, role: 'clinic_admin', userType: 'clinic_admin' }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
  const corpTok = jwt.sign({ id: 7, role: 'corporate_admin', userType: 'corporate' }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
  const noLog = console.log; console.log = () => {};
  const rfs = {
    ohcOwn: await rfCall('/api/ohc-workspace/employees', ohcTok), ohcHosp: await rfCall('/api/hospital/patients', ohcTok), ohcUnits: await rfCall('/api/care-units', ohcTok),
    login: await rfCall('/api/ohc-workspace/auth/login', null), hospUnits: await rfCall('/api/care-units', hospTok), clinicUnits: await rfCall('/api/care-units', clinTok),
    corpUnits: await rfCall('/api/care-units', corpTok), corpOhc: await rfCall('/api/corporate/ohc-units', corpTok),
  };
  console.log = noLog;
  check('an OHC token reaches only /api/ohc-workspace (hospital and care-unit APIs are 403)', rfs.ohcOwn === 'next' && rfs.ohcHosp === 403 && rfs.ohcUnits === 403, JSON.stringify(rfs));
  check('OHC login/refresh/logout are public', rfs.login === 'next');
  check('hospital and clinic administrators reach /api/care-units; a corporate token does not', rfs.hospUnits === 'next' && rfs.clinicUnits === 'next' && rfs.corpUnits === 403, JSON.stringify(rfs));
  check('a corporate token reaches /api/corporate/ohc-units', rfs.corpOhc === 'next');
}

export async function state({ ok }) { ok('ohc workspace checks complete'); }
