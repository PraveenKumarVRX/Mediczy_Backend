#!/bin/bash

##############################################################################
# MEDICZY PRE-DEPLOYMENT SANITY CHECK
# Automated validation before production deployment
# Exit codes: 0 = Pass, 1 = Fail (blocks deployment)
##############################################################################

set -e  # Exit on any error

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║         MEDICZY PRE-DEPLOYMENT SANITY CHECK                      ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Started at: $(date)"
echo ""

# Ensure script runs from repo root.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# Load server env when available.
SERVER_ENV="$REPO_ROOT/server/.env"
if [ -f "$SERVER_ENV" ]; then
    set -a
    . "$SERVER_ENV"
    set +a
fi

BASE_URL="${BASE_URL:-http://localhost:8888}"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0
CRITICAL_FAILURES=0

# Check results storage
declare -a FAILED_ITEMS
declare -a WARNING_ITEMS

# Logging
LOG_FILE="sanity-check-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE")
exec 2>&1

##############################################################################
# HELPER FUNCTIONS
##############################################################################

check_pass() {
    local message=$1
    echo -e "${GREEN}✓${NC} $message"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

check_fail() {
    local message=$1
    local is_critical=${2:-false}
    echo -e "${RED}✗${NC} $message"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    FAILED_ITEMS+=("$message")
    if [ "$is_critical" = true ]; then
        CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
    fi
}

check_warn() {
    local message=$1
    echo -e "${YELLOW}⚠${NC} $message"
    WARNING_CHECKS=$((WARNING_CHECKS + 1))
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    WARNING_ITEMS+=("$message")
}

section_header() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo "  $1"
    echo "═══════════════════════════════════════════════════════════════════"
}

##############################################################################
# CHECK 1: ENVIRONMENT VALIDATION
##############################################################################

section_header "CHECK 1: ENVIRONMENT VALIDATION"

# Check NODE_ENV
if [ "$NODE_ENV" = "production" ]; then
    check_pass "NODE_ENV set to production"
else
    check_fail "NODE_ENV not set to production (current: ${NODE_ENV:-not set})" true
fi

# Check JWT_SECRET
if [ -n "$JWT_SECRET" ] && [ "$JWT_SECRET" != "mediczy-super-secret-key-2024" ]; then
    check_pass "JWT_SECRET is set (not using fallback)"
else
    check_fail "JWT_SECRET not set or using fallback secret" true
fi

# Check critical environment variables
DB_HOST_EFFECTIVE="${DB_HOST:-$POSTGRES_HOST}"
DB_PASSWORD_EFFECTIVE="${DB_PASSWORD:-$POSTGRES_PASSWORD}"

if [ -n "$DB_HOST_EFFECTIVE" ]; then
    check_pass "DB host is configured"
else
    check_warn "DB host not set (may be using default)"
fi

if [ -n "$DB_PASSWORD_EFFECTIVE" ]; then
    check_pass "DB password is set"
else
    check_warn "DB password not set in environment"
fi

# Check CORS configuration
CORS_EFFECTIVE="${CORS_ORIGIN:-$ALLOWED_ORIGINS}"
if [ -n "$CORS_EFFECTIVE" ]; then
    check_pass "CORS configured"
else
    check_warn "CORS not set (using defaults)"
fi

##############################################################################
# CHECK 2: FILE SYSTEM & DEPENDENCIES
##############################################################################

section_header "CHECK 2: FILE SYSTEM & DEPENDENCIES"

# Check critical files exist
critical_files=(
    "server/app.js"
    "package.json"
    "server/models/user.model.intelligent.js"
    "server/models/doctor.model.intelligent.js"
    "server/middleware/auth.middleware.js"
)

for file in "${critical_files[@]}"; do
    if [ -f "$file" ]; then
        check_pass "Critical file exists: $file"
    else
        check_fail "Missing critical file: $file" true
    fi
done

# Check server node_modules (main dependency location)
if [ -d "server/node_modules" ]; then
    check_pass "server/node_modules directory exists"
else
    check_fail "server/node_modules not found - run: cd server && npm install" true
fi

# Check server/package.json for critical dependencies
if [ -f "server/package.json" ]; then
    critical_deps=("express" "jsonwebtoken" "bcryptjs" "sequelize" "cors" "helmet")
    for dep in "${critical_deps[@]}"; do
        if grep -q "\"$dep\"" server/package.json; then
            check_pass "Dependency configured: $dep"
        else
            check_fail "Missing critical dependency in server/package.json: $dep" true
        fi
    done
fi

##############################################################################
# CHECK 3: SERVER HEALTH
##############################################################################

section_header "CHECK 3: SERVER HEALTH"

