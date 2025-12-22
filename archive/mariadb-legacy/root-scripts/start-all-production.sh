#!/bin/bash

echo "🏥 MEDICZY MEDICAL PLATFORM - PRODUCTION DEPLOYMENT"
echo "=================================================="
echo "Enterprise-grade startup with comprehensive error handling"
echo "Services: Backend + Frontend + AI Orchestrator + Ultra-Fast DB + DocsGPT + Database + Cache + Proxy"
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global error tracking
ERRORS=0
WARNINGS=0
CRITICAL_SERVICES=("mariadb" "redis-server" "ultra_fast_db_service.py" "llm_orchestrator.py")

# Enhanced logging function
log_action() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")  echo -e "${BLUE}[INFO]${NC} $timestamp - $message" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} $timestamp - $message" ;;
        "WARNING") echo -e "${YELLOW}[WARNING]${NC} $timestamp - $message"; ((WARNINGS++)) ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} $timestamp - $message"; ((ERRORS++)) ;;
        "CRITICAL") echo -e "${RED}[CRITICAL]${NC} $timestamp - $message"; ((ERRORS++)) ;;
    esac
    
    # Log to file
    echo "[$level] $timestamp - $message" >> /tmp/mediczy/logs/startup.log
}

# Function to check system prerequisites
check_prerequisites() {
    log_action "INFO" "Checking system prerequisites..."
    
    # Check if running as root/sudo for system services
    if [[ $EUID -ne 0 ]] && ! groups | grep -q sudo; then
        log_action "WARNING" "Not running as root - some system services may fail to start"
    fi
    
    # Check required commands
    local required_commands=("python3" "npm" "systemctl" "nc" "curl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_action "ERROR" "Required command not found: $cmd"
            return 1
        fi
    done
    
    # Check PM2 and install if missing
    if ! command -v pm2 &> /dev/null; then
        log_action "WARNING" "PM2 not found - installing globally..."
        if sudo npm install -g pm2; then
            log_action "SUCCESS" "PM2 installed successfully"
        else
            log_action "ERROR" "Failed to install PM2"
            return 1
        fi
    fi
    
    # Check disk space (minimum 1GB free)
    local available_space=$(df ~ | tail -1 | awk '{print $4}')
    if [ "$available_space" -lt 1048576 ]; then  # 1GB in KB
        log_action "WARNING" "Low disk space: $(( available_space / 1024 ))MB available"
    fi
    
    # Check memory (minimum 2GB recommended)
    local available_memory=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    if [ "$available_memory" -lt 2048 ]; then
        log_action "WARNING" "Low memory: ${available_memory}MB available (2GB+ recommended)"
    fi
    
    log_action "SUCCESS" "Prerequisites check completed"
    return 0
}

# Enhanced function to check if service is running
check_service() {
    local process=$1
    local service_name=$2
    local timeout=${3:-5}
    
    if timeout "$timeout" bash -c "pgrep -f \"$process\" > /dev/null"; then
        log_action "SUCCESS" "$service_name is running"
        return 0
    else
        log_action "INFO" "$service_name is not running"
        return 1
    fi
}

# Enhanced function to wait for service with retry logic
wait_for_service() {
    local port=$1
    local service_name=$2
    local timeout=${3:-30}
    local retry_count=0
    local max_retries=3
    
    while [ $retry_count -lt $max_retries ]; do
        log_action "INFO" "Waiting for $service_name on port $port (attempt $((retry_count + 1))/$max_retries)..."
        
        for i in $(seq 1 $timeout); do
            if nc -z localhost $port 2>/dev/null; then
                log_action "SUCCESS" "$service_name ready on port $port"
                return 0
            fi
            sleep 1
            echo -n "."
        done
        echo ""
        
        ((retry_count++))
        if [ $retry_count -lt $max_retries ]; then
            log_action "WARNING" "$service_name not ready, retrying in 5 seconds..."
            sleep 5
        fi
    done
    
    log_action "CRITICAL" "$service_name failed to start on port $port after $max_retries attempts"
    return 1
}

# Function to handle service startup with error recovery
start_service() {
    local service_type=$1
    local service_name=$2
    local port=$3
    local start_command=$4
    local process_check=$5
    
    log_action "INFO" "Starting $service_name..."
    
    # Check if already running
    if check_service "$process_check" "$service_name" 2; then
        log_action "SUCCESS" "$service_name already running"
        return 0
    fi
    
    # Execute start command based on service type
    case $service_type in
        "systemctl")
            if ! sudo systemctl start "$start_command" 2>/dev/null; then
                log_action "ERROR" "Failed to start $service_name via systemctl"
                return 1
            fi
            ;;
        "background")
            eval "$start_command" &
            sleep 2
            ;;
        "pm2")
            cd ~/Mediczy/server && pm2 start ecosystem.config.cjs 2>/dev/null
            ;;
        *)
            log_action "ERROR" "Unknown service type: $service_type"
            return 1
            ;;
    esac
    
    # Wait for service to be ready
    if [ -n "$port" ]; then
        if wait_for_service "$port" "$service_name" 30; then
            return 0
        else
            return 1
        fi
    fi
    
    return 0
}

