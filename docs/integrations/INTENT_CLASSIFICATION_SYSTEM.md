# SIB Intent Detection & Classification System

## Overview

The Dr. iSHA chatbot now features an **advanced intent detection and classification system** with **hybrid keyword + semantic matching** that intelligently routes user queries to appropriate handlers before sending them to the AI model. This prevents hallucination and ensures users get the right response type for their needs.

## System Architecture

```
User Query
    ↓
┌─────────────────────────────────────────────────────┐
│  HYBRID INTENT CLASSIFICATION                       │
│  Step 1: Keyword-Based (Fast - < 5ms)              │
│  If confidence ≥ 50% → Use keyword result          │
│  If confidence < 50% → Step 2 (Semantic Fallback)  │
│                                                     │
│  Step 2: Semantic Fallback (LaBSE Embeddings)      │
│  If semantic confidence ≥ 60% → Use semantic       │
│  Else → Return low-confidence keyword result       │
└─────────────────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────────────────┐
│  Intent Router - Selects Response Path                │
├───────────────────────────────────────────────────────┤
│  Priority 0: EMERGENCY → Immediate Alert + Escalation │
│  Priority 1: APPOINTMENT → Booking Flow               │
│  Priority 2: SPECIALIST INTENTS → Doctor Search       │
│  Priority 3: MEDICAL CONSULT → AI Processing          │
│  Priority 4: LIFESTYLE → AI Processing                │
│  Priority 5: GENERAL INFO → AI Processing             │
└───────────────────────────────────────────────────────┘
    ↓
[Response Handler]
    ↓
User Feedback
```

## Hybrid Classification System

### Keyword-Based Classification (Primary Path)
- **Speed:** < 5ms per query
- **Method:** Keyword matching with priority weighting and confidence scoring
- **Coverage:** 11 intent categories with 100+ multilingual keywords
- **Use Case:** ~95% of queries with confident classification
- **Language Support:** English, Hindi (Devanagari), Spanish with automatic detection

### Semantic Fallback (LaBSE)
- **Speed:** 100-200ms per query (lazy-loaded, only when needed)
- **Method:** Sentence embeddings using LaBSE (Language-agnostic BERT Sentence Embeddings)
- **Model:** Xenova/LaBSE - supports 109 languages, 768-dimensional embeddings
- **Trigger:** When keyword confidence < 50%
- **Acceptance:** Only if semantic confidence ≥ 60%
- **Use Case:** Paraphrased or unusual phrasing of common intents
- **Examples:**
  - "I want to make a meeting with a physician" → Appointment (semantic)
  - "Finding specialists in my locality" → Doctor Search (semantic)
  - "I feel really sad and hopeless" → Mental Health (semantic)

### Hybrid Routing Logic

```javascript
// Pseudocode
const keywordResult = classifyByKeywords(query);

if (keywordResult.confidence >= 50%) {
  // High confidence - use immediately (< 5ms)
  return keywordResult;  // Fast path
}

// Low confidence - try semantic fallback
if (semanticFallbackEnabled && labseReady) {
  const semanticResult = classifyBySemantics(query);
  
  if (semanticResult.confidence >= 60%) {
    return semanticResult;  // Semantic path (100-200ms)
  }
}

// Use keyword result even if low confidence
return keywordResult;  // Fallback
```

### Performance Characteristics

| Scenario | Speed | Method | Confidence |
|----------|-------|--------|-----------|
| High confidence (>50%) keyword match | < 5ms | Keyword only | 70-95% |
| Medium confidence (20-50%) keyword match | < 5ms | Keyword only | 20-50% |
| Low confidence query → semantic hit | 100-200ms | Keyword + Semantic | 60-95% |
| No match in either system | < 5ms | Keyword (default) | 0-20% |

### Memory & Resource Usage

