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
          localPushToZone(msg.zone, msg.event, msg.data);
        } else if (msg.scope === 'signal') {
          localPushSignal(msg.event, msg.data);
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

function localPushToZone(zone, event, data) {
  sseClients.forEach((client) => {
    if (!zone || client.zone === zone) {
      writeEvent(client.res, event, data);
    }
  });
}

/** Lightweight non-PHI signal to all clients (zone name only). */
function localPushSignal(event, data) {
  sseClients.forEach((client) => {
    writeEvent(client.res, event, data);
  });
}

export function pushToZone(zone, event, data) {
  localPushToZone(zone, event, data);
  if (redisReady && pub) {
    pub.publish(CHANNEL, JSON.stringify({
      scope: 'zone', zone, event, data, origin: process.pid,
    })).catch(() => {});
  }
}

/**
 * @deprecated Do not use for PHI. Prefer pushQueueEvent / pushToZone.
 * Kept for non-PHI announcements only.
 */
export function pushToAll(event, data) {
  localPushSignal(event, data);
  if (redisReady && pub) {
    pub.publish(CHANNEL, JSON.stringify({
      scope: 'signal', event, data, origin: process.pid,
    })).catch(() => {});
  }
}

/**
 * Zone-scoped queue event with PHI limited to subscribers of that zone.
 * Global clients only receive a non-PHI refresh signal: { zone, event }.
 */
export function pushQueueEvent(zone, event, data) {
  pushToZone(zone, event, data);
  // Non-PHI signal only — never spread entry/board (patient names, phones, aadhaar)
  const signal = { zone, event, ts: Date.now() };
  localPushSignal('queue_updated', signal);
  if (redisReady && pub) {
    pub.publish(CHANNEL, JSON.stringify({
      scope: 'signal', event: 'queue_updated', data: signal, origin: process.pid,
    })).catch(() => {});
  }
}

export function registerDisplaySSE(router) {
  router.get('/events', (req, res) => {
    const zone = req.query.zone || null;
    const deviceId = req.query.deviceId || null;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now(), zone })}\n\n`);

    const clientId = ++_clientSeq;
    sseClients.set(clientId, { res, zone, deviceId });

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
