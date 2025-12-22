#!/bin/bash

echo "=== Mediczy Frontend Status Check ==="
echo ""

echo "1. Process Check:"
if ps aux | grep -E "vite.*9443" | grep -v grep > /dev/null; then
    echo "   ✅ Frontend process is running"
else
    echo "   ❌ Frontend process NOT running"
fi

echo ""
echo "2. Port Check:"
if ss -tuln | grep 9443 > /dev/null; then
    echo "   ✅ Port 9443 is listening"
else
    echo "   ❌ Port 9443 is NOT listening"
fi

echo ""
echo "3. Local HTTP Check:"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:9443/ | grep 200 > /dev/null; then
    echo "   ✅ Frontend responds locally (HTTP 200)"
else
    echo "   ❌ Frontend NOT responding locally"
fi

echo ""
echo "4. Network HTTP Check:"
if curl -s -o /dev/null -w "%{http_code}" http://192.168.1.72:9443/ | grep 200 > /dev/null; then
    echo "   ✅ Frontend responds on network (HTTP 200)"
else
    echo "   ❌ Frontend NOT responding on network"
fi

echo ""
echo "5. Recent Frontend Logs:"
echo "---"
tail -10 /tmp/mediczy/logs/frontend.log
echo "---"

echo ""
echo "6. Access URLs:"
echo "   • Local:   http://localhost:9443/"
echo "   • Network: http://192.168.1.72:9443/"
echo ""
echo "7. Troubleshooting:"
echo "   • Clear browser cache (Ctrl+Shift+Del)"
echo "   • Hard refresh (Ctrl+Shift+R)"
echo "   • Try incognito/private mode"
echo "   • Check browser console for errors (F12)"
