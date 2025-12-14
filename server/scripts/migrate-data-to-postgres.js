#!/usr/bin/env node
/**
 * Data Migration Script: MariaDB → PostgreSQL
 * Migrates all data from MariaDB to PostgreSQL with validation
 * 
 * Usage:
 *   node migrate-data-to-postgres.js [options]
 * 
 * Options:
 *   --table=users       Migrate specific table only
 *   --batch-size=1000   Batch size (default: 1000)
 *   --dry-run          Test without actually migrating
 *   --validate         Validate existing data after migration
 */

import { sequelize as mariadb } from '../db/mariadb.js';
import { postgresSequelize as postgres, connectToPostgresDB } from '../db/postgres-sequelize.js';

// MariaDB Models
import UserMaria from '../models/user.model.mariadb.js';
import DoctorMaria from '../models/doctor.model.mariadb.js';
import AppointmentMaria from '../models/appointment.model.mariadb.js';
import PrescriptionMaria from '../models/prescription.model.mariadb.js';

// PostgreSQL Models
import UserPostgres from '../models/postgres/user.model.postgres.js';
import DoctorPostgres from '../models/postgres/doctor.model.postgres.js';
import AppointmentPostgres from '../models/postgres/appointment.model.postgres.js';
import PrescriptionPostgres from '../models/postgres/prescription.model.postgres.js';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  table: null,
  batchSize: 1000,
  dryRun: false,
  validate: false
};

args.forEach(arg => {
  if (arg.startsWith('--table=')) options.table = arg.split('=')[1];
  if (arg.startsWith('--batch-size=')) options.batchSize = parseInt(arg.split('=')[1]);
  if (arg === '--dry-run') options.dryRun = true;
  if (arg === '--validate') options.validate = true;
});

/**
 * Transform MariaDB record to PostgreSQL format
 */
function transformUserRecord(record) {
  // Convert allergies from TEXT to Array
  let allergies = [];
  if (record.allergies && typeof record.allergies === 'string') {
    allergies = record.allergies.split(',').map(a => a.trim()).filter(Boolean);
  }
  
  // Convert medications from TEXT to Array
  let medications = [];
  if (record.medications && typeof record.medications === 'string') {
    medications = record.medications.split(',').map(m => m.trim()).filter(Boolean);
  }
  
  return {
    ...record,
    allergies,
    medications,
    chronicConditions: [],
    medicalHistory: {},
    preferences: {},
    metadata: {},
    organization_id: null,
    organization_type: 'individual'
  };
}

function transformDoctorRecord(record) {
  // Parse weeklySchedule if it's a string
  let weeklySchedule = {};
  if (record.weeklySchedule && typeof record.weeklySchedule === 'string') {
    try {
      weeklySchedule = JSON.parse(record.weeklySchedule);
    } catch (e) {
      console.warn(`Failed to parse weeklySchedule for doctor ${record.id}`);
    }
  }
  
  return {
    ...record,
    specializations: record.specialization ? [record.specialization] : [],
    qualifications: record.qualification ? record.qualification.split(',').map(q => q.trim()) : [],
    weeklySchedule,
    reviews_json: [],
    servicesOffered: [],
    languages: ['English'],
    professionalSettings: {},
    documents: {},
    metadata: {},
    organization_id: null,
    organization_type: 'individual'
  };
}

