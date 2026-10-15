import pool from '../db/pgPool.js';

/** Migration-owned CRM marketing campaign, list, template and tracking schema. */
export async function up() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS crm_marketing_senders (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      reply_to VARCHAR(255),
      provider VARCHAR(50) NOT NULL DEFAULT 'smtp',
      provider_sender_id VARCHAR(255),
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_lists (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      source VARCHAR(50) NOT NULL DEFAULT 'manual',
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_list_members (
      id BIGSERIAL PRIMARY KEY,
      list_id BIGINT NOT NULL REFERENCES crm_marketing_lists(id) ON DELETE CASCADE,
      contact_id BIGINT,
      lead_id BIGINT,
      email VARCHAR(255) NOT NULL,
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      company VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      status VARCHAR(30) NOT NULL DEFAULT 'subscribed',
      source VARCHAR(50) NOT NULL DEFAULT 'manual',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(list_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_mlm_list ON crm_marketing_list_members(list_id);
    CREATE TABLE IF NOT EXISTS crm_marketing_imports (
      id BIGSERIAL PRIMARY KEY,
      list_id BIGINT NOT NULL REFERENCES crm_marketing_lists(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'processing',
      total_rows INTEGER NOT NULL DEFAULT 0,
      valid_rows INTEGER NOT NULL DEFAULT 0,
      invalid_rows INTEGER NOT NULL DEFAULT 0,
      duplicate_rows INTEGER NOT NULL DEFAULT 0,
      error_report JSONB NOT NULL DEFAULT '[]'::jsonb,
      s3_key TEXT,
      s3_url TEXT,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_templates (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      preheader TEXT NOT NULL DEFAULT '',
      html_content TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      category VARCHAR(100) NOT NULL DEFAULT 'general',
      variables JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_campaigns (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      preheader TEXT NOT NULL DEFAULT '',
      template_id BIGINT REFERENCES crm_marketing_templates(id) ON DELETE SET NULL,
      sender_id BIGINT REFERENCES crm_marketing_senders(id) ON DELETE SET NULL,
      html_content TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_campaign_lists (
      campaign_id BIGINT NOT NULL REFERENCES crm_marketing_campaigns(id) ON DELETE CASCADE,
      list_id BIGINT NOT NULL REFERENCES crm_marketing_lists(id) ON DELETE CASCADE,
      mode VARCHAR(20) NOT NULL DEFAULT 'include',
      PRIMARY KEY(campaign_id, list_id, mode)
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_campaign_recipients (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES crm_marketing_campaigns(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      personalization JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      provider_message_id TEXT,
      last_error TEXT,
      sent_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      clicked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(campaign_id, email)
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_suppressions (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      reason VARCHAR(50) NOT NULL,
      source_campaign_id BIGINT REFERENCES crm_marketing_campaigns(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_events (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES crm_marketing_campaigns(id) ON DELETE CASCADE,
      recipient_id BIGINT REFERENCES crm_marketing_campaign_recipients(id) ON DELETE CASCADE,
      event_type VARCHAR(30) NOT NULL,
      event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      provider VARCHAR(50) NOT NULL DEFAULT 'internal',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  

    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS reply_to_address VARCHAR(255);
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100) NOT NULL DEFAULT 'email';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS utm_content VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS ab_test_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS ab_test_subject_b TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS ab_test_split INTEGER NOT NULL DEFAULT 50;
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS send_timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS recipient_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE crm_marketing_suppressions ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE crm_marketing_list_members ADD COLUMN IF NOT EXISTS bounce_type VARCHAR(20);
    ALTER TABLE crm_marketing_list_members ADD COLUMN IF NOT EXISTS last_engaged_at TIMESTAMPTZ;

  `);
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS crm_marketing_events CASCADE;
    DROP TABLE IF EXISTS crm_marketing_suppressions CASCADE;
    DROP TABLE IF EXISTS crm_marketing_campaign_recipients CASCADE;
    DROP TABLE IF EXISTS crm_marketing_campaign_lists CASCADE;
    DROP TABLE IF EXISTS crm_marketing_campaigns CASCADE;
    DROP TABLE IF EXISTS crm_marketing_templates CASCADE;
    DROP TABLE IF EXISTS crm_marketing_imports CASCADE;
    DROP TABLE IF EXISTS crm_marketing_list_members CASCADE;
    DROP TABLE IF EXISTS crm_marketing_lists CASCADE;
    DROP TABLE IF EXISTS crm_marketing_senders CASCADE;
  `);
}