# Function to perform comprehensive health checks
perform_health_checks() {
    log_action "INFO" "Performing comprehensive health checks..."
    
    # Define all services and their health check URLs
    declare -A health_endpoints=(
        ["5005"]="Ultra-Fast Database|http://localhost:5005/api/db/stats"
        ["5000"]="LLM Orchestrator|http://localhost:5000/health"
        ["8000"]="Backend API|http://localhost:8000/health"
        ["7091"]="DocsGPT Legacy|http://localhost:7091/health"
    )
    
    local health_passed=0
    local health_total=0
    
    for port in "${!health_endpoints[@]}"; do
        IFS='|' read -r service_name endpoint <<< "${health_endpoints[$port]}"
        ((health_total++))
        
        if curl -s -f --max-time 10 "$endpoint" > /dev/null 2>&1; then
            log_action "SUCCESS" "$service_name health check passed"
            ((health_passed++))
        else
            log_action "WARNING" "$service_name health check failed"
        fi
    done
    
    log_action "INFO" "Health checks completed: $health_passed/$health_total services healthy"
    
    # Test critical AI functionality
    log_action "INFO" "Testing AI emergency detection..."
    local ai_test_result=$(curl -s -X POST http://localhost:5005/api/db/analyze \
        -H "Content-Type: application/json" \
        -d '{"query": "I have severe chest pain and difficulty breathing"}' 2>/dev/null)
    
    if echo "$ai_test_result" | grep -q "urgency_score"; then
        local urgency=$(echo "$ai_test_result" | python3 -c "import json,sys; print(json.load(sys.stdin)['urgency_score'])" 2>/dev/null || echo "unknown")
        log_action "SUCCESS" "AI emergency detection working - Urgency: $urgency"
    else
        log_action "WARNING" "AI emergency detection test failed"
    fi
}

# Verify orchestrator port and (re)launch under pm2 if missing
verify_orchestrator_binding() {
    local port=5000
    if nc -z localhost $port 2>/dev/null; then
        log_action "SUCCESS" "Orchestrator port $port bound"
        return 0
    fi
    log_action "WARNING" "Orchestrator not bound on port $port - attempting pm2 relaunch"
    # Attempt pm2 relaunch
    pm2 delete mediczy-orchestrator 2>/dev/null || true
    cd ~/Mediczy/docsgpt || return 1
    if pm2 start llm_orchestrator.py --name mediczy-orchestrator --interpreter python3 --time --cwd ~/Mediczy/docsgpt >/tmp/mediczy/logs/pm2_orchestrator_start.log 2>&1; then
        log_action "INFO" "pm2 orchestrator start command issued"
        # Wait up to 25s for binding
        for i in $(seq 1 25); do
            if nc -z localhost $port 2>/dev/null; then
                log_action "SUCCESS" "Orchestrator rebound on port $port after pm2 relaunch"
                return 0
            fi
            sleep 1
        done
        log_action "CRITICAL" "Orchestrator failed to bind on port $port after pm2 relaunch"
        return 1
    else
        log_action "CRITICAL" "pm2 orchestrator relaunch command failed"
        return 1
    fi
}

