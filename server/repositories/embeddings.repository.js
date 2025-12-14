import { connectPostgres } from '../db/postgres.js';
import { connectVectorDB } from '../db/vector.js';
import redisClient from '../config/redis.js';
import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';

const DEFAULT_NAMESPACE = process.env.VECTOR_NAMESPACE || 'default';
const CACHE_BASE_KEY = 'mediczy:embeddings';
const CACHE_TTL_SECONDS = parseInt(process.env.EMBEDDING_CACHE_TTL || '86400', 10);
const GLOBAL_RECENT_KEY = `${CACHE_BASE_KEY}:recent:__all__`;
const EMBEDDING_EVENT_TOPIC = (KAFKA_TOPICS && (KAFKA_TOPICS.EMBEDDING_EVENTS || KAFKA_TOPICS.ANALYTICS_EVENTS)) || 'embedding-events';

let pgPoolPromise = null;
let vectorStorePromise = null;

function getPool() {
  if (!pgPoolPromise) {
    pgPoolPromise = connectPostgres();
  }
  return pgPoolPromise;
}

function getVectorStore() {
  if (!vectorStorePromise) {
    vectorStorePromise = connectVectorDB();
  }
  return vectorStorePromise;
}

function resolveNamespace(namespace) {
  return namespace || DEFAULT_NAMESPACE;
}

function sanitizeMetadata(meta) {
  if (!meta) {
    return {};
  }
  if (typeof meta === 'object' && !Array.isArray(meta)) {
    return meta;
  }
  return { value: meta };
}

function buildItemKey(namespace, embeddingId) {
  return `${CACHE_BASE_KEY}:item:${namespace}:${embeddingId}`;
}

function buildNamespaceRecentKey(namespace) {
  return `${CACHE_BASE_KEY}:recent:${namespace}`;
}

function buildGlobalMember(namespace, embeddingId) {
  return `${namespace}::${embeddingId}`;
}

