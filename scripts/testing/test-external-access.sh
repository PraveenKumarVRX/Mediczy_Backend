#!/bin/bash

# Port Forwarding Test Script for mediqzy.com (Cloudflare)
# Run this after configuring Cloudflare DNS

echo "🔍 Testing mediqzy.com External Access (via Cloudflare)"
echo "======================================================"
echo ""

# Function to test URL
test_url() {
    local url="$1"
    local expected="$2"
    echo -n "Testing $url ... "
    
    response=$(curl -s -I -m 10 "$url" 2>/dev/null | head -n 1)
    
    if [[ "$response" == *"$expected"* ]]; then
        echo "✅ PASS - $response"
        return 0
    else
        echo "❌ FAIL - $response"
        return 1
    fi
}

# Test 1: Check if mediqzy.com resolves to correct IP
echo "1. DNS Resolution Test:"
resolved_ip=$(dig +short mediqzy.com | head -1)
echo "   mediqzy.com resolves to: $resolved_ip"
if [[ "$resolved_ip" == "115.99.14.95" ]]; then
    echo "   ✅ DNS is correct"
else
    echo "   ⚠️  DNS resolution issue"
fi
echo ""

# Test 2: HTTP Access (should redirect to HTTPS)
echo "2. HTTP Access Test:"
test_url "http://mayden.in" "301"
echo ""

# Test 3: HTTPS Access (should return 200 OK)
echo "3. HTTPS Access Test:"
test_url "https://mayden.in" "200"
echo ""

# Test 4: SSL Certificate Test
echo "4. SSL Certificate Test:"
echo -n "Checking SSL certificate ... "
ssl_result=$(echo "" | openssl s_client -connect mayden.in:443 -servername mayden.in 2>/dev/null | grep "Verification: OK")
if [[ -n "$ssl_result" ]]; then
    echo "✅ SSL certificate is valid and trusted"
else
    echo "⚠️  SSL certificate verification issue"
fi
echo ""

# Test 5: Service Availability Test
echo "5. Service Availability Test:"
test_url "https://mayden.in/admin/login" "200"
test_url "https://mayden.in/team/login" "200"
echo ""

# Summary
echo "🎯 Quick Access URLs:"
echo "   Website:    https://mayden.in"
echo "   Admin:      https://mayden.in/admin/login"
echo "   Team:       https://mayden.in/team/login"
echo ""

echo "📋 If tests fail:"
echo "   1. Verify port forwarding: http://192.168.1.2"
echo "   2. Check router logs"
echo "   3. Test internal access: http://192.168.1.72"
echo "   4. Wait 2-3 minutes after router changes"

# Final connectivity test
echo ""
echo "🔧 Internal Server Test (should always work):"
test_url "http://192.168.1.72" "301"