# Check if server is running
if pm2 jlist 2>/dev/null | grep -q "mediczy-server.*online"; then
    check_pass "Server is running (PM2)"
    
    # Get server uptime
    UPTIME_MS=$(pm2 jlist 2>/dev/null | jq -r 'map(select(.name=="mediczy-server")) | .[0].pm2_env.pm_uptime // empty' 2>/dev/null | head -n1)
    if [ -n "$UPTIME_MS" ] && [[ "$UPTIME_MS" =~ ^[0-9]+$ ]]; then
        NOW_SEC=$(date +%s)
        UPTIME_SEC=$((NOW_SEC - (UPTIME_MS / 1000)))
        check_pass "Server uptime: ${UPTIME_SEC} seconds"
    fi
    
    # Check restart count
    RESTARTS=$(pm2 jlist 2>/dev/null | jq -r 'map(select(.name=="mediczy-server")) | .[0].pm2_env.restart_time // empty' 2>/dev/null | head -n1)
    if [ -n "$RESTARTS" ] && [[ "$RESTARTS" =~ ^[0-9]+$ ]]; then
        if [ "$RESTARTS" -lt 5 ]; then
        check_pass "Server restart count acceptable ($RESTARTS)"
    elif [ "$RESTARTS" -lt 50 ]; then
        check_warn "Server has restarted $RESTARTS times (monitor stability)"
    else
        check_warn "Server has restarted $RESTARTS times (high restart count)"
        fi
    fi
else
    check_fail "Server is not running" true
fi

# Check server responds to HTTP
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "404" ]; then
    check_pass "Server responds to HTTP requests (HTTP $HTTP_CODE)"
else
    check_fail "Server not responding to HTTP (HTTP $HTTP_CODE)" true
fi

##############################################################################
# CHECK 4: DATABASE CONNECTIVITY
##############################################################################

section_header "CHECK 4: DATABASE CONNECTIVITY"

# Test database by attempting a login (requires DB connection)
DB_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/doctors/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"doctor@mediczy.com","password":"Doctor123"}' 2>/dev/null || echo -e "\n000")

DB_CODE=$(echo "$DB_RESPONSE" | tail -n1)
DB_BODY=$(echo "$DB_RESPONSE" | sed '$d')

if [ "$DB_CODE" = "200" ]; then
    check_pass "Database connectivity confirmed (login test passed)"
elif [ "$DB_CODE" = "401" ]; then
    check_pass "Database connectivity confirmed (authentication working)"
else
    check_fail "Database connection issue (HTTP $DB_CODE)" true
fi

##############################################################################
# CHECK 5: AUTHENTICATION SYSTEM
##############################################################################

section_header "CHECK 5: AUTHENTICATION SYSTEM (Critical User Types)"

test_login() {
    local name=$1
    local email=$2
    local password=$3
    local endpoint=$4
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}" 2>/dev/null || echo -e "\n000")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        TOKEN=$(echo "$BODY" | jq -r '.token // empty' 2>/dev/null)
        if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
            check_pass "$name authentication working"
            return 0
        else
            check_fail "$name authentication failed (no token)" true
            return 1
        fi
    else
        check_fail "$name authentication failed (HTTP $HTTP_CODE)" true
        return 1
    fi
}

# Test critical authentication endpoints
test_login "User/Patient" "user@mediczy.com" "User123" "/api/users/login"
test_login "Doctor" "doctor@mediczy.com" "Doctor123" "/api/doctors/login"

ADMIN_LOGIN_ENDPOINT="${ADMIN_LOGIN_ENDPOINT:-/api/admin/login}"
if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
    check_fail "Admin credentials not set (ADMIN_EMAIL/ADMIN_PASSWORD)" true
else
    test_login "Admin" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$ADMIN_LOGIN_ENDPOINT"
fi

test_login "Nurse" "nurse@mediczy.com" "Nurse123" "/api/nurse/login"

##############################################################################
# CHECK 6: SECURITY CONFIGURATION
##############################################################################

section_header "CHECK 6: SECURITY CONFIGURATION"

# Check security headers
HEADERS=$(curl -s -I $BASE_URL 2>/dev/null || echo "")

if echo "$HEADERS" | grep -qi "X-Content-Type-Options"; then
    check_pass "X-Content-Type-Options header present"
else
    check_fail "X-Content-Type-Options header missing" false
fi

if echo "$HEADERS" | grep -qi "X-Frame-Options"; then
    check_pass "X-Frame-Options header present (clickjacking protection)"
else
    check_fail "X-Frame-Options header missing" false
fi

if echo "$HEADERS" | grep -qi "Strict-Transport-Security"; then
    check_pass "HSTS header present"
else
    check_warn "HSTS header missing (may require HTTPS)"
fi

if echo "$HEADERS" | grep -qi "Content-Security-Policy"; then
    check_pass "CSP header present (XSS protection)"
