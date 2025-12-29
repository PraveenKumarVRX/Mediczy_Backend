# SIB Unified Task Router - Integration Guide

## Overview

All Node.js routes must be refactored to route through the **SIB Unified Task Router** instead of handling business logic directly.

**Benefits:**
- ✅ Centralized user identification and context
- ✅ PostgreSQL persistence for all operations
- ✅ Medical NLP processing (MedSpaCy) for all operations
- ✅ Emergency detection and safety filtering
- ✅ Risk assessment via Bayesian networks
- ✅ Audit logging and conversation history
- ✅ Specialized botlet processing
- ✅ Consistent error handling

## SIB Task Types

```
CHAT                        - General conversation (ChatBotlet)
MEDICAL_CONSULT            - Medical consultation (Medical Pipeline)
PROCESS_EHR                - EHR file processing (EHRBotlet)
MEDICAL_RECORD_REVIEW      - Analyze medical records
SCHEDULE_APPOINTMENT       - Schedule with doctor (AppointmentBotlet)
RESCHEDULE_APPOINTMENT     - Reschedule existing appointment
CANCEL_APPOINTMENT         - Cancel appointment
GENERATE_PRESCRIPTION      - Generate prescription (Medical Pipeline)
REVIEW_PRESCRIPTION        - Safety check prescriptions
SEND_NOTIFICATION          - Send notification (NotificationBotlet)
SEND_REMINDER              - Send reminder/alert
ADD_HEALTH_DIARY_ENTRY     - Add health diary entry
UPDATE_HEALTH_DIARY        - Update health diary
ASSESS_RISK                - Risk assessment (Bayesian)
DETECT_EMERGENCY           - Emergency detection
CREATE_TASK                - Create task (TaskBotlet)
UPDATE_TASK                - Update task
COMPLETE_TASK              - Mark task complete
```

## Integration Pattern

### Before (Direct Database/Logic)
```javascript
// Old pattern - bypasses SIB
app.post('/api/appointments/schedule', async (req, res) => {
  const appointment = await Appointment.create({
    doctorId: req.body.doctorId,
    patientId: req.body.patientId,
    // ... direct DB operation
  });
  res.json(appointment);
});
```

### After (Through SIB)
```javascript
const { getSIBTaskProxy } = require('../services/sib-task-proxy');

app.post('/api/appointments/schedule', async (req, res) => {
  try {
    const sib = getSIBTaskProxy();
    const result = await sib.scheduleAppointment(
      req.body.doctorId,
      req.user.patientId,
      req.body.preferredTime,
      req.body.reason,
      req.user.id  // userId
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Routes Requiring Refactoring

### 1. Chat Routes (`chat.route.js`)
**Current:** Direct database operations
**Updated To:** SIB chat tasks

| Endpoint | Task Type | Changes |
|----------|-----------|---------|
| `POST /api/chat` | `chat` | Use `sib.chat(message, userId, patientId)` |
| `GET /api/chat/history` | N/A - Read | Query PostgreSQL directly |
| `POST /api/chat/consult` | `medical_consult` | Use `sib.medicalConsult(...)` |

**Example:**
```javascript
const sib = getSIBTaskProxy();

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const result = await sib.chat(
    req.body.message,
    req.user.id,
    req.user.patientId,
    { includeRisk: req.body.includeRisk }
  );
  res.json(result);
});
```

---

### 2. Appointment Routes (`appointment.route.js`)
**Current:** Direct appointment creation/management
**Updated To:** SIB appointment botlet tasks

| Endpoint | Task Type | Changes |
|----------|-----------|---------|
| `POST /api/appointments` | `schedule_appointment` | Use `sib.scheduleAppointment(...)` |
| `PUT /api/appointments/:id` | `reschedule_appointment` | Use `sib.rescheduleAppointment(...)` |
| `DELETE /api/appointments/:id` | `cancel_appointment` | Use `sib.cancelAppointment(...)` |
| `GET /api/appointments` | N/A - Read | Query database directly |

**Example:**
```javascript
const sib = getSIBTaskProxy();

