import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
const { resolveImagingTenant, ensureLabTenant, tenantByUid, _clearCache } = await import('../services/imaging-tenant.service.js');

// An imaging tenant is a lab, keyed by labs.unique_id. A tiny in-memory `labs` table and alias table.
const LAB_70 = { id: 70, unique_id: 'L70AAA', uid: 'aaaaaaaa-0000-4000-8000-000000000070' };
const LAB_2368 = { id: 2368, unique_id: 'L2368B', uid: 'bbbbbbbb-0000-4000-8000-000000002368' };
const LAB_1 = { id: 1, unique_id: 'LDQM9T', uid: 'cccccccc-0000-4000-8000-000000000001' };
const labs = [LAB_70, LAB_2368, LAB_1];
const aliases = { LOLD70: 'L70AAA' };
const pick = (l) => ({ id: l.id, unique_id: l.unique_id });
beforeEach(() => {
  query.mockReset(); _clearCache();
  query.mockImplementation(async (sql, params = []) => {
    const s = String(sql);
    if (/FROM labs WHERE id = \$1/.test(s)) return { rows: labs.filter((l) => l.id === params[0]).map(pick) };
    if (/FROM labs WHERE unique_id = resolve_entity_uid/.test(s)) return { rows: labs.filter((l) => l.unique_id === (aliases[params[0]] ?? params[0])).map(pick) };
    if (/FROM labs WHERE unique_id = \$1/.test(s)) return { rows: labs.filter((l) => l.unique_id === params[0]).map(pick) };
    if (/FROM labs WHERE uid = \$1::uuid/.test(s)) return { rows: labs.filter((l) => l.uid === params[0]).map(pick) };
    throw new Error(`unexpected SQL: ${s}`);
  });
});

describe('resolveImagingTenant — a principal is mapped through `labs`, never by its own id', () => {
  it('a doctor whose user id equals an imaging tenant id gets NO tenant (doctor 70 ≠ lab 70)', async () => {
    expect(await resolveImagingTenant({ id: 70, role: 'doctor' })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it('hospital staff / hospital accounts / admins get no tenant either', async () => {
    for (const p of [{ id: 2368, role: 'hospital', userType: 'hospital' }, { id: 70, role: 'nurse', tenant_id: 70 }, { id: 1, role: 'admin' }, { id: 5 }]) expect(await resolveImagingTenant(p)).toBeNull();
  });
  it('a lab account resolves to its own lab, keyed by the lab uid', async () => {
    expect(await resolveImagingTenant({ id: 70, role: 'lab' })).toEqual({ id: 70, uid: 'L70AAA', kind: 'lab' });
  });
  it('an explicit server-minted tenantId resolves only if it is a real lab', async () => {
    expect((await resolveImagingTenant({ id: 5, role: 'doctor', tenantId: 2368 })).id).toBe(2368);
    expect(await resolveImagingTenant({ id: 5, role: 'doctor', tenantId: 424242 })).toBeNull();
  });
  it('a labUid claim wins and resolves to that lab', async () => {
    expect(await resolveImagingTenant({ id: 5, role: 'doctor', labUid: 'L70AAA' })).toEqual({ id: 70, uid: 'L70AAA', kind: 'lab' });
  });
  it('a retired lab uid resolves to the lab\'s current uid', async () => {
    expect(await resolveImagingTenant({ labUid: 'LOLD70' })).toEqual({ id: 70, uid: 'L70AAA', kind: 'lab' });
  });
  it('LEGACY: a pre-change UUID tenantUid claim still resolves to the same lab', async () => {
    expect(await resolveImagingTenant({ id: 5, role: 'doctor', tenantUid: LAB_70.uid })).toEqual({ id: 70, uid: 'L70AAA', kind: 'lab' });
  });
  it('an unknown uid is a refusal — it does NOT fall through to a matching tenantId', async () => {
    expect(await resolveImagingTenant({ labUid: 'LZZZZZ', tenantId: 70 })).toBeNull();
    expect(await resolveImagingTenant({ tenantUid: 'dddddddd-0000-4000-8000-000000000000', tenantId: 70 })).toBeNull();
  });
  it('a malformed uid never reaches the database', async () => {
    for (const bad of ["1' OR '1'='1", 'L70', 'l70aaa', 'LABCDEFG', '']) {
      query.mockClear();
      expect(await resolveImagingTenant({ labUid: bad || undefined, tenantUid: bad ? undefined : 'x', tenantId: 70 })).toBeNull();
      expect(query).not.toHaveBeenCalled();
    }
  });
  it('falls back to "not found" if the alias function does not exist yet (42883)', async () => {
    query.mockImplementation(async (sql) => {
      if (/resolve_entity_uid/.test(String(sql))) throw Object.assign(new Error('no function'), { code: '42883' });
      return { rows: [] };
    });
    expect(await resolveImagingTenant({ labUid: 'LOLD70' })).toBeNull();
  });
  it('rejects non-positive / non-integer ids', async () => {
    for (const id of [0, -3, 1.5, 'abc', null, undefined]) expect(await ensureLabTenant(id)).toBeNull();
  });
});

describe('caching', () => {
  it('serves repeat lookups from cache', async () => {
    await tenantByUid('L70AAA'); await tenantByUid('L70AAA');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
