#!/usr/bin/env node

/**
 * Add SMTP Settings for Team User
 * Adds email configuration for parinitha@mysmarthealth.in
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';

async function addSmtpSettings() {
  console.log('📧 Adding SMTP Settings for parinitha@mysmarthealth.in\n');

  try {
    // First, find or create the user
    console.log('🔍 Searching for user parinitha@mysmarthealth.in...');
    
    const [users] = await postgresSequelize.query(`
      SELECT id, email, "firstName", "lastName" FROM "users" 
      WHERE email = 'parinitha@mysmarthealth.in'
      LIMIT 1
    `);

    let userId;
    if (users.length > 0) {
      userId = users[0].id;
      console.log(`✅ User found: ${users[0].firstName} ${users[0].lastName} (ID: ${userId})\n`);
    } else {
      console.log('⚠️  User not found. Using team/admin user (ID: 1 for reference)\n');
      userId = 1; // Reference user ID (will use admin/first user)
    }

    // Add Zoho Mail SMTP Configuration (Indian email provider)
    console.log('⚙️  Adding SMTP Configuration (Zoho Mail)...');
    
    const settingsData = {
      userId,
      email: 'parinitha@mysmarthealth.in',
      displayName: 'Parinitha - Smart Health',
      provider: 'zoho',
      smtpHost: 'smtp.zoho.in',
      smtpPort: 465,
      smtpSecure: true,
      imapHost: 'imap.zoho.in',
      imapPort: 993,
      imapSecure: true,
      isActive: true,
      isDefault: true,
      syncEnabled: true,
      syncFrequencyMinutes: 15,
      rateLimitPerHour: 100,
      rateLimitPerDay: 1000
    };

    // Note: In production, passwords should be encrypted and handled securely
    console.log('⚠️  NOTE: SMTP credentials must be added separately for security reasons');
    console.log('   Generate app-specific password from Zoho and set via API\n');

    const [result] = await postgresSequelize.query(`
      INSERT INTO email_settings (
        user_id, email, display_name, provider,
        smtp_host, smtp_port, smtp_secure,
        imap_host, imap_port, imap_secure,
        is_active, is_default, sync_enabled, sync_frequency_minutes,
        rate_limit_per_hour, rate_limit_per_day,
        created_at, updated_at
      ) VALUES (
        :userId, :email, :displayName, :provider,
        :smtpHost, :smtpPort, :smtpSecure,
        :imapHost, :imapPort, :imapSecure,
        :isActive, :isDefault, :syncEnabled, :syncFrequencyMinutes,
        :rateLimitPerHour, :rateLimitPerDay,
        NOW(), NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING id, email, provider
    `, {
      replacements: settingsData,
      type: postgresSequelize.QueryTypes.INSERT
    });

    if (result && result[0]) {
      console.log(`✅ SMTP Configuration created successfully!`);
      console.log(`   ID: ${result[0].id}`);
      console.log(`   Email: ${result[0].email}`);
      console.log(`   Provider: ${result[0].provider}\n`);
    }

    // Display the created settings
    console.log('📋 Email Settings Details:');
    const [settings] = await postgresSequelize.query(`
      SELECT id, user_id, email, display_name, provider, 
             smtp_host, smtp_port, smtp_secure,
             imap_host, imap_port, imap_secure,
             is_active, is_default, sync_enabled, sync_frequency_minutes,
             rate_limit_per_hour, rate_limit_per_day
      FROM email_settings 
      WHERE email = 'parinitha@mysmarthealth.in'
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
      
      SMTP:
        Host: ${config.smtp_host}
        Port: ${config.smtp_port}
        Secure: ${config.smtp_secure}
      
      IMAP:
        Host: ${config.imap_host}
        Port: ${config.imap_port}
        Secure: ${config.imap_secure}
      
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

    console.log('\n✨ SMTP Settings added successfully!\n');
    console.log('📝 Next Steps:');
    console.log('   1. Use API endpoint: PUT /api/email-settings/<id>');
    console.log('   2. Add smtpUsername and smtpPassword (encrypted in production)');
    console.log('   3. Add imapUsername and imapPassword');
    console.log('   4. Test connection with: POST /api/email-settings/<id>/test\n');

  } catch (error) {
    console.error('❌ Error adding SMTP settings:', error.message);
    throw error;
  }
}

// Run
(async () => {
  try {
    await addSmtpSettings();
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
