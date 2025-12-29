/**
 * Advanced Intent Classification System for Dr. iSHA
 * Classifies user queries into multiple categories with confidence scoring
 * 
 * HYBRID MODE: Combines keyword-based classification (fast, primary path)
 * with semantic embeddings fallback (accurate, secondary path for low confidence)
 */

import { getLaBSEInstance } from './labseEmbeddings.js';

class IntentClassifier {
  constructor() {
    this.hybridEnabled = true;
    this.confidenceThreshold = 50; // Use semantic fallback if keyword confidence < 50%
    this.semanticConfidenceThreshold = 60; // Accept semantic result only if confidence >= 60%
    this.labseInstance = null;
    this.intents = {
      // Appointment & Scheduling
      appointment: {
        keywords: {
          en: ['book appointment', 'schedule appointment', 'need appointment', 'want appointment', 'make appointment', 'appointment', 'reserve', 'slot', 'doctor appointment', 'when can i', 'available times', 'schedule', 'timing', 'time slot', 'booking', 'book doctor', 'see doctor', 'meet doctor', 'consult doctor', 'find doctor'],
          hi: ['अपॉइंटमेंट', 'बुक', 'अपॉइंटमेंट बुक', 'शेड्यूल', 'निर्धारण', 'स्लॉट', 'बुकिंग', 'नियुक्ति', 'डॉक्टर', 'मिलना', 'समय'],
          es: ['cita', 'reservar', 'agendar', 'programar', 'horario', 'disponibilidad', 'consulta']
        },
        priority: 1,
        action: 'redirect_to_booking',
        redirectUrl: '/appointments'
      },

      // Medical Consultation
      medical_consult: {
        keywords: {
          en: ['symptom', 'pain', 'ache', 'fever', 'cough', 'cold', 'illness', 'disease', 'diagnosis', 'what is this', 'what causes', 'why am i', 'feel sick', 'unwell', 'condition', 'disorder', 'trouble', 'problem', 'issue', 'sick', 'hurt', 'suffering', 'headache', 'stomach', 'nausea', 'vomiting', 'diarrhea', 'back pain', 'throat', 'sore', 'runny nose', 'sneezing', 'rash', 'itching', 'swelling', 'dizziness', 'weakness', 'tired', 'fatigue', 'chest', 'breathing', 'muscle', 'joint', 'body ache', 'cramps', 'infection', 'allergy', 'having'],
          hi: ['लक्षण', 'दर्द', 'बुखार', 'खांसी', 'बीमारी', 'रोग', 'निदान', 'क्या', 'कारण', 'समस्या', 'परेशानी', 'तकलीफ', 'बीमार', 'सिरदर्द', 'पेट', 'उल्टी', 'दस्त', 'कमर', 'गला', 'सूजन', 'चक्कर', 'कमजोरी', 'थकान', 'छाती', 'सांस', 'एलर्जी'],
          es: ['síntoma', 'dolor', 'fiebre', 'tos', 'enfermedad', 'diagnóstico', 'causa', 'problema', 'cabeza', 'estómago', 'náusea', 'vómito', 'garganta', 'mareo', 'debilidad']
        },
        priority: 3,
        action: 'medical_consultation'
      },

      // Doctor Search & Listing
      doctor_search: {
        keywords: {
          en: ['find doctor', 'search doctor', 'looking for doctor', 'which doctor', 'doctor in', 'cardiologist', 'dermatologist', 'dentist', 'specialist', 'specialization', 'doctor list', 'best doctor', 'top doctor', 'find', 'search'],
          hi: ['डॉक्टर', 'खोज', 'ढूंढ', 'कार्डियोलॉजिस्ट', 'त्वचा', 'दंत', 'विशेषज्ञ'],
          es: ['doctor', 'buscar', 'encontrar', 'especialista', 'cardiología', 'dermatología']
        },
        priority: 2,
        action: 'show_doctors',
        redirectUrl: '/doctors'
      },

      // Emergency & Urgent Care
      emergency: {
        keywords: {
          en: ['emergency', 'urgent', 'critical', 'severe', 'acute', 'extreme', 'unbearable', 'dying', 'breathe', 'chest pain', 'unconscious', 'bleeding', 'injury', '911', '108'],
          hi: ['आपातकाल', 'तुरंत', 'गंभीर', 'तीव्र', 'असहनीय', 'मर', 'सांस', 'सीने', 'दर्द'],
          es: ['emergencia', 'urgente', 'crítico', 'severo', 'inconsciente', 'hemorragia']
        },
        priority: 0,
        action: 'emergency_alert',
        redirectUrl: '/emergency'
      },

      // Medication Information
      medication: {
        keywords: {
          en: ['medicine', 'medication', 'drug', 'tablet', 'pill', 'injection', 'dose', 'dosage', 'side effect', 'interaction', 'contraindication', 'how to take', 'how much', 'when to take', 'paracetamol', 'aspirin', 'antibiotic', 'take', 'prescription'],
          hi: ['दवा', 'औषधि', 'गोली', 'इंजेक्शन', 'खुराक', 'दुष्प्रभाव', 'कब', 'कितना'],
          es: ['medicina', 'medicamento', 'droga', 'dosis', 'efectos', 'tomar']
        },
        priority: 3,
        action: 'medication_info'
      },

      // Lab Tests & Reports
      lab_test: {
        keywords: {
          en: ['test', 'report', 'lab', 'blood test', 'x-ray', 'scan', 'ultrasound', 'ecg', 'results', 'values', 'range', 'thyroid', 'pressure', 'sugar', 'cholesterol', 'analysis', 'checkup'],
          hi: ['परीक्षण', 'रिपोर्ट', 'लैब', 'रक्त', 'स्कैन', 'परिणाम'],
          es: ['análisis', 'prueba', 'resultados', 'reporte']
        },
        priority: 3,
        action: 'lab_info'
      },

      // Lifestyle & Wellness
      lifestyle: {
        keywords: {
          en: ['diet', 'exercise', 'workout', 'fitness', 'weight', 'sleep', 'stress', 'anxiety', 'depression', 'healthy', 'wellness', 'nutrition', 'yoga', 'meditation', 'lifestyle', 'smoking', 'alcohol', 'lose', 'gain', 'health'],
          hi: ['आहार', 'व्यायाम', 'वजन', 'नींद', 'तनाव', 'चिंता', 'स्वास्थ्य', 'योग', 'ध्यान'],
          es: ['dieta', 'ejercicio', 'peso', 'estrés', 'ansiedad', 'sueño']
        },
        priority: 4,
        action: 'lifestyle_guidance'
      },

      // Pregnancy & Women's Health
      pregnancy: {
        keywords: {
          en: ['pregnant', 'pregnancy', 'pregnant with', 'due date', 'trimester', 'delivery', 'labor', 'contractions', 'gynecologist', 'obstetrician', 'prenatal', 'postnatal', 'miscarriage', 'abortion', 'womb', 'baby'],
          hi: ['गर्भ', 'प्रसव', 'प्रसव पीड़ा', 'स्त्री', 'बेबी'],
          es: ['embarazo', 'embarazada', 'parto', 'ginecólogo']
        },
        priority: 2,
        action: 'pregnancy_guidance'
      },

      // Mental Health
      mental_health: {
        keywords: {
          en: ['depressed', 'depression', 'anxiety', 'panic', 'stress', 'mental health', 'psychology', 'psychiatrist', 'counseling', 'therapy', 'bipolar', 'ocd', 'sad', 'lonely', 'psychologist'],
          hi: ['अवसाद', 'चिंता', 'मानसिक', 'मनोचिकित्सक', 'परामर्श', 'तनाव'],
          es: ['depresión', 'ansiedad', 'salud mental', 'psicólogo', 'consejería']
        },
        priority: 2,
        action: 'mental_health_support'
      },

      // Pediatric & Child Health
      pediatric: {
        keywords: {
          en: ['baby', 'child', 'children', 'infant', 'toddler', 'kid', 'pediatric', 'pediatrician', 'vaccine', 'vaccination', 'immunization', 'newborn', 'milestone', 'development'],
          hi: ['बच्चा', 'शिशु', 'बाल', 'टीका', 'टीकाकरण'],
          es: ['bebé', 'niño', 'pediatría', 'vacuna', 'inmunización']
        },
        priority: 2,
        action: 'pediatric_guidance'
      },

      // General Information
      general_info: {
        keywords: {
          en: ['what is', 'tell me', 'explain', 'how does', 'information', 'about', 'definition', 'help', 'can you', 'could you'],
          hi: ['क्या है', 'बताइए', 'समझाइए', 'जानकारी', 'मदद'],
          es: ['qué es', 'cuéntame', 'explica', 'información']
        },
        priority: 5,
        action: 'general_response'
      },

      // Prescription & Medical Records
      prescription: {
        keywords: {
          en: ['prescription', 'refill', 'renew', 'rx', 'medical record', 'discharge'],
          hi: ['प्रिस्क्रिप्शन', 'नुस्खा', 'रिकॉर्ड'],
          es: ['prescripción', 'receta', 'registro']
        },
        priority: 2,
        action: 'prescription_management'
      }
    };
  }

