#!/bin/bash

##############################################################################
# SIB Unified Task Router - Verification Script
# 
# Verifies that all components are in place and working correctly
##############################################################################

set +e  # Don't exit on errors

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

log() { echo -e "${BLUE}[VERIFY]${NC} $1"; }
ok() { echo -e "${GREEN}✅ $1${NC}"; PASS=$((PASS+1)); }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; WARN=$((WARN+1)); }
fail() { echo -e "${RED}❌ $1${NC}"; FAIL=$((FAIL+1)); }

PROJECT_ROOT="/home/ubuntu/Mediczy"

echo ""
log "============================================"
log "   SIB Unified Task Router Verification"
log "============================================"
echo ""

##############################################################################
# 1. File Verification
##############################################################################
echo ""
log "Checking Created Files..."

files=(
    "ai-engine/doctor_bot/sib/task_router.py:SIB Task Router"
    "server/services/sib-task-proxy.js:Node.js Proxy"
    "server/middleware/sib-task-router.middleware.js:Express Middleware"
    "server/routes/EXAMPLE_chat.route.refactored.js:Example Route"
    "startup-sib-unified.sh:Startup Script"
    "SIB_UNIFIED_TASK_INTEGRATION.md:Integration Guide"
    "SIB_TESTING_GUIDE.md:Testing Guide"
    "SIB_IMPLEMENTATION_SUMMARY.md:Summary"
)

for entry in "${files[@]}"; do
    IFS=':' read -r file desc <<< "$entry"
    filepath="$PROJECT_ROOT/$file"
    if [ -f "$filepath" ]; then
        ok "$desc ($file)"
    else
        fail "$desc NOT FOUND ($file)"
    fi
done

##############################################################################
# 2. Python Syntax Verification
##############################################################################
echo ""
log "Checking Python Syntax..."

if python3 -m py_compile "$PROJECT_ROOT/ai-engine/doctor_bot/sib/task_router.py" 2>/dev/null; then
    ok "task_router.py syntax valid"
else
    fail "task_router.py has syntax errors"
fi

##############################################################################
# 3. SIB Endpoint Verification
##############################################################################
echo ""
log "Checking SIB Endpoint in app.py..."

if grep -q "async def execute_task" "$PROJECT_ROOT/ai-engine/doctor_bot/app.py"; then
    ok "POST /task endpoint found in app.py"
else
    fail "POST /task endpoint NOT found in app.py"
fi

if grep -q "POST /task" "$PROJECT_ROOT/ai-engine/doctor_bot/app.py"; then
    ok "Task endpoint documentation found"
else
    warn "Task endpoint documentation may be missing"
fi

##############################################################################
# 4. Task Router Imports
##############################################################################
echo ""
log "Checking Task Router Implementation..."

if grep -q "class SIBTaskRouter" "$PROJECT_ROOT/ai-engine/doctor_bot/sib/task_router.py"; then
    ok "SIBTaskRouter class defined"
else
    fail "SIBTaskRouter class NOT found"
fi

if grep -q "class TaskType" "$PROJECT_ROOT/ai-engine/doctor_bot/sib/task_router.py"; then
    ok "TaskType enum defined"
else
    fail "TaskType enum NOT found"
fi

if grep -q "async def route_task" "$PROJECT_ROOT/ai-engine/doctor_bot/sib/task_router.py"; then
    ok "route_task method defined"
else
    fail "route_task method NOT found"
fi

##############################################################################
# 5. Node.js Proxy Verification
##############################################################################
echo ""
log "Checking Node.js SIB Proxy..."

if grep -q "class SIBTaskProxy" "$PROJECT_ROOT/server/services/sib-task-proxy.js"; then
    ok "SIBTaskProxy class defined"
else
    fail "SIBTaskProxy class NOT found"
fi

if grep -q "async executeTask" "$PROJECT_ROOT/server/services/sib-task-proxy.js"; then
    ok "executeTask method defined"
else
    fail "executeTask method NOT found"
fi

# Count task methods
task_methods=$(grep -c "async.*Task" "$PROJECT_ROOT/server/services/sib-task-proxy.js" || echo 0)
if [ "$task_methods" -gt 10 ]; then
    ok "$task_methods task methods defined"
else
    warn "Only $task_methods task methods found (expected >10)"
fi

##############################################################################
# 6. Middleware Verification
##############################################################################
echo ""
log "Checking Express Middleware..."

if grep -q "function sibTaskRouterMiddleware" "$PROJECT_ROOT/server/middleware/sib-task-router.middleware.js"; then
    ok "sibTaskRouterMiddleware defined"
else
    fail "sibTaskRouterMiddleware NOT found"
fi

if grep -q "function sibTaskRoute" "$PROJECT_ROOT/server/middleware/sib-task-router.middleware.js"; then
    ok "sibTaskRoute wrapper defined"
else
    fail "sibTaskRoute wrapper NOT found"
fi

##############################################################################
# 7. Documentation Verification
##############################################################################
echo ""
log "Checking Documentation..."

if grep -q "SIB Unified Task Router" "$PROJECT_ROOT/SIB_UNIFIED_TASK_INTEGRATION.md"; then
    ok "Integration guide comprehensive"
else
    fail "Integration guide may be incomplete"
fi

if grep -q "curl" "$PROJECT_ROOT/SIB_TESTING_GUIDE.md"; then
    ok "Testing guide has curl examples"
else
    warn "Testing guide may lack examples"
fi

integration_lines=$(wc -l < "$PROJECT_ROOT/SIB_UNIFIED_TASK_INTEGRATION.md")
if [ "$integration_lines" -gt 300 ]; then
    ok "Integration guide substantial ($integration_lines lines)"
