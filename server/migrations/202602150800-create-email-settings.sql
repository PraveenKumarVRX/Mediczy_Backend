-- ========================================================================
-- MIGRATION: Create Email Settings Table for User SMTP Configuration
-- DATE: 2026-02-15 08:00:00
-- PURPOSE: Store SMTP/IMAP configurations for team members' email accounts
-- ========================================================================
BEGIN TRANSACTION;
-- Create email_settings table for storing user SMTP/IMAP configurations
CREATE TABLE IF NOT EXISTS email_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    -- SMTP Configuration (for sending emails)
    smtp_host VARCHAR(255),
    smtp_port INTEGER DEFAULT 587,
    smtp_secure BOOLEAN DEFAULT false,
    smtp_username VARCHAR(255),
    smtp_password VARCHAR(500),
    -- Encrypted in production
    -- IMAP Configuration (for receiving emails)
    imap_host VARCHAR(255),
    imap_port INTEGER DEFAULT 993,
    imap_secure BOOLEAN DEFAULT true,
    imap_username VARCHAR(255),
    imap_password VARCHAR(500),
    -- Encrypted in production
    -- Provider and Status
    provider VARCHAR(50) DEFAULT 'custom',
    -- gmail, outlook, zoho, custom
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    -- Configuration Testing
    last_tested_at TIMESTAMP NULL,
    test_result VARCHAR(50),
    -- success, failed, partial
    test_details JSONB,
    -- Rate Limiting
    rate_limit_per_hour INTEGER DEFAULT 100,
    rate_limit_per_day INTEGER DEFAULT 1000,
    emails_sent_today INTEGER DEFAULT 0,
    emails_sent_this_hour INTEGER DEFAULT 0,
    -- Synchronization
    sync_enabled BOOLEAN DEFAULT true,
    sync_frequency_minutes INTEGER DEFAULT 15,
    last_sync_at TIMESTAMP NULL,
    last_sync_status VARCHAR(50),
    -- success, failed, pending
    -- Auto Reply
    auto_reply_enabled BOOLEAN DEFAULT false,
    auto_reply_message TEXT,
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);
COMMENT ON TABLE email_settings IS 'Stores SMTP/IMAP configurations for team members to send and receive emails';
COMMENT ON COLUMN email_settings.id IS 'Unique identifier for email settings';
COMMENT ON COLUMN email_settings.user_id IS 'Team member/user who owns these settings';
COMMENT ON COLUMN email_settings.email IS 'Email address for this configuration';
COMMENT ON COLUMN email_settings.display_name IS 'Display name for email replies';
COMMENT ON COLUMN email_settings.smtp_host IS 'SMTP server host';
COMMENT ON COLUMN email_settings.smtp_port IS 'SMTP server port (587 for TLS, 465 for SSL)';
COMMENT ON COLUMN email_settings.smtp_secure IS 'Use secure connection (TLS/SSL) for SMTP';
COMMENT ON COLUMN email_settings.imap_host IS 'IMAP server host for receiving emails';
COMMENT ON COLUMN email_settings.imap_port IS 'IMAP server port (993 for SSL/TLS, 143 for plain)';
COMMENT ON COLUMN email_settings.imap_secure IS 'Use secure connection (TLS/SSL) for IMAP';
COMMENT ON COLUMN email_settings.provider IS 'Email service provider type';
COMMENT ON COLUMN email_settings.is_active IS 'Whether this email configuration is currently active';
COMMENT ON COLUMN email_settings.is_default IS 'Whether this is the default email for the user';
COMMENT ON COLUMN email_settings.last_tested_at IS 'Last time SMTP/IMAP connection was tested';
COMMENT ON COLUMN email_settings.test_result IS 'Result of last connection test';
COMMENT ON COLUMN email_settings.test_details IS 'Detailed test results with error messages';
COMMENT ON COLUMN email_settings.rate_limit_per_hour IS 'Maximum emails to send per hour';
COMMENT ON COLUMN email_settings.rate_limit_per_day IS 'Maximum emails to send per day';
COMMENT ON COLUMN email_settings.sync_enabled IS 'Enable automatic email sync from IMAP';
COMMENT ON COLUMN email_settings.sync_frequency_minutes IS 'Frequency of automatic sync in minutes';
COMMENT ON COLUMN email_settings.last_sync_at IS 'Last time emails were synced from IMAP';
COMMENT ON COLUMN email_settings.auto_reply_enabled IS 'Enable auto-reply for this email';
COMMENT ON COLUMN email_settings.auto_reply_message IS 'Auto-reply message template';
COMMENT ON COLUMN email_settings.deleted_at IS 'Soft delete timestamp for data retention';
-- Create indexes for common queries
CREATE INDEX idx_email_settings_user_id ON email_settings(user_id);
CREATE INDEX idx_email_settings_user_email ON email_settings(user_id, email);
CREATE INDEX idx_email_settings_user_default ON email_settings(user_id, is_default);
CREATE INDEX idx_email_settings_email ON email_settings(email);
CREATE INDEX idx_email_settings_is_active ON email_settings(is_active);
CREATE INDEX idx_email_settings_is_deleted ON email_settings(deleted_at)
WHERE deleted_at IS NULL;
CREATE INDEX idx_email_settings_provider ON email_settings(provider);
COMMIT;
-- ========================================================================
-- INSERT DEFAULT SMTP CONFIGURATIONS FOR POPULAR PROVIDERS
-- ========================================================================
BEGIN TRANSACTION;
-- Insert Gmail SMTP configuration as reference
INSERT INTO email_settings (
        user_id,
        email,
        display_name,
        provider,
        smtp_host,
        smtp_port,
        smtp_secure,
        imap_host,
        imap_port,
        imap_secure,
        is_active,
        created_at,
        updated_at
    )
VALUES (
        0,
        'reference-gmail@gmail.com',
        'Gmail Reference',
        'gmail',
        'smtp.gmail.com',
        587,
        false,
        'imap.gmail.com',
        993,
        true,
        false,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ) ON CONFLICT DO NOTHING;
-- Insert Outlook SMTP configuration as reference
INSERT INTO email_settings (
        user_id,
        email,
        display_name,
        provider,
        smtp_host,
        smtp_port,
        smtp_secure,
        imap_host,
        imap_port,
        imap_secure,
        is_active,
        created_at,
        updated_at
    )
VALUES (
        0,
        'reference-outlook@outlook.com',
        'Outlook Reference',
        'outlook',
        'smtp.office365.com',
        587,
        false,
        'outlook.office365.com',
        993,
        true,
        false,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ) ON CONFLICT DO NOTHING;
-- Insert Zoho SMTP configuration as reference
INSERT INTO email_settings (
        user_id,
        email,
        display_name,
        provider,
        smtp_host,
        smtp_port,
        smtp_secure,
        imap_host,
        imap_port,
        imap_secure,
        is_active,
        created_at,
        updated_at
    )
VALUES (
        0,
        'reference-zoho@zoho.in',
        'Zoho Reference',
        'zoho',
        'smtp.zoho.in',
        465,
        true,
        'imap.zoho.in',
        993,
        true,
        false,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ) ON CONFLICT DO NOTHING;
COMMIT;
-- ========================================================================
-- END OF MIGRATION
-- ========================================================================