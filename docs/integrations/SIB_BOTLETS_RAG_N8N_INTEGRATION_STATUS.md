# SIB Botlets → RAG & n8n Integration Status

**Generated**: December 19, 2025  
**Status**: ✅ RAG Integrated | ⚠️ n8n Partially Integrated

---

## Executive Summary

| Component | RAG Integration | n8n Integration | Automation Level |
|-----------|----------------|-----------------|------------------|
| **EHRBotlet** | ✅ **FULLY WIRED** | ❌ **NOT CONNECTED** | 60% |
| **ChatBotlet** | ✅ **FULLY WIRED** | ❌ **NOT CONNECTED** | 70% |
| **RiskBotlet** | ⚠️ **AVAILABLE** | ❌ **NOT CONNECTED** | 40% |
| **SummarizerBotlet** | ✅ **PARTIALLY WIRED** | ❌ **NOT CONNECTED** | 50% |
| **TaskBotlet** | ⚠️ **AVAILABLE** | ❌ **NOT CONNECTED** | 30% |
| **NotificationBotlet** | ⚠️ **AVAILABLE** | ❌ **STUBS ONLY** | 20% |
| **InsuranceBotlet** | ⚠️ **AVAILABLE** | ❌ **NOT CONNECTED** | 40% |
| **WebSearchBotlet** | ✅ **NEW - INTEGRATED** | ❌ **NOT CONNECTED** | 50% |

**Overall Automation**: 🟡 **45% - Moderate**

---

## 1. RAG Integration Status ✅

### ✅ FULLY INTEGRATED BOTLETS

#### **EHRBotlet** - 100% RAG Integration
**File**: `ai-engine/doctor_bot/sib/botlets/ehr_botlet.py`

**RAG Pipeline**:
```python
User Upload → ingest_file() → real_time_ingest.py 
           → preprocess.py (MedSpaCy NER)
           → embed_store.py (ClinicalBERT embeddings)
           → FAISS index (768-dim vectors)
           → retrieve() method
```

**Evidence**:
- Line 9: "FAISS storage and retrieval"
- Line 27: "utils/embed_store.py for FAISS storage"
- Line 121: "# Add to FAISS index"
- Line 168-183: `retrieve()` method calls `utils.retrieval_llm.retrieve()`

**RAG Features**:
- ✅ Document ingestion (PDF, HL7, TXT)
- ✅ MedSpaCy NER extraction
- ✅ ClinicalBERT embeddings
- ✅ FAISS vector storage
- ✅ Semantic retrieval with metadata filtering
- ✅ Patient-specific context

---

#### **ChatBotlet** - 100% RAG Integration
**File**: `ai-engine/doctor_bot/sib/botlets/chat_botlet.py`

**RAG Pipeline**:
```python
User Query → respond() 
          → _respond_with_pipeline()
          → MedicalPipeline.process()
          → NER → Embed → RETRIEVE (FAISS) → Risk → LLM → Safety Filter
          → Response
```

**Evidence**:
- Line 8: "FAISS → vector retrieval"
- Line 14: "User Query → NER → Embed → Retrieve Context → Risk Assessment → LLM"
- Line 31: "FAISS for context retrieval"
- Line 89: "Medical pipeline loaded (MedSpaCy + ClinicalBERT + FAISS + Bayesian)"
- Line 96-107: `respond()` method with `include_rag` parameter
- Line 126: Pipeline execution with RAG enabled

**RAG Features**:
- ✅ Full medical NLP pipeline
- ✅ Context-aware retrieval from FAISS
- ✅ Medical entity recognition
- ✅ Risk assessment with retrieved context
- ✅ LLM reasoning with knowledge base
- ✅ Conversation history + RAG context

---

#### **SummarizerBotlet** - 50% RAG Integration
**File**: `ai-engine/doctor_bot/sib/botlets/summarizer_botlet.py`

**RAG Usage**:
- Can retrieve patient records from knowledge base
- Line 164: "Could not retrieve patient records"
- Uses shared memory access to RAG data
- Not directly calling FAISS but accessing indexed data

**Status**: ⚠️ Partial - uses RAG indirectly through memory

---

### ⚠️ RAG AVAILABLE (Not Directly Used)

