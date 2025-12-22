#!/bin/bash

###############################################################################
# Quick Test Runner - Fast Smoke Tests
# Runs critical tests only for rapid feedback
###############################################################################

set -e

echo "🚀 Mediczy Quick Tests"
echo "======================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd /home/ubuntu/Mediczy/tests

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

echo -e "${GREEN}⚡ Running smoke tests (8 critical tests)...${NC}"
echo ""

# Run only smoke tests for speed
npx playwright test smoke.spec.ts --project=chromium

# Check results
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All smoke tests passed!${NC}"
    echo ""
    echo "Run full tests with: npm test"
    echo "Run all login tests: npm run test:all-logins"
    echo "Run admin tests: npm run test:admin"
    exit 0
else
    echo ""
    echo "❌ Some tests failed!"
    echo "View report: npm run test:report"
    exit 1
fi
