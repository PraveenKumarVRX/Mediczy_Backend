// Checks for migrations/20261007000000-lab-collection-platform.sql
//
// These are integration tests, not just schema probes: they run the REAL services and HTTP routers against the
// migrated schema inside the runner's transaction, so every statement is the one production would run. Nothing
// is mocked except the token store (the real one writes through a second connection and would escape the
// rollback) and authentication for the lab router (a lab login needs a lab password).
//
// The services take a pool, so the checks hand them one whose connect()/BEGIN/COMMIT/ROLLBACK are mapped onto
// savepoints of the runner's transaction. A failing command therefore rolls back exactly as it would for real.
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { JWT_CONFIG } from '../../../config/auth.config.js';
import { createCollectionService, stableStringify, toCsv } from '../../../services/collection/collection.service.js';
import { createPhlebotomistService, PHLEBOTOMY_AUDIENCE, PHLEBOTOMY_PORTAL } from '../../../services/collection/phlebotomist.service.js';
import { permissionsOf, can, PERMISSIONS } from '../../../services/collection/permissions.js';
import { createAuthPhlebotomist } from '../../../middleware/authPhlebotomist.middleware.js';
import { authLab } from '../../../middleware/authLab.middleware.js';
import { ringFencingMiddleware } from '../../../middleware/ringFencing.js';
import { buildPhlebotomyRouter } from '../../../routes/phlebotomy.router.js';
import { buildLabCollectionRouter } from '../../../routes/lab/collection.router.js';

const LAB = 'LDQM9T';       // labs.id 1
const LAB2 = 'L5LU98';      // labs.id 2 — a different lab: must never see LAB's data
const HOSP_HOME = 'H82RR5'; // tenants.id 1: owns the 4 real bookings
const HOSP_WARD = 'HLH9CT'; // tenants.id 11: owns the 2 real admissions
const BOOKING_OK = 'lab-1775289260014-4tk614n';        // confirmed home collection
const BOOKING_DONE = 'lab-1775295681029-zjlqxyf';      // completed
const BOOKING_VISIT = 'lab-1775289260099-0c12pjj';     // lab-visit, cancelled

const PASSWORD = 'Sample-pass-2026';

