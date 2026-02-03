/**
 * Phase 2/3 Database Migration
 * 
 * Creates tables for:
 * - Compliance tracking (audit logs, violations, data requests)
 * - Report archival
 * - System health history
 * - Scheduled reports
 * 
 * Run with: node server/migrations/phase2-3-tables.migration.js
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

async function runMigration() {
  console.log('[Migration] Starting Phase 2/3 tables migration...');

  try {
    // 1. Audit Logs Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id),
        user_id INTEGER,
        action_type VARCHAR(100) NOT NULL,
        description TEXT,
        resource_type VARCHAR(100),
        resource_id VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] ✓ audit_logs table created');

    // 2. Compliance Violations Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS compliance_violations (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id),
        user_id INTEGER,
        violation_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
        description TEXT NOT NULL,
        affected_records INTEGER DEFAULT 0,
        recommended_action TEXT,
        remediation_status VARCHAR(50) DEFAULT 'open' CHECK (remediation_status IN ('open', 'in_progress', 'resolved', 'accepted_risk')),
        remediation_notes TEXT,
        reported_by INTEGER,
        resolved_by INTEGER,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] ✓ compliance_violations table created');

    // 3. Data Access Requests Table (GDPR/DPDP Right to Access)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS data_access_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        tenant_id INTEGER REFERENCES tenants(id),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        requested_by INTEGER,
        processed_by INTEGER,
        completed_at TIMESTAMP,
        data_export_path TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] ✓ data_access_requests table created');

    // 4. Data Erasure Requests Table (GDPR/DPDP Right to Erasure)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS data_erasure_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        tenant_id INTEGER REFERENCES tenants(id),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'partial')),
        verification_method VARCHAR(100),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        requested_by INTEGER,
        processed_by INTEGER,
        completed_at TIMESTAMP,
        data_retained_reason TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] ✓ data_erasure_requests table created');

    // 5. System Backups Tracking Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS system_backups (
        id SERIAL PRIMARY KEY,
        backup_type VARCHAR(50) NOT NULL CHECK (backup_type IN ('full', 'incremental', 'differential')),
        status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
        size_bytes BIGINT,
        storage_location TEXT,
        retention_days INTEGER DEFAULT 30,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] ✓ system_backups table created');

    // 6. Report Archive Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS report_archive (
        id SERIAL PRIMARY KEY,
        report_id VARCHAR(100) NOT NULL,
        schedule_id VARCHAR(100),
        report_type VARCHAR(100) NOT NULL,
        tenant_id INTEGER REFERENCES tenants(id),
        generated_at TIMESTAMP NOT NULL,
        period_start TIMESTAMP,
        period_end TIMESTAMP,
        record_count INTEGER DEFAULT 0,
        file_path TEXT,
        file_size_bytes BIGINT,
        format VARCHAR(20) DEFAULT 'json',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] ✓ report_archive table created');

    // 7. Scheduled Reports Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS scheduled_reports (
        id SERIAL PRIMARY KEY,
        schedule_id VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        report_config JSONB NOT NULL,
        cron_schedule VARCHAR(100) NOT NULL,
        recipients JSONB DEFAULT '[]',
        enabled BOOLEAN DEFAULT true,
        last_run_at TIMESTAMP,
        next_run_at TIMESTAMP,
        run_count INTEGER DEFAULT 0,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] ✓ scheduled_reports table created');

    // 8. System Health History Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS system_health_history (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cpu_usage DECIMAL(5,2),
        memory_usage DECIMAL(5,2),
        disk_usage DECIMAL(5,2),
        db_response_ms INTEGER,
        db_connections INTEGER,
        active_requests INTEGER,
        error_rate DECIMAL(5,4),
        uptime_seconds BIGINT,
        health_status VARCHAR(20) CHECK (health_status IN ('healthy', 'degraded', 'critical')),
        alerts_triggered INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}'
      )
    `);
    console.log('[Migration] ✓ system_health_history table created');

    // 9. Tenant Suspension History Table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS tenant_suspension_history (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        action VARCHAR(50) NOT NULL CHECK (action IN ('suspended', 'reactivated', 'warning_sent')),
        reason TEXT,
        invoice_id INTEGER REFERENCES saas_invoices(id),
        performed_by INTEGER,
        performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'
      )
    `);
    console.log('[Migration] ✓ tenant_suspension_history table created');

    // Create indexes for better query performance
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
      
      CREATE INDEX IF NOT EXISTS idx_violations_tenant ON compliance_violations(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_violations_severity ON compliance_violations(severity);
      CREATE INDEX IF NOT EXISTS idx_violations_status ON compliance_violations(remediation_status);
      
      CREATE INDEX IF NOT EXISTS idx_data_access_user ON data_access_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_data_access_status ON data_access_requests(status);
      
      CREATE INDEX IF NOT EXISTS idx_data_erasure_user ON data_erasure_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_data_erasure_status ON data_erasure_requests(status);
      
      CREATE INDEX IF NOT EXISTS idx_report_archive_type ON report_archive(report_type);
      CREATE INDEX IF NOT EXISTS idx_report_archive_generated ON report_archive(generated_at);
      
      CREATE INDEX IF NOT EXISTS idx_health_history_timestamp ON system_health_history(timestamp);
      
      CREATE INDEX IF NOT EXISTS idx_suspension_tenant ON tenant_suspension_history(tenant_id);
    `);
    console.log('[Migration] ✓ Indexes created');

    // Add consent_given column to users if not exists
    await sequelize.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='users' AND column_name='consent_given') THEN
          ALTER TABLE users ADD COLUMN consent_given BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `).catch(() => console.log('[Migration] consent_given column already exists or users table not found'));

    // Add mfa_enabled column to users if not exists
    await sequelize.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='users' AND column_name='mfa_enabled') THEN
          ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `).catch(() => console.log('[Migration] mfa_enabled column already exists or users table not found'));

    // Add metadata column to tenants if not exists
    await sequelize.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tenants' AND column_name='metadata') THEN
          ALTER TABLE tenants ADD COLUMN metadata JSONB DEFAULT '{}';
        END IF;
      END $$;
    `).catch(() => console.log('[Migration] metadata column already exists or tenants table not found'));

    // Add suspended_at and suspension_reason to tenants if not exists
    await sequelize.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tenants' AND column_name='suspended_at') THEN
          ALTER TABLE tenants ADD COLUMN suspended_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='tenants' AND column_name='suspension_reason') THEN
          ALTER TABLE tenants ADD COLUMN suspension_reason TEXT;
        END IF;
      END $$;
    `).catch(() => console.log('[Migration] suspension columns already exist or tenants table not found'));

    console.log('[Migration] ✅ Phase 2/3 migration completed successfully!');
    console.log('\nCreated tables:');
    console.log('  - audit_logs (compliance audit trail)');
    console.log('  - compliance_violations (violation tracking)');
    console.log('  - data_access_requests (GDPR/DPDP right to access)');
    console.log('  - data_erasure_requests (GDPR/DPDP right to erasure)');
    console.log('  - system_backups (backup tracking)');
    console.log('  - report_archive (report storage)');
    console.log('  - scheduled_reports (recurring reports)');
    console.log('  - system_health_history (monitoring history)');
    console.log('  - tenant_suspension_history (suspension tracking)');

  } catch (error) {
    console.error('[Migration] ❌ Error:', error.message);
    throw error;
  }
}

// Run migration
runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
