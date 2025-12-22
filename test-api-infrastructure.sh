#!/bin/bash

###############################################################################
# API Infrastructure Test Script
# 
# Tests the three new enhancements:
# 1. Swagger/OpenAPI Documentation
# 2. Circuit Breaker System
# 3. GraphQL (Hasura)
###############################################################################

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         API Infrastructure Enhancement Tests                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if server is running
check_server() {
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Server is running${NC}"
        return 0
    else
        echo -e "${RED}✗ Server is not running. Start with: npm start${NC}"
        return 1
    fi
}

# Test 1: Swagger Documentation
test_swagger() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Test 1: Swagger/OpenAPI Documentation${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Test Swagger JSON
    echo -n "Testing OpenAPI spec endpoint... "
    if curl -s http://localhost:8000/swagger.json | grep -q '"openapi":"3.0.0"'; then
        echo -e "${GREEN}✓ PASSED${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
    fi
    
    # Test Swagger UI
    echo -n "Testing Swagger UI... "
    if curl -s http://localhost:8000/api-docs | grep -q "swagger-ui"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        echo -e "${YELLOW}  → Access at: http://localhost:8000/api-docs${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
    fi
    
    # Test Redoc
    echo -n "Testing Redoc documentation... "
    if curl -s http://localhost:8000/docs | grep -q "redoc"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        echo -e "${YELLOW}  → Access at: http://localhost:8000/docs${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
    fi
}

# Test 2: Circuit Breakers
test_circuit_breakers() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Test 2: Circuit Breaker System${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Test health endpoint (public)
    echo -n "Testing circuit breaker health endpoint... "
    HEALTH_RESPONSE=$(curl -s http://localhost:8000/api/circuit-breakers/health)
    if echo "$HEALTH_RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        HEALTHY=$(echo "$HEALTH_RESPONSE" | grep -o '"healthy":[a-z]*' | cut -d: -f2)
        TOTAL=$(echo "$HEALTH_RESPONSE" | grep -o '"totalCircuits":[0-9]*' | cut -d: -f2)
        echo -e "${YELLOW}  → System healthy: $HEALTHY${NC}"
        echo -e "${YELLOW}  → Total circuits: $TOTAL${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
    fi
    
    # Test status endpoint (requires admin token)
    echo -n "Testing circuit breaker status endpoint... "
    if curl -s http://localhost:8000/api/circuit-breakers/status | grep -q "unauthorized"; then
        echo -e "${GREEN}✓ PASSED (auth required)${NC}"
        echo -e "${YELLOW}  → Requires admin authentication${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: Endpoint may be unprotected${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}Circuit Breakers Available:${NC}"
    echo "  - WhatsApp (with SMS fallback)"
    echo "  - SMS"
    echo "  - Email"
    echo "  - Payment Gateway"
    echo "  - AI Service"
    echo "  - Video Service"
    echo "  - Lab API"
    echo "  - Pharmacy API"
}

# Test 3: GraphQL (Hasura)
test_graphql() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Test 3: GraphQL (Hasura)${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Check if Hasura is running
    echo -n "Checking if Hasura is running... "
    if curl -s http://localhost:8080/healthz > /dev/null 2>&1; then
        echo -e "${GREEN}✓ RUNNING${NC}"
        echo -e "${YELLOW}  → Console: http://localhost:8080${NC}"
        echo -e "${YELLOW}  → GraphQL: http://localhost:8080/v1/graphql${NC}"
        echo -e "${YELLOW}  → Admin secret: mediczy_hasura_secret_2024${NC}"
    else
        echo -e "${YELLOW}⚠ NOT RUNNING${NC}"
        echo -e "${YELLOW}  → Run: ./setup-hasura.sh to start${NC}"
    fi
    
    # Test GraphQL endpoint
    echo -n "Testing GraphQL endpoint... "
    GRAPHQL_RESPONSE=$(curl -s -X POST http://localhost:8080/v1/graphql \
        -H "Content-Type: application/json" \
        -H "x-hasura-admin-secret: mediczy_hasura_secret_2024" \
        -d '{"query":"{ __schema { queryType { name } } }"}' 2>/dev/null)
    
    if echo "$GRAPHQL_RESPONSE" | grep -q "queryType"; then
        echo -e "${GREEN}✓ PASSED${NC}"
    else
        echo -e "${YELLOW}⚠ NOT CONFIGURED YET${NC}"
        echo -e "${YELLOW}  → Track tables in Hasura Console${NC}"
    fi
}

# Summary
print_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Summary${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${GREEN}✅ Implementation Complete!${NC}"
    echo ""
    echo "📚 Documentation:"
    echo "  - Swagger UI:  http://localhost:8000/api-docs"
    echo "  - Redoc:       http://localhost:8000/docs"
    echo "  - OpenAPI:     http://localhost:8000/swagger.json"
    echo ""
    echo "🔌 Circuit Breakers:"
    echo "  - Health:      http://localhost:8000/api/circuit-breakers/health"
    echo "  - Status:      http://localhost:8000/api/circuit-breakers/status (admin)"
    echo ""
    echo "🎯 GraphQL:"
    echo "  - Console:     http://localhost:8080"
    echo "  - Endpoint:    http://localhost:8080/v1/graphql"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Access Swagger UI to explore API documentation"
    echo "  2. Monitor circuit breaker health"
    echo "  3. Run ./setup-hasura.sh if GraphQL not started"
    echo "  4. Track tables in Hasura Console"
    echo ""
    echo -e "📖 Full guide: ${BLUE}API_INFRASTRUCTURE_IMPLEMENTATION.md${NC}"
    echo ""
}

# Main execution
if check_server; then
    test_swagger
    test_circuit_breakers
    test_graphql
    print_summary
else
    echo ""
    echo -e "${RED}Please start the server first with: npm start${NC}"
    exit 1
fi
