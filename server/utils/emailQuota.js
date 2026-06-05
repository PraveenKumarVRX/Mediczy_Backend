/**
 * emailQuota.js
 * Daily send-quota tracking for Brevo (and any provider with a perDay cap).
 * Uses Redis INCR + expiry so counters reset automatically at midnight UTC.
 *
 * Quota split:
 *   bulk            — welcome email batch sends        (default 275/day)
 *   transactional   — OTPs, notifications, alerts       (default 25/day)
 */

import { redisClient } from '../db/redis.js';

const BULK_LIMIT          = 275;
const TRANSACTIONAL_LIMIT = 25;

function todayKey(type) {
  const d = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `email:brevo:${type}:${d}`;
}

const TTL_SECONDS = 26 * 60 * 60; // 26 h — survives past midnight, auto-clears next day

/**
 * Returns { used, limit, remaining, allowed }
 * type: 'bulk' | 'transactional'
 */
export async function checkQuota(type = 'transactional') {
  const limit = type === 'bulk' ? BULK_LIMIT : TRANSACTIONAL_LIMIT;
  if (!redisClient) return { used: 0, limit, remaining: limit, allowed: true };
  try {
    const used = parseInt(await redisClient.get(todayKey(type)) || '0', 10);
    return { used, limit, remaining: Math.max(0, limit - used), allowed: used < limit };
  } catch {
    return { used: 0, limit, remaining: limit, allowed: true }; // fail open
  }
}

/**
 * Increments the counter by `count`.
 * Returns new total used.
 */
export async function recordSent(type = 'transactional', count = 1) {
  if (!redisClient || count <= 0) return 0;
  try {
    const key = todayKey(type);
    const newVal = await redisClient.incrby(key, count);
    // Set expiry only on first write (when newVal === count)
    if (newVal === count) await redisClient.expire(key, TTL_SECONDS);
    return newVal;
  } catch {
    return 0;
  }
}

/**
 * Returns current usage for both quotas.
 */
export async function getQuotaStatus() {
  const [bulk, txn] = await Promise.all([
    checkQuota('bulk'),
    checkQuota('transactional'),
  ]);
  return { bulk, transactional: txn };
}
