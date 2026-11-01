"""
Dr. iSHA & Mediqzy - SIB-Powered FastAPI Backend
=================================================

Synthetic Intelligence Brain (SIB) orchestrated medical AI system.

Connected to Mediczy Intelligent DB Infrastructure:
- PostgreSQL (primary transactional database)
- pgvector (vector embeddings for RAG)
- Citus (distributed PostgreSQL)
- JSONB (flexible schema support)

Endpoints:
- /chat: Multi-turn conversational AI
- /query: RAG-powered Q&A with risk assessment
- /ehr/upload: EHR file ingestion
- /ehr/ingest: Batch EHR ingestion
- /risk: Risk assessment
- /task/*: Task management
- /notify/*: Notifications and alerts
- /insurance/*: Insurance processing
- /summarize: Medical summarization

Run with: uvicorn sib_app:app --host 0.0.0.0 --port 8001
"""

import asyncio
import os
import time
import logging
import sys
import warnings
from typing import Dict, Any, Optional, List
from datetime import datetime
from pathlib import Path
import textwrap
import math
import json as _json
import traceback
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

# Configure logging
log_level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
log_level = getattr(logging, log_level_name, logging.INFO)
logging.basicConfig(
    level=log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("sib_api")

# Keep noisy clinical NLP dependencies from flooding PM2 logs during requests.
logging.getLogger("root").setLevel(logging.WARNING)
logging.getLogger("PyRuSH").setLevel(logging.WARNING)
logging.getLogger("PyRuSH.PyRuSHSentencizer").setLevel(logging.WARNING)
logging.getLogger("pysbd").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", category=SyntaxWarning, module=r"pysbd(\.|$)")

try:
    from loguru import logger as loguru_logger

    loguru_logger.remove()
    loguru_logger.add(sys.stderr, level=os.environ.get("LOGURU_LEVEL", "WARNING"))
except Exception:
    pass

# FastAPI imports
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Import SIB
from sib.brain import SyntheticIntelligenceBrain, get_sib, RequestType

# Import Database
from sib.database import initialize_database, close_database, get_db_manager


# ==================== Pydantic Models ====================

class ChatRequest(BaseModel):
    """Chat request model"""
    patient_id: str = Field(..., description="Patient identifier")
    message: str = Field(..., description="User message")
    include_risk: bool = Field(False, description="Include risk assessment")
    include_rag: bool = Field(True, description="Include retrieval-augmented context")
    skip_kb_rag: bool = Field(False, description="Skip knowledge-base RAG enrichment for this turn")
    patient_data: Optional[Dict[str, Any]] = Field(None, description="Patient health data")
    # HAIS cognitive tier — routed from Node.js llm-provider:
    #   'deep'     → BiMediX2-8B on RTX 3090 (clinical reasoning)
    #   'standard' → GPT-OSS on RTX 3060 (general reasoning)
    #   'reflex'   → GPT-OSS on RTX 3060 (fast ops)
    cognitive_tier: Optional[str] = Field(None, description="HAIS cognitive tier: deep | standard | reflex")


class QueryRequest(BaseModel):
    """Query request model"""
    query: str = Field(..., description="Medical query")
    patient_id: Optional[str] = Field(None, description="Patient identifier")
    patient_data: Optional[Dict[str, Any]] = Field(None, description="Patient health data")
    include_summary: bool = Field(False, description="Include summary")


class ScribeGenerateRequest(BaseModel):
    """Dedicated AI Scribe document generation request. Bypasses Dr iSHA voice assistant routing."""
    messages: List[Dict[str, str]] = Field(..., description="OpenAI-style system/user messages")
    document_type: str = Field("prescription", description="prescription, opd_notes, ipd_notes, discharge_summary")
    patient_id: Optional[str] = Field("ai-scribe", description="Scribe session/patient identifier")
    max_tokens: int = Field(1200, ge=128, le=2048)
    temperature: float = Field(0.05, ge=0.0, le=0.5)


class RiskRequest(BaseModel):
    """Risk assessment request"""
    patient_id: Optional[str] = None
    age: int = Field(..., ge=20, le=100)
    sex: str = Field(..., pattern="^(male|female)$")
    systolic_bp: float = Field(..., ge=70, le=250)
    total_cholesterol: Optional[float] = Field(None, ge=100, le=400)
    hdl_cholesterol: Optional[float] = Field(None, ge=20, le=100)
    smoker: bool = False
    diabetic: bool = False
    on_bp_treatment: bool = False
    include_recommendations: bool = True


class TaskRequest(BaseModel):
    """Task request model"""
    action: str = Field("list", description="Action: create, update, complete, list, delete")
    task_id: Optional[str] = None
    patient_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None


class NotificationRequest(BaseModel):
    """Notification request model"""
    action: str = Field("send", description="Action: send, schedule, list, dismiss")
    notification_id: Optional[str] = None
    patient_id: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    type: Optional[str] = None
    severity: Optional[str] = None
    channels: Optional[List[str]] = None
    scheduled_time: Optional[str] = None
    delay_minutes: Optional[int] = None


class InsuranceRequest(BaseModel):
    """Insurance request model"""
    action: str = Field("check_eligibility", description="Action: check_eligibility, process_claim, get_policy, estimate_cost")
    patient_id: Optional[str] = None
    policy_id: Optional[str] = None
    service_type: Optional[str] = None
    billed_amount: Optional[float] = None
    estimated_amount: Optional[float] = None
    procedure_codes: Optional[List[str]] = None
    diagnosis_codes: Optional[List[str]] = None
    service_date: Optional[str] = None
    question: Optional[str] = None


class SummarizeRequest(BaseModel):
    """Summarization request model"""
    text: Optional[str] = None
    patient_id: Optional[str] = None
    summary_type: str = Field("general", description="Type: general, treatment, diagnosis, visit")


class WebSearchRequest(BaseModel):
    """Web search request model"""
    action: str = Field("search", description="Action: search, medical_search, scrape, stats")
    query: Optional[str] = None
    url: Optional[str] = None
    engines: Optional[List[str]] = Field(None, description="Search engines: google, duckduckgo, bing")
    max_results: int = Field(10, ge=1, le=50)
    category: Optional[str] = Field("general", description="For medical_search: hospital, doctor, laboratory, pharmacy, condition, medication")


# ==================== Enhanced RAG/Agentic AI Models ====================

class AgentQueryRequest(BaseModel):
    """ReAct agent query request"""
    query: str = Field(..., description="Complex medical query for agent reasoning")
    patient_id: Optional[str] = Field(None, description="Patient identifier")
    patient_data: Optional[Dict[str, Any]] = Field(None, description="Patient context data")
    max_steps: int = Field(10, ge=1, le=20, description="Maximum reasoning steps")
    include_reasoning: bool = Field(True, description="Include reasoning steps in response")


class LangGraphAgentRequest(BaseModel):
    """LangGraph workflow agent request"""
    message: str = Field(..., description="User/admin message to route through LangGraph")
    patient_id: Optional[str] = Field("default", description="Patient or session identifier")
    patient_data: Optional[Dict[str, Any]] = Field(None, description="Patient/admin context for tools")


class KnowledgeSearchRequest(BaseModel):
    """Knowledge base search request"""
    query: str = Field(..., description="Medical knowledge search query")
    search_type: str = Field("all", description="Type: all, guidelines, diseases, symptoms, drugs, emergencies")
    top_k: int = Field(5, ge=1, le=20, description="Number of results")


class SymptomClassifyRequest(BaseModel):
    """Symptom classification request"""
    symptoms: List[str] = Field(..., description="List of symptoms to classify")
    patient_age: Optional[int] = Field(None, description="Patient age for severity adjustment")
    patient_conditions: Optional[List[str]] = Field(None, description="Pre-existing conditions")


class TriageRequest(BaseModel):
    """Patient triage request (ESI 5-level)"""
    chief_complaint: str = Field(..., description="Main presenting complaint")
    symptoms: List[str] = Field(default_factory=list, description="Additional symptoms")
    vital_signs: Optional[Dict[str, Any]] = Field(None, description="Vital signs: hr, bp_systolic, bp_diastolic, rr, temp, spo2")
    patient_age: Optional[int] = Field(None, description="Patient age")
    patient_type: str = Field("adult", description="Patient type: adult, pediatric, elderly")
    mental_status: str = Field("alert", description="Mental status: alert, verbal, pain, unresponsive")


class DrugInteractionRequest(BaseModel):
    """Drug interaction check request"""
    drugs: List[str] = Field(..., description="List of drug names to check")
    patient_conditions: Optional[List[str]] = Field(None, description="Patient conditions for contraindication check")


class HybridSearchRequest(BaseModel):
    """Hybrid search request (dense + sparse)"""
    query: str = Field(..., description="Search query")
    top_k: int = Field(10, ge=1, le=50, description="Number of results")
    use_reranking: bool = Field(False, description="Apply cross-encoder reranking")
    dense_weight: float = Field(0.6, ge=0, le=1, description="Weight for dense retrieval (1-dense_weight for sparse)")


class EmbedRequest(BaseModel):
    """Embedding request — returns 768-dim ClinicalBERT vectors"""
    texts: list[str] = Field(..., description="Texts to embed")


class IngestDocumentRequest(BaseModel):
    """Knowledge document ingestion request"""
    title: str = Field(..., description="Document title")
    text: str = Field(..., description="Full document text")
    category: str = Field("clinical", description="Category: clinical | insurance | guideline | irdai")
    source: str = Field("manual", description="Source label (e.g. irdai, who, user_upload)")
    scope: str = Field("global", description="Scope: global | hospital | doctor")
    scope_id: Optional[str] = Field(None, description="Scope ID if not global")


class EHRTextRequest(BaseModel):
    """EHR text ingestion request"""
    text: str = Field(..., description="EHR text content")
    patient_id: Optional[str] = None


class EmergencyTriageRequest(BaseModel):
    """Emergency triage request model"""
    symptoms: str = Field(..., description="Patient symptoms (comma-separated or description)")
    description: str = Field("", description="Additional description of the situation")
    patient_id: Optional[str] = Field(None, description="Patient identifier")
    patient_data: Optional[Dict[str, Any]] = Field(None, description="Patient information (age, conditions, etc.)")
    multimodal_context: Optional[Dict[str, Any]] = Field(None, description="Video/audio analysis context")
    language: str = Field("en", description="Response language: en, hi")


# ==================== Application State ====================

class AppState:
    """Application state"""
    def __init__(self):
        self.start_time = datetime.now()
        self.sib: Optional[SyntheticIntelligenceBrain] = None
        self.db = None
    
    async def initialize(self):
        """Initialize SIB and Database"""
        logger.info("🧠 Initializing Synthetic Intelligence Brain...")
        
        # API keys loaded from environment (.env file or PM2 ecosystem config)
        if not os.environ.get("GROQ_API_KEY"):
            logger.warning("⚠️ GROQ_API_KEY not set — LLM fallback will be unavailable")
        
        # Initialize database connection
        try:
            logger.info("🔌 Connecting to Intelligent DB Infrastructure...")
            self.db = await initialize_database()
            self.sib = get_sib()
            self.sib.db = self.db
            # Wire asyncpg pool into UnifiedRAGRetriever singleton
            try:
                from sib.retrieval.unified_rag import get_unified_rag
                get_unified_rag(self.db.pg_pool)
                logger.info("   ↳ UnifiedRAG: pool injected")
            except Exception as _rag_e:
                logger.warning(f"   ↳ UnifiedRAG pool injection failed: {_rag_e}")
            logger.info("✅ Database connection established")
            logger.info(f"   ↳ PostgreSQL: Connected")
            if self.db.pgvector_enabled:
                logger.info(f"   ↳ pgvector: Enabled (dimension {self.db.vector_dimension})")
            if self.db.citus_enabled:
                logger.info(f"   ↳ Citus: Distributed mode active")
            logger.info(f"   ↳ JSONB: Native support active")
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            logger.warning("⚠️  Continuing with in-memory fallback")
            self.db = None
        
        # Initialize SIB
        if not self.sib:
            self.sib = get_sib()
        logger.info("✅ SIB initialized successfully")


app_state = AppState()


# ==================== Lifespan ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    await app_state.initialize()

    # Prewarm all AI models in parallel — avoids cold-start latency on first request
    async def _prewarm_pubmed():
        await asyncio.to_thread(_get_embed_model)
        logger.info("✅ S-PubMedBert preloaded")

    async def _prewarm_clinical():
        try:
            from utils.pgvector_store import warmup
            await asyncio.to_thread(warmup)
            logger.info("✅ ClinicalBERT + pgvector pool preloaded")
        except Exception as _e:
            logger.warning(f"ClinicalBERT warmup skipped: {_e}")

    async def _prewarm_regex_router():
        try:
            from sib.tinyllama_router import get_router, classify_intent
            # Instantiate router singleton and warm the regex engine (ITEM-24: no GGUF loaded)
            router = await asyncio.to_thread(get_router)
            # Warm compile: run one classify to ensure all regex patterns are compiled
            _ = classify_intent("hello")
            logger.info("Intent router preloaded (regex classifier, no GGUF)")
        except Exception as _e:
            logger.warning(f"Regex router preload skipped: {_e}")

    async def _prewarm_groq():
        try:
            from sib.brain import _get_groq_client
            await asyncio.to_thread(_get_groq_client)
            logger.info("✅ Groq client singleton initialised")
        except Exception as _e:
            logger.warning(f"Groq preload skipped: {_e}")

    await asyncio.gather(
        _prewarm_pubmed(),
        _prewarm_clinical(),
        _prewarm_regex_router(),
        _prewarm_groq(),
        return_exceptions=True,
    )
    yield
    # Shutdown
    logger.info("👋 Shutting down SIB...")
    if app_state.db:
        logger.info("🔌 Closing database connections...")
        await close_database()
        logger.info("✅ Database connections closed")
    logger.info("✅ SIB shutdown complete")


# ==================== FastAPI App ====================

app = FastAPI(
    title="Dr. iSHA & Mediqzy - SIB API",
    description="""
    Synthetic Intelligence Brain (SIB) — Regex-Routed Medical AI.

    Orchestration (v3 — ITEM-24):
      Every request → regex intent classifier (~0ms) → botlet routing → iSHA/Groq/Gemini execution
      Qwen 2.5-3B GGUF planner replaced by lightweight INTENT_RULES regex classifier.

    Endpoints:
    - /chat:            Multi-turn conversational AI (regex-routed)
    - /query:           RAG-powered Q&A with risk assessment
    - /planner/plan:    QwenPlanner call (falls back to regex if Qwen unavailable)
    - /planner/status:  Router load status and capabilities
    - /automate:        Unified automation route → regex classifier → task_router
    - /triage:          ESI 5-level triage
    - /emergency-triage: Real-time emergency assessment
    - /risk:            Bayesian cardiovascular risk scoring
    - /drugs/check:     Drug interaction checker
    - /ehr/*:           EHR ingestion and retrieval
    - /task, /notify, /insurance, /summarize: Botlet management
    - /mediczy/*:       Live DB — doctors, hospitals, clinics, labs, patients
    - /embed, /ingest, /rag/search: Vector knowledge base
    - /kb/refresh:      Nightly IRDAI / WHO knowledge refresh
    - /webhook/n8n:     n8n bidirectional integration

    LLM Stack: regex classifier (router) → iSHA GPU (BiMediX2/MedGemma) → Groq → Gemini
    """,
    version="3.1.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Feedback & Learning API router
from sib.api.feedback_api import router as feedback_router
app.include_router(feedback_router, prefix="/api")


# ==================== Root & Health ====================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Dr. iSHA & Mediqzy - Synthetic Intelligence Brain",
        "version": "3.1.0",
        "status": "online",
        "docs": "/docs",
        "orchestration": "regex intent classifier → botlets execute → iSHA/Groq/Gemini synthesize",
        "planner": "/planner/status",
        "automate": "/automate",
        "botlets": [
            "ChatBotlet", "EHRBotlet", "RiskBotlet",
            "SummarizerBotlet", "TaskBotlet",
            "NotificationBotlet", "InsuranceBotlet",
            "EmergencyTriageBotlet", "WebSearchBotlet",
        ],
        "llm_stack": [
            "regex classifier (intent router, zero-weight, ~0ms)",
            "iSHA GPU: BiMediX2-8B / MedGemma-4B (clinical reasoning)",
            "Groq: Llama-3.3-70B (cloud fallback 1)",
            "Gemini: 1.5-flash (cloud fallback 2)",
        ],
        "item_24": "Qwen 2.5-3B GGUF planner replaced by INTENT_RULES regex classifier",
    }


@app.get("/health")
async def health():
    """Health check with SIB and database status"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    sib_status = await app_state.sib.handle_request(RequestType.HEALTH_CHECK.value, {})
    uptime = (datetime.now() - app_state.start_time).total_seconds()
    
    # Database status
    db_status = {
        "connected": False,
        "postgres": False,
        "pgvector": False,
        "citus": False,
        "jsonb": False
    }

    if app_state.db:
        db_status = {
            "connected": app_state.db.connected,
            "postgres": app_state.db.connected,
            "pgvector": app_state.db.pgvector_enabled,
            "citus": app_state.db.citus_enabled,
            "jsonb": True,  # Native to PostgreSQL
            "vector_dimension": app_state.db.vector_dimension if app_state.db.pgvector_enabled else None
        }
    
    return {
        "status": "healthy",
        "uptime_seconds": round(uptime, 2),
        "sib": sib_status,
        "database": db_status,
        "intelligent_db": {
            "architecture": "PostgreSQL + pgvector + Citus",
            "features": ["JSONB", "Vector Search", "Analytics", "Distributed Queries"]
        }
    }


# ==================== Chat Endpoint ====================

@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Multi-turn conversational AI endpoint.

    Every turn is enriched with pgvector KB chunks (ai_document_chunks) that are
    semantically relevant to the user's message.  The retrieved guidelines/policies
    are injected into the LLM prompt as [KNOWLEDGE BASE] context so the model can
    answer using the latest indexed IRDAI circulars, WHO advisories, etc.

    Pass skip_kb_rag=true to bypass enrichment (e.g. simple acknowledgements).
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")

    req_data = request.model_dump()

    # ── KB RAG enrichment (UnifiedRAGRetriever) ──────────────────────────────
    if not request.skip_kb_rag and len(request.message.strip()) > 10:
        try:
            from sib.retrieval.unified_rag import get_unified_rag
            _rag = get_unified_rag()
            _chunks = await _rag.retrieve(request.message, k=3)
            if _chunks:
                req_data["kb_context"] = _rag.to_context_string(_chunks, max_chars=1800)
                req_data["_kb_chunks_injected"] = len(_chunks)
                req_data["_kb_top_score"] = round(_chunks[0].score, 3)
                logger.info(f"KB RAG: {len(_chunks)} chunks injected (top score {_chunks[0].score:.3f})")
        except Exception as _kb_err:
            logger.warning(f"KB RAG enrichment skipped: {_kb_err}")
    # ─────────────────────────────────────────────────────────────────────────

    result = await app_state.sib.handle_request(RequestType.CHAT.value, req_data)

    # Surface KB injection metadata in response (for debugging / frontend transparency)
    if req_data.get("_kb_chunks_injected"):
        result["kb_rag"] = {
            "chunks_injected": req_data["_kb_chunks_injected"],
            "top_score": req_data["_kb_top_score"],
        }

    return result


@app.get("/chat/history/{patient_id}")
async def get_chat_history(patient_id: str, last_n: Optional[int] = None):
    """Get chat history for a patient"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    history = app_state.sib.chat_bot.get_conversation_history(patient_id, last_n)
    return {"patient_id": patient_id, "history": history}


@app.delete("/chat/history/{patient_id}")
async def clear_chat_history(patient_id: str):
    """Clear chat history for a patient"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    app_state.sib.chat_bot.clear_conversation(patient_id)
    return {"status": "success", "patient_id": patient_id}


# ==================== AI Scribe Endpoint ====================

@app.post("/scribe/generate")
async def generate_scribe_document(request: ScribeGenerateRequest):
    """
    Dedicated AI Scribe formatter endpoint.

    This intentionally bypasses /chat and LangGraph voice-assistant routing so doctor
    dictation is formatted as a clinical draft, not treated as a Dr iSHA command.
    Node.js owns Groq/OpenAI fallback; this endpoint only attempts local BiMediX.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")

    system_prompt = ""
    user_parts = []
    for msg in request.messages:
        role = str(msg.get("role", "user")).lower()
        content = str(msg.get("content", ""))
        if role == "system":
            system_prompt = f"{system_prompt}\n{content}".strip()
        else:
            user_parts.append(content)

    prompt = "\n\n".join(user_parts).strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Scribe prompt is required")

    try:
        started = time.time()
        result = app_state.sib._local_gpu_inference(
            prompt=prompt,
            system_prompt=system_prompt or (
                "You are Mediczy AI Scribe. Format doctor dictation into clinician-review "
                "clinical documents. Return JSON only. Do not provide patient advice."
            ),
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        return {
            "content": result.get("answer", ""),
            "provider": "dr-isha-local-bimedix",
            "model": result.get("model", "BiMediX2-8B"),
            "document_type": request.document_type,
            "latency_ms": round((time.time() - started) * 1000, 2),
            "voice_assistant_bypassed": True
        }
    except Exception as exc:
        logger.warning(f"AI Scribe BiMediX generation failed: {exc}")
        raise HTTPException(status_code=502, detail=f"BiMediX scribe generation failed: {exc}")


# ==================== LangGraph Agent Endpoint ====================

@app.post("/agent/run")
async def run_langgraph_agent(request: LangGraphAgentRequest):
    """
    Route a message through the LangGraph orchestration layer.

    Supported workflows:
    - Health questions and safety checks
    - Health intelligence summaries
    - Report analysis
    - Appointment concierge
    - Pharmacy/lab concierge
    - Insurance/preauth guidance
    - Health diary logging drafts
    - Doctor registration verification review
    - Voice-assistant command routing
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")

    return app_state.sib.langgraph_agent.run(
        patient_id=request.patient_id or "default",
        message=request.message,
        patient_data=request.patient_data,
    )


@app.get("/agent/status")
async def langgraph_agent_status():
    """Return LangGraph agent availability and registered tools."""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")

    agent = app_state.sib.langgraph_agent
    return {
        "enabled": os.environ.get("SIB_LANGGRAPH_ENABLED", "true").lower() == "true",
        "engine": "langgraph",
        "tools": sorted(agent.tools.keys()),
        "workflows": [
            "health_question",
            "health_intelligence",
            "report_analysis",
            "appointment",
            "pharmacy_lab",
            "insurance",
            "health_diary",
            "doctor_verification",
            "voice_assistant",
        ],
    }


# ==================== Query Endpoint ====================

@app.post("/query")
async def query(request: QueryRequest):
    """
    RAG-powered query endpoint.
    
    Retrieves relevant EHR context and generates answers.
    Optionally includes risk assessment and summary.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    result = await app_state.sib.handle_request(RequestType.QUERY.value, request.model_dump())
    return result


# ==================== EHR Endpoints ====================

@app.post("/ehr/upload")
async def upload_ehr(file: UploadFile = File(...), patient_id: Optional[str] = Form(None)):
    """
    Upload and ingest an EHR file.
    
    Supports: PDF, HL7, TXT
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    # Validate file type
    allowed_extensions = [".pdf", ".hl7", ".txt"]
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file_ext}. Allowed: {allowed_extensions}"
        )
    
    # Save file
    ehr_dir = Path(__file__).parent / "data" / "ehr_records"
    ehr_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = ehr_dir / file.filename
    content = await file.read()
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Ingest via SIB
    result = await app_state.sib.handle_request(RequestType.EHR_UPLOAD.value, {
        "file_path": str(file_path),
        "patient_id": patient_id
    })

    return result


@app.post("/ehr/text")
async def ingest_ehr_text(request: EHRTextRequest):
    """Ingest EHR text directly"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    result = await app_state.sib.handle_request(RequestType.EHR_UPLOAD.value, {
        "file_content": request.text,
        "patient_id": request.patient_id
    })

    return result


