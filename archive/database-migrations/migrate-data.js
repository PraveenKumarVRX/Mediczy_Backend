#!/usr/bin/env node
/**
 * Migrate Data from MariaDB to PostgreSQL
 * Uses existing database connections
 */

import { connectPostgres } from './db/postgres.js';
import mysql from 'mysql2/promise';

const MYSQL_CONFIG = {
  host: 'localhost',
  user: 'mediczy',
  password: 'Mediczy2024Secure',
  database: 'mediczy'
};

const TABLES_TO_MIGRATE = [
  'users',
  'doctors',
  'nurses',
  'doctor_assistants',
  'corporates',
  'appointments',
  'prescriptions',
  'ehr_records',
  'health_diary',
  'notifications',
  'notification_preferences',
  'fcm_tokens',
  'user_violations'
];

async function migrateTableData(mysqlConn, pgPool, tableName) {
  console.log(`\nMigrating: ${tableName}`);
  
  try {
    // Get all data from MySQL
    const [rows] = await mysqlConn.query(`SELECT * FROM ${tableName}`);
    
    if (rows.length === 0) {
      console.log(`  ✓ No data to migrate`);
      return 0;
    }
    
    // Get column names
    const columns = Object.keys(rows[0]);
    const quotedColumns = columns.map(c => `"${c}"`).join(', ');
    
    let successCount = 0;
    let errorCount = 0;
    
    // Insert data row by row
    for (const row of rows) {
      const values = columns.map(col => {
        const val = row[col];
        if (val === null) return null;
        if (val instanceof Date) return val.toISOString();
        if (typeof val === 'boolean') return val;
        return val;
      });
      
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const insertSQL = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      
      try {
        await pgPool.query(insertSQL, values);
        successCount++;
      } catch (err) {
        // Try without auto-increment ID
        try {
          const noIdColumns = columns.filter(c => c !== 'id');
          const noIdValues = noIdColumns.map(col => {
            const val = row[col];
            if (val === null) return null;
            if (val instanceof Date) return val.toISOString();
            if (typeof val === 'boolean') return val;
            return val;
          });
          const noIdQuotedColumns = noIdColumns.map(c => `"${c}"`).join(', ');
          const noIdPlaceholders = noIdValues.map((_, i) => `$${i + 1}`).join(', ');
          const retrySQL = `INSERT INTO "${tableName}" (${noIdQuotedColumns}) VALUES (${noIdPlaceholders}) ON CONFLICT DO NOTHING`;
          
          await pgPool.query(retrySQL, noIdValues);
          successCount++;
        } catch (retryErr) {
          console.error(`    ✗ Row failed: ${retryErr.message}`);
          errorCount++;
        }
      }
    }
    
    console.log(`  ✓ Migrated ${successCount}/${rows.length} rows (${errorCount} skipped)`);
    return successCount;
    
  } catch (err) {
    console.error(`  ✗ Table migration failed: ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log('🚀 Starting MariaDB to PostgreSQL data migration...\n');
  
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  const pgPool = await connectPostgres();
  
  try {
    console.log('✓ Connected to both databases\n');
    
    let totalRows = 0;
    
    for (const tableName of TABLES_TO_MIGRATE) {
      const rowCount = await migrateTableData(mysqlConn, pgPool, tableName);
      totalRows += rowCount;
    }
    
    console.log(`\n✅ Migration complete! Total rows migrated: ${totalRows}`);
    console.log('\n📝 Resetting sequences...');
    
    // Reset sequences for all tables with id column
    for (const tableName of TABLES_TO_MIGRATE) {
      try {
        await pgPool.query(`SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 1), true);`);
        console.log(`  ✓ Reset sequence for ${tableName}`);
      } catch (err) {
        // Table might not have id column, skip
      }
    }
    
    console.log('\n✅ All done!');
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await mysqlConn.end();
  }
}

main();
