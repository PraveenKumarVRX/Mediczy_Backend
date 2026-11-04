// Additive preparation; deliberately does not adopt or expose ownerless legacy sessions.
export const CHATBOT_COMPLETION_SCHEMA = `
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id BIGSERIAL PRIMARY KEY, session_id TEXT NOT NULL UNIQUE,
  user_id TEXT, user_role TEXT DEFAULT 'user', language TEXT DEFAULT 'en',
  context_snapshot JSONB DEFAULT '{}', metadata JSONB DEFAULT '{}',
  messages JSONB DEFAULT '[]', message_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE, last_intent TEXT, last_provider TEXT,
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE chatbot_sessions ADD COLUMN IF NOT EXISTS owner_scope TEXT;
ALTER TABLE chatbot_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE chatbot_sessions ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS chatbot_sessions_owned_expiry ON chatbot_sessions (expires_at) WHERE owner_scope IS NOT NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS chat_request_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_chat_request_key ON appointments(chat_request_key) WHERE chat_request_key IS NOT NULL;
ALTER TABLE ai_knowledge_documents ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE ai_knowledge_documents ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMPTZ;
ALTER TABLE ai_knowledge_documents ADD COLUMN IF NOT EXISTS source_version TEXT;
ALTER TABLE ai_knowledge_documents ADD COLUMN IF NOT EXISTS approved_content_hash TEXT;
`;

export async function applyChatbotSchema(database, { dryRun = false } = {}) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query(CHATBOT_COMPLETION_SCHEMA);
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
