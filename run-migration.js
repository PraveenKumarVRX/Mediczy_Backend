/**
 * Database Migration Runner
 * Runs the API v1 schema migration
 */

import fs from 'fs';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
  user: process.env.POSTGRES_USER || 'mediczy_helper',
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  console.log('🔄 Running API v1 schema migration...\n');
  console.log('Database:', {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
    user: process.env.POSTGRES_USER || 'mediczy_helper'
  });
  console.log('');

  const client = await pool.connect();
  
  try {
    // Read migration file
    const sql = fs.readFileSync('./server/migrations/20260206_create_api_v1_schemas.sql', 'utf8');
    
    console.log('📝 Executing migration SQL...');
    
    // Execute migration
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify tables created
    console.log('📊 Verifying tables...');
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE tablename LIKE 'api_%' 
      ORDER BY tablename
    `);
    
    console.log(`\n✅ Created ${result.rows.length} tables:\n`);
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.tablename}`);
    });
    
    console.log('\n🎉 API v1 database setup complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.position) {
      console.error('Position:', error.position);
    }
    if (error.detail) {
      console.error('Detail:', error.detail);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
