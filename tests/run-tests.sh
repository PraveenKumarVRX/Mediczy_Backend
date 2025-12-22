#!/bin/bash

###############################################################################
# Mediczy Automated Test Runner
# Runs comprehensive admin login and functionality tests
###############################################################################

set -e

echo "🧪 Mediczy Automated Testing Suite"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the tests directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must run from tests/ directory${NC}"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    npx playwright install
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found. Using .env.example${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}📝 Please edit .env with your test credentials${NC}"
    fi
fi

# Parse command line arguments
TEST_TYPE=${1:-all}
BROWSER=${2:-chromium}

echo ""
echo "Test Configuration:"
echo "  Test Type: $TEST_TYPE"
echo "  Browser: $BROWSER"
echo ""

# Run tests based on type
case $TEST_TYPE in
    "admin-login")
        echo -e "${GREEN}🔐 Running Admin Login Tests...${NC}"
        npx playwright test admin-login.spec.ts --project=$BROWSER
        ;;
    
    "admin-features")
        echo -e "${GREEN}⚙️  Running Admin Functionality Tests...${NC}"
        npx playwright test admin-functionality.spec.ts --project=$BROWSER
        ;;
    
    "all")
        echo -e "${GREEN}🚀 Running All Admin Tests...${NC}"
        npx playwright test --project=$BROWSER
        ;;
    
    "debug")
        echo -e "${GREEN}🐛 Running Tests in Debug Mode...${NC}"
        npx playwright test --debug
        ;;
    
    "ui")
        echo -e "${GREEN}🖥️  Opening Playwright UI...${NC}"
        npx playwright test --ui
        ;;
    
    "headed")
        echo -e "${GREEN}👁️  Running Tests with Browser UI...${NC}"
        npx playwright test --headed --project=$BROWSER
        ;;
    
    *)
        echo -e "${RED}❌ Unknown test type: $TEST_TYPE${NC}"
        echo ""
        echo "Usage: $0 [test-type] [browser]"
        echo ""
        echo "Test Types:"
        echo "  admin-login    - Run admin login tests only"
        echo "  admin-features - Run admin functionality tests"
        echo "  all           - Run all tests (default)"
        echo "  debug         - Run in debug mode"
        echo "  ui            - Open Playwright UI"
        echo "  headed        - Run with browser UI visible"
        echo ""
        echo "Browsers:"
        echo "  chromium (default)"
        echo "  firefox"
        echo "  webkit"
        echo ""
        echo "Examples:"
        echo "  $0                          # Run all tests in chromium"
        echo "  $0 admin-login firefox     # Run login tests in firefox"
        echo "  $0 debug                   # Run in debug mode"
        exit 1
        ;;
esac

# Check test results
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "📊 View detailed report:"
    echo "  npm run test:report"
    echo ""
    exit 0
else
    echo ""
    echo -e "${RED}❌ Some tests failed!${NC}"
    echo ""
    echo "📊 View detailed report:"
    echo "  npm run test:report"
    echo ""
    exit 1
fi
