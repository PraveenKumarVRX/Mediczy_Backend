import { recordChatTrace } from './chat-trace.service.js';
import crypto from 'node:crypto';
import pool from '../db/pgPool.js';
import { createDurableChatSessions } from '../repositories/owned-chat-sessions.js';
import { buildChatRequest, requireAIConsent, requireSibSuccess } from './medical-chat-contract.js';
import { sibPost } from './sib-client.js';

export async function channelChat({ channel, binding, owner, message, language = 'en', userId, context, personal = false }) {
  const started=Date.now();
  const traceId=crypto.randomUUID();
  let id;
  try {
  const secret = process.env.SIB_SERVICE_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw Object.assign(new Error('Chat service authentication unavailable'), { statusCode: 503 });
  if (personal && process.env.CHATBOT_PERSONAL_CONTEXT_ENABLED === 'false') throw Object.assign(new Error('Personal clinical context is disabled'),{statusCode:503});
  if (personal) await requireAIConsent(pool, userId);
  const ownerScope = `${personal ? 'personal:' : ''}channel:` + crypto.createHmac('sha256', secret).update(owner).digest('hex');
  id = 'chat_' + crypto.createHmac('sha256', secret).update(JSON.stringify([channel, binding, ownerScope])).digest('hex').slice(0, 32);
  // Deterministic server-derived binding; expired sessions start empty, never adopt legacy history.
  await pool.query(`INSERT INTO chatbot_sessions(session_id,owner_scope,expires_at)
    VALUES($1,$2,NOW()+INTERVAL '1 hour') ON CONFLICT(session_id) DO UPDATE SET
      active=TRUE,messages='[]',context_snapshot='{}',metadata=chatbot_sessions.metadata-'action'-'feedback',message_count=0,expires_at=NOW()+INTERVAL '1 hour',revision=chatbot_sessions.revision+1
    WHERE chatbot_sessions.owner_scope=EXCLUDED.owner_scope AND
      (NOT chatbot_sessions.active OR chatbot_sessions.expires_at<=NOW())`, [id, ownerScope]);
  const sessions = createDurableChatSessions(pool);
  const history = await sessions.load(id, ownerScope);
  const response = await sibPost(`${process.env.SIB_URL || 'http://localhost:8001'}/chat`, {
    ...buildChatRequest({ sessionId: id, query: message, language, history, userId, context, personal }), channel, trace_id: traceId,
  });
  requireSibSuccess({ ok: response.status >= 200 && response.status < 300, status: response.status });
  const answer = response.data.response || response.data.chat_answer;
  if (!answer || typeof answer !== 'string') throw Object.assign(new Error('Medical AI response unavailable'), { statusCode: 503 });
  await sessions.append(id, ownerScope, [{ role: 'user', content: message }, { role: 'assistant', content: answer }]);
  void recordChatTrace({traceId,sessionId:id,channel,latencyMs:Date.now()-started,provider:response.data.provider,model:response.data.model,evidenceStatus:response.data.retrieval?.evidence_status,success:true});
  return { ...response, data: { ...response.data, conversation_id: id, sessionId: id, traceId, conversationLength: Math.floor((history.length+2)/2) } };
  } catch(error) {
    void recordChatTrace({traceId,sessionId:id,channel,latencyMs:Date.now()-started,success:false,errorType:error.statusCode?`http-${error.statusCode}`:'dependency-unavailable'});
    throw error;
  }

}
