"""
Dr. iSHA Doctor Bot - FastAPI Backend
=====================================

Production-ready multi-role medical AI system:
- Chat & Q&A with RAG
- EHR processing & real-time ingestion (PDF/HL7/TXT)
- Risk scoring & probabilistic reasoning
- Task prioritization & treatment planning
- Low-latency CPU-friendly pipeline

Expected latency per query: ~250-350ms
- Retrieval: 10-20ms
- LLM: 150-200ms
- Bayesian Network: <5ms
- Pre/post-processing: ~50ms

Run with: uvicorn app:app --host 0.0.0.0 --port 8001
"""

import os
import sys
import time
import logging
import warnings
from typing import Dict, List, Any, Optional
from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager
from functools import lru_cache
import asyncio

# User context cache: bounded LRU + TTL (max 500 entries, 5-minute TTL)
from collections import OrderedDict
import threading

class _BoundedTTLCache:
    """Thread-safe LRU cache with TTL and max-size eviction."""
    def __init__(self, maxsize: int = 500, ttl: int = 300):
        self._cache: OrderedDict = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl
        self._lock = threading.Lock()

    def get(self, key: str):
        with self._lock:
            if key not in self._cache:
                return None
            ts, value = self._cache[key]
            if (time.time() - ts) > self._ttl:
                del self._cache[key]
                return None
            self._cache.move_to_end(key)
            return value

    def set(self, key: str, value):
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = (time.time(), value)
            while len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)

    def delete(self, key: str):
        with self._lock:
            self._cache.pop(key, None)

    def __len__(self):
        return len(self._cache)

USER_CONTEXT_CACHE = _BoundedTTLCache(maxsize=500, ttl=300)
CONTEXT_CACHE_TTL = 300  # kept for compatibility

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("dr_isha")

# Suppress noisy third-party warnings that spam the error log
warnings.filterwarnings("ignore", message=r'.*not a eligible syntax.*')
warnings.filterwarnings("ignore", category=UserWarning, module="spacy")
logging.getLogger("root").setLevel(logging.WARNING)  # suppress spaCy root INFO noise

# FastAPI imports
try:
    from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse
    from pydantic import BaseModel, Field
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    logger.error("❌ FastAPI not installed. Run: pip install fastapi uvicorn")

# Import utilities
try:
    from utils.retrieval_llm import generate_answer, stream_answer, retrieve
    from utils.bayesian_network import bn_inference, get_full_assessment
    from utils.safety_filter import filter_dosages, detect_emergencies, safety_check, validate_response
    from utils.risk_scoring import calculate_all_risks, from_dict as profile_from_dict
    from utils.preprocess import process_ehr, process_all_ehr
    from utils.embed_store import embed_and_store, get_stats as get_index_stats, load_index
    UTILS_AVAILABLE = True
    logger.info("✅ Core utilities loaded")
except ImportError as e:
    UTILS_AVAILABLE = False
    logger.warning(f"⚠️ Some utilities not available: {e}")

# Import real-time ingestion
try:
    from utils.real_time_ingest import (
        ingest_new_files, 
        ingest_single_file, 
        get_ingestion_status,
        reset_ingestion,
        extract_text
    )
    INGEST_AVAILABLE = True
    logger.info("✅ Real-time ingestion loaded")
except ImportError as e:
    INGEST_AVAILABLE = False
    logger.warning(f"⚠️ Real-time ingestion not available: {e}")


# ==================== Prescription Guardrail ====================

import re

def filter_prescription_language(text: str) -> str:
    """
    Filter out prescription/dosage recommendations from AI responses.
    Replace with educational info and doctor referral.
    """
    # First check if this is asking "what is X used for" (educational)
    # In that case, allow medicine names in explanation context
    
    # Patterns for prescription language that must be blocked
    prescription_patterns = [
        # Direct medication recommendations
        (r"(?:take|use)\s+(?:acetaminophen|paracetamol|ibuprofen|aspirin|tylenol|advil|motrin)(?:\s+\([\w\s]+\))?",
         "consult a licensed physician for appropriate medication"),
        
        # "Can help" with medicine names
        (r"(?:acetaminophen|paracetamol|ibuprofen|aspirin|tylenol|advil|motrin)(?:\s+\([\w\s]+\))?\s+(?:can|may|will|could)\s+help",
         "a licensed physician can recommend appropriate medication"),
        
        # "Like acetaminophen" patterns
        (r"(?:medications?\s+)?(?:like|such as|including)\s+(?:acetaminophen|paracetamol|ibuprofen|aspirin|tylenol|advil|motrin)",
         "over-the-counter medications (consult a physician for specific recommendations)"),
        
        # Dosage mentions
        (r"\d+\s*(?:mg|ml|mcg|tablets?|pills?)\s+(?:of\s+)?[\w-]+",
         "[specific dosing requires physician consultation]"),
    ]
    
    filtered = text
    made_changes = False
    
    for pattern, replacement in prescription_patterns:
        if re.search(pattern, filtered, re.IGNORECASE):
            filtered = re.sub(pattern, replacement, filtered, flags=re.IGNORECASE)
            made_changes = True
            logger.info(f"🚫 Filtered prescription language: {pattern}")
    
    # If we made changes, add disclaimer
    if made_changes:
        if "cannot prescribe" not in filtered.lower() and "consult" not in filtered.lower():
            filtered += "\n\n🚫 Important: I cannot prescribe medications. Please consult a licensed physician who can examine you and provide appropriate treatment."
    
    # Fallback: if response still contains medicine names in non-educational context
    medicine_names = r'\b(acetaminophen|paracetamol|ibuprofen|aspirin|tylenol|advil|motrin)\b'
    if re.search(medicine_names, filtered, re.IGNORECASE):
        # Check if it's educational (contains "used for" or "is a medication")
        if not re.search(r'(?:used for|is a|is an|medication that)', filtered, re.IGNORECASE):
            logger.warning(f"⚠️ Medicine names detected in non-educational context")
            if "cannot recommend specific medications" not in filtered:
                filtered = "I cannot recommend specific medications. Please consult a licensed physician who can examine you and prescribe appropriate treatment. Would you like me to help book a doctor's appointment?"
    
    return filtered


