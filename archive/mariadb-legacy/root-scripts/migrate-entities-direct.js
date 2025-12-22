#!/usr/bin/env node

/**
 * Complete Entity Migration Script - Direct SQL Approach
 * Migrates ALL remaining entities from MariaDB to PostgreSQL
 */

import mysql from 'mysql2/promise';
import pkg from 'pg';
const { Client } = pkg;

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Database connections
let mariaConn, pgConn;

async function connectDatabases() {
  log('\n🔌 Connecting to databases...', 'cyan');
  
  // MariaDB connection
  mariaConn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'mediczy',
    password: 'Mediczy2024Secure',
    database: 'mediczy'
  });
  log('  ✅ MariaDB connected', 'green');
  
  // PostgreSQL connection
  pgConn = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'mediczy_helper',
    password: 'Mediczy2024Helper',
    database: 'mediczy_ai'
  });
  await pgConn.connect();
  log('  ✅ PostgreSQL connected', 'green');
}

// Migrate corporates
async function migrateCorporates() {
  log('\n📦 Migrating Corporates...', 'cyan');
  
  const [rows] = await mariaConn.query('SELECT * FROM corporates ORDER BY id');
  log(`  Found ${rows.length} corporates in MariaDB`, 'yellow');
  
  let migrated = 0;
  let skipped = 0;
  
  for (const corp of rows) {
    try {
      // Parse JSON fields safely
      const address = corp.address ? 
        (typeof corp.address === 'string' ? JSON.parse(corp.address) : corp.address) : {};
      const services = corp.services ?
        (typeof corp.services === 'string' ? JSON.parse(corp.services) : corp.services) : [];
      const metadata = corp.metadata ?
        (typeof corp.metadata === 'string' ? JSON.parse(corp.metadata) : corp.metadata) : {};
      
      await pgConn.query(`
        INSERT INTO corporates (
          id, "companyName", "contactPerson", email, "phoneNumber",
          "alternatePhone", industry, "employeeCount", "gstNumber", "panNumber",
          address, "packageType", "packageStartDate", "packageEndDate", 
          "packageAmount", services, "contractDocument", status, "leadSource",
          "assignedTo", notes, metadata, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        ON CONFLICT (email) DO UPDATE SET
          "companyName" = EXCLUDED."companyName",
          "contactPerson" = EXCLUDED."contactPerson",
          "updatedAt" = EXCLUDED."updatedAt"
      `, [
        corp.id, corp.companyName, corp.contactPerson, corp.email, corp.phoneNumber,
        corp.alternatePhone, corp.industry, corp.employeeCount, corp.gstNumber, corp.panNumber,
        JSON.stringify(address), corp.packageType || 'Standard', corp.packageStartDate, 
        corp.packageEndDate, corp.packageAmount, JSON.stringify(services), corp.contractDocument,
        corp.status || 'Pending', corp.leadSource, corp.assignedTo, corp.notes,
        JSON.stringify(metadata), corp.createdAt, corp.updatedAt
      ]);
      
      migrated++;
      process.stdout.write('.');
    } catch (err) {
      skipped++;
      log(`\n  ⚠️  Error on corporate ${corp.id}: ${err.message}`, 'yellow');
    }
  }
  
  log(`\n  ✅ Migrated: ${migrated}, Skipped: ${skipped}`, 'green');
  return { migrated, skipped, total: rows.length };
}

// Migrate nurses
async function migrateNurses() {
  log('\n👨‍⚕️ Migrating Nurses...', 'cyan');
  
  const [rows] = await mariaConn.query('SELECT * FROM nurses ORDER BY id');
  log(`  Found ${rows.length} nurses in MariaDB`, 'yellow');
  
  let migrated = 0;
  let skipped = 0;
  
  for (const nurse of rows) {
    try {
      const availability = nurse.availability ?
        (typeof nurse.availability === 'string' ? JSON.parse(nurse.availability) : nurse.availability) : {};
      const address = nurse.address ?
        (typeof nurse.address === 'string' ? JSON.parse(nurse.address) : nurse.address) : {};
      const documents = nurse.documents ?
        (typeof nurse.documents === 'string' ? JSON.parse(nurse.documents) : nurse.documents) : {};
      const metadata = nurse.metadata ?
        (typeof nurse.metadata === 'string' ? JSON.parse(nurse.metadata) : nurse.metadata) : {};
      
      await pgConn.query(`
        INSERT INTO nurses (
          id, "firstName", "lastName", email, "phoneNumber", password,
          qualification, specialization, experience, "registrationNumber",
          "licenseNumber", "workType", availability, "hourlyRate", rating,
          "totalReviews", address, documents, status, "isVerified",
          metadata, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (email) DO UPDATE SET
          "firstName" = EXCLUDED."firstName",
          "updatedAt" = EXCLUDED."updatedAt"
      `, [
        nurse.id, nurse.firstName, nurse.lastName, nurse.email, nurse.phoneNumber, nurse.password,
        nurse.qualification, nurse.specialization, nurse.experience, nurse.registrationNumber,
        nurse.licenseNumber, nurse.workType, JSON.stringify(availability), nurse.hourlyRate,
        nurse.rating || 0, nurse.totalReviews || 0, JSON.stringify(address), JSON.stringify(documents),
        nurse.status || 'pending', nurse.isVerified || false, JSON.stringify(metadata),
        nurse.createdAt, nurse.updatedAt
      ]);
      
      migrated++;
      process.stdout.write('.');
    } catch (err) {
      skipped++;
      log(`\n  ⚠️  Error on nurse ${nurse.id}: ${err.message}`, 'yellow');
    }
  }
  
  log(`\n  ✅ Migrated: ${migrated}, Skipped: ${skipped}`, 'green');
  return { migrated, skipped, total: rows.length };
}