@app.post("/ehr/ingest")
async def ingest_new_ehrs():
    """Batch ingest all new EHR files from data/ehr_records/"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    result = app_state.sib.ehr_bot.ingest_batch()
    return result


# ==================== Emergency Triage Endpoint ====================

@app.post("/emergency-triage")
async def emergency_triage(request: EmergencyTriageRequest):
    """
    Emergency Triage Assessment.
    
    Performs real-time emergency assessment with:
    - Rule-based RED flag detection
    - AI-powered urgency classification
    - Multimodal context support (video/audio analysis)
    - n8n automation for alerts
    
    Urgency Levels:
    - RED: Life-threatening - call ambulance
    - ORANGE: Very urgent - ER immediately
    - YELLOW: Urgent - visit hospital soon
    - GREEN: Standard - book appointment
    - BLUE: Non-urgent - self-care
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    # Import botlet
    from sib.botlets.emergency_triage_botlet import get_emergency_triage_botlet, EmergencyTriageBotlet
    
    # Get or create the botlet
    triage_botlet = get_emergency_triage_botlet(app_state.sib.memory)
    if not triage_botlet:
        triage_botlet = EmergencyTriageBotlet(app_state.sib.memory)
    
    # Perform triage
    result = await triage_botlet.triage(
        symptoms=request.symptoms,
        description=request.description,
        patient_data=request.patient_data,
        multimodal_context=request.multimodal_context,
        language=request.language
    )
    
    return result


