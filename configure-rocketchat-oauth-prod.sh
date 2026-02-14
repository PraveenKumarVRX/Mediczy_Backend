#!/bin/bash

# Configure Rocket.Chat OAuth - Production Setup
# This script configures Rocket.Chat to use Mediqzy OAuth server

set -e

echo "╔═══════════════════════════════════════════════════╗"
echo "  Configuring Rocket.Chat OAuth (Production)        "
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Configuration
ROCKETCHAT_URL="${ROCKETCHAT_URL:-https://smart-chat.live}"
ROCKETCHAT_ADMIN="${ROCKETCHAT_ADMIN:-admin}"
ROCKETCHAT_PASSWORD="${ROCKETCHAT_PASSWORD:-admin}"
OAUTH_BASE_URL="https://app.mediqzy.com"

echo "📋 Configuration:"
echo "  RC URL: $ROCKETCHAT_URL"
echo "  OAuth Base: $OAUTH_BASE_URL"
echo ""

# Step 1: Login to Rocket.Chat
echo "🔐 Step 1: Authenticating with Rocket.Chat admin..."

LOGIN_RESPONSE=$(curl -s -X POST "$ROCKETCHAT_URL/api/v1/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"user\": \"$ROCKETCHAT_ADMIN\",
    \"password\": \"$ROCKETCHAT_PASSWORD\"
  }")

AUTH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.authToken // empty')
USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.userId // empty')

if [ -z "$AUTH_TOKEN" ] || [ -z "$USER_ID" ]; then
  echo "❌ Failed to authenticate"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Authenticated as: $ROCKETCHAT_ADMIN"
echo ""

# Step 2: Configure OAuth Provider Settings via API
echo "⚙️  Step 2: Configuring OAuth settings..."

# Update multiple settings to configure custom OAuth
SETTINGS=(
  '{"_id":"Accounts_OAuth_Mediqzy","value":true}'
  '{"_id":"Accounts_OAuth_Mediqzy_id","value":"rocketchat-client-id"}'
  '{"_id":"Accounts_OAuth_Mediqzy_secret","value":"rocketchat-client-secret-secure-key-12345"}'
  '{"_id":"Accounts_OAuth_Mediqzy_token_path","value":"/oauth/token"}'
  '{"_id":"Accounts_OAuth_Mediqzy_identity_path","value":"/oauth/userinfo"}'
  '{"_id":"Accounts_OAuth_Mediqzy_authorize_path","value":"/oauth/authorize"}'
  '{"_id":"Accounts_OAuth_Mediqzy_scope","value":"openid email profile"}'
  '{"_id":"Accounts_OAuth_Mediqzy_username_field","value":"username"}'
  '{"_id":"Accounts_OAuth_Mediqzy_name_field","value":"name"}'
  '{"_id":"Accounts_OAuth_Mediqzy_email_field","value":"email"}'
  '{"_id":"Accounts_OAuth_Mediqzy_id_token_param_name","value":"id_token"}'
  '{"_id":"Accounts_OAuth_Mediqzy_merge_users","value":true}'
  '{"_id":"Accounts_OAuth_Mediqzy_button_label_text","value":"Login with Mediqzy"}'
  '{"_id":"Accounts_OAuth_Mediqzy_login_style","value":"redirect"}'
  '{"_id":"Accounts_OAuth_Mediqzy_authorize_url","value":"'"$OAUTH_BASE_URL"'/oauth/authorize"}'
  '{"_id":"Accounts_OAuth_Mediqzy_token_url","value":"'"$OAUTH_BASE_URL"'/oauth/token"}'
  '{"_id":"Accounts_OAuth_Mediqzy_userinfo_url","value":"'"$OAUTH_BASE_URL"'/oauth/userinfo"}'
)

CONFIG_SUCCESS=0
CONFIG_FAILED=0

for SETTING in "${SETTINGS[@]}"; do
  SETTING_ID=$(echo "$SETTING" | jq -r '._id')
  
  UPDATE_RESPONSE=$(curl -s -X POST "$ROCKETCHAT_URL/api/v1/settings/$SETTING_ID" \
    -H "Content-Type: application/json" \
    -H "X-Auth-Token: $AUTH_TOKEN" \
    -H "X-User-Id: $USER_ID" \
    -d "$SETTING" 2>&1 || true)
  
  if echo "$UPDATE_RESPONSE" | jq -e '.success' &>/dev/null 2>&1; then
    echo "  ✅ $SETTING_ID"
    ((CONFIG_SUCCESS++))
  else
    echo "  ⚠️  $SETTING_ID"
    ((CONFIG_FAILED++))
  fi
done

echo ""
echo "✅ Configuration Settings: $CONFIG_SUCCESS applied"

# Step 3: Verify OAuth Endpoint Accessibility
echo ""
echo "🔍 Step 3: Verifying OAuth endpoints..."

ENDPOINTS=(
  "$OAUTH_BASE_URL/oauth/.well-known/oauth-authorization-server"
  "$OAUTH_BASE_URL/oauth/.well-known/openid-configuration"
)

for ENDPOINT in "${ENDPOINTS[@]}"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✅ $(echo $ENDPOINT | sed 's|.*\(oauth.*\)|\1|'): $HTTP_CODE"
  else
    echo "  ❌ $(echo $ENDPOINT | sed 's|.*\(oauth.*\)|\1|'): $HTTP_CODE"
  fi
done

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "✅ Rocket.Chat OAuth Configuration Complete!        "
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "📝 Next Steps:"
echo "  1. Log out of Rocket.Chat completely"
echo "  2. Navigate to login page"
echo "  3. Look for 'Login with Mediqzy' button"
echo "  4. Click button and test login"
echo "  5. You should be redirected back with user auto-created"
echo ""
echo "🔗 URLs Configured:"
echo "  Authorization: $OAUTH_BASE_URL/oauth/authorize"
echo "  Token: $OAUTH_BASE_URL/oauth/token"
echo "  Userinfo: $OAUTH_BASE_URL/oauth/userinfo"
echo "  Redirect: $ROCKETCHAT_URL/_oauth/mediqzy"
echo ""
echo "⚠️  If login still fails, restart services:"
echo "  pm2 restart mediczy-server"
echo "  docker restart rocketchat"
echo ""
