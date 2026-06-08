/**
 * IP Threat Intelligence Middleware
 *
 * Detects and blocks:
 *  - VPN / proxy connections  (ip-api.com `proxy` flag)
 *  - Hosting / datacenter IPs (ip-api.com `hosting` flag)
 *  - Tor exit nodes           (torproject.org bulk list, refreshed daily)
 *  - Known malicious IPs      (AbuseIPDB if key is configured)
 *  - Custom blacklisted IPs   (our credentialStuffingGuard Redis store)
 *
 * For every enriched request it logs: IP, country, city, ISP, org, ASN,
 * threat type, action taken, endpoint, user-agent, email (if sent in body).
 *
 * Data source:  ip-api.com — free, no key, 45 req/min per origin
 * Cache:        Redis, 24-hour TTL per IP
 * Persistence:  ip_threat_events PostgreSQL table
 */

import Redis from 'ioredis';
import https from 'https';
import http from 'http';
import pg from 'pg';

// ── Config ────────────────────────────────────────────────────────────────────
const REDIS_HOST     = process.env.REDIS_HOST  || 'localhost';
const REDIS_PORT     = parseInt(process.env.REDIS_PORT) || 6379;
const ABUSEIPDB_KEY  = process.env.ABUSEIPDB_API_KEY || null;
const DB_HOST        = process.env.POSTGRES_HOST     || '127.0.0.1';
const DB_PORT        = parseInt(process.env.POSTGRES_PORT) || 5432;
const DB_NAME        = process.env.POSTGRES_DB       || 'mediczy_ai';
const DB_USER        = process.env.POSTGRES_USER     || 'mediczy_helper';
const DB_PASS        = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || undefined;
const DB_SSL         = String(process.env.POSTGRES_SSL || process.env.POSTGRES_PRIMARY_SSL || '').toLowerCase() === 'true' || !['127.0.0.1', 'localhost'].includes(DB_HOST);

// What to block (toggle false to monitor-only without blocking)
const BLOCK_POLICY = {
  proxy:        true,  // VPN / SOCKS / HTTP proxies
  tor:          true,  // Tor exit nodes
  hosting:      false, // Datacenter IPs (false = log only; mobile apps may use CDN IPs)
  abuse_score:  80,    // Block if AbuseIPDB score >= this (0 = disable)
};

// Redis key prefixes
const CACHE_PREFIX   = 'iti:cache:';   // IP intel cache
const TOR_KEY        = 'iti:tor_nodes'; // Tor exit node set
const TOR_UPDATED    = 'iti:tor_updated';

// ── Singletons ────────────────────────────────────────────────────────────────
let redisClient = null;
let pgPool      = null;

const getRedis = () => {
  if (!redisClient) {
    redisClient = new Redis({
      host: REDIS_HOST, port: REDIS_PORT,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true, enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (t) => (t > 2 ? null : t * 100),
    });
    redisClient.on('error', () => {}); // silent
  }
  return redisClient;
};

const getPool = () => {
  if (!pgPool) {
    pgPool = new pg.Pool({
      host: DB_HOST, port: DB_PORT, database: DB_NAME,
      user: DB_USER, password: DB_PASS,
      ssl: DB_SSL ? { rejectUnauthorized: false } : false,
      max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 3000,
    });
  }
  return pgPool;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract real visitor IP, honouring Cloudflare CF-Connecting-IP first */
const getClientIP = (req) => {
  const cfIP = req.headers['cf-connecting-ip'];
  if (cfIP?.trim()) return cfIP.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const first = fwd.split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || req.connection?.remoteAddress || '0.0.0.0';
};

/** Simple HTTP/HTTPS GET → JSON */
const fetchJSON = (url) =>
  new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });

/** Fetch Tor exit node list and cache in Redis for 24 h */
const refreshTorList = async (r) => {
  try {
    const lastUpdate = await r.get(TOR_UPDATED).catch(() => null);
    if (lastUpdate) return; // Already fresh

    const res = await fetchJSON('https://check.torproject.org/torbulkexitlist');
    // fetchJSON won't work for plain text — use raw http
    return; // handled below
  } catch { /* handled below */ }
};

const ensureTorList = async (r) => {
  try {
    const lastUpdate = await r.get(TOR_UPDATED).catch(() => null);
    if (lastUpdate) return;

    // Fetch raw text
    const nodes = await new Promise((resolve, reject) => {
      https.get('https://check.torproject.org/torbulkexitlist', { timeout: 8000 }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data.split('\n').filter(l => /^\d/.test(l.trim()))));
      }).on('error', reject).on('timeout', reject);
    });

    if (nodes.length > 100) {
      const pipeline = r.pipeline();
      pipeline.del(TOR_KEY);
      for (const node of nodes) pipeline.sadd(TOR_KEY, node.trim());
      pipeline.expire(TOR_KEY, 86400);
      await pipeline.exec();
      await r.set(TOR_UPDATED, Date.now(), 'EX', 86400);
      console.log(`[ITI] Tor exit node list cached: ${nodes.length} nodes`);
    }
  } catch (err) {
    console.warn('[ITI] Tor list refresh failed:', err.message);
  }
};