# ==================== Pydantic Models ====================

class Query(BaseModel):
    """Query request model"""
    question: str = Field(..., description="Medical question")
    patient_data: Optional[Dict[str, Any]] = Field(None, description="Patient health data for BN inference")
    use_biomedix: bool = Field(False, description="Use BiMediX2 model")
    include_context: bool = Field(True, description="Include RAG context")
    auto_ingest: bool = Field(False, description="Auto-ingest new EHR files before query")


class TranslateRequest(BaseModel):
    """Translation request — used by AI Scribe and other Node.js callers."""
    text: str = Field(..., description="Text to translate")
    source_lang: Optional[str] = Field("auto", description="Source language code (auto to detect)")
    target_lang: Optional[str] = Field("en", description="Target language code")


class RiskRequest(BaseModel):
    """Risk assessment request"""
    age: int = Field(..., ge=20, le=100)
    sex: str = Field(..., pattern="^(male|female)$")
    systolic_bp: float = Field(..., ge=70, le=250)
    total_cholesterol: Optional[float] = Field(None, ge=100, le=400)
    hdl_cholesterol: Optional[float] = Field(None, ge=20, le=100)
    smoker: bool = False
    diabetic: bool = False
    on_bp_treatment: bool = False


class ProcessRequest(BaseModel):
    """EHR processing request"""
    text: str = Field(..., description="EHR text content")
    patient_id: Optional[str] = None


# ==================== Application State ====================

class AppState:
    """Application state with PostgreSQL integration"""
    def __init__(self):
        self.start_time = datetime.now()
        self.initialized = False
        self.warmup_complete = False
        self.request_count = 0
        self.db = None  # PostgreSQL DatabaseManager
    
    async def initialize(self):
        """Initialize fast components - skip heavy warmup for faster startup"""
        logger.info("🚀 Initializing Dr. iSHA...")
        
        # API keys must be set via environment variables — never hardcoded
        # Set in /home/ubuntu/Mediczy/server/.env or AWS Secrets Manager
        if not os.environ.get("GROQ_API_KEY"):
            logger.warning("⚠️  GROQ_API_KEY not set — Groq LLM calls will fail")
        if not os.environ.get("GEMINI_API_KEY"):
            logger.warning("⚠️  GEMINI_API_KEY not set — Gemini calls will fail")
        
        # Initialize PostgreSQL connection (fast, ~1s)
        try:
            from sib.database import DatabaseManager
            self.db = DatabaseManager()
            await self.db.connect()
            logger.info("✅ PostgreSQL connected for user context & history")
        except Exception as e:
            logger.warning(f"⚠️ PostgreSQL connection failed: {e}")
            self.db = None
        
        # NOTE: ClinicalBERT warmup moved to background task to avoid port binding issues
        # The warmup will happen after server starts listening
        
        self.initialized = True
        logger.info("✅ Dr. iSHA initialized (ClinicalBERT will warm up in background)")
    
    def do_background_warmup(self):
        """Heavy warmup - runs in background after server starts"""
        if self.warmup_complete:
            return
        try:
            from utils.pgvector_store import warmup
            warmup()
            self.warmup_complete = True
        except Exception as e:
            logger.warning(f"⚠️ pgvector warmup failed: {e}")


app_state = AppState()


async def _retrieve_unified_context(query: str, patient_id: Optional[str] = None,
                                    k: int = 6) -> tuple:
    """Retrieve knowledge-fabric context and, only when authorized, EHR chunks.

    The production SIB process owns the asyncpg pool.  Reusing that pool keeps
    retrieval cheap and makes the patient-id filter explicit at the boundary.
    ``UnifiedRAGRetriever`` itself refuses EHR retrieval without a patient id.
    """
    try:
        pool = getattr(app_state.db, "pg_pool", None) if app_state.db else None
        from sib.retrieval.unified_rag import get_unified_rag
        retriever = get_unified_rag(pool)
        chunks = await retriever.retrieve(query, patient_id=patient_id, k=k)
        return chunks, retriever.to_context_string(chunks)
    except Exception as exc:
        logger.warning("Unified RAG unavailable: %s", exc)
        return [], ""


async def _has_authoritative_ai_consent(user_id: Optional[str]) -> bool:
    """Check the platform consent table; never trust a request flag for PHI."""
    if not user_id or not app_state.db or not getattr(app_state.db, "pg_pool", None):
        return False
    try:
        async with app_state.db.pg_pool.acquire(timeout=5) as conn:
            granted = await conn.fetchval(
                """SELECT 1
                   FROM consent_records
                  WHERE patient_id::text = $1
                    AND purpose = 'ai_analysis'
                    AND status = 'active'
                    AND (expires_at IS NULL OR expires_at > NOW())
                  LIMIT 1""",
                str(user_id),
            )
        return bool(granted)
    except Exception as exc:
        logger.warning("Authoritative AI consent check failed: %s", exc)
        return False


