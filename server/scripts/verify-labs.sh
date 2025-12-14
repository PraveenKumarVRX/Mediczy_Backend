#!/bin/bash

echo "🚀 Lab Data Verification & Enhancement System"
echo "=============================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not installed"
    exit 1
fi
echo "✅ Node.js: $(node --version)"

# Check MySQL
if ! command -v mysql &> /dev/null; then
    echo "❌ MySQL not installed"
    exit 1
fi
echo "✅ MySQL installed"

# Check Ollama
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama not installed (optional for LLM features)"
    echo "   Install with: curl -fsSL https://ollama.com/install.sh | sh"
else
    echo "✅ Ollama: $(ollama --version 2>&1 | head -1)"
fi

echo ""
echo "=============================================="
echo "Choose verification method:"
echo "=============================================="
echo ""
echo "1. Basic Enhancement (FREE)"
echo "   - Parse existing data intelligently"
echo "   - Extract city, state, pincode from addresses"
echo "   - No API calls required"
echo ""
echo "2. LLM Enhancement with Ollama (FREE, requires Ollama)"
echo "   - AI-powered data parsing"
echo "   - Better brand/branch extraction"
echo "   - Runs locally on your server"
echo ""
echo "3. Google Places Verification (Paid API)"
echo "   - Verify against Google Maps"
echo "   - Get ratings and reviews"
echo "   - Requires Google API key"
echo "   - Cost: ~$5 per 100 labs"
echo ""
echo "4. Full Pipeline (LLM + Google)"
echo "   - Best results"
echo "   - LLM first, then Google verification"
echo ""

read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo "Running basic enhancement..."
        cd /root/Mediczy/server
        node scripts/extract-city-state-from-address.cjs
        ;;
    2)
        if ! command -v ollama &> /dev/null; then
            echo "❌ Ollama not installed. Install first:"
            echo "   curl -fsSL https://ollama.com/install.sh | sh"
            echo "   ollama pull llama3.2:1b"
            exit 1
        fi
        
        echo ""
        echo "Running LLM enhancement with Ollama..."
        read -p "How many labs to process? (default: 50): " limit
        limit=${limit:-50}
        
        cd /root/Mediczy/server
        export LLM_PROVIDER="ollama"
        export LLM_MODEL="llama3.2:1b"
        node scripts/enhance-labs-with-llm.cjs
        ;;
    3)
        echo ""
        read -p "Enter your Google Places API key: " api_key
        
        if [ -z "$api_key" ]; then
            echo "❌ API key required"
            exit 1
        fi
        
        echo "Running Google Places verification..."
        read -p "How many labs to verify? (default: 50): " limit
        limit=${limit:-50}
        
        cd /root/Mediczy/server
        export GOOGLE_PLACES_API_KEY="$api_key"
        node scripts/verify-labs-with-google-places.cjs
        ;;
    4)
        echo ""
        echo "Running full pipeline..."
        
        # Step 1: LLM Enhancement
        if command -v ollama &> /dev/null; then
            echo "Step 1/2: LLM Enhancement..."
            cd /root/Mediczy/server
            export LLM_PROVIDER="ollama"
            export LLM_MODEL="llama3.2:1b"
            node scripts/enhance-labs-with-llm.cjs
        else
            echo "Step 1/2: Basic Enhancement (Ollama not available)..."
            cd /root/Mediczy/server
            node scripts/extract-city-state-from-address.cjs
        fi
        
        # Step 2: Google Verification
        echo ""
        echo "Step 2/2: Google Places Verification..."
        read -p "Enter your Google Places API key: " api_key
        
        if [ -z "$api_key" ]; then
            echo "⚠️  Skipping Google verification (no API key provided)"
        else
            cd /root/Mediczy/server
            export GOOGLE_PLACES_API_KEY="$api_key"
            node scripts/verify-labs-with-google-places.cjs
        fi
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "=============================================="
echo "✅ Process complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Rebuild frontend: cd /root/Mediczy/client && npm run build"
echo "2. Refresh browser to see updated lab data"
echo ""
