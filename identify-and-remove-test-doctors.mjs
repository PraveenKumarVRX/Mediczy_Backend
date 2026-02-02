#!/usr/bin/env node
/**
 * Safe Test Doctor Removal Script
 * Identifies and removes test doctor accounts with proper dependency handling
 * 
 * Usage: node identify-and-remove-test-doctors.mjs [--dry-run] [--force]
 */

import pkg from 'pg';
const { Client } = pkg;
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Simple .env parser
function loadEnv() {
  try {
    const envPath = join(__dirname, '.env');
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (error) {
    // .env file not found, will use environment variables
  }
}

loadEnv();

const config = {
  host: process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PRIMARY_PORT || process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE || 'mediczy_ai',
  user: process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER || 'mediczy_helper',
  password: process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD,
};

const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

console.log('🔍 Test Doctor Removal Script');
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : isForce ? 'FORCE DELETE' : 'INTERACTIVE'}`);
console.log('================================\n');

const testPatterns = {
  emails: [
    '%test%',
    '%demo%',
    '%sample%',
    '%fake%',
    '%temp%',
    '%example%',
    '%delete%',
    '%dummy%',
    '%@test.%',
    '%@example.%',
    '%@mailinator.%',
    '%@tempmail.%'
  ],
  names: [
    '%test%',
    '%demo%',
    '%sample%',
    '%fake%',
    '%dummy%'
  ]
};

async function identifyTestDoctors(client) {
  console.log('📋 Identifying test doctors...\n');
  
  // Build email conditions with proper PostgreSQL placeholders
  const emailConditions = testPatterns.emails.map((_, i) => 
    `LOWER(email) LIKE LOWER($${i + 1})`
  ).join(' OR ');
  
  // Build name conditions
  const nameStartIndex = testPatterns.emails.length + 1;
  const nameConditions = testPatterns.names.map((_, i) => {
    const idx = nameStartIndex + (i * 2);
    return `(LOWER("firstName") LIKE LOWER($${idx}) OR LOWER("lastName") LIKE LOWER($${idx + 1}))`;
  }).join(' OR ');
  
  const query = `
    SELECT 
      id,
      uid,
      unique_id,
      "firstName",
      "lastName",
      email,
      "phoneNumber",
      "isVerified",
      "createdAt",
      organization_id
    FROM doctors
    WHERE 
      (${emailConditions})
      OR (${nameConditions})
      OR ("isVerified" = false AND "createdAt" < NOW() - INTERVAL '30 days')
    AND LOWER(email) != 'doctor@mediczy.com'
    ORDER BY "createdAt" DESC
  `;
  
  const params = [
    ...testPatterns.emails,
    ...testPatterns.names.flatMap(pattern => [pattern, pattern])
  ];
  
  const result = await client.query(query, params);
  return result.rows;
}

async function checkDependencies(client, doctorId) {
  const dependencies = {
    appointments: 0,
    prescriptions: 0,
    consultations: 0,
    availabilities: 0,
    assistants: 0,
    clinicalNotes: 0,
    carePlans: 0,
    delegationLogs: 0,
    primaryDoctorFor: 0
  };

  // Helper function to safely check table
  const safeCount = async (query, params) => {
    try {
      const result = await client.query(query, params);
      return parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      // Table/column might not exist, return 0
      return 0;
    }
  };

  // Check appointments
  dependencies.appointments = await safeCount(
    'SELECT COUNT(*) as count FROM appointments WHERE "doctorId" = $1',
    [doctorId]
  );

  // Check prescriptions
  dependencies.prescriptions = await safeCount(
    'SELECT COUNT(*) as count FROM prescriptions WHERE "doctorId" = $1',
    [doctorId]
  );

  // Check consultations
  dependencies.consultations = await safeCount(
    'SELECT COUNT(*) as count FROM consultation_recordings WHERE "doctorId" = $1',
    [doctorId]
  );

  // Check doctor availabilities (might be doctor_availabilities or doctorAvailabilities)
  dependencies.availabilities = await safeCount(
    'SELECT COUNT(*) as count FROM "doctorAvailabilities" WHERE doctor_id = $1',
    [doctorId]
  );

  // Check assistants
  dependencies.assistants = await safeCount(
    'SELECT COUNT(*) as count FROM assistants WHERE "doctorId" = $1',
    [doctorId]
  );

  // Check clinical notes
  dependencies.clinicalNotes = await safeCount(
    'SELECT COUNT(*) as count FROM clinical_notes WHERE "doctorId" = $1',
    [doctorId]
  );

  // Check care plans
  dependencies.carePlans = await safeCount(
    'SELECT COUNT(*) as count FROM care_plans WHERE "doctorId" = $1',
    [doctorId]
  );

  // Check delegation logs
  dependencies.delegationLogs = await safeCount(
    'SELECT COUNT(*) as count FROM delegation_logs WHERE "doctorId" = $1',
    [doctorId]
  );

  // Check if primary doctor for any users
  dependencies.primaryDoctorFor = await safeCount(
    'SELECT COUNT(*) as count FROM users WHERE primary_doctor_id = $1',
    [doctorId]
  );

  return dependencies;
}

async function deleteDoctor(client, doctor) {
  console.log(`\n🗑️  Deleting doctor: ${doctor.firstName} ${doctor.lastName} (${doctor.email})`);
  
  // Helper to safely delete from table that might not exist
  const safeDelete = async (tableName, column, id) => {
    try {
      const result = await client.query(
        `DELETE FROM ${tableName} WHERE ${column} = $1`,
        [id]
      );
      return result.rowCount;
    } catch (error) {
      // Rollback and restart transaction if error occurs
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      return 0;
    }
  };

  const safeUpdate = async (query, params) => {
    try {
      const result = await client.query(query, params);
      return result.rowCount;
    } catch (error) {
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      return 0;
    }
  };

  try {
    await client.query('BEGIN');

    // Delete in proper order (respecting foreign key constraints)
    
    // 1. Remove as primary doctor for users (use SET NULL to avoid constraint)
    const updateUsers = await safeUpdate(
      'UPDATE users SET primary_doctor_id = NULL WHERE primary_doctor_id = $1 RETURNING id',
      [doctor.id]
    );
    if (updateUsers > 0) {
      console.log(`   ✓ Removed as primary doctor for ${updateUsers} users`);
    }
    
    // Ensure the update is committed before proceeding
    await client.query('COMMIT');
    await client.query('BEGIN');

    // 2. Delete delegation logs (if table exists)
    const deleteDelegationLogs = await safeDelete('delegation_logs', '"doctorId"', doctor.id);
    if (deleteDelegationLogs > 0) {
      console.log(`   ✓ Deleted ${deleteDelegationLogs} delegation logs`);
    }

    // 3. Delete care plans
    const deleteCarePlans = await safeDelete('care_plans', '"doctorId"', doctor.id);
    if (deleteCarePlans > 0) {
      console.log(`   ✓ Deleted ${deleteCarePlans} care plans`);
    }

    // 4. Delete clinical notes
    const deleteClinicalNotes = await safeDelete('clinical_notes', '"doctorId"', doctor.id);
    if (deleteClinicalNotes > 0) {
      console.log(`   ✓ Deleted ${deleteClinicalNotes} clinical notes`);
    }

    // 5. Delete assistants
    const deleteAssistants = await safeDelete('assistants', '"doctorId"', doctor.id);
    if (deleteAssistants > 0) {
      console.log(`   ✓ Deleted ${deleteAssistants} assistants`);
    }

    // 6. Delete doctor availabilities (try both column names)
    let deleteAvailabilities = await safeDelete('"doctorAvailabilities"', 'doctor_id', doctor.id);
    if (deleteAvailabilities === 0) {
      deleteAvailabilities = await safeDelete('doctor_availabilities', 'doctor_id', doctor.id);
    }
    if (deleteAvailabilities > 0) {
      console.log(`   ✓ Deleted ${deleteAvailabilities} availabilities`);
    }

    // 7. Delete consultation recordings
    const deleteRecordings = await safeDelete('consultation_recordings', '"doctorId"', doctor.id);
    if (deleteRecordings > 0) {
      console.log(`   ✓ Deleted ${deleteRecordings} consultation recordings`);
    }

    // 8. Delete prescriptions
    const deletePrescriptions = await safeDelete('prescriptions', '"doctorId"', doctor.id);
    if (deletePrescriptions > 0) {
      console.log(`   ✓ Deleted ${deletePrescriptions} prescriptions`);
    }

    // 9. Delete appointments
    const deleteAppointments = await safeDelete('appointments', '"doctorId"', doctor.id);
    if (deleteAppointments > 0) {
      console.log(`   ✓ Deleted ${deleteAppointments} appointments`);
    }

    // 10. Finally, delete the doctor
    const result = await client.query(
      'DELETE FROM doctors WHERE id = $1',
      [doctor.id]
    );
    
    if (result.rowCount > 0) {
      console.log(`   ✅ Doctor deleted successfully`);
    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`   ❌ Error deleting doctor: ${error.message}`);
    return false;
  }
}

async function main() {
  const client = new Client(config);
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Step 1: Identify test doctors
    const testDoctors = await identifyTestDoctors(client);
    
    if (testDoctors.length === 0) {
      console.log('✅ No test doctors found!');
      return;
    }

    console.log(`Found ${testDoctors.length} potential test doctor(s):\n`);

    // Step 2: Display each doctor with dependencies
    const doctorsWithDeps = [];
    for (const doctor of testDoctors) {
      const deps = await checkDependencies(client, doctor.id);
      const totalDeps = Object.values(deps).reduce((sum, count) => sum + count, 0);
      
      doctorsWithDeps.push({ doctor, deps, totalDeps });
      
      console.log(`\n📌 Doctor #${doctor.id}:`);
      console.log(`   Name: ${doctor.firstName} ${doctor.lastName}`);
      console.log(`   Email: ${doctor.email}`);
      console.log(`   Phone: ${doctor.phoneNumber}`);
      console.log(`   Verified: ${doctor.isVerified ? '✅' : '❌'}`);
      console.log(`   Created: ${new Date(doctor.createdAt).toLocaleDateString()}`);
      console.log(`   Organization: ${doctor.organization_id || 'None'}`);
      
      if (totalDeps > 0) {
        console.log(`   \n   📊 Dependencies (${totalDeps} total):`);
        if (deps.appointments > 0) console.log(`      - Appointments: ${deps.appointments}`);
        if (deps.prescriptions > 0) console.log(`      - Prescriptions: ${deps.prescriptions}`);
        if (deps.consultations > 0) console.log(`      - Consultations: ${deps.consultations}`);
        if (deps.availabilities > 0) console.log(`      - Availabilities: ${deps.availabilities}`);
        if (deps.assistants > 0) console.log(`      - Assistants: ${deps.assistants}`);
        if (deps.clinicalNotes > 0) console.log(`      - Clinical Notes: ${deps.clinicalNotes}`);
        if (deps.carePlans > 0) console.log(`      - Care Plans: ${deps.carePlans}`);
        if (deps.delegationLogs > 0) console.log(`      - Delegation Logs: ${deps.delegationLogs}`);
        if (deps.primaryDoctorFor > 0) console.log(`      - Primary Doctor For: ${deps.primaryDoctorFor} users`);
      } else {
        console.log(`   ✅ No dependencies (safe to delete)`);
      }
    }

    // Step 3: Perform deletion
    if (isDryRun) {
      console.log('\n\n🔵 DRY RUN MODE - No changes made');
      console.log(`Would delete ${testDoctors.length} doctor(s)`);
      return;
    }

    if (!isForce) {
      console.log('\n\n⚠️  To delete these doctors, run with --force flag');
      console.log('   node identify-and-remove-test-doctors.mjs --force');
      return;
    }

    console.log('\n\n🔴 FORCE MODE - Proceeding with deletion...\n');
    
    let successCount = 0;
    let failCount = 0;

    for (const { doctor } of doctorsWithDeps) {
      const success = await deleteDoctor(client, doctor);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    console.log('\n\n================================');
    console.log('📊 Deletion Summary:');
    console.log(`   ✅ Successfully deleted: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log('================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
    console.log('👋 Database connection closed');
  }
}

main();