  /**
   * Initialize hybrid mode (async)
   * Must be called before using hybrid classification
   */
  async initializeHybrid() {
    if (this.hybridEnabled && !this.labseInstance) {
      try {
        this.labseInstance = await getLaBSEInstance();
        // Actually load the model if eager loading is enabled
        if (this.labseInstance && !this.labseInstance.modelLoaded) {
          await this.labseInstance.initialize();
        }
        console.log('[IntentClassifier] Hybrid mode initialized with LaBSE semantic embeddings');
      } catch (error) {
        console.error('[IntentClassifier] Failed to initialize hybrid mode:', error.message);
        this.hybridEnabled = false;
      }
    }
  }

  /**
   * Classify using hybrid approach (keyword primary + semantic fallback)
   * @param {string} query - User's query
   * @param {string} language - Language code (en, hi, es)
   * @returns {Object} Intent classification result
   */
  async classifyHybrid(query, language = 'en') {
    // First try keyword-based classification (fast path)
    const keywordResult = this.classify(query, language);

    // If high confidence, return immediately (< 5ms)
    if (keywordResult.primary && keywordResult.primary.confidence >= this.confidenceThreshold) {
      return {
        ...keywordResult,
        method: 'keyword',
        hybrid: true
      };
    }

    // Low confidence: try semantic fallback if available
    if (this.hybridEnabled && this.labseInstance?.modelLoaded) {
      try {
        const startTime = Date.now();
        const semanticResult = await this.labseInstance.classifyBySemantics(query);
        const semanticTime = Date.now() - startTime;

        // If semantic confidence is high enough, use it
        if (semanticResult.intent && semanticResult.confidence >= this.semanticConfidenceThreshold) {
          const intentName = semanticResult.intent;
          const intentConfig = this.intents[intentName];

          return {
            primary: {
              name: intentName,
              confidence: semanticResult.confidence,
              ...intentConfig,
              matched_keywords: [],
              match_count: 0
            },
            secondary: [],
            language: language,
            method: 'semantic_fallback',
            hybrid: true,
            semanticDetails: {
              topMatches: semanticResult.topMatches,
              processingTime: `${semanticTime}ms`
            }
          };
        }
      } catch (error) {
        console.error('[IntentClassifier] Semantic fallback error:', error.message);
        // Fall through to keyword result
      }
    }

    // Return keyword result even if confidence is low
    return {
      ...keywordResult,
      method: 'keyword',
      hybrid: true,
      note: 'Low confidence - consider manual review or semantic upgrade'
    };
  }

