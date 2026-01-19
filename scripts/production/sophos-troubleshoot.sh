#!/bin/bash

echo "🔧 SOPHOS FIREWALL TROUBLESHOOTING GUIDE"
echo "========================================="
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${RED}⚠️  PORTS ARE STILL FILTERED/BLOCKED${NC}"
echo
echo "Port scan shows: 80/tcp filtered, 9443/tcp filtered"
echo "This means traffic is reaching the firewall but being blocked."
echo

echo -e "${BLUE}🔍 SOPHOS CONFIGURATION CHECKLIST${NC}"
echo "Please verify the following in your Sophos firewall:"
echo

echo -e "${YELLOW}1. NAT RULES VERIFICATION${NC}"
echo "   Go to: Network → NAT"
echo "   Verify these rules exist and are ENABLED:"
echo
echo "   Rule 1:"
echo "   • Source Zone: WAN"
echo "   • Destination Zone: LAN"
echo "   • Original Source: Any"
echo "   • Translated Source: Original"
echo "   • Original Destination: Any"
echo "   • Translated Destination: 192.168.1.72"
echo "   • Original Service: HTTP (TCP/80)"
echo "   • Translated Service: Original"
echo "   • Status: ✅ ENABLED"
echo
echo "   Rule 2:"
echo "   • Source Zone: WAN"
echo "   • Destination Zone: LAN"
echo "   • Original Source: Any"
echo "   • Translated Source: Original"
echo "   • Original Destination: Any"
echo "   • Translated Destination: 192.168.1.72"
echo "   • Original Service: HTTPS-9443 (TCP/9443)"
echo "   • Translated Service: Original"
echo "   • Status: ✅ ENABLED"
echo

echo -e "${YELLOW}2. FIREWALL RULES VERIFICATION${NC}"
echo "   Go to: Network → Firewall"
echo "   Verify these rules exist and are ENABLED:"
echo
echo "   Rule 1:"
echo "   • Rule Name: Allow-Mediczy-HTTP"
echo "   • Action: Allow"
echo "   • Source Zone: WAN"
echo "   • Destination Zone: LAN"
echo "   • Source Networks: Any"
echo "   • Destination Networks: 192.168.1.72/32"
echo "   • Services: HTTP (TCP/80)"
echo "   • Status: ✅ ENABLED"
echo
echo "   Rule 2:"
echo "   • Rule Name: Allow-Mediczy-HTTPS"
echo "   • Action: Allow"
echo "   • Source Zone: WAN"
echo "   • Destination Zone: LAN"
echo "   • Source Networks: Any"
echo "   • Destination Networks: 192.168.1.72/32"
echo "   • Services: HTTPS-9443 (TCP/9443)"
echo "   • Status: ✅ ENABLED"
echo

echo -e "${YELLOW}3. RULE ORDER CHECK${NC}"
echo "   • Ensure Allow rules are ABOVE any Deny/Drop rules"
echo "   • Rules are processed top-to-bottom"
echo "   • Move Allow rules to the top if needed"
echo

echo -e "${YELLOW}4. ZONE CONFIGURATION${NC}"
echo "   Verify these zones exist:"
echo "   • WAN Zone: Contains your external/internet interface"
echo "   • LAN Zone: Contains 192.168.1.0/24 network"
echo "   • Server IP 192.168.1.72 is in LAN zone"
echo

echo -e "${YELLOW}5. SERVICE DEFINITIONS${NC}"
echo "   Create custom service if needed:"
echo "   • Service Name: HTTPS-9443"
echo "   • Protocol: TCP"
echo "   • Port: 9443"
echo

echo -e "${YELLOW}6. CONFIGURATION APPLY${NC}"
echo "   • Click 'Apply' after making changes"
echo "   • Check for any error messages"
echo "   • Wait 30-60 seconds for changes to take effect"
echo

echo -e "${BLUE}🔄 COMMON ISSUES & SOLUTIONS${NC}"
echo
echo -e "${YELLOW}Issue 1: Rules exist but ports still filtered${NC}"
echo "   Solution: Check rule order, move Allow rules to top"
echo
echo -e "${YELLOW}Issue 2: NAT rules not working${NC}"
echo "   Solution: Verify destination zone is LAN, not WAN"
echo
echo -e "${YELLOW}Issue 3: Custom port 9443 not recognized${NC}"
echo "   Solution: Create custom service definition for port 9443"
echo
echo -e "${YELLOW}Issue 4: Changes not applied${NC}"
echo "   Solution: Click Apply, restart firewall service if needed"
echo

echo -e "${GREEN}📋 VERIFICATION STEPS${NC}"
echo "After making changes:"
echo "1. Wait 60 seconds for rules to take effect"
echo "2. Run: ./domain-diagnostic.sh"
echo "3. Check if ports show as 'open' instead of 'filtered'"
echo
echo "If still not working, check Sophos logs:"
echo "• Go to Reports → Log → Firewall"
echo "• Look for dropped connections to 192.168.1.72"
echo

echo -e "${BLUE}🌐 EXPECTED RESULT${NC}"
echo "After proper configuration:"
echo "• http://isha-inc.com → Should work"
echo "• https://isha-inc.com:9443 → Should work"
echo "• Port scan should show: 80/tcp open, 9443/tcp open"
echo

echo "Run './domain-diagnostic.sh' again after making these changes."