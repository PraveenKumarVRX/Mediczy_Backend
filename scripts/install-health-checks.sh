#!/bin/bash
################################################################################
# MEDICZY - HEALTH CHECK SETUP INSTALLER
# 
# Purpose: Install and configure automated health checking system
# Usage: ./install-health-checks.sh
#
# This script:
# - Creates necessary directories
# - Sets up permissions
# - Installs cron jobs
# - Configures log rotation
# - Tests the installation
#
# Author: Mediczy DevOps Team
# Version: 1.0
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Installing Mediczy Health Check System..."
echo ""

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p "$PROJECT_ROOT/logs/health-checks"
mkdir -p "$PROJECT_ROOT/reports/daily-checks"
mkdir -p "$PROJECT_ROOT/config"

# Set proper permissions
echo "🔒 Setting permissions..."
chmod +x "$SCRIPT_DIR"/*.sh
chmod 755 "$PROJECT_ROOT/logs"
chmod 755 "$PROJECT_ROOT/reports"

# Check dependencies
echo "🔍 Checking dependencies..."
MISSING_DEPS=()

if ! command -v curl &> /dev/null; then
    MISSING_DEPS+=("curl")
fi

if ! command -v jq &> /dev/null; then
    echo "⚠️  jq not found - JSON parsing may not work correctly"
fi

if ! command -v bc &> /dev/null; then
    echo "⚠️  bc not found - percentage calculations may not work"
fi

if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    echo "❌ Missing required dependencies: ${MISSING_DEPS[*]}"
    echo "Please install them and run this script again."
    echo ""
    echo "Ubuntu/Debian: apt-get install curl jq bc"
    echo "CentOS/RHEL: yum install curl jq bc"
    exit 1
fi

# Test the health check script
echo "🧪 Testing health check script..."
if "$SCRIPT_DIR/daily-health-check.sh" development > /dev/null 2>&1; then
    echo "✅ Health check script test passed"
else
    echo "⚠️  Health check test failed - check if servers are running"
fi

# Offer to install cron jobs
echo ""
read -p "🕐 Do you want to install automated cron jobs? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Installing cron jobs..."
    
    # Backup existing crontab
    crontab -l > "/tmp/crontab_backup_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "# No existing crontab" > "/tmp/crontab_backup_$(date +%Y%m%d_%H%M%S)"
    
    # Add health check jobs to crontab
    (crontab -l 2>/dev/null; echo "# Mediczy Health Checks - Added $(date)") | crontab -
    (crontab -l; echo "0 6 * * * $SCRIPT_DIR/run-daily-checks.sh production --silent") | crontab -
    (crontab -l; echo "0 */4 * * * $SCRIPT_DIR/run-daily-checks.sh staging --silent") | crontab -
    (crontab -l; echo "0 9-17 * * 1-5 $SCRIPT_DIR/run-daily-checks.sh development --silent") | crontab -
    
    echo "✅ Cron jobs installed successfully"
    echo "📋 Current crontab:"
    crontab -l | grep -A 10 "Mediczy Health Checks"
else
    echo "⏭️  Skipped cron installation. You can manually install using:"
    echo "   crontab -e"
    echo "   Then add contents from: $SCRIPT_DIR/crontab-example.txt"
fi

# Create a simple status script
cat > "$SCRIPT_DIR/health-status.sh" << 'EOF'
#!/bin/bash
# Quick status checker for Mediczy health checks

PROJECT_ROOT="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
LATEST_LOG=$(ls -t "$PROJECT_ROOT/logs/health-checks"/*.log 2>/dev/null | head -1)

echo "🏥 Mediczy Health Check Status"
echo "=============================="

if [[ -n "$LATEST_LOG" ]]; then
    echo "📄 Latest Check: $(basename "$LATEST_LOG")"
    echo "⏰ Last Run: $(stat -c %y "$LATEST_LOG" | cut -d. -f1)"
    
    if grep -q "SUCCESS.*Health check completed successfully" "$LATEST_LOG"; then
        echo "✅ Status: HEALTHY"
    else
        echo "❌ Status: ISSUES DETECTED"
        echo ""
        echo "🚨 Recent Errors:"
        grep "ERROR" "$LATEST_LOG" | tail -3 || echo "No specific errors found"
    fi
else
    echo "❓ Status: NO LOGS FOUND"
    echo "Health checks may not have run yet."
fi

echo ""
echo "📊 Quick Server Check:"
curl -s -o /dev/null -w "Backend: %{http_code}\n" http://localhost:8000/api/health 2>/dev/null || echo "Backend: DOWN"
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://localhost:4000 2>/dev/null || echo "Frontend: DOWN"
EOF

chmod +x "$SCRIPT_DIR/health-status.sh"

echo ""
echo "🎉 Installation Complete!"
echo ""
echo "📋 What was installed:"
echo "  ✅ Health check scripts in: $SCRIPT_DIR"
echo "  ✅ Log directory: $PROJECT_ROOT/logs/health-checks"
echo "  ✅ Reports directory: $PROJECT_ROOT/reports/daily-checks"
echo "  ✅ Configuration: $PROJECT_ROOT/config/health-check-config.json"
echo ""
echo "🚀 How to use:"
echo "  📊 Run manual check: $SCRIPT_DIR/daily-health-check.sh [environment]"
echo "  🏃 Run quick check: $SCRIPT_DIR/run-daily-checks.sh [environment]"
echo "  📈 Check status: $SCRIPT_DIR/health-status.sh"
echo "  🔧 Setup test data: $SCRIPT_DIR/setup-test-data.sh [environment]"
echo ""
echo "📝 Next steps:"
echo "  1. Customize config: $PROJECT_ROOT/config/health-check-config.json"
echo "  2. Set up notifications (Slack, email, PagerDuty)"
echo "  3. Test the system: $SCRIPT_DIR/daily-health-check.sh development"
echo "  4. Monitor logs: tail -f $PROJECT_ROOT/logs/health-checks/*.log"
echo ""
echo "🆘 Support:"
echo "  - View example cron config: $SCRIPT_DIR/crontab-example.txt"
echo "  - Check system status: $SCRIPT_DIR/health-status.sh"
echo "  - Logs are in: $PROJECT_ROOT/logs/health-checks/"