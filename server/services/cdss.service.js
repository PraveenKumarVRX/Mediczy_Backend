/**
 * Clinical Decision Support System (CDSS) Service
 * 
 * Provides AI-powered clinical decision support for doctors using:
 * 1. SIB Local Llama (Primary) - Local LLM for fast responses
 * 2. Groq API (Fallback 1) - Cloud LLM
 * 3. Gemini API (Fallback 2) - Cloud LLM
 * 4. Knowledge Base Search - Vector embeddings from medical encyclopedias
 * 5. CIMS Database - Drug information, interactions, alternatives
 */

import pdfKnowledgeService from './pdfKnowledge.service.js';
import cimsService from './cims-medicine.service.js';

const SIB_BASE_URL = process.env.SIB_URL || 'http://localhost:8001';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

class CDSSService {
  constructor() {
    this.sibAvailable = false;
    this.lastHealthCheck = null;
    this.cimsService = cimsService;
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
   * Enrich drug info with CIMS data (alternatives, pricing, availability)
   */
  async enrichDrugInfoWithCIMS(drugInfoArray = []) {
    if (!drugInfoArray || drugInfoArray.length === 0) {
      return [];
    }

    try {
      const enriched = await Promise.all(
        drugInfoArray.map(async (drug) => {
          try {
            // Search for medicines with this generic name in CIMS
            const cimsMeds = this.cimsService.searchByGenericName(drug.genericName || drug.name, {
              limit: 3
            });

            if (cimsMeds.data && cimsMeds.data.length > 0) {
              return {
                ...drug,
                cimsAvailable: true,
                alternatives: cimsMeds.data.map(med => ({
                  brandName: med.brandName,
                  manufacturer: med.manufacturer,
                  strength: med.strength,
                  form: med.form,
                  mrp: med.mrp,
                  schedule: med.schedule,
                  availability: 'CIMS Database'
                }))
              };
            }
          } catch (cimError) {
            console.warn('[CDSS] CIMS enrichment error for', drug.genericName, cimError.message);
          }

          return drug;
        })
      );

      return enriched;
    } catch (error) {
      console.error('[CDSS] Error enriching drug info with CIMS:', error.message);
      return drugInfoArray;
    }
  }

  /**
   * Get medication alternatives from CIMS for a given generic drug
   */
  async getMedicationAlternatives(genericName, limit = 5) {
    try {
      if (!genericName) return [];

      const results = this.cimsService.searchByGenericName(genericName, { limit });

      if (!results.data || results.data.length === 0) return [];

      return results.data.map(med => ({
        id: med.id,
        genericName: med.genericName,
        brandName: med.brandName,
        strength: med.strength,
        form: med.form,
        manufacturer: med.manufacturer,
        mrp: med.mrp,
        schedule: med.schedule,
        subCategory: med.subCategory,
        inCIMS: true
      }));
    } catch (error) {
      console.error('[CDSS] Error getting medication alternatives:', error.message);
      return [];
    }
  }

  /**
   * Check for potential drug interactions using CIMS data
   */
  async checkDrugInteractions(medications = []) {
    try {
      if (!medications || medications.length < 2) {
        return { hasInteractions: false, interactions: [], checked: 0 };
      }

      const interactions = [];
      const cimsData = [];

      // Get CIMS data for each medication
      for (const med of medications) {
        try {
          const genericName = med.genericName || med.name || '';
          const results = this.cimsService.searchByGenericName(genericName, { limit: 1 });

          if (results.data && results.data.length > 0) {
            cimsData.push({
              name: med.name || genericName,
              genericName: genericName,
              cimsMedicine: results.data[0],
              contraindications: results.data[0].contraindication || '',
              interactions: results.data[0].interactions || []
            });
          }
        } catch (e) {
          console.warn('[CDSS] Could not fetch CIMS data for:', med.name);
        }
      }

      // Check for interaction patterns
      for (let i = 0; i < cimsData.length; i++) {
        for (let j = i + 1; j < cimsData.length; j++) {
          const med1 = cimsData[i];
          const med2 = cimsData[j];

          // Check contraindication lists
          if (med1.contraindications && med2.contraindications) {
            const contra1Lower = med1.contraindications.toLowerCase();
            const contra2Lower = med2.contraindications.toLowerCase();

            if (
              contra1Lower.includes(med2.genericName.toLowerCase()) ||
              contra2Lower.includes(med1.genericName.toLowerCase())
            ) {
              interactions.push({
                drug1: med1.name,
                drug2: med2.name,
                severity: 'moderate',
                type: 'contraindication',
                description: `Check compatibility between ${med1.name} and ${med2.name}`,
                source: 'CIMS Database',
                recommendation: 'Verify dosing schedule and monitor patient response'
              });
            }
          }
        }
      }

      return {
        hasInteractions: interactions.length > 0,
        interactions,
        medicationsChecked: cimsData.length,
        source: 'CIMS Database'
      };
    } catch (error) {
      console.error('[CDSS] Error checking drug interactions:', error.message);
      return { hasInteractions: false, interactions: [], error: error.message };
    }
  }

  /**
   * Build CDSS system prompt for clinical decision support (optimized for speed)
   */
  buildCDSSPrompt(category, specialty) {
    return `You are a CDSS assistant for doctors in India. Specialty: ${specialty || 'General Medicine'}. Task: ${category || 'diagnosis'}.

Return JSON with these arrays (use empty [] if not applicable):
- summary: 2-3 sentence clinical summary
- clinicalGuidelines: [{title, source, recommendation, evidenceLevel}]
- drugInfo: [{name, genericName, drugClass, dosage, contraindications, sideEffects, cimsAvailable (boolean)}]
- medicationAlternatives: [{brandName, manufacturer, strength, schedule, mrp, source}]
- differentialDiagnosis: [{condition, probability (High/Moderate/Low), keyFeatures}]
- labTests: [{name, purpose, normalRange}]
- drugInteractions: [{drug1, drug2, severity, description, recommendation}]
- warnings: [{type (critical/warning/info), message}]
- icd10Codes: [{code, description}]

Be concise. Cite NICE/WHO/AHA/GOLD guidelines. Include Indian context, CIMS medicine availability, and pricing when relevant. Output ONLY valid JSON.`;
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
          question: cdssQuery,
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

    try {
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
    } catch (error) {
      // Provide detailed error information for debugging
      if (error.status === 401 || error.code === 'invalid_request_error') {
        console.error('[CDSS] Groq authentication failed - API key may be invalid or expired');
        console.error('[CDSS] Groq error details:', {
          status: error.status,
          message: error.message,
          code: error.code,
          hasKey: !!GROQ_API_KEY,
          keyFormat: GROQ_API_KEY ? GROQ_API_KEY.substring(0, 4) + '...' : 'none'
        });
      } else {
        console.error('[CDSS] Groq error:', error.message);
      }
      throw error;
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
      sources = [],
      searchCIMS = true
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
      
      // Enrich with CIMS data if drug info is present
      if (searchCIMS && sibResult.data && sibResult.data.drugInfo) {
        try {
          console.log('[CDSS] Enriching response with CIMS medicine data...');
          sibResult.data.drugInfo = await this.enrichDrugInfoWithCIMS(sibResult.data.drugInfo);
          
          // Also get alternatives for recommended drugs
          const alternatives = [];
          for (const drug of sibResult.data.drugInfo || []) {
            try {
              const alts = await this.getMedicationAlternatives(drug.genericName || drug.name, 3);
              if (alts.length > 0) {
                alternatives.push({
                  genericName: drug.genericName || drug.name,
                  alternatives: alts
                });
              }
            } catch (e) {
              // Skip if error
            }
          }
          
          if (alternatives.length > 0) {
            sibResult.data.medicationAlternatives = alternatives;
          }
          
          // Check for drug interactions if multiple drugs listed
          if (sibResult.data.drugInfo && sibResult.data.drugInfo.length > 1) {
            try {
              const interactions = await this.checkDrugInteractions(sibResult.data.drugInfo);
              if (interactions.hasInteractions) {
                sibResult.data.drugInteractions = interactions.interactions;
              }
            } catch (e) {
              console.warn('[CDSS] Drug interaction check failed:', e.message);
            }
          }
        } catch (cimsError) {
          console.warn('[CDSS] CIMS enrichment failed:', cimsError.message);
        }
      }
      
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
      
      // Enrich with CIMS data if drug info is present
      if (searchCIMS && groqResult.data && groqResult.data.drugInfo) {
        try {
          console.log('[CDSS] Enriching Groq response with CIMS medicine data...');
          groqResult.data.drugInfo = await this.enrichDrugInfoWithCIMS(groqResult.data.drugInfo);
          
          // Get alternatives
          const alternatives = [];
          for (const drug of groqResult.data.drugInfo || []) {
            try {
              const alts = await this.getMedicationAlternatives(drug.genericName || drug.name, 3);
              if (alts.length > 0) {
                alternatives.push({
                  genericName: drug.genericName || drug.name,
                  alternatives: alts
                });
              }
            } catch (e) {
              // Skip if error
            }
          }
          
          if (alternatives.length > 0) {
            groqResult.data.medicationAlternatives = alternatives;
          }
        } catch (cimsError) {
          console.warn('[CDSS] CIMS enrichment failed:', cimsError.message);
        }
      }
      
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
          medicationAlternatives: [],
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
