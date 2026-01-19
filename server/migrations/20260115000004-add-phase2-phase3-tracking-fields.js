import { DataTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { Op } from 'sequelize';

export default {
  async up() {
    const queryInterface = postgresSequelize.getQueryInterface();

    console.log('Adding automation tracking fields to prescriptions table...');

    try {
      // Check if prescriptions table exists
      const tables = await queryInterface.showAllTables();
      
      if (tables.includes('prescriptions')) {
        const tableDescription = await queryInterface.describeTable('prescriptions');

        // Follow-up reminder tracking
        if (!tableDescription.followUpReminder7DaysSent) {
          await queryInterface.addColumn('prescriptions', 'followUpReminder7DaysSent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added followUpReminder7DaysSent to prescriptions');
        }

        if (!tableDescription.followUpReminder3DaysSent) {
          await queryInterface.addColumn('prescriptions', 'followUpReminder3DaysSent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added followUpReminder3DaysSent to prescriptions');
        }

        if (!tableDescription.followUpReminder1DaySent) {
          await queryInterface.addColumn('prescriptions', 'followUpReminder1DaySent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added followUpReminder1DaySent to prescriptions');
        }

        // Expiry alert tracking
        if (!tableDescription.expiryAlert7DaysSent) {
          await queryInterface.addColumn('prescriptions', 'expiryAlert7DaysSent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added expiryAlert7DaysSent to prescriptions');
        }

        if (!tableDescription.expiryAlert3DaysSent) {
          await queryInterface.addColumn('prescriptions', 'expiryAlert3DaysSent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added expiryAlert3DaysSent to prescriptions');
        }

        if (!tableDescription.expiryAlertExpiredSent) {
          await queryInterface.addColumn('prescriptions', 'expiryAlertExpiredSent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added expiryAlertExpiredSent to prescriptions');
        }

        // Medication adherence tracking (JSONB field)
        if (!tableDescription.adherenceTracking) {
          await queryInterface.addColumn('prescriptions', 'adherenceTracking', {
            type: DataTypes.JSONB,
            defaultValue: {},
            allowNull: true
          });
          console.log('✅ Added adherenceTracking (JSONB) to prescriptions');
        }

      } else {
        console.log('ℹ️  Prescriptions table does not exist, skipping');
      }

    } catch (error) {
      console.error('Error adding columns to prescriptions table:', error);
      if (!error.message.includes('does not exist')) {
        throw error;
      }
    }

    console.log('✅ Phase 2 & 3 automation migration completed successfully');
  },

  async down() {
    const queryInterface = postgresSequelize.getQueryInterface();

    console.log('Removing Phase 2 & 3 automation tracking fields...');

    try {
      const tables = await queryInterface.showAllTables();
      if (tables.includes('prescriptions')) {
        await queryInterface.removeColumn('prescriptions', 'followUpReminder7DaysSent');
        await queryInterface.removeColumn('prescriptions', 'followUpReminder3DaysSent');
        await queryInterface.removeColumn('prescriptions', 'followUpReminder1DaySent');
        await queryInterface.removeColumn('prescriptions', 'expiryAlert7DaysSent');
        await queryInterface.removeColumn('prescriptions', 'expiryAlert3DaysSent');
        await queryInterface.removeColumn('prescriptions', 'expiryAlertExpiredSent');
        await queryInterface.removeColumn('prescriptions', 'adherenceTracking');
      }
    } catch (error) {
      console.log('Error removing prescription columns (table may not exist)');
    }

    console.log('✅ Phase 2 & 3 automation tracking fields removed');
  }
};
