/**
 * roadmap-intelligence hardening: tenant resolution (incl. doctors), role gates, patient ownership, RLS transaction,
 * request-time DDL gone. Real signed tokens; the database is mocked and inspected.
 */
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { JWT_CONFIG } from '../config/auth.config.js';

const clientQuery = jest.fn();
const poolQuery = jest.fn();
const poolMock = { query: poolQuery, connect: jest.fn(async () => ({ query: clientQuery, release: jest.fn() })) };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: poolMock, pool: poolMock }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/roadmap-intelligence.route.js');
const app = express(); app.use(express.json()); app.use('/r', router);
const tok = (claims) => `Bearer ${jwt.sign(claims, JWT_CONFIG.SECRET, { expiresIn: '5m' })}`;
const nurse = (org = 4) => tok({ id: 50, role: 'nurse', organization_id: org });

let patientsInTenant;
beforeEach(() => {
  clientQuery.mockReset(); poolQuery.mockReset();
  patientsInTenant = new Set([5]);
  clientQuery.mockImplementation(async (sql, params) => {
    if (/FROM users u WHERE u\.id = \$1 AND u\.organization_id = \$2/.test(sql)) return { rowCount: patientsInTenant.has(Number(params[0])) ? 1 : 0, rows: [] };
    if (/^INSERT|^UPDATE/.test(String(sql).trim())) return { rows: [{ id: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  poolQuery.mockResolvedValue({ rows: [] });
});
const dataSql = () => clientQuery.mock.calls.filter((c) => !/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config)/i.test(String(c[0]).trim()));

describe('authentication and roles', () => {
  it('401 with no token or a forged one', async () => {
    expect((await request(app).get('/r/esg/summary')).status).toBe(401);
    expect((await request(app).get('/r/esg/summary').set('authorization', `Bearer ${jwt.sign({ id: 1, organization_id: 4, role: 'nurse' }, 'nope')}`)).status).toBe(401);
  });
  it.each(['patient', 'lab', 'pharmacy', 'user'])('a %s token is refused (403 ROLE_NOT_PERMITTED) before any query', async (role) => {
    const res = await request(app).get('/r/esg/summary').set('authorization', tok({ id: 9, role, organization_id: 4 }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_NOT_PERMITTED');
    expect(clientQuery).not.toHaveBeenCalled();
  });
  it.each([
    ['/pgx/profiles', { patientId: 5, gene: 'CYP2D6', phenotype: 'poor metabolizer' }],
    ['/voice-biometrics/consents', { patientId: 5, consentStatus: 'granted' }],
    ['/ar-surgical-plans', { patientId: 5, caseReference: 'C1' }],
  ])('%s needs a CLINICAL role: a billing user is refused, a nurse is not', async (path, body) => {
    expect((await request(app).post(`/r${path}`).set('authorization', tok({ id: 9, role: 'billing', organization_id: 4 })).send(body)).status).toBe(403);
    expect((await request(app).post(`/r${path}`).set('authorization', nurse()).send(body)).status).toBe(201);
  });
});

describe('tenant resolution — never the caller\'s user id', () => {
  it('a staff token with no tenant claim is refused', async () => {
    const res = await request(app).get('/r/esg/summary').set('authorization', tok({ id: 6203, role: 'nurse' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
  });
  it('a hospital-employed doctor resolves to THEIR hospital via the doctors table', async () => {
    poolQuery.mockResolvedValue({ rows: [{ org: 9 }] });
    const res = await request(app).get('/r/esg/summary').set('authorization', tok({ id: 70, role: 'doctor' }));
    expect(res.status).toBe(200);
    expect(poolQuery.mock.calls[0][1]).toEqual([70]);
    expect(clientQuery.mock.calls.find((c) => /set_config\('app.current_org_id'/.test(c[0]))[1][0]).toBe('9');
    expect(dataSql().find((c) => /FROM esg_entries/.test(c[0]))[1]).toEqual([9]);   // 9, not the doctor id 70
  });
  it('an independent doctor (no hospital) is refused rather than scoped to their doctor id', async () => {
    poolQuery.mockResolvedValue({ rows: [{ org: null }] });
    const res = await request(app).get('/r/esg/summary').set('authorization', tok({ id: 70, role: 'doctor' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(clientQuery).not.toHaveBeenCalled();
  });
  it('a platform admin gets the platform view only where allowed (aggregates), a 403 for tenant-owned writes', async () => {
    const admin = tok({ id: 1, role: 'admin' });
    expect((await request(app).get('/r/rwe/aggregate').set('authorization', admin)).body.scope).toBe('platform');
    expect((await request(app).get('/r/esg/summary').set('authorization', admin)).status).toBe(200);
    expect((await request(app).post('/r/pgx/profiles').set('authorization', admin).send({ patientId: 5, gene: 'g', phenotype: 'p' })).status).toBe(403);
    expect((await request(app).get('/r/sdoh/screenings/5').set('authorization', admin)).status).toBe(403);
  });
});

describe('every query runs inside the tenant RLS transaction', () => {
  it('BEGIN + app.current_org_id = the tenant, then the query, then COMMIT', async () => {
    await request(app).get('/r/antibiogram/summary').set('authorization', nurse(4));
    const seq = clientQuery.mock.calls.map((c) => String(c[0]).trim().split('\n')[0].slice(0, 40));
    expect(seq[0]).toMatch(/BEGIN/i);
    expect(clientQuery.mock.calls[1][1]).toEqual(['4']);
    expect(seq[seq.length - 1]).toMatch(/COMMIT/i);
    expect(poolQuery).not.toHaveBeenCalled();                       // nothing bypasses the transaction via the bare pool
  });
});

describe('legacy nursing wound paths',()=>{
  it('requires the admission-scoped nursing workflow instead of bypassing assignment checks',async()=>{
    const result=await request(app).post('/r/wounds').set('authorization',nurse()).send({patientId:5,woundType:'Surgical'});
    expect(result.status).toBe(410);expect(result.body.code).toBe('USE_ADMISSION_NURSING_CHART');expect(clientQuery).not.toHaveBeenCalled();
  });
});

describe('patient ownership is checked before anything is written', () => {
  it('a patient outside the hospital is a 404 and nothing is inserted', async () => {
    const res = await request(app).post('/r/wounds').set('authorization', tok({id:50,role:'doctor',organization_id:4})).send({ patientId: 999, woundType: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PATIENT_NOT_FOUND');
    expect(dataSql().some((c) => /INSERT/.test(c[0]))).toBe(false);
    expect(clientQuery.mock.calls.some((c) => /ROLLBACK/i.test(c[0]))).toBe(true);
  });
  it('a patient inside the hospital is written with the caller\'s tenant', async () => {
    const res = await request(app).post('/r/wounds').set('authorization', tok({id:50,role:'doctor',organization_id:4})).send({ patientId: 5, woundType: 'x', stage: '2' });
    expect(res.status).toBe(201);
    const ins = dataSql().find((c) => /INSERT INTO wound_tracking_records/.test(c[0]));
    expect(ins[1].slice(0, 2)).toEqual([4, 5]);
  });
  it('a missing/non-numeric patientId is a 400', async () => {
    expect((await request(app).post('/r/wounds').set('authorization', tok({id:50,role:'doctor',organization_id:4})).send({ woundType: 'x' })).status).toBe(400);
    expect((await request(app).post('/r/wounds').set('authorization', tok({id:50,role:'doctor',organization_id:4})).send({ patientId: 'abc' })).status).toBe(400);
  });
  it('voice enrollment: consent must be granted AND belong to that patient in this hospital', async () => {
    clientQuery.mockImplementation(async (sql, params) => {
      if (/FROM users u WHERE/.test(sql)) return { rowCount: 1, rows: [] };
      if (/FROM voice_biometric_consents/.test(sql)) return { rows: [{ consent_status: 'revoked' }] };
      return { rows: [], rowCount: 0 };
    });
    const res = await request(app).post('/r/voice-biometrics/enrollments').set('authorization', nurse()).send({ patientId: 5, consentId: 1, sampleRef: 's' });
    expect(res.status).toBe(409);
  });
  it('verification against another patient\'s / hospital\'s enrollment is a 404', async () => {
    const res = await request(app).post('/r/voice-biometrics/verifications').set('authorization', nurse()).send({ patientId: 5, enrollmentId: 77, sampleRef: 's' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ENROLLMENT_NOT_FOUND');
  });
});

describe('errors never leak SQL and never hang', () => {
  it('a database failure is a generic 500 with no table names', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    clientQuery.mockImplementation(async (sql) => {
      if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config)/i.test(String(sql).trim())) return { rows: [] };
      throw Object.assign(new Error('relation "esg_entries" does not exist'), { code: '42P01', severity: 'ERROR', routine: 'x' });
    });
    const res = await request(app).get('/r/esg/summary').set('authorization', nurse());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|esg_entries/);
    console.error.mockRestore?.();
  });
});

describe('static guards', () => {
  const src = fs.readFileSync(new URL('../routes/roadmap-intelligence.route.js', import.meta.url), 'utf8');
  it('no request-time DDL, no fallback to the user id, no randomness, no bare-pool data query', () => {
    expect(src).not.toMatch(/CREATE TABLE/i);
    expect(src).not.toMatch(/ensureTables/);
    expect(src).not.toMatch(/tenant_id\s*\|\|\s*\S*\.id/);
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/connectPostgres/);
  });
});