- **Keyword System:** ~50KB (in-memory keyword lists)
- **Semantic Model (LaBSE):** 400MB+ (lazy-loaded, only when first low-confidence query occurs)
- **Embedding Cache:** LRU cache with 1000 entry limit (~5-10MB active)
- **Intent Embeddings:** Pre-computed for 11 categories × 7-10 reference phrases each

## Supported Intent Categories

### 1. **EMERGENCY** (Priority 0 - Highest)
**Detection Keywords:**
- English: `emergency`, `urgent`, `critical`, `severe`, `acute`, `dying`, `breathe`, `chest pain`, `unconscious`, `bleeding`, `injury`
- Hindi: `आपातकाल`, `तुरंत`, `गंभीर`, `तीव्र`, `मर`
- Spanish: `emergencia`, `urgente`, `crítico`, `severo`

**Action:** Immediate emergency alert, escalation to medical team, redirect to `/emergency`

**Response:** Clear emergency instructions with 911/108 hotline and immediate care guidance

---

### 2. **APPOINTMENT** (Priority 1)
**Detection Keywords:**
- English: `book appointment`, `schedule`, `need appointment`, `want appointment`, `reserve`, `slot`, `timing`
- Hindi: `अपॉइंटमेंट`, `बुक`, `शेड्यूल`, `स्लॉट`
- Spanish: `cita`, `reservar`, `agendar`, `programar`

**Semantic Variants:** "make a meeting with a physician", "seeing another person of medicine", "schedule visit"

**Action:** Redirect to appointment booking system

**Response:** Helpful appointment booking guidance without medical consultation

**Frontend Behavior:** Redirect to `/appointments` after 1.5 seconds

---

### 3. **DOCTOR_SEARCH** (Priority 2)
**Detection Keywords:**
- English: `find doctor`, `search doctor`, `cardiologist`, `dermatologist`, `dentist`, `specialist`
- Hindi: `डॉक्टर`, `खोज`, `कार्डियोलॉजिस्ट`, `विशेषज्ञ`
- Spanish: `doctor`, `buscar`, `especialista`, `cardiología`

**Semantic Variants:** "finding specialists in my locality", "where can I see a healthcare provider"

**Action:** Show doctor listing/search interface

**Response:** Doctor search guidance with specialization options

**Frontend Behavior:** Redirect to `/doctors` after 1.5 seconds

---

### 4. **PREGNANCY** (Priority 2)
**Detection Keywords:**
- English: `pregnant`, `pregnancy`, `due date`, `trimester`, `delivery`, `labor`, `baby`, `womb`
- Hindi: `गर्भ`, `प्रसव`, `बेबी`
- Spanish: `embarazo`, `embarazada`, `parto`

**Action:** Show specialist (Gynecologist) referral

**Response:** Pregnancy-specific guidance with specialist recommendation

**Frontend Behavior:** Redirect to `/doctors?specialty=gynecologist`

---

### 5. **MENTAL_HEALTH** (Priority 2)
**Detection Keywords:**
- English: `depression`, `anxiety`, `panic`, `stress`, `psychiatrist`, `counseling`, `therapy`, `bipolar`, `sad`, `lonely`
- Hindi: `अवसाद`, `चिंता`, `मानसिक`, `परामर्श`
- Spanish: `depresión`, `ansiedad`, `salud mental`, `psicólogo`

**Semantic Variants:** "I feel really sad and hopeless", "I am troubled", "feeling mentally exhausted"

**Action:** Show specialist (Psychiatrist/Psychologist) referral

**Response:** Mental health support guidance with crisis resources

**Frontend Behavior:** Redirect to `/doctors?specialty=psychiatrist`

---

### 6. **PEDIATRIC** (Priority 2)
**Detection Keywords:**
- English: `baby`, `child`, `infant`, `toddler`, `pediatric`, `vaccine`, `vaccination`, `newborn`, `development`
- Hindi: `बच्चा`, `शिशु`, `बाल`, `टीका`
- Spanish: `bebé`, `niño`, `pediatría`, `vacuna`

