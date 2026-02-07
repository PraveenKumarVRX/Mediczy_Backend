#!/usr/bin/env node
// Verify API v1 Tables
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'mediczy_ai',
  user: 'mediczy_helper',
  password: 'Mediczy2024Helper',
  ssl: false
});

console.log('📊 Verifying API v1 Tables...\n');

try {
  const client = await pool.connect();
  
  const result = await client.query(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename LIKE 'api_%' 
    ORDER BY tablename
  `);
  
  console.log(`✅ Created ${result.rows.length} API v1 tables:\n`);
  result.rows.forEach((row, idx) => {
    console.log(`   ${idx + 1}. ${row.tablename}`);
  });
  
  client.release();
  await pool.end();
  
  console.log('\n🎉 Database is ready for API v1!\n');
  process.exit(0);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