# ==================== Lifespan ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    await app_state.initialize()
    
    # Start background warmup AFTER server binds port
    import asyncio
    import threading
    
    def background_warmup():
        """Run warmup in background thread after server starts"""
        import time
        time.sleep(2)  # Wait for server to fully start
        logger.info("🔥 Starting background ClinicalBERT warmup...")
        app_state.do_background_warmup()
    
    warmup_thread = threading.Thread(target=background_warmup, daemon=True)
    warmup_thread.start()
    
    yield
    # Cleanup
    if app_state.db:
        await app_state.db.close()
    logger.info("👋 Shutting down Dr. iSHA...")


# ==================== FastAPI App ====================

# ── Shared platform health probe ──────────────────────────────────────────────
try:
    import sys as _sys
    from pathlib import Path as _Path
    _sys.path.insert(0, str(_Path(__file__).resolve().parents[2]))
    from ai_platform.health.probe import build_health_response as _build_health
    _PLATFORM_HEALTH_AVAILABLE = True
except ImportError:
    _PLATFORM_HEALTH_AVAILABLE = False

SIB_PORT = int(os.getenv("SIB_PORT", "8001"))

app = FastAPI(
    title="Dr. iSHA - AI Medical Assistant",
    description="""
    Multi-role medical AI system with:
    - RAG-based Q&A (Llama-3.1 + BiMediX)
    - Bayesian Network reasoning
    - CVD risk scoring
    - EHR processing
    - Safety filtering
    
    Optimized for 4-core CPU + 16GB RAM.
    Expected latency: 250-350ms per query.
    """,
    version="1.0.0",
    lifespan=lifespan
) if FASTAPI_AVAILABLE else None

# CORS — restrict to known origins; never wildcard in production
_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get(
    "SIB_ALLOWED_ORIGINS",
    "http://localhost:8888,http://localhost:9443,https://mediczy.in,https://mediqzy.com,https://api.mediczy.in"
).split(",") if o.strip()]

if app:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    )
    
    # Include Feedback & Learning API router
    try:
        from sib.api.feedback_api import router as feedback_router
        app.include_router(feedback_router, prefix="/api")
        logger.info("✅ Feedback API router loaded")
    except ImportError as e:
        logger.warning(f"⚠️ Could not load feedback router: {e}")


# ==================== Endpoints ====================

@app.post("/embed")
async def embed_text(request: Dict[str, Any]):
    """Generate ClinicalBERT embeddings for text(s).
    
    Body: { "texts": ["text1", "text2", ...] } or { "text": "single text" }
    Returns: { "embeddings": [[0.1, 0.2, ...], ...], "dimension": 768, "model": "ClinicalBERT" }
    """
    from fastapi.responses import JSONResponse
    from utils.pgvector_store import _get_embed_model
    
    texts = request.get("texts") or ([request.get("text")] if request.get("text") else None)
    if not texts:
        return JSONResponse(status_code=400, content={"error": "Provide 'text' or 'texts' field"})
    
    model = _get_embed_model()
    if model is None:
        return JSONResponse(status_code=503, content={"error": "Embedding model not loaded"})
    
    embeddings = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
    return {
        "embeddings": [e.tolist() for e in embeddings],
        "dimension": len(embeddings[0]),
        "model": "Bio_ClinicalBERT",
        "count": len(texts)
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Dr. iSHA - AI Medical Assistant",
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    """Health check"""
    uptime = (datetime.now() - app_state.start_time).total_seconds()
    
    stats = None
    if UTILS_AVAILABLE:
        try:
            stats = get_index_stats()
        except:
            pass
    
    return {
        "status": "healthy" if app_state.initialized else "initializing",
        "uptime_seconds": round(uptime, 2),
        "request_count": app_state.request_count,
        "index_stats": stats
    }


@app.get("/platform-health", tags=["platform"])
async def platform_health_check():
    """Standardised health endpoint consumed by ai-platform gateway and load balancer."""
    status = "healthy" if app_state.initialized else "initializing"
    if _PLATFORM_HEALTH_AVAILABLE:
        return _build_health("sib-fastapi", "1.0.0", SIB_PORT,
                             {"index": {"status": status},
                              "requests": {"count": app_state.request_count, "status": "healthy"}})
    return {"status": status, "service": "sib-fastapi"}


@app.delete("/chat/{patient_id}")
async def delete_chat_history(patient_id: str, request: Request):
    """
    GDPR Art. 17 / DPDP §10 — Right to Erasure.
    Deletes all AI conversation history for a patient.
    Requires Authorization header (validated against user ID).
    """
    from fastapi.responses import JSONResponse

    # Minimal token validation — check caller owns this patient_id
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    if not token:
        return JSONResponse(status_code=401, content={"error": "Authorization required"})

    if not app_state.db:
        return JSONResponse(status_code=503, content={"error": "Database unavailable"})

    try:
        await app_state.db.clear_chat_history(patient_id)

        # Evict from context cache
        USER_CONTEXT_CACHE.delete(f"ctx_{patient_id}")

        # Also attempt to delete pgvector embeddings for this patient
        try:
            from utils.pgvector_store import _db_conn
            with _db_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "DELETE FROM sib_embeddings WHERE source_id = %s AND source_type = 'ehr'",
                        (patient_id,)
                    )
                conn.commit()
        except Exception as emb_err:
            logger.warning(f"⚠️ Could not delete embeddings for {patient_id}: {emb_err}")

        logger.info(f"🗑️ GDPR erasure: deleted chat history for patient_id={patient_id[:8]}...")
        return {
            "status": "deleted",
            "patient_id": patient_id,
            "timestamp": datetime.now().isoformat(),
            "regulation": "GDPR Art. 17 / DPDP §10"
        }
    except Exception as e:
        logger.error(f"❌ GDPR erasure failed for {patient_id[:8]}: {e}")
        return JSONResponse(status_code=500, content={"error": "Erasure failed", "detail": str(e)})


