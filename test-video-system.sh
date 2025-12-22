#!/bin/bash

echo "==================================="
echo "Video Consultation System Test"
echo "==================================="
echo ""

echo "1. Testing Frontend Access..."
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" http://mediqzy.com)
if [ "$FRONTEND" = "200" ]; then
    echo "   ✅ Frontend accessible (HTTP $FRONTEND)"
else
    echo "   ❌ Frontend not accessible (HTTP $FRONTEND)"
fi

echo ""
echo "2. Testing Backend API..."
BACKEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health)
if [ "$BACKEND" = "200" ]; then
    echo "   ✅ Backend API accessible (HTTP $BACKEND)"
else
    echo "   ❌ Backend API not accessible (HTTP $BACKEND)"
fi

echo ""
echo "3. Testing MiroTalk SFU..."
MIROTALK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3010)
if [ "$MIROTALK" = "200" ]; then
    echo "   ✅ MiroTalk SFU accessible (HTTP $MIROTALK)"
else
    echo "   ❌ MiroTalk SFU not accessible (HTTP $MIROTALK)"
fi

echo ""
echo "4. Testing MiroTalk Join Page..."
JOIN=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3010/join/test-room?name=TestUser")
if [ "$JOIN" = "200" ]; then
    echo "   ✅ MiroTalk join page accessible (HTTP $JOIN)"
else
    echo "   ❌ MiroTalk join page not accessible (HTTP $JOIN)"
fi

echo ""
echo "5. Testing Redis Connection..."
if redis-cli -h localhost -p 6379 -a "RedisSecure2024!" ping | grep -q "PONG"; then
    echo "   ✅ Redis responding to PING"
else
    echo "   ❌ Redis not responding"
fi

echo ""
echo "6. Checking PM2 Services..."
echo ""
pm2 status | grep -E "mediczy-server|mirotalk-sfu"

echo ""
echo "==================================="
echo "Test Summary"
echo "==================================="
echo ""
echo "Access Points:"
echo "  Patient Video:  http://mediqzy.com/video-consultation"
echo "  Doctor Video:   http://mediqzy.com/doctor/video"
echo "  My Bookings:    http://mediqzy.com/my-bookings"
echo ""
echo "Direct MiroTalk: http://mediqzy.com:3010"
echo ""
echo "Test Video Call:"
echo "  URL: http://mediqzy.com:3010/join/test-room?name=YourName"
echo ""
