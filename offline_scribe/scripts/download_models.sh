#!/bin/bash
# Download Models for Mediczy Offline AI Scribe
# This script downloads:
# 1. Indic-Gemma-2B-Navarasa (Q4_K_M) - ~1.5GB
# 2. Whisper Medium - ~1.5GB

set -e

MODELS_DIR="${MODELS_DIR:-/home/ubuntu/models}"
mkdir -p "$MODELS_DIR"

echo "=============================================="
echo "Mediczy Offline AI Scribe - Model Downloader"
echo "=============================================="
echo ""
echo "Models directory: $MODELS_DIR"
echo ""

# Function to download with progress
download_file() {
    local url="$1"
    local output="$2"
    local name="$3"
    
    if [ -f "$output" ]; then
        echo "✅ $name already exists, skipping..."
        return 0
    fi
    
    echo "📥 Downloading $name..."
    echo "   URL: $url"
    echo "   Output: $output"
    
    # Use wget with progress bar
    wget -q --show-progress -O "$output" "$url"
    
    if [ $? -eq 0 ]; then
        echo "✅ $name downloaded successfully!"
    else
        echo "❌ Failed to download $name"
        return 1
    fi
}

# =====================================================
# 1. Indic-Gemma-2B-Navarasa (Q4_K_M quantized)
# =====================================================
echo ""
echo "--- Indic-Gemma-2B-Navarasa (Q4_K_M) ---"
echo "Size: ~1.5GB"
echo "Purpose: Medical text formatting (CPU-only)"
echo ""

INDIC_GEMMA_URL="https://huggingface.co/Telugu-LLM-Labs/Indic-gemma-2b-finetuned-sft-Navarasa-GGUF/resolve/main/indic-gemma-2b-finetuned-sft-Navarasa-Q4_K_M.gguf"
INDIC_GEMMA_PATH="$MODELS_DIR/indic-gemma-2b-navarasa-q4_k_m.gguf"

download_file "$INDIC_GEMMA_URL" "$INDIC_GEMMA_PATH" "Indic-Gemma-2B-Navarasa"

# =====================================================
# 2. Whisper Medium (for STT)
# =====================================================
echo ""
echo "--- Whisper Medium ---"
echo "Size: ~1.5GB"
echo "Purpose: Speech-to-Text (Indic languages)"
echo ""

# faster-whisper downloads models automatically, but we can pre-download
# the ggml version for whisper.cpp compatibility

WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"
WHISPER_PATH="$MODELS_DIR/ggml-medium.bin"

download_file "$WHISPER_URL" "$WHISPER_PATH" "Whisper Medium"

# =====================================================
# Alternative: Whisper Small (faster, lower accuracy)
# =====================================================
echo ""
echo "--- Whisper Small (Optional - faster) ---"
echo "Size: ~500MB"
echo ""

WHISPER_SMALL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
WHISPER_SMALL_PATH="$MODELS_DIR/ggml-small.bin"

read -p "Download Whisper Small as well? (y/N): " download_small
if [[ "$download_small" =~ ^[Yy]$ ]]; then
    download_file "$WHISPER_SMALL_URL" "$WHISPER_SMALL_PATH" "Whisper Small"
fi

# =====================================================
# Verify Downloads
# =====================================================
echo ""
echo "=============================================="
echo "Download Summary"
echo "=============================================="
echo ""

check_model() {
    local path="$1"
    local name="$2"
    
    if [ -f "$path" ]; then
        size=$(du -h "$path" | cut -f1)
        echo "✅ $name: $path ($size)"
    else
        echo "❌ $name: NOT FOUND"
    fi
}

check_model "$INDIC_GEMMA_PATH" "Indic-Gemma-2B"
check_model "$WHISPER_PATH" "Whisper Medium"
check_model "$WHISPER_SMALL_PATH" "Whisper Small"

echo ""
echo "=============================================="
echo "Setup Complete!"
echo "=============================================="
echo ""
echo "To start the service:"
echo "  cd /home/ubuntu/Mediczy/offline_scribe"
echo "  pip install -r requirements.txt"
echo "  python main.py"
echo ""
echo "Service will be available at: http://localhost:8006"
echo ""
