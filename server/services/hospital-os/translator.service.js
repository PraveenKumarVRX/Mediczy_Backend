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

export default { translateClinical, listLanguages };
