import { test, expect } from '@jest/globals';
import { buildTenantMobileRepository } from '../services/tenant-mobile-apps.store.js';
import { mobileDeploymentEnvironment, tenantFromEnvironment } from '../services/tenant-mobile-runtime.js';
import { validateMobileApps } from '../services/tenant-mobile-apps.service.js';
const input = { enabled: true, origin: 'https://rado.example', revision: 0, apps: [{ product: 'patient', name: 'Rado', appId: 'com.rado.patient', registration: 'open' }] };
function setup(duplicate = null) {
  const calls = [];
  const tenant = { id: 42, name: 'Rado', status: 'active', settings: { existing: true }, async update(update) { this.settings = update.settings; } };
  const transaction = { LOCK: { UPDATE: 'update' } };
  const repository = buildTenantMobileRepository({
    Tenant: { findByPk: async () => tenant, findOne: async () => duplicate },
    postgresSequelize: { transaction: work => work(transaction), query: async (...args) => { calls.push(args); } }, Op: { ne: Symbol('ne') },
  });
  return { repository, tenant, calls };
}
test('configuration save preserves other settings, records actor and rejects stale revisions', async () => {
  const { repository, tenant, calls } = setup();
  const saved = await repository.save(42, input, 'admin@example.org');
  expect(saved.revision).toBe(1); expect(saved.updatedBy).toBe('admin@example.org'); expect(tenant.settings.existing).toBe(true);
  expect(calls[0][0]).toContain('pg_advisory_xact_lock'); expect(calls[0][1].replacements.origin).toBe(input.origin);
  await expect(repository.save(42, input, 'admin@example.org')).rejects.toMatchObject({ status: 409 });
  const changed = await repository.save(42, { ...input, revision: 1 }, 'admin@example.org');
  expect(changed.deploymentId).toBe(saved.deploymentId); expect(changed.revision).toBe(2);
});
test('duplicate origin assignment fails before replacing existing configuration', async () => {
  const { repository, tenant } = setup({ id: 99 });
  await expect(repository.save(42, input, 'admin')).rejects.toMatchObject({ status: 409 });
  expect(tenant.settings.mobileApps).toBeUndefined();
});
test('dedicated server snapshot works independently and rejects wrong hosts or corrupt data', () => {
  const tenant = { id: 42, name: 'Rado', status: 'active', settings: { mobileApps: validateMobileApps(input), unrelatedPrivateSetting: 'not-exported' } };
  const env = mobileDeploymentEnvironment(tenant);
  expect(tenantFromEnvironment(input.origin, env).id).toBe(42);
  expect(env.MOBILE_TENANT_CONFIGURATION).not.toContain('not-exported');
  expect(() => tenantFromEnvironment('https://medstar.example', env)).toThrow();
  expect(() => tenantFromEnvironment(input.origin, { MOBILE_TENANT_CONFIGURATION: '{broken' })).toThrow();
  expect(tenantFromEnvironment(input.origin, {})).toBeNull();
});