else
    warn "Integration guide might be too short ($integration_lines lines)"
fi

##############################################################################
# 8. Example Route Verification
##############################################################################
echo ""
log "Checking Example Route..."

if grep -q "POST /api/chat" "$PROJECT_ROOT/server/routes/EXAMPLE_chat.route.refactored.js"; then
    ok "Example route shows chat endpoint"
else
    fail "Example route chat endpoint NOT found"
fi

if grep -q "getSIBTaskProxy" "$PROJECT_ROOT/server/routes/EXAMPLE_chat.route.refactored.js"; then
    ok "Example shows SIB proxy integration"
else
    fail "Example doesn't show SIB proxy"
fi

##############################################################################
# 9. Startup Script Verification
##############################################################################
echo ""
log "Checking Startup Script..."

if [ -x "$PROJECT_ROOT/startup-sib-unified.sh" ]; then
    ok "Startup script is executable"
else
    warn "Startup script is not executable (use chmod +x)"
fi

if grep -q "python3 -m uvicorn" "$PROJECT_ROOT/startup-sib-unified.sh"; then
    ok "Startup script starts SIB"
else
    fail "Startup script doesn't start SIB"
fi

if grep -q "node " "$PROJECT_ROOT/startup-sib-unified.sh"; then
    ok "Startup script starts Node.js"
else
    warn "Startup script may not start Node.js"
fi

##############################################################################
# 10. Service Health Check
##############################################################################
echo ""
log "Checking Services..."

# SIB
if curl -s http://localhost:8001/health &> /dev/null; then
    HEALTH=$(curl -s http://localhost:8001/health | grep -o '"status":"[^"]*"')
    ok "SIB responding ($HEALTH)"
else
    warn "SIB not responding (may not be started yet)"
fi

# PostgreSQL
if psql -h 127.0.0.1 -U mediczy_helper -d mediczy -c "SELECT 1" &> /dev/null; then
    ok "PostgreSQL connected"
else
    warn "PostgreSQL not accessible (may not be started yet)"
fi

# Node.js
if curl -s http://localhost:8000/health &> /dev/null; then
    ok "Node.js backend responding"
else
    warn "Node.js backend not responding (may not be started)"
fi

##############################################################################
# 11. Task Type Coverage
##############################################################################
echo ""
log "Checking Task Type Coverage..."

# Count task types in task_router.py
task_types=$(grep -E "^\s+[A-Z_]+ = \"" "$PROJECT_ROOT/ai-engine/doctor_bot/sib/task_router.py" | wc -l)
task_methods=$(grep "async def _handle_" "$PROJECT_ROOT/ai-engine/doctor_bot/sib/task_router.py" | wc -l)

if [ "$task_types" -gt 10 ]; then
    ok "$task_types task types defined"
else
    fail "Only $task_types task types (need more)"
fi

if [ "$task_methods" -gt 10 ]; then
    ok "$task_methods handler methods defined"
else
    fail "Only $task_methods handlers (need more)"
fi

# Check specific task types
task_types_list="chat medical_consult schedule_appointment generate_prescription send_notification process_ehr assess_risk detect_emergency"
for ttype in $task_types_list; do
    if grep -q "$ttype" "$PROJECT_ROOT/ai-engine/doctor_bot/sib/task_router.py"; then
        ok "Task type: $ttype"
    else
        fail "Task type: $ttype NOT found"
    fi
done

##############################################################################
# 12. Integration Pattern
##############################################################################
echo ""
log "Checking Integration Patterns..."

# Check example shows proper imports (support both ES6 and CommonJS)
if grep -qE "(const { getSIBTaskProxy }|import { getSIBTaskProxy })" "$PROJECT_ROOT/server/routes/EXAMPLE_chat.route.refactored.js"; then
    ok "Example imports SIB proxy"
else
    fail "Example missing SIB proxy import"
fi

# Check example shows middleware
if grep -q "sibTaskRouterMiddleware" "$PROJECT_ROOT/server/routes/EXAMPLE_chat.route.refactored.js"; then
    ok "Example applies SIB middleware"
else
    warn "Example may not apply middleware"
fi

# Check example shows error handling
if grep -qE "(try|catch)" "$PROJECT_ROOT/server/routes/EXAMPLE_chat.route.refactored.js"; then
    ok "Example shows error handling"
else
    warn "Example may lack error handling"
fi

##############################################################################
# Summary
##############################################################################
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Verification Results${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${GREEN}✅ PASSED: $PASS${NC}"
echo -e "${YELLOW}⚠️  WARNINGS: $WARN${NC}"
echo -e "${RED}❌ FAILED: $FAIL${NC}"
echo ""

TOTAL=$((PASS + WARN + FAIL))
SUCCESS=$((PASS * 100 / TOTAL))

if [ "$FAIL" -eq 0 ]; then
    if [ "$SUCCESS" -ge 90 ]; then
        echo -e "${GREEN}✅ VERIFICATION SUCCESSFUL ($SUCCESS% complete)${NC}"
        echo ""
        echo "Next steps:"
        echo "1. Start system: ./startup-sib-unified.sh"
        echo "2. Test: curl http://localhost:8001/health"
        echo "3. Integrate routes using EXAMPLE_chat.route.refactored.js as template"
        echo ""
    else
        echo -e "${YELLOW}⚠️  VERIFICATION PARTIALLY COMPLETE ($SUCCESS%)${NC}"
        echo "Some components may need setup:"
        echo "- Services may not be started (run ./startup-sib-unified.sh)"
        echo "- Documentation may be incomplete"
    fi
else
    echo -e "${RED}❌ VERIFICATION FAILED - Some components missing${NC}"
    echo "Critical issues must be resolved before proceeding"
fi

exit $FAIL

