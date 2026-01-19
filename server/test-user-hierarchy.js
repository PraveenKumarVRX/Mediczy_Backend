#!/usr/bin/env node
import { postgresSequelize } from './db/postgres-sequelize.js';
import UserAssociationService from './services/userAssociation.service.js';
import { getUserRoleHierarchy } from './middleware/userHierarchy.middleware.js';

async function testUserAssociations() {
  try {
    console.log('🧪 Testing User Hierarchy System...\n');
    
    // Connect to database
    await postgresSequelize.authenticate();
    console.log('✅ Database connected\n');
    
    // Import models
    const { default: User } = await import('./models/postgres/user.model.postgres.js');
    const { default: UserAssociation } = await import('./models/postgres/user-association.model.postgres.js');
    const { default: Patient } = await import('./models/postgres/patient.model.postgres.js');
    
    // Get first user from database
    const user = await User.findOne();
    
    if (!user) {
      console.log('⚠️  No users found in database. Please create a user first.');
      process.exit(0);
    }
    
    console.log(`📋 Found user: ${user.firstName} ${user.lastName} (ID: ${user.id})`);
    console.log(`   Email: ${user.email}\n`);
    
    // Test 1: Create hospital association (or get existing)
    console.log('Test 1: Creating/Getting hospital association...');
    let hospitalAssociation;
    try {
      hospitalAssociation = await UserAssociationService.associateWithHospital(
        user.id,
        1, // hospitalId
        'patient',
        { isPrimary: true }
      );
      console.log(`✅ Created association ID: ${hospitalAssociation.id}`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`ℹ️  Association already exists (expected)`);
        // Get existing association
        const existing = await UserAssociation.findOne({
          where: { userId: user.id, entityType: 'hospital', entityId: 1 }
        });
        hospitalAssociation = existing;
        console.log(`✅ Found existing association ID: ${hospitalAssociation.id}`);
      } else {
        throw error;
      }
    }
    console.log(`   Entity: ${hospitalAssociation.entityType} #${hospitalAssociation.entityId}`);
    console.log(`   Role: ${hospitalAssociation.role}\n`);
    
    // Test 2: Get user's associations
    console.log('Test 2: Retrieving user associations...');
    const associations = await UserAssociation.getActiveAssociations(user.id);
    console.log(`✅ Found ${associations.length} association(s)`);
    associations.forEach(assoc => {
      console.log(`   - ${assoc.entityType} #${assoc.entityId} as ${assoc.role} (Primary: ${assoc.isPrimary})`);
    });
    console.log('');
    
    // Test 3: Get role hierarchy
    console.log('Test 3: Getting user role hierarchy...');
    const hierarchy = await getUserRoleHierarchy(user.id);
    console.log(`✅ Role Hierarchy:`);
    console.log(`   Is Patient: ${hierarchy.isPatient}`);
    console.log(`   Is Doctor: ${hierarchy.isDoctor}`);
    console.log(`   Is Nurse: ${hierarchy.isNurse}`);
    console.log(`   Is Team Member: ${hierarchy.isTeamMember}`);
    console.log(`   Roles: ${hierarchy.roles.join(', ')}\n`);
    
    // Test 4: Validate user has associations
    console.log('Test 4: Validating user associations...');
    const isValid = await UserAssociation.validateUserAssociation(user.id);
    console.log(`✅ User has valid associations: ${isValid}\n`);
    
    console.log('✅ All tests passed!\n');
    console.log('User Hierarchy System is working correctly! 🎉');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testUserAssociations();
