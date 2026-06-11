/**
 * Feedback Severity Classifier
 * ============================
 * Classifies any free-text complaint / ticket description into one of four
 * severity tiers:
 *
 *   S0  Safety-Critical  — direct patient safety risk; 15-min response SLA
 *   S1  Clinical Quality — AI diagnostic/clinical quality issue; 1-h SLA
 *   S2  Functional Bug   — feature broken but no patient harm; 4-h SLA
 *   S3  UX Friction      — minor usability complaint; 24-h SLA
 *
 * Two-stage pipeline:
 *   1. Synchronous keyword pre-filter — catches obvious S0/S1 with zero LLM cost.
 *   2. LLM fallback (JSON mode, reflex tier) — for all other cases.
 *
 * Output schema:
 *   { severity, confidence, ai_component, feedback_type,
 *     evidence_quote, recommended_action }
 */

import llmProvider from './ai-brain/llm-provider.js';
import { getClassifierCache, setClassifierCache } from '../utils/quality-cache.js';
import { preprocessForClassification } from '../utils/multilingual-classifier.js';

// ─── PHI masking (lightweight; LLM sees anonymised text) ─────────────────────

const PHI_PATTERNS = [
  { re: /\b\d{10}\b/g,                         mask: '[PHONE]'  },
  { re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, mask: '[EMAIL]' },
  { re: /\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, mask: '[CARD]' },
  { re: /\bAadhaar\s*\d{4,12}\b/gi,             mask: '[AADHAAR]' },
  { re: /\bPAN\s*[A-Z]{5}\d{4}[A-Z]\b/gi,       mask: '[PAN]' },
  { re: /\bDr\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, mask: '[DOCTOR_NAME]' },
];

function maskPHI(text) {
  let out = text;
  for (const { re, mask } of PHI_PATTERNS) out = out.replace(re, mask);
  return out;
}

// ─── Keyword pre-filters ──────────────────────────────────────────────────────

const S0_KEYWORDS = [
  /wrong\s+medic(ation|ine)/i,
  /wrong\s+dos(e|age)/i,
  /over\s*dose|overdos/i,
  /allerg(y|ic)\s+react/i,
  /adverse\s+react/i,
  /patient\s+(died|death|dead)/i,
  /\b(died|death)\b/i,
  /life[\s-]threatening/i,
  /medical\s+error/i,
  /dangerous\s+(drug|dosage|medic)/i,
  /incorrect\s+diagnosis.*harm/i,
  /missed.*diagnosis.*critical/i,
  /anaphyla/i,
  /cardiac\s+arrest/i,
  /patient\s+harm/i,
  /fatal\s+error/i,
  /wrong\s+patient/i,
  /wrong\s+surgery/i,
];

const S1_KEYWORDS = [
  /wrong\s+diagnosis/i,
  /misdiagnos/i,
  /incorrect\s+(treatment|prescription|diagnosis)/i,
  /clinical\s+error/i,
  /wrong\s+prescription/i,
  /ai\s+(suggest|recommend).*wrong/i,
  /triage.*wrong/i,
  /risk\s+score.*wrong/i,
  /drug\s+interaction.*miss/i,
  /false\s+(positive|negative).*diagnosis/i,
  /ai.*incorrect.*clinic/i,
];

// ─── SLA durations per severity ───────────────────────────────────────────────

export const SLA_MINUTES = {
  S0: { response: 15,        resolution: 120 },
  S1: { response: 60,        resolution: 480 },
  S2: { response: 240,       resolution: 1440 },
  S3: { response: 1440,      resolution: 4320 },
};

export function computeSLADeadlines(severity, from = new Date()) {
  const sla   = SLA_MINUTES[severity];
  const ms    = (min) => min * 60 * 1000;
  return {
    response_due_at:   new Date(from.getTime() + ms(sla.response)),
    resolution_due_at: new Date(from.getTime() + ms(sla.resolution)),
  };
}

// ─── Pre-filter ───────────────────────────────────────────────────────────────

function keywordPreFilter(text) {
  for (const re of S0_KEYWORDS) {
    if (re.test(text)) return 'S0';
  }
  for (const re of S1_KEYWORDS) {
    if (re.test(text)) return 'S1';
  }
  return null;
}

// ─── LLM classifier ───────────────────────────────────────────────────────────

