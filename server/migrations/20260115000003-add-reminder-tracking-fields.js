import { DataTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';

export default {
  async up() {
    const queryInterface = postgresSequelize.getQueryInterface();

    console.log('Adding reminder tracking fields to appointments table...');

    try {
      // Check if columns exist before adding
      const appointmentTableDescription = await queryInterface.describeTable('appointments');

      // Add reminder tracking fields to appointments
      if (!appointmentTableDescription.reminder24hSent) {
        await queryInterface.addColumn('appointments', 'reminder24hSent', {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false
        });
        console.log('✅ Added reminder24hSent to appointments');
      }

      if (!appointmentTableDescription.reminder2hSent) {
        await queryInterface.addColumn('appointments', 'reminder2hSent', {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false
        });
        console.log('✅ Added reminder2hSent to appointments');
      }

      if (!appointmentTableDescription.reminder15minSent) {
        await queryInterface.addColumn('appointments', 'reminder15minSent', {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false
        });
        console.log('✅ Added reminder15minSent to appointments');
      }

    } catch (error) {
      console.error('Error adding columns to appointments table:', error);
      throw error;
    }

    console.log('Adding payment reminder tracking fields to invoices table...');

    try {
      // Check if invoices table exists
      const tables = await queryInterface.showAllTables();
      
      if (tables.includes('invoices')) {
        const invoiceTableDescription = await queryInterface.describeTable('invoices');

        // Add payment reminder tracking fields
        if (!invoiceTableDescription.reminder3DaysSent) {
          await queryInterface.addColumn('invoices', 'reminder3DaysSent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added reminder3DaysSent to invoices');
        }

        if (!invoiceTableDescription.reminder1DaySent) {
          await queryInterface.addColumn('invoices', 'reminder1DaySent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added reminder1DaySent to invoices');
        }

        if (!invoiceTableDescription.reminderDueDateSent) {
          await queryInterface.addColumn('invoices', 'reminderDueDateSent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added reminderDueDateSent to invoices');
        }

        if (!invoiceTableDescription.reminder3DaysOverdueSent) {
          await queryInterface.addColumn('invoices', 'reminder3DaysOverdueSent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added reminder3DaysOverdueSent to invoices');
        }

        if (!invoiceTableDescription.reminder7DaysOverdueSent) {
          await queryInterface.addColumn('invoices', 'reminder7DaysOverdueSent', {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
          });
          console.log('✅ Added reminder7DaysOverdueSent to invoices');
        }
      } else {
        console.log('ℹ️  Invoices table does not exist, skipping invoice columns');
      }

    } catch (error) {
      console.error('Error adding columns to invoices table:', error);
      // Don't throw error if invoices table doesn't exist
      if (error.message.includes('does not exist')) {
        console.log('ℹ️  Invoices table not found, continuing...');
      } else {
        throw error;
      }
    }

    console.log('✅ Reminder tracking migration completed successfully');
  },

  async down() {
    const queryInterface = postgresSequelize.getQueryInterface();

    console.log('Removing reminder tracking fields...');

    // Remove from appointments
    await queryInterface.removeColumn('appointments', 'reminder24hSent');
    await queryInterface.removeColumn('appointments', 'reminder2hSent');
    await queryInterface.removeColumn('appointments', 'reminder15minSent');

    // Remove from invoices (if table exists)
    try {
      const tables = await queryInterface.showAllTables();
      if (tables.includes('invoices')) {
        await queryInterface.removeColumn('invoices', 'reminder3DaysSent');
        await queryInterface.removeColumn('invoices', 'reminder1DaySent');
        await queryInterface.removeColumn('invoices', 'reminderDueDateSent');
        await queryInterface.removeColumn('invoices', 'reminder3DaysOverdueSent');
        await queryInterface.removeColumn('invoices', 'reminder7DaysOverdueSent');
      }
    } catch (error) {
      console.log('Error removing invoice columns (table may not exist)');
    }

    console.log('✅ Reminder tracking fields removed');
  }
};
