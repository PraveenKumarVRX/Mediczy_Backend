/**
 * Ambient scribe WebSocket — streams transcription chunks during consultation
 */
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const sessions = new Map();

export function attachScribeWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/scribe/stream' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');
    let userId = null;
    try {
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
      userId = decoded.id;
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const sessionId = `${userId}-${Date.now()}`;
    const chunks = [];
    sessions.set(sessionId, { userId, chunks, startedAt: Date.now() });

    ws.send(JSON.stringify({ type: 'ready', sessionId }));

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'text_chunk') {
          chunks.push(msg.text);
          ws.send(JSON.stringify({ type: 'partial', text: msg.text }));
        } else if (msg.type === 'end') {
          const fullText = chunks.join(' ');
          let structured = null;
          try {
            const res = await fetch(`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:' + (process.env.PORT || 8000)}/api/offline-scribe/full-pipeline`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ transcript: fullText, noteType: msg.noteType || 'opd' }),
            });
            if (res.ok) structured = await res.json();
          } catch {
            structured = { transcript: fullText };
          }
          ws.send(JSON.stringify({ type: 'complete', transcript: fullText, structured }));
          sessions.delete(sessionId);
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    });

    ws.on('close', () => sessions.delete(sessionId));
  });

  console.log('[scribe-stream] WebSocket attached at /api/scribe/stream');
}

export default { attachScribeWebSocket };
