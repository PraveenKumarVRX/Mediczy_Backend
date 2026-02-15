## Conversation-User Analytics Architecture
### Database Schema & Health Diary Integration

**Date**: 2026-02-15  
**Status**: Implementation Ready  
**Purpose**: Link conversations to user records for analytics, health diary, and future reference

---

## 📋 Overview

This architecture establishes explicit relationships between conversations and users in the medcal system, enabling:
- ✅ Analytics on patient-doctor communications
- ✅ Health diary features with message extraction
- ✅ Conversation history tracking per user
- ✅ Compliance/retention via conversation archival
- ✅ Multi-channel communication analytics (WhatsApp, email, RocketChat, SMS, app)

---

## 🗄️ Database Schema Changes

### 1. `chat_conversations` Table Updates

```sql
-- New Columns Added:
user_id_1 INTEGER          -- First participant (linked to users table)
user_id_2 INTEGER          -- Second participant (linked to users table)
health_context JSONB       -- Health data extracted from conversation
category VARCHAR(50)       -- Conversation category: general, medical, appointment, prescription, follow-up
is_archived BOOLEAN        -- Archive status for retention
archived_at TIMESTAMP      -- Date archived
message_count INTEGER      -- Total messages (denormalized for performance)

-- New Indexes:
idx_chat_conversations_user_id_1     -- Fast lookup by first user
idx_chat_conversations_user_id_2     -- Fast lookup by second user
idx_chat_conversations_category      -- Filter by category
idx_chat_conversations_is_archived   -- Find active vs archived
idx_chat_conversations_user_1_2      -- Composite index for pairwise queries
```

**Example Row**:
```
id: 42
conversation_id: "129_145"
user_id_1: 129              ← Links to users.id
user_id_2: 145              ← Links to users.id
category: "medical"
message_count: 23
last_message_at: 2026-02-15 08:30:00
health_context: {
  "symptoms": ["fever", "cough"],
  "medications": ["paracetamol"],
  "vitals": {"temp": 98.6}
}
is_archived: false
```

### 2. `chat_messages` Table Updates

```sql
-- New Columns Added:
health_keywords JSONB      -- Extracted keywords: ["symptom1", "medication1", ...]
health_sentiment VARCHAR   -- positive, neutral, negative
channel VARCHAR(20)        -- app, whatsapp, email, rocketchat, sms

-- New Indexes:
idx_chat_messages_sender_id           -- Link to user sending message
idx_chat_messages_recipient_id        -- Link to user receiving message
idx_chat_messages_channel             -- Filter by communication channel
idx_chat_messages_health_sentiment    -- Find positive/negative health messages
idx_chat_messages_created_at          -- Time-series queries
```

**Example Row**:
```
id: 5234
conversation_id: "129_145"
sender_id: 129              ← Links to users.id
recipient_id: 145           ← Links to users.id
content: "I've been having a high fever and cough for 3 days. Using ibuprofen."
health_keywords: ["fever", "cough", "ibuprofen"]
health_sentiment: "negative"
message_type: "health_update"
channel: "whatsapp"
created_at: 2026-02-15 08:25:00
```

### 3. New Analytical Views

**`v_user_conversation_analytics`** - Conversation metrics per user
```sql
SELECT * FROM v_user_conversation_analytics WHERE user_id = 129;
-- Returns:
-- user_id | conversation_count | total_messages | avg_message_length | health_related_messages
```

**`v_user_health_insights`** - Health-specific data per user
```sql
SELECT * FROM v_user_health_insights WHERE user_id = 129;
-- Returns health conversations, message counts, sentiment breakdown, channels
```

---

## 🔗 How Conversations Link to Users

### One-to-Many Relationship

```
users (129)
  ├── conversation (129_145) with user 145
  │   ├── message 5234: "I've been having fever..."
  │   ├── message 5235: "That sounds serious..."
  │   └── message 5236: "Take these medications..."
  └── conversation (129_150) with user 150
      ├── message 5301: "Appointment scheduled for..."
      └── message 5302: "Confirmed. See you then."
```

### Database Query Examples

```javascript
// Get all conversations for user 129
SELECT * FROM chat_conversations 
WHERE user_id_1 = 129 OR user_id_2 = 129;

// Get conversations between user 129 and 145
SELECT * FROM chat_conversations 
WHERE (user_id_1 = 129 AND user_id_2 = 145)
   OR (user_id_1 = 145 AND user_id_2 = 129);

// Get health-related conversations
SELECT * FROM chat_conversations 
WHERE (user_id_1 = 129 OR user_id_2 = 129)
  AND health_context IS NOT NULL;

// Get messages with health keywords
SELECT * FROM chat_messages 
WHERE (sender_id = 129 OR recipient_id = 129)
  AND health_keywords IS NOT NULL;
```

