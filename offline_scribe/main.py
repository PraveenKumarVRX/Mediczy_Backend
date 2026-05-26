"""
Mediczy Offline AI Scribe - Main API Service

Hospital-grade, fully offline AI scribe for Indian hospitals.
Supports Tamil, Telugu, Hindi, English.

Architecture:
  Audio → Whisper STT → Text Normalization → Indic-Gemma LLM → Clinical Templates → Doctor Review

Endpoints:
  POST /api/scribe/transcribe     - Audio to text
  POST /api/scribe/normalize      - Normalize medical text
  POST /api/scribe/generate       - Generate clinical document
  POST /api/scribe/prescription   - Generate OPD prescription
  POST /api/scribe/opd-notes      - Generate OPD notes
  POST /api/scribe/discharge      - Generate discharge summary
  POST /api/scribe/ipd-notes      - Generate IPD notes
  GET  /api/scribe/health         - Health check
  GET  /api/scribe/languages      - Supported languages
  GET  /api/scribe/templates      - Available templates
"""

import logging
import asyncio
import time
import tempfile
import uuid
import shutil
import re
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime
import os

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# Import configuration
from config import (
    SERVICE_HOST,
    SERVICE_PORT,
    SUPPORTED_LANGUAGES,
    DOCUMENT_TYPES,
    COMPLIANCE_DISCLAIMER,
    SECURITY_CONFIG,
    print_config,
)

# Import services
from normalizer import normalize_medical_text, NormalizationResult
from llm import get_llm_engine
from stt import get_stt_service, AudioProcessor, normalize_transcription_language
from templates import get_template_engine, DocumentType

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Print config on import
print_config()

# =============================================================================
# FASTAPI APP
# =============================================================================