@app.get("/emergency-triage/stats")
async def emergency_triage_stats():
    """Get emergency triage statistics."""
    from sib.botlets.emergency_triage_botlet import get_emergency_triage_botlet
    
    triage_botlet = get_emergency_triage_botlet()
    if not triage_botlet:
        return {"total_triages": 0, "status": "not_initialized"}
    
    return await triage_botlet.get_triage_stats()


@app.get("/ehr/status")
async def ehr_status():
    """Get EHR ingestion status"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    return app_state.sib.ehr_bot.get_ingestion_status()


# ==================== Risk Endpoint ====================

@app.post("/risk")
async def assess_risk(request: RiskRequest):
    """
    Cardiovascular risk assessment.
    
    Uses Bayesian Network + clinical scoring (Framingham, ASCVD).
    Optionally includes LLM-generated recommendations.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    result = await app_state.sib.handle_request(RequestType.RISK.value, {
        "patient_data": request.model_dump(),
        "include_recommendations": request.include_recommendations
    })
    
    return result


# ==================== Task Endpoints ====================

@app.post("/task")
async def manage_task(request: TaskRequest):
    """
    Task management endpoint.
    
    Actions: create, update, complete, list, delete
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    result = await app_state.sib.handle_request(RequestType.TASK.value, request.model_dump())
    return result


@app.get("/task/{task_id}")
async def get_task(task_id: str):
    """Get a specific task"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    return app_state.sib.task_bot.get_task(task_id)


