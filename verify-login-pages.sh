#!/bin/bash
DOMAIN="https://mediqzy.com"
echo "Verifying login pages load correctly..."
echo ""

check_page() {
  local name="$1"
  local path="$2"
  local search_text="$3"
  
  content=$(curl -s "$DOMAIN$path")
  
  printf "%-20s %-30s" "$name" "$path"
  
  # Check if page returns 200
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$DOMAIN$path")
  
  if [ "$http_code" != "200" ]; then
    echo "❌ HTTP $http_code"
    return
  fi
  
  # Check if it's the SPA HTML (all pages serve the same HTML)
  if echo "$content" | grep -q "Mediqzy - Healthcare Platform"; then
    echo "✅ OK - SPA loaded"
  else
    echo "❌ Invalid response"
  fi
}

# Test all login pages
check_page "User Login" "/login" "Login"
check_page "Doctor Login" "/doctor-login" "Doctor"
check_page "Admin Login" "/admin/login" "Admin"
check_page "Nurse Login" "/nurse/login" "Nurse"
check_page "Team Login" "/team/login" "Team"
check_page "Assistant" "/assistant/login" "Assistant"
check_page "Corporate" "/corporate/login" "Corporate"

echo ""
echo "Note: All pages should return 200 and serve the SPA HTML."
echo "Client-side routing handles the actual page rendering."
