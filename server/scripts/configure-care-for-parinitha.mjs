#!/usr/bin/env node

/**
 * Configure care@mysmarthealth.in email inbox for parinitha@mysmarthealth.in
 * This script updates the user_id for care email settings from user_id=1 to parinitha (user_id=110)
 */

import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;

async function configureCarEmailForParinitha() {
  const client = new Client({
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'password',
    host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
    port: process.env.DB_PORT || process.env.POSTGRES_PORT || 5432,
    database: process.env.DB_NAME || process.env.POSTGRES_DATABASE || 'mediczy_ai'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    console.log('🔍 Finding current care@mysmarthealth.in configuration...\n');
    
    // Get current care email settings
    const currentCareSettings = await client.query(
      'SELECT id, email, user_id, provider, is_default, is_active FROM email_settings WHERE email = $1 AND deleted_at IS NULL',
      ['care@mysmarthealth.in']
    );

    if (currentCareSettings.rows.length === 0) {
      console.log('❌ Error: care@mysmarthealth.in email settings not found');
      await client.end();
      return;
    }

    const currentSettings = currentCareSettings.rows[0];
    console.log('📧 Current Configuration:');
    console.log('   Email: ' + currentSettings.email);
    console.log('   User ID: ' + currentSettings.user_id);
    console.log('   Provider: ' + currentSettings.provider);
    console.log('   Default: ' + currentSettings.is_default);
    console.log('   Active: ' + currentSettings.is_active);

    // Verify parinitha user exists
    console.log('\n🔍 Finding parinitha@mysmarthealth.in user...\n');
    const parinithaUser = await client.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      ['parinitha@mysmarthealth.in']
    );

    if (parinithaUser.rows.length === 0) {
      console.log('❌ Error: parinitha@mysmarthealth.in user not found');
      await client.end();
      return;
    }

    const parinitha = parinithaUser.rows[0];
    console.log('✅ Parinitha user found:');
    console.log('   ID: ' + parinitha.id);
    console.log('   Email: ' + parinitha.email);
    console.log('   Role: ' + parinitha.role);

    // Update care email settings to use parinitha's user_id
    console.log('\n🔄 Updating care@mysmarthealth.in to be owned by parinitha...\n');
    const updateResult = await client.query(
      'UPDATE email_settings SET user_id = $1, updated_at = NOW() WHERE email = $2 AND deleted_at IS NULL RETURNING id, email, user_id, is_default, is_active',
      [parinitha.id, 'care@mysmarthealth.in']
    );

    if (updateResult.rowCount === 0) {
      console.log('❌ Error: Failed to update email settings');
      await client.end();
      return;
    }

    const updatedSettings = updateResult.rows[0];
    console.log('✅ Email settings updated successfully!\n');
    console.log('📧 New Configuration:');
    console.log('   Email: ' + updatedSettings.email);
    console.log('   User ID: ' + updatedSettings.user_id + ' (parinitha)');
    console.log('   Default: ' + updatedSettings.is_default);
    console.log('   Active: ' + updatedSettings.is_active);

    // Verify that parinitha now has both email addresses
    console.log('\n✅ Verifying parinitha email settings...\n');
    const parinithaEmailSettings = await client.query(
      'SELECT id, email, provider, is_default, is_active FROM email_settings WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at',
      [parinitha.id]
    );

    if (parinithaEmailSettings.rows.length > 0) {
      console.log('📧 All email inboxes for parinitha:');
      parinithaEmailSettings.rows.forEach((row, idx) => {
        console.log('   ' + (idx+1) + '. ' + row.email + ' (Provider: ' + row.provider + ', Default: ' + row.is_default + ', Active: ' + row.is_active + ')');
      });
    }

    await client.end();
    
    console.log('\n✅ Configuration complete!');
    console.log('   care@mysmarthealth.in is now configured for parinitha@mysmarthealth.in');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
    process.exit(1);
  }
}

// Load environment from server directory
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join('/home/ubuntu/Mediczy/server', '.env') });

configureCarEmailForParinitha().catch(console.error);
