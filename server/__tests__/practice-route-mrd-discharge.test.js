/**
 * hospital/practice router — the parts added by the audit remediation: the router's PRIVATE token check (SEC-01), MRD role
 * gates + audit (OPS-02), UHID assignment (OPS-03), discharge-summary gates + single survey invitation (CLN-06).
 * Real signed tokens, mocked services.
 */
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const mrd = { listMrdRecords: jest.fn(), createMrdRecord: jest.fn(), queueForDigitization: jest.fn(), assignUhid: jest.fn(), assignMissingUhids: jest.fn(), getMrdRecord: jest.fn() };
jest.unstable_mockModule('../utils/schema-guard.js', () => ({
  // This suite mocks every query as empty, which the schema probe would read as
  // "no tables". Schema verification is covered by schema-guard.test.js and the
  // per-area schema suites; here it is a cross-cutting concern, not the subject.
  schemaVerifier: () => async () => undefined,
  guardedQuery: (handle) => (...args) => handle.query(...args),
  schemaGuard: () => (e) => { throw e; },
  schemaError: (m) => Object.assign(new Error(m), { code: 'SCHEMA_NOT_MIGRATED', status: 503 }),
  isMissingSchema: () => false,
  tableNameFromSchemaRow: (r) => r?.tableName || r?.table_name || r?.[0] || null,
  SCHEMA_NOT_MIGRATED: 'SCHEMA_NOT_MIGRATED',
  default: {},
}));
jest.unstable_mockModule('../services/hospital-mrd.service.js', () => mrd);
const summaries = { saveSummary: jest.fn(), updateSummary: jest.fn(), assertScope: jest.fn() };
jest.unstable_mockModule('../services/discharge-summary.service.js', () => summaries);
const auditAction = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../utils/action-audit.js', () => ({ auditAction, default: { auditAction } }));
const seqQuery = jest.fn().mockResolvedValue([]);

// The real Sequelize instance (models must be defined at import); only its query() is replaced, so nothing reaches a database.
const { postgresSequelize } = await import('../db/postgres-sequelize.js');
postgresSequelize.query = seqQuery;
const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/hospital/practice.route.js');
const app = express();
app.use(express.json());
app.use('/api/hospital/practice', router);

const tok = (claims) => `Bearer ${jwt.sign({ userType: 'hospital', ...claims }, JWT_CONFIG.SECRET, { expiresIn: '5m' })}`;
const staff = (role, id = 42, org = 11) => tok({ id, role, tenant_id: org, organization_id: org });
const P = (p) => `/api/hospital/practice${p}`;
const isInvitationInsert = (c) => /INSERT INTO prems_survey_invitations/.test(c[0]);

beforeEach(() => { for (const m of [...Object.values(mrd), ...Object.values(summaries), auditAction, seqQuery]) m.mockReset?.(); auditAction.mockResolvedValue(undefined); seqQuery.mockResolvedValue([]); });