else
    check_warn "CSP header missing"
fi

# Check rate limiting
RATE_HEADERS=$(curl -s -I $BASE_URL/api/users/login 2>/dev/null || echo "")
if echo "$RATE_HEADERS" | grep -qi "RateLimit\|X-RateLimit\|retry-after"; then
    check_pass "Rate limiting configured"
else
    check_warn "Rate limiting headers not visible"
fi

# Check CORS
CORS_RESPONSE=$(curl -s -I -X OPTIONS $BASE_URL/api/users/login \
    -H "Origin: http://localhost:5173" 2>/dev/null || echo "")

if echo "$CORS_RESPONSE" | grep -qi "Access-Control-Allow"; then
    check_pass "CORS configured"
else
    check_fail "CORS not responding" false
fi

##############################################################################
# CHECK 7: API ENDPOINTS
##############################################################################

section_header "CHECK 7: CRITICAL API ENDPOINTS"

# Test critical endpoints exist (not authentication)
endpoints=(
    "/api/doctors"
    "/api/users"
)

for endpoint in "${endpoints[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint" 2>/dev/null || echo "000")
    # 401 is acceptable (means endpoint exists but requires auth)
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; then
        check_pass "Endpoint accessible: $endpoint (HTTP $STATUS)"
    else
        check_warn "Endpoint issue: $endpoint (HTTP $STATUS)"
    fi
done

##############################################################################
# CHECK 8: PROCESS & RESOURCES
##############################################################################

section_header "CHECK 8: PROCESS & RESOURCE CHECKS"

# Check PM2 is installed
if command -v pm2 &> /dev/null; then
    check_pass "PM2 is installed ($(pm2 -v))"
else
    check_fail "PM2 not installed" true
fi

# Check available disk space
DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    check_pass "Disk space available (${DISK_USAGE}% used)"
elif [ "$DISK_USAGE" -lt 90 ]; then
    check_warn "Disk space getting low (${DISK_USAGE}% used)"
else
    check_fail "Disk space critical (${DISK_USAGE}% used)" false
fi

# Check memory usage
if command -v free &> /dev/null; then
    MEM_USAGE=$(free | awk 'NR==2 {printf "%.0f", $3/$2 * 100}')
    if [ "$MEM_USAGE" -lt 80 ]; then
        check_pass "Memory usage acceptable (${MEM_USAGE}%)"
    elif [ "$MEM_USAGE" -lt 90 ]; then
        check_warn "Memory usage high (${MEM_USAGE}%)"
    else
        check_fail "Memory usage critical (${MEM_USAGE}%)" false
    fi
fi

##############################################################################
# CHECK 9: CONFIGURATION FILES
##############################################################################

section_header "CHECK 9: CONFIGURATION VALIDATION"

# Check for .env file existence
if [ -f ".env" ]; then
    check_pass ".env file exists"
    
    # Check for sensitive data not committed
    if [ -f ".gitignore" ]; then
        if grep -q ".env" .gitignore; then
            check_pass ".env is in .gitignore"
        else
            check_warn ".env not in .gitignore (security risk)"
        fi
    fi
else
    check_warn ".env file not found (using environment variables)"
fi

# Check package-lock.json exists (dependency lock)
if [ -f "package-lock.json" ]; then
    check_pass "package-lock.json exists (dependencies locked)"
else
    check_warn "package-lock.json missing (dependency versions not locked)"
fi

##############################################################################
# CHECK 10: CODE QUALITY CHECKS
##############################################################################

section_header "CHECK 10: CODE QUALITY & SYNTAX"

# Check for syntax errors in critical files
if command -v node &> /dev/null; then
    SYNTAX_ERROR=false
    
    # Check server/app.js
    if node -c server/app.js 2>/dev/null; then
        check_pass "server/app.js syntax valid"
    else
        check_fail "server/app.js has syntax errors" true
        SYNTAX_ERROR=true
    fi
    
    # Check server/server.js
    if [ -f "server/server.js" ]; then
        if node -c server/server.js 2>/dev/null; then
            check_pass "server/server.js syntax valid"
        else
            check_fail "server/server.js has syntax errors" true
            SYNTAX_ERROR=true
        fi
    fi
fi

