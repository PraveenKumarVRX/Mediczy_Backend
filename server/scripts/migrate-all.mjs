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
