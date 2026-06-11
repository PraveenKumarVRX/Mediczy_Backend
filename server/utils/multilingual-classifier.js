/**
 * Multilingual Complaint Classifier
 * ===================================
 * Detects language of incoming complaint text and enriches severity
 * classification with Hindi / Tamil support.
 *
 * Detection strategy:
 *   1. Unicode script range check (zero-cost, synchronous)
 *      - Devanagari (U+0900–U+097F) → Hindi
 *      - Tamil (U+0B80–U+0BFF)       → Tamil
 *      - Latin script                 → English (default)
 *   2. LLM-assisted translation to English before severity classification
 *      (only when script detection is confident)
 *
 * S0/S1 safety keywords are also maintained in Hindi transliteration
 * to catch cases where a Hindi speaker writes in Roman script.
 */

import llmProvider from '../services/ai-brain/llm-provider.js';

// ─── Script detection ─────────────────────────────────────────────────────────

const DEVANAGARI_RE = /[ऀ-ॿ]/;
const TAMIL_RE      = /[஀-௿]/;
const ARABIC_RE     = /[؀-ۿ]/;

export function detectScript(text) {
  if (!text) return 'latin';
  const counts = {
    devanagari: (text.match(/[ऀ-ॿ]/g) || []).length,
    tamil:      (text.match(/[஀-௿]/g) || []).length,
    arabic:     (text.match(/[؀-ۿ]/g) || []).length,
  };
  const total = text.length;
  if (counts.devanagari / total > 0.1) return 'devanagari'; // Hindi/Marathi
  if (counts.tamil / total > 0.1)      return 'tamil';
  if (counts.arabic / total > 0.1)     return 'arabic';
  return 'latin';
}

export function detectLanguage(text) {
  const script = detectScript(text);
  const map = { devanagari: 'hi', tamil: 'ta', arabic: 'ar', latin: 'en' };
  return map[script] ?? 'en';
}

// ─── Hindi Roman-script safety keywords ──────────────────────────────────────
// Patients sometimes write Hindi words in English letters.

const HINDI_S0_PATTERNS = [
  /galat\s+dawa/i,        // galat dawa = wrong medicine
  /galat\s+dose/i,
  /zyada\s+dawa/i,        // zyada = too much
  /overdose/i,
  /allergy\s+ho\s+gayi/i,
  /maut\s+(ho|hua|gayi)/i, // maut ho gaya = death occurred (requires Hindi verb, not English "died")
  /khatarnak\s+(dawa|dose|medicine)/i, // khatarnak + medical noun
];

const HINDI_S1_PATTERNS = [
  /galat\s+bimari/i,      // galat bimari = wrong disease
  /galat\s+diagnosis/i,
  /ai.*galat/i,
  /wrong\s+treatment/i,
];

export function checkHindiRomanKeywords(text) {
  for (const re of HINDI_S0_PATTERNS) {
    if (re.test(text)) return 'S0';
  }
  for (const re of HINDI_S1_PATTERNS) {
    if (re.test(text)) return 'S1';
  }
  return null;
}

// ─── Translation helper ───────────────────────────────────────────────────────

/**
 * Translate non-English complaint text to English using the LLM.
 * Returns the original text on failure (classifier will still run on it).
 *
 * @param {string} text
 * @param {string} langCode  'hi'|'ta'|'ar'
 * @returns {Promise<string>}
 */
export async function translateToEnglish(text, langCode) {
  const langNames = { hi: 'Hindi', ta: 'Tamil', ar: 'Arabic' };
  const langName  = langNames[langCode] ?? langCode;

  try {
    const response = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content:
            `You are a medical translator. Translate the following ${langName} text to English. ` +
            `Preserve medical terms exactly. Return ONLY the English translation — no commentary.`,
        },
        { role: 'user', content: text },
      ],
      cognitiveTier: 'reflex',
      maxTokens:     400,
      temperature:   0.1,
      skipCache:     false,
    });

    const translated = response?.content?.trim() ?? '';
    return translated.length > 10 ? translated : text;
  } catch {
    return text; // fallback to original; classifier handles it as-is
  }
}

/**
 * Enrich a complaint text for the severity classifier.
 * Returns { processedText, originalLanguage, wasTranslated }.
 *
 * @param {string} text  raw complaint text (any language)
 */
export async function preprocessForClassification(text) {
  if (!text) return { processedText: text, originalLanguage: 'en', wasTranslated: false };

  const lang = detectLanguage(text);

  // Check Hindi Roman-script keywords first (no LLM cost)
  const hindiPreFilter = checkHindiRomanKeywords(text);
  if (hindiPreFilter) {
    return { processedText: text, originalLanguage: 'hi-roman', wasTranslated: false, preFilterResult: hindiPreFilter };
  }

  // Translate if non-English native script
  if (lang !== 'en') {
    const translated = await translateToEnglish(text, lang);
    return { processedText: translated, originalLanguage: lang, wasTranslated: true };
  }

  return { processedText: text, originalLanguage: 'en', wasTranslated: false };
}
