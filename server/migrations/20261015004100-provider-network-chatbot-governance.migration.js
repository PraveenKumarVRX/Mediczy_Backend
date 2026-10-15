import pool from '../db/pgPool.js';

/** Migration-owned provider network and SIB chatbot schema. */
export async function up() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS provider_network_batches (
      batch_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ingested',
      total_records INTEGER NOT NULL DEFAULT 0,
      qc_pass INTEGER NOT NULL DEFAULT 0,
      qc_fail INTEGER NOT NULL DEFAULT 0,
      published_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS provider_network_entries (
      id BIGSERIAL PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES provider_network_batches(batch_id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      name TEXT,
      website TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      latitude TEXT,
      longitude TEXT,
      contact_person TEXT,
      services JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      qc_status TEXT NOT NULL DEFAULT 'PENDING',
      qc_score INTEGER,
      qc_missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      publish_status TEXT NOT NULL DEFAULT 'draft',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_provider_network_entries_batch ON provider_network_entries(batch_id);
    CREATE INDEX IF NOT EXISTS idx_provider_network_entries_publish ON provider_network_entries(publish_status);
    CREATE INDEX IF NOT EXISTS idx_provider_network_entries_provider_type ON provider_network_entries(provider_type);

    CREATE TABLE IF NOT EXISTS smarthealth_provider_network (
      id BIGSERIAL PRIMARY KEY,
      provider_fingerprint TEXT NOT NULL UNIQUE,
      provider_type TEXT NOT NULL,
      name TEXT,
      website TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      latitude TEXT,
      longitude TEXT,
      contact_person TEXT,
      services JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_url TEXT,
      latest_batch_id TEXT,
      latest_qc_score INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_shpn_provider_type ON smarthealth_provider_network(provider_type);
    CREATE INDEX IF NOT EXISTS idx_shpn_city ON smarthealth_provider_network(city);
    CREATE INDEX IF NOT EXISTS idx_shpn_name ON smarthealth_provider_network(name);

CREATE TABLE IF NOT EXISTS sib_chatbot_configs (
      bot_id TEXT PRIMARY KEY,
      system_prompt TEXT,
      status TEXT DEFAULT 'active',
      channels JSONB DEFAULT '[]'::jsonb,
      settings JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sib_chatbot_interactions (
      id BIGSERIAL PRIMARY KEY,
      bot_id TEXT NOT NULL,
      session_id TEXT,
      user_id TEXT,
      response_time_ms INTEGER,
      provider TEXT,
      intent TEXT,
      success BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sib_bot_interactions_bot_id ON sib_chatbot_interactions(bot_id);
    CREATE INDEX IF NOT EXISTS idx_sib_bot_interactions_created ON sib_chatbot_interactions(created_at DESC);
  `);
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS sib_chatbot_interactions CASCADE;
    DROP TABLE IF EXISTS sib_chatbot_configs CASCADE;
    DROP TABLE IF EXISTS smarthealth_provider_network CASCADE;
    DROP TABLE IF EXISTS provider_network_entries CASCADE;
    DROP TABLE IF EXISTS provider_network_batches CASCADE;
  `);
}
