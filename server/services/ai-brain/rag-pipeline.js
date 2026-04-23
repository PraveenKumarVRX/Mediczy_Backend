/**
 * RAG Pipeline Service
 * ====================
 * Document chunking, embedding via SIB ClinicalBERT, and pgvector similarity search.
 * Handles knowledge document upload, processing, and retrieval.
 */

import axios from 'axios';
import pool from '../../db/pgPool.js';

const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';
const CHUNK_SIZE = 400;      // tokens (approx 300 words)
const CHUNK_OVERLAP = 50;    // token overlap between chunks
const MAX_CHUNKS_PER_QUERY = 8;
const MIN_RELEVANCE_SCORE = 0.3;

// ─── Embedding ──────────────────────────────────────────────

/**
 * Get embeddings from SIB's ClinicalBERT endpoint.
 * @param {string|string[]} texts
 * @returns {number[][]} Array of 768-dim vectors
 */
async function embed(texts) {
  const input = Array.isArray(texts) ? texts : [texts];
  const { data } = await axios.post(`${SIB_URL}/embed`, { texts: input }, {
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
  });
  return data.embeddings;
}

// ─── Chunking ───────────────────────────────────────────────

/**
 * Split text into overlapping chunks.
 * Uses word-boundary splitting with approximate token counting (~0.75 words per token).
 */
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (!text || text.trim().length === 0) return [];

  const words = text.split(/\s+/);
  const wordsPerChunk = Math.floor(chunkSize * 0.75); // approx token→word ratio
  const overlapWords = Math.floor(overlap * 0.75);
  const chunks = [];

  for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ');
    if (chunk.trim().length > 20) { // skip tiny chunks
      chunks.push({
        content: chunk.trim(),
        tokenCount: Math.ceil(chunk.split(/\s+/).length / 0.75),
        index: chunks.length
      });
    }
    if (i + wordsPerChunk >= words.length) break;
  }

  return chunks;
}

// ─── Document Processing ────────────────────────────────────

/**
 * Process and index a knowledge document.
 * Chunks text → embeds → stores in pgvector.
 *
 * @param {number} documentId - ID from ai_knowledge_documents
 * @param {string} text - Full document text
 * @returns {{ chunkCount: number, status: string }}
 */
async function processDocument(documentId, text) {
  const db = pool;

  try {
    await db.query(
      `UPDATE ai_knowledge_documents SET status = 'processing', content_text = $1, updated_at = NOW() WHERE id = $2`,
      [text, documentId]
    );

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      await db.query(
        `UPDATE ai_knowledge_documents SET status = 'error', updated_at = NOW() WHERE id = $1`,
        [documentId]
      );
      return { chunkCount: 0, status: 'error' };
    }

    // Embed all chunks in batch
    const embeddings = await embed(chunks.map(c => c.content));

    // Store chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      const vecStr = `[${embeddings[i].join(',')}]`;
      await db.query(
        `INSERT INTO ai_document_chunks (document_id, chunk_index, content, token_count, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5::vector, $6)`,
        [
          documentId,
          chunks[i].index,
          chunks[i].content,
          chunks[i].tokenCount,
          vecStr,
          JSON.stringify({ char_count: chunks[i].content.length })
        ]
      );
    }

    await db.query(
      `UPDATE ai_knowledge_documents SET status = 'ready', chunk_count = $1, updated_at = NOW() WHERE id = $2`,
      [chunks.length, documentId]
    );

    return { chunkCount: chunks.length, status: 'ready' };
  } catch (err) {
    console.error('[RAG] Document processing error:', err.message);
    await db.query(
      `UPDATE ai_knowledge_documents SET status = 'error', updated_at = NOW() WHERE id = $1`,
      [documentId]
    ).catch(() => {});
    throw err;
  }
}

// ─── Search ─────────────────────────────────────────────────

/**
 * Vector similarity search across knowledge documents + SIB embeddings.
 *
 * @param {string} query - Natural language query
 * @param {Object} [options]
 * @param {string} [options.scope] - 'global', 'hospital', 'doctor'
 * @param {string} [options.scopeId]
 * @param {string} [options.category] - document category filter
 * @param {number} [options.topK] - max results (default 8)
 * @param {number} [options.minScore] - minimum relevance (default 0.3)
 * @param {number} [options.userId]
 * @param {number} [options.conversationId]
 * @returns {Array<{content, score, source, documentTitle, metadata}>}
 */
