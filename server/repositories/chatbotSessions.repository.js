import { connectPostgres } from '../db/postgres.js';

function normalizeMessages(rawMessages) {
  return Array.isArray(rawMessages) ? rawMessages : [];
}

async function ensureRow(sessionId) {
  if (!sessionId) return null;
  const pool = await connectPostgres();
  await pool.query(
    'INSERT INTO chatbot_sessions (session_id) VALUES ($1) ON CONFLICT (session_id) DO NOTHING',
    [sessionId]
  );
  return pool;
}

export async function touchSession(sessionId, { userId = null, userRole = 'user', language = 'en', contextSnapshot = {} } = {}) {
  if (!sessionId) return;
  const pool = await connectPostgres();
  const snapshot = JSON.stringify(contextSnapshot || {});
  await pool.query(
    `INSERT INTO chatbot_sessions (session_id, user_id, user_role, language, context_snapshot, active)
     VALUES ($1, $2, $3, $4, $5::jsonb, TRUE)
     ON CONFLICT (session_id) DO UPDATE SET
       user_id = COALESCE(EXCLUDED.user_id, chatbot_sessions.user_id),
       user_role = EXCLUDED.user_role,
       language = EXCLUDED.language,
       context_snapshot = EXCLUDED.context_snapshot,
       active = TRUE,
       updated_at = NOW(),
       last_interaction_at = NOW();`,
    [sessionId, userId ? String(userId) : null, userRole, language, snapshot]
  );
}

export async function fetchMessages(sessionId) {
  if (!sessionId) return [];
  const pool = await connectPostgres();
  const { rows } = await pool.query('SELECT messages FROM chatbot_sessions WHERE session_id = $1 LIMIT 1', [sessionId]);
  return normalizeMessages(rows[0]?.messages);
}

export async function appendConversation(sessionId, entries = [], { lastProvider = null, lastIntent = null } = {}) {
  if (!sessionId || !Array.isArray(entries) || entries.length === 0) return;
  const pool = await ensureRow(sessionId) || await connectPostgres();
  const { rows } = await pool.query('SELECT messages FROM chatbot_sessions WHERE session_id = $1 LIMIT 1', [sessionId]);
  const existing = normalizeMessages(rows[0]?.messages);
  const merged = [...existing, ...entries].slice(-40);
  await pool.query(
    `UPDATE chatbot_sessions
     SET messages = $2::jsonb,
         message_count = $3,
         last_provider = $4,
         last_intent = COALESCE($5, last_intent),
         last_interaction_at = NOW(),
         updated_at = NOW()
     WHERE session_id = $1`,
    [sessionId, JSON.stringify(merged), merged.length, lastProvider, lastIntent]
  );
}

export async function archiveSession(sessionId) {
  if (!sessionId) return false;
  const pool = await connectPostgres();
  const { rowCount } = await pool.query(
    `UPDATE chatbot_sessions
     SET active = FALSE,
         messages = '[]'::jsonb,
         message_count = 0,
         updated_at = NOW(),
         last_interaction_at = NOW()
     WHERE session_id = $1`,
    [sessionId]
  );
  return rowCount > 0;
}

export async function fetchSessionInfo(sessionId) {
  if (!sessionId) return null;
  const pool = await connectPostgres();
  const { rows } = await pool.query(
    `SELECT session_id, message_count, last_intent, last_provider, last_interaction_at, active
     FROM chatbot_sessions
     WHERE session_id = $1
     LIMIT 1`,
    [sessionId]
  );
  if (!rows[0]) {
    return null;
  }
  const info = rows[0];
  return {
    sessionId: info.session_id,
    messageCount: info.message_count,
    lastIntent: info.last_intent,
    lastProvider: info.last_provider,
    lastInteractionAt: info.last_interaction_at,
    active: info.active
  };
}

export async function countSessions() {
  const pool = await connectPostgres();
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM chatbot_sessions');
  return rows[0]?.count || 0;
}

export default {
  touchSession,
  fetchMessages,
  appendConversation,
  archiveSession,
  fetchSessionInfo,
  countSessions
};
