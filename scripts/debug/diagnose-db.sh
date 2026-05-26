#!/bin/bash
# Database Diagnostics Script

echo "=== PostgreSQL Diagnostics ==="
echo ""

# Check if PostgreSQL is running
echo "1. Checking PostgreSQL process..."
ps aux | grep postgres | grep -v grep || echo "No PostgreSQL process found"
echo ""

# Check .env configuration
echo "2. Database configuration from .env:"
if [ -f .env ]; then
    grep -E '^DB_' .env || echo "No DB_ variables in .env"
else
    echo ".env file not found"
fi
echo ""

# Check what ports PostgreSQL might be listening on
echo "3. PostgreSQL listening ports:"
sudo netstat -tlnp | grep postgres || sudo ss -tlnp | grep postgres || echo "Cannot determine listening ports"
echo ""

# Try common PostgreSQL ports
echo "4. Testing common PostgreSQL ports:"
for port in 5432 5433 5434; do
    echo -n "Port $port: "
    if timeout 1 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/$port" 2>/dev/null; then
        echo "OPEN"
    else
        echo "closed/refused"
    fi
done
echo ""

# Check PostgreSQL service status
echo "5. PostgreSQL service status:"
sudo systemctl status postgresql 2>/dev/null || sudo service postgresql status 2>/dev/null || echo "Cannot check service status"
echo ""

# Check if we can connect via socket instead
echo "6. Attempting local socket connection..."
psql -U postgres -c '\conninfo' 2>&1 | head -5 || echo "Cannot connect via socket"
echo ""

echo "=== End Diagnostics ==="