const CLASSIFY_SYSTEM = `You are a medical-software quality analyst.
Classify the given support complaint into ONE severity tier:
  S0 = Direct patient safety risk (wrong drug, overdose, patient harm, life-threatening AI error)
  S1 = Clinical quality issue (wrong AI diagnosis, incorrect triage, missed drug interaction)
  S2 = Functional bug (feature broken, data not loading, crash — no clinical impact)
  S3 = UX friction (slow, confusing UI, minor inconvenience)

Return ONLY valid JSON matching this schema exactly:
{
  "severity": "S0"|"S1"|"S2"|"S3",
  "confidence": <0.0-1.0>,
  "ai_component": "<component name or null>",
  "feedback_type": "safety"|"clinical_quality"|"functional_bug"|"ux_friction",
  "evidence_quote": "<short verbatim quote from text justifying classification>",
  "recommended_action": "<one-line action for the response team>"
}

ai_component must be one of: medical_scribe_output, emergency_triage_esi_v1,
drug_interaction_checker_v1, health_risk_scoring_v2_bayesian, or null.`;

async function llmClassify(text) {
  const masked = maskPHI(text);

  const response = await llmProvider.chat({
    messages: [
      { role: 'system', content: CLASSIFY_SYSTEM },
      { role: 'user',   content: `Classify this complaint:\n\n${masked}` },
    ],
    responseFormat:  { type: 'json_object' },
    cognitiveTier:   'reflex',
    maxTokens:       300,
    temperature:     0.1,
  });

  const raw = response?.content ?? response?.choices?.[0]?.message?.content ?? '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return {
    severity:           ['S0','S1','S2','S3'].includes(parsed.severity) ? parsed.severity : 'S3',
    confidence:         typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    ai_component:       parsed.ai_component       ?? null,
    feedback_type:      parsed.feedback_type       ?? 'ux_friction',
    evidence_quote:     parsed.evidence_quote      ?? '',
    recommended_action: parsed.recommended_action  ?? 'Review and respond within SLA',
  };
}

// ─── Public classifier ────────────────────────────────────────────────────────

/**
 * Classify a ticket or feedback text.
 *
 * @param {string} text - raw complaint text (will be PHI-masked before LLM call)
 * @returns {Promise<{severity, confidence, ai_component, feedback_type,
 *                    evidence_quote, recommended_action}>}
 */
export async function classifySeverity(text) {
  if (!text || typeof text !== 'string' || text.trim().length < 5) {
    return {
      severity:           'S3',
      confidence:         0.3,
      ai_component:       null,
      feedback_type:      'ux_friction',
      evidence_quote:     '',
      recommended_action: 'Review and respond within SLA',
    };
  }

  // Check classifier cache (TTL 24h, keyed by text hash)
  const cached = await getClassifierCache(text);
  if (cached) return cached;

  // Multilingual pre-processing: translate Hindi/Tamil to English if needed
  let processText = text;
  try {
    const { processedText, preFilterResult: mlPreFilter } = await preprocessForClassification(text);
    processText = processedText;
    // If multilingual pre-filter already determined severity, use it
    if (mlPreFilter) {
      const result = {
        severity:           mlPreFilter,
        confidence:         0.88,
        ai_component:       'medical_scribe_output',
        feedback_type:      mlPreFilter === 'S0' ? 'safety' : 'clinical_quality',
        evidence_quote:     text.substring(0, 120),
        recommended_action: mlPreFilter === 'S0'
          ? 'IMMEDIATE: escalate to medical director and on-call team'
          : 'Escalate to clinical quality team within 1 hour',
      };
      await setClassifierCache(text, result);
      return result;
    }
  } catch { /* fallback to original text */ }

  // Fast synchronous path — no LLM call required.
  const preFilterResult = keywordPreFilter(processText);
  if (preFilterResult === 'S0') {
    const result = {
      severity:           'S0',
      confidence:         0.95,
      ai_component:       'medical_scribe_output',
      feedback_type:      'safety',
      evidence_quote:     processText.substring(0, 120),
      recommended_action: 'IMMEDIATE: escalate to medical director and on-call team',
    };
    await setClassifierCache(text, result);
    return result;
  }
  if (preFilterResult === 'S1') {
    const result = {
      severity:           'S1',
      confidence:         0.90,
      ai_component:       'medical_scribe_output',
      feedback_type:      'clinical_quality',
      evidence_quote:     processText.substring(0, 120),
      recommended_action: 'Escalate to clinical quality team within 1 hour',
    };
    await setClassifierCache(text, result);
    return result;
  }

  // LLM path for ambiguous inputs.
  try {
    const result = await llmClassify(processText);
    await setClassifierCache(text, result);
    return result;
  } catch (err) {
    console.error('[SeverityClassifier] LLM classify error:', err.message);
    return {
      severity:           'S2',
      confidence:         0.4,
      ai_component:       null,
      feedback_type:      'functional_bug',
      evidence_quote:     '',
      recommended_action: 'Review manually — classifier unavailable',
    };
  }
}

export default { classifySeverity, computeSLADeadlines, SLA_MINUTES };
