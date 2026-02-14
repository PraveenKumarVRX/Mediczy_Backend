# Bot ↔ Agent ↔ Customer Integration Guide

**Status**: ✅ IMPLEMENTATION COMPLETE  
**Last Updated**: $(date)  
**Version**: 2.0 - Bot Service Integrated into Message Flow

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Code Components](#code-components)
4. [Integration Flow Details](#integration-flow-details)
5. [Testing Guide](#testing-guide)
6. [Monitoring & Debugging](#monitoring--debugging)

---

## Quick Start

### Prerequisites

Before testing the bot-agent integration, ensure:

```bash
# 1. Check RocketChat is running
curl -s https://smart-chat.live/api/v1/info | jq '.version'

# 2. Verify bot service exists
ls -la /home/ubuntu/Mediczy/server/services/whatsapp-bot.service.js

# 3. Check environment variables
grep -E "DRISHA_AI_API|ROCKETCHAT" /home/ubuntu/Mediczy/server/.env | head -5
```

### Run Full Integration Test

```bash
cd /home/ubuntu/Mediczy

# Start the backend
npm run dev:watch

# In another terminal, send a test WhatsApp message
curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+441234567890",
    "body": "I have a fever and headache",
    "patient": {
      "id": "patient-001",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+441234567890"
    }
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "handled": "bot",          // or "handoff"
  "roomId": "abc123xyz",
  "message": "✅ Bot response sent"
}
```

---

## Architecture Overview

### Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER (WhatsApp)                          │
│                    "I have a fever"                             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
         ┌───────────────────────┐
         │  WhatsApp Webhook     │
         │ /api/support/webhook/ │
         │    whatsapp           │
         └───────────┬───────────┘
                     │
                     ↓
    ┌────────────────────────────────────┐
    │  omnichannelChatService            │
    │  .handleWhatsAppMessage()          │
    │  "Main orchestration point"        │
    └────────┬─────────────────┬─────────┘
             │                 │
             ↓                 ↓
    ┌─────────────────┐  ┌──────────────────┐
    │  Bot Service    │  │  Create RoomId   │
    │  - Language     │  │  - Register      │
    │  - Get Response │  │    visitor       │
    │  - Check Handoff│  │  - Room ready    │
    └────┬────────────┘  └──────────────────┘
         │
         ├─ BOT RESPONSE PATH ─────────────┐
         │                                  │
         │   ✅ Can handle?                 │
         │   • Low priority                 │
         │   • High confidence              │
         │   • Not emergency                │
         │   • Not explicit handoff         │
         │                                  │
         ↓                                  │
    ┌─────────────────────┐                │
    │  Send Bot Response  │                │
    │  to RocketChat      │                │
    │  #whatsapp channel  │                │
    └─────────────────────┘                │
         │                                  │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────┴──────────────────┐
         │                                   │
         ↓                                   ↓
    ┌──────────────────┐          ┌────────────────────┐
    │ CUSTOMER Gets    │          │ HANDOFF Path       │
    │ Bot Response     │          │                    │
    │                  │          │ ❌ Cannot handle   │
    │ "You might have" │          │ • Emergency        │
    │ "consult doctor" │          │ • Urgent           │
    └──────────────────┘          │ • Low confidence   │
                                  │ • Explicit request │
                                  │ • Complex issue    │
                                  └─────┬──────────────┘
                                        │
                                        ↓
                            ┌─────────────────────────┐
                            │ Transfer to Department  │
                            │ Queue (RocketChat)      │
                            │                         │
                            │ setPriority()           │
                            │ transferToDepartment()  │
                            │ getAvailableAgents()    │
                            └─────────┬───────────────┘
                                      │
                                      ↓
                            ┌─────────────────────────┐
                            │ Wait for Agent          │
                            │ (RocketChat Dashboard)  │
                            │ Agents see customer +   │
                            │ bot context + priority  │
                            └─────────┬───────────────┘
                                      │
                                      ↓
                            ┌─────────────────────────┐
                            │ AGENT Available         │
                            │ Accepts & Takes Room    │
                            │ (via Omnichannel)       │
                            └─────────┬───────────────┘
                                      │
                                      ↓
                            ┌─────────────────────────┐
                            │ Agent Types in          │
                            │ RocketChat              │
                            │ "Let me help you..."    │
                            └─────────┬───────────────┘
                                      │
                                      ↓
                            ┌─────────────────────────┐
                            │ RocketChat Webhook      │
                            │ /api/support/webhook/   │
                            │ rocketchat              │
                            │                         │
                            │ sendToWhatsApp()        │
                            └─────────┬───────────────┘
                                      │
                                      ↓
                    ┌─────────────────────────────┐
                    │  Message Sent to WhatsApp   │
                    │  Customer Sees Agent Reply  │
                    │  "Let me help you..."       │
                    └─────────────────────────────┘
```

### Decision Tree for Bot vs Handoff

```
┌─ NEW MESSAGE from WhatsApp ─────────────↓
│
├─ LANGUAGE DETECTION
│  └─ English / Hindi (or default English)
│
├─ GET BOT RESPONSE
│  └─ POST to Dr.iSHA API
│     ├─ Success: Get response + confidence
│     └─ Fail: Confidence = 0
│
├─ CHECK HANDOFF CRITERIA ────────────────┐
│  │                                       │
│  ├─ Explicit Request? ────────────────┐ │
│  │  ("agent", "human", "doctor",      │ │
│  │   "support", "please help")        │ │
│  │  ├─ YES → HANDOFF ✋              │ │
│  │  └─ NO → continue                 │ │
│  │                                    │ │
│  ├─ Emergency Detected? ────────────┐ │ │
│  │  ("emergency", "urgent",         │ │ │
│  │   "critical", "chest pain")      │ │ │
│  │  ├─ YES → HANDOFF 🚨            │ │ │
│  │  └─ NO → continue                │ │ │
│  │                                   │ │ │
│  ├─ Low Bot Confidence? ───────────┐ │ │ │
│  │  (< 60%) OR api failed          │ │ │ │
│  │  ├─ YES → HANDOFF 📉            │ │ │ │
│  │  └─ NO → continue               │ │ │ │
│  │                                  │ │ │ │
│  ├─ Specific Department? ─────────┐ │ │ │ │
│  │  (emergency, appointments,     │ │ │ │ │
│  │   billing, pharmacy)           │ │ │ │ │
│  │  ├─ YES → HANDOFF 🔔           │ │ │ │ │
│  │  └─ NO → continue              │ │ │ │ │
│  │                                 │ │ │ │ │
│  └─ Multi-turn without solution? ─┘ │ │ │ │
│     (customer 2nd+ message)        │ │ │ │
│     ├─ YES → HANDOFF 🔄            │ │ │ │
│     └─ NO → continue               │ │ │ │
│                                     │ │ │ │
└─ PASS ALL CHECKS ───────────────────┘ │ │ │
   │                                     │ │ │
   ├─ ALL CHECKS PASS: BOT RESPONDS ✅   │ │ │
   │  Send to RocketChat #whatsapp       │ │ │
   │  Store in Redis for 5 mins          │ │ │
   │                                     │ │ │
   └─ ANY CHECK FAILS: HANDOFF TO AGENT  ▪ ▪ ▪
      1. Get department ─────────────────┘ │ │
      2. Transfer to queue ───────────────┘ │
      3. Set priority ──────────────────────┘
      4. Notify available agents
      5. Send "waiting" message to customer
```

---

## Code Components

### 1. Bot Service (`whatsapp-bot.service.js`)

**Location**: `/home/ubuntu/Mediczy/server/services/whatsapp-bot.service.js`

**Core Methods**:

#### `getBotResponse(message, language)`
```javascript
// Calls Dr.iSHA AI API
// Returns: { success, response, confidence, category, model, processedAt }

const botResponse = await whatsappBotService.getBotResponse(
  "I have a fever",
  "en"
);

// Response Example:
{
  success: true,
  response: "Fever can be caused by various infections...",
  confidence: 0.87,
  category: "Diagnosis",
  model: "dr-isha-v2",
  processedAt: "2024-01-15T10:30:00Z"
}
```

#### `determineHandoffNeeded(message, botResponse, department)`
```javascript
// Analyzes if human agent needed
// Returns: { handoff, reason, confidence, priority }

const decision = whatsappBotService.determineHandoffNeeded(
  "I have chest pain",
  botResponse,
  "general"
);

// Decision Example:
{
  handoff: true,
  reason: "emergency_detected",
  confidence: 0.95,
  priority: "emergency"
}
```

#### `formatBotResponse(botResponse, language)`
```javascript
// Adds disclaimers and formatting
// Returns: Formatted string with warnings

const formatted = whatsappBotService.formatBotResponse(botResponse, "en");

// Output:
// "ℹ️ AI Assistant Response:\n\n[response]\n\n⚠️ Disclaimer: ...\n✨ Confidence: 87%"
```

#### Other Utility Methods

```javascript
// Detect language: 'en' or 'hi'
const lang = whatsappBotService.detectLanguage("नमस्ते");

// Check if urgent
const urgent = whatsappBotService.isUrgent("I have chest pain");

// Get suggested department
const dept = whatsappBotService.getSuggestedDepartment("I want to book appointment");

// Detect user intent
const intent = whatsappBotService.detectUserIntent("Can I talk to a doctor?");
// Returns: { intent: 'switch_to_agent' | 'continue_with_bot' | 'unclear', confidence }

// Generate agent context for handoff
const context = whatsappBotService.generateAgentContext(
  messageHistory,
  botResponse
);
```

---

### 2. Omnichannel Chat Service

**Location**: `/home/ubuntu/Mediczy/server/services/omnichannel-chat.service.js`

**Main Method**:

#### `handleWhatsAppMessage(whatsappMessage)` ✨ **NEWLY INTEGRATED**

```javascript
/**
 * Main entry point for WhatsApp messages
 * Orchestrates: bot response → handoff decision → routing
 */

async handleWhatsAppMessage(whatsappMessage) {
  // 1. Register visitor
  // 2. Create/get chat room
  // 3. Detect language
  // 4. Get bot response
  // 5. Determine handoff needed
  // 6. Branch:
  //    - If bot can handle: send formatted response
  //    - If handoff: route to department
  // 7. Return result
}
```

**New Supporting Methods**:

#### `transferToDepartment(roomId, visitorToken, department)`
```javascript
// Routes chat room to specific department queue
// Department values: 'general', 'billing', 'pharmacy', 'appointments', 'emergency', 'technical'

const result = await omnichannelChatService.transferToDepartment(
  roomId,
  visitorToken,
  'emergency'
);
// Returns: { success: true, department: "Emergency Support" }
```

#### `getAvailableAgents(department)`
```javascript
// Fetches online agents in a department

const agents = await omnichannelChatService.getAvailableAgents('emergency');
// Returns: { success: true, agents: [...], count: 5, department: "Emergency Support" }
```

#### `routeToAgent(roomId, visitorToken, agentId)`
```javascript
// Assigns chat to specific agent

const assigned = await omnichannelChatService.routeToAgent(
  roomId,
  visitorToken,
  'agent-123'
);
```

#### `setPriority(roomId, priority, reason)`
```javascript
// Marks conversation with priority level for agent dashboard
// Priority: 'low' | 'normal' | 'high' | 'urgent' | 'emergency'

await omnichannelChatService.setPriority(
  roomId,
  'emergency',
  'Customer has chest pain'
);
```

---

### 3. Support Chat Routes

**Location**: `/home/ubuntu/Mediczy/server/routes/support-chat.route.js`

**Webhook Endpoints**:

#### Incoming WhatsApp Messages
```javascript
POST /api/support/webhook/whatsapp

Body: {
  from: "+441234567890",
  body: "I have a fever",
  patient?: {
    id: "patient-001",
    firstName: "John",
    lastName: "Doe",
    phoneNumber: "+441234567890"
  }
}

// Calls: omnichannelChatService.handleWhatsAppMessage()
```

#### Incoming Agent Messages (from RocketChat)
```javascript
POST /api/support/webhook/rocketchat

Body: {
  room_id: "abc123",
  user_id: "agent-1",
  user_name: "Support Agent",
  text: "Let me help you..."
}

// Calls: omnichannelChatService.sendToWhatsApp()
```

---

## Integration Flow Details

### Phase 1: Message Arrives (Customer)

```
WhatsApp API sends POST to /api/support/webhook/whatsapp
├─ Message: "I have a fever and headache"
├─ From: +441234567890
└─ Patient: { id: "patient-001", name: "John Doe" }
```

### Phase 2: Bot Decision

```
handleWhatsAppMessage() executes:
├─ 1️⃣ Register visitor
│  └─ Creates RocketChat visitor token
├─ 2️⃣ Create/get room in RocketChat
│  └─ Room ID = "room-abc123"
├─ 3️⃣ Detect language
│  └─ Language = "en" (English)
├─ 4️⃣ Call Dr.iSHA API
│  ├─ Sends: "I have a fever and headache"
│  └─ Gets: { response: "Fever can cause...", confidence: 0.85 }
└─ 5️⃣ Check handoff criteria
   ├─ Not explicit request ✓
   ├─ Not emergency ✓
   ├─ Confidence 0.85 > 0.60 ✓
   ├─ Not specific department ✓
   └─ RESULT: Bot can handle! 🤖
```

### Phase 3a: Bot Responds (Happy Path)

```
if (!handoffNeeded && botResponse.success) {
  ├─ Format response with disclaimers
  ├─ Send customer message to RocketChat
  ├─ Send bot response "ℹ️ Fever can be caused..."
  ├─ Store handoff state in Redis
  │  └─ whatsapp:handoff:{phone} = {
  │       active: true,
  │       reason: "bot_response_given",
  │       confidence: 0.85,
  │       ttl: 5 minutes
  │     }
  └─ Return: { success: true, handled: "bot", roomId }
}

// Customer sees in WhatsApp:
// Bot: "💡 AI Assistant Response:\n\nFever can be caused by..."
```

### Phase 3b: Handoff Path (When Bot Can't Help)

```
else if (handoffNeeded) {
  ├─ 1. Detect department
  │  └─ Department = "general" (or "emergency" if urgent)
  ├─ 2. Send customer context to RocketChat
  │  ├─ Customer's original message
  │  └─ Bot context (what bot tried to say)
  ├─ 3. Transfer room to department
  │  └─ omnichannelChatService.transferToDepartment(roomId, "emergency")
  ├─ 4. Get available agents
  │  └─ [ Agent1 (6 active), Agent2 (3 active), Agent3 (5 active) ]
  ├─ 5. Set priority
  │  └─ "🚨 EMERGENCY - Customer has chest pain"
  ├─ 6. Store handoff state
  │  └─ whatsapp:handoff:{phone} = {
  │       active: true,
  │       reason: "waiting_for_agent",
  │       department: "emergency",
  │       priority: "emergency",
  │       ttl: 1 hour
  │     }
  ├─ 7. Notify agents in RocketChat dashboard
  │  └─ "📞 New chat routed to Emergency (High Priority)"
  ├─ 8. Send waiting message to customer
  │  └─ "⏳ Our support team will be with you shortly. Please wait..."
  └─ Return: { success: true, handled: "handoff", department: "emergency" }
}

// Customer sees in WhatsApp:
// Bot: "⏳ Our support team will be with you shortly. Please wait..."
// [Agents see room in RocketChat Emergency queue]
```

### Phase 4: Agent Responds

```
Agent (in RocketChat) sees:
├─ Room in Emergency queue
├─ Status: High Priority 🚨
├─ Content:
│  ├─ Customer name: John Doe
│  ├─ Phone: +441234567890
│  ├─ Message: "I have chest pain"
│  ├─ Bot context: "Bot couldn't handle - emergency detection"
│  └─ Context: "Patient reports severe symptoms"
│
└─ Agent clicks "Accept" → Takes room

Agent types: "Hi John, I'm Dr. Sarah. I see you have chest pain. 
When did it start?"

RocketChat sends to webhook:
POST /api/support/webhook/rocketchat
{
  room_id: "room-abc123",
  user_id: "agent-1",
  user_name: "Dr. Sarah",
  text: "Hi John, I'm Dr. Sarah..."
}
```

### Phase 5: Message Delivered to Customer

```
omnichannelChatService.sendToWhatsApp() processes:
├─ Extract room ID → room-abc123
├─ Get room details from RocketChat
├─ Extract customer phone from room metadata
├─ Extract message from agent
└─ POST to WhatsApp API
   └─ To: +441234567890
      Message: "Hi John, I'm Dr. Sarah. I see you have chest pain..."

Customer's WhatsApp shows:
┌─────────────────────────────────────────┐
│ Mediczy Support                         │
├─────────────────────────────────────────┤
│ Bot: "I have a fever and headache"      │
│                                         │
│ Bot: "💡 Fever can be caused by..."     │
│                                         │
│ Dr. Sarah: "Hi John, I'm Dr. Sarah..."  │
│                                         │
│ [Text input field]                      │
└─────────────────────────────────────────┘
```

### Phase 6: Two-Way Conversation Continues

```
Customer replies in WhatsApp:
"Started this morning, I also have chills"

→ POST to /api/support/webhook/whatsapp

Agent sees in RocketChat:
"Started this morning, I also have chills"

Agent replies:
"That suggests flu. Let me check your..."

→ POST to /api/support/webhook/rocketchat

Customer sees in WhatsApp:
"That suggests flu. Let me check your..."

[Conversation continues until resolved or escalated]
```

---

## Testing Guide

### Test 1: Bot Handles Common Query

```bash
# Test: Patient asks about fever (bot should respond)

curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+441234567891",
    "body": "I have a high fever. Should I take paracetamol?",
    "patient": {
      "id": "patient-101",
      "firstName": "Alice",
      "lastName": "Smith",
      "phoneNumber": "+441234567891"
    }
  }'

# Expected Response:
# { "success": true, "handled": "bot", "roomId": "xxx" }

# Check RocketChat for bot response:
curl -s https://smart-chat.live/api/v1/channels.history \
  -H "X-Auth-Token: $AUTH_TOKEN" \
  -H "X-User-Id: $USER_ID" \
  -d "roomName=whatsapp&count=5" | jq '.messages[-1]'
```

### Test 2: Bot Escalates Emergency

```bash
# Test: Patient reports emergency (should handoff)

curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+441234567892",
    "body": "I have severe chest pain and cannot breathe. This is an emergency!",
    "patient": {
      "id": "patient-102",
      "firstName": "Bob",
      "lastName": "Johnson",
      "phoneNumber": "+441234567892"
    }
  }'

# Expected Response:
# { "success": true, "handled": "handoff", "department": "emergency", "roomId": "yyy" }

# Check Redis for handoff state:
redis-cli -h localhost -p 6379
> GET "whatsapp:handoff:+441234567892"
# Output: { active: true, reason: "waiting_for_agent", department: "emergency", ... }
```

### Test 3: Agent Responds from RocketChat

```bash
# Get your auth token and user ID from RocketChat
AUTH_TOKEN="uQM8DVr6wFeHwJiZdCMWN6PySPL1MLrcrscpzj2TVgj"
USER_ID="mNXynidBmMpLDv6Fj"
ROOM_ID="xxx"  # From Test 1 response

# Send message as agent in RocketChat
curl -X POST https://smart-chat.live/api/v1/chat.sendMessage \
  -H "X-Auth-Token: $AUTH_TOKEN" \
  -H "X-User-Id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"rid\": \"$ROOM_ID\",
    \"msg\": \"Hi Alice, I see you have a fever. Let me help...\"
  }"

# This triggers /api/support/webhook/rocketchat webhook
# Which should POST message to customer's WhatsApp

# Check logs:
tail -50 /home/ubuntu/Mediczy/logs/backend.log | grep -i "whatsapp\|webhook"
```

### Test 4: Bilingual Support (Hindi)

```bash
# Test: Hindi language detection and bot response

curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+919876543210",
    "body": "मुझे बुखार है। क्या मुझे डॉक्टर के पास जाना चाहिए?",
    "patient": {
      "id": "patient-103",
      "firstName": "राज",
      "lastName": "पटेल",
      "phoneNumber": "+919876543210"
    }
  }'

