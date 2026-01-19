#!/bin/bash

# Authentication Diagnosis Script
# Quickly identify and fix authentication issues

echo "🔍 Mediczy Authentication Diagnosis"
echo "===================================="
echo ""

# Check 1: JWT_SECRET
echo "1️⃣  Checking JWT_SECRET..."
if grep -q "^JWT_SECRET=" .env; then
    JWT_VALUE=$(grep "^JWT_SECRET=" .env | cut -d= -f2)
    if [ -z "$JWT_VALUE" ]; then
        echo "   ❌ JWT_SECRET is set but EMPTY!"
        echo "   Fix: Add a secure value to .env"
        echo "   Run: echo 'JWT_SECRET=$(openssl rand -hex 32)' >> .env"
    else
        echo "   ✅ JWT_SECRET is set (${#JWT_VALUE} characters)"
    fi
else
    echo "   ❌ JWT_SECRET not found in .env!"
    echo "   Fix: Add JWT_SECRET to .env file"
    echo "   Run: echo 'JWT_SECRET=$(openssl rand -hex 32)' >> .env"
fi
echo ""

# Check 2: Hardcoded JWT secrets in code
echo "2️⃣  Checking for hardcoded JWT secrets..."
HARDCODED=$(grep -r "mediczy-.*-secret" server/routes/ server/controller/ 2>/dev/null | grep -v node_modules | wc -l)
if [ "$HARDCODED" -gt 0 ]; then
    echo "   ⚠️  Found $HARDCODED instances of hardcoded secrets!"
    echo "   Files with hardcoded secrets:"
    grep -r "mediczy-.*-secret" server/routes/ server/controller/ 2>/dev/null | grep -v node_modules | cut -d: -f1 | sort -u | head -10
    echo "   Action needed: Update these files to use JWT_CONFIG.SECRET"
else
    echo "   ✅ No hardcoded secrets found"
fi
echo ""

# Check 3: Multiple JWT_SECRET patterns
echo "3️⃣  Checking for inconsistent JWT usage..."
PROCESS_ENV=$(grep -r "process.env.JWT_SECRET" server/routes/ server/controller/ 2>/dev/null | grep -v node_modules | wc -l)
JWT_CONFIG=$(grep -r "JWT_CONFIG.SECRET" server/routes/ server/controller/ 2>/dev/null | grep -v node_modules | wc -l)

echo "   Files using process.env.JWT_SECRET: $PROCESS_ENV"
echo "   Files using JWT_CONFIG.SECRET: $JWT_CONFIG"

if [ "$JWT_CONFIG" -eq 0 ] && [ "$PROCESS_ENV" -gt 0 ]; then
    echo "   ⚠️  No files using standardized JWT_CONFIG yet"
    echo "   Action: Migrate to use centralized config"
fi
echo ""

# Check 4: Password comparison methods
echo "4️⃣  Checking password comparison methods..."
BCRYPT_COMPARE=$(grep -r "bcrypt.compare" server/routes/ server/controller/ 2>/dev/null | grep -v node_modules | wc -l)
VERIFY_PASSWORD=$(grep -r "verifyPassword\|comparePassword" server/routes/ server/controller/ 2>/dev/null | grep -v node_modules | wc -l)

echo "   Files using bcrypt.compare directly: $BCRYPT_COMPARE"
echo "   Files using verifyPassword/comparePassword: $VERIFY_PASSWORD"
echo ""

# Check 5: Login endpoints
echo "5️⃣  Finding all login endpoints..."
echo "   Login endpoints found:"
grep -r "router.post.*login" server/routes/ 2>/dev/null | grep -v node_modules | cut -d: -f1 | sort -u | head -15
echo ""

# Check 6: Recent login errors in logs
echo "6️⃣  Checking recent login errors..."
if [ -d "logs" ]; then
    RECENT_ERRORS=$(find logs -name "*.log" -mtime -1 -exec grep -l "login.*error\|401\|Invalid" {} \; 2>/dev/null | wc -l)
    if [ "$RECENT_ERRORS" -gt 0 ]; then
        echo "   ⚠️  Found errors in $RECENT_ERRORS log files"
        echo "   Recent login errors:"
        find logs -name "*.log" -mtime -1 -exec grep "login.*error\|401.*login" {} \; 2>/dev/null | tail -5
    else
        echo "   ✅ No recent login errors found in logs"
    fi
else
    echo "   ℹ️  No logs directory found"
fi
echo ""

# Check 7: Node environment
echo "7️⃣  Checking environment..."
if grep -q "^NODE_ENV=development" .env; then
    echo "   ℹ️  Running in DEVELOPMENT mode"
    echo "   Debug features enabled"
elif grep -q "^NODE_ENV=production" .env; then
    echo "   ℹ️  Running in PRODUCTION mode"
    echo "   Debug features may be disabled"
else
    echo "   ⚠️  NODE_ENV not set"
fi
echo ""

# Summary and Recommendations
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 SUMMARY & RECOMMENDATIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Generate recommendations
RECOMMENDATIONS=()

if ! grep -q "^JWT_SECRET=" .env || [ -z "$(grep "^JWT_SECRET=" .env | cut -d= -f2)" ]; then
    RECOMMENDATIONS+=("🔴 CRITICAL: Set JWT_SECRET in .env file")
    echo "   Command: echo 'JWT_SECRET=$(openssl rand -hex 32)' >> .env"
fi

if [ "$HARDCODED" -gt 0 ]; then
    RECOMMENDATIONS+=("🟡 IMPORTANT: Remove hardcoded JWT secrets from code")
    echo "   Action: Update files to use import { JWT_CONFIG } from '../config/auth.config.js'"
fi

if [ "$JWT_CONFIG" -eq 0 ]; then
    RECOMMENDATIONS+=("🟡 IMPORTANT: Migrate to centralized auth configuration")
    echo "   Files created: server/config/auth.config.js"
    echo "   Files created: server/utils/auth.utils.js"
    echo "   Files created: server/controllers/unified-auth.controller.js"
fi

if [ ${#RECOMMENDATIONS[@]} -eq 0 ]; then
    echo "✅ No critical issues found!"
    echo "   Your authentication system looks good."
else
    echo "⚠️  ${#RECOMMENDATIONS[@]} recommendations:"
    for rec in "${RECOMMENDATIONS[@]}"; do
        echo "   $rec"
    done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📖 For detailed fix instructions, see:"
echo "   AUTHENTICATION_FIX.md"
echo ""
echo "🐛 For debugging help, see:"
echo "   docs/DEBUGGING_GUIDE.md"
echo ""
