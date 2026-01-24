/**
 * Migration: Add passwordResetToken and passwordResetExpires to all entity tables
 * Required for password reset functionality across all user types
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';

const addPasswordResetFields = async () => {
  const queryInterface = postgresSequelize.getQueryInterface();
  const DataTypes = postgresSequelize.Sequelize.DataTypes;
  
  const tables = [
    { name: 'hospitals', tokenField: 'password_reset_token', expiresField: 'password_reset_expires' },
    { name: 'nurses', tokenField: 'passwordResetToken', expiresField: 'passwordResetExpires' },
    { name: 'pharmacies', tokenField: 'passwordResetToken', expiresField: 'passwordResetExpires' },
    { name: 'corporates', tokenField: 'passwordResetToken', expiresField: 'passwordResetExpires' }
  ];

  try {
    console.log('🔐 Starting migration: Add password reset fields...');
    
    for (const table of tables) {
      console.log(`\n📋 Processing table: ${table.name}`);
      
      // Check if table exists
      const tables = await queryInterface.showAllTables();
      if (!tables.includes(table.name)) {
        console.log(`⚠️ Table ${table.name} does not exist, skipping...`);
        continue;
      }

      // Check if columns already exist
      const tableDescription = await queryInterface.describeTable(table.name);
      
      // Add passwordResetToken column
      if (!tableDescription[table.tokenField] && !tableDescription.passwordResetToken && !tableDescription.password_reset_token) {
        await queryInterface.addColumn(table.name, table.tokenField, {
          type: DataTypes.STRING(255),
          allowNull: true,
          comment: 'Hashed password reset token'
        });
        console.log(`  ✅ Added ${table.tokenField} column to ${table.name}`);
      } else {
        console.log(`  ✅ passwordResetToken column already exists in ${table.name}`);
      }

      // Add passwordResetExpires column
      if (!tableDescription[table.expiresField] && !tableDescription.passwordResetExpires && !tableDescription.password_reset_expires) {
        await queryInterface.addColumn(table.name, table.expiresField, {
          type: DataTypes.DATE,
          allowNull: true,
          comment: 'Expiry time for password reset token'
        });
        console.log(`  ✅ Added ${table.expiresField} column to ${table.name}`);
      } else {
        console.log(`  ✅ passwordResetExpires column already exists in ${table.name}`);
      }
    }

    console.log('\n✅ Migration completed: Password reset fields added');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run migration if called directly
if (process.argv[1] && process.argv[1].includes('add-password-reset-fields')) {
  addPasswordResetFields()
    .then(() => {
      console.log('\n🎉 Migration finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default addPasswordResetFields;
