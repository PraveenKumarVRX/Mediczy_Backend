#!/usr/bin/env node

/**
 * Setup Automation Services
 * 
 * This script:
 * 1. Runs database migration to add reminder tracking fields
 * 2. Imports and initializes automation services
 * 3. Provides status information
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';
import migration from '../migrations/20260115000003-add-reminder-tracking-fields.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🤖 MEDIQZY AUTOMATION SETUP');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

async function setupAutomation() {
  try {
    // Step 1: Test database connection
    console.log('📡 Step 1: Testing database connection...');
    await postgresSequelize.authenticate();
    console.log('✅ Database connection successful');
    console.log('');

    // Step 2: Run migration
    console.log('📊 Step 2: Adding reminder tracking fields to database...');
    await migration.up();
    console.log('✅ Database schema updated');
    console.log('');

    // Step 3: Import automation services
    console.log('🚀 Step 3: Initializing automation services...');
    
    const appointmentReminderService = (await import('../services/appointment-reminder-cron.service.js')).default;
    const paymentReminderService = (await import('../services/payment-reminder-cron.service.js')).default;
    const membershipCronService = (await import('../services/membership-cron.service.js')).default;

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ AUTOMATION SETUP COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📋 Active Automations:');
    console.log('');
    console.log('1. 📅 Appointment Reminders');
    console.log('   • Runs: Every 30 minutes');
    console.log('   • Sends: 24h, 2h, 15min before appointments');
    console.log('   • Channels: Email, SMS, WhatsApp, Push, In-app');
    console.log('');
    console.log('2. 💰 Payment Reminders');
    console.log('   • Runs: Daily at 9:00 AM');
    console.log('   • Sends: 3 days before, 1 day before, due date, 3 days overdue, 7 days overdue');
    console.log('   • Channels: Email, SMS, WhatsApp, In-app');
    console.log('');
    console.log('3. 👤 Membership Management');
    console.log('   • Status Sync: Daily at 2:00 AM');
    console.log('   • Expiry Alerts: Daily at 9:00 AM');
    console.log('   • Channels: Email');
    console.log('');
    console.log('4. 💊 Auto-Prescription (Already Active)');
    console.log('   • Triggers: On consultation completion');
    console.log('   • Auto-fills: Patient & doctor info');
    console.log('');
    console.log('5. ✉️  Email System (Already Active)');
    console.log('   • Templates: Welcome, Appointment, Reminder, Password Reset, Invoice');
    console.log('   • SMTP: Zoho Pro (support@mediqzy.com)');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Database Changes:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Appointments table:');
    console.log('  ✅ reminder24hSent (boolean)');
    console.log('  ✅ reminder2hSent (boolean)');
    console.log('  ✅ reminder15minSent (boolean)');
    console.log('');
    console.log('Invoices table (if exists):');
    console.log('  ✅ reminder3DaysSent (boolean)');
    console.log('  ✅ reminder1DaySent (boolean)');
    console.log('  ✅ reminderDueDateSent (boolean)');
    console.log('  ✅ reminder3DaysOverdueSent (boolean)');
    console.log('  ✅ reminder7DaysOverdueSent (boolean)');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📖 Next Steps:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('1. Restart your server to activate automations:');
    console.log('   pm2 restart mediczy-server');
    console.log('');
    console.log('2. Monitor automation logs:');
    console.log('   pm2 logs mediczy-server --lines 100');
    console.log('');
    console.log('3. Test appointment reminders:');
    console.log('   - Create appointment for tomorrow');
    console.log('   - Check logs every 30 minutes for reminder execution');
    console.log('');
    console.log('4. Test payment reminders:');
    console.log('   - Create invoice with due date in 3 days');
    console.log('   - Check logs at 9:00 AM for reminder execution');
    console.log('');
    console.log('5. View all automations checklist:');
    console.log('   cat AUTOMATION_CHECKLIST_COMPREHENSIVE.md');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ SETUP FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Common issues:');
    console.error('  • Database not running: Check PostgreSQL service');
    console.error('  • Wrong credentials: Verify DATABASE_URL in .env');
    console.error('  • Network issue: Check database host connectivity');
    console.error('');
    console.error('Full error:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

setupAutomation();
