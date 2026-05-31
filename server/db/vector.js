/**
 * Vector Database Connector
 * Vector embeddings for similarity search and RAG
 * Supports multiple vector stores: FAISS, Pinecone, Weaviate, Qdrant
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

import { connectPostgres } from './postgres.js';

dotenv.config();

const VECTOR_STORE_TYPE = (process.env.VECTOR_STORE_TYPE || 'pgvector').toLowerCase();

// Dimension is fixed at 768 — matches @xenova/transformers LaBSE / sentence-transformers.
// If you switch to OpenAI ada-002 set PGVECTOR_DIMENSION=1536 and re-embed all vectors.
const VECTOR_DIMENSION = parseInt(
  process.env.PGVECTOR_DIMENSION || process.env.VECTOR_DIMENSION || '768',
  10
);

if (![768, 1536, 384].includes(VECTOR_DIMENSION)) {
  console.warn(`⚠️  VectorDB: Unusual PGVECTOR_DIMENSION=${VECTOR_DIMENSION}. Supported: 384 (MiniLM), 768 (LaBSE), 1536 (OpenAI ada-002)`);
}

const VECTOR_DISTANCE = (process.env.PGVECTOR_DISTANCE || process.env.VECTOR_DISTANCE || 'cosine').toLowerCase();
const DEFAULT_VECTOR_NAMESPACE = process.env.VECTOR_NAMESPACE || 'default';

let vectorStore = null;
let isConnected = false;

function formatVectorLiteral(vectorValues = []) {
  if (!Array.isArray(vectorValues) || vectorValues.length === 0) {
    throw new Error('Vector must be a non-empty numeric array');
  }

  const sanitized = vectorValues.map((value) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return 0;
    }
    return Number.parseFloat(numeric.toFixed(8));
  });

  return `[${sanitized.join(',')}]`;
}

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { value: meta };
  }

  const payload = { ...meta };
  delete payload.embeddingId;
  delete payload.id;
  delete payload.namespace;
  delete payload.collection;
  delete payload.metadata;
  delete payload.vector;
  delete payload.values;
  return Object.keys(payload).length ? payload : {};
}

function resolveMetadataEnvelope(meta, fallbackId) {
  const envelope = {
    embeddingId: fallbackId,
    namespace: DEFAULT_VECTOR_NAMESPACE,
    metadata: {}
  };

  if (!meta) {
    return envelope;
  }

  if (typeof meta !== 'object' || Array.isArray(meta)) {
    envelope.metadata = { value: meta };
    return envelope;
  }

  envelope.embeddingId = meta.embeddingId || meta.id || fallbackId;
  envelope.namespace = meta.namespace || meta.collection || DEFAULT_VECTOR_NAMESPACE;
  const nestedMetadata = (meta.metadata && typeof meta.metadata === 'object') ? meta.metadata : meta;
  envelope.metadata = sanitizeMetadata(nestedMetadata);
  return envelope;
}

function getVectorSearchConfig() {
  switch (VECTOR_DISTANCE) {
    case 'l2':
    case 'euclidean':
      return {
        operator: '<->',
        similarity: '1 / (1 + (vector <-> $1::vector))'
      };
    case 'ip':
    case 'inner_product':
      return {
        operator: '<#>',
        similarity: '-1 * (vector <#> $1::vector)'
      };
    case 'cosine':
    default:
      return {
        operator: '<=>',
        similarity: '1 - (vector <=> $1::vector)'
      };
  }
}

async function initializePgVector() {
  const pool = await connectPostgres();
  console.log('✅ VectorDB: PGVector backend ready (PostgreSQL helper)');

  const searchConfig = getVectorSearchConfig();

  return {
    type: 'pgvector',
    distance: VECTOR_DISTANCE,
    dimension: VECTOR_DIMENSION,

    async add(vectors = [], metadataEntries = []) {
      if (!Array.isArray(vectors) || vectors.length === 0) {
        return { success: false, message: 'No vectors provided' };
      }

      const client = await pool.connect();
      try {
        for (let i = 0; i < vectors.length; i++) {
          const vectorValues = vectors[i];
          if (!Array.isArray(vectorValues) || vectorValues.length === 0) {
            continue;
          }

          const fallbackId = `embedding_${Date.now()}_${i}`;
          const envelope = resolveMetadataEnvelope(
            Array.isArray(metadataEntries) ? metadataEntries[i] : metadataEntries,
            fallbackId
          );

          const vectorLiteral = formatVectorLiteral(vectorValues);
          await client.query(
            `INSERT INTO medical_embeddings (embedding_id, namespace, metadata, vector, updated_at)
             VALUES ($1, $2, $3, $4::vector, NOW())
             ON CONFLICT (embedding_id) DO UPDATE
             SET namespace = EXCLUDED.namespace,
                 metadata = EXCLUDED.metadata,
                 vector = EXCLUDED.vector,
                 updated_at = NOW()`,
            [
              envelope.embeddingId,
              envelope.namespace,
              envelope.metadata,
              vectorLiteral
            ]
          );
        }

        return { success: true, inserted: vectors.length };
      } finally {
        client.release();
      }
    },

    async search(queryVector = [], k = 5, options = {}) {
      if (!Array.isArray(queryVector) || queryVector.length === 0) {
        return [];
      }

      const namespace = options.namespace || options.collection || DEFAULT_VECTOR_NAMESPACE;
      const vectorLiteral = formatVectorLiteral(queryVector);
      const params = [vectorLiteral, namespace, k];
      let filterClause = '';

      if (options.filter && typeof options.filter === 'object' && !Array.isArray(options.filter)) {
        filterClause = 'AND metadata @> $4::jsonb';
        params.push(JSON.stringify(options.filter));
      }

      const query = `
        SELECT embedding_id, namespace, metadata,
               ${searchConfig.similarity} AS similarity
        FROM medical_embeddings
        WHERE namespace = $2
        ${filterClause}
        ORDER BY vector ${searchConfig.operator} $1::vector
        LIMIT $3
      `;

      const { rows } = await pool.query(query, params);
      return rows;
    },

    async getStats() {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total, COALESCE(MAX(updated_at), NOW()) AS last_updated
         FROM medical_embeddings`
      );
      return {
        total_vectors: rows[0]?.total || 0,
        last_updated: rows[0]?.last_updated,
        dimension: VECTOR_DIMENSION,
        namespace: DEFAULT_VECTOR_NAMESPACE
      };
    }
  };
}

/**
 * Connect to Vector Database
 * @returns {Promise<Object>} Vector store instance
 */
