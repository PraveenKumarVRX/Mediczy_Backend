/**
 * IntelligentDB Stub Service — port 5005
 * Lightweight in-memory store that satisfies all ingest/query/update/delete
 * requests made by the Node.js server and OTP model.  Data is persisted in
 * a Map (per collection) for the lifetime of the process.
 *
 * Run via PM2:  pm2 start server/utils/intelligentDbStub.js --name intelligent-db
 */

import http from 'http';

const PORT = process.env.INTELLIGENT_DB_PORT || 5005;

// Simple in-memory collections: Map<collectionName, Map<id, record>>
const store = new Map();

function getCollection(name) {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name);
}

function respond(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0].replace(/\/$/, '');
  const method = req.method;

  // ── Health ────────────────────────────────────────────────────────────────
  if (url === '/health' || url === '/api/intelligent-db/health') {
    return respond(res, 200, { status: 'healthy', mode: 'stub', collections: store.size });
  }

  // ── Status ────────────────────────────────────────────────────────────────
  if (url === '/status' || url === '/api/intelligent-db/status') {
    return respond(res, 200, { status: 'ok', mode: 'stub' });
  }

  // ── Ingest ────────────────────────────────────────────────────────────────
  if ((url === '/ingest' || url === '/api/intelligent-db/ingest') && method === 'POST') {
    const body = await readBody(req);
    const col = getCollection(body.collection || 'default');
    const id = body.payload?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    col.set(String(id), { ...body.payload, _id: id, _ts: Date.now() });
    return respond(res, 200, { success: true, id });
  }

  // ── Query / Search ────────────────────────────────────────────────────────
  if ((url === '/query' || url === '/api/intelligent-db/query' ||
       url === '/search' || url === '/api/intelligent-db/search') && method === 'POST') {
    const body = await readBody(req);
    const col = getCollection(body.collection || 'default');
    const filter = body.filter || {};
    let results = [...col.values()];
    // Apply simple equality filters
    for (const [k, v] of Object.entries(filter)) {
      results = results.filter(r => r[k] == v);
    }
    const limit = body.limit || 100;
    return respond(res, 200, results.slice(0, limit));
  }

  // ── Update ────────────────────────────────────────────────────────────────
  if ((url === '/update' || url === '/api/intelligent-db/update') && method === 'POST') {
    const body = await readBody(req);
    const col = getCollection(body.collection || 'default');
    const id = String(body.id);
    const existing = col.get(id) || {};
    col.set(id, { ...existing, ...body.payload, _id: id });
    return respond(res, 200, { success: true });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  if ((url === '/delete' || url === '/api/intelligent-db/delete') && method === 'POST') {
    const body = await readBody(req);
    const col = getCollection(body.collection || 'default');
    col.delete(String(body.id));
    return respond(res, 200, { success: true });
  }

  // ── Catch-all (keep clients happy) ───────────────────────────────────────
  respond(res, 200, { success: true, stub: true });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[IntelligentDB Stub] Listening on 127.0.0.1:${PORT}`);
});

server.on('error', (err) => {
  console.error('[IntelligentDB Stub] Server error:', err.message);
});
