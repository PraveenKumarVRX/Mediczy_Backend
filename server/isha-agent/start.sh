#!/usr/bin/env bash
# ── Dr Isha LiveKit Voice Agent — start script ──────────────────────────────
# Usage:  ./start.sh            (foreground)
#         ./start.sh &          (background, use systemd in production)
# ────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="/home/ubuntu/Mediczy/.venv/bin/python"

# Silero VAD downloads a small ONNX model on first run — cache it
export HF_HOME="/home/ubuntu/.cache/huggingface"

echo "▶ Starting Dr Isha voice agent…"
exec "$VENV_PYTHON" "$SCRIPT_DIR/agent.py" start
