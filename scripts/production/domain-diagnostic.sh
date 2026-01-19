#!/bin/bash

echo "🔍 DOMAIN ACCESS DIAGNOSTIC - isha-inc.com"
echo "============================================"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: DNS Resolution
echo -e "${BLUE}1. DNS RESOLUTION TEST${NC}"
echo "Testing DNS resolution for isha-inc.com..."
DNS_RESULT=$(nslookup isha-inc.com 2>&1)
if echo "$DNS_RESULT" | grep -q "115.99.14.95"; then
    echo -e "${GREEN}✓ DNS Resolution: WORKING${NC}"
    echo "  Domain resolves to: 115.99.14.95"
else
    echo -e "${RED}✗ DNS Resolution: FAILED${NC}"
    echo "$DNS_RESULT"
fi
echo

# Test 2: Local Application Status
echo -e "${BLUE}2. LOCAL APPLICATION STATUS${NC}"
echo "Testing local application access..."

# Check HTTP locally
if curl -s -I http://192.168.1.72:80 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Local HTTP (Port 80): WORKING${NC}"
else
    echo -e "${RED}✗ Local HTTP (Port 80): FAILED${NC}"
fi

# Check HTTPS locally
if curl -k -s -I https://192.168.1.72:9443 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Local HTTPS (Port 9443): WORKING${NC}"
else
    echo -e "${RED}✗ Local HTTPS (Port 9443): FAILED${NC}"
fi
echo

# Test 3: Public IP Direct Access
echo -e "${BLUE}3. PUBLIC IP ACCESS TEST${NC}"
echo "Testing direct access to public IP 115.99.14.95..."

# Test HTTP on public IP
echo "Testing HTTP (port 80)..."
HTTP_TEST=$(timeout 10 curl -s -I http://115.99.14.95:80 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Public HTTP: WORKING${NC}"
else
    echo -e "${RED}✗ Public HTTP: FAILED${NC}"
    echo "  Error: Connection timeout/refused"
fi

# Test HTTPS on public IP
echo "Testing HTTPS (port 9443)..."
HTTPS_TEST=$(timeout 10 curl -k -s -I https://115.99.14.95:9443 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Public HTTPS: WORKING${NC}"
else
    echo -e "${RED}✗ Public HTTPS: FAILED${NC}"
    echo "  Error: Connection timeout/refused"
fi
echo

# Test 4: Domain Access Test
echo -e "${BLUE}4. DOMAIN ACCESS TEST${NC}"
echo "Testing access via domain isha-inc.com..."

# Test HTTP via domain
echo "Testing http://isha-inc.com..."
DOMAIN_HTTP=$(timeout 10 curl -s -I http://isha-inc.com 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Domain HTTP: WORKING${NC}"
else
    echo -e "${RED}✗ Domain HTTP: FAILED${NC}"
    echo "  Error: Connection timeout/refused"
fi

# Test HTTPS via domain
echo "Testing https://isha-inc.com:9443..."
DOMAIN_HTTPS=$(timeout 10 curl -k -s -I https://isha-inc.com:9443 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Domain HTTPS: WORKING${NC}"
else
    echo -e "${RED}✗ Domain HTTPS: FAILED${NC}"
    echo "  Error: Connection timeout/refused"
fi
echo

# Test 5: Network Connectivity
echo -e "${BLUE}5. NETWORK CONNECTIVITY${NC}"
echo "Testing basic connectivity to public IP..."

ping -c 3 115.99.14.95 >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Ping to Public IP: WORKING${NC}"
else
    echo -e "${RED}✗ Ping to Public IP: FAILED${NC}"
fi

# Test traceroute
echo "Traceroute to public IP (first 5 hops):"
traceroute -m 5 115.99.14.95 2>&1 | head -n 7
echo

# Test 6: Port Scanning
echo -e "${BLUE}6. PORT SCANNING${NC}"
echo "Scanning open ports on public IP..."

# Check common ports
for port in 80 443 9443 22 8080; do
    timeout 3 bash -c "echo >/dev/tcp/115.99.14.95/$port" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Port $port: OPEN${NC}"
    else
        echo -e "${RED}✗ Port $port: CLOSED/FILTERED${NC}"
    fi
done
echo

# Summary and Recommendations
echo -e "${YELLOW}📋 DIAGNOSTIC SUMMARY${NC}"
echo "=========================="
echo

echo -e "${BLUE}Current Status:${NC}"
echo "• DNS Resolution: Working (isha-inc.com → 115.99.14.95)"
echo "• Local Application: Running on 192.168.1.72:80 and 192.168.1.72:9443"
echo "• Public Access: BLOCKED by firewall"
echo

echo -e "${YELLOW}🔧 REQUIRED ACTIONS:${NC}"
echo "1. Configure Sophos Firewall NAT Rules:"
echo "   • Port 80: WAN → 192.168.1.72:80"
echo "   • Port 9443: WAN → 192.168.1.72:9443"
echo
echo "2. Configure Sophos Firewall Rules:"
echo "   • Allow HTTP traffic (port 80)"
echo "   • Allow HTTPS traffic (port 9443)"
echo
echo "3. Verify Sophos Configuration:"
echo "   • Check NAT rules are enabled"
echo "   • Check firewall rules are enabled"
echo "   • Apply configuration"
echo

echo -e "${BLUE}🌐 Expected URLs after firewall config:${NC}"
echo "• HTTP:  http://isha-inc.com"
echo "• HTTPS: https://isha-inc.com:9443"
echo

echo "Run this script again after configuring the firewall to verify access."