function parseCacheValue(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

async function cacheEmbeddingSummary(summary) {
  if (!redisClient || !summary?.embeddingId) {
    return;
  }

  try {
    const namespace = resolveNamespace(summary.namespace);
    const timestamp = summary.updatedAt || new Date().toISOString();
    const score = Date.parse(timestamp) || Date.now();
    const payload = JSON.stringify({ ...summary, namespace });

    const pipeline = redisClient.multi();
    pipeline.set(buildItemKey(namespace, summary.embeddingId), payload, 'EX', CACHE_TTL_SECONDS);
    pipeline.zadd(buildNamespaceRecentKey(namespace), score, summary.embeddingId);
    pipeline.zadd(GLOBAL_RECENT_KEY, score, buildGlobalMember(namespace, summary.embeddingId));
    await pipeline.exec();
  } catch (error) {
    console.warn('⚠️  Redis embedding cache error:', error.message);
  }
}

async function removeEmbeddingFromCache(namespace, embeddingId) {
  if (!redisClient || !embeddingId) {
    return;
  }

  try {
    const resolvedNamespace = resolveNamespace(namespace);
    const pipeline = redisClient.multi();
    pipeline.del(buildItemKey(resolvedNamespace, embeddingId));
    pipeline.zrem(buildNamespaceRecentKey(resolvedNamespace), embeddingId);
    pipeline.zrem(GLOBAL_RECENT_KEY, buildGlobalMember(resolvedNamespace, embeddingId));
    await pipeline.exec();
  } catch (error) {
    console.warn('⚠️  Redis embedding cache cleanup error:', error.message);
  }
}

async function fetchCachedList(namespace, limit, offset) {
  if (!redisClient) {
    return null;
  }

  try {
    const start = offset;
    const stop = offset + limit - 1;

    if (namespace) {
      const ids = await redisClient.zrevrange(buildNamespaceRecentKey(namespace), start, stop);
      if (!ids.length) {
        return null;
      }

      const pipeline = redisClient.multi();
      ids.forEach((id) => pipeline.get(buildItemKey(namespace, id)));
      const results = await pipeline.exec();
      return results
        .map(([, value]) => parseCacheValue(value))
        .filter(Boolean);
    }

    const members = await redisClient.zrevrange(GLOBAL_RECENT_KEY, start, stop);
    if (!members.length) {
      return null;
    }

    const pipeline = redisClient.multi();
    members.forEach((member) => {
      const [memberNamespace, embeddingId] = member.split('::');
      if (memberNamespace && embeddingId) {
        pipeline.get(buildItemKey(memberNamespace, embeddingId));
      }
    });
    const results = await pipeline.exec();
    return results
      .map(([, value]) => parseCacheValue(value))
      .filter(Boolean);
  } catch (error) {
    console.warn('⚠️  Redis embedding read error:', error.message);
    return null;
  }
}

async function publishEmbeddingEvent(action, payload) {
  if (!EMBEDDING_EVENT_TOPIC) {
    return;
  }

  try {
    await publishEvent(EMBEDDING_EVENT_TOPIC, {
      action,
      type: 'embedding',
      timestamp: new Date().toISOString(),
      data: payload
    });
  } catch (error) {
    console.warn('⚠️  Kafka embedding event warning:', error.message);
  }
}

function mapRowToResponse(row) {
  if (!row) {
    return null;
  }
  return {
    embeddingId: row.embedding_id,
    namespace: row.namespace,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeEntries(entries = []) {
  const now = Date.now();
  return entries
    .map((entry, index) => {
      const vector = entry.vector || entry.values || entry.embedding || [];
      return {
        vector,
        embeddingId: entry.embeddingId || entry.id || `embedding_${now}_${index}`,
        namespace: resolveNamespace(entry.namespace),
        metadata: sanitizeMetadata(entry.metadata),
        updatedAt: new Date().toISOString()
      };
    })
    .filter((item) => Array.isArray(item.vector) && item.vector.length);
}

export async function upsertEmbeddings(entries = []) {
  const normalized = normalizeEntries(entries);

  if (!normalized.length) {
    return { success: false, inserted: 0, message: 'No valid vectors provided' };
  }

  const store = await getVectorStore();
  const vectors = normalized.map((item) => item.vector);
  const metadataPayload = normalized.map((item) => ({
    embeddingId: item.embeddingId,
    namespace: item.namespace,
    metadata: item.metadata
  }));

  const result = await store.add(vectors, metadataPayload);

  await Promise.allSettled(normalized.map((summary) => cacheEmbeddingSummary(summary)));
  await Promise.allSettled(normalized.map((summary) => publishEmbeddingEvent('embedding.upserted', summary)));

  return result;
}

export async function searchEmbeddings(queryVector, options = {}) {
  const store = await getVectorStore();
  const results = await store.search(queryVector, options.k || options.limit || 5, options);

  if (Array.isArray(results) && results.length) {
    const toCache = results
      .map((result) => ({
        embeddingId: result.embedding_id || result.embeddingId,
        namespace: resolveNamespace(result.namespace),
        metadata: sanitizeMetadata(result.metadata),
        updatedAt: new Date().toISOString()
      }))
      .filter((summary) => summary.embeddingId);
    await Promise.allSettled(toCache.map((summary) => cacheEmbeddingSummary(summary)));
  }

  return results;
}

export async function listEmbeddings({ namespace, limit = 50, offset = 0 } = {}) {
  const cached = await fetchCachedList(namespace, limit, offset);
  if (cached && cached.length) {
    return cached.slice(0, limit);
  }

  const pool = await getPool();
  const params = [limit, offset];
  let whereClause = '';

  if (namespace) {
    whereClause = 'WHERE namespace = $3';
    params.push(namespace);
  }

  const { rows } = await pool.query(
    `SELECT embedding_id, namespace, metadata, created_at, updated_at
     FROM medical_embeddings
     ${whereClause}
     ORDER BY updated_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const normalizedRows = rows.map(mapRowToResponse).filter(Boolean);
  await Promise.allSettled(normalizedRows.map((summary) => cacheEmbeddingSummary(summary)));
  return normalizedRows;
}

export async function deleteEmbedding(embeddingId) {
  if (!embeddingId) {
    return 0;
  }

  const pool = await getPool();
  const { rows } = await pool.query(
    'DELETE FROM medical_embeddings WHERE embedding_id = $1 RETURNING embedding_id, namespace, metadata, updated_at',
    [embeddingId]
  );

  if (!rows.length) {
    return 0;
  }

  const deleted = mapRowToResponse(rows[0]);
  await removeEmbeddingFromCache(deleted.namespace, deleted.embeddingId);
  await publishEmbeddingEvent('embedding.deleted', deleted);
  return rows.length;
}

async function getRedisStats() {
  if (!redisClient) {
    return {};
  }
  try {
    const recentTotal = await redisClient.zcard(GLOBAL_RECENT_KEY);
    return { redisRecentEntries: recentTotal };
  } catch (error) {
    console.warn('⚠️  Redis stats warning:', error.message);
    return {};
  }
}

export async function embeddingsStats() {
  const store = await getVectorStore();
  const stats = await store.getStats();
  const redisStats = await getRedisStats();
  return { ...stats, ...redisStats };
}
