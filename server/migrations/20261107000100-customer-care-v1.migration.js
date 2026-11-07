/**
 * Customer-care v1 is intentionally separate from the contact-centre voice
 * schema.  In particular, it does not reuse the existing cc_events table,
 * which is an immutable call-event stream with a different tenant key.
 */
import pool from '../db/pgPool.js';
import { pathToFileURL } from 'node:url';

export async function up(database = pool) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS customer_care_knowledge_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER,
      title VARCHAR(240) NOT NULL,
      body TEXT NOT NULL,
      source_uri TEXT,
      language VARCHAR(16) NOT NULL DEFAULT 'en',
      audience VARCHAR(40) NOT NULL DEFAULT 'customer',
      tags TEXT[] NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','published','revoked')),
      review_due_at TIMESTAMPTZ,
      content_owner VARCHAR(160) NOT NULL DEFAULT 'Unassigned',
      published_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (tenant_id IS NULL OR tenant_id > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_customer_care_knowledge_retrieval
      ON customer_care_knowledge_documents(tenant_id, status, language, review_due_at);
    CREATE INDEX IF NOT EXISTS idx_customer_care_knowledge_search
      ON customer_care_knowledge_documents
      USING GIN(to_tsvector('english', title || ' ' || body));

    CREATE TABLE IF NOT EXISTS customer_care_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id INTEGER,
      channel VARCHAR(32) NOT NULL DEFAULT 'web',
      status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','handoff_pending','resolved','closed')),
      risk_level VARCHAR(20) NOT NULL DEFAULT 'normal'
        CHECK (risk_level IN ('normal','elevated','high')),
      last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (tenant_id IS NULL OR tenant_id > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_customer_care_conversation_owner
      ON customer_care_conversations(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_customer_care_conversation_tenant
      ON customer_care_conversations(tenant_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS customer_care_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES customer_care_conversations(id) ON DELETE CASCADE,
      actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('customer','assistant','operator','system')),
      body TEXT NOT NULL CHECK (char_length(body) <= 8000),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_customer_care_messages_conversation
      ON customer_care_messages(conversation_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS customer_care_handoffs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES customer_care_conversations(id) ON DELETE CASCADE,
      tenant_id INTEGER,
      reason_code VARCHAR(80) NOT NULL,
      safe_summary TEXT NOT NULL CHECK (char_length(safe_summary) <= 2000),
      risk_level VARCHAR(20) NOT NULL DEFAULT 'normal'
        CHECK (risk_level IN ('normal','elevated','high')),
      queue_key VARCHAR(80) NOT NULL DEFAULT 'customer-support',
      assigned_to INTEGER,
      sla_due_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','assigned','in_progress','resolved','cancelled')),
      resolution_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      CHECK (tenant_id IS NULL OR tenant_id > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_customer_care_handoffs_queue
      ON customer_care_handoffs(tenant_id, queue_key, status, sla_due_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_care_active_handoff
      ON customer_care_handoffs(conversation_id)
      WHERE status IN ('open','assigned','in_progress');
  `);
}

export async function down(database = pool) {
  await database.query(`
    DROP TABLE IF EXISTS customer_care_handoffs CASCADE;
    DROP TABLE IF EXISTS customer_care_messages CASCADE;
    DROP TABLE IF EXISTS customer_care_conversations CASCADE;
    DROP TABLE IF EXISTS customer_care_knowledge_documents CASCADE;
  `);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  up().then(() => pool.end()).catch(async (error) => { console.error(error); await pool.end(); process.exitCode = 1; });
}

export default { up, down };
