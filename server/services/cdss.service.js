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
import llmProvider from './ai-brain/llm-provider.js';
import { connectPostgres } from '../db/postgres.js';

const SIB_BASE_URL = process.env.SIB_URL || 'http://localhost:8001';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

class CDSSService {
  constructor() {
    this.sibAvailable = false;
    this.lastHealthCheck = null;
    this.cimsService = cimsService;
  }

  /**
   * Robust JSON extraction from LLM responses
   * Handles: markdown fences, truncated JSON, array-type summary
   */
  extractJSON(text) {
    if (!text || typeof text !== 'string') return null;

    // 1. Strip markdown code fences: ```json ... ``` or ``` ... ```
    let cleaned = text.replace(/^\s*```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');

    // 2. Extract the outermost JSON object
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace === -1) return null;
    cleaned = cleaned.substring(firstBrace);

    // 3. Try parsing as-is first
    try {
      const parsed = JSON.parse(cleaned);
      return this.normalizeCDSSResponse(parsed);
    } catch (e) {
      // JSON is likely truncated
    }

    // 4. Repair truncated JSON by closing open brackets/braces
    let repaired = cleaned;
    // Remove trailing incomplete key-value (e.g., '"recommendation": "Monitor ris')
    repaired = repaired.replace(/,?\s*"[^"]*"\s*:\s*"[^"]*$/s, '');
    // Also handle truncated inside an array element
    repaired = repaired.replace(/,?\s*\{[^}]*$/s, '');

    // Count open/close brackets and braces
    let openBraces = 0, openBrackets = 0;
    let inString = false, escape = false;
    for (const ch of repaired) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') openBraces++;
      if (ch === '}') openBraces--;
      if (ch === '[') openBrackets++;
      if (ch === ']') openBrackets--;
    }

    // Close any open brackets then braces
    while (openBrackets > 0) { repaired += ']'; openBrackets--; }
    while (openBraces > 0) { repaired += '}'; openBraces--; }

    try {
      const parsed = JSON.parse(repaired);
      console.log('[CDSS] Repaired truncated JSON successfully');
      return this.normalizeCDSSResponse(parsed);
    } catch (e2) {
      console.warn('[CDSS] JSON repair failed, extracting fields manually');
    }

    // 5. Last resort: extract individual fields via regex
    return this.extractFieldsManually(cleaned);
  }

  /**
   * Normalize CDSS response: convert array summary to string, ensure all fields exist
   */
  normalizeCDSSResponse(parsed) {
    // Coerce a value to a string[] — handles LLM returning strings where arrays are expected
    const toArr = (v) => {
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
      if (typeof v === 'string' && v.trim()) return v.split(/[,;]\s*|\n/).map(s => s.trim()).filter(Boolean);
      return [];
    };

    // Convert summary from array to string if needed
    if (Array.isArray(parsed.summary)) {
      parsed.summary = parsed.summary.join(' ');
    }

    // Ensure all expected top-level fields exist
    const defaults = {
      summary: '', clinicalGuidelines: [], drugInfo: [], medicationAlternatives: [],
      differentialDiagnosis: [], labTests: [], drugInteractions: [],
      warnings: [], icd10Codes: [], references: []
    };
    const result = { ...defaults, ...parsed };

    // Deep-normalize nested array fields that the LLM may return as strings
    if (Array.isArray(result.drugInfo)) {
      result.drugInfo = result.drugInfo.map(drug => ({
        ...drug,
        indications: toArr(drug.indications),
        contraindications: toArr(drug.contraindications),
        sideEffects: toArr(drug.sideEffects),
        interactions: toArr(drug.interactions),
      }));
    }

    if (Array.isArray(result.differentialDiagnosis)) {
      result.differentialDiagnosis = result.differentialDiagnosis.map(diff => ({
        ...diff,
        keyFeatures: toArr(diff.keyFeatures),
        rulingOutTests: toArr(diff.rulingOutTests),
      }));
    }

    if (Array.isArray(result.clinicalGuidelines)) {
      result.clinicalGuidelines = result.clinicalGuidelines.map(g => ({
        ...g,
        keyPoints: toArr(g.keyPoints),
      }));
    }

    if (!Array.isArray(result.warnings)) result.warnings = toArr(result.warnings);
    // Normalize each warning to {type, message, action} — LLM often returns plain strings
    const VALID_TYPES = new Set(['critical', 'warning', 'info']);
    result.warnings = result.warnings.map(w => {
      if (typeof w === 'string') return { type: 'warning', message: w };
      if (w && typeof w === 'object') {
        return {
          type: VALID_TYPES.has(w.type) ? w.type : 'warning',
          message: w.message || String(w),
          ...(w.action ? { action: w.action } : {}),
        };
      }
      return { type: 'warning', message: String(w) };
    });

    return result;
  }

  /**
   * Extract individual JSON fields from partially valid JSON text
   */
  extractFieldsManually(text) {
    const result = {
      summary: '', clinicalGuidelines: [], drugInfo: [], medicationAlternatives: [],
      differentialDiagnosis: [], labTests: [], drugInteractions: [],
      warnings: [], icd10Codes: [], references: []
    };

    // Try to extract each array field
    for (const field of Object.keys(result)) {
      if (field === 'summary') {
        // Extract summary string or array
        const sumMatch = text.match(/"summary"\s*:\s*(\[[^\]]*\]|"[^"]*")/s);
        if (sumMatch) {
          try {
            const val = JSON.parse(sumMatch[1]);
            result.summary = Array.isArray(val) ? val.join(' ') : val;
          } catch (e) { /* skip */ }
        }
        continue;
      }
      // Extract array fields
      const regex = new RegExp(`"${field}"\\s*:\\s*\\[`, 's');
      const match = regex.exec(text);
      if (match) {
        const startIdx = match.index + match[0].length - 1;
        let depth = 0;
        let endIdx = startIdx;
        let inStr = false, esc = false;
        for (let i = startIdx; i < text.length; i++) {
          const c = text[i];
          if (esc) { esc = false; continue; }
          if (c === '\\') { esc = true; continue; }
          if (c === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (c === '[') depth++;
          if (c === ']') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
        }
        if (endIdx > startIdx) {
          try {
            result[field] = JSON.parse(text.substring(startIdx, endIdx));
          } catch (e) { /* skip */ }
        }
      }
    }

    return result;
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
  buildCDSSPrompt(category, specialty, audience = 'clinician') {
    const audienceLine = audience === 'clinician'
      ? 'Audience: licensed clinicians in India. Provide evidence-based clinical decision support.'
      : 'Audience: patients. Keep language simple and non-prescriptive.';
    return `CDSS for Indian doctors. ${audienceLine} Specialty: ${specialty || 'General'}. Task: ${category || 'diagnosis'}.
Return ONLY raw JSON (no markdown, no \`\`\`, no explanation). Keep values short.
{"summary":"2-3 sentences","clinicalGuidelines":[{"title":"","source":"NICE/WHO/AHA","recommendation":"","evidenceLevel":""}],"drugInfo":[{"name":"","genericName":"","drugClass":"","dosage":"","contraindications":"","sideEffects":""}],"differentialDiagnosis":[{"condition":"","probability":"High/Moderate/Low","keyFeatures":""}],"labTests":[{"name":"","purpose":"","normalRange":""}],"warnings":[{"type":"critical/warning/info","message":""}],"icd10Codes":[{"code":"","description":""}]}
Be concise. Max 2 guidelines, 3 drugs, 3 DDx, 3 labs, 3 ICD-10. Indian context. Output ONLY the JSON object.`;
  }

  /**
   * Query CDSS through SIB. SIB owns iSHA.buzz/isha-inc routing.
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
          patient_id: `cdss_${Date.now()}`,
          patient_data: {
            channel: 'doctor_app',
            audience: 'clinician',
            callerRole: 'doctor',
          },
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`SIB returned ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.answer || data.chat_answer || data.response || data.message || '';
      
      // Try to parse JSON from response (handles markdown fences + truncation)
      const parsed = this.extractJSON(responseText);
      if (parsed && (parsed.summary || parsed.clinicalGuidelines?.length > 0 || parsed.drugInfo?.length > 0)) {
        return {
          success: true,
          data: parsed,
          provider: 'sib-llama',
          model: 'Llama-3.1-8B-Instruct'
        };
      }

      console.warn('[CDSS] SIB returned unstructured data; falling back to Groq');
      throw new Error('SIB returned unstructured CDSS response');
    } catch (error) {
      console.error('[CDSS] SIB error:', error.message);
      throw error;
    }
  }

  /**
   * Final fallback through llmProvider. Default order is SIB, then Groq if SIB fails.
   */
  async queryWithGroq(query, category, specialty, knowledgeContext = '') {
    try {
      const systemPrompt = this.buildCDSSPrompt(category, specialty);
      
      let fullQuery = query;
      if (knowledgeContext) {
        fullQuery = `${query}\n\n=== KNOWLEDGE BASE CONTEXT ===\n${knowledgeContext}`;
      }

      const result = await llmProvider.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fullQuery }
        ],
        temperature: 0.3,
        maxTokens: 1500,
        responseFormat: { type: 'json_object' },
        skipCache: true,
      });

      const responseText = result.content || '';
      
      try {
        const parsed = JSON.parse(responseText);
        return {
          success: true,
          data: parsed,
          provider: result.provider,
          model: result.model
        };
      } catch (parseError) {
        return {
          success: true,
          data: { summary: responseText, clinicalGuidelines: [], drugInfo: [], differentialDiagnosis: [], labTests: [], warnings: [], icd10Codes: [], references: [] },
          provider: result.provider,
          model: result.model,
          raw: true
        };
      }
    } catch (error) {
      console.error('[CDSS] LLM cascade error:', error.message);
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

      // Enrich with validated ICD-10 and SNOMED codes
      if (sibResult.data) {
        sibResult.data = await this.enrichWithMedicalCodes(sibResult.data, query);
      }
      
      return sibResult;
    } catch (sibError) {
      console.warn('[CDSS] SIB failed, trying final Groq fallback:', sibError.message);
    }

