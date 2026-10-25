import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { buildTenantMobileAdminRouter } from '../routes/tenant-mobile-admin.route.js';
import { validateMobileApps, tenantMobileDiscovery } from '../services/tenant-mobile-apps.service.js';
import { buildTenantMobileContext } from '../middleware/tenant-mobile-context.js';
import { buildMobilePatientBinding } from '../middleware/mobile-patient-binding.js';
import { buildMobileDiscoveryRouter } from '../routes/mobile-discovery.route.js';
const input = { enabled: true, origin: 'https://rado.example', revision: 0, apps: [{ product: 'patient', name: 'Rado Patient', appId: 'com.rado.patient', registration: 'open' }] };
const tenant = { id: 42, status: 'active', name: 'Rado', settings: { mobileApps: validateMobileApps(input) } };
function admin(role = 'admin') {
  const app = express(); app.use(express.json(), (req, _res, next) => { req.user = { role, email: 'admin@example.org' }; next(); });
  app.use(buildTenantMobileAdminRouter({ get: async () => tenant, save: async (_id, body) => validateMobileApps(body, tenant.settings.mobileApps) })); return app;
}
describe('admin-managed tenant apps', () => {
  test('new guard does not change unrelated legacy admin routes', async () => {
    const app = admin('org_admin');
    app.get('/tiers', (_req, res) => res.json({ existing: true }));
    expect((await request(app).get('/tiers')).status).toBe(200);
  });
  test('only platform roles can read or update configurations', async () => {
    for (const role of ['patient', 'org_admin', 'team', undefined]) {
      expect((await request(admin(role === undefined ? null : role)).get('/tenants/42/mobile-apps')).status).toBe(403);
      expect((await request(admin(role === undefined ? null : role)).put('/tenants/42/mobile-apps').send(input)).status).toBe(403);
    }
    expect((await request(admin()).get('/tenants/42/mobile-apps')).body.configuration.origin).toBe(input.origin);
  });
  test('rejects invalid URL, duplicate products, unsafe staff registration and missing collection owner', async () => {
    const cases = [{ ...input, origin: 'http://rado.example' }, { ...input, origin: 'https://rado.example/api' }, { ...input, apps: [...input.apps, input.apps[0]] }, { ...input, apps: [{ ...input.apps[0], product: 'crm' }] }, { ...input, apps: [{ ...input.apps[0], product: 'phlebo', registration: 'disabled' }] }];
    for (const body of cases) expect((await request(admin()).put('/tenants/42/mobile-apps').send(body)).status).toBe(400);
    expect((await request(admin()).put('/tenants/not-a-number/mobile-apps').send(input)).status).toBe(400);
  });
  test('deployment identity survives configuration changes and public metadata excludes audit/app secrets', () => {
    const config = validateMobileApps({ ...input, origin: 'https://new-rado.example' }, tenant.settings.mobileApps);
    expect(config.deploymentId).toBe(tenant.settings.mobileApps.deploymentId);
    expect(config.revision).toBe(2);
    const publicData = tenantMobileDiscovery(tenant);
    expect(publicData.products).toEqual([{ id: 'patient', registration: 'open' }]);
    expect(publicData.apps).toBeUndefined(); expect(publicData.updatedBy).toBeUndefined();
    expect(tenantMobileDiscovery({ ...tenant, status: 'suspended' })).toBeNull();
  });
  test('server context ignores client tenant overrides and binds patient registration', async () => {
    const app = express(); app.use(express.json());
    app.use(buildTenantMobileContext(async origin => origin === 'https://rado.example' ? tenant : null));
    app.use('/api/patient', buildMobilePatientBinding({}));
    app.post('/api/patient/signup', (req, res) => res.json({ body: req.body, tenantId: req.tenantId }));
    const res = await request(app).post('/api/patient/signup').set('Host', 'rado.example').set('X-Tenant-ID', '99').set('X-Forwarded-Host', 'evil.example').send({ clinic_id: '99', clinic_domain: 'evil.example' });
    expect(res.body).toEqual({ body: { clinic_id: '42' }, tenantId: 42 });
  });
  test('disabled products and suspended tenants fail closed', async () => {
    for (const current of [tenant, { ...tenant, status: 'suspended' }]) {
      const app = express(); app.use(buildTenantMobileContext(async () => current)); app.get('/api/crm/profile', (_req, res) => res.json({ ok: true }));
      expect((await request(app).get('/api/crm/profile').set('Host', 'rado.example')).status).toBe(403);
    }
  });
  test('discovery resolves only request host and does not fall back after resolver failure', async () => {
    const app = express(); app.use(buildMobileDiscoveryRouter({ resolveTenant: async req => req.get('host') === 'rado.example' ? tenantMobileDiscovery(tenant) : null }));
    expect((await request(app).get('/discovery').set('Host', 'rado.example')).body.displayName).toBe('Rado');
    expect((await request(app).get('/discovery').set('Host', 'unknown.example').set('X-Tenant-ID', '42')).status).toBe(503);
  });
});
