#!/bin/bash
# Production Server Restart Script
# Restarts the Mediczy API server with PM2 cleanup and log rotation

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Mediczy API Server Restart Script    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Save PM2 process list and stop
echo -e "${YELLOW}🔧 Step 1/4: Managing PM2 processes...${NC}"
PM2_WAS_RUNNING=false
if command -v pm2 &> /dev/null; then
  PM2_LIST=$(pm2 jlist 2>/dev/null)
  if [ "$PM2_LIST" != "[]" ]; then
    PM2_WAS_RUNNING=true
    echo "Found running PM2 processes:"
    pm2 list
    echo ""
    echo "Saving PM2 process list..."
    pm2 save --force
    echo "Stopping all PM2 processes..."
    pm2 stop all
    echo "Deleting all PM2 processes (will restart based on ecosystem config)..."
    pm2 delete all
    echo -e "${GREEN}✅ PM2 processes stopped and cleaned${NC}"
  else
    echo -e "${YELLOW}ℹ️  No PM2 processes running${NC}"
  fi
else
  echo -e "${YELLOW}ℹ️  PM2 not installed - will use standard process management${NC}"
fi
echo ""

# Step 2: Rotate logs
echo -e "${YELLOW}📋 Step 2/4: Rotating logs...${NC}"
LOG_DIR="./logs"
ARCHIVE_DIR="./logs/archive"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if [ -d "$LOG_DIR" ]; then
  # Create archive directory
  mkdir -p "$ARCHIVE_DIR"
  
  # Count log files
  LOG_COUNT=$(find "$LOG_DIR" -maxdepth 1 -name "*.log" 2>/dev/null | wc -l)
  
  if [ "$LOG_COUNT" -gt 0 ]; then
    echo "Archiving $LOG_COUNT log file(s)..."
    
    # Archive each log file
    for log_file in "$LOG_DIR"/*.log; do
      if [ -f "$log_file" ]; then
        filename=$(basename "$log_file")
        # Compress and move to archive
        gzip -c "$log_file" > "$ARCHIVE_DIR/${filename%.log}_${TIMESTAMP}.log.gz"
        # Truncate original log
        > "$log_file"
        echo "  ✓ Archived: $filename → archive/${filename%.log}_${TIMESTAMP}.log.gz"
      fi
    done
    
    echo -e "${GREEN}✅ Logs rotated and archived${NC}"
    
    # Clean old archives (keep last 30 days)
    echo "Cleaning archives older than 30 days..."
    find "$ARCHIVE_DIR" -name "*.log.gz" -mtime +30 -delete 2>/dev/null || true
  else
    echo -e "${YELLOW}ℹ️  No log files to rotate${NC}"
  fi
else
  echo -e "${YELLOW}ℹ️  No logs directory found${NC}"
fi
echo ""

# Step 3: Stop the server if running
PID_FILE="./server.pid"
WAS_RUNNING=false

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    WAS_RUNNING=true
    echo -e "${YELLOW}📋 Current server PID: $PID${NC}"
  fi
fi

if [ "$WAS_RUNNING" = true ]; then
  echo -e "${YELLOW}🛑 Step 3/4: Stopping current server...${NC}"
  ./stop.sh
  
  # Wait a moment to ensure clean shutdown
  sleep 2
else
  echo -e "${YELLOW}ℹ️  Step 3/4: No running server detected${NC}"
fi

echo ""
echo -e "${YELLOW}🚀 Step 4/4: Starting server...${NC}"
echo ""

# Step 4: Start the server
./start.sh

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Restart Completed Successfully     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Summary:${NC}"
if [ "$PM2_WAS_RUNNING" = true ] || command -v pm2 &> /dev/null; then
  echo -e "  • PM2 processes: Restarted from ecosystem config"
else
  echo -e "  • Server process: Restarted with nohup"
fi
echo -e "  • Logs: Rotated and archived to logs/archive/"
echo -e "  • Old archives: Cleaned (>30 days)"
echo -e "  • Fresh logs: Started"
echo ""

# Show current status
if command -v pm2 &> /dev/null; then
  PM2_CURRENT=$(pm2 jlist 2>/dev/null)
  if [ "$PM2_CURRENT" != "[]" ]; then
    echo -e "${BLUE}📊 Current PM2 Status:${NC}"
    pm2 list
    echo ""
    echo -e "${YELLOW}💡 View live logs:${NC}"
    echo "   pm2 logs"
  fi
fi
