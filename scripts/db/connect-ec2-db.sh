#!/bin/bash
# SSH Tunnel to EC2 PostgreSQL Database
# This creates a secure tunnel: localhost:5433 -> EC2:5432

EC2_HOST="13.234.17.52"
EC2_USER="ubuntu"
SSH_KEY="/workspaces/Mediczy/.venv/bin/mediqzy.pem"
LOCAL_PORT=5433
REMOTE_PORT=5432

echo "🔐 Setting up SSH tunnel to EC2 PostgreSQL..."

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "❌ SSH key not found at $SSH_KEY"
    echo ""
    echo "SSH key should be at: /workspaces/Mediczy/.venv/bin/mediqzy.pem"
    echo "If missing, please ensure the PEM file is uploaded to this location."
    echo "Run: chmod 600 /workspaces/Mediczy/.venv/bin/mediqzy.pem"
    exit 1
fi

# Set correct permissions
chmod 600 "$SSH_KEY"

echo "📡 Creating tunnel: localhost:$LOCAL_PORT -> $EC2_HOST:$REMOTE_PORT"
echo "⚠️  Keep this terminal open while using the database"
echo "💡 In another terminal, connect using: psql -h localhost -p $LOCAL_PORT -U mediczy -d mediczy"
echo ""

# Create SSH tunnel (runs in foreground)
ssh -N -L ${LOCAL_PORT}:localhost:${REMOTE_PORT} \
    -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    ${EC2_USER}@${EC2_HOST}