function transformAppointmentRecord(record) {
  // Combine date and time
  let appointmentDateTime = null;
  if (record.appointmentDate && record.appointmentTime) {
    appointmentDateTime = new Date(`${record.appointmentDate}T${record.appointmentTime}`);
  }
  
  // Map column names from MariaDB to PostgreSQL - only include PostgreSQL columns
  return {
    // Don't include record.id to let PostgreSQL auto-generate
    appointmentId: record.id ? `APT-${record.id}` : null,
    patientId: record.userId, // Map userId to patientId
    doctorId: record.doctorId,
    appointmentDate: record.appointmentDate,
    appointmentTime: record.appointmentTime,
    appointmentDateTime,
    type: record.consultationType || 'online',
    duration: record.duration || 30,
    status: record.status || 'scheduled',
    patientDetails: {
      name: record.patientName,
      email: record.patientEmail,
      phone: record.patientPhone
    },
    doctorDetails: {
      name: record.doctorName,
      specialization: record.specialization
    },
    statusHistory: [{
      status: record.status,
      timestamp: record.createdAt || new Date(),
      changedBy: 'migration',
      reason: 'Migrated from MariaDB'
    }],
    symptoms: record.symptoms ? [record.symptoms] : [],
    notes_json: { 
      patient: record.reason || '',
      notes: record.notes || '',
      prescription: record.prescription || ''
    },
    paymentDetails: {
      consultationFee: record.consultationFee,
      paymentStatus: record.paymentStatus,
      paymentMethod: record.paymentMethod,
      transactionId: record.transactionId
    },
    meetingDetails: {
      meetingLink: record.meetingLink,
      meetingId: record.meetingId,
      recordingUrl: record.recordingUrl
    },
    reminders: record.reminderSent ? [{
      sent: true,
      sentAt: record.reminderSentAt
    }] : [],
    automationRules: [],
    feedback: {},
    insuranceDetails: {},
    cancellationReason: record.cancellationReason,
    cancelledBy: record.cancelledBy === 'patient' ? record.userId : record.cancelledBy === 'doctor' ? record.doctorId : null,
    cancelledAt: record.cancelledAt,
    metadata: {},
    organization_id: null,
    organization_type: null
  };
}

