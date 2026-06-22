#!/usr/bin/env node
/** GAP-TEN-003 — Greenfield hospital provisioning */
import { spawn } from 'child_process';

const name = process.argv[2] || 'Greenfield Hospital';
const slug = process.argv[3] || 'greenfield-hospital';

console.log(`Provisioning tenant: ${name} (${slug})`);
const proc = spawn('node', ['scripts/add-new-tenant.cjs', slug, name], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'inherit',
});
proc.on('close', (code) => {
  if (code !== 0) process.exit(code);
  console.log('\nNext steps:');
  console.log('  1. node server/scripts/migrate-all.mjs up');
  console.log('  2. node server/scripts/greenfield/seed-10-bed-hospital.mjs', slug);
  console.log('  3. Enroll display devices via /api/v1/hospital-os/devices');
});
