import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
const { requireHgTenant } = await import('../utils/hypergrid-tenant.js');

const run = async (req) => {
  const out = { code: null, body: null, nexted: false };
  const res = { status: (c) => { out.code = c; return res; }, json: (b) => { out.body = b; return res; } };
  req.query = req.query || {}; req.body = req.body || {};   // same object, so what the middleware sets is visible to the test
  await requireHgTenant(req, res, () => { out.nexted = true; });
  return { out, req };
};
beforeEach(() => query.mockReset());

describe('requireHgTenant — the tenant is never the caller\'s own user id', () => {
  it('uses an explicit server-minted tenantId claim', async () => {
    const r = { user: { id: 5, role: 'doctor', tenantId: 42 } };
    expect((await run(r)).out.nexted).toBe(true);
    expect(r.hgTenantId).toBe(42);
  });

  it('uses the caller\'s hospital tenant from their token (department/staff login shape)', async () => {
    const r = { user: { id: 6300, role: 'nurse', organization_id: 4, tenant_id: 4 } };
    expect((await run(r)).out.nexted).toBe(true);
    expect(r.hgTenantId).toBe(4);
  });

  it('REFUSES a staff member with no tenant instead of using their user id (the old behaviour)', async () => {
    const { out } = await run({ user: { id: 70, role: 'nurse' } });
    expect(out.nexted).toBe(false);
    expect(out.code).toBe(403);
    expect(out.body.code).toBe('TENANT_CONTEXT_REQUIRED');
  });

  it('a platform admin must name the tenant, and it must exist', async () => {
    let { out } = await run({ user: { id: 1, role: 'admin' } });
    expect(out.code).toBe(400); expect(out.body.code).toBe('TENANT_REQUIRED');

    query.mockResolvedValueOnce({ rows: [] });
    ({ out } = await run({ user: { id: 1, role: 'admin' }, query: { tenantId: '999' } }));
    expect(out.code).toBe(404); expect(out.body.code).toBe('TENANT_NOT_FOUND');

    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const r = { user: { id: 1, role: 'admin' }, body: { tenantId: 7 } };
    ({ out } = await run(r));
    expect(out.nexted).toBe(true); expect(r.hgTenantId).toBe(7);
  });

  it('a non-admin cannot pick a tenant by passing tenantId', async () => {
    const { out } = await run({ user: { id: 70, role: 'doctor' }, query: { tenantId: '2368' } });
    expect(out.nexted).toBe(false); expect(out.code).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('fails closed (503) when the tenant lookup itself errors', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    const { out } = await run({ user: { id: 1, role: 'admin' }, query: { tenantId: '7' } });
    expect(out.code).toBe(503); expect(out.nexted).toBe(false);
  });
});