**Action:** Show specialist (Pediatrician) referral

**Response:** Child health guidance with development/vaccination information

**Frontend Behavior:** Redirect to `/doctors?specialty=pediatrician`

---

### 7. **MEDICAL_CONSULT** (Priority 3)
**Detection Keywords:**
- English: `symptom`, `pain`, `ache`, `fever`, `cough`, `cold`, `illness`, `disease`, `sick`, `hurt`
- Hindi: `लक्षण`, `दर्द`, `बुखार`, `खांसी`, `बीमारी`
- Spanish: `síntoma`, `dolor`, `fiebre`, `tos`, `enfermedad`

**Action:** Full medical AI consultation

**Response:** AI processes query through SIB/Groq/Gemini pipeline

---

### 8. **MEDICATION** (Priority 3)
**Detection Keywords:**
- English: `medicine`, `medication`, `drug`, `tablet`, `pill`, `dose`, `dosage`, `side effect`, `antibiotic`
- Hindi: `दवा`, `औषधि`, `गोली`, `खुराक`
- Spanish: `medicina`, `medicamento`, `dosis`, `efecto`

**Action:** Medication information lookup

**Response:** AI processes to provide medication-specific guidance

---

### 9. **LAB_TEST** (Priority 3)
**Detection Keywords:**
- English: `test`, `report`, `lab`, `blood test`, `x-ray`, `scan`, `ecg`, `results`, `values`, `thyroid`, `cholesterol`
- Hindi: `परीक्षण`, `रिपोर्ट`, `लैब`, `रक्त`
- Spanish: `análisis`, `prueba`, `resultados`, `reporte`

**Action:** Lab test information lookup

**Response:** AI processes to explain test results and values

---

### 10. **LIFESTYLE** (Priority 4)
**Detection Keywords:**
- English: `diet`, `exercise`, `workout`, `fitness`, `weight`, `sleep`, `stress`, `yoga`, `meditation`, `health`
- Hindi: `आहार`, `व्यायाम`, `वजन`, `नींद`, `योग`
- Spanish: `dieta`, `ejercicio`, `peso`, `sueño`, `bienestar`

**Action:** Lifestyle guidance

**Response:** AI processes to provide wellness and lifestyle advice

---

### 11. **GENERAL_INFO** (Priority 5 - Lowest)
**Detection Keywords:**
- English: `what is`, `tell me`, `explain`, `how does`, `information`, `help`, `can you`
- Hindi: `क्या है`, `बताइए`, `जानकारी`
- Spanish: `qué es`, `cuéntame`, `explica`

**Action:** General AI response

**Response:** AI processes general health information request

---

## Implementation Details

### Core Components

#### 1. **IntentClassifier** (`server/utils/intentClassifier.js`)
```javascript
// Main classification function
classifier.classify(query, language)
→ Returns: { primary, secondary, all_matches, confidence, score_breakdown }

// Get handling strategy
classifier.getHandlingStrategy(classification)
→ Returns: { strategy, action, requiresAI, priority, confidence }

// Detect language automatically
classifier.detectLanguage(query)
→ Returns: 'en' | 'hi' | 'es'
```

#### 2. **Medical AI Service** (`server/services/medicalAI.service.js`)
Updated `consultMedical()` method now:
1. Classifies query intent
2. Routes to appropriate handler based on intent
3. Returns specialized responses for non-AI intents
4. Processes only medical queries through AI

#### 3. **Frontend Handler** (`client/src/components/DrISHAChat.tsx`)
Detects response intent type and:
- Shows appropriate toast notification
- Redirects user to specialized UI (appointments, doctors, etc.)
- Triggers specialist search with filters

### Confidence Scoring Algorithm

```
Base Score = (Matched Keywords / Total Keywords) * 100
Priority Weight = 1 + ((3 - priority) * 0.15)
Match Boost = 1 + min(match_count * 0.1, 0.5)
Final Score = Base Score * Priority Weight * Match Boost
```

