#!/bin/bash

# n8n PM2 Deployment Script for Mediczy
# Installs and configures n8n to run with PM2

set -e

echo "🚀 Deploying n8n with PM2 for Mediczy..."
echo ""

# Step 1: Check prerequisites
echo "📋 Step 1: Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Installing PM2..."
    npm install -g pm2
fi

echo "✅ Prerequisites are installed"
echo ""

# Step 2: Install n8n globally
echo "📦 Step 2: Installing n8n..."
if ! command -v n8n &> /dev/null; then
    echo "Installing n8n globally (requires sudo)..."
    sudo npm install -g n8n
    echo "✅ n8n installed successfully"
else
    echo "✅ n8n is already installed"
    n8n --version
fi

echo ""

# Step 3: Create n8n directory and config
echo "📁 Step 3: Creating directories and config..."
mkdir -p ~/.n8n/workflows
mkdir -p ~/Mediczy/n8n-setup/workflows
mkdir -p ~/Mediczy/n8n-setup/backups

# Copy example workflow
if [ -f ~/Mediczy/n8n-setup/workflows/example-appointment-reminder.json ]; then
    cp ~/Mediczy/n8n-setup/workflows/example-appointment-reminder.json ~/.n8n/workflows/ 2>/dev/null || true
fi

echo "✅ Directories created"
echo ""

# Step 4: Create n8n environment file
echo "⚙️  Step 4: Creating n8n configuration..."

cat > ~/.n8n/.env << 'EOF'
# n8n Configuration for Mediczy
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=MediczyN8N2025!
N8N_HOST=localhost
N8N_PROTOCOL=http
N8N_PORT=5678
WEBHOOK_URL=http://localhost:5678
GENERIC_TIMEZONE=Asia/Kolkata
N8N_LOG_LEVEL=info
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true
N8N_METRICS=true

# Core PostgreSQL Database Connection
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=localhost
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=mediczy_ai
DB_POSTGRESDB_USER=mediczy_helper
DB_POSTGRESDB_PASSWORD=Mediczy2024Helper
DB_POSTGRESDB_SCHEMA=n8n

# Mediczy API
MEDICZY_API_URL=http://localhost:8000/api
MEDICZY_WEBHOOK_SECRET=mediczy_n8n_webhook_2025
EOF

echo "✅ Configuration created"
echo ""

# Step 4b: Create n8n schema in PostgreSQL
echo "🗄️  Step 4b: Creating n8n schema in PostgreSQL..."
PGPASSWORD=Mediczy2024Helper psql -h localhost -U mediczy_helper -d mediczy_ai -c "CREATE SCHEMA IF NOT EXISTS n8n; GRANT ALL ON SCHEMA n8n TO mediczy_helper;" 2>/dev/null || echo "⚠️  Could not create schema (may already exist)"
echo ""

# Step 5: PM2 config is already in n8n.ecosystem.config.js
echo "📝 Step 5: Using PM2 configuration from n8n.ecosystem.config.js..."

echo "✅ PM2 configuration ready"
echo ""

# Step 6: Create logs directory
mkdir -p ~/.n8n/logs

# Step 7: Stop any existing n8n instance
echo "🛑 Step 7: Stopping any existing n8n instances..."
pm2 stop mediczy-n8n 2>/dev/null || true
pm2 delete mediczy-n8n 2>/dev/null || true
echo ""

# Step 8: Start n8n with PM2
echo "🚀 Step 8: Starting n8n with PM2..."
cd ~/Mediczy/n8n-setup
pm2 start n8n.ecosystem.config.js

echo ""
echo "⏳ Waiting for n8n to start..."
sleep 5

# Step 9: Save PM2 configuration
echo "💾 Step 9: Saving PM2 configuration..."
pm2 save
echo ""

# Step 10: Health check
echo "🏥 Step 10: Running health check..."
MAX_RETRIES=12
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
        echo "✅ n8n is healthy and ready!"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Attempt $RETRY_COUNT/$MAX_RETRIES..."
    sleep 3
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ n8n failed to start properly"
    echo "📋 Checking logs..."
    pm2 logs mediczy-n8n --lines 50 --nostream
    exit 1
fi

echo ""

# Step 11: Display status
echo "📊 Step 11: PM2 status..."
pm2 list
echo ""

# Step 12: Display access information
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

# Step 13: Test webhook
echo "🧪 Step 13: Testing webhook endpoint..."
sleep 2

TEST_RESPONSE=$(curl -s -X POST http://localhost:5678/webhook/test \
  -H "Content-Type: application/json" \
  -d '{
    "test": true,
    "message": "n8n deployment test"
  }' 2>&1 || echo "no_workflow")

if [ "$TEST_RESPONSE" != "no_workflow" ]; then
    echo "✅ Webhook endpoint is accessible"
else
    echo "⚠️  Webhook test skipped (create workflow first)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 NEXT STEPS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Open n8n UI in browser: http://13.234.17.52:5678"
echo "2. Login with credentials above"
echo "3. Create your first workflow"
echo "4. Configure external integrations (Twilio, SendGrid, WhatsApp)"
echo "5. Test workflows with Mediczy integration"
echo ""
echo "🔧 Management Commands:"
echo "   pm2 list                    # View all processes"
echo "   pm2 logs mediczy-n8n        # View n8n logs"
echo "   pm2 restart mediczy-n8n     # Restart n8n"
echo "   pm2 stop mediczy-n8n        # Stop n8n"
echo "   pm2 start mediczy-n8n       # Start n8n"
echo ""
echo "📖 Documentation: ~/Mediczy/n8n-setup/README.md"
echo "📋 Roadmap: ~/Mediczy/N8N_IMPLEMENTATION_ROADMAP.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 n8n is ready! Start building workflows!"