# Check for common issues in code
if grep -r "console.log" server/*.js 2>/dev/null | wc -l | grep -qv "^0$"; then
    check_warn "console.log statements found (consider using proper logging)"
fi

if grep -r "TODO\|FIXME\|XXX" server/ 2>/dev/null | wc -l | grep -qv "^0$"; then
    TODO_COUNT=$(grep -r "TODO\|FIXME\|XXX" server/ 2>/dev/null | wc -l)
    check_warn "$TODO_COUNT TODO/FIXME comments found in code"
fi

##############################################################################
# CHECK 11: BACKUP & RECOVERY
##############################################################################

section_header "CHECK 11: BACKUP & RECOVERY READINESS"

# Check if backup script exists
if [ -f "backup-database.sh" ]; then
    check_pass "Database backup script exists"
else
    check_warn "No backup script found (recommended: backup-database.sh)"
fi

# Check backup directory
if [ -d "/var/backups/mediczy" ]; then
    BACKUP_COUNT=$(ls -1 /var/backups/mediczy/*.sql.gz 2>/dev/null | wc -l)
    if [ "$BACKUP_COUNT" -gt 0 ]; then
        check_pass "Database backups present ($BACKUP_COUNT backups found)"
    else
        check_warn "Backup directory exists but no backups found"
    fi
else
    check_warn "Backup directory not found (/var/backups/mediczy)"
fi

##############################################################################
# CHECK 12: DEPLOYMENT READINESS
##############################################################################

section_header "CHECK 12: DEPLOYMENT READINESS INDICATORS"

# Check if git is clean (no uncommitted changes)
if command -v git &> /dev/null && [ -d ".git" ]; then
    if git diff-index --quiet HEAD -- 2>/dev/null; then
        check_pass "Git working directory is clean"
    else
        check_warn "Uncommitted changes in git (ensure all changes are committed)"
    fi
    
    # Check current branch
    BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
        check_pass "On main/master branch ($BRANCH)"
    else
        check_warn "Not on main/master branch (current: $BRANCH)"
    fi
fi

# Check if there's a deployment timestamp
if [ -f "LAST_DEPLOYMENT.txt" ]; then
    LAST_DEPLOY=$(cat LAST_DEPLOYMENT.txt)
    check_pass "Last deployment recorded: $LAST_DEPLOY"
else
    check_warn "No deployment history found"
fi

##############################################################################
# FINAL SUMMARY
##############################################################################

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  SANITY CHECK SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_CHECKS / $TOTAL_CHECKS) * 100}")

echo -e "Total Checks:    $TOTAL_CHECKS"
echo -e "${GREEN}Passed:          $PASSED_CHECKS${NC}"
echo -e "${YELLOW}Warnings:        $WARNING_CHECKS${NC}"
echo -e "${RED}Failed:          $FAILED_CHECKS${NC}"
echo -e "${RED}Critical Fails:  $CRITICAL_FAILURES${NC}"
echo ""
echo "Success Rate:    ${SUCCESS_RATE}%"
echo ""

# Show failed items
if [ ${#FAILED_ITEMS[@]} -gt 0 ]; then
    echo -e "${RED}FAILED CHECKS:${NC}"
    for item in "${FAILED_ITEMS[@]}"; do
        echo "  ✗ $item"
    done
    echo ""
fi

# Show warnings
if [ ${#WARNING_ITEMS[@]} -gt 0 ]; then
    echo -e "${YELLOW}WARNINGS:${NC}"
    for item in "${WARNING_ITEMS[@]}"; do
        echo "  ⚠ $item"
    done
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "Completed at: $(date)"
echo "Log file: $LOG_FILE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

##############################################################################
# DEPLOYMENT DECISION
##############################################################################

if [ $CRITICAL_FAILURES -gt 0 ]; then
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                                   ║${NC}"
    echo -e "${RED}║  ✗ DEPLOYMENT BLOCKED - CRITICAL FAILURES DETECTED                ║${NC}"
    echo -e "${RED}║                                                                   ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}Fix critical issues before deploying to production!${NC}"
    echo ""
    exit 1
elif [ $FAILED_CHECKS -gt 0 ]; then
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║                                                                   ║${NC}"
    echo -e "${YELLOW}║  ⚠ DEPLOYMENT NOT RECOMMENDED - FAILURES DETECTED                ║${NC}"
    echo -e "${YELLOW}║                                                                   ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Review failures before proceeding with deployment.${NC}"
    echo ""
    exit 1
elif [ $WARNING_CHECKS -gt 5 ]; then
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║                                                                   ║${NC}"
    echo -e "${YELLOW}║  ⚠ DEPLOYMENT ALLOWED - REVIEW WARNINGS                          ║${NC}"
    echo -e "${YELLOW}║                                                                   ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Multiple warnings detected. Review before production deployment.${NC}"
    echo ""
    exit 0
else
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║  ✓ DEPLOYMENT APPROVED - ALL CHECKS PASSED                       ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Safe to proceed with production deployment!${NC}"
    echo ""
    
    # Record deployment check
    echo "$(date -Iseconds) - Sanity check passed - Success rate: ${SUCCESS_RATE}%" >> DEPLOYMENT_CHECKS.log
    
    exit 0
fi
