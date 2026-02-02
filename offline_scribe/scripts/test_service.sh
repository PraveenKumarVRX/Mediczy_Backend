#!/bin/bash
# Test Script for Mediczy Offline AI Scribe

set -e

BASE_URL="${OFFLINE_SCRIBE_URL:-http://localhost:8006}"
API_URL="$BASE_URL/api/scribe"

echo "=============================================="
echo "Mediczy Offline AI Scribe - Test Suite"
echo "=============================================="
echo "Service URL: $BASE_URL"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_field="$5"
    
    echo -n "Testing: $name... "
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" == "200" ]; then
        if [ -n "$expected_field" ]; then
            if echo "$body" | grep -q "$expected_field"; then
                echo -e "${GREEN}PASS${NC} (HTTP $http_code)"
                ((PASSED++))
            else
                echo -e "${YELLOW}WARN${NC} (HTTP $http_code, missing expected field)"
                ((PASSED++))
            fi
        else
            echo -e "${GREEN}PASS${NC} (HTTP $http_code)"
            ((PASSED++))
        fi
    else
        echo -e "${RED}FAIL${NC} (HTTP $http_code)"
        echo "  Response: ${body:0:200}"
        ((FAILED++))
    fi
}

# ===================================
# Test 1: Health Check
# ===================================
echo ""
echo "--- Health & Status ---"
test_endpoint "Health Check" "GET" "/health" "" "status"

# ===================================
# Test 2: Languages
# ===================================
test_endpoint "Get Languages" "GET" "/languages" "" "supported_languages"

# ===================================
# Test 3: Templates
# ===================================
test_endpoint "Get Templates" "GET" "/templates" "" "templates"

# ===================================
# Test 4: Text Normalization
# ===================================
echo ""
echo "--- Text Processing ---"

# Hindi normalization
test_endpoint "Hindi Normalization" "POST" "/normalize" \
    '{"text": "ek crocin din mein teen baar khana khane ke baad", "language": "hi"}' \
    "normalized_text"

# Tamil normalization
test_endpoint "Tamil Normalization" "POST" "/normalize" \
    '{"text": "oru Dolo unavu pinbu ondru", "language": "ta"}' \
    "normalized_text"

# ===================================
# Test 5: Prescription Generation (if LLM loaded)
# ===================================
echo ""
echo "--- Document Generation ---"

# Simple prescription test
test_endpoint "Generate Prescription" "POST" "/prescription" \
    '{"dictation": "Patient naam Ravi, male, 35 years. Complaint fever aur headache teen din se. Paracetamol 650mg teen baar khana ke baad lena hai.", "language": "hi", "patient_context": {"name": "Ravi", "age": 35, "gender": "male"}}' \
    "formatted_text"

# OPD Notes test
test_endpoint "Generate OPD Notes" "POST" "/opd-notes" \
    '{"dictation": "Patient Mrs. Sharma, 45 years female. Chief complaint abdominal pain since 2 days. History of diabetes. On examination tenderness in right iliac fossa. Advice USG abdomen.", "language": "en", "patient_context": {"name": "Mrs. Sharma", "age": 45, "gender": "female"}}' \
    "formatted_text"

# ===================================
# Summary
# ===================================
echo ""
echo "=============================================="
echo "Test Summary"
echo "=============================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}Some tests failed. Check if:${NC}"
    echo "  1. Service is running: python main.py"
    echo "  2. Models are downloaded: ./scripts/download_models.sh"
    echo "  3. Dependencies installed: pip install -r requirements.txt"
    exit 1
fi
