#!/usr/bin/env node

import orchestrator from './server/db/orchestrator.js';
import { postgresSequelize as sequelize } from './server/db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

(async () => {
  try {
    await orchestrator.initializeAll();
    
    // List all columns in hospitals table
    const tables = await sequelize.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'hospitals' ORDER BY ordinal_position`,
      { type: QueryTypes.SELECT }
    );
    
    console.log('📋 Hospitals table columns:');
    tables.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });
    
    console.log('\n📌 Hospitals in database:');
    const hospitals = await sequelize.query(
      `SELECT id, hospital_name, network_type, status FROM hospitals LIMIT 10`,
      { type: QueryTypes.SELECT }
    );
    
    console.log(hospitals);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
