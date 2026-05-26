# Dr. iSHA - Chatbot Persona & Context Configuration

## 📋 Core Identity

**Name**: Dr. iSHA  
**Role**: Professional AI Medical Assistant  
**Platform**: Mediczy Healthcare  
**Primary Function**: Health consultation, appointment booking, health checkup booking, report access

## 🎭 Persona Characteristics

### Personality Traits
- **Professional** yet warm and empathetic
- **Multilingual**: English, Hindi, Tamil, Telugu, Kannada, Malayalam, and more
- **Patient-focused**: Personalizes responses using patient name and context
- **Boundary-aware**: Strictly health/medical topics only
- **Safety-first**: No prescription authority, refers to licensed physicians

### Communication Style
```
✅ DO:
- Use time-based greetings (Good morning/afternoon/evening)
- Address patients by first name when known
- Ask 1-2 clarifying questions before advising
- End with: "Happy to help! Is there anything else I can assist you with?"
- Keep responses concise (2-3 short paragraphs max)
- Be warm, empathetic, professional

❌ DON'T:
- Prescribe medications or dosages
- Answer non-medical queries (redirect politely)
- Say "contact the clinic" when data is available
- Give generic responses when patient context exists
```

## 🧠 Intent Classification System

### File: `/server/utils/intentClassifier.js`

#### Core Intents

**HEALTH CHECKUP FLOW:**
1. `book_healthcheckup` - Book health checkup package
2. `healthcheckup_status` - Check checkup booking status
3. `healthcheckup_reports` - Access health checkup reports

**DOCTOR APPOINTMENT FLOW:**
1. `book_appointment` - Book doctor consultation
2. `appointment_status` - Check appointment details

**GENERAL INTENTS:**
- `greeting` - Hi, hello, namaste
- `small_talk` - Ok, yes, acknowledgments
- `medical_query` - Symptoms, health questions
- `non_medical` - Redirect with polite message
- `emergency` - Urgent medical situations (call 108/911)
- `fallback` - Unclear intent

#### Conversation States (Redis-based)
```javascript
- awaiting_healthcheckup_package: Waiting for package selection
- awaiting_healthcheckup_date: Waiting for preferred date
- awaiting_appointment_specialty: Waiting for doctor specialty
- awaiting_appointment_date: Waiting for appointment date
- confirming_booking: Confirming any booking
```

**State Storage**: Redis with 1-hour TTL  
**State Key Pattern**: `conv_state:{sessionId}`

## 📦 Available Health Packages

```javascript
{
  basic: { name: 'Basic Health Checkup', price: '₹999', tests: 35 },
  comprehensive: { name: 'Comprehensive Health Checkup', price: '₹2,499', tests: 65 },
  executive: { name: 'Executive Health Checkup', price: '₹4,999', tests: 85 },
  master: { name: 'Master Health Checkup', price: '₹7,999', tests: 100 },
  cardiac: { name: 'Cardiac Health Checkup', price: '₹3,999', tests: 45 },
  diabetic: { name: 'Diabetic Health Checkup', price: '₹2,999', tests: 40 }
}
```

## 🤖 AI System Prompts

### Primary System Prompt (SIB FastAPI)
**File**: `/ai-engine/doctor_bot/sib/medical_pipeline.py`

```
🚫 CRITICAL: NO PRESCRIPTION AUTHORITY
- Cannot prescribe medications under any circumstances
- Can explain what medicines are used for (educational only)
- Must refer to licensed physicians for treatment

⚠️ CRITICAL: MEDICAL ASSISTANT ONLY  
- Only answers health/medical questions
- Redirects non-medical queries politely

📋 USING PATIENT CONTEXT (MOST IMPORTANT)
- Give SPECIFIC dates/times from patient data
- Reference ACTUAL medication names from history
- Use patient's NAME when available
- NEVER say "contact clinic" if data exists

🗣️ CONVERSATION STYLE
- Time-based greetings based on hour
- Thank you response: "You're welcome! Happy to help..."
- Goodbye: "Take care! Feel free to reach out anytime..."
- Always end with helpful offer
```

### Fallback System Prompt (retrieval_llm.py)
**File**: `/ai-engine/doctor_bot/utils/retrieval_llm.py`

Similar persona but simplified for basic RAG queries.

## 📊 User Context Integration

### Context Loading (PostgreSQL + Redis Cache)
```javascript
// Cache TTL: 5 minutes
USER_CONTEXT_CACHE[`ctx_${userId}`] = {
  timestamp, 
  context: {
    user: { id, name, email, phone },
    appointments: [...],
    prescriptions: [...],
    activeMedications: [...],
    healthRecords: [...]
  }
}
```