describe('the router\'s own token check (audit SEC-01)', () => {
  it('a staff token with no tenant claim is refused — it is not treated as "hospital = its user id"', async () => {
    const res = await request(app).get(P('/mrd/records')).set('authorization', tok({ id: 6203, role: 'ms' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(mrd.listMrdRecords).not.toHaveBeenCalled();
  });

  it('an organization_id / tenant_id claim resolves the hospital, as a NUMBER', async () => {
    mrd.listMrdRecords.mockResolvedValue([]);
    await request(app).get(P('/mrd/records?search=a&limit=5')).set('authorization', staff('nurse', 42, 11));
    expect(mrd.listMrdRecords).toHaveBeenCalledWith(11, { search: 'a', limit: '5' });
  });

  it('the legacy hospital account resolves to its own id', async () => {
    mrd.listMrdRecords.mockResolvedValue([]);
    await request(app).get(P('/mrd/records')).set('authorization', tok({ id: 30, role: 'hospital' }));
    expect(mrd.listMrdRecords.mock.calls[0][0]).toBe(30);
  });

  it('two hospitals get two different scopes for the same request', async () => {
    mrd.listMrdRecords.mockResolvedValue([]);
    await request(app).get(P('/mrd/records')).set('authorization', staff('nurse', 1, 11));
    await request(app).get(P('/mrd/records')).set('authorization', staff('nurse', 2, 22));
    expect(mrd.listMrdRecords.mock.calls.map((c) => c[0])).toEqual([11, 22]);
  });

  it('401 with no token; 403 for a role that is not a hospital role', async () => {
    expect((await request(app).get(P('/mrd/records'))).status).toBe(401);
    expect((await request(app).get(P('/mrd/records')).set('authorization', tok({ id: 1, role: 'patient', organization_id: 11, userType: 'user' }))).status).toBe(403);
  });
});

describe('MRD writes: role gate, attribution and audit (audit OPS-02)', () => {
  const rec = { id: 7, mrdNumber: 'MRD-2026-000007', patientId: 5, recordType: 'IPD' };

  it.each(['nurse', 'receptionist', 'billing', 'doctor'])('%s cannot index MRD records — 403 before the service', async (role) => {
    const res = await request(app).post(P('/mrd/records')).set('authorization', staff(role)).send({ uhid: 'U', recordType: 'IPD' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_NOT_PERMITTED');
    expect(mrd.createMrdRecord).not.toHaveBeenCalled();
    expect(auditAction).not.toHaveBeenCalled();
  });

  it.each(['mrd_staff', 'hospital_admin', 'ms'])('%s can, and the indexer is the REAL user id (it used to be recorded as null)', async (role) => {
    mrd.createMrdRecord.mockResolvedValueOnce(rec);
    const res = await request(app).post(P('/mrd/records')).set('authorization', staff(role, 77, 11)).send({ uhid: 'U1', recordType: 'IPD' });
    expect(res.status).toBe(201);
    expect(mrd.createMrdRecord).toHaveBeenCalledWith(11, { uhid: 'U1', recordType: 'IPD' }, 77);
  });

  it('writes an audit row naming the actor, the hospital and the record', async () => {
    mrd.createMrdRecord.mockResolvedValueOnce(rec);
    await request(app).post(P('/mrd/records')).set('authorization', staff('mrd_staff', 77, 11)).send({ uhid: 'U1', recordType: 'IPD' });
    expect(auditAction).toHaveBeenCalledWith(expect.objectContaining({ module: 'mrd', entityType: 'mrd_record', entityId: 7, action: 'index', actor: 77, organizationId: 11 }));
  });

  it('maps a service 404/400 to the same status and never leaks a database message', async () => {
    mrd.createMrdRecord.mockRejectedValueOnce(Object.assign(new Error('No patient with UHID X in this hospital'), { status: 404 }));
    expect((await request(app).post(P('/mrd/records')).set('authorization', staff('mrd_staff')).send({})).status).toBe(404);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mrd.createMrdRecord.mockRejectedValueOnce(Object.assign(new Error('relation "mrd_record_index" does not exist'), { name: 'SequelizeDatabaseError' }));
    const res = await request(app).post(P('/mrd/records')).set('authorization', staff('mrd_staff')).send({});
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|mrd_record_index/);
    console.error.mockRestore?.();
  });

  it('digitization queue: same role gate, audited', async () => {
    expect((await request(app).post(P('/mrd/digitization-queue')).set('authorization', staff('nurse')).send({ recordId: 7 })).status).toBe(403);
    mrd.queueForDigitization.mockResolvedValueOnce({ id: 1 });
    const res = await request(app).post(P('/mrd/digitization-queue')).set('authorization', staff('mrd_staff', 5, 11)).send({ recordId: 7 });
    expect(res.status).toBe(201);
    expect(mrd.queueForDigitization).toHaveBeenCalledWith(11, 7);
    expect(auditAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'digitization_queued', entityId: 7 }));
  });
});

describe('UHID assignment (audit OPS-03)', () => {
  it('is role-gated and never runs for a non-MRD role', async () => {
    const res = await request(app).post(P('/mrd/uhid/assign')).set('authorization', staff('nurse')).send({ patientId: 5 });
    expect(res.status).toBe(403);
    expect(mrd.assignUhid).not.toHaveBeenCalled();
  });

  it('assigns for one patient in the caller\'s hospital and audits it', async () => {
    mrd.assignUhid.mockResolvedValueOnce({ patientId: 5, uhid: 'UH11-0000001', assigned: true });
    const res = await request(app).post(P('/mrd/uhid/assign')).set('authorization', staff('mrd_staff', 9, 11)).send({ patientId: 5 });
    expect(res.body).toMatchObject({ success: true, data: { uhid: 'UH11-0000001' } });
    expect(mrd.assignUhid).toHaveBeenCalledWith(11, 5);
    expect(auditAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'uhid_assigned', entityId: 5 }));
  });

  it('bulk assignment needs an explicit all:true (a missing patientId is NOT "everyone")', async () => {
    mrd.assignUhid.mockRejectedValueOnce(Object.assign(new Error('patientId is required'), { status: 400 }));
    const none = await request(app).post(P('/mrd/uhid/assign')).set('authorization', staff('mrd_staff')).send({});
    expect(none.status).toBe(400);
    expect(mrd.assignMissingUhids).not.toHaveBeenCalled();
    mrd.assignMissingUhids.mockResolvedValueOnce({ assigned: 3, results: [] });
    const all = await request(app).post(P('/mrd/uhid/assign')).set('authorization', staff('mrd_staff', 9, 11)).send({ all: true, limit: 10 });
    expect(all.status).toBe(200);
    expect(mrd.assignMissingUhids).toHaveBeenCalledWith(11, { limit: 10 });
    expect(auditAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'uhid_assigned_bulk' }));
  });
});

