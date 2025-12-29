# Intent Classifier Developer Guide

## Overview

This guide helps developers understand and work with the SIB intent classification system.

## Architecture

### Directory Structure
```
server/
├── utils/
│   └── intentClassifier.js          # Core classifier
├── services/
│   └── medicalAI.service.js         # Integration point
├── tests/
│   └── intentClassifier.test.js     # Test suite
└── routes/
    └── ai.js                         # API route handler

client/
└── src/
    └── components/
        └── DrISHAChat.tsx            # Frontend response handler
```

### Component Interaction

```
DrISHAChat (Frontend)
    ↓ sends query
API Route (/medical-ai/consult)
    ↓
Medical AI Service
    ↓ classifies
Intent Classifier
    ↓ returns classification
Medical AI Service
    ↓ routes to handler
[Response Handler]
    ↓ returns response
DrISHAChat (Frontend)
    ↓ handles intent type
[UI Action - Redirect/Modal/Alert]
```

## Core Files

### 1. Intent Classifier
**Location:** `server/utils/intentClassifier.js`

**Exports:** `intentClassifier` singleton instance

**Key Methods:**
```javascript
// Classify a query
classify(query: string, language: string): Classification
- Input: "Book appointment with doctor", "en"
- Output: { primary, secondary, all_matches, language, score_breakdown }

// Auto-detect language
detectLanguage(query: string): 'en' | 'hi' | 'es'
- Input: "अपॉइंटमेंट बुक करना है"
- Output: "hi"

// Get handling strategy
getHandlingStrategy(classification): Strategy
- Returns: { strategy, action, requiresAI, priority, confidence }

// Get response template
getIntentResponse(intentName, language): string
- Returns: Multilingual response template

// Get metadata
getIntentMetadata(intentName): IntentConfig
- Returns: Priority, keywords, action, redirectUrl
```

### 2. Medical AI Service Integration
**Location:** `server/services/medicalAI.service.js`

**Modified Method:** `consultMedical()`

**Flow:**
```javascript
async consultMedical(query, sessionId, language, userContext) {
  // 1. Classify intent (automatic)
  const classification = intentClassifier.classify(query, language);
  const strategy = intentClassifier.getHandlingStrategy(classification);
  
  // 2. Route to handler (before AI processing)
  if (strategy.priority === 0) { // Emergency
    return emergencyResponse();
  } else if (strategy.strategy === 'appointment') {
    return appointmentResponse();
  } else if (strategy.requiresAI) {
    // Continue to AI processing
    return aiConsultation();
  }
  
  // 3. Return response
  return response;
}
```

### 3. Frontend Handler
**Location:** `client/src/components/DrISHAChat.tsx`

**Response Handler:**
```jsx
// In onResponseReceived or after API response
const responseData = response.data;

if (responseData.intentType === 'emergency') {
  toast.error('EMERGENCY - Call services!');
  redirect('/emergency');
} else if (responseData.intentType === 'appointment') {
  toast.success('Booking appointment...');
  redirect('/appointments');
} else if (responseData.action === 'redirect_to_booking') {
  redirect(responseData.redirectUrl);
}
```

## API Responses

### Response Structure
```json
{
  "success": true,
  "response": "User-facing response text",
  "doctor": "Dr. iSHA",
  "sessionId": "session-abc123",
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

### Intent Type Mapping
```javascript
response.intentType → Frontend Action

