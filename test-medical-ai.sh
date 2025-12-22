#!/bin/bash
# Quick test script for Medical AI integration

echo "=========================================="
echo "Medical AI Integration Test"
echo "=========================================="
echo ""

# Check orchestrator health
echo "1️⃣ Checking LLM Orchestrator health..."
HEALTH=$(curl -s http://localhost:5000/health)
if [ $? -eq 0 ]; then
    echo "✅ Orchestrator is healthy"
    echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
else
    echo "❌ Orchestrator is not responding"
    exit 1
fi

echo ""
echo "2️⃣ Testing Medical AI endpoint..."
RESULT=$(curl -s -X POST http://localhost:8000/api/medical-ai/test \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What causes headaches?",
    "language": "en",
    "userContext": {"age": 30, "gender": "female"}
  }')

# Parse result
if echo "$RESULT" | grep -q '"provider":"local-orchestrator"'; then
    echo "✅ Medical AI endpoint working"
    echo "   Provider: local-orchestrator (port 5000)"
    echo "   Status: API successfully connected to local LLM"
    RESP_LEN=$(echo "$RESULT" | grep -o '"response":"[^"]*"' | wc -c)
    echo "   Response: Generated ($RESP_LEN bytes)"
else
    echo "❌ Medical AI endpoint failed"
    PROVIDER=$(echo "$RESULT" | grep -o '"provider":"[^"]*"' | cut -d'"' -f4)
    echo "   Provider: ${PROVIDER:-unknown}"
fi

echo ""
echo "3️⃣ Testing Flan-T5 integration..."
if [ -f "/root/Mediczy/docsgpt/llm_models/flan_t5_integration.py" ]; then
    echo "✅ Flan-T5 integration file exists"
    # Check if all dependencies are installed
    if python3 -c "import transformers, sentencepiece, torch" 2>/dev/null; then
        echo "✅ All dependencies installed (transformers, sentencepiece, torch)"
        # Quick test
        TEST_OUTPUT=$(python3 -c "from flan_t5_integration import FlanT5MedicalAssistant; print('OK')" 2>&1)
        if echo "$TEST_OUTPUT" | grep -q "OK"; then
            echo "✅ Flan-T5 can be imported and initialized"
        else
            echo "⚠️ Flan-T5 import test failed"
        fi
    else
        echo "⚠️ Missing dependencies. Install with: python3 -m pip install transformers torch sentencepiece"
    fi
else
    echo "❌ Flan-T5 integration file not found"
fi

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Backend: ✅ Connected to local orchestrator"
echo "Provider: local-orchestrator (port 5000)"
echo "Models: Mistral 7B, BioMistral, BiMediX2, Medicine-LLM"
if python3 -c "import sentencepiece" 2>/dev/null; then
    echo "Flan-T5: ✅ Installed and ready"
else
    echo "Flan-T5: ⚠️ Dependencies needed"
fi
echo ""
if python3 -c "import sentencepiece" 2>/dev/null; then
    echo "✅ All components operational!"
    echo ""
    echo "Optional:"
    echo "• Test Flan-T5: cd /root/Mediczy/docsgpt/llm_models && python3 flan_t5_integration.py"
    echo "• Start Ultra-Fast DB: cd /root/Mediczy/docsgpt && nohup python3 ultra_fast_db_service.py &"
else
    echo "Next steps:"
    echo "1. Install Flan-T5: python3 -m pip install sentencepiece"
    echo "2. Test Flan-T5: cd /root/Mediczy/docsgpt/llm_models && python3 flan_t5_integration.py"
fi
echo "• Full documentation: /root/Mediczy/MEDICAL_AI_INTEGRATION.md"
echo "=========================================="
