#!/bin/bash

# Port 9443 Access Test for mayden.in
# Testing with your existing port forwarding configuration

echo "🔍 Testing mayden.in External Access via Port 9443"
echo "================================================="
echo ""

echo "🌐 Your Configuration:"
echo "   External: mayden.in:9443 → Router:9443 → Server:9443"
echo "   Internal: 192.168.1.72:9443"
echo ""

# Test 1: DNS Resolution
echo "1. DNS Resolution Test:"
resolved_ip=$(dig +short mayden.in | head -1)
echo "   mayden.in resolves to: $resolved_ip"
if [[ "$resolved_ip" == "115.99.14.95" ]]; then
    echo "   ✅ DNS is correct"
else
    echo "   ⚠️  DNS resolution issue"
fi
echo ""

# Test 2: Local HTTPS Access on 9443
echo "2. Local Server Test (port 9443):"
echo -n "   Testing https://localhost:9443 ... "
response=$(curl -s -I -m 5 https://localhost:9443 -H "Host: mayden.in" --insecure 2>/dev/null | head -n 1)
if [[ "$response" == *"200"* ]]; then
    echo "✅ Local server working"
else
    echo "❌ Local server issue: $response"
fi
echo ""

# Test 3: External HTTPS Access on 9443  
echo "3. External HTTPS Access Test:"
echo -n "   Testing https://mayden.in:9443 ... "
response=$(curl -s -I -m 10 https://mayden.in:9443 2>/dev/null | head -n 1)
if [[ "$response" == *"200"* ]]; then
    echo "✅ External access working!"
else
    echo "❌ External access failed: $response"
    echo "   Check: Port forwarding 9443 → 192.168.1.72:9443"
fi
echo ""

# Test 4: SSL Certificate Test
echo "4. SSL Certificate Test (port 9443):"
echo -n "   Checking SSL certificate ... "
ssl_result=$(echo "" | openssl s_client -connect mayden.in:9443 -servername mayden.in 2>/dev/null | grep "subject=CN = mayden.in")
if [[ -n "$ssl_result" ]]; then
    echo "✅ SSL certificate valid for mayden.in"
else
    echo "⚠️  SSL certificate verification issue"
fi
echo ""

# Test 5: Application Access
echo "5. Application Access Test:"
echo -n "   Testing admin panel ... "
admin_response=$(curl -s -I -m 10 https://mayden.in:9443/admin/login 2>/dev/null | head -n 1)
if [[ "$admin_response" == *"200"* ]]; then
    echo "✅ Admin panel accessible"
else
    echo "❌ Admin panel issue"
fi

echo -n "   Testing team portal ... "
team_response=$(curl -s -I -m 10 https://mayden.in:9443/team/login 2>/dev/null | head -n 1)
if [[ "$team_response" == *"200"* ]]; then
    echo "✅ Team portal accessible"
else
    echo "❌ Team portal issue"
fi
echo ""

# Summary
echo "🎯 Access Your Site:"
echo "   Website:    https://mayden.in:9443"
echo "   Admin:      https://mayden.in:9443/admin/login" 
echo "   Team:       https://mayden.in:9443/team/login"
echo ""

echo "📋 Required Router Configuration:"
echo "   Port Forwarding: External 9443 → Internal 192.168.1.72:9443"
echo "   Protocol: TCP"
echo ""

echo "🔧 Troubleshooting:"
echo "   Internal Test: https://192.168.1.72:9443"
echo "   Router Admin:  http://192.168.1.2"
echo "   Check Logs:    sudo tail -f /var/log/nginx/error.log"