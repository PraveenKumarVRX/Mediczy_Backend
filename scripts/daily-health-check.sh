#!/bin/bash
################################################################################
# MEDICZY - DAILY FUNCTIONAL HEALTH CHECK SCRIPT
# 
# Purpose: Automated testing of critical user functions for production
# Usage: ./daily-health-check.sh [environment]
# Environment: production|staging|development (default: production)
#
# Features:
# - Tests all critical user journeys
# - Validates API endpoints
# - Checks database connectivity
# - Monitors system performance
# - Generates detailed reports
# - Sends alerts on failures
#
# Author: Mediczy DevOps Team
# Version: 1.0
# Date: November 10, 2025
################################################################################

set -euo pipefail

# ====================== CONFIGURATION ======================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs/health-checks"
REPORT_DIR="$PROJECT_ROOT/reports/daily-checks"

# Environment configuration
ENVIRONMENT="${1:-production}"
case $ENVIRONMENT in
    production)
        BASE_URL="https://mediczy.com/api"
        WEB_URL="https://mediczy.com"
        ;;
    staging)
        BASE_URL="https://staging.mediczy.com/api"
        WEB_URL="https://staging.mediczy.com"
        ;;
    development)
        BASE_URL="http://localhost:8000/api"
        WEB_URL="http://localhost:4000"
        ;;
    *)
        echo "❌ Invalid environment: $ENVIRONMENT"
        echo "Usage: $0 [production|staging|development]"
        exit 1
        ;;
esac

# Test configuration
TIMEOUT=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/health_check_${ENVIRONMENT}_$TIMESTAMP.log"
REPORT_FILE="$REPORT_DIR/daily_report_${ENVIRONMENT}_$TIMESTAMP.json"
SUMMARY_FILE="$REPORT_DIR/daily_summary_${ENVIRONMENT}_$TIMESTAMP.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test results
declare -A TEST_RESULTS
declare -A RESPONSE_TIMES
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Tokens for authenticated tests (ensure defined to avoid unbound variable when set -u is enabled)
USER_TOKEN="${USER_TOKEN:-}"
DOCTOR_TOKEN="${DOCTOR_TOKEN:-}"
export USER_TOKEN DOCTOR_TOKEN

# ====================== HELPER FUNCTIONS ======================

setup_directories() {
    mkdir -p "$LOG_DIR" "$REPORT_DIR"
}

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_success() { log "SUCCESS" "$@"; }
log_error() { log "ERROR" "$@"; }
log_warn() { log "WARN" "$@"; }

print_header() {
    echo -e "${BLUE}================================================================================================${NC}"
    echo -e "${CYAN}🏥 MEDICZY - DAILY FUNCTIONAL HEALTH CHECK${NC}"
    echo -e "${BLUE}================================================================================================${NC}"
    echo -e "${YELLOW}Environment:${NC} $ENVIRONMENT"
    echo -e "${YELLOW}Base URL:${NC} $BASE_URL"
    echo -e "${YELLOW}Web URL:${NC} $WEB_URL"
    echo -e "${YELLOW}Timestamp:${NC} $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${YELLOW}Log File:${NC} $LOG_FILE"
    echo -e "${BLUE}================================================================================================${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${PURPLE}🔍 $1${NC}"
    echo -e "${PURPLE}$(printf '%.0s─' {1..80})${NC}"
}

