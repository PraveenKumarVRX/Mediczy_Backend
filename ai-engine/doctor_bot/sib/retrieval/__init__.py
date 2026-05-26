"""
SIB Retrieval Module
====================

Advanced retrieval capabilities:
- Hybrid search (dense + sparse)
- BM25 keyword matching
- Reciprocal rank fusion
- Cross-encoder reranking
"""

from .hybrid_retriever import (
    HybridRetriever,
    BM25Index,
    RetrievalResult,
    get_hybrid_retriever
)
from .unified_rag import (
    UnifiedRAGRetriever,
    RAGChunk,
    get_unified_rag,
)

__all__ = [
    'HybridRetriever',
    'BM25Index',
    'RetrievalResult',
    'get_hybrid_retriever',
    'UnifiedRAGRetriever',
    'RAGChunk',
    'get_unified_rag',
]
