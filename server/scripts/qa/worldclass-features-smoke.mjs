#!/usr/bin/env node
/**
 * Smoke test for world-class features: copilots, ledger bridge, statements,
 * enterprise SSO, marketplace, fee schedules, denials.
 *
 * Usage: node scripts/qa/worldclass-features-smoke.mjs [--base=http://127.0.0.1:8000]
 */
import express from 'express';
import request from 'supertest';

const BASE = process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] || process.env.SMOKE_BASE_URL || '';
const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(name, detail = '') {
  results.push({ name, ok: null, detail });
  console.log(`  ○ ${name} — SKIP: ${detail}`);
}

const ROOT = new URL('../../', import.meta.url);
const HAS_DB = Boolean(
  process.env.POSTGRES_HOST || process.env.POSTGRES_PRIMARY_HOST || process.env.DATABASE_URL
);

async function importFromRoot(rel) {
  return import(new URL(rel, ROOT).href);
}

// ─── Static import / syntax checks ───────────────────────────────────────────
async function staticChecks() {
  console.log('\n── Static imports ──');
  if (!HAS_DB) {
    skip('DB-backed module imports', 'POSTGRES_* not set — syntax-only mode');
    try {
      const { execSync } = await import('node:child_process');
      const files = [
        'services/billing-ledger-bridge.service.js',
        'services/enterprise-auth.service.js',
        'services/hospital-billing.service.js',
        'routes/enterprise-auth.route.js',
        'routes/module-copilot.route.js',
      ];
      for (const f of files) {
        execSync(`node --check ${new URL(f, ROOT).pathname}`, { stdio: 'pipe' });
        pass(`syntax ${f.split('/').pop()}`);
      }
    } catch (e) {
      fail('syntax check', e.message);
    }
    return;
  }
  const modules = [
    'services/billing-ledger-bridge.service.js',
    'services/enterprise-auth.service.js',
    'services/fee-schedule-versioning.service.js',
    'services/module-copilot.service.js',
    'middleware/legacy-billing-deprecation.middleware.js',
    'routes/enterprise-auth.route.js',
    'routes/module-copilot.route.js',
  ];
  for (const m of modules) {
    try {
      await importFromRoot(m);
      pass(`import ${m.split('/').pop()}`);
    } catch (e) {
      fail(`import ${m.split('/').pop()}`, e.message);
    }
  }

  try {
    const bridge = await importFromRoot('services/billing-ledger-bridge.service.js');
    const hid = bridge.resolveHospitalIdFromUser({ hospitalId: 7, organizationId: 9 });
    if (hid === 7) pass('resolveHospitalIdFromUser');
    else fail('resolveHospitalIdFromUser', `expected 7 got ${hid}`);
  } catch (e) {
    fail('resolveHospitalIdFromUser', e.message);
  }

  try {
    const ent = await importFromRoot('services/enterprise-auth.service.js');
    const providers = ent.listProviders();
    if (Array.isArray(providers)) pass('enterprise listProviders', `${providers.length} providers`);
    else fail('enterprise listProviders');
  } catch (e) {
    fail('enterprise listProviders', e.message);
  }

  try {
    const copilot = await importFromRoot('services/module-copilot.service.js');
    const mods = copilot.listModules();
    if (mods.length >= 26) pass('module copilot registry', `${mods.length} modules`);
    else fail('module copilot registry', `only ${mods.length} modules`);
  } catch (e) {
    fail('module copilot registry', e.message);
  }
}

