#!/bin/bash
DOMAIN="https://app.mediqzy.com"
echo "Testing login page URLs..."
echo ""

declare -A PAGES=(
  ["User Login"]="/login"
  ["Doctor Login"]="/doctor-login"
  ["Admin Login"]="/admin/login"
  ["Nurse Login"]="/nurse/login"
  ["Team Login"]="/team/login"
  ["Assistant Login"]="/assistant/login"
  ["Corporate Login"]="/corporate/login"
)

for name in "${!PAGES[@]}"; do
  path="${PAGES[$name]}"
  final=$(curl -s -L -o /dev/null -w "%{url_effective}" "$DOMAIN$path")
  code=$(curl -s -o /dev/null -w "%{http_code}" "$DOMAIN$path")
  
  printf "%-20s %-30s" "$name" "$path"
  
  if [[ "$final" == *"/login"* ]] && [[ "$path" != "/login" ]]; then
    echo "❌ REDIRECT to /login"
  elif [ "$code" = "200" ]; then
    echo "✅ OK (HTTP 200)"
  else
    echo "⚠️  HTTP $code"
  fi
done
