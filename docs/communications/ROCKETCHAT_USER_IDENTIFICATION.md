# How RocketChat Identifies WhatsApp Users

**Quick Answer:** RocketChat identifies WhatsApp users through a **visitor token** generated from their phone number, combined with custom fields that store their patient data.

---

## User Identification Flow

```
WhatsApp User sends message
        ↓
Phone number extracted (+919876543210)
        ↓
Mediczy database lookup → Check if registered patient
        ↓
IF Registered:                    IF Not Registered:
├─ Patient found                  └─ Create anonymous visitor
├─ Use patient data               └─ Use phone number as ID
└─ Create visitor with patient ID
        ↓
Generate unique visitor token (SHA256 of phone)
        ↓
Register as RocketChat livechat visitor
        ↓
Create/get livechat room
        ↓
Phone number stored in custom field
        ↓
Agent sees room + can reply to WhatsApp number
```

---

## 1. Visitor Token Generation

### Code: [omnichannel-chat.service.js](server/services/omnichannel-chat.service.js#L155-L160)

```javascript
generateVisitorToken(patientId) {
  const crypto = require('crypto');
  const hash = crypto
    .createHash('sha256')
    .update(`mediczy-patient-${patientId}`)
    .digest('hex')
    .substring(0, 32);
  return hash;
}

// Example:
// Patient ID: 12345
// Token: 4a7b8c9d1e2f... (SHA256 hash)
// Socket: whatsapp-patient-12345 (for real-time updates)
```

**Why a token?**
- RocketChat requires a unique identifier for each visitor
- Derived from patient ID for consistency
- Same phone number always gets same token
- Prevents duplicate visitors

---

## 2. Visitor Registration

### Code: [omnichannel-chat.service.js](server/services/omnichannel-chat.service.js#L95-L145)

### For Registered Patients (Known Users)

```javascript
async registerVisitor(patient) {
  const visitorToken = this.generateVisitorToken(patient.id);
  
  const visitorData = {
    visitor: {
      token: visitorToken,
      name: `${patient.firstName} ${patient.lastName}`,
      email: patient.email,
      phone: [{
        phoneNumber: patient.phoneNumber  // ← Critical for replies!
      }],
      customFields: [
        { 
          key: 'mediczyPatientId', 
          value: String(patient.id),
          overwrite: true 
        },
        { 
          key: 'uhid', 
          value: patient.uhid || '',
          overwrite: true 
        },
        { 
          key: 'phone', 
          value: patient.phoneNumber,
          overwrite: true 
        },
        { 
          key: 'dateOfBirth', 
          value: patient.dateOfBirth || '',
          overwrite: true 
        },
        { 
          key: 'gender', 
          value: patient.gender || '',
          overwrite: true 
        },
        { 
          key: 'source', 
          value: 'mediczy_app',
          overwrite: true 
        }
      ]
    }
  };

  // Register in RocketChat
  const response = await axios.post(
    `${this.rocketChatUrl}/api/v1/livechat/visitor`,
    visitorData,
    { headers: this.getHeaders() }
  );

  return {
    success: true,
    visitorToken,
    visitor: response.data.visitor
  };
}
```

**What gets stored in RocketChat:**
```javascript
{
  _id: "VISITOR_ID_FROM_RC",          // RocketChat assigns
  token: "4a7b8c9d1e2f...",           // Our generated token
  name: "John Doe",                   // From Mediczy DB
  email: "john@example.com",          // From Mediczy DB
  phone: [
    { phoneNumber: "+919876543210" }  // Used for agent replies!
  ],
  customFields: {
    mediczyPatientId: "12345",        // Links back to Mediczy
    uhid: "MED123456",
    source: "mediczy_app"
  },
  createdAt: "2026-02-15T05:00:00Z",
  lastMessageAt: "2026-02-15T05:30:00Z"
}
```

---

## 3. Anonymous WhatsApp Users

### Code: [omnichannel-chat.service.js](server/services/omnichannel-chat.service.js#L385-L398)

If user is NOT in Mediczy database:

```javascript
// Anonymous user
const visitorResult = await this.registerVisitor({
  id: `whatsapp-${from}`,              // Unique ID from phone
  firstName: 'WhatsApp',
  lastName: 'User',
  phoneNumber: from
});

// Creates in RocketChat:
// {
//   name: "WhatsApp User",
//   phone: [{ phoneNumber: "+919876543210" }],
//   customFields: {
//     mediczyPatientId: "whatsapp-+919876543210"
//   }
// }
```

