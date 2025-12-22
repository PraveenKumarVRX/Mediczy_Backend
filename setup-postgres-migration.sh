#!/bin/bash

###############################################################################
# PostgreSQL Migration Quick Setup
# One-command setup for migrating from MariaDB to PostgreSQL
###############################################################################

set -e  # Exit on error

echo "========================================================================"
echo "🚀 PostgreSQL Migration - Quick Setup"
echo "========================================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if PostgreSQL is installed
echo -e "${BLUE}📡 Checking PostgreSQL installation...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed${NC}"
    echo "Install with: sudo apt install postgresql postgresql-contrib"
    exit 1
fi
echo -e "${GREEN}✅ PostgreSQL is installed${NC}"

# Check if PostgreSQL is running
echo -e "${BLUE}🔍 Checking PostgreSQL status...${NC}"
if ! sudo systemctl is-active --quiet postgresql; then
    echo -e "${YELLOW}⚠️  PostgreSQL is not running, starting...${NC}"
    sudo systemctl start postgresql
    sleep 2
fi
echo -e "${GREEN}✅ PostgreSQL is running${NC}"

# Create database and user
echo ""
echo -e "${BLUE}🔧 Setting up database and user...${NC}"
sudo -u postgres psql << EOF
-- Create database if not exists
SELECT 'CREATE DATABASE mediczy_ai'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mediczy_ai')\gexec

-- Create user if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'mediczy_helper') THEN
        CREATE USER mediczy_helper WITH PASSWORD 'Mediczy2024Helper';
    END IF;
END
\$\$;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE mediczy_ai TO mediczy_helper;
\c mediczy_ai
GRANT ALL ON SCHEMA public TO mediczy_helper;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mediczy_helper;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mediczy_helper;
EOF

echo -e "${GREEN}✅ Database and user configured${NC}"

# Test connection
echo ""
echo -e "${BLUE}🔌 Testing PostgreSQL connection...${NC}"
if PGPASSWORD='Mediczy2024Helper' psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Connection successful${NC}"
else
    echo -e "${RED}❌ Connection failed${NC}"
    echo "Check your PostgreSQL configuration"
    exit 1
fi

# Navigate to server directory
cd /home/ubuntu/Mediczy/server

# Sync tables
echo ""
echo -e "${BLUE}📋 Syncing PostgreSQL table schemas...${NC}"
if node scripts/sync-postgres-tables.js; then
    echo -e "${GREEN}✅ Tables synced${NC}"
else
    echo -e "${RED}❌ Table sync failed${NC}"
    exit 1
fi

# Ask user if they want to migrate data now
echo ""
echo -e "${YELLOW}📊 Ready to migrate data from MariaDB to PostgreSQL${NC}"
read -p "Do you want to run data migration now? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BLUE}🔄 Starting data migration...${NC}"
    
    # Run migration
    if node scripts/migrate-data-to-postgres.js; then
        echo ""
        echo -e "${GREEN}✅ Data migration completed${NC}"
        
        # Ask about consistency check
        echo ""
        read -p "Run consistency check? (y/N): " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            echo -e "${BLUE}🔍 Running consistency check...${NC}"
            node scripts/check-data-consistency.js
        fi
    else
        echo -e "${RED}❌ Data migration failed${NC}"
        echo "Check the error messages above"
        exit 1
    fi
else
    echo -e "${YELLOW}⏭️  Skipping data migration${NC}"
    echo "You can run it manually later with:"
    echo "  cd /home/ubuntu/Mediczy/server"
    echo "  node scripts/migrate-data-to-postgres.js"
fi

# Summary
echo ""
echo "========================================================================"
echo -e "${GREEN}✅ PostgreSQL Setup Complete!${NC}"
echo "========================================================================"
echo ""
echo "Next steps:"
echo "  1. Update your .env file with PostgreSQL settings"
echo "  2. Set MIGRATION_MODE=dual-write to enable dual-write"
echo "  3. Restart your application"
echo "  4. Monitor logs for any issues"
echo ""
echo "Useful commands:"
echo "  - Check data: psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai"
echo "  - Verify consistency: node server/scripts/check-data-consistency.js"
echo "  - Re-migrate table: node server/scripts/migrate-data-to-postgres.js --table=users"
echo ""
echo "Documentation:"
echo "  - Migration Plan: POSTGRES_MIGRATION_PLAN.md"
echo "  - Quick Start: POSTGRES_QUICKSTART.md"
echo "  - Scripts Guide: MIGRATION_SCRIPTS_GUIDE.md"
echo ""
