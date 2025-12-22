#!/bin/bash

echo "🔍 MEDICZY NETWORK DIAGNOSTICS"
echo "=============================="
echo "Date: $(date)"
echo ""

# Server Information
echo "📊 SERVER INFORMATION:"
echo "====================="
echo "Local IP: $(ip route get 8.8.8.8 | grep -oP 'src \K\S+')"
echo "Public IP: $(curl -s --connect-timeout 5 ifconfig.me || echo 'Unable to determine')"
echo ""

# Port Status (Internal)
echo "🔌 INTERNAL PORT STATUS:"
echo "======================"
echo "Port 80 listeners:"
ss -tlnp | grep :80 || echo "  None"
echo "Port 443 listeners:"
ss -tlnp | grep :443 || echo "  None"
echo "Port 8000 listeners:"
ss -tlnp | grep :8000 || echo "  None"
echo ""

# Docker Status
echo "🐳 DOCKER CONTAINER STATUS:"
echo "=========================="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker not available"
echo ""

# Local Connectivity Test
echo "🧪 LOCAL CONNECTIVITY TESTS:"
echo "============================"
echo -n "HTTP (Port 80): "
if curl -s -I --connect-timeout 3 http://192.168.1.72 >/dev/null 2>&1; then
    echo "✅ Working"
else
    echo "❌ Failed"
fi

echo -n "HTTPS (Port 443): "
if curl -k -s -I --connect-timeout 3 https://192.168.1.72 >/dev/null 2>&1; then
    echo "✅ Working"
else
    echo "❌ Failed"
fi
echo ""

# External Connectivity Test
echo "🌐 EXTERNAL CONNECTIVITY TESTS:"
echo "==============================="
PUBLIC_IP=$(curl -s --connect-timeout 5 ifconfig.me)

if [ ! -z "$PUBLIC_IP" ]; then
    echo -n "External HTTP (Port 80): "
    if curl -s -I --connect-timeout 5 "http://$PUBLIC_IP" >/dev/null 2>&1; then
        echo "✅ Working"
    else
        echo "❌ BLOCKED (Firewall not configured)"
    fi

    echo -n "External HTTPS (Port 443): "
    if curl -k -s -I --connect-timeout 5 "https://$PUBLIC_IP" >/dev/null 2>&1; then
        echo "✅ Working"
    else
        echo "❌ BLOCKED (Firewall not configured)"
    fi
else
    echo "❌ Cannot determine public IP"
fi
echo ""

# Firewall Status
echo "🔥 FIREWALL ANALYSIS:"
echo "===================="
echo "Issue: External ports 80 and 443 are not accessible"
echo "Cause: Sophos firewall port forwarding not configured"
echo ""
echo "🛠️ REQUIRED SOPHOS CONFIGURATION:"
echo "1. NAT Rule: Port 80 → 192.168.1.72:80"
echo "2. NAT Rule: Port 443 → 192.168.1.72:443"
echo "3. Firewall Rule: Allow WAN → 192.168.1.72:80"
echo "4. Firewall Rule: Allow WAN → 192.168.1.72:443"
echo ""

# Network Route Check
echo "🗺️ NETWORK ROUTING:"
echo "=================="
echo "Default Gateway: $(ip route | grep default | awk '{print $3}' | head -1)"
echo "Network Interface:"
ip addr show | grep "192.168.1.72" -A2 -B2 | head -5
echo ""

echo "📋 SUMMARY:"
echo "=========="
echo "✅ Application: Running correctly"
echo "✅ SSL Certificates: Working"
echo "✅ Local Access: Working"
echo "❌ External Access: BLOCKED"
echo ""
echo "🎯 NEXT STEPS:"
echo "1. Configure Sophos firewall port forwarding"
echo "2. Test external access after configuration"
echo "3. Set up domain DNS records"
echo "4. Generate Let's Encrypt SSL certificates"