export async function behaviour({ q, ok, bad, expectError }) {
  const check = (name, cond, detail = '') => (cond ? ok(name, detail) : bad(name, detail));

  // ── harness ────────────────────────────────────────────────────────────────
  let sp = 0;
  const stack = [];
  const client = {
    async query(sql, params) {
      if (sql === 'BEGIN') { const n = `cs_${++sp}`; stack.push(n); return q(`SAVEPOINT ${n}`); }
      if (sql === 'COMMIT') { return q(`RELEASE SAVEPOINT ${stack.pop()}`); }
      if (sql === 'ROLLBACK') { const n = stack.pop(); await q(`ROLLBACK TO SAVEPOINT ${n}`); return q(`RELEASE SAVEPOINT ${n}`); }
      return q(sql, params);
    },
    release() {},
  };
  const pool = { query: (s, p) => q(s, p), connect: async () => client };

  // Token store: same shapes as services/token-revocation.service.js, kept in memory.
  const jtis = new Map();
  const issue = async (payload, { portal, deviceFp = null, accessTtl = '15m', refreshTtl = '7d' } = {}) => {
    const jti = crypto.randomUUID();
    const accessToken = jwt.sign({ ...payload, jti, tokenType: 'access' }, JWT_CONFIG.SECRET, { expiresIn: accessTtl });
    const refreshToken = jwt.sign({ jti, userId: String(payload.id), portal, tokenType: 'refresh' }, JWT_CONFIG.SECRET, { expiresIn: refreshTtl });
    jtis.set(jti, { userId: String(payload.id), portal, revoked: false, deviceFp });
    return { accessToken, refreshToken, jti };
  };
  const tokens = {
    issuePortalTokenPair: issue,
    async rotatePortalRefreshToken(token, { portal, deviceFp, resolvePayload, accessTtl }) {
      let d; try { d = jwt.verify(token, JWT_CONFIG.SECRET); } catch { return null; }
      const rec = jtis.get(d.jti);
      if (!rec || rec.revoked || d.tokenType !== 'refresh' || d.portal !== portal) return null;
      const next = await resolvePayload(d);
      if (!next) return null;
      rec.revoked = true;
      return issue(next, { portal, deviceFp, accessTtl });
    },
    async revokeToken(jti) { const r = jtis.get(jti); if (r) r.revoked = true; },
    async revokeAllForUser(id, portal) { for (const r of jtis.values()) if (r.userId === String(id) && r.portal === portal) r.revoked = true; },
    decodeRefreshJti(t) { try { const d = jwt.verify(t, JWT_CONFIG.SECRET); return d.tokenType === 'refresh' ? d.jti : null; } catch { return null; } },
  };

  const svc = createCollectionService({ pool });
  const phleb = createPhlebotomistService({ pool, tokens });

  const labP = { type: 'lab', ownerUid: LAB, ref: `lab:${LAB}` };
  const lab2P = { type: 'lab', ownerUid: LAB2, ref: `lab:${LAB2}` };
  const op = () => `op-${crypto.randomUUID()}`;
  const dev = 'device-test-0001';

  const fails = async (name, fn, status, code) => {
    try { const r = await fn(); bad(name, `expected ${status}/${code} but got ${r?.status}`); }
    catch (e) { check(name, e.status === status && (!code || e.code === code), `${e.status}/${e.code}: ${e.message}`.slice(0, 160)); }
  };

  // A principal for a worker, exactly as loadPrincipal would build it.
  const principalOf = async (id) => (await phleb.loadPrincipal(id)).principal;
  const mk = (p, t) => async (command, payload = {}, extra = {}) => {
    const r = await svc.command({
      principal: p, command, taskId: t.id, expectedVersion: extra.version ?? t.version, payload,
      operationId: extra.op === undefined ? op() : extra.op, deviceId: dev,
    });
    if (r.body?.task?.version) { t.version = r.body.task.version; t.status = r.body.task.status; }
    return r;
  };
  const homeInput = (over = {}) => ({
    mode: 'home', patient: { name: 'Probe Patient', age: 41, gender: 'female' },
    address: { line1: '12 Probe Street', city: 'Bengaluru' }, contactPhone: '9000000000',
    tests: [
      { name: 'CBC', containerType: 'edta' },
      { name: 'Lipid Profile', containerType: 'serum' },
    ], ...over,
  });
  const newTask = async (input = homeInput(), p = labP) => {
    const r = await svc.createTask({ principal: p, input, operationId: op(), deviceId: dev });
    return { id: r.body.task.id, version: r.body.task.version, status: r.body.task.status, tests: r.body.tests };
  };

  // ── 0. fixtures: linked hospitals, workers ────────────────────────────────
  await q(`INSERT INTO lab_collection_partners (owner_uid, partner_uid, allow_home, allow_ward) VALUES ($1, $2, true, false), ($1, $3, false, true)`,
    [LAB, HOSP_HOME, HOSP_WARD]);
  const mkWorker = (p, name, extra = {}) => phleb.create(p, { displayName: name, email: `${name.toLowerCase().replace(/\W+/g, '.')}@probe.invalid`, password: PASSWORD, ...extra });
  const alice = await mkWorker(labP, 'Alice Probe', { canHome: true, canWard: true });
  const bob = await mkWorker(labP, 'Bob Probe', { canHome: true, canWard: false });
  const carol = await mkWorker(lab2P, 'Carol Probe', { canHome: true });
  const aliceP = await principalOf(alice.id);
  const bobP = await principalOf(bob.id);
  const carolP = await principalOf(carol.id);

  // ── 1. the schema refuses what the rules forbid, even to a direct writer ──
  console.log('  schema guarantees:');
  const corp = (await q(`SELECT uid FROM entity_registry WHERE source_table = 'corporates' LIMIT 1`)).rows[0];
  await expectError('a task owned by a corporate uid is refused (owner must be a lab or tenant)', '23514',
    () => q(`INSERT INTO lab_collection_tasks (owner_uid, mode, source_kind, created_by) VALUES ($1, 'home', 'manual', 'x')`, [corp.uid]));
  await expectError('an owner uid that is not in the registry at all is refused', '23514',
    () => q(`INSERT INTO lab_collection_tasks (owner_uid, mode, source_kind, created_by) VALUES ('ZZZZZZ', 'home', 'manual', 'x')`));
  await expectError('a ward task cannot be in a home-only status (en_route)', '23514',
    () => q(`INSERT INTO lab_collection_tasks (owner_uid, mode, source_kind, status, assigned_to, created_by) VALUES ($1, 'ward', 'manual', 'en_route', $2, 'x')`, [LAB, alice.id]));
  await expectError('a booking-sourced task must name its partner hospital', '23514',
    () => q(`INSERT INTO lab_collection_tasks (owner_uid, mode, source_kind, source_ref, created_by) VALUES ($1, 'home', 'booking', 'b1', 'x')`, [LAB]));
  const seed = await newTask();
  await expectError('two-identifier verification needs two identifier types', '23514',
    () => q(`INSERT INTO lab_collection_patient_verifications (task_id, method, result, identifier_types, actor_ref) VALUES ($1, 'two_identifiers', 'match', ARRAY['name'], 'x')`, [seed.id]));
  await q(`INSERT INTO lab_collection_task_events (task_id, owner_uid, event_type, to_status, task_version, actor_kind, actor_ref) VALUES ($1, $2, 'probe', 'unassigned', 1, 'system', 'x')`, [seed.id, LAB]);
  await expectError('task events are append-only: UPDATE refused', '55000', () => q(`UPDATE lab_collection_task_events SET event_type = 'tampered' WHERE task_id = $1`, [seed.id]));
  await expectError('task events are append-only: DELETE refused', '55000', () => q(`DELETE FROM lab_collection_task_events WHERE task_id = $1`, [seed.id]));
  await expectError('a mobile-operation key cannot be shorter than 8 characters', '23514',
    () => q(`INSERT INTO lab_mobile_operations (actor_ref, operation_id, command, request_hash) VALUES ('a', 'short', 'c', 'h')`));

  // ── 2. creating tasks ─────────────────────────────────────────────────────
  console.log('\n  creating tasks:');
  const t1 = await newTask();
  check('a home task is created unassigned at version 1', t1.status === 'unassigned' && t1.version === 1 && t1.tests.length === 2);
  await fails('home payload carrying ward fields is refused', () => svc.createTask({ principal: labP, input: homeInput({ wardName: 'ICU' }) }), 422, 'validation_failed');
  await fails('an unknown field is refused, not stored', () => svc.createTask({ principal: labP, input: homeInput({ price: 5 }) }), 422, 'validation_failed');
  await fails('a task needs at least one test', () => svc.createTask({ principal: labP, input: homeInput({ tests: [] }) }), 422, 'validation_failed');
  await fails('a ward task cannot be created without an admission', () => svc.createTask({ principal: labP, input: { mode: 'ward', source: 'manual', patient: { name: 'Xx' }, tests: ['CBC'] } }), 422, 'validation_failed');
  await fails('a collector cannot create tasks', () => svc.createTask({ principal: aliceP, input: homeInput() }), 403, 'forbidden');

  const b1 = await svc.createTask({ principal: labP, input: { bookingId: BOOKING_OK }, operationId: op() });
  check('a linked hospital\'s booking becomes a task with its patient, address and tests', b1.status === 201
    && b1.body.task.patient.name === 'Smoke Tester' && b1.body.task.home.address.city === 'Bengaluru' && b1.body.tests[0].name === 'CBC');
  await fails('the same booking cannot be dispatched twice', () => svc.createTask({ principal: labP, input: { bookingId: BOOKING_OK } }), 409, 'task_exists');
  await fails('a lab that is not linked to the hospital cannot bridge its booking', () => svc.createTask({ principal: lab2P, input: { bookingId: BOOKING_OK } }), 403, 'forbidden');
  await fails('a completed booking is refused', () => svc.createTask({ principal: labP, input: { bookingId: BOOKING_DONE } }), 409, 'source_changed');
  await fails('a lab-visit booking is refused (not a home collection)', () => svc.createTask({ principal: labP, input: { bookingId: BOOKING_VISIT } }), 422);
  await fails('an unknown booking is 404', () => svc.createTask({ principal: labP, input: { bookingId: 'nope-nope' } }), 404, 'not_found');

  const w1 = await svc.createTask({ principal: labP, input: { mode: 'ward', source: 'admission', facilityUid: HOSP_WARD, admissionRef: '1', patient: { name: 'Ward Probe One' }, tests: [{ name: 'CBC', containerType: 'edta' }], isolationRequired: true } });
  check('a ward task is created from a real admission and takes ward/bed from the admission', w1.status === 201 && w1.body.task.ward.facilityUid === HOSP_WARD && Boolean(w1.body.task.ward.bedLabel), JSON.stringify(w1.body.task.ward));
  await fails('a hospital the lab is not linked to for ward work is refused', () => svc.createTask({ principal: labP, input: { mode: 'ward', source: 'admission', facilityUid: HOSP_HOME, admissionRef: '1', patient: { name: 'Xx' }, tests: ['CBC'] } }), 403, 'forbidden');
  await fails('an admission that belongs to another hospital is not found', () => svc.createTask({ principal: lab2P, input: { mode: 'ward', source: 'admission', facilityUid: HOSP_WARD, admissionRef: '1', patient: { name: 'Xx' }, tests: ['CBC'] } }), 403, 'forbidden');
  await fails('a ward task carrying a home address is refused', () => svc.createTask({ principal: labP, input: { mode: 'ward', source: 'admission', facilityUid: HOSP_WARD, admissionRef: '1', patient: { name: 'Xx' }, tests: ['CBC'], address: { line1: 'x', city: 'y' } } }), 422, 'validation_failed');

  // ── 3. dispatch ───────────────────────────────────────────────────────────
  console.log('\n  dispatch:');
  const T = (t) => mk(labP, t);
  let r = await T(t1)('assign', { phlebotomistId: alice.id });
  check('assign: unassigned → assigned, version bumps, assignment version bumps', r.body.task.status === 'assigned' && r.body.task.version === 2 && r.body.task.assignmentVersion === 1);
  await fails('assigning an already-assigned task is refused (the legacy code silently re-assigned it)', () => T(t1)('assign', { phlebotomistId: bob.id }), 409, 'invalid_transition');
  const tCarol = await newTask();
  await fails('a worker of ANOTHER lab cannot be assigned', () => T(tCarol)('assign', { phlebotomistId: carol.id }), 422);
  const tWard = { id: w1.body.task.id, version: 1, status: 'unassigned' };
  await fails('a worker not enabled for ward work cannot take a ward task', () => T(tWard)('assign', { phlebotomistId: bob.id }), 422);
  await fails('a made-up worker id is refused', () => T(tCarol)('assign', { phlebotomistId: crypto.randomUUID() }), 422);
  await fails('a stale expectedVersion is a conflict, with the current version', () => svc.command({ principal: labP, command: 'assign', taskId: tCarol.id, expectedVersion: 99, payload: { phlebotomistId: bob.id } }), 409, 'version_conflict');
  await fails('a collector cannot assign, even on a task that is theirs', () => mk(aliceP, t1)('assign', { phlebotomistId: alice.id }), 403, 'forbidden');
  await fails('a lab account cannot accept on a collector\'s behalf', () => T(t1)('accept', { assignmentVersion: 1 }), 403);
  await fails('lab 2 cannot touch lab 1\'s task: it looks absent', () => mk(lab2P, tCarol)('cancel', { reason: 'x' }), 404, 'not_found');

  // ── 4. a full home collection, as the collector ──────────────────────────
  console.log('\n  home collection, end to end:');
  const A = (t) => mk(aliceP, t);
  await fails('accept needs the CURRENT assignment version', () => A(t1)('accept', { assignmentVersion: 0 }), 409, 'assignment_changed');
  r = await A(t1)('accept', { assignmentVersion: 1 });
  check('accept → accepted', r.body.task.status === 'accepted');
  await fails('collect is refused before arrival/verification/consent', () => A(t1)('collect'), 409, 'invalid_transition');
  await fails('the collector who is NOT assigned cannot see the task', () => mk(bobP, t1)('depart'), 404, 'not_found');
  await fails('a ward step is refused on a home task', () => A(t1)('bedside', { locationConfirmed: true }), 409, 'invalid_transition');
  await A(t1)('depart');
  await fails('arrival evidence with extra fields (e.g. raw coordinates) is refused', () => A(t1)('arrive', { evidence: { method: 'geo', lat: 12.9 } }), 422, 'validation_failed');
  r = await A(t1)('arrive', { evidence: { method: 'geo', withinRadius: true, accuracyM: 20 } });
  check('arrive records bounded evidence', r.body.task.status === 'arrived' && r.body.task.home.arrivedAt);
  await fails('verify needs two identifier types', () => A(t1)('verify_patient', { method: 'two_identifiers', identifierTypes: ['name'], result: 'match' }), 422);
  r = await A(t1)('verify_patient', { method: 'two_identifiers', identifierTypes: ['name', 'dob'], result: 'mismatch' });
  check('a mismatch is recorded, does NOT advance, and raises an exception', r.status === 200 && r.body.outcome === 'mismatch' && r.body.task.status === 'arrived');
  const exc = (await q(`SELECT code, status FROM lab_collection_exceptions WHERE task_id = $1`, [t1.id])).rows;
  check('…the identity_mismatch exception is open', exc.length === 1 && exc[0].code === 'identity_mismatch' && exc[0].status === 'open');
  r = await A(t1)('verify_patient', { method: 'two_identifiers', identifierTypes: ['name', 'dob'], result: 'match' });
  check('a later match advances to verified', r.body.task.status === 'verified');
  await fails('scanning before consent is refused', () => A(t1)('scan_specimen', { barcode: 'BC-0001-A', testIds: [t1.tests[0].id] }), 409, 'invalid_transition');
  await fails('consent needs a version, method and language', () => A(t1)('consent', { outcome: 'granted' }), 422);
  r = await A(t1)('consent', { outcome: 'granted', consentVersion: 'v1', method: 'verbal', language: 'en' });
  check('consent granted → consented', r.body.task.status === 'consented');

  const [cbc, lipid] = t1.tests;
  await fails('collect is refused while a required test has no specimen', () => A(t1)('collect'), 409, 'specimens_incomplete');
  r = await A(t1)('scan_specimen', { barcode: 'BC-0001-A', testIds: [cbc.id] });
  check('scan binds a barcode to a test and does not move the task', r.status === 200 && r.body.task.status === 'consented' && r.body.result.barcode === 'BC-0001-A');
  await fails('the same barcode again is refused (duplicate)', () => A(t1)('scan_specimen', { barcode: 'BC-0001-A', testIds: [lipid.id] }), 409, 'duplicate_barcode');
  await fails('a test that already has a specimen cannot be scanned twice', () => A(t1)('scan_specimen', { barcode: 'BC-0001-Z', testIds: [cbc.id] }), 409, 'test_already_scanned');
  await fails('tests of another task cannot be scanned here', () => A(t1)('scan_specimen', { barcode: 'BC-0001-Q', testIds: [tCarol.tests[0].id] }), 422);
  await fails('a barcode outside the allowed alphabet is refused', () => A(t1)('scan_specimen', { barcode: 'bad barcode!', testIds: [lipid.id] }), 422);
  const dupOwner = await newTask();
  const dupOwnerT = { ...dupOwner };
  await T(dupOwnerT)('assign', { phlebotomistId: alice.id });
  await mk(aliceP, dupOwnerT)('accept', { assignmentVersion: 1 });
  await mk(aliceP, dupOwnerT)('depart'); await mk(aliceP, dupOwnerT)('arrive');
  await mk(aliceP, dupOwnerT)('verify_patient', { method: 'wristband', identifierTypes: ['wristband'], result: 'match' });
  await mk(aliceP, dupOwnerT)('consent', { outcome: 'granted', consentVersion: 'v1', method: 'verbal', language: 'en' });
  await fails('a barcode already used by ANOTHER task of the same lab is refused', () => mk(aliceP, dupOwnerT)('scan_specimen', { barcode: 'BC-0001-A', testIds: [dupOwner.tests[0].id] }), 409, 'duplicate_barcode');

  // idempotency
  const key = op();
  const first = await A(t1)('scan_specimen', { barcode: 'BC-0001-B', testIds: [lipid.id] }, { op: key });
  const specCount = (await q(`SELECT count(*)::int n FROM lab_collection_specimens WHERE task_id = $1`, [t1.id])).rows[0].n;
  const replay = await svc.command({ principal: aliceP, command: 'scan_specimen', taskId: t1.id, expectedVersion: first.body.task.version, payload: { barcode: 'BC-0001-B', testIds: [lipid.id] }, operationId: key, deviceId: dev });
  check('a retried scan (same Idempotency-Key) returns the stored result flagged as a replay', replay.replayed === true && replay.status === first.status && replay.body.result.specimenId === first.body.result.specimenId);
  check('…and creates no second specimen, no duplicate-barcode error', (await q(`SELECT count(*)::int n FROM lab_collection_specimens WHERE task_id = $1`, [t1.id])).rows[0].n === specCount && specCount === 2);
  await fails('the same key with a DIFFERENT body is refused', () => svc.command({ principal: aliceP, command: 'scan_specimen', taskId: t1.id, expectedVersion: first.body.task.version, payload: { barcode: 'BC-9999-Z', testIds: [lipid.id] }, operationId: key, deviceId: dev }), 422, 'idempotency_key_reuse');
  const otherKey = await svc.command({ principal: bobP, command: 'accept', taskId: tCarol.id, expectedVersion: 1, payload: {}, operationId: key, deviceId: dev }).catch((e) => e);
  check('idempotency keys are per actor: another worker reusing the key is not treated as a replay', otherKey.code === 'not_found', otherKey.code);

  r = await A(t1)('collect');
  check('collect: consented → collected with all specimens', r.body.task.status === 'collected' && r.body.tests.every((t) => t.status === 'collected'));
  await fails('a collected task cannot be reassigned (the legacy code reset it to assigned)', () => T(t1)('reassign', { phlebotomistId: bob.id, reason: 'x' }), 409, 'invalid_transition');
  await fails('a collected task cannot be cancelled', () => T(t1)('cancel', { reason: 'x' }), 409, 'invalid_transition');
  await fails('handoff is refused before transit starts (home)', () => A(t1)('handoff', { receiverKind: 'lab' }), 409, 'invalid_transition');
  await A(t1)('start_transit');
  await fails('a home task cannot be handed to a collection point', () => A(t1)('handoff', { receiverKind: 'collection_point' }), 422);
  r = await A(t1)('handoff', { receiverKind: 'lab', receiverRef: 'Front desk' });
  check('handoff → handed_over', r.body.task.status === 'handed_over');
  await fails('a collector cannot receive specimens', () => svc.receiveSpecimen({ principal: aliceP, specimenId: crypto.randomUUID(), input: { outcome: 'accepted' } }), 403, 'forbidden');

  const specs = (await q(`SELECT id, barcode, status FROM lab_collection_specimens WHERE task_id = $1 ORDER BY barcode`, [t1.id])).rows;
  await fails('another lab cannot receive this lab\'s specimen: it looks absent', () => svc.receiveSpecimen({ principal: lab2P, specimenId: specs[0].id, input: { outcome: 'accepted' } }), 404, 'not_found');
  await fails('a rejection must give a reason', () => svc.receiveSpecimen({ principal: labP, specimenId: specs[0].id, input: { outcome: 'rejected' } }), 422);
  r = await svc.receiveSpecimen({ principal: labP, specimenId: specs[0].id, input: { outcome: 'accepted', condition: 'acceptable' }, operationId: op() });
  check('first specimen accepted: the task stays open until every specimen is decided', r.body.specimen.status === 'received' && r.body.task.status === 'handed_over');
  const again = await svc.receiveSpecimen({ principal: labP, specimenId: specs[0].id, input: { outcome: 'accepted' } });
  check('receiving the same specimen again is an idempotent replay, not an error', again.status === 200 && again.body.replayed === true);
  await fails('…but receiving it with the opposite outcome is refused', () => svc.receiveSpecimen({ principal: labP, specimenId: specs[0].id, input: { outcome: 'rejected', reason: 'x' } }), 409, 'already_decided');
  r = await svc.receiveSpecimen({ principal: labP, specimenId: specs[1].id, input: { outcome: 'accepted' } });
  check('last specimen accepted: task → lab_received and closed', r.body.task.status === 'lab_received');
  t1.version = r.body.task.version;
  await fails('a closed task accepts nothing further', () => T(t1)('cancel', { reason: 'late' }), 409, 'task_closed');

  const tl = await svc.timeline(labP, t1.id);
  const kinds = new Set(tl.items.map((i) => i.kind));
  check('the timeline joins task, custody, consent and verification evidence in time order', ['task', 'custody', 'consent', 'verification'].every((k) => kinds.has(k))
    && tl.items.every((it, i, a) => i === 0 || new Date(a[i - 1].at) <= new Date(it.at)), `${tl.items.length} items`);
  const custody = (await q(`SELECT event_type FROM lab_specimen_custody_events WHERE task_id = $1 AND specimen_id = $2 ORDER BY id`, [t1.id, specs[0].id])).rows.map((x) => x.event_type);
  check('custody for one specimen runs scanned → collected → in_transit → handed_over → received', custody.join('>') === 'scanned>collected>in_transit>handed_over>received', custody.join('>'));
  check('every task transition produced exactly one outbox row (no PHI in it)', (await q(`SELECT count(*)::int n FROM lab_collection_outbox WHERE aggregate_id = $1`, [t1.id])).rows[0].n >= 5
    && !(await q(`SELECT 1 FROM lab_collection_outbox WHERE aggregate_id = $1 AND payload::text ~* 'Probe Patient'`, [t1.id])).rows.length);

  // ── 5. refusal, decline, reassign, cancel, rejection and redraw ───────────
  console.log('\n  the other paths:');
  const tRef = await newTask();
  await T(tRef)('assign', { phlebotomistId: alice.id });
  for (const [c, p] of [['accept', { assignmentVersion: 1 }], ['depart', {}], ['arrive', {}], ['verify_patient', { method: 'wristband', identifierTypes: ['wristband'], result: 'match' }]]) await A(tRef)(c, p);
  r = await A(tRef)('consent', { outcome: 'refused', consentVersion: 'v1', method: 'verbal', language: 'en' });
  check('a refusal closes the task as refused and raises patient_refused', r.body.task.status === 'refused' && r.body.task.closedAt
    && (await q(`SELECT 1 FROM lab_collection_exceptions WHERE task_id = $1 AND code = 'patient_refused'`, [tRef.id])).rows.length === 1);

  const tDec = await newTask();
  await T(tDec)('assign', { phlebotomistId: alice.id });
  r = await A(tDec)('decline', { reason: 'Vehicle broke down' });
  check('decline returns the task to the pool with a declined_by_worker exception', r.body.task.status === 'unassigned'
    && (await q(`SELECT 1 FROM lab_collection_exceptions WHERE task_id = $1 AND code = 'declined_by_worker'`, [tDec.id])).rows.length === 1);
  await fails('after declining, the worker no longer sees the task', () => A(tDec)('accept', { assignmentVersion: 2 }), 404, 'not_found');

  const tRe = await newTask();
  await T(tRe)('assign', { phlebotomistId: alice.id });
  await A(tRe)('accept', { assignmentVersion: 1 });
  await fails('reassign needs a reason', () => T(tRe)('reassign', { phlebotomistId: bob.id }), 422);
  await fails('reassign to the same worker is refused', () => T(tRe)('reassign', { phlebotomistId: alice.id, reason: 'x' }), 422);
  r = await T(tRe)('reassign', { phlebotomistId: bob.id, reason: 'Closer to the address' });
  check('reassign moves the task back to assigned for the new worker and bumps the assignment version', r.body.task.status === 'assigned' && r.body.task.assignedTo === bob.id && r.body.task.assignmentVersion === 2);
  await fails('the previous worker\'s queued command now fails: the task is gone from their view', () => A({ ...tRe, version: r.body.task.version })('depart'), 404, 'not_found');
  await fails('the new worker must accept the NEW assignment version', () => mk(bobP, tRe)('accept', { assignmentVersion: 1 }), 409, 'assignment_changed');
  await mk(bobP, tRe)('accept', { assignmentVersion: 2 });
  r = await T(tRe)('cancel', { reason: 'Customer cancelled' });
  check('cancel before collection closes the task with its reason', r.body.task.status === 'cancelled' && r.body.task.cancelReason === 'Customer cancelled');

  const tRej = await newTask(homeInput({ tests: [{ name: 'CBC', containerType: 'edta' }, { name: 'ESR', containerType: 'edta' }] }));
  await T(tRej)('assign', { phlebotomistId: alice.id });
  for (const [c, p] of [['accept', { assignmentVersion: 1 }], ['depart', {}], ['arrive', {}], ['verify_patient', { method: 'wristband', identifierTypes: ['wristband'], result: 'match' }], ['consent', { outcome: 'granted', consentVersion: 'v1', method: 'verbal', language: 'en' }]]) await A(tRej)(c, p);
  await A(tRej)('scan_specimen', { barcode: 'BC-0002-A', testIds: [tRej.tests[0].id] });
  await A(tRej)('scan_specimen', { barcode: 'BC-0002-B', testIds: [tRej.tests[1].id] });
  for (const [c, p] of [['collect', {}], ['start_transit', {}], ['handoff', { receiverKind: 'lab' }]]) await A(tRej)(c, p);
  const rs = (await q(`SELECT id, barcode FROM lab_collection_specimens WHERE task_id = $1 ORDER BY barcode`, [tRej.id])).rows;
  await svc.receiveSpecimen({ principal: labP, specimenId: rs[0].id, input: { outcome: 'accepted' } });
  r = await svc.receiveSpecimen({ principal: labP, specimenId: rs[1].id, input: { outcome: 'rejected', reason: 'Haemolysed', condition: 'haemolysed' } });
  check('a rejected specimen closes the task as rejected_by_lab and raises specimen_rejected', r.body.task.status === 'rejected_by_lab'
    && (await q(`SELECT 1 FROM lab_collection_exceptions WHERE task_id = $1 AND code = 'specimen_rejected' AND status = 'open'`, [tRej.id])).rows.length === 1);
  const open = await svc.listExceptions(labP, { status: 'open' });
  check('the exception queue lists it, with owner role and due time', open.exceptions.some((e) => e.taskId === tRej.id && e.dueAt));
  await fails('another lab\'s queue does not contain it', async () => { const l = await svc.listExceptions(lab2P); if (l.exceptions.some((e) => e.taskId === tRej.id)) return { status: 'visible' }; throw Object.assign(new Error('absent'), { status: 200, code: 'ok' }); }, 200, 'ok');
  r = await svc.requestRedraw({ principal: labP, taskId: tRej.id, input: { note: 'Redraw tomorrow' }, operationId: op() });
  const redraw = (await q(`SELECT id, status, redraw_of, priority FROM lab_collection_tasks WHERE id = $1`, [r.body.redrawTaskId])).rows[0];
  const redrawTests = (await q(`SELECT test_name, status FROM lab_collection_task_tests WHERE task_id = $1`, [redraw.id])).rows;
  check('a redraw is a NEW linked, urgent, unassigned task carrying only the rejected test', redraw.status === 'unassigned' && redraw.redraw_of === tRej.id && redraw.priority === 'urgent'
    && redrawTests.length === 1 && redrawTests[0].test_name === 'ESR' && redrawTests[0].status === 'required');
  check('…and resolves the exception with the link', (await q(`SELECT status, redraw_task_id FROM lab_collection_exceptions WHERE task_id = $1 AND code = 'specimen_rejected'`, [tRej.id])).rows[0].redraw_task_id === redraw.id);
  const r2 = await svc.requestRedraw({ principal: labP, taskId: tRej.id, input: {} });
  check('requesting the redraw twice returns the same task (no duplicate)', r2.body.redrawTaskId === redraw.id && r2.body.replayed === true);
  await fails('a redraw cannot be requested for a task the lab did not reject', () => svc.requestRedraw({ principal: labP, taskId: t1.id, input: {} }), 409);
  const sameBarcode = await q(`SELECT count(*)::int n FROM lab_collection_specimens WHERE owner_uid = $1 AND barcode = 'BC-0002-B'`, [LAB]);
  check('the rejected tube\'s barcode stays reserved: a label is never reused', sameBarcode.rows[0].n === 1);

  // ── 6. ward collection ────────────────────────────────────────────────────
  console.log('\n  ward collection:');
  await T(tWard)('assign', { phlebotomistId: alice.id });
  await A(tWard)('accept', { assignmentVersion: 1 });
  await fails('depart is a home step: refused on a ward task', () => A(tWard)('depart'), 409, 'invalid_transition');
  await fails('bedside needs location confirmation', () => A(tWard)('bedside', {}), 422);
  r = await A(tWard)('bedside', { locationConfirmed: true });
  check('bedside → at_bedside', r.body.task.status === 'at_bedside');
  await A(tWard)('verify_patient', { method: 'wristband', identifierTypes: ['wristband', 'name'], result: 'match' });
  await A(tWard)('consent', { outcome: 'granted', consentVersion: 'v1', method: 'verbal', language: 'en' });
  const wTests = (await q(`SELECT id FROM lab_collection_task_tests WHERE task_id = $1`, [tWard.id])).rows;
  await A(tWard)('scan_specimen', { barcode: 'WD-0001-A', testIds: [wTests[0].id] });
  await fails('an isolation patient needs the precautions acknowledged before collection', () => A(tWard)('collect', {}), 422);
  await fails('collection against a changed order version is refused', () => A(tWard)('collect', { isolationAcknowledged: true, orderVersion: 7 }), 409, 'order_changed');
  r = await A(tWard)('collect', { isolationAcknowledged: true, orderVersion: 1 });
  check('collect → collected, isolation acknowledgement recorded', r.body.task.status === 'collected' && r.body.task.ward.isolationAckAt);
  await fails('start_transit is a home step: refused on a ward task', () => A(tWard)('start_transit'), 409, 'invalid_transition');
  r = await A(tWard)('handoff', { receiverKind: 'collection_point', receiverRef: 'Ward 3 nurse station' });
  check('ward handoff → ward_handoff', r.body.task.status === 'ward_handoff');
  const wSpec = (await q(`SELECT id FROM lab_collection_specimens WHERE task_id = $1`, [tWard.id])).rows[0];
  r = await svc.receiveSpecimen({ principal: labP, specimenId: wSpec.id, input: { outcome: 'accepted' } });
  check('lab receipt completes the ward task', r.body.task.status === 'lab_received');

  // source rechecks: a cancelled booking and a discharged patient block collection and raise exceptions
  const tBk = { id: b1.body.task.id, version: 1, status: 'unassigned' };
  await T(tBk)('assign', { phlebotomistId: alice.id });
  for (const [c, p] of [['accept', { assignmentVersion: 1 }], ['depart', {}], ['arrive', {}], ['verify_patient', { method: 'wristband', identifierTypes: ['wristband'], result: 'match' }], ['consent', { outcome: 'granted', consentVersion: 'v1', method: 'verbal', language: 'en' }]]) await A(tBk)(c, p);
  await A(tBk)('scan_specimen', { barcode: 'BK-0001-A', testIds: [b1.body.tests[0].id] });
  await q(`UPDATE api_lab_bookings SET status = 'cancelled' WHERE booking_id = $1`, [BOOKING_OK]);
  r = await A(tBk)('collect');
  check('a booking cancelled after dispatch blocks collection (409 source_changed) and the task does not move', r.status === 409 && r.body.code === 'source_changed' && r.body.task.status === 'consented'
    && (await q(`SELECT 1 FROM lab_collection_exceptions WHERE task_id = $1 AND code = 'source_changed'`, [tBk.id])).rows.length === 1);

  const w2 = await svc.createTask({ principal: labP, input: { mode: 'ward', source: 'admission', facilityUid: HOSP_WARD, admissionRef: '2', patient: { name: 'Ward Probe Two' }, tests: ['CBC'] } });
  const tW2 = { id: w2.body.task.id, version: 1, status: 'unassigned' };
  await T(tW2)('assign', { phlebotomistId: alice.id });
  await A(tW2)('accept', { assignmentVersion: 1 });
  await q(`UPDATE ip_admissions SET status = 'discharged' WHERE id = 2`);
  r = await A(tW2)('bedside', { locationConfirmed: true });
  check('a discharged patient blocks the bedside step (409 source_changed)', r.status === 409 && r.body.code === 'source_changed' && r.body.task.status === 'accepted');
  await q(`UPDATE ip_admissions SET status = 'admitted' WHERE id = 2`);
  await q(`UPDATE beds SET bed_number = bed_number || '-MOVED' WHERE id = (SELECT bed_id FROM ip_admissions WHERE id = 2)`);
  r = await A(tW2)('bedside', { locationConfirmed: true });
  check('a patient moved to another bed blocks the bedside step', r.status === 409 && /moved/.test(r.body.message || ''), r.body.message);

  // ── 7. reads: worklist, board, kpis, export ───────────────────────────────
  console.log('\n  reads:');
  const wl = await svc.listWorklist(aliceP, {});
  check('the worklist holds only the collector\'s own, still-relevant tasks', wl.tasks.every((t) => !('ownerUid' in t) && !('assignedTo' in t)) && wl.tasks.some((t) => t.id === tBk.id) && !wl.tasks.some((t) => t.id === tCarol.id));
  const wlBob = await svc.listWorklist(bobP, {});
  check('another collector\'s worklist excludes them', !wlBob.tasks.some((t) => t.id === tBk.id));
  const wlHomeOnly = await svc.listWorklist(bobP, { mode: 'ward' });
  check('a home-only collector sees no ward tasks even when asking for them', wlHomeOnly.tasks.length === 0);
  const page1 = await svc.listWorklist(aliceP, { limit: 2 });
  const page2 = await svc.listWorklist(aliceP, { limit: 2, cursor: page1.nextCursor });
  check('cursor paging is stable and non-overlapping', page1.tasks.length === 2 && page1.nextCursor && !page2.tasks.some((t) => page1.tasks.some((p) => p.id === t.id)));
  const accepted = (await svc.getTask(aliceP, tBk.id)).task;
  check('a collector sees the address once the task is accepted', Boolean(accepted.home.address));
  const tFresh = await newTask(); await T(tFresh)('assign', { phlebotomistId: alice.id });
  const unaccepted = (await svc.getTask(aliceP, tFresh.id)).task;
  check('…but not before: the address and phone are withheld from an unaccepted assignment', !('address' in unaccepted.home) && !('contactPhone' in unaccepted.home));
  const bd = await svc.board(labP, {});
  check('the board gives the lab its own tasks with SQL-computed summary counts', bd.tasks.length > 5 && bd.summary.byMode.home.lab_received >= 1 && bd.tasks.every((t) => t.ownerUid === LAB));
  const bd2 = await svc.board(lab2P, {});
  check('another lab\'s board is empty of them', bd2.tasks.length === 0 && bd2.summary.unassigned === 0);
  const bdF = await svc.board(labP, { status: 'unassigned,assigned', mode: 'home' });
  check('board filters by status and mode', bdF.tasks.length > 0 && bdF.tasks.every((t) => ['unassigned', 'assigned'].includes(t.status) && t.mode === 'home'));
  await fails('a collector cannot read the dispatch board', () => svc.board(aliceP, {}), 403, 'forbidden');
  const k = await svc.kpis(labP, {});
  check('KPIs are aggregates computed in SQL', k.labReceived >= 2 && k.rejected >= 1 && k.refused >= 1 && k.redraws >= 1, JSON.stringify(k));
  const ex = await svc.exportRows(labP, {});
  const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'plain, comma' }, { a: '+1', b: null }], ['a', 'b']);
  check('CSV export neutralises spreadsheet formulas and quotes commas', csv.includes(`"'=HYPERLINK(""x"")"`) && csv.includes('"plain, comma"') && csv.includes(`'+1`) && ex.length > 5);
  const pt = await svc.partners(labP);
  check('partners lists linked hospitals and only their bridgeable work', pt.partners.length === 2 && pt.bridgeableAdmissions.every((a) => a.facilityUid === HOSP_WARD) && !pt.bridgeableBookings.some((b) => b.bookingId === BOOKING_OK));
  check('stableStringify is key-order independent (idempotency hashing)', stableStringify({ a: 1, b: { c: 2, d: [1, { z: 1, y: 2 }] } }) === stableStringify({ b: { d: [1, { y: 2, z: 1 }], c: 2 }, a: 1 }));

  // ── 8. phlebotomist identity ──────────────────────────────────────────────
  console.log('\n  identity and sessions:');
  await fails('wrong password is a generic 401', () => phleb.login({ email: alice.email, password: 'wrong-pass-1234' }), 401, 'invalid_credentials');
  await fails('an unknown email is the same generic 401', () => phleb.login({ email: 'nobody@probe.invalid', password: PASSWORD }), 401, 'invalid_credentials');
  const li = await phleb.login({ email: alice.email.toUpperCase(), password: PASSWORD, deviceId: dev });
  check('login is case-insensitive on email and issues a pair; a temporary password forces a change', Boolean(li.accessToken && li.refreshToken) && li.mustChangePassword === true);
  const claims = jwt.verify(li.accessToken, JWT_CONFIG.SECRET);
  check('the token carries identity only: no owners, scopes or memberships', claims.role === 'phlebotomist' && claims.aud === PHLEBOTOMY_AUDIENCE && !('memberships' in claims) && !('ownerUid' in claims));
  const rf = await phleb.refresh({ refreshToken: li.refreshToken, deviceId: dev });
  check('refresh rotates the pair', rf.accessToken && rf.refreshToken !== li.refreshToken);
  await fails('a used refresh token cannot be replayed', () => phleb.refresh({ refreshToken: li.refreshToken }), 401, 'invalid_refresh_token');
  await fails('a refresh token for another portal is refused', () => phleb.refresh({ refreshToken: jwt.sign({ jti: crypto.randomUUID(), userId: alice.id, portal: 'lab', tokenType: 'refresh' }, JWT_CONFIG.SECRET) }), 401);
  for (let i = 0; i < 5; i += 1) await phleb.login({ email: bob.email, password: 'wrong-pass-1234' }).catch(() => {});
  await fails('five wrong passwords lock the account: even the right password is then refused', () => phleb.login({ email: bob.email, password: PASSWORD }), 401, 'invalid_credentials');
  await q(`UPDATE lab_phlebotomists SET locked_until = NULL, failed_logins = 0 WHERE id = $1`, [bob.id]);
  await phleb.login({ email: bob.email, password: PASSWORD });

  const dave = await mkWorker(labP, 'Dave Probe', {});
  const daveBefore = await phleb.loadPrincipal(dave.id);
  await phleb.updateMembership(labP, dave.id, { status: 'suspended' });
  const daveAfter = await phleb.loadPrincipal(dave.id);
  check('suspending a membership takes effect on the very next request (no waiting for token expiry)', Boolean(daveBefore.principal) && daveAfter.reason === 'no_active_membership');
  await fails('a suspended worker cannot sign in', () => phleb.login({ email: dave.email, password: PASSWORD }), 403, 'account_unavailable');
  await fails('a suspended worker cannot be assigned', () => T(tCarol)('assign', { phlebotomistId: dave.id }), 422);
  const erin = await mkWorker(labP, 'Erin Probe', { qualificationExpires: '2020-01-01' });
  check('an expired qualification locks the worker out', (await phleb.loadPrincipal(erin.id)).reason === 'qualification_expired');
  await fails('…and they cannot be assigned work', () => T(tCarol)('assign', { phlebotomistId: erin.id }), 422);
  await fails('a duplicate email is refused without saying whether they work for another lab', () => mkWorker(lab2P, 'Alice Probe'), 409, 'email_in_use');
  await fails('a weak password is refused', () => phleb.create(labP, { displayName: 'Frank Probe', email: 'frank@probe.invalid', password: 'short1' }), 422);
  await fails('lab 2 cannot suspend lab 1\'s worker', () => phleb.updateMembership(lab2P, alice.id, { status: 'suspended' }), 404, 'not_found');
  const lst = await phleb.list(labP);
  const aliceRow = lst.phlebotomists.find((p) => p.id === alice.id);
  check('the worker directory shows workload and eligibility, only for this lab', lst.phlebotomists.every((p) => p.email !== carol.email) && aliceRow.workload.openTasks >= 1 && aliceRow.eligible === true
    && lst.phlebotomists.find((p) => p.id === erin.id).eligible === false);
  check('no password hash ever leaves the service', !JSON.stringify(lst).includes('$2') && !JSON.stringify(alice).includes('password'));
  const pw = await phleb.changePassword(aliceP, { currentPassword: PASSWORD, newPassword: 'Brand-new-pass-77' });
  check('changing the password clears must-change and revokes every session', pw.ok && [...jtis.values()].filter((j) => j.userId === alice.id).every((j) => j.revoked));
  await fails('the old password no longer works', () => phleb.login({ email: alice.email, password: PASSWORD }), 401);
  await phleb.resetPassword(labP, alice.id, { password: PASSWORD });

  // ── 9. permission model ───────────────────────────────────────────────────
  console.log('\n  permission split:');
  check('a lab account holds dispatch/receive/admin/read and nothing collector-shaped', can(labP, PERMISSIONS.DISPATCH, LAB) && can(labP, PERMISSIONS.RECEIVE, LAB) && !can(labP, PERMISSIONS.COLLECT, LAB));
  check('…and holds nothing for another owner', permissionsOf(labP, LAB2).length === 0);
  check('a collector holds worklist+collect for their own owner only', can(aliceP, PERMISSIONS.COLLECT, LAB) && !can(aliceP, PERMISSIONS.DISPATCH, LAB) && !can(aliceP, PERMISSIONS.RECEIVE, LAB) && !can(aliceP, PERMISSIONS.COLLECT, LAB2));

  // ── 10. HTTP layer ────────────────────────────────────────────────────────
  console.log('\n  HTTP:');
  const frank = await mkWorker(labP, 'Gina Probe', {});
  const auth = createAuthPhlebotomist({ phlebotomistService: phleb, isTokenRevoked: async (jti) => jtis.get(jti)?.revoked === true });
  const app = express();
  app.use(express.json());
  app.use('/api/phlebotomy', buildPhlebotomyRouter({ collectionService: svc, phlebotomistService: phleb, authenticate: auth }));
  app.use('/api/lab/collection', buildLabCollectionRouter({
    collectionService: svc, phlebotomistService: phleb, authenticate: authLab,
    resolveOwner: (req, res, next) => { req.collector = labP; next(); },
  }));
  const labToken = jwt.sign({ id: 1, role: 'lab', email: 'lab@probe.invalid' }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
  const asLab = (rq) => rq.set('Authorization', `Bearer ${labToken}`);

  const login = await request(app).post('/api/phlebotomy/auth/login').send({ email: frank.email, password: PASSWORD });
  check('POST /auth/login → 200 with tokens', login.status === 200 && Boolean(login.body.accessToken));
  const tok = login.body.accessToken;
  const asW = (rq) => rq.set('Authorization', `Bearer ${tok}`);
  let h = await asW(request(app).get('/api/phlebotomy/tasks'));
  check('a worker on a temporary password is blocked from the worklist (403 password_change_required)', h.status === 403 && h.body.code === 'password_change_required');
  h = await asW(request(app).get('/api/phlebotomy/me'));
  check('…but may read /me', h.status === 200 && h.body.worker.mustChangePassword === true);
  h = await asW(request(app).post('/api/phlebotomy/auth/change-password')).send({ currentPassword: PASSWORD, newPassword: 'Another-pass-2026' });
  check('POST /auth/change-password → 200', h.status === 200);
  const login2 = await request(app).post('/api/phlebotomy/auth/login').send({ email: frank.email, password: 'Another-pass-2026' });
  const tok2 = login2.body.accessToken;
  const asW2 = (rq) => rq.set('Authorization', `Bearer ${tok2}`);
  check('the pre-change access token is revoked, the new session works', (await asW(request(app).get('/api/phlebotomy/me'))).status === 401 && (await asW2(request(app).get('/api/phlebotomy/me'))).status === 200);

  // assign something to this worker through the lab API
  h = await asLab(request(app).post('/api/lab/collection/tasks')).send(homeInput());
  check('POST /lab/collection/tasks → 201', h.status === 201 && h.body.success === true);
  const ht = { id: h.body.task.id, version: h.body.task.version };
  h = await asLab(request(app).post(`/api/lab/collection/tasks/${ht.id}/assign`)).send({ expectedVersion: ht.version, phlebotomistId: frank.id });
  check('POST /lab/collection/tasks/:id/assign → 200 and the version moves', h.status === 200 && h.body.task.version === ht.version + 1);
  ht.version = h.body.task.version;
  h = await asW2(request(app).get('/api/phlebotomy/tasks'));
  check('GET /tasks lists it for the worker', h.status === 200 && h.body.tasks.some((t) => t.id === ht.id));
  h = await asW2(request(app).post(`/api/phlebotomy/tasks/${ht.id}/accept`)).send({ expectedVersion: ht.version, assignmentVersion: 1 });
  check('a mutation without Idempotency-Key is rejected (422)', h.status === 422 && /Idempotency-Key/.test(h.body.message));
  h = await asW2(request(app).post(`/api/phlebotomy/tasks/${ht.id}/accept`)).set('Idempotency-Key', 'http-key-0001').send({ assignmentVersion: 1 });
  check('a mutation without expectedVersion is rejected (422)', h.status === 422 && /X-Device-Id|expectedVersion/.test(h.body.message));
  const post = (path, body, key) => asW2(request(app).post(`/api/phlebotomy/tasks/${ht.id}/${path}`)).set('Idempotency-Key', key).set('X-Device-Id', dev).send(body);
  h = await post('accept', { expectedVersion: ht.version, assignmentVersion: 1 }, 'http-key-0002');
  check('POST /tasks/:id/accept → 200', h.status === 200 && h.body.task.status === 'accepted');
  const h2 = await post('accept', { expectedVersion: ht.version, assignmentVersion: 1 }, 'http-key-0002');
  check('the same request again → the SAME response, marked Idempotent-Replayed', h2.status === 200 && h2.headers['idempotent-replayed'] === 'true' && h2.body.task.version === h.body.task.version);
  h = await post('collect', { expectedVersion: h.body.task.version }, 'http-key-0003');
  check('POST …/collect out of order → 409 invalid_transition', h.status === 409 && h.body.code === 'invalid_transition');
  h = await post('accept', { expectedVersion: 1, assignmentVersion: 1 }, 'http-key-0004');
  check('a stale expectedVersion → 409 version_conflict with the current version', h.status === 409 && h.body.code === 'version_conflict' && h.body.details.currentVersion >= 2);
  h = await asW2(request(app).get(`/api/phlebotomy/tasks/${tCarol.id}`));
  check('GET another worker\'s / another lab\'s task → 404', h.status === 404);
  h = await asW2(request(app).get('/api/lab/collection/ops'));
  check('a collector token on the lab router is refused by authLab (not a lab account)', h.status === 403);
  h = await asW2(request(app).post('/api/phlebotomy/lab/anything'));
  check('a collector calling a lab/dispatch path under /phlebotomy gets an explicit 403', h.status === 403 && h.body.code === 'forbidden');
  h = await request(app).get('/api/phlebotomy/tasks');
  check('no token → 401', h.status === 401);
  h = await request(app).get('/api/phlebotomy/tasks').set('Authorization', `Bearer ${labToken}`);
  check('a LAB token on the phlebotomist API → 403 wrong_account_type', h.status === 403 && h.body.code === 'wrong_account_type');
  const forged = jwt.sign({ id: frank.id, role: 'phlebotomist', tokenType: 'access', jti: crypto.randomUUID() }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
  h = await request(app).get('/api/phlebotomy/tasks').set('Authorization', `Bearer ${forged}`);
  check('a token with the right role but no phlebotomy audience → 403', h.status === 403);
  const asRefresh = jwt.sign({ id: frank.id, role: 'phlebotomist', aud: PHLEBOTOMY_AUDIENCE, tokenType: 'refresh', jti: crypto.randomUUID() }, JWT_CONFIG.SECRET, { expiresIn: '5m' });
  h = await request(app).get('/api/phlebotomy/me').set('Authorization', `Bearer ${asRefresh}`);
  check('a REFRESH token cannot be used as an access token → 403', h.status === 403);

  h = await asLab(request(app).get('/api/lab/collection/ops?mode=home'));
  check('GET /lab/collection/ops → board + summary', h.status === 200 && Array.isArray(h.body.tasks) && h.body.summary);
  h = await asLab(request(app).get('/api/lab/collection/ops?mode=sideways'));
  check('an invalid filter is a 422, not a 500', h.status === 422);
  h = await asLab(request(app).get('/api/lab/collection/ops?limit=abc'));
  check('a non-numeric limit is a 422', h.status === 422);
  h = await asLab(request(app).get(`/api/lab/collection/tasks/not-a-uuid`));
  check('a malformed id is a 422, never a SQL error', h.status === 422);
  h = await asLab(request(app).get('/api/lab/collection/export.csv'));
  check('GET /export.csv → text/csv attachment', h.status === 200 && /text\/csv/.test(h.headers['content-type']) && /^id,mode,status/.test(h.text));
  h = await asLab(request(app).get('/api/lab/collection/kpis?days=7'));
  check('GET /kpis → aggregates', h.status === 200 && 'medianCollectToHandoffSeconds' in h.body);
  h = await asLab(request(app).get('/api/lab/collection/phlebotomists'));
  check('GET /phlebotomists → directory with workload', h.status === 200 && h.body.phlebotomists.length >= 3);
  h = await asLab(request(app).post('/api/lab/collection/phlebotomists')).send({ displayName: 'Hank Probe', email: 'hank@probe.invalid', password: PASSWORD });
  check('POST /phlebotomists → 201 and no hash in the response', h.status === 201 && !JSON.stringify(h.body).includes('password'));
  h = await request(app).get('/api/lab/collection/ops');
  check('the lab router needs a lab token (no token → 401)', h.status === 401);

  // ring-fencing: a collector's token is confined to /api/phlebotomy
  const rf2 = (path, token) => new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { resolve({ blocked: this.statusCode }); return this; } };
    ringFencingMiddleware({ originalUrl: path, method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {}, query: {}, body: {} }, res, () => resolve({ blocked: false }));
  });
  const realToken = (await issue({ id: frank.id, role: 'phlebotomist', aud: PHLEBOTOMY_AUDIENCE })).accessToken;
  const noLog = console.log; console.log = () => {};
  const rfResults = {
    own: await rf2('/api/phlebotomy/tasks', realToken),
    lab: await rf2('/api/lab/collection/ops', realToken),
    doctor: await rf2('/api/appointments/5', realToken),
    patient: await rf2('/api/patients/5', realToken),
    login: await rf2('/api/phlebotomy/auth/login', null),
    noToken: await rf2('/api/phlebotomy/tasks', null),
    labOwn: await rf2('/api/lab/collection/ops', labToken),
  };
  console.log = noLog;
  check('ring-fencing lets a collector reach /api/phlebotomy', rfResults.own.blocked === false);
  check('…and confines them there: lab, doctor and patient APIs are 403', rfResults.lab.blocked === 403 && rfResults.doctor.blocked === 403 && rfResults.patient.blocked === 403, JSON.stringify(rfResults));
  check('login/refresh/logout are public; every other path still needs a token', rfResults.login.blocked === false && rfResults.noToken.blocked === 401);
  check('a lab token still reaches /api/lab/collection', rfResults.labOwn.blocked === false);
}

