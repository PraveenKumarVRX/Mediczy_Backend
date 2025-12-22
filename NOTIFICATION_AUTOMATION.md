# Notification Automation System

## Architecture Overview

The Mediczy notification automation system integrates multiple technologies for intelligent, real-time notification delivery:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION AUTOMATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   [Event Source]  →  [Kafka]  →  [Worker]  →  [n8n]  →  [Delivery]         │
│                                                                              │
│   ┌──────────┐      ┌──────────┐      ┌─────────────┐      ┌────────────┐  │
│   │ API      │──┬──▶│ Kafka    │─────▶│ Kafka-n8n   │─────▶│ n8n        │  │
│   │ Endpoints│  │   │ Topics   │      │ Worker      │      │ Workflows  │  │
│   └──────────┘  │   └──────────┘      └─────────────┘      └────────────┘  │
│                 │         │                  │                    │         │
│   ┌──────────┐  │         │                  │                    ▼         │
│   │ Cron     │──┘         │                  │            ┌────────────┐    │
│   │ Jobs     │            │                  │            │ Firebase   │    │
│   └──────────┘            │                  │            │ FCM Push   │    │
│                           ▼                  │            └────────────┘    │
│                    ┌──────────┐              │                    │         │
│                    │PostgreSQL│◀─────────────┤                    │         │
│                    │ Storage  │              │                    ▼         │
│                    └──────────┘              │            ┌────────────┐    │
│                           │                  │            │ Email/SMS  │    │
│                           ▼                  │            │ WhatsApp   │    │
│                    ┌──────────┐              │            └────────────┘    │
│                    │ DuckDB   │              │                    │         │
│                    │Analytics │              ▼                    ▼         │
│                    └──────────┘       ┌─────────────┐      ┌────────────┐   │
│                                       │ VectorDB   │      │ In-App     │   │
│                                       │ Targeting  │      │ Notifs     │   │
│                                       └─────────────┘      └────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Kafka Event Streaming
**Location**: localhost:9092  
**Topics Subscribed**:
- `appointment-events` - Appointment lifecycle events
- `payment-events` - Payment success/failure events
- `video-stream-start` - Consultation started
- `video-stream-end` - Consultation ended
- `doctor-events` - Doctor status changes
- `user-events` - User registration/verification
- `notification-events` - Direct notification requests
- `analytics-events` - Analytics data

### 2. Kafka-n8n Worker
**File**: `server/workers/kafka-n8n.worker.js`  
**Purpose**: Consumes Kafka events and triggers n8n workflows

**Features**:
- User preference checking (quiet hours, channel preferences)
- Automatic workflow routing based on event type
- Fallback to direct notification if n8n unavailable
- PostgreSQL logging of all events
- Analytics publishing to Kafka

### 3. n8n Workflows
**Location**: `n8n-setup/workflows/`  
**URL**: http://localhost:5678

**Workflows Created**:
- `appointment-created.json` - New appointment notifications
- `appointment-reminder.json` - 1 hour and 24 hour reminders
- `payment-notification.json` - Payment success/failure alerts
- `consultation-started.json` - Doctor ready notifications

### 4. Firebase Cloud Messaging
**Configuration**: `.env` Firebase settings  
**Channels**: Push notifications to mobile/web

### 5. PostgreSQL Storage
**Database**: mediczy_ai  
**Tables**:
- `notifications` - In-app notification storage
- `notification_events` - Event tracking and analytics
- `user_notification_preferences` - User channel preferences
- `user_preference_vectors` - VectorDB embeddings for targeting
- `n8n.notification_logs` - n8n workflow logs

### 6. DuckDB Analytics
**File**: `server/services/duckdb-analytics.service.js`  
**Purpose**: High-performance OLAP analytics

**Features**:
- In-memory analytics computation
- PostgreSQL sync for historical data
- Hourly distribution analysis
- Event type aggregation

### 7. VectorDB Service
**File**: `server/services/vectordb.service.js`  
**Purpose**: Intelligent notification routing

**Features**:
- User preference embeddings
- Similar user clustering
- Optimal notification time calculation
- Channel recommendation
- Template matching

## API Endpoints

