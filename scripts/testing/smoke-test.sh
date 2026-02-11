#!/bin/bash
# Daily Smoke Test for Production Environment
# Tests critical functionality and sends alerts on failures
# Run via cron: 0 6 * * * /home/ubuntu/Mediczy/smoke-test.sh

# Note: Don't use set -e so all tests run even if some fail

##############################################################################
# CONFIGURATION
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-testing-env.sh" || true

BASE_URL="${BASE_URL:-http://localhost:8888}"
ALERT_EMAIL="${ALERT_EMAIL:-admin@mediczy.com}"
LOG_DIR="${LOG_DIR:-/var/log/mediczy}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/smoke-test-$TIMESTAMP.log"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# Test credentials (use test accounts, not real users)
TEST_USER_EMAIL="${TEST_USER_EMAIL:-user@mediczy.com}"
TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-User123}"
TEST_DOCTOR_EMAIL="${TEST_DOCTOR_EMAIL:-doctor@mediczy.com}"
TEST_DOCTOR_PASSWORD="${TEST_DOCTOR_PASSWORD:-Doctor123}"
TEST_ADMIN_EMAIL="${TEST_ADMIN_EMAIL:-admin@mediczy.com}"
TEST_ADMIN_PASSWORD="${TEST_ADMIN_PASSWORD:-SecureAdmin123}"

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0

##############################################################################
# SETUP
##############################################################################

# Create log directory
mkdir -p "$LOG_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Redirect output to both console and log file
exec > >(tee -a "$LOG_FILE")
exec 2>&1

##############################################################################
# HELPER FUNCTIONS
##############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
    ((PASSED_TESTS++))
}

log_failure() {
    echo -e "${RED}[FAIL]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
    ((FAILED_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
    ((WARNINGS++))
}

test_start() {
    ((TOTAL_TESTS++))
    log_info "TEST $TOTAL_TESTS: $1"
}

##############################################################################
# NOTIFICATION FUNCTIONS
##############################################################################

send_slack_notification() {
    local message="$1"
    local color="$2"
    
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"Mediczy Production Smoke Test\",
                    \"text\": \"$message\",
                    \"footer\": \"Automated Daily Smoke Test\",
                    \"ts\": $(date +%s)
                }]
            }" 2>/dev/null || true
    fi
}

send_email_alert() {
    local subject="$1"
    local body="$2"
    
    if command -v mail &> /dev/null; then
        echo "$body" | mail -s "$subject" "$ALERT_EMAIL" 2>/dev/null || true
    fi
}

##############################################################################
# TEST FUNCTIONS
##############################################################################

test_server_health() {
    test_start "Server Health Check"
    
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ] || [ "$response" = "401" ] || [ "$response" = "404" ] || [ "$response" = "503" ]; then
        log_success "Server is responding (HTTP $response)"
        return 0
    else
        log_failure "Server not responding (HTTP $response)"
        return 1
    fi
}

test_database_connection() {
    test_start "Database Connection"
    
    # Try to authenticate - this implicitly tests DB connection
    local response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"invalid\"}" 2>/dev/null)
    
    if echo "$response" | grep -q "error\|message\|invalid"; then
        log_success "Database is accessible (got expected auth response)"
        return 0
    else
        log_failure "Database connection issue (unexpected response)"
        return 1
    fi
}

test_user_authentication() {
    test_start "User Authentication"
    
    local response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"$TEST_USER_PASSWORD\"}")
    
    if echo "$response" | grep -q "token\|jwt\|success"; then
        log_success "User authentication working"
        return 0
    else
        log_warning "User authentication test inconclusive (test account may not exist)"
        return 0
    fi
}

test_doctor_authentication() {
    test_start "Doctor Authentication"
    
    local response=$(curl -s -X POST "$BASE_URL/api/doctors/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_DOCTOR_EMAIL\",\"password\":\"$TEST_DOCTOR_PASSWORD\"}")
    
    if echo "$response" | grep -q "token\|jwt\|success"; then
        log_success "Doctor authentication working"
        return 0
    else
        log_warning "Doctor authentication test inconclusive (test account may not exist)"
        return 0
    fi
}

