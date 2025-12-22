#!/bin/bash

echo "=========================================="
echo "   MEDICZY PRODUCTION STATUS CHECK"
echo "=========================================="
echo ""

echo "🚀 PM2 Process Status:"
pm2 status

echo ""
echo "📊 System Resources:"
echo "Memory Usage:"
free -h | grep Mem | awk '{print "  Total: " $2 ", Used: " $3 ", Free: " $4}'
echo "CPU Load:"
uptime | awk '{print "  " $0}'

echo ""
echo "💾 Database Status:"
systemctl is-active mariadb > /dev/null 2>&1 && echo "  ✅ MariaDB: Running" || echo "  ❌ MariaDB: Not Running"

echo ""
echo "🔴 Redis Status:"
systemctl is-active redis-server > /dev/null 2>&1 && echo "  ✅ Redis: Running (v$(redis-server --version | cut -d' ' -f3))" || echo "  ❌ Redis: Not Running"

echo ""
echo "🔥 Firewall Status:"
ufw status | head -5

echo ""
echo "�� Server Listening Ports:"
netstat -tulpn | grep LISTEN | grep -E ':(8000|3306|6379|9092)' | awk '{print "  " $4 " - " $7}'

echo ""
echo "📝 Recent PM2 Logs (last 10 lines):"
pm2 logs mediczy-server --nostream --lines 10 2>/dev/null | tail -10

echo ""
echo "=========================================="
echo "  Status check complete!"
echo "=========================================="
