#!/usr/bin/env node
/**
 * Run Email Tables Migration
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { up, down } from './migrations/20260115000000-create-email-tables.js';

dotenv.config();

const sequelize = new Sequelize(
  process.env.POSTGRES_DATABASE || 'mediczy_ai',
  process.env.POSTGRES_USER || 'mediczy_helper',
  process.env.POSTGRES_PASSWORD || (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined),
  {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    dialect: 'postgres',
    logging: console.log
  }
);

async function runMigration() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to PostgreSQL');

    const command = process.argv[2] || 'up';
    
    if (command === 'up') {
      console.log('\n🔄 Running migration UP...\n');
      await up(sequelize.getQueryInterface(), Sequelize);
      console.log('\n✅ Migration completed successfully!\n');
    } else if (command === 'down') {
      console.log('\n🔄 Running migration DOWN...\n');
      await down(sequelize.getQueryInterface(), Sequelize);
      console.log('\n✅ Migration rollback completed!\n');
    } else {
      console.log('Usage: node run-email-migration.js [up|down]');
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await sequelize.close();
    process.exit(1);
  }
}

runMigration();
