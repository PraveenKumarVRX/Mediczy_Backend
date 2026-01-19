#!/bin/bash
# Quick Nodemon Test
# Verifies nodemon is working and shows auto-reload in action

echo "🧪 Testing Nodemon Auto-Reload..."
echo ""
echo "Starting server with nodemon..."
echo "After server starts, edit a file to see auto-reload in action"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd /home/ubuntu/Mediczy/server
npm run dev