export async function connectVectorDB() {
  if (isConnected && vectorStore) {
    console.log("✅ VectorDB: Using existing connection");
    return vectorStore;
  }

  try {
    switch (VECTOR_STORE_TYPE) {
      case 'pgvector':
        vectorStore = await initializePgVector();
        break;
      case 'faiss':
        vectorStore = await initializeFAISS();
        break;
      case 'pinecone':
        vectorStore = await initializePinecone();
        break;
      case 'weaviate':
        vectorStore = await initializeWeaviate();
        break;
      case 'qdrant':
        vectorStore = await initializeQdrant();
        break;
      default:
        throw new Error(`Unknown vector store type: ${VECTOR_STORE_TYPE}`);
    }

    isConnected = true;
    console.log(`✅ VectorDB: Connected to ${VECTOR_STORE_TYPE}`);
    return vectorStore;

  } catch (error) {
    console.error('❌ VectorDB: Connection error:', error.message);
    isConnected = false;
    throw error;
  }
}

/**
 * Initialize FAISS (Local file-based vector store)
 */
async function initializeFAISS() {
  const FAISS_PATH = process.env.FAISS_INDEX_PATH || path.join(process.cwd(), 'data', 'faiss_index');
  
  // Ensure directory exists
  if (!fs.existsSync(FAISS_PATH)) {
    fs.mkdirSync(FAISS_PATH, { recursive: true });
  }

  return {
    type: 'faiss',
    path: FAISS_PATH,
    dimension: VECTOR_DIMENSION,
    
    async add(vectors, metadata) {
      // Call Python service for FAISS operations
      try {
        const response = await axios.post(
          `${process.env.PYTHON_SERVICE_URL || 'http://localhost:5000'}/api/vector/add`,
          { vectors, metadata, index_path: FAISS_PATH }
        );
        return response.data;
      } catch (error) {
        console.error('❌ FAISS: Add operation failed:', error.message);
        throw error;
      }
    },

    async search(query_vector, k = 5) {
      try {
        const response = await axios.post(
          `${process.env.PYTHON_SERVICE_URL || 'http://localhost:5000'}/api/vector/search`,
          { query_vector, k, index_path: FAISS_PATH }
        );
        return response.data;
      } catch (error) {
        console.error('❌ FAISS: Search operation failed:', error.message);
        throw error;
      }
    },

    async getStats() {
      try {
        const response = await axios.get(
          `${process.env.PYTHON_SERVICE_URL || 'http://localhost:5000'}/api/vector/stats`,
          { params: { index_path: FAISS_PATH } }
        );
        return response.data;
      } catch (error) {
        console.error('❌ FAISS: Stats operation failed:', error.message);
        return { total_vectors: 0 };
      }
    }
  };
}

/**
 * Initialize Pinecone (Cloud vector database)
 */