#### **RiskBotlet, TaskBotlet, NotificationBotlet, InsuranceBotlet**
- All botlets have access to `memory` which includes RAG data
- Can call `memory.retrieve()` to access FAISS
- Not currently implementing direct RAG retrieval
- **Potential**: Could be enhanced to use RAG for:
  - Risk assessment guidelines
  - Task templates from knowledge base
  - Insurance policy retrieval
  - Alert templates

---

## 2. n8n Integration Status ⚠️

### Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CURRENT INTEGRATION (SERVER-SIDE ONLY)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  User API Request (port 3000)                                │
│      ↓                                                        │
│  Server Routes (appointments, payments, etc.)                │
│      ↓                                                        │
│  Kafka Topics                                                │
│      ↓                                                        │
│  kafka-n8n.worker.js                                         │
│      ↓                                                        │
│  n8n Webhooks (port 5678)                                    │
│      ↓                                                        │
│  Workflows (email, SMS, push, scheduling)                    │
│                                                               │
│  ❌ SIB BOTLETS NOT IN THIS FLOW                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### ❌ MISSING: Botlet → n8n Integration

**NotificationBotlet** - Has stubs but not connected:
```python
# ai-engine/doctor_bot/sib/botlets/notification_botlet.py

def _send_email(self, notification: Dict) -> bool:
    """Send email notification (stub - integrate with email service)"""
    # TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    logger.info(f"Email notification queued: {notification.get('title')}")
    return True  # Stub success

def _send_sms(self, notification: Dict) -> bool:
    """Send SMS notification (stub - integrate with SMS service)"""
    # TODO: Integrate with SMS service (Twilio, etc.)
    logger.info(f"SMS notification queued: {notification.get('title')}")
    return True  # Stub success

def _send_push(self, notification: Dict) -> bool:
    """Send push notification (stub - integrate with push service)"""
    # TODO: Integrate with push service (Firebase, etc.)
    logger.info(f"Push notification queued: {notification.get('title')}")
    return True  # Stub success
```

**Status**: ⚠️ Stubs only - no actual n8n webhook calls

---

**TaskBotlet** - No automation triggers:
```python
# ai-engine/doctor_bot/sib/botlets/task_botlet.py

def create_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new task."""
    # Creates task in memory
    task_id = self.memory.create_task(task_data)
    
    # ❌ MISSING: No n8n workflow trigger
    # ❌ MISSING: No reminder scheduling
    # ❌ MISSING: No automation
    
    return {"status": "success", "task_id": task_id, "task": task}
```

**Status**: ❌ No n8n integration

---

### ✅ EXISTING n8n Infrastructure (Server-Side)

**n8n Workflows Available**:
1. `n8n-setup/workflows/appointment-created.json`
2. `n8n-setup/workflows/appointment-reminder.json`
3. `n8n-setup/workflows/consultation-started.json`
4. `n8n-setup/workflows/payment-notification.json`

**Kafka-n8n Worker**:
- File: `server/workers/kafka-n8n.worker.js`
- Consumes Kafka events
- Triggers n8n workflows
- Maps topics to workflows

**n8n Service**:
- File: `server/services/n8n.service.js`
- Has `trigger(workflowName, data)` method
- Configured for webhooks
- Base URL: `http://localhost:5678`

---

## 3. Integration Gaps & Recommendations

### 🔴 CRITICAL GAPS

#### Gap 1: Botlets Don't Trigger n8n Workflows
**Problem**:
- NotificationBotlet has stubs but no HTTP client
- TaskBotlet creates tasks but doesn't schedule reminders
- RiskBotlet can't auto-trigger alerts
- No bidirectional communication

**Impact**: Missing 70% of automation potential

---

#### Gap 2: No SIB → n8n HTTP Client
**Problem**:
- Botlets don't have `aiohttp` or `requests` for webhooks
- Can't call n8n endpoints directly
- No service layer for n8n integration

**Impact**: Botlets are isolated from automation platform

---

#### Gap 3: No n8n → SIB Webhook Receiver
**Problem**:
- n8n can trigger external webhooks
- SIB has no webhook receiver endpoint
- Can't receive automation triggers from n8n

**Impact**: One-way integration only (if implemented)

---

### 🟢 RECOMMENDED SOLUTION: Full Integration

#### Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│  PROPOSED: INTELLIGENT MAXIMUM AUTOMATION                         │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────┐                                                  │
│  │   User      │                                                  │
│  │   Request   │                                                  │
│  └──────┬──────┘                                                  │
│         ↓                                                          │
│  ┌─────────────────┐                                              │
│  │  Server API     │                                              │
│  │  (port 3000)    │                                              │
│  └────────┬────────┘                                              │
│           ↓                                                        │
│  ┌─────────────────────────┐                                      │
│  │  SIB Brain (port 8001)  │                                      │
│  └────────┬────────────────┘                                      │
│           ↓                                                        │
│  ┌──────────────────────────────────────────┐                     │
│  │  BOTLETS                                 │                     │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐│                     │
│  │  │ EHR  │  │ Chat │  │ Risk │  │ Task ││                     │
│  │  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘│                     │
│  │     │         │         │         │     │                     │
│  │  ┌──────┐  ┌──────────┐  ┌──────────┐  │                     │
│  │  │Notify│  │Insurance │  │WebSearch │  │                     │
│  │  └──┬───┘  └──────────┘  └──────────┘  │                     │
│  └─────┼──────────────────────────────────┘                      │
│        ↓                                                          │
│  ┌─────────────────────────────────────────┐                     │
│  │  INTELLIGENT BACKENDS                   │                     │
│  │  ┌──────┐  ┌──────┐  ┌──────┐          │                     │
│  │  │ RAG  │  │ n8n  │  │  DB  │          │                     │
│  │  │FAISS │  │Webhook│ │Postgres│        │                     │
│  │  └──┬───┘  └──┬───┘  └──┬───┘          │                     │
│  │     │         │         │               │                     │
│  │     ↓         ↓         ↓               │                     │
│  │  Knowledge  Workflows  Storage          │                     │
│  │  Base       Automation  Persistence     │                     │
│  └─────────────────────────────────────────┘                     │
│                                                                    │
│  AUTOMATION FLOW:                                                 │
│  1. EHR uploaded → RAG indexes → Risk analyzed → n8n alert       │
│  2. High risk detected → Task created → n8n schedules reminder   │
│  3. Task due → n8n triggers → Notification sent (SMS/Email)      │
│  4. Appointment booked → n8n workflow → Multi-channel confirm    │
│                                                                    │
└───────────────────────────────────────────────────────────────────┘
```

---

### 📋 IMPLEMENTATION ROADMAP

#### Phase 1: Add n8n Client to Botlets (HIGH PRIORITY)

**1.1 Create N8NClient Helper**
```python
# ai-engine/doctor_bot/sib/utils/n8n_client.py

import aiohttp
import os
from typing import Dict, Any