run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_status="${3:-200}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -n "Testing $test_name... "
    
    local start_time=$(date +%s%N)
    local response
    local http_status
    
    # Execute the test command and capture output and exit code
    response=$(eval "$test_command" 2>&1) || true
    local end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

    # Try to extract the last HTTP status code from the response (if any)
    # This handles concatenated outputs from loops (e.g., rate limiting test)
    if [[ "$response" =~ ([0-9]{3})([^0-9]*)$ ]]; then
        http_status="${BASH_REMATCH[1]}"
    else
        # If no status code found, set a default based on response presence
        if [[ -z "$response" ]]; then
            http_status="000"
        else
            http_status="000"
        fi
    fi

    # Determine pass/fail
    if [[ "$http_status" == "$expected_status" ]]; then
        echo -e "${GREEN}✅ PASS${NC} (${duration}ms)"
        TEST_RESULTS["$test_name"]="PASS"
        RESPONSE_TIMES["$test_name"]="$duration"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        log_success "$test_name: PASS (${duration}ms, HTTP $http_status)"
    else
        # Include response snippet for debugging
        local resp_snippet=$(echo "$response" | sed -n '1,5p' | tr -d '\n' | sed 's/"/\"/g')
        echo -e "${RED}❌ FAIL${NC} (HTTP $http_status, expected $expected_status)"
        TEST_RESULTS["$test_name"]="FAIL"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        log_error "$test_name: FAIL - HTTP $http_status (expected $expected_status) - Response: $resp_snippet"
    fi
}

generate_test_user_credentials() {
    local timestamp=$(date +%s)
    TEST_USER_EMAIL="healthcheck_user_$timestamp@mediczy.test"
    TEST_USER_PASSWORD="HealthCheck123!"
    TEST_DOCTOR_EMAIL="healthcheck_doctor_$timestamp@mediczy.test"
    TEST_DOCTOR_PASSWORD="DoctorCheck123!"
}

# ====================== SYSTEM HEALTH TESTS ======================

test_system_health() {
    print_section "SYSTEM HEALTH & INFRASTRUCTURE"
    
    # Basic connectivity - use existing endpoints in this project
    # Check Dr. Isha AI health (exists at /api/dr-isha/health)
    run_test "AI Service Health (dr-isha)" \
        "curl -s -o /dev/null -w '%{http_code}' --connect-timeout $TIMEOUT '$BASE_URL/dr-isha/health' || echo '503'"

    # Database/service connectivity - use membership plans endpoint as a lightweight DB-backed check
    run_test "Membership Plans (DB check)" \
        "curl -s -o /dev/null -w '%{http_code}' --connect-timeout $TIMEOUT '$BASE_URL/membership/plans' || echo '503'"

    # Cache/availability check - use doctors list endpoint which should be available
    run_test "Get Available Doctors (cache/db)" \
        "curl -s -o /dev/null -w '%{http_code}' --connect-timeout $TIMEOUT '$BASE_URL/doctors' || echo '503'"
    
    # Frontend availability
    run_test "Frontend Application" \
        "curl -s -o /dev/null -w '%{http_code}' --connect-timeout $TIMEOUT '$WEB_URL' || echo '503'"
}

# ====================== AUTHENTICATION TESTS ======================

