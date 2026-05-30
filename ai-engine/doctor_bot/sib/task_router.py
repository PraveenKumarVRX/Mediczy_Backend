"""
SIB Task Router & Orchestrator
===============================

Central orchestration hub for all medical and administrative tasks:
- Chat and consultations
- Medical record processing
- Appointment scheduling
- Notification management
- Prescription generation
- Task automation
- Health diary updates

All operations go through SIB for unified logging, context management, and audit trails.
"""

import logging
import os
import time
import uuid
from typing import Dict, Any, Optional, List
from enum import Enum
from datetime import datetime
import json
import re

logger = logging.getLogger("sib.task_router")


# ─── Qwen Task Synthesizer ────────────────────────────────────────────────────

class QwenTaskSynthesizer:
    """
    Uses the shared Qwen 2.5-3B GGUF model (loaded once by TinyLlamaRouter)
    to power stub task handlers with real intelligence:

      • Appointment rescheduling — suggest 3 alternative slots with reasoning
      • Appointment cancellation — compose patient-facing cancellation message
      • Reminders — generate personalised, context-aware reminder text
      • Health diary updates — extract structured changes from free-text
      • Medical record review — summarise a record without the full pipeline
      • Task prioritisation — rank a queue of pending tasks by clinical urgency
      • Duplicate detection — flag semantically identical recent tasks

    All outputs are JSON-formatted; temperature=0.15 keeps them deterministic.
    Falls back to rule-based defaults if the model is unavailable.
    """

    _SYSTEM = (
        "You are a medical AI task assistant. "
        "Always respond with valid JSON only — no prose, no markdown fences. "
        "Be concise and clinically accurate."
    )

    def __init__(self):
        self._llm = None  # fetched lazily from shared singleton

    def _get_llm(self):
        if self._llm is None:
            try:
                from sib.tinyllama_router import get_shared_llm
                self._llm = get_shared_llm()
            except Exception as e:
                logger.warning(f"QwenTaskSynthesizer: could not get shared LLM — {e}")
        return self._llm

    def _call(self, user_prompt: str, max_tokens: int = 300) -> Optional[Dict]:
        """Run a single inference call; parse and return the JSON dict."""
        llm = self._get_llm()
        if llm is None:
            return None
        try:
            t0 = time.time()
            resp = llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": self._SYSTEM},
                    {"role": "user",   "content": user_prompt},
                ],
                max_tokens=max_tokens,
                temperature=0.15,
                stop=["```", "\n\n\n"],
            )
            raw = resp["choices"][0]["message"]["content"].strip()
            # Strip accidental code-fence wrappers
            raw = re.sub(r"^```json\s*|^```\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
            result = json.loads(raw)
            logger.info(f"QwenTaskSynthesizer: inference {(time.time()-t0)*1000:.0f}ms")
            return result
        except Exception as e:
            logger.warning(f"QwenTaskSynthesizer._call failed: {e}")
            return None

    # ── Public synthesis methods ──────────────────────────────────────────────

    def suggest_reschedule(self, doctor_id: str, original_time: str, reason: str) -> Dict:
        prompt = (
            f"A patient needs to reschedule their appointment with doctor {doctor_id}. "
            f"Original time: {original_time}. Reason for cancellation: {reason}. "
            "Suggest 3 alternative appointment slots (within the next 7 days) and a "
            "short patient-facing message. "
            'Return JSON: {"slots":["ISO datetime","..."],"message":"string","urgency":"low|medium|high"}'
        )
        result = self._call(prompt, max_tokens=256)
        return result or {
            "slots": [], "message": "Please contact the clinic to reschedule.", "urgency": "low"
        }

    def compose_cancellation(self, appointment: Dict) -> Dict:
        doctor = appointment.get("doctor_name", "your doctor")
        time_  = appointment.get("scheduled_time", "the scheduled time")
        reason = appointment.get("cancellation_reason", "unforeseen circumstances")
        prompt = (
            f"Compose a professional cancellation message for a patient. "
            f"Doctor: {doctor}. Scheduled time: {time_}. Reason: {reason}. "
            "Include a follow-up suggestion. "
            'Return JSON: {"message":"string","follow_up":"string","channels":["sms","email"]}'
        )
        result = self._call(prompt, max_tokens=200)
        return result or {
            "message": f"Your appointment with {doctor} at {time_} has been cancelled.",
            "follow_up": "Please book a new appointment at your convenience.",
            "channels": ["in-app"],
        }

    def generate_reminder(self, reminder_type: str, patient_context: Dict) -> Dict:
        name     = patient_context.get("name", "the patient")
        cond     = patient_context.get("conditions", [])
        meds     = patient_context.get("medications", [])
        cond_str = ", ".join(cond) if cond else "general"
        meds_str = ", ".join(meds) if meds else "none"
        prompt = (
            f"Generate a personalised health reminder of type '{reminder_type}' for {name}. "
            f"Conditions: {cond_str}. Current medications: {meds_str}. "
            "Keep it warm, brief (≤ 40 words), and actionable. "
            'Return JSON: {"title":"string","body":"string","urgency":"low|medium|high","action_label":"string"}'
        )
        result = self._call(prompt, max_tokens=180)
        return result or {
            "title": "Health Reminder",
            "body": f"Hi {name}, this is a reminder to stay on track with your health goals.",
            "urgency": "low",
            "action_label": "View Details",
        }

    def summarise_diary(self, entries: List[Dict]) -> Dict:
        sample = entries[-10:] if len(entries) > 10 else entries
        prompt = (
            f"Summarise these {len(sample)} health diary entries and identify key patterns. "
            f"Entries: {json.dumps(sample, default=str)}. "
            'Return JSON: {"summary":"string","patterns":["string"],"flags":["string"],"trend":"improving|stable|worsening"}'
        )
        result = self._call(prompt, max_tokens=300)
        return result or {"summary": "Diary updated.", "patterns": [], "flags": [], "trend": "stable"}

    def review_record(self, record_text: str) -> Dict:
        truncated = record_text[:1200]
        prompt = (
            f"Review this medical record excerpt and produce a structured summary:\n{truncated}\n"
            'Return JSON: {"summary":"string","diagnoses":["string"],"medications":["string"],"follow_up":"string","risk_flags":["string"]}'
        )
        result = self._call(prompt, max_tokens=400)
        return result or {
            "summary": "Record reviewed.", "diagnoses": [], "medications": [], "follow_up": "", "risk_flags": []
        }

    def prioritise_queue(self, tasks: List[Dict]) -> List[Dict]:
        """Rank pending tasks by clinical urgency. Returns tasks with added priority field."""
        if not tasks:
            return tasks
        descriptions = [
            {"id": t.get("task_id", i), "type": t.get("task_type"), "payload_summary": str(t.get("payload", ""))[:120]}
            for i, t in enumerate(tasks)
        ]
        prompt = (
            "Rank these hospital tasks by clinical urgency (1=most urgent). "
            f"Tasks: {json.dumps(descriptions)}. "
            'Return JSON: {"ranked":[{"id":"string","priority":1,"reason":"string"}]}'
        )
        result = self._call(prompt, max_tokens=350)
        if result and "ranked" in result:
            rank_map = {r["id"]: r for r in result["ranked"]}
            for task in tasks:
                tid = task.get("task_id", "")
                task["qwen_priority"]  = rank_map.get(tid, {}).get("priority", 99)
                task["qwen_reason"]    = rank_map.get(tid, {}).get("reason", "")
            tasks.sort(key=lambda t: t.get("qwen_priority", 99))
        return tasks

    def detect_duplicate(self, task: Dict, recent_tasks: List[Dict]) -> Dict:
        """Return {is_duplicate, original_task_id, confidence} for a candidate task."""
        if not recent_tasks:
            return {"is_duplicate": False, "original_task_id": None, "confidence": 0.0}
        candidate = {"type": task.get("task_type"), "payload": str(task.get("payload", ""))[:200]}
        recents   = [
            {"id": t.get("task_id"), "type": t.get("task_type"), "payload": str(t.get("payload", ""))[:120]}
            for t in recent_tasks[-20:]
        ]
        prompt = (
            f"Is this task a duplicate of any recent task? "
            f"Candidate: {json.dumps(candidate)}. "
            f"Recent tasks: {json.dumps(recents)}. "
            'Return JSON: {"is_duplicate":bool,"original_task_id":"string or null","confidence":0.0}'
        )
        result = self._call(prompt, max_tokens=120)
        return result or {"is_duplicate": False, "original_task_id": None, "confidence": 0.0}


# Module-level singleton — shared across all SIBTaskRouter instances
_synthesizer: Optional[QwenTaskSynthesizer] = None

def get_synthesizer() -> QwenTaskSynthesizer:
    global _synthesizer
    if _synthesizer is None:
        _synthesizer = QwenTaskSynthesizer()
    return _synthesizer


class TaskType(str, Enum):
    """Supported task types in SIB"""
    # Chat & Consultation
    CHAT = "chat"
    MEDICAL_CONSULT = "medical_consult"
    
    # Medical Records
    PROCESS_EHR = "process_ehr"
    MEDICAL_RECORD_REVIEW = "medical_record_review"
    
    # Appointments
    SCHEDULE_APPOINTMENT = "schedule_appointment"
    RESCHEDULE_APPOINTMENT = "reschedule_appointment"
    CANCEL_APPOINTMENT = "cancel_appointment"
    
    # Prescriptions
    GENERATE_PRESCRIPTION = "generate_prescription"
    REVIEW_PRESCRIPTION = "review_prescription"
    
    # Notifications
    SEND_NOTIFICATION = "send_notification"
    SEND_REMINDER = "send_reminder"
    
    # Health Diary
    ADD_HEALTH_DIARY_ENTRY = "add_health_diary_entry"
    UPDATE_HEALTH_DIARY = "update_health_diary"
    
    # Administrative
    CREATE_TASK = "create_task"
    UPDATE_TASK = "update_task"
    COMPLETE_TASK = "complete_task"
    
    # Risk Assessment
    ASSESS_RISK = "assess_risk"
    DETECT_EMERGENCY = "detect_emergency"


class TaskStatus(str, Enum):
    """Task execution status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class TaskResult:
    """Result from task execution"""
    def __init__(self, task_type: TaskType, status: TaskStatus, data: Any = None, error: str = None):
        self.task_type = task_type
        self.status = status
        self.data = data
        self.error = error
        self.timestamp = datetime.now().isoformat()
    
    def to_dict(self) -> Dict:
        return {
            "task_type": self.task_type.value,
            "status": self.status.value,
            "data": self.data,
            "error": self.error,
            "timestamp": self.timestamp
        }


class SIBTaskRouter:
    """
    Central task routing and orchestration for SIB
    
    All medical operations must go through this router to ensure:
    - Unified logging and audit trails
    - Consistent error handling
    - Context preservation across operations
    - User identification and authorization
    - PostgreSQL persistence
    - Emergency detection
    - Safety filtering
    """
    
    def __init__(self, db_manager=None):
        """Initialize task router with database connection"""
        self.db = db_manager
        self.task_queue: List[Dict] = []
        self.completed_tasks: List[Dict] = []
        self.qwen = get_synthesizer()
        logger.info("✅ SIB Task Router initialized (Qwen 2.5-3B synthesizer ready)")
    
    async def route_task(
        self, 
        task_type: TaskType,
        payload: Dict[str, Any],
        user_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        context: Optional[Dict] = None
    ) -> TaskResult:
        """
        Route a task through SIB orchestration
        
        Args:
            task_type: Type of task to execute
            payload: Task-specific data
            user_id: Mediczy user ID (for auth & context)
            patient_id: Patient ID (for medical records)
            context: Additional context (medical history, preferences)
        
        Returns:
            TaskResult with execution status and data
        """
        try:
            logger.info(f"🔄 Routing task: {task_type.value} for user {user_id}")

            task_id = f"task_{uuid.uuid4().hex}"
            task_metadata = {
                "task_id": task_id,
                "task_type": task_type.value,
                "user_id": user_id,
                "patient_id": patient_id,
                "payload": payload,
                "context": context or {},
                "created_at": datetime.now().isoformat(),
            }

            # ── Duplicate detection via Qwen ──────────────────────────────
            dup = self.qwen.detect_duplicate(task_metadata, self.completed_tasks)
            if dup.get("is_duplicate") and dup.get("confidence", 0) >= 0.8:
                logger.info(
                    f"⚡ Duplicate task detected (confidence {dup['confidence']:.2f}), "
                    f"skipping — original: {dup.get('original_task_id')}"
                )
                return TaskResult(
                    task_type, TaskStatus.SKIPPED,
                    {"duplicate_of": dup.get("original_task_id"), "confidence": dup["confidence"]}
                )

            # ── Enqueue and prioritise ────────────────────────────────────
            self.task_queue.append(task_metadata)
            if len(self.task_queue) > 1:
                self.task_queue = self.qwen.prioritise_queue(self.task_queue)

            # ── Persist to DB ─────────────────────────────────────────────
            if self.db:
                try:
                    await self.db.create_task({
                        "patient_id": patient_id,
                        "title": f"{task_type.value}: {payload.get('title', 'Task')}",
                        "description": json.dumps(payload),
                        "task_type": task_type.value,
                        "status": "in_progress",
                        "metadata": task_metadata,
                    })
                except Exception as e:
                    logger.warning(f"⚠️ Failed to log task to DB: {e}")

            result = await self._execute_task(task_type, payload, context or {})

            if self.db and result.status == TaskStatus.COMPLETED:
                try:
                    await self.db.update_task(task_id, {"status": "completed"})
                except Exception as e:
                    logger.warning(f"⚠️ Failed to update task status: {e}")

            # Move from queue → completed history (keep last 100)
            self.task_queue = [t for t in self.task_queue if t.get("task_id") != task_id]
            self.completed_tasks.append({**task_metadata, "status": result.status.value})
            self.completed_tasks = self.completed_tasks[-100:]

            logger.info(f"✅ Task {task_type.value} completed: {result.status.value}")
            return result
            
        except Exception as e:
            logger.error(f"❌ Task routing error: {e}")
            return TaskResult(
                task_type=task_type,
                status=TaskStatus.FAILED,
                error=str(e)
            )
    
    async def _execute_task(self, task_type: TaskType, payload: Dict, context: Dict) -> TaskResult:
        """Execute task based on type"""
        
        # Chat & Consultation Tasks
        if task_type == TaskType.CHAT:
            return await self._handle_chat(payload, context)
        
        elif task_type == TaskType.MEDICAL_CONSULT:
            return await self._handle_medical_consult(payload, context)
        
        # Medical Record Tasks
        elif task_type == TaskType.PROCESS_EHR:
            return await self._handle_ehr_processing(payload, context)
        
        elif task_type == TaskType.MEDICAL_RECORD_REVIEW:
            return await self._handle_medical_record_review(payload, context)
        
        # Appointment Tasks
        elif task_type == TaskType.SCHEDULE_APPOINTMENT:
            return await self._handle_appointment_scheduling(payload, context)
        
        elif task_type == TaskType.RESCHEDULE_APPOINTMENT:
            return await self._handle_appointment_rescheduling(payload, context)
        
        elif task_type == TaskType.CANCEL_APPOINTMENT:
            return await self._handle_appointment_cancellation(payload, context)
        
        # Prescription Tasks
        elif task_type == TaskType.GENERATE_PRESCRIPTION:
            return await self._handle_prescription_generation(payload, context)
        
        elif task_type == TaskType.REVIEW_PRESCRIPTION:
            return await self._handle_prescription_review(payload, context)
        
        # Notification Tasks
        elif task_type == TaskType.SEND_NOTIFICATION:
            return await self._handle_notification(payload, context)
        
        elif task_type == TaskType.SEND_REMINDER:
            return await self._handle_reminder(payload, context)
        
        # Health Diary Tasks
        elif task_type == TaskType.ADD_HEALTH_DIARY_ENTRY:
            return await self._handle_health_diary_add(payload, context)
        
        elif task_type == TaskType.UPDATE_HEALTH_DIARY:
            return await self._handle_health_diary_update(payload, context)
        
        # Risk Assessment
        elif task_type == TaskType.ASSESS_RISK:
            return await self._handle_risk_assessment(payload, context)
        
        elif task_type == TaskType.DETECT_EMERGENCY:
            return await self._handle_emergency_detection(payload, context)
        
        else:
            logger.warning(f"⚠️ Unknown task type: {task_type}")
            return TaskResult(task_type, TaskStatus.SKIPPED, error="Unknown task type")
    
    # ==================== Chat & Consultation ====================
    
    async def _handle_chat(self, payload: Dict, context: Dict) -> TaskResult:
        """Handle chat via ChatBotlet"""
        logger.info("💬 ChatBotlet handling chat request")
        try:
            # Delegate to ChatBotlet in medical_pipeline
            from sib.medical_pipeline import get_pipeline
            pipeline = get_pipeline()
            
            result = pipeline.process(
                payload.get("message", ""),
                include_risk=payload.get("include_risk", False),
                include_retrieval=payload.get("include_retrieval", True)
            )
            
            return TaskResult(
                TaskType.CHAT,
                TaskStatus.COMPLETED,
                {
                    "response": result.response,
                    "entities": result.entities,
                    "provider": result.provider
                }
            )
        except Exception as e:
            logger.error(f"Chat handling error: {e}")
            return TaskResult(TaskType.CHAT, TaskStatus.FAILED, error=str(e))
    
    async def _handle_medical_consult(self, payload: Dict, context: Dict) -> TaskResult:
        """Handle medical consultation via medical pipeline"""
        logger.info("🏥 Medical consultation request")
        # Similar to chat but with explicit medical focus
        return await self._handle_chat(payload, context)
    
    # ==================== Medical Records ====================
    
    async def _handle_ehr_processing(self, payload: Dict, context: Dict) -> TaskResult:
        """Handle EHR processing via EHRBotlet"""
        logger.info("📄 EHRBotlet processing EHR file")
        try:
            if not self.db:
                return TaskResult(TaskType.PROCESS_EHR, TaskStatus.FAILED, error="Database not available")
            
            # Process EHR file using EHRBotlet
            from sib.botlets.ehr_botlet import EHRBotlet
            
            ehr_botlet = EHRBotlet(None)  # Memory would come from context
            file_path = payload.get("file_path")
            patient_id = payload.get("patient_id")
            
            result = ehr_botlet.ingest_file(file_path, patient_id)
            
            # Save processed data to health diary
            if self.db:
                await self.db.save_chat_message(
                    conversation_id=f"ehr_{patient_id}",
                    patient_id=patient_id,
                    role="system",
                    content=f"EHR processed: {file_path}",
                    metadata=result
                )
            
            return TaskResult(
                TaskType.PROCESS_EHR,
                TaskStatus.COMPLETED,
                {"processed": result, "patient_id": patient_id}
            )
        except Exception as e:
            logger.error(f"EHR processing error: {e}")
            return TaskResult(TaskType.PROCESS_EHR, TaskStatus.FAILED, error=str(e))
    
    async def _handle_medical_record_review(self, payload: Dict, context: Dict) -> TaskResult:
        """Review medical records — Qwen produces structured summary directly."""
        logger.info("📋 Medical record review (Qwen synthesizer)")
        try:
            record_text = payload.get("record_data", payload.get("content", ""))
            if not record_text:
                return TaskResult(TaskType.MEDICAL_RECORD_REVIEW, TaskStatus.FAILED, error="No record data provided")
            review = self.qwen.review_record(record_text)
            return TaskResult(TaskType.MEDICAL_RECORD_REVIEW, TaskStatus.COMPLETED, review)
        except Exception as e:
            logger.error(f"Medical record review error: {e}")
            return TaskResult(TaskType.MEDICAL_RECORD_REVIEW, TaskStatus.FAILED, error=str(e))
    
    # ==================== Appointments ====================
    
    async def _handle_appointment_scheduling(self, payload: Dict, context: Dict) -> TaskResult:
        """Schedule appointment via the Mediczy appointments API."""
        logger.info("📅 Scheduling appointment via internal API")
        try:
            import httpx
            api_url   = os.environ.get("MEDICZY_API_URL", "http://localhost:8000")
            api_token = os.environ.get("MEDICZY_INTERNAL_TOKEN", "")

            doctor_id        = payload.get("doctor_id", "")
            patient_id       = payload.get("patient_id")
            preferred_time   = payload.get("preferred_time", "")
            appointment_date = payload.get("appointment_date", preferred_time[:10] if preferred_time else "")
            appointment_time = payload.get("appointment_time", preferred_time[11:16] if len(preferred_time or "") >= 16 else "09:00")
            reason           = payload.get("reason", "")
            consult_type     = payload.get("consultation_type", payload.get("type", "in-person"))

            body = {
                "doctorId":        doctor_id,
                "appointmentDate": appointment_date,
                "appointmentTime": appointment_time,
                "consultationType": consult_type,
                "symptoms":        payload.get("symptoms", ""),
                "reason":          reason,
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{api_url}/api/appointments",
                    json=body,
                    headers={
                        "Content-Type": "application/json",
                        "X-Internal-Token": api_token,
                    },
                )

            if response.status_code in (200, 201):
                data = response.json()
                appointment_id = data.get("appointment", {}).get("id") or data.get("id", "")
                logger.info(f"✅ Appointment created: {appointment_id}")
                return TaskResult(
                    TaskType.SCHEDULE_APPOINTMENT,
                    TaskStatus.COMPLETED,
                    {"appointment_id": appointment_id, "doctor_id": doctor_id, "patient_id": patient_id,
                     "scheduled_time": preferred_time, "api_response": data},
                )
            else:
                error_body = response.text[:300]
                logger.error(f"Appointment API returned {response.status_code}: {error_body}")
                return TaskResult(TaskType.SCHEDULE_APPOINTMENT, TaskStatus.FAILED,
                                  error=f"API {response.status_code}: {error_body}")

        except Exception as e:
            logger.error(f"Appointment scheduling error: {e}")
            return TaskResult(TaskType.SCHEDULE_APPOINTMENT, TaskStatus.FAILED, error=str(e))
    
    async def _handle_appointment_rescheduling(self, payload: Dict, context: Dict) -> TaskResult:
        """Reschedule appointment — Qwen suggests 3 alternative slots."""
        logger.info("📅 Rescheduling appointment (Qwen synthesizer)")
        try:
            suggestions = self.qwen.suggest_reschedule(
                doctor_id=payload.get("doctor_id", ""),
                original_time=payload.get("original_time", payload.get("preferred_time", "")),
                reason=payload.get("reason", "patient request"),
            )
            if self.db:
                try:
                    await self.db.save_chat_message(
                        conversation_id=f"reschedule_{payload.get('patient_id')}",
                        patient_id=payload.get("patient_id"),
                        role="system",
                        content=suggestions.get("message", ""),
                        metadata=suggestions,
                    )
                except Exception:
                    pass
            return TaskResult(TaskType.RESCHEDULE_APPOINTMENT, TaskStatus.COMPLETED, suggestions)
        except Exception as e:
            logger.error(f"Rescheduling error: {e}")
            return TaskResult(TaskType.RESCHEDULE_APPOINTMENT, TaskStatus.FAILED, error=str(e))

    async def _handle_appointment_cancellation(self, payload: Dict, context: Dict) -> TaskResult:
        """Cancel appointment — Qwen composes patient-facing message."""
        logger.info("❌ Cancelling appointment (Qwen synthesizer)")
        try:
            cancellation = self.qwen.compose_cancellation(payload)
            if self.db:
                try:
                    await self.db.save_chat_message(
                        conversation_id=f"cancellation_{payload.get('patient_id')}",
                        patient_id=payload.get("patient_id"),
                        role="system",
                        content=cancellation.get("message", ""),
                        metadata=cancellation,
                    )
                except Exception:
                    pass
            return TaskResult(TaskType.CANCEL_APPOINTMENT, TaskStatus.COMPLETED, cancellation)
        except Exception as e:
            logger.error(f"Cancellation error: {e}")
            return TaskResult(TaskType.CANCEL_APPOINTMENT, TaskStatus.FAILED, error=str(e))
    
    # ==================== Prescriptions ====================
    
    async def _handle_prescription_generation(self, payload: Dict, context: Dict) -> TaskResult:
        """Generate prescription with medical pipeline"""
        logger.info("💊 Generating prescription")
        try:
            # Use medical pipeline to validate and generate prescription
            from sib.medical_pipeline import get_pipeline
            pipeline = get_pipeline()
            
            consultation_notes = payload.get("consultation_notes", "")
            
            # Get medical AI recommendation
            result = pipeline.process(
                f"Based on consultation notes, generate appropriate medications and prescription: {consultation_notes}",
                include_risk=True,
                include_retrieval=True
            )
            
            return TaskResult(
                TaskType.GENERATE_PRESCRIPTION,
                TaskStatus.COMPLETED,
                {
                    "prescription": result.response,
                    "medications": result.entities,
                    "medical_review": result.provider
                }
            )
        except Exception as e:
            logger.error(f"Prescription generation error: {e}")
            return TaskResult(TaskType.GENERATE_PRESCRIPTION, TaskStatus.FAILED, error=str(e))
    
    async def _handle_prescription_review(self, payload: Dict, context: Dict) -> TaskResult:
        """Review prescription for safety and interactions"""
        logger.info("🔍 Reviewing prescription")
        try:
            from sib.medical_pipeline import get_pipeline
            pipeline = get_pipeline()
            
            prescription = payload.get("prescription", {})
            medications = prescription.get("medications", [])
            
            # Safety check using medical pipeline
            result = pipeline.process(
                f"Check for drug interactions and contraindications in: {medications}",
                include_risk=True,
                include_retrieval=True
            )
            
            return TaskResult(
                TaskType.REVIEW_PRESCRIPTION,
                TaskStatus.COMPLETED,
                {"safety_assessment": result.response}
            )
        except Exception as e:
            logger.error(f"Prescription review error: {e}")
            return TaskResult(TaskType.REVIEW_PRESCRIPTION, TaskStatus.FAILED, error=str(e))
    
    # ==================== Notifications ====================
    
    async def _handle_notification(self, payload: Dict, context: Dict) -> TaskResult:
        """Send notification via the Mediczy FCM/notification API."""
        logger.info("🔔 Sending notification via internal API")
        try:
            import httpx
            api_url   = os.environ.get("MEDICZY_API_URL", "http://localhost:8000")
            api_token = os.environ.get("MEDICZY_INTERNAL_TOKEN", "")

            patient_id        = payload.get("patient_id")
            message           = payload.get("message", "")
            notification_type = payload.get("type", "info")
            title             = payload.get("title", "Mediczy Notification")

            body = {
                "patientId": patient_id,
                "title":     title,
                "message":   message,
                "type":      notification_type,
                "channels":  payload.get("channels", ["in-app"]),
            }

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{api_url}/api/fcm/send-system",
                    json=body,
                    headers={
                        "Content-Type": "application/json",
                        "X-Internal-Token": api_token,
                    },
                )

            if response.status_code in (200, 201):
                data = response.json()
                notification_id = data.get("notificationId") or data.get("id", f"notif_{int(datetime.now().timestamp())}")
                logger.info(f"✅ Notification sent: {notification_id}")
                return TaskResult(
                    TaskType.SEND_NOTIFICATION,
                    TaskStatus.COMPLETED,
                    {"notification_id": notification_id, "channels": payload.get("channels", ["in-app"])},
                )
            else:
                error_body = response.text[:300]
                logger.error(f"Notification API returned {response.status_code}: {error_body}")
                return TaskResult(TaskType.SEND_NOTIFICATION, TaskStatus.FAILED,
                                  error=f"API {response.status_code}: {error_body}")

        except Exception as e:
            logger.error(f"Notification sending error: {e}")
            return TaskResult(TaskType.SEND_NOTIFICATION, TaskStatus.FAILED, error=str(e))
    
    async def _handle_reminder(self, payload: Dict, context: Dict) -> TaskResult:
        """Generate personalised reminder via Qwen then persist/send."""
        logger.info("⏰ Sending reminder (Qwen synthesizer)")
        try:
            reminder_type = payload.get("type", "general")
            patient_context = {
                "name":        payload.get("patient_name", context.get("patient_name", "Patient")),
                "conditions":  context.get("conditions", []),
                "medications": context.get("medications", []),
            }
            reminder = self.qwen.generate_reminder(reminder_type, patient_context)
            patient_id = payload.get("patient_id")
            if self.db and patient_id:
                try:
                    await self.db.save_chat_message(
                        conversation_id=f"reminder_{patient_id}",
                        patient_id=patient_id,
                        role="system",
                        content=reminder.get("body", ""),
                        metadata=reminder,
                    )
                except Exception:
                    pass
            return TaskResult(
                TaskType.SEND_REMINDER, TaskStatus.COMPLETED,
                {"reminder_id": f"rem_{int(datetime.now().timestamp())}", **reminder}
            )
        except Exception as e:
            logger.error(f"Reminder error: {e}")
            return TaskResult(TaskType.SEND_REMINDER, TaskStatus.FAILED, error=str(e))
    
    # ==================== Health Diary ====================
    
    async def _handle_health_diary_add(self, payload: Dict, context: Dict) -> TaskResult:
        """Add entry to health diary"""
        logger.info("📝 Adding health diary entry")
        try:
            patient_id = payload.get("patient_id")
            entry_type = payload.get("entry_type")
            content = payload.get("content")
            
            # Save to database and health diary
            if self.db:
                await self.db.save_chat_message(
                    conversation_id=f"diary_{patient_id}",
                    patient_id=patient_id,
                    role="user",
                    content=content,
                    metadata={"entry_type": entry_type}
                )
            
            return TaskResult(
                TaskType.ADD_HEALTH_DIARY_ENTRY,
                TaskStatus.COMPLETED,
                {"entry_id": f"entry_{int(datetime.now().timestamp())}"}
            )
        except Exception as e:
            logger.error(f"Health diary add error: {e}")
            return TaskResult(TaskType.ADD_HEALTH_DIARY_ENTRY, TaskStatus.FAILED, error=str(e))
    
    async def _handle_health_diary_update(self, payload: Dict, context: Dict) -> TaskResult:
        """Update health diary — Qwen extracts structured changes from free-text."""
        logger.info("✏️ Updating health diary entry (Qwen synthesizer)")
        try:
            patient_id = payload.get("patient_id")
            # Fetch recent entries for context if DB available
            recent_entries: List[Dict] = []
            if self.db and patient_id:
                try:
                    msgs = await self.db.get_conversation_history(
                        f"diary_{patient_id}", limit=15
                    )
                    recent_entries = [m for m in (msgs or []) if isinstance(m, dict)]
                except Exception:
                    pass

            summary = self.qwen.summarise_diary(
                recent_entries + [{"content": payload.get("content", ""), "entry_type": payload.get("entry_type")}]
            )

            if self.db and patient_id:
                try:
                    await self.db.save_chat_message(
                        conversation_id=f"diary_{patient_id}",
                        patient_id=patient_id,
                        role="user",
                        content=payload.get("content", ""),
                        metadata={"entry_type": payload.get("entry_type"), "qwen_summary": summary},
                    )
                except Exception:
                    pass
            return TaskResult(
                TaskType.UPDATE_HEALTH_DIARY, TaskStatus.COMPLETED,
                {"entry_id": f"entry_{int(datetime.now().timestamp())}", **summary}
            )
        except Exception as e:
            logger.error(f"Health diary update error: {e}")
            return TaskResult(TaskType.UPDATE_HEALTH_DIARY, TaskStatus.FAILED, error=str(e))
    
    # ==================== Risk Assessment ====================
    
    async def _handle_risk_assessment(self, payload: Dict, context: Dict) -> TaskResult:
        """Assess patient risk using Bayesian network"""
        logger.info("⚠️ Assessing patient risk")
        try:
            from utils.bayesian_network import bn_inference
            
            patient_data = payload.get("patient_data", {})
            risk_result = bn_inference(patient_data)
            
            return TaskResult(
                TaskType.ASSESS_RISK,
                TaskStatus.COMPLETED,
                risk_result
            )
        except Exception as e:
            logger.error(f"Risk assessment error: {e}")
            return TaskResult(TaskType.ASSESS_RISK, TaskStatus.FAILED, error=str(e))
    
    async def _handle_emergency_detection(self, payload: Dict, context: Dict) -> TaskResult:
        """Detect emergency conditions"""
        logger.info("🚨 Checking for emergency conditions")
        try:
            from utils.safety_filter import detect_emergencies
            
            message = payload.get("message", "")
            emergency_alerts = detect_emergencies(message)
            
            if emergency_alerts:
                return TaskResult(
                    TaskType.DETECT_EMERGENCY,
                    TaskStatus.COMPLETED,
                    {"is_emergency": True, "alerts": [a.message for a in emergency_alerts]}
                )
            else:
                return TaskResult(
                    TaskType.DETECT_EMERGENCY,
                    TaskStatus.COMPLETED,
                    {"is_emergency": False}
                )
        except Exception as e:
            logger.error(f"Emergency detection error: {e}")
            return TaskResult(TaskType.DETECT_EMERGENCY, TaskStatus.FAILED, error=str(e))


# Singleton instance
_router = None

def get_task_router(db_manager=None) -> SIBTaskRouter:
    """Get or create task router singleton"""
    global _router
    if _router is None:
        _router = SIBTaskRouter(db_manager)
    return _router
