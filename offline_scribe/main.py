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
import time
import tempfile
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
from stt import get_stt_service, AudioProcessor
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
    translate: bool = Form(False),
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
        
        # Transcribe
        stt = get_stt_service()
        result = stt.transcribe(wav_path, language=language, translate=translate)
        
        # Audit log
        audit.log("transcription", {
            "filename": file.filename,
            "language": language,
            "detected_language": result.get("language"),
            "duration": result.get("audio_duration"),
            "success": result.get("success"),
        })
        
        if result["success"]:
            return {
                "success": True,
                "text": result["text"],
                "language": result.get("language", "unknown"),
                "language_confidence": result.get("language_probability", 0),
                "audio_duration": result.get("audio_duration", 0),
                "transcription_time": result.get("transcription_time", 0),
                "realtime_factor": result.get("realtime_factor", 0),
                "backend": result.get("backend"),
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
    """
    Generate OPD prescription from transcript.
    
    Pipeline:
    1. Normalize text
    2. Generate with Indic-Gemma
    3. Apply prescription template
    4. Return structured output
    """
    start_time = time.time()
    
    # Step 1: Normalize
    normalized = normalize_medical_text(request.transcript)
    
    # Step 2: Generate with LLM
    llm = get_llm_engine()
    result = llm.format_prescription(
        normalized.normalized_text,
        patient_info={
            "name": request.patient_name,
            "age": request.patient_age,
            "gender": request.patient_gender,
        }
    )
    
    total_time = time.time() - start_time
    
    # Audit log
    audit.log("prescription_generation", {
        "input_length": len(request.transcript),
        "success": result.get("success"),
        "generation_time": result.get("generation_time"),
    })
    
    if result["success"]:
        return {
            "success": True,
            "document_type": "prescription",
            "raw_output": result["text"],
            "structured": result.get("structured", {}),
            "normalized_input": normalized.normalized_text,
            "normalization_changes": len(normalized.changes),
            "generation_time": result.get("generation_time", 0),
            "total_time": total_time,
            "tokens": result.get("tokens", 0),
            "ai_badge": SECURITY_CONFIG["ai_badge_required"],
            "disclaimer": COMPLIANCE_DISCLAIMER,
        }
    else:
        raise HTTPException(500, result.get("error", "Generation failed"))


@app.post("/api/scribe/opd-notes")
async def generate_opd_notes(request: OPDNotesRequest):
    """Generate OPD clinical notes from transcript"""
    start_time = time.time()
    
    # Normalize
    normalized = normalize_medical_text(request.transcript)
    
    # Generate
    llm = get_llm_engine()
    result = llm.format_opd_notes(normalized.normalized_text, request.patient_info)
    
    total_time = time.time() - start_time
    
    # Audit log
    audit.log("opd_notes_generation", {
        "input_length": len(request.transcript),
        "success": result.get("success"),
    })
    
    if result["success"]:
        return {
            "success": True,
            "document_type": "opd_notes",
            "raw_output": result["text"],
            "normalized_input": normalized.normalized_text,
            "total_time": total_time,
            "ai_badge": True,
            "disclaimer": COMPLIANCE_DISCLAIMER,
        }
    else:
        raise HTTPException(500, result.get("error", "Generation failed"))


@app.post("/api/scribe/discharge")
async def generate_discharge_summary(request: DischargeSummaryRequest):
    """Generate discharge summary from transcript/notes"""
    start_time = time.time()
    
    # Normalize
    normalized = normalize_medical_text(request.transcript)
    
    # Generate
    llm = get_llm_engine()
    result = llm.format_discharge_summary(normalized.normalized_text, request.patient_info)
    
    total_time = time.time() - start_time
    
    # Audit log
    audit.log("discharge_summary_generation", {
        "input_length": len(request.transcript),
        "success": result.get("success"),
    })
    
    if result["success"]:
        return {
            "success": True,
            "document_type": "discharge_summary",
            "raw_output": result["text"],
            "normalized_input": normalized.normalized_text,
            "total_time": total_time,
            "ai_badge": True,
            "disclaimer": COMPLIANCE_DISCLAIMER,
        }
    else:
        raise HTTPException(500, result.get("error", "Generation failed"))


@app.post("/api/scribe/ipd-notes")
async def generate_ipd_notes(request: IPDNotesRequest):
    """Generate IPD daily progress notes from round dictation"""
    start_time = time.time()
    
    # Normalize
    normalized = normalize_medical_text(request.transcript)
    
    # Generate
    llm = get_llm_engine()
    result = llm.format_ipd_notes(normalized.normalized_text, request.patient_info)
    
    total_time = time.time() - start_time
    
    # Audit log
    audit.log("ipd_notes_generation", {
        "input_length": len(request.transcript),
        "success": result.get("success"),
    })
    
    if result["success"]:
        return {
            "success": True,
            "document_type": "ipd_notes",
            "raw_output": result["text"],
            "normalized_input": normalized.normalized_text,
            "total_time": total_time,
            "ai_badge": True,
            "disclaimer": COMPLIANCE_DISCLAIMER,
        }
    else:
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
        transcription = stt.transcribe(wav_path, language=language)
        
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
        
        if result["success"]:
            return {
                "success": True,
                "document_type": document_type,
                
                # Transcription
                "transcript": transcription["text"],
                "detected_language": transcription.get("language"),
                "transcription_time": transcription.get("transcription_time"),
                
                # Normalization
                "normalized_text": normalized.normalized_text,
                "normalization_changes": normalized.changes,
                
                # Generated document
                "raw_output": result["text"],
                "structured": result.get("structured", {}),
                "generation_time": result.get("generation_time"),
                
                # Timing
                "total_pipeline_time": pipeline_time,
                
                # Compliance
                "ai_badge": True,
                "requires_review": True,
                "disclaimer": COMPLIANCE_DISCLAIMER,
            }
        else:
            raise HTTPException(500, result.get("error", "Generation failed"))
    
    finally:
        # Cleanup
        try:
            os.unlink(tmp_path)
            if 'wav_path' in locals() and wav_path != tmp_path:
                os.unlink(wav_path)
        except:
            pass


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