// Migrate doctor assistants
async function migrateAssistants() {
  log('\n👔 Migrating Doctor Assistants...', 'cyan');
  
  const [rows] = await mariaConn.query('SELECT * FROM doctor_assistants ORDER BY id');
  log(`  Found ${rows.length} assistants in MariaDB`, 'yellow');
  
  let migrated = 0;
  let skipped = 0;
  
  for (const asst of rows) {
    try {
      const permissions = asst.permissions ?
        (typeof asst.permissions === 'string' ? JSON.parse(asst.permissions) : asst.permissions) : {
          canViewAppointments: true,
          canManageAppointments: true
        };
      const metadata = asst.metadata ?
        (typeof asst.metadata === 'string' ? JSON.parse(asst.metadata) : asst.metadata) : {};
      
      await pgConn.query(`
        INSERT INTO doctor_assistants (
          id, "doctorId", "firstName", "lastName", email, "phoneNumber",
          password, qualification, experience, "isActive", permissions, 
          status, "isVerified", metadata, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (email) DO UPDATE SET
          "firstName" = EXCLUDED."firstName",
          "updatedAt" = EXCLUDED."updatedAt"
      `, [
        asst.id, asst.doctorId || null, asst.firstName, asst.lastName, asst.email, asst.phoneNumber,
        asst.password, asst.qualification, asst.experience || 0, asst.isActive !== undefined ? asst.isActive : true,
        JSON.stringify(permissions), 'active', false, JSON.stringify(metadata),
        asst.createdAt, asst.updatedAt
      ]);
      
      migrated++;
      process.stdout.write('.');
    } catch (err) {
      skipped++;
      log(`\n  ⚠️  Error on assistant ${asst.id}: ${err.message}`, 'yellow');
    }
  }
  
  log(`\n  ✅ Migrated: ${migrated}, Skipped: ${skipped}`, 'green');
  return { migrated, skipped, total: rows.length };
}

