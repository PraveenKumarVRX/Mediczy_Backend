/**
 * Redis Hardened Configuration
 * ----------------------------
 * Multi-database Redis config with Sentinel failover support.
 * Replaces single-node redis-connection.js for production deployments.
 *
 * Database allocation:
 *   DB 0 — BullMQ job queues
 *   DB 1 — Session store (JWT refresh tokens)
 *   DB 2 — Application cache (tenant config, doctor profiles)
 *   DB 3 — Rate limiting (per-tenant, sliding window)
 *   DB 4 — Distributed locks (appointment booking, prescription dispense)
 *   DB 5 — Real-time presence (doctor online, active consultations)
 *
 * Infrastructure:
 *   Development : single Redis node
 *   Staging     : Redis Sentinel (1 master + 2 replicas)
 *   Production  : Redis Cluster (3 shards × 2 replicas each)
 */

import { createClient } from 'redis';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const REDIS_DBS = {
  BULLMQ:    0,
  SESSIONS:  1,
  CACHE:     2,
  RATE_LIMIT: 3,
  LOCKS:     4,
  PRESENCE:  5,
};

// ─── Connection factory ───────────────────────────────────────────────────────

const MODE = process.env.REDIS_MODE || 'single';   // 'single' | 'sentinel' | 'cluster'

function buildIoredisConfig(db = 0) {
  const base = {
    db,
    enableReadyCheck:    true,
    maxRetriesPerRequest: null,
    lazyConnect:          true,
    keepAlive:            30000,
    connectTimeout:       10000,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 5000);
      if (times > 20) {
        console.error(`Redis: max reconnection attempts reached (db ${db})`);
        return null;
      }
      return delay;
    },
  };

  if (MODE === 'sentinel') {
    const sentinels = (process.env.REDIS_SENTINELS || 'localhost:26379')
      .split(',')
      .map(s => {
        const [host, port] = s.trim().split(':');
        return { host, port: parseInt(port, 10) };
      });

    return new Redis({
      ...base,
      sentinels,
      name:           process.env.REDIS_SENTINEL_MASTER || 'mymaster',
      password:       process.env.REDIS_PASSWORD || undefined,
      sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD || undefined,
    });
  }

  if (MODE === 'cluster') {
    const nodes = (process.env.REDIS_CLUSTER_NODES || 'localhost:7000')
      .split(',')
      .map(n => {
        const [host, port] = n.trim().split(':');
        return { host, port: parseInt(port, 10) };
      });

    return new Redis.Cluster(nodes, {
      redisOptions: {
        password: process.env.REDIS_PASSWORD || undefined,
        db: 0,  // Cluster mode: only DB 0 is supported
      },
      clusterRetryStrategy: (times) => Math.min(times * 200, 5000),
    });
  }

  // Single node (default)
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      return new Redis({
        ...base,
        host:     parsed.hostname,
        port:     parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined,
      });
    } catch { /* fall through */ }
  }

  return new Redis({
    ...base,
    host:     process.env.REDIS_HOST     || '127.0.0.1',
    port:     parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  });
}

// ─── Named client pool ────────────────────────────────────────────────────────

const _clients = {};

export function getRedisClient(purpose = 'cache') {
  const db = REDIS_DBS[purpose.toUpperCase()] ?? REDIS_DBS.CACHE;

  if (!_clients[db]) {
    _clients[db] = buildIoredisConfig(db);

    _clients[db].on('error', (err) => {
      console.error(`Redis [db${db}:${purpose}] error:`, err.message);
    });

    _clients[db].on('ready', () => {
      console.log(`✅ Redis [db${db}:${purpose}] ready`);
    });
  }

  return _clients[db];
}

// Pre-built named accessors for convenience
export const redisBullMQ    = () => getRedisClient('BULLMQ');
export const redisSessions  = () => getRedisClient('SESSIONS');
export const redisCache     = () => getRedisClient('CACHE');
export const redisRateLimit = () => getRedisClient('RATE_LIMIT');
export const redisLocks     = () => getRedisClient('LOCKS');
export const redisPresence  = () => getRedisClient('PRESENCE');

// ─── BullMQ connection config (uses db 0, returns plain object not ioredis) ──

export function createBullMQConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      return {
        host:     parsed.hostname,
        port:     parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined,
        db:       REDIS_DBS.BULLMQ,
        maxRetriesPerRequest: null,
        enableReadyCheck:     false,
      };
    } catch { /* fall through */ }
  }
  return {
    host:     process.env.REDIS_HOST     || '127.0.0.1',
    port:     parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db:       REDIS_DBS.BULLMQ,
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
  };
}

// ─── Distributed lock helper ──────────────────────────────────────────────────

/**
 * Acquire a distributed lock using SET NX PX.
 * Returns true if lock acquired, false if already held.
 *
 * @param {string} key       Lock name (e.g. 'lock:appointment:123')
 * @param {number} ttlMs     Lock TTL in milliseconds
 * @param {string} ownerId   Unique owner identifier (for release)
 */
export async function acquireLock(key, ttlMs = 5000, ownerId = String(Date.now())) {
  const client = getRedisClient('LOCKS');
  const result = await client.set(`lock:${key}`, ownerId, 'NX', 'PX', ttlMs);
  return result === 'OK' ? ownerId : null;
}

export async function releaseLock(key, ownerId) {
  const client = getRedisClient('LOCKS');
  const current = await client.get(`lock:${key}`);
  if (current === ownerId) {
    await client.del(`lock:${key}`);
    return true;
  }
  return false;
}

// ─── Cache helper ─────────────────────────────────────────────────────────────

export async function cacheGet(key) {
  const raw = await redisCache().get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function cacheSet(key, value, ttlSeconds = 300) {
  return redisCache().set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheDel(key) {
  return redisCache().del(key);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

export async function closeAllRedisClients() {
  await Promise.all(Object.values(_clients).map(c => c.quit().catch(() => {})));
  console.log('✅ All Redis clients closed');
}

// Called by controllers/shutdown.controller.js as part of the single coordinated shutdown sequence
// — not registered as its own signal handler here, to avoid racing other independent close paths.

export default { getRedisClient, acquireLock, releaseLock, cacheGet, cacheSet, cacheDel, REDIS_DBS };