# Expected Response:
# { "success": true, "handled": "bot", "roomId": "zzz" }

# Check RocketChat for Hindi bot response:
# Bot message will be in appropriate language with contextual emojis
```

### Test 5: Explicit Handoff Request

```bash
# Test: Patient explicitly asks for doctor (should handoff)

curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+441234567893",
    "body": "I want to talk to a real doctor, not a chatbot",
    "patient": {
      "id": "patient-104",
      "firstName": "Charlie",
      "lastName": "Davis",
      "phoneNumber": "+441234567893"
    }
  }'

# Expected Response:
# { "success": true, "handled": "handoff", "department": "general", "roomId": "aaa" }

# Check logs for handoff reason:
# Should say: "reason: explicit_request_detected"
```

---

## Monitoring & Debugging

### Check Key Logs

```bash
# Monitor real-time backend logs
tail -f /home/ubuntu/Mediczy/logs/backend.log

# Search for bot-related logs
grep -i "bot\|handoff\|whatsapp" /home/ubuntu/Mediczy/logs/backend.log | tail -20

# Count bot vs handoff decisions
grep "Handoff Decision:" /home/ubuntu/Mediczy/logs/backend.log | grep -c "YES"   # Handoffs
grep "Handoff Decision:" /home/ubuntu/Mediczy/logs/backend.log | grep -c "NO"    # Bot responses

