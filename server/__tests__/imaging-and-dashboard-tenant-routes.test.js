/**
 * Route-level tenant checks from the audit remediation: HyperGrid DICOM auth (a doctor's / hospital's own id is not an
 * imaging tenant — doctor 70 must not read imaging tenant 70), and the executive dashboard's private token check (SEC-01).
 * Real signed tokens; the data layer is mocked so nothing reaches a database.
 */
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const pool = { query, connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }) };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: pool, pool }));
const realPg = await import('../db/postgres.js');
jest.unstable_mockModule('../db/postgres.js', () => ({ ...realPg, connectPostgres: jest.fn().mockResolvedValue(pool) }));
const stats = jest.fn().mockResolvedValue({});
jest.unstable_mockModule('../services/hospital-billing.service.js', () => ({ default: new Proxy({}, { get: () => stats }) }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { default: dicom } = await import('../routes/hypergrid-dicom.route.js');
const { default: dashboard } = await import('../routes/hospital/executive-dashboard.route.js');
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/hypergrid/dicom', dicom);
app.use('/api/hospital', dashboard);

const tok = (claims) => `Bearer ${jwt.sign(claims, JWT_CONFIG.SECRET, { expiresIn: '5m' })}`;
const STUDIES = '/api/hypergrid/dicom/studies';
beforeEach(() => { query.mockClear(); query.mockResolvedValue({ rows: [], rowCount: 0 }); stats.mockClear(); });

describe('HyperGrid DICOM: an account id is never an imaging tenant', () => {
  it.each([
    ['a doctor whose id equals an imaging tenant id (doctor 70)', { id: 70, role: 'doctor' }],
    ['a doctor with userType only', { id: 2368, userType: 'doctor' }],
    ['a hospital account (id 70 is also a hospital id)', { id: 70, role: 'hospital', userType: 'hospital' }],
    ['a hospital staff member', { id: 2429, role: 'nurse', userType: 'hospital', organization_id: 11 }],
  ])('%s is refused with TENANT_CONTEXT_REQUIRED and no imaging query runs', async (_n, claims) => {
    const res = await request(app).get(STUDIES).set('authorization', tok(claims));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(query.mock.calls.some((c) => /hg_dicom/.test(String(c[0])))).toBe(false);
  });

  it('an explicit tenantId claim that is a REAL lab is honoured; both its id and its registry UID key the query, and the doctor\'s own id never does', async () => {
    const LAB_UID = 'eeeeeeee-0000-4000-8000-000000987001';
    query.mockImplementation(async (sql, params = []) => (/FROM imaging_tenants WHERE kind = 'lab'/.test(String(sql)) && params[0] === 987001
      ? { rows: [{ uid: LAB_UID, source_id: '987001' }], rowCount: 1 } : { rows: [], rowCount: 0 }));
    const res = await request(app).get(STUDIES).set('authorization', tok({ id: 70, role: 'doctor', tenantId: 987001 }));
    expect(res.status).not.toBe(403);
    const dicomCalls = query.mock.calls.filter((c) => /hg_dicom/.test(String(c[0])));
    expect(dicomCalls.length).toBeGreaterThan(0);
    for (const c of dicomCalls) {
      expect(c[1]).toContain(987001);
      expect(c[1]).toContain(LAB_UID);
      expect(c[1]).not.toContain(70);                                   // the doctor's own id never becomes the tenant
    }
  });

  it('a tenantId claim that is not a registered lab is refused — an arbitrary integer cannot mint a tenant', async () => {
    const res = await request(app).get(STUDIES).set('authorization', tok({ id: 70, role: 'doctor', tenantId: 555001 }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(query.mock.calls.some((c) => /hg_dicom/.test(String(c[0])))).toBe(false);
  });

  it('no credentials at all is a 401, not a tenant-less pass', async () => {
    expect((await request(app).get(STUDIES)).status).toBe(401);
  });
});

describe('executive dashboard: private token check (SEC-01)', () => {
  const P = '/api/hospital/dashboard/stats';
  it('401 without a token, 401 for a forged one', async () => {
    expect((await request(app).get(P)).status).toBe(401);
    expect((await request(app).get(P).set('authorization', `Bearer ${jwt.sign({ id: 1, role: 'ceo', organization_id: 11 }, 'not-the-secret')}`)).status).toBe(401);
  });

  it('a hospital role with NO tenant claim is refused — its user id is not a hospital id', async () => {
    const res = await request(app).get(P).set('authorization', tok({ id: 6203, role: 'ms', userType: 'hospital' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(stats).not.toHaveBeenCalled();
  });

  it('a non-hospital role is refused before tenant resolution', async () => {
    const res = await request(app).get(P).set('authorization', tok({ id: 5, role: 'patient', organization_id: 11 }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBeUndefined();
  });

  it('organization_id resolves the hospital and reaches the service scoped to it', async () => {
    const res = await request(app).get(P).set('authorization', tok({ id: 6203, role: 'ms', organization_id: 11 }));
    expect(res.status).not.toBe(403);
    expect(stats.mock.calls.length + query.mock.calls.length).toBeGreaterThan(0);
    expect(JSON.stringify([...stats.mock.calls, ...query.mock.calls])).toContain('11');
  });
});
