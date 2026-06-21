#!/usr/bin/env node
/**
 * Smoke test: Hospital OS queue + kiosk foundation
 * Run: node server/scripts/qa/hospital-os-queue.smoke.mjs
 */

import { up } from '../../migrations/20260617-hospital-queue-os.migration.js';
import * as queue from '../../services/hospital-queue.service.js';
import { getSSEStats } from '../../services/display-sse-broker.service.js';

let passed = 0;
let failed = 0;

function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  failed++;
  console.error(`  ✗ ${label}:`, err?.message || err);
}

async function main() {
  console.log('\nHospital OS Queue Smoke Test\n');

  try {
    await up();
    ok('migration tables created');
  } catch (e) {
    fail('migration', e);
    process.exit(1);
  }

  try {
    const entry = await queue.checkIn({
      organizationId: 1,
      department: 'opd',
      queueZone: 'opd-waiting',
      patientName: 'Smoke Test Patient',
      queueType: 'walk_in',
      chiefComplaint: 'smoke test',
    });
    if (!entry?.tokenNumber?.startsWith('A-')) throw new Error('bad token');
    ok(`check-in issued ${entry.tokenNumber}`);

    const board = await queue.getBoardSnapshot({ organizationId: 1, queueZone: 'opd-waiting' });
    if (!board.entries?.length) throw new Error('empty board');
    ok(`board snapshot ${board.entries.length} entries`);

    const uhid = await queue.allocateUhid(1);
    if (!uhid.startsWith('UHID-')) throw new Error('bad uhid');
    ok(`uhid ${uhid}`);

    const stats = getSSEStats();
    ok(`sse broker ready (clients=${stats.clients})`);
  } catch (e) {
    fail('queue operations', e);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
