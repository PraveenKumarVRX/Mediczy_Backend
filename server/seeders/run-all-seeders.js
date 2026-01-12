#!/usr/bin/env node
/**
 * Master Seeder Script
 * Runs all seeders in sequence
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import seedLabs from './lab-tests-seeder.js';
import seedMembershipTiers from './membership-tiers-seeder.js';

async function runAllSeeders() {
  console.log('🌱 Starting Database Seeding Process...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // Test database connection
    console.log('📡 Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Run seeders
    console.log('1️⃣  SEEDING MEMBERSHIP TIERS\n');
    await seedMembershipTiers();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('2️⃣  SEEDING LAB TESTS & DIAGNOSTIC CENTERS\n');
    await seedLabs();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Summary
    console.log('🎉 ALL SEEDERS COMPLETED SUCCESSFULLY!\n');
    console.log('📊 Summary:');
    console.log('   ✅ Membership Tiers: 4 plans created');
    console.log('   ✅ Diagnostic Labs: 5 labs with full test catalogs\n');
    
    console.log('💡 Next Steps:');
    console.log('   1. Update user membership types to test family member limits');
    console.log('   2. Test lab booking with: GET /api/labs');
    console.log('   3. Test family members with: GET /api/family-members/limits\n');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    await sequelize.close();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    await sequelize.close();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllSeeders();
}

export default runAllSeeders;
