#!/usr/bin/env node

/**
 * Configure Zoho Mail for care@mysmarthealth.in
 * Using Zoho Mail settings: smtp.zoho.in:465 / imap.zoho.in:993
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';

async function configureZohoMail() {
  console.log('📧 Configuring Zoho Mail for care@mysmarthealth.in\n');

  try {
    // Find user by email
    console.log('🔍 Searching for user care@mysmarthealth.in...');
    const [users] = await postgresSequelize.query(`
      SELECT id, email, "firstName", "lastName" FROM "users" 
      WHERE email = 'care@mysmarthealth.in'
      LIMIT 1
    `);

    let userId;
    if (users.length > 0) {
      userId = users[0].id;
      console.log(`✅ User found: ${users[0].firstName} ${users[0].lastName} (ID: ${userId})\n`);
    } else {
      console.log('❌ User not found: care@mysmarthealth.in');
      console.log('   Creating configuration with default user reference (ID: 1)\n');
      userId = 1;
    }

    // Check if already configured
    console.log('🔎 Checking existing configurations...');
    const [existing] = await postgresSequelize.query(`
      SELECT id, email FROM email_settings 
      WHERE email = 'care@mysmarthealth.in' AND deleted_at IS NULL
    `);

    if (existing.length > 0) {
      console.log(`⚠️  Configuration already exists (ID: ${existing[0].id})`);
      console.log('   Updating with new credentials...\n');
      
      await postgresSequelize.query(`
        UPDATE email_settings 
        SET smtp_password = :password,
            imap_password = :password,
            last_tested_at = NULL,
            updated_at = NOW()
        WHERE email = 'care@mysmarthealth.in'
      `, {
        replacements: { password: 'Mayden@2025' }
      });

      console.log('✅ Email settings updated for care@mysmarthealth.in\n');
    } else {
      // Create new configuration
      console.log('⚙️  Creating new Zoho Mail configuration...\n');

      const [result] = await postgresSequelize.query(`
        INSERT INTO email_settings (
          user_id, email, display_name, provider,
          smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password,
          imap_host, imap_port, imap_secure, imap_username, imap_password,
          is_active, is_default, sync_enabled, sync_frequency_minutes,
          rate_limit_per_hour, rate_limit_per_day,
          created_at, updated_at
        ) VALUES (
          :userId, :email, :displayName, :provider,
          :smtpHost, :smtpPort, :smtpSecure, :smtpUsername, :smtpPassword,
          :imapHost, :imapPort, :imapSecure, :imapUsername, :imapPassword,
          :isActive, :isDefault, :syncEnabled, :syncFrequencyMinutes,
          :rateLimitPerHour, :rateLimitPerDay,
          NOW(), NOW()
        )
        RETURNING id, email, provider
      `, {
        replacements: {
          userId,
          email: 'care@mysmarthealth.in',
          displayName: 'Care Team - Smart Health',
          provider: 'zoho',
          smtpHost: 'smtp.zoho.in',
          smtpPort: 465,
          smtpSecure: true,
          smtpUsername: 'care@mysmarthealth.in',
          smtpPassword: 'Mayden@2025',
          imapHost: 'imap.zoho.in',
          imapPort: 993,
          imapSecure: true,
          imapUsername: 'care@mysmarthealth.in',
          imapPassword: 'Mayden@2025',
          isActive: true,
          isDefault: true,
          syncEnabled: true,
          syncFrequencyMinutes: 15,
          rateLimitPerHour: 100,
          rateLimitPerDay: 1000
        }
      });

      if (result && result[0]) {
        console.log(`✅ Zoho Mail configuration created!`);
        console.log(`   ID: ${result[0].id}`);
        console.log(`   Email: ${result[0].email}`);
        console.log(`   Provider: ${result[0].provider}\n`);
      }
    }

    // Display configuration details
    console.log('📋 Email Settings Configuration:');
    const [settings] = await postgresSequelize.query(`
      SELECT 
        id, user_id, email, display_name, provider,
        smtp_host, smtp_port, smtp_secure,
        imap_host, imap_port, imap_secure,
        is_active, is_default, sync_enabled, sync_frequency_minutes,
        rate_limit_per_hour, rate_limit_per_day
      FROM email_settings 
      WHERE email = 'care@mysmarthealth.in'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (settings.length > 0) {
      const config = settings[0];
      console.log(`
      ID: ${config.id}
      User ID: ${config.user_id}
      Email: ${config.email}
      Display Name: ${config.display_name}
      Provider: ${config.provider}
      
      SMTP Configuration:
        Host: ${config.smtp_host}
        Port: ${config.smtp_port}
        Secure (TLS): ${config.smtp_secure}
        Username: care@mysmarthealth.in
        Password: ••••••••••
      
      IMAP Configuration:
        Host: ${config.imap_host}
        Port: ${config.imap_port}
        Secure (SSL): ${config.imap_secure}
        Username: care@mysmarthealth.in
        Password: ••••••••••
      
      Status:
        Active: ${config.is_active}
        Default: ${config.is_default}
        Sync Enabled: ${config.sync_enabled}
        Sync Frequency: ${config.sync_frequency_minutes} minutes
      
      Rate Limits:
        Per Hour: ${config.rate_limit_per_hour}
        Per Day: ${config.rate_limit_per_day}
      `);
    }

    console.log('✨ Zoho Mail configuration complete!\n');
    console.log('📝 Next Steps:');
    console.log('   1. Test connection: POST /api/email-settings/<id>/test');
    console.log('   2. Sync emails: POST /api/team/emails/sync');
    console.log('   3. View inbox: GET /api/team/emails/inbox\n');

  } catch (error) {
    console.error('❌ Error configuring Zoho Mail:', error.message);
    throw error;
  }
}

(async () => {
  try {
    await configureZohoMail();
  } catch (error) {
    process.exit(1);
  } finally {
    try {
      await postgresSequelize.close();
    } catch (e) {
      // Ignore
    }
  }
})();