---

## 📊 Analytics Features

### 1. Conversation Report

**Endpoint**: `GET /api/analytics/user-conversation-report`

**Returns**:
```javascript
{
  userId: 129,
  summary: {
    totalConversations: 15,
    totalMessages: 342,
    categoriesUsed: ["medical", "appointment", "prescription"],
    channelsUsed: { "app": 8, "whatsapp": 5, "email": 2 },
    healthRelatedConversations: 7
  },
  conversations: [
    {
      conversationId: "129_145",
      category: "medical",
      withUserId: 145,
      messageCount: 23,
      healthMessages: 8,
      startedAt: "2026-01-20T10:00:00Z",
      lastMessageAt: "2026-02-15T08:30:00Z",
      channels: ["whatsapp", "app"]
    }
  ]
}
```

### 2. Health Diary

**Endpoint**: `GET /api/analytics/health-diary`

**Returns**:
```javascript
{
  userId: 129,
  totalEntries: 34,
  sentimentBreakdown: {
    positive: 8,
    neutral: 18,
    negative: 8
  },
  topKeywords: [
    { keyword: "fever", count: 12 },
    { keyword: "cough", count: 10 },
    { keyword: "medication", count: 8 }
  ],
  entries: [
    {
      date: "2026-02-15T08:25:00Z",
      sentiment: "negative",
      keywords: ["fever", "cough"],
      content: "I've been having a high fever...",
      channel: "whatsapp",
      withUserId: 145
    }
  ]
}
```

### 3. Dashboard Metrics

**Endpoint**: `GET /api/analytics/dashboard`

**Returns**:
```javascript
{
  userId: 129,
  activeConversations: 12,
  thisWeek: 3,
  thisMonth: 7,
  messagesThisWeek: 45,
  averageConversationLength: 23,
  communicationChannels: 4,
  healthContextConversations: 5,
  lastActivityAt: "2026-02-15T08:30:00Z"
}
```

---

## 🏥 Health Diary Feature

The health diary extracts health-related information from conversations for patient reference:

### Extracted Health Data

**Symptoms**: fever, cough, headache, nausea, etc.  
**Medications**: paracetamol, ibuprofen, amoxicillin, etc.  
**Vitals**: temperature, blood pressure, heart rate, weight  
**Timeline**: When symptoms started, duration, progression  
**Actions Taken**: Medications taken, lifestyle changes, follow-ups

### Health Sentiment Analysis

- **Positive**: Patient improving, symptoms resolved, good prognosis
- **Neutral**: Status updates, factual information, scheduling
- **Negative**: Worsening symptoms, complications, adverse reactions

### Example Health Diary Entry

```javascript
{
  date: "2026-02-15T08:25:00Z",
  type: "health_update",
  sentiment: "negative",  // Worsening symptoms
  keywords: {
    symptoms: ["high_fever", "persistent_cough"],
    medications: ["paracetamol", "cough_syrup"],
    duration: "3_days"
  },
  content: "Fever is still 38.5°C. Cough is worse at night. Already taking paracetamol every 6 hours.",
  channel: "whatsapp",
  conversationCategory: "medical",
  withUserId: 145  // Doctor ID
}
```

---

## 🛠️ Implementation Guide

### Step 1: Run Migration

```bash
# PostgreSQL migration
psql -h localhost -U postgres mediczy_ai < server/migrations/202602150715-add-conversation-user-analytics.sql
```

**Creates**:
- ✅ New columns on `chat_conversations`
- ✅ New columns on `chat_messages`
- ✅ Indexes for performance
- ✅ Analytical views
- ✅ Populates existing conversations with user IDs

### Step 2: Restart Backend

```bash
pm2 restart mediczy-server --update-env
```

The ORM models automatically sync with updated schema.

### Step 3: Update Message Processing

When new messages arrive, capture health context:

```javascript
// In messageProcessingService or webhook handler
const message = {
  content: "I've had a fever for 2 days and started cough today",
  healthKeywords: ["fever", "cough"],      // Extracted
  healthSentiment: "negative",              // Analyzed
  channel: "whatsapp"                       // Tracked
};

// ORM automatically links to user via sender_id
await ChatMessageModel.create({
  conversationId: convId,
  senderId: userId,
  recipientId: doctorId,
  ...message
});
```

### Step 4: Use Analytics Service