app = FastAPI(
    title="Mediczy Offline AI Scribe",
    description="Hospital-grade, fully offline medical scribe for Indian hospitals",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS (restrictive for hospital security)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for specific hospital domains in production
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class TranscriptionRequest(BaseModel):
    """Request for text transcription"""
    language: str = Field("auto", description="Language code: hi, ta, te, en, auto")
    translate: bool = Field(False, description="Translate to English")


class NormalizationRequest(BaseModel):
    """Request for text normalization"""
    text: str = Field(..., description="Raw transcript text")
    language: str = Field("auto", description="Source language")


class GenerationRequest(BaseModel):
    """Request for document generation"""
    transcript: str = Field(..., description="Normalized transcript")
    document_type: str = Field("prescription", description="Document type")
    patient_info: Optional[Dict[str, Any]] = Field(None, description="Patient information")


class PrescriptionRequest(BaseModel):
    """Request for prescription generation"""
    transcript: str = Field(..., description="Consultation transcript")
    patient_name: Optional[str] = None
    patient_age: Optional[str] = None
    patient_gender: Optional[str] = None


class OPDNotesRequest(BaseModel):
    """Request for OPD notes generation"""
    transcript: str = Field(..., description="Consultation transcript")
    patient_info: Optional[Dict[str, Any]] = None


class DischargeSummaryRequest(BaseModel):
    """Request for discharge summary generation"""
    transcript: str = Field(..., description="Discharge information")
    patient_info: Optional[Dict[str, Any]] = None


class IPDNotesRequest(BaseModel):
    """Request for IPD notes generation"""
    transcript: str = Field(..., description="IPD round dictation")
    patient_info: Optional[Dict[str, Any]] = None


class FullPipelineRequest(BaseModel):
    """Request for full audio-to-document pipeline"""
    document_type: str = Field("prescription", description="Document type")
    language: str = Field("auto", description="Audio language")
    patient_info: Optional[Dict[str, Any]] = None


# =============================================================================
# AUDIT LOGGING
# =============================================================================

class AuditLogger:
    """Local audit logging for compliance"""
    
    def __init__(self, log_dir: str = "/home/ubuntu/Mediczy/offline_scribe/logs"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
    
    def log(self, event_type: str, details: Dict[str, Any]):
        """Log an audit event"""
        if not SECURITY_CONFIG["audit_logging"]:
            return
        
        timestamp = datetime.now().isoformat()
        log_file = self.log_dir / f"audit_{datetime.now().strftime('%Y%m%d')}.jsonl"
        
        entry = {
            "timestamp": timestamp,
            "event": event_type,
            **details,
        }
        
        try:
            with open(log_file, "a") as f:
                import json
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            logger.error(f"Audit logging failed: {e}")


audit = AuditLogger()

# =============================================================================
# QUALITY, SAFETY, AND ASYNC JOBS
# =============================================================================

JOB_DIR = Path(os.getenv("SCRIBE_JOB_DIR", "/tmp/mediczy-scribe-jobs"))
JOB_DIR.mkdir(parents=True, exist_ok=True)
JOBS: Dict[str, Dict[str, Any]] = {}
JOB_RETENTION_SECONDS = int(os.getenv("SCRIBE_JOB_RETENTION_SECONDS", "86400"))

MEDICAL_TERMS = {
    "fever", "pain", "cough", "cold", "vomiting", "diabetes", "hypertension",
    "bp", "pulse", "spo2", "temperature", "diagnosis", "tablet", "capsule",
    "syrup", "injection", "mg", "ml", "od", "bd", "tds", "qid", "pc", "ac",
    "बुखार", "दर्द", "खांसी", "दवा", "गोली", "बीपी", "शुगर",
    "காய்ச்சல்", "வலி", "மருந்து", "மாத்திரை", "இருமல்",
    "జ్వరం", "నొప్పి", "మందు", "మాత్ర", "దగ్గు",
}

UNSAFE_GENERATION_PATTERNS = [
    (r"\bguaranteed\b|\bcure\b", "Avoid guarantee/cure language in clinical documents."),
    (r"\bno need (to )?(consult|review)\b", "AI output must not discourage clinician review."),
    (r"\bself[- ]?medicat", "Self-medication language requires clinician review."),
]

PRESCRIPTION_REQUIRED_PATTERNS = {
    "dose": r"\b\d+(\.\d+)?\s?(mg|mcg|g|ml|units?|iu)\b",
    "frequency": r"\b(OD|BD|TDS|QID|HS|SOS|PRN|once daily|twice daily|three times|daily)\b",
    "duration": r"\b\d+\s?(day|days|week|weeks|month|months)\b",
}

KNOWN_DRUG_TERMS = {
    "paracetamol", "dolo", "crocin", "acetaminophen", "azithromycin", "augmentin",
    "amoxicillin", "clavulanate", "combiflam", "ibuprofen", "pantoprazole",
    "pan", "ecosprin", "aspirin", "metformin", "telmisartan", "amlodipine",
    "atorvastatin", "cetirizine", "levocetirizine", "salbutamol", "montelukast",
    "ondansetron", "omeprazole", "rabeprazole", "insulin", "ceftriaxone",
}


def _extract_known_drugs(text: str) -> set:
    lowered = (text or "").lower()
    found = set()
    for drug in KNOWN_DRUG_TERMS:
        if re.search(r"\b" + re.escape(drug) + r"\b", lowered):
            found.add(drug)
    return found


def _script_counts(text: str) -> Dict[str, int]:
    return {
        "latin": len(re.findall(r"[A-Za-z]", text or "")),
        "devanagari": len(re.findall(r"[\u0900-\u097F]", text or "")),
        "tamil": len(re.findall(r"[\u0B80-\u0BFF]", text or "")),
        "telugu": len(re.findall(r"[\u0C00-\u0C7F]", text or "")),
    }


def score_transcript_quality(result: Dict[str, Any], requested_language: str = "auto") -> Dict[str, Any]:
    text = (result.get("text") or "").strip()
    words = re.findall(r"\w+", text, flags=re.UNICODE)
    warnings: List[str] = []
    score = 1.0

    if not text:
        return {
            "score": 0.0,
            "grade": "failed",
            "warnings": ["No transcript text produced."],
            "word_count": 0,
            "script_counts": _script_counts(text),
            "requires_review": True,
        }

    if len(words) < 4:
        score -= 0.35
        warnings.append("Transcript is very short; verify audio capture and completeness.")

    confidence = float(result.get("language_probability") or 0)
    if requested_language == "auto" and confidence and confidence < 0.45:
        score -= 0.15
        warnings.append("Low automatic language confidence.")

    realtime_factor = float(result.get("realtime_factor") or 0)
    if realtime_factor > 4:
        score -= 0.1
        warnings.append("Slow transcription path used; consider GPU/faster-whisper for production scale.")

    unknown_noise = len(re.findall(r"\[[^\]]*(inaudible|music|noise|silence)[^\]]*\]", text, re.I))
    if unknown_noise:
        score -= min(0.25, unknown_noise * 0.08)
        warnings.append("Transcript contains possible inaudible/noise markers.")

    medical_hits = sum(1 for term in MEDICAL_TERMS if term.lower() in text.lower())
    if len(words) >= 8 and medical_hits == 0:
        score -= 0.08
        warnings.append("No known medical terms detected; verify this is clinical dictation.")

    score = max(0.0, min(1.0, round(score, 2)))
    grade = "excellent" if score >= 0.85 else "good" if score >= 0.7 else "review" if score >= 0.5 else "poor"
    return {
        "score": score,
        "grade": grade,
        "warnings": warnings,
        "word_count": len(words),
        "medical_term_hits": medical_hits,
        "script_counts": _script_counts(text),
        "requires_review": score < 0.85 or bool(warnings),
    }


def validate_clinical_output(
    document_type: str,
    transcript: str,
    normalized_text: str,
    generated_text: str,
    structured: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    output = generated_text or ""
    flags: List[Dict[str, str]] = []
    doc_type = (document_type or "").lower()

    if len(output.strip()) < 40:
        flags.append({"severity": "high", "code": "short_output", "message": "Generated document is too short for clinical use."})

    for pattern, message in UNSAFE_GENERATION_PATTERNS:
        if re.search(pattern, output, re.I):
            flags.append({"severity": "high", "code": "unsafe_language", "message": message})

    if doc_type == "prescription":
        for key, pattern in PRESCRIPTION_REQUIRED_PATTERNS.items():
            if not re.search(pattern, output, re.I):
                flags.append({"severity": "medium", "code": f"missing_{key}", "message": f"Prescription may be missing {key}; doctor must verify."})

        transcript_drugs = _extract_known_drugs(normalized_text or transcript)
        output_drugs = _extract_known_drugs(output)
        missing_drugs = sorted(transcript_drugs - output_drugs)
        extra_drugs = sorted(output_drugs - transcript_drugs)
        if missing_drugs:
            flags.append({"severity": "high", "code": "medication_omission", "message": f"Medication(s) mentioned in transcript missing from output: {', '.join(missing_drugs)}."})
        if extra_drugs:
            flags.append({"severity": "high", "code": "possible_medication_hallucination", "message": f"Medication(s) appear in output but not transcript: {', '.join(extra_drugs)}."})

    if re.search(r"\b(bp|blood pressure|spo2|pulse|temperature|temp|weight)\b", transcript, re.I) and not re.search(r"\b(bp|blood pressure|spo2|pulse|temperature|temp|weight)\b", output, re.I):
        flags.append({"severity": "medium", "code": "vitals_may_be_missing", "message": "Vitals were mentioned in transcript but not clearly present in output."})

    if re.search(r"\b(allergy|allergic|एलर्जी)\b", transcript, re.I) and not re.search(r"\b(allergy|allergic|एलर्जी)\b", output, re.I):
        flags.append({"severity": "high", "code": "allergy_may_be_missing", "message": "Allergy was mentioned in transcript but not clearly present in output."})

    severity_order = {"low": 1, "medium": 2, "high": 3}
    max_severity = "low"
    for flag in flags:
        if severity_order[flag["severity"]] > severity_order[max_severity]:
            max_severity = flag["severity"]

    return {
        "requires_doctor_review": True,
        "safety_level": "blocked" if max_severity == "high" else "needs_review" if flags else "draft_ok",
        "highest_severity": max_severity if flags else None,
        "flags": flags,
        "checks": {
            "non_empty_output": bool(output.strip()),
            "template_bound": True,
            "ai_badge_required": True,
            "clinician_final_authority": True,
        },
    }


def build_document_response(
    document_type: str,
    transcript: str,
    normalized: NormalizationResult,
    result: Dict[str, Any],
    total_time: float,
    transcription: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    quality = score_transcript_quality(transcription, transcription.get("language", "auto")) if transcription else None
    safety = validate_clinical_output(
        document_type,
        transcript,
        normalized.normalized_text,
        result.get("text", ""),
        result.get("structured", {}),
    )
    response = {
        "success": True,
        "document_type": document_type,
        "raw_output": result.get("text", ""),
        "structured": result.get("structured", {}),
        "normalized_input": normalized.normalized_text,
        "normalization_changes": len(normalized.changes),
        "generation_time": result.get("generation_time", 0),
        "total_time": total_time,
        "tokens": result.get("tokens", 0),
        "transcript_quality": quality,
        "clinical_safety": safety,
        "ai_badge": SECURITY_CONFIG["ai_badge_required"],
        "requires_review": True,
        "disclaimer": COMPLIANCE_DISCLAIMER,
    }
    if transcription:
        response["transcript"] = transcription.get("text", "")
        response["detected_language"] = transcription.get("language")
        response["transcription_time"] = transcription.get("transcription_time")
        response["stt"] = {
            "backend": transcription.get("backend"),
            "model_used": transcription.get("model_used"),
            "audio_duration": transcription.get("audio_duration"),
            "realtime_factor": transcription.get("realtime_factor"),
            "chunked": transcription.get("chunked", False),
            "chunks_processed": transcription.get("chunks_processed", 1),
        }
    return response


def _cleanup_old_jobs() -> None:
    cutoff = time.time() - JOB_RETENTION_SECONDS
    expired = [job_id for job_id, job in JOBS.items() if job.get("updated_at", 0) < cutoff]
    for job_id in expired:
        job = JOBS.pop(job_id, {})
        path = job.get("file_path")
        if path:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass


# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Mediczy Offline AI Scribe",
        "version": "1.0.0",
        "status": "running",
        "disclaimer": COMPLIANCE_DISCLAIMER,
    }


@app.get("/api/scribe/health")
async def health_check():
    """
    Health check endpoint.
    
    Returns status of all components:
    - STT (Whisper)
    - LLM (Indic-Gemma)
    - Normalizer
    - Templates
    """
    stt = get_stt_service()
    llm = get_llm_engine()
    templates = get_template_engine()
    
    stt_health = stt.health_check()
    llm_health = llm.health_check()
    
    all_healthy = stt_health["status"] == "healthy" and llm_health["status"] == "healthy"
    
    return {
        "status": "healthy" if all_healthy else "degraded",
        "timestamp": datetime.now().isoformat(),
        "components": {
            "stt": stt_health,
            "llm": llm_health,
            "normalizer": {"status": "healthy"},  # Rule-based, always available
            "templates": {"status": "healthy", "count": len(templates.get_all_templates())},
        },
        "disclaimer": COMPLIANCE_DISCLAIMER,
    }


@app.get("/api/scribe/languages")
async def get_languages():
    """Get supported languages"""
    return {
        "languages": {
            code: {
                "name": lang["name"],
                "native": lang["native"],
                "enabled": lang["enabled"],
            }
            for code, lang in SUPPORTED_LANGUAGES.items()
        }
    }


@app.get("/api/scribe/templates")
async def get_templates():
    """Get available document templates"""
    engine = get_template_engine()
    
    return {
        "templates": {
            doc_type.value: {
                "name": DOCUMENT_TYPES[doc_type.value]["name"],
                "max_tokens": DOCUMENT_TYPES[doc_type.value]["max_tokens"],
            }
            for doc_type in DocumentType
        }
    }


@app.post("/api/scribe/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    dominant_language: Optional[str] = Form(None),
    translate: bool = Form(False),
    chunk_seconds: int = Form(30),
    vad: bool = Form(True),
    beam_size: int = Form(1),
):
    """
    Transcribe audio to text using Whisper.
    
    Accepts:
    - WAV, MP3, M4A, OGG audio files
    - Language: hi (Hindi), ta (Tamil), te (Telugu), en (English), auto
    
    Returns:
    - Transcribed text
    - Detected language
    - Processing time
    """
    # Validate file
    allowed_extensions = [".wav", ".mp3", ".m4a", ".ogg", ".webm"]
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(400, f"Invalid file type. Allowed: {allowed_extensions}")
    
    # Save uploaded file
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # Convert to WAV if needed
        processor = AudioProcessor()
        if file_ext != ".wav":
            wav_path = processor.convert_to_wav(tmp_path)
        else:
            wav_path = tmp_path
        
        requested_language = normalize_transcription_language(language)
        dominant_language_hint = normalize_transcription_language(dominant_language) if dominant_language else None
        effective_language = requested_language

        # Conversation-level fallback: if UI sends mixed/auto, use dominant language hint
        # for more stable long-session transcription without manual language switching.
        if requested_language == "auto" and dominant_language_hint and dominant_language_hint != "auto":
            effective_language = dominant_language_hint

        # Transcribe
        stt = get_stt_service()
        result = await asyncio.to_thread(
            stt.transcribe,
            wav_path,
            language=effective_language,
            translate=translate,
            chunk_seconds=chunk_seconds,
            vad=vad,
            beam_size=beam_size,
        )
        
        # Audit log
        audit.log("transcription", {
            "filename": file.filename,
            "language": requested_language,
            "effective_language": effective_language,
            "dominant_language_hint": dominant_language_hint,
            "detected_language": result.get("language"),
            "duration": result.get("audio_duration"),
            "success": result.get("success"),
        })
        
        if result["success"]:
            return {
                "success": True,
                "text": result["text"],
                "language": result.get("language", "unknown"),
                "detected_languages": result.get("detected_languages", []),
                "code_switching": result.get("code_switching", False),
                "language_confidence": result.get("language_probability", 0),
                "audio_duration": result.get("audio_duration", 0),
                "transcription_time": result.get("transcription_time", 0),
                "realtime_factor": result.get("realtime_factor", 0),
                "backend": result.get("backend"),
                "model_used": result.get("model_used"),
                "chunked": result.get("chunked", False),
                "chunks_processed": result.get("chunks_processed", 1),
                "requested_language": requested_language,
                "dominant_language_hint": dominant_language_hint,
                "effective_language": effective_language,
                "quality": score_transcript_quality(result, requested_language),
            }
        else:
            raise HTTPException(500, result.get("error", "Transcription failed"))
    
    finally:
        # Cleanup
        try:
            os.unlink(tmp_path)
            if 'wav_path' in locals() and wav_path != tmp_path:
                os.unlink(wav_path)
        except:
            pass


@app.post("/api/scribe/normalize")
async def normalize_text(request: NormalizationRequest):
    """
    Normalize medical text.
    
    Handles:
    - Number words → digits (do din → 2 days)
    - Frequencies (din mein do baar → BD)
    - Drug names (Crocin → Paracetamol)
    - Vitals standardization
    """
    start_time = time.time()
    
    result = normalize_medical_text(request.text, request.language)
    
    processing_time = time.time() - start_time
    
    # Audit log
    audit.log("normalization", {
        "input_length": len(request.text),
        "changes_count": len(result.changes),
        "confidence": result.confidence,
    })
    
    return {
        "success": True,
        "original_text": result.original_text,
        "normalized_text": result.normalized_text,
        "changes": result.changes,
        "confidence": result.confidence,
        "language": result.language_detected,
        "processing_time": processing_time,
    }


@app.post("/api/scribe/prescription")
async def generate_prescription(request: PrescriptionRequest):
    """Generate OPD prescription from transcript with safety metadata."""
    start_time = time.time()
    normalized = normalize_medical_text(request.transcript)
    llm = get_llm_engine()
    result = await asyncio.to_thread(
        llm.format_prescription,
        normalized.normalized_text,
        patient_info={
            "name": request.patient_name,
            "age": request.patient_age,
            "gender": request.patient_gender,
        }
    )
    total_time = time.time() - start_time

    audit.log("prescription_generation", {
        "input_length": len(request.transcript),
        "success": result.get("success"),
        "generation_time": result.get("generation_time"),
    })

    if result.get("success"):
        return build_document_response("prescription", request.transcript, normalized, result, total_time)
    raise HTTPException(500, result.get("error", "Generation failed"))


@app.post("/api/scribe/opd-notes")
async def generate_opd_notes(request: OPDNotesRequest):
    """Generate OPD clinical notes from transcript with safety metadata."""
    start_time = time.time()
    normalized = normalize_medical_text(request.transcript)
    llm = get_llm_engine()
    result = await asyncio.to_thread(llm.format_opd_notes, normalized.normalized_text, request.patient_info)
    total_time = time.time() - start_time

    audit.log("opd_notes_generation", {
        "input_length": len(request.transcript),
        "success": result.get("success"),
    })

    if result.get("success"):
        return build_document_response("opd_notes", request.transcript, normalized, result, total_time)
    raise HTTPException(500, result.get("error", "Generation failed"))


@app.post("/api/scribe/discharge")
async def generate_discharge_summary(request: DischargeSummaryRequest):
    """Generate discharge summary from transcript/notes with safety metadata."""
    start_time = time.time()
    normalized = normalize_medical_text(request.transcript)
    llm = get_llm_engine()
    result = await asyncio.to_thread(llm.format_discharge_summary, normalized.normalized_text, request.patient_info)
    total_time = time.time() - start_time

    audit.log("discharge_summary_generation", {
        "input_length": len(request.transcript),
        "success": result.get("success"),
    })

    if result.get("success"):
        return build_document_response("discharge_summary", request.transcript, normalized, result, total_time)
    raise HTTPException(500, result.get("error", "Generation failed"))


@app.post("/api/scribe/ipd-notes")
async def generate_ipd_notes(request: IPDNotesRequest):
    """Generate IPD daily progress notes from round dictation with safety metadata."""
    start_time = time.time()
    normalized = normalize_medical_text(request.transcript)
    llm = get_llm_engine()
    result = await asyncio.to_thread(llm.format_ipd_notes, normalized.normalized_text, request.patient_info)
    total_time = time.time() - start_time

    audit.log("ipd_notes_generation", {
        "input_length": len(request.transcript),
        "success": result.get("success"),
    })

    if result.get("success"):
        return build_document_response("ipd_notes", request.transcript, normalized, result, total_time)
    raise HTTPException(500, result.get("error", "Generation failed"))


@app.post("/api/scribe/full-pipeline")
async def full_pipeline(
    file: UploadFile = File(...),
    document_type: str = Form("prescription"),
    language: str = Form("auto"),
    patient_name: str = Form(None),
    patient_age: str = Form(None),
    patient_gender: str = Form(None),
):
    """
    Full audio-to-document pipeline.
    
    Steps:
    1. Transcribe audio (Whisper)
    2. Normalize text
    3. Generate document (Indic-Gemma)
    4. Apply template
    5. Return for doctor review
    """
    pipeline_start = time.time()
    
    # Step 1: Transcribe
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        processor = AudioProcessor()
        wav_path = processor.convert_to_wav(tmp_path)
        
        stt = get_stt_service()
        transcription = await asyncio.to_thread(stt.transcribe, wav_path, language=language)
        
        if not transcription["success"]:
            raise HTTPException(500, f"Transcription failed: {transcription.get('error')}")
        
        # Step 2: Normalize
        normalized = normalize_medical_text(transcription["text"])
        
        # Step 3: Generate document
        llm = get_llm_engine()
        patient_info = {
            "name": patient_name,
            "age": patient_age,
            "gender": patient_gender,
        }
        
        if document_type == "prescription":
            result = llm.format_prescription(normalized.normalized_text, patient_info)
        elif document_type == "opd_notes":
            result = llm.format_opd_notes(normalized.normalized_text, patient_info)
        elif document_type == "discharge_summary":
            result = llm.format_discharge_summary(normalized.normalized_text, patient_info)
        elif document_type == "ipd_notes":
            result = llm.format_ipd_notes(normalized.normalized_text, patient_info)
        else:
            raise HTTPException(400, f"Unknown document type: {document_type}")
        
        pipeline_time = time.time() - pipeline_start
        
        # Audit log
        audit.log("full_pipeline", {
            "document_type": document_type,
            "audio_duration": transcription.get("audio_duration"),
            "total_time": pipeline_time,
            "success": result.get("success"),
        })
        
        if result.get("success"):
            response = build_document_response(
                document_type,
                transcription["text"],
                normalized,
                result,
                pipeline_time,
                transcription=transcription,
            )
            response["total_pipeline_time"] = pipeline_time
            response["normalization_changes"] = normalized.changes
            return response
        raise HTTPException(500, result.get("error", "Generation failed"))
    
    finally:
        # Cleanup
        try:
            os.unlink(tmp_path)
            if 'wav_path' in locals() and wav_path != tmp_path:
                os.unlink(wav_path)
        except:
            pass



async def _run_full_pipeline_from_path(
    audio_path: str,
    filename: str,
    document_type: str,
    language: str,
    patient_name: Optional[str] = None,
    patient_age: Optional[str] = None,
    patient_gender: Optional[str] = None,
) -> Dict[str, Any]:
    pipeline_start = time.time()
    file_ext = Path(filename).suffix.lower() or ".wav"
    tmp_path = audio_path
    wav_path = tmp_path

    processor = AudioProcessor()
    if file_ext != ".wav":
        wav_path = await asyncio.to_thread(processor.convert_to_wav, tmp_path)

    stt = get_stt_service()
    transcription = await asyncio.to_thread(stt.transcribe, wav_path, language=language)
    if not transcription.get("success"):
        raise RuntimeError(f"Transcription failed: {transcription.get('error')}")

    normalized = normalize_medical_text(transcription["text"])
    llm = get_llm_engine()
    patient_info = {"name": patient_name, "age": patient_age, "gender": patient_gender}

    if document_type == "prescription":
        result = await asyncio.to_thread(llm.format_prescription, normalized.normalized_text, patient_info)
    elif document_type == "opd_notes":
        result = await asyncio.to_thread(llm.format_opd_notes, normalized.normalized_text, patient_info)
    elif document_type == "discharge_summary":
        result = await asyncio.to_thread(llm.format_discharge_summary, normalized.normalized_text, patient_info)
    elif document_type == "ipd_notes":
        result = await asyncio.to_thread(llm.format_ipd_notes, normalized.normalized_text, patient_info)
    else:
        raise ValueError(f"Unknown document type: {document_type}")

    if not result.get("success"):
        raise RuntimeError(result.get("error", "Generation failed"))

    pipeline_time = time.time() - pipeline_start
    response = build_document_response(
        document_type,
        transcription["text"],
        normalized,
        result,
        pipeline_time,
        transcription=transcription,
    )
    response["total_pipeline_time"] = pipeline_time
    response["normalization_changes"] = normalized.changes
    return response


async def _process_full_pipeline_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return
    job.update({"status": "running", "started_at": time.time(), "updated_at": time.time(), "progress": 10})
    try:
        result = await _run_full_pipeline_from_path(
            job["file_path"],
            job["filename"],
            job["document_type"],
            job["language"],
            job.get("patient_name"),
            job.get("patient_age"),
            job.get("patient_gender"),
        )
        job.update({
            "status": "completed",
            "progress": 100,
            "result": result,
            "completed_at": time.time(),
            "updated_at": time.time(),
        })
        audit.log("full_pipeline_job_completed", {"job_id": job_id, "document_type": job["document_type"]})
    except Exception as error:
        logger.exception("Full-pipeline job failed: %s", job_id)
        job.update({
            "status": "failed",
            "progress": 100,
            "error": str(error),
            "completed_at": time.time(),
            "updated_at": time.time(),
        })
        audit.log("full_pipeline_job_failed", {"job_id": job_id, "error": str(error)})
    finally:
        try:
            Path(job["file_path"]).unlink(missing_ok=True)
        except Exception:
            pass


@app.post("/api/scribe/jobs/full-pipeline")
async def create_full_pipeline_job(
    file: UploadFile = File(...),
    document_type: str = Form("prescription"),
    language: str = Form("auto"),
    patient_name: str = Form(None),
    patient_age: str = Form(None),
    patient_gender: str = Form(None),
):
    """Create an async audio-to-document job for longer recordings."""
    _cleanup_old_jobs()
    allowed_extensions = [".wav", ".mp3", ".m4a", ".ogg", ".webm"]
    file_ext = Path(file.filename or "audio.wav").suffix.lower() or ".wav"
    if file_ext not in allowed_extensions:
        raise HTTPException(400, f"Invalid file type. Allowed: {allowed_extensions}")

    normalized_doc_type = document_type
    if normalized_doc_type == "discharge":
        normalized_doc_type = "discharge_summary"
    if normalized_doc_type not in {"prescription", "opd_notes", "ipd_notes", "discharge_summary"}:
        raise HTTPException(400, f"Unknown document type: {document_type}")

    job_id = str(uuid.uuid4())
    target = JOB_DIR / f"{job_id}{file_ext}"
    with target.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "filename": file.filename or target.name,
        "file_path": str(target),
        "document_type": normalized_doc_type,
        "language": normalize_transcription_language(language),
        "patient_name": patient_name,
        "patient_age": patient_age,
        "patient_gender": patient_gender,
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    asyncio.create_task(_process_full_pipeline_job(job_id))
    audit.log("full_pipeline_job_created", {"job_id": job_id, "document_type": normalized_doc_type})
    return {
        "success": True,
        "job_id": job_id,
        "status": "queued",
        "poll_url": f"/api/scribe/jobs/{job_id}",
        "disclaimer": COMPLIANCE_DISCLAIMER,
    }


@app.get("/api/scribe/jobs/{job_id}")
async def get_scribe_job(job_id: str):
    """Get async Scribe job status and result."""
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found or expired")
    public = {k: v for k, v in job.items() if k != "file_path"}
    return public


# =============================================================================
# OFFLINE SLM CHAT FALLBACK
# Allows main SIB server to use local Indic-Gemma as final fallback when
# all cloud providers (iSHA / Groq / OpenAI) are unavailable.
# =============================================================================

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant' or 'system'")
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="OpenAI-compatible messages array")
    max_tokens: int = Field(512, ge=32, le=1024, description="Max tokens to generate")
    temperature: float = Field(0.5, ge=0.0, le=1.0)

class ChatResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    content: str
    model: str = "indic-gemma-2b-navarasa"
    finish_reason: str = "stop"
    usage: Dict[str, int]

@app.post("/api/chat", response_model=ChatResponse)
async def offline_chat(request: ChatRequest):
    """
    Offline SLM chat endpoint (OpenAI-compatible subset).
    Uses the local Indic-Gemma-2B model for last-resort fallback when
    cloud AI providers are unreachable.

    Limitations:
    - 2B parameter model; answers short questions best
    - No tool calling
    - Responds in English / Hinglish
    """
    start = time.time()

    try:
        llm = get_llm_engine()

        # Build a plain text prompt from messages
        prompt_parts = []
        system_text = ""
        for msg in request.messages:
            if msg.role == "system":
                system_text = msg.content.strip()
            elif msg.role == "user":
                prompt_parts.append(f"<start_of_turn>user\n{msg.content.strip()}<end_of_turn>")
            elif msg.role == "assistant":
                prompt_parts.append(f"<start_of_turn>model\n{msg.content.strip()}<end_of_turn>")

        if system_text:
            prompt_parts.insert(0, f"<start_of_turn>user\nContext: {system_text}<end_of_turn>")

        prompt_parts.append("<start_of_turn>model\n")
        prompt = "\n".join(prompt_parts)

        # Generate
        raw = llm.llm.create_completion(
            prompt=prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            stop=["<end_of_turn>", "<start_of_turn>user", "\n\n\n", "###"],
            repeat_penalty=1.35,
            echo=False,
        )

        content = raw["choices"][0]["text"].strip()
        tokens_in  = raw.get("usage", {}).get("prompt_tokens", 0)
        tokens_out = raw.get("usage", {}).get("completion_tokens", 0)

        latency_ms = int((time.time() - start) * 1000)
        logger.info(f"[offline-chat] Generated {tokens_out} tokens in {latency_ms}ms")

        audit.log("offline_chat", {
            "prompt_length": len(prompt),
            "tokens_out": tokens_out,
            "latency_ms": latency_ms,
        })

        return ChatResponse(
            id=f"slm-{int(time.time())}",
            content=content,
            usage={"prompt_tokens": tokens_in, "completion_tokens": tokens_out, "total_tokens": tokens_in + tokens_out},
        )

    except Exception as e:
        logger.error(f"[offline-chat] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Local SLM error: {str(e)}")


# =============================================================================
# STARTUP/SHUTDOWN
# =============================================================================

@app.on_event("startup")
async def startup():
    """Initialize services on startup"""
    logger.info("Starting Mediczy Offline AI Scribe...")
    
    # Pre-load models
    logger.info("Pre-loading models...")
    get_stt_service()  # Load Whisper
    get_llm_engine()   # Load Indic-Gemma
    
    logger.info("✅ Mediczy Offline AI Scribe ready!")


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    logger.info("Shutting down Mediczy Offline AI Scribe...")


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=SERVICE_HOST,
        port=SERVICE_PORT,
        reload=False,
        workers=1,  # Single worker for model loading
        log_level="info",
    )
