#!/bin/bash

# ============================================
# PRE-DEPLOYMENT VERIFICATION SCRIPT
# For mediqzy.com Deployment
# ============================================

set -e

echo "🚀 PRE-DEPLOYMENT VERIFICATION FOR MEDIQZY.COM"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Function to check status
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $1"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $1"
        ((FAILED++))
    fi
}

warn_status() {
    echo -e "${YELLOW}⚠ WARNING${NC}: $1"
    ((WARNINGS++))
}

# ============================================
# 1. GIT VERIFICATION
# ============================================
echo -e "${BLUE}1. GIT VERIFICATION${NC}"
echo "-------------------"

# Check if git repo
git rev-parse --git-dir > /dev/null 2>&1
check_status "Git repository exists"

# Check if on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" = "main" ]; then
    echo -e "${GREEN}✓ PASS${NC}: On main branch"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: Not on main branch (current: $CURRENT_BRANCH)"
    ((WARNINGS++))
fi

# Check for uncommitted changes
if git diff-index --quiet HEAD --; then
    echo -e "${GREEN}✓ PASS${NC}: No uncommitted changes"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: Uncommitted changes detected"
    git status --short | head -5
    ((WARNINGS++))
fi

# Check if origin/main is reachable
git fetch origin main > /dev/null 2>&1
check_status "Remote origin/main is reachable"

# Check latest commit
LATEST_COMMIT=$(git log -1 --oneline | cut -d' ' -f1)
echo "  Latest commit: $LATEST_COMMIT"

echo ""

# ============================================
# 2. DEPENDENCY VERIFICATION
# ============================================
echo -e "${BLUE}2. DEPENDENCY VERIFICATION${NC}"
echo "----------------------------"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ PASS${NC}: Node.js installed ($NODE_VERSION)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Node.js not installed"
    ((FAILED++))
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓ PASS${NC}: npm installed ($NPM_VERSION)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: npm not installed"
    ((FAILED++))
fi

# Check if node_modules exist
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Root node_modules installed"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: Root node_modules not found (run: npm install)"
    ((WARNINGS++))
fi

# Check server node_modules
if [ -d "server/node_modules" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Server node_modules installed"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: Server node_modules not found"
    ((WARNINGS++))
fi

# Check client node_modules
if [ -d "client/node_modules" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Client node_modules installed"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: Client node_modules not found"
    ((WARNINGS++))
fi

echo ""

# ============================================
# 3. ENVIRONMENT VERIFICATION
# ============================================
echo -e "${BLUE}3. ENVIRONMENT VERIFICATION${NC}"
echo "-----------------------------"

# Check .env files
if [ -f ".env.production" ]; then
    echo -e "${GREEN}✓ PASS${NC}: .env.production exists"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: .env.production not found"
    ((FAILED++))
fi

# Check if .env has critical values
CRITICAL_VARS=("JWT_SECRET" "DB_HOST" "DB_USER" "DB_PASSWORD" "DB_NAME")
for var in "${CRITICAL_VARS[@]}"; do
    if grep -q "^$var=" .env.production; then
        VALUE=$(grep "^$var=" .env.production | cut -d'=' -f2)
        if [ -n "$VALUE" ] && [ "$VALUE" != "your-" ]; then
            echo -e "${GREEN}✓ PASS${NC}: $var configured"
            ((PASSED++))
        else
            echo -e "${YELLOW}⚠ WARNING${NC}: $var not properly configured"
            ((WARNINGS++))
        fi
    fi
done

echo ""

# ============================================
# 4. BUILD VERIFICATION
# ============================================
echo -e "${BLUE}4. BUILD VERIFICATION${NC}"
echo "----------------------"

# Check if package.json valid JSON
if python3 -m json.tool package.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}: Root package.json is valid JSON"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Root package.json is invalid"
    ((FAILED++))
fi

# Check if server package.json valid
if python3 -m json.tool server/package.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}: Server package.json is valid JSON"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Server package.json is invalid"
    ((FAILED++))
fi

# Check if client package.json valid
if python3 -m json.tool client/package.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}: Client package.json is valid JSON"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Client package.json is invalid"
    ((FAILED++))
fi

# Check if ecosystem.config.js exists
if [ -f "ecosystem.config.js" ]; then
    echo -e "${GREEN}✓ PASS${NC}: PM2 ecosystem.config.js exists"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: PM2 ecosystem.config.js not found"
    ((WARNINGS++))
fi

echo ""

# ============================================
# 5. SOURCE CODE VERIFICATION
# ============================================
echo -e "${BLUE}5. SOURCE CODE VERIFICATION${NC}"
echo "----------------------------"