@app.get("/languages")
async def list_languages():
    """
    List all supported Indian languages for Dr. iSHA chat.
    Frontend uses this to build the language selector.
    """
    try:
        from utils.indic_translation import list_supported_languages
        return {
            "supported_languages": list_supported_languages(),
            "default": "en",
            "note": "Pass the language code in the 'language' field of /chat requests"
        }
    except Exception as e:
        return {"error": str(e), "supported_languages": [{"code": "en", "name": "English"}]}


@app.post("/translate")
async def translate_text(request: TranslateRequest):
    """
    General-purpose translation endpoint for use by external callers (e.g. Node.js AI Scribe).
    Accepts: { text, source_lang, target_lang }
    source_lang defaults to 'auto' (auto-detect).
    Returns: { translated, source_lang, target_lang }
    Always returns 200 — falls back to original text on any error.
    """
    text = request.text
    source_lang = request.source_lang or "auto"
    target_lang = request.target_lang or "en"

    if not text or not text.strip():
        return {"translated": text, "source_lang": source_lang, "target_lang": target_lang}

    try:
        from utils.indic_translation import translate, detect_language

        # Resolve auto-detect
        if not source_lang or source_lang == "auto":
            source_lang = detect_language(text)

        # No-op if same language
        if source_lang == target_lang:
            return {"translated": text, "source_lang": source_lang, "target_lang": target_lang, "unchanged": True}

        translated = translate(text, source_lang, target_lang)
        logger.info(f"🌐 /translate: {source_lang}→{target_lang} ({len(text)} chars)")
        return {"translated": translated, "source_lang": source_lang, "target_lang": target_lang}

    except Exception as e:
        logger.warning(f"⚠️ /translate error: {e}")
        return {"translated": text, "source_lang": source_lang, "target_lang": target_lang, "error": str(e)}


@app.post("/query")
async def ask_question(q: Query):
    """
    Main query endpoint
    
    Combines RAG + Bayesian Network + Safety Filter
    Expected latency: 250-350ms
    
    Set auto_ingest=True to ingest new EHR files before processing query
    """
    if not UTILS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Utilities not available")
    
    app_state.request_count += 1
    start_time = time.time()
    
    # Auto-ingest new files if requested
    ingestion_result = None
    if q.auto_ingest and INGEST_AVAILABLE:
        try:
            ingestion_result = ingest_new_files()
            logger.info(f"Auto-ingestion: {ingestion_result.get('ingested', 0)} files")
        except Exception as e:
            logger.warning(f"Auto-ingestion failed: {e}")
    
    # Check for emergencies
    emergency_alerts = detect_emergencies(q.question)
    if emergency_alerts:
        return {
            "answer": "🚨 EMERGENCY DETECTED - Please call 112 (India) or local emergency services immediately",
            "emergency": True,
            "alerts": [{"level": "emergency", "message": a.message} for a in emergency_alerts],
            "latency_ms": round((time.time() - start_time) * 1000, 2)
        }
    
    # Generate LLM answer with RAG
    llm_result = generate_answer(
        q.question,
        use_biomedix=q.use_biomedix,
        include_context=q.include_context
    )
    
    # Bayesian Network inference if patient data provided
    bn_result = None
    if q.patient_data:
        bn_result = bn_inference(q.patient_data)
    
    # Combine answer
    answer = llm_result["answer"]
    
    if bn_result and bn_result.get("CardioRisk", -1) >= 0:
        answer += f"\n\n📊 **Probabilistic Analysis:**\n"
        answer += f"- CardioRisk: {bn_result.get('CardioRisk_label', 'N/A')} ({bn_result.get('CardioRisk_prob', 0):.0%})\n"
        answer += f"- Treatment Priority: {bn_result.get('TreatmentPriority_label', 'N/A')}"
    
    # Safety filter. Emergency detection already ran on the patient's own
    # question above (and short-circuits before an answer is even generated),
    # so only re-check the generated response for unsafe dosage/prescription
    # instructions here - re-running emergency detection on the response text
    # (what validate_response() used to do) produced false positives on any
    # safety-conscious answer that mentions emergency symptoms as advice
    # (e.g. "if you develop difficulty breathing, seek care immediately").
    safe_answer, safety_alerts = filter_dosages(answer)
    
    total_latency = (time.time() - start_time) * 1000
    
    return {
        "answer": safe_answer,
        "model": llm_result.get("model", "unknown"),
        "latency_ms": round(total_latency, 2),
        "latency_breakdown": {
            "llm_ms": llm_result.get("latency_ms", 0),
            "bn_ms": 5 if bn_result else 0,
            "safety_ms": round(total_latency - llm_result.get("latency_ms", 0) - 5, 2)
        },
        "context_chunks": llm_result.get("context_chunks", 0),
        "bn_result": bn_result,
        "safety_alerts": [{"level": a.level.value, "message": a.message} for a in safety_alerts] if safety_alerts else None
    }


