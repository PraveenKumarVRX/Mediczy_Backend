#!/bin/bash

echo "🔄 MEDICZY MEDICAL PLATFORM - PRODUCTION RESTART"
echo "================================================="
echo "Graceful restart of all production services"
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Enhanced logging function
log_action() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")  echo -e "${BLUE}[INFO]${NC} $timestamp - $message" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} $timestamp - $message" ;;
        "WARNING") echo -e "${YELLOW}[WARNING]${NC} $timestamp - $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} $timestamp - $message" ;;
    esac
    
    # Log to file
    mkdir -p /tmp/mediczy/logs
    echo "[$level] $timestamp - $message" >> /tmp/mediczy/logs/restart.log
}

# Function to stop a service gracefully
stop_service() {
    local service_type=$1
    local service_name=$2
    local process_pattern=$3
    local timeout=${4:-15}
    
    log_action "INFO" "Stopping $service_name..."
    
    case $service_type in
        "systemctl")
            if sudo systemctl is-active --quiet "$process_pattern"; then
                sudo systemctl stop "$process_pattern" 2>/dev/null
                sleep 2
                if ! sudo systemctl is-active --quiet "$process_pattern"; then
                    log_action "SUCCESS" "$service_name stopped successfully"
                else
                    log_action "WARNING" "$service_name failed to stop gracefully"
                fi
            else
                log_action "INFO" "$service_name was not running"
            fi
            ;;
        "pm2")
            if pm2 list | grep -q "$process_pattern"; then
                pm2 delete "$process_pattern" 2>/dev/null
                log_action "SUCCESS" "$service_name stopped via PM2"
            else
                log_action "INFO" "$service_name not found in PM2"
            fi
            ;;
        "process")
            if pgrep -f "$process_pattern" > /dev/null; then
                pkill -TERM -f "$process_pattern"
                # Wait for graceful shutdown
                local wait_count=0
                while pgrep -f "$process_pattern" > /dev/null && [ $wait_count -lt $timeout ]; do
                    sleep 1
                    ((wait_count++))
                done
                
                # Force kill if still running
                if pgrep -f "$process_pattern" > /dev/null; then
                    log_action "WARNING" "$service_name didn't stop gracefully, forcing..."
                    pkill -9 -f "$process_pattern"
                fi
                log_action "SUCCESS" "$service_name stopped"
            else
                log_action "INFO" "$service_name was not running"
            fi
            ;;
    esac
}

# Function to wait for service to be ready
wait_for_service() {
    local port=$1
    local service_name=$2
    local timeout=${3:-30}
    
    log_action "INFO" "Waiting for $service_name on port $port..."
    
    for i in $(seq 1 $timeout); do
        if nc -z localhost $port 2>/dev/null; then
            log_action "SUCCESS" "$service_name is ready on port $port"
            return 0
        fi
        sleep 1
        echo -n "."
    done
    echo ""
    
    log_action "ERROR" "$service_name failed to start on port $port within ${timeout}s"
    return 1
}

