# Intent Classification Quick Reference

## What is Intent Classification?

The SIB intent detection system automatically analyzes user queries and routes them to the most appropriate handler BEFORE sending to AI. This prevents hallucination and provides better user experience.

## Quick Intent Examples

| Intent | Example Query | What Happens |
|--------|---------------|--------------|
| 🚨 EMERGENCY | "I can't breathe!" | Immediate alert + hotline numbers + escalation |
| 📅 APPOINTMENT | "Book appointment" | Redirect to `/appointments` with booking flow |
| 🏥 DOCTOR_SEARCH | "Find cardiologist" | Redirect to `/doctors?specialty=cardiology` |
| 👩‍⚕️ PREGNANCY | "I'm pregnant" | Gynecologist specialist referral |
| 🧠 MENTAL_HEALTH | "I'm depressed" | Psychiatrist + crisis resources |
| 👶 PEDIATRIC | "My baby has fever" | Pediatrician + child health info |
| 💊 MEDICAL_CONSULT | "I have headache" | Full AI medical consultation |
| 💉 MEDICATION | "Side effects of aspirin" | AI medication information |
| 🔬 LAB_TEST | "What does TSH mean?" | AI lab result explanation |
| 🏃 LIFESTYLE | "How to lose weight?" | AI lifestyle guidance |
| ℹ️ GENERAL_INFO | "What is diabetes?" | AI general health information |

## How It Works

```
User Message
     ↓
Detect Language (Auto)
     ↓
Extract Keywords
     ↓
Match Against 11 Intent Categories
     ↓
Calculate Confidence Score
     ↓
Route to Handler
     ├─ Emergency → Alert User
     ├─ Appointment → Booking System
     ├─ Specialist → Doctor Search
     └─ Medical → AI Processing
```

## Configuration in Code

### Main Intent Classifier
**File:** `server/utils/intentClassifier.js`

```javascript
import intentClassifier from '../utils/intentClassifier.js';

// Classify a query
const result = intentClassifier.classify(userQuery, language);

console.log(result.primary.name);        // Intent name
console.log(result.primary.confidence);  // 0-95% confidence
console.log(result.primary.action);      // What to do next
console.log(result.primary.matched_keywords); // Which keywords matched
```

### Medical AI Service Integration
**File:** `server/services/medicalAI.service.js`

```javascript
async consultMedical(query, sessionId, language, userContext) {
  // 1. Classify intent (automatic)
  const classification = intentClassifier.classify(query, language);
  
  // 2. Get handling strategy
  const strategy = intentClassifier.getHandlingStrategy(classification);
  
  // 3. Route to handler
  if (strategy.strategy === 'appointment') {
    return appointmentResponse();
  } else if (strategy.requiresAI) {
    return aiConsultation();
  }
}
```

### Frontend Integration
**File:** `client/src/components/DrISHAChat.tsx`

```jsx
// Automatically handles intent responses
if (response.data.intentType === 'appointment') {
  toast.success('Let me help you book an appointment!');
  setTimeout(() => {
    window.location.href = response.data.redirectUrl;
  }, 1500);
}
```

## Multilingual Support

Automatic language detection:

```javascript
// English
"Book an appointment" → appointment (45% confidence)

// Hindi
"अपॉइंटमेंट बुक करना है" → appointment (46% confidence)

// Spanish
"Quiero reservar una cita" → appointment (35% confidence)
```

## Confidence Levels

- **90-95%:** Very high confidence, clear intent
- **70-89%:** High confidence, likely correct
- **50-69%:** Medium confidence, reasonable assumption
- **30-49%:** Low confidence, might need clarification
- **<30%:** Very low confidence, may route to AI

## Response Examples

### Emergency Intent
```
🚨 EMERGENCY - IMMEDIATE MEDICAL ATTENTION REQUIRED

Based on your message, this appears to be a medical emergency.

CALL EMERGENCY SERVICES IMMEDIATELY:
🔴 Emergency Hotline: 911 (USA) or 108 (India)
⏰ TIME IS CRITICAL - Call Now
```