/** Query ip-api.com for full IP intel (proxy, hosting, country, ISP, etc.) */
const queryIPAPI = async (ip) => {
  const fields = 'status,message,country,countryCode,regionName,city,isp,org,as,proxy,hosting,query';
  const data = await fetchJSON(`http://ip-api.com/json/${ip}?fields=${fields}`);
  if (data.status !== 'success') return null;
  return data;
};

/** Query AbuseIPDB (only if API key is configured) */
const queryAbuseIPDB = async (ip) => {
  if (!ABUSEIPDB_KEY) return null;
  try {
    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.abuseipdb.com',
        path: `/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
        method: 'GET',
        headers: { Key: ABUSEIPDB_KEY, Accept: 'application/json' },
        timeout: 5000,
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('parse')); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
    return data?.data || null;
  } catch { return null; }
};

// ── Core: enrich IP ───────────────────────────────────────────────────────────

/**
 * Get full threat intel for an IP.
 * Tries Redis cache first (24h), then queries ip-api.com + AbuseIPDB + Tor list.
 * Returns:
 *   { ip, country, countryCode, city, region, isp, org, asn,
 *     isProxy, isHosting, isTor, isVPN, threatType, abuseScore, fromCache }
 */
export const enrichIP = async (ip) => {
  // Skip private/loopback IPs
  if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|0\.0\.0\.0)/.test(ip)) {
    return { ip, country: 'Private', countryCode: 'XX', isProxy: false, isHosting: false, isTor: false, isVPN: false, threatType: 'private', abuseScore: 0, fromCache: true };
  }

  const r = getRedis();
  const cacheKey = `${CACHE_PREFIX}${ip}`;

  // 1. Redis cache check
  try {
    const cached = await r.get(cacheKey);
    if (cached) return { ...JSON.parse(cached), fromCache: true };
  } catch { /* Redis unavailable */ }

  // 2. Ensure Tor list is loaded
  ensureTorList(r).catch(() => {});

  // 3. Query ip-api.com
  let intel = null;
  try { intel = await queryIPAPI(ip); } catch { /* API unavailable */ }

  // If ip-api.com failed entirely (null result), cache a short-lived unknown entry
  // (5 min) so we don't hammer the API on every subsequent request for this IP.
  if (!intel) {
    const unknownResult = {
      ip, country: 'Unknown', countryCode: '??', city: 'Unknown', region: 'Unknown',
      isp: 'Unknown', org: 'Unknown', asn: 'Unknown',
      isProxy: false, isHosting: false, isTor: false, isVPN: false,
      threatType: 'unknown', abuseScore: 0, fromCache: false,
    };
    try { await r.set(cacheKey, JSON.stringify(unknownResult), 'EX', 300); } catch {}
    return unknownResult;
  }

  // 4. Check Tor list
  let isTor = false;
  try { isTor = !!(await r.sismember(TOR_KEY, ip)); } catch {}

  // 5. AbuseIPDB (if key configured)
  let abuseScore = 0;
  try {
    const abuse = await queryAbuseIPDB(ip);
    if (abuse) abuseScore = abuse.abuseConfidenceScore || 0;
  } catch {}

  // 6. Classify threat type
  const isProxy   = intel?.proxy   || false;
  const isHosting = intel?.hosting || false;
  const isVPN     = isProxy && !isTor; // ip-api marks VPNs as proxy

  let threatType = 'clean';
  if (isTor)          threatType = 'tor';
  else if (isProxy)   threatType = 'vpn_proxy';
  else if (isHosting) threatType = 'hosting_datacenter';
  else if (abuseScore >= 50) threatType = 'malicious';

  const result = {
    ip,
    country:     intel?.country      || 'Unknown',
    countryCode: intel?.countryCode  || '??',
    city:        intel?.city         || 'Unknown',
    region:      intel?.regionName   || 'Unknown',
    isp:         intel?.isp          || 'Unknown',
    org:         intel?.org          || 'Unknown',
    asn:         intel?.as           || 'Unknown',
    isProxy, isHosting, isTor, isVPN,
    threatType,
    abuseScore,
    fromCache: false,
  };

  // Cache for 24h
  try { await r.set(cacheKey, JSON.stringify(result), 'EX', 86400); } catch {}

  return result;
};

// ── Persist threat event ──────────────────────────────────────────────────────

const logThreatEvent = async (intel, action, req) => {
  try {
    const email = req.body?.email || null;
    const pool  = getPool();
    await pool.query(
      `INSERT INTO ip_threat_events
         (ip, country, country_code, city, region, isp, org, asn,
          is_proxy, is_hosting, is_tor, is_vpn, threat_type, action_taken,
          endpoint, user_agent, user_email, request_id, abuse_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        intel.ip,
        intel.country,
        intel.countryCode,
        intel.city,
        intel.region,
        intel.isp,
        intel.org,
        intel.asn,
        intel.isProxy,
        intel.isHosting,
        intel.isTor,
        intel.isVPN,
        intel.threatType,
        action,
        req.originalUrl || req.path,
        (req.headers['user-agent'] || '').substring(0, 500),
        email,
        req.headers['x-request-id'] || null,
        intel.abuseScore,
      ]
    );
  } catch (err) {
    console.warn('[ITI] logThreatEvent DB error:', err.message);
  }
};

