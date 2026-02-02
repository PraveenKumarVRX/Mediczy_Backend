"""
Mediczy Offline AI Scribe - Configuration
Hospital-grade, CPU-only, fully offline
"""

import os
from typing import Literal
from pathlib import Path

# =============================================================================
# SERVICE CONFIGURATION
# =============================================================================
SERVICE_HOST = os.getenv("SCRIBE_HOST", "0.0.0.0")
SERVICE_PORT = int(os.getenv("SCRIBE_PORT", "8006"))
SERVICE_WORKERS = int(os.getenv("SCRIBE_WORKERS", "1"))  # Single worker for model loading
DEBUG = os.getenv("SCRIBE_DEBUG", "false").lower() == "true"

# =============================================================================
# MODEL PATHS
# =============================================================================
MODELS_DIR = Path(os.getenv("MODELS_DIR", "/home/ubuntu/models"))

# Indic-Gemma-2B-Navarasa (Q4_K_M quantized) - using existing model
INDIC_GEMMA_MODEL = Path(os.getenv(
    "INDIC_GEMMA_MODEL",
    "/home/ubuntu/Mediczy/ai-engine/doctor_bot/models/tinyllama/Indic-gemma-2b-finetuned-sft-Navarasa-2.0.Q4_K_M.gguf"
))
INDIC_GEMMA_URL = "https://huggingface.co/Telugu-LLM-Labs/Indic-gemma-2b-finetuned-sft-Navarasa-GGUF/resolve/main/indic-gemma-2b-finetuned-sft-Navarasa-Q4_K_M.gguf"

# Whisper Model (medium for accuracy, small for speed)
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "medium")  # small | medium | large
WHISPER_MODEL_PATH = MODELS_DIR / f"ggml-{WHISPER_MODEL}.bin"

# =============================================================================
# LLM CONFIGURATION (CPU-optimized)
# =============================================================================
LLM_CONFIG = {
    "n_ctx": 4096,              # Context window
    "n_threads": int(os.getenv("LLM_THREADS", os.cpu_count() or 4)),
    "n_batch": 512,             # Batch size for prompt processing
    "n_gpu_layers": 0,          # CPU-only: no GPU layers
    "verbose": False,
    "seed": 42,                 # Reproducibility
}

# Generation parameters (conservative for medical)
GENERATION_CONFIG = {
    "temperature": 0.1,         # Low = deterministic, factual
    "top_p": 0.9,               # Nucleus sampling
    "top_k": 40,                # Top-K sampling
    "repeat_penalty": 1.1,      # Prevent repetition
    "max_tokens": 1024,         # Max output tokens
}

# =============================================================================
# WHISPER CONFIGURATION
# =============================================================================
WHISPER_CONFIG = {
    "language": "auto",         # auto | hi | ta | te | en
    "translate": False,         # Keep original language
    "beam_size": 5,             # Accuracy vs speed
    "word_timestamps": True,    # For highlighting
    "vad_filter": True,         # Voice activity detection
}

# =============================================================================
# SUPPORTED LANGUAGES
# =============================================================================
SUPPORTED_LANGUAGES = {
    "hi": {
        "name": "Hindi",
        "native": "हिन्दी",
        "whisper_code": "hi",
        "enabled": True
    },
    "ta": {
        "name": "Tamil",
        "native": "தமிழ்",
        "whisper_code": "ta",
        "enabled": True
    },
    "te": {
        "name": "Telugu",
        "native": "తెలుగు",
        "whisper_code": "te",
        "enabled": True
    },
    "en": {
        "name": "English",
        "native": "English",
        "whisper_code": "en",
        "enabled": True
    },
    "kn": {
        "name": "Kannada",
        "native": "ಕನ್ನಡ",
        "whisper_code": "kn",
        "enabled": False  # Phase 2
    },
    "ml": {
        "name": "Malayalam",
        "native": "മലയാളം",
        "whisper_code": "ml",
        "enabled": False  # Phase 2
    },
    "mr": {
        "name": "Marathi",
        "native": "मराठी",
        "whisper_code": "mr",
        "enabled": False  # Phase 2
    },
    "bn": {
        "name": "Bengali",
        "native": "বাংলা",
        "whisper_code": "bn",
        "enabled": False  # Phase 2
    },
}

# =============================================================================
# CLINICAL DOCUMENT TYPES
# =============================================================================
DOCUMENT_TYPES = {
    "prescription": {
        "name": "OPD Prescription",
        "max_tokens": 512,
        "temperature": 0.05,
    },
    "opd_notes": {
        "name": "OPD Clinical Notes",
        "max_tokens": 768,
        "temperature": 0.1,
    },
    "ipd_notes": {
        "name": "IPD Daily Notes",
        "max_tokens": 768,
        "temperature": 0.1,
    },
    "discharge_summary": {
        "name": "Discharge Summary",
        "max_tokens": 1024,
        "temperature": 0.1,
    },
    "lab_report": {
        "name": "Lab Report Interpretation",
        "max_tokens": 512,
        "temperature": 0.1,
    },
}

# =============================================================================
# AUDIO CONFIGURATION
# =============================================================================
AUDIO_CONFIG = {
    "sample_rate": 16000,       # 16kHz for Whisper
    "channels": 1,              # Mono
    "format": "wav",            # WAV format
    "max_duration": 1800,       # 30 minutes max
    "chunk_duration": 30,       # Process in 30-second chunks
}

# =============================================================================
# SECURITY & COMPLIANCE
# =============================================================================
SECURITY_CONFIG = {
    "encrypt_audio": True,
    "encrypt_transcripts": True,
    "audit_logging": True,
    "require_doctor_review": True,
    "ai_badge_required": True,
    "max_session_duration": 3600,  # 1 hour
}

# Compliance disclaimer
COMPLIANCE_DISCLAIMER = (
    "AI assists documentation. "
    "Final responsibility lies with the clinician. "
    "This system does not provide medical advice, diagnosis, or treatment recommendations."
)

# =============================================================================
# LOGGING
# =============================================================================
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_DIR = Path(os.getenv("LOG_DIR", "/home/ubuntu/Mediczy/offline_scribe/logs"))
LOG_DIR.mkdir(parents=True, exist_ok=True)

# =============================================================================
# PRINT CONFIGURATION
# =============================================================================
def print_config():
    """Print configuration on startup"""
    print("\n" + "=" * 70)
    print("🏥 MEDICZY OFFLINE AI SCRIBE - HOSPITAL GRADE")
    print("=" * 70)
    print(f"Service: http://{SERVICE_HOST}:{SERVICE_PORT}")
    print(f"CPU Threads: {LLM_CONFIG['n_threads']}")
    print(f"GPU Layers: {LLM_CONFIG['n_gpu_layers']} (CPU-only)")
    print("-" * 70)
    print("Models:")
    print(f"  LLM: {INDIC_GEMMA_MODEL.name if INDIC_GEMMA_MODEL.exists() else 'NOT FOUND'}")
    print(f"  STT: Whisper {WHISPER_MODEL}")
    print("-" * 70)
    print("Languages (Phase 1):")
    for code, lang in SUPPORTED_LANGUAGES.items():
        if lang["enabled"]:
            print(f"  ✅ {lang['name']} ({lang['native']})")
    print("-" * 70)
    print("Document Types:")
    for doc_type, config in DOCUMENT_TYPES.items():
        print(f"  • {config['name']}")
    print("-" * 70)
    print(f"Security: Offline={True}, Audit={SECURITY_CONFIG['audit_logging']}")
    print("=" * 70 + "\n")
