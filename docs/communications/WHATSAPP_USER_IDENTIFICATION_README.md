# WhatsApp User Identification & Intelligent Conversations

## Overview

This feature enables intelligent WhatsApp conversations by:
1. **Identifying users** from their WhatsApp phone number
2. **Fetching complete medical history** (appointments, prescriptions, medications)
3. **Providing personalized AI responses** using their context

## How It Works

### 1. User Identification Flow

```
WhatsApp Message → Webhook → User Context Service → Database Lookup
                                      ↓
                              Phone Number Variations:
                              - +919876543211
                              - 919876543211  
                              - 9876543211
                              - 09876543211
```

### 2. Context Retrieval

For **known users**, the system retrieves:
- User profile (name, age, gender, blood type)
- Recent appointments (last 5)
- Upcoming appointments
- Recent prescriptions (last 5)
- Active medications
- Conversation history (cached 1 hour)

### 3. AI Response Generation

The AI (Dr. iSHA) uses the complete context to provide:
- Personalized greetings using patient name
- Responses aware of their medical history
- Relevant medication reminders
- Appointment-aware suggestions

## API Endpoints

### Get User Context
```bash
GET /api/whatsapp-production/user-context/:phoneNumber

# Example:
curl http://localhost:8000/api/whatsapp-production/user-context/+919876543211
```

Response for known user:
```json
{
  "success": true,
  "context": {
    "isKnownUser": true,
    "user": {
      "id": 94,
      "name": "Test TeamMember",
      "age": 36,
      "gender": "Other"
    },
    "appointments": {
      "recent": [...],
      "upcoming": [...],
      "totalCount": 5
    },
    "prescriptions": {...},
    "activeMedications": [...],
    "summary": "Patient: Test TeamMember\nAge: 36 years..."
  }
}
```

### Trigger AI Response
```bash
POST /api/whatsapp-production/ai-respond
Content-Type: application/json

{
  "phoneNumber": "+919876543211",
  "message": "I have a headache and slight fever"
}
```

### WhatsApp Webhook (Twilio)
```bash
POST /api/whatsapp-production/webhook
Content-Type: application/x-www-form-urlencoded

From=whatsapp:+919876543211&Body=Hello&ProfileName=John&MessageSid=SM123
```

## Files Modified/Created

### New Services
- `server/services/whatsapp-user-context.service.js` - User identification & context retrieval
- `server/services/whatsapp-ai-conversation.service.js` - AI conversation handler

### Modified Files
- `server/routes/whatsapp-production.route.js` - Added new endpoints
- `server/middleware/ringFencing.js` - Added auth bypasses for new endpoints

## Testing

### Test Known User Lookup
```bash
curl http://localhost:8000/api/whatsapp-production/user-context/+919876543211
```

### Test Unknown User
```bash
curl http://localhost:8000/api/whatsapp-production/user-context/+911111111111
```

### Test AI with Context
```bash
curl -X POST http://localhost:8000/api/whatsapp-production/ai-respond \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+919876543211", "message": "What medications am I taking?"}'
```

### Simulate Full WhatsApp Message
```bash
curl -X POST http://localhost:8000/api/whatsapp-production/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp:+919876543211&Body=Hello&ProfileName=John&MessageSid=SM123"
```

## Features

### Emergency Detection
If the message contains emergency keywords like "chest pain", "can't breathe", "accident", the system:
1. Provides emergency contact numbers (112, 108)
2. Shows the patient's blood type (if known)
3. Lists current medications for emergency responders
4. Notifies emergency coordinator

### Appointment Intent Detection
Detects phrases like:
- "book appointment", "schedule", "see doctor" → Booking flow
- "check appointments", "my appointments" → Shows upcoming appointments
- "cancel", "reschedule" → Modification flow

### Personalization
- Uses patient's first name in responses
- References their medical history
- Reminds about upcoming appointments
- Mentions active medications when relevant

## Caching

- User context: 5 minutes (Redis)
- Conversation history: 1 hour (Redis)
- Reduces database queries for frequent messages

## Security

The following endpoints bypass authentication (for Twilio webhooks):
- `/api/whatsapp-production/webhook`
- `/api/whatsapp-production/status`
- `/api/whatsapp-production/user-context`
- `/api/whatsapp-production/ai-respond`
- `/api/whatsapp-production/send-ai-response`
- `/api/whatsapp-production/team-inbox`

## Logs

Check logs for user identification:
```bash
pm2 logs mediczy-server --lines 50 | grep -E "(User identification|isKnownUser|WhatsApp)"
```

## Date Created
January 22, 2026
