"""
Mediczy AI Platform — Shared Settings
All three Python AI services import from this module.
"""

import os
from pathlib import Path

# ─────────────────────────────────────────────────────────────
# Directory roots
# ─────────────────────────────────────────────────────────────
REPO_ROOT = Path(os.getenv("MEDICZY_ROOT", "/home/ubuntu/Mediczy"))
MODELS_DIR = Path(os.getenv("MODELS_DIR", "/home/ubuntu/models"))
LOGS_DIR = REPO_ROOT / "logs"

# ─────────────────────────────────────────────────────────────
# Internal port registry (single source of truth)
# ─────────────────────────────────────────────────────────────
PORTS = {
    "sib_fastapi":     int(os.getenv("SIB_PORT",          "8001")),
    "scribe_service":  int(os.getenv("SCRIBE_GPU_PORT",    "8005")),
    "offline_scribe":  int(os.getenv("SCRIBE_PORT",        "8006")),
    "remote_gpu":      int(os.getenv("GPU_PORT",           "8080")),
}

# ─────────────────────────────────────────────────────────────
# Remote GPU (isha.buzz)
# ─────────────────────────────────────────────────────────────
GPU_HOST = os.getenv("GPU_HOST", "isha.buzz")
GPU_PORT = PORTS["remote_gpu"]
REMOTE_GPU_BASE_URL = f"http://{GPU_HOST}:{GPU_PORT}"

# ─────────────────────────────────────────────────────────────
# Shared auth
# ─────────────────────────────────────────────────────────────
AI_PLATFORM_SECRET = os.getenv("AI_PLATFORM_SECRET", "")  # must be set in prod

# ─────────────────────────────────────────────────────────────
# Log level
# ─────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
