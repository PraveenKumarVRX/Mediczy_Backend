/**
 * Migration: fix missing chat_messages columns (channel, healthKeywords, healthSentiment)
 * ==========================================================================================
 * `chat.model.intelligent.js` defines `channel` (with a model-level default of `'app'`),
 * `healthKeywords`, and `healthSentiment` on ChatMessageModel, none with an
 * `underscored`/`field` mapping, so Sequelize targets the exact quoted column names
 * `"channel"`, `"healthKeywords"`, `"healthSentiment"`.
 *
 * None of the three existed on the real `chat_messages` table before this migration —
 * confirmed live. Because `channel` has a model-level default, Sequelize includes it on
 * EVERY `ChatMessageModel.create()` call regardless of what the caller passes, so this
 * was not a dormant/edge-case bug: every call to `ChatModel.addMessage()` (the sole path
 * patient-doctor chat messages are persisted through, `chathandler.controller.js`'s
 * `send-message` socket handler) was failing with `SequelizeDatabaseError: column
 * "channel" of relation "chat_messages" does not exist` — reproduced directly, not
 * inferred. This migration restores chat message persistence, not just sentiment.
 *
 * The earlier migration `202602150715-add-conversation-user-analytics.sql` added a
 * *different*, snake_case `health_sentiment`/`health_keywords`/`channel` set instead —
 * which Sequelize never reads or writes — and was never applied to this database anyway
 * (none of its columns existed before this migration ran). That migration is also
 * independently broken further down (its index/view statements reference
 * `chat_messages.sender_id`/`recipient_id`/`conversation_id`, none of which exist — this
 * table's real columns are camelCase: `senderId`, `recipientId`, `conversationId`), so it
 * cannot be run as a whole against this schema; it is left as-is rather than patched here,
 * since fixing its unrelated `chat_conversations` analytics columns/views is out of scope.
 *
 * Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS "channel" VARCHAR(20) DEFAULT 'app',
      ADD COLUMN IF NOT EXISTS "healthKeywords" JSONB,
      ADD COLUMN IF NOT EXISTS "healthSentiment" VARCHAR(20)
  `);
}

export async function down() {
  await pool.query(`
    ALTER TABLE chat_messages
      DROP COLUMN IF EXISTS "channel",
      DROP COLUMN IF EXISTS "healthKeywords",
      DROP COLUMN IF EXISTS "healthSentiment"
  `);
}
