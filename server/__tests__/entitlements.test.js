import { jest } from '@jest/globals';

const query = jest.fn();
const release = jest.fn();
const connect = jest.fn(() => ({ query, release }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { connect } }));
const { hasModuleEntitlement } = await import('../services/entitlement.service.js');

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  connect.mockClear();
});

describe('tenant module entitlements', () => {
  it('denies when the tenant has no active entitlement', async () => {
    query.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // current_org_id
      .mockResolvedValueOnce({ rows: [] }) // current_user_id
      .mockResolvedValueOnce({ rows: [] }) // is_platform_admin
      .mockResolvedValueOnce({ rows: [] }) // entitlement query
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    await expect(hasModuleEntitlement(4, 'accounts_finance', 'view')).resolves.toBe(false);
  });

  it('allows an active in-window entitlement with the requested action', async () => {
    query.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(hasModuleEntitlement(4, 'accounts_finance', 'create')).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('can_create'), [4, 'accounts_finance']);
    expect(release).toHaveBeenCalled();
  });

  it('fails closed for missing tenant, module, or action', async () => {
    await expect(hasModuleEntitlement(null, 'accounts_finance', 'view')).resolves.toBe(false);
    await expect(hasModuleEntitlement(4, 'accounts_finance', 'delete_all')).resolves.toBe(false);
  });
});