### Notification Routes (`/api/notifications`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get user notifications |
| GET | `/unread-count` | Get unread count |
| POST | `/:id/read` | Mark notification as read |
| POST | `/read-all` | Mark all as read |
| DELETE | `/:id` | Delete notification |
| POST | `/fcm/register` | Register FCM token |
| POST | `/test` | Send test notification |
| GET | `/preferences` | Get notification preferences |
| POST | `/send` | Send notification (n8n/internal) |
| GET | `/automation/status` | Get worker status |
| GET | `/automation/analytics` | Get analytics |

## Event Flow Examples

### Appointment Created
```
1. User books appointment via API
2. API publishes to Kafka topic 'appointment-events'
3. Kafka-n8n worker receives event
4. Worker checks user preferences
5. Worker triggers n8n workflow 'appointment-created'
6. n8n workflow:
   - Validates appointment data
   - Sends HTTP request to notification API
   - Logs to PostgreSQL
7. Notification sent via:
   - Firebase push (if enabled)
   - Email (if enabled)
   - In-app notification
8. Event logged to analytics
```

### Payment Success
```
1. Payment webhook received
2. API publishes to Kafka topic 'payment-events'
3. Worker routes to 'payment-notification' workflow
4. n8n sends notifications to:
   - Patient: Push + Email + SMS + In-app
   - Doctor: Push + In-app
5. Analytics event published
```

## Configuration

### Environment Variables
```env
# Kafka
KAFKA_ENABLED=true
KAFKA_BROKERS=localhost:9092

# n8n
N8N_WEBHOOK_URL=http://localhost:5678/webhook

# Firebase
FIREBASE_PROJECT_ID=mediczy-624ed
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...
FIREBASE_PRIVATE_KEY=...
```

### User Preference Model
```javascript
{
  userId: UUID,
  userType: 'patient' | 'doctor' | 'admin' | 'hospital',
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: true,
  whatsappEnabled: false,
  inAppEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezone: 'Asia/Kolkata',
  appointmentNotifications: true,
  paymentNotifications: true,
  reminderNotifications: true,
  marketingNotifications: false
}
```

## Monitoring

### PM2 Services
```bash
pm2 list
# mediczy-server (includes Kafka-n8n worker)
# mediczy-n8n
# mediczy-sib
# mediczy-frontend
```

### Kafka Consumer Groups
```bash
/home/ubuntu/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe --group mediczy-notification-group
```

### Logs
```bash
pm2 logs mediczy-server --lines 100
```

## Development

### Adding New Notification Type

1. **Create n8n Workflow**: `n8n-setup/workflows/new-type.json`
2. **Add Topic Mapping**: Update `TOPIC_WORKFLOW_MAP` in worker
3. **Publish Event**: Use Kafka producer from API
4. **Test**: Send test event and verify delivery

### Testing
```bash
# Send test notification via API
curl -X POST http://localhost:8000/api/notifications/test \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type": "appointment_created", "title": "Test", "message": "Test notification"}'
```

## Services Status

| Service | Port | Status |
|---------|------|--------|
| Kafka | 9092 | ✅ Running |
| Zookeeper | 2181 | ✅ Running |
| n8n | 5678 | ✅ Running |
| PostgreSQL | 5432 | ✅ Running |
| Redis | 6379 | ✅ Running |
| Prometheus | 9090 | ✅ Running |
| Grafana | 3000 | ✅ Running |
| SIB AI | 8001 | ✅ Running |
| Server | 8000 | ✅ Running |

## Files Created

- `server/workers/kafka-n8n.worker.js` - Kafka consumer and n8n trigger
- `server/services/duckdb-analytics.service.js` - DuckDB analytics
- `server/services/vectordb.service.js` - VectorDB targeting
- `server/services/notification-orchestrator.service.js` - Unified orchestration
- `server/services/notification-automation.service.js` - Legacy automation service
- `n8n-setup/workflows/appointment-created.json` - Appointment workflow
- `n8n-setup/workflows/appointment-reminder.json` - Reminder workflow
- `n8n-setup/workflows/payment-notification.json` - Payment workflow
- `n8n-setup/workflows/consultation-started.json` - Consultation workflow

---
Last Updated: December 18, 2025
