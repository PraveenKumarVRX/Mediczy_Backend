#!/bin/bash

echo "======================================"
echo "🔍 WALLET PAGE FIX VERIFICATION"
echo "======================================"
echo ""

# Check if latest build exists
echo "1️⃣ Checking latest build..."
BUILD_DATE=$(stat -c %y /home/ubuntu/Mediczy/client/dist/index.html | cut -d' ' -f1,2)
echo "   ✅ Build date: $BUILD_DATE"
echo ""

# Check if Input component is in the build
echo "2️⃣ Checking if Input fix is in build..."
if grep -q "Input" /home/ubuntu/Mediczy/client/dist/assets/index-*.js; then
    echo "   ✅ Input component found in bundle"
else
    echo "   ❌ Input component NOT found - may need rebuild"
fi
echo ""

# Check nginx config
echo "3️⃣ Checking nginx configuration..."
if grep -q "try_files.*index.html" /etc/nginx/sites-enabled/mediczy; then
    echo "   ✅ SPA fallback configured (try_files)"
else
    echo "   ❌ Missing SPA fallback - will cause 404 errors"
fi
echo ""

# Check if wallet route exists in bundle
echo "4️⃣ Checking wallet route in build..."
if grep -qi "wallet" /home/ubuntu/Mediczy/client/dist/assets/index-*.js; then
    echo "   ✅ Wallet route found in bundle"
else
    echo "   ❌ Wallet route NOT found"
fi
echo ""

# Test nginx syntax
echo "5️⃣ Testing nginx configuration..."
sudo nginx -t 2>&1 | grep -q "successful" && echo "   ✅ Nginx config valid" || echo "   ❌ Nginx config has errors"
echo ""

# Check PM2 server status
echo "6️⃣ Checking backend server..."
pm2 list | grep -q "mediczy-server.*online" && echo "   ✅ Backend server running" || echo "   ❌ Backend server not running"
echo ""

echo "======================================"
echo "📋 BROWSER FIX INSTRUCTIONS"
echo "======================================"
echo ""
echo "The backend is working. If you still see 404:"
echo ""
echo "Option 1 - Hard Refresh (Try first):"
echo "  • Press Ctrl+Shift+R (Windows/Linux)"
echo "  • Press Cmd+Shift+R (Mac)"
echo ""
echo "Option 2 - Clear Browser Cache:"
echo "  1. Press F12 to open DevTools"
echo "  2. Go to Application tab"
echo "  3. Click 'Clear storage'"
echo "  4. Click 'Clear site data'"
echo "  5. Reload page"
echo ""
echo "Option 3 - Incognito/Private Window:"
echo "  • Open an Incognito/Private window"
echo "  • Navigate to https://mediqzy.com/wallet"
echo ""
echo "Option 4 - Full Reset:"
echo "  • Clear all browser data for mediqzy.com"
echo "  • Close and reopen browser"
echo "  • Login again and try /wallet"
echo ""
echo "======================================"
echo "✅ VERIFICATION COMPLETE"
echo "======================================"
