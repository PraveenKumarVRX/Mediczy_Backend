/**
 * Translation Service - LaBSE + IndicTrans Integration
 * =====================================================
 * 
 * Provides multilingual support for Dr. iSHA chat across all channels:
 * - WhatsApp
 * - In-app chat
 * - Admin console
 * 
 * Components:
 * 1. LaBSE (Language-agnostic BERT) - Language detection & semantic embeddings
 * 2. IndicTrans2 - Indian language translation (22 languages)
 * 3. Fallback to Google Translate API
 * 
 * Supported Indian Languages (IndicTrans2):
 * - Hindi (hi), Bengali (bn), Telugu (te), Tamil (ta), Marathi (mr)
 * - Gujarati (gu), Kannada (kn), Malayalam (ml), Punjabi (pa)
 * - Odia (or), Assamese (as), Maithili (mai), Sindhi (sd)
 * - Sanskrit (sa), Urdu (ur), Nepali (ne), Konkani (kok)
 * - Manipuri (mni), Bodo (brx), Dogri (doi), Kashmiri (ks), Santali (sat)
 */

import { getLaBSEInstance } from '../utils/labseEmbeddings.js';
import fetch from '../integrations/fetch.js';

// IndicTrans2 API endpoint (self-hosted or Hugging Face Inference API)
const INDICTRANS_API_URL = process.env.INDICTRANS_API_URL || 'https://ai.isha.buzz/translate';
const INDICTRANS_ENABLED = process.env.INDICTRANS_ENABLED !== 'false';
const LABSE_ENABLED = process.env.LABSE_ENABLED
  ? process.env.LABSE_ENABLED !== 'false'
  : !(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID);

// Language code mappings for IndicTrans2
const INDIC_LANGUAGES = {
  // ISO 639-1 to IndicTrans2 format
  'hi': 'hin_Deva',  // Hindi
  'bn': 'ben_Beng',  // Bengali
  'te': 'tel_Telu',  // Telugu
  'ta': 'tam_Taml',  // Tamil
  'mr': 'mar_Deva',  // Marathi
  'gu': 'guj_Gujr',  // Gujarati
  'kn': 'kan_Knda',  // Kannada
  'ml': 'mal_Mlym',  // Malayalam
  'pa': 'pan_Guru',  // Punjabi
  'or': 'ory_Orya',  // Odia
  'as': 'asm_Beng',  // Assamese
  'ur': 'urd_Arab',  // Urdu
  'ne': 'npi_Deva',  // Nepali
  'sa': 'san_Deva',  // Sanskrit
  'sd': 'snd_Arab',  // Sindhi
  'mai': 'mai_Deva', // Maithili
  'kok': 'kok_Deva', // Konkani
  'doi': 'doi_Deva', // Dogri
  'ks': 'kas_Arab',  // Kashmiri
  'mni': 'mni_Beng', // Manipuri
  'brx': 'brx_Deva', // Bodo
  'sat': 'sat_Olck'  // Santali
};

// Language detection patterns (fallback when LaBSE not available)
const LANGUAGE_PATTERNS = {
  hi: /[\u0900-\u097F]/,           // Devanagari (Hindi, Marathi, Sanskrit)
  bn: /[\u0980-\u09FF]/,           // Bengali
  te: /[\u0C00-\u0C7F]/,           // Telugu
  ta: /[\u0B80-\u0BFF]/,           // Tamil
  gu: /[\u0A80-\u0AFF]/,           // Gujarati
  kn: /[\u0C80-\u0CFF]/,           // Kannada
  ml: /[\u0D00-\u0D7F]/,           // Malayalam
  pa: /[\u0A00-\u0A7F]/,           // Gurmukhi (Punjabi)
  or: /[\u0B00-\u0B7F]/,           // Odia
  ur: /[\u0600-\u06FF]/,           // Arabic (Urdu)
  ar: /[\u0600-\u06FF]/,           // Arabic
  zh: /[\u4E00-\u9FFF]/,           // Chinese
  ja: /[\u3040-\u309F\u30A0-\u30FF]/, // Japanese
  ko: /[\uAC00-\uD7AF]/            // Korean
};

class TranslationService {
  constructor() {
    this.labseInstance = null;
    this.translationCache = new Map();
    this.maxCacheSize = parseInt(process.env.TRANSLATION_CACHE_SIZE || '500', 10);
    this.indicTransEnabled = INDICTRANS_ENABLED;
    this.labseEnabled = LABSE_ENABLED;
    this.initialized = false;
    
    console.log('[TranslationService] Initialized', {
      indicTransEnabled: this.indicTransEnabled,
      labseEnabled: this.labseEnabled,
      apiUrl: INDICTRANS_API_URL
    });
  }
  
