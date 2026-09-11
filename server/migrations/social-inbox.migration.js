/**
 * Migration: social_inbox
 * Stores Instagram Direct + Facebook Messenger conversations/messages received
 * via the Meta webhook (shared with fb-leads.route.js) and sent from the Team
 * portal's Social Inbox.
 */

import pool from '../db/pgPool.js';

export async function runSocialInboxMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS social_inbox_conversations (
        id                    SERIAL PRIMARY KEY,
        channel               TEXT NOT NULL CHECK (channel IN ('instagram', 'facebook')),
        page_id               TEXT,
        external_user_id      TEXT NOT NULL,
        contact_name          TEXT,
        contact_avatar_url    TEXT,
        last_message_preview  TEXT,
        last_message_at       TIMESTAMPTZ,
        last_direction        TEXT CHECK (last_direction IN ('inbound', 'outbound')),
        unread_count          INTEGER NOT NULL DEFAULT 0,
        status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        assigned_team_user_id INTEGER,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (channel, external_user_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_social_inbox_conv_updated
        ON social_inbox_conversations (updated_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS social_inbox_messages (
        id                  SERIAL PRIMARY KEY,
        conversation_id     INTEGER NOT NULL REFERENCES social_inbox_conversations(id) ON DELETE CASCADE,
        direction           TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        external_message_id TEXT,
        body                TEXT,
        attachments          JSONB,
        sent_by_team_user_id INTEGER,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_social_inbox_msg_conv
        ON social_inbox_messages (conversation_id, created_at DESC)
    `);

    await client.query('COMMIT');
    console.log('✅ social_inbox migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ social_inbox migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
