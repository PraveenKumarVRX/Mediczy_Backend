/**
 * Semantic Response Cache
 * =======================
 * Caches LLM responses keyed by semantic embedding similarity.
 * Uses Redis for storage + pgvector for similarity search.
 *
 * Strategy:
 *   1. On every chat() call, embed the user query
 *   2. Search cached entries with cosine similarity > threshold
 *   3. If hit → return cached response (bypasses iSHA/Groq/OpenAI)
 *   4. On miss → call LLM → store result with embedding in Redis + DB
 *
 * Targets ~40% hit rate on repeated symptom queries (fever, headache, BP etc.)
 *
 * Config (env):
 *   SEMANTIC_CACHE_ENABLED        default: true
 *   SEMANTIC_CACHE_THRESHOLD      default: 0.92  (cosine similarity 0–1)
 *   SEMANTIC_CACHE_TTL_SECONDS    default: 86400 (24h)
 *   SEMANTIC_CACHE_MAX_TOKENS     default: 600   (don't cache long agentic answers)
 */

import pool from '../../db/pgPool.js';
import { cache as redisClient } from '../../db/redis.js';

const ENABLED       = process.env.SEMANTIC_CACHE_ENABLED !== 'false';
const THRESHOLD     = parseFloat(process.env.SEMANTIC_CACHE_THRESHOLD || '0.85');
const TTL           = parseInt(process.env.SEMANTIC_CACHE_TTL_SECONDS || '86400', 10);
const MAX_TOKENS    = parseInt(process.env.SEMANTIC_CACHE_MAX_TOKENS || '600', 10);
const CACHE_TABLE   = 'ai_semantic_cache';

const EMBED_URL     = (process.env.ISHA_INC_URL || 'https://isha-inc.com') + '/v1/embeddings';
const EMBED_API_KEY = process.env.ISHA_INC_API_KEY || '';

// ─── Embedding (isha-inc.com — all-MiniLM-L6-v2, 384-dim) ───────────────────

