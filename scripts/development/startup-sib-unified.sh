#!/bin/bash

##############################################################################
# SIB Unified Task Router - Complete System Startup
# 
# This script starts:
# 1. PostgreSQL (if not running)
# 2. SIB FastAPI service (port 8001)
# 3. Node.js backend server (port 8000)
# 
# All tasks and operations will route through SIB for unified orchestration
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="/home/ubuntu/Mediczy"
SIB_SERVICE="$PROJECT_ROOT/ai-engine/doctor_bot"
SERVER_ROOT="$PROJECT_ROOT/server"
SIB_PORT=8001
SERVER_PORT=8000
DB_HOST="127.0.0.1"
DB_PORT=5432
DB_NAME="mediczy"
DB_USER="mediczy_helper"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

##############################################################################
# Step 1: Verify Prerequisites
##############################################################################

log "Verifying prerequisites..."

# Check Python
if ! command -v python3 &> /dev/null; then
    error "Python3 not found"
    exit 1
fi
success "Python3: $(python3 --version)"

# Check Node.js
if ! command -v node &> /dev/null; then
    error "Node.js not found"
    exit 1
fi
success "Node.js: $(node --version)"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    error "PostgreSQL client not found"
    exit 1
fi
success "PostgreSQL client found"

##############################################################################
# Step 2: Start PostgreSQL
##############################################################################

log "Checking PostgreSQL..."

# Try to connect to PostgreSQL
if pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER &> /dev/null; then
    success "PostgreSQL is running on $DB_HOST:$DB_PORT"
else
    warning "PostgreSQL not running, attempting to start..."
    
    # Try to start PostgreSQL
    if sudo systemctl start postgresql &> /dev/null || sudo service postgresql start &> /dev/null; then
        sleep 2
        if pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER &> /dev/null; then
            success "PostgreSQL started successfully"
        else
            error "Failed to connect to PostgreSQL after starting"
            warning "PostgreSQL may need manual start: sudo systemctl start postgresql"
        fi
    else
        warning "Could not start PostgreSQL - may already be running or need manual intervention"
    fi
fi

##############################################################################
# Step 3: Start SIB FastAPI Service
##############################################################################

log "Starting SIB FastAPI Service..."

cd "$SIB_SERVICE"

# Check if SIB is already running
if curl -s http://localhost:$SIB_PORT/health &> /dev/null; then
    success "SIB is already running on port $SIB_PORT"
else
    log "SIB not running, starting..."
    
    # Check for Python virtual environment
    if [ ! -d "$SIB_SERVICE/venv" ]; then
        warning "Virtual environment not found, creating..."
        python3 -m venv venv
        log "Installing SIB dependencies..."
        source venv/bin/activate
        pip install -q -r requirements.txt
    else
        source venv/bin/activate
    fi
    
    # Start SIB in background
    nohup python3 -m uvicorn app:app --host 0.0.0.0 --port $SIB_PORT > sib.log 2>&1 &
    SIB_PID=$!
    
    log "SIB starting (PID: $SIB_PID)..."
    
    # Wait for SIB to start (with timeout)
    TIMEOUT=30
    ELAPSED=0
    while [ $ELAPSED -lt $TIMEOUT ]; do
        if curl -s http://localhost:$SIB_PORT/health &> /dev/null; then
            success "SIB is healthy on port $SIB_PORT"
            break
        fi
        sleep 1
        ELAPSED=$((ELAPSED + 1))
    done
    
    if [ $ELAPSED -ge $TIMEOUT ]; then
        error "SIB failed to start within $TIMEOUT seconds"
        error "Check logs: tail -f $SIB_SERVICE/sib.log"
        exit 1
    fi
fi

