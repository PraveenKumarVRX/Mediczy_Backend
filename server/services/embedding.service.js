/**
 * Embedding Service
 * =================
 * Centralised, batched, cached embeddings for all RAG and semantic-cache work.
 *
 * Key design decisions:
 *   - Runs ONLY on isha-inc.com (RTX 3060) via /v1/embeddings — keeps 3090 free for clinical inference
 *   - Batches requests: accumulates embeddings for up to 50ms before flushing a batch to the GPU
 *   - Two-layer cache:
 *       1. Redis (for cross-restart persistence)
 *       2. In-process LRU (for sub-ms repeat lookups)
 *   - Retries 3× with exponential back-off before falling back to the SIB /embed endpoint
 *   - Exposes EmbeddingService.embed(text) and EmbeddingService.embedBatch(texts[])
 *
 * Dimension: always 768 (ClinicalBERT / MedBERT) — must match pgvector column size
 */

import crypto from 'crypto';
import pool from '../db/pgPool.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const EMBED_URL     = process.env.ISHA_INC_EMBED_URL || 'https://isha-inc.com/v1/embeddings';
const EMBED_API_KEY = process.env.ISHA_INC_API_KEY || '';
const FALLBACK_EMBED_URL = (process.env.SIB_URL || 'http://localhost:8001') + '/embed';
const EMBED_DIM     = parseInt(process.env.PGVECTOR_DIMENSION || '768', 10);
const BATCH_MAX     = parseInt(process.env.EMBED_BATCH_MAX     || '32',  10);  // texts per batch
const BATCH_WINDOW  = parseInt(process.env.EMBED_BATCH_WINDOW  || '50',  10);  // ms to accumulate
const CACHE_TTL_S   = parseInt(process.env.EMBED_CACHE_TTL     || '3600', 10); // 1h Redis TTL
const LRU_MAX       = parseInt(process.env.EMBED_LRU_MAX       || '512',  10);

// ─── In-process LRU cache ─────────────────────────────────────────────────────

const _lru = new Map();   // key → { vec, ts }

function _lruGet(key) {
  const entry = _lru.get(key);
  if (!entry) return null;
  _lru.delete(key);
  _lru.set(key, entry);  // move to end (LRU)
  return entry.vec;
}

function _lruSet(key, vec) {
  if (_lru.size >= LRU_MAX) {
    _lru.delete(_lru.keys().next().value);  // evict oldest
  }
  _lru.set(key, { vec, ts: Date.now() });
}

// ─── Redis cache (optional) ───────────────────────────────────────────────────

let _redis = null;

async function _getRedis() {
  if (_redis) return _redis;
  try {
    const { createClient } = await import('redis');
    const client = createClient({
      socket: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });
    await client.connect();
    _redis = client;
    console.log('[Embed] Redis cache connected');
  } catch (err) {
    console.warn('[Embed] Redis unavailable — in-process LRU only:', err.message);
    _redis = null;
  }
  return _redis;
}

async function _redisGet(key) {
  try {
    const r = await _getRedis();
    if (!r) return null;
    const val = await r.get(`emb:${key}`);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function _redisSet(key, vec) {
  try {
    const r = await _getRedis();
    if (!r) return;
    await r.set(`emb:${key}`, JSON.stringify(vec), { EX: CACHE_TTL_S });
  } catch { /* non-critical */ }
}

// ─── Cache key ────────────────────────────────────────────────────────────────

function _cacheKey(text) {
  return crypto.createHash('sha256').update(text.trim()).digest('hex').slice(0, 32);
}

// ─── Batch accumulator ────────────────────────────────────────────────────────

let _batch = [];       // { text, resolve, reject }
let _timer = null;

function _enqueue(text) {
  return new Promise((resolve, reject) => {
    _batch.push({ text, resolve, reject });
    if (_batch.length >= BATCH_MAX) {
      _flush();
    } else if (!_timer) {
      _timer = setTimeout(_flush, BATCH_WINDOW);
    }
  });
}

async function _flush() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  if (_batch.length === 0) return;

  const todo = _batch.splice(0, BATCH_MAX);
  const texts = todo.map(e => e.text);

  try {
    const vecs = await _callEmbedApi(texts);
    if (vecs.length !== texts.length) {
      throw new Error(`Embedding API returned ${vecs.length} vectors for ${texts.length} texts`);
    }
    for (let i = 0; i < todo.length; i++) {
      todo[i].resolve(vecs[i]);
    }
  } catch (err) {
    for (const entry of todo) {
      entry.reject(err);
    }
  }
}

// ─── API call with retry ──────────────────────────────────────────────────────

async function _callEmbedApi(texts, attempt = 0) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15_000);

  // Try isha-inc primary endpoint first
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${EMBED_API_KEY}`,
        'User-Agent':    'Mozilla/5.0 (compatible; Mediczy/1.0)',
      },
      body: JSON.stringify({ input: texts, model: 'medbert-768' }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`isha-inc embed ${res.status}`);
    const data = await res.json();

    // OpenAI-compatible response: data.data[].embedding
    if (data.data && Array.isArray(data.data)) {
      return data.data.map(d => d.embedding);
    }
    // SIB-style: { embeddings: [[...], [...]] }
    if (data.embeddings && Array.isArray(data.embeddings)) {
      return data.embeddings;
    }
    throw new Error('Unexpected embedding API response shape');
  } catch (err) {
    clearTimeout(timeoutId);

    if (attempt < 2) {
      const delay = 200 * Math.pow(2, attempt);
      console.warn(`[Embed] isha-inc embed attempt ${attempt+1} failed: ${err.message} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      return _callEmbedApi(texts, attempt + 1);
    }

    // All retries exhausted — fall back to SIB /embed
    console.warn('[Embed] isha-inc embed failed after 3 attempts — falling back to SIB /embed');
    return _callSibEmbed(texts);
  }
}