    // Step 3: Try Groq (Fallback 1)
    try {
      const groqResult = await this.queryWithGroq(query, category, specialty, knowledgeContext);
      console.log(`[CDSS] Response from ${groqResult.provider}`);
      
      // Enrich with CIMS data if drug info is present
      if (searchCIMS && groqResult.data && groqResult.data.drugInfo) {
        try {
          console.log('[CDSS] Enriching AI response with CIMS medicine data...');
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

      // Enrich with validated ICD-10 and SNOMED codes
      if (groqResult.data) {
        groqResult.data = await this.enrichWithMedicalCodes(groqResult.data, query);
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
   * Validate and enrich ICD-10 codes from LLM with real database codes,
   * and add matching SNOMED CT codes
   */
  async enrichWithMedicalCodes(data, queryText) {
    try {
      const pool = await connectPostgres();
      
      // Validate AI-generated ICD-10 codes against real DB
      if (data.icd10Codes && data.icd10Codes.length > 0) {
        const validatedCodes = [];
        for (const aiCode of data.icd10Codes) {
          const code = (aiCode.code || '').replace(/\./g, '');
          if (!code) continue;
          const found = await pool.query(
            'SELECT code, description, category FROM icd10_codes WHERE code = $1 LIMIT 1',
            [code]
          );
          if (found.rows.length > 0) {
            validatedCodes.push({ ...found.rows[0], validated: true });
          } else {
            // Try fuzzy match by description
            const fuzzy = await pool.query(
              `SELECT code, description, category FROM icd10_codes
               WHERE description ILIKE $1 LIMIT 3`,
              [`%${aiCode.description || ''}%`]
            );
            if (fuzzy.rows.length > 0) {
              validatedCodes.push({ ...fuzzy.rows[0], validated: true, aiSuggested: aiCode.code });
            } else {
              validatedCodes.push({ ...aiCode, validated: false });
            }
          }
        }
        data.icd10Codes = validatedCodes;
      }

      // Search for relevant ICD-10 codes based on the query
      if (!data.icd10Codes || data.icd10Codes.length === 0) {
        const searchTerms = queryText.substring(0, 100);
        const icdResults = await pool.query(
          `SELECT code, description, category FROM icd10_codes
           WHERE search_vector @@ plainto_tsquery('english', $1)
           ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
           LIMIT 5`,
          [searchTerms]
        );
        if (icdResults.rows.length > 0) {
          data.icd10Codes = icdResults.rows.map(r => ({ ...r, validated: true }));
        }
      }

      // Add matching SNOMED CT codes based on diagnoses
      const snomedCodes = [];
      const searchTerms = [
        queryText.substring(0, 60),
        ...(data.differentialDiagnosis || []).slice(0, 3).map(d => d.condition || '')
      ].filter(Boolean);

      for (const term of searchTerms) {
        const snomed = await pool.query(
          `SELECT code, description, value_set_name, clinical_focus FROM snomed_codes
           WHERE search_vector @@ plainto_tsquery('english', $1)
           ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
           LIMIT 3`,
          [term]
        );
        for (const row of snomed.rows) {
          if (!snomedCodes.find(s => s.code === row.code)) {
            snomedCodes.push(row);
          }
        }
      }
      if (snomedCodes.length > 0) {
        data.snomedCodes = snomedCodes.slice(0, 10);
      }
    } catch (error) {
      console.warn('[CDSS] Medical code enrichment failed:', error.message);
    }
    return data;
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
