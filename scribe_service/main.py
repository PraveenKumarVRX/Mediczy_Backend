from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import numpy as np
import logging
from pathlib import Path
from typing import Optional, List
import json
import time
import re
import requests

# Optional imports (only load if GPU mode)
try:
    import aiofiles
except ImportError:
    aiofiles = None

try:
    import torch
except ImportError:
    torch = None

try:
    import whisper
except ImportError:
    whisper = None

try:
    from llama_cpp import Llama
except ImportError:
    Llama = None

try:
    import httpx
except ImportError:
    httpx = None

# Import configuration
from config import GPU_MODE, REMOTE_GPU_BASE_URL, print_config
from config import BIMEDIX_TEMPERATURE, BIMEDIX_TOP_P, BIMEDIX_TOP_K, BIMEDIX_REPEAT_PENALTY
from config import REQUEST_TIMEOUT, LOG_LEVEL

# Import custom services (always available)
from services.abbreviation_service import AbbreviationExpander
from services.template_service import SpecialtyTemplateManager

# Configure logging
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger(__name__)

# Print configuration on startup
print_config()

app = FastAPI(
    title="Medical Scribe API",
    description="GPU-powered medical speech-to-text with Bimedix LLM + Medical DB + Templates",
    version="2.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# GLOBAL MODELS (Loaded once on startup)
# ============================================================================

class ModelManager:
    def __init__(self):
        self.gpu_mode = GPU_MODE
        self.remote_gpu_url = REMOTE_GPU_BASE_URL
        self.gpu_available = torch is not None and torch.cuda.is_available() if torch else False
        self.device = "cuda" if self.gpu_available else "cpu"
        self.whisper_model = None
        self.bimedix_model = None
        self.abbreviation_expander = None
        self.template_manager = None
        self.http_client = None
        if httpx:
            self.http_client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
        self.load_models()
    
    def load_models(self):
        """Load models on startup (optional - core services don't need GPU)"""
        logger.info(f"Loading services (GPU Mode: {self.gpu_mode}, GPU Available: {self.gpu_available})...")
        
        # Always load local abbreviation and template services (no GPU needed)
        logger.info("Loading medical abbreviation database...")
        self.abbreviation_expander = AbbreviationExpander()
        logger.info("✓ Abbreviation database loaded (228+ abbreviations)")
        
        logger.info("Loading specialty templates...")
        self.template_manager = SpecialtyTemplateManager()
        specialties = self.template_manager.get_all_specialties()
        logger.info(f"✓ {len(specialties)} specialty templates loaded")
        
        # Only load GPU models if available and not in remote mode
        if self.gpu_available and self.gpu_mode == "local":
            try:
                self._load_local_models()
            except Exception as e:
                logger.warning(f"Could not load local GPU models: {e}")
                logger.info("Core medical services (abbreviations, templates, ICD-10) remain available")
        elif self.gpu_mode == "remote":
            try:
                self._load_remote_gpu_models()
            except Exception as e:
                logger.warning(f"Could not connect to remote GPU: {e}")
                logger.info("Core medical services (abbreviations, templates, ICD-10) remain available")
        else:
            logger.info("Running in CPU-only mode (abbreviations, templates, ICD-10 available)")
    
    def _load_local_models(self):
        """Load GPU models locally (optional)"""
        if not whisper or not Llama:
            logger.warning("Whisper or Llama not available, skipping GPU model loading")
            return
            
        logger.info("[LOCAL GPU MODE] Loading GPU models...")
        
        # Load Whisper (optional)
        if whisper:
            try:
                logger.info("Loading Whisper model...")
                self.whisper_model = whisper.load_model("base", device=self.device)
                logger.info(f"✓ Whisper loaded on {self.device}")
            except Exception as e:
                logger.warning(f"Could not load Whisper: {e}")
        
        # Load Bimedix.gguf (optional)
        if Llama:
            try:
                logger.info("Loading Bimedix.gguf model...")
                from config import BIMEDIX_MODEL_PATH, BIMEDIX_N_GPU_LAYERS, BIMEDIX_N_CTX, BIMEDIX_N_THREADS
                self.bimedix_model = Llama(
                    model_path=BIMEDIX_MODEL_PATH,
                    n_gpu_layers=BIMEDIX_N_GPU_LAYERS,
                    n_ctx=BIMEDIX_N_CTX,
                    n_threads=BIMEDIX_N_THREADS,
                    verbose=False
                )
                logger.info("✓ Bimedix.gguf loaded")
            except Exception as e:
                logger.warning(f"Could not load Bimedix.gguf: {e}")
    
    def _load_remote_gpu_models(self):
        """Connect to remote GPU service (optional)"""
        logger.info(f"[REMOTE GPU MODE] Attempting to connect to GPU at {self.remote_gpu_url}...")
        
        try:
            response = requests.get(f"{self.remote_gpu_url}/api/scribe/health", timeout=10)
            if response.status_code == 200:
                health = response.json()
                logger.info(f"✓ Connected to remote GPU service")
                self.bimedix_model = "remote"  # Marker for remote
                self.whisper_model = "remote"  # Marker for remote
            else:
                logger.warning(f"Remote GPU health check failed: {response.status_code}")
        except Exception as e:
            logger.warning(f"Could not connect to remote GPU: {e}")
    
    async def transcribe_remote(self, audio_path: str, field_name: str = "diagnosis"):
        """Send transcription request to remote GPU service"""
        try:
            async with aiofiles.open(audio_path, 'rb') as f:
                audio_content = await f.read()
            
            files = {'file': ('audio.wav', audio_content, 'audio/wav')}
            params = {'field_name': field_name}
            
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                response = await client.post(
                    f"{self.remote_gpu_url}/api/scribe/transcribe",
                    files=files,
                    params=params
                )
            
            if response.status_code == 200:
                return response.json()
            else:
                raise Exception(f"Remote transcription failed: {response.status_code}")
        except Exception as e:
            logger.error(f"Remote transcription error: {e}")
            raise
    
    async def process_medical_text_remote(self, text: str, patient_context: Optional[dict] = None):
        """Send medical text processing request to remote GPU service"""
        try:
            payload = {
                "text": text,
                "patient_context": patient_context or {}
            }
            
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                response = await client.post(
                    f"{self.remote_gpu_url}/api/scribe/process-medical-text",
                    json=payload
                )
            
            if response.status_code == 200:
                return response.json()
            else:
                raise Exception(f"Remote processing failed: {response.status_code}")
        except Exception as e:
            logger.error(f"Remote medical processing error: {e}")
            raise

# Initialize models
models = ModelManager()

# ============================================================================
# SPEECH-TO-TEXT ENDPOINT
# ============================================================================

@app.post("/api/scribe/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    field_name: str = "diagnosis"
):
    """
    Transcribe audio using Whisper
    Supports both local GPU and remote GPU (isha.buzz:8080)
    """
    try:
        logger.info(f"Transcribing audio for field: {field_name} (Mode: {models.gpu_mode})")
        
        # Save audio temporarily
        audio_path = f"/tmp/audio_{int(time.time())}.wav"
        async with aiofiles.open(audio_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        start_time = time.time()
        
        # Use remote GPU if configured
        if models.gpu_mode == "remote" and models.whisper_model == "remote":
            logger.info(f"Sending transcription request to {models.remote_gpu_url}/api/scribe/transcribe")
            result = await models.transcribe_remote(audio_path, field_name)
            transcribe_time = time.time() - start_time
        else:
            # Local transcription
            logger.info("Transcribing locally...")
            result = models.whisper_model.transcribe(
                audio_path,
                language="en",
                task="transcribe",
                verbose=False,
                fp16=True
            )
            transcribe_time = time.time() - start_time
        
        raw_text = result.get("transcription") or result.get("text", "").strip()
        logger.info(f"Transcription completed in {transcribe_time:.2f}s")
        
        # Clean up
        Path(audio_path).unlink()
        
        return {
            "success": True,
            "transcription": raw_text,
            "duration": result.get("duration", 0),
            "language": result.get("language", "en"),
            "processing_time": transcribe_time,
            "field": field_name,
            "gpu_mode": models.gpu_mode
        }
    
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# ABBREVIATION EXPANSION ENDPOINT
# ============================================================================

@app.post("/api/scribe/expand-abbreviations")
async def expand_abbreviations(text: str):
    """
    Expand medical abbreviations in text
    HTN → Hypertension, DM → Diabetes Mellitus, etc.
    """
    try:
        logger.info("Expanding medical abbreviations...")
        
        # Get comprehensive medical context
        context = models.abbreviation_expander.get_medical_context(text)
        
        return {
            "success": True,
            "original_text": context["original_text"],
            "expanded_text": context["expanded_text"],
            "normalized_text": context["normalized_text"],
            "abbreviations_found": context["abbreviations"],
            "abbreviation_categories": context["abbreviation_categories"],
            "icd10_suggestions": context["icd10_codes"],
            "statistics": {
                "abbreviation_count": context["abbreviation_count"],
                "icd10_count": context["icd10_count"]
            }
        }
    
    except Exception as e:
        logger.error(f"Abbreviation expansion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# MEDICAL TEXT PROCESSING WITH BIMEDIX
# ============================================================================

@app.post("/api/scribe/process-medical-text")
async def process_medical_text(
    text: str,
    patient_context: Optional[dict] = None
):
    """
    Process transcribed text with Bimedix LLM for medical enhancement
    Supports both local GPU and remote GPU (isha.buzz:8080)
    
    Features:
    - Expand abbreviations
    - Correct common speech-to-text errors
    - Suggest clinical codes
    - Validate medical content
    """
    try:
        logger.info(f"Processing medical text with Bimedix (Mode: {models.gpu_mode})...")
        
        # Step 1: Expand abbreviations locally (always)
        abbrev_context = models.abbreviation_expander.get_medical_context(text)
        expanded_text = abbrev_context["expanded_text"]
        
        start_time = time.time()
        
        # Step 2: Use Bimedix for medical text enhancement
        if models.gpu_mode == "remote" and models.bimedix_model == "remote":
            logger.info(f"Sending to remote Bimedix at {models.remote_gpu_url}")
            response = await models.process_medical_text_remote(text, patient_context)
            enhanced_text = response.get("enhanced_text", expanded_text)
        else:
            # Local Bimedix processing
            logger.info("Processing with local Bimedix model...")
            prompt = f"""You are a medical documentation expert. Enhance and correct the following clinical note:

Original text: {text}

Please:
1. Correct any medical terminology errors
2. Expand abbreviations (if not already done)
3. Improve clarity and structure
4. Add missing medical context if obvious
5. Ensure proper punctuation and grammar
6. Keep it concise and professional

Enhanced text:"""
            
            response = models.bimedix_model(
                prompt,
                max_tokens=1024,
                temperature=BIMEDIX_TEMPERATURE,
                top_p=BIMEDIX_TOP_P,
                top_k=BIMEDIX_TOP_K,
                repeat_penalty=BIMEDIX_REPEAT_PENALTY,
                echo=False
            )
            enhanced_text = response["choices"][0]["text"].strip()
        
        llm_time = time.time() - start_time
        
        logger.info(f"Medical processing completed in {llm_time:.2f}s")
        
        return {
            "success": True,
            "original_text": text,
            "expanded_text": expanded_text,
            "enhanced_text": enhanced_text,
            "abbreviations": abbrev_context["abbreviations"],
            "icd10_codes": abbrev_context["icd10_codes"],
            "processing_time": llm_time,
            "model": "Bimedix",
            "gpu_mode": models.gpu_mode
        }
    
    except Exception as e:
        logger.error(f"Medical processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# SPECIALTY TEMPLATES ENDPOINT
# ============================================================================

@app.get("/api/scribe/specialties")
async def get_specialties():
    """Get list of all available medical specialties"""
    return {
        "success": True,
        "specialties": models.template_manager.get_all_specialties()
    }

@app.get("/api/scribe/template/{specialty}")
async def get_specialty_template(specialty: str):
    """
    Get discharge summary template for a specialty
    
    Example: GET /api/scribe/template/cardiology
    """
    try:
        template_data = models.template_manager.generate_template_structure(specialty)
        
        if not template_data:
            raise HTTPException(
                status_code=404,
                detail=f"Specialty '{specialty}' not found. Available: {models.template_manager.get_all_specialties()}"
            )
        
        return {
            "success": True,
            "template": template_data
        }
    
    except Exception as e:
        logger.error(f"Template retrieval error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# COMPLETE DISCHARGE SUMMARY GENERATION WITH SPECIALTY
# ============================================================================

@app.post("/api/scribe/generate-discharge-summary")
async def generate_discharge_summary(
    clinical_data: dict,
    specialty: str = Query("general_medicine"),
    background_tasks: BackgroundTasks = None
):
    """
    Generate complete discharge summary from structured clinical data
    with specialty-specific template
    
    Expected input:
    {
        "patient_name": "John Doe",
        "patient_id": "P12345",
        "admission_date": "2026-01-20",
        "discharge_date": "2026-01-29",
        "ward": "Cardiology",
        "bed": "ICU-05",
        "attending_doctor": "Dr. Sharma",
        "specialty": "cardiology",
        "diagnosis": "Acute MI",
        "chief_complaints": "Chest pain...",
        "examination": "BP 160/95...",
        "investigations": "ECG showed...",
        "treatment": "Aspirin, heparin...",
        "medications": "Aspirin 100mg daily...",
        "diet_advice": "Low fat diet...",
        "follow_up": "OPD review in 2 weeks..."
    }
    """
    try:
        logger.info(f"Generating discharge summary for specialty: {specialty}")
        
        # Get specialty template
        template = models.template_manager.get_template(specialty)
        if not template:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid specialty. Available: {models.template_manager.get_all_specialties()}"
            )
        
        # Build structured summary with specialty context
        prompt = f"""Generate a professional medical discharge summary for {specialty} based on the following clinical data:

Patient: {clinical_data.get('patient_name')} (ID: {clinical_data.get('patient_id')})
Admission: {clinical_data.get('admission_date')} | Discharge: {clinical_data.get('discharge_date')}
Ward: {clinical_data.get('ward')} | Bed: {clinical_data.get('bed')}
Attending Doctor: {clinical_data.get('attending_doctor')}

SPECIALTY-SPECIFIC TEMPLATE SECTIONS:
{json.dumps(template.sections, indent=2)}

KEY INVESTIGATIONS FOR {specialty.upper()}:
{', '.join(template.key_investigations[:5])}

DISCHARGE PRECAUTIONS:
{', '.join(template.discharge_precautions[:3])}

CLINICAL DATA:
- Diagnosis: {clinical_data.get('diagnosis')}
- Chief Complaints: {clinical_data.get('chief_complaints')}
- Physical Examination: {clinical_data.get('examination')}
- Investigations Performed: {clinical_data.get('investigations')}
- Treatment Provided: {clinical_data.get('treatment')}
- Discharge Medications: {clinical_data.get('medications')}
- Diet Advice: {clinical_data.get('diet_advice')}
- Follow-up Plan: {clinical_data.get('follow_up')}

INSTRUCTIONS:
1. Use the specialty-specific template sections above
2. Include all relevant investigations mentioned
3. Reference the discharge precautions
4. Format as a professional medical discharge summary
5. Include all required sections for {specialty}

Generate the discharge summary:"""
        
        start_time = time.time()
        
        response = models.bimedix_model(
            prompt,
            max_tokens=2048,
            temperature=0.2,
            top_p=0.95,
            repeat_penalty=1.1,
            echo=False
        )
        
        summary_time = time.time() - start_time
        
        formatted_summary = response["choices"][0]["text"].strip()
        
        # Extract and expand abbreviations in final summary
        abbrev_context = models.abbreviation_expander.get_medical_context(formatted_summary)
        
        # Get ICD-10 codes from the entire summary
        all_text = " ".join([
            clinical_data.get('diagnosis', ''),
            clinical_data.get('chief_complaints', ''),
            clinical_data.get('examination', '')
        ])
        
        logger.info(f"Summary generated in {summary_time:.2f}s for specialty: {specialty}")
        
        return {
            "success": True,
            "summary": formatted_summary,
            "expanded_summary": abbrev_context["expanded_text"],
            "specialty": specialty,
            "template_used": template.specialty.value,
            "abbreviations": abbrev_context["abbreviations"],
            "icd10_codes": abbrev_context["icd10_codes"],
            "key_investigations": template.key_investigations[:5],
            "discharge_precautions": template.discharge_precautions,
            "follow_up_timeline": template.follow_up_timeline,
            "patient_id": clinical_data.get('patient_id'),
            "generation_time": summary_time,
            "status": "draft"
        }
    
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# COMPREHENSIVE TEXT ANALYSIS
# ============================================================================

@app.post("/api/scribe/analyze-text")
async def analyze_clinical_text(text: str):
    """
    Comprehensive analysis of clinical text
    - Abbreviations and expansions
    - Medical entity recognition
    - ICD-10 code suggestions
    - Normalized medical values
    """
    try:
        logger.info("Performing comprehensive text analysis...")
        
        context = models.abbreviation_expander.get_medical_context(text)
        
        return {
            "success": True,
            "analysis": {
                "original_text": context["original_text"],
                "expanded_text": context["expanded_text"],
                "normalized_text": context["normalized_text"],
                "abbreviations": context["abbreviations"],
                "abbreviation_categories": context["abbreviation_categories"],
                "icd10_codes": context["icd10_codes"],
                "statistics": {
                    "abbreviations_found": context["abbreviation_count"],
                    "icd10_codes_suggested": context["icd10_count"],
                    "text_length": len(text),
                    "expanded_length": len(context["expanded_text"])
                }
            }
        }
    
    except Exception as e:
        logger.error(f"Text analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# HEALTH & DIAGNOSTICS
# ============================================================================

@app.get("/api/scribe/health")
async def health_check():
    """Check GPU and model status"""
    
    if models.gpu_mode == "remote":
        try:
            response = requests.get(f"{models.remote_gpu_url}/api/scribe/health", timeout=10)
            if response.status_code == 200:
                remote_health = response.json()
                return {
                    "status": "healthy",
                    "timestamp": time.time(),
                    "gpu_mode": "remote",
                    "gpu_url": models.remote_gpu_url,
                    "remote_gpu": remote_health.get("gpu", {}),
                    "models": remote_health.get("models", {}),
                    "device": "remote",
                    "features": [
                        "speech-to-text",
                        "abbreviation-expansion",
                        "medical-text-enhancement",
                        "specialty-templates",
                        "icd10-suggestions",
                        "discharge-summary-generation"
                    ],
                    "local_services": [
                        "abbreviation-expansion",
                        "template-management",
                        "icd10-suggestions"
                    ]
                }
        except Exception as e:
            logger.error(f"Failed to reach remote GPU: {e}")
            return {
                "status": "degraded",
                "gpu_mode": "remote",
                "gpu_url": models.remote_gpu_url,
                "error": f"Cannot reach remote GPU: {str(e)}",
                "device": "remote"
            }
    else:
        # Local GPU mode
        gpu_info = {
            "available": torch.cuda.is_available(),
            "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None",
            "memory_allocated": f"{torch.cuda.memory_allocated(0) / 1024**3:.2f} GB" if torch.cuda.is_available() else "N/A",
            "memory_total": f"{torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB" if torch.cuda.is_available() else "N/A",
        }
        
        return {
            "status": "healthy",
            "timestamp": time.time(),
            "gpu_mode": "local",
            "gpu": gpu_info,
            "models": {
                "whisper": "loaded",
                "bimedix": "loaded",
                "abbreviation_db": "loaded",
                "templates": f"{len(models.template_manager.get_all_specialties())} specialties"
            },
            "device": str(models.device),
            "features": [
                "speech-to-text",
                "abbreviation-expansion",
                "medical-text-enhancement",
                "specialty-templates",
                "icd10-suggestions",
                "discharge-summary-generation"
            ]
        }

@app.get("/api/scribe/gpu-stats")
async def gpu_stats():
    """Get detailed GPU statistics"""
    if not torch.cuda.is_available():
        return {"error": "CUDA not available"}
    
    return {
        "device": torch.cuda.get_device_name(0),
        "memory": {
            "allocated_mb": torch.cuda.memory_allocated(0) / 1024**2,
            "reserved_mb": torch.cuda.memory_reserved(0) / 1024**2,
            "total_mb": torch.cuda.get_device_properties(0).total_memory / 1024**2
        },
        "compute_capability": torch.cuda.get_device_capability(0)
    }

@app.get("/api/scribe/stats")
async def service_stats():
    """Get service statistics and capabilities"""
    return {
        "gpu_configuration": {
            "mode": models.gpu_mode,
            "remote_url": models.remote_gpu_url if models.gpu_mode == "remote" else None,
            "device": str(models.device) if models.gpu_mode == "local" else "remote"
        },
        "specialties": models.template_manager.get_all_specialties(),
        "total_specialties": len(models.template_manager.get_all_specialties()),
        "medical_abbreviations": len(models.abbreviation_expander.abbreviations),
        "icd10_mappings": len([item for sublist in models.abbreviation_expander.db.get("icd10_mappings", {}).values() for item in sublist]),
        "version": "2.1.0",
        "features": [
            "Whisper speech-to-text (local or remote)",
            "Bimedix medical LLM (local or remote)",
            "Medical abbreviation database (Indian)",
            "14+ medical specialties",
            "ICD-10 code suggestions",
            "Specialty-specific discharge templates",
            "Text normalization",
            "Medical entity recognition"
        ],
        "supported_specialties": [
            "Cardiology", "Orthopedics", "Neurology", "Respiratory",
            "Gastroenterology", "Nephrology", "Endocrinology",
            "General Medicine", "Surgery", "Pediatrics",
            "Obstetrics", "Psychiatry", "Oncology", "Intensive Care"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    from config import SERVICE_HOST, SERVICE_PORT
    uvicorn.run(app, host=SERVICE_HOST, port=SERVICE_PORT, log_level="info")
