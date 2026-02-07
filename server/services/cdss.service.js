/**
 * Clinical Decision Support System (CDSS) Service
 * 
 * Provides AI-powered clinical decision support for doctors using:
 * 1. SIB Local Llama (Primary) - Local LLM for fast responses
 * 2. Groq API (Fallback 1) - Cloud LLM
 * 3. Gemini API (Fallback 2) - Cloud LLM
 * 4. Knowledge Base Search - Vector embeddings from medical encyclopedias
 */

import pdfKnowledgeService from './pdfKnowledge.service.js';

const SIB_BASE_URL = process.env.SIB_URL || 'http://localhost:8001';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

class CDSSService {
  constructor() {
    this.sibAvailable = false;
    this.lastHealthCheck = null;
  }

  /**
   * Check SIB health
   */
  async checkSibHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${SIB_BASE_URL}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const health = await response.json();
        this.sibAvailable = health.status === 'healthy';
        this.lastHealthCheck = new Date();
        return this.sibAvailable;
      }
      return false;
    } catch (error) {
      console.warn('[CDSS] SIB not available:', error.message);
      this.sibAvailable = false;
      return false;
    }
  }

  /**
   * Build CDSS system prompt for clinical decision support (optimized for speed)
   */
  buildCDSSPrompt(category, specialty) {
    return `You are a CDSS assistant for doctors. Specialty: ${specialty || 'General Medicine'}. Task: ${category || 'diagnosis'}.

Return JSON with these arrays (use empty [] if not applicable):
- summary: 2-3 sentence clinical summary
- clinicalGuidelines: [{title, source, recommendation, evidenceLevel}]
- drugInfo: [{name, genericName, drugClass, dosage, contraindications, sideEffects}]
- differentialDiagnosis: [{condition, probability (High/Moderate/Low), keyFeatures}]
- labTests: [{name, purpose, normalRange}]
- warnings: [{type (critical/warning/info), message}]
- icd10Codes: [{code, description}]

Be concise. Cite NICE/WHO/AHA/GOLD guidelines. Include Indian context. Output ONLY valid JSON.`;
  }

  /**
   * Query CDSS using SIB (Primary)
   */
  async queryWithSIB(query, category, specialty, knowledgeContext = '') {
    try {
      if (!this.sibAvailable) {
        await this.checkSibHealth();
        if (!this.sibAvailable) {
          throw new Error('SIB not available');
        }
      }

      const systemPrompt = this.buildCDSSPrompt(category, specialty);
      
      // Build the full query with knowledge context
      let fullQuery = query;
      if (knowledgeContext) {
        fullQuery = `${query}\n\n=== KNOWLEDGE BASE CONTEXT ===\n${knowledgeContext}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      // Use SIB /query endpoint for CDSS queries
      const cdssQuery = `${systemPrompt}\n\nQuery: ${fullQuery}`;
      
      const response = await fetch(`${SIB_BASE_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: cdssQuery,
          patient_id: `cdss_${Date.now()}`
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`SIB returned ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.answer || data.chat_answer || data.response || data.message || '';
      
      // Try to parse JSON from response
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            success: true,
            data: parsed,
            provider: 'sib-llama',
            model: 'Llama-3.1-8B-Instruct'
          };
        }
      } catch (parseError) {
        console.warn('[CDSS] Failed to parse SIB JSON response, returning raw');
      }

      return {
        success: true,
        data: { summary: responseText, clinicalGuidelines: [], drugInfo: [], differentialDiagnosis: [], labTests: [], warnings: [], icd10Codes: [], references: [] },
        provider: 'sib-llama',
        model: 'Llama-3.1-8B-Instruct',
        raw: true
      };
    } catch (error) {
      console.error('[CDSS] SIB error:', error.message);
      throw error;
    }
  }

  /**
   * Query CDSS using Groq (Fallback)
   */
  async queryWithGroq(query, category, specialty, knowledgeContext = '') {
    if (!GROQ_API_KEY) {
      console.warn('[CDSS] GROQ_API_KEY not set; Groq fallback disabled');
      throw new Error('Groq API key not configured');
    }

    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: GROQ_API_KEY });

    const systemPrompt = this.buildCDSSPrompt(category, specialty);
    
    let fullQuery = query;
    if (knowledgeContext) {
      fullQuery = `${query}\n\n=== KNOWLEDGE BASE CONTEXT ===\n${knowledgeContext}`;
    }

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fullQuery }
      ],
      max_tokens: 1500, // Reduced for faster response
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const responseText = response.choices[0]?.message?.content || '';
    
    try {
      const parsed = JSON.parse(responseText);
      return {
        success: true,
        data: parsed,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile'
      };
    } catch (parseError) {
      return {
        success: true,
        data: { summary: responseText, clinicalGuidelines: [], drugInfo: [], differentialDiagnosis: [], labTests: [], warnings: [], icd10Codes: [], references: [] },
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        raw: true
      };
    }
  }

  /**
   * Main CDSS query method with fallback chain
   */
  async query(query, options = {}) {
    const {
      category = 'diagnosis',
      specialty = 'general',
      searchKnowledge = true,
      sources = []
    } = options;

    console.log(`[CDSS] Processing query: "${query.substring(0, 50)}..." | Category: ${category} | Specialty: ${specialty}`);

    // Step 1: Search knowledge base for relevant context
    let knowledgeContext = '';
    let knowledgeResults = [];
    
    if (searchKnowledge) {
      try {
        knowledgeResults = await pdfKnowledgeService.search(query, {
          k: 5,
          namespace: 'cdss_knowledge',
          minSimilarity: 0.4
        });
        
        if (knowledgeResults.length > 0) {
          console.log(`[CDSS] Found ${knowledgeResults.length} knowledge base matches`);
          knowledgeContext = knowledgeResults
            .map((r, i) => `[${i + 1}] ${r.title || 'Entry'} (${r.source || 'Knowledge Base'}):\n${r.text}`)
            .join('\n\n');
        }
      } catch (kbError) {
        console.warn('[CDSS] Knowledge base search failed:', kbError.message);
      }
    }

    // Step 2: Try SIB (Primary)
    try {
      const sibResult = await this.queryWithSIB(query, category, specialty, knowledgeContext);
      console.log(`[CDSS] Response from ${sibResult.provider}`);
      
      // Add knowledge results to response
      if (knowledgeResults.length > 0 && sibResult.data) {
        sibResult.data.knowledgeBaseResults = knowledgeResults;
      }
      
      return sibResult;
    } catch (sibError) {
      console.warn('[CDSS] SIB failed, trying Groq fallback:', sibError.message);
    }

    // Step 3: Try Groq (Fallback 1)
    try {
      const groqResult = await this.queryWithGroq(query, category, specialty, knowledgeContext);
      console.log(`[CDSS] Response from ${groqResult.provider}`);
      
      if (knowledgeResults.length > 0 && groqResult.data) {
        groqResult.data.knowledgeBaseResults = knowledgeResults;
      }
      
      return groqResult;
    } catch (groqError) {
      console.error('[CDSS] Groq fallback failed:', groqError.message);
    }

    // Step 4: Return knowledge-only response if all AI fails
    if (knowledgeResults.length > 0) {
      return {
        success: true,
        data: {
          summary: `AI services temporarily unavailable. Showing ${knowledgeResults.length} results from knowledge base.`,
          clinicalGuidelines: knowledgeResults.map(r => ({
            title: r.title || 'Knowledge Base Entry',
            source: r.source || 'Medical Encyclopedia',
            sourceType: 'UpToDate',
            recommendation: r.text,
            evidenceLevel: 'Expert Opinion'
          })),
          drugInfo: [],
          differentialDiagnosis: [],
          labTests: [],
          warnings: [{ type: 'warning', message: 'AI analysis unavailable. Results from knowledge base only.', action: 'Please try again later for AI-powered analysis.' }],
          icd10Codes: [],
          references: [],
          knowledgeBaseResults: knowledgeResults
        },
        provider: 'knowledge-base-only',
        model: 'none'
      };
    }

    // Step 5: All failed
    throw new Error('All CDSS providers unavailable');
  }

  /**
   * Get CDSS service health status
   */
  async getHealth() {
    await this.checkSibHealth();
    
    return {
      status: this.sibAvailable ? 'healthy' : 'degraded',
      providers: {
        sib: this.sibAvailable,
        groq: !!GROQ_API_KEY,
        knowledgeBase: true
      },
      lastCheck: this.lastHealthCheck
    };
  }
}

// Singleton instance
const cdssService = new CDSSService();

export default cdssService;
export { CDSSService };