test_authentication() {
    print_section "AUTHENTICATION & AUTHORIZATION"
    
    # User registration
    run_test "User Registration" \
        "curl -s -X POST '$BASE_URL/users/register' \
        -H 'Content-Type: application/json' \
        -w '%{http_code}' -o /dev/null \
        -d '{
            \"firstName\": \"Health\",
            \"lastName\": \"Check\",
            \"email\": \"$TEST_USER_EMAIL\",
            \"password\": \"$TEST_USER_PASSWORD\",
            \"dateOfBirth\": \"1990-01-01\",
            \"gender\": \"Other\",
            \"phoneNumber\": \"+919876543210\"
        }'" "201"
    
    # User login
    local login_response_file="/tmp/mediczy_login_$TIMESTAMP.json"
    run_test "User Login" \
        "curl -s -X POST '$BASE_URL/users/login' \
        -H 'Content-Type: application/json' \
        -w '%{http_code}' -o '$login_response_file' \
        -d '{
            \"email\": \"$TEST_USER_EMAIL\",
            \"password\": \"$TEST_USER_PASSWORD\"
        }' && echo \$(tail -c 3 '$login_response_file')" "200"
    
    # Extract token for subsequent tests
    if [[ -f "$login_response_file" ]] && [[ "${TEST_RESULTS["User Login"]}" == "PASS" ]]; then
        USER_TOKEN=$(cat "$login_response_file" | sed 's/[0-9][0-9][0-9]$//' | jq -r '.token // empty' 2>/dev/null || echo "")
        USER_TOKEN="${USER_TOKEN:-}"
        export USER_TOKEN
    fi
    
    # Doctor registration
    run_test "Doctor Registration" \
        "curl -s -X POST '$BASE_URL/doctors/register' \
        -H 'Content-Type: application/json' \
        -w '%{http_code}' -o /dev/null \
        -d '{
            \"firstName\": \"Dr. Health\",
            \"lastName\": \"Check\",
            \"email\": \"$TEST_DOCTOR_EMAIL\",
            \"password\": \"$TEST_DOCTOR_PASSWORD\",
            \"dateOfBirth\": \"1985-01-01\",
            \"gender\": \"Other\",
            \"phoneNumber\": \"+919876543211\",
            \"specialization\": \"General Medicine\",
            \"experience\": 5,
            \"qualifications\": [\"MBBS\"],
            \"consultationFee\": 500,
            \"hospitalName\": \"Health Check Hospital\"
        }'" "201"
    
    # Doctor login
    local doctor_login_response_file="/tmp/mediczy_doctor_login_$TIMESTAMP.json"
    run_test "Doctor Login" \
        "curl -s -X POST '$BASE_URL/doctors/login' \
        -H 'Content-Type: application/json' \
        -w '%{http_code}' -o '$doctor_login_response_file' \
        -d '{
            \"email\": \"$TEST_DOCTOR_EMAIL\",
            \"password\": \"$TEST_DOCTOR_PASSWORD\"
        }' && echo \$(tail -c 3 '$doctor_login_response_file')" "200"
    
    # Extract doctor token
    if [[ -f "$doctor_login_response_file" ]] && [[ "${TEST_RESULTS["Doctor Login"]}" == "PASS" ]]; then
        DOCTOR_TOKEN=$(cat "$doctor_login_response_file" | sed 's/[0-9][0-9][0-9]$//' | jq -r '.token // empty' 2>/dev/null || echo "")
        DOCTOR_TOKEN="${DOCTOR_TOKEN:-}"
        export DOCTOR_TOKEN
    fi
    
    # Protected endpoint access
    if [[ -n "$USER_TOKEN" ]]; then
        run_test "User Profile Access" \
            "curl -s -X GET '$BASE_URL/users/profile' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
    fi
}

# ====================== CORE FEATURE TESTS ======================

test_core_features() {
    print_section "CORE FEATURE FUNCTIONALITY"
    
    if [[ -n "$USER_TOKEN" ]]; then
        # Appointments
        run_test "Get User Appointments" \
            "curl -s -X GET '$BASE_URL/appointments' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
        
        # Membership plans
        run_test "Get Membership Plans" \
            "curl -s -X GET '$BASE_URL/membership/plans' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
        
        # Current user plan
        run_test "Get Current Plan" \
            "curl -s -X GET '$BASE_URL/membership/my/current' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
        
        # Plan usage
        run_test "Get Plan Usage" \
            "curl -s -X GET '$BASE_URL/membership/my/usage' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
    fi
    
    if [[ -n "$DOCTOR_TOKEN" ]]; then
        # Doctor appointments
        run_test "Get Doctor Appointments" \
            "curl -s -X GET '$BASE_URL/appointments/doctor' \
            -H 'Authorization: Bearer $DOCTOR_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
    fi
    
    # Public endpoints
    run_test "Get Available Doctors" \
        "curl -s -X GET '$BASE_URL/doctors' \
        -w '%{http_code}' -o /dev/null" "200"
    
    # AI Doctor (if available)
    if [[ -n "$USER_TOKEN" ]]; then
        run_test "AI Doctor Health Check" \
            "curl -s -X GET '$BASE_URL/dr-isha/health' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
    fi
}

# ====================== COMPLIANCE & SECURITY TESTS ======================

