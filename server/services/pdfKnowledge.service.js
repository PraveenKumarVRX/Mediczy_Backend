/**
 * PDF Knowledge Ingestion Service
 * 
 * Processes PDF documents (like Gale Encyclopedia of Medicine)
 * and stores them as vector embeddings for semantic search in CDSS.
 * 
 * Features:
 * - PDF text extraction
 * - Intelligent chunking with overlap
 * - Embedding generation using LaBSE
 * - Vector storage in PostgreSQL with pgvector
 * - Semantic search for clinical queries
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from '@xenova/transformers';
import { connectPostgres } from '../db/postgres.js';

// Configuration
const CHUNK_SIZE = parseInt(process.env.PDF_CHUNK_SIZE || '1000', 10);
const CHUNK_OVERLAP = parseInt(process.env.PDF_CHUNK_OVERLAP || '200', 10);
const EMBEDDING_DIMENSION = parseInt(process.env.PGVECTOR_DIMENSION || '768', 10);
const BATCH_SIZE = parseInt(process.env.PDF_BATCH_SIZE || '10', 10);

class PDFKnowledgeService {
  constructor() {
    this.embeddingModel = null;
    this.modelLoaded = false;
    this.modelPath = 'Xenova/LaBSE';
    this.pool = null;
    this._initPromise = null;
  }

  /**
   * Initialize the embedding model
   */
  async initialize() {
    if (this.modelLoaded) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        console.log('[PDFKnowledge] Initializing embedding model...');
        this.embeddingModel = await pipeline('feature-extraction', this.modelPath);
        this.modelLoaded = true;
        this.pool = await connectPostgres();
        console.log('[PDFKnowledge] Service initialized successfully');
      } catch (error) {
        this._initPromise = null;
        console.error('[PDFKnowledge] Initialization error:', error.message);
        throw error;
      }
    })();

    return this._initPromise;
  }

  /**
   * Generate embedding for a text chunk
   */
  async generateEmbedding(text) {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    try {
      const output = await this.embeddingModel(text, { pooling: 'mean', normalize: true });
      // Convert Float32Array to regular array
      return Array.from(output.data).slice(0, EMBEDDING_DIMENSION);
    } catch (error) {
      console.error('[PDFKnowledge] Embedding error:', error.message);
      throw error;
    }
  }

  /**
   * Split text into overlapping chunks for better context retention
   */
  chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const chunks = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
          charStart: chunks.reduce((sum, c) => sum + c.text.length, 0),
          charEnd: chunks.reduce((sum, c) => sum + c.text.length, 0) + currentChunk.length
        });

        // Keep overlap from previous chunk
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 5));
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        charStart: chunks.reduce((sum, c) => sum + c.text.length, 0),
        charEnd: chunks.reduce((sum, c) => sum + c.text.length, 0) + currentChunk.length
      });
    }

    return chunks;
  }

  /**
   * Extract text from PDF using pdf-parse
   */
  async extractPDFText(pdfPath) {
    try {
      // Dynamic import for pdf-parse
      const pdfParse = (await import('pdf-parse')).default;
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(dataBuffer);
      
      return {
        text: data.text,
        numPages: data.numpages,
        info: data.info,
        metadata: data.metadata
      };
    } catch (error) {
      console.error('[PDFKnowledge] PDF extraction error:', error.message);
      throw error;
    }
  }

  /**
   * Process and ingest a PDF document into the knowledge base
   */
  async ingestPDF(pdfPath, options = {}) {
    const {
      source = 'unknown',
      category = 'medical',
      namespace = 'cdss_knowledge',
      title = path.basename(pdfPath, '.pdf')
    } = options;

    console.log(`[PDFKnowledge] Starting ingestion of: ${title}`);

    // Extract text from PDF
    const pdfData = await this.extractPDFText(pdfPath);
    console.log(`[PDFKnowledge] Extracted ${pdfData.numPages} pages, ${pdfData.text.length} characters`);

    // Clean and normalize text
    const cleanedText = this.cleanText(pdfData.text);

    // Create chunks
    const chunks = this.chunkText(cleanedText);
    console.log(`[PDFKnowledge] Created ${chunks.length} chunks`);

    // Generate document ID
    const docId = crypto.createHash('md5').update(`${source}_${title}`).digest('hex').substring(0, 16);

    // Process chunks in batches
    const results = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      console.log(`[PDFKnowledge] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`);

      const batchResults = await Promise.all(
        batch.map(async (chunk) => {
          const embeddingId = `${docId}_chunk_${chunk.index}`;
          const embedding = await this.generateEmbedding(chunk.text);

          return {
            embeddingId,
            namespace,
            vector: embedding,
            metadata: {
              source,
              category,
              title,
              chunkIndex: chunk.index,
              text: chunk.text,
              charStart: chunk.charStart,
              charEnd: chunk.charEnd,
              pageCount: pdfData.numPages,
              ingestedAt: new Date().toISOString()
            }
          };
        })
      );

      // Store in vector database
      await this.storeEmbeddings(batchResults);
      results.push(...batchResults);
    }

    console.log(`[PDFKnowledge] Successfully ingested ${results.length} chunks from ${title}`);

    return {
      success: true,
      documentId: docId,
      title,
      source,
      chunksIngested: results.length,
      pageCount: pdfData.numPages
    };
  }

  /**
   * Ingest raw text content (for JSON/structured data)
   */
  async ingestText(entries, options = {}) {
    const {
      source = 'manual',
      category = 'medical',
      namespace = 'cdss_knowledge'
    } = options;

    console.log(`[PDFKnowledge] Ingesting ${entries.length} text entries`);

    const results = [];
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (entry, idx) => {
          const globalIdx = i + idx;
          const embeddingId = entry.id || `${source}_${globalIdx}_${Date.now()}`;
          const embedding = await this.generateEmbedding(entry.text);

          return {
            embeddingId,
            namespace,
            vector: embedding,
            metadata: {
              source,
              category,
              title: entry.title || `Entry ${globalIdx}`,
              text: entry.text,
              topic: entry.topic,
              section: entry.section,
              ...entry.metadata,
              ingestedAt: new Date().toISOString()
            }
          };
        })
      );

      await this.storeEmbeddings(batchResults);
      results.push(...batchResults);
    }

    return {
      success: true,
      entriesIngested: results.length
    };
  }

  /**
   * Clean and normalize extracted text
   */
  cleanText(text) {
    return text
      .replace(/\f/g, '\n\n')  // Form feeds to paragraph breaks
      .replace(/\r\n/g, '\n')  // Normalize line endings
      .replace(/[ \t]+/g, ' ')  // Multiple spaces to single
      .replace(/\n{3,}/g, '\n\n')  // Multiple newlines to double
      .replace(/[^\x20-\x7E\n]/g, '')  // Remove non-printable chars
      .trim();
  }

  /**
   * Store embeddings in PostgreSQL with pgvector
   */
  async storeEmbeddings(embeddings) {
    if (!this.pool) {
      this.pool = await connectPostgres();
    }

    const client = await this.pool.connect();
    try {
      for (const emb of embeddings) {
        const vectorLiteral = `[${emb.vector.join(',')}]`;
        
        await client.query(
          `INSERT INTO medical_embeddings (embedding_id, namespace, metadata, vector, updated_at)
           VALUES ($1, $2, $3, $4::vector, NOW())
           ON CONFLICT (embedding_id) DO UPDATE
           SET namespace = EXCLUDED.namespace,
               metadata = EXCLUDED.metadata,
               vector = EXCLUDED.vector,
               updated_at = NOW()`,
          [emb.embeddingId, emb.namespace, emb.metadata, vectorLiteral]
        );
      }
    } finally {
      client.release();
    }
  }

  /**
   * Semantic search in the knowledge base
   */
  async search(query, options = {}) {
    const {
      k = 5,
      namespace = 'cdss_knowledge',
      source,
      category,
      minSimilarity = 0.5
    } = options;

    if (!this.modelLoaded) {
      await this.initialize();
    }

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    // Build filter
    let filterClause = '';
    const params = [vectorLiteral, namespace, k];

    if (source || category) {
      const filters = {};
      if (source) filters.source = source;
      if (category) filters.category = category;
      filterClause = 'AND metadata @> $4::jsonb';
      params.push(JSON.stringify(filters));
    }

    const query_sql = `
      SELECT 
        embedding_id,
        namespace,
        metadata,
        1 - (vector <=> $1::vector) AS similarity
      FROM medical_embeddings
      WHERE namespace = $2
      ${filterClause}
      ORDER BY vector <=> $1::vector
      LIMIT $3
    `;

    if (!this.pool) {
      this.pool = await connectPostgres();
    }

    const { rows } = await this.pool.query(query_sql, params);

    // Filter by minimum similarity and format results
    return rows
      .filter(row => row.similarity >= minSimilarity)
      .map(row => ({
        id: row.embedding_id,
        similarity: parseFloat(row.similarity.toFixed(4)),
        text: row.metadata?.text || '',
        title: row.metadata?.title || '',
        source: row.metadata?.source || '',
        category: row.metadata?.category || '',
        topic: row.metadata?.topic || '',
        section: row.metadata?.section || '',
        metadata: row.metadata
      }));
  }

  /**
   * Get statistics about the knowledge base
   */
  async getStats(namespace = 'cdss_knowledge') {
    if (!this.pool) {
      this.pool = await connectPostgres();
    }

    const { rows } = await this.pool.query(
      `SELECT 
        COUNT(*)::int AS total_entries,
        COUNT(DISTINCT metadata->>'source')::int AS unique_sources,
        COUNT(DISTINCT metadata->>'title')::int AS unique_documents,
        json_agg(DISTINCT metadata->>'source') AS sources,
        MAX(updated_at) AS last_updated
      FROM medical_embeddings
      WHERE namespace = $1`,
      [namespace]
    );

    return rows[0] || { total_entries: 0, unique_sources: 0, unique_documents: 0, sources: [] };
  }

  /**
   * Delete all entries from a specific source
   */
  async deleteBySource(source, namespace = 'cdss_knowledge') {
    if (!this.pool) {
      this.pool = await connectPostgres();
    }

    const result = await this.pool.query(
      `DELETE FROM medical_embeddings 
       WHERE namespace = $1 AND metadata->>'source' = $2
       RETURNING embedding_id`,
      [namespace, source]
    );

    return { deleted: result.rowCount };
  }
}

// Singleton instance
const pdfKnowledgeService = new PDFKnowledgeService();

export default pdfKnowledgeService;
export { PDFKnowledgeService };
