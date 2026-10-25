/**
 * Link the Smart Force mobile app's discovery origin (medstar.mediqzy.com)
 * to the Medstar Hospital tenant (central tenants.id = 70, unique_id H98VG4).
 *
 * This writes tenants.settings.mobileApps on the CENTRAL Mediqzy database
 * (not the isolated Medstar CRM database) via the same validated path the
 * admin API would use: tenantMobileRepository.save() - which takes an
 * advisory lock on the origin, rejects a duplicate origin already assigned
 * to a different tenant, and enforces optimistic concurrency via revision.
 *
 * Safe to re-run: reads the current revision first and uses it, so it
 * converges rather than conflicting with itself.
 *
 * Run: node server/scripts/ssm-env-loader.mjs server/scripts/ops/link-medstar-smartforce-mobile.mjs
 */
import { tenantMobileRepository } from '../../services/tenant-mobile-apps.repository.js';

const TENANT_ID = 70; // Medstar Hospital, unique_id H98VG4

const current = await tenantMobileRepository.get(TENANT_ID);
if (!current) {
  console.error(`❌ Tenant ${TENANT_ID} not found`);
  process.exit(1);
}
console.log('Tenant:', current.name, '| status:', current.status, '| current mobileApps:', JSON.stringify(current.settings?.mobileApps || null));

const existing = current.settings?.mobileApps || {};
const currentRevision = Number(existing.revision) || 0;
const existingApps = Array.isArray(existing.apps) ? existing.apps : [];

// The original 'crm' entry (appId com.medstarhospitals.crm) was destroyed by
// this script's first, buggy run, which replaced the whole apps array
// instead of merging into it. Restoring it explicitly from that run's
// logged output, since the DB no longer has it to read back.
const RESTORED_CRM_APP = { product: 'crm', name: 'Medstar CRM', appId: 'com.medstarhospitals.crm', registration: 'disabled' };

const input = {
  enabled: true,
  origin: 'https://medstar.mediqzy.com',
  apps: [
    ...existingApps.filter((app) => !['smart-force', 'crm'].includes(app.product)),
    RESTORED_CRM_APP,
    {
      product: 'smart-force',
      name: 'Medstar Smart Force',
      appId: 'com.medstarhospitals.smartforce',
      registration: 'disabled',
    },
  ],
  revision: currentRevision,
};

try {
  const result = await tenantMobileRepository.save(TENANT_ID, input, 'ops-script:link-medstar-smartforce');
  console.log('✅ Saved mobileApps config:', JSON.stringify(result, null, 2));
} catch (err) {
  console.error('❌ Save failed:', err.message);
  process.exit(1);
}
process.exit(0);