async function search(query, options = {}) {
  const {
    scope = null,
    scopeId = null,
    category = null,
    topK = MAX_CHUNKS_PER_QUERY,
    minScore = MIN_RELEVANCE_SCORE,
    userId = null,
    conversationId = null
  } = options;

  const start = Date.now();
  const db = pool;

  // Embed query
  const [queryVec] = await embed(query);
  const vecStr = `[${queryVec.join(',')}]`;

  // Search ai_document_chunks (new knowledge base)
  let docFilter = '';
  const params = [vecStr, topK * 2]; // fetch more, re-rank later

  if (scope) {
    docFilter += ` AND d.scope = $${params.length + 1}`;
    params.push(scope);
  }
  if (scopeId) {
    docFilter += ` AND d.scope_id = $${params.length + 1}`;
    params.push(scopeId);
  }
  if (category) {
    docFilter += ` AND d.category = $${params.length + 1}`;
    params.push(category);
  }

  const docChunksQuery = `
    SELECT c.id, c.content, c.metadata,
           1 - (c.embedding <=> $1::vector) AS score,
           d.title AS document_title, d.category, d.scope,
           'knowledge_base' AS source
    FROM ai_document_chunks c
    JOIN ai_knowledge_documents d ON d.id = c.document_id
    WHERE d.status = 'ready' ${docFilter}
    ORDER BY c.embedding <=> $1::vector
    LIMIT $2
  `;

  // Search sib_embeddings (existing EHR embeddings)
  const sibQuery = `
    SELECT id, content, metadata,
           1 - (embedding <=> $1::vector) AS score,
           source_type AS document_title, source_type AS category, 'ehr' AS scope,
           'sib_embeddings' AS source
    FROM sib_embeddings
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `;

  // Run both searches in parallel
  const [docResults, sibResults] = await Promise.all([
    db.query(docChunksQuery, params).catch(err => {
      console.error('[RAG] doc chunks search error:', err.message);
      return { rows: [] };
    }),
    db.query(sibQuery, [vecStr, Math.ceil(topK / 2)]).catch(err => {
      console.error('[RAG] sib search error:', err.message);
      return { rows: [] };
    })
  ]);

  // Merge and re-rank by score
  let allResults = [...docResults.rows, ...sibResults.rows]
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // Keyword boost: exact keyword matches get +0.1 score
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/).filter(w => w.length > 3);
  allResults = allResults.map(r => {
    const contentLower = r.content.toLowerCase();
    const keywordHits = keywords.filter(k => contentLower.includes(k)).length;
    return {
      ...r,
      score: r.score + (keywordHits * 0.02), // small boost per keyword
      keywordHits
    };
  }).sort((a, b) => b.score - a.score);

  const latencyMs = Date.now() - start;

  // Log RAG query
  try {
    await db.query(
      `INSERT INTO ai_rag_query_logs (conversation_id, user_id, query_text, chunks_retrieved, top_score, avg_score, latency_ms, results)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        conversationId,
        userId,
        query,
        allResults.length,
        allResults[0]?.score || 0,
        allResults.length > 0 ? allResults.reduce((s, r) => s + r.score, 0) / allResults.length : 0,
        latencyMs,
        JSON.stringify(allResults.map(r => ({
          chunk_id: r.id,
          score: Math.round(r.score * 1000) / 1000,
          snippet: r.content.substring(0, 100)
        })))
      ]
    );
  } catch (logErr) {
    console.error('[RAG] Failed to log query:', logErr.message);
  }

  return allResults.map(r => ({
    content: r.content,
    score: Math.round(r.score * 1000) / 1000,
    source: r.source,
    documentTitle: r.document_title,
    category: r.category,
    metadata: r.metadata
  }));
}

/**
 * Build RAG context string for system prompt injection.
 */
async function buildContext(query, options = {}) {
  const results = await search(query, options);
  if (results.length === 0) return '';

  const contextParts = results.map((r, i) =>
    `[Source ${i + 1}: ${r.documentTitle || 'unknown'} (relevance: ${r.score})]:\n${r.content}`
  );

  return `=== KNOWLEDGE BASE CONTEXT ===\n${contextParts.join('\n\n')}`;
}

// ─── Agentic Retrieval ──────────────────────────────────────

/**
 * Agentic RAG: dynamically decide WHICH retrieval sources to hit
 * based on query classification, then retrieve from those sources only.
 *
 * Intent routing:
 *   drug_info     → knowledge_base (medical encyclopedia) + CIMS
 *   symptoms      → knowledge_base (clinical) + sib_embeddings (EHR history)
 *   lab_results   → sib_embeddings (patient records) only
 *   procedures    → knowledge_base (clinical guidelines)
 *   general_chat  → skip RAG entirely (save latency)
 *
 * @param {string} query
 * @param {Object} [options] - same as search() options plus {skipIfGeneral: bool}
 * @returns {{ context: string, sources: string[], plan: string, retrieved: number }}
 */
async function agenticRetrieve(query, options = {}) {
  const { skipIfGeneral = true } = options;
  const queryLower = query.toLowerCase();

  // ─── Step 1: classify retrieval intent ───────────────────────────────────
  const plan = classifyRetrievalIntent(queryLower);

  if (plan.type === 'general_chat' && skipIfGeneral) {
    return { context: '', sources: [], plan: plan.type, retrieved: 0 };
  }

  // ─── Step 2: build targeted search options ────────────────────────────────
  const searchOptions = {
    ...options,
    topK: plan.topK,
    minScore: plan.minScore,
    category: plan.category || options.category || null,
  };

  // ─── Step 3: run retrieval from relevant sources in parallel ──────────────
  const retrievalTasks = [];

  if (plan.sources.includes('knowledge_base')) {
    retrievalTasks.push(
      search(query, { ...searchOptions }).then(r => r.filter(x => x.source === 'knowledge_base'))
    );
  }
  if (plan.sources.includes('ehr')) {
    retrievalTasks.push(
      search(query, { ...searchOptions }).then(r => r.filter(x => x.source === 'sib_embeddings'))
    );
  }

  const resultArrays = await Promise.all(retrievalTasks);
  const allResults = resultArrays.flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, plan.topK);

  if (allResults.length === 0) {
    return { context: '', sources: plan.sources, plan: plan.type, retrieved: 0 };
  }

  const contextParts = allResults.map((r, i) =>
    `[${plan.type.toUpperCase()} Source ${i + 1}: ${r.documentTitle || r.source} (score: ${r.score})]:\n${r.content}`
  );

  return {
    context: `=== RETRIEVED KNOWLEDGE (${plan.type}) ===\n${contextParts.join('\n\n')}`,
    sources: [...new Set(allResults.map(r => r.source))],
    plan: plan.type,
    retrieved: allResults.length,
  };
}

/**
 * Classify what kind of retrieval is needed for a query.
 * Runs on CPU (regex/keyword — no LLM call needed).
 */
function classifyRetrievalIntent(queryLower) {
  // Drug / medication
  if (/\b(medicine|drug|tablet|capsule|dose|dosage|side effect|contraindic|interaction|mg|ml)\b/.test(queryLower)) {
    return { type: 'drug_info', sources: ['knowledge_base'], topK: 6, minScore: 0.35, category: null };
  }
  // Lab / investigation
  if (/\b(test|report|result|lab|blood|urine|cbc|rbs|hba1c|creatinine|ecg|x.?ray|cxr|mri|ct scan|biopsy)\b/.test(queryLower)) {
    return { type: 'lab_results', sources: ['ehr'], topK: 5, minScore: 0.30, category: null };
  }
  // Symptoms / differential diagnosis
  if (/\b(symptom|pain|fever|cough|breath|nausea|vomit|headache|dizziness|chest|abdomen|swelling|rash|bleed)\b/.test(queryLower)) {
    return { type: 'symptoms', sources: ['knowledge_base', 'ehr'], topK: 8, minScore: 0.32, category: 'clinical' };
  }
  // Procedure / surgery
  if (/\b(procedure|surgery|operation|protocol|guideline|treatment|therapy|manage)\b/.test(queryLower)) {
    return { type: 'procedure', sources: ['knowledge_base'], topK: 6, minScore: 0.35, category: 'clinical' };
  }
  // Insurance / TPA
  if (/\b(insurance|tpa|claim|cashless|preauth|policy|coverage|premium)\b/.test(queryLower)) {
    return { type: 'insurance', sources: ['knowledge_base'], topK: 4, minScore: 0.30, category: 'insurance' };
  }
  // General / conversational — skip expensive retrieval
  return { type: 'general_chat', sources: [], topK: 0, minScore: 1.0, category: null };
}

/**
 * Get knowledge base statistics.
 */
async function getStats() {
  const db = pool;
  const [docs, chunks, sib] = await Promise.all([
    db.query('SELECT COUNT(*) as cnt, COUNT(*) FILTER (WHERE status = \'ready\') as ready FROM ai_knowledge_documents'),
    db.query('SELECT COUNT(*) as cnt, COALESCE(SUM(token_count), 0) as tokens FROM ai_document_chunks'),
    db.query('SELECT COUNT(*) as cnt FROM sib_embeddings')
  ]);

  return {
    documents: {
      total: parseInt(docs.rows[0].cnt),
      ready: parseInt(docs.rows[0].ready)
    },
    chunks: {
      total: parseInt(chunks.rows[0].cnt),
      totalTokens: parseInt(chunks.rows[0].tokens)
    },
    sibEmbeddings: parseInt(sib.rows[0].cnt),
    embeddingModel: 'Bio_ClinicalBERT',
    dimension: 768,
    vectorIndex: 'HNSW (cosine)'
  };
}

export default {
  embed,
  chunkText,
  processDocument,
  search,
  buildContext,
  agenticRetrieve,
  getStats
};