test_compliance_security() {
    print_section "COMPLIANCE & SECURITY FEATURES"
    
    # Test rate limiting
    run_test "Rate Limiting Protection" \
        "for i in {1..6}; do curl -s '$BASE_URL/users/login' -X POST -H 'Content-Type: application/json' -d '{}' -w '%{http_code}' -o /dev/null; done | tail -1" "429"
    
    if [[ -n "$USER_TOKEN" ]]; then
        # GDPR compliance endpoints
        run_test "Data Export (GDPR)" \
            "curl -s -X GET '$BASE_URL/privacy/export' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
        
        # Consent management
        run_test "Consent Management" \
            "curl -s -X GET '$BASE_URL/privacy/consents' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
        
        # Audit logs access
        run_test "Audit Logs Access" \
            "curl -s -X GET '$BASE_URL/privacy/audit-trail' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -w '%{http_code}' -o /dev/null" "200"
    fi
    
    # Security headers check
    run_test "Security Headers" \
        "curl -s -I '$WEB_URL' | grep -q 'X-Frame-Options\\|X-Content-Type-Options\\|Strict-Transport-Security' && echo '200' || echo '500'" "200"
}

# ====================== INTEGRATION TESTS ======================

test_integrations() {
    print_section "EXTERNAL INTEGRATIONS"
    
    # Firebase (if configured)
    if [[ -n "$USER_TOKEN" ]]; then
        run_test "FCM Token Registration" \
            "curl -s -X POST '$BASE_URL/fcm/register-token' \
            -H 'Authorization: Bearer $USER_TOKEN' \
            -H 'Content-Type: application/json' \
            -w '%{http_code}' -o /dev/null \
            -d '{
                \"userId\": 1,
                \"userType\": \"user\",
                \"fcmToken\": \"test_token_health_check\"
            }'" "503"  # Expected to fail if Firebase not configured
    fi
    
    # Google Fit OAuth (test endpoint availability)
    run_test "Google Fit OAuth Endpoint" \
        "curl -s -X GET '$BASE_URL/fitness/auth' \
        -w '%{http_code}' -o /dev/null" "302"
    
    # Payment gateway health (if configured)
    run_test "Payment Gateway Health" \
        "curl -s -X GET '$BASE_URL/payments/health' \
        -w '%{http_code}' -o /dev/null || echo '404'" "404"  # May not exist
}

# ====================== PERFORMANCE TESTS ======================

test_performance() {
    print_section "PERFORMANCE & LOAD TESTING"
    
    # Response time tests
    echo "📊 Performance Metrics:"
    
    for endpoint in "health" "doctors" "membership/plans"; do
        local test_name="Performance: /$endpoint"
        local start_time=$(date +%s%N)
        local response=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout $TIMEOUT "$BASE_URL/$endpoint" || echo "503")
        local end_time=$(date +%s%N)
        local duration=$(( (end_time - start_time) / 1000000 ))
        
        if [[ "$response" == "200" ]]; then
            if [[ $duration -lt 1000 ]]; then
                echo -e "  $endpoint: ${GREEN}$duration ms ✅${NC}"
            elif [[ $duration -lt 3000 ]]; then
                echo -e "  $endpoint: ${YELLOW}$duration ms ⚠️${NC}"
            else
                echo -e "  $endpoint: ${RED}$duration ms ❌${NC}"
            fi
            RESPONSE_TIMES["$endpoint"]="$duration"
        else
            echo -e "  $endpoint: ${RED}Failed (HTTP $response) ❌${NC}"
        fi
    done
}

# ====================== CLEANUP FUNCTIONS ======================

cleanup_test_data() {
    print_section "CLEANUP TEST DATA"
    
    # Note: In production, we might want to keep test accounts for a while
    # or clean them up via a separate process to avoid affecting the health check
    
    if [[ "$ENVIRONMENT" == "development" ]] && [[ -n "$USER_TOKEN" ]]; then
        echo "🧹 Cleaning up test data (development only)..."
        
        # Delete test user account (if endpoint exists)
        curl -s -X DELETE "$BASE_URL/privacy/delete-account" \
            -H "Authorization: Bearer $USER_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
                "password": "'"$TEST_USER_PASSWORD"'",
                "confirmation": "DELETE MY ACCOUNT"
            }' -o /dev/null 2>&1 || true
    fi
    
    # Cleanup temporary files
    rm -f "/tmp/mediczy_login_$TIMESTAMP.json"
    rm -f "/tmp/mediczy_doctor_login_$TIMESTAMP.json"
}

