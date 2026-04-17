#!/bin/bash

# Production Build and Deployment Script for mediqzy.com
# This script builds the React app and deploys it to nginx web root

set -e  # Exit on any error

echo "🚀 Building Mediczy for Production (mediqzy.com)..."
echo "================================================"

# Define paths
PROJECT_ROOT="/home/ubuntu/Mediczy"
CLIENT_DIR="$PROJECT_ROOT/client"
WEB_ROOT="/var/www/mediczy"
NGINX_SITE="/etc/nginx/sites-available/mediczy"

# PM2 should run under the regular deploy user, not root
PM2_USER="${SUDO_USER:-$USER}"
PM2_PREFIX=""
if [ "$(id -u)" -eq 0 ]; then
    PM2_PREFIX="sudo -u $PM2_USER"
fi

# Step 1: Build the React application
echo "📦 Building React application..."
cd "$CLIENT_DIR"

# Clean previous builds
rm -rf dist/

# Build for production
npm run build

# Verify build was successful
if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist directory not found"
    exit 1
fi

echo "✅ React build completed successfully"

# Step 2: Deploy to nginx web root
echo "🌐 Deploying to web root..."

# Backup current deployment (if exists)
if [ -d "$WEB_ROOT" ]; then
    echo "📋 Creating backup of current deployment..."
    sudo cp -r "$WEB_ROOT" "/var/www/mediczy-backup-$(date +%Y%m%d-%H%M%S)"
fi

# Copy new build to web root
echo "📁 Copying files to web root..."
sudo rm -rf "$WEB_ROOT"/*
sudo cp -r dist/* "$WEB_ROOT/"

# Set proper ownership and permissions
sudo chown -R www-data:www-data "$WEB_ROOT"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} \;
sudo find "$WEB_ROOT" -type f -exec chmod 644 {} \;

echo "✅ Deployment completed successfully"

# Step 3: Enable nginx site and reload
echo "⚙️  Configuring nginx..."

# Remove legacy symlink name if it exists
if [ -L /etc/nginx/sites-enabled/mayden ]; then
    sudo rm -f /etc/nginx/sites-enabled/mayden
fi

# Enable the site
sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/mediczy

# Test nginx configuration
if sudo nginx -t; then
    echo "✅ Nginx configuration is valid"
    
    # Reload nginx
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded successfully"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

# Step 4: Start/restart backend server
echo "🔧 Managing backend server..."

if command -v pm2 &> /dev/null; then
    if $PM2_PREFIX pm2 describe mediczy-server &> /dev/null; then
        $PM2_PREFIX pm2 reload mediczy-server
        echo "✅ Backend server reloaded via PM2"
    else
        cd "$PROJECT_ROOT/server"
        $PM2_PREFIX pm2 start ecosystem.config.cjs
        echo "✅ Backend server started via PM2"
    fi
else
    # Fallback: kill and restart directly
    pkill -f "node.*index.js" || true
    sleep 2
    cd "$PROJECT_ROOT/server"
    nohup node index.js > /var/log/mediczy-backend.log 2>&1 &
    echo "✅ Backend server started"
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo "================================================"
echo "🌐 Website: https://app.mediqzy.com"
echo "🔗 Admin:   https://app.mediqzy.com/admin/login"
echo "👥 Team:    https://app.mediqzy.com/team/login"
echo "📊 API:     https://app.mediqzy.com/api"
echo ""
echo "📝 Next steps:"
echo "   1. Configure Cloudflare DNS for mediqzy.com:"
echo "      - Add A record: mediqzy.com → YOUR_SERVER_IP"
echo "      - Add A record: www.mediqzy.com → YOUR_SERVER_IP"
echo "      - Enable Cloudflare proxy (orange cloud) for SSL"
echo "   2. In Cloudflare dashboard:"
echo "      - SSL/TLS → Full (strict) mode"
echo "      - Speed → Enable Auto Minify (HTML, CSS, JS)"
echo "      - Caching → Browser Cache TTL: 1 year"
echo "   3. Test all functionality on https://app.mediqzy.com"
echo ""
echo "📋 Log files:"
echo "   - Backend: pm2 logs mediczy-server  (or tail -f /var/log/mediczy-backend.log if not using PM2)"
echo "   - Nginx:   tail -f /var/log/nginx/error.log"