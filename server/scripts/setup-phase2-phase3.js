#!/usr/bin/env node

/**
 * Setup Phase 2 & Phase 3 Automation Services
 * 
 * This script:
 * 1. Runs database migration for prescription tracking fields
 * 2. Imports and initializes new automation services
 * 3. Provides status information
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';
import migration from '../migrations/20260115000004-add-phase2-phase3-tracking-fields.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🤖 MEDIQZY AUTOMATION - PHASE 2 & 3 SETUP');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

async function setupPhase2and3() {
  try {
    // Step 1: Test database connection
    console.log('📡 Step 1: Testing database connection...');
    await postgresSequelize.authenticate();
    console.log('✅ Database connection successful');
    console.log('');

    // Step 2: Run migration
    console.log('📊 Step 2: Adding prescription tracking fields...');
    await migration.up();
    console.log('✅ Database schema updated');
    console.log('');

    // Step 3: Import automation services
    console.log('🚀 Step 3: Initializing Phase 2 & 3 automation services...');
    
    const followUpService = (await import('../services/followup-automation.service.js')).default;
    const medicationService = (await import('../services/medication-reminder-cron.service.js')).default;
    const expiryService = (await import('../services/prescription-expiry-cron.service.js')).default;
    const performanceService = (await import('../services/doctor-performance-cron.service.js')).default;

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ PHASE 2 & 3 SETUP COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📋 New Automations Active:');
    console.log('');
    console.log('PHASE 2 - Patient Engagement:');
    console.log('');
    console.log('1. 📅 Follow-Up Appointment Automation');
    console.log('   • Runs: Daily at 10:00 AM');
    console.log('   • Sends: 7-day, 3-day, 1-day reminders before follow-up');
    console.log('   • Channels: Email, SMS, WhatsApp, In-app');
    console.log('');
    console.log('2. 💊 Medication Reminder System');
    console.log('   • Runs: 3x daily (8:00 AM, 2:00 PM, 8:00 PM)');
    console.log('   • Sends: Time-based medication reminders');
    console.log('   • Channels: SMS, WhatsApp, Push');
    console.log('   • Features: Adherence tracking, doctor alerts');
    console.log('');
    console.log('3. 📋 Prescription Expiry Alerts');
    console.log('   • Runs: Daily at 9:30 AM');
    console.log('   • Sends: 7-day, 3-day warnings + expiry notification');
    console.log('   • Channels: Email, SMS, In-app');
    console.log('');
    console.log('PHASE 3 - Operational Excellence:');
    console.log('');
    console.log('4. 📊 Doctor Performance Reports');
    console.log('   • Runs: Every Monday at 9:00 AM');
    console.log('   • Sends: Weekly performance summary via email');
    console.log('   • Metrics: Consultations, revenue, ratings, no-show rate');
    console.log('');
    console.log('5. 💳 Auto-Invoice Generation');
    console.log('   • Trigger: On appointment completion');
    console.log('   • Action: Creates invoice + sends email + starts payment reminders');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Database Changes:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Prescriptions table:');
    console.log('  ✅ followUpReminder7DaysSent (boolean)');
    console.log('  ✅ followUpReminder3DaysSent (boolean)');
    console.log('  ✅ followUpReminder1DaySent (boolean)');
    console.log('  ✅ expiryAlert7DaysSent (boolean)');
    console.log('  ✅ expiryAlert3DaysSent (boolean)');
    console.log('  ✅ expiryAlertExpiredSent (boolean)');
    console.log('  ✅ adherenceTracking (JSONB) - tracks medication adherence');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 Total Automations Now Active:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Phase 1 (Already Active):');
    console.log('  ✅ Appointment Reminders (24h, 2h, 15min)');
    console.log('  ✅ Payment Reminders (5 stages)');
    console.log('  ✅ Membership Management');
    console.log('  ✅ Auto-Prescription Generation');
    console.log('  ✅ Email Template System');
    console.log('');
    console.log('Phase 2 (NEW):');
    console.log('  ✅ Follow-Up Automation');
    console.log('  ✅ Medication Reminders');
    console.log('  ✅ Prescription Expiry Alerts');
    console.log('');
    console.log('Phase 3 (NEW):');
    console.log('  ✅ Doctor Performance Reports');
    console.log('  ✅ Auto-Invoice Generation');
    console.log('');
    console.log('TOTAL: 10 Automation Systems Live! 🎉');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📖 Next Steps:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('1. Restart your server to activate all automations:');
    console.log('   pm2 restart mediczy-server');
    console.log('');
    console.log('2. Monitor automation logs:');
    console.log('   pm2 logs mediczy-server --lines 100 | grep -E "(follow|medication|expiry|performance)"');
    console.log('');
    console.log('3. Test follow-up reminders:');
    console.log('   - Create prescription with followUpDate set to 7 days from now');
    console.log('   - Check logs at 10:00 AM for reminder execution');
    console.log('');
    console.log('4. Test medication reminders:');
    console.log('   - Create active prescription with medications');
    console.log('   - Check logs at 8:00 AM, 2:00 PM, or 8:00 PM');
    console.log('');
    console.log('5. Test doctor reports:');
    console.log('   - Wait until Monday 9:00 AM');
    console.log('   - Check doctor email for weekly performance report');
    console.log('');
    console.log('6. Test auto-invoice:');
    console.log('   - Complete an appointment');
    console.log('   - Invoice should be auto-generated and emailed');
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
    console.error('Full error:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

setupPhase2and3();
