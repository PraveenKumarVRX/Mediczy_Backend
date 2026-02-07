#!/usr/bin/env node
/**
 * MariaDB to PostgreSQL Migration Script
 * Migrates all data from MariaDB mediczy database to PostgreSQL
 */

const mysql = require('mysql2/promise');
const { Client } = require('pg');

const MYSQL_CONFIG = {
  host: 'localhost',
  user: 'mediczy',
  password: 'Mediczy2024Secure',
  database: 'mediczy'
};

const PG_CONFIG = {
  host: 'localhost',
  port: 5432,
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

async function getMariaDBSchema(mysqlConn, tableName) {
  const [rows] = await mysqlConn.query(`SHOW CREATE TABLE ${tableName}`);
  let createSQL = rows[0]['Create Table'];
  
  // Convert MySQL to PostgreSQL syntax
  createSQL = createSQL
    .replace(/`/g, '"')
    .replace(/int\(\d+\)/gi, 'INTEGER')
    .replace(/tinyint\(1\)/gi, 'BOOLEAN')
    .replace(/varchar\((\d+)\)/gi, 'VARCHAR($1)')
    .replace(/datetime/gi, 'TIMESTAMP')
    .replace(/text/gi, 'TEXT')
    .replace(/AUTO_INCREMENT/gi, '')
    .replace(/ENGINE=\w+\s*/gi, '')
    .replace(/DEFAULT CHARSET=\w+\s*/gi, '')
    .replace(/COLLATE=\w+\s*/gi, '')
    .replace(/enum\((.*?)\)/gi, (match, values) => {
      const enumName = `${tableName}_enum_${Math.random().toString(36).substr(2, 9)}`;
      return `VARCHAR(50) CHECK ("column_name" IN (${values}))`;
    });
  
  return createSQL;
}

async function createSequences(pgClient, tableName, mysqlConn) {
  try {
    const [rows] = await mysqlConn.query(`SELECT MAX(id) as max_id FROM ${tableName}`);
    const maxId = rows[0]?.max_id || 0;
    
    await pgClient.query(`CREATE SEQUENCE IF NOT EXISTS ${tableName}_id_seq START WITH ${maxId + 1}`);
    await pgClient.query(`ALTER TABLE "${tableName}" ALTER COLUMN "id" SET DEFAULT nextval('${tableName}_id_seq')`);
    await pgClient.query(`ALTER SEQUENCE ${tableName}_id_seq OWNED BY "${tableName}"."id"`);
    
    console.log(`✓ Created sequence for ${tableName} (starting at ${maxId + 1})`);
  } catch (err) {
    console.log(`  Note: ${err.message}`);
  }
}

async function migrateTableSchema(mysqlConn, pgClient, tableName) {
  console.log(`\nMigrating schema for: ${tableName}`);
  
  // Get MySQL schema
  const [rows] = await mysqlConn.query(`SHOW CREATE TABLE ${tableName}`);
  let createSQL = rows[0]['Create Table'];
  
  // Extract column definitions
  const columns = [];
  const columnRegex = /`(\w+)`\s+([^,]+)/g;
  let match;
  
  while ((match = columnRegex.exec(createSQL)) !== null) {
    const colName = match[1];
    let colDef = match[2].trim();
    
    // Skip PRIMARY KEY and UNIQUE KEY lines
    if (colName === 'PRIMARY' || colName === 'UNIQUE' || colName === 'KEY') continue;
    
    // Convert data types
    colDef = colDef
      .replace(/int\(\d+\)\s+NOT NULL AUTO_INCREMENT/i, 'SERIAL PRIMARY KEY')
      .replace(/int\(\d+\)/i, 'INTEGER')
      .replace(/tinyint\(1\)/i, 'BOOLEAN')
      .replace(/datetime/i, 'TIMESTAMP')
      .replace(/enum\((.*?)\)/i, 'VARCHAR(50)')
      .replace(/DEFAULT\s+NULL/i, 'DEFAULT NULL')
      .replace(/DEFAULT\s+(\d+)/i, 'DEFAULT $1')
      .replace(/DEFAULT\s+'([^']+)'/i, "DEFAULT '$1'");
    
    columns.push(`  "${colName}" ${colDef}`);
  }
  
  // Extract primary key
  const pkMatch = createSQL.match(/PRIMARY KEY \(`(\w+)`\)/);
  const uniqueMatches = createSQL.match(/UNIQUE KEY \w+ \(`(\w+)`\)/g);
  
  // Build CREATE TABLE
  let pgCreateSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${columns.join(',\n')}`;
  
  if (pkMatch && !createSQL.includes('AUTO_INCREMENT')) {
    pgCreateSQL += `,\n  PRIMARY KEY ("${pkMatch[1]}")`;
  }
  
  if (uniqueMatches) {
    uniqueMatches.forEach(um => {
      const uniqueCol = um.match(/\(`(\w+)`\)/)[1];
      pgCreateSQL += `,\n  UNIQUE ("${uniqueCol}")`;
    });
  }
  
  pgCreateSQL += '\n);';
  
  // Create table
  try {
    await pgClient.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
    await pgClient.query(pgCreateSQL);
    console.log(`✓ Created table: ${tableName}`);
  } catch (err) {
    console.error(`✗ Error creating ${tableName}:`, err.message);
    throw err;
  }
}

async function migrateTableData(mysqlConn, pgClient, tableName) {
  console.log(`Migrating data for: ${tableName}`);
  
  // Get all data from MySQL
  const [rows] = await mysqlConn.query(`SELECT * FROM ${tableName}`);
  
  if (rows.length === 0) {
    console.log(`  (no data to migrate)`);
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
      if (typeof val === 'boolean') return val;
      if (val instanceof Date) return val.toISOString();
      return val;
    });
    
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const insertSQL = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})`;
    
    try {
      await pgClient.query(insertSQL, values);
      successCount++;
    } catch (err) {
      console.error(`  ✗ Error inserting row:`, err.message);
      errorCount++;
    }
  }
  
  console.log(`✓ Migrated ${successCount} rows (${errorCount} errors)`);
  return successCount;
}

async function main() {
  console.log('🚀 Starting MariaDB to PostgreSQL migration...\n');
  
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  const pgClient = new Client(PG_CONFIG);
  
  try {
    await pgClient.connect();
    console.log('✓ Connected to both databases\n');
    
    let totalRows = 0;
    
    for (const tableName of TABLES_TO_MIGRATE) {
      try {
        await migrateTableSchema(mysqlConn, pgClient, tableName);
        const rowCount = await migrateTableData(mysqlConn, pgClient, tableName);
        
        if (tableName !== 'Users') { // Skip duplicate Users table
          await createSequences(pgClient, tableName, mysqlConn);
        }
        
        totalRows += rowCount;
      } catch (err) {
        console.error(`\n✗ Failed to migrate ${tableName}:`, err.message);
      }
    }
    
    console.log(`\n✅ Migration complete! Total rows migrated: ${totalRows}`);
    
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await mysqlConn.end();
    await pgClient.end();
  }
}

main();
