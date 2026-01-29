from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import aiofiles
import asyncio
import torch
import whisper
from llama_cpp import Llama
import numpy as np
import logging
from pathlib import Path
from typing import Optional, List
import json
import time
import re

# Import custom services
from services.abbreviation_service import AbbreviationExpander
from services.template_service import SpecialtyTemplateManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.whisper_model = None
        self.bimedix_model = None
        self.abbreviation_expander = None
        self.template_manager = None
        self.load_models()
    
    def load_models(self):
        """Load all models on startup"""
        logger.info("Loading models...")
        
        # Load Whisper
        logger.info("Loading Whisper model...")
        self.whisper_model = whisper.load_model("base", device=self.device)
        logger.info(f"✓ Whisper loaded on {self.device}")
        
        # Load Bimedix.gguf
        logger.info("Loading Bimedix.gguf model...")
        try:
            self.bimedix_model = Llama(
                model_path="/home/ubuntu/models/Bimedix.gguf",
                n_gpu_layers=-1,
                n_ctx=4096,
                n_threads=16,
                verbose=False
            )
            logger.info("✓ Bimedix.gguf loaded on GPU")
        except Exception as e:
            logger.error(f"Error loading Bimedix.gguf: {e}")
            raise
        
        # Load Abbreviation Expander
        logger.info("Loading medical abbreviation database...")
        self.abbreviation_expander = AbbreviationExpander()
        logger.info("✓ Abbreviation database loaded")
        
        # Load Template Manager
        logger.info("Loading specialty templates...")
        self.template_manager = SpecialtyTemplateManager()
        logger.info(f"✓ {len(self.template_manager.get_all_specialties())} specialty templates loaded")

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
    """
    try:
        logger.info(f"Transcribing audio for field: {field_name}")
        
        # Save audio temporarily
        audio_path = f"/tmp/audio_{int(time.time())}.wav"
        async with aiofiles.open(audio_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Transcribe with Whisper
        start_time = time.time()
        result = models.whisper_model.transcribe(
            audio_path,
            language="en",
            task="transcribe",
            verbose=False,
            fp16=True
        )
        transcribe_time = time.time() - start_time
        
        raw_text = result["text"].strip()
        logger.info(f"Transcription completed in {transcribe_time:.2f}s")
        
        # Clean up
        Path(audio_path).unlink()
        
        return {
            "success": True,
            "transcription": raw_text,
            "duration": result.get("duration", 0),
            "language": result.get("language", "en"),
            "processing_time": transcribe_time,
            "field": field_name
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
    - Expand abbreviations
    - Correct common speech-to-text errors
    - Suggest clinical codes
    - Validate medical content
    """
    try:
        logger.info("Processing medical text with Bimedix...")
        
        # Step 1: Expand abbreviations
        abbrev_context = models.abbreviation_expander.get_medical_context(text)
        expanded_text = abbrev_context["expanded_text"]
        
        # Step 2: Use Bimedix for medical text enhancement
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
        
        start_time = time.time()
        
        response = models.bimedix_model(
            prompt,
            max_tokens=1024,
            temperature=0.3,
            top_p=0.95,
            top_k=40,
            repeat_penalty=1.1,
            echo=False
        )
        
        llm_time = time.time() - start_time
        
        enhanced_text = response["choices"][0]["text"].strip()
        
        logger.info(f"Medical processing completed in {llm_time:.2f}s")
        
        return {
            "success": True,
            "original_text": text,
            "expanded_text": expanded_text,
            "enhanced_text": enhanced_text,
            "abbreviations": abbrev_context["abbreviations"],
            "icd10_codes": abbrev_context["icd10_codes"],
            "processing_time": llm_time,
            "model": "Bimedix"
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
    gpu_info = {
        "available": torch.cuda.is_available(),
        "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None",
        "memory_allocated": f"{torch.cuda.memory_allocated(0) / 1024**3:.2f} GB" if torch.cuda.is_available() else "N/A",
        "memory_total": f"{torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB" if torch.cuda.is_available() else "N/A",
    }
    
    return {
        "status": "healthy",
        "timestamp": time.time(),
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
        "specialties": models.template_manager.get_all_specialties(),
        "total_specialties": len(models.template_manager.get_all_specialties()),
        "medical_abbreviations": len(models.abbreviation_expander.abbreviations),
        "icd10_mappings": len([item for sublist in models.abbreviation_expander.db.get("icd10_mappings", {}).values() for item in sublist]),
        "version": "2.0.0",
        "features": [
            "Whisper speech-to-text",
            "Bimedix medical LLM",
            "Medical abbreviation database (Indian)",
            "14+ medical specialties",
            "ICD-10 code suggestions",
            "Specialty-specific discharge templates",
            "Text normalization",
            "Medical entity recognition"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
