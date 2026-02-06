#!/bin/bash
# PostgreSQL Connection Test Script
# Usage: ./test-db-connection.sh

echo "🔍 Testing PostgreSQL connection..."
echo ""

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Test using Node.js
node -e "
import('pg').then(({ default: pg }) => {
  const { Pool } = pg;
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
    user: process.env.POSTGRES_USER || 'mediczy_helper',
    password: process.env.POSTGRES_PASSWORD
  });

  console.log('📡 Connection Configuration:');
  console.log('  Host:', process.env.POSTGRES_HOST || 'localhost');
  console.log('  Port:', process.env.POSTGRES_PORT || 5432);
  console.log('  Database:', process.env.POSTGRES_DATABASE || 'mediczy_ai');
  console.log('  User:', process.env.POSTGRES_USER || 'mediczy_helper');
  console.log('');

  pool.query('SELECT version()', (err, result) => {
    if (err) {
      console.error('❌ Connection failed:', err.message);
      process.exit(1);
    }
    
    console.log('✅ PostgreSQL Connection Successful!');
    console.log('');
    console.log('📊 Database Version:');
    console.log('  ', result.rows[0].version);
    console.log('');
    
    // Count tables
    pool.query(\"SELECT COUNT(*) as count FROM pg_tables WHERE tablename LIKE 'api_%'\", (err, result) => {
      if (err) {
        console.error('Error counting tables:', err.message);
      } else {
        console.log('📋 API Tables Count:', result.rows[0].count);
      }
      pool.end();
    });
  });
});
"
