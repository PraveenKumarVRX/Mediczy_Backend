#!/usr/bin/env node

/**
 * Complete Entity Migration Script
 * Migrates ALL remaining entities from MariaDB to PostgreSQL
 * 
 * Entities: corporates, nurses, doctor_assistants, notifications
 */

import { sequelize as mariadb } from './server/db/mariadb.js';
import postgresSequelize from './server/db/postgres-sequelize.js';
import Corporate from './server/models/postgres/corporate.model.postgres.js';
import Nurse from './server/models/postgres/nurse.model.postgres.js';
import DoctorAssistant from './server/models/postgres/doctor-assistant.model.postgres.js';
import Notification from './server/models/postgres/notification.model.postgres.js';

const BATCH_SIZE = 100;

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

// Sync models to create tables
async function syncModels() {
  log('\n🔧 Syncing PostgreSQL models...', 'cyan');
  
  try {
    await Corporate.sync();
    log('  ✅ Corporates table ready', 'green');
    
    await Nurse.sync();
    log('  ✅ Nurses table ready', 'green');
    
    await DoctorAssistant.sync();
    log('  ✅ Doctor Assistants table ready', 'green');
    
    await Notification.sync();
    log('  ✅ Notifications table ready', 'green');
    
    return true;
  } catch (error) {
    log(`  ❌ Model sync failed: ${error.message}`, 'red');
    return false;
  }
}

// Migrate corporates
async function migrateCorporates() {
  log('\n📦 Migrating Corporates...', 'cyan');
  
  try {
    const [mariadbCorporates] = await mariadb.query(
      'SELECT * FROM corporates ORDER BY id'
    );
    
    log(`  Found ${mariadbCorporates.length} corporates in MariaDB`, 'yellow');
    
    let migrated = 0;
    let skipped = 0;
    
    for (const corp of mariadbCorporates) {
      try {
        // Parse JSON fields
        let address = {};
        if (corp.address) {
          try {
            address = typeof corp.address === 'string' 
              ? JSON.parse(corp.address) 
              : corp.address;
          } catch (e) {
            address = {};
          }
        }
        
        let services = [];
        if (corp.services) {
          try {
            services = typeof corp.services === 'string'
              ? JSON.parse(corp.services)
              : corp.services;
          } catch (e) {
            services = [];
          }
        }
        
        await Corporate.upsert({
          id: corp.id,
          companyName: corp.companyName,
          contactPerson: corp.contactPerson,
          email: corp.email,
          phoneNumber: corp.phoneNumber,
          alternatePhone: corp.alternatePhone,
          industry: corp.industry,
          employeeCount: corp.employeeCount,
          gstNumber: corp.gstNumber,
          panNumber: corp.panNumber,
          address,
          packageType: corp.packageType || 'Standard',
          packageStartDate: corp.packageStartDate,
          packageEndDate: corp.packageEndDate,
          packageAmount: corp.packageAmount,
          services,
          contractDocument: corp.contractDocument,
          status: corp.status || 'Pending',
          leadSource: corp.leadSource,
          assignedTo: corp.assignedTo,
          notes: corp.notes,
          metadata: corp.metadata || {},
          createdAt: corp.createdAt,
          updatedAt: corp.updatedAt
        });
        
        migrated++;
        process.stdout.write('.');
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          skipped++;
          process.stdout.write('s');
        } else {
          log(`\n  ❌ Failed to migrate corporate ${corp.id}: ${err.message}`, 'red');
        }
      }
    }
    
    log(`\n  ✅ Migrated: ${migrated}, Skipped: ${skipped}`, 'green');
    return { migrated, skipped, total: mariadbCorporates.length };
    
  } catch (error) {
    log(`  ❌ Corporate migration failed: ${error.message}`, 'red');
    throw error;
  }
}

