import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
const { resolveImagingTenant, ensureLabTenant, tenantByUid, _clearCache } = await import('../services/imaging-tenant.service.js');

const UID_70 = 'aaaaaaaa-0000-4000-8000-000000000070';
// A tiny in-memory registry: kind 'lab' ids 70 and 2368 exist; lab 1 does not have a row yet but exists in `labs`.
const registry = () => {
  const rows = [{ uid: UID_70, kind: 'lab', source_id: '70' }, { uid: 'bbbbbbbb-0000-4000-8000-000000002368', kind: 'lab', source_id: '2368' }];
  const labs = new Set([1, 70, 2368]);
  query.mockImplementation(async (sql, params = []) => {
    if (/FROM imaging_tenants WHERE kind = 'lab'/.test(sql)) return { rows: rows.filter((r) => r.kind === 'lab' && Number(r.source_id) === params[0]) };
    if (/FROM imaging_tenants WHERE uid/.test(sql)) return { rows: rows.filter((r) => r.uid === params[0]) };
    if (/INSERT INTO imaging_tenants/.test(sql)) {
      if (labs.has(params[0]) && !rows.some((r) => r.kind === 'lab' && Number(r.source_id) === params[0])) rows.push({ uid: `cccccccc-0000-4000-8000-${String(params[0]).padStart(12, '0')}`, kind: 'lab', source_id: String(params[0]) });
      return { rows: [] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });
};
beforeEach(() => { query.mockReset(); _clearCache(); registry(); });

describe('resolveImagingTenant — a principal is mapped through the registry, never by its own id', () => {
  it('a doctor whose user id equals an imaging tenant id gets NO tenant (doctor 70 ≠ lab 70)', async () => {
    expect(await resolveImagingTenant({ id: 70, role: 'doctor' })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it('hospital staff / hospital accounts / admins get no tenant either', async () => {
    for (const p of [{ id: 2368, role: 'hospital', userType: 'hospital' }, { id: 70, role: 'nurse', tenant_id: 70 }, { id: 1, role: 'admin' }, { id: 5 }]) expect(await resolveImagingTenant(p)).toBeNull();
  });
  it('a lab account resolves to its own lab', async () => {
    expect(await resolveImagingTenant({ id: 70, role: 'lab' })).toEqual({ id: 70, uid: UID_70, kind: 'lab' });
  });
  it('an explicit server-minted tenantId resolves only if it is a real lab', async () => {
    expect((await resolveImagingTenant({ id: 5, role: 'doctor', tenantId: 2368 })).id).toBe(2368);
    expect(await resolveImagingTenant({ id: 5, role: 'doctor', tenantId: 424242 })).toBeNull();
  });
  it('registers a lab on first use (created from `labs`, not from the caller)', async () => {
    const t = await resolveImagingTenant({ id: 1, role: 'lab' });
    expect(t).toMatchObject({ id: 1, kind: 'lab' });
    expect(t.uid).toMatch(/^cccccccc-/);
  });
  it('a tenantUid claim wins and resolves via the registry', async () => {
    expect(await resolveImagingTenant({ id: 5, role: 'doctor', tenantUid: UID_70 })).toEqual({ id: 70, uid: UID_70, kind: 'lab' });
  });
  it('an unknown tenantUid is a refusal — it does NOT fall through to a matching tenantId', async () => {
    expect(await resolveImagingTenant({ tenantUid: 'dddddddd-0000-4000-8000-000000000000', tenantId: 70 })).toBeNull();
  });
  it('a malformed tenantUid never reaches the database', async () => {
    expect(await resolveImagingTenant({ tenantUid: "1' OR '1'='1", tenantId: 70 })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects non-positive / non-integer ids', async () => {
    for (const id of [0, -3, 1.5, 'abc', null, undefined]) expect(await ensureLabTenant(id)).toBeNull();
  });
});

describe('caching', () => {
  it('serves repeat lookups from cache', async () => {
    await tenantByUid(UID_70); await tenantByUid(UID_70.toUpperCase());
    expect(query).toHaveBeenCalledTimes(1);
  });
});