# Find errors
grep -i "error\|failed" /home/ubuntu/Mediczy/logs/backend.log | tail -10
```

### Monitor Redis State

```bash
# Connect to Redis
redis-cli -h localhost -p 6379

# Check active handoff states
> KEYS "whatsapp:handoff:*"
> GET "whatsapp:handoff:+441234567890"

# Check all chat sessions
> KEYS "whatsapp:session:*"

# Monitor cache size
> DBSIZE
> INFO memory
```

### Monitor RocketChat API

```bash
# Check if RocketChat is responding
curl -s https://smart-chat.live/api/v1/info | jq '.version'

# Check admin login
curl -s -X POST https://smart-chat.live/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "user": "support_admin",
    "password": "Password@1234567"
  }' | jq '.data.authToken'

# Check omnichannel status
curl -s https://smart-chat.live/api/v1/omnichannel/enabled \
  -H "X-Auth-Token: $AUTH_TOKEN" \
  -H "X-User-Id: $USER_ID" | jq '.'

# List agents
curl -s https://smart-chat.live/api/v1/livechat/agents \
  -H "X-Auth-Token: $AUTH_TOKEN" \
  -H "X-User-Id: $USER_ID" | jq '.agents[] | {username, status, active}'
```

### Debug Specific Message

```bash
# Enable debug logging in code temporarily
// In omnichannel-chat.service.js::handleWhatsAppMessage

