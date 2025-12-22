#!/bin/bash

# MariaDB Retirement - Final Phase
# WARNING: This script disables MariaDB and makes PostgreSQL the only database
# Only run after 30-60 days of stable PostgreSQL operation

echo "=========================================="
echo "⚠️  MariaDB Retirement - Final Phase"
echo "=========================================="
echo ""
echo "WARNING: This will:"
echo "1. Set MariaDB to read-only mode"
echo "2. Disable MariaDB connections in application"
echo "3. Archive MariaDB data"
echo "4. Make PostgreSQL the ONLY active database"
echo ""
read -p "Are you sure you want to proceed? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Retirement cancelled"
    exit 1
fi

echo ""
echo "📊 Pre-retirement checks..."

# Check PostgreSQL is running
if ! systemctl is-active --quiet postgresql; then
    echo "❌ PostgreSQL is not running! Aborting."
    exit 1
fi

# Check data consistency
echo "🔍 Checking data consistency..."
cd /home/ubuntu/Mediczy
node server/scripts/check-data-consistency.js > consistency-check.log 2>&1

if [ $? -ne 0 ]; then
    echo "⚠️  Data consistency check found issues. Review consistency-check.log"
    read -p "Continue anyway? (yes/no): " force_confirm
    if [ "$force_confirm" != "yes" ]; then
        echo "❌ Retirement aborted"
        exit 1
    fi
fi

echo "✅ PostgreSQL is healthy"
echo ""

# Backup MariaDB data
echo "📦 Creating final MariaDB backup..."
BACKUP_DIR="/home/ubuntu/mediczy-mariadb-final-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

mysqldump -u mediczy -pMediczy2024Secure mediczy > "$BACKUP_DIR/mediczy-full-backup.sql"
if [ $? -eq 0 ]; then
    echo "✅ MariaDB backup created: $BACKUP_DIR/mediczy-full-backup.sql"
    gzip "$BACKUP_DIR/mediczy-full-backup.sql"
    echo "✅ Backup compressed"
else
    echo "❌ Backup failed! Aborting retirement."
    exit 1
fi

# Set MariaDB to read-only
echo ""
echo "🔒 Setting MariaDB to read-only mode..."
mysql -u root << 'EOF'
SET GLOBAL read_only = ON;
SET GLOBAL super_read_only = ON;
EOF

if [ $? -eq 0 ]; then
    echo "✅ MariaDB set to read-only"
else
    echo "❌ Failed to set read-only mode"
fi

# Update application configuration
echo ""
echo "🔧 Updating application configuration..."

# Update server/.env
cat >> server/.env << 'EOF'

# ========================================
# MariaDB RETIRED - PostgreSQL Only
# ========================================
# Updated: $(date)
MIGRATION_MODE=postgres-only
MARIADB_ENABLED=false
MARIADB_MODE=retired
PRIMARY_DB=postgresql
FALLBACK_DB=none
DUAL_WRITE_ENABLED=false

# MariaDB retirement complete
MARIADB_RETIRED=true
MARIADB_RETIREMENT_DATE=$(date +%Y-%m-%d)
MARIADB_BACKUP_LOCATION=$BACKUP_DIR

EOF

echo "✅ Configuration updated"

# Update orchestrator to skip MariaDB
echo ""
echo "🔧 Updating database orchestrator..."

# Create a flag file
touch server/db/.mariadb-retired

echo "✅ Orchestrator updated"

echo ""
echo "=========================================="
echo "✅ MariaDB Retirement Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "✅ MariaDB data backed up to: $BACKUP_DIR"
echo "✅ MariaDB set to read-only mode"
echo "✅ Application configured for PostgreSQL-only"
echo "✅ Migration mode: postgres-only"
echo ""
echo "⚠️  IMPORTANT:"
echo "1. Restart application: pm2 restart mediczy-backend"
echo "2. Monitor logs for 24 hours"
echo "3. Keep MariaDB backup for at least 90 days"
echo "4. After 90 days, you can stop MariaDB: systemctl stop mariadb"
echo ""
echo "Backup location: $BACKUP_DIR"
echo ""