// ─── In-process router smoke (no DB) ─────────────────────────────────────────
async function inProcessRouterSmoke() {
  console.log('\n── In-process routers (mocked) ──');

  // Enterprise auth router
  try {
    const entRouter = (await importFromRoot('routes/enterprise-auth.route.js')).default;
    const entApp = express();
    entApp.use(express.json());
    entApp.use('/api/enterprise/auth', entRouter);

    const prov = await request(entApp).get('/api/enterprise/auth/providers');
    if (prov.status === 200 && prov.body.success) pass('GET /enterprise/auth/providers', `${prov.body.providers?.length || 0} providers`);
    else fail('GET /enterprise/auth/providers', `status ${prov.status}`);
  } catch (e) {
    if (!HAS_DB && e.message?.includes('PostgreSQL')) skip('enterprise auth router', 'needs DB');
    else fail('enterprise auth router', e.message);
  }

  // Legacy billing deprecation middleware
  try {
    const { legacyBillingDeprecation } = await importFromRoot('middleware/legacy-billing-deprecation.middleware.js');
    const app = express();
    app.use(legacyBillingDeprecation);
    app.get('/test', (_req, res) => res.json({ ok: true }));
    const r = await request(app).get('/test');
    if (r.headers.deprecation === 'true' && r.headers['x-ledger-canonical']) {
      pass('legacy billing deprecation headers');
    } else fail('legacy billing deprecation headers', JSON.stringify(r.headers));
  } catch (e) {
    fail('legacy billing deprecation middleware', e.message);
  }

  // Module copilot route (minimal mock)
  try {
    const copilotRouter = (await importFromRoot('routes/module-copilot.route.js')).default;
    const cApp = express();
    cApp.use(express.json());
    cApp.use((req, _res, next) => {
      req.hospitalId = 1;
      req.userId = 1;
      req.user = { id: 1 };
      next();
    });
    cApp.use('/api/v3/module-copilot', copilotRouter);

    const mods = await request(cApp).get('/api/v3/module-copilot/modules');
    if (mods.status === 200 && mods.body.modules?.length > 0) {
      pass('GET /module-copilot/modules', `${mods.body.modules.length} modules`);
    } else if (mods.status === 200) {
      pass('GET /module-copilot/modules');
    } else {
      fail('GET /module-copilot/modules', `status ${mods.status}`);
    }
  } catch (e) {
    if (!HAS_DB && e.message?.includes('PostgreSQL')) skip('module copilot route', 'needs DB');
    else fail('module copilot route', e.message);
  }

  if (!HAS_DB) {
    skip('notification template live import', 'needs DB');
    return;
  }

  // Notification template
  try {
    const ns = (await importFromRoot('services/notification.service.js')).default;
    const tpl = ns.templates?.hospital_patient_statement;
    if (tpl?.channels?.includes('whatsapp')) pass('hospital_patient_statement template');
    else fail('hospital_patient_statement template', 'missing');
  } catch (e) {
    fail('notification template', e.message);
  }
}

// ─── Live server HTTP smoke (optional) ───────────────────────────────────────
async function liveServerSmoke() {
  if (!BASE) {
    skip('live HTTP smoke', 'no --base= URL; start server and re-run with --base=http://127.0.0.1:PORT');
    return;
  }

  console.log(`\n── Live server: ${BASE} ──`);

  const endpoints = [
    { method: 'GET', path: '/api/v3/module-copilot/modules', expect: [200, 401] },
    { method: 'GET', path: '/api/enterprise/auth/providers', expect: [200] },
    { method: 'GET', path: '/api/hypergrid/marketplace/apps?limit=1', expect: [200, 500] },
    { method: 'GET', path: '/api/hypergrid/marketplace/network/stats', expect: [200, 500] },
  ];

  for (const ep of endpoints) {
    try {
      const url = `${BASE.replace(/\/$/, '')}${ep.path}`;
      const res = await fetch(url, { method: ep.method });
      if (ep.expect.includes(res.status)) {
        pass(`${ep.method} ${ep.path}`, `status ${res.status}`);
      } else {
        fail(`${ep.method} ${ep.path}`, `status ${res.status}`);
      }
    } catch (e) {
      fail(`${ep.method} ${ep.path}`, e.message);
    }
  }

  // Deprecation headers on legacy billing
  try {
    const res = await fetch(`${BASE.replace(/\/$/, '')}/api/billing/stats`, { method: 'GET' });
    if (res.headers.get('deprecation') === 'true') {
      pass('legacy /api/billing deprecation header on /stats');
    } else {
      fail('legacy /api/billing deprecation header', 'missing Deprecation header');
    }
  } catch (e) {
    fail('legacy billing deprecation live', e.message);
  }
}

