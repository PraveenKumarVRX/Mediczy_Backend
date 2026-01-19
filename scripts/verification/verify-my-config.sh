#!/bin/bash

echo "═══════════════════════════════════════════════════════════════"
echo "   �� GOOGLE FIT OAUTH CONFIGURATION VERIFICATION"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check environment files
echo "✅ STEP 4 VERIFICATION: OAuth Client ID in Environment Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CLIENT_ID=$(grep VITE_GOOGLE_CLIENT_ID /home/ubuntu/Mediczy/client/.env.production | cut -d'=' -f2)
echo "Your Client ID: $CLIENT_ID"
echo ""

if [[ $CLIENT_ID == *".apps.googleusercontent.com"* ]]; then
    echo "✅ Format is CORRECT (ends with .apps.googleusercontent.com)"
else
    echo "❌ Format is WRONG (should end with .apps.googleusercontent.com)"
fi
echo ""

# Check if it's the correct one
EXPECTED="982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com"
if [ "$CLIENT_ID" == "$EXPECTED" ]; then
    echo "✅ Client ID matches expected value"
else
    echo "⚠️  Client ID doesn't match. Expected: $EXPECTED"
fi
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "   📝 WHAT YOU NEED TO DO IN GOOGLE CLOUD CONSOLE"
echo "═══════════════════════════════════════════════════════════════"
echo ""

echo "🔗 DIRECT LINKS (Click these):"
echo ""
echo "1️⃣  OAuth Consent Screen (Add 5 Scopes):"
echo "    https://console.cloud.google.com/apis/credentials/consent?project=mediczy-624ed"
echo ""
echo "2️⃣  OAuth Client ID (Add Redirect URIs):"
echo "    https://console.cloud.google.com/apis/credentials?project=mediczy-624ed"
echo ""
echo "3️⃣  Enable Fitness API:"
echo "    https://console.cloud.google.com/apis/library/fitness.googleapis.com?project=mediczy-624ed"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "   ✅ STEP 1: ADD THESE 5 SCOPES"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Copy each line and search for it in the scopes panel:"
echo ""
echo "1. https://www.googleapis.com/auth/fitness.activity.read"
echo "2. https://www.googleapis.com/auth/fitness.heart_rate.read"
echo "3. https://www.googleapis.com/auth/fitness.sleep.read"
echo "4. https://www.googleapis.com/auth/fitness.body.read"
echo "5. https://www.googleapis.com/auth/fitness.location.read"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "   ✅ STEP 2 & 3: ADD THESE URIs"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Under 'Authorized JavaScript origins':"
echo "  • http://localhost:9443"
echo "  • https://mediqzy.com"
echo ""
echo "Under 'Authorized redirect URIs':"
echo "  • http://localhost:9443"
echo "  • https://mediqzy.com"
echo ""
echo "⚠️  IMPORTANT: NO trailing slash (/) at the end!"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "   🧪 TESTING TOOL"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "After completing the steps above, test at:"
echo "https://mediqzy.com/test-google-fit-config.html"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "   📖 DETAILED GUIDE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "For step-by-step instructions with screenshots, read:"
echo "cat /home/ubuntu/Mediczy/STEP_BY_STEP_OAUTH_GUIDE.md"
echo ""