### Appointment Intent
```
I'd be happy to help you book an appointment! 📅

To get you connected with the right healthcare professional:
✅ Browse available doctors by specialty
✅ Check doctor availability and time slots
✅ Book appointments online or in-person

Next Steps: Click "Book Appointment" button below
```

### Specialist Referral (Pregnancy)
```
I understand you have questions about pregnancy! 🤰

Important: Work with a qualified Gynecologist or Obstetrician.

Key Experts:
👩‍⚕️ Gynecologist - Women's health and pregnancy care
👨‍⚕️ Obstetrician - Specialized in labor and delivery
```

## Testing

Run automated tests:
```bash
cd /home/ubuntu/Mediczy
node --input-type=module -e "
import IntentClassificationTester from './server/tests/intentClassifier.test.js';
const tester = new IntentClassificationTester();
tester.runAllTests();
"
```

## Adding New Intents

To add a new intent category:

1. **Edit `server/utils/intentClassifier.js`:**
```javascript
new_intent: {
  keywords: {
    en: ['keyword1', 'keyword2', 'keyword3'],
    hi: ['हिंदी_कीवर्ड1', 'हिंदी_कीवर्ड2'],
    es: ['palabra_clave1', 'palabra_clave2']
  },
  priority: 2,  // 0=highest, 5=lowest
  action: 'action_type',
  redirectUrl: '/optional-redirect'
}
```

2. **Add response method in `server/services/medicalAI.service.js`:**
```javascript
getNewIntentResponse(language = 'en') {
  const responses = {
    en: 'English response...',
    hi: 'हिंदी प्रतिक्रिया...',
    es: 'Respuesta en español...'
  };
  return responses[language] || responses['en'];
}
```

3. **Add router handler in `consultMedical()` method:**
```javascript
if (classification.primary?.name === 'new_intent') {
  return {
    success: true,
    response: this.getNewIntentResponse(language),
    intentType: 'new_intent',
    // ... other fields
  };
}
```

4. **Test with real queries:**
```bash
node --input-type=module -e "
import intentClassifier from './server/utils/intentClassifier.js';
const result = intentClassifier.classify('your test query', 'en');
console.log(result);
"
```

## Troubleshooting

### Query not detecting correct intent?
1. Check matched_keywords in response
2. Add missing keywords to intent definition
3. Adjust priority if conflicting with other intent
4. Test language detection first

### Confidence too low?
1. Check keyword match count
2. Add more specific keywords
3. Increase priority (lower number = higher priority)
4. Verify language is detected correctly

### Wrong specialist recommended?
1. Check `specialization` field in intent config
2. Verify `/doctors?specialty=X` endpoint has that specialty
3. Update doctor listing backend if needed

## Performance

- **Classification time:** <5ms per query
- **Memory overhead:** ~50KB for classifier instance
- **Supported languages:** English, Hindi, Spanish
- **Intent categories:** 11 primary + extensible
- **Confidence range:** 0-95%

## Best Practices

1. ✅ **Keep keywords concise:** Use single or 2-word phrases
2. ✅ **Include variations:** "book", "schedule", "reserve" for appointments
3. ✅ **Set realistic priorities:** Emergency (0) > Specialist (2) > Lifestyle (4)
4. ✅ **Provide responses:** Every intent should have multilingual response
5. ✅ **Test thoroughly:** Use provided test suite before deployment
6. ✅ **Monitor accuracy:** Track matched intent distribution in logs
7. ✅ **Update keywords:** Add new keywords based on user queries
8. ✅ **Fallback gracefully:** Let AI handle if intent unclear (confidence < 30%)

## API Integration

```javascript
// POST /api/medical-ai/consult
{
  "query": "Book appointment",
  "language": "en",
  "sessionId": "session-123"
}

// Response includes:
{
  "intentType": "appointment",
  "action": "redirect_to_booking",
  "redirectUrl": "/appointments",
  "confidence": 45,
  "matched_keywords": ["book", "appointment"]
}
```

---

**For detailed documentation:** See `INTENT_CLASSIFICATION_SYSTEM.md`
