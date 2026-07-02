#!/bin/bash
# Verify SPA deep links return HTML (not CDN 404) after frontend deploy.
set -euo pipefail

PROD_URL="${PROD_URL:-https://app.mediqzy.com}"
ROUTES="${SPA_ROUTES:-/scm/dashboard /scm/login /doctor/login /team/settings}"

failures=0

echo "Checking SPA routes at $PROD_URL ..."

for route in $ROUTES; do
  headers="$(curl -fsSI "$PROD_URL$route" 2>/dev/null || true)"
  status="$(echo "$headers" | awk '/^HTTP/{print $2; exit}')"
  ctype="$(echo "$headers" | awk -F': ' 'tolower($1)=="content-type"{print $2; exit}' | tr -d '\r')"

  if [ "$status" != "200" ]; then
    echo "❌ $route → HTTP $status (expected 200)"
    failures=$((failures + 1))
    continue
  fi

  if ! echo "$ctype" | grep -qi 'text/html'; then
    echo "❌ $route → HTTP 200 but content-type=$ctype (expected text/html)"
    failures=$((failures + 1))
    continue
  fi

  echo "✅ $route → 200 text/html"
done

# Confirm SCM route strings ship in the live bundle
INDEX_HTML="$(curl -fsSL "$PROD_URL/index.html")"
INDEX_JS="$(echo "$INDEX_HTML" | grep -oE 'assets/index-[^"]+\.js' | head -1)"
if [ -n "$INDEX_JS" ]; then
  if curl -fsSL "$PROD_URL/$INDEX_JS" | grep -q '/scm/dashboard'; then
    echo "✅ Live bundle contains /scm/dashboard route"
  else
    echo "❌ Live bundle missing /scm/dashboard — redeploy frontend from main"
    failures=$((failures + 1))
  fi
else
  echo "⚠️  Could not resolve index bundle from index.html"
fi

if [ "$failures" -gt 0 ]; then
  echo ""
  echo "$failures check(s) failed. Run:"
  echo "  bash scripts/deploy/configure-cloudfront-spa-routing.sh"
  echo "  bash scripts/deploy/deploy-full-prod-s3.sh"
  exit 1
fi

echo ""
echo "All SPA route checks passed"
