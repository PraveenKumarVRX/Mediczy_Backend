/**
 * Every tenant-scoped HyperGrid admin route refuses an account with no tenant (instead of using its user id as the
 * tenant) and scopes to the resolved tenant otherwise. One representative GET per router, plus a static guard that no
 * router still contains the `tenantId || id` fallback.
 */
import { jest } from '@jest/globals';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const pool = { query, connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }) };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: pool, pool }));
const realPg = await import('../db/postgres.js');
jest.unstable_mockModule('../db/postgres.js', () => ({ ...realPg, connectPostgres: jest.fn().mockResolvedValue(pool) }));

// authUser normally checks the DB; here it only decodes the signed token. requireRole is pass-through — role gating is
// not what is under test, the tenant gate that follows it is.
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, res, next) => { try { req.user = jwt.verify(String(req.headers.authorization || '').slice(7), JWT_CONFIG.SECRET); next(); } catch { res.status(401).json({ success: false }); } },
  requireRole: () => (_req, _res, next) => next(),
  default: {},
}));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const mount = async (name) => (await import(`../routes/hypergrid-${name}.route.js`)).default;
const routers = { edge: '/gateways', events: '/', mqtt: '/devices', twins: '/', terminology: '/codes', connector: '/connectors', marketplace: '/apps/9/install' };

const tok = (claims) => `Bearer ${jwt.sign({ userType: 'hospital', ...claims }, JWT_CONFIG.SECRET, { expiresIn: '5m' })}`;
beforeEach(() => query.mockClear());

describe.each(Object.entries(routers))('hypergrid-%s', (name, path) => {
  let app;
  beforeAll(async () => { app = express(); app.use(express.json()); app.use('/r', await mount(name)); });

  it('refuses a hospital staff token with no tenant claim (403) and reads nothing tenant-scoped', async () => {
    const call = name === 'marketplace' ? request(app).post(`/r${path}`) : request(app).get(`/r${path === '/' ? '' : path}`);
    const res = await call.set('authorization', tok({ id: 70, role: 'nurse' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(query.mock.calls.some((c) => JSON.stringify(c[1] ?? []).includes('70'))).toBe(false);   // user id never used as a tenant
  });
});

describe('a resolved tenant is what the query uses', () => {
  it('twins list is scoped to the organization_id claim, never the user id', async () => {
    const app = express(); app.use(express.json()); app.use('/r', await mount('twins'));
    const res = await request(app).get('/r').set('authorization', tok({ id: 70, role: 'nurse', organization_id: 4 }));
    expect(res.status).not.toBe(403);
    const params = query.mock.calls.map((c) => JSON.stringify(c[1] ?? []));
    expect(params.some((p) => p.includes('4'))).toBe(true);
    expect(params.some((p) => /(^|[\[,])70([\],]|$)/.test(p))).toBe(false);
  });
});

describe('no HyperGrid router falls back to the caller\'s own id as tenant', () => {
  it.each(['connector', 'edge', 'events', 'marketplace', 'mqtt', 'terminology', 'twins', 'smart-fhir', 'dicom'])('hypergrid-%s', (name) => {
    const src = fs.readFileSync(new URL(`../routes/hypergrid-${name}.route.js`, import.meta.url), 'utf8');
    expect(src).not.toMatch(/tenantId\s*\|\|\s*req\.user\.id/);
    expect(src).not.toMatch(/user\.tenantId\s*\|\|\s*(req\.)?user\.id/);
  });
});
