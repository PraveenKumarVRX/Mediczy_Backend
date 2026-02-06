#!/bin/bash
# Production Server Stop Script
# Gracefully stops the Mediczy API server

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PID_FILE="./server.pid"

echo -e "${YELLOW}🛑 Stopping Mediczy API Server...${NC}"

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
  echo -e "${RED}❌ Server is not running (no PID file found)${NC}"
  
  # Check for orphaned processes
  echo "Checking for orphaned Node processes..."
  ORPHANED=$(ps aux | grep "[n]ode.*server" | grep -v grep | awk '{print $2}')
  
  if [ -n "$ORPHANED" ]; then
    echo -e "${YELLOW}⚠️  Found orphaned server processes:${NC}"
    ps aux | grep "[n]ode.*server" | grep -v grep
    echo ""
    read -p "Kill these processes? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo "$ORPHANED" | xargs kill -15
      sleep 2
      # Force kill if still running
      STILL_RUNNING=$(ps aux | grep "[n]ode.*server" | grep -v grep | awk '{print $2}')
      if [ -n "$STILL_RUNNING" ]; then
        echo "Force killing remaining processes..."
        echo "$STILL_RUNNING" | xargs kill -9
      fi
      echo -e "${GREEN}✅ Orphaned processes terminated${NC}"
    fi
  fi
  exit 0
fi

# Read PID
PID=$(cat "$PID_FILE")

# Check if process is running
if ! ps -p "$PID" > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  Server process (PID: $PID) is not running${NC}"
  echo "Removing stale PID file..."
  rm -f "$PID_FILE"
  exit 0
fi

echo -e "${YELLOW}📋 Server PID: $PID${NC}"

# Graceful shutdown (SIGTERM)
echo "Sending SIGTERM (graceful shutdown)..."
kill -15 "$PID"

# Wait for graceful shutdown (max 10 seconds)
TIMEOUT=10
ELAPSED=0
while ps -p "$PID" > /dev/null 2>&1; do
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo -e "${YELLOW}⚠️  Graceful shutdown timed out${NC}"
    echo "Force killing process (SIGKILL)..."
    kill -9 "$PID"
    sleep 1
    break
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  echo -n "."
done
echo ""

# Verify process stopped
if ps -p "$PID" > /dev/null 2>&1; then
  echo -e "${RED}❌ Failed to stop server process${NC}"
  exit 1
else
  echo -e "${GREEN}✅ Server stopped successfully${NC}"
  rm -f "$PID_FILE"
fi

# Check if SSH tunnel should be stopped
if ps aux | grep -q "[s]sh.*5433"; then
  echo ""
  read -p "Stop database SSH tunnel? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    SSH_PID=$(ps aux | grep "[s]sh.*5433" | awk '{print $2}')
    if [ -n "$SSH_PID" ]; then
      kill "$SSH_PID"
      echo -e "${GREEN}✅ SSH tunnel stopped${NC}"
    fi
  fi
fi

echo -e "${GREEN}🎉 Shutdown complete${NC}"
