/**
 * Phase 2: Real-time imaging collaboration — SSE + Redis-style in-memory broker.
 * "Figma for medical imaging" — shared sessions, live annotations.
 */
import pool from '../../db/pgPool.js';
import { publishEvent, KAFKA_TOPICS } from '../../config/kafka.js';

const sseClients = new Map();
let _seq = 0;

function broadcast(sessionId, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    if (String(client.sessionId) === String(sessionId)) {
      try { client.res.write(payload); } catch { /* disconnected */ }
    }
  });
}

export async function createSession({ studyInstanceUID, tenantId, userId, userName }) {
  const r = await pool.query(
    `INSERT INTO imaging_collab_sessions (study_instance_uid, tenant_id, created_by, created_by_name)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [studyInstanceUID, tenantId, userId, userName],
  );
  return r.rows[0];
}

export async function addAnnotation({ sessionId, userId, userName, tool, data }) {
  const r = await pool.query(
    `INSERT INTO imaging_collab_annotations (session_id, user_id, user_name, tool, data)
     VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
    [sessionId, userId, userName, tool || 'pointer', JSON.stringify(data || {})],
  );
  const annotation = r.rows[0];
  broadcast(sessionId, 'annotation', annotation);
  await publishEvent(KAFKA_TOPICS.IMAGING_COLLAB_ANNOTATION, { sessionId, annotation }).catch(() => {});
  return annotation;
}

export async function listAnnotations(sessionId) {
  const r = await pool.query(
    `SELECT * FROM imaging_collab_annotations WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return r.rows;
}

export function registerCollabSSE(router, authMiddleware) {
  router.get('/collab/sessions/:sessionId/events', (req, res, next) => {
    const qToken = req.query.access_token;
    if (qToken && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${qToken}`;
    }
    return authMiddleware(req, res, () => {
    const sessionId = req.params.sessionId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ sessionId, ts: Date.now() })}\n\n`);

    const id = ++_seq;
    sseClients.set(id, { res, sessionId, userId: req.user?.id });

    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* */ }
    }, 25000);

    req.on('close', () => {
      clearInterval(ping);
      sseClients.delete(id);
    });
    });
  });
}

export function getCollabStats() {
  return { activeConnections: sseClients.size };
}
