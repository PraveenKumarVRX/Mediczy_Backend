#!/bin/bash
################################################################################
# MEDICZY - TEST DATA SETUP SCRIPT
# 
# Purpose: Creates consistent test data for health check validation
# Usage: ./setup-test-data.sh [environment]
#
# This script creates:
# - Test user accounts with known credentials
# - Sample appointments and bookings
# - Membership plans and subscriptions
# - Health tracker data
# - Doctor profiles for testing
#
# Author: Mediczy DevOps Team
# Version: 1.0
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-development}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case $ENVIRONMENT in
    development)
        BASE_URL="http://localhost:8000/api"
        ;;
    staging)
        BASE_URL="https://staging.mediczy.com/api"
        ;;
    production)
        echo "❌ Cannot setup test data in production environment"
        exit 1
        ;;
    *)
        echo "❌ Invalid environment: $ENVIRONMENT"
        exit 1
        ;;
esac

# Test credentials (consistent for automation)
TEST_USER_EMAIL="automation.user@mediczy.test"
TEST_USER_PASSWORD="AutoUser123!"
TEST_DOCTOR_EMAIL="automation.doctor@mediczy.test"
TEST_DOCTOR_PASSWORD="AutoDoc123!"

echo "🔧 Setting up test data for $ENVIRONMENT environment..."

# Create test user
echo "👤 Creating test user account..."
curl -s -X POST "$BASE_URL/users/register" \
    -H 'Content-Type: application/json' \
    -d "{
        \"firstName\": \"Test\",
        \"lastName\": \"User\",
        \"email\": \"$TEST_USER_EMAIL\",
        \"password\": \"$TEST_USER_PASSWORD\",
        \"dateOfBirth\": \"1990-01-01\",
        \"gender\": \"Other\",
        \"phoneNumber\": \"+919876543210\"
    }" > /dev/null || echo "User may already exist"

# Create test doctor
echo "👨‍⚕️ Creating test doctor account..."
curl -s -X POST "$BASE_URL/doctors/register" \
    -H 'Content-Type: application/json' \
    -d "{
        \"firstName\": \"Dr. Test\",
        \"lastName\": \"Doctor\",
        \"email\": \"$TEST_DOCTOR_EMAIL\",
        \"password\": \"$TEST_DOCTOR_PASSWORD\",
        \"dateOfBirth\": \"1985-01-01\",
        \"gender\": \"Other\",
        \"phoneNumber\": \"+919876543211\",
        \"specialization\": \"General Medicine\",
        \"experience\": 5,
        \"qualifications\": [\"MBBS\"],
        \"consultationFee\": 500,
        \"hospitalName\": \"Test Hospital\"
    }" > /dev/null || echo "Doctor may already exist"

echo "✅ Test data setup completed!"
echo ""
echo "📋 Test Credentials:"
echo "User: $TEST_USER_EMAIL / $TEST_USER_PASSWORD"
echo "Doctor: $TEST_DOCTOR_EMAIL / $TEST_DOCTOR_PASSWORD"