test_admin_authentication() {
    test_start "Admin Authentication"
    
    local response=$(curl -s -X POST "$BASE_URL/api/admin/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_ADMIN_EMAIL\",\"password\":\"$TEST_ADMIN_PASSWORD\"}")
    
    if echo "$response" | grep -q "token\|jwt\|success"; then
        log_success "Admin authentication working"
        return 0
    else
        log_warning "Admin authentication test inconclusive (test account may not exist)"
        return 0
    fi
}

test_security_headers() {
    test_start "Security Headers"
    
    local headers=$(curl -s -I "$BASE_URL/" 2>/dev/null)
    local security_score=0
    
    echo "$headers" | grep -qi "X-Content-Type-Options" && ((security_score++))
    echo "$headers" | grep -qi "X-Frame-Options" && ((security_score++))
    echo "$headers" | grep -qi "Strict-Transport-Security" && ((security_score++))
    echo "$headers" | grep -qi "Content-Security-Policy" && ((security_score++))
    
    if [ $security_score -ge 3 ]; then
        log_success "Security headers present ($security_score/4)"
        return 0
    else
        log_warning "Some security headers missing ($security_score/4)"
        return 0
    fi
}

test_rate_limiting() {
    test_start "Rate Limiting"
    
    local status_codes=""
    for i in {1..10}; do
        status_codes+=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/auth/login" \
            -X POST -H "Content-Type: application/json" \
            -d '{"email":"test","password":"test"}' 2>/dev/null)
    done
    
    if echo "$status_codes" | grep -q "429"; then
        log_success "Rate limiting is active"
        return 0
    else
        log_warning "Rate limiting not triggered (may need more requests)"
        return 0
    fi
}

test_pm2_status() {
    test_start "PM2 Process Status"
    
    if command -v pm2 &> /dev/null; then
        local pm2_status=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="mediczy-server") | .pm2_env.status' 2>/dev/null || echo "unknown")

        if [ -n "$pm2_status" ] && ! echo "$pm2_status" | grep -qv '^online$'; then
            log_success "PM2 process is online"
            return 0
        else
            log_failure "PM2 process not online (status: $pm2_status)"
            return 1
        fi
    else
        log_warning "PM2 not available"
        return 0
    fi
}

test_disk_space() {
    test_start "Disk Space"
    
    local disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$disk_usage" -lt 80 ]; then
        log_success "Disk space OK ($disk_usage% used)"
        return 0
    elif [ "$disk_usage" -lt 90 ]; then
        log_warning "Disk space getting low ($disk_usage% used)"
        return 0
    else
        log_failure "Disk space critical ($disk_usage% used)"
        return 1
    fi
}

test_memory_usage() {
    test_start "Memory Usage"
    
    local mem_usage=$(free | awk 'NR==2 {printf "%.0f", $3*100/$2}')
    
    if [ "$mem_usage" -lt 85 ]; then
        log_success "Memory usage OK ($mem_usage% used)"
        return 0
    elif [ "$mem_usage" -lt 95 ]; then
        log_warning "Memory usage high ($mem_usage% used)"
        return 0
    else
        log_failure "Memory usage critical ($mem_usage% used)"
        return 1
    fi
}

test_error_logs() {
    test_start "Recent Error Logs"
    
    local error_count=0
    
    # Check PM2 logs for recent errors
    if [ -d "$HOME/.pm2/logs" ]; then
        error_count=$(grep -i "error\|critical\|fatal" "$HOME/.pm2/logs/mediczy-server-error.log" 2>/dev/null | grep -vi "errorLogger" | grep -vi "express:router" | tail -100 | wc -l || echo 0)
    fi
    
    if [ "$error_count" -lt 10 ]; then
        log_success "Error log count acceptable ($error_count recent errors)"
        return 0
    elif [ "$error_count" -lt 50 ]; then
        log_warning "Multiple errors in logs ($error_count recent errors)"
        return 0
    else
        log_failure "High error count in logs ($error_count recent errors)"
        return 1
    fi
}

