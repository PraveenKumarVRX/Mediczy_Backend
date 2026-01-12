#!/bin/bash

###############################################################################
# MiroTalk SFU Health Check & Auto-Recovery Script
# 
# This script ensures MiroTalk SFU stays running and healthy
# Run this via cron every 5 minutes: */5 * * * *
###############################################################################

LOG_FILE="/home/ubuntu/Mediczy/logs/mirotalk-health.log"
MIROTALK_PORT=3010
MAX_RESTARTS=5
RESTART_COUNT_FILE="/tmp/mirotalk_restart_count"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to get restart count
get_restart_count() {
    if [ -f "$RESTART_COUNT_FILE" ]; then
        cat "$RESTART_COUNT_FILE"
    else
        echo "0"
    fi
}

# Function to increment restart count
increment_restart_count() {
    local count=$(get_restart_count)
    echo $((count + 1)) > "$RESTART_COUNT_FILE"
}

# Function to reset restart count
reset_restart_count() {
    echo "0" > "$RESTART_COUNT_FILE"
}

# Check if PM2 process exists
check_pm2_process() {
    pm2 jlist | jq -r '.[] | select(.name=="mirotalk-sfu") | .pm2_env.status' 2>/dev/null
}

# Check if MiroTalk is responding on port
check_port() {
    nc -z localhost "$MIROTALK_PORT" 2>/dev/null
    return $?
}

# Check HTTP health
check_http_health() {
    curl -s -f -m 5 "http://localhost:$MIROTALK_PORT" > /dev/null 2>&1
    return $?
}

# Main health check
main() {
    log "=== MiroTalk SFU Health Check Started ==="
    
    # Check PM2 status
    PM2_STATUS=$(check_pm2_process)
    
    if [ "$PM2_STATUS" == "online" ]; then
        log "✓ PM2 Status: Online"
        
        # Check if port is listening
        if check_port; then
            log "✓ Port $MIROTALK_PORT: Listening"
            
            # Check HTTP health
            if check_http_health; then
                log "✓ HTTP Health: OK"
                log "✓ MiroTalk SFU is healthy"
                reset_restart_count
            else
                log "✗ HTTP Health: Failed - Service not responding"
                log "→ Attempting restart..."
                
                restart_count=$(get_restart_count)
                if [ "$restart_count" -lt "$MAX_RESTARTS" ]; then
                    pm2 restart mirotalk-sfu
                    increment_restart_count
                    log "→ Restarted MiroTalk SFU (attempt $((restart_count + 1))/$MAX_RESTARTS)"
                else
                    log "✗ ERROR: Max restart attempts ($MAX_RESTARTS) reached. Manual intervention required!"
                    log "→ Sending alert notification..."
                    # You can add alert notification here (email, Slack, etc.)
                fi
            fi
        else
            log "✗ Port $MIROTALK_PORT: Not listening"
            log "→ MiroTalk may have crashed. Restarting..."
            
            restart_count=$(get_restart_count)
            if [ "$restart_count" -lt "$MAX_RESTARTS" ]; then
                pm2 restart mirotalk-sfu
                increment_restart_count
                log "→ Restarted MiroTalk SFU (attempt $((restart_count + 1))/$MAX_RESTARTS)"
            else
                log "✗ ERROR: Max restart attempts ($MAX_RESTARTS) reached. Manual intervention required!"
            fi
        fi
    elif [ "$PM2_STATUS" == "stopped" ]; then
        log "✗ PM2 Status: Stopped"
        log "→ Starting MiroTalk SFU..."
        
        restart_count=$(get_restart_count)
        if [ "$restart_count" -lt "$MAX_RESTARTS" ]; then
            pm2 start mirotalk-sfu
            increment_restart_count
            log "→ Started MiroTalk SFU (attempt $((restart_count + 1))/$MAX_RESTARTS)"
        else
            log "✗ ERROR: Max restart attempts ($MAX_RESTARTS) reached. Manual intervention required!"
        fi
    else
        log "✗ PM2 Status: Unknown or not found"
        log "→ Attempting to start from ecosystem config..."
        pm2 start ecosystem.config.js --only mirotalk-sfu
        log "→ Started MiroTalk SFU"
    fi
    
    log "=== Health Check Completed ===\n"
}

# Run main function
main

exit 0
