#!/usr/bin/env node
/**
 * GAP-MIG-001 — Unified migration orchestrator
 * Usage: node server/scripts/migrate-all.mjs [up|status]
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..');
const ROOT = path.join(SERVER, '..');

const MANIFEST = [
  { id: 'hmis-chain', cmd: 'node', args: ['run-hmis-migrations.js', 'up'], cwd: SERVER },
  { id: 'hospital-queue-os', cmd: 'node', args: ['migrations/20260617-hospital-queue-os.migration.js'], cwd: SERVER, optional: true },
  { id: 'samd-governance', cmd: 'node', args: ['migrations/samd-interpretability-governance.migration.js'], cwd: SERVER, optional: true },
  { id: 'hospital-crm-foundation', cmd: 'node', args: ['migrations/20260908000000-hospital-crm-foundation.migration.js'], cwd: SERVER },
  { id: 'hospital-crm-worldclass-domains', cmd: 'node', args: ['migrations/20260908000001-hospital-crm-worldclass-domains.migration.js'], cwd: SERVER },
  { id: 'hospital-crm-growth-automation', cmd: 'node', args: ['migrations/20260908000002-hospital-crm-growth-automation.migration.js'], cwd: SERVER },
  { id: 'hospital-crm-specialty-diagnostic-digital', cmd: 'node', args: ['migrations/20260909000000-hospital-crm-specialty-diagnostic-digital.migration.js'], cwd: SERVER },
  { id: 'hospital-crm-communication-hub', cmd: 'node', args: ['migrations/20260909000002-hospital-crm-communication-hub.migration.js'], cwd: SERVER },
  { id: 'chatwoot-tenant-bridge', cmd: 'node', args: ['migrations/20261003000000-chatwoot-bridge.migration.js'], cwd: SERVER },
  { id: 'phase1-foundations', cmd: 'node', args: ['migrations/20260926000002-phase1-foundations.migration.js'], cwd: SERVER },
  { id: 'audit-remediation', cmd: 'node', args: ['migrations/20260926000003-audit-remediation.migration.js'], cwd: SERVER },
  { id: 'health-checkup-bookings', cmd: 'node', args: ['migrations/20261015006000-health-checkup-bookings.migration.js'], cwd: SERVER },
  { id: 'crm-brightbean-chat-adoption', cmd: 'node', args: ['migrations/20261015006900-crm-brightbean-chat-adoption.migration.js'], cwd: SERVER },
];

function runStep(step) {
  return new Promise((resolve, reject) => {
    const proc = spawn(step.cmd, step.args, { cwd: step.cwd, stdio: 'inherit', shell: false });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else if (step.optional) {
        console.warn(`[migrate-all] optional step ${step.id} exited ${code} — continuing`);
        resolve();
      } else reject(new Error(`Step ${step.id} failed with code ${code}`));
    });
  });
}

async function runHmisExtended() {
  const { Sequelize } = await import('sequelize');
  const { postgresSequelize: sequelize } = await import('../db/postgres-sequelize.js');
  const qi = sequelize.getQueryInterface();
  const extra = [
    './migrations/20260617000001-create-er-visits.js',
    './migrations/20260617000002-create-charge-master.js',
    './migrations/20260617000003-create-pharmacy-dispense-queue.js',
    './migrations/20260623000001-align-hg-dicom-schema.js',
    './migrations/20260624000001-imaging-platform-phases.js',
    './migrations/20260625000001-imaging-ai-reporting.js',
    './migrations/20260626000001-imaging-interpretability-complete.js',
  ];
  for (const file of extra) {
    const name = path.basename(file);
    console.log(`  Migrating: ${name}...`);
    const mod = await import(file);
    await mod.up(qi, Sequelize).catch((e) => {
      if (e.message?.includes('already exists')) console.log(`  Skipped (exists): ${name}`);
      else throw e;
    });
    console.log(`  Done: ${name}`);
  }
}

const cmd = process.argv[2] || 'up';

if (cmd === 'status') {
  console.log('Migration manifest (GAP-MIG-001):');
  for (const m of MANIFEST) console.log(`  - ${m.id}`);
  console.log('  - hmis-extended (er_visits, charge_master, pharmacy_dispense_queue)');
  const hmisRunner = path.join(SERVER, 'run-hmis-migrations.js');
  console.log(fs.existsSync(hmisRunner) ? '\nHMIS runner: OK' : '\nHMIS runner: MISSING');
  process.exit(0);
}

console.log('[migrate-all] Starting unified migration orchestrator...\n');
for (const step of MANIFEST) {
  console.log(`\n==> ${step.id}`);
  await runStep(step);
}
console.log('\n==> hmis-extended');
await runHmisExtended();
console.log('\n[migrate-all] All steps completed.');
