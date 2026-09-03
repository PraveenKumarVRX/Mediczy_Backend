/**
 * Database Migration Script
 * Adds ABHA Health ID to users table and creates family_members table
 *
 * DANGER — DB-RDS-PLAN-2026-09-01 Workstream A-07: this script calls
 * FamilyMember.sync({ alter: true }), which mutates production schema
 * on every run. Confirmed (2026-09-03) NOT wired into any automatic
 * startup/cron path — it only runs if manually executed. Keep it that
 * way: do not import this file's logic into app.js/initialization
 * .controller.js or any route without replacing sync({alter:true}) with
 * a real migration first.
 */

import { postgresSequelize as sequelize } from './db/postgres-sequelize.js';
import User from './models/postgres/user.model.postgres.js';
import FamilyMember from './models/postgres/family-member.model.postgres.js';

async function migrateDatabase() {
  try {
    console.log('Starting database migration...');
    
    // Add ABHA field to users table (if not exists)
    console.log('Adding ABHA Health ID field to users table...');
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "abhaHealthId" VARCHAR(50) UNIQUE;
    `);
    console.log('✓ ABHA Health ID field added/verified');
    
    // Create family_members table
    console.log('Creating family_members table...');
    await FamilyMember.sync({ alter: true });
    console.log('✓ Family members table created/synced');
    
    console.log('\n✓ Database migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateDatabase();
