/**
 * AI Insurance Bot Service
 * =========================
 * Connects to OpenInsurance-LLaMA3-8B model running on GPU server
 * at ai.isha.buzz:8083 for insurance-related queries.
 * 
 * Capabilities:
 *   - Policy coverage verification
 *   - Pre-authorization assistance
 *   - Claims submission guidance
 *   - Insurance terms explanation
 *   - Coverage gap analysis
 *   - Cashless hospital network lookup
 * 
 * Falls back to general LLM cascade if GPU model is unavailable.
 */

import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';

const INSURANCE_GPU_URL = 'https://ai.isha.buzz/v1/chat/completions';
const INSURANCE_MODEL = 'open-insurance-llama3';
const INSURANCE_PORT = 8083;
const REQUEST_TIMEOUT = 30000;

class InsuranceBotService {
  constructor() {
    this.isAvailable = null; // null = not checked yet
    this.lastHealthCheck = 0;
  }

  /**
   * Check if the insurance GPU model is online
   */
  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${INSURANCE_GPU_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: INSURANCE_MODEL,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
          agent_type: 'Insurance',
          model_port: INSURANCE_PORT
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);
      this.isAvailable = response.ok;
      this.lastHealthCheck = Date.now();
      return this.isAvailable;
    } catch {
      this.isAvailable = false;
      this.lastHealthCheck = Date.now();
      return false;
    }
  }

  /**
   * Query the insurance AI model
   * @param {Object} params
   * @param {string} params.query - Insurance-related question
   * @param {number} [params.userId] - User ID for context loading
   * @param {string} [params.insuranceType] - 'health', 'life', 'dental', etc.
   * @param {Object} [params.claimDetails] - Details for claims assistance
   * @returns {Object} { response, source, latencyMs }
   */
  async query({ query, userId = null, insuranceType = 'health', claimDetails = null }) {
    const startTime = Date.now();

    // Load patient insurance info if available
    let patientInsurance = null;
    if (userId) {
      try {
        const db = pool;
        const { rows } = await db.query(`
          SELECT p."primaryInsuranceId", p."secondaryInsuranceId", p."chronicConditions"
          FROM patients p
          WHERE p."userId" = $1
          LIMIT 1
        `, [userId]);
        if (rows.length > 0) patientInsurance = rows[0];
      } catch { /* continue without patient context */ }
    }

    // Build system prompt for insurance context
    const systemPrompt = `You are an expert AI insurance advisor for an Indian healthcare platform (Mediczy). You provide guidance on:
- Health insurance policy coverage and benefits
- Pre-authorization and cashless claims processes
- Insurance claim submission procedures
- Coverage verification for treatments and procedures
- Network hospital information
- Policy terms explanation in simple language
- IRDAI regulations and patient rights

Important: Always advise users to verify with their insurance provider for final decisions. You provide guidance, not binding insurance decisions.
${patientInsurance ? `\nPatient has insurance IDs: Primary=${patientInsurance.primaryInsuranceId || 'none'}, Secondary=${patientInsurance.secondaryInsuranceId || 'none'}` : ''}
${claimDetails ? `\nClaim context: ${JSON.stringify(claimDetails)}` : ''}

Respond in a helpful, clear manner. Use bullet points for step-by-step processes.`;

    // Try GPU insurance model first
    const shouldCheckHealth = !this.lastHealthCheck || (Date.now() - this.lastHealthCheck > 300000); // 5 min cache
    if (shouldCheckHealth) {
      await this.checkHealth();
    }

    let response = null;
    let source = 'unknown';

    if (this.isAvailable) {
      try {
        response = await this.queryGPU(systemPrompt, query);
        source = `gpu-${INSURANCE_MODEL}`;
      } catch (err) {
        console.error('[InsuranceBot] GPU model error:', err.message);
        this.isAvailable = false;
      }
    }

    // Fallback to general LLM cascade
    if (!response) {
      try {
        const result = await llmProvider.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          tools: null,
          conversationId: `insurance-${userId || 'anon'}-${Date.now()}`
        });
        response = result.content;
        source = `cascade-${result.provider}`;
      } catch (err) {
        console.error('[InsuranceBot] LLM cascade error:', err.message);
        response = 'I apologize, but I\'m unable to process your insurance query at the moment. Please try again or contact our support team.';
        source = 'fallback';
      }
    }

    const latencyMs = Date.now() - startTime;
    console.log(`[InsuranceBot] Query processed via ${source} in ${latencyMs}ms`);

    return {
      response,
      source,
      latencyMs,
      insuranceType,
      modelAvailable: this.isAvailable
    };
  }

  /**
   * Direct GPU model query via OpenInsurance-LLaMA3
   */
  async queryGPU(systemPrompt, userQuery) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(INSURANCE_GPU_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: INSURANCE_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userQuery }
          ],
          max_tokens: 1024,
          temperature: 0.3,
          agent_type: 'Insurance',
          model_port: INSURANCE_PORT
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`GPU returned ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Pre-authorization check helper
   */
  async checkPreAuth({ procedureName, diagnosisCode, insuranceProvider, policyNumber, userId }) {
    const query = `I need to check pre-authorization for the following:
- Procedure: ${procedureName}
- Diagnosis Code: ${diagnosisCode || 'Not specified'}
- Insurance Provider: ${insuranceProvider || 'Not specified'}
- Policy Number: ${policyNumber || 'Not specified'}

Please guide me through the pre-authorization process and typical requirements.`;

    return this.query({ query, userId, insuranceType: 'health', claimDetails: { procedureName, diagnosisCode } });
  }

  /**
   * Coverage verification helper
   */
  async verifyCoverage({ treatmentType, estimatedCost, insuranceProvider, userId }) {
    const query = `Please verify insurance coverage for:
- Treatment: ${treatmentType}
- Estimated Cost: ₹${estimatedCost || 'unknown'}
- Insurance Provider: ${insuranceProvider || 'Not specified'}

Is this treatment typically covered? What documentation is needed?`;

    return this.query({ query, userId, insuranceType: 'health' });
  }
}

const insuranceBotService = new InsuranceBotService();
export default insuranceBotService;
