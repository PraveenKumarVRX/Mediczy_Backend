#!/bin/bash

# Google OAuth2 Configuration for Mediczy
# This script helps you configure Google OAuth for user authentication

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Google OAuth2 Configuration for Mediczy                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Google Cloud Project Details
PROJECT_ID="mediczy-624ed"
CLIENT_ID="982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com"

echo "📋 Current Configuration:"
echo "   Project ID:  $PROJECT_ID"
echo "   Client ID:   $CLIENT_ID"
echo ""

# Check if Client Secret is already set
if grep -q "GOOGLE_CLIENT_SECRET=.*[a-zA-Z0-9]" /home/ubuntu/Mediczy/server/.env 2>/dev/null; then
    SECRET=$(grep "GOOGLE_CLIENT_SECRET=" /home/ubuntu/Mediczy/server/.env | cut -d'=' -f2)
    if [ ! -z "$SECRET" ] && [ "$SECRET" != "your-google-client-secret" ]; then
        echo "✅ Client Secret is already configured"
        echo ""
        
        # Check OAuth status
        echo "🔍 Checking OAuth status..."
        STATUS=$(curl -s http://localhost:8000/api/auth/oauth/status 2>/dev/null)
        if echo "$STATUS" | grep -q '"configured": true'; then
            echo "✅ Google OAuth is ENABLED and working!"
            echo ""
            echo "$STATUS" | jq '.google' 2>/dev/null || echo "$STATUS"
            exit 0
        else
            echo "⚠️  Client Secret is set but OAuth not working"
            echo "   Server may need restart: pm2 restart mediczy-server"
        fi
    fi
fi

echo "⚠️  Google Client Secret is NOT configured"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔧 STEP 1: Add OAuth Callback URLs to Google Cloud Console"
echo ""
echo "1. Open Google Cloud Console:"
echo "   https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo ""
echo "2. Click on this OAuth Client:"
echo "   982376166047-j975co5qc5enqhcesggbsee3obnj7tqa"
echo ""
echo "3. Scroll to 'Authorized redirect URIs' section"
echo ""
echo "4. ADD these URLs (if not already present):"
echo ""
echo "   For Production:"
echo "   https://app.mediqzy.com/api/auth/google/callback"
echo ""
echo "   For Development/Testing:"
echo "   http://localhost:8000/api/auth/google/callback"
echo ""
echo "5. Click SAVE"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔑 STEP 2: Get Client Secret"
echo ""
echo "OPTION A - View Existing Secret:"
echo "1. In the same OAuth client edit page"
echo "2. Find 'Client secret' field"
echo "3. Click the 'Copy' icon next to it"
echo "4. If you see '••••••••', click 'SHOW' first"
echo ""
echo "OPTION B - Create New Secret (if needed):"
echo "1. Click 'RESET SECRET' button"
echo "2. Confirm the action"
echo "3. Copy the new client secret (shown once!)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💾 STEP 3: Update .env File"
echo ""
read -p "Paste your Google Client Secret here: " CLIENT_SECRET

if [ -z "$CLIENT_SECRET" ]; then
    echo ""
    echo "❌ No secret provided. Exiting..."
    exit 1
fi

echo ""
echo "📝 Updating .env file..."

# Update the .env file
sed -i "s|GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=$CLIENT_SECRET|g" /home/ubuntu/Mediczy/server/.env

echo "✅ Updated .env file"
echo ""

# Verify the update
if grep -q "GOOGLE_CLIENT_SECRET=$CLIENT_SECRET" /home/ubuntu/Mediczy/server/.env; then
    echo "✅ Client Secret successfully saved"
else
    echo "❌ Failed to update .env file"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔄 STEP 4: Restart Server"
echo ""
read -p "Restart server now? (y/n): " RESTART

if [ "$RESTART" = "y" ] || [ "$RESTART" = "Y" ]; then
    echo ""
    echo "🔄 Restarting mediczy-server..."
    pm2 restart mediczy-server
    
    echo ""
    echo "⏳ Waiting 3 seconds for server to start..."
    sleep 3
    
    echo ""
    echo "🔍 Checking OAuth status..."
    STATUS=$(curl -s http://localhost:8000/api/auth/oauth/status 2>/dev/null)
    
    if echo "$STATUS" | grep -q '"configured": true'; then
        echo ""
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║                   ✅ SUCCESS!                                   ║"
        echo "║           Google OAuth is now ENABLED!                         ║"
        echo "╚════════════════════════════════════════════════════════════════╝"
        echo ""
        echo "$STATUS" | jq '.' 2>/dev/null || echo "$STATUS"
    else
        echo ""
        echo "⚠️  OAuth configuration status:"
        echo "$STATUS" | jq '.google' 2>/dev/null || echo "$STATUS"
        echo ""
        echo "If still not enabled, check server logs:"
        echo "   pm2 logs mediczy-server --lines 50"
    fi
else
    echo ""
    echo "ℹ️  Remember to restart the server manually:"
    echo "   pm2 restart mediczy-server"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📖 Documentation:"
echo "   Full guide: /home/ubuntu/Mediczy/OAUTH2_IMPLEMENTATION_GUIDE.md"
echo "   Quick start: /home/ubuntu/Mediczy/OAUTH2_QUICK_START.md"
echo ""
echo "🧪 Test the login:"
echo "   1. Go to https://app.mediqzy.com/login"
echo "   2. Click the 'Google' button"
echo "   3. Sign in with your Google account"
echo ""
