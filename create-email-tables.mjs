#!/usr/bin/env node

/**
 * Create Email Tables - email_inboxes and email_settings
 * Run this to initialize the email system database tables
 */

import { EmailInbox, EmailSettings } from './server/models/index.js';

async function createTables() {
  try {
    console.log('🔧 Creating email system tables...\n');

    // Create email_settings table
    console.log('1️⃣  Creating email_settings table...');
    await EmailSettings.sync({ alter: true });
    console.log('✅ email_settings table created/updated\n');

    // Create email_inboxes table  
    console.log('2️⃣  Creating email_inboxes table...');
    await EmailInbox.sync({ alter: true });
    console.log('✅ email_inboxes table created/updated\n');

    // Verify tables exist
    console.log('3️⃣  Verifying tables...');
    const settingsCount = await EmailSettings.count();
    const inboxCount = await EmailInbox.count();
    
    console.log(`✅ email_settings: ${settingsCount} records`);
    console.log(`✅ email_inboxes: ${inboxCount} records\n`);

    console.log('🎉 Email system tables ready!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
}

createTables();