---

## 4. Identifiable Fields in RocketChat

When agent sees a message in RocketChat, they see:

### In Message View
```
📱 WhatsApp Message from: John Doe
Phone: +919876543210
Patient ID: 12345
UHID: MED123456
Gender: Male
DOB: 1990-05-15
```

### In Livechat Console (Right Panel)
```
Visitor Information:
├─ Name: John Doe
├─ Email: john@example.com
├─ Phone: +919876543210
├─ Patient ID: 12345
├─ UHID: MED123456
├─ Status: Online (active)
└─ Last Message: 5 minutes ago
```

---

## 5. User Lookup During Incoming Message

### Code: [whatsapp-production.route.js](server/routes/whatsapp-production.route.js#L907-L925)

```javascript
// Step 1: Extract phone from WhatsApp
const phoneNumber = From?.replace('whatsapp:', '') || '';
const customerName = ProfileName || phoneNumber;

// Step 2: Lookup in Mediczy database
const userContext = await whatsAppUserContextService.getFullUserContext(phoneNumber);

// Returns:
{
  isKnownUser: true,
  user: {
    id: 12345,
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: "+919876543210",
    uhid: "MED123456"
  },
  appointments: { recent: [...] },
  prescriptions: { recent: [...] },
  medicalHistory: { ... },
  activeHandoff: false
}

// Step 3: Register as visitor in RocketChat
if (userContext.user) {
  await omnichannelChatService.registerVisitor(userContext.user);
}
```

---

## 6. Linking Messages to Visitors

### Phone Number Match

When RocketChat webhook fires (agent replies), RocketChat sends:

```javascript
{
  room: {
    v: {                                // Visitor object
      _id: "VISITOR_ID",
      name: "John Doe",
      phone: [{
        phoneNumber: "+919876543210"    // ← Essential identifier!
      }]
    }
  },
  message: {
    msg: "Agent's reply",
    u: {                                // User (agent)
      _id: "AGENT_ID",
      name: "Support Admin",
      type: "user"                      // NOT "visitor"
    }
  }
}
```

**Backend identifies:**
1. Message is from agent (u.type !== "visitor")
2. Extract phone from room.v.phone[0].phoneNumber
3. Send reply to that WhatsApp number
4. Log conversation linked to this phone

---

## 7. Multi-Identifier Approach

RocketChat uses **multiple fields** to ensure unique user identification:

| Field | Purpose | Example |
|-------|---------|---------|
| `visitorToken` | Primary key in RocketChat | SHA256 hash |
| `phone` | Identifies WhatsApp number for replies | +919876543210 |
| `customField: mediczyPatientId` | Links to Mediczy database | 12345 |
| `customField: uhid` | Hospital/Clinic ID | MED123456 |
| `name` | Human-readable | John Doe |
| `email` | Additional contact | john@example.com |
| `lastMessageAt` | Tracks active users | ISO timestamp |

---

## 8. User Identification Scenarios

### Scenario 1: Registered Patient Sends WhatsApp
```
WhatsApp: +919876543210 → "I have a fever"
           ↓
Mediczy lookup → Found: Patient ID 12345 (John Doe)
           ↓
Register visitor with:
- Name: John Doe
- Phone: +919876543210
- Patient ID: 12345
           ↓
RocketChat room shows: "John Doe (Patient #12345)"
           ↓
Agent replies → Sent back to +919876543210
```

### Scenario 2: Unknown WhatsApp Number
```
WhatsApp: +919999888877 → "How much is consultation?"
           ↓
Mediczy lookup → NOT FOUND
           ↓
Register as anonymous:
- Name: WhatsApp User
- Phone: +919999888877
- Patient ID: whatsapp-+919999888877
           ↓
RocketChat room shows: "WhatsApp User"
           ↓
Agent replies → Sent back to +919999888877
```

### Scenario 3: Same Patient, Multiple Messages
```
Session 1: John Doe sends message
- Token generated: 4a7b8c9d1e2f...
- Room created
- Conversation stored

...Later...

Session 2: John Doe sends message again
- Same token generated: 4a7b8c9d1e2f...
- EXISTING room retrieved
- Conversation continues (history visible)
- Agent sees all previous messages
```

