/**
 * LaBSE (Language-agnostic BERT Sentence Embeddings) Integration
 * Provides semantic similarity for fallback intent detection
 * 
 * This module acts as an intelligent fallback when keyword-based
 * classification has low confidence (<50%). It uses pre-computed
 * embeddings of intent examples to find semantic matches.
 */

import { pipeline } from '@xenova/transformers';

class LaBSEEmbeddings {
  constructor() {
    this.model = null;
    this.modelLoaded = false;
    this.embeddingCache = new Map();
    this.maxCacheSize = 1000;
    this.intentEmbeddings = null;
    this.modelPath = 'Xenova/LaBSE';
    
    // Performance configuration (from environment)
    this.eagerLoadEnabled = process.env.LABSE_EAGER_LOAD === 'true';
    this.semanticFallbackEnabled = process.env.LABSE_SEMANTIC_FALLBACK !== 'false';
    
    // Intent reference phrases for semantic matching
    this.intentReferences = {
      emergency: [
        "I can't breathe",
        "severe chest pain",
        "emergency help",
        "life threatening",
        "critical condition",
        "dial emergency",
        "call ambulance"
      ],
      appointment: [
        "book appointment",
        "schedule appointment",
        "meet doctor",
        "appointment with doctor",
        "get appointment",
        "when can I see doctor",
        "reserve slot"
      ],
      doctor_search: [
        "find doctor",
        "search doctor",
        "looking for specialist",
        "need cardiologist",
        "find dermatologist",
        "doctor recommendation",
        "which doctor should I visit"
      ],
      pregnancy: [
        "I'm pregnant",
        "pregnancy related",
        "expecting baby",
        "maternity care",
        "OB/GYN",
        "pregnancy symptoms",
        "prenatal care"
      ],
      mental_health: [
        "I'm depressed",
        "mental health issue",
        "anxiety problem",
        "psychological help",
        "counselor needed",
        "mental support",
        "depression treatment"
      ],
      pediatric: [
        "my child has fever",
        "baby is sick",
        "kids health",
        "children's doctor",
        "pediatrician needed",
        "child has symptoms",
        "infant care"
      ],
      medication: [
        "medication information",
        "drug side effects",
        "medicine dosage",
        "prescription drug",
        "medication interaction",
        "antibiotic usage",
        "medicine prescribed"
      ],
      lab_test: [
        "blood test results",
        "lab report",
        "test explanation",
        "understand blood work",
        "lab findings",
        "diagnostic test",
        "pathology report"
      ],
      lifestyle: [
        "exercise routine",
        "diet plan",
        "healthy lifestyle",
        "fitness advice",
        "nutrition guidance",
        "weight management",
        "sleep improvement"
      ],
      general_info: [
        "health information",
        "medical facts",
        "health education",
        "general knowledge",
        "what is disease",
        "how does treatment work",
        "medical information"
      ]
    };
  }

  /**
   * Initialize the model (lazy loading)
   * Only loads when first fallback query is needed
   * Can be pre-loaded via eagerLoadEnabled env variable
   */
  async initialize() {
    if (this.modelLoaded) return;
    if (!this.semanticFallbackEnabled) {
      console.log('[LaBSE] Semantic fallback disabled via config');
      return;
    }

    try {
      console.log('[LaBSE] Initializing semantic embedding model...');
      this.model = await pipeline('feature-extraction', this.modelPath);
      this.modelLoaded = true;
      
      // Pre-compute intent reference embeddings
      await this.precomputeIntentEmbeddings();
      console.log('[LaBSE] Model initialized and intent embeddings cached');
    } catch (error) {
      console.error('[LaBSE] Failed to initialize model:', error.message);
      this.modelLoaded = false;
      this.semanticFallbackEnabled = false; // Disable fallback on error
      throw error;
    }
  }

  /**
   * Pre-compute embeddings for all intent reference phrases
   * Improves fallback lookup performance
   */
  async precomputeIntentEmbeddings() {
    if (!this.model) return;

    this.intentEmbeddings = {};
    
    try {
      for (const [intent, phrases] of Object.entries(this.intentReferences)) {
        const embeddings = [];
        
        for (const phrase of phrases) {
          const embedding = await this.getEmbedding(phrase);
          embeddings.push({
            phrase,
            embedding,
            normalized: this.normalizeEmbedding(embedding)
          });
        }
        
        this.intentEmbeddings[intent] = embeddings;
      }
      
      console.log('[LaBSE] Pre-computed embeddings for all intent categories');
    } catch (error) {
      console.error('[LaBSE] Error pre-computing intent embeddings:', error.message);
    }
  }

