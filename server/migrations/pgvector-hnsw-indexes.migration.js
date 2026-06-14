/**
 * ITEM-07: HNSW vector indexes on sib_embeddings and ai_semantic_cache.
 *
 * HNSW (Hierarchical Navigable Small World) gives O(log n) ANN search —
 * much faster than ivfflat for recall@10 queries on clinical embeddings.
 *
 * Prerequisites: pgvector extension installed (CREATE EXTENSION vector).
 *
 * Run once per environment:
 *   node server/migrations/pgvector-hnsw-indexes.migration.js
 */

import pool from '../db/pgPool.js';

export async function runMigration(pgPool = pool) {
  const client = await pgPool.connect();
  try {
    // Ensure pgvector is installed
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log('[pgvector-hnsw] Extension vector enabled');

    // ── sib_embeddings HNSW index ─────────────────────────────────────────────
    // m=16 (edges per node), ef_construction=64 (beam width during build)
    // These are balanced defaults for 1536-dim clinical text embeddings.
    await client.query(`
      CREATE TABLE IF NOT EXISTS sib_embeddings (
        id          BIGSERIAL PRIMARY KEY,
        patient_id  INTEGER,
        record_type VARCHAR(80),
        embedding   vector(1536),
        metadata    JSONB,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Drop legacy ivfflat index if present
    await client.query(`
      DROP INDEX IF EXISTS idx_sib_embeddings_ivfflat
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sib_embeddings_hnsw
        ON sib_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);
    console.log('[pgvector-hnsw] HNSW index created on sib_embeddings');

    // ── ai_semantic_cache HNSW index ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_semantic_cache (
        id           BIGSERIAL PRIMARY KEY,
        cache_key    VARCHAR(255) UNIQUE,
        embedding    vector(1536),
        prompt_hash  VARCHAR(64),
        response     TEXT,
        model        VARCHAR(80),
        hit_count    INTEGER DEFAULT 0,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        expires_at   TIMESTAMPTZ
      )
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_ai_semantic_cache_ivfflat
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_semantic_cache_hnsw
        ON ai_semantic_cache
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);
    console.log('[pgvector-hnsw] HNSW index created on ai_semantic_cache');

    // Supporting B-tree indexes — only if columns exist
    const { rows: embCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sib_embeddings' AND column_name IN ('patient_id', 'record_type')
    `);
    if (embCols.length === 2) {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sib_embeddings_patient ON sib_embeddings(patient_id, record_type)
      `);
    }

    const { rows: cacheExpCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ai_semantic_cache' AND column_name = 'expires_at'
    `);
    if (cacheExpCols.length > 0) {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_ai_semantic_cache_expires ON ai_semantic_cache(expires_at)
          WHERE expires_at IS NOT NULL
      `);
    }

    console.log('[pgvector-hnsw] Migration complete');
    return { success: true };
  } catch (err) {
    console.error('[pgvector-hnsw] Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Run directly
if (process.argv[1]?.endsWith('pgvector-hnsw-indexes.migration.js')) {
  runMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}