@app.get("/tasks/overdue")
async def get_overdue_tasks(patient_id: Optional[str] = None):
    """Get all overdue tasks"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    return app_state.sib.task_bot.get_overdue_tasks(patient_id)


# ==================== Notification Endpoints ====================

@app.post("/notify")
async def manage_notification(request: NotificationRequest):
    """
    Notification management endpoint.
    
    Actions: send, schedule, list, dismiss
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    result = await app_state.sib.handle_request(RequestType.NOTIFY.value, request.model_dump())
    return result


@app.get("/notifications/{patient_id}")
async def get_patient_notifications(patient_id: str, active_only: bool = True):
    """Get notifications for a patient"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    return app_state.sib.notification_bot.list_notifications(
        patient_id=patient_id, 
        active_only=active_only
    )


# ==================== Insurance Endpoints ====================

@app.post("/insurance")
async def process_insurance(request: InsuranceRequest):
    """
    Insurance processing endpoint.
    
    Actions: check_eligibility, process_claim, get_policy, estimate_cost
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    result = await app_state.sib.handle_request(RequestType.INSURANCE.value, request.model_dump())
    return result


@app.get("/insurance/policy/{policy_id}")
async def get_policy(policy_id: str):
    """Get insurance policy details"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    return app_state.sib.insurance_bot.get_policy_info(policy_id)


@app.post("/insurance/explain")
async def explain_coverage(policy_id: str, question: str):
    """Use AI to explain insurance coverage"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    return app_state.sib.insurance_bot.explain_coverage(policy_id, question)


# ==================== Summarization Endpoint ====================

@app.post("/summarize")
async def summarize(request: SummarizeRequest):
    """
    Medical text summarization endpoint.
    
    Supports: general, treatment, diagnosis, visit summaries
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    result = await app_state.sib.handle_request(RequestType.SUMMARIZE.value, request.model_dump())
    return result


# ==================== Web Search Endpoints ====================

@app.post("/web/search")
async def web_search(request: WebSearchRequest):
    """
    Web search endpoint with multi-engine support.
    
    Actions:
    - search: Basic web search
    - medical_search: Specialized medical/healthcare search
    - scrape: Scrape a specific URL
    - stats: Get search statistics
    
    Engines: google, duckduckgo, bing
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.WEB_SEARCH.value, 
            request.model_dump()
        )
        return result
    except Exception as e:
        logger.error(f"Web search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/web/search/{query}")
async def quick_search(
    query: str, 
    max_results: int = 10,
    engines: Optional[str] = None
):
    """
    Quick web search endpoint (GET).
    
    Usage: /web/search/apollo%20hospitals?max_results=5&engines=google,duckduckgo
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    engine_list = engines.split(',') if engines else None
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.WEB_SEARCH.value,
            {
                "action": "search",
                "query": query,
                "engines": engine_list,
                "max_results": max_results
            }
        )
        return result
    except Exception as e:
        logger.error(f"Quick search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/web/medical-search")
async def medical_search(
    query: str,
    category: str = "general",
    max_results: int = 15
):
    """
    Specialized medical/healthcare search.
    
    Categories:
    - hospital: Hospital and medical centers
    - doctor: Doctors and specialists
    - laboratory: Diagnostic laboratories
    - pharmacy: Pharmacies and drugstores
    - condition: Medical conditions and diseases
    - medication: Medications and drugs
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.WEB_SEARCH.value,
            {
                "action": "medical_search",
                "query": query,
                "category": category,
                "max_results": max_results
            }
        )
        return result
    except Exception as e:
        logger.error(f"Medical search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/web/scrape")
async def scrape_url(url: str):
    """
    Scrape and extract content from a web page.
    
    Extracts:
    - Title, description, text content
    - Contact information (phone, email, address)
    - Services (for healthcare providers)
    - Metadata
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    if not url.startswith(('http://', 'https://')):
        raise HTTPException(status_code=400, detail="Invalid URL. Must start with http:// or https://")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.WEB_SEARCH.value,
            {
                "action": "scrape",
                "url": url
            }
        )
        return result
    except Exception as e:
        logger.error(f"Scrape error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/web/stats")
async def web_search_stats():
    """Get web search statistics"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.WEB_SEARCH.value,
            {"action": "stats"}
        )
        return result
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Enhanced RAG/Agentic AI Endpoints ====================

@app.post("/agent/query")
async def agent_query(request: AgentQueryRequest):
    """
    Execute a complex medical query using the ReAct agent.
    
    The agent uses a Thought-Action-Observation loop to:
    - Search medical knowledge bases
    - Check symptoms and classify severity
    - Assess drug interactions
    - Perform triage assessment
    - Query EHR data
    - Synthesize comprehensive answers
    
    Returns the final answer with optional reasoning steps.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.AGENT_QUERY.value,
            {
                "query": request.query,
                "patient_id": request.patient_id,
                "patient_data": request.patient_data,
                "max_steps": request.max_steps,
                "include_reasoning": request.include_reasoning
            }
        )
        return result
    except Exception as e:
        logger.error(f"Agent query error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/knowledge/search")
async def knowledge_search(request: KnowledgeSearchRequest):
    """
    Search the medical knowledge base.
    
    Search types:
    - all: Search across all knowledge domains
    - guidelines: Clinical guidelines (hypertension, diabetes, etc.)
    - diseases: Disease information with ICD-10 codes
    - symptoms: Symptom-disease mappings
    - drugs: Drug information and dosing
    - emergencies: Emergency criteria and protocols
    
    Returns relevant medical knowledge with confidence scores.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.KNOWLEDGE_SEARCH.value,
            {
                "query": request.query,
                "search_type": request.search_type,
                "top_k": request.top_k
            }
        )
        return result
    except Exception as e:
        logger.error(f"Knowledge search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/symptoms/classify")
async def classify_symptoms(request: SymptomClassifyRequest):
    """
    Classify symptoms by body system and assess severity.
    
    Classification includes:
    - Body system mapping (cardiovascular, respiratory, etc.)
    - Severity assessment (mild, moderate, severe)
    - Urgency level (routine, urgent, emergent)
    - Red flag detection for emergency symptoms
    
    Returns structured classification for each symptom.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.SYMPTOM_CHECK.value,
            {
                "symptoms": request.symptoms,
                "patient_age": request.patient_age,
                "patient_conditions": request.patient_conditions
            }
        )
        return result
    except Exception as e:
        logger.error(f"Symptom classification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/triage")
async def triage_patient(request: TriageRequest):
    """
    Perform ESI 5-level triage assessment.
    
    ESI Levels:
    - Level 1: Immediate (life-threatening)
    - Level 2: Emergent (high risk/severe pain)
    - Level 3: Urgent (requires multiple resources)
    - Level 4: Less urgent (one resource expected)
    - Level 5: Non-urgent (no resources expected)
    
    Considers:
    - Chief complaint severity
    - Vital sign abnormalities
    - Mental status
    - Patient age/type
    - Resource prediction
    
    Returns triage level with recommendations.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.TRIAGE.value,
            {
                "chief_complaint": request.chief_complaint,
                "symptoms": request.symptoms,
                "vital_signs": request.vital_signs,
                "patient_age": request.patient_age,
                "patient_type": request.patient_type,
                "mental_status": request.mental_status
            }
        )
        return result
    except Exception as e:
        logger.error(f"Triage error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/drugs/check")
async def check_drug_interactions(request: DrugInteractionRequest):
    """
    Check drug-drug interactions and contraindications.
    
    Features:
    - Drug-drug interaction detection (major/moderate/minor)
    - Contraindication checking for patient conditions
    - Drug information lookup
    - Clinical recommendations
    
    Returns interaction severity and clinical guidance.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.DRUG_CHECK.value,
            {
                "drugs": request.drugs,
                "patient_conditions": request.patient_conditions
            }
        )
        return result
    except Exception as e:
        logger.error(f"Drug interaction check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search/hybrid")
async def hybrid_search(request: HybridSearchRequest):
    """
    Perform hybrid search combining dense and sparse retrieval.
    
    Combines:
    - Dense retrieval (sentence embeddings via FAISS)
    - Sparse retrieval (BM25 keyword matching)
    - Reciprocal Rank Fusion for result combination
    - Optional cross-encoder reranking
    
    Medical term boosting for improved relevance.
    
    Returns combined results with relevance scores.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        result = await app_state.sib.handle_request(
            RequestType.HYBRID_SEARCH.value,
            {
                "query": request.query,
                "top_k": request.top_k,
                "use_reranking": request.use_reranking,
                "dense_weight": request.dense_weight
            }
        )
        return result
    except Exception as e:
        logger.error(f"Hybrid search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/agent/status")