# Verify SIB health
log "Verifying SIB health..."
HEALTH=$(curl -s http://localhost:$SIB_PORT/health)
if echo "$HEALTH" | grep -q "healthy"; then
    success "SIB health check passed"
    echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
else
    error "SIB health check failed"
    echo "$HEALTH"
fi

##############################################################################
# Step 4: Start Node.js Backend Server
##############################################################################

log "Starting Node.js Backend Server..."

cd "$SERVER_ROOT"

# Check if Node modules are installed
if [ ! -d "$SERVER_ROOT/node_modules" ]; then
    log "Installing Node.js dependencies..."
    npm install -q
fi

# Check if .env file exists
if [ ! -f "$SERVER_ROOT/.env" ]; then
    warning ".env file not found at $SERVER_ROOT/.env"
    log "Creating .env file with default configuration..."
    
    cat > "$SERVER_ROOT/.env" << EOF
# SIB Configuration
SIB_URL=http://localhost:8001
SIB_TIMEOUT=30000

# PostgreSQL
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=mediczy
DB_USER=mediczy_helper
DB_PASSWORD=Mediczy2024Helper

# API Keys
GROQ_API_KEY=${GROQ_API_KEY:-your_groq_key_here}
GEMINI_API_KEY=AIzaSyCVa8eKHpCzWvyFrd4jKKxkomxHI8iAp48

# Server Configuration
NODE_ENV=development
PORT=8000
EOF
    
    success ".env file created at $SERVER_ROOT/.env"
fi

# Start Node.js server
log "Starting Node.js backend on port $SERVER_PORT..."

if [ -f "$SERVER_ROOT/server.js" ]; then
    START_FILE="server.js"
elif [ -f "$SERVER_ROOT/index.js" ]; then
    START_FILE="index.js"
else
    error "Could not find server.js or index.js in $SERVER_ROOT"
    exit 1
fi

# Start in background
nohup node "$START_FILE" > server.log 2>&1 &
NODE_PID=$!

log "Node.js server starting (PID: $NODE_PID)..."

# Wait for server to start
TIMEOUT=20
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if curl -s http://localhost:$SERVER_PORT/health &> /dev/null; then
        success "Node.js server is ready on port $SERVER_PORT"
        break
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
    warning "Node.js server may still be starting"
    log "Check logs: tail -f $SERVER_ROOT/server.log"
fi

##############################################################################
# Step 5: Verify System Status
##############################################################################

log "Verifying complete system status..."

# Check PostgreSQL
if pg_isready -h $DB_HOST -p $DB_PORT &> /dev/null; then
    success "PostgreSQL: Ready ($DB_HOST:$DB_PORT)"
else
    error "PostgreSQL: Not responding"
fi

# Check SIB
if curl -s http://localhost:$SIB_PORT/health &> /dev/null; then
    success "SIB: Ready (http://localhost:$SIB_PORT)"
else
    error "SIB: Not responding"
fi

# Check Node.js
if curl -s http://localhost:$SERVER_PORT/health &> /dev/null; then
    success "Node.js Backend: Ready (http://localhost:$SERVER_PORT)"
else
    warning "Node.js Backend: May still be starting"
fi

##############################################################################
# Step 6: Print System Information
##############################################################################

echo ""
log "================================================"
log "        🏥 MEDICZY SYSTEM STARTUP COMPLETE      "
log "================================================"
echo ""
log "📍 Services Running:"
echo "   🐘 PostgreSQL:       $DB_HOST:$DB_PORT ($DB_NAME)"
echo "   🧠 SIB (AI Core):    http://localhost:$SIB_PORT"
echo "   🌐 Node.js Backend:  http://localhost:$SERVER_PORT"
echo ""
log "📂 Project Structure:"
echo "   Root:       $PROJECT_ROOT"
echo "   SIB:        $SIB_SERVICE"
echo "   Server:     $SERVER_ROOT"
echo ""
log "📝 Logs:"
echo "   SIB:        $SIB_SERVICE/sib.log"
echo "   Server:     $SERVER_ROOT/server.log"
echo ""
log "🚀 System Architecture:"
echo "   All medical operations route through SIB Unified Task Router"
echo "   ├─ Chat & Consultations  (ChatBotlet)"
echo "   ├─ Medical Records       (EHRBotlet)"
echo "   ├─ Appointments          (AppointmentBotlet)"
echo "   ├─ Notifications         (NotificationBotlet)"
echo "   ├─ Prescriptions         (Medical Pipeline)"
echo "   ├─ Tasks                 (TaskBotlet)"
echo "   └─ Risk Assessment       (Bayesian Network)"
echo ""
log "✅ Quick Test Commands:"
echo "   curl http://localhost:$SIB_PORT/health"
echo "   curl -X POST http://localhost:$SERVER_PORT/api/chat -H 'Content-Type: application/json' -d '{\"message\":\"Hello\"}'"
echo ""
log "📚 Documentation:"
echo "   Integration Guide: $PROJECT_ROOT/SIB_UNIFIED_TASK_INTEGRATION.md"
echo "   Task Router:       $SIB_SERVICE/sib/task_router.py"
echo "   Node.js Proxy:     $SERVER_ROOT/services/sib-task-proxy.js"
echo ""
log "================================================"
echo ""

success "🎉 System is ready! All operations will route through SIB."

