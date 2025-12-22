#!/bin/bash
################################################################################
# MEDICZY - DAILY HEALTH CHECK RUNNER
# 
# Purpose: Simplified runner for cron jobs and CI/CD pipelines
# Usage: ./run-daily-checks.sh [environment] [--silent]
#
# Features:
# - Runs health checks
# - Handles logging and rotation
# - Sends notifications on failures
# - Supports silent mode for cron
#
# Author: Mediczy DevOps Team
# Version: 1.0
################################################################################

ENVIRONMENT="${1:-production}"
SILENT_MODE=false

if [[ "${2:-}" == "--silent" ]]; then
    SILENT_MODE=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs/health-checks"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Log rotation - keep only last 7 days
find "$LOG_DIR" -name "health_check_*.log" -mtime +7 -delete 2>/dev/null || true
find "$PROJECT_ROOT/reports/daily-checks" -name "daily_*" -mtime +30 -delete 2>/dev/null || true

# Run the health check
if [[ "$SILENT_MODE" == "true" ]]; then
    # Silent mode for cron - only output on failures
    if ! "$SCRIPT_DIR/daily-health-check.sh" "$ENVIRONMENT" > /dev/null 2>&1; then
        echo "🚨 Mediczy health check FAILED for $ENVIRONMENT environment"
        echo "Check logs in: $LOG_DIR"
        exit 1
    fi
else
    # Interactive mode
    "$SCRIPT_DIR/daily-health-check.sh" "$ENVIRONMENT"
fi