@app.post("/chat")
async def chat(request: Dict[str, Any]):
    """
    Chat endpoint with PostgreSQL user context & history integration
    
    Full pipeline: 
    1. Load user context from PostgreSQL
    2. Retrieve conversation history
    3. MedSpaCy → ClinicalBERT → FAISS → Bayesian → LLM → Safety Filter
    4. Save conversation to PostgreSQL
    5. Sync to health diary if configured
    
    Accepts:
    - message: str - User's message/query
    - patient_id: str (optional) - Patient ID for conversation tracking
    - user_id: int (optional) - Mediczy user ID from Node.js backend
    - include_risk: bool (optional) - Whether to include risk assessment
    """
    if not UTILS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Utilities not available")
    
    # Ensure warmup is complete before processing
    if not app_state.warmup_complete:
        logger.info("🔥 First request - completing warmup...")
        app_state.do_background_warmup()
    
    message = request.get("message")
    if not message:
        raise HTTPException(status_code=400, detail="'message' field required")
    
    patient_id = request.get("patient_id", f"patient_{int(time.time())}")
    user_id = request.get("user_id")  # Mediczy user ID from auth
    include_risk = request.get("include_risk", False)
    declared_lang = request.get("language", "en")  # Language declared by frontend
    supplied_patient_context = request.get("patient_context") or request.get("user_context") or {}
    consent_verified = False

    # ── GDPR/DPDP Consent Gate ──────────────────────────────────────────────
    # AI medical consultation requires explicit user consent — but only for
    # calls that are actually ABOUT a specific patient. Generic/non-clinical
    # callers (admin & team copilot, HR text generation, etc.) never have a
    # patient in the loop and must not be blocked by a patient-consent check;
    # the Node.js backend signals this via is_patient_specific (true only when
    # a real patientId was supplied to server/services/ai-brain/llm-provider.js).
    # Without this scoping, EVERY call was being rejected, not just patient ones.
    is_patient_specific = request.get("is_patient_specific", False)
    if is_patient_specific:
        # The request flag is intentionally ignored.  Consent must be checked
        # against the authoritative platform table inside SIB before any PHI
        # can reach a model or the EHR retriever.
        consent_verified = await _has_authoritative_ai_consent(str(user_id) if user_id else None)
        if not consent_verified:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={
                "error": "Consent required",
                "detail": "Patient has not consented to AI-powered medical consultation. "
                          "Please obtain consent before proceeding.",
                "regulation": "GDPR Art. 7 / DPDP §4"
            })
    # ─────────────────────────────────────────────────────────────────────────

    # ── Indic Language Translation (input) ──────────────────────────────────
    # Translate non-English messages to English for LLM reasoning.
    # Dr. iSHA always thinks in English — then we translate back.
    try:
        from utils.indic_translation import process_for_llm, translate_response
        english_message, patient_lang = process_for_llm(message, declared_lang)
        if patient_lang != "en":
            logger.info(f"🌐 Translating {patient_lang}→en: '{message[:40]}...'")
            message = english_message  # Use translated message for all downstream processing
    except Exception as _te:
        logger.warning(f"⚠️ Translation init failed: {_te}")
        patient_lang = declared_lang or "en"
    # ─────────────────────────────────────────────────────────────────────────
    
    app_state.request_count += 1
    start_time = time.time()
    
    # Load user context from PostgreSQL with caching
    user_context = {}
    conversation_history = []
    db_start = time.time()
    
    if app_state.db and user_id:
        user_id_str = str(user_id)
        
        # Check cache first
        cache_key = f"ctx_{user_id_str}"
        cached_context = USER_CONTEXT_CACHE.get(cache_key)
        if cached_context is not None:
            user_context = cached_context
            logger.info(f"📋 Loaded user context from cache")

        # If not cached, load from DB asynchronously (don't block LLM)
        if not user_context:
            try:
                # Load user context and conversation history in parallel
                context_task = asyncio.create_task(
                    app_state.db.get_patient_context(user_id_str)
                )
                history_task = asyncio.create_task(
                    app_state.db.get_chat_history(patient_id, limit=20)
                )

                # Don't wait for DB if it's slow - LLM can proceed
                done, pending = await asyncio.wait(
                    [context_task, history_task],
                    timeout=2.0  # 2 second timeout
                )

                if context_task in done:
                    user_context = context_task.result() or {}
                    # Cache it
                    USER_CONTEXT_CACHE.set(cache_key, user_context)
                    logger.info(f"📋 Loaded user context from DB")
                
                if history_task in done:
                    conversation_history = history_task.result() or []
                    logger.info(f"💬 Retrieved {len(conversation_history)} messages")
                else:
                    logger.info(f"⚡ Skipping history load (timeout) - proceeding with LLM")
                    
            except Exception as e:
                logger.warning(f"⚠️ DB timeout or error: {e} - proceeding without context")
    
    db_latency = (time.time() - db_start) * 1000
    
    # Check for emergencies
    emergency_alerts = detect_emergencies(message)
    if emergency_alerts:
        return {
            "response": "🚨 EMERGENCY DETECTED - Please call 112 (India) or local emergency services immediately",
            "chat_answer": "🚨 EMERGENCY DETECTED - Please call 112 (India) or local emergency services immediately",
            "provider": "emergency-filter",
            "emergency": True,
            "turn_count": 1,
            "conversation_id": patient_id
        }

    patient_data = supplied_patient_context if (is_patient_specific and consent_verified) else None
    ehr_patient_id = str(user_id or patient_id) if patient_data else None
    rag_chunks, rag_context = await _retrieve_unified_context(
        message,
        patient_id=ehr_patient_id,
        k=int(request.get("rag_k", 6) or 6),
    )
    unified_context = [rag_context] if rag_context else None
    
    # Try full medical pipeline first (MedSpaCy + NER)
    try:
        from sib.medical_pipeline import get_pipeline
        pipeline = get_pipeline()
        logger.info("🧠 Using full medical pipeline with MedSpaCy NER...")
        
        result = pipeline.process(
            message,
            patient_data=patient_data,
            include_risk=include_risk,
            include_retrieval=True,
            conversation_history=conversation_history,
            context_override=unified_context,
        )
        
        logger.info(f"✅ Medical pipeline completed: {len(result.entities)} entities extracted")
        
        # Apply prescription guardrail filter
        filtered_response = filter_prescription_language(result.response)

        # ── Translate response back to patient's language ──────────────────
        if patient_lang != "en":
            try:
                from utils.indic_translation import translate_response as _tr
                filtered_response = _tr(filtered_response, patient_lang)
                logger.info(f"🌐 Translated response en→{patient_lang}")
            except Exception as _te:
                logger.warning(f"⚠️ Response translation failed: {_te}")
        # ─────────────────────────────────────────────────────────────────────
        
        # Save conversation to PostgreSQL
        if app_state.db:
            try:
                # Save user message
                await app_state.db.save_chat_message(
                    conversation_id=patient_id,
                    patient_id=str(user_id) if user_id else None,
                    role="user",
                    content=message,
                    metadata={
                        "entities": result.entities[:10],
                        "is_emergency": result.is_emergency
                    }
                )
                
                # Save assistant response
                await app_state.db.save_chat_message(
                    conversation_id=patient_id,
                    patient_id=str(user_id) if user_id else None,
                    role="assistant",
                    content=filtered_response,
                    metadata={
                        "provider": result.provider,
                        "latency_ms": result.latency_ms,
                        "db_latency_ms": round(db_latency, 2),
                        "pipeline": "medspacy-clinicalbert-pgvector-bayesian-llm"
                    }
                )
                
                # Update patient context with latest interaction
                if user_id:
                    await app_state.db.update_patient_context(
                        patient_id=str(user_id),
                        context_updates={
                            "last_query": message,
                            "last_entities": result.entities[:5],
                            "total_interactions": len(conversation_history) + 1
                        }
                    )
                
                logger.info("💾 Conversation saved to PostgreSQL")
            except Exception as e:
                logger.error(f"❌ Failed to save conversation: {e}")

        # HIPAA audit log — hash query content, never log PHI in plaintext
        import hashlib
        query_hash = hashlib.sha256(message.encode()).hexdigest()[:12]
        logger.info(
            "AUDIT /chat uid=%s pid=%s provider=%s latency=%.0fms qhash=%s",
            str(user_id or "anon")[:8],
            str(patient_id)[:8],
            result.provider if hasattr(result, 'provider') else 'unknown',
            (time.time() - start_time) * 1000,
            query_hash
        )

        total_latency = (time.time() - start_time) * 1000

        return {
            "response": filtered_response,   # canonical field (Node.js reads this)
            "chat_answer": filtered_response,  # legacy alias
            "provider": result.provider,
            "model": result.provider,
            "turn_count": len(conversation_history) + 1,
            "conversation_id": patient_id,
            "latency_ms": {
                "total": round(total_latency, 2),
                "llm": result.latency_ms,
                "database": round(db_latency, 2),
                "overhead": round(total_latency - result.latency_ms - db_latency, 2)
            },
            "entities": result.entities[:10],
            "is_emergency": result.is_emergency,
            "pipeline": "medspacy-clinicalbert-pgvector-bayesian-llm",
            "user_context_loaded": bool(user_context),
            "language": patient_lang,
            "retrieval": {
                "count": len(rag_chunks),
                "sources": sorted({chunk.source for chunk in rag_chunks}),
                "patient_history_used": bool(patient_data and any(chunk.source == "ehr" for chunk in rag_chunks)),
            }
        }
    except Exception as pipeline_error:
        logger.warning(f"⚠️ Medical pipeline failed: {pipeline_error}")
        
        # Fallback: Hybrid RAG (BM25 + dense + re-rank) → LLM
        # Uses the world-class retrieval pipeline instead of basic dense-only search
        try:
            if ehr_patient_id:
                from utils.pgvector_store import retrieve_and_rerank
                retrieved = await retrieve_and_rerank(
                    message, k=10, patient_filter=ehr_patient_id, rerank_top_k=5
                )
                rag_context = "\n\n".join(
                    f"[{r.get('section','General')} | score={r.get('rerank_score', r.get('score',0)):.2f}] {r['text']}"
                    for r in retrieved
                )
            # With no consented patient id, use only the already-filtered
            # knowledge-fabric context. Never query sib_embeddings globally.
            else:
                rag_context = rag_context or ""
            llm_result = generate_answer(message, use_biomedix=False, include_context=bool(rag_context),
                                         context_override=rag_context if rag_context else None)
        except Exception as _rag_err:
            logger.warning(f"⚠️ Hybrid RAG fallback failed ({_rag_err}), using basic RAG")
            llm_result = generate_answer(message, use_biomedix=False, include_context=True)
        
        # Safety filter. The patient's message was already checked for
        # emergencies earlier in this handler (and short-circuits before any
        # answer is generated), so only re-check the generated response for
        # unsafe dosage/prescription instructions here - see the matching fix
        # and comment in /query above for why validate_response() (which
        # also re-ran emergency detection on the response) is wrong here.
        safe_answer, safety_alerts = filter_dosages(llm_result["answer"])

        # Translate fallback response if needed
        if patient_lang != "en":
            try:
                from utils.indic_translation import translate_response as _tr
                safe_answer = _tr(safe_answer, patient_lang)
            except Exception:
                pass
        
        total_latency = (time.time() - start_time) * 1000
        
        # Save fallback conversation to PostgreSQL
        if app_state.db:
            try:
                await app_state.db.save_chat_message(
                    conversation_id=patient_id,
                    patient_id=str(user_id) if user_id else None,
                    role="user",
                    content=message,
                    metadata={"pipeline": "rag-fallback"}
                )
                await app_state.db.save_chat_message(
                    conversation_id=patient_id,
                    patient_id=str(user_id) if user_id else None,
                    role="assistant",
                    content=safe_answer,
                    metadata={"provider": llm_result.get("model")}
                )
                logger.info("💾 Fallback conversation saved")
            except Exception as e:
                logger.error(f"❌ Failed to save fallback: {e}")
        
        return {
            "response": safe_answer,          # canonical
            "chat_answer": safe_answer,         # legacy alias
            "provider": llm_result.get("model", "groq"),
            "model": llm_result.get("model", "openai/gpt-oss-120b"),
            "turn_count": len(conversation_history) + 1,
            "conversation_id": patient_id,
            "latency_ms": round(total_latency, 2),
            "pipeline": "rag-fallback",
            "user_context_loaded": bool(user_context),
            "language": patient_lang,
            "retrieval": {
                "count": len(rag_chunks),
                "sources": sorted({chunk.source for chunk in rag_chunks}),
                "patient_history_used": bool(patient_data and any(chunk.source == "ehr" for chunk in rag_chunks)),
            }
        }


