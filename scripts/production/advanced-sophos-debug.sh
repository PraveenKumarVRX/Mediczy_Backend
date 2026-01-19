#!/bin/bash

echo "🚨 ADVANCED SOPHOS TROUBLESHOOTING"
echo "=================================="
echo

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${RED}STATUS: Ports still filtered after configuration${NC}"
echo
echo "Since you've confirmed the rules are at the top and properly configured,"
echo "let's check for other potential issues:"
echo

echo -e "${BLUE}🔧 ADDITIONAL CHECKS NEEDED${NC}"
echo

echo -e "${YELLOW}1. ZONE INTERFACE BINDING${NC}"
echo "   In Sophos → Network → Interfaces:"
echo "   • Verify WAN interface is bound to WAN Zone"
echo "   • Verify LAN interface is bound to LAN Zone"
echo "   • Check if 192.168.1.72 is in the correct zone"
echo

echo -e "${YELLOW}2. NAT POLICY MODE${NC}"
echo "   In Sophos → Network → NAT:"
echo "   • Check if NAT is in 'Route' or 'NAT' mode"
echo "   • Should be 'NAT' mode for port forwarding"
echo "   • Verify 'Outbound Interface' is set to LAN"
echo

echo -e "${YELLOW}3. SERVICE DEFINITIONS${NC}"
echo "   In Sophos → Network → Services:"
echo "   • Check if HTTPS-9443 service exists"
echo "   • Create if missing: TCP port 9443"
echo "   • Verify HTTP service is standard TCP port 80"
echo

echo -e "${YELLOW}4. POLICY ROUTE CONFLICTS${NC}"
echo "   In Sophos → Network → Policy Routing:"
echo "   • Check for conflicting policy routes"
echo "   • Disable any routes affecting port 80/9443"
echo

echo -e "${YELLOW}5. INTRUSION PREVENTION${NC}"
echo "   In Sophos → Network → Intrusion Prevention:"
echo "   • Check if IPS is blocking the connections"
echo "   • Temporarily disable IPS for testing"
echo

echo -e "${YELLOW}6. WAN INTERFACE STATUS${NC}"
echo "   In Sophos → Network → Interfaces:"
echo "   • Verify WAN interface has public IP 115.99.14.95"
echo "   • Check interface status is UP/CONNECTED"
echo

echo -e "${BLUE}🧪 TESTING STEPS${NC}"
echo

echo "Step 1: Test from internal network"
echo "   • From another device on LAN: curl http://192.168.1.72"
echo "   • Should work if internal routing OK"
echo

echo "Step 2: Check Sophos logs real-time"
echo "   • Go to Reports → Log → Firewall"
echo "   • Filter by destination 192.168.1.72"
echo "   • Watch logs while running: curl http://115.99.14.95"
echo

echo "Step 3: Temporary bypass test"
echo "   • Temporarily create rule: Allow Any → Any"
echo "   • Test if ports open with permissive rule"
echo "   • Remove rule after testing"
echo

echo -e "${YELLOW}7. COMMON SOPHOS ISSUES${NC}"
echo

echo "Issue A: Double NAT"
echo "   • Check if ISP router also doing NAT"
echo "   • Verify 115.99.14.95 is directly on Sophos WAN"
echo

echo "Issue B: Sophos in Bridge Mode"
echo "   • Ensure Sophos is in Gateway/Route mode"
echo "   • Not in Bridge/Transparent mode"
echo

echo "Issue C: Missing Default Route"
echo "   • Check Network → Routing"
echo "   • Verify default gateway points to ISP"
echo

echo -e "${GREEN}📋 EXACT COMMANDS TO TRY${NC}"
echo

echo "From Sophos CLI (if available):"
echo "   # iptables -L -n -v | grep -E '80|9443'"
echo "   # iptables -t nat -L -n -v | grep -E '80|9443'"
echo

echo "From this server:"
echo "   # netstat -tlnp | grep -E ':80|:9443'"
echo "   # ss -tlnp | grep -E ':80|:9443'"
echo

echo -e "${BLUE}🎯 NEXT ACTIONS${NC}"
echo "1. Check Sophos live logs while testing"
echo "2. Verify WAN interface has public IP"
echo "3. Test with temporary 'Allow All' rule"
echo "4. Check for IPS/Application Control blocking"
echo

echo "If still stuck, the issue might be:"
echo "• ISP-level blocking"
echo "• Double NAT scenario"
echo "• Sophos in wrong operation mode"

# Test from local network
echo
echo -e "${BLUE}🔬 LOCAL NETWORK TEST${NC}"
echo "Testing internal network connectivity..."

# Check if we can reach the server from localhost
LOCAL_HTTP=$(curl -s -I http://127.0.0.1:80 2>/dev/null | head -n1)
LOCAL_HTTPS=$(curl -k -s -I https://127.0.0.1:9443 2>/dev/null | head -n1)

if [[ $LOCAL_HTTP == *"200"* ]] || [[ $LOCAL_HTTP == *"301"* ]]; then
    echo -e "${GREEN}✓ Local HTTP: $LOCAL_HTTP${NC}"
else
    echo -e "${RED}✗ Local HTTP: Failed${NC}"
fi

if [[ $LOCAL_HTTPS == *"200"* ]] || [[ $LOCAL_HTTPS == *"301"* ]]; then
    echo -e "${GREEN}✓ Local HTTPS: $LOCAL_HTTPS${NC}"
else
    echo -e "${RED}✗ Local HTTPS: Failed${NC}"
fi

echo
echo "Check these items in Sophos and run ./domain-diagnostic.sh again"