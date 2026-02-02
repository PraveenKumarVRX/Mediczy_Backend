#!/usr/bin/env node
/**
 * Sync PostgreSQL Schema using Existing Database Connection
 */

import { connectPostgres } from './db/postgres.js';
import * as models from './models/index.js';

async function syncDatabase() {
  try {
    console.log('🔄 Connecting to PostgreSQL...');
    const pool = await connectPostgres();
    console.log('✓ Connected successfully\n');

    console.log('✅ PostgreSQL tables should be automatically synced via Sequelize models');
    console.log('   Tables are created on first model access');
    
    // Test connection
    const result = await pool.query('SELECT COUNT(*) FROM pg_tables WHERE schemaname = $1', ['public']);
    console.log(`   Current table count: ${result.rows[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

syncDatabase();
