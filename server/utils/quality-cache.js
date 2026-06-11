/**
 * Quality Cache
 * =============
 * Redis-backed cache layer for the Feedback Intelligence system.
 *
 * Cache buckets (per DevOps spec §14):
 *   quality:score:{component}     TTL 5 min  — ai_component_quality_scores row
 *   classifier:cache:{textHash}   TTL 24 h   — SeverityClassification result
 *   experiment:{comp}:{userId}    TTL 7 d    — A/B arm assignment (managed by ab-testing.service.js)
 *
 * All cache ops are safe-to-fail — fallback to DB/live compute if Redis is down.
 */

import crypto from 'crypto';
import { redisCache } from '../config/redis-hardened.js';

const TTL = {
  QUALITY_SCORE: 300,      // 5 minutes
  CLASSIFIER:    86400,    // 24 hours
  EXPERIMENT:    7 * 86400, // 7 days
};

function client() {
  try { return redisCache(); } catch { return null; }
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 32);
}

// ── Quality score cache ───────────────────────────────────────────────────────

export async function getQualityScore(component) {
  try {
    const rc  = client();
    if (!rc) return null;
    const raw = await rc.get(`quality:score:${component}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function setQualityScore(component, scoreObj) {
  try {
    const rc = client();
    if (rc) await rc.set(`quality:score:${component}`, JSON.stringify(scoreObj), { EX: TTL.QUALITY_SCORE });
  } catch { /* ignore */ }
}

export async function invalidateQualityScore(component) {
  try {
    const rc = client();
    if (rc) await rc.del(`quality:score:${component}`);
  } catch { /* ignore */ }
}

export async function invalidateAllQualityScores() {
  try {
    const rc = client();
    if (!rc) return;
    const keys = await rc.keys('quality:score:*');
    if (keys.length) await rc.del(keys);
  } catch { /* ignore */ }
}

// ── Classifier result cache ───────────────────────────────────────────────────

export async function getClassifierCache(text) {
  try {
    const rc  = client();
    if (!rc) return null;
    const raw = await rc.get(`classifier:cache:${hash(text)}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function setClassifierCache(text, result) {
  try {
    const rc = client();
    if (rc) await rc.set(`classifier:cache:${hash(text)}`, JSON.stringify(result), { EX: TTL.CLASSIFIER });
  } catch { /* ignore */ }
}

// ── Utility: flush all feedback-intelligence keys ────────────────────────────

export async function flushFeedbackCache() {
  try {
    const rc = client();
    if (!rc) return 0;
    const keys = await rc.keys('quality:*').then(k1 =>
      rc.keys('classifier:*').then(k2 =>
        rc.keys('experiment:*').then(k3 =>
          rc.keys('cohort:*').then(k4 =>
            rc.keys('nps_trend:*').then(k5 =>
              rc.keys('active_exp:*').then(k6 =>
                rc.keys('experiments:*').then(k7 => [...k1,...k2,...k3,...k4,...k5,...k6,...k7])
              )
            )
          )
        )
      )
    );
    if (keys.length) await rc.del(keys);
    return keys.length;
  } catch { return 0; }
}

export default { getQualityScore, setQualityScore, invalidateQualityScore,
                 invalidateAllQualityScores, getClassifierCache, setClassifierCache,
                 flushFeedbackCache };
