/**
 * Shared SSE broker for hospital displays, kiosks, and queue events.
 * - Zone-scoped queue events (no cross-zone PHI fan-out)
 * - Optional Redis pub/sub for multi-instance (PM2/ECS)
 */

import Redis from 'ioredis';

const sseClients = new Map();
let _clientSeq = 0;
const CHANNEL = process.env.QMS_SSE_REDIS_CHANNEL || 'mediczy:qms:sse';

let pub = null;
let sub = null;
let redisReady = false;

function redisEnabled() {
  return String(process.env.QMS_SSE_REDIS ?? 'true').toLowerCase() !== 'false'
    && (process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_PASSWORD);
}

function buildRedis() {
  const opts = {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  };
  if (process.env.REDIS_URL) return new Redis(process.env.REDIS_URL, opts);
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    ...opts,
  });
}

async function ensureRedis() {
  if (!redisEnabled() || redisReady) return redisReady;
  try {
    pub = buildRedis();
    sub = buildRedis();

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Redis connect timeout')), 3000);
      const onReady = () => { clearTimeout(t); resolve(); };
      if (sub.status === 'ready') return onReady();
      sub.once('ready', onReady);
      sub.once('error', (err) => { clearTimeout(t); reject(err); });
    });

    await sub.subscribe(CHANNEL);
    sub.on('message', (_ch, raw) => {
      try {
        const msg = JSON.parse(raw);
        if (!msg?.event) return;
        // Ignore echoes from this process — we already wrote locally
        if (msg.origin === process.pid) return;
        if (msg.scope === 'zone') {
          localPushToZone(msg.organizationId ?? null, msg.zone, msg.event, msg.data);
        } else if (msg.scope === 'signal') {
          localPushSignal(msg.event, msg.data, msg.organizationId ?? null);
        }
      } catch (_) { /* ignore bad payloads */ }
    });
    redisReady = true;
    console.log('[sse-broker] Redis pub/sub enabled on', CHANNEL);
  } catch (e) {
    console.warn('[sse-broker] Redis unavailable — single-process SSE only:', e.message);
    try { pub?.disconnect(); sub?.disconnect(); } catch (_) {}
    pub = null;
    sub = null;
    redisReady = false;
  }
  return redisReady;
}

// Kick off Redis in background (non-blocking)
ensureRedis().catch(() => {});

function writeEvent(res, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  try { res.write(payload); } catch (_) {}
}

// Zone names (icu, opd-waiting, er-triage, ...) are reused across every
// tenant on the platform — they are NOT unique. organizationId is what
// actually keeps one hospital's PHI off another hospital's screens; a push
// that omits it (legacy callers not yet threaded through — see
// display-mqtt-bridge / ambient-deterioration) falls back to zone-only
// matching, same as before. Every new/updated call site should pass it.
function localPushToZone(organizationId, zone, event, data) {
  sseClients.forEach((client) => {
    if (organizationId != null && client.organizationId !== organizationId) return;
    if (!zone || client.zone === zone) {
      writeEvent(client.res, event, data);
    }
  });
}

/** Lightweight non-PHI signal (zone name only). Org-filtered when organizationId is passed. */
function localPushSignal(event, data, organizationId = null) {
  sseClients.forEach((client) => {
    if (organizationId != null && client.organizationId !== organizationId) return;
    writeEvent(client.res, event, data);
  });
}

export function pushToZone(zone, event, data, organizationId = null) {
  localPushToZone(organizationId, zone, event, data);
  if (redisReady && pub) {
    pub.publish(CHANNEL, JSON.stringify({
      scope: 'zone', zone, event, data, organizationId, origin: process.pid,
    })).catch(() => {});
  }
}

/**
 * @deprecated Do not use for PHI. Prefer pushQueueEvent / pushToZone.
 * Kept for non-PHI announcements only. Pass organizationId to scope to one
 * tenant — omitting it broadcasts platform-wide, which should only ever be
 * intentional (e.g. a true platform-ops signal), never the default.
 */
export function pushToAll(event, data, organizationId = null) {
  localPushSignal(event, data, organizationId);
  if (redisReady && pub) {
    pub.publish(CHANNEL, JSON.stringify({
      scope: 'signal', event, data, organizationId, origin: process.pid,
    })).catch(() => {});
  }
}

/**
 * Zone-scoped queue event with PHI limited to subscribers of that zone AND
 * organization. Global clients only receive a non-PHI refresh signal
 * ({ zone, event }, no patient data) — that one stays platform-wide, since
 * it carries nothing sensitive.
 */
// Display SSE reaches public waiting-room screens. The green-channel marker
// (metadata.greenChannel) is staff-only in every display mode, so it is removed
// here, at the single choke point, from every entry a queue event can carry —
// no caller can bypass it by building its own payload.
function withoutGreenChannel(entry) {
  if (!entry || typeof entry !== 'object' || !entry.metadata || typeof entry.metadata !== 'object' || !('greenChannel' in entry.metadata)) return entry;
  const { greenChannel: _omit, ...metadata } = entry.metadata;
  return { ...entry, metadata };
}

function sanitizeQueuePayload(data) {
  if (!data || typeof data !== 'object') return data;
  const safe = { ...data };
  for (const key of ['entry', 'from', 'to']) {
    if (safe[key]) safe[key] = withoutGreenChannel(safe[key]);
  }
  if (safe.board && Array.isArray(safe.board.entries)) {
    safe.board = { ...safe.board, entries: safe.board.entries.map(withoutGreenChannel) };
  }
  return safe;
}

export function pushQueueEvent(zone, event, data, organizationId = null) {
  pushToZone(zone, event, sanitizeQueuePayload(data), organizationId);
  const signal = { zone, event, ts: Date.now() };
  localPushSignal('queue_updated', signal);
  if (redisReady && pub) {
    pub.publish(CHANNEL, JSON.stringify({
      scope: 'signal', event: 'queue_updated', data: signal, origin: process.pid,
    })).catch(() => {});
  }
}

export function registerDisplaySSE(router, resolveOrgId) {
  router.get('/events', async (req, res) => {
    const zone = req.query.zone || null;
    const deviceId = req.query.deviceId || null;
    // Same trust model as the other public display reads (optionalDisplayDeviceOrDefaultOrg):
    // a valid deviceToken binds the real org; no token falls back to the single-tenant
    // LAN default so existing unauthenticated boards keep working unchanged.
    const organizationId = resolveOrgId ? await resolveOrgId(req, res) : null;
    if (organizationId === false) return; // resolver already sent an error response

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now(), zone })}\n\n`);

    const clientId = ++_clientSeq;
    sseClients.set(clientId, { res, zone, deviceId, organizationId });

    const keepalive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) {}
    }, 25000);

    req.on('close', () => {
      clearInterval(keepalive);
      sseClients.delete(clientId);
    });
  });
}

export function getSSEStats() {
  const byZone = {};
  sseClients.forEach(({ zone }) => {
    const key = zone || 'unzoned';
    byZone[key] = (byZone[key] || 0) + 1;
  });
  return { connected: sseClients.size, byZone, redis: redisReady };
}

export default {
  pushToAll,
  pushToZone,
  pushQueueEvent,
  registerDisplaySSE,
  getSSEStats,
};