```javascript
import conversationAnalyticsService from './services/conversation-analytics.service.js';

// Get user's conversation report
const report = await conversationAnalyticsService.getUserConversationReport(userId, {
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-02-15')
});

// Get health diary
const diary = await conversationAnalyticsService.getUserHealthDiary(userId);

// Get dashboard metrics
const metrics = await conversationAnalyticsService.getUserDashboardMetrics(userId);
```

### Step 5: Register Routes

```javascript
import analyticsRouter from './routes/analytics.route.js';

// In main app setup
app.use('/api/analytics', analyticsRouter);
```

---

## 📡 API Endpoints

### Public Endpoints (Authenticated Users Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/user-conversation-report` | Get conversation analytics |
| GET | `/api/analytics/health-diary` | Get health diary entries |
| GET | `/api/analytics/health-diary/summary` | Get 30-day health summary |
| GET | `/api/analytics/dashboard` | Get dashboard metrics |
| GET | `/api/analytics/pairwise-stats/:userId` | Get stats between two users |
| GET | `/api/analytics/conversation-export` | Export conversations as JSON |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analytics/archive-old` | Archive conversations >90 days old |

---

## 🔒 Security & Compliance

### Data Access Control
- ✅ Users can only access their own conversation data
- ✅ Doctors can access patient conversations with permission
- ✅ Admins can archive/export for compliance
- ✅ Authentication required on all endpoints

### Data Retention
- Conversations auto-archived after 90 days (configurable)
- Administrators can trigger archive manually
- HIPAA-compliant conversation export

### Privacy
- Health keywords extracted locally, not sent to third parties
- Sentiment analysis performed on PostgreSQL side
- No PII in analytical views

---

## 📈 Query Examples

### Get User's Monthly Activity

```sql
SELECT 
  DATE_TRUNC('month', cc.created_at) as month,
  COUNT(DISTINCT cc.id) as conversations,
  COUNT(cm.id) as total_messages,
  COUNT(CASE WHEN cm.health_sentiment = 'negative' THEN 1 END) as negative_health_updates
FROM chat_conversations cc
LEFT JOIN chat_messages cm ON cc.id = cm.conversation_id
WHERE cc.user_id_1 = 129 OR cc.user_id_2 = 129
GROUP BY DATE_TRUNC('month', cc.created_at)
ORDER BY month DESC;
```

### Find Users with Recent Health Concerns

```sql
SELECT DISTINCT
  CASE WHEN cm.sender_id = 129 THEN cm.recipient_id 
       ELSE cm.sender_id 
  END as interacted_with_user,
  COUNT(CASE WHEN cm.health_sentiment = 'negative' THEN 1 END) as negative_health_messages
FROM chat_messages cm
WHERE (cm.sender_id = 129 OR cm.recipient_id = 129)
  AND cm.created_at > NOW() - INTERVAL '7 days'
  AND cm.health_sentiment IS NOT NULL
GROUP BY interacted_with_user
HAVING COUNT(CASE WHEN cm.health_sentiment = 'negative' THEN 1 END) > 3;
```

### Get Conversational Health Summary

```sql
SELECT 
  cc.conversation_id,
  COUNT(cm.id) as total_messages,
  ARRAY_AGG(DISTINCT cm.health_keyword) as all_health_keywords,
  COUNT(CASE WHEN cm.health_sentiment = 'positive' THEN 1 END) as positive_updates,
  MAX(cm.created_at) as last_update
FROM chat_conversations cc
LEFT JOIN chat_messages cm ON cc.id = cm.conversation_id
WHERE (cc.user_id_1 = 129 OR cc.user_id_2 = 129)
  AND cm.health_keywords IS NOT NULL
GROUP BY cc.id
ORDER BY last_update DESC;
```

---

## 🚀 Future Enhancements

- [ ] AI-powered symptom extraction from message content
- [ ] Medication interaction warnings
- [ ] Appointment reminder extraction
- [ ] Prescription history tracking
- [ ] Telehealth integration metrics
- [ ] Patient satisfaction analysis
- [ ] Doctor response time analytics
- [ ] Multi-language health keyword extraction
- [ ] HIPAA audit logging on data access
- [ ] Encrypted conversation backup

---

## 📞 Support

For questions or issues with the analytics implementation:

1. Check logs: `pm2 logs mediczy-server`
2. Verify migration: `psql -c "\d chat_conversations"`
3. Test endpoints: Postman collection available
4. Review service: `server/services/conversation-analytics.service.js`

---

## 📝 Changelog

**2026-02-15**: Initial implementation
- Added user_id_1, user_id_2 to chat_conversations
- Added health_keywords, health_sentiment, channel to chat_messages
- Created analytics service and routes
- Implemented health diary extraction
- Added dashboard metrics endpoint
