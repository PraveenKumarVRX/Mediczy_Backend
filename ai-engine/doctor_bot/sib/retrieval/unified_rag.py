"""
Unified Async RAG Retriever
============================

Single entry-point for all retrieval in SIB — queried by:
  - QwenPlanner (ehr.retrieve step)
  - EHRBotlet.retrieve()
  - /chat KB enrichment
  - /rag/search endpoint

Queries in parallel:
  - ai_document_chunks  (S-PubMedBert-MS-MARCO 768, knowledge base:
                          IRDAI circulars, WHO advisories, clinical guidelines)
  - sib_embeddings      (Bio_ClinicalBERT 768, patient EHR history)

Results are merged by cosine score, deduplicated, and returned as
a ranked List[RAGChunk] ready for LLM context injection.

Embedding models are shared singletons — no extra RAM cost.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("sib.retrieval.unified_rag")

MIN_SCORE = 0.25  # discard chunks below this cosine similarity


# ─── Data type ───────────────────────────────────────────────────────────────

@dataclass
class RAGChunk:
    content: str
    score: float
    source: str              # "ehr" | "knowledge"
    patient_id: Optional[str] = None
    doc_title: Optional[str] = None
    category: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


# ─── Retriever ────────────────────────────────────────────────────────────────

class UnifiedRAGRetriever:
    """
    Parallel async retriever across all SIB vector stores.

    Initialize once at startup (pool injection via _set_pool) so the asyncpg
    pool is shared with the rest of sib_app.  Falls back gracefully when
    either source is unavailable.
    """

    def __init__(self, db_pool=None):
        self._pool = db_pool

    def _set_pool(self, pool):
        self._pool = pool

    # ── Embedding helpers (run in thread to stay off the event loop) ──────────

    async def _embed_pubmed(self, query: str):
        """S-PubMedBert-MS-MARCO vector — used for ai_document_chunks."""
        try:
            # Reuse the model already loaded by sib_app
            import sys, importlib
            sib_app_mod = sys.modules.get("sib_app") or sys.modules.get("__main__")
            _get_embed = getattr(sib_app_mod, "_get_embed_model", None)
            if _get_embed is None:
                # Cold import when running outside sib_app context
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer("pritamdeka/S-PubMedBert-MS-MARCO")
                vec = await asyncio.to_thread(
                    _model.encode, [query],
                    convert_to_numpy=True, show_progress_bar=False
                )
            else:
                model = _get_embed()
                vec = await asyncio.to_thread(
                    model.encode, [query],
                    convert_to_numpy=True, show_progress_bar=False
                )
            return vec[0]
        except Exception as e:
            logger.warning(f"UnifiedRAG: S-PubMedBert embed failed — {e}")
            return None

    async def _embed_clinical(self, query: str):
        """Bio_ClinicalBERT vector — used for sib_embeddings."""
        try:
            from utils.pgvector_store import _get_embed_model
            model = _get_embed_model()
            if model is None:
                return None
            vec = await asyncio.to_thread(
                model.encode, [query],
                convert_to_numpy=True, show_progress_bar=False
            )
            return vec[0]
        except Exception as e:
            logger.warning(f"UnifiedRAG: Bio_ClinicalBERT embed failed — {e}")
            return None

    # ── Table fetchers ────────────────────────────────────────────────────────

    async def _fetch_knowledge(
        self, vec, k: int, category: Optional[str]
    ) -> List[RAGChunk]:
        """Query ai_document_chunks via asyncpg (S-PubMedBert)."""
        if vec is None or self._pool is None:
            return []
        try:
            vec_str = f"[{','.join(str(round(float(v), 6)) for v in vec)}]"
            cat_clause = "AND d.category = $1" if category else ""
            params = [category] if category else []
            limit = k * 2

            async with self._pool.acquire(timeout=10) as conn:
                rows = await conn.fetch(
                    f"""SELECT c.content,
                               1 - (c.embedding <=> '{vec_str}'::vector) AS score,
                               d.title, d.category, d.id AS document_id, c.id AS chunk_id, d.source_version, d.review_due_at
                        FROM ai_document_chunks c
                        JOIN ai_knowledge_documents d ON d.id = c.document_id
                        WHERE d.status = 'ready' AND d.scope = 'global' AND d.review_status = 'approved'
                          AND d.review_due_at > NOW() AND d.source_version IS NOT NULL AND d.approved_content_hash=(SELECT encode(sha256(convert_to(COALESCE(string_agg(c2.content,chr(10) ORDER BY c2.chunk_index,c2.id),''),'UTF8')),'hex') FROM ai_document_chunks c2 WHERE c2.document_id=d.id) {cat_clause}
                        ORDER BY c.embedding <=> '{vec_str}'::vector
                        LIMIT {limit}""",
                    *params, timeout=10
                )
            return [
                RAGChunk(
                    content=r["content"],
                    score=float(r["score"] or 0),
                    source="knowledge",
                    doc_title=r["title"],
                    category=r["category"],
                    metadata={"document_id": str(r["document_id"]), "chunk_id": str(r["chunk_id"]), "version": r["source_version"], "review_due_at": r["review_due_at"].isoformat()},
                )
                for r in rows
                if float(r["score"] or 0) >= MIN_SCORE
            ]
        except Exception as e:
            logger.warning(f"UnifiedRAG: ai_document_chunks query failed — {e}")
            return []

    async def _fetch_ehr(
        self, vec, k: int, patient_id: Optional[str]
    ) -> List[RAGChunk]:
        """Query sib_embeddings via sync psycopg2 in a thread (Bio_ClinicalBERT)."""
        # Never search all patient embeddings.  A patient id is mandatory for
        # EHR retrieval; knowledge-fabric retrieval remains available without
        # one.  This is a hard privacy boundary for generic chat requests.
        if vec is None or not patient_id:
            return []
        try:
            vec_list = vec.tolist()
            limit = k * 2

            def _sync_query():
                from utils.pgvector_store import _db_conn
                with _db_conn() as conn:
                    cur = conn.cursor()
                    if patient_id:
                        cur.execute("""
                            SELECT content, source_id, metadata,
                                   1 - (embedding <=> %s::vector) AS score
                            FROM sib_embeddings
                            WHERE source_id = %s
                            ORDER BY embedding <=> %s::vector
                            LIMIT %s
                        """, (vec_list, patient_id, vec_list, limit))
                    else:
                        cur.execute("""
                            SELECT content, source_id, metadata,
                                   1 - (embedding <=> %s::vector) AS score
                            FROM sib_embeddings
                            ORDER BY embedding <=> %s::vector
                            LIMIT %s
                        """, (vec_list, vec_list, limit))
                    rows = cur.fetchall()
                    cur.close()
                return rows

            rows = await asyncio.to_thread(_sync_query)
            return [
                RAGChunk(
                    content=row[0],
                    score=float(row[3] or 0),
                    source="ehr",
                    patient_id=row[1],
                    metadata=row[2] or {},
                )
                for row in rows
                if float(row[3] or 0) >= MIN_SCORE
            ]
        except Exception as e:
            logger.warning(f"UnifiedRAG: sib_embeddings query failed — {e}")
            return []

    # ── Public API ────────────────────────────────────────────────────────────

    async def retrieve(
        self,
        query: str,
        patient_id: Optional[str] = None,
        k: int = 5,
        category: Optional[str] = None,
    ) -> List[RAGChunk]:
        """
        Retrieve top-k chunks from all sources, merged by cosine score.

        Args:
            query:      The search query
            patient_id: If set, EHR table is filtered to this patient
            k:          Max chunks to return across all sources
            category:   Optional knowledge category (insurance, clinical, etc.)

        Returns:
            List[RAGChunk] sorted by descending score, length ≤ k
        """
        # Embed with both models in parallel
        pubmed_vec, clinical_vec = await asyncio.gather(
            self._embed_pubmed(query),
            self._embed_clinical(query),
        )

        # Query both tables in parallel
        knowledge_chunks, ehr_chunks = await asyncio.gather(
            self._fetch_knowledge(pubmed_vec, k, category),
            self._fetch_ehr(clinical_vec, k, patient_id),
        )

        # Merge, deduplicate by content prefix, sort by score
        seen: set = set()
        merged: List[RAGChunk] = []
        for chunk in sorted(
            knowledge_chunks + ehr_chunks,
            key=lambda c: c.score,
            reverse=True,
        ):
            key = chunk.content[:120]
            if key not in seen:
                seen.add(key)
                merged.append(chunk)
            if len(merged) >= k:
                break

        logger.info(
            f"UnifiedRAG: '{query[:50]}' → "
            f"knowledge={len(knowledge_chunks)} ehr={len(ehr_chunks)} merged={len(merged)}"
        )
        return merged

    def to_context_string(self, chunks: List[RAGChunk], max_chars: int = 2500) -> str:
        """
        Format chunks as an LLM-ready context block.

        Each chunk is labelled by source and score so the LLM knows
        the provenance of each piece of evidence.
        """
        if not chunks:
            return ""
        parts: List[str] = []
        total = 0
        for c in chunks:
            if c.doc_title:
                label = f"[{c.source.upper()}: {c.doc_title} | score={c.score:.2f}]"
            else:
                label = f"[{c.source.upper()} | score={c.score:.2f}]"
            entry = f"{label}\n{c.content}"
            if total + len(entry) > max_chars:
                break
            parts.append(entry)
            total += len(entry)
        return "\n\n".join(parts)

    def to_dict_list(self, chunks: List[RAGChunk]) -> List[Dict[str, Any]]:
        """Serialize chunks for API responses."""
        return [
            {
                "content": c.content,
                "score": round(c.score, 4),
                "source": c.source,
                "patient_id": c.patient_id,
                "doc_title": c.doc_title,
                "category": c.category,
            }
            for c in chunks
        ]


# ─── Singleton ────────────────────────────────────────────────────────────────

_retriever: Optional[UnifiedRAGRetriever] = None


def get_unified_rag(pool=None) -> UnifiedRAGRetriever:
    """Get (or create) the singleton UnifiedRAGRetriever.

    Pass the asyncpg pool on first call (from AppState.initialize).
    Subsequent calls without pool just return the cached instance.
    """
    global _retriever
    if _retriever is None:
        _retriever = UnifiedRAGRetriever(pool)
    elif pool is not None and _retriever._pool is None:
        _retriever._pool = pool
    return _retriever