async function embedQuery(text) {
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMBED_API_KEY}`,
      },
      body: JSON.stringify({ input: [text] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch {
    return null; // fail open — cache miss is safe
  }
}

// ─── DB init (idempotent) ─────────────────────────────────────────────────────

let _tableEnsured = false;
async function ensureTable() {
  if (_tableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${CACHE_TABLE} (
        id           SERIAL PRIMARY KEY,
        query_hash   VARCHAR(64)  NOT NULL UNIQUE,
        query_text   TEXT         NOT NULL,
        embedding    VECTOR(384),
        response     TEXT         NOT NULL,
        provider     VARCHAR(50),
        model        VARCHAR(100),
        tokens_used  INTEGER,
        hit_count    INTEGER      NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        expires_at   TIMESTAMPTZ  NOT NULL
      )
    `);
    // Index for vector similarity (requires pgvector)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding
        ON ${CACHE_TABLE} USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 50)
    `).catch(() => {
      // IVFFlat needs enough rows; fall back to exact search on small tables
    });
    _tableEnsured = true;
  } catch (err) {
    console.error('[SemanticCache] Table init error:', err.message);
  }
}

// ─── Hash ─────────────────────────────────────────────────────────────────────

function hashQuery(text) {
  // Simple deterministic hash for exact-match shortcut (avoids embedding for identical queries)
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + text.length.toString(16);
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

/**
 * Try to find a semantically similar cached response.
 * @param {string} query - Raw user message text
 * @returns {{ response, provider, model, hitCount } | null}
 */
async function lookup(query) {
  if (!ENABLED) return null;

  // 1. Exact hash check via Redis (zero latency for identical queries)
  const hash = hashQuery(query.trim().toLowerCase());
  const redisKey = `sem_cache:${hash}`;
  try {
    const cached = await redisClient.get(redisKey);
    if (cached) {
      const entry = cached; // cache.get() already parses JSON
      console.log(`[SemanticCache] Redis exact hit (hash=${hash})`);
      // Async increment hit count
      pool.query(`UPDATE ${CACHE_TABLE} SET hit_count = hit_count + 1 WHERE query_hash = $1`, [hash]).catch(() => {});
      return { ...entry, cacheHit: 'exact' };
    }
  } catch { /* Redis unavailable — continue */ }

  // 2. Vector similarity search in DB
  await ensureTable();
  const embedding = await embedQuery(query);
  if (!embedding) return null;

  try {
    const vecStr = `[${embedding.join(',')}]`;
    const { rows } = await pool.query(`
      SELECT id, query_hash, query_text, response, provider, model, tokens_used, hit_count,
             1 - (embedding <=> $1::vector) AS similarity
        FROM ${CACHE_TABLE}
       WHERE expires_at > NOW()
         AND 1 - (embedding <=> $1::vector) >= $2
       ORDER BY similarity DESC
       LIMIT 1
    `, [vecStr, THRESHOLD]);

    if (rows.length > 0) {
      const row = rows[0];
      console.log(`[SemanticCache] Vector hit (similarity=${row.similarity.toFixed(4)}, query="${row.query_text.substring(0,50)}")`);
      // Update hit count async
      pool.query(`UPDATE ${CACHE_TABLE} SET hit_count = hit_count + 1 WHERE id = $1`, [row.id]).catch(() => {});
      // Warm Redis for next identical query
      redisClient.set(redisKey, { response: row.response, provider: row.provider, model: row.model }, TTL).catch(() => {});
      return { response: row.response, provider: row.provider, model: row.model, hitCount: row.hit_count + 1, cacheHit: 'semantic', similarity: row.similarity };
    }
  } catch (err) {
    console.error('[SemanticCache] Vector search error:', err.message);
  }

  return null;
}

// ─── Store ───────────────────────────────────────────────────────────────────

/**
 * Store an LLM response in the semantic cache.
 * Only caches short responses to avoid poisoning with long agentic chains.
 */
async function store(query, response, { provider, model, tokensUsed = 0 } = {}) {
  if (!ENABLED) return;
  if (!response || typeof response !== 'string') return;
  if (tokensUsed > MAX_TOKENS) return; // Don't cache long agentic responses

  await ensureTable();
  const embedding = await embedQuery(query);
  const hash = hashQuery(query.trim().toLowerCase());
  const expiresAt = new Date(Date.now() + TTL * 1000);

  try {
    if (embedding) {
      const vecStr = `[${embedding.join(',')}]`;
      await pool.query(`
        INSERT INTO ${CACHE_TABLE} (query_hash, query_text, embedding, response, provider, model, tokens_used, expires_at)
        VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8)
        ON CONFLICT (query_hash) DO UPDATE
          SET response = EXCLUDED.response,
              hit_count = ${CACHE_TABLE}.hit_count,
              expires_at = EXCLUDED.expires_at
      `, [hash, query.substring(0, 2000), vecStr, response.substring(0, 5000), provider, model, tokensUsed, expiresAt]);
    }

    // Also warm Redis
    const redisKey = `sem_cache:${hash}`;
    await redisClient.set(redisKey, { response, provider, model }, TTL);

    console.log(`[SemanticCache] Stored (hash=${hash}, tokens=${tokensUsed})`);
  } catch (err) {
    console.error('[SemanticCache] Store error:', err.message);
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

async function getStats() {
  try {
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*)                                         AS total_entries,
        SUM(hit_count)                                   AS total_hits,
        ROUND(AVG(hit_count), 2)                         AS avg_hits_per_entry,
        COUNT(*) FILTER (WHERE expires_at > NOW())       AS active_entries,
        COUNT(*) FILTER (WHERE expires_at <= NOW())      AS expired_entries
      FROM ${CACHE_TABLE}
    `);
    return stats;
  } catch {
    return null;
  }
}

/**
 * Remove expired entries (run via cron or on-demand)
 */
async function purgeExpired() {
  try {
    const { rowCount } = await pool.query(`DELETE FROM ${CACHE_TABLE} WHERE expires_at <= NOW()`);
    console.log(`[SemanticCache] Purged ${rowCount} expired entries`);
    return rowCount;
  } catch (err) {
    console.error('[SemanticCache] Purge error:', err.message);
    return 0;
  }
}

export default { lookup, store, getStats, purgeExpired };