async def agent_status():
    """Get status of enhanced AI components"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    try:
        # Check component availability
        components = {
            "react_agent": False,
            "knowledge_base": False,
            "drug_database": False,
            "symptom_classifier": False,
            "triage_model": False,
            "hybrid_retriever": False
        }
        
        try:
            from sib.agent.react_agent import ReActAgent
            components["react_agent"] = True
        except ImportError:
            pass
        
        try:
            from sib.knowledge.medical_knowledge import MedicalKnowledgeBase
            components["knowledge_base"] = True
        except ImportError:
            pass
        
        try:
            from sib.knowledge.drug_database import DrugDatabase
            components["drug_database"] = True
        except ImportError:
            pass
        
        try:
            from sib.knowledge.symptom_classifier import SymptomClassifier
            components["symptom_classifier"] = True
        except ImportError:
            pass
        
        try:
            from sib.knowledge.triage_model import TriageModel
            components["triage_model"] = True
        except ImportError:
            pass
        
        try:
            from sib.retrieval.hybrid_retriever import HybridRetriever
            components["hybrid_retriever"] = True
        except ImportError:
            pass
        
        all_loaded = all(components.values())
        
        return {
            "status": "operational" if all_loaded else "partial",
            "components": components,
            "all_components_loaded": all_loaded,
            "message": "All enhanced AI components are loaded" if all_loaded else "Some components are not available"
        }
    except Exception as e:
        logger.error(f"Agent status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Mediczy Database Access Endpoints ====================
# Direct access to doctors, hospitals, clinics, and patient data

from sib.database import get_mediczy_data


@app.get("/mediczy/doctors")
async def get_doctors(
    specialization: Optional[str] = None,
    city: Optional[str] = None,
    limit: int = 10
):
    """
    Get available doctors from Mediczy database.
    
    Filters:
    - specialization: Filter by specialization (e.g., "cardiology", "general")
    - city: Filter by city
    - limit: Max number of results (default 10)
    """
    try:
        mediczy = get_mediczy_data()
        doctors = await mediczy.get_available_doctors(
            specialization=specialization,
            city=city,
            limit=limit
        )
        return {
            "status": "success",
            "count": len(doctors),
            "doctors": doctors
        }
    except Exception as e:
        logger.error(f"Error fetching doctors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/doctors/search/{query}")
async def search_doctors(query: str, limit: int = 10):
    """
    Search doctors by name, specialization, or city.
    """
    try:
        mediczy = get_mediczy_data()
        doctors = await mediczy.search_doctors(query=query, limit=limit)
        return {
            "status": "success",
            "count": len(doctors),
            "doctors": doctors
        }
    except Exception as e:
        logger.error(f"Error searching doctors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/doctors/{doctor_id}")
async def get_doctor(doctor_id: int):
    """Get doctor details by ID."""
    try:
        mediczy = get_mediczy_data()
        doctor = await mediczy.get_doctor_by_id(doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        return {"status": "success", "doctor": doctor}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching doctor {doctor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/specializations")
async def get_specializations():
    """Get list of all available doctor specializations."""
    try:
        mediczy = get_mediczy_data()
        specializations = await mediczy.get_doctor_specializations()
        return {
            "status": "success",
            "count": len(specializations),
            "specializations": specializations
        }
    except Exception as e:
        logger.error(f"Error fetching specializations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/hospitals")
async def get_hospitals(
    city: Optional[str] = None,
    specialization: Optional[str] = None,
    limit: int = 10
):
    """
    Get hospitals from Mediczy database.
    
    Filters:
    - city: Filter by city
    - specialization: Filter by specialization offered
    - limit: Max number of results
    """
    try:
        mediczy = get_mediczy_data()
        hospitals = await mediczy.get_hospitals(
            city=city,
            specialization=specialization,
            limit=limit
        )
        return {
            "status": "success",
            "count": len(hospitals),
            "hospitals": hospitals
        }
    except Exception as e:
        logger.error(f"Error fetching hospitals: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/hospitals/{hospital_id}")
async def get_hospital(hospital_id: int):
    """Get hospital details by ID."""
    try:
        mediczy = get_mediczy_data()
        hospital = await mediczy.get_hospital_by_id(hospital_id)
        if not hospital:
            raise HTTPException(status_code=404, detail="Hospital not found")
        return {"status": "success", "hospital": hospital}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching hospital {hospital_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/clinics")
async def get_clinics(city: Optional[str] = None, limit: int = 10):
    """Get clinics from Mediczy database."""
    try:
        mediczy = get_mediczy_data()
        clinics = await mediczy.get_clinics(city=city, limit=limit)
        return {
            "status": "success",
            "count": len(clinics),
            "clinics": clinics
        }
    except Exception as e:
        logger.error(f"Error fetching clinics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/labs")
async def get_labs(
    city: Optional[str] = None,
    name: Optional[str] = None,
    limit: int = 20
):
    """
    Get diagnostic labs from Mediczy database.
    
    Filters:
    - city: Filter by city (e.g., Chennai, Bangalore)
    - name: Filter by lab name (e.g., Redcliffe, Neuberg)
    - limit: Max number of results (default 20)
    """
    try:
        mediczy = get_mediczy_data()
        labs = await mediczy.get_labs(city=city, name=name, limit=limit)
        return {
            "status": "success",
            "count": len(labs),
            "labs": labs
        }
    except Exception as e:
        logger.error(f"Error fetching labs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/labs/search/{query}")
async def search_labs(
    query: str,
    city: Optional[str] = None,
    limit: int = 10
):
    """Search labs by name or service."""
    try:
        mediczy = get_mediczy_data()
        labs = await mediczy.search_labs(query=query, city=city, limit=limit)
        return {
            "status": "success",
            "count": len(labs),
            "labs": labs
        }
    except Exception as e:
        logger.error(f"Error searching labs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/labs/{lab_id}")
async def get_lab(lab_id: int):
    """Get lab details by ID."""
    try:
        mediczy = get_mediczy_data()
        lab = await mediczy.get_lab_by_id(lab_id)
        if not lab:
            raise HTTPException(status_code=404, detail="Lab not found")
        return {"status": "success", "lab": lab}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching lab {lab_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/patient/{user_id}")
async def get_patient_profile(user_id: int):
    """Get patient profile by user ID."""
    try:
        mediczy = get_mediczy_data()
        profile = await mediczy.get_user_profile(user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Patient not found")
        return {"status": "success", "profile": profile}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/patient/phone/{phone}")
async def get_patient_by_phone(phone: str):
    """Get patient profile by phone number."""
    try:
        mediczy = get_mediczy_data()
        profile = await mediczy.get_user_by_phone(phone)
        if not profile:
            raise HTTPException(status_code=404, detail="Patient not found")
        return {"status": "success", "profile": profile}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient by phone: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/patient/{user_id}/context")
async def get_patient_full_context(user_id: int):
    """
    Get comprehensive patient context for AI.
    
    Includes:
    - User profile
    - Recent appointments
    - Prescriptions & medications
    - Available doctors in their city
    - Nearby hospitals
    - Available specializations
    """
    try:
        mediczy = get_mediczy_data()
        context = await mediczy.get_full_patient_context(user_id)
        if not context:
            raise HTTPException(status_code=404, detail="Patient not found")
        return {"status": "success", "context": context}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient context {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/patient/{user_id}/appointments")
async def get_patient_appointments(user_id: int, limit: int = 10):
    """Get patient's appointment history."""
    try:
        mediczy = get_mediczy_data()
        appointments = await mediczy.get_user_appointments(user_id, limit)
        return {
            "status": "success",
            "count": len(appointments),
            "appointments": appointments
        }
    except Exception as e:
        logger.error(f"Error fetching appointments for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mediczy/patient/{user_id}/prescriptions")
