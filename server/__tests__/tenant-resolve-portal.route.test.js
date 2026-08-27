/**
 * GET /api/tenants/resolve-portal — the endpoint TenantAwareLogin.tsx
 * depends on to route a subdomain to the right login form (lab/clinic/
 * hospital/corporate). Real bug it replaced: every tenant subdomain used
 * to route unconditionally to the clinic login, so lab subdomains
 * (radolabs, ichegmore) showed a dental-clinic form and rejected valid
 * lab credentials. This must never throw a 4xx/5xx — the frontend has no
 * error-state UI for this call, only a safe fallback to the generic
 * login on `type: null`.
 */
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockLabFindOne = jest.fn();
const mockTenantFindOne = jest.fn();

jest.unstable_mockModule('../models/postgres/lab.model.postgres.js', () => ({
  default: { findOne: mockLabFindOne },
}));
jest.unstable_mockModule('../models/postgres/tenant.model.postgres.js', () => ({
  default: { findOne: mockTenantFindOne },
}));

const { default: tenantRouter } = await import('../routes/tenant.route.js');

function buildApp(host) {
  const app = express();
  app.use((req, _res, next) => {
    req.headers.host = host;
    next();
  });
  app.use('/api/tenants', tenantRouter);
  return app;
}

describe('GET /api/tenants/resolve-portal', () => {
  beforeEach(() => {
    mockLabFindOne.mockReset();
    mockTenantFindOne.mockReset();
  });

  test('a real lab subdomain resolves to type "lab" — the bug this endpoint fixes', async () => {
    mockLabFindOne.mockResolvedValueOnce({ id: 1, name: 'Rado Labs', slug: 'radolabs' });
    const res = await request(buildApp('radolabs.mediqzy.com')).get('/api/tenants/resolve-portal');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, type: 'lab', slug: 'radolabs' });
  });

  test('a tenant subdomain resolves to its real tenants.type value', async () => {
    mockLabFindOne.mockResolvedValueOnce(null);
    mockTenantFindOne.mockResolvedValueOnce({ id: 5, name: 'Ninjacart', slug: 'ninjacart', subdomain: 'ninjacart', type: 'corporate' });
    const res = await request(buildApp('ninjacart.mediqzy.com')).get('/api/tenants/resolve-portal');
    expect(res.body).toMatchObject({ success: true, type: 'corporate' });
  });

  test('a clinic subdomain still resolves to "clinic" — no regression for the previously-working case', async () => {
    mockLabFindOne.mockResolvedValueOnce(null);
    mockTenantFindOne.mockResolvedValueOnce({ id: 9, name: 'AJ Dental', slug: 'ajdental', subdomain: 'ajdental', type: 'clinic' });
    const res = await request(buildApp('ajdental.mediqzy.com')).get('/api/tenants/resolve-portal');
    expect(res.body).toMatchObject({ success: true, type: 'clinic' });
  });

  test('an unrecognized subdomain returns type: null, not an error', async () => {
    mockLabFindOne.mockResolvedValueOnce(null);
    mockTenantFindOne.mockResolvedValueOnce(null);
    const res = await request(buildApp('nonexistent.mediqzy.com')).get('/api/tenants/resolve-portal');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, type: null });
  });

  test('a bare apex host (no subdomain segment at all) returns type: null without querying either table', async () => {
    // extractSubdomain treats any 3+ part host as having a real subdomain
    // (including "app.mediqzy.com" -> "app") — only a bare 2-part host has
    // none. The frontend's getTenantSubdomain() is what actually decides
    // whether to call this endpoint at all; this just verifies the
    // endpoint's own short-circuit for a genuinely subdomain-less host.
    const res = await request(buildApp('mediqzy.com')).get('/api/tenants/resolve-portal');
    expect(res.body).toMatchObject({ success: true, type: null });
    expect(mockLabFindOne).not.toHaveBeenCalled();
    expect(mockTenantFindOne).not.toHaveBeenCalled();
  });

  test('a DB error is swallowed into a safe 200 type:null response — the frontend has no error-state UI for this call', async () => {
    mockLabFindOne.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(buildApp('radolabs.mediqzy.com')).get('/api/tenants/resolve-portal');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, type: null });
  });
});