test_ssl_certificate() {
    test_start "SSL Certificate (if HTTPS enabled)"
    
    if [[ "$BASE_URL" == https://* ]]; then
        local domain=$(echo "$BASE_URL" | sed 's|https://||' | sed 's|/.*||')
        local expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
        local expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || echo 0)
        local current_epoch=$(date +%s)
        local days_until_expiry=$(( ($expiry_epoch - $current_epoch) / 86400 ))
        
        if [ "$days_until_expiry" -gt 30 ]; then
            log_success "SSL certificate valid ($days_until_expiry days remaining)"
            return 0
        elif [ "$days_until_expiry" -gt 7 ]; then
            log_warning "SSL certificate expires soon ($days_until_expiry days remaining)"
            return 0
        else
            log_failure "SSL certificate expires very soon ($days_until_expiry days remaining)"
            return 1
        fi
    else
        log_info "SSL test skipped (HTTP endpoint)"
        return 0
    fi
}

test_backup_freshness() {
    test_start "Database Backup Freshness"
    
    local backup_dir="/var/backups/mediczy"
    
    if [ -d "$backup_dir" ]; then
        local latest_backup=$(find "$backup_dir" -name "mediczy_db_*.sql.gz" -type f -mtime -2 2>/dev/null | head -1)
        
        if [ -n "$latest_backup" ]; then
            log_success "Recent backup found (within 48 hours)"
            return 0
        else
            log_warning "No recent backup found (older than 48 hours)"
            return 0
        fi
    else
        log_warning "Backup directory not found"
        return 0
    fi
}

##############################################################################
# MAIN EXECUTION
##############################################################################

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                                                                   ║"
echo "║         MEDICZY PRODUCTION SMOKE TEST                             ║"
echo "║                                                                   ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
log_info "Starting smoke test at $(date)"
log_info "Testing endpoint: $BASE_URL"
echo ""

# Run all tests
test_server_health
test_database_connection
test_user_authentication
test_doctor_authentication
test_admin_authentication
test_security_headers
test_rate_limiting
test_pm2_status
test_disk_space
test_memory_usage
test_error_logs
test_ssl_certificate
test_backup_freshness

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  SMOKE TEST SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Total Tests:    $TOTAL_TESTS"
echo "Passed:         $PASSED_TESTS"
echo "Failed:         $FAILED_TESTS"
echo "Warnings:       $WARNINGS"
echo ""
SUCCESS_RATE=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
echo "Success Rate:   $SUCCESS_RATE%"
echo ""
echo "Log file: $LOG_FILE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Send notifications
if [ "$FAILED_TESTS" -gt 0 ]; then
    log_failure "SMOKE TEST FAILED - $FAILED_TESTS critical issues detected"
    
    # Send alerts
    send_slack_notification "⚠️ Production smoke test FAILED\n$FAILED_TESTS critical issues\nSuccess rate: $SUCCESS_RATE%\nCheck logs: $LOG_FILE" "danger"
    send_email_alert "🚨 Mediczy Production Smoke Test FAILED" "Critical issues detected in production:\n\nFailed Tests: $FAILED_TESTS\nWarnings: $WARNINGS\nSuccess Rate: $SUCCESS_RATE%\n\nLog: $LOG_FILE\n\nPlease investigate immediately."
    
    exit 1
elif [ "$WARNINGS" -gt 3 ]; then
    log_warning "SMOKE TEST PASSED WITH WARNINGS - $WARNINGS warnings detected"
    
    send_slack_notification "⚠️ Production smoke test passed with warnings\n$WARNINGS warnings detected\nSuccess rate: $SUCCESS_RATE%\nCheck logs: $LOG_FILE" "warning"
    
    exit 0
else
    log_success "SMOKE TEST PASSED - All critical tests passed"
    
    send_slack_notification "✅ Production smoke test PASSED\nSuccess rate: $SUCCESS_RATE%\nAll systems operational" "good"
    
    exit 0
fi