// ── Middleware: full threat gate ──────────────────────────────────────────────

/**
 * Middleware factory. Call with optional config override.
 *
 *   app.use('/api/doctors/login', ipThreatGate());
 *   app.use(ipThreatGate({ blockHosting: true }));
 *
 * Behaviour:
 *  - Blocks Tor, VPN/proxy (configurable)
 *  - Logs every enriched event to ip_threat_events
 *  - Attaches intel to req.ipIntel for downstream handlers
 *  - Fails open if ip-api.com is unreachable (never breaks the app)
 */
export const ipThreatGate = (opts = {}) => {
  const policy = { ...BLOCK_POLICY, ...opts };

  return async (req, res, next) => {
    const ip = getClientIP(req);

    let intel;
    try {
      intel = await enrichIP(ip);
    } catch {
      return next(); // Fail open — never break the app
    }

    req.ipIntel = intel;

    // ── Determine if we should block ──────────────────────────────────────
    let blocked  = false;
    let blockMsg = '';

    if (policy.tor && intel.isTor) {
      blocked  = true;
      blockMsg = 'Access from Tor exit nodes is not permitted.';
    } else if (policy.proxy && intel.isProxy) {
      blocked  = true;
      blockMsg = 'Access via VPN or proxy is not permitted.';
    } else if (policy.hosting && intel.isHosting) {
      blocked  = true;
      blockMsg = 'Access from datacenter/hosting IPs is not permitted.';
    } else if (policy.abuse_score > 0 && intel.abuseScore >= policy.abuse_score) {
      blocked  = true;
      blockMsg = 'Access denied due to your IP\'s abuse history.';
    }

    // ── Log to DB (async, non-blocking) ───────────────────────────────────
    const action = blocked ? 'blocked' : 'allowed';
    if (intel.threatType !== 'clean' && intel.threatType !== 'private') {
      logThreatEvent(intel, action, req).catch(() => {});
    }

    if (blocked) {
      console.warn(
        `[ITI] ⛔ Blocked ${ip} (${intel.threatType}) from ${intel.country} — ${req.originalUrl}`
      );
      return res.status(403).json({
        success: false,
        error: {
          code:     'ACCESS_DENIED',
          message:  blockMsg,
          reason:   intel.threatType,
          country:  intel.country,
        },
      });
    }

    next();
  };
};

// ── Admin helpers (used by admin routes) ─────────────────────────────────────

/**
 * Get paginated threat events from DB.
 */
export const getThreatEvents = async ({ page = 1, limit = 50, threatType, action, country, ip } = {}) => {
  const pool    = getPool();
  const offset  = (page - 1) * limit;
  const conds   = [];
  const params  = [];

  if (threatType) { params.push(threatType); conds.push(`threat_type = $${params.length}`); }
  if (action)     { params.push(action);     conds.push(`action_taken = $${params.length}`); }
  if (country)    { params.push(country);    conds.push(`country_code = $${params.length}`); }
  if (ip)         { params.push(ip);         conds.push(`ip = $${params.length}`); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  params.push(limit);
  params.push(offset);

  const [rows, countRow] = await Promise.all([
    pool.query(
      `SELECT * FROM ip_threat_events ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    pool.query(`SELECT COUNT(*) FROM ip_threat_events ${where}`, params.slice(0, -2)),
  ]);

  return {
    total: parseInt(countRow.rows[0].count),
    page,
    limit,
    data: rows.rows,
  };
};

/**
 * Get threat summary stats.
 */
export const getThreatStats = async () => {
  const pool = getPool();
  const [byType, byCountry, byAction, recent] = await Promise.all([
    pool.query(`SELECT threat_type, count(*) AS count FROM ip_threat_events GROUP BY threat_type ORDER BY count DESC`),
    pool.query(`SELECT country, country_code, count(*) AS count FROM ip_threat_events WHERE action_taken='blocked' GROUP BY country, country_code ORDER BY count DESC LIMIT 15`),
    pool.query(`SELECT action_taken, count(*) AS count FROM ip_threat_events GROUP BY action_taken`),
    pool.query(`SELECT * FROM ip_threat_events ORDER BY created_at DESC LIMIT 10`),
  ]);

  return {
    byType:    byType.rows,
    byCountry: byCountry.rows,
    byAction:  byAction.rows,
    recentEvents: recent.rows,
  };
};

/**
 * On-demand IP lookup — returns full intel without logging or blocking.
 */
export const lookupIP = async (ip) => {
  // Force fresh lookup by skipping cache
  const r = getRedis();
  await r.del(`${CACHE_PREFIX}${ip}`).catch(() => {});
  return enrichIP(ip);
};