console.log('📨 Incoming message:', {
  from,
  body,
  language: messageLanguage,
  department: detectedDepartment
});

console.log('🤖 Bot response:', botResponse);

console.log('🔍 Handoff decision:', handoffDecision);

// Then send test message and check logs
```

### Common Issues & Solutions

| Issue | Symptom | Check | Fix |
|-------|---------|-------|-----|
| **Bot API timeout** | Messages never get response | `grep "DRISHA_AI_API" logs` | Check `DRISHA_AI_API_URL` in `.env` |
| **RocketChat not responding** | HTTP 503 errors | `docker ps \| grep rocketchat` | Restart: `docker-compose restart` |
| **Bot doesn't respond** | Messages go to agents | Check confidence threshold | Lower from 0.60 to 0.50 in bot service |
| **Handoff fails** | Transfer not working | Check `transferToDepartment()` response | Verify department name in RocketChat |
| **Agent message not reaching WhatsApp** | One-way chat | Check webhook config | Verify `/api/support/webhook/rocketchat` auth |
| **Wrong language detected** | Hindi message → English response | Check `detectLanguage()` logic | Review Unicode character detection |

---

## Configuration Checklist

```bash
✅ Pre-deployment Checklist:

Provider         | Required                          | Status
─────────────────┼──────────────────────────────────┼─────────
Environment      | DRISHA_AI_API_URL               | [ ]
                 | ROCKETCHAT_URL                   | [ ]
                 | ROCKETCHAT_ADMIN_USER            | [ ]
                 | ROCKETCHAT_ADMIN_PASSWORD        | [ ]
