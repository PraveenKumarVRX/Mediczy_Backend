# WhatsApp ↔ RocketChat Bot & Agent Flow Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WHATSAPP CUSTOMER MESSAGE                           │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────────┐
                    │   Mediczy Backend         │
                    │  /api/support/webhook/    │
                    │   whatsapp                │
                    └───────────┬───────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
        ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
        │  Register   │  │  Detect     │  │   Create     │
        │  Visitor    │  │  Department │  │   Room       │
        │  in RC      │  │  (NLP)      │  │   in RC      │
        └──────┬──────┘  └──────┬──────┘  └──────┬───────┘
               │                │                │
               └────────────────┼────────────────┘
                                │
                                ▼
                    ┌───────────────────────────┐
                    │  BOT LOGIC DECISION       │
                    │  (Dr.iSHA AI)             │
                    └───────────┬───────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
       CAN BOT ANSWER?                  HANDOFF TO AGENT?
                │                               │
                ▼                               ▼
        ┌──────────────┐            ┌───────────────────────┐
        │ Bot Responds │            │ Find Available Agent  │
        │ (Dr.iSHA)    │            │ for Department        │
        └──────┬───────┘            └───────────┬───────────┘
               │                                │
               ▼                                ▼
        ┌──────────────┐            ┌───────────────────────┐
        │ Send to RC   │            │ Queue in Department   │
        │ #whatsapp    │            │ or notify agent       │
        │ channel      │            └───────────┬───────────┘
        └──────┬───────┘                        │
               │                                ▼
               │                    ┌───────────────────────┐
               │                    │ Agent joins RC room   │
               │                    │ and responds          │
               │                    └───────────┬───────────┘
               │                                │
               └────────────────┬───────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────────┐
        │ RocketChat Webhook                                │
        │ POST /api/support/webhook/rocketchat              │
        │ (Agent message)                                   │
        └──────────────────┬────────────────────────────────┘
                           │
                           ▼
        ┌───────────────────────────────────────────────────┐
        │ Mediczy Processor                                 │
        │ (handleRocketchatWebhook)                         │
        └──────────────────┬────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
                    ▼             ▼
         ┌────────────────┐  ┌────────────────┐
         │ Extract phone  │  │ Get message    │
         │ number         │  │ content        │
         └────────┬───────┘  └────────┬───────┘
                  │                   │
                  └─────────┬─────────┘
                            │
                            ▼
         ┌─────────────────────────────────┐
         │ Send to WhatsApp customer       │
         │ via WhatsApp API                │
         └────────────────┬────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────┐
         │ CUSTOMER RECEIVES AGENT REPLY   │
         │ on WhatsApp                     │
         └─────────────────────────────────┘
```

---

## Component Details

### 1. **BOT RESPONSE PHASE** (Dr.iSHA - Automatic)

**Trigger:** Incoming WhatsApp message  
**Location:** `omnichannel-chat.service.js::handleWhatsAppMessage()`  
**Process:**
```
1. Detect medical query keywords
   - Symptoms: pain, fever, cough, etc.
   - Actions: appointment, prescription, etc.
   - Languages: English + Hindi
   
2. If medical query detected:
   - Send to Dr.iSHA AI API
   - Get automated response
   - Send bot response to RocketChat #whatsapp
   - Include disclaimer: "AI Assistant Response"
   
3. If not medical query:
   - Route to appropriate department
   - Queue for human agent
   - Notify agent of waiting customer
```

**Bot Response Example:**
```
Customer: "मुझे बुखार है और खांसी है"
↓
Dr.iSHA AI: "आपके लक्षणों से ऐसा लगता है कि आप सामान्य सर्दी या फ्लू से पीड़ित हो सकते हैं...
[Full medical guidance]

यदि आप किसी डॉक्टर से परामर्श करना चाहते हैं, तो समर्थन टीम से संपर्क करें।"
```

---

### 2. **HANDOFF DETECTION PHASE** (Real-time Logic)

**Trigger:** Bot cannot decide OR customer explicitly asks for agent  
**Location:** `omnichannel-chat.service.js::determineHandoffNeeded()`  
**Process:**
```
CRITERIA FOR HANDOFF:
✓ Bot confidence < 60%
✓ Customer says: "talk to human", "agent", "support team"
✓ Multi-turn conversation without resolution
✓ Complex medical condition (emergency keywords)
✓ Customer requests specific service (appointment, prescription)
✓ Department availability check passes