  /**
   * Initialize LaBSE for language detection
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      if (this.labseEnabled) {
        this.labseInstance = await getLaBSEInstance();
        if (this.labseInstance && !this.labseInstance.modelLoaded) {
          // Initialize LaBSE in background (don't block)
          this.labseInstance.initialize().catch(err => {
            console.warn('[TranslationService] LaBSE init failed:', err.message);
          });
        }
      }
      this.initialized = true;
      console.log('[TranslationService] LaBSE integration ready');
    } catch (error) {
      console.warn('[TranslationService] LaBSE initialization failed:', error.message);
      this.labseEnabled = false;
    }
  }
  
  /**
   * Detect language of input text using LaBSE or pattern matching
   */
  async detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'en';
    
    const trimmed = text.trim();
    if (!trimmed) return 'en';
    
    // 1. Fast path: Check script-based patterns first
    for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
      if (pattern.test(trimmed)) {
        return lang;
      }
    }
    
    // 2. Use LaBSE for semantic language detection if available
    if (this.labseEnabled && this.labseInstance?.modelLoaded) {
      try {
        // LaBSE embeddings vary by language - can use for clustering
        // For now, fall back to pattern-based detection
      } catch (error) {
        console.warn('[TranslationService] LaBSE detection error:', error.message);
      }
    }
    
    // 3. Default to English for Latin script
    return 'en';
  }
  
  /**
   * Check if language is an Indian language supported by IndicTrans2
   */
  isIndicLanguage(langCode) {
    return langCode in INDIC_LANGUAGES;
  }
  
  /**
   * Get IndicTrans2 language code
   */
  getIndicCode(langCode) {
    return INDIC_LANGUAGES[langCode] || null;
  }
  
  /**
   * Translate text to English using IndicTrans2
   */
  async translateToEnglish(text, sourceLang = null) {
    if (!text || typeof text !== 'string') return { text, translated: false };
    
    const trimmed = text.trim();
    if (!trimmed) return { text: trimmed, translated: false };
    
    // Detect language if not provided
    const detectedLang = sourceLang || await this.detectLanguage(trimmed);
    
    // If already English, return as-is
    if (detectedLang === 'en') {
      return { text: trimmed, translated: false, detectedLanguage: 'en' };
    }
    
    // Check cache
    const cacheKey = `to_en:${detectedLang}:${trimmed}`;
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }
    
    // Try IndicTrans2 for Indian languages
    if (this.indicTransEnabled && this.isIndicLanguage(detectedLang)) {
      try {
        const indicCode = this.getIndicCode(detectedLang);
        const result = await this.callIndicTrans(trimmed, indicCode, 'eng_Latn');
        
        if (result.success) {
          const translationResult = {
            text: result.translation,
            translated: true,
            originalText: trimmed,
            detectedLanguage: detectedLang,
            provider: 'indictrans2'
          };
          this.cacheTranslation(cacheKey, translationResult);
          return translationResult;
        }
      } catch (error) {
        console.warn('[TranslationService] IndicTrans2 to English failed:', error.message);
      }
    }

    // Fallback: free Google Translate endpoint (works for all languages, not just
    // the Indic set — this is what actually runs today since IndicTrans2 is dead).
    const googleResult = await this.callGoogleFree(trimmed, detectedLang, 'en');
    if (googleResult.success) {
      const translationResult = {
        text: googleResult.translation,
        translated: true,
        originalText: trimmed,
        detectedLanguage: detectedLang,
        provider: 'google-translate'
      };
      this.cacheTranslation(cacheKey, translationResult);
      return translationResult;
    }

    // Fallback: Return original text
    return {
      text: trimmed,
      translated: false,
      detectedLanguage: detectedLang,
      note: 'Translation not available'
    };
  }
  
  /**
   * Translate English text to target language
   */
  async translateFromEnglish(text, targetLang) {
    if (!text || typeof text !== 'string') return { text, translated: false };
    if (!targetLang || targetLang === 'en') return { text, translated: false };
    
    const trimmed = text.trim();
    if (!trimmed) return { text: trimmed, translated: false };
    
    // Check cache
    const cacheKey = `from_en:${targetLang}:${trimmed}`;
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }
    
    // Try IndicTrans2 for Indian languages
    if (this.indicTransEnabled && this.isIndicLanguage(targetLang)) {
      try {
        const indicCode = this.getIndicCode(targetLang);
        const result = await this.callIndicTrans(trimmed, 'eng_Latn', indicCode);
        
        if (result.success) {
          const translationResult = {
            text: result.translation,
            translated: true,
            originalText: trimmed,
            targetLanguage: targetLang,
            provider: 'indictrans2'
          };
          this.cacheTranslation(cacheKey, translationResult);
          return translationResult;
        }
      } catch (error) {
        console.warn('[TranslationService] IndicTrans2 from English failed:', error.message);
      }
    }

    // Fallback: free Google Translate endpoint.
    const googleResult = await this.callGoogleFree(trimmed, 'en', targetLang);
    if (googleResult.success) {
      const translationResult = {
        text: googleResult.translation,
        translated: true,
        originalText: trimmed,
        targetLanguage: targetLang,
        provider: 'google-translate'
      };
      this.cacheTranslation(cacheKey, translationResult);
      return translationResult;
    }

    // Fallback: Return original English text
    return {
      text: trimmed,
      translated: false,
      targetLanguage: targetLang,
      note: 'Translation to target language not available'
    };
  }

  /**
   * Free Google Translate endpoint (same one deep-translator/googletrans use under
   * the hood — no API key needed). Used as the working fallback: the self-hosted
   * IndicTrans2 API (INDICTRANS_API_URL) has no live deployment, so callIndicTrans
   * always fails and this is what actually translates today.
   */
  async callGoogleFree(text, sourceLang, targetLang) {
    try {
      const url = new URL('https://translate.googleapis.com/translate_a/single');
      url.searchParams.set('client', 'gtx');
      url.searchParams.set('sl', sourceLang || 'auto');
      url.searchParams.set('tl', targetLang);
      url.searchParams.set('dt', 't');
      url.searchParams.set('q', text);

      const response = await fetch(url.toString(), { timeout: 8000 });
      if (!response.ok) throw new Error(`Google Translate returned ${response.status}`);

      const data = await response.json();
      const translation = Array.isArray(data?.[0])
        ? data[0].map((segment) => segment[0]).join('')
        : null;
      if (!translation) throw new Error('Empty translation');

      return { success: true, translation, sourceLang, targetLang };
    } catch (error) {
      console.warn('[TranslationService] Google Translate fallback failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Call IndicTrans2 API
   */
  async callIndicTrans(text, sourceLang, targetLang) {
    try {
      const response = await fetch(INDICTRANS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          source_lang: sourceLang,
          target_lang: targetLang
        }),
        timeout: 10000
      });
      
      if (!response.ok) {
        throw new Error(`IndicTrans API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        success: true,
        translation: data.translation || data.translated_text || data.text,
        sourceLang,
        targetLang
      };
    } catch (error) {
      console.error('[TranslationService] IndicTrans API error:', error.message);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Cache translation with LRU eviction
   */
  cacheTranslation(key, value) {
    if (this.translationCache.size >= this.maxCacheSize) {
      const firstKey = this.translationCache.keys().next().value;
      this.translationCache.delete(firstKey);
    }
    this.translationCache.set(key, value);
  }
  
  /**
   * Process multilingual chat message
   * 1. Detect language
   * 2. Translate to English for AI processing
   * 3. Return translation info
   */
  async processMultilingualInput(message, preferredLanguage = null) {
    await this.initialize();
    
    const detectedLanguage = preferredLanguage || await this.detectLanguage(message);
    
    // If English, no translation needed
    if (detectedLanguage === 'en') {
      return {
        originalMessage: message,
        processedMessage: message,
        detectedLanguage: 'en',
        translated: false
      };
    }
    
    // Translate to English for AI processing
    const translation = await this.translateToEnglish(message, detectedLanguage);
    
    return {
      originalMessage: message,
      processedMessage: translation.text,
      detectedLanguage: detectedLanguage,
      translated: translation.translated,
      provider: translation.provider
    };
  }
  
  /**
   * Process AI response for multilingual output
   * Translate English response back to user's language
   */
  async processMultilingualOutput(response, targetLanguage) {
    if (!targetLanguage || targetLanguage === 'en') {
      return {
        originalResponse: response,
        processedResponse: response,
        targetLanguage: 'en',
        translated: false
      };
    }
    
    const translation = await this.translateFromEnglish(response, targetLanguage);
    
    return {
      originalResponse: response,
      processedResponse: translation.text,
      targetLanguage: targetLanguage,
      translated: translation.translated,
      provider: translation.provider
    };
  }
  
  /**
   * Full multilingual conversation flow
   * Input → Detect → Translate to EN → AI Process → Translate back → Output
   */
  async translateConversation(inputMessage, aiResponse, userLanguage = null) {
    // Process input
    const inputResult = await this.processMultilingualInput(inputMessage, userLanguage);
    
    // Determine response language (use detected input language)
    const responseLanguage = inputResult.detectedLanguage;
    
    // Process output
    const outputResult = await this.processMultilingualOutput(aiResponse, responseLanguage);
    
    return {
      input: inputResult,
      output: outputResult,
      userLanguage: responseLanguage
    };
  }
  
  /**
   * Get service stats
   */
  getStats() {
    return {
      indicTransEnabled: this.indicTransEnabled,
      labseEnabled: this.labseEnabled,
      labseLoaded: this.labseInstance?.modelLoaded || false,
      cacheSize: this.translationCache.size,
      maxCacheSize: this.maxCacheSize,
      supportedIndicLanguages: Object.keys(INDIC_LANGUAGES)
    };
  }
  
  /**
   * Clear translation cache
   */
  clearCache() {
    this.translationCache.clear();
  }
}

// Singleton instance
const translationService = new TranslationService();

export default translationService;
export { TranslationService, INDIC_LANGUAGES };
