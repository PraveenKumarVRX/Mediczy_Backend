import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pool = { query: jest.fn(), connect: jest.fn() };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: pool }));
const { evaluateFlag, requireFeatureFlag, assertFlagKey } = await import('../services/feature-flag.service.js');

describe('feature flag registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FEATURE_FLAG_CRM_FLOW_BUILDER;
    delete process.env.LEGACY_FLAG;
  });

  test('uses a tenant override over the registry default', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ key: 'crm.flow_builder', default_enabled: true, rollout_percentage: 100, kill_switch: false }] })
      .mockResolvedValueOnce({ rows: [{ enabled: false, rollout_percentage: 100 }] });
    await expect(evaluateFlag('crm.flow_builder', { tenantUid: 'TENANT-1' })).resolves.toMatchObject({ enabled: false, source: 'tenant_override' });
  });

  test('kill switch always wins over an enabled flag', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ key: 'ai.high_risk', default_enabled: true, rollout_percentage: 100, kill_switch: true }] });
    await expect(evaluateFlag('ai.high_risk')).resolves.toMatchObject({ enabled: false, killSwitch: true });
  });

  test('supports an explicit legacy environment fallback when no row exists', async () => {
    process.env.LEGACY_FLAG = 'true';
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(evaluateFlag('crm.flow_builder', { fallbackEnv: 'LEGACY_FLAG' })).resolves.toMatchObject({ enabled: true, source: 'registry' });
  });

  test('middleware blocks a disabled flag and attaches the evaluation', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ key: 'crm.flow_builder', default_enabled: false, rollout_percentage: 100, kill_switch: false }] });
    const req = { crmUser: { tenantUid: 'TENANT-1' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await requireFeatureFlag('crm.flow_builder')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
    expect(req.featureFlags['crm.flow_builder'].enabled).toBe(false);
  });

  test('rejects unsafe keys', () => {
    expect(() => assertFlagKey('Bad Key')).toThrow(/Flag key/);
    expect(() => assertFlagKey('ok')).not.toThrow();
  });

  test('migration and admin surface are registered', () => {
    const root = join(process.cwd());
    const migration = readFileSync(join(root, 'migrations/20261016000100-feature-flags.migration.js'), 'utf8');
    const route = readFileSync(join(root, 'routes/feature-flags.route.js'), 'utf8');
    const runner = readFileSync(join(root, 'scripts/migrate-all.mjs'), 'utf8');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS feature_flags');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS tenant_feature_flags');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS feature_flag_audit');
    expect(route).toContain("router.patch('/:key'");
    expect(route).toContain("router.put('/:key/tenants/:tenantUid'");
    expect(runner).toContain('20261016000100-feature-flags.migration.js');
  });
});