async function initializePinecone() {
  const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
  const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT;
  const PINECONE_INDEX = process.env.PINECONE_INDEX || 'mediczy-vectors';

  if (!PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY not configured');
  }

  return {
    type: 'pinecone',
    apiKey: PINECONE_API_KEY,
    environment: PINECONE_ENVIRONMENT,
    index: PINECONE_INDEX,
    dimension: VECTOR_DIMENSION,

    async add(vectors, metadata) {
      // Implement Pinecone upsert
      console.log('⚠️  Pinecone: Add operation not yet implemented');
      return { success: false, message: 'Not implemented' };
    },

    async search(query_vector, k = 5) {
      // Implement Pinecone query
      console.log('⚠️  Pinecone: Search operation not yet implemented');
      return { matches: [] };
    },

    async getStats() {
      console.log('⚠️  Pinecone: Stats operation not yet implemented');
      return { total_vectors: 0 };
    }
  };
}

/**
 * Initialize Weaviate (Open-source vector database)
 */
async function initializeWeaviate() {
  const WEAVIATE_URL = process.env.WEAVIATE_URL || 'http://localhost:8080';
  const WEAVIATE_API_KEY = process.env.WEAVIATE_API_KEY;

  return {
    type: 'weaviate',
    url: WEAVIATE_URL,
    apiKey: WEAVIATE_API_KEY,
    dimension: VECTOR_DIMENSION,

    async add(vectors, metadata) {
      console.log('⚠️  Weaviate: Add operation not yet implemented');
      return { success: false, message: 'Not implemented' };
    },

    async search(query_vector, k = 5) {
      console.log('⚠️  Weaviate: Search operation not yet implemented');
      return { results: [] };
    },

    async getStats() {
      console.log('⚠️  Weaviate: Stats operation not yet implemented');
      return { total_vectors: 0 };
    }
  };
}

/**
 * Initialize Qdrant (High-performance vector database)
 */
async function initializeQdrant() {
  const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
  const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
  const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'mediczy_vectors';

  return {
    type: 'qdrant',
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
    collection: QDRANT_COLLECTION,
    dimension: VECTOR_DIMENSION,

    async add(vectors, metadata) {
      console.log('⚠️  Qdrant: Add operation not yet implemented');
      return { success: false, message: 'Not implemented' };
    },

    async search(query_vector, k = 5) {
      console.log('⚠️  Qdrant: Search operation not yet implemented');
      return { results: [] };
    },

    async getStats() {
      console.log('⚠️  Qdrant: Stats operation not yet implemented');
      return { total_vectors: 0 };
    }
  };
}

/**
 * Close Vector DB connection
 */
export async function closeVectorDB() {
  try {
    vectorStore = null;
    isConnected = false;
    console.log('✅ VectorDB: Connection closed');
  } catch (err) {
    console.error('❌ VectorDB: Error closing connection:', err);
    throw err;
  }
}

/**
 * Get Vector DB status
 */
export function getVectorDBStatus() {
  return {
    connected: isConnected,
    type: VECTOR_STORE_TYPE,
    dimension: VECTOR_DIMENSION,
  };
}

/**
 * Test Vector DB connection
 */
export async function testVectorDB() {
  try {
    if (!isConnected) {
      await connectVectorDB();
    }
    const stats = await vectorStore.getStats();
    return { 
      success: true, 
      message: 'VectorDB connection successful',
      stats 
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Add vectors to the database
 * @param {Array<Array<number>>} vectors - Array of vector embeddings
 * @param {Array<Object>} metadata - Array of metadata objects
 */
export async function addVectors(vectors, metadata) {
  try {
    if (!isConnected) {
      await connectVectorDB();
    }
    return await vectorStore.add(vectors, metadata);
  } catch (error) {
    console.error('❌ VectorDB: Add vectors error:', error.message);
    throw error;
  }
}

/**
 * Search for similar vectors
 * @param {Array<number>} queryVector - Query vector embedding
 * @param {number} k - Number of results to return
 */
export async function searchVectors(queryVector, k = 5) {
  try {
    if (!isConnected) {
      await connectVectorDB();
    }
    return await vectorStore.search(queryVector, k);
  } catch (error) {
    console.error('❌ VectorDB: Search vectors error:', error.message);
    throw error;
  }
}

/**
 * Get vector database statistics
 */
export async function getVectorStats() {
  try {
    if (!isConnected) {
      await connectVectorDB();
    }
    return await vectorStore.getStats();
  } catch (error) {
    console.error('❌ VectorDB: Get stats error:', error.message);
    return { total_vectors: 0 };
  }
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await closeVectorDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeVectorDB();
  process.exit(0);
});

export { vectorStore };
export default { connectVectorDB, closeVectorDB, addVectors, searchVectors, getVectorStats };
