#!/bin/bash
# Quick database table creation script

echo "Creating api_credentials table on PostgreSQL port 5432..."
echo ""

# First, let's check what credentials the app uses by looking at the database connection
echo "Checking application database configuration..."
grep -r "mediczy_ai" ~/Mediczy/server --include="*.js" --include="*.env*" -n 2>/dev/null | head -5
echo ""

# Try to connect using the connection we see in active processes (mediczy_helper/mediczy_ai)
echo "Attempting to create table as mediczy_helper user..."
echo "You'll be prompted for the database password."
echo ""

# Run the SQL
PGPASSWORD="" psql -h 127.0.0.1 -p 5432 -U mediczy_helper -d mediczy_ai -f ~/Mediczy/create-api-credentials-table.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Table created successfully!"
    echo ""
    echo "Verifying table structure:"
    PGPASSWORD="" psql -h 127.0.0.1 -p 5432 -U mediczy_helper -d mediczy_ai -c '\d api_credentials'
else
    echo ""
    echo "❌ Failed to create table. Let's try alternative methods..."
    echo ""
    echo "Option 1: Find database password"
    echo "  grep -i password ~/Mediczy/.env ~/Mediczy/server/.env 2>/dev/null"
    echo ""
    echo "Option 2: Check server database config"
    echo "  cat ~/Mediczy/server/database/index.js | grep -A 10 -B 5 'mediczy_ai'"
fi