app.post('/api/appointments', async (req, res) => {
  const result = await sib.scheduleAppointment(
    req.body.doctorId,
    req.user.patientId,
    req.body.preferredTime,
    req.body.reason,
    req.user.id
  );
  res.json(result);
});
```

---

### 3. Notification Routes (`notification.route.js`)
**Current:** Direct notification creation
**Updated To:** SIB notification botlet tasks

| Endpoint | Task Type | Changes |
|----------|-----------|---------|
| `POST /api/notifications` | `send_notification` | Use `sib.sendNotification(...)` |
| `POST /api/reminders` | `send_reminder` | Use `sib.sendReminder(...)` |
| `GET /api/notifications` | N/A - Read | Query database directly |

**Example:**
```javascript
const sib = getSIBTaskProxy();

app.post('/api/notifications', async (req, res) => {
  const result = await sib.sendNotification(
    req.body.message,
    req.user.patientId,
    req.user.id,
    req.body.type || 'info',
    req.body.channels || ['in-app']
  );
  res.json(result);
});
```

---

### 4. Health Diary Routes (`health-diary.route.js`)
**Current:** Direct diary entry creation
**Updated To:** SIB health diary tasks with medical NLP

| Endpoint | Task Type | Changes |
|----------|-----------|---------|
| `POST /api/health-diary` | `add_health_diary_entry` | Use `sib.addHealthDiaryEntry(...)` |
| `PUT /api/health-diary/:id` | `update_health_diary` | Use `sib.updateHealthDiary(...)` |
| `GET /api/health-diary` | N/A - Read | Query database directly |

**Example:**
```javascript
const sib = getSIBTaskProxy();

app.post('/api/health-diary', async (req, res) => {
  const result = await sib.addHealthDiaryEntry(
    req.body.entryType,
    req.body.content,
    req.user.patientId,
    req.user.id,
    req.body.metadata || {}
  );
  res.json(result);
});
```

---

### 5. Prescription Routes (`prescription.route.js`)
**Current:** Direct prescription generation
**Updated To:** SIB medical pipeline with safety checks

| Endpoint | Task Type | Changes |
|----------|-----------|---------|
| `POST /api/prescriptions` | `generate_prescription` | Use `sib.generatePrescription(...)` |
| `POST /api/prescriptions/review` | `review_prescription` | Use `sib.reviewPrescription(...)` |
| `GET /api/prescriptions` | N/A - Read | Query database directly |

**Example:**
```javascript
const sib = getSIBTaskProxy();

app.post('/api/prescriptions', async (req, res) => {
  const result = await sib.generatePrescription(
    req.body.consultationNotes,
    req.user.patientId,
    req.user.id
  );
  res.json(result);
});
```

---

### 6. AI Scribe Routes (`ai-scribe.route.js`)
**Current:** Direct prescription generation via consultMedical
**Updated To:** SIB medical pipeline

| Endpoint | Task Type | Changes |
|----------|-----------|---------|
| `POST /api/ai-scribe/generate-prescription` | `generate_prescription` | Use `sib.generatePrescription(...)` |
| `POST /api/ai-scribe/analyze` | `medical_record_review` | Use `sib.reviewMedicalRecord(...)` |

**Example:**
```javascript
const sib = getSIBTaskProxy();

app.post('/api/ai-scribe/generate-prescription', async (req, res) => {
  const result = await sib.generatePrescription(
    req.body.consultationNotes,
    req.user.patientId,
    req.user.id
  );
  res.json(result);
});
```

---

### 7. EHR Routes (`ehr.route.js`)
**Current:** Direct EHR processing
**Updated To:** SIB EHR botlet with FAISS retrieval

| Endpoint | Task Type | Changes |
|----------|-----------|---------|
| `POST /api/ehr/process` | `process_ehr` | Use `sib.processEHR(...)` |
| `POST /api/ehr/ingest` | `process_ehr` | Use `sib.processEHR(...)` |
| `GET /api/ehr` | N/A - Read | Query database directly |

**Example:**
```javascript
const sib = getSIBTaskProxy();