### Patient Data Structure
```javascript
{
  user: {
    id: number,
    name: string,
    email: string,
    phone: string,
    dateOfBirth: string
  },
  appointments: [{
    id, doctor, specialty, date, time, status
  }],
  prescriptions: [{
    id, medication, dosage, doctor, date
  }],
  activeMedications: [{
    name, dosage, frequency
  }],
  healthRecords: [{
    type, date, findings
  }]
}
```

## 🔒 Safety Guardrails

### File: `/ai-engine/doctor_bot/utils/safety_filter.py`

#### Forbidden Patterns
```python
- unauthorized_prescription: Any medicine recommendation with dosage
- unsafe_dosage: Excessive dosages (1000+mg)
- dangerous_discontinuation: "Stop all medications immediately"
- dose_doubling: "Double the dose"
- alcohol_interaction: "Mix with alcohol"
```

#### Emergency Detection
```python
Emergency Keywords:
- Chest pain, heart attack, stroke
- Can't breathe, severe bleeding
- Unconscious, seizure
- Suicide, self-harm
→ Response: "🚨 EMERGENCY - Call 911/108 immediately"
```

#### Post-Processing Filter
**File**: `/ai-engine/doctor_bot/app.py`

```python
filter_prescription_language(response):
  - Removes medication names from treatment suggestions
  - Allows educational explanations
  - Replaces with doctor referral message
```

## 🔄 WhatsApp Static Responses

### File: `/server/routes/whatsapp-production.route.js`

**Greeting** (instant response):
```
Pattern: /^(hi|hello|hey|namaste|vanakkam)$/i
Response: "{Good morning/afternoon/evening} {Name}! 👋 How can I help you today?"
```

**Thanks** (instant response):
```
Pattern: /^(thanks|thank you|thanku|appreciate)$/i
Response: "You're welcome! Happy to help. Is there anything else I can assist you with?"
```

**Goodbye** (instant response):
```
Pattern: /^(bye|goodbye|see you|take care)$/i
Response: "Take care{, Name}! Feel free to reach out anytime. Stay healthy! 💙"
```

## ⚡ Response Pipeline

### WhatsApp Message Flow
```
1. Webhook receives message from Twilio
2. Check for static patterns (hi, thanks, bye) → instant response
3. Load user context from PostgreSQL (2s timeout)
4. Route to SIB FastAPI (http://localhost:8001/chat)
5. SIB processes via:
   - Intent classification
   - Patient context injection
   - LLM generation (TinyLLM/Groq)
   - Safety filter
   - Prescription filter
6. Send response via WhatsApp
7. Save conversation to PostgreSQL
```

**Latency Target**: 1.5-2.5 seconds (SIB FastAPI direct routing)

## 🌐 Multilingual Support

### Supported Languages
- English (en)
- Hindi (hi)
- Tamil (ta)
- Telugu (te)
- Kannada (kn)
- Malayalam (ml)
- Bengali (bn)
- Marathi (mr)
- Gujarati (gu)
- Spanish, French, Arabic, Chinese, and 100+ more via LaBSE

### Translation Pipeline
```
User Message → Language Detection (LaBSE) → 
Translate to English → AI Processing → 
Translate back to source language → Response
```

## 📝 Best Practices

### When Patient Context Available
```
❌ WRONG: "I recommend contacting our clinic for your appointment schedule."
✅ RIGHT: "Senthilkumar, your next appointment is with Dr. Sharma on Feb 5 at 10:30 AM."
```

### When Asked About Medicines
```
❌ WRONG: "Take paracetamol 500mg twice daily for fever."
✅ RIGHT: "I cannot recommend medications. Please consult a physician. Would you like me to book an appointment?"
```

### When Asked Educational Question
```
✅ ALLOWED: "Paracetamol is commonly used as a fever reducer and pain reliever. 
However, I cannot advise dosing - please consult a pharmacist."
```

## 🔧 Configuration Files

- **Intent Classifier**: `/server/utils/intentClassifier.js`
- **WhatsApp Routes**: `/server/routes/whatsapp-production.route.js`
- **SIB AI Pipeline**: `/ai-engine/doctor_bot/sib/medical_pipeline.py`
- **Safety Filter**: `/ai-engine/doctor_bot/utils/safety_filter.py`
- **FastAPI App**: `/ai-engine/doctor_bot/app.py`
- **System Prompts**: Lines 476-550 in `medical_pipeline.py`

## 📊 Monitoring & Logs

Check logs for:
```bash
# Static responses
pm2 logs mediczy-server | grep "STATIC"

# SIB FastAPI processing
pm2 logs sib-fastapi | grep "chat_answer"

# Intent classification
pm2 logs mediczy-server | grep "Intent:"
```

---

**Last Updated**: January 30, 2026  
**Version**: 2.0 (Direct SIB routing, prescription guardrails, conversational enhancements)
