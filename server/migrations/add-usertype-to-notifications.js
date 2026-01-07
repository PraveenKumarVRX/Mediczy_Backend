/**
 * Migration: Add userType column to notifications table
 * 
 * This migration adds the userType column to support filtering notifications
 * by user role (patient, doctor, admin)
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';

const addUserTypeToNotifications = async () => {
  const queryInterface = postgresSequelize.getQueryInterface();
  
  try {
    console.log('🔄 Starting migration: Add userType to notifications table...');
    
    // Check if column already exists
    const tableDescription = await queryInterface.describeTable('notifications');
    
    if (tableDescription.userType) {
      console.log('✅ userType column already exists in notifications table');
      return;
    }
    
    // Add userType column
    await queryInterface.addColumn('notifications', 'userType', {
      type: postgresSequelize.Sequelize.DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'patient',
      comment: 'User type: patient, doctor, admin'
    });
    
    console.log('✅ Added userType column to notifications table');
    
    // Update existing records to set userType as 'patient' (default for backward compatibility)
    await postgresSequelize.query(`
      UPDATE notifications 
      SET "userType" = 'patient' 
      WHERE "userType" IS NULL
    `);
    
    console.log('✅ Updated existing notifications with default userType');
    
    // Create index on userId and userType
    await queryInterface.addIndex('notifications', ['userId', 'userType'], {
      name: 'idx_notifications_user_type'
    });
    
    console.log('✅ Created index on userId and userType');
    
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addUserTypeToNotifications()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default addUserTypeToNotifications;
