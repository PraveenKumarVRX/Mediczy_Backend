/**
 * Intent Classifier - SIMPLIFIED STUB
 * Only provides basic structure for compatibility.
 * ALL actual processing is done by SIB ChatBotlet.
 */

class IntentClassifier {
  constructor() {
    this.hybridEnabled = false;
    this.confidenceThreshold = 30;
  }

  /**
   * Basic keyword classification - for logging/analytics only
   * SIB ChatBotlet does the actual intelligent processing
   */
  classify(query, language = 'en') {
    const lower = query.toLowerCase();
    
    // Just for logging purposes - doesn't affect routing
    let intentName = 'general';
    let confidence = 50;
    
    if (/emergency|urgent|dying|chest pain|unconscious|bleeding|911|108/i.test(lower)) {
      intentName = 'emergency';
      confidence = 90;
    } else if (/appointment|book|schedule|slot/i.test(lower)) {
      intentName = 'appointment';
      confidence = 70;
    } else if (/symptom|pain|fever|sick|illness/i.test(lower)) {
      intentName = 'medical';
      confidence = 60;
    }
    
    return {
      primary: {
        name: intentName,
        confidence: confidence,
        action: intentName
      },
      method: 'keyword'
    };
  }

  /**
   * Hybrid classification - just delegates to basic classify
   */
  async classifyHybrid(query, language = 'en') {
    return this.classify(query, language);
  }

  /**
   * Get handling strategy - always routes to AI
   */
  getHandlingStrategy(classification) {
    return {
      strategy: classification?.primary?.name || 'general',
      action: classification?.primary?.action || 'ai_response',
      requiresAI: true,  // Always use AI
      priority: 5
    };
  }

  /**
   * Language detection
   */
  detectLanguage(text) {
    // Simple detection for common scripts
    if (/[\u0900-\u097F]/.test(text)) return 'hi';  // Hindi
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';  // Tamil
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te';  // Telugu
    return 'en';
  }

  /**
   * Get intent response - returns null (SIB handles responses)
   */
  getIntentResponse(intentName, language = 'en') {
    return null;  // SIB ChatBotlet provides all responses
  }
}

export default new IntentClassifier();
