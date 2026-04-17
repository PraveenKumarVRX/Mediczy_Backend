#!/bin/bash

echo "🔧 Google Fit OAuth Setup Script"
echo "================================="

echo ""
echo "📋 Current Configuration:"
echo "VITE_GOOGLE_CLIENT_ID: $(grep VITE_GOOGLE_CLIENT_ID client/.env | cut -d'=' -f2)"
echo ""

echo "⚠️  ISSUE IDENTIFIED:"
echo "The current client ID is an API key, not an OAuth client ID."
echo "OAuth client IDs should end with '.apps.googleusercontent.com'"
echo ""

echo "🔧 REQUIRED FIXES:"
echo "1. Create OAuth 2.0 Client ID in Google Cloud Console"
echo "2. Enable Google Fitness API"
echo "3. Configure OAuth consent screen"
echo "4. Set authorized redirect URIs"
echo ""

read -p "Do you have a Google Cloud Project ID? (y/n): " has_project

if [ "$has_project" = "y" ]; then
    read -p "Enter your Google Cloud Project ID: " project_id
    echo "Project ID: $project_id"
    
    read -p "Do you have an OAuth Client ID? (y/n): " has_client_id
    
    if [ "$has_client_id" = "y" ]; then
        read -p "Enter your OAuth Client ID (format: xxx.apps.googleusercontent.com): " client_id
        
        # Validate client ID format
        if [[ $client_id == *.apps.googleusercontent.com ]]; then
            echo "✅ Valid OAuth Client ID format"
            
            # Update environment files
            sed -i "s|VITE_GOOGLE_CLIENT_ID=.*|VITE_GOOGLE_CLIENT_ID=$client_id|" client/.env
            sed -i "s|VITE_GOOGLE_CLIENT_ID=.*|VITE_GOOGLE_CLIENT_ID=$client_id|" client/.env.production
            
            echo ""
            echo "✅ Updated environment files with new OAuth Client ID"
            echo "🔄 Please restart your development server to apply changes"
            echo ""
            echo "🧪 Test the integration:"
            echo "1. Go to your app's Google Fit section"
            echo "2. Click 'Connect Google Fit'"
            echo "3. Complete OAuth flow"
            echo "4. Check browser console for any errors"
            
        else
            echo "❌ Invalid OAuth Client ID format"
            echo "Expected format: xxx.apps.googleusercontent.com"
        fi
    else
        echo ""
        echo "📖 To create an OAuth Client ID:"
        echo "1. Go to: https://console.cloud.google.com/apis/credentials"
        echo "2. Click 'Create Credentials' > 'OAuth 2.0 Client IDs'"
        echo "3. Choose 'Web application'"
        echo "4. Add redirect URIs:"
        echo "   - http://localhost:9443 (development)"
        echo "   - https://app.mediqzy.com (production)"
        echo "5. Copy the Client ID and run this script again"
    fi
else
    echo ""
    echo "📖 Complete Setup Guide:"
    echo ""
    echo "1. 🌐 Go to Google Cloud Console:"
    echo "   https://console.cloud.google.com/"
    echo ""
    echo "2. 📁 Create or select a project"
    echo ""
    echo "3. ⚙️ Enable Google Fitness API:"
    echo "   - Go to 'APIs & Services' > 'Library'"
    echo "   - Search for 'Fitness API'"
    echo "   - Click 'Enable'"
    echo ""
    echo "4. 🛡️ Configure OAuth Consent Screen:"
    echo "   - Go to 'APIs & Services' > 'OAuth consent screen'"
    echo "   - Choose 'External' user type"
    echo "   - Fill in app name, email, etc."
    echo "   - Add scopes: fitness.activity.read, fitness.heart_rate.read, etc."
    echo ""
    echo "5. 🔑 Create OAuth Client ID:"
    echo "   - Go to 'APIs & Services' > 'Credentials'"
    echo "   - Click 'Create Credentials' > 'OAuth 2.0 Client IDs'"
    echo "   - Choose 'Web application'"
    echo "   - Add authorized redirect URIs:"
    echo "     • http://localhost:9443"
    echo "     • https://app.mediqzy.com"
    echo ""
    echo "6. 📝 Run this script again with your new Client ID"
fi

echo ""
echo "🔍 Troubleshooting:"
echo "- Error 'invalid_client': Wrong client ID format"
echo "- Error 'redirect_uri_mismatch': Wrong redirect URIs configured"
echo "- Error 'access_denied': OAuth consent screen not configured"
echo ""