HANDOFF LOGIC IN CODE:
```javascript
async determineHandoffNeeded(message, botResponse, department) {
  // Check bot confidence
  if (botResponse.confidence < 0.60) {
    return { handoff: true, reason: 'low_confidence' };
  }
  
  // Check for explicit handoff requests
  const handoffKeywords = ['agent', 'human', 'support', 'talk to'];
  if (handoffKeywords.some(k => message.includes(k))) {
    return { handoff: true, reason: 'explicit_request' };
  }
  
  // Emergency detection
  if (isEmergency(message)) {
    return { handoff: true, reason: 'emergency', priority: 'high' };
  }
  
  return { handoff: false };
}
```
```

---

### 3. **AGENT ROUTING PHASE** (Queue Management)

**Trigger:** Handoff decision made  
**Location:** `omnichannel-chat.service.js::routeToAgent()`  
**Process:**
```
1. Find available agents for department
   GET /api/v1/livechat/users/agent?department=General

2. Check queue status
   GET /api/v1/livechat/queue

3. Queue customer if no agents available
   - Store in RocketChat queue
   - Send notice to customer: "Connecting you to an agent..."
   - Notify agents in department

4. Assign to available agent
   - Transfer room to agent
   - Send context (previous messages, bot response)

QUEUE STATUS EXAMPLE:
{
  "open": 5,           // waiting customers
  "inService": 3,      // being served
  "onHold": 2,         // on hold
  "agents": 4,         // available
  "longestWaiting": 120 // seconds
}
```

---

### 4. **AGENT RESPONSE PHASE** (Manual)

**Trigger:** Agent joins RocketChat room and types message  
**Location:** RocketChat Dashboard → #whatsapp channel  
**Process:**
```
Agent sees:
- Customer WhatsApp number
- Chat history with bot response
- Department classification
- Customer profile (if Mediczy patient)

Agent actions:
1. Review customer context
2. Type response in RocketChat
3. Message appears in #whatsapp channel
4. RocketChat webhook triggered (POST /webhook/rocketchat)
5. Mediczy extracts phone number + message
6. Sends to WhatsApp customer

AGENT INTERFACE IN ROCKETCHAT:
┌──────────────────────────────────────────┐
│ #whatsapp - Customer from +919876543210 │
├──────────────────────────────────────────┤
│ 16:42 bot: "आपके लक्षणों से ऐसा लगता है..." │
│ 16:43 customer: "कृपया डॉक्टर से मिलाइए"   │
│ 16:44 support_admin: "एक डॉक्टर को      │
│       आपसे जल्द संपर्क करेंगे..."          │
├──────────────────────────────────────────┤
│ Type message to reply...                 │
└──────────────────────────────────────────┘
```

---

### 5. **RESPONSE DELIVERY PHASE** (To Customer)

**Trigger:** Agent message sent in RocketChat  
**Location:** `omnichannel-chat.service.js::sendToWhatsApp()`  
**Process:**
```
1. RocketChat fires outgoing webhook
   POST https://mediqzy.com/api/support/webhook/rocketchat
   
   Payload:
   {
     "channel": "#whatsapp",
     "message": {
       "msg": "एक डॉक्टर को आपसे जल्द संपर्क करेंगे।",
       "u": { "username": "support_admin" },
       "_id": "randomMessageId"
     },
     "room": {
       "v": { "phone": [{ "phoneNumber": "+919876543210" }] }
     }
   }

2. Mediczy webhook handler (support-chat.route.js):
   - Extract phone number
   - Normalize to WhatsApp format
   - Get message content

3. Send via WhatsApp:
   - Try Production WhatsApp Service (Twilio)
   - Fallback to standard WhatsApp API
   
   Request:
   {
     "to": "+919876543210",
     "body": "Support Team: एक डॉक्टर को आपसे जल्द संपर्क करेंगे।"
   }

4. Update handoff state
   - Set: { active: true, reason: 'agent_message' }
   - TTL: 24 hours

5. Customer receives message on WhatsApp
```

---

## Complete End-to-End Example

```
STEP 1: Customer sends WhatsApp message
────────────────────────────────────────
Customer: "मुझे बुखार है 2 दिन से"

         ↓

STEP 2: Mediczy receives & processes
────────────────────────────────────────
POST /api/support/webhook/whatsapp
{
  "from": "+919876543210",
  "body": "मुझे बुखार है 2 दिन से",
  "profileName": "Raj Kumar"
}

         ↓

STEP 3: Bot decides
────────────────────────────────────────
- Detect department: medical (medical keywords found)
- Detect handoff: false (within bot scope)
- Send to Dr.iSHA: 
  Query: "बुखार है 2 दिन से"
  Response: "[AI Medical Response]"
  Confidence: 0.85

         ↓