app.post('/api/ehr/process', async (req, res) => {
  const result = await sib.processEHR(
    req.body.filePath,
    req.user.patientId,
    req.user.id
  );
  res.json(result);
});
```

---

### 8. Task Routes (`task.route.js`)
**Current:** Direct task creation/management
**Updated To:** SIB task botlet

| Endpoint | Task Type | Changes |
|----------|-----------|---------|
| `POST /api/tasks` | `create_task` | Use `sib.createTask(...)` |
| `PUT /api/tasks/:id` | `update_task` | Use `sib.updateTask(...)` |
| `POST /api/tasks/:id/complete` | `complete_task` | Use `sib.completeTask(...)` |
| `GET /api/tasks` | N/A - Read | Query database directly |

**Example:**
```javascript
const sib = getSIBTaskProxy();

app.post('/api/tasks', async (req, res) => {
  const result = await sib.createTask(
    req.body.title,
    req.body.description,
    req.user.patientId,
    req.user.id,
    req.body.taskType || 'general'
  );
  res.json(result);
});
```

---

## Implementation Steps

### Step 1: Install SIB Task Proxy
```bash
# Already created at /server/services/sib-task-proxy.js
```

### Step 2: Update Each Route File
For each route file, follow this pattern:

```javascript
// 1. Import SIB task proxy
const { getSIBTaskProxy } = require('../services/sib-task-proxy');

// 2. Replace direct DB operations with SIB calls
async (req, res) => {
  try {
    const sib = getSIBTaskProxy();
    const result = await sib.methodName(params);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### Step 3: Verify SIB Startup
```bash
# Ensure SIB is running on port 8001
curl http://localhost:8001/health
```

### Step 4: Test Each Endpoint
```bash
# Test chat
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I have chest pain","includeRisk":true}'

# Test appointment
curl -X POST http://localhost:8000/api/appointments \
  -H "Content-Type: application/json" \
  -d '{"doctorId":"doc_123","preferredTime":"2025-06-15 10:00"}'

# Test prescription
curl -X POST http://localhost:8000/api/prescriptions \
  -H "Content-Type: application/json" \
  -d '{"consultationNotes":"Patient has hypertension..."}'
```

---

## Error Handling

SIB returns structured responses:

```javascript
{
  "success": true/false,
  "task_type": "chat",
  "status": "completed|failed|in_progress",
  "data": { /* task-specific results */ },
  "error": null/string,
  "timestamp": "2025-06-15T10:30:00.000Z"
}
```

**Recommended Node.js Handler:**
```javascript
const sib = getSIBTaskProxy();
try {
  const result = await sib.chat(message, userId, patientId);
  
  if (!result.success) {
    return res.status(400).json({
      error: result.error,
      taskType: result.task_type,
      status: result.status
    });
  }
  
  res.json({
    success: true,
    data: result.data,
    status: result.status
  });
} catch (error) {
  res.status(500).json({
    error: error.message,
    taskType: 'unknown'
  });
}
```

---

## Health Monitoring

### Check SIB Status
```bash
curl http://localhost:8001/health
```

Expected response:
```json
{
  "status": "healthy",
  "uptime": "15 minutes",
  "dependencies": {
    "postgresql": "connected",
    "groq_api": "available",
    "medspacy": "loaded",
    "faiss": "loaded",
    "bayesian_network": "loaded"
  }
}
```

### Monitor Task Latency
Response includes latency breakdown:
```json
{
  "data": {
    "response": "...",
    "latency": {
      "total": 1234,
      "llm": 1200,
      "database": 20,
      "overhead": 14
    }
  }
}
```

---

## Next Steps

1. **Immediate:** Update `chat.route.js` to use SIB
2. **This Sprint:** Update appointment and notification routes
3. **Next Sprint:** Update prescription, EHR, and task routes
4. **Testing:** Integration tests for each route
5. **Monitoring:** Track latency and error rates

---

## Questions?

Refer to:
- SIB Task Router: `/ai-engine/doctor_bot/sib/task_router.py`
- Node.js Proxy: `/server/services/sib-task-proxy.js`
- SIB App: `/ai-engine/doctor_bot/app.py` (POST /task endpoint)