  /**
   * Classify user query into intent categories
   * @param {string} query - User's query
   * @param {string} language - Language code (en, hi, es)
   * @returns {Object} Intent classification result with scores
   */
  classify(query, language = 'en') {
    if (!query || typeof query !== 'string') {
      return {
        primary: null,
        secondary: [],
        confidence: 0,
        matched_keywords: [],
        language: language
      };
    }

    const queryLower = query.toLowerCase().trim();
    const scores = {};
    const matches = {};

    // Score each intent
    for (const [intentName, intentConfig] of Object.entries(this.intents)) {
      const keywords = intentConfig.keywords[language] || intentConfig.keywords.en;
      const matchedKeywords = [];
      let matchCount = 0;

      // Check for keyword matches
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        if (queryLower.includes(keywordLower)) {
          matchedKeywords.push(keyword);
          matchCount++;
        }
      }

      if (matchCount > 0) {
        matches[intentName] = matchedKeywords;
        
        // Enhanced confidence calculation:
        // Base score gives minimum 25% for any match, plus scaled percentage
        const keywordCount = keywords.length;
        const baseScore = 25 + ((matchCount / keywordCount) * 75); // Min 25%, max 100%
        
        // Priority weight (higher = more important intent gets higher score)
        const priorityWeight = 1 + ((3 - intentConfig.priority) * 0.15);
        
        // Match count boost (more matches = higher confidence)
        const matchBoost = 1 + Math.min(matchCount * 0.15, 0.6);
        
        const finalScore = baseScore * priorityWeight * matchBoost;
        scores[intentName] = Math.min(finalScore, 95); // Cap at 95% to avoid false confidence
      }
    }