# Main restart sequence
main() {
    log_action "INFO" "Starting graceful restart sequence..."
    
    echo ""
    log_action "INFO" "=== PHASE 1: STOPPING SERVICES ==="
    
    # Stop frontend first (user-facing)
    stop_service "process" "Frontend Server" "vite" 5
    
    # Stop backend API
    stop_service "pm2" "Backend API" "mediczy-backend"
    
    # Stop AI services
    stop_service "process" "DocsGPT Legacy" "app.py" 10
    stop_service "pm2" "LLM Orchestrator" "mediczy-orchestrator"
    stop_service "process" "Ultra-Fast Database" "ultra_fast_db_service.py" 10
    
    # Stop infrastructure (keep databases running unless specified)
    if [ "$1" == "--full" ]; then
        log_action "INFO" "Full restart requested - stopping infrastructure..."
        stop_service "systemctl" "Nginx Proxy" "nginx"
        stop_service "systemctl" "Redis Cache" "redis-server"
        stop_service "systemctl" "MongoDB" "mongod"
        stop_service "systemctl" "MariaDB Database" "mariadb"
        sleep 5
    else
        log_action "INFO" "Application restart - keeping infrastructure running"
    fi
    
    # Clean up any orphaned processes
    log_action "INFO" "Cleaning up orphaned processes..."
    pkill -f "node.*dist/index.js" 2>/dev/null || true
    pkill -f "vite.*--host" 2>/dev/null || true
    
    # Wait a moment for cleanup
    sleep 3
    
    echo ""
    log_action "INFO" "=== PHASE 2: STARTING SERVICES ==="
    
    if [ "$1" == "--full" ]; then
        # Start infrastructure
        log_action "INFO" "Starting infrastructure services..."
        sudo systemctl start mariadb 2>/dev/null
        wait_for_service 3306 "MariaDB" 20
        
        sudo systemctl start redis-server 2>/dev/null
        wait_for_service 6379 "Redis" 10
        
        sudo systemctl start mongod 2>/dev/null
        wait_for_service 27017 "MongoDB" 20
        
        sleep 2
    fi
    
    # Start AI services
    log_action "INFO" "Starting AI services..."
    
    cd /root/Mediczy/docsgpt || { log_action "ERROR" "Missing docsgpt directory"; exit 1; }
    
    nohup python3 ultra_fast_db_service.py > logs/ultra_fast_db.log 2>&1 &
    wait_for_service 5005 "Ultra-Fast Database" 30
    
    pm2 start llm_orchestrator.py --name mediczy-orchestrator --interpreter python3 --time --cwd /root/Mediczy/docsgpt 2>/dev/null
    wait_for_service 5000 "LLM Orchestrator" 30
    
    nohup python3 app.py > logs/docsgpt.log 2>&1 &
    wait_for_service 7091 "DocsGPT Legacy" 20
    
    # Start backend
    log_action "INFO" "Starting backend API..."
    cd /root/Mediczy/server || { log_action "ERROR" "Missing server directory"; exit 1; }
    pm2 start ecosystem.config.cjs 2>/dev/null
    wait_for_service 8000 "Backend API" 30
    
    # Start frontend
    log_action "INFO" "Starting frontend server..."
    cd /root/Mediczy/client || { log_action "ERROR" "Missing client directory"; exit 1; }
    
    # Check if dist exists, rebuild if necessary
    if [ ! -d "dist" ] || [ "$2" == "--rebuild" ]; then
        log_action "INFO" "Building frontend (this may take a minute)..."
        npm run build 2>&1 | tee /tmp/mediczy/logs/frontend_build.log
    fi
    
    nohup npm run dev > /tmp/mediczy/logs/frontend.log 2>&1 &
    wait_for_service 9443 "Frontend Server" 30
    
    if [ "$1" == "--full" ]; then
        # Restart Nginx
        log_action "INFO" "Restarting Nginx proxy..."
        sudo systemctl restart nginx 2>/dev/null
        wait_for_service 80 "Nginx" 10
    fi
    
    echo ""
    log_action "INFO" "=== PHASE 3: HEALTH VERIFICATION ==="
    
    sleep 5
    
    # Check critical services
    declare -A services=(
        ["8000"]="Backend API"
        ["9443"]="Frontend"
        ["5000"]="LLM Orchestrator"
        ["5005"]="Ultra-Fast Database"
    )
    
    local healthy=0
    local total=0
    
    for port in "${!services[@]}"; do
        ((total++))
        if nc -z localhost $port 2>/dev/null; then
            log_action "SUCCESS" "${services[$port]} is healthy on port $port"
            ((healthy++))
        else
            log_action "ERROR" "${services[$port]} is NOT responding on port $port"
        fi
    done
    
    echo ""
    log_action "INFO" "=== RESTART SUMMARY ==="
    
    if [ $healthy -eq $total ]; then
        log_action "SUCCESS" "🎉 All services restarted successfully! ($healthy/$total healthy)"
        log_action "SUCCESS" "Platform is fully operational"
        
        echo ""
        echo "🌐 ACCESS URLS:"
        echo "=============="
        echo "• Frontend:          http://localhost:9443"
        echo "• Backend API:       http://localhost:8000"
        echo "• LLM Orchestrator:  http://localhost:5000"
        echo "• Ultra-Fast DB:     http://localhost:5005"
        echo ""
        echo "📋 LOGS:"
        echo "========"
        echo "• Restart log:       tail -f /tmp/mediczy/logs/restart.log"
        echo "• Frontend log:      tail -f /tmp/mediczy/logs/frontend.log"
        echo "• Backend logs:      pm2 logs mediczy-backend"
        echo ""
        
        exit 0
    else
        log_action "WARNING" "⚠️ Partial restart - $healthy/$total services healthy"
        log_action "WARNING" "Some services may need manual intervention"
        
        echo ""
        echo "🔍 TROUBLESHOOTING:"
        echo "==================="
        echo "• Check logs:        tail -f /tmp/mediczy/logs/restart.log"
        echo "• View PM2 status:   pm2 status"
        echo "• Full restart:      ./restart-all-production.sh --full"
        echo ""
        
        exit 1
    fi
}

# Handle command line arguments
case "${1:-}" in
    "--help"|"-h")
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  (none)         Restart application services only (default)"
        echo "  --full         Full restart including infrastructure (DB, Redis, Nginx)"
        echo "  --rebuild      Rebuild frontend before starting"
        echo "  --status       Show current status of all services"
        echo "  --help, -h     Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0                     # Quick application restart"
        echo "  $0 --full              # Full system restart"
        echo "  $0 --full --rebuild    # Full restart with frontend rebuild"
        exit 0
        ;;
    "--status")
        echo "📊 Mediczy Services Status"
        echo "=========================="
        
        declare -A services=(
            ["3306"]="MariaDB Database"
            ["6379"]="Redis Cache"
            ["27017"]="MongoDB"
            ["5005"]="Ultra-Fast DB"
            ["5000"]="LLM Orchestrator"
            ["7091"]="DocsGPT Legacy"
            ["8000"]="Backend API"
            ["9443"]="Frontend Server"
            ["80"]="Nginx Proxy"
        )
        
        for port in "${!services[@]}"; do
            if nc -z localhost $port 2>/dev/null; then
                echo -e "${GREEN}✅ ${services[$port]} (Port $port)${NC}"
            else
                echo -e "${RED}❌ ${services[$port]} (Port $port)${NC}"
            fi
        done
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
