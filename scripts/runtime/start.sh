#!/bin/bash
# Production Server Start Script
# Starts the Mediczy API server in production mode

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PID_FILE="./server.pid"
LOG_FILE="./logs/server.log"
ERROR_LOG="./logs/server-error.log"

echo -e "${YELLOW}🚀 Starting Mediczy API Server (Production Mode)...${NC}"

# Check if server is already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo -e "${RED}❌ Server is already running (PID: $PID)${NC}"
    echo "Use ./restart.sh to restart or ./stop.sh to stop first"
    exit 1
  else
    echo -e "${YELLOW}⚠️  Stale PID file found. Cleaning up...${NC}"
    rm -f "$PID_FILE"
  fi
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if SSH tunnel to database is active
if ! ps aux | grep -q "[s]sh.*5433"; then
  echo -e "${YELLOW}⚠️  Database SSH tunnel not detected${NC}"
  echo "Starting SSH tunnel to EC2 database..."
  if [ -f "./connect-ec2-db.sh" ]; then
    ./connect-ec2-db.sh &
    sleep 2
    echo -e "${GREEN}✅ SSH tunnel started${NC}"
  else
    echo -e "${RED}❌ Warning: connect-ec2-db.sh not found. Database connection may fail.${NC}"
  fi
fi

# Set production environment
export NODE_ENV=production

# Check if PM2 is installed and ecosystem config exists
if command -v pm2 &> /dev/null && [ -f "ecosystem.config.js" ]; then
  echo -e "${YELLOW}📦 Starting with PM2 process manager...${NC}"
  
  # Start PM2 services
  pm2 start ecosystem.config.js
  
  # Save PM2 process list
  pm2 save
  
  echo -e "${GREEN}✅ PM2 services started successfully!${NC}"
  echo ""
  echo -e "${YELLOW}📊 PM2 Status:${NC}"
  pm2 list
  echo ""
  echo -e "${YELLOW}📝 View logs:${NC}"
  echo "   pm2 logs              # All logs"
  echo "   pm2 logs mediczy-api  # Specific app"
  echo "   pm2 monit             # Live monitoring"
  echo ""
  echo -e "${YELLOW}🛑 Stop services:${NC}"
  echo "   ./stop.sh  or  pm2 stop all"
  echo ""
  
  # Show recent logs
  echo -e "${YELLOW}📝 Recent PM2 logs (last 20 lines):${NC}"
  pm2 logs --lines 20 --nostream
  
else
  # Fallback to nohup if PM2 not available
  echo -e "${YELLOW}📦 Starting with nohup (PM2 not available)...${NC}"
  
  cd server
  # Use nohup to keep process running after shell exits
  nohup npm start > "../$LOG_FILE" 2> "../$ERROR_LOG" &

  # Save PID
  SERVER_PID=$!
  echo $SERVER_PID > "../$PID_FILE"

  # Wait a moment to check if server started successfully
  sleep 3

  if ps -p "$SERVER_PID" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server started successfully!${NC}"
    echo -e "${GREEN}   PID: $SERVER_PID${NC}"
    echo -e "${GREEN}   Log: $LOG_FILE${NC}"
    echo -e "${GREEN}   Error Log: $ERROR_LOG${NC}"
    echo ""
    echo -e "${YELLOW}📊 Monitor logs:${NC}"
    echo "   tail -f $LOG_FILE"
    echo ""
    echo -e "${YELLOW}🛑 Stop server:${NC}"
    echo "   ./stop.sh"
    echo ""
    
    # Show last few log lines
    echo -e "${YELLOW}📝 Recent logs:${NC}"
    tail -n 10 "../$LOG_FILE"
  else
    echo -e "${RED}❌ Server failed to start${NC}"
    echo "Check error log: $ERROR_LOG"
    rm -f "../$PID_FILE"
    exit 1
  fi
fi