  /**
   * Get embedding for a text using LaBSE model
   */
  async getEmbedding(text) {
    const cacheKey = `embed_${text.toLowerCase().trim()}`;
    
    // Check cache first
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    try {
      // Use model to get embeddings
      const result = await this.model(text, {
        pooling: 'mean',
        normalize: true
      });

      // Extract embedding (result is tensor, convert to array)
      const embedding = Array.from(result.data);
      
      // Cache the result (with LRU eviction)
      if (this.embeddingCache.size >= this.maxCacheSize) {
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }
      this.embeddingCache.set(cacheKey, embedding);
      
      return embedding;
    } catch (error) {
      console.error('[LaBSE] Error getting embedding:', error.message);
      return null;
    }
  }

  /**
   * Normalize embedding vector for cosine similarity
   */
  normalizeEmbedding(embedding) {
    if (!embedding || !Array.isArray(embedding)) return null;

    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude === 0) return null;

    return embedding.map(val => val / magnitude);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
cosineSimilarity(embed1, embed2) {
    if (!embed1 || !embed2) return 0;

    let dotProduct = 0;
    for (let i = 0; i < embed1.length; i++) {
      dotProduct += embed1[i] * embed2[i];
    }

    return dotProduct;
  }

  /**
   * Find most semantically similar intent for a query
   * Returns best matching intent and confidence score
   */
  async classifyBySemantics(query) {
    // Check if semantic fallback is enabled
    if (!this.semanticFallbackEnabled) {
      return {
        intent: null,
        confidence: 0,
        method: 'semantic_disabled'
      };
    }

    if (!this.modelLoaded || !this.intentEmbeddings) {
      return {
        intent: null,
        confidence: 0,
        method: 'semantic_unavailable'
      };
    }

    try {
      // Get embedding for user query
      const queryEmbedding = await this.getEmbedding(query);
      if (!queryEmbedding) {
        return {
          intent: null,
          confidence: 0,
          method: 'semantic_error'
        };
      }

      const queryNormalized = this.normalizeEmbedding(queryEmbedding);
      if (!queryNormalized) {
        return {
          intent: null,
          confidence: 0,
          method: 'semantic_error'
        };
      }

      // Find best matching intent
      let bestIntent = null;
      let bestScore = -1;
      let topMatches = [];

      for (const [intent, embeddings] of Object.entries(this.intentEmbeddings)) {
        for (const ref of embeddings) {
          if (!ref.normalized) continue;

          const similarity = this.cosineSimilarity(queryNormalized, ref.normalized);
          
          if (similarity > bestScore) {
            bestScore = similarity;
            bestIntent = intent;
          }

          topMatches.push({ intent, phrase: ref.phrase, score: similarity });
        }
      }

      // Convert similarity score (0-1) to confidence percentage
      // LaBSE cosine similarity ranges from -1 to 1, but normalized embeddings are 0 to 1
      const confidence = Math.max(0, Math.min(100, Math.round(bestScore * 100)));

      // Sort and get top 3 matches for debugging
      topMatches.sort((a, b) => b.score - a.score);
      const topThree = topMatches.slice(0, 3).map(m => ({
        intent: m.intent,
        phrase: m.phrase,
        similarity: Math.round(m.score * 100) / 100
      }));

      return {
        intent: bestIntent,
        confidence: confidence,
        method: 'semantic',
        topMatches: topThree,
        queryEmbeddingSize: queryNormalized.length
      };
    } catch (error) {
      console.error('[LaBSE] Error in semantic classification:', error.message);
      return {
        intent: null,
        confidence: 0,
        method: 'semantic_error',
        error: error.message
      };
    }
  }

  /**
   * Clear embedding cache (useful for memory management)
   */
  clearCache() {
    this.embeddingCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.embeddingCache.size,
      maxSize: this.maxCacheSize,
      utilization: `${Math.round((this.embeddingCache.size / this.maxCacheSize) * 100)}%`,
      modelLoaded: this.modelLoaded,
      intentsIndexed: this.intentEmbeddings ? Object.keys(this.intentEmbeddings).length : 0
    };
  }
}

// Singleton instance
let labseInstance = null;

/**
 * Get or create singleton instance
 */
export async function getLaBSEInstance() {
  if (!labseInstance) {
    labseInstance = new LaBSEEmbeddings();
  }
  return labseInstance;
}

/**
 * Initialize LaBSE embeddings (explicit initialization)
 */
export async function initializeLaBSE() {
  const instance = await getLaBSEInstance();
  await instance.initialize();
  return instance;
}

export default LaBSEEmbeddings;