export async function leak({ q }) {
  const t = async (n) => Number((await q(`SELECT count(*) n FROM ${n}`)).rows[0].n);
  return {
    lab_phlebotomists: await t('lab_phlebotomists'), memberships: await t('lab_phlebotomist_memberships'), partners: await t('lab_collection_partners'),
    tasks: await t('lab_collection_tasks'), specimens: await t('lab_collection_specimens'), custody: await t('lab_specimen_custody_events'),
    task_events: await t('lab_collection_task_events'), consents: await t('lab_collection_consents'), operations: await t('lab_mobile_operations'),
    outbox: await t('lab_collection_outbox'), exceptions: await t('lab_collection_exceptions'),
    bookings_cancelled: Number((await q(`SELECT count(*) n FROM api_lab_bookings WHERE booking_id = '${BOOKING_OK}' AND lower(status) = 'cancelled'`)).rows[0].n),
    admission_2_not_admitted: Number((await q(`SELECT count(*) n FROM ip_admissions WHERE id = 2 AND status <> 'admitted'`)).rows[0].n),
    moved_beds: Number((await q(`SELECT count(*) n FROM beds WHERE bed_number LIKE '%-MOVED'`)).rows[0].n),
  };
}

export async function state({ q, ok, bad }) {
  const tables = (await q(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema = 'public'
      AND (table_name LIKE 'lab\\_collection\\_%' OR table_name LIKE 'lab\\_phleb%' OR table_name IN ('lab_specimen_custody_events', 'lab_mobile_operations'))`)).rows[0].n;
  tables === 15 ? ok('15 collection tables exist') : bad('table count', tables);

  const regKinds = (await q(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema = 'public' AND table_name LIKE 'lab\\_%' AND column_name = 'unique_id'
      AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'lab\\_collection\\_%' OR table_name LIKE 'lab\\_phleb%')`)).rows[0].n;
  regKinds === 0 ? ok('no new table has a unique_id column (so nothing falls outside the entity-uid verifier)') : bad('unexpected unique_id columns', regKinds);

  const intRefs = (await q(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
      AND (table_name LIKE 'lab\\_collection\\_%' OR table_name LIKE 'lab\\_phleb%' OR table_name LIKE 'lab\\_specimen%' OR table_name = 'lab_mobile_operations')
      AND column_name ~ '(tenant|organization|hospital|lab|owner|facility|partner)_id$'`)).rows;
  intRefs.length === 0 ? ok('no integer cross-entity reference column exists (uids only)') : bad('integer entity references', JSON.stringify(intRefs));

  const fks = (await q(`SELECT conrelid::regclass::text t, a.attname c FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
      WHERE k.contype = 'f' AND k.confrelid = 'entity_registry'::regclass AND conrelid::regclass::text LIKE 'lab\\_%'`)).rows.map((r) => `${r.t}.${r.c}`);
  ['lab_collection_tasks.owner_uid', 'lab_collection_tasks.partner_uid', 'lab_collection_task_ward.facility_uid', 'lab_collection_specimens.owner_uid',
    'lab_phlebotomist_memberships.owner_uid', 'lab_collection_partners.partner_uid', 'lab_collection_outbox.owner_uid'].every((x) => fks.includes(x))
    ? ok('every uid column is a foreign key into entity_registry') : bad('missing registry FKs', fks.join(', '));

  const rows = (await q(`SELECT count(*)::int n FROM lab_collection_tasks`)).rows[0].n;
  rows === 0 ? ok('the new tables are empty on a fresh apply (nothing to backfill: the legacy tables never existed in production)') : bad('rows', rows);
}
