#!/usr/bin/env node
/**
 * Bind a demo tenant to a review-only origin so the patient mobile app can
 * actually connect — the other half of scripts/qa/ensure-play-reviewer-account.mjs.
 * =============================================================================
 * The app's first screen asks for an organisation server URL and calls
 * `GET /api/mobile/discovery` on it. Until some tenant claims that exact origin,
 * discovery answers 503 `mobile_not_configured` and the reviewer never reaches a
 * login form — which Google records as "could not access the app", a rejection.
 *
 * WHY A SEPARATE ORIGIN, NOT app.mediqzy.com
 * ------------------------------------------
 * `middleware/tenant-mobile-context.js` matches on the exact routed Host and,
 * for any origin it does match, returns 403 on every `/api/{patient,phlebotomy,
 * crm,field,team}` request whose product is not in that tenant's app list. So
 * claiming app.mediqzy.com for a patient-only config would 403 the live Team and
 * CRM portal logins on the main host. A dedicated origin keeps the blast radius
 * at exactly one hostname that nothing else uses.
 *
 * Wildcard DNS already resolves *.mediqzy.com to the edge and the default nginx
 * vhost (`server_name _`) already serves it, so no DNS, nginx or TLS change is
 * needed — verified: https://demo.mediqzy.com/api/health returns 200.
 *
 * NO RESTART. Discovery and the tenant context both resolve per request through
 * tenantMobileRepository.findByOrigin(), so this takes effect immediately.
 *
 * USAGE
 *   node scripts/ssm-env-loader.mjs scripts/qa/provision-review-mobile-origin.mjs
 *   ... --origin https://demo.mediqzy.com --clinic 11
 *   ... --dry-run     # print the configuration and write nothing
 *   ... --remove      # unbind: delete settings.mobileApps for that tenant
 *
 * ROLLBACK
 *   node scripts/ssm-env-loader.mjs scripts/qa/provision-review-mobile-origin.mjs --remove
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_ORIGIN = 'https://demo.mediqzy.com';
const DEFAULT_CLINIC_ID = 11; // tenants.metadata->>'demo' = 'true'
const PATIENT_APP_ID = 'com.mysmarthealthtech.mediczy'; // mobile/app.json android.package

function parseArgs(argv) {
  const value = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const rawClinic = value('clinic') ?? process.env.REVIEW_MOBILE_CLINIC_ID;
  if (rawClinic !== undefined && !/^[1-9][0-9]*$/.test(String(rawClinic))) {
    throw new Error(`--clinic must be a positive integer tenant id (received ${JSON.stringify(rawClinic)})`);
  }
  return {
    origin: value('origin') || process.env.REVIEW_MOBILE_ORIGIN || DEFAULT_ORIGIN,
    clinicId: rawClinic === undefined ? DEFAULT_CLINIC_ID : Number(rawClinic),
    dryRun: argv.includes('--dry-run'),
    remove: argv.includes('--remove'),
  };
}

export function buildConfiguration(origin, { registration = 'disabled' } = {}) {
  return {
    enabled: true,
    origin,
    apps: [{
      product: 'patient',
      name: 'Mediczy',
      appId: PATIENT_APP_ID,
      // 'disabled' keeps public self-signup off a demo organisation; the
      // reviewer uses the credentials filed under Play Console › App access.
      registration,
    }],
  };
}

async function main() {
  const { origin, clinicId, dryRun, remove } = parseArgs(process.argv.slice(2));

  const { default: Tenant } = await import('../../models/postgres/tenant.model.postgres.js');
  const { connectToPostgresDB, postgresSequelize } = await import('../../db/postgres-sequelize.js');
  const { tenantMobileRepository } = await import('../../services/tenant-mobile-apps.repository.js');
  const { tenantMobileDiscovery } = await import('../../services/tenant-mobile-apps.service.js');
  await connectToPostgresDB();

  try {
    const tenant = await Tenant.findByPk(clinicId);
    if (!tenant) throw new Error(`Tenant ${clinicId} does not exist.`);
    if (tenant.status !== 'active') {
      // tenantMobileDiscovery() returns null for a non-active tenant, so the
      // origin would still answer 503 — this is why medstar.mediqzy.com is dark.
      throw new Error(`Tenant ${clinicId} (${tenant.name}) is '${tenant.status}', not 'active' — discovery would still return 503.`);
    }

    if (remove) {
      const settings = { ...(tenant.settings || {}) };
      if (!settings.mobileApps) {
        console.log(`\n  Tenant ${clinicId} (${tenant.name}) has no mobileApps configuration — nothing to remove.\n`);
        return;
      }
      const removed = settings.mobileApps;
      delete settings.mobileApps;
      if (dryRun) {
        console.log(`\n  DRY RUN — would remove the binding for ${removed.origin} from tenant ${clinicId}.\n`);
        return;
      }
      await tenant.update({ settings });
      console.log(`\n  Removed the mobile binding for ${removed.origin} from tenant ${clinicId} (${tenant.name}).`);
      console.log('  That origin now answers 503 mobile_not_configured again.\n');
      return;
    }

    const current = tenant.settings?.mobileApps;
    const input = {
      ...buildConfiguration(origin),
      // repository.save() rejects a stale write; pass the revision it expects.
      revision: Number(current?.revision) || 0,
    };

    if (dryRun) {
      console.log(`\n  DRY RUN — tenant ${clinicId} (${tenant.name}), currently ${current ? `bound to ${current.origin}` : 'unbound'}:`);
      console.log(JSON.stringify(input, null, 2));
      console.log('');
      return;
    }

    const saved = await tenantMobileRepository.save(clinicId, input, 'ops-script:provision-review-mobile-origin');
    if (!saved) throw new Error(`Tenant ${clinicId} disappeared mid-write.`);

    // Re-read through the same function the HTTP endpoint uses, so the output
    // is what the app will actually receive rather than what we hoped to store.
    await tenant.reload();
    const discovery = tenantMobileDiscovery(tenant);
    if (!discovery) throw new Error('Saved, but tenantMobileDiscovery() still returns null — the origin would answer 503.');

    console.log(`\n  tenant        : ${clinicId} — ${tenant.name} (${tenant.status})`);
    console.log(`  origin        : ${saved.origin}`);
    console.log(`  revision      : ${saved.revision}`);
    console.log(`  deploymentId  : ${saved.deploymentId}`);
    console.log('\n  discovery payload the app will receive:');
    console.log(JSON.stringify(discovery, null, 2).split('\n').map((l) => `    ${l}`).join('\n'));
    console.log(`\n  Verify:  curl -s ${saved.origin}/api/mobile/discovery`);
    console.log('  Rollback: re-run this script with --remove\n');
  } finally {
    try { await postgresSequelize.close(); } catch { /* already closed */ }
  }
}

/** ssm-env-loader.mjs leaves argv[1] as itself and argv[2] as this file. */
function invokedAsScript() {
  for (const candidate of [process.argv[1], process.argv[2]]) {
    if (!candidate) continue;
    try {
      if (pathToFileURL(path.resolve(process.cwd(), candidate)).href === import.meta.url) return true;
    } catch { /* not a path */ }
  }
  return false;
}

if (invokedAsScript()) {
  main().catch((error) => {
    console.error(`\nFailed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