function transformPrescriptionRecord(record) {
  // Parse medicines if string
  let medications = [];
  if (record.medicines && typeof record.medicines === 'string') {
    try {
      medications = JSON.parse(record.medicines);
    } catch (e) {
      // If not JSON, split by newline
      medications = record.medicines.split('\n').filter(Boolean).map(med => ({
        name: med.trim(),
        dosage: '',
        frequency: '',
        duration: ''
      }));
    }
  }
  
  // Parse vitals if string
  let vitals = {};
  if (record.vitals && typeof record.vitals === 'string') {
    try {
      vitals = JSON.parse(record.vitals);
    } catch (e) {
      console.warn(`Failed to parse vitals for prescription ${record.id}`);
    }
  }
  
  // Map column names from MariaDB to PostgreSQL - only include PostgreSQL columns
  return {
    // Don't include record.id to let PostgreSQL auto-generate
    prescriptionId: record.prescriptionId || record.prescriptionNumber || `RX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    appointmentId: record.appointmentId,
    patientId: record.patientId,
    doctorId: record.doctorId,
    clinicId: null,
    patientName: record.patientName,
    age: record.patientAge, // Map patientAge to age
    gender: record.patientGender, // Map patientGender to gender
    phoneNumber: record.patientPhone,
    diagnosis: record.diagnosis,
    advice: record.instructions || record.notes,
    chiefComplaints: record.chiefComplaints ? record.chiefComplaints.split(',').map(c => c.trim()).filter(Boolean) : [],
    medications,
    vitals,
    patientDetails: {
      name: record.patientName,
      age: record.patientAge,
      gender: record.patientGender,
      phone: record.patientPhone
    },
    clinicDetails: {
      name: record.clinicName,
      address: record.clinicAddress,
      phone: record.clinicPhone,
      email: record.clinicEmail,
      doctorName: record.doctorName,
      doctorQualifications: record.doctorQualifications,
      doctorRegNo: record.doctorRegNo
    },
    diagnosisCodes: [],
    diagnosisDetails: {
      diagnosis: record.diagnosis,
      chiefComplaints: record.chiefComplaints
    },
    adviceList: record.instructions ? record.instructions.split('\n').filter(Boolean) : [],
    labTests: record.labTests ? (typeof record.labTests === 'string' ? JSON.parse(record.labTests || '[]') : []) : [],
    followUp: {
      date: record.followUpDate,
      notes: record.followUpNotes
    },
    referrals: record.referralNotes ? [{notes: record.referralNotes}] : [],
    allergies: [],
    chronicConditions: [],
    additionalNotes: {
      notes: record.notes,
      followUpNotes: record.followUpNotes,
      referralNotes: record.referralNotes
    },
    status: record.status || 'issued',
    validUntil: record.expiresAt,
    dispensedAt: record.dispensedAt,
    dispensedBy: record.dispensedBy ? parseInt(record.dispensedBy) : null,
    dispensingDetails: {
      dispensedBy: record.dispensedBy,
      dispensingNotes: record.dispensingNotes,
      pdfUrl: record.pdfUrl,
      digitalSignature: record.digitalSignature,
      signedAt: record.signedAt
    },
    metadata: {},
    organization_id: null,
    organization_type: null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

/**
 * Migrate a single table
 */
async function migrateTable(tableName, MariaModel, PostgresModel, transformFn) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔄 Migrating ${tableName}...`);
  console.log(`${'='.repeat(70)}`);
  
  const startTime = Date.now();
  
  try {
    // Get total count from MariaDB
    const totalCount = await MariaModel.count();
    console.log(`📊 Total records in MariaDB: ${totalCount}`);
    
    if (totalCount === 0) {
      console.log(`⚠️  No records to migrate for ${tableName}`);
      return { tableName, migrated: 0, errors: 0, skipped: 0, duration: 0 };
    }
    
    // Check existing count in PostgreSQL
    const existingCount = await PostgresModel.count();
    console.log(`📊 Existing records in PostgreSQL: ${existingCount}`);
    
    if (options.dryRun) {
      console.log(`🔍 DRY RUN: Would migrate ${totalCount - existingCount} new records`);
      return { tableName, migrated: 0, errors: 0, skipped: 0, duration: 0 };
    }
    
    let migrated = 0;
    let errors = 0;
    let skipped = 0;
    
    // Migrate in batches
    for (let offset = 0; offset < totalCount; offset += options.batchSize) {
      const batch = await MariaModel.findAll({
        limit: options.batchSize,
        offset: offset,
        raw: true
      });
      
      console.log(`\n📦 Processing batch ${Math.floor(offset / options.batchSize) + 1} (${batch.length} records)...`);
      
      for (const record of batch) {
        try {
          // Check if already exists
          const existing = await PostgresModel.findByPk(record.id);
          if (existing && !options.validate) {
            skipped++;
            continue;
          }
          
          // Transform record
          const transformed = transformFn(record);
          
          // Upsert to PostgreSQL
          await PostgresModel.upsert(transformed, {
            conflictFields: ['id']
          });
          
          migrated++;
          
          // Progress indicator
          if (migrated % 100 === 0) {
            const progress = ((offset + batch.indexOf(record) + 1) / totalCount * 100).toFixed(1);
            process.stdout.write(`\r✅ Progress: ${progress}% (${migrated} migrated, ${skipped} skipped, ${errors} errors)`);
          }
        } catch (error) {
          console.error(`\n❌ Error migrating ${tableName} record ${record.id}:`, error.message);
          errors++;
          
          // Continue or stop on error?
          if (errors > 10) {
            console.error(`\n🛑 Too many errors (${errors}), stopping migration for ${tableName}`);
            break;
          }
        }
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n\n✅ ${tableName} migration complete!`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Speed: ${(migrated / parseFloat(duration)).toFixed(0)} records/sec`);
    
    return { tableName, migrated, errors, skipped, duration: parseFloat(duration) };
    
  } catch (error) {
    console.error(`\n❌ Fatal error migrating ${tableName}:`, error.message);
    return { tableName, migrated: 0, errors: 1, skipped: 0, duration: 0 };
  }
}

/**
 * Validate data consistency
 */
async function validateMigration(tableName, MariaModel, PostgresModel) {
  console.log(`\n🔍 Validating ${tableName}...`);
  
  const mariaCount = await MariaModel.count();
  const postgresCount = await PostgresModel.count();
  
  const match = mariaCount === postgresCount;
  
  console.log(`   MariaDB: ${mariaCount}`);
  console.log(`   PostgreSQL: ${postgresCount}`);
  console.log(`   Status: ${match ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  if (!match) {
    console.log(`   ⚠️  Difference: ${Math.abs(mariaCount - postgresCount)} records`);
  }
  
  return match;
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 MariaDB → PostgreSQL Data Migration');
  console.log('='.repeat(70));
  console.log(`\nOptions:`);
  console.log(`  Table: ${options.table || 'ALL'}`);
  console.log(`  Batch Size: ${options.batchSize}`);
  console.log(`  Dry Run: ${options.dryRun ? 'YES' : 'NO'}`);
  console.log(`  Validate: ${options.validate ? 'YES' : 'NO'}`);
  
  try {
    // Connect to databases
    console.log('\n📡 Connecting to databases...');
    await mariadb.authenticate();
    console.log('✅ MariaDB connected');
    
    await connectToPostgresDB();
    console.log('✅ PostgreSQL connected');
    
    // Skip model sync - tables already exist
    console.log('✅ Using existing PostgreSQL tables (skip sync)');
    
    // Define migrations
    const migrations = [
      { name: 'users', maria: UserMaria, postgres: UserPostgres, transform: transformUserRecord },
      { name: 'doctors', maria: DoctorMaria, postgres: DoctorPostgres, transform: transformDoctorRecord },
      { name: 'appointments', maria: AppointmentMaria, postgres: AppointmentPostgres, transform: transformAppointmentRecord },
      { name: 'prescriptions', maria: PrescriptionMaria, postgres: PrescriptionPostgres, transform: transformPrescriptionRecord }
    ];
    
    // Filter by table if specified
    const tablesToMigrate = options.table 
      ? migrations.filter(m => m.name === options.table)
      : migrations;
    
    if (tablesToMigrate.length === 0) {
      console.error(`\n❌ Table '${options.table}' not found`);
      process.exit(1);
    }
    
    // Run migrations or validation
    const results = [];
    
    if (options.validate) {
      console.log('\n🔍 Validating data consistency...\n');
      for (const migration of tablesToMigrate) {
        const isValid = await validateMigration(
          migration.name,
          migration.maria,
          migration.postgres
        );
        results.push({ table: migration.name, valid: isValid });
      }
    } else {
      for (const migration of tablesToMigrate) {
        const result = await migrateTable(
          migration.name,
          migration.maria,
          migration.postgres,
          migration.transform
        );
        results.push(result);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(70));
    
    if (options.validate) {
      console.log('\nValidation Results:');
      results.forEach(r => {
        console.log(`  ${r.table}: ${r.valid ? '✅ VALID' : '❌ INVALID'}`);
      });
    } else {
      const totalMigrated = results.reduce((sum, r) => sum + r.migrated, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
      const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
      const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
      
      console.log(`\nTotal Migrated: ${totalMigrated}`);
      console.log(`Total Skipped: ${totalSkipped}`);
      console.log(`Total Errors: ${totalErrors}`);
      console.log(`Total Duration: ${totalDuration.toFixed(2)}s`);
      console.log(`Average Speed: ${(totalMigrated / totalDuration).toFixed(0)} records/sec`);
      
      if (totalErrors === 0) {
        console.log('\n🎉 Migration completed successfully!');
      } else {
        console.log(`\n⚠️  Migration completed with ${totalErrors} errors`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    // Close connections
    await mariadb.close();
    await postgres.close();
    console.log('\n✅ Database connections closed');
  }
}

// Run migration
runMigration().catch(console.error);