    // Get top intents sorted by score
    const sortedIntents = Object.entries(scores)
      .sort((a, b) => {
        const scoreCompare = b[1] - a[1];
        if (scoreCompare !== 0) return scoreCompare;
        // Break ties using priority
        return this.intents[a[0]].priority - this.intents[b[0]].priority;
      });

    // Build result
    const primary = sortedIntents[0];
    const secondary = sortedIntents.slice(1, 3);

    // Only include primary if it has a reasonable confidence (lowered to 5% for better recall)
    const primaryResult = primary && primary[1] > 5 ? {
      name: primary[0],
      confidence: Math.round(primary[1]),
      ...this.intents[primary[0]],
      matched_keywords: matches[primary[0]] || [],
      match_count: matches[primary[0]]?.length || 0
    } : null;

    return {
      primary: primaryResult,
      secondary: secondary
        .filter(([_, score]) => score > 5)
        .map(([name, score]) => ({
          name,
          confidence: Math.round(score),
          ...this.intents[name],
          matched_keywords: matches[name] || [],
          match_count: matches[name]?.length || 0
        })),
      all_matches: Object.keys(matches),
      language: language,
      query_length: queryLower.length,
      query_word_count: queryLower.split(/\s+/).length,
      score_breakdown: Object.fromEntries(
        Object.entries(scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
      )
    };
  }

  /**
   * Detect language from query
   * @param {string} query
   * @returns {string} Language code (en, hi, es, or detected)
   */
  detectLanguage(query) {
    if (!query) return 'en';

    // Hindi detection (Devanagari script)
    const devanagariRegex = /[\u0900-\u097F]/;
    if (devanagariRegex.test(query)) return 'hi';

    // Spanish detection (common Spanish patterns)
    const spanishWords = ['el', 'la', 'de', 'que', 'por', 'para', 'con', 'como', 'está', 'quisiera'];
    const words = query.toLowerCase().split(/\s+/);
    const spanishMatches = words.filter(w => spanishWords.includes(w)).length;
    if (spanishMatches >= 2) return 'es';

    return 'en';
  }

