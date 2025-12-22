#!/bin/bash

# PostgreSQL Migration - MariaDB Retirement Plan
# This script updates environment configuration to use PostgreSQL as primary

echo "=========================================="
echo "PostgreSQL Migration - Environment Update"
echo "=========================================="
echo ""

# Backup current configuration
echo "📦 Creating backup of current configuration..."
cp server/.env server/.env.mariadb.backup
echo "✅ Backup created: server/.env.mariadb.backup"
echo ""

# Update environment variables
echo "🔧 Updating environment variables..."

# Set PostgreSQL as primary
export DB_TYPE="postgresql"
export PRIMARY_DB="postgresql"
export MIGRATION_MODE="postgres-primary"

# Update server/.env file
cat >> server/.env << 'EOF'

# ========================================
# PostgreSQL Migration Settings
# ========================================
# Migration Phase: PostgreSQL Primary, MariaDB Legacy
PRIMARY_DB=postgresql
MIGRATION_MODE=postgres-primary
DB_TYPE=postgresql

# Enable PostgreSQL features
POSTGRES_ENABLE_JSONB=true
POSTGRES_ENABLE_ARRAYS=true
POSTGRES_ENABLE_FULL_TEXT_SEARCH=true
POSTGRES_ENABLE_ROW_LEVEL_SECURITY=false

# MariaDB is now in legacy mode
MARIADB_MODE=legacy
MARIADB_READ_ONLY=false

# Dual-write settings (for gradual migration)
DUAL_WRITE_ENABLED=true
DUAL_WRITE_PRIMARY=postgres
DUAL_WRITE_FALLBACK=mariadb
DUAL_WRITE_VALIDATE=true

EOF

echo "✅ Environment variables updated"
echo ""

echo "📊 Current Database Configuration:"
echo "   Primary DB: PostgreSQL"
echo "   Legacy DB: MariaDB (read-only fallback)"
echo "   Mode: postgres-primary"
echo ""

echo "=========================================="
echo "✅ Migration configuration complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Restart your server: pm2 restart mediczy-backend"
echo "2. Verify PostgreSQL connectivity: curl http://localhost:8000/api/db/health"
echo "3. Monitor logs for any MariaDB fallback usage"
echo "4. After 30-60 days of stable operation, run mariadb-retirement.sh"
echo ""
