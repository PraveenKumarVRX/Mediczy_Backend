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


# ─────────────────────────────────────────────────────────────────────────────
# HYBRID RETRIEVAL: Dense (pgvector) + Sparse (BM25) + Reciprocal Rank Fusion
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import re
import time as _time
from typing import Tuple

# Optional heavy dependencies — imported lazily inside each class
try:
    from rank_bm25 import BM25Okapi as _BM25Okapi
    _BM25_AVAILABLE = True
except ImportError:
    _BM25_AVAILABLE = False
    logger.warning("rank_bm25 not installed — BM25 sparse retrieval disabled. "
                   "Install with: pip install rank-bm25>=0.2.7")

try:
    from sentence_transformers import CrossEncoder as _CrossEncoder
    _CROSS_ENCODER_AVAILABLE = True
except ImportError:
    _CROSS_ENCODER_AVAILABLE = False
    logger.warning("sentence_transformers.CrossEncoder not available — "
                   "cross-encoder reranking disabled.")


# ─────────────────────────────────────────────────────────────────────────────
# 1. MedicalTokenizer
# ─────────────────────────────────────────────────────────────────────────────

class MedicalTokenizer:
    """Tokenizer that preserves compound medical terms as single tokens."""

    COMPOUND_TERMS = {
        "chest pain", "blood pressure", "heart rate", "heart failure",
        "blood sugar", "blood glucose", "kidney disease", "liver disease",
        "lung cancer", "breast cancer", "colon cancer", "skin cancer",
        "type 2 diabetes", "type 1 diabetes", "blood clot", "deep vein",
        "deep vein thrombosis", "pulmonary embolism", "atrial fibrillation",
        "myocardial infarction", "coronary artery", "coronary artery disease",
        "chronic obstructive", "chronic obstructive pulmonary disease",
        "urinary tract", "urinary tract infection", "blood urea nitrogen",
        "white blood cell", "red blood cell", "lymph node", "bone marrow",
        "spinal cord", "brain tumor", "blood transfusion",
    }

    # Pre-compiled: longest compounds first so greedy replacement works correctly
    _sorted_compounds = sorted(COMPOUND_TERMS, key=len, reverse=True)

    @classmethod
    def _medical_tokenize(cls, text: str) -> List[str]:
        """
        Tokenize text preserving compound medical terms.
        Removes tokens shorter than 3 characters.
        """
        text_lower = text.lower()

        # Replace compound terms with underscore-joined placeholders
        placeholder_map: Dict[str, str] = {}
        for term in cls._sorted_compounds:
            if term in text_lower:
                placeholder = term.replace(" ", "_MEDTOKEN_")
                placeholder_map[placeholder] = placeholder  # identity — used after split
                text_lower = text_lower.replace(term, placeholder)

        # Split on whitespace + punctuation (keep alphanumeric and underscores)
        raw_tokens = re.split(r"[^a-z0-9_]+", text_lower)

        tokens = []
        for tok in raw_tokens:
            if not tok:
                continue
            # Restore compound term placeholders
            if "_MEDTOKEN_" in tok:
                # Convert back to space-joined form for display / BM25
                tokens.append(tok.replace("_MEDTOKEN_", " "))
            elif len(tok) >= 3:
                tokens.append(tok)

        return tokens


# ─────────────────────────────────────────────────────────────────────────────
# 2. HybridRetriever
# ─────────────────────────────────────────────────────────────────────────────

