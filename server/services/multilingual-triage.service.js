import emergencyTriageService from './ai-emergency-triage.service.js';

// Independently authored, high-risk phrase coverage.  This is intentionally a
// small, reviewable vocabulary; it is not a translation corpus or a medical
// diagnosis engine.  The original patient text is always retained for audit.
const PHRASES = [
  { language: 'hi', patterns: [/सीने में दर्द/i, /seene mein dard/i], canonical: 'chest pain', category: 'cardiac', explanation: 'Chest-pain phrase matched the cardiac emergency rule.' },
  { language: 'hi', patterns: [/सांस लेने में दिक्कत/i, /saans lene mein dikkat/i], canonical: 'difficulty breathing', category: 'respiratory', explanation: 'Breathing difficulty phrase matched the respiratory emergency rule.' },
  { language: 'hi', patterns: [/बेहोश/i, /behosh/i], canonical: 'unresponsive', category: 'arrest', explanation: 'Unresponsive phrase matched the immediate resuscitation rule.' },
  { language: 'hi', patterns: [/बोलने में दिक्कत/i, /bolne mein dikkat/i, /मुंह टेढ़ा/i, /muh tedha/i], canonical: 'slurred speech facial droop', category: 'stroke', explanation: 'Speech or facial-droop phrase matched the stroke emergency rule.' },
  { language: 'hi', patterns: [/खुद को नुकसान/i, /khud ko nuksan/i, /मरना चाहता/i, /marna chahta/i], canonical: 'self harm', category: 'psychiatric', explanation: 'Self-harm phrase matched the crisis intervention rule.' },
  { language: 'ta', patterns: [/மார்பு வலி/i], canonical: 'chest pain', category: 'cardiac', explanation: 'Chest-pain phrase matched the cardiac emergency rule.' },
  { language: 'te', patterns: [/ఛాతి నొప్పి/i], canonical: 'chest pain', category: 'cardiac', explanation: 'Chest-pain phrase matched the cardiac emergency rule.' },
  { language: 'kn', patterns: [/ಎದೆ ನೋವು/i], canonical: 'chest pain', category: 'cardiac', explanation: 'Chest-pain phrase matched the cardiac emergency rule.' },
  { language: 'bn', patterns: [/বুকে ব্যথা/i], canonical: 'chest pain', category: 'cardiac', explanation: 'Chest-pain phrase matched the cardiac emergency rule.' },
  { language: 'mr', patterns: [/छातीत दुखणे/i], canonical: 'chest pain', category: 'cardiac', explanation: 'Chest-pain phrase matched the cardiac emergency rule.' },
  { language: 'gu', patterns: [/છાતીમાં દુખાવો/i], canonical: 'chest pain', category: 'cardiac', explanation: 'Chest-pain phrase matched the cardiac emergency rule.' },
  { language: 'ml', patterns: [/നെഞ്ചുവേദന/i], canonical: 'chest pain', category: 'cardiac', explanation: 'Chest-pain phrase matched the cardiac emergency rule.' },
  { language: 'pa', patterns: [/ਛਾਤੀ ਦਰਦ/i], canonical: 'chest pain', category: 'cardiac', explanation: 'Chest-pain phrase matched the cardiac emergency rule.' },
];

const inferLanguage = (text) => {
  if (/[ऀ-ॿ]/u.test(text)) return 'hi';
  if (/[஀-௿]/u.test(text)) return 'ta';
  if (/[ఀ-౿]/u.test(text)) return 'te';
  if (/[ಀ-೿]/u.test(text)) return 'kn';
  if (/[ঀ-৿]/u.test(text)) return 'bn';
  if (/[ഀ-ൿ]/u.test(text)) return 'ml';
  if (/[઀-૿]/u.test(text)) return 'gu';
  if (/[਀-੿]/u.test(text)) return 'pa';
  return 'en';
};

export function normalizeTriageInput(symptoms, requestedLanguage = 'auto') {
  const text = String(symptoms || '').trim();
  const language = requestedLanguage === 'auto' ? inferLanguage(text) : requestedLanguage;
  const matched = PHRASES.filter((entry) => entry.patterns.some((pattern) => pattern.test(text)));
  const concepts = [...new Map(matched.map((entry) => [entry.canonical, {
    canonical: entry.canonical,
    category: entry.category,
    explanation: entry.explanation,
  }])).values()];
  const canonicalText = concepts.map((concept) => concept.canonical).join(' ');
  return { language, originalSymptoms: text, normalizedSymptoms: canonicalText ? `${text} ${canonicalText}` : text, concepts };
}

export async function triageMultilingual(params = {}) {
  const normalized = normalizeTriageInput(params.symptoms, params.language);
  // The local phrase gate runs before this call.  Existing triage then applies
  // the mediqzy red-flag/vitals rules and only considers an LLM for ESI >= 3.
  const triage = await emergencyTriageService.triage({
    ...params,
    symptoms: normalized.normalizedSymptoms,
  });
  return {
    ...triage,
    language: normalized.language,
    originalSymptoms: normalized.originalSymptoms,
    normalizedSymptoms: normalized.normalizedSymptoms,
    matchedConcepts: normalized.concepts,
    specialtyExplanation: normalized.concepts.length
      ? normalized.concepts.map((concept) => `${concept.category}: ${concept.explanation}`)
      : [`${triage.specialty || 'Emergency Medicine'} selected from the triage category and acuity.`],
    deterministicPreLlm: true,
  };
}

export const multilingualTriageVocabulary = PHRASES.map(({ language, canonical, category }) => ({ language, canonical, category }));
export default { triageMultilingual, normalizeTriageInput, multilingualTriageVocabulary };
