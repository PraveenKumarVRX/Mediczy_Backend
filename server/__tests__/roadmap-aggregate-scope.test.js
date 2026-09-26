/**
 * roadmap-intelligence aggregate endpoints read platform tables. RWE used to be `SELECT … FROM users GROUP BY gender` with
 * no tenant filter (any authenticated user got the whole platform's counts, randomly perturbed), and staffing/forecast
 * counted every hospital's appointments.
 */
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const clientQuery = jest.fn();
const dbQuery = jest.fn();
const poolMock = { query: jest.fn(), connect: jest.fn(async () => ({ query: clientQuery, release: jest.fn() })) };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: poolMock, pool: poolMock }));
const realPg = await import('../db/postgres.js');
jest.unstable_mockModule('../db/postgres.js', () => ({ ...realPg, connectPostgres: jest.fn(async () => ({ query: dbQuery })) }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/roadmap-intelligence.route.js');
const app = express(); app.use(express.json()); app.use('/r', router);
const tok = (claims) => `Bearer ${jwt.sign(claims, JWT_CONFIG.SECRET, { expiresIn: '5m' })}`;

const sqlOf = (mock) => mock.mock.calls.map((c) => String(c[0]));
beforeEach(() => {
  clientQuery.mockReset(); dbQuery.mockReset();
  clientQuery.mockImplementation(async (sql) => (/FROM users/.test(sql) ? { rows: [{ gender: 'female', patients: 40 }, { gender: 'male', patients: 3 }] } : { rows: [] }));
  dbQuery.mockImplementation(async (sql) => (/FROM appointments/.test(sql) ? { rows: [{ day: '2026-09-01', visits: 12 }] } : { rows: [] }));
});

describe('GET /rwe/aggregate', () => {
  it('a hospital user gets ONLY their hospital: the tenant is a bound parameter, not their user id', async () => {
    const res = await request(app).get('/r/rwe/aggregate').set('authorization', tok({ id: 70, role: 'ms', organization_id: 4 }));
    expect(res.status).toBe(200);
    const call = clientQuery.mock.calls.find((c) => /FROM users/.test(c[0]));
    expect(call[0]).toMatch(/organization_id = \$1/);
    expect(call[1]).toEqual([4]);
    expect(res.body.scope).toBe('hospital');
  });

  it('runs inside a tenant-scoped RLS transaction (users has forced RLS)', async () => {
    await request(app).get('/r/rwe/aggregate').set('authorization', tok({ id: 70, role: 'ms', organization_id: 4 }));
    const sqls = sqlOf(clientQuery);
    expect(sqls.some((q) => /BEGIN/i.test(q))).toBe(true);
    expect(clientQuery.mock.calls.some((c) => /set_config\('app.current_org_id'/.test(c[0]) && c[1][0] === '4')).toBe(true);
  });

  it('returns REAL counts — nothing is randomised — and suppresses small cells instead of guessing', async () => {
    const a = (await request(app).get('/r/rwe/aggregate').set('authorization', tok({ id: 1, role: 'ms', organization_id: 4 }))).body.data;
    const b = (await request(app).get('/r/rwe/aggregate').set('authorization', tok({ id: 1, role: 'ms', organization_id: 4 }))).body.data;
    expect(a).toEqual(b);
    expect(a.find((r) => r.gender === 'female')).toMatchObject({ patientCount: 40, noisyPatientCount: 40, suppressed: false });
    expect(a.find((r) => r.gender === 'male')).toMatchObject({ patientCount: null, suppressed: true });   // 3 < 5
  });

  it('a user with NO tenant claim is refused — their user id is not a hospital id (it was, via `|| id`)', async () => {
    const res = await request(app).get('/r/rwe/aggregate').set('authorization', tok({ id: 4, role: 'doctor' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('a platform admin gets the platform view, explicitly labelled and under a platform-admin context', async () => {
    const res = await request(app).get('/r/rwe/aggregate').set('authorization', tok({ id: 1, role: 'admin' }));
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('platform');
    expect(clientQuery.mock.calls.find((c) => /FROM users/.test(c[0]))[1]).toEqual([null]);
  });

  it('401 with no or a forged token', async () => {
    expect((await request(app).get('/r/rwe/aggregate')).status).toBe(401);
    expect((await request(app).get('/r/rwe/aggregate').set('authorization', `Bearer ${jwt.sign({ id: 1, organization_id: 4 }, 'nope')}`)).status).toBe(401);
  });
});

describe('GET /staffing/forecast', () => {
  it('counts only the caller\'s hospital\'s appointments', async () => {
    const res = await request(app).get('/r/staffing/forecast').set('authorization', tok({ id: 9, role: 'hospital_admin', tenant_id: 7 }));
    expect(res.status).toBe(200);
    const call = dbQuery.mock.calls.find((c) => /FROM appointments/.test(c[0]));
    expect(call[0]).toMatch(/organization_id = \$1/);
    expect(call[1]).toEqual([7]);
    expect(res.body.data.scope).toBe('hospital');
  });

  it('refuses a tenant-less non-admin', async () => {
    const res = await request(app).get('/r/staffing/forecast').set('authorization', tok({ id: 9, role: 'nurse' }));
    expect(res.status).toBe(403);
    expect(dbQuery.mock.calls.some((c) => /FROM appointments/.test(c[0]))).toBe(false);
  });
});

describe('the leak cannot come back', () => {
  it('no unscoped platform-table aggregate and no random noise remain in the router', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../routes/roadmap-intelligence.route.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/FROM users\s+GROUP BY/);
    expect(src).toMatch(/COALESCE\(gender::text/);   // users.gender is an ENUM: COALESCE(gender,'unknown') raises on a real database
  });
});