STEP 4: Bot responds to customer
────────────────────────────────────────
Bot posts in RocketChat #whatsapp:
"🤖 Dr.iSHA: आपके लक्षणों से...
[Medical Guidance]

अगर आपको और समर्थन चाहिए तो हमारी टीम से संपर्क करें।"

RocketChat webhook sends to WhatsApp:
Customer receives bot response

         ↓

CUSTOMER FOLLOWS UP:
Customer: "मुझे डॉक्टर से बात करवाया करें"

         ↓

STEP 5: Handoff triggered
────────────────────────────────────────
- Detect explicit request: "डॉक्टर"
- Create RocketChat room for agent
- Check for available agents
- Queue customer: "एक मिनट में समर्थन टीम आ जाएगी"

         ↓

STEP 6: Agent responds
────────────────────────────────────────
Agent (support_admin) joins #whatsapp room
Sees customer context + bot response
Types: "नमस्ते! मैं आपकी सहायता कर सकता हूँ। 
क्या आप किसी विशेष लक्षण के बारे में चिंतित हैं?"

         ↓

STEP 7: Customer receives agent response
────────────────────────────────────────
RocketChat webhook triggered
Mediczy extracts phone: +919876543210
Sends to WhatsApp:
"Support Team: नमस्ते! मैं आपकी सहायता कर सकता हूँ...
क्या आप किसी विशेष लक्षण के बारे में चिंतित हैं?"

Customer receives message on WhatsApp ✓
```

---

## Configuration Required

### `.env` Variables:
```env
# Bot Configuration
DRISHA_AI_API_URL=http://localhost:8001/api/medical-advice
DRISHA_AI_MODEL=groq-llama
BOT_CONFIDENCE_THRESHOLD=0.60

# Handoff Rules
HANDOFF_KEYWORDS=agent,human,support,doctor,talk to
EMERGENCY_KEYWORDS=emergency,urgent,critical,chest pain
AUTO_HANDOFF_TIMEOUT=300  # seconds of no response

# Queue Settings
MAX_QUEUE_WAIT=600  # 10 minutes
AUTO_ESCALATE_AFTER=900  # 15 minutes

# RocketChat Integration
ROCKETCHAT_LIVECHAT_ENABLED=true
ROCKETCHAT_OMNICHANNEL_ENABLED=true

# WhatsApp Response
WHATSAPP_SESSION_TIMEOUT=86400  # 24 hours
```

---

## Files to Implement/Modify

```
1. ✅ omnichannel-chat.service.js
   - ✅ registerVisitor()
   - ✅ createOrGetRoom()
   - ✅ handleWhatsAppMessage()
   - 🔶 Need: determineHandoffNeeded()
   - 🔶 Need: getBotResponse() (Dr.iSHA call)
   - ✅ sendToWhatsApp()

2. ✅ support-chat.route.js
   - ✅ /webhook/whatsapp (receiver)
   - ✅ /webhook/rocketchat (receiver)
   - 🔶 Need: /webhook/handoff-trigger
   - 🔶 Need: /webhook/agent-joined

3. 🔶 whatsapp-bot.service.js (NEW)
   - callDrIshaAI()
   - evaluateBotConfidence()
   - formatBotResponse()
   - detectHandoffNeeded()

4. ✅ Redis Cache
   - whatsapp:handoff:{phone}
   - whatsapp:session:{phone}
```

---

## Testing the Flow

```bash
# Test 1: Medical Query (Bot responds)
curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+919876543210",
    "body": "मुझे बुखार है",
    "profileName": "Test User"
  }'

# Expected: Bot response in RocketChat, then to WhatsApp

# Test 2: Handoff Request (Agent takes over)
curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+919876543210",
    "body": "मुझे किसी डॉक्टर से बात करनी है",
    "profileName": "Test User"
  }'

# Expected: Room routed to agent, queued, agent joins

# Test 3: Agent Response (To customer)
# Agent types in RocketChat #whatsapp → Webhook fires → Customer receives on WhatsApp
```

---

## Status

- ✅ Infrastructure ready (RocketChat + Mediczy + WhatsApp)
- ✅ Message receiving & routing working
- 🔶 Bot response logic needs enhancement (Dr.iSHA integration)
- 🔶 Handoff decision logic needs implementation
- ✅ Agent response delivery ready

**Next:** Implement bot decision logic and handoff triggers