async def get_patient_prescriptions(user_id: int, limit: int = 10):
    """Get patient's prescription history."""
    try:
        mediczy = get_mediczy_data()
        prescriptions = await mediczy.get_user_prescriptions(user_id, limit)
        return {
            "status": "success",
            "count": len(prescriptions),
            "prescriptions": prescriptions
        }
    except Exception as e:
        logger.error(f"Error fetching prescriptions for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== n8n Webhook Receiver ====================

class N8NWebhookRequest(BaseModel):
    """n8n webhook request model"""
    workflow: str = Field(..., description="Workflow name that triggered this webhook")
    action: str = Field(..., description="Action to perform (trigger_chat, trigger_risk, etc.)")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Workflow payload data")
    timestamp: Optional[str] = Field(None, description="Workflow execution timestamp")
    execution_id: Optional[str] = Field(None, description="n8n execution ID")


@app.post("/webhook/n8n")
async def n8n_webhook_receiver(request: N8NWebhookRequest):
    """
    Receive webhooks from n8n workflows.
    
    Enables bidirectional integration: n8n → SIB
    
    Supported actions:
    - trigger_chat: Trigger a chat response
    - trigger_risk: Run risk assessment
    - trigger_ehr_query: Query EHR knowledge base
    - trigger_task: Create a task
    - trigger_notification: Send notification
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    logger.info(f"📥 n8n webhook received: {request.workflow} -> {request.action}")
    
    try:
        action = request.action
        payload = request.payload
        
        if action == "trigger_chat":
            # n8n triggering a chat response
            result = await app_state.sib.handle_request(
                RequestType.CHAT.value,
                {
                    "patient_id": payload.get("patient_id", "webhook_user"),
                    "message": payload.get("message", ""),
                    "include_rag": payload.get("include_rag", True),
                    "include_risk": payload.get("include_risk", False)
                }
            )
            return {
                "status": "success",
                "action": "chat_triggered",
                "workflow": request.workflow,
                "result": result
            }
        
        elif action == "trigger_risk":
            # n8n requesting risk assessment
            result = await app_state.sib.handle_request(
                RequestType.RISK.value,
                payload.get("patient_data", {})
            )
            return {
                "status": "success",
                "action": "risk_assessed",
                "workflow": request.workflow,
                "result": result
            }
        
        elif action == "trigger_ehr_query":
            # n8n querying EHR knowledge base
            result = await app_state.sib.handle_request(
                RequestType.QUERY.value,
                {
                    "query": payload.get("query", ""),
                    "patient_id": payload.get("patient_id"),
                    "include_risk": payload.get("include_risk", False)
                }
            )
            return {
                "status": "success",
                "action": "ehr_queried",
                "workflow": request.workflow,
                "result": result
            }
        
        elif action == "trigger_task":
            # n8n creating a task
            result = await app_state.sib.handle_request(
                RequestType.TASK.value,
                {
                    "action": "create",
                    "task_data": payload.get("task_data", {})
                }
            )
            return {
                "status": "success",
                "action": "task_created",
                "workflow": request.workflow,
                "result": result
            }
        
        elif action == "trigger_notification":
            # n8n sending a notification
            result = await app_state.sib.handle_request(
                RequestType.NOTIFY.value,
                {
                    "action": "send",
                    "notification_data": payload.get("notification_data", {})
                }
            )
            return {
                "status": "success",
                "action": "notification_sent",
                "workflow": request.workflow,
                "result": result
            }
        
        else:
            return {
                "status": "error",
                "error": f"Unknown action: {action}",
                "supported_actions": [
                    "trigger_chat",
                    "trigger_risk",
                    "trigger_ehr_query",
                    "trigger_task",
                    "trigger_notification"
                ]
            }
    
    except Exception as e:
        logger.error(f"n8n webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== QwenPlanner Endpoints ====================


class PlanRequest(BaseModel):
    """Direct QwenPlanner request — returns the execution plan without running it."""
    request_type: str = Field(..., description="SIB request type (chat, query, triage, etc.)")
    data: Dict[str, Any] = Field(default_factory=dict, description="Request payload")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context")


class AutomateRequest(BaseModel):
    """Unified automation request routed through QwenPlanner → task_router."""
    task_type: str = Field(..., description="Task type: appointment_reschedule, send_reminder, generate_prescription, etc.")
    payload: Dict[str, Any] = Field(default_factory=dict)
    user_id: Optional[str] = None
    patient_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


@app.post("/planner/plan")
async def planner_plan(request: PlanRequest):
    """
    Call QwenPlanner directly and return the execution plan JSON.

    Use this for:
    - Debugging what Qwen plans for a given request
    - Building UI that shows AI reasoning transparency
    - Testing plan quality before full execution
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    try:
        from sib.qwen_planner import get_planner
        planner = get_planner()
        plan = planner.plan(request.request_type, request.data, request.context)
        if plan is None:
            return {
                "status": "unavailable",
                "message": "Qwen model not loaded — planner inactive",
                "fallback": "hardcoded routing will be used",
            }
        return {
            "status": "ok",
            "intent": plan.intent,
            "urgency": plan.urgency,
            "steps": [
                {
                    "step": s.step,
                    "botlet": s.botlet,
                    "action": s.action,
                    "params": s.params,
                    "depends_on": s.depends_on,
                }
                for s in plan.steps
            ],
            "parallel_groups": plan.parallel_groups,
            "synthesis_step": plan.synthesis_step,
            "reasoning": plan.reasoning,
        }
    except Exception as e:
        logger.error(f"/planner/plan error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/planner/status")
async def planner_status():
    """
    Intent router status.

    ITEM-24: Qwen 2.5-3B GGUF replaced by regex classifier.
    Returns classifier rule count and routing capabilities.
    """
    try:
        from sib.tinyllama_router import get_router, INTENT_RULES

        router = get_router()

        return {
            "classifier": "regex",
            "classifier_rules": len(INTENT_RULES),
            "qwen_loaded": False,                  # ITEM-24: Qwen removed
            "model_path": router.model_path,       # retained for reference
            "model_profile": os.environ.get("ROUTER_MODEL_PROFILE", "balanced"),
            "planner_active": True,                # regex classifier is always active
            "fallback_routing": False,
            "item_24": "Qwen 2.5-3B GGUF planner replaced by INTENT_RULES regex classifier",
            "commandable_botlets": [
                "chat", "ehr", "risk", "summarizer", "task",
                "notification", "insurance", "web_search",
                "triage", "drug_check", "knowledge", "local",
            ],
            "llm_backends": ["isha_gpu", "groq", "gemini"],
            "automation_routes": [
                "appointment_schedule", "appointment_reschedule", "appointment_cancel",
                "generate_prescription", "review_prescription",
                "send_reminder", "send_notification",
                "health_diary_add", "health_diary_update",
                "assess_risk", "detect_emergency", "process_ehr",
            ],
        }
    except Exception as e:
        logger.error(f"/planner/status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/automate")
async def automate_task(request: AutomateRequest):
    """
    Unified automation endpoint — routes through QwenPlanner → SIBTaskRouter.

    All automation flows (appointments, prescriptions, reminders, diary, risk, emergency)
    run through this single endpoint. Qwen plans the task chain; SIBTaskRouter executes it.

    Supported task_type values:
    - appointment_reschedule, appointment_cancel, appointment_schedule
    - generate_prescription, review_prescription
    - send_reminder, send_notification
    - health_diary_add, health_diary_update
    - assess_risk, detect_emergency, process_ehr
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")

    try:
        from sib.task_router import TaskType, get_task_router

        task_type_map = {
            "appointment_schedule":   "schedule_appointment",
            "appointment_reschedule": "reschedule_appointment",
            "appointment_cancel":     "cancel_appointment",
            "generate_prescription":  "generate_prescription",
            "review_prescription":    "review_prescription",
            "send_reminder":          "send_reminder",
            "send_notification":      "send_notification",
            "health_diary_add":       "add_health_diary_entry",
            "health_diary_update":    "update_health_diary",
            "assess_risk":            "assess_risk",
            "detect_emergency":       "detect_emergency",
            "process_ehr":            "process_ehr",
        }

        task_type_str = task_type_map.get(request.task_type.lower(), request.task_type.lower())
        try:
            task_type = TaskType(task_type_str)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown task_type: {request.task_type}")

        router = get_task_router(app_state.db)
        result = await router.route_task(
            task_type=task_type,
            payload=request.payload,
            user_id=request.user_id,
            patient_id=request.patient_id,
            context=request.context,
        )

        return {
            "success": result.status.value == "completed",
            "task_type": result.task_type.value,
            "status": result.status.value,
            "data": result.data,
            "error": result.error,
            "timestamp": result.timestamp,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/automate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Quantum Brain Endpoints ====================


class QuantumDiagnoseRequest(BaseModel):
    chief_complaint: str = Field(..., description="Presenting complaint (chest_pain, dyspnea, etc.)")
    findings: List[str] = Field(default_factory=list, description="Present clinical findings")
    absent_findings: List[str] = Field(default_factory=list, description="Explicitly absent findings")
    risk_factors: List[str] = Field(default_factory=list, description="Background risk factors")
    age: Optional[int] = None
    sex: Optional[str] = None
    confirmed_diagnosis: Optional[str] = Field(None, description="Collapse state on confirmed dx")
    explain: bool = Field(True, description="Include human-readable explanation")


@app.post("/quantum/diagnose")
async def quantum_diagnose(request: QuantumDiagnoseRequest):
    """
    Quantum Bayesian Differential Diagnosis.

    Applies quantum probability theory to differential diagnosis:
    - Initializes a superposition of candidate diagnoses from the chief complaint
    - Updates amplitudes using the Lüders rule (√LR, not LR) for each finding
    - Applies constructive/destructive interference between diagnosis pairs
    - Returns ranked differential with Born-rule probabilities and entropy metric

    Clinically meaningful entropy:
      - High entropy (>3 bits): genuinely uncertain, more workup needed
      - Low entropy (<1 bit):   diagnosis strongly favoured, consider confirmation
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    try:
        result = await app_state.sib.qbr_bot.diagnose(request.model_dump())
        if not request.explain:
            result.pop("explanation", None)
        return result
    except Exception as e:
        logger.error(f"/quantum/diagnose error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/quantum/findings")
async def quantum_known_findings():
    """Return all clinical findings recognized by the Quantum Bayesian Reasoner."""
    from sib.quantum_brain import get_qbr
    return {"findings": get_qbr().list_known_findings(), "count": len(get_qbr().list_known_findings())}


# ==================== Synthetic Intelligence Endpoints ====================


@app.get("/synthetic/analytics")
async def synthetic_analytics(window: int = 500):
    """
    Synthetic Intelligence self-assessment report.

    Returns:
      - health_score (0–100): overall AI system health
      - analytics: latency, confidence, error rates by provider/intent/urgency
      - degraded_providers: backends showing high error rates or latency
      - insights: human-readable observations from outcome patterns
      - recommendations: actionable items for operators
      - trend: whether performance is improving or degrading
    """
    from sib.synthetic_intelligence import get_adaptive_brain
    brain = get_adaptive_brain()
    return brain.get_intelligence_report()


@app.get("/synthetic/urgency-latency")
async def synthetic_urgency_latency():
    """
    Urgency vs. latency correlation.
    Emergency queries should be served faster than low-urgency queries.
    Returns avg latency per urgency level for monitoring.
    """
    from sib.synthetic_intelligence import get_adaptive_brain
    return {"urgency_latency_ms": get_adaptive_brain().urgency_latency_correlation()}


@app.get("/synthetic/provider/{intent}")
async def synthetic_best_provider(intent: str):
    """
    Return the historically best LLM provider for a given intent class.
    Used by the adaptive brain to reorder the fallback chain per intent.
    """
    from sib.synthetic_intelligence import get_adaptive_brain
    provider = get_adaptive_brain().recommended_provider_order(intent)
    return {"intent": intent, "recommended_order": provider or "default_fallback_chain"}


# ==================== Background Scheduler ====================


# ==================== Stats Endpoint ====================

# ── Embedding model singletons (loaded once, stay warm) ──────────────────────
# S-PubMedBert: used for /embed endpoint → ai_document_chunks (new ingested docs)
# Note: medical_embeddings (10K rows) uses Xenova/LaBSE from Node.js ingest — queried
#       by rag-pipeline.js on the Node.js side. SIB Python uses S-PubMedBert only.
_embed_model = None       # S-PubMedBert-MS-MARCO, 768-dim

def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        _embed_model = SentenceTransformer("pritamdeka/S-PubMedBert-MS-MARCO")
        logger.info("✅ S-PubMedBert-MS-MARCO loaded for /embed")
    return _embed_model


@app.post("/embed")
async def embed_texts(request: EmbedRequest):
    """
    Generate 768-dim ClinicalBERT (S-PubMedBert) embeddings.

    Called by rag-pipeline.js for document ingestion and query vectorisation.
    Returns float32 vectors that match the pgvector dimension of
    ai_document_chunks, sib_embeddings, and medical_embeddings.
    """
    if not request.texts:
        raise HTTPException(status_code=400, detail="'texts' list is empty")
    try:
        model = _get_embed_model()
        vecs = await asyncio.to_thread(model.encode, request.texts, convert_to_numpy=True, show_progress_bar=False)
        return {"embeddings": vecs.tolist(), "model": "S-PubMedBert-MS-MARCO", "dimension": 768}
    except Exception as e:
        logger.error(f"/embed error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest")
async def ingest_document(request: IngestDocumentRequest):
    """
    Ingest a knowledge document into the pgvector knowledge base.

    Chunks the text → embeds with S-PubMedBert → stores in ai_document_chunks.
    Used for IRDAI circulars, WHO guidelines, insurance PDFs, etc.

    Nightly cron / n8n workflows POST here to keep the KB current.
    """
    if not app_state.db:
        raise HTTPException(status_code=503, detail="Database not initialised")

    CHUNK_WORDS = 300
    OVERLAP_WORDS = 40

    words = request.text.split()
    if len(words) < 10:
        raise HTTPException(status_code=400, detail="Text too short to index")

    # Build overlapping chunks
    step = CHUNK_WORDS - OVERLAP_WORDS
    raw_chunks = []
    for i in range(0, len(words), step):
        chunk = " ".join(words[i: i + CHUNK_WORDS])
        if len(chunk.strip()) > 30:
            raw_chunks.append(chunk.strip())
        if i + CHUNK_WORDS >= len(words):
            break

    try:
        db = app_state.db
        model = _get_embed_model()

        doc_meta = _json.dumps({"source": request.source})

        # Insert parent document record
        async with db.pg_pool.acquire() as conn:
            doc_row = await conn.fetchrow(
                """INSERT INTO ai_knowledge_documents
                     (title, category, scope, scope_id, metadata, status, updated_at)
                   VALUES ($1, $2, $3, $4, $5::jsonb, 'processing', NOW())
                   RETURNING id""",
                request.title, request.category, request.scope, request.scope_id, doc_meta
            )

        doc_id = doc_row["id"]

        # Embed all chunks in batch (off event loop — model.encode is CPU-bound)
        vecs = await asyncio.to_thread(model.encode, raw_chunks, convert_to_numpy=True, show_progress_bar=False)

        # Store all chunks + mark ready in one connection — vector as SQL literal bypasses type introspection
        async with db.pg_pool.acquire(timeout=20) as conn:
            for idx, (chunk, vec) in enumerate(zip(raw_chunks, vecs)):
                vec_literal = f"[{','.join(str(round(float(v), 6)) for v in vec)}]"
                token_count = math.ceil(len(chunk.split()) / 0.75)
                await conn.execute(
                    f"""INSERT INTO ai_document_chunks
                          (document_id, chunk_index, content, token_count, embedding, metadata)
                        VALUES ($1, $2, $3, $4, '{vec_literal}'::vector, $5)""",
                    doc_id, idx, chunk, token_count,
                    '{"ingestedBy":"sib-ingest"}',
                    timeout=20
                )
            await conn.execute(
                "UPDATE ai_knowledge_documents SET status='ready', chunk_count=$1, updated_at=NOW() WHERE id=$2",
                len(raw_chunks), doc_id
            )

        logger.info(f"✅ Ingested '{request.title}': {len(raw_chunks)} chunks, doc_id={doc_id}")
        return {
            "status": "ok",
            "document_id": doc_id,
            "title": request.title,
            "chunks": len(raw_chunks),
            "category": request.category,
        }

    except Exception as e:
        logger.error(f"/ingest error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e) or type(e).__name__)


@app.post("/rag/search")
async def rag_search(query: str, top_k: int = 6, category: Optional[str] = None):
    """
    pgvector semantic search across all knowledge tables.

    Queries in parallel:
      - ai_document_chunks  (ingested guidelines, IRDAI, etc.)
      - medical_embeddings  (10K medical Q&A from HuggingFace)
      - sib_embeddings      (EHR history)

    Returns merged, re-ranked results by cosine similarity.
    Used internally by /knowledge/search and the UW chat RAG enrichment.
    """
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="'query' is required")
    if not app_state.db:
        raise HTTPException(status_code=503, detail="Database not initialised")

    try:
        # S-PubMedBert — used by SIB /ingest endpoint for all new documents
        q_enc = await asyncio.to_thread(_get_embed_model().encode, [query], convert_to_numpy=True, show_progress_bar=False)
        q_vec = q_enc[0]
        vec_str = f"[{','.join(str(round(float(v), 6)) for v in q_vec)}]"

        # Note: medical_embeddings uses Xenova/LaBSE (Node.js ingest) — incompatible vector space.
        # That table is queried by rag-pipeline.js on the Node.js side; skip it here.
        cat_filter = "AND d.category = $3" if category else ""

        async def _q(sql, *params):
            async with app_state.db.pg_pool.acquire(timeout=20) as c:
                return await c.fetch(sql, *params, timeout=20)

        # Only ai_document_chunks uses S-PubMedBert (ingested via /ingest).
        # sib_embeddings and medical_embeddings use different models — queried by Node.js rag-pipeline.
        # Vector embedded as SQL literal to bypass asyncpg type-introspection timeout on pgvector type.
        cat_clause = f"AND d.category = $2" if category else ""
        cat_params  = [category] if category else []
        limit_param = top_k * 2

        async with app_state.db.pg_pool.acquire(timeout=20) as conn:
            rows = await conn.fetch(
                f"""SELECT c.content,
                           1 - (c.embedding <=> '{vec_str}'::vector) AS score,
                           d.title AS doc_title, d.category,
                           d.metadata->>'source' AS source,
                           'knowledge_base' AS table_source
                    FROM ai_document_chunks c
                    JOIN ai_knowledge_documents d ON d.id = c.document_id
                    WHERE d.status = 'ready' {cat_clause}
                    ORDER BY c.embedding <=> '{vec_str}'::vector
                    LIMIT {limit_param}
                """, *cat_params, timeout=20
            )

        all_rows = list(rows)

        MIN_SCORE = 0.30
        merged = sorted(
            [r for r in all_rows if (r["score"] or 0) >= MIN_SCORE],
            key=lambda r: r["score"],
            reverse=True
        )[:top_k]

        return {
            "query": query,
            "results": [
                {
                    "content": r["content"],
                    "score": round(float(r["score"]), 4),
                    "doc_title": r["doc_title"],
                    "category": r["category"],
                    "source": r["source"],
                    "from": r["table_source"],
                }
                for r in merged
            ],
            "retrieved": len(merged),
        }

    except Exception as e:
        logger.error(f"/rag/search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/retrieve")
async def rag_retrieve(
    query: str,
    patient_id: Optional[str] = None,
    k: int = 5,
    category: Optional[str] = None,
):
    """
    Unified RAG retrieval across all SIB vector stores.

    Queries ai_document_chunks (S-PubMedBert) and sib_embeddings (Bio_ClinicalBERT)
    in parallel, merges by cosine score, and returns top-k deduplicated chunks.
    Supersedes /rag/search for EHR-aware retrieval.
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    try:
        from sib.retrieval.unified_rag import get_unified_rag
        rag = get_unified_rag()
        chunks = await rag.retrieve(query, patient_id=patient_id, k=k, category=category)
        return {
            "query": query,
            "patient_id": patient_id,
            "category": category,
            "results": rag.to_dict_list(chunks),
            "retrieved": len(chunks),
            "context_string": rag.to_context_string(chunks),
        }
    except Exception as e:
        logger.error(f"/rag/retrieve error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/kb/refresh")
async def refresh_knowledge_base():
    """
    Nightly knowledge base refresh — fetches recent medical/IRDAI updates
    and ingests them as new documents.

    Called by cron or n8n workflow at 02:00 IST daily.
    Sources:
      - IRDAI circulars search (web)
      - WHO India health advisories (web)
    """
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialised")

    refresh_queries = [
        ("IRDAI health insurance circular 2025 2026 India guidelines", "insurance", "irdai"),
        ("WHO India health advisory 2025 disease outbreak", "clinical", "who"),
        ("group mediclaim policy IRDAI standardisation India", "insurance", "irdai"),
        ("NABH hospital accreditation standards India clinical protocol", "clinical", "nabh"),
    ]

    ingested = []
    errors = []

    try:
        web_bot = app_state.sib.web_search_bot

        for search_q, category, source_label in refresh_queries:
            try:
                web_result = web_bot.search(search_q, max_results=3)
                if asyncio.iscoroutine(web_result):
                    web_result = await web_result
                results = web_result.get("results", [])
                for r in results:
                    snippet = r.get("snippet") or r.get("description") or ""
                    title   = r.get("title", search_q[:80])
                    if len(snippet) < 80:
                        continue
                    # Build mini document from title + snippet
                    doc_text = f"{title}\n\n{snippet}"

                    # Embed + store (reuse ingest logic directly)
                    words = doc_text.split()
                    if len(words) < 15:
                        continue

                    model = _get_embed_model()
                    enc_result = await asyncio.to_thread(model.encode, [doc_text], convert_to_numpy=True, show_progress_bar=False)
                    vec = enc_result[0]
                    vec_str = f"[{','.join(str(round(float(v), 6)) for v in vec)}]"

                    ref_meta = _json.dumps({"source": source_label, "via": "kb_refresh"})

                    async with app_state.db.pg_pool.acquire() as conn:
                        existing = await conn.fetchval(
                            "SELECT id FROM ai_knowledge_documents WHERE title = $1 AND metadata->>'source' = $2",
                            title[:255], source_label
                        )
                        if existing:
                            continue  # already indexed

                        doc_id = await conn.fetchval(
                            """INSERT INTO ai_knowledge_documents
                                 (title, category, scope, metadata, status, updated_at)
                               VALUES ($1, $2, 'global', $3::jsonb, 'ready', NOW())
                               RETURNING id""",
                            title[:255], category, ref_meta
                        )
                        await conn.execute(
                            f"""INSERT INTO ai_document_chunks
                                  (document_id, chunk_index, content, token_count, embedding, metadata)
                                VALUES ($1, 0, $2, $3, '{vec_str}'::vector, $4::jsonb)""",
                            doc_id, doc_text, len(words), ref_meta,
                            timeout=20
                        )
                        ingested.append({"title": title, "category": category, "source": source_label})

            except Exception as e:
                errors.append(f"{search_q[:40]}: {str(e)[:100]}")

        logger.info(f"✅ KB refresh: {len(ingested)} new documents ingested")
        return {
            "status": "ok",
            "ingested": len(ingested),
            "documents": ingested,
            "errors": errors,
        }

    except Exception as e:
        logger.error(f"/kb/refresh error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
async def get_stats():
    """Get comprehensive SIB statistics"""
    if not app_state.sib:
        raise HTTPException(status_code=503, detail="SIB not initialized")
    
    return {
        "sib": app_state.sib.get_status(),
        "memory": app_state.sib.memory.get_stats(),
        "botlets": {
            "chat": app_state.sib.chat_bot.get_stats() if app_state.sib._chat_bot else None,
            "ehr": app_state.sib.ehr_bot.get_stats() if app_state.sib._ehr_bot else None,
            "risk": app_state.sib.risk_bot.get_stats() if app_state.sib._risk_bot else None,
            "summarizer": app_state.sib.summarizer_bot.get_stats() if app_state.sib._summarizer_bot else None,
            "task": app_state.sib.task_bot.get_stats() if app_state.sib._task_bot else None,
            "notification": app_state.sib.notification_bot.get_stats() if app_state.sib._notification_bot else None,
            "insurance": app_state.sib.insurance_bot.get_stats() if app_state.sib._insurance_bot else None
        }
    }


# ==================== Standalone Scheduler ====================

def run_scheduler():
    """
    Run the SIB background scheduler as a standalone process.
    Used by PM2 sib-scheduler process.
    
    This handles:
    - EHR file ingestion (every 30 seconds)
    - Notification processing (every 60 seconds)
    - Memory cleanup (every 5 minutes)
    """
    try:
        from apscheduler.schedulers.blocking import BlockingScheduler
        
        scheduler = BlockingScheduler()
        
        # Initialize SIB for scheduler tasks
        sib = get_sib()
        
        def ingest_ehr_files():
            """Ingest new EHR files from inbox"""
            try:
                result = sib.handle_request(RequestType.EHR_INGEST, {
                    "action": "ingest_inbox"
                })
                if result.get("ingested_count", 0) > 0:
                    logger.info(f"📁 Ingested {result['ingested_count']} EHR files")
            except Exception as e:
                logger.error(f"EHR ingestion error: {e}")
        
        def process_notifications():
            """Process scheduled notifications"""
            try:
                result = sib.handle_request(RequestType.NOTIFICATION, {
                    "action": "process_scheduled"
                })
                if result.get("processed_count", 0) > 0:
                    logger.info(f"📬 Processed {result['processed_count']} notifications")
            except Exception as e:
                logger.error(f"Notification processing error: {e}")
        
        def cleanup_memory():
            """Clean up stale memory entries"""
            try:
                sib.memory.cleanup_stale_sessions()
                logger.info("🧹 Memory cleanup completed")
            except Exception as e:
                logger.error(f"Memory cleanup error: {e}")
        
        # Add jobs
        scheduler.add_job(ingest_ehr_files, 'interval', seconds=30, id='ehr_ingestion')
        scheduler.add_job(process_notifications, 'interval', seconds=60, id='notification_processing')
        scheduler.add_job(cleanup_memory, 'interval', minutes=5, id='memory_cleanup')
        
        logger.info("🕐 SIB Scheduler started with jobs: EHR ingestion, notifications, memory cleanup")
        
        scheduler.start()
        
    except KeyboardInterrupt:
        logger.info("🛑 Scheduler stopped by user")
    except Exception as e:
        logger.error(f"Scheduler error: {e}")
        raise


# ==================== Main ====================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("SIB_PORT", os.environ.get("DR_ISHA_PORT", 8001)))
    host = os.environ.get("SIB_HOST", os.environ.get("DR_ISHA_HOST", "0.0.0.0"))
    
    logger.info(f"🧠 Starting SIB-powered Dr. iSHA on {host}:{port}")
    
    uvicorn.run(
        "sib_app:app",
        host=host,
        port=port,
        reload=False,
        workers=1,
        log_level="info"
    )