'emergency'      → Immediate alert + redirect /emergency
'appointment'    → Toast + redirect /appointments
'doctor_search'  → Toast + redirect /doctors
'pregnancy'      → Specialist search (OB/GYN)
'mental_health'  → Specialist search (Psychiatrist)
'pediatric'      → Specialist search (Pediatrician)
'medical_consult'→ No redirect (normal response)
'medication'     → No redirect (normal response)
'lab_test'       → No redirect (normal response)
'lifestyle'      → No redirect (normal response)
```

## Adding New Intents

### Step 1: Define Intent
**File:** `server/utils/intentClassifier.js`

```javascript
new_medical_specialty: {
  keywords: {
    en: ['urology', 'urologist', 'kidney problem', 'bladder'],
    hi: ['यूरोलॉजी', 'किडनी', 'मूत्र'],
    es: ['urología', 'urólogo', 'riñón']
  },
  priority: 2,  // Specialist priority
  action: 'show_specialist',
  specialization: 'urologist'  // For doctor search filter
}
```

### Step 2: Add Response Handler
**File:** `server/services/medicalAI.service.js`

```javascript
getUrology SpecialistResponse(language = 'en') {
  const responses = {
    en: `I understand you have urology-related concerns! 🏥
    
Important: Consult a **Urologist** for these issues.

A Urologist specializes in:
✅ Kidney and bladder disorders
✅ Urinary tract infections
✅ Prostate health
✅ Fertility issues

Let me help you find a qualified Urologist.`,
    
    hi: `मुझे समझ आया कि आपको यूरोलॉजी संबंधी चिंताएं हैं! 🏥
    
एक **यूरोलॉजिस्ट** से सलाह लें।`,
    
    es: `¡Entiendo que tienes problemas de urología! 🏥
    
Consulta a un **Urólogo** para estos problemas.`
  };
  return responses[language] || responses['en'];
}
```

### Step 3: Add Router in consultMedical()
**File:** `server/services/medicalAI.service.js`

```javascript
if (classification.primary?.name === 'new_medical_specialty') {
  console.log('🏥 Urology intent detected');
  return {
    success: true,
    response: this.getUrologySpecialistResponse(language),
    doctor: this.doctorName,
    sessionId: sessionId,
    timestamp: new Date().toISOString(),
    language: language,
    provider: 'intent-detector',
    intentType: 'urology',
    action: 'show_specialist',
    specialization: 'urologist',
    redirectUrl: '/doctors?specialty=urology',
    confidence: classification.primary.confidence,
    matched_keywords: classification.primary.matched_keywords
  };
}
```

### Step 4: Frontend Handling (Optional)
**File:** `client/src/components/DrISHAChat.tsx`

```jsx
else if (response_data.intentType === 'urology') {
  toast.info('Connecting you with a Urologist');
  setTimeout(() => {
    window.location.href = `/doctors?specialty=urology`;
  }, 1500);
}
```

### Step 5: Test
```bash
node --input-type=module -e "
import intentClassifier from './server/utils/intentClassifier.js';
const result = intentClassifier.classify('I have kidney problems', 'en');
console.log(result.primary.name); // Should output: 'new_medical_specialty'
"
```

## Testing

### Run Full Test Suite
```bash
cd /home/ubuntu/Mediczy
node --input-type=module -e "
import IntentClassificationTester from './server/tests/intentClassifier.test.js';
const tester = new IntentClassificationTester();
tester.runAllTests();
tester.testLanguageDetection();
tester.testConfidenceScoring();
"
```

### Manual Testing
```javascript
// Test single query
const result = intentClassifier.classify('Book an appointment', 'en');

console.log('Primary Intent:', result.primary.name);
console.log('Confidence:', result.primary.confidence + '%');
console.log('Action:', result.primary.action);
console.log('Keywords Matched:', result.primary.matched_keywords);
console.log('Score Breakdown:', result.score_breakdown);
```

### Test Custom Intent
```javascript
import intentClassifier from './server/utils/intentClassifier.js';

const testCases = [
  { query: 'I need urology help', language: 'en', expected: 'new_medical_specialty' },
  { query: 'किडनी की समस्या', language: 'hi', expected: 'new_medical_specialty' },
  { query: 'problemas de riñón', language: 'es', expected: 'new_medical_specialty' }
];

