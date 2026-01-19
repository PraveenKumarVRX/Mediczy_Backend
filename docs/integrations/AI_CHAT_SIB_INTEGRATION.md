# AI Chat SIB Integration Implementation Plan

## Overview
Integrating AI Doctor Chat with SIB (Synthetic Intelligence Brain) and Health Diary for persistent conversation storage.

## Current Architecture
```
User → /api/ai/working-medical-consult → Direct Groq API Call → Response
        (No SIB, No Persistence)
```

## New Architecture
```
User → /api/ai/working-medical-consult → SIB (localhost:8001) → LLM (Llama/Groq/Gemini) → Response
                                        ↓
                               SIB Database (sib_chat_history)
                                        ↓
                               Health Diary (health_diaries table)
```

## Implementation Steps

### 1. Update AI Route to Use SIB (server/routes/ai.js)
- Replace direct Groq calls with SIB proxy
- Call `http://localhost:8001/chat` endpoint
- Fall back to direct Groq if SIB unavailable
- Save conversations to health diary after response

### 2. SIB Chat Endpoint (ai-engine/doctor_bot/sib_app.py)
- Already has `/chat` endpoint
- Uses database integration to save to `sib_chat_history`
- Returns AI response from LLM chain (Llama → Groq → Gemini)

### 3. Health Diary Integration (server/routes/ai.js)
- After AI response, create health diary entry
- Entry type: 'note'
- Title: "AI Consultation with Dr. iSHA"
- Description: User's question
- Data (JSONB): Full conversation including AI response, session ID, timestamp

### 4. Create Health Diary Frontend (client/src/pages/HealthDiary.tsx)
- Display user's health diary entries
- Filter by entry type
- Show AI consultations prominently
- Date range filtering
- Search functionality

### 5. Add Health Diary Route (client/src/routes/index.tsx)
- Add route: `/health-diary`
- Link in user navigation/sidebar

## Database Schema

### sib_chat_history (SIB Database)
```sql
CREATE TABLE sib_chat_history (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_patient_id (patient_id)
);
```

### health_diaries (Main Database)
```sql
CREATE TABLE health_diaries (
    id SERIAL PRIMARY KEY,
    userId INTEGER NOT NULL,
    entryDate DATE NOT NULL,
    entryType ENUM('symptom', 'medication', 'mood', 'activity', 'diet', 'sleep', 'vital', 'note', 'prescription'),
    title VARCHAR(255),
    description TEXT,
    data JSONB,  -- Stores AI conversation metadata
    linkedRecordId INTEGER,
    linkedRecordType VARCHAR(50),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_userId (userId),
    INDEX idx_entryDate (entryDate),
    INDEX idx_entryType (entryType)
);
```

## Health Diary Entry Structure for AI Consultations
```json
{
  "userId": 123,
  "entryDate": "2025-01-15",
  "entryType": "note",
  "title": "AI Consultation with Dr. iSHA",
  "description": "I have been experiencing headaches for the past 3 days",
  "data": {
    "consultationType": "ai_chat",
    "sessionId": "med_1736946789012",
    "userMessage": "I have been experiencing headaches for the past 3 days",
    "aiResponse": "Headaches for 3 days could be due to tension, dehydration, or stress...",
    "urgencyScore": 0.2,
    "symptomsDetected": ["headache"],
    "language": "en",
    "sibUsed": true,
    "modelUsed": "llama-3.3-70b-versatile",
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

## Benefits
1. **Persistence**: All AI conversations saved permanently
2. **History**: Users can view past consultations
3. **Continuity**: SIB can access conversation history for context
4. **Analytics**: Track health patterns over time
5. **Compliance**: Maintains audit trail of medical advice
6. **Integration**: Links AI consultations with other health records

## Next Steps
1. ✅ Create this documentation
2. ⏳ Update AI route in server/routes/ai.js
3. ⏳ Create HealthDiary.tsx frontend page
4. ⏳ Add health diary route to frontend
5. ⏳ Test end-to-end flow
