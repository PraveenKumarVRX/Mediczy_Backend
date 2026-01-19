#!/bin/bash

# Script to enable camera access for local IP addresses in Chrome
# This allows testing WebRTC video calls over HTTP on local networks

echo "🚀 MiroTalk Video Call - Chrome Setup Helper"
echo "=============================================="
echo ""

IP="192.168.1.72"
PORT="4000"
URL="http://$IP:$PORT"

echo "This script will help you enable camera access for:"
echo "👉 $URL"
echo ""

echo "📋 INSTRUCTIONS FOR CHROME:"
echo ""
echo "1️⃣  OPTION 1 - Chrome Flags (Recommended)"
echo "   • Open Chrome and go to:"
echo "     chrome://flags/#unsafely-treat-insecure-origin-as-secure"
echo "   • Add this URL to the field: $URL"
echo "   • Click 'Relaunch' button"
echo ""

echo "2️⃣  OPTION 2 - Command Line (Advanced)"
echo "   Copy and run this command:"
echo ""
echo "   google-chrome --unsafely-treat-insecure-origin-as-secure=$URL --user-data-dir=/tmp/chrome_video_test --disable-web-security"
echo ""

echo "📋 INSTRUCTIONS FOR FIREFOX:"
echo ""
echo "1️⃣  Go to: about:config"
echo "2️⃣  Search for: media.devices.insecure.enabled"
echo "3️⃣  Set it to: true"
echo "4️⃣  Search for: media.getusermedia.insecure.enabled" 
echo "5️⃣  Set it to: true"
echo "6️⃣  Restart Firefox"
echo ""

echo "🧪 TEST URLS:"
echo "• Local machine: http://localhost:4000/video-test"
echo "• Other devices: $URL/video-test"
echo ""

echo "⚠️  SECURITY NOTE:"
echo "These settings are for testing only. They reduce browser security."
echo "Don't browse other sites with these settings enabled."
echo ""

echo "✅ After enabling, refresh the video test page and try starting a video call."