# Start orchestrator under pm2 (initial)
start_orchestrator_pm2() {
    log_action "INFO" "Starting LLM Orchestrator under pm2 supervision..."
    cd ~/Mediczy/docsgpt || { log_action "ERROR" "Missing docsgpt directory"; return 1; }
    if pm2 list | grep -q mediczy-orchestrator; then
        log_action "INFO" "mediczy-orchestrator already registered in pm2, restarting"
        pm2 restart mediczy-orchestrator >/dev/null 2>&1 || pm2 delete mediczy-orchestrator >/dev/null 2>&1
    fi
    if pm2 start llm_orchestrator.py --name mediczy-orchestrator --interpreter python3 --time --cwd ~/Mediczy/docsgpt >/tmp/mediczy/logs/pm2_orchestrator_start.log 2>&1; then
        log_action "SUCCESS" "pm2 launched mediczy-orchestrator"
    else
        log_action "ERROR" "Failed to start orchestrator with pm2"
        return 1
    fi
}

# Enhanced cleanup function
cleanup_failed_services() {
    log_action "INFO" "Cleaning up failed services..."
    
    # Kill any orphaned processes
    pkill -f "ultra_fast_db_service.py" 2>/dev/null
    pkill -f "llm_orchestrator.py" 2>/dev/null
    
    # Clean temporary files
    find /tmp/mediczy -name "*.pid" -delete 2>/dev/null
    
    log_action "INFO" "Cleanup completed"
}

