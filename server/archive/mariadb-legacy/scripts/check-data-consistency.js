#!/usr/bin/env node
/**
 * Data Consistency Checker
 * Compares MariaDB and PostgreSQL data to ensure consistency
 * 
 * Usage:
 *   node check-data-consistency.js [table-name]
 */

import { sequelize as mariadb } from '../db/mariadb.js';
import { postgresSequelize as postgres, connectToPostgresDB } from '../db/postgres-sequelize.js';

// Models
import UserMaria from '../models/user.model.mariadb.js';
import DoctorMaria from '../models/doctor.model.mariadb.js';
import AppointmentMaria from '../models/appointment.model.mariadb.js';
import PrescriptionMaria from '../models/prescription.model.mariadb.js';

import UserPostgres from '../models/postgres/user.model.postgres.js';
import DoctorPostgres from '../models/postgres/doctor.model.postgres.js';
import AppointmentPostgres from '../models/postgres/appointment.model.postgres.js';
import PrescriptionPostgres from '../models/postgres/prescription.model.postgres.js';

const tableName = process.argv[2];

async function checkConsistency(name, MariaModel, PostgresModel, sampleFields = []) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 Checking ${name}...`);
  console.log(`${'='.repeat(70)}`);
  
  // Count comparison
  const mariaCount = await MariaModel.count();
  const postgresCount = await PostgresModel.count();
  
  console.log(`\n📊 Record Counts:`);
  console.log(`   MariaDB:    ${mariaCount}`);
  console.log(`   PostgreSQL: ${postgresCount}`);
  console.log(`   Difference: ${Math.abs(mariaCount - postgresCount)}`);
  console.log(`   Status:     ${mariaCount === postgresCount ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  if (mariaCount === 0 && postgresCount === 0) {
    console.log(`\n⚠️  Both databases are empty for ${name}`);
    return { match: true, details: 'empty' };
  }
  
  // Sample record comparison
  if (sampleFields.length > 0 && mariaCount > 0) {
    console.log(`\n🔬 Sampling ${Math.min(5, mariaCount)} records...`);
    
    const mariaRecords = await MariaModel.findAll({
      limit: 5,
      raw: true,
      attributes: ['id', ...sampleFields]
    });
    
    let sampleMatches = 0;
    let sampleMismatches = 0;
    
    for (const mariaRecord of mariaRecords) {
      const postgresRecord = await PostgresModel.findByPk(mariaRecord.id, {
        raw: true,
        attributes: ['id', ...sampleFields]
      });
      
      if (!postgresRecord) {
        console.log(`   ❌ Record ${mariaRecord.id}: Missing in PostgreSQL`);
        sampleMismatches++;
        continue;
      }
      
      let fieldMatches = true;
      for (const field of sampleFields) {
        if (mariaRecord[field] !== postgresRecord[field]) {
          console.log(`   ⚠️  Record ${mariaRecord.id}: Field '${field}' differs`);
          console.log(`      MariaDB:    ${mariaRecord[field]}`);
          console.log(`      PostgreSQL: ${postgresRecord[field]}`);
          fieldMatches = false;
        }
      }
      
      if (fieldMatches) {
        sampleMatches++;
      } else {
        sampleMismatches++;
      }
    }
    
    console.log(`\n   Sample Results: ${sampleMatches} matches, ${sampleMismatches} mismatches`);
  }
  
  // Find missing IDs
  console.log(`\n🔍 Checking for missing records...`);
  const mariaIds = await MariaModel.findAll({
    attributes: ['id'],
    raw: true
  });
  const postgresIds = await PostgresModel.findAll({
    attributes: ['id'],
    raw: true
  });
  
  const mariaIdSet = new Set(mariaIds.map(r => r.id));
  const postgresIdSet = new Set(postgresIds.map(r => r.id));
  
  const missingInPostgres = [...mariaIdSet].filter(id => !postgresIdSet.has(id));
  const extraInPostgres = [...postgresIdSet].filter(id => !mariaIdSet.has(id));
  
  if (missingInPostgres.length > 0) {
    console.log(`   ❌ ${missingInPostgres.length} records missing in PostgreSQL`);
    console.log(`      IDs: ${missingInPostgres.slice(0, 10).join(', ')}${missingInPostgres.length > 10 ? '...' : ''}`);
  } else {
    console.log(`   ✅ All MariaDB records present in PostgreSQL`);
  }
  
  if (extraInPostgres.length > 0) {
    console.log(`   ⚠️  ${extraInPostgres.length} extra records in PostgreSQL`);
    console.log(`      IDs: ${extraInPostgres.slice(0, 10).join(', ')}${extraInPostgres.length > 10 ? '...' : ''}`);
  }
  
  const allMatch = mariaCount === postgresCount && missingInPostgres.length === 0 && extraInPostgres.length === 0;
  
  console.log(`\n${allMatch ? '✅' : '❌'} Overall Status: ${allMatch ? 'CONSISTENT' : 'INCONSISTENT'}`);
  
  return {
    match: allMatch,
    mariaCount,
    postgresCount,
    missingInPostgres: missingInPostgres.length,
    extraInPostgres: extraInPostgres.length
  };
}

async function runCheck() {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Data Consistency Checker: MariaDB ↔ PostgreSQL');
  console.log('='.repeat(70));
  
  try {
    // Connect
    console.log('\n📡 Connecting to databases...');
    await mariadb.authenticate();
    console.log('✅ MariaDB connected');
    
    await connectToPostgresDB();
    console.log('✅ PostgreSQL connected');
    
    const checks = [
      {
        name: 'users',
        maria: UserMaria,
        postgres: UserPostgres,
        fields: ['firstName', 'lastName', 'email', 'phoneNumber']
      },
      {
        name: 'doctors',
        maria: DoctorMaria,
        postgres: DoctorPostgres,
        fields: ['firstName', 'lastName', 'email', 'specialization']
      },
      {
        name: 'appointments',
        maria: AppointmentMaria,
        postgres: AppointmentPostgres,
        fields: ['userId', 'doctorId', 'appointmentDate', 'status']
      },
      {
        name: 'prescriptions',
        maria: PrescriptionMaria,
        postgres: PrescriptionPostgres,
        fields: ['patientId', 'doctorId', 'patientName', 'diagnosis']
      }
    ];
    
    const toCheck = tableName 
      ? checks.filter(c => c.name === tableName)
      : checks;
    
    if (toCheck.length === 0) {
      console.error(`\n❌ Table '${tableName}' not found`);
      process.exit(1);
    }
    
    const results = [];
    for (const check of toCheck) {
      const result = await checkConsistency(
        check.name,
        check.maria,
        check.postgres,
        check.fields
      );
      results.push({ name: check.name, ...result });
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 CONSISTENCY SUMMARY');
    console.log('='.repeat(70));
    
    results.forEach(r => {
      console.log(`\n${r.name}:`);
      console.log(`  MariaDB:           ${r.mariaCount}`);
      console.log(`  PostgreSQL:        ${r.postgresCount}`);
      console.log(`  Missing in PG:     ${r.missingInPostgres}`);
      console.log(`  Extra in PG:       ${r.extraInPostgres}`);
      console.log(`  Status:            ${r.match ? '✅ CONSISTENT' : '❌ INCONSISTENT'}`);
    });
    
    const allConsistent = results.every(r => r.match);
    console.log(`\n${allConsistent ? '✅' : '❌'} Overall: ${allConsistent ? 'ALL CONSISTENT' : 'INCONSISTENCIES FOUND'}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await mariadb.close();
    await postgres.close();
    console.log('\n✅ Connections closed\n');
  }
}

runCheck().catch(console.error);
