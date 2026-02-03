/**
 * SaaS Platform Database Migrations
 * 
 * Creates tables for:
 * - Usage alerts tracking
 * - SaaS invoices and payments
 * - Voice scriber devices and sessions
 * - System errors and alert rules
 * 
 * Run with: node server/migrations/saas-platform-tables.migration.js
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

async function runMigrations() {
  console.log('🚀 Starting SaaS Platform migrations...\n');

  try {
    // 1. Usage Alerts Table
    console.log('📊 Creating usage_alerts table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS usage_alerts (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        usage_type VARCHAR(50) NOT NULL,
        threshold_percent INTEGER NOT NULL,
        current_value NUMERIC(15, 2),
        limit_value NUMERIC(15, 2),
        alert_level VARCHAR(20) NOT NULL DEFAULT 'warning',
        message TEXT,
        sent_to JSONB,
        email_sent BOOLEAN DEFAULT false,
        acknowledged BOOLEAN DEFAULT false,
        acknowledged_at TIMESTAMP,
        acknowledged_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_usage_alerts_tenant ON usage_alerts(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_usage_alerts_created ON usage_alerts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_alerts_type ON usage_alerts(usage_type);
    `);
    console.log('✅ usage_alerts table created\n');

    // 2. SaaS Invoices Table
    console.log('💰 Creating saas_invoices table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS saas_invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        billing_period_start DATE NOT NULL,
        billing_period_end DATE NOT NULL,
        due_date DATE NOT NULL,
        
        -- Amounts
        base_amount NUMERIC(15, 2) DEFAULT 0,
        overage_amount NUMERIC(15, 2) DEFAULT 0,
        voice_scriber_amount NUMERIC(15, 2) DEFAULT 0,
        tax_amount NUMERIC(15, 2) DEFAULT 0,
        late_fee_amount NUMERIC(15, 2) DEFAULT 0,
        discount_amount NUMERIC(15, 2) DEFAULT 0,
        total_amount NUMERIC(15, 2) NOT NULL,
        
        -- Status
        status VARCHAR(30) DEFAULT 'pending',
        paid_amount NUMERIC(15, 2) DEFAULT 0,
        paid_at TIMESTAMP,
        payment_method VARCHAR(50),
        payment_reference VARCHAR(255),
        
        -- Usage breakdown
        usage_breakdown JSONB,
        overage_details JSONB,
        
        -- Metadata
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by VARCHAR(255)
      );

      CREATE INDEX IF NOT EXISTS idx_saas_invoices_tenant ON saas_invoices(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_saas_invoices_status ON saas_invoices(status);
      CREATE INDEX IF NOT EXISTS idx_saas_invoices_due_date ON saas_invoices(due_date);
      CREATE INDEX IF NOT EXISTS idx_saas_invoices_number ON saas_invoices(invoice_number);
    `);
    console.log('✅ saas_invoices table created\n');

    // 3. Invoice Payments Table
    console.log('💳 Creating invoice_payments table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES saas_invoices(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        amount NUMERIC(15, 2) NOT NULL,
        payment_method VARCHAR(50),
        payment_reference VARCHAR(255),
        payment_date TIMESTAMP DEFAULT NOW(),
        status VARCHAR(30) DEFAULT 'completed',
        notes TEXT,
        processed_by VARCHAR(255),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_payments_tenant ON invoice_payments(tenant_id);
    `);
    console.log('✅ invoice_payments table created\n');

    // 4. Voice Scriber Devices Table
    console.log('🎙️ Creating voice_scriber_devices table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS voice_scriber_devices (
        id SERIAL PRIMARY KEY,
        device_uid VARCHAR(100) UNIQUE NOT NULL,
        device_name VARCHAR(255),
        model VARCHAR(100) DEFAULT 'Standard',
        serial_number VARCHAR(100),
        firmware_version VARCHAR(50),
        
        -- Assignment
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        assigned_doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
        
        -- Status
        status VARCHAR(30) DEFAULT 'registered',
        last_active_at TIMESTAMP,
        battery_level INTEGER,
        
        -- Metadata
        config JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_vs_devices_tenant ON voice_scriber_devices(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_vs_devices_status ON voice_scriber_devices(status);
      CREATE INDEX IF NOT EXISTS idx_vs_devices_doctor ON voice_scriber_devices(assigned_doctor_id);
      CREATE INDEX IF NOT EXISTS idx_vs_devices_uid ON voice_scriber_devices(device_uid);
    `);
    console.log('✅ voice_scriber_devices table created\n');

    // 5. Voice Scriber Sessions Table
    console.log('📝 Creating voice_scriber_sessions table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS voice_scriber_sessions (
        id SERIAL PRIMARY KEY,
        session_uid VARCHAR(100) UNIQUE,
        device_id INTEGER REFERENCES voice_scriber_devices(id) ON DELETE SET NULL,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
        patient_id INTEGER,
        appointment_id INTEGER,
        
        -- Session details
        status VARCHAR(30) DEFAULT 'started',
        duration_seconds INTEGER DEFAULT 0,
        word_count INTEGER DEFAULT 0,
        language VARCHAR(10) DEFAULT 'en-IN',
        
        -- Content (if stored)
        transcript_preview TEXT,
        transcript_url VARCHAR(500),
        audio_url VARCHAR(500),
        
        -- Processing
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        
        -- Metadata
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_vs_sessions_device ON voice_scriber_sessions(device_id);
      CREATE INDEX IF NOT EXISTS idx_vs_sessions_tenant ON voice_scriber_sessions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_vs_sessions_doctor ON voice_scriber_sessions(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_vs_sessions_status ON voice_scriber_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_vs_sessions_created ON voice_scriber_sessions(created_at DESC);
    `);
    console.log('✅ voice_scriber_sessions table created\n');

    // 6. System Errors Table
    console.log('⚠️ Creating system_errors table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS system_errors (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL DEFAULT 'unknown',
        severity VARCHAR(20) NOT NULL DEFAULT 'medium',
        error_code VARCHAR(50),
        message TEXT NOT NULL,
        stack_trace TEXT,
        
        -- Context
        request_path VARCHAR(500),
        request_method VARCHAR(10),
        user_id INTEGER,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        
        -- Resolution
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP,
        resolved_by VARCHAR(255),
        resolution_notes TEXT,
        
        -- Metadata
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_system_errors_category ON system_errors(category);
      CREATE INDEX IF NOT EXISTS idx_system_errors_severity ON system_errors(severity);
      CREATE INDEX IF NOT EXISTS idx_system_errors_tenant ON system_errors(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_system_errors_resolved ON system_errors(resolved);
      CREATE INDEX IF NOT EXISTS idx_system_errors_created ON system_errors(created_at DESC);
    `);
    console.log('✅ system_errors table created\n');

    // 7. Error Alert Rules Table
    console.log('🔔 Creating error_alert_rules table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS error_alert_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        
        -- Conditions
        condition_type VARCHAR(50) NOT NULL,
        condition_value JSONB NOT NULL,
        severity_filter JSONB,
        category_filter JSONB,
        tenant_filter JSONB,
        
        -- Notifications
        notification_channels JSONB DEFAULT '["email"]',
        notification_recipients JSONB,
        cooldown_minutes INTEGER DEFAULT 60,
        last_triggered_at TIMESTAMP,
        
        -- Status
        enabled BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,
        
        -- Metadata
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by VARCHAR(255)
      );

      CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON error_alert_rules(enabled);
      CREATE INDEX IF NOT EXISTS idx_alert_rules_priority ON error_alert_rules(priority DESC);
    `);
    console.log('✅ error_alert_rules table created\n');

    // 8. Usage Logs Table (for detailed tracking)
    console.log('📈 Creating usage_logs table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        usage_type VARCHAR(50) NOT NULL,
        quantity NUMERIC(15, 4) DEFAULT 1,
        unit VARCHAR(20),
        
        -- Context
        reference_id INTEGER,
        reference_type VARCHAR(50),
        doctor_id INTEGER,
        patient_id INTEGER,
        
        -- Metadata
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_usage_logs_tenant ON usage_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_type ON usage_logs(usage_type);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_tenant_type_created ON usage_logs(tenant_id, usage_type, created_at);
    `);
    console.log('✅ usage_logs table created\n');

    // 9. Tenant Suspension History Table
    console.log('🚫 Creating tenant_suspension_history table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS tenant_suspension_history (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        action VARCHAR(30) NOT NULL,
        reason VARCHAR(100),
        notes TEXT,
        invoice_id INTEGER REFERENCES saas_invoices(id),
        performed_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_suspension_history_tenant ON tenant_suspension_history(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_suspension_history_action ON tenant_suspension_history(action);
    `);
    console.log('✅ tenant_suspension_history table created\n');

    // Add billing columns to tenants table if not exists
    console.log('🔧 Adding billing columns to tenants table...');
    await sequelize.query(`
      DO $$
      BEGIN
        -- Add billing_email column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'tenants' AND column_name = 'billing_email') THEN
          ALTER TABLE tenants ADD COLUMN billing_email VARCHAR(255);
        END IF;
        
        -- Add billing_contact column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'tenants' AND column_name = 'billing_contact') THEN
          ALTER TABLE tenants ADD COLUMN billing_contact VARCHAR(255);
        END IF;
        
        -- Add suspension_reason column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'tenants' AND column_name = 'suspension_reason') THEN
          ALTER TABLE tenants ADD COLUMN suspension_reason TEXT;
        END IF;
        
        -- Add suspended_at column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'tenants' AND column_name = 'suspended_at') THEN
          ALTER TABLE tenants ADD COLUMN suspended_at TIMESTAMP;
        END IF;
        
        -- Add grace_period_end column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'tenants' AND column_name = 'grace_period_end') THEN
          ALTER TABLE tenants ADD COLUMN grace_period_end DATE;
        END IF;
      END $$;
    `);
    console.log('✅ Billing columns added to tenants table\n');

    console.log('🎉 All migrations completed successfully!\n');
    console.log('Tables created:');
    console.log('  - usage_alerts');
    console.log('  - saas_invoices');
    console.log('  - invoice_payments');
    console.log('  - voice_scriber_devices');
    console.log('  - voice_scriber_sessions');
    console.log('  - system_errors');
    console.log('  - error_alert_rules');
    console.log('  - usage_logs');
    console.log('  - tenant_suspension_history');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log('\n✅ Migration script completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Migration script failed:', err);
      process.exit(1);
    });
}

export default runMigrations;