// Migrate nurses
async function migrateNurses() {
  log('\n👨‍⚕️ Migrating Nurses...', 'cyan');
  
  try {
    const [mariadbNurses] = await mariadb.query(
      'SELECT * FROM nurses ORDER BY id'
    );
    
    log(`  Found ${mariadbNurses.length} nurses in MariaDB`, 'yellow');
    
    let migrated = 0;
    let skipped = 0;
    
    for (const nurse of mariadbNurses) {
      try {
        // Parse JSON fields
        let availability = {};
        if (nurse.availability) {
          try {
            availability = typeof nurse.availability === 'string'
              ? JSON.parse(nurse.availability)
              : nurse.availability;
          } catch (e) {
            availability = {};
          }
        }
        
        let address = {};
        if (nurse.address) {
          try {
            address = typeof nurse.address === 'string'
              ? JSON.parse(nurse.address)
              : nurse.address;
          } catch (e) {
            address = {};
          }
        }
        
        let documents = {};
        if (nurse.documents) {
          try {
            documents = typeof nurse.documents === 'string'
              ? JSON.parse(nurse.documents)
              : nurse.documents;
          } catch (e) {
            documents = {};
          }
        }
        
        let metadata = {};
        if (nurse.metadata) {
          try {
            metadata = typeof nurse.metadata === 'string'
              ? JSON.parse(nurse.metadata)
              : nurse.metadata;
          } catch (e) {
            metadata = {};
          }
        }
        
        // Password is already hashed in MariaDB, preserve it
        await Nurse.upsert({
          id: nurse.id,
          firstName: nurse.firstName,
          lastName: nurse.lastName,
          email: nurse.email,
          phoneNumber: nurse.phoneNumber,
          password: nurse.password, // Already hashed
          qualification: nurse.qualification,
          specialization: nurse.specialization,
          experience: nurse.experience,
          registrationNumber: nurse.registrationNumber,
          licenseNumber: nurse.licenseNumber,
          workType: nurse.workType,
          availability,
          hourlyRate: nurse.hourlyRate,
          rating: nurse.rating || 0,
          totalReviews: nurse.totalReviews || 0,
          address,
          documents,
          status: nurse.status || 'pending',
          isVerified: nurse.isVerified || false,
          metadata,
          createdAt: nurse.createdAt,
          updatedAt: nurse.updatedAt
        }, {
          hooks: false // Skip password hashing hook since already hashed
        });
        
        migrated++;
        process.stdout.write('.');
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          skipped++;
          process.stdout.write('s');
        } else {
          log(`\n  ❌ Failed to migrate nurse ${nurse.id}: ${err.message}`, 'red');
        }
      }
    }
    
    log(`\n  ✅ Migrated: ${migrated}, Skipped: ${skipped}`, 'green');
    return { migrated, skipped, total: mariadbNurses.length };
    
  } catch (error) {
    log(`  ❌ Nurse migration failed: ${error.message}`, 'red');
    throw error;
  }
}

// Migrate doctor assistants
async function migrateAssistants() {
  log('\n👔 Migrating Doctor Assistants...', 'cyan');
  
  try {
    const [mariadbAssistants] = await mariadb.query(
      'SELECT * FROM doctor_assistants ORDER BY id'
    );
    
    log(`  Found ${mariadbAssistants.length} assistants in MariaDB`, 'yellow');
    
    let migrated = 0;
    let skipped = 0;
    
    for (const assistant of mariadbAssistants) {
      try {
        // Parse JSON fields
        let permissions = {};
        if (assistant.permissions) {
          try {
            permissions = typeof assistant.permissions === 'string'
              ? JSON.parse(assistant.permissions)
              : assistant.permissions;
          } catch (e) {
            permissions = {
              canViewAppointments: true,
              canManageAppointments: true,
              canViewPatients: true
            };
          }
        }
        
        let metadata = {};
        if (assistant.metadata) {
          try {
            metadata = typeof assistant.metadata === 'string'
              ? JSON.parse(assistant.metadata)
              : assistant.metadata;
          } catch (e) {
            metadata = {};
          }
        }
        
        // Password is already hashed in MariaDB, preserve it
        await DoctorAssistant.upsert({
          id: assistant.id,
          doctorId: assistant.doctorId,
          firstName: assistant.firstName,
          lastName: assistant.lastName,
          email: assistant.email,
          phoneNumber: assistant.phoneNumber,
          password: assistant.password, // Already hashed
          role: assistant.role || 'assistant',
          permissions,
          status: assistant.status || 'active',
          isVerified: assistant.isVerified || false,
          metadata,
          createdAt: assistant.createdAt,
          updatedAt: assistant.updatedAt
        }, {
          hooks: false // Skip password hashing hook
        });
        
        migrated++;
        process.stdout.write('.');
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          skipped++;
          process.stdout.write('s');
        } else {
          log(`\n  ❌ Failed to migrate assistant ${assistant.id}: ${err.message}`, 'red');
        }
      }
    }
    
    log(`\n  ✅ Migrated: ${migrated}, Skipped: ${skipped}`, 'green');
    return { migrated, skipped, total: mariadbAssistants.length };
    
  } catch (error) {
    log(`  ❌ Assistant migration failed: ${error.message}`, 'red');
    throw error;
  }
}