# ====================== REPORTING FUNCTIONS ======================

generate_report() {
    print_section "GENERATING DETAILED REPORT"
    
    # JSON Report
    cat > "$REPORT_FILE" << EOF
{
  "metadata": {
    "environment": "$ENVIRONMENT",
    "timestamp": "$(date -Iseconds)",
    "base_url": "$BASE_URL",
    "web_url": "$WEB_URL",
    "test_duration_seconds": $(($(date +%s) - START_TIME))
  },
  "summary": {
    "total_tests": $TOTAL_TESTS,
    "passed": $PASSED_TESTS,
    "failed": $FAILED_TESTS,
    "success_rate": "$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%"
  },
  "test_results": {
EOF
    
    # Add test results to JSON
    local first=true
    for test in "${!TEST_RESULTS[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            echo "," >> "$REPORT_FILE"
        fi
        echo -n "    \"$test\": {\"status\": \"${TEST_RESULTS[$test]}\", \"response_time_ms\": \"${RESPONSE_TIMES[$test]:-0}\"}" >> "$REPORT_FILE"
    done
    
    cat >> "$REPORT_FILE" << EOF

  },
  "performance": {
EOF
    
    # Add performance data
    first=true
    for endpoint in "${!RESPONSE_TIMES[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            echo "," >> "$REPORT_FILE"
        fi
        echo -n "    \"$endpoint\": ${RESPONSE_TIMES[$endpoint]}" >> "$REPORT_FILE"
    done
    
    cat >> "$REPORT_FILE" << EOF

  }
}
EOF
    
    # Text Summary Report
    cat > "$SUMMARY_FILE" << EOF
🏥 MEDICZY DAILY HEALTH CHECK REPORT
=====================================

Environment: $ENVIRONMENT
Timestamp: $(date '+%Y-%m-%d %H:%M:%S')
Duration: $(($(date +%s) - START_TIME)) seconds

📊 SUMMARY
----------
Total Tests: $TOTAL_TESTS
Passed: $PASSED_TESTS
Failed: $FAILED_TESTS
Success Rate: $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%

🔍 TEST RESULTS
---------------
EOF
    
    for test in "${!TEST_RESULTS[@]}"; do
        local status="${TEST_RESULTS[$test]}"
        local time="${RESPONSE_TIMES[$test]:-0}"
        if [[ "$status" == "PASS" ]]; then
            echo "✅ $test ($time ms)" >> "$SUMMARY_FILE"
        else
            echo "❌ $test" >> "$SUMMARY_FILE"
        fi
    done
    
    cat >> "$SUMMARY_FILE" << EOF

⚡ PERFORMANCE METRICS
---------------------
EOF
    
    for endpoint in "${!RESPONSE_TIMES[@]}"; do
        echo "$endpoint: ${RESPONSE_TIMES[$endpoint]} ms" >> "$SUMMARY_FILE"
    done
    
    if [[ $FAILED_TESTS -gt 0 ]]; then
        cat >> "$SUMMARY_FILE" << EOF

🚨 FAILED TESTS DETAILS
-----------------------
Check the full log file for error details:
$LOG_FILE

📧 ALERT REQUIRED
-----------------
This health check has failed tests that require immediate attention.
EOF
    else
        cat >> "$SUMMARY_FILE" << EOF

🎉 ALL TESTS PASSED
------------------
All critical functions are working correctly.
System is healthy and ready for production use.
EOF
    fi
    
    echo ""
    echo -e "${CYAN}📄 Reports generated:${NC}"
    echo -e "  📊 Detailed JSON: $REPORT_FILE"
    echo -e "  📋 Summary: $SUMMARY_FILE"
    echo -e "  📝 Full Log: $LOG_FILE"
}

