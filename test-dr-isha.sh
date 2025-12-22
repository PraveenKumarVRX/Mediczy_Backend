#!/bin/bash

# Test Dr. iSHA Medical Response System
# Tests headache query and checks model performance

echo "🩺 DR. ISHA MEDICAL RESPONSE TEST"
echo "================================="

sleep 5  # Wait for service to fully start

echo "🔍 Testing service health..."
health_response=$(curl -s http://localhost:7091/health 2>/dev/null)
if [ $? -eq 0 ] && [ ! -z "$health_response" ]; then
    echo "✅ Service responding"
else
    echo "❌ Service not responding"
    exit 1
fi

echo "🧠 Testing headache medical consultation..."
response=$(curl -s -X POST http://localhost:7091/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I have a severe headache with nausea","user_id":"test","session_id":"headache_test"}' \
  2>/dev/null)

if [ $? -eq 0 ] && [ ! -z "$response" ]; then
    echo "✅ Got response from Dr. iSHA"
    
    # Parse response to check if it's medical advice or generic
    if echo "$response" | grep -qi "headache\|pain\|ibuprofen\|medical"; then
        echo "🎯 MEDICAL RESPONSE DETECTED!"
        echo "Response includes medical content about headache treatment"
    else
        echo "⚠️  Generic response detected (AI persona mode)"
    fi
    
    # Show model used
    model=$(echo "$response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('model', 'unknown'))" 2>/dev/null)
    echo "🤖 Model used: $model"
    
else
    echo "❌ Failed to get response"
fi

echo ""
echo "📊 PLATFORM STATUS SUMMARY:"
echo "============================"

# Check all services
services=("Frontend:9443" "Backend:8000" "Dr.iSHA:7091")
for service in "${services[@]}"; do
    name=$(echo $service | cut -d: -f1)
    port=$(echo $service | cut -d: -f2)
    
    if curl -s http://localhost:$port/health >/dev/null 2>&1 || curl -s http://localhost:$port >/dev/null 2>&1; then
        echo "✅ $name (Port $port) - Running"
    else
        echo "❌ $name (Port $port) - Not responding"
    fi
done

echo ""
echo "🎯 QUICK ACCESS URLs:"
echo "===================="
echo "• Frontend: http://192.168.1.72:9443"
echo "• Login: test@mediczy.com / mediczy123"
echo "• AI Doctor: http://192.168.1.72:9443/ai-doctor"

echo ""
echo "Test completed! $(date)"