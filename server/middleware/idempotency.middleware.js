/**
 * Request idempotency (D-9).
 *
 * The mobile app sends an `Idempotency-Key` header on bookings and orders. Without
 * server support, a retry after a dropped response creates a SECOND booking or a
 * second charge. This middleware stores the first successful response under that key
 * for 24 hours and replays it on repeats, so a retry is safe.
 *
 * Design notes:
 *  - No-op unless the header is present and the method is POST/PUT/PATCH, so it
 *    cannot affect ordinary traffic.
 *  - The key is namespaced by caller + method + path, so one client's key can never
 *    replay another client's response, nor leak across endpoints.
 *  - Claims are taken atomically with SET NX, so two concurrent retries cannot both
 *    execute; the loser gets 409 rather than creating a duplicate.
 *  - Only 2xx responses are stored. A failure releases the claim so the client can
 *    legitimately retry.
 *  - FAILS OPEN: if Redis is unavailable the request proceeds unprotected rather
 *    than blocking bookings — availability of care beats duplicate suppression.
 */
import crypto from 'crypto';
import { redisCache } from '../config/redis-hardened.js';

const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // the spec's 24 hours
const MAX_KEY_LENGTH = 255;

function getRedis() {
  try { return redisCache(); } catch { return null; }
}

/** Fingerprint the caller without storing their credentials. */
function actorFingerprint(req) {
  if (req.user?.id) return `u${req.user.id}`;
  // The verified account from rate-limit-identity (it checks the JWT before
  // routing). Keying on it rather than on the raw Authorization header means a
  // retry after a token refresh still replays instead of booking twice.
  if (req.rateLimitAccountKey && req.rateLimitAccountKey.startsWith('account:')) {
    return `a${crypto.createHash('sha256').update(req.rateLimitAccountKey).digest('hex').slice(0, 16)}`;
  }
  const auth = req.get('authorization') || req.headers?.cookie || '';
  if (!auth) return 'anon';
  return `t${crypto.createHash('sha256').update(auth).digest('hex').slice(0, 16)}`;
}

function buildCacheKey(req, clientKey) {
  const path = `${req.baseUrl || ''}${req.path || ''}` || req.originalUrl.split('?')[0];
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex').slice(0, 32);
  return `idem:${actorFingerprint(req)}:${req.method}:${path}:${keyHash}`;
}

export function idempotency({ ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  return async function idempotencyMiddleware(req, res, next) {
    const clientKey = req.get('Idempotency-Key');
    if (!clientKey || !IDEMPOTENT_METHODS.has(req.method)) return next();
    if (clientKey.length > MAX_KEY_LENGTH) {
      return res.status(400).json({
        success: false,
        message: 'Idempotency-Key is too long.',
        code: 'IDEMPOTENCY_KEY_INVALID',
      });
    }

    const redis = getRedis();
    if (!redis) return next(); // fail open

    const cacheKey = buildCacheKey(req, clientKey);

    let claimed = null;
    try {
      claimed = await redis.set(
        cacheKey,
        JSON.stringify({ state: 'in_progress', at: Date.now() }),
        'EX', ttlSeconds, 'NX'
      );
    } catch {
      return next(); // fail open on a Redis error
    }

    if (claimed !== 'OK') {
      let saved = null;
      try {
        const raw = await redis.get(cacheKey);
        saved = raw ? JSON.parse(raw) : null;
      } catch { /* fall through to in-progress handling */ }

      if (saved?.state === 'done') {
        res.set('Idempotent-Replay', 'true');
        return res.status(saved.statusCode || 200).json(saved.body);
      }

      return res.status(409).json({
        success: false,
        message: 'This request is already being processed. Please wait a moment.',
        code: 'IDEMPOTENT_REQUEST_IN_PROGRESS',
      });
    }

    // Capture the first successful response so a retry can replay it.
    const sendJson = res.json.bind(res);
    let stored = false;
    res.json = (body) => {
      if (!stored) {
        stored = true;
        const status = res.statusCode || 200;
        if (status >= 200 && status < 300) {
          redis.set(
            cacheKey,
            JSON.stringify({ state: 'done', statusCode: status, body }),
            'EX', ttlSeconds
          ).catch(() => {});
        } else {
          // Let the client retry a failed attempt with the same key.
          redis.del(cacheKey).catch(() => {});
        }
      }
      return sendJson(body);
    };

    // If the handler never answers with res.json (an error, a timeout, or a
    // res.send/res.end response we cannot replay), release the claim so a retry
    // is processed instead of getting 409 for the whole TTL.
    const release = () => { if (!stored) { stored = true; redis.del(cacheKey).catch(() => {}); } };
    res.on('finish', release);
    res.on('close', release);

    return next();
  };
}

export default idempotency;
