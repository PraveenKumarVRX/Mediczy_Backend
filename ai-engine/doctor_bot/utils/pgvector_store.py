"""
pgvector Storage Module
=======================

PostgreSQL pgvector-based vector storage for medical embeddings.
Replaces FAISS for persistent, scalable, SQL-queryable vector search.

Table: sib_embeddings
- id: serial primary key
- source_type: 'ehr', 'knowledge', 'web'
- source_id: patient_id or doc_id
- content: text chunk
- embedding: vector(768)  # ClinicalBERT dimension
- metadata: jsonb (section, timestamp, etc)
- created_at: timestamp
"""

import os
import json
import logging
from contextlib import contextmanager
from typing import List, Dict, Any, Optional
import numpy as np

logger = logging.getLogger(__name__)

# Database config
DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "127.0.0.1"),
    "port": int(os.getenv("POSTGRES_PORT", 5432)),
    "database": os.getenv("POSTGRES_DATABASE", "mediczy_ai"),
    "user": os.getenv("POSTGRES_USER", "mediczy_helper"),
    "password": os.getenv("POSTGRES_PASSWORD", "Mediczy2024Helper"),
}

# Lazy loaded
_pool = None
_embed_model = None


def _get_pool():
    """Return (or create) the ThreadedConnectionPool — shared across all callers."""
    global _pool
    if _pool is None:
        import psycopg2
        import psycopg2.extras
        import psycopg2.pool
        from pgvector.psycopg2 import register_vector

        _pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=2, maxconn=10, **DB_CONFIG
        )
        # register_vector with None registers globally for all new connections
        try:
            register_vector(None)
        except Exception:
            pass
        psycopg2.extras.register_default_jsonb(None)
        logger.info("✅ pgvector connection pool initialised (2–10 connections)")
    return _pool


@contextmanager
def _db_conn():
    """Context manager that checks out a connection from the pool and returns it on exit."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        pool.putconn(conn)


def _get_connection():
    """Legacy helper — returns a pooled connection.  Caller must call _release_connection()."""
    return _get_pool().getconn()


def _release_connection(conn):
    """Return a connection obtained via _get_connection() back to the pool."""
    _get_pool().putconn(conn)


def _get_embed_model():
    """Lazy load ClinicalBERT"""
    global _embed_model
    if _embed_model is None:
        try:
            import time
            start = time.time()
            from sentence_transformers import SentenceTransformer
            _embed_model = SentenceTransformer("emilyalsentzer/Bio_ClinicalBERT")
            logger.info(f"✅ ClinicalBERT loaded in {(time.time()-start)*1000:.0f}ms")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            return None
    return _embed_model


def warmup():
    """Preload embedding model and DB connection for fast first query"""
    logger.info("🔥 Warming up pgvector...")
    _get_connection()
    _get_embed_model()
    logger.info("✅ pgvector warmup complete")


def store_chunks(chunks: List[Dict[str, Any]], source_type: str = "ehr") -> int:
    """
    Store text chunks with embeddings in pgvector
    
    Args:
        chunks: List of {"text": ..., "patient_id": ..., "section": ...}
        source_type: 'ehr', 'knowledge', 'web'
        
    Returns:
        Number of chunks stored
    """
    if not chunks:
        return 0
    
    model = _get_embed_model()
    if model is None:
        raise RuntimeError("Embedding model not available")
    
    texts = [c["text"] for c in chunks]
    embeddings = model.encode(texts, convert_to_numpy=True)

    inserted = 0
    with _db_conn() as conn:
        cur = conn.cursor()
        for chunk, emb in zip(chunks, embeddings):
            try:
                metadata = json.dumps({"section": chunk.get("section", "unknown")})
                cur.execute("""
                    INSERT INTO sib_embeddings (source_type, source_id, content, embedding, metadata)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    source_type,
                    chunk.get("patient_id", "unknown"),
                    chunk["text"],
                    emb.tolist(),
                    metadata,
                ))
                inserted += 1
            except Exception as e:
                logger.warning(f"Failed to insert chunk: {e}")
        conn.commit()
        cur.close()
    logger.info(f"✅ Stored {inserted} chunks in pgvector")
    return inserted


def retrieve(query: str, k: int = 5, patient_filter: str = None) -> List[Dict[str, Any]]:
    """
    Retrieve top-k similar chunks using pgvector cosine similarity
    
    Args:
        query: Search query
        k: Number of results
        patient_filter: Optional patient ID to filter
        
    Returns:
        List of matching chunks with scores
    """
    model = _get_embed_model()
    if model is None:
        raise ImportError("Embedding model not available (PyTorch not installed)")

    q_emb = model.encode([query], convert_to_numpy=True)[0]
    results = []
    with _db_conn() as conn:
        cur = conn.cursor()
        if patient_filter:
            cur.execute("""
                SELECT content, source_id, metadata,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM sib_embeddings
                WHERE source_id = %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """, (q_emb.tolist(), patient_filter, q_emb.tolist(), k))
        else:
            cur.execute("""
                SELECT content, source_id, metadata,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM sib_embeddings
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """, (q_emb.tolist(), q_emb.tolist(), k))
        for row in cur.fetchall():
            results.append({
                "text": row[0],
                "patient_id": row[1],
                "section": row[2].get("section", "unknown") if row[2] else "unknown",
                "score": float(row[3]) if row[3] else 0.0,
            })
        cur.close()
    return results


def get_stats() -> Dict[str, Any]:
    """Get pgvector index statistics"""
    try:
        with _db_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM sib_embeddings")
            total = cur.fetchone()[0]
            cur.execute("SELECT COUNT(DISTINCT source_id) FROM sib_embeddings")
            patients = cur.fetchone()[0]
            cur.execute("SELECT COUNT(DISTINCT metadata->>'section') FROM sib_embeddings")
            sections = cur.fetchone()[0]
            cur.close()
        return {
            "backend": "pgvector",
            "total_vectors": total,
            "unique_patients": patients,
            "unique_sections": sections,
            "status": "connected",
        }
    except Exception as e:
        return {"backend": "pgvector", "status": "error", "error": str(e)}


def migrate_from_faiss(faiss_path: str = "../embeddings/faiss_index.bin",
                       metadata_path: str = "../embeddings/chunk_metadata.pkl") -> int:
    """
    Migrate existing FAISS data to pgvector
    
    Returns:
        Number of chunks migrated
    """
    import pickle
    
    # Load FAISS metadata (chunks)
    try:
        with open(metadata_path, "rb") as f:
            chunks = pickle.load(f)
    except FileNotFoundError:
        logger.warning(f"FAISS metadata not found at {metadata_path}")
        return 0
    
    logger.info(f"📦 Migrating {len(chunks)} chunks from FAISS to pgvector...")
    return store_chunks(chunks, source_type="ehr")


def clear_all() -> int:
    """Clear all embeddings (use with caution)"""
    with _db_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM sib_embeddings")
        deleted = cur.rowcount
        conn.commit()
        cur.close()
    logger.info(f"🗑️ Deleted {deleted} embeddings")
    return deleted


# CLI
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="pgvector operations")
    parser.add_argument("--migrate", action="store_true", help="Migrate from FAISS")
    parser.add_argument("--stats", action="store_true", help="Show stats")
    parser.add_argument("--test", help="Test query")
    args = parser.parse_args()
    
    if args.migrate:
        n = migrate_from_faiss()
        print(f"Migrated {n} chunks")
    elif args.stats:
        print(get_stats())
    elif args.test:
        results = retrieve(args.test, k=3)
        for r in results:
            print(f"[{r['score']:.3f}] {r['text'][:80]}...")
