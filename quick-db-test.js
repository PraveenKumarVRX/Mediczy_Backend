#!/usr/bin/env node
// Quick PostgreSQL Connection Test
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

console.log('🔌 Testing EC2 PostgreSQL connection via SSH tunnel...\n');

try {
  const client = await pool.connect();
  console.log('✅ Connection successful!');
  
  const result = await client.query('SELECT version()');
  console.log('\n📊 PostgreSQL Version:');
  console.log(result.rows[0].version);
  
  const dbResult = await client.query('SELECT current_database(), current_user');
  console.log('\n📁 Database Info:');
  console.log(`   Database: ${dbResult.rows[0].current_database}`);
  console.log(`   User: ${dbResult.rows[0].current_user}`);
  
  client.release();
  await pool.end();
  
  console.log('\n✅ All checks passed! Ready to run migrations.\n');
  process.exit(0);
} catch (err) {
  console.error('❌ Connection failed:');
  console.error(err.message);
  console.error('\n💡 Troubleshooting:');
  console.error('   1. Ensure SSH tunnel is running: ps aux | grep "5433:localhost:5432"');
  console.error('   2. Check credentials in .env file');
  console.error('   3. Verify EC2 PostgreSQL is running');
  process.exit(1);
}
