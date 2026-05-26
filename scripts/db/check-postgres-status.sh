#!/bin/bash
echo "🔍 PostgreSQL Status Check"
echo "=========================="
echo ""

echo "1. PostgreSQL Service:"
netstat -tuln 2>/dev/null | grep 5432 && echo "   ✅ PostgreSQL is running on port 5432" || echo "   ❌ PostgreSQL not running"
echo ""

echo "2. Current .env Configuration:"
grep "^POSTGRES" .env | while read line; do
  if [[ $line == *"PASSWORD"* ]]; then
    echo "   POSTGRES_PASSWORD=***hidden***"
  else
    echo "   $line"
  fi
done
echo ""

echo "3. Testing Connection Methods:"
echo ""

# Try without password (peer auth)
echo "   Trying local socket connection..."
if psql -d mediczy_ai -c "SELECT 1" &>/dev/null; then
  echo "   ✅ Can connect without password (peer authentication)"
  echo ""
  echo "   Creating user and setting password..."
  psql -d mediczy_ai -c "CREATE USER IF NOT EXISTS mediczy_helper WITH PASSWORD 'Mediczy2024Helper';" &>/dev/null
  psql -d mediczy_ai -c "ALTER USER mediczy_helper WITH PASSWORD 'Mediczy2024Helper';" &>/dev/null
  psql -d mediczy_ai -c "GRANT ALL PRIVILEGES ON DATABASE mediczy_ai TO mediczy_helper;" &>/dev/null
  echo "   Setup complete!"
else
  echo "   ❌ Cannot connect via socket"
fi
echo ""

# Try TCP with password
echo "   Trying TCP connection with password..."
PGPASSWORD="Mediczy2024Helper" psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c "SELECT 1" &>/dev/null
if [ $? -eq 0 ]; then
  echo "✅ Connection successful with current credentials!"
  echo ""
  echo "   You can run: ./setup-database.sh"
else
  echo "   ❌ Authentication failed"
  echo ""
  echo "   Options:"
  echo "   1. Contact your admin for the correct password"
  echo "   2. Use a cloud database (Azure, AWS, etc.)"
  echo "   3. Create new PostgreSQL database"
fi