// Migrate notifications
async function migrateNotifications() {
  log('\n🔔 Migrating Notifications...', 'cyan');
  
  try {
    const [mariadbNotifications] = await mariadb.query(
      'SELECT * FROM notifications ORDER BY id'
    );
    
    log(`  Found ${mariadbNotifications.length} notifications in MariaDB`, 'yellow');
    
    let migrated = 0;
    let failed = 0;
    
    for (const notif of mariadbNotifications) {
      try {
        // Parse JSON fields
        let data = {};
        if (notif.data) {
          try {
            data = typeof notif.data === 'string'
              ? JSON.parse(notif.data)
              : notif.data;
          } catch (e) {
            data = {};
          }
        }
        
        let metadata = {};
        if (notif.metadata) {
          try {
            metadata = typeof notif.metadata === 'string'
              ? JSON.parse(notif.metadata)
              : notif.metadata;
          } catch (e) {
            metadata = {};
          }
        }
        
        let deliveryStatus = {};
        if (notif.deliveryStatus) {
          try {
            deliveryStatus = typeof notif.deliveryStatus === 'string'
              ? JSON.parse(notif.deliveryStatus)
              : notif.deliveryStatus;
          } catch (e) {
            deliveryStatus = {};
          }
        }
        
        // Parse channels array
        let channels = ['app'];
        if (notif.channels) {
          try {
            channels = typeof notif.channels === 'string'
              ? JSON.parse(notif.channels)
              : notif.channels;
          } catch (e) {
            channels = ['app'];
          }
        }
        
        await Notification.create({
          id: notif.id,
          userId: notif.userId,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          data,
          deepLink: notif.deepLink,
          webRoute: notif.webRoute,
          priority: notif.priority || 'normal',
          isRead: notif.isRead || false,
          readAt: notif.readAt,
          scheduledFor: notif.scheduledFor,
          sentAt: notif.sentAt,
          status: notif.status || 'sent',
          channels,
          deliveryStatus,
          metadata,
          expiresAt: notif.expiresAt,
          createdAt: notif.createdAt,
          updatedAt: notif.updatedAt
        });
        
        migrated++;
        process.stdout.write('.');
      } catch (err) {
        failed++;
        log(`\n  ⚠️  Failed to migrate notification ${notif.id}: ${err.message}`, 'yellow');
      }
    }
    
    log(`\n  ✅ Migrated: ${migrated}, Failed: ${failed}`, 'green');
    return { migrated, failed, total: mariadbNotifications.length };
    
  } catch (error) {
    log(`  ❌ Notification migration failed: ${error.message}`, 'red');
    throw error;
  }
}

// Verify migration
async function verifyMigration() {
  log('\n📊 Verification Report', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  try {
    // Count MariaDB records
    const [[mariadbCounts]] = await mariadb.query(`
      SELECT 
        (SELECT COUNT(*) FROM corporates) as corporates,
        (SELECT COUNT(*) FROM nurses) as nurses,
        (SELECT COUNT(*) FROM doctor_assistants) as assistants,
        (SELECT COUNT(*) FROM notifications) as notifications
    `);
    
    // Count PostgreSQL records
    const pgCorporates = await Corporate.count();
    const pgNurses = await Nurse.count();
    const pgAssistants = await DoctorAssistant.count();
    const pgNotifications = await Notification.count();
    
    log('\nMariaDB → PostgreSQL:', 'bright');
    log(`  Corporates:          ${mariadbCounts.corporates} → ${pgCorporates}`, 
        mariadbCounts.corporates === pgCorporates ? 'green' : 'red');
    log(`  Nurses:              ${mariadbCounts.nurses} → ${pgNurses}`,
        mariadbCounts.nurses === pgNurses ? 'green' : 'red');
    log(`  Doctor Assistants:   ${mariadbCounts.assistants} → ${pgAssistants}`,
        mariadbCounts.assistants === pgAssistants ? 'green' : 'red');
    log(`  Notifications:       ${mariadbCounts.notifications} → ${pgNotifications}`,
        mariadbCounts.notifications === pgNotifications ? 'green' : 'red');
    
    const totalMariadb = mariadbCounts.corporates + mariadbCounts.nurses + 
                         mariadbCounts.assistants + mariadbCounts.notifications;
    const totalPostgres = pgCorporates + pgNurses + pgAssistants + pgNotifications;
    
    log('\n' + '─'.repeat(60), 'cyan');
    log(`  TOTAL:               ${totalMariadb} → ${totalPostgres}`,
        totalMariadb === totalPostgres ? 'green' : 'red');
    
    return totalMariadb === totalPostgres;
    
  } catch (error) {
    log(`\n❌ Verification failed: ${error.message}`, 'red');
    return false;
  }
}

// Main execution
async function main() {
  log('\n' + '═'.repeat(60), 'bright');
  log('  🚀 Complete Entity Migration: MariaDB → PostgreSQL', 'bright');
  log('═'.repeat(60), 'bright');
  
  try {
    // Test connections
    log('\n🔌 Testing database connections...', 'cyan');
    await mariadb.query('SELECT 1');
    log('  ✅ MariaDB connected', 'green');
    
    await postgresSequelize.authenticate();
    log('  ✅ PostgreSQL connected', 'green');
    
    // Sync models
    const synced = await syncModels();
    if (!synced) {
      throw new Error('Model sync failed');
    }
    
    // Migrate each entity
    const results = {};
    
    results.corporates = await migrateCorporates();
    results.nurses = await migrateNurses();
    results.assistants = await migrateAssistants();
    results.notifications = await migrateNotifications();
    
    // Verify
    log('\n' + '═'.repeat(60), 'cyan');
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
      log('Please review the verification report above', 'yellow');
    }
    
    process.exit(0);
    
  } catch (error) {
    log(`\n❌ Migration failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run migration
main();
