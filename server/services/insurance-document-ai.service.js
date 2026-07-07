/**
 * Insurance Document-AI Extraction
 * ================================
 * Extracts structured claim fields (diagnosis, admission/discharge dates,
 * room category, itemized bill amounts) from an uploaded discharge summary
 * or bill, using Mediczy's LLM cascade (server/services/ai-brain/llm-provider.js).
 *
 * This is a data-entry aid for hospital insurance-desk staff, not a clinical
 * decision — per CLAUDE.md's SaMD table, "Documentation (with mandatory
 * physician/staff review)" is NOT SaMD, so this does not route through
 * ai-quality-gates.service.js/ai-interpretability.service.js. Extracted
 * fields are always returned for staff review and only applied to a claim
 * via an explicit POST /claims/:claimId/apply-extracted-fields call — never
 * written to the claim automatically.
 */

import llmProvider from './ai-brain/llm-provider.js';

// ─── Text extraction (mirrors report-analysis.service.js) ──────────────────

async function extractText(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      await parser.load();
      const result = await parser.getText();
      const text = result.text || '';
      await parser.destroy();
      if (text.trim().length > 10) {
        return { text, method: 'pdf-parse' };
      }
    } catch (pdfErr) {
      console.warn('[InsuranceDocumentAI] PDF parse failed, falling back:', pdfErr.message);
    }
    const text = buffer.toString('utf-8');
    if (text.trim().length > 10) return { text, method: 'text-fallback' };
  }

  if (mimeType?.startsWith('image/')) {
    return { text: null, base64: buffer.toString('base64'), mimeType, method: 'vision' };
  }

  return { text: buffer.toString('utf-8'), method: 'text-fallback' };
}

// ─── Prompts ────────────────────────────────────────────────────────────

const DISCHARGE_SUMMARY_PROMPT = `You are an insurance claims data-entry assistant. Extract structured fields from this hospital discharge summary for an insurance claim form.

RULES:
1. Only extract what is explicitly stated in the document — never infer or guess a value.
2. Use null for anything not found. Do not fabricate dates, names, or amounts.
3. Dates must be YYYY-MM-DD if found, else null.
4. This is for insurance paperwork, not clinical decision-making — do not add medical opinions.

Return ONLY valid JSON (no markdown fences):
{
  "patientName": "string or null",
  "diagnosis": "primary diagnosis as stated, or null",
  "icdCodes": ["any ICD-10 codes mentioned"],
  "admissionDate": "YYYY-MM-DD or null",
  "dischargeDate": "YYYY-MM-DD or null",
  "roomCategory": "ward/room type as stated, e.g. General/Semi-Private/Private/ICU, or null",
  "attendingDoctor": "string or null",
  "hospitalName": "string or null",
  "procedureName": "primary procedure/surgery performed, or null",
  "confidence": "0.0 to 1.0 — your confidence that the extracted values are accurate and clearly stated in the text (not a clinical confidence, a data-extraction one)"
}`;

const BILL_PROMPT = `You are an insurance claims data-entry assistant. Extract structured fields from this hospital bill for an insurance claim form.

RULES:
1. Only extract what is explicitly stated in the document — never infer or guess a value.
2. Use null/empty array for anything not found. Do not fabricate line items or totals.
3. Amounts must be plain numbers (no currency symbols or commas).
4. This is for insurance paperwork, not clinical decision-making.

Return ONLY valid JSON (no markdown fences):
{
  "hospitalName": "string or null",
  "billNumber": "string or null",
  "billDate": "YYYY-MM-DD or null",
  "lineItems": [ { "description": "string", "amount": 0.0 } ],
  "totalBillAmount": 0.0,
  "confidence": "0.0 to 1.0 — your confidence that the extracted values are accurate and clearly stated in the text (not a clinical confidence, a data-extraction one)"
}`;

function promptFor(documentType) {
  return documentType === 'bills' ? BILL_PROMPT : DISCHARGE_SUMMARY_PROMPT;
}

// ─── Response parsing ───────────────────────────────────────────────────

function parseExtraction(responseText, provider) {
  if (!responseText) throw new Error('Empty response from AI provider');

  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { extractionFailed: true, rawText: responseText.slice(0, 500), confidence: 0, provider };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    parsed.provider = provider;
    return parsed;
  } catch {
    return { extractionFailed: true, rawText: responseText.slice(0, 500), confidence: 0, provider };
  }
}

// ─── Core extraction function ───────────────────────────────────────────

/**
 * @param {Buffer} buffer - uploaded file contents
 * @param {string} mimeType
 * @param {'discharge_summary'|'bills'|string} documentType
 * @returns {object} extracted fields (shape depends on documentType), always
 *          includes `extractionMethod` and `confidence`.
 */
export async function extractClaimFields(buffer, mimeType, documentType) {
  const extracted = await extractText(buffer, mimeType);
  const prompt = promptFor(documentType);

  let result;
  try {
    if (extracted.method === 'vision') {
      const visionResult = await llmProvider.vision({
        base64Image: extracted.base64,
        mimeType: extracted.mimeType,
        prompt,
        maxTokens: 2000,
      });
      result = parseExtraction(visionResult.content, visionResult.provider);
    } else if (extracted.text && extracted.text.trim().length > 20) {
      const truncated = extracted.text.length > 12000
        ? extracted.text.slice(0, 12000) + '\n\n[... document truncated for extraction ...]'
        : extracted.text;
      const chatResult = await llmProvider.chat({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Here is the document text:\n\n${truncated}` },
        ],
        temperature: 0.1,
        maxTokens: 2000,
      });
      result = parseExtraction(chatResult.content, chatResult.provider);
    } else {
      return { extractionFailed: true, reason: 'No readable text or image content found in the file.', confidence: 0 };
    }
  } catch (err) {
    console.error('[InsuranceDocumentAI] Extraction error:', err.message);
    return { extractionFailed: true, reason: `AI extraction unavailable: ${err.message}`, confidence: 0 };
  }

  if (typeof result.confidence !== 'number' || Number.isNaN(result.confidence)) {
    // Heuristic fallback if the model didn't return a usable confidence:
    // fraction of extractable fields that came back non-null/non-empty.
    const { provider, extractionMethod, documentType: _dt, confidence: _c, ...fields } = result;
    const values = Object.values(fields);
    const populated = values.filter((v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)).length;
    result.confidence = values.length ? Math.round((populated / values.length) * 100) / 100 : 0;
  }

  result.extractionMethod = extracted.method;
  result.documentType = documentType;
  return result;
}

export default { extractClaimFields };
