#!/bin/bash
# Start Mediczy Server with Nodemon for Development
# Auto-reloads on file changes

set -e

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                                                                   ║"
echo "║         MEDICZY DEVELOPMENT SERVER (with Nodemon)                 ║"
echo "║                                                                   ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# Load environment variables
if [ -f "server/.env" ]; then
    echo "✓ Loading development environment..."
    export $(grep -v '^#' server/.env | xargs)
fi

# Ensure logs directory exists
mkdir -p logs

echo ""
echo "Starting server with nodemon (auto-reload enabled)..."
echo ""
echo "📝 Configuration:"
echo "   - Watch: ./ (excluding node_modules, logs)"
echo "   - Extensions: .js, .json, .env"
echo "   - Restart delay: 1000ms"
echo "   - Type 'rs' to manually restart"
echo ""

cd server

# Start with nodemon
npm run dev

# Alternative: Direct nodemon command
# npx nodemon --config nodemon.json index.js