┌────────────────┴──────────────────────────────────┴─────────┐
│                                                              │
│ Infrastructure   | Docker RocketChat running        | [ ]
│                  | MongoDB healthy                  | [ ]
│                  | Redis connected                  | [ ]
│                  | Nginx reverse proxy working      | [ ]
│                  | DNS resolving smart-chat.live    | [ ]
│
│ Database         | Visitor creation working         | [ ]
│                  | Room creation working            | [ ]
│                  | Message storage working          | [ ]
│
│ APIs             | Dr.iSHA API responding           | [ ]
│                  | RocketChat API responding        | [ ]
│                  | WhatsApp webhook receiving       | [ ]
│                  | RocketChat webhook receiving     | [ ]
│
│ Integration      | Bot service methods working      | [ ]
│                  | Handoff detection logic working  | [ ]
│                  | Message routing working          | [ ]
│
└──────────────────────────────────────────────────────────────┘
```

---

## Next Steps

### Immediate (Phase 1 - Next 1-2 Hours)
- [ ] Run Test Suite above (Tests 1-5)
- [ ] Monitor logs for errors
- [ ] Verify Redis handoff states being stored
- [ ] Check RocketChat omnichannel queue has test messages

### Short Term (Phase 2 - Next 24 Hours)
- [ ] Test 2-way conversation (customer ↔ bot ↔ agent)
- [ ] Load test with 10+ concurrent messages
- [ ] Monitor performance: response time, latency
- [ ] Test department routing (emergency vs billing)
- [ ] Test billing/pharmacy department handling

### Medium Term (Phase 3 - Next Week)
- [ ] Setup alerting for handoff failures
- [ ] Add metrics dashboard (bot vs handoff ratio)
- [ ] Train agents on RocketChat interface
- [ ] Deploy to production on AWS

### Performance Targets
```
Metric                      | Target        | Status
────────────────────────────┼───────────────┼─────────
Bot response time          | < 2 seconds    | [ ]
Handoff detection time     | < 100ms        | [ ]
Message delivery (end-end) | < 5 seconds    | [ ]
Bot success rate           | > 80%          | [ ]
Handoff accuracy           | > 95%          | [ ]
Agent response time        | < 30 seconds   | [ ]
```

---

## Support & References

- **Architecture Docs**: [WHATSAPP_BOT_AGENT_FLOW.md](./WHATSAPP_BOT_AGENT_FLOW.md)
- **Bot Service**: [whatsapp-bot.service.js](./server/services/whatsapp-bot.service.js)
- **Omnichannel Service**: [omnichannel-chat.service.js](./server/services/omnichannel-chat.service.js)
- **RocketChat API**: https://developer.rocket.chat/api/rest-api
- **Dr.iSHA API**: [Contact integration team]

---

**Version History**:
- v1.0 - Architecture documentation (Jan 15, 2024)
- v2.0 - Bot service integration complete (Jan 15, 2024) ✅ **CURRENT**
