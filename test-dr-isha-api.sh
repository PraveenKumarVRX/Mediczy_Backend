#!/bin/bash

# Dr. Isha API Integration Test Script
echo "🏥 Testing Dr. Isha (DocsGPT) Integration"
echo "========================================="

# Test token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNzYyNjYzMjIzLCJleHAiOjE3NjMyNjgwMjN9.jm3hxB5MZ_aRCQ64dkFmVynCJ7VjzxWo1HOhqjBwCqY"

echo "1. Testing Health Check Endpoint..."
curl -s -X GET http://localhost:8000/api/dr-isha/health | python3 -m json.tool
echo ""

echo "2. Testing Consultation Endpoint..."
curl -s -X POST http://localhost:8000/api/dr-isha/consult \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "What are the symptoms of a common cold?",
    "language": "English",
    "sessionId": "test-session-' $(date +%s) '"
  }' | python3 -m json.tool
echo ""

echo "3. Testing Symptom Analysis Endpoint..."
curl -s -X POST http://localhost:8000/api/dr-isha/analyze-symptoms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "symptoms": ["headache", "fever", "cough"],
    "description": "Patient has persistent headache with fever and dry cough for 3 days",
    "language": "English",
    "severity": "moderate",
    "duration": "3 days",
    "sessionId": "symptom-test-' $(date +%s) '"
  }' | python3 -m json.tool
echo ""

echo "4. Testing Multi-language Support (Spanish)..."
curl -s -X POST http://localhost:8000/api/dr-isha/consult \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "¿Cuáles son los síntomas de la gripe?",
    "language": "Spanish",
    "sessionId": "spanish-test-' $(date +%s) '"
  }' | python3 -m json.tool
echo ""

echo "5. Testing Multi-language Support (Hindi)..."
curl -s -X POST http://localhost:8000/api/dr-isha/consult \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "सिरदर्द के लिए क्या करना चाहिए?",
    "language": "Hindi",
    "sessionId": "hindi-test-' $(date +%s) '"
  }' | python3 -m json.tool
echo ""

echo "6. Testing Authentication (without token)..."
curl -s -X POST http://localhost:8000/api/dr-isha/consult \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Test without auth",
    "language": "English"
  }' | python3 -m json.tool
echo ""

echo "========================================="
echo "✅ Dr. Isha Integration Test Complete!"
echo "========================================="