#!/usr/bin/env node
/**
 * Bootstrap core tables + HMIS migrations for local Hospital OS demo.
 * Usage: node server/scripts/demo/bootstrap-hospital-os-db.mjs
 */
import { spawn } from 'child_process';
import Hospital from '../../models/hospital.model.intelligent.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import pool from '../../db/pgPool.js';

const SERVER = new URL('../..', import.meta.url).pathname;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: SERVER, stdio: 'inherit' });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} failed`))));
  });
}

async function main() {
  console.log('🔧 Bootstrapping Hospital OS database...\n');
  await sequelize.authenticate();

  await Hospital.sync();
  console.log('✅ Core table: hospitals');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      "firstName" VARCHAR(100) NOT NULL DEFAULT 'Patient',
      "lastName" VARCHAR(100) NOT NULL DEFAULT '',
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      "phoneNumber" VARCHAR(20),
      "dateOfBirth" DATE DEFAULT '1990-01-01',
      gender VARCHAR(20) DEFAULT 'Other',
      status VARCHAR(20) DEFAULT 'active',
      "emailVerified" BOOLEAN DEFAULT true,
      role VARCHAR(50) DEFAULT 'user',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Core table: users');

  await run('node', ['run-hmis-migrations.js', 'up']);
  await run('node', ['migrations/20260617-hospital-queue-os.migration.js']).catch((e) => {
    console.warn('Queue migration warning:', e.message);
  });

  await run('node', ['scripts/demo/seed-hospital-os-demo.mjs']);
  console.log('\n✅ Hospital OS database bootstrap complete.');
  await pool.end();
  await sequelize.close();
}

main().catch((e) => {
  console.error('❌ Bootstrap failed:', e.message);
  process.exit(1);
});
