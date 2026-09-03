/**
 * Hospital OS — clinical translator (multilingual staff ↔ patient)
 */
import llmProvider from '../ai-brain/llm-provider.js';

const SUPPORTED_LANGUAGES = [
  'en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa', 'ur', 'ar', 'fr', 'es', 'de', 'zh',
];

export async function translateClinical({
  text,
  sourceLang = 'auto',
  targetLang = 'en',
  context = 'general',
  audience = 'patient',
}) {
  if (!text?.trim()) throw new Error('Text is required');
  if (!SUPPORTED_LANGUAGES.includes(targetLang)) {
    throw new Error(`Unsupported target language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  const systemPrompt = `You are a hospital clinical translator. Preserve medical accuracy.
Context: ${context}. Audience: ${audience}.
Use plain language for patients; precise terminology for staff handoffs.
Output JSON: { "translatedText", "glossary": [{ "term", "explanation" }], "confidence": 0-1 }`;

  const llm = await llmProvider.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Translate from ${sourceLang} to ${targetLang}:\n${text}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 1200,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(llm.content || '{}');
  } catch {
    parsed = { translatedText: llm.content, confidence: 0.5 };
  }

  return {
    sourceLang,
    targetLang,
    originalText: text,
    ...parsed,
    provider: llm.provider,
    auditNote: 'Translation logged for compliance. Verify critical consents with human interpreter when required.',
  };
}

export function listLanguages() {
  return SUPPORTED_LANGUAGES;
}

/**
 * Multilingual document generation (Upgrade Plan Track A, Phase A4).
 *
 * translateClinical() above translates a single block of free text.
 * Real documents — discharge instructions, patient communication — have
 * multiple structured sections that each need to stay medically accurate
 * on their own, not run through translation as one undifferentiated
 * paragraph. This generates each section directly in the target language
 * from structured source fields, with the same confidence/glossary
 * discipline as translateClinical.
 *
 * Output still passes through the same quality-gate/interpretability
 * pipeline as any other AI output before reaching a patient — this
 * function only produces the draft.
 */
export async function translateDocument({
  documentType,
  fields,
  targetLang = 'en',
  audience = 'patient',
}) {
  if (!documentType) throw new Error('documentType is required');
  if (!fields || typeof fields !== 'object' || !Object.keys(fields).length) {
    throw new Error('fields (an object of section name -> source text) is required');
  }
  if (!SUPPORTED_LANGUAGES.includes(targetLang)) {
    throw new Error(`Unsupported target language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  const systemPrompt = `You are a hospital clinical translator generating a ${documentType} for a ${audience} in the target language.
Translate each named section independently, preserving medical accuracy and section boundaries.
Use plain, culturally appropriate language for patients; keep clinical terminology precise where the section demands it (e.g. drug names, dosages).
Do not omit or merge sections. Do not invent content not present in the source.
Output JSON: { "sections": { "<sectionName>": "<translated text>", ... }, "confidence": 0-1, "flaggedTerms": [{ "term", "reason" }] }`;

  const llm = await llmProvider.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Target language: ${targetLang}\nSource sections (JSON):\n${JSON.stringify(fields, null, 2)}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 2000,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(llm.content || '{}');
  } catch {
    parsed = { sections: {}, confidence: 0, flaggedTerms: [] };
  }

  return {
    documentType,
    targetLang,
    audience,
    sourceFields: fields,
    sections: parsed.sections || {},
    confidence: parsed.confidence ?? null,
    flaggedTerms: parsed.flaggedTerms || [],
    provider: llm.provider,
    auditNote: 'Draft only — requires clinician approval before use, same as any other AI-generated clinical output (see ai-quality-gates.service.js).',
  };
}

export default { translateClinical, translateDocument, listLanguages };