async function _callSibEmbed(texts) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(FALLBACK_EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`SIB embed ${res.status}`);
    const data = await res.json();
    if (data.embeddings && Array.isArray(data.embeddings)) return data.embeddings;
    if (Array.isArray(data)) return data;
    throw new Error('SIB /embed returned unexpected shape');
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(`All embedding backends failed: ${err.message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Embed a single text string. Returns a Float32Array of EMBED_DIM dimensions.
 * Uses two-layer cache (LRU + Redis) before hitting the GPU.
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embed(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('embed() requires a non-empty string');
  }
  const normalized = text.trim();
  const key = _cacheKey(normalized);

  // 1. In-process LRU
  const lruHit = _lruGet(key);
  if (lruHit) return lruHit;

  // 2. Redis
  const redisHit = await _redisGet(key);
  if (redisHit) {
    _lruSet(key, redisHit);
    return redisHit;
  }

  // 3. GPU batch
  const vec = await _enqueue(normalized);

  // Backfill caches
  _lruSet(key, vec);
  _redisSet(key, vec).catch(() => {});

  return vec;
}

/**
 * Embed multiple texts. Returns an array of vectors in the same order.
 * Caches each individually so partial hits still save GPU calls.
 *
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  // Check caches for each text in parallel, collect misses
  const results = new Array(texts.length).fill(null);
  const missIndexes = [];

  await Promise.all(texts.map(async (text, i) => {
    const key = _cacheKey((text || '').trim());
    const lru = _lruGet(key);
    if (lru) { results[i] = lru; return; }
    const rds = await _redisGet(key);
    if (rds) { _lruSet(key, rds); results[i] = rds; return; }
    missIndexes.push(i);
  }));

  if (missIndexes.length === 0) return results;

  // Embed all misses in one or more batches
  const missTexts = missIndexes.map(i => texts[i].trim());

  // Chunk into BATCH_MAX to avoid oversized requests
  const allVecs = [];
  for (let off = 0; off < missTexts.length; off += BATCH_MAX) {
    const chunk = missTexts.slice(off, off + BATCH_MAX);
    const vecs  = await _callEmbedApi(chunk);
    allVecs.push(...vecs);
  }

  // Populate results + backfill caches
  for (let j = 0; j < missIndexes.length; j++) {
    const i   = missIndexes[j];
    const vec = allVecs[j];
    const key = _cacheKey(texts[i].trim());
    results[i] = vec;
    _lruSet(key, vec);
    _redisSet(key, vec).catch(() => {});
  }

  return results;
}

/**
 * Cosine similarity between two equal-length vectors.
 */
export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Returns metrics for monitoring.
 */
export function getMetrics() {
  return {
    lruSize:          _lru.size,
    lruMax:           LRU_MAX,
    batchPending:     _batch.length,
    batchMax:         BATCH_MAX,
    batchWindowMs:    BATCH_WINDOW,
    embedDimension:   EMBED_DIM,
    primaryEndpoint:  EMBED_URL,
    fallbackEndpoint: FALLBACK_EMBED_URL,
  };
}

export default { embed, embedBatch, cosineSimilarity, getMetrics, EMBED_DIM };
