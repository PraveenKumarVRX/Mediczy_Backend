#!/bin/bash
# Startup script for Medical Scribe Service
# Supports local GPU or remote GPU (isha.buzz:8080 with Bimedix)

set -e

echo "🔧 Medical Scribe Service - Startup Script"
echo "==========================================="
echo ""

# Determine GPU mode
GPU_MODE="${1:-remote}"  # Default to remote GPU
GPU_HOST="${2:-isha.buzz}"
GPU_PORT="${3:-8080}"

# Validate GPU mode
if [ "$GPU_MODE" != "local" ] && [ "$GPU_MODE" != "remote" ]; then
    echo "❌ Invalid GPU_MODE: $GPU_MODE (must be 'local' or 'remote')"
    exit 1
fi

# Set environment variables
export GPU_MODE="$GPU_MODE"
export GPU_HOST="$GPU_HOST"
export GPU_PORT="$GPU_PORT"
export SERVICE_HOST="0.0.0.0"
export SERVICE_PORT="8001"
export LOG_LEVEL="INFO"
export REQUEST_TIMEOUT="300"

# Display configuration
echo "📋 Configuration:"
echo "  GPU Mode: $GPU_MODE"
if [ "$GPU_MODE" = "remote" ]; then
    echo "  Remote GPU URL: http://$GPU_HOST:$GPU_PORT"
    echo "  Remote GPU Model: Bimedix.gguf"
else
    echo "  Local GPU: Using system CUDA/GPU"
fi
echo "  Service URL: http://$(hostname -I | awk '{print $1}'):$SERVICE_PORT"
echo ""

# Check dependencies
echo "📦 Checking dependencies..."

if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found"
    exit 1
fi

python3 -c "import fastapi" 2>/dev/null || { echo "❌ FastAPI not installed"; exit 1; }
python3 -c "import httpx" 2>/dev/null || { echo "❌ httpx not installed"; exit 1; }

if [ "$GPU_MODE" = "local" ]; then
    python3 -c "import whisper" 2>/dev/null || { echo "❌ Whisper not installed"; exit 1; }
    python3 -c "import torch" 2>/dev/null || { echo "❌ PyTorch not installed"; exit 1; }
    python3 -c "from llama_cpp import Llama" 2>/dev/null || { echo "❌ llama-cpp-python not installed"; exit 1; }
fi

echo "✓ All dependencies available"
echo ""

# Test remote GPU connectivity if using remote mode
if [ "$GPU_MODE" = "remote" ]; then
    echo "🔗 Testing remote GPU connectivity..."
    if curl -s "http://$GPU_HOST:$GPU_PORT/api/scribe/health" > /dev/null 2>&1; then
        echo "✓ Connected to remote GPU at http://$GPU_HOST:$GPU_PORT"
    else
        echo "⚠️  Warning: Cannot reach remote GPU at http://$GPU_HOST:$GPU_PORT"
        echo "    Service will attempt to connect on startup"
    fi
    echo ""
fi

# Change to service directory
cd "$(dirname "$0")"

echo "🚀 Starting Medical Scribe Service..."
echo "==========================================="
echo ""

# Run the service
if [ "$GPU_MODE" = "remote" ]; then
    echo "📡 Starting in REMOTE GPU mode (Bimedix at $GPU_HOST:$GPU_PORT)"
    echo ""
    python3 main.py
else
    echo "🖥️  Starting in LOCAL GPU mode"
    echo ""
    python3 main.py
fi