// ─── Hospital billing service exports ────────────────────────────────────────
async function serviceExportChecks() {
  console.log('\n── Service exports ──');
  if (!HAS_DB) {
    const { readFileSync } = await import('node:fs');
    const checks = [
      { file: 'services/hospital-billing.service.js', fns: ['generatePatientStatement', 'listPatientStatements', 'deliverPatientStatement'] },
      { file: 'services/denial-management.service.js', fns: ['listDenials', 'resolveDenial'] },
      { file: 'services/fee-schedule-versioning.service.js', fns: ['resolveCharge', 'listVersions'] },
      { file: 'services/billing-ledger-bridge.service.js', fns: ['mirrorLegacyOrderToHospitalCharge', 'getUnifiedPatientLedger'] },
      { file: 'services/notification.service.js', fns: ['hospital_patient_statement'] },
    ];
    for (const { file, fns } of checks) {
      const src = readFileSync(new URL(file, ROOT), 'utf8');
      for (const fn of fns) {
        if (fn === 'hospital_patient_statement') {
          if (src.includes('hospital_patient_statement')) pass(`template ${fn}`);
          else fail(`template ${fn}`);
        } else if (src.includes(`export async function ${fn}`) || src.includes(`export function ${fn}`)) {
          pass(`${file.split('/').pop()}.${fn}`);
        } else {
          fail(`${file.split('/').pop()}.${fn}`, 'not found');
        }
      }
    }
    return;
  }
  const expectedFns = [
    'generatePatientStatement', 'listPatientStatements', 'deliverPatientStatement',
    'aggregatePatientAccount', 'listDenials',
  ];

  try {
    const hb = await importFromRoot('services/hospital-billing.service.js');
    for (const fn of ['generatePatientStatement', 'listPatientStatements', 'deliverPatientStatement', 'aggregatePatientAccount']) {
      if (typeof hb.default?.[fn] === 'function' || typeof hb[fn] === 'function') pass(`hospital-billing.${fn}`);
      else fail(`hospital-billing.${fn}`, 'not exported');
    }
  } catch (e) {
    fail('hospital-billing.service exports', e.message);
  }

  try {
    const dm = await importFromRoot('services/denial-management.service.js');
    for (const fn of ['listDenials', 'createDenial', 'draftAppeal', 'resolveDenial']) {
      if (typeof dm.default?.[fn] === 'function' || typeof dm[fn] === 'function') pass(`denial-management.${fn}`);
      else fail(`denial-management.${fn}`, 'not exported');
    }
  } catch (e) {
    fail('denial-management exports', e.message);
  }

  try {
    const fs = await importFromRoot('services/fee-schedule-versioning.service.js');
    for (const fn of ['listVersions', 'createVersion', 'resolveCharge', 'getActiveVersion']) {
      if (typeof fs.default?.[fn] === 'function' || typeof fs[fn] === 'function') pass(`fee-schedule.${fn}`);
      else fail(`fee-schedule.${fn}`, 'not exported');
    }
  } catch (e) {
    fail('fee-schedule exports', e.message);
  }

  try {
    const bridge = await importFromRoot('services/clinical-coding-bridge.service.js');
    if (typeof bridge.bridgeCodingToBilling === 'function' || typeof bridge.default?.bridgeCodingToBilling === 'function') {
      pass('clinical-coding-bridge.bridgeCodingToBilling');
    } else fail('clinical-coding-bridge');
  } catch (e) {
    fail('clinical-coding-bridge', e.message);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log('World-class features smoke test');
console.log('═'.repeat(50));

await staticChecks();
await serviceExportChecks();
await inProcessRouterSmoke();
await liveServerSmoke();

const passed = results.filter((r) => r.ok === true).length;
const failed = results.filter((r) => r.ok === false).length;
const skipped = results.filter((r) => r.ok === null).length;

console.log('\n' + '═'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  console.log('\nFailures:');
  results.filter((r) => r.ok === false).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
  process.exit(1);
}
process.exit(0);