describe('discharge summaries: gate, status codes, one invitation (audit CLN-06)', () => {
  const summary = { id: 3, patient_id: 5, admission_id: 8, status: 'draft' };

  it.each(['receptionist', 'billing', 'security_staff'])('%s cannot write a discharge summary', async (role) => {
    const res = await request(app).post(P('/discharge-summaries')).set('authorization', staff(role)).send({ patientId: 5 });
    expect(res.status).toBe(403);
    expect(summaries.saveSummary).not.toHaveBeenCalled();
  });

  it('a doctor saving: 201 for a new draft, 200 when it updated the existing one (no duplicate)', async () => {
    summaries.saveSummary.mockResolvedValueOnce({ summary, created: true });
    expect((await request(app).post(P('/discharge-summaries')).set('authorization', staff('doctor')).send({ patientId: 5 })).status).toBe(201);
    summaries.saveSummary.mockResolvedValueOnce({ summary, updatedExisting: true });
    expect((await request(app).post(P('/discharge-summaries')).set('authorization', staff('doctor')).send({ patientId: 5 })).status).toBe(200);
    expect(summaries.saveSummary).toHaveBeenCalledWith(11, { patientId: 5 });
  });

  it('the FIRST submission sends the survey invitation once and audits it', async () => {
    summaries.saveSummary.mockResolvedValueOnce({ summary: { ...summary, status: 'pending_approval' }, submittedNow: true });
    seqQuery.mockResolvedValue([]);                                    // no existing invitation
    const res = await request(app).post(P('/discharge-summaries/submit')).set('authorization', staff('doctor', 4, 11)).send({ patientId: 5, admissionId: 8 });
    expect(res.status).toBe(201);
    expect(seqQuery.mock.calls.filter(isInvitationInsert)).toHaveLength(1);
    expect(seqQuery.mock.calls.find(isInvitationInsert)[1].replacements).toMatchObject({ hospitalId: 11, patientId: 5, summaryId: 3 });
    expect(auditAction).toHaveBeenCalledWith(expect.objectContaining({ module: 'discharge', action: 'submit', entityId: 3, actor: 4 }));
  });

  it('re-submitting an already-submitted summary is a 200 no-op: NO invitation, NO audit row', async () => {
    summaries.saveSummary.mockResolvedValueOnce({ summary: { ...summary, status: 'pending_approval' }, submittedNow: false, alreadySubmitted: true });
    const res = await request(app).post(P('/discharge-summaries/submit')).set('authorization', staff('doctor')).send({ patientId: 5, admissionId: 8 });
    expect(res.status).toBe(200);
    expect(res.body.alreadySubmitted).toBe(true);
    expect(seqQuery.mock.calls.filter(isInvitationInsert)).toHaveLength(0);
    expect(auditAction).not.toHaveBeenCalled();
  });

  it('an invitation that already exists for the summary is not duplicated', async () => {
    summaries.saveSummary.mockResolvedValueOnce({ summary: { ...summary, status: 'pending_approval' }, submittedNow: true });
    seqQuery.mockImplementation(async (sql) => (/SELECT 1 FROM prems_survey_invitations/.test(sql) ? [{ 1: 1 }] : []));
    await request(app).post(P('/discharge-summaries/submit')).set('authorization', staff('doctor')).send({ patientId: 5 });
    expect(seqQuery.mock.calls.filter(isInvitationInsert)).toHaveLength(0);
  });

  it('a scope error (patient/admission not in this hospital) is a 404 and no invitation is sent', async () => {
    summaries.saveSummary.mockRejectedValueOnce(Object.assign(new Error('Admission not found in this hospital'), { status: 404, code: 'ADMISSION_NOT_FOUND' }));
    const res = await request(app).post(P('/discharge-summaries/submit')).set('authorization', staff('doctor')).send({ patientId: 5, admissionId: 999 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ADMISSION_NOT_FOUND');
    expect(seqQuery.mock.calls.filter(isInvitationInsert)).toHaveLength(0);
  });

  it('PUT: approval cannot be written (service error → 400), and the id is scoped to the caller\'s hospital', async () => {
    summaries.updateSummary.mockRejectedValueOnce(Object.assign(new Error('status can only be draft or pending_approval here'), { status: 400, code: 'STATUS_NOT_ALLOWED' }));
    const res = await request(app).put(P('/discharge-summaries/3')).set('authorization', staff('doctor')).send({ status: 'approved' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('STATUS_NOT_ALLOWED');
    expect(summaries.updateSummary).toHaveBeenCalledWith(11, '3', { status: 'approved' });
    expect((await request(app).put(P('/discharge-summaries/3')).set('authorization', staff('receptionist')).send({})).status).toBe(403);
  });
});
