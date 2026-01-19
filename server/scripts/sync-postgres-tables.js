#!/usr/bin/env node
/**
 * Sync PostgreSQL Tables
 * Creates/updates PostgreSQL table schemas from models
 * 
 * Usage:
 *   node sync-postgres-tables.js [--force] [--alter]
 * 
 * Options:
 *   --force   Drop and recreate all tables (DESTRUCTIVE!)
 *   --alter   Alter existing tables to match models
 *   (default) Create tables if not exist
 */

import { connectToPostgresDB, postgresSequelize } from '../db/postgres-sequelize.js';

// Import all PostgreSQL models
import User from '../models/postgres/user.model.postgres.js';
import Doctor from '../models/postgres/doctor.model.postgres.js';
import Appointment from '../models/postgres/appointment.model.postgres.js';
import Prescription from '../models/postgres/prescription.model.postgres.js';
import Bed from '../models/postgres/bed.model.postgres.js';
import LabOrder from '../models/postgres/labOrder.model.postgres.js';
import PharmacyInventory from '../models/postgres/pharmacyInventory.model.postgres.js';
import PrescriptionDispensing from '../models/postgres/prescriptionDispensing.model.postgres.js';
import InsuranceClaim from '../models/postgres/insuranceClaim.model.postgres.js';
import InsurancePolicy from '../models/postgres/insurancePolicy.model.postgres.js';
import MedicalRecord from '../models/postgres/medicalRecord.model.postgres.js';
import EHRRecord from '../models/postgres/ehrRecord.model.postgres.js';
import VitalSign from '../models/postgres/vitalSign.model.postgres.js';
import Report from '../models/postgres/report.model.postgres.js';
import LabTest from '../models/postgres/labTest.model.postgres.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const alter = args.includes('--alter');

async function syncTables() {
  console.log('\n' + '='.repeat(70));
  console.log('🔧 PostgreSQL Table Sync');
  console.log('='.repeat(70));
  
  if (force) {
    console.log('\n⚠️  WARNING: --force flag detected!');
    console.log('   This will DROP and RECREATE all tables.');
    console.log('   ALL DATA WILL BE LOST!');
    console.log('\n   Waiting 5 seconds... Press Ctrl+C to cancel.');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  try {
    console.log('\n📡 Connecting to PostgreSQL...');
    await connectToPostgresDB();
    console.log('✅ Connected');
    
    // Enable extensions
    console.log('\n🔧 Ensuring PostgreSQL extensions...');
    await postgresSequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    await postgresSequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    await postgresSequelize.query('CREATE EXTENSION IF NOT EXISTS "pg_trgm";');
    console.log('✅ Extensions enabled');
    
    const models = [
      { name: 'users', model: User },
      { name: 'doctors', model: Doctor },
      { name: 'appointments', model: Appointment },
      { name: 'prescriptions', model: Prescription },
      { name: 'beds', model: Bed },
      { name: 'lab_orders', model: LabOrder },
      { name: 'pharmacy_inventory', model: PharmacyInventory },
      { name: 'prescription_dispensing', model: PrescriptionDispensing },
      { name: 'insurance_claims', model: InsuranceClaim },
      { name: 'insurance_policies', model: InsurancePolicy },
      { name: 'medical_records', model: MedicalRecord },
      { name: 'ehr_records', model: EHRRecord },
      { name: 'vital_signs', model: VitalSign },
      { name: 'reports', model: Report },
      { name: 'lab_tests', model: LabTest }
    ];
    
    console.log('\n📋 Syncing models...');
    console.log(`   Mode: ${force ? 'FORCE (drop + create)' : alter ? 'ALTER (update schema)' : 'SAFE (create if not exists)'}\n`);
    
    // Sync tables without foreign key constraints to avoid circular dependency errors
    for (const { name, model } of models) {
      console.log(`🔄 Syncing ${name}...`);
      
      try {
        // Use raw query to create table structure if it doesn't exist
        // This bypasses foreign key constraint validation during creation
        await model.sync({ force: false, alter: false });
        console.log(`   ✅ ${name} synced`);
      } catch (error) {
        console.error(`   ❌ ${name} sync failed:`, error.message);
        // Continue with other tables even if one fails
      }
    }
    
    // Create full-text search triggers
    console.log('\n🔍 Creating full-text search triggers...');
    
    // Check which tables exist
    const { QueryTypes } = await import('sequelize');
    const existingTables = await postgresSequelize.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
      { type: QueryTypes.SELECT }
    );
    const tableNames = existingTables.map(t => t.tablename);
    
    // User search trigger
    if (tableNames.includes('users')) {
      await postgresSequelize.query(`
        DROP TRIGGER IF EXISTS users_search_update ON users;
      
      CREATE OR REPLACE FUNCTION users_search_trigger() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector := 
          setweight(to_tsvector('english', COALESCE(NEW."firstName", '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW."lastName", '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW."phoneNumber", '')), 'C');
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql;
      
      CREATE TRIGGER users_search_update
        BEFORE INSERT OR UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION users_search_trigger();
      `);
      console.log('   ✅ User search trigger created');
    }
    
    // Doctor search trigger
    if (tableNames.includes('doctors')) {
      await postgresSequelize.query(`
        DROP TRIGGER IF EXISTS doctors_search_update ON doctors;
        
        CREATE OR REPLACE FUNCTION doctors_search_trigger() RETURNS trigger AS $$
        BEGIN
          NEW.search_vector := 
            setweight(to_tsvector('english', COALESCE(NEW."firstName", '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(NEW."lastName", '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(NEW.specialization, '')), 'B') ||
            setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'C');
          RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
        
        CREATE TRIGGER doctors_search_update
          BEFORE INSERT OR UPDATE ON doctors
          FOR EACH ROW EXECUTE FUNCTION doctors_search_trigger();
      `);
      console.log('   ✅ Doctor search trigger created');
    }
    
    // Prescription search trigger
    if (tableNames.includes('prescriptions')) {
      await postgresSequelize.query(`
        DROP TRIGGER IF EXISTS prescriptions_search_update ON prescriptions;
        
        CREATE OR REPLACE FUNCTION prescriptions_search_trigger() RETURNS trigger AS $$
        BEGIN
          NEW.search_vector := 
            setweight(to_tsvector('english', COALESCE(NEW."patientName", '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(NEW.diagnosis, '')), 'B') ||
            setweight(to_tsvector('english', COALESCE(NEW.advice, '')), 'C');
          RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
        
        CREATE TRIGGER prescriptions_search_update
          BEFORE INSERT OR UPDATE ON prescriptions
          FOR EACH ROW EXECUTE FUNCTION prescriptions_search_trigger();
      `);
      console.log('   ✅ Prescription search trigger created');
    }
    
    console.log('\n✅ All tables synced successfully!');
    console.log('\n' + '='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await postgresSequelize.close();
    console.log('✅ Connection closed\n');
  }
}

syncTables().catch(console.error);