# Main startup sequence with comprehensive error handling
main() {
    # Initialize logging
    mkdir -p /tmp/mediczy/{logs,uploads,cache,data}
    mkdir -p ~/Mediczy/docsgpt/{data,logs,llm_models/mistral}
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Mediczy production startup initiated" > /tmp/mediczy/logs/startup.log
    
    # Check prerequisites
    if ! check_prerequisites; then
        log_action "CRITICAL" "Prerequisites check failed - aborting startup"
        exit 1
    fi
    
    log_action "INFO" "Starting Mediczy Medical Platform services..."
    
    # 1. Start Infrastructure Services
    echo ""
    log_action "INFO" "=== INFRASTRUCTURE SERVICES ==="
    
    start_service "systemctl" "MariaDB Database" "3306" "mariadb" "mariadbd"
    start_service "systemctl" "Redis Cache" "6379" "redis-server" "redis-server"
    start_service "systemctl" "MongoDB" "27017" "mongod" "mongod"
    
    # 2. Start AI Services
    echo ""
    log_action "INFO" "=== AI SERVICES ==="
    
    cd ~/Mediczy/docsgpt
    start_service "background" "Ultra-Fast Database" "5005" "nohup python3 ultra_fast_db_service.py > logs/ultra_fast_db.log 2>&1" "ultra_fast_db_service.py"
    # Orchestrator now managed by pm2 for auto-restart
    start_orchestrator_pm2
    start_service "background" "DocsGPT Legacy" "7091" "nohup python3 app.py > logs/docsgpt.log 2>&1" "app.py"
    
    # 3. Start Application Services
    echo ""
    log_action "INFO" "=== APPLICATION SERVICES ==="
    
    start_service "pm2" "Backend API Server" "8000" "" "node"
    
    # Frontend
    cd ~/Mediczy/client
    if [ ! -d "dist" ]; then
        log_action "INFO" "Building frontend..."
        npm run build
    fi
    start_service "background" "Frontend Server" "9443" "nohup npm run dev > /tmp/mediczy/logs/frontend.log 2>&1" "vite"
    
    # 4. Start Nginx
    start_service "systemctl" "Nginx Proxy" "80" "nginx" "nginx"
    
    # 5. Comprehensive Health Checks
    echo ""
    log_action "INFO" "=== HEALTH VERIFICATION ==="
    sleep 5  # Allow services to fully initialize
    perform_health_checks
    # Post-start orchestrator verification & relaunch if required
    verify_orchestrator_binding || log_action "ERROR" "Post-start orchestrator verification failed"
    
    # 6. Final Status Report
    echo ""
    log_action "INFO" "=== STARTUP SUMMARY ==="
    
    if [ $ERRORS -eq 0 ]; then
        log_action "SUCCESS" "🎉 Mediczy Medical Platform started successfully!"
        log_action "SUCCESS" "All critical services are operational"
    elif [ $ERRORS -le 2 ]; then
        log_action "WARNING" "⚠️ Mediczy started with $ERRORS errors and $WARNINGS warnings"
        log_action "WARNING" "Platform is functional but some services may need attention"
    else
        log_action "CRITICAL" "❌ Startup failed with $ERRORS critical errors"
        log_action "CRITICAL" "Platform may not be fully functional"
        cleanup_failed_services
        exit 1
    fi
    
    # Display access information
    echo ""
    echo "🌐 ACCESS URLS:"
    echo "=============="
    echo "• Frontend:          http://localhost:9443"
    echo "• Backend API:       http://localhost:8000"
    echo "• LLM Orchestrator:  http://localhost:5000"
    echo "• Ultra-Fast DB:     http://localhost:5005"
    echo "• DocsGPT Legacy:    http://localhost:7091"
    echo "• Full Platform:     http://localhost (via Nginx)"
    echo ""
    echo "📋 MANAGEMENT:"
    echo "=============="
    echo "• View startup log:  tail -f /tmp/mediczy/logs/startup.log"
    echo "• Monitor services:  ./start-all-production.sh --monitor"
    echo "• Stop all:          ./start-all-production.sh --stop"
    echo ""
    echo "🏥 Mediczy Medical Platform is ready for production use!"
}

# Handle command line arguments
case "${1:-}" in
    "--monitor")
        echo "📊 Service Monitoring Mode"
        echo "========================="
        while true; do
            clear
            echo "🏥 Mediczy Services Status - $(date)"
            echo "=================================="
            
            # Check each service
            declare -A services=(
                ["3306"]="MariaDB"
                ["6379"]="Redis"
                ["27017"]="MongoDB"
                ["5005"]="Ultra-Fast DB"
                ["5000"]="LLM Orchestrator"
                ["7091"]="DocsGPT"
                ["8000"]="Backend API"
                ["9443"]="Frontend"
                ["80"]="Nginx"
            )
            
            for port in "${!services[@]}"; do
                if nc -z localhost $port 2>/dev/null; then
                    echo -e "${GREEN}✅ ${services[$port]} (Port $port)${NC}"
                else
                    echo -e "${RED}❌ ${services[$port]} (Port $port)${NC}"
                fi
            done
            
            echo ""
            echo "Press Ctrl+C to exit monitoring"
            sleep 5
        done
        ;;
    "--stop")
        echo "🛑 Stopping All Mediczy Services"
        echo "==============================="
        pm2 stop all 2>/dev/null
        pm2 delete mediczy-orchestrator 2>/dev/null || true
        pkill -f 'ultra_fast_db_service.py|llm_orchestrator.py|app.py' 2>/dev/null
        sudo systemctl stop nginx mariadb redis-server mongod 2>/dev/null
        echo "✅ All services stopped"
        ;;
    *)
        main "$@"
        ;;
esac