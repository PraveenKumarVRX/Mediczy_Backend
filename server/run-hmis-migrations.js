#!/usr/bin/env node
/**
 * Run HMIS Patient Journey Migrations (Phase 1-5)
 * Executes all 8 migration files in order.
 * B8 fix: all migration files listed explicitly with correct names.
 * Usage: node run-hmis-migrations.js [up|down|status]
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE || 'mediczy_ai',
  process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER || 'mediczy_helper',
  process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper',
  {
    host: process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PRIMARY_PORT || process.env.POSTGRES_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false
  }
);

const MIGRATIONS = [
  { name: 'Phase 1: Create wards table',              file: './migrations/20260525000001-create-wards-table.js' },
  { name: 'Phase 1: Update beds table',               file: './migrations/20260525000002-update-beds-table.js' },
  { name: 'Phase 1: Create ip_admissions',            file: './migrations/20260525000003-create-ip-admissions.js' },
  { name: 'Phase 1: Create adt_events',               file: './migrations/20260525000004-create-adt-events.js' },
  { name: 'Phase 3: Create OT tables',                file: './migrations/20260525000005-create-ot-tables.js' },
  { name: 'Phase 2: Create eMAR tables',              file: './migrations/20260525000006-create-emar-tables.js' },
  { name: 'Phase 2: Create vitals & alerts',          file: './migrations/20260525000007-create-vitals-and-alerts.js' },
  { name: 'Phase 3-5: Clinical, discharge, follow-up',file: './migrations/20260526000001-create-hmis-phase3-5-tables.js' },
];

async function runAll() {
  await sequelize.authenticate();
  console.log('Connected to PostgreSQL\n');

  const qi = sequelize.getQueryInterface();
  const command = process.argv[2] || 'up';

  if (command === 'status') {
    console.log('Migration manifest:');
    for (const m of MIGRATIONS) {
      const { default: fs } = await import('fs');
      const exists = fs.existsSync(new URL(m.file, import.meta.url));
      console.log(`  [${exists ? 'FILE OK' : 'MISSING'}] ${m.name} — ${m.file}`);
    }
    console.log('\nRun "node run-hmis-migrations.js up" to apply.');
    return;
  }

  if (command === 'down') {
    // Rollback in reverse order
    for (const m of [...MIGRATIONS].reverse()) {
      console.log(`  Rolling back: ${m.name}...`);
      const mod = await import(m.file);
      await mod.down(qi, Sequelize).catch(e => console.warn(`  Skipped (${e.message})`));
      console.log(`  Done: ${m.name}`);
    }
    console.log('\nAll migrations rolled back.');
    return;
  }

  for (const m of MIGRATIONS) {
    console.log(`  Migrating: ${m.name}...`);
    const mod = await import(m.file);
    await mod.up(qi, Sequelize).catch(e => {
      if (e.message.includes('already exists') || e.message.includes('duplicate')) {
        console.log(`  Skipped (already exists): ${m.name}`);
      } else {
        throw e;
      }
    });
    console.log(`  Done: ${m.name}`);
  }

  console.log('\nAll HMIS migrations completed successfully.');
}

runAll()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  });
