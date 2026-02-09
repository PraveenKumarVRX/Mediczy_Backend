#!/bin/bash
# Find and display database credentials

echo "=== Finding Database Credentials ==="
echo ""

echo "1. Checking .env files..."
for file in .env server/.env; do
    if [ -f ~/Mediczy/$file ]; then
        echo ""
        echo "File: $file"
        grep -E '^(DB_|POSTGRES_)' ~/Mediczy/$file 2>/dev/null || echo "  No DB/POSTGRES variables found"
    fi
done

echo ""
echo "2. Attempting to use found credentials..."
echo ""

# Read from .env if it exists
if [ -f ~/Mediczy/.env ]; then
    source <(grep -E '^(DB_|POSTGRES_)' ~/Mediczy/.env 2>/dev/null | sed 's/^/export /')
fi

# Try with POSTGRES_ prefix first (most common), fallback to DB_
DB_HOST="${DB_HOST:-${POSTGRES_HOST:-localhost}}"
DB_PORT="${DB_PORT:-${POSTGRES_PORT:-5432}}"
DB_USER="${DB_USER:-${POSTGRES_USER:-mediczy_helper}}"
DB_NAME="${DB_NAME:-${POSTGRES_DATABASE:-mediczy_ai}}"
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD}}"

echo "Will attempt connection with:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"
echo ""

if [ -n "$DB_PASSWORD" ]; then
    echo "Password found in environment, attempting connection..."
    export PGPASSWORD="$DB_PASSWORD"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f ~/Mediczy/create-api-credentials-table.sql
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ SUCCESS! Table created."
        echo ""
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c '\d api_credentials'
    fi
else
    echo "⚠️  No DB_PASSWORD found. Please enter it manually:"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f ~/Mediczy/create-api-credentials-table.sql
fi
