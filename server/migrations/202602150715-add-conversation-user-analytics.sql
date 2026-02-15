-- ========================================================================
-- MIGRATION: Add Conversation-User Analytics Columns
-- DATE: 2026-02-15 07:15:00
-- PURPOSE: Link conversations to users and add health diary fields
-- ========================================================================
-- 1. Add user_id columns to chat_conversations for explicit user references
BEGIN TRANSACTION;
-- Add columns to chat_conversations table
ALTER TABLE chat_conversations
ADD COLUMN IF NOT EXISTS user_id_1 INTEGER,
    ADD COLUMN IF NOT EXISTS user_id_2 INTEGER,
    ADD COLUMN IF NOT EXISTS health_context JSONB,
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;
-- Add comments for documentation
COMMENT ON COLUMN chat_conversations.user_id_1 IS 'First participant user ID (linked to users table)';
COMMENT ON COLUMN chat_conversations.user_id_2 IS 'Second participant user ID (linked to users table)';
COMMENT ON COLUMN chat_conversations.health_context IS 'Health-related context extracted from conversation (symptoms, medications, etc.)';
COMMENT ON COLUMN chat_conversations.category IS 'Conversation category: general, medical, appointment, prescription, follow-up';
COMMENT ON COLUMN chat_conversations.is_archived IS 'Archive status for retention/compliance';
COMMENT ON COLUMN chat_conversations.archived_at IS 'Date when conversation was archived';
COMMENT ON COLUMN chat_conversations.message_count IS 'Total message count for quick analytics';
-- 2. Add health diary fields to chat_messages table
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS health_keywords JSONB,
    ADD COLUMN IF NOT EXISTS health_sentiment VARCHAR(20),
    ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'app';
COMMENT ON COLUMN chat_messages.health_keywords IS 'Extracted health keywords: symptoms, medications, vitals, conditions';
COMMENT ON COLUMN chat_messages.health_sentiment IS 'Sentiment for health context: positive, neutral, negative';
COMMENT ON COLUMN chat_messages.channel IS 'Message channel: app, whatsapp, email, rocketchat, sms';
-- 3. Create indexes on new columns for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id_1 ON chat_conversations(user_id_1);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id_2 ON chat_conversations(user_id_2);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_category ON chat_conversations(category);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_is_archived ON chat_conversations(is_archived);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_1_2 ON chat_conversations(user_id_1, user_id_2);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient_id ON chat_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel);
CREATE INDEX IF NOT EXISTS idx_chat_messages_health_sentiment ON chat_messages(health_sentiment);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
-- 4. Populate existing conversations with user IDs from participants field
UPDATE chat_conversations
SET user_id_1 = CAST((participants->0->>'id') AS INTEGER),
    user_id_2 = CAST((participants->1->>'id') AS INTEGER)
WHERE user_id_1 IS NULL
    AND participants IS NOT NULL
    AND jsonb_array_length(participants) >= 2;
-- 5. Create a view for user conversation analytics
CREATE OR REPLACE VIEW v_user_conversation_analytics AS
SELECT CASE
        WHEN cc.user_id_1 = cm.sender_id THEN cc.user_id_1
        ELSE cc.user_id_2
    END as user_id,
    COUNT(DISTINCT cc.id) as conversation_count,
    COUNT(cm.id) as total_messages,
    COUNT(DISTINCT cm.channel) as unique_channels,
    MAX(cm.created_at) as last_message_at,
    COUNT(
        CASE
            WHEN cm.health_sentiment IS NOT NULL THEN 1
        END
    ) as health_related_messages,
    COUNT(
        CASE
            WHEN cm.health_sentiment = 'positive' THEN 1
        END
    ) as positive_health_messages,
    COUNT(
        CASE
            WHEN cm.health_sentiment = 'negative' THEN 1
        END
    ) as negative_health_messages
FROM chat_conversations cc
    LEFT JOIN chat_messages cm ON cc.id = cm.conversation_id
WHERE cc.is_archived = false
GROUP BY user_id;
-- 6. Create view for health diary analytics
CREATE OR REPLACE VIEW v_user_health_insights AS
SELECT cm.sender_id as user_id,
    COUNT(DISTINCT cm.conversation_id) as conversations_with_health_context,
    COUNT(
        CASE
            WHEN cm.health_keywords IS NOT NULL THEN 1
        END
    ) as messages_with_keywords,
    COUNT(
        CASE
            WHEN cm.health_sentiment = 'positive' THEN 1
        END
    ) as positive_health_updates,
    COUNT(
        CASE
            WHEN cm.health_sentiment = 'negative' THEN 1
        END
    ) as negative_health_updates,
    ARRAY_AGG(DISTINCT cm.channel) as communication_channels,
    MAX(cm.created_at) as last_health_update
FROM chat_messages cm
WHERE cm.health_keywords IS NOT NULL
    OR cm.health_sentiment IS NOT NULL
GROUP BY cm.sender_id;
COMMIT;
-- ========================================================================
-- ROLLBACK INSTRUCTIONS (if needed):
-- ========================================================================
-- DROP VIEW IF EXISTS v_user_health_insights;
-- DROP VIEW IF EXISTS v_user_conversation_analytics;
-- DROP INDEX IF EXISTS idx_chat_messages_created_at;
-- DROP INDEX IF EXISTS idx_chat_messages_health_sentiment;
-- DROP INDEX IF EXISTS idx_chat_messages_channel;
-- DROP INDEX IF EXISTS idx_chat_messages_recipient_id;
-- DROP INDEX IF EXISTS idx_chat_messages_sender_id;
-- DROP INDEX IF EXISTS idx_chat_conversations_user_1_2;
-- DROP INDEX IF EXISTS idx_chat_conversations_is_archived;
-- DROP INDEX IF EXISTS idx_chat_conversations_category;
-- DROP INDEX IF EXISTS idx_chat_conversations_user_id_2;
-- DROP INDEX IF EXISTS idx_chat_conversations_user_id_1;
-- ALTER TABLE chat_messages DROP COLUMN IF EXISTS channel;
-- ALTER TABLE chat_messages DROP COLUMN IF EXISTS health_sentiment;
-- ALTER TABLE chat_messages DROP COLUMN IF EXISTS health_keywords;
-- ALTER TABLE chat_conversations DROP COLUMN IF EXISTS message_count;
-- ALTER TABLE chat_conversations DROP COLUMN IF EXISTS archived_at;
-- ALTER TABLE chat_conversations DROP COLUMN IF EXISTS is_archived;
-- ALTER TABLE chat_conversations DROP COLUMN IF EXISTS category;
-- ALTER TABLE chat_conversations DROP COLUMN IF EXISTS health_context;
-- ALTER TABLE chat_conversations DROP COLUMN IF EXISTS user_id_2;
-- ALTER TABLE chat_conversations DROP COLUMN IF EXISTS user_id_1;