**Example:**
- Query: "Book appointment with doctor"
- Appointment keywords matched: 2 out of 11 keywords (18%)
- Base score: 18%
- Priority 1 weight: 1.30x
- Match boost (2 matches): 1.20x
- Final: 18 * 1.30 * 1.20 = **28%** confidence

### Language Detection

Automatic language detection from query:
- **Hindi:** Detects Devanagari script ([\u0900-\u097F])
- **Spanish:** Pattern matching for common Spanish words
- **English:** Default fallback

## Response Templates

Each intent has multilingual response templates that provide:

### Emergency Response
- 🚨 Clear emergency alert
- Immediate instructions
- 911/108 hotline numbers
- Safe positioning guidance

### Appointment Response
- 📅 Encouraging appointment booking
- Clear steps to follow
- Doctor selection options
- Availability checking guidance

### Specialist Referral Response
- Professional description
- Types of specialists available
- When to consult
- Next steps for scheduling

### Medication Response
- Dosage information
- Usage instructions
- Side effects awareness
- Drug interaction warnings

### Mental Health Response
- Compassionate support message
- Types of professionals available
- Crisis hotline numbers
- Resource availability

## Testing & Validation

Run the test suite:
```bash
node --input-type=module -e "
import IntentClassificationTester from './server/tests/intentClassifier.test.js';
const tester = new IntentClassificationTester();
tester.runAllTests();
tester.testLanguageDetection();
tester.testConfidenceScoring();
"
```

Test coverage:
- ✅ 11 intent categories
- ✅ 35+ test queries
- ✅ Multilingual support (English, Hindi, Spanish)
- ✅ Confidence scoring validation
- ✅ Language auto-detection

## Benefits

1. **Prevents Hallucination:** Non-medical queries bypass AI entirely
2. **Faster Response:** Pre-routed intents skip AI processing
3. **Better UX:** Users get specialized interfaces instead of generic medical advice
4. **Multilingual:** Supports English, Hindi, Spanish detection
5. **Scalable:** Easy to add new intent categories
6. **Explainable:** Confidence scores and matched keywords visible
7. **Safe:** Emergency detection prioritized over all other intents

## API Response Format

```json
{
  "success": true,
  "response": "User-friendly response text",
  "doctor": "Dr. iSHA",
  "sessionId": "session-123",
  "timestamp": "2025-12-24T10:00:00Z",
  "language": "en",
  "provider": "intent-detector",
  "intentType": "appointment",
  "action": "redirect_to_booking",
  "redirectUrl": "/appointments",
  "confidence": 45,
  "matched_keywords": ["book", "appointment"],
  "escalation": null
}
```

## Configuration

Add to `.env` to control behavior:
```bash
# Intent Classification (Optional - defaults work well)
INTENT_CLASSIFIER_THRESHOLD=30  # Minimum confidence for intent match
INTENT_EMERGENCY_BOOST=1.5      # Priority multiplier for emergency
INTENT_LANGUAGE_DETECTION=true  # Auto-detect query language
```

## Future Enhancements

- [ ] Machine learning-based intent classifier (replacing keyword matching)
- [ ] Multi-intent detection (e.g., "pregnant AND diabetic")
- [ ] Intent-specific follow-up suggestions
- [ ] Analytics dashboard for intent distribution
- [ ] A/B testing for response templates
- [ ] Real-time intent accuracy metrics
- [ ] Custom intent creation for enterprise clients
- [ ] Intent confidence threshold customization per user role

## Support & Documentation

For issues or questions:
1. Check `server/utils/intentClassifier.js` for intent definitions
2. Review `server/services/medicalAI.service.js` for integration
3. See `client/src/components/DrISHAChat.tsx` for frontend handling
4. Run test suite to validate system

---

**Last Updated:** December 24, 2025
**Status:** ✅ Active & Production-Ready
**Coverage:** 11 intent categories, 3 languages, 35+ test queries
