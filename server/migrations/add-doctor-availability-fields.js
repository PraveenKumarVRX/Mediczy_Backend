/**
 * Migration: Add weeklyAvailability and consultationTypes to doctors table
 * These fields are essential for the appointment booking system
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';

const addDoctorAvailabilityFields = async () => {
  const queryInterface = postgresSequelize.getQueryInterface();
  
  try {
    console.log('📅 Starting migration: Add doctor availability fields...');
    
    // Check if columns already exist
    const tableDescription = await queryInterface.describeTable('doctors');
    
    // Add weeklyAvailability column
    if (!tableDescription.weeklyAvailability) {
      await queryInterface.addColumn('doctors', 'weeklyAvailability', {
        type: postgresSequelize.Sequelize.DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          monday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
          tuesday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
          wednesday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
          thursday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
          friday: { isAvailable: true, slots: [{ startTime: '09:00', endTime: '17:00', consultationType: 'both' }] },
          saturday: { isAvailable: false, slots: [] },
          sunday: { isAvailable: false, slots: [] }
        },
        comment: 'Weekly availability schedule with time slots'
      });
      console.log('✅ Added weeklyAvailability column');
    } else {
      console.log('✅ weeklyAvailability column already exists');
    }

    // Add consultationTypes column
    if (!tableDescription.consultationTypes) {
      await queryInterface.addColumn('doctors', 'consultationTypes', {
        type: postgresSequelize.Sequelize.DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          online: { available: true, fee: 500 },
          walkIn: { available: true, fee: 600 },
          homeVisit: { available: false, fee: 1000 }
        },
        comment: 'Consultation types offered and their fees'
      });
      console.log('✅ Added consultationTypes column');
    } else {
      console.log('✅ consultationTypes column already exists');
    }

    // Update existing doctors with default values if null
    await postgresSequelize.query(`
      UPDATE doctors 
      SET "weeklyAvailability" = COALESCE(
        "weeklyAvailability",
        '{
          "monday": {"isAvailable": true, "slots": [{"startTime": "09:00", "endTime": "17:00", "consultationType": "both"}]},
          "tuesday": {"isAvailable": true, "slots": [{"startTime": "09:00", "endTime": "17:00", "consultationType": "both"}]},
          "wednesday": {"isAvailable": true, "slots": [{"startTime": "09:00", "endTime": "17:00", "consultationType": "both"}]},
          "thursday": {"isAvailable": true, "slots": [{"startTime": "09:00", "endTime": "17:00", "consultationType": "both"}]},
          "friday": {"isAvailable": true, "slots": [{"startTime": "09:00", "endTime": "17:00", "consultationType": "both"}]},
          "saturday": {"isAvailable": false, "slots": []},
          "sunday": {"isAvailable": false, "slots": []}
        }'::jsonb
      )
      WHERE "weeklyAvailability" IS NULL;
    `);
    console.log('✅ Updated existing doctors with default weeklyAvailability');

    await postgresSequelize.query(`
      UPDATE doctors 
      SET "consultationTypes" = COALESCE(
        "consultationTypes",
        '{
          "online": {"available": true, "fee": 500},
          "walkIn": {"available": true, "fee": 600},
          "homeVisit": {"available": false, "fee": 1000}
        }'::jsonb
      )
      WHERE "consultationTypes" IS NULL;
    `);
    console.log('✅ Updated existing doctors with default consultationTypes');

    // Create GIN indexes for JSONB columns for better query performance
    try {
      await queryInterface.addIndex('doctors', ['weeklyAvailability'], {
        name: 'idx_doctors_weekly_availability',
        using: 'GIN'
      });
      console.log('✅ Created GIN index on weeklyAvailability');
    } catch (indexError) {
      if (indexError.message?.includes('already exists')) {
        console.log('✅ Index already exists on weeklyAvailability');
      } else {
        throw indexError;
      }
    }

    try {
      await queryInterface.addIndex('doctors', ['consultationTypes'], {
        name: 'idx_doctors_consultation_types',
        using: 'GIN'
      });
      console.log('✅ Created GIN index on consultationTypes');
    } catch (indexError) {
      if (indexError.message?.includes('already exists')) {
        console.log('✅ Index already exists on consultationTypes');
      } else {
        throw indexError;
      }
    }
    
    console.log('🎉 Migration completed successfully!');
    console.log('');
    console.log('✅ All doctors now have:');
    console.log('  - Default availability: Monday-Friday 9 AM - 5 PM');
    console.log('  - Online consultations: ₹500');
    console.log('  - Walk-in consultations: ₹600');
    console.log('  - Time slots will be generated automatically');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Execute migration
addDoctorAvailabilityFields()
  .then(() => {
    console.log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
