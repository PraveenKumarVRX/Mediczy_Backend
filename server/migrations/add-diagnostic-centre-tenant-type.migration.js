/**
 * Add diagnostic_centre to tenants.type ENUM (PostgreSQL).
 * Safe to re-run.
 *
 * Usage:
 *   node server/migrations/add-diagnostic-centre-tenant-type.migration.js
 */
import dotenv from 'dotenv';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });
dotenv.config();

async function run() {
  await sequelize.authenticate();
  // PostgreSQL ENUM add — ignore if already present
  try {
    await sequelize.query(`ALTER TYPE "enum_tenants_type" ADD VALUE IF NOT EXISTS 'diagnostic_centre'`);
    console.log('✅ enum_tenants_type includes diagnostic_centre');
  } catch (err) {
    // Older PG without IF NOT EXISTS on ENUM
    const rows = await sequelize.query(
      `SELECT enumlabel FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'enum_tenants_type'`,
      { type: sequelize.QueryTypes.SELECT },
    );
    const labels = rows.map((r) => r.enumlabel);
    if (labels.includes('diagnostic_centre')) {
      console.log('✅ diagnostic_centre already present');
    } else {
      await sequelize.query(`ALTER TYPE "enum_tenants_type" ADD VALUE 'diagnostic_centre'`);
      console.log('✅ added diagnostic_centre to enum_tenants_type');
    }
  }
  await sequelize.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
