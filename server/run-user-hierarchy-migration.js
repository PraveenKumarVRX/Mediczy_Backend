#!/usr/bin/env node
import { postgresSequelize } from './db/postgres-sequelize.js';
import { up } from './migrations/20260113000000-user-hierarchy-system.js';
import Sequelize from 'sequelize';

async function runMigration() {
  try {
    console.log('🚀 Starting User Hierarchy System Migration...');
    
    // Ensure database is connected
    await postgresSequelize.authenticate();
    console.log('✅ Database connected');
    
    // Get query interface
    const queryInterface = postgresSequelize.getQueryInterface();
    
    // Run migration
    await up(queryInterface, Sequelize);
    
    console.log('✅ User Hierarchy System Migration completed successfully!');
    console.log('\nCreated tables:');
    console.log('  - user_associations (polymorphic association table)');
    console.log('  - patients (patient profiles)');
    console.log('  - team_members (Mediqzy internal staff)');
    console.log('\nAdded columns:');
    console.log('  - DoctorAssistants.userId');
    console.log('  - Nurses.userId');
    console.log('  - Doctors.userId');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
