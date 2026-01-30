"""
Configuration for Medical Scribe Service
Supports both local GPU and remote GPU configurations
"""

import os
from typing import Literal

# GPU Configuration
GPU_MODE: Literal["local", "remote"] = os.getenv("GPU_MODE", "local")
GPU_HOST = os.getenv("GPU_HOST", "isha.buzz")
GPU_PORT = int(os.getenv("GPU_PORT", "8080"))

# Remote GPU API Configuration
REMOTE_GPU_BASE_URL = f"http://{GPU_HOST}:{GPU_PORT}"
REMOTE_GPU_ENDPOINTS = {
    "transcribe": f"{REMOTE_GPU_BASE_URL}/api/scribe/transcribe",
    "expand_abbreviations": f"{REMOTE_GPU_BASE_URL}/api/scribe/expand-abbreviations",
    "process_medical_text": f"{REMOTE_GPU_BASE_URL}/api/scribe/process-medical-text",
    "analyze_text": f"{REMOTE_GPU_BASE_URL}/api/scribe/analyze-text",
    "health": f"{REMOTE_GPU_BASE_URL}/api/scribe/health",
}

# Local GPU Models Path
LOCAL_MODELS_PATH = os.getenv("MODELS_PATH", "/home/ubuntu/models")
BIMEDIX_MODEL_PATH = os.path.join(LOCAL_MODELS_PATH, "Bimedix.gguf")

# Model Configuration
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
BIMEDIX_N_GPU_LAYERS = int(os.getenv("BIMEDIX_N_GPU_LAYERS", "-1"))  # -1 = all layers on GPU
BIMEDIX_N_CTX = int(os.getenv("BIMEDIX_N_CTX", "4096"))
BIMEDIX_N_THREADS = int(os.getenv("BIMEDIX_N_THREADS", "16"))

# LLM Parameters
BIMEDIX_TEMPERATURE = float(os.getenv("BIMEDIX_TEMPERATURE", "0.3"))
BIMEDIX_TOP_P = float(os.getenv("BIMEDIX_TOP_P", "0.95"))
BIMEDIX_TOP_K = int(os.getenv("BIMEDIX_TOP_K", "40"))
BIMEDIX_REPEAT_PENALTY = float(os.getenv("BIMEDIX_REPEAT_PENALTY", "1.1"))

# Service Configuration
SERVICE_HOST = os.getenv("SERVICE_HOST", "0.0.0.0")
SERVICE_PORT = int(os.getenv("SERVICE_PORT", "8005"))
SERVICE_WORKERS = int(os.getenv("SERVICE_WORKERS", "4"))

# Request Timeouts
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "300"))  # 5 minutes for transcription/analysis

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Print Configuration on startup
def print_config():
    print("\n" + "="*80)
    print("🔧 MEDICAL SCRIBE SERVICE CONFIGURATION")
    print("="*80)
    print(f"GPU Mode: {GPU_MODE}")
    if GPU_MODE == "remote":
        print(f"Remote GPU URL: {REMOTE_GPU_BASE_URL}")
        print(f"GPU Host: {GPU_HOST}")
        print(f"GPU Port: {GPU_PORT}")
    else:
        print(f"Local Models Path: {LOCAL_MODELS_PATH}")
        print(f"Bimedix Model: {BIMEDIX_MODEL_PATH}")
        print(f"Whisper Model: {WHISPER_MODEL}")
        print(f"GPU Layers: {BIMEDIX_N_GPU_LAYERS}")
    print(f"Service Running: http://{SERVICE_HOST}:{SERVICE_PORT}")
    print("="*80 + "\n")