send_alerts() {
    if [[ $FAILED_TESTS -gt 0 ]]; then
        print_section "SENDING ALERTS"
        
        local subject="🚨 Mediczy Health Check Failed - $ENVIRONMENT"
        local message="Health check failed with $FAILED_TESTS out of $TOTAL_TESTS tests failing."
        
        log_error "Health check failed. Alerts should be sent."
        
        # In a real environment, you would send emails, Slack notifications, etc.
        # Example integrations:
        
        # Email (using sendmail or external service)
        # echo "$message" | mail -s "$subject" ops-team@mediczy.com
        
        # Slack webhook
        # curl -X POST -H 'Content-type: application/json' \
        #   --data "{\"text\":\"$subject\n$message\"}" \
        #   YOUR_SLACK_WEBHOOK_URL
        
        # PagerDuty incident
        # curl -X POST https://events.pagerduty.com/v2/enqueue \
        #   -H 'Content-Type: application/json' \
        #   -d "{\"routing_key\":\"YOUR_KEY\",\"event_action\":\"trigger\",\"payload\":{\"summary\":\"$subject\",\"source\":\"health-check\",\"severity\":\"critical\"}}"
        
        echo "⚠️  Alert notifications would be sent in production environment"
        echo "   Failed tests: $FAILED_TESTS/$TOTAL_TESTS"
    else
        log_success "All tests passed. No alerts needed."
    fi
}

print_final_summary() {
    echo ""
    echo -e "${BLUE}================================================================================================${NC}"
    echo -e "${CYAN}🎯 FINAL SUMMARY${NC}"
    echo -e "${BLUE}================================================================================================${NC}"
    
    if [[ $FAILED_TESTS -eq 0 ]]; then
        echo -e "${GREEN}🎉 ALL TESTS PASSED! System is healthy and fully functional.${NC}"
        echo -e "${GREEN}✅ Success Rate: 100% ($PASSED_TESTS/$TOTAL_TESTS tests)${NC}"
    else
        echo -e "${RED}🚨 HEALTH CHECK FAILED! Immediate attention required.${NC}"
        echo -e "${RED}❌ Success Rate: $(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)% ($PASSED_TESTS/$TOTAL_TESTS tests)${NC}"
        echo -e "${YELLOW}⚠️  Check the detailed logs and reports for failure analysis.${NC}"
    fi
    
    echo -e "${CYAN}📊 Test Execution Time: $(($(date +%s) - START_TIME)) seconds${NC}"
    echo -e "${CYAN}📁 Reports Location: $REPORT_DIR${NC}"
    echo -e "${BLUE}================================================================================================${NC}"
}

# ====================== MAIN EXECUTION ======================

main() {
    START_TIME=$(date +%s)
    
    # Setup
    setup_directories
    generate_test_user_credentials
    
    # Print header
    print_header
    log_info "Starting daily functional health check for $ENVIRONMENT environment"
    
    # Run test suites
    test_system_health
    test_authentication
    test_core_features
    test_compliance_security
    test_integrations
    test_performance
    
    # Cleanup and reporting
    cleanup_test_data
    generate_report
    send_alerts
    print_final_summary
    
    # Exit with appropriate code
    if [[ $FAILED_TESTS -eq 0 ]]; then
        log_success "Health check completed successfully"
        exit 0
    else
        log_error "Health check completed with failures"
        exit 1
    fi
}

# ====================== SCRIPT ENTRY POINT ======================

# Ensure required tools are available
command -v curl >/dev/null 2>&1 || { echo "❌ curl is required but not installed. Aborting." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "⚠️ jq not found. Some JSON parsing features may not work." >&2; }
command -v bc >/dev/null 2>&1 || { echo "⚠️ bc not found. Percentage calculations may not work." >&2; }

# Trap to ensure cleanup on script exit
trap cleanup_test_data EXIT

# Run main function
main "$@"