@app.post("/query/stream")
async def stream_question(q: Query):
    """Streaming query endpoint"""
    if not UTILS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Utilities not available")
    
    # Check emergencies first
    emergency_alerts = detect_emergencies(q.question)
    if emergency_alerts:
        async def emergency_stream():
            yield "🚨 EMERGENCY DETECTED - Please call 112 (India) or local emergency services immediately"
        return StreamingResponse(emergency_stream(), media_type="text/plain")
    
    async def response_stream():
        for chunk in stream_answer(q.question):
            yield chunk
    
    return StreamingResponse(response_stream(), media_type="text/plain")


@app.post("/risk")
async def calculate_risk(request: RiskRequest):
    """
    CVD Risk Assessment
    
    Calculates Framingham and ASCVD risk scores
    """
    if not UTILS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Utilities not available")
    
    profile = profile_from_dict(request.model_dump())
    return calculate_all_risks(profile)


@app.post("/bn/inference")
async def bayesian_inference(patient_data: Dict[str, Any]):
    """
    Bayesian Network inference
    
    Returns CardioRisk and TreatmentPriority
    """
    if not UTILS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Utilities not available")
    
    return get_full_assessment(patient_data)


@app.post("/safety/check")
async def check_safety(text: str):
    """
    Safety check endpoint
    
    Detects emergencies, unsafe dosages, etc.
    """
    if not UTILS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Utilities not available")
    
    return safety_check(text)


@app.post("/task")
async def execute_task(request: Dict[str, Any]):
    """
    Unified task execution endpoint
    
    ALL operations must route through this endpoint for centralized orchestration:
    - Chat and consultations
    - Medical record processing
    - Appointment scheduling
    - Notification management
    - Prescription generation
    - Task automation
    - Risk assessment
    - Emergency detection
    
    Request format:
    {
        "task_type": "chat|medical_consult|schedule_appointment|...",
        "payload": { /* task-specific data */ },
        "user_id": "user_123",
        "patient_id": "patient_456",
        "context": { /* optional context */ }
    }
    """
    try:
        from sib.task_router import TaskType, get_task_router
        
        task_router = get_task_router(app_state.db)
        
        task_type_str = request.get("task_type")
        if not task_type_str:
            raise HTTPException(status_code=400, detail="task_type is required")
        
        # Convert string to TaskType enum
        try:
            task_type = TaskType(task_type_str.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown task type: {task_type_str}")
        
        # Execute task through unified router
        result = await task_router.route_task(
            task_type=task_type,
            payload=request.get("payload", {}),
            user_id=request.get("user_id"),
            patient_id=request.get("patient_id"),
            context=request.get("context")
        )
        
        return {
            "success": result.status.value == "completed",
            "task_type": result.task_type.value,
            "status": result.status.value,
            "data": result.data,
            "error": result.error,
            "timestamp": result.timestamp
        }
    except Exception as e:
        logger.error(f"Task execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/ehr")
async def process_ehr_text(request: ProcessRequest):
    """
    Process EHR text
    
    Extracts entities, sections, vitals
    """
    if not UTILS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Utilities not available")
    
    # Create temp file for processing
    import tempfile
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(request.text)
        temp_path = f.name
    
    try:
        result = process_ehr(temp_path)
        if request.patient_id:
            result["patient_id"] = request.patient_id
        return result
    finally:
        os.unlink(temp_path)


@app.post("/index/build")
async def build_index(ehr_dir: str = "./data/ehr_records/"):
    """
    Build FAISS index from EHR records
    
    Admin endpoint
    """
    if not UTILS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Utilities not available")
    
    # Process EHR files
    process_all_ehr(ehr_dir)
    
    # Build embeddings
    count = embed_and_store()
    
    return {"status": "success", "chunks_indexed": count}


@app.get("/index/stats")
async def index_stats():
    """Get FAISS index statistics"""
    if not UTILS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Utilities not available")
    
    return get_index_stats()


# ==================== Real-Time Ingestion Endpoints ====================

@app.post("/ingest/new")
async def ingest_new():
    """
    Ingest all new EHR files from data/ehr_records/
    
    Supports: PDF, HL7, TXT files
    Automatically updates FAISS index without rebuilding
    """
    if not INGEST_AVAILABLE:
        raise HTTPException(status_code=503, detail="Ingestion module not available")
    
    start_time = time.time()
    result = ingest_new_files()
    result["latency_ms"] = round((time.time() - start_time) * 1000, 2)
    
    return result


@app.post("/ingest/file")
async def ingest_file(file: UploadFile = File(...)):
    """
    Upload and ingest a single EHR file
    
    Supports: PDF, HL7, TXT files
    """
    if not INGEST_AVAILABLE:
        raise HTTPException(status_code=503, detail="Ingestion module not available")
    
    # Validate file type
    allowed_extensions = [".pdf", ".hl7", ".txt"]
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type: {file_ext}. Allowed: {allowed_extensions}"
        )
    
    # Save uploaded file
    ehr_dir = Path(__file__).parent / "data" / "ehr_records"
    ehr_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = ehr_dir / file.filename
    
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Ingest the file
        start_time = time.time()
        result = ingest_single_file(str(file_path), force=True)
        
        if result:
            return {
                "status": "success",
                "file": file.filename,
                "patient_id": result.get("patient_id"),
                "sections": list(result.get("sections", {}).keys()),
                "entities_count": len(result.get("entities", [])),
                "latency_ms": round((time.time() - start_time) * 1000, 2)
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to process file")
    
    except Exception as e:
        logger.error(f"File ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ingest/status")
async def ingestion_status():
    """
    Get current ingestion status
    
    Returns:
    - Total vectors in FAISS
    - Ingested file count
    - Pending files
    """
    if not INGEST_AVAILABLE:
        raise HTTPException(status_code=503, detail="Ingestion module not available")
    
    return get_ingestion_status()


@app.post("/ingest/reset")
async def reset_ingestion_state():
    """
    Reset ingestion state (admin only)
    
    Clears FAISS index, metadata, and ingestion log
    Use with caution!
    """
    if not INGEST_AVAILABLE:
        raise HTTPException(status_code=503, detail="Ingestion module not available")
    
    return reset_ingestion()


@app.post("/extract/text")
async def extract_file_text(file: UploadFile = File(...)):
    """
    Extract text from a file without ingesting
    
    Useful for previewing file contents
    """
    if not INGEST_AVAILABLE:
        raise HTTPException(status_code=503, detail="Ingestion module not available")
    
    import tempfile
    
    # Save to temp file
    file_ext = Path(file.filename).suffix.lower()
    with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        text = extract_text(tmp_path)
        return {
            "filename": file.filename,
            "text": text,
            "length": len(text),
            "lines": len(text.split('\n'))
        }
    finally:
        os.unlink(tmp_path)


@app.websocket("/ws/query")
async def websocket_query(websocket: WebSocket):
    """
    WebSocket for real-time queries
    """
    await websocket.accept()
    logger.info("🔌 WebSocket connected")
    
    try:
        while True:
            data = await websocket.receive_json()
            question = data.get("question", "")
            patient_data = data.get("patient_data")
            
            # Check emergencies
            emergency_alerts = detect_emergencies(question)
            if emergency_alerts:
                await websocket.send_json({
                    "type": "emergency",
                    "message": "🚨 Emergency detected - Call 112 (India)"
                })
                continue
            
            # Stream response
            await websocket.send_json({"type": "start"})
            
            full_response = ""
            for chunk in stream_answer(question):
                await websocket.send_json({"type": "chunk", "content": chunk})
                full_response += chunk
            
            # Add BN result if patient data
            if patient_data:
                bn_result = bn_inference(patient_data)
                await websocket.send_json({
                    "type": "bn_result",
                    "data": bn_result
                })
            
            await websocket.send_json({"type": "end"})
    
    except WebSocketDisconnect:
        logger.info("🔌 WebSocket disconnected")


# ==================== FHIR R4 Endpoint ====================

@app.post("/fhir/consultation")
async def fhir_consultation(request: Dict[str, Any]):
    """
    Return a FHIR R4 Bundle for an AI consultation.

    Accepts the same body as /chat PLUS optional risk_scores:
    {
      "message": "...",
      "patient_id": "...",
      "user_id": 42,
      "risk_scores": {"qrisk3": 18.5, "findrisc": 14}  # optional
    }

    Returns: FHIR R4 Bundle (document) — HL7 FHIR R4 compliant
    """
    from utils.fhir_mapper import fhir_response_from_chat

    # Run the standard /chat pipeline first
    chat_result = await chat(request)

    # If chat returned a JSONResponse (error), pass it through
    from fastapi.responses import JSONResponse as _JSONResponse
    if isinstance(chat_result, _JSONResponse):
        return chat_result

    patient_id = str(request.get("user_id") or request.get("patient_id") or "unknown")
    risk_scores = request.get("risk_scores")  # optional pre-computed scores

    try:
        bundle = fhir_response_from_chat(chat_result, patient_id, risk_scores)
        return bundle
    except Exception as exc:
        logger.error(f"❌ FHIR mapping failed: {exc}")
        # Fall back to plain chat response
        return {**chat_result, "fhir_error": str(exc)}


# ==================== Main ====================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("DR_ISHA_PORT", 8001))
    host = os.environ.get("DR_ISHA_HOST", "0.0.0.0")
    
    logger.info(f"🩺 Starting Dr. iSHA on {host}:{port}")
    
    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=False,
        workers=1,
        log_level="info"
    )
