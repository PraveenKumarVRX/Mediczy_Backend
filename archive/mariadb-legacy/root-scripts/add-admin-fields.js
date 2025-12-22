#!/usr/bin/env node

/**
 * Add Admin Fields and Update Users
 * Adds isAdmin and role fields to PostgreSQL users table and updates admin users
 */

import pkg from 'pg';
const { Client } = pkg;
import mysql from 'mysql2/promise';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  log('\n═══════════════════════════════════════════════════════', 'bright');
  log('  🔧 Adding Admin Fields to PostgreSQL Users', 'bright');
  log('═══════════════════════════════════════════════════════\n', 'bright');
  
  // Connect to databases
  const pgConn = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'mediczy_helper',
    password: 'Mediczy2024Helper',
    database: 'mediczy_ai'
  });
  await pgConn.connect();
  log('✅ PostgreSQL connected', 'green');
  
  const mariaConn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'mediczy',
    password: 'Mediczy2024Secure',
    database: 'mediczy'
  });
  log('✅ MariaDB connected', 'green');
  
  try {
    // Step 1: Add columns if they don't exist
    log('\n📝 Adding admin columns...', 'cyan');
    
    try {
      await pgConn.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
      `);
      log('  ✅ Columns added', 'green');
    } catch (err) {
      log(`  ⚠️  ${err.message}`, 'yellow');
    }
    
    // Step 2: Get admin users from MariaDB
    log('\n👑 Finding admin users in MariaDB...', 'cyan');
    const [adminUsers] = await mariaConn.query(`
      SELECT id, email, isAdmin 
      FROM users 
      WHERE isAdmin = 1
    `);
    log(`  Found ${adminUsers.length} admin users`, 'yellow');
    
    // Step 3: Update PostgreSQL
    log('\n🔄 Updating admin users in PostgreSQL...', 'cyan');
    let updated = 0;
    
    for (const admin of adminUsers) {
      try {
        const result = await pgConn.query(`
          UPDATE users 
          SET "isAdmin" = true, role = 'admin'
          WHERE id = $1
          RETURNING id, email, "isAdmin", role
        `, [admin.id]);
        
        if (result.rows.length > 0) {
          updated++;
          log(`  ✅ ${admin.email} → Admin`, 'green');
        }
      } catch (err) {
        log(`  ❌ Failed to update ${admin.email}: ${err.message}`, 'red');
      }
    }
    
    log(`\n✅ Updated ${updated}/${adminUsers.length} admin users`, 'green');
    
    // Step 4: Verify
    log('\n📊 Verification...', 'cyan');
    const pgAdmins = await pgConn.query(`
      SELECT id, email, "isAdmin", role 
      FROM users 
      WHERE "isAdmin" = true
      ORDER BY id
    `);
    
    log('\nAdmin users in PostgreSQL:', 'bright');
    pgAdmins.rows.forEach(admin => {
      log(`  ${admin.id}: ${admin.email} (role: ${admin.role})`, 'green');
    });
    
    log('\n═══════════════════════════════════════════════════════', 'bright');
    log('  ✅ Admin Setup Complete!', 'green');
    log('═══════════════════════════════════════════════════════\n', 'bright');
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await pgConn.end();
    await mariaConn.end();
  }
}

main();