for (const test of testCases) {
  const result = intentClassifier.classify(test.query, test.language);
  const passed = result.primary?.name === test.expected;
  console.log(`${passed ? '✅' : '❌'} ${test.query}`);
}
```

## Debugging

### Enable Detailed Logging
**File:** `server/services/medicalAI.service.js`

```javascript
// In consultMedical method, after classification:
console.log('=== INTENT CLASSIFICATION DEBUG ===');
console.log('Query:', query);
console.log('Detected Language:', language);
console.log('Primary Intent:', classification.primary?.name);
console.log('Confidence:', classification.primary?.confidence + '%');
console.log('Matched Keywords:', classification.primary?.matched_keywords);
console.log('All Matches:', classification.all_matches);
console.log('Score Breakdown:', classification.score_breakdown);
console.log('Strategy:', handlingStrategy);
console.log('===================================');
```

### Common Issues

**Issue:** Intent not detected (returns null)
```javascript
// Solution: Check if keywords match
const keywords = intentClassifier.intents.appointment.keywords.en;
const query = 'book appointment';
const matches = keywords.filter(k => query.includes(k.toLowerCase()));
console.log('Matched keywords:', matches);
```

**Issue:** Wrong intent detected
```javascript
// Solution: Check competing intents
const result = intentClassifier.classify(query, language);
console.log('Top 5 intents:', result.score_breakdown);
// Adjust keywords or priority to fix ranking
```

**Issue:** Confidence too low
```javascript
// Solution: Add more keywords or boost priority
// Edit: server/utils/intentClassifier.js
keywords: {
  en: [...existing, 'new_keyword1', 'new_keyword2']
}
```

## Performance Optimization

### Caching Classifier
```javascript
// Instead of importing multiple times:
import intentClassifier from '../utils/intentClassifier.js';

// Use singleton (already done):
// intentClassifier is cached and reused
```

### Batch Processing
```javascript
// For processing multiple queries:
const queries = ['query1', 'query2', 'query3'];
const results = queries.map(q => 
  intentClassifier.classify(q, 'en')
);

// Time complexity: O(n) where n = number of queries
```

### Language Detection Performance
```javascript
// Language detection is O(1) - just checks script and patterns
// Already optimized in classify() method
```

## Monitoring & Analytics

### Track Intent Distribution
```javascript
// In API route handler:
const classification = intentClassifier.classify(query, language);

// Log for analytics
analytics.logIntent({
  intent: classification.primary?.name,
  confidence: classification.primary?.confidence,
  language: language,
  timestamp: new Date(),
  userId: userContext.userId
});
```

### Monitor Accuracy
```javascript
// Store when users correct AI
if (userFeedback.correct === false) {
  analytics.logIncorrectIntent({
    query: userQuery,
    predicted: classification.primary.name,
    actual: userFeedback.correctIntent,
    confidence: classification.primary.confidence
  });
}
```

## Best Practices

1. **Keep Keywords Specific**
   - ❌ "health" (too generic)
   - ✅ "book appointment" (specific phrase)

2. **Include Variations**
   - ✅ "book", "schedule", "reserve", "appointment"
   - ❌ Just "appointment"

3. **Set Correct Priority**
   - Priority 0: Only for true emergencies
   - Priority 1-2: For specialized routing
   - Priority 3-5: For AI consultation

4. **Multilingual Keywords**
   - Always include en, hi, es versions
   - Use native speakers to verify

5. **Test Before Deploy**
   - Run test suite
   - Manual testing with edge cases
   - Monitor production accuracy

6. **Handle Edge Cases**
   - Misspellings (spell-check integration needed)
   - Slang/informal language (add variations)
   - Multiple intents in one query (secondary intents help)

## Troubleshooting Checklist

- [ ] Import intentClassifier correctly?
- [ ] Language parameter correct?
- [ ] Keywords lowercase in classifier?
- [ ] Response template multilingual?
- [ ] Frontend handler for intentType?
- [ ] Redirect URL exists?
- [ ] Test suite passing?
- [ ] Logs showing correct classification?
- [ ] Confidence score reasonable?
- [ ] Edge cases handled?

---

**Last Updated:** December 24, 2025
**Version:** 1.0
**Maintainer:** Development Team
