/**
 * RAG Tools — 2 tools for knowledge base search
 * search_knowledge_base, list_knowledge_documents
 */

import { register } from './index.js';
import ragPipeline from '../rag-pipeline.js';
import pool from '../../../db/pgPool.js';

// ─── 1. Search Knowledge Base ──────────────────────────────

register({
  name: 'search_knowledge_base',
  description: 'Search the medical knowledge base using semantic vector search. Finds relevant clinical guidelines, drug information, protocols, and medical literature. Use this when the user asks medical questions that need evidence-based answers.',
  category: 'rag',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      category: { type: 'string', description: 'Filter: clinical_guidelines, drug_info, protocol, patient_education, general' },
      top_k: { type: 'number', description: 'Max results (default 5)' }
    },
    required: ['query']
  },
  async execute(params, ctx) {
    const results = await ragPipeline.search(params.query, {
      category: params.category || null,
      topK: params.top_k || 5,
      userId: ctx.userId,
      conversationId: ctx.conversationId
    });

    return {
      results: results.map(r => ({
        content: r.content,
        relevance: r.score,
        source: r.documentTitle || r.source,
        category: r.category
      })),
      count: results.length,
      query: params.query
    };
  }
});

// ─── 2. List Knowledge Documents ───────────────────────────

register({
  name: 'list_knowledge_documents',
  description: 'List all available documents in the medical knowledge base with their categories and status.',
  category: 'rag',
  parameters: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Filter by category' },
      limit: { type: 'number', description: 'Max results (default 20)' }
    },
    required: []
  },
  async execute(params) {
    const db = pool;
    const limit = params.limit || 20;
    let query = `SELECT id, title, file_type, category, scope, chunk_count, status, created_at
                 FROM ai_knowledge_documents`;
    const qParams = [limit];

    if (params.category) {
      query += ` WHERE category = $2`;
      qParams.push(params.category);
    }

    query += ` ORDER BY created_at DESC LIMIT $1`;

    const { rows } = await db.query(query, qParams);

    return {
      documents: rows,
      count: rows.length
    };
  }
});