class HybridRetriever:
    """
    Combines dense pgvector retrieval with BM25 sparse retrieval,
    fused via Reciprocal Rank Fusion (RRF).
    """

    def __init__(self):
        self.bm25 = None
        self.chunk_texts: Optional[List[str]] = None
        self.chunk_meta: Optional[List[Dict[str, Any]]] = None  # patient_id, section per chunk
        self._index_built = False

    # ------------------------------------------------------------------
    def _build_bm25_index(self, corpus: List[Dict[str, Any]], rebuild: bool = False) -> None:
        """
        Build a BM25Okapi index from a list of chunk dicts.

        Args:
            corpus: List of {"text": str, "patient_id": str, "section": str}
            rebuild: Force rebuild even if index already exists.
        """
        if self._index_built and not rebuild:
            return
        if not _BM25_AVAILABLE:
            logger.warning("BM25 index skipped — rank_bm25 not installed.")
            return

        self.chunk_texts = [c["text"] for c in corpus]
        self.chunk_meta = [
            {"patient_id": c.get("patient_id", "unknown"),
             "section": c.get("section", "unknown")}
            for c in corpus
        ]

        tokenized = [MedicalTokenizer._medical_tokenize(t) for t in self.chunk_texts]
        self.bm25 = _BM25Okapi(tokenized, k1=1.5, b=0.75)
        self._index_built = True
        logger.info(f"BM25 index built — {len(self.chunk_texts)} chunks indexed.")

    # ------------------------------------------------------------------
    def _rrf_fusion(
        self,
        dense_results: List[Dict[str, Any]],
        sparse_scores: np.ndarray,
        k: int = 60,
        top_k: int = 10,
    ) -> List[Tuple[str, float]]:
        """
        Reciprocal Rank Fusion of dense and sparse rankings.

        RRF score(d) = Σ 1/(k + rank(d))  for both rankings.

        Args:
            dense_results: Ordered list from pgvector (index 0 = rank 1).
            sparse_scores: BM25 scores array, indexed by chunk position.
            k: RRF constant (default 60 per the original RRF paper).
            top_k: Number of fused results to return.

        Returns:
            List of (text, fused_score) sorted by fused_score descending.
        """
        if self.chunk_texts is None:
            return [(r["text"], r["score"]) for r in dense_results[:top_k]]

        rrf_scores: Dict[str, float] = {}
        text_to_meta: Dict[str, Dict[str, Any]] = {}

        # --- Dense contribution ---
        for rank, item in enumerate(dense_results, start=1):
            txt = item["text"]
            rrf_scores[txt] = rrf_scores.get(txt, 0.0) + 1.0 / (k + rank)
            text_to_meta[txt] = item

        # --- Sparse (BM25) contribution ---
        # Build (score, idx) sorted descending to get sparse ranks
        sparse_ranked = sorted(
            enumerate(sparse_scores), key=lambda x: x[1], reverse=True
        )
        for rank, (idx, _score) in enumerate(sparse_ranked, start=1):
            if idx >= len(self.chunk_texts):
                continue
            txt = self.chunk_texts[idx]
            rrf_scores[txt] = rrf_scores.get(txt, 0.0) + 1.0 / (k + rank)
            if txt not in text_to_meta:
                meta = self.chunk_meta[idx] if self.chunk_meta else {}
                text_to_meta[txt] = {
                    "text": txt,
                    "score": float(_score),
                    "patient_id": meta.get("patient_id", "unknown"),
                    "section": meta.get("section", "unknown"),
                }

        # Sort by fused score
        fused = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
        return fused[:top_k]

    # ------------------------------------------------------------------
    async def hybrid_retrieve(
        self,
        query: str,
        k: int = 10,
        patient_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve documents using hybrid BM25 + dense search with RRF fusion.

        Falls back to dense-only if BM25 is unavailable.

        Returns:
            List of {"text", "score", "patient_id", "section"} dicts.
        """
        t0 = _time.perf_counter()

        # ---- Dense retrieval (always available) ----
        dense_results: List[Dict[str, Any]] = await asyncio.to_thread(
            retrieve, query, k * 2, patient_filter
        )

        if not _BM25_AVAILABLE or not dense_results:
            logger.info(
                f"hybrid_retrieve: dense-only fallback "
                f"({len(dense_results)} results, {(_time.perf_counter()-t0)*1000:.0f}ms)"
            )
            return dense_results[:k]

        # ---- Lazily build BM25 index ----
        if not self._index_built:
            corpus = await asyncio.to_thread(self._fetch_corpus, patient_filter)
            await asyncio.to_thread(self._build_bm25_index, corpus)

        if self.bm25 is None or self.chunk_texts is None:
            logger.info("hybrid_retrieve: BM25 index unavailable, falling back to dense.")
            return dense_results[:k]

        # ---- BM25 sparse scoring ----
        query_tokens = MedicalTokenizer._medical_tokenize(query)
        sparse_scores: np.ndarray = await asyncio.to_thread(
            self.bm25.get_scores, query_tokens
        )

        # ---- RRF fusion ----
        fused = self._rrf_fusion(dense_results, sparse_scores, k=60, top_k=k)

        # Reconstruct result dicts
        text_to_dense: Dict[str, Dict[str, Any]] = {r["text"]: r for r in dense_results}
        results = []
        for text, fused_score in fused:
            if text in text_to_dense:
                entry = dict(text_to_dense[text])
                entry["score"] = fused_score
            else:
                # Came only from BM25 — find metadata from chunk_meta
                idx = self.chunk_texts.index(text) if text in self.chunk_texts else -1
                meta = self.chunk_meta[idx] if (self.chunk_meta and idx >= 0) else {}
                entry = {
                    "text": text,
                    "score": fused_score,
                    "patient_id": meta.get("patient_id", "unknown"),
                    "section": meta.get("section", "unknown"),
                }
            results.append(entry)

        elapsed_ms = (_time.perf_counter() - t0) * 1000
        logger.info(
            f"hybrid_retrieve: {len(results)} results via RRF fusion "
            f"(dense={len(dense_results)}, bm25_chunks={len(self.chunk_texts)}, "
            f"{elapsed_ms:.0f}ms)"
        )
        return results

    # ------------------------------------------------------------------
    @staticmethod
    def _fetch_corpus(patient_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch all text chunks from sib_embeddings for BM25 index construction."""
        corpus = []
        try:
            with _db_conn() as conn:
                cur = conn.cursor()
                if patient_filter:
                    cur.execute(
                        "SELECT content, source_id, metadata FROM sib_embeddings "
                        "WHERE source_id = %s",
                        (patient_filter,),
                    )
                else:
                    cur.execute(
                        "SELECT content, source_id, metadata FROM sib_embeddings"
                    )
                for row in cur.fetchall():
                    meta = row[2] or {}
                    corpus.append({
                        "text": row[0],
                        "patient_id": row[1],
                        "section": meta.get("section", "unknown"),
                    })
                cur.close()
        except Exception as exc:
            logger.error(f"_fetch_corpus failed: {exc}")
        return corpus


# ─────────────────────────────────────────────────────────────────────────────
# 3. CrossEncoderReranker
# ─────────────────────────────────────────────────────────────────────────────

class CrossEncoderReranker:
    """
    Reranks passages using a cross-encoder (ms-marco-MiniLM-L-6-v2).
    Provides much more accurate relevance scores than bi-encoder cosine sim.
    """

    MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    def __init__(self):
        self.model = None
        if _CROSS_ENCODER_AVAILABLE:
            try:
                t0 = _time.perf_counter()
                self.model = _CrossEncoder(self.MODEL_NAME, max_length=512)
                elapsed_ms = (_time.perf_counter() - t0) * 1000
                logger.info(
                    f"CrossEncoder '{self.MODEL_NAME}' loaded in {elapsed_ms:.0f}ms"
                )
            except Exception as exc:
                logger.error(f"Failed to load CrossEncoder: {exc}")
                self.model = None
        else:
            logger.warning(
                "CrossEncoder not available — install sentence_transformers to enable reranking."
            )

    def rerank(
        self,
        query: str,
        passages: List[Dict[str, Any]],
        top_k: int = 5,
        batch_size: int = 32,
    ) -> List[Dict[str, Any]]:
        """
        Score each passage against the query with the cross-encoder and return
        the top_k passages sorted by rerank_score descending.

        Falls back to passages[:top_k] if model is unavailable.
        """
        if self.model is None or not passages:
            logger.warning("CrossEncoder rerank: model unavailable, returning top_k unranked.")
            return passages[:top_k]

        try:
            pairs = [[query, p["text"]] for p in passages]
            scores: np.ndarray = self.model.predict(pairs, batch_size=batch_size)

            ranked = []
            for passage, score in zip(passages, scores):
                entry = dict(passage)
                entry["rerank_score"] = float(score)
                ranked.append(entry)

            ranked.sort(key=lambda x: x["rerank_score"], reverse=True)
            return ranked[:top_k]

        except Exception as exc:
            logger.error(f"CrossEncoder rerank failed: {exc}")
            return passages[:top_k]


# ─────────────────────────────────────────────────────────────────────────────
# 4. ContextCompressor
# ─────────────────────────────────────────────────────────────────────────────

class ContextCompressor:
    """
    Compresses retrieved passages to only the most query-relevant sentences,
    reducing LLM context size while preserving information density.
    """

    # Protect common medical abbreviations from sentence splitters
    _PROTECT_PATTERNS = [
        (re.compile(r"\bDr\."), "Dr_ABBR_"),
        (re.compile(r"\bMr\."), "Mr_ABBR_"),
        (re.compile(r"\bMrs\."), "Mrs_ABBR_"),
        (re.compile(r"\bMs\."), "Ms_ABBR_"),
        (re.compile(r"\be\.g\."), "eg_ABBR_"),
        (re.compile(r"\bi\.e\."), "ie_ABBR_"),
        (re.compile(r"\bvs\."), "vs_ABBR_"),
        (re.compile(r"\betc\."), "etc_ABBR_"),
        (re.compile(r"(\d+)\s*mg\."), r"\1mg_ABBR_"),
        (re.compile(r"(\d+)\s*mcg\."), r"\1mcg_ABBR_"),
        (re.compile(r"(\d+)\s*mL\."), r"\1mL_ABBR_"),
    ]
    _SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")

    @classmethod
    def _split_sentences(cls, text: str) -> List[str]:
        """Split text into sentences while preserving medical abbreviations."""
        protected = text
        replacements: List[Tuple[str, str]] = []

        for pattern, replacement in cls._PROTECT_PATTERNS:
            if callable(getattr(pattern, "sub", None)):
                new_text = pattern.sub(replacement, protected)
                if new_text != protected:
                    replacements.append((replacement, pattern.pattern.replace(r"\b", "")))
                protected = new_text

        sentences = cls._SENTENCE_SPLIT.split(protected)

        # Restore abbreviations
        restored = []
        for sent in sentences:
            for placeholder, original in replacements:
                # Restore to a clean form (strip regex artifacts)
                clean = original.replace(r"\b", "").replace("\\", "")
                sent = sent.replace(placeholder, clean)
            if sent.strip():
                restored.append(sent.strip())

        return restored if restored else [text]

    def compress(
        self,
        query: str,
        passages: List[Dict[str, Any]],
        max_sentences: int = 3,
        threshold: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """
        Filter each passage to its most query-relevant sentences.

        Args:
            query: The search query.
            passages: List of passage dicts (must have "text" key).
            max_sentences: Maximum sentences to keep per passage.
            threshold: Minimum cosine similarity to keep a sentence (0–1).

        Returns:
            Passages with compressed "text" and a new "compression_ratio" field.
            Passages whose entire text is filtered out are dropped.
        """
        model = _get_embed_model()
        if model is None:
            logger.warning("ContextCompressor: embedding model unavailable, skipping compression.")
            for p in passages:
                p["compression_ratio"] = 1.0
            return passages

        try:
            query_emb: np.ndarray = model.encode([query], convert_to_numpy=True)[0]
            # Normalise for cosine similarity via dot product
            query_norm = query_emb / (np.linalg.norm(query_emb) + 1e-10)

            compressed = []
            for passage in passages:
                original_text = passage["text"]
                sentences = self._split_sentences(original_text)

                if not sentences:
                    entry = dict(passage)
                    entry["compression_ratio"] = 1.0
                    compressed.append(entry)
                    continue

                sent_embs: np.ndarray = model.encode(sentences, convert_to_numpy=True)
                # Cosine similarities
                norms = np.linalg.norm(sent_embs, axis=1, keepdims=True) + 1e-10
                sent_embs_norm = sent_embs / norms
                sims: np.ndarray = sent_embs_norm @ query_norm

                # Keep sentences above threshold, up to max_sentences
                # Preserve original ordering (do not re-sort by score)
                kept_indices = [
                    i for i, sim in enumerate(sims) if sim >= threshold
                ]
                # Sort by similarity descending to pick best, then restore order
                best_indices = sorted(
                    kept_indices,
                    key=lambda i: sims[i],
                    reverse=True,
                )[:max_sentences]
                best_indices_ordered = sorted(best_indices)  # restore reading order

                if not best_indices_ordered:
                    # Nothing above threshold — keep the single best sentence
                    best_idx = int(np.argmax(sims))
                    best_indices_ordered = [best_idx]

                kept_sentences = [sentences[i] for i in best_indices_ordered]
                compressed_text = " ".join(kept_sentences)

                ratio = len(kept_sentences) / len(sentences)
                entry = dict(passage)
                entry["text"] = compressed_text
                entry["compression_ratio"] = round(ratio, 3)
                compressed.append(entry)

            return compressed

        except Exception as exc:
            logger.error(f"ContextCompressor.compress failed: {exc}")
            for p in passages:
                p["compression_ratio"] = 1.0
            return passages


# ─────────────────────────────────────────────────────────────────────────────
# 5. Module-level lazy singletons
# ─────────────────────────────────────────────────────────────────────────────

_hybrid_retriever: Optional[HybridRetriever] = None
_reranker: Optional[CrossEncoderReranker] = None
_compressor: Optional[ContextCompressor] = None


def _get_hybrid_retriever() -> HybridRetriever:
    global _hybrid_retriever
    if _hybrid_retriever is None:
        _hybrid_retriever = HybridRetriever()
    return _hybrid_retriever


def _get_reranker() -> CrossEncoderReranker:
    global _reranker
    if _reranker is None:
        _reranker = CrossEncoderReranker()
    return _reranker


def _get_compressor() -> ContextCompressor:
    global _compressor
    if _compressor is None:
        _compressor = ContextCompressor()
    return _compressor


# ─────────────────────────────────────────────────────────────────────────────
# 6. Public async API
# ─────────────────────────────────────────────────────────────────────────────

async def retrieve_hybrid(
    query: str,
    k: int = 10,
    patient_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Hybrid BM25 + dense (pgvector) retrieval with Reciprocal Rank Fusion.

    Args:
        query: Natural-language search query.
        k: Number of results to return.
        patient_filter: Optional patient ID filter.

    Returns:
        List of {"text", "score", "patient_id", "section"} dicts,
        ordered by fused relevance score descending.
    """
    t0 = _time.perf_counter()
    retriever = _get_hybrid_retriever()
    results = await retriever.hybrid_retrieve(query, k=k, patient_filter=patient_filter)
    logger.info(
        f"retrieve_hybrid: returned {len(results)} results in "
        f"{(_time.perf_counter()-t0)*1000:.0f}ms"
    )
    return results


async def retrieve_and_rerank(
    query: str,
    k: int = 10,
    patient_filter: Optional[str] = None,
    rerank_top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Hybrid retrieval followed by cross-encoder reranking.

    Retrieves k candidates via hybrid BM25+dense, then reranks with
    ms-marco-MiniLM-L-6-v2 to return rerank_top_k highest-quality results.

    Returns:
        List of passage dicts with an additional "rerank_score" field.
    """
    t0 = _time.perf_counter()

    # Step 1: hybrid retrieval (async)
    candidates = await retrieve_hybrid(query, k=k, patient_filter=patient_filter)

    if not candidates:
        return []

    # Step 2: cross-encoder reranking (CPU-bound — offload to thread)
    reranker = _get_reranker()
    results = await asyncio.to_thread(
        reranker.rerank, query, candidates, rerank_top_k
    )

    logger.info(
        f"retrieve_and_rerank: {len(candidates)} candidates → "
        f"{len(results)} reranked in {(_time.perf_counter()-t0)*1000:.0f}ms"
    )
    return results


async def retrieve_and_compress(
    query: str,
    k: int = 5,
    patient_filter: Optional[str] = None,
    max_sentences: int = 3,
) -> List[Dict[str, Any]]:
    """
    Hybrid retrieval followed by sentence-level context compression.

    Retrieves k candidates via hybrid search, then compresses each passage
    to its most query-relevant sentences (cosine sim >= 0.3, max max_sentences).

    Returns:
        List of passage dicts with compressed "text" and "compression_ratio" field.
    """
    t0 = _time.perf_counter()

    # Step 1: hybrid retrieval
    candidates = await retrieve_hybrid(query, k=k, patient_filter=patient_filter)

    if not candidates:
        return []

    # Step 2: context compression (CPU-bound — offload to thread)
    compressor = _get_compressor()
    results = await asyncio.to_thread(
        compressor.compress, query, candidates, max_sentences
    )

    avg_ratio = (
        sum(r.get("compression_ratio", 1.0) for r in results) / len(results)
        if results else 1.0
    )
    logger.info(
        f"retrieve_and_compress: {len(candidates)} passages compressed "
        f"(avg ratio {avg_ratio:.2f}) in {(_time.perf_counter()-t0)*1000:.0f}ms"
    )
    return results
