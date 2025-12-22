import { connectToDb } from './db/mariadb.js';
import { connectPostgres, getPostgresStatus } from './db/postgres.js';

console.log('🔍 Testing Database Connections...');

async function testConnections() {
  try {
    // Test MariaDB
    console.log('📊 Testing MariaDB connection...');
    await connectToDb();
    console.log('✅ MariaDB connection successful');
    
    // Test PostgreSQL helper
    console.log('🗂️ Testing PostgreSQL helper connection...');
    await connectPostgres();
    const status = getPostgresStatus();
    console.log('✅ PostgreSQL helper connection successful');
    console.log('   ↳ Citus:', status.citusEnabled ? 'enabled' : 'disabled');
    console.log('   ↳ PGVector:', status.vectorEnabled ? `enabled (dim ${status.vectorDimension})` : 'disabled');
    
    console.log('🎉 All database connections working!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

testConnections();