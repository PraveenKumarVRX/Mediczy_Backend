/**
 * Migration: Add call initiation tracking fields to appointments table
 * Allows tracking who initiated a video call (doctor/patient) and when
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';

const addCallInitiationFields = async () => {
  const queryInterface = postgresSequelize.getQueryInterface();
  
  try {
    console.log('📞 Starting migration: Add call initiation fields to appointments table...');
    
    // Check if columns already exist
    const tableDescription = await queryInterface.describeTable('appointments');
    
    if (tableDescription.callInitiatedBy) {
      console.log('✅ callInitiatedBy column already exists in appointments table');
    } else {
      // Add callInitiatedBy field
      await queryInterface.addColumn('appointments', 'callInitiatedBy', {
        type: postgresSequelize.Sequelize.DataTypes.ENUM('doctor', 'patient'),
        allowNull: true,
        comment: 'Who initiated the video call'
      });
      
      console.log('✅ Added callInitiatedBy column');
    }

    if (tableDescription.callInitiatedAt) {
      console.log('✅ callInitiatedAt column already exists in appointments table');
    } else {
      // Add callInitiatedAt field
      await queryInterface.addColumn('appointments', 'callInitiatedAt', {
        type: postgresSequelize.Sequelize.DataTypes.DATE,
        allowNull: true,
        comment: 'When the video call was initiated'
      });
      
      console.log('✅ Added callInitiatedAt column');
    }

    // Add index for faster queries
    try {
      await queryInterface.addIndex('appointments', ['callInitiatedBy', 'callInitiatedAt'], {
        name: 'idx_appointments_call_initiation'
      });
      console.log('✅ Created index on call initiation fields');
    } catch (indexError) {
      if (indexError.message?.includes('already exists')) {
        console.log('✅ Index already exists on call initiation fields');
      } else {
        throw indexError;
      }
    }
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Execute migration
addCallInitiationFields()
  .then(() => {
    console.log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