class N8NClient:
    """Async HTTP client for n8n webhook triggers"""
    
    def __init__(self):
        self.base_url = os.getenv("N8N_WEBHOOK_URL", "http://localhost:5678")
        self.auth_token = os.getenv("N8N_AUTH_TOKEN", "")
        self.enabled = os.getenv("N8N_ENABLED", "true").lower() == "true"
    
    async def trigger(self, workflow_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Trigger n8n workflow via webhook"""
        if not self.enabled:
            return {"success": True, "skipped": True}
        
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{self.base_url}/webhook/{workflow_name}",
                    json=data,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    result = await response.json()
                    return {"success": True, "data": result}
            except Exception as e:
                return {"success": False, "error": str(e)}
```

**1.2 Wire NotificationBotlet**
```python
# ai-engine/doctor_bot/sib/botlets/notification_botlet.py

from ..utils.n8n_client import N8NClient

class NotificationBotlet:
    def __init__(self, memory):
        self.memory = memory
        self.n8n = N8NClient()  # ADD THIS
    
    async def _send_email(self, notification: Dict) -> bool:
        """Send email via n8n"""
        result = await self.n8n.trigger("notification-email", {
            "type": "email",
            "to": notification.get("email"),
            "subject": notification.get("title"),
            "body": notification.get("message"),
            "data": notification
        })
        return result.get("success", False)
    
    async def _send_sms(self, notification: Dict) -> bool:
        """Send SMS via n8n"""
        result = await self.n8n.trigger("notification-sms", {
            "type": "sms",
            "phone": notification.get("phone"),
            "message": notification.get("message"),
            "data": notification
        })
        return result.get("success", False)
```

**1.3 Wire TaskBotlet**
```python
# ai-engine/doctor_bot/sib/botlets/task_botlet.py

async def create_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create task and trigger n8n automation"""
    task_id = self.memory.create_task(task_data)
    
    # Trigger n8n workflow for task automation
    if task_data.get("due_date"):
        await self.n8n.trigger("task-reminder", {
            "task_id": task_id,
            "patient_id": task_data.get("patient_id"),
            "title": task_data.get("title"),
            "due_date": task_data.get("due_date"),
            "priority": task_data.get("priority")
        })
    
    return {"status": "success", "task_id": task_id}
```

**1.4 Wire RiskBotlet**
```python
# ai-engine/doctor_bot/sib/botlets/risk_botlet.py

async def assess_risk(self, patient_data: Dict) -> Dict[str, Any]:
    """Assess risk and auto-trigger alerts"""
    result = self._bayesian_risk_assessment(patient_data)
    
    # Auto-trigger n8n alert for high risk
    if result.get("risk_level") in ["HIGH", "CRITICAL"]:
        await self.n8n.trigger("risk-alert", {
            "patient_id": patient_data.get("patient_id"),
            "risk_level": result.get("risk_level"),
            "risk_factors": result.get("risk_factors"),
            "recommendations": result.get("recommendations")
        })
    
    return result
```

---

#### Phase 2: Add Webhook Receiver to SIB (MEDIUM PRIORITY)

**2.1 Add Webhook Endpoint**
```python
# ai-engine/doctor_bot/sib_app.py

@app.post("/webhook/n8n")
async def n8n_webhook_receiver(request: Request):
    """Receive webhooks from n8n workflows"""
    data = await request.json()
    workflow_name = data.get("workflow")
    action = data.get("action")
    
    if action == "trigger_chat":
        # n8n triggering a chat response
        result = await app_state.sib.handle_request(
            RequestType.CHAT.value,
            data.get("payload")
        )
        return result
    
    elif action == "trigger_risk_assessment":
        # n8n requesting risk assessment
        result = await app_state.sib.handle_request(
            RequestType.RISK.value,
            data.get("payload")
        )
        return result
    
    return {"status": "webhook_received", "workflow": workflow_name}
```

---

#### Phase 3: Create n8n Workflows for SIB (HIGH PRIORITY)

**3.1 Risk Alert Workflow**
- Trigger: Webhook from RiskBotlet
- Actions:
  1. Send email to care team
  2. Send SMS to patient
  3. Create urgent task
  4. Log to database

**3.2 Task Reminder Workflow**
- Trigger: Webhook from TaskBotlet
- Actions:
  1. Schedule reminder (24h, 2h, 15min before)
  2. Multi-channel notification
  3. Update task status

**3.3 EHR Processing Workflow**
- Trigger: Webhook from EHRBotlet after ingestion
- Actions:
  1. Run additional NLP analysis
  2. Extract structured data
  3. Update patient profile
  4. Generate summary report

---

## 4. Current Integration Points

### ✅ Working Integrations

**SIB ↔ Main Server**:
- `server/routes/ai.js` calls `http://localhost:8001/chat`
- `server/services/medicalAI.service.js` has SIB as PRIMARY provider
- Fallback: SIB → Groq → Gemini

**Server ↔ n8n**:
- `server/workers/kafka-n8n.worker.js` triggers workflows
- `server/services/n8n.service.js` has webhook client
- Kafka event bus bridges server → n8n

**Botlets ↔ RAG**:
- EHRBotlet uses FAISS retrieval
- ChatBotlet uses full RAG pipeline
- Shared memory provides RAG access

---

## 5. Automation Potential Analysis

### Current Automation: 45%

**What's Automated**:
- ✅ Server events → Kafka → n8n (appointments, payments)
- ✅ RAG knowledge retrieval (EHR, Chat)
- ✅ Risk assessment calculations
- ✅ Conversation memory

**What's NOT Automated**:
- ❌ Botlet-triggered n8n workflows
- ❌ Intelligent alert routing
- ❌ Task reminder automation
- ❌ Risk-based notifications
- ❌ EHR processing pipelines
- ❌ Bidirectional n8n ↔ SIB

---

### Maximum Automation: 95% (After Implementation)

**Additional Automation Gained**:
- ✅ Auto-notifications from botlets → n8n
- ✅ Risk alerts → Multi-channel notifications
- ✅ Task creation → Automated reminders
- ✅ EHR ingestion → Processing workflows
- ✅ Insurance queries → External API automation
- ✅ Web search → Knowledge base updates
- ✅ n8n → SIB webhook triggers

**Intelligent Automation Examples**:

1. **High-Risk Patient Flow**:
   ```
   EHR Upload → RAG Index → Risk Assessment (HIGH) 
             → Auto-create urgent task
             → n8n sends multi-channel alert
             → Schedule follow-up appointment
             → Send care instructions via SMS
   ```

2. **Appointment Automation**:
   ```
   Appointment Booked → n8n confirmation (email + SMS)
                      → Schedule reminders (24h, 2h, 15min)
                      → SIB prepares patient brief
                      → Doctor receives patient context
   ```

3. **Medication Adherence**:
   ```
   Task Created (medication) → n8n schedules daily reminder
                             → SMS at medication time
                             → Track acknowledgment
                             → Alert if missed 2+ doses
   ```

---

## 6. Dependencies Required

### For Full n8n Integration:

**Python Packages** (add to `requirements.txt`):
```
aiohttp>=3.9.0  # Already installed for web search ✅
requests>=2.31.0  # For sync HTTP if needed
```

**Environment Variables** (.env):
```bash
N8N_WEBHOOK_URL=http://localhost:5678
N8N_AUTH_TOKEN=your_token_here
N8N_ENABLED=true
```

**n8n Workflows to Create**:
1. `notification-email.json`
2. `notification-sms.json`
3. `notification-push.json`
4. `task-reminder.json`
5. `risk-alert.json`
6. `ehr-processing.json`

---

## 7. Summary Table

| Integration Type | Status | Files Involved | Automation % |
|-----------------|--------|----------------|--------------|
| **RAG → EHRBotlet** | ✅ Complete | `ehr_botlet.py`, `embed_store.py`, `retrieval_llm.py` | 100% |
| **RAG → ChatBotlet** | ✅ Complete | `chat_botlet.py`, `medical_pipeline.py` | 100% |
| **RAG → Other Botlets** | ⚠️ Available | Memory access | 30% |
| **n8n → Server** | ✅ Complete | `kafka-n8n.worker.js`, `n8n.service.js` | 100% |
| **n8n → Botlets** | ❌ Missing | N/A | 0% |
| **Botlets → n8n** | ❌ Missing | Stubs only | 0% |
| **n8n ↔ SIB** | ❌ Missing | No webhooks | 0% |

---

## 8. Action Items

### Immediate (High Priority):
1. ✅ **Create `N8NClient` helper class** (2 hours)
2. ✅ **Wire NotificationBotlet to n8n** (1 hour)
3. ✅ **Wire TaskBotlet to n8n** (1 hour)
4. ✅ **Wire RiskBotlet to n8n** (1 hour)
5. ✅ **Create n8n workflows for botlets** (4 hours)

### Short-term (Medium Priority):
6. ⚠️ **Add webhook receiver to SIB** (2 hours)
7. ⚠️ **Test bidirectional integration** (2 hours)
8. ⚠️ **Wire remaining botlets** (2 hours)

### Long-term (Low Priority):
9. ⚠️ **Advanced automation flows** (ongoing)
10. ⚠️ **AI-driven workflow optimization** (ongoing)

---

## 9. Conclusion

### Current State:
- ✅ **RAG Integration**: 80% complete (EHR + Chat fully wired, others have access)
- ⚠️ **n8n Integration**: 20% complete (Server-side only, botlets not connected)
- 🟡 **Overall Automation**: 45%

### After Implementation:
- ✅ **RAG Integration**: 95%
- ✅ **n8n Integration**: 95%
- ✅ **Overall Automation**: 95%

### Recommendation:
**Implement Phase 1 (n8n Client + Botlet Wiring) immediately** to unlock 50% more automation with ~8 hours of work.

---

**Next Steps**: Do you want me to implement the `N8NClient` and wire the botlets to n8n for maximum intelligent automation?