---

## 9. Custom Fields Storage

All patient metadata stored as custom fields:

```javascript
customFields: [
  {
    key: "mediczyPatientId",
    value: "12345",
    overwrite: true
  },
  {
    key: "uhid",
    value: "MED123456",
    overwrite: true
  },
  {
    key: "phone",
    value: "+919876543210",
    overwrite: true
  },
  {
    key: "gender",
    value: "Male",
    overwrite: true
  },
  {
    key: "dateOfBirth",
    value: "1990-05-15",
    overwrite: true
  },
  {
    key: "source",
    value: "mediczy_app",
    overwrite: true
  }
]
```

**Accessible to agents in RocketChat:** via livechat UI or API

---

## 10. Verification: Phone Number to WhatsApp Route

### Code: [omnichannel-chat.service.js](server/services/omnichannel-chat.service.js#L553-L585)

When agent replies in RocketChat:

```javascript
async sendToWhatsApp(webhookData) {
  const { room, message } = webhookData;
  
  // Skip visitor messages (only send agent replies)
  const isVisitorMessage = !!message?.token && (
    message?.u?.type === 'visitor'
    || message?.u?.roles?.includes('livechat-visitor')
  );
  if (isVisitorMessage) return; // Don't send back to user
  
  // Extract phone from visitor object
  const visitor = room.v;
  const rawPhone = visitor?.phone?.[0]?.phoneNumber
    || visitor?.phone?.[0]?.value
    || visitor?.phoneNumber
    || visitor?.phone;

  if (!rawPhone) {
    console.log('❌ No WhatsApp number for visitor');
    return { success: false, error: 'No WhatsApp number' };
  }

  const whatsappNumber = this.normalizeWhatsAppNumber(rawPhone);
  
  // Send via Twilio
  try {
    await whatsappProductionService.sendSessionMessage({
      to: whatsappNumber,                    // +919876543210
      message: message.msg,                  // Agent reply
      conversationId: room._id               // Link to room
    });
    
    console.log(`✅ Sent to WhatsApp: ${whatsappNumber}`);
  } catch (error) {
    console.error(`❌ Failed to send to WhatsApp: ${error.message}`);
  }
}
```

---

## Summary: Identification Stack

```
LAYER 1: WhatsApp Message Arrives
├─ Extract phone number
└─ Extract profile name (optional)

LAYER 2: Mediczy Database Lookup
├─ Search by phone number
├─ If found: Patient data available
└─ If not found: Create anonymous profile

LAYER 3: Visitor Registration
├─ Generate token from patient ID
├─ Create RocketChat visitor
├─ Store patient metadata
└─ Store phone number for replies

LAYER 4: Room Creation
├─ Create/get livechat room
├─ Assign agent
├─ Link visitor to room
└─ Store phone in room data

LAYER 5: Agent sees in RocketChat
├─ Visitor name
├─ Patient ID
├─ Phone number
├─ Recent appointments
├─ Prescriptions
└─ Medical history

LAYER 6: Agent replies
├─ Room webhook fires
├─ Phone extracted from room.v
├─ Reply sent to WhatsApp number
└─ Conversation continues
```

---

## Key Points

✅ **Visitor Token**: Unique SHA256 hash from patient ID
✅ **Phone Storage**: Critical field for WhatsApp replies
✅ **Custom Fields**: Store all patient metadata
✅ **Consistency**: Same phone always links to same visitor
✅ **Fallback**: Anonymous WhatsApp users still identified by phone
✅ **History**: Conversations linked via patient ID
✅ **Tracking**: Each message tagged with patient context

---

## Troubleshooting User Identification

| Problem | Cause | Solution |
|---------|-------|----------|
| "No WhatsApp number found" | Phone not stored in visitor | Ensure phone field set in registerVisitor() |
| Agent sees "WhatsApp User" | Patient not found in database | Check Mediczy database for phone number |
| Different rooms for same user | Token generation failed | Verify patient ID is consistent |
| Lost conversation history | Phone number changed | Use patient ID + phone for dual lookup |
| Agent can't reply | Room lacks visitor data | Ensure createOrGetRoom() links visitor |

---

**Status**: ✅ All WhatsApp users uniquely identified in RocketChat via phone number + patient ID combination