  /**
   * Get response template for intent
   * @param {string} intentName
   * @param {string} language
   * @returns {Object} Response template
   */
  getIntentResponse(intentName, language = 'en') {
    const intent = this.intents[intentName];
    if (!intent) return null;

    const responses = {
      appointment: {
        en: 'I understand you want to book an appointment. Let me help you find the right doctor!',
        hi: 'मुझे समझ आया कि आप अपॉइंटमेंट बुक करना चाहते हैं। मुझे आपको सही डॉक्टर खोजने में मदद करने दें!',
        es: 'Entiendo que quieres reservar una cita. ¡Déjame ayudarte a encontrar al doctor correcto!'
      },
      medical_consult: {
        en: 'I understand you\'re experiencing some health concerns. Please describe your symptoms in detail so I can help you better.',
        hi: 'मुझे समझ आया कि आप कुछ स्वास्थ्य समस्याओं का सामना कर रहे हैं। कृपया अपने लक्षणों का विस्तार से वर्णन करें।',
        es: 'Entiendo que experimentas algunos problemas de salud. Por favor, describe tus síntomas en detalle para poder ayudarte mejor.'
      },
      doctor_search: {
        en: 'You\'re looking for a doctor. Let me help you search by specialty, location, or other preferences.',
        hi: 'आप एक डॉक्टर को खोज रहे हैं। मुझे आपको विशेषज्ञता, स्थान या अन्य वरीयताओं के अनुसार खोज करने में मदद करने दें।',
        es: 'Estás buscando un doctor. Déjame ayudarte a buscar por especialidad, ubicación u otras preferencias.'
      },
      emergency: {
        en: '🚨 **IMMEDIATE MEDICAL ATTENTION REQUIRED** - Please call emergency services (911/108) immediately!',
        hi: '🚨 **तुरंत चिकित्सा सहायता आवश्यक है** - कृपया तुरंत आपातकालीन सेवाएं (911/108) को कॉल करें!',
        es: '🚨 **SE REQUIERE ATENCIÓN MÉDICA INMEDIATA** - ¡Por favor, llama a emergencias (911) inmediatamente!'
      },
      medication: {
        en: 'You\'re asking about medications. I can provide information about dosages, side effects, and usage.',
        hi: 'आप दवाओं के बारे में पूछ रहे हैं। मैं खुराक, दुष्प्रभाव और उपयोग के बारे में जानकारी प्रदान कर सकता हूं।',
        es: 'Estás preguntando sobre medicamentos. Puedo proporcionar información sobre dosis, efectos secundarios y uso.'
      },
      lab_test: {
        en: 'You\'re asking about lab tests or results. I can help explain what the values mean.',
        hi: 'आप लैब परीक्षण या परिणामों के बारे में पूछ रहे हैं। मैं मूल्यों का अर्थ समझाने में मदद कर सकता हूं।',
        es: 'Estás preguntando sobre pruebas o resultados de laboratorio. Puedo ayudarte a explicar lo que significan los valores.'
      },
      lifestyle: {
        en: 'You\'re interested in lifestyle and wellness guidance. I can help with nutrition, exercise, and stress management.',
        hi: 'आप जीवनशैली और कल्याण मार्गदर्शन में रुचि रखते हैं। मैं पोषण, व्यायाम और तनाव प्रबंधन में मदद कर सकता हूं।',
        es: 'Te interesa la orientación sobre estilo de vida y bienestar. Puedo ayudarte con nutrición, ejercicio y manejo del estrés.'
      },
      pregnancy: {
        en: 'You have questions about pregnancy or women\'s health. Let me provide guidance and help you connect with a specialist.',
        hi: 'आपको गर्भावस्था या महिलाओं के स्वास्थ्य के बारे में प्रश्न हैं। मुझे मार्गदर्शन प्रदान करने दें।',
        es: 'Tienes preguntas sobre el embarazo o la salud de la mujer. Déjame proporcionar orientación.'
      },
      mental_health: {
        en: 'You\'re reaching out about mental health. I\'m here to listen and can connect you with mental health professionals.',
        hi: 'आप मानसिक स्वास्थ्य के बारे में बात कर रहे हैं। मैं यहाँ सुनने के लिए हूँ।',
        es: 'Estás hablando de salud mental. Estoy aquí para escuchar y puedo conectarte con profesionales.'
      },
      pediatric: {
        en: 'You have questions about child health. I can provide pediatric guidance and connect you with a pediatrician.',
        hi: 'आपको बाल स्वास्थ्य के बारे में प्रश्न हैं। मैं बाल चिकित्सा मार्गदर्शन प्रदान कर सकता हूं।',
        es: 'Tienes preguntas sobre la salud infantil. Puedo proporcionar orientación pediátrica.'
      }
    };

    return responses[intentName]?.[language] || responses[intentName]?.en || null;
  }

  /**
   * Get intent metadata and routing info
   * @param {string} intentName
   * @returns {Object} Routing and handling information
   */
  getIntentMetadata(intentName) {
    return this.intents[intentName] || null;
  }

  /**
   * Check if query matches multiple intents
   * @param {Object} classification
   * @returns {boolean}
   */
  hasMultipleIntents(classification) {
    return classification.all_matches && classification.all_matches.length > 1;
  }

  /**
   * Get confidence level description
   * @param {number} confidence - Confidence percentage (0-100)
   * @returns {string} Confidence description
   */
  getConfidenceLevel(confidence) {
    if (confidence >= 80) return 'very_high';
    if (confidence >= 60) return 'high';
    if (confidence >= 40) return 'medium';
    if (confidence >= 20) return 'low';
    return 'very_low';
  }

  /**
   * Get handling strategy based on intent
   * @param {Object} classification
   * @returns {Object} Handling strategy
   */
  getHandlingStrategy(classification) {
    if (!classification.primary) {
      return {
        strategy: 'general_response',
        action: 'default_consultation',
        requiresAI: true,
        priority: 5
      };
    }

    const primary = classification.primary;
    return {
      strategy: primary.name,
      action: primary.action,
      redirectUrl: primary.redirectUrl || null,
      requiresAI: !['appointment', 'doctor_search', 'emergency'].includes(primary.name),
      priority: primary.priority,
      confidence: primary.confidence,
      confidenceLevel: this.getConfidenceLevel(primary.confidence)
    };
  }
}

export default new IntentClassifier();
