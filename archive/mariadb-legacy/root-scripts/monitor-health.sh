#!/bin/bash
# Mediczy Health Monitor Script
# Usage: ./monitor-health.sh

echo "🔍 MEDICZY HEALTH CHECK"
echo "=========================="
echo

# Docker containers status
echo "📊 Container Status:"
cd /root/Mediczy
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "❌ Docker Compose not available"
echo

# Test frontend connectivity
echo "🌐 Frontend Tests:"
if curl -k -s https://localhost:9443/health > /dev/null 2>&1; then
    echo "✅ Frontend Health: OK"
else
    echo "❌ Frontend Health: FAIL"
fi

if curl -k -s https://localhost:9443/ > /dev/null 2>&1; then
    echo "✅ Frontend Homepage: OK"
else
    echo "❌ Frontend Homepage: FAIL" 
fi
echo

# Test database connectivity
echo "🗄️ Database Tests:"
if docker exec mediczy-mariadb mysqladmin -u admin -pMedAdmin2024! ping > /dev/null 2>&1; then
    echo "✅ MariaDB: OK"
else
    echo "❌ MariaDB: FAIL"
fi

if docker exec mediczy-mongo mongosh --eval "db.runCommand('ping').ok" > /dev/null 2>&1; then
    echo "✅ MongoDB: OK"
else
    echo "❌ MongoDB: FAIL"
fi

if docker exec mediczy-redis redis-cli --no-auth-warning -a RedisSecure2024! ping > /dev/null 2>&1; then
    echo "✅ Redis: OK"
else
    echo "❌ Redis: FAIL"
fi
echo

# System resources
echo "💻 System Resources:"
echo "Memory: $(free -h | grep '^Mem:' | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h /root | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
echo "Load: $(uptime | awk -F'load average:' '{print $2}' | xargs)"
echo

echo "🎯 Quick Access:"
echo "Frontend: https://mediczy.in:9443"
echo "MariaDB: mysql://admin:MedAdmin2024!@localhost:3307/mediczy_db"
echo "MongoDB: mongodb://localhost:27017/mediczy_db"
echo "Redis: redis://localhost:6379"
echo

echo "🔗 Management Commands:"
echo "Start all: docker-compose up -d"
echo "Stop all: docker-compose down"
echo "Logs: docker-compose logs -f [service]"
echo "Shell: docker exec -it mediczy-[service] /bin/bash"