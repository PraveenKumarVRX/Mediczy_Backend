#!/bin/bash

# n8n Deployment Script for Mediczy
# Quick start: Deploy n8n in 30 minutes

set -e

echo "🚀 Deploying n8n for Mediczy..."
echo ""

# Step 1: Check prerequisites
echo "📋 Step 1: Checking prerequisites..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

echo "✅ Docker and docker-compose are installed"
echo ""

# Step 2: Create directories
echo "📁 Step 2: Creating directories..."
mkdir -p workflows
mkdir -p backups
echo "✅ Directories created"
echo ""

# Step 3: Start n8n
echo "🐳 Step 3: Starting n8n containers..."
docker-compose down 2>/dev/null || true
docker-compose up -d

echo ""
echo "⏳ Waiting for n8n to be ready..."
sleep 10

# Step 4: Health check
echo "🏥 Step 4: Running health checks..."
MAX_RETRIES=12
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
        echo "✅ n8n is healthy and ready!"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Attempt $RETRY_COUNT/$MAX_RETRIES..."
    sleep 5
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ n8n failed to start properly"
    echo "📋 Checking logs..."
    docker-compose logs n8n
    exit 1
fi

echo ""

# Step 5: Display status
echo "📊 Step 5: Container status..."
docker-compose ps
echo ""

# Step 6: Display access information
echo "✅ n8n deployment complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 ACCESS INFORMATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 n8n UI:        http://localhost:5678"
echo "🌐 Public URL:    http://13.234.17.52:5678"
echo ""
echo "👤 Username:      admin"
echo "🔑 Password:      MediczyN8N2025!"
echo ""
echo "📡 Webhook URL:   http://localhost:5678/webhook/"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 7: Test webhook
echo "🧪 Step 7: Testing webhook endpoint..."
sleep 2

TEST_RESPONSE=$(curl -s -X POST http://localhost:5678/webhook/test \
  -H "Content-Type: application/json" \
  -d '{
    "test": true,
    "message": "n8n deployment test"
  }' || echo "failed")

if [ "$TEST_RESPONSE" != "failed" ]; then
    echo "✅ Webhook endpoint is accessible"
else
    echo "⚠️  Webhook test failed (this is OK if no workflow is created yet)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 NEXT STEPS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Open n8n UI in browser: http://13.234.17.52:5678"
echo "2. Login with credentials above"
echo "3. Import example workflow from: workflows/example-appointment-reminder.json"
echo "4. Configure external integrations (Twilio, SendGrid, WhatsApp)"
echo "5. Test workflows with Mediczy integration"
echo ""
echo "📖 Documentation: ./README.md"
echo "🔧 Management:    docker-compose [up|down|restart|logs]"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 n8n is ready! Start building workflows!"