// Migrate notifications
async function migrateNotifications() {
  log('\n🔔 Migrating Notifications...', 'cyan');
  
  const [rows] = await mariaConn.query('SELECT * FROM notifications ORDER BY id');
  log(`  Found ${rows.length} notifications in MariaDB`, 'yellow');
  
  let migrated = 0;
  let skipped = 0;
  
  for (const notif of rows) {
    try {
      const data = notif.data ?
        (typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data) : {};
      const metadata = notif.metadata ?
        (typeof notif.metadata === 'string' ? JSON.parse(notif.metadata) : notif.metadata) : {};
      const deliveryStatus = notif.deliveryStatus ?
        (typeof notif.deliveryStatus === 'string' ? JSON.parse(notif.deliveryStatus) : notif.deliveryStatus) : {};
      let channels = ['app'];
      if (notif.channels) {
        try {
          // Parse if string, otherwise use as-is
          const parsed = typeof notif.channels === 'string' ? JSON.parse(notif.channels) : notif.channels;
          channels = Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch (e) {
          channels = ['app'];
        }
      }
      
      await pgConn.query(`
        INSERT INTO notifications (
          id, "userId", type, title, message, data, "deepLink", "webRoute",
          priority, "isRead", "readAt", "scheduledFor", "sentAt", status,
          channels, "deliveryStatus", metadata, "expiresAt", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::text[], $16, $17, $18, $19, $20)
        ON CONFLICT (id) DO UPDATE SET
          "isRead" = EXCLUDED."isRead",
          "updatedAt" = EXCLUDED."updatedAt"
      `, [
        notif.id, notif.userId, notif.type, notif.title, notif.message, JSON.stringify(data),
        notif.deepLink, notif.webRoute, notif.priority || 'normal', notif.isRead || false,
        notif.readAt, notif.scheduledFor, notif.sentAt, notif.status || 'sent',
        channels, JSON.stringify(deliveryStatus), JSON.stringify(metadata),
        notif.expiresAt, notif.createdAt, notif.updatedAt
      ]);
      
      migrated++;
      process.stdout.write('.');
    } catch (err) {
      skipped++;
      log(`\n  ⚠️  Error on notification ${notif.id}: ${err.message}`, 'yellow');
    }
  }
  
  log(`\n  ✅ Migrated: ${migrated}, Skipped: ${skipped}`, 'green');
  return { migrated, skipped, total: rows.length };
}

// Verification
async function verifyMigration() {
  log('\n📊 Verification Report', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  const [[mariadbCounts]] = await mariaConn.query(`
    SELECT 
      (SELECT COUNT(*) FROM corporates) as corporates,
      (SELECT COUNT(*) FROM nurses) as nurses,
      (SELECT COUNT(*) FROM doctor_assistants) as assistants,
      (SELECT COUNT(*) FROM notifications) as notifications
  `);
  
  const pgCorporates = await pgConn.query('SELECT COUNT(*) FROM corporates');
  const pgNurses = await pgConn.query('SELECT COUNT(*) FROM nurses');
  const pgAssistants = await pgConn.query('SELECT COUNT(*) FROM doctor_assistants');
  const pgNotifications = await pgConn.query('SELECT COUNT(*) FROM notifications');
  
  const pgCounts = {
    corporates: parseInt(pgCorporates.rows[0].count),
    nurses: parseInt(pgNurses.rows[0].count),
    assistants: parseInt(pgAssistants.rows[0].count),
    notifications: parseInt(pgNotifications.rows[0].count)
  };
  
  log('\nMariaDB → PostgreSQL:', 'bright');
  log(`  Corporates:          ${mariadbCounts.corporates} → ${pgCounts.corporates}`, 
      mariadbCounts.corporates === pgCounts.corporates ? 'green' : 'red');
  log(`  Nurses:              ${mariadbCounts.nurses} → ${pgCounts.nurses}`,
      mariadbCounts.nurses === pgCounts.nurses ? 'green' : 'red');
  log(`  Doctor Assistants:   ${mariadbCounts.assistants} → ${pgCounts.assistants}`,
      mariadbCounts.assistants === pgCounts.assistants ? 'green' : 'red');
  log(`  Notifications:       ${mariadbCounts.notifications} → ${pgCounts.notifications}`,
      mariadbCounts.notifications === pgCounts.notifications ? 'green' : 'red');
  
  const totalMariadb = mariadbCounts.corporates + mariadbCounts.nurses + 
                       mariadbCounts.assistants + mariadbCounts.notifications;
  const totalPostgres = pgCounts.corporates + pgCounts.nurses + pgCounts.assistants + pgCounts.notifications;
  
  log('\n' + '─'.repeat(60), 'cyan');
  log(`  TOTAL:               ${totalMariadb} → ${totalPostgres}`,
      totalMariadb === totalPostgres ? 'green' : 'red');
  
  return totalMariadb === totalPostgres;
}

// Main
async function main() {
  log('\n' + '═'.repeat(60), 'bright');
  log('  🚀 Complete Entity Migration: MariaDB → PostgreSQL', 'bright');
  log('═'.repeat(60), 'bright');
  
  try {
    await connectDatabases();
    
    const results = {};
    results.corporates = await migrateCorporates();
    results.nurses = await migrateNurses();
    results.assistants = await migrateAssistants();
    results.notifications = await migrateNotifications();
    
    const verified = await verifyMigration();
    
    if (verified) {
      log('\n✅ Migration completed successfully!', 'green');
      log('\n📋 Summary:', 'bright');
      log(`  Corporates:        ${results.corporates.migrated}/${results.corporates.total}`, 'green');
      log(`  Nurses:            ${results.nurses.migrated}/${results.nurses.total}`, 'green');
      log(`  Doctor Assistants: ${results.assistants.migrated}/${results.assistants.total}`, 'green');
      log(`  Notifications:     ${results.notifications.migrated}/${results.notifications.total}`, 'green');
    } else {
      log('\n⚠️  Migration completed with mismatches', 'yellow');
    }
    
  } catch (error) {
    log(`\n❌ Migration failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    if (mariaConn) await mariaConn.end();
    if (pgConn) await pgConn.end();
  }
}

main();
