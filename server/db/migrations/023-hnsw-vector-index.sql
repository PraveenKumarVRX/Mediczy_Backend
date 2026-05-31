-- =============================================================================
-- MIGRATION 023: HNSW Index for medical_embeddings (pgvector)
-- =============================================================================
-- Replaces the default sequential scan (or IVFFlat) with HNSW.
-- Expected improvement: ~200ms → ~2ms per similarity search query.
--
-- HNSW parameters:
--   m              = 16   (neighbors per node — higher = better recall, more memory)
--   ef_construction= 64   (build-time search width — higher = better quality, slower build)
--
-- Run with CONCURRENTLY to avoid locking the table during index build.
-- =============================================================================

-- Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop old IVFFlat index if it exists
DROP INDEX IF EXISTS medical_embeddings_vector_idx;
DROP INDEX IF EXISTS idx_medical_embeddings_vector;

-- Create HNSW index (cosine distance — matches PGVECTOR_DISTANCE=cosine)
CREATE INDEX CONCURRENTLY IF NOT EXISTS medical_embeddings_hnsw_cosine_idx
  ON medical_embeddings
  USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Also index by namespace for filtered similarity searches
CREATE INDEX IF NOT EXISTS medical_embeddings_namespace_idx
  ON medical_embeddings (namespace);

-- Composite index for namespace-filtered vector search
CREATE INDEX CONCURRENTLY IF NOT EXISTS medical_embeddings_ns_hnsw_idx
  ON medical_embeddings
  USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE namespace IS NOT NULL;

-- Runtime search parameter (set per session for accuracy/speed trade-off)
-- Default ef_search=40 is good; increase to 100 for higher-recall clinical queries
-- SET hnsw.ef_search = 40;

-- Verify
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'medical_embeddings'
ORDER BY indexname;