# Check key files exist
KEY_FILES=(
    "server/index.js"
    "server/routes/doctor.route.js"
    "server/routes/billing.route.js"
    "server/routes/hospital-auth.route.js"
    "client/src/pages/doctor/DoctorDashboard.tsx"
    "client/src/pages/admin/AdminTenantManagement.tsx"
    "client/vite.config.ts"
)

for file in "${KEY_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $file exists"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $file missing"
        ((FAILED++))
    fi
done

echo ""

# ============================================
# 6. DOCUMENTATION VERIFICATION
# ============================================
echo -e "${BLUE}6. DOCUMENTATION VERIFICATION${NC}"
echo "------------------------------"

DOC_FILES=(
    "DEPLOYMENT_TO_MEDIQZY_PLAN.md"
    "DOCTOR_PORTAL_FIXES_COMPLETE.md"
    "DOCTOR_PORTAL_TECHNICAL_DETAILS.md"
    "DOCTOR_PORTAL_TESTING_GUIDE.md"
    "DHYAN_HOSPITAL_COMPLETE_SETUP.md"
    "ADMIN_TENANT_MANAGEMENT_GUIDE.md"
)

for doc in "${DOC_FILES[@]}"; do
    if [ -f "$doc" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $doc exists"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ WARNING${NC}: $doc not found"
        ((WARNINGS++))
    fi
done

echo ""

# ============================================
# 7. DATABASE VERIFICATION
# ============================================
echo -e "${BLUE}7. DATABASE VERIFICATION${NC}"
echo "------------------------"

# Check if MySQL command available
if command -v mysql &> /dev/null; then
    echo -e "${GREEN}✓ PASS${NC}: MySQL client installed"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: MySQL client not installed"
    ((WARNINGS++))
fi

# Check migration files
if [ -f "server/migrations/hospital-portal-tables.sql" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Database migration files exist"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: Database migration files not found"
    ((WARNINGS++))
fi

echo ""

# ============================================
# 8. RUNTIME VERIFICATION
# ============================================
echo -e "${BLUE}8. RUNTIME VERIFICATION${NC}"
echo "------------------------"

# Check if PM2 installed
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 -v)
    echo -e "${GREEN}✓ PASS${NC}: PM2 installed ($PM2_VERSION)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: PM2 not installed (needed for production)"
    ((WARNINGS++))
fi

# Check if Nginx installed
if command -v nginx &> /dev/null; then
    NGINX_VERSION=$(nginx -v 2>&1 | cut -d'/' -f2)
    echo -e "${GREEN}✓ PASS${NC}: Nginx installed (v$NGINX_VERSION)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: Nginx not installed"
    ((WARNINGS++))
fi

# Check available ports
for PORT in 8000 3000 80 443; do
    if ! netstat -tuln 2>/dev/null | grep -q ":$PORT "; then
        echo -e "${GREEN}✓ PASS${NC}: Port $PORT available"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ WARNING${NC}: Port $PORT already in use"
        ((WARNINGS++))
    fi
done

echo ""

# ============================================
# 9. SECURITY VERIFICATION
# ============================================
echo -e "${BLUE}9. SECURITY VERIFICATION${NC}"
echo "------------------------"

# Check if .env files excluded from git
if grep -q "\.env" .gitignore 2>/dev/null; then
    echo -e "${GREEN}✓ PASS${NC}: .env files excluded from git"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: .env files may not be properly excluded"
    ((WARNINGS++))
fi

# Check if node_modules excluded
if grep -q "node_modules" .gitignore 2>/dev/null; then
    echo -e "${GREEN}✓ PASS${NC}: node_modules excluded from git"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}: node_modules may be in git"
    ((WARNINGS++))
fi

echo ""

# ============================================
# SUMMARY
# ============================================
echo -e "${BLUE}SUMMARY${NC}"
echo "======="
echo -e "✓ Passed:  ${GREEN}$PASSED${NC}"
echo -e "✗ Failed:  ${RED}$FAILED${NC}"
echo -e "⚠ Warning: ${YELLOW}$WARNINGS${NC}"

TOTAL=$((PASSED + FAILED + WARNINGS))
echo "Total:   $TOTAL"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ PRE-DEPLOYMENT VERIFICATION PASSED!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review DEPLOYMENT_TO_MEDIQZY_PLAN.md"
    echo "2. Prepare production environment"
    echo "3. Build frontend: npm run build --prefix client"
    echo "4. Deploy backend services: pm2 start ecosystem.config.js"
    echo "5. Configure Nginx for mediqzy.com"
    echo "6. Run post-deployment health checks"
    echo ""
    exit 0
else
    echo -e "${RED}❌ PRE-DEPLOYMENT VERIFICATION FAILED!${NC}"
    echo ""
    echo "Please fix the above issues before deployment."
    echo ""
    exit 1
fi
