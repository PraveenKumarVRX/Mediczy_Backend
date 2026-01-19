#!/bin/bash

echo "🚀 Production Setup - Nginx Reverse Proxy Configuration"
echo "=========================================================="
echo ""

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing nginx..."
    sudo apt-get update
    sudo apt-get install -y nginx
else
    echo "✓ Nginx already installed"
fi

# Create nginx configuration for Mediczy
echo "📝 Creating nginx configuration..."

sudo tee /etc/nginx/sites-available/mediczy > /dev/null <<'EOF'
# Mediczy Frontend - Reverse Proxy Configuration
# This proxies HTTPS (443) to the Vite dev server (9443)

upstream mediczy_frontend {
    server 127.0.0.1:9443;
}

upstream mediczy_backend {
    server 127.0.0.1:8000;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name _;
    
    return 301 https://$host$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;

    # SSL Configuration (self-signed for now)
    ssl_certificate /etc/nginx/ssl/mediczy.crt;
    ssl_certificate_key /etc/nginx/ssl/mediczy.key;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Max upload size
    client_max_body_size 10M;

    # Proxy to Frontend (Vite on 9443)
    location / {
        proxy_pass http://mediczy_frontend;
        proxy_http_version 1.1;
        
        # WebSocket support for HMR
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Proxy to Backend API (Express on 8000)
    location /api {
        proxy_pass http://mediczy_backend;
        proxy_http_version 1.1;
        
        # WebSocket support for Socket.io
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket endpoint for Socket.io
    location /socket.io {
        proxy_pass http://mediczy_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

echo "✓ Nginx configuration created"

# Create SSL directory
echo "🔐 Setting up SSL certificates..."
sudo mkdir -p /etc/nginx/ssl

# Generate self-signed certificate (for development/staging)
if [ ! -f /etc/nginx/ssl/mediczy.crt ]; then
    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/mediczy.key \
        -out /etc/nginx/ssl/mediczy.crt \
        -subj "/C=IN/ST=Maharashtra/L=Mumbai/O=Mediczy/CN=mediczy.com" \
        2>/dev/null
    echo "✓ Self-signed SSL certificate generated"
else
    echo "✓ SSL certificate already exists"
fi

# Enable the site
echo "🔗 Enabling site..."
sudo ln -sf /etc/nginx/sites-available/mediczy /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
if sudo nginx -t 2>&1; then
    echo "✓ Nginx configuration is valid"
    
    # Reload nginx
    echo "🔄 Reloading nginx..."
    sudo systemctl reload nginx
    sudo systemctl enable nginx
    echo "✓ Nginx reloaded and enabled"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

echo ""
echo "=========================================================="
echo "✅ Production Setup Complete!"
echo "=========================================================="
echo ""
echo "📊 Service Configuration:"
echo "  • Nginx:             Port 80 (redirect) & 443 (HTTPS)"
echo "  • Frontend (Vite):   Port 9443 (proxied from 443)"
echo "  • Backend (Express): Port 8000 (proxied from 443/api)"
echo ""
echo "🌐 Access URLs:"
echo "  • Production:  https://192.168.1.72"
echo "  • HTTP:        http://192.168.1.72 (redirects to HTTPS)"
echo "  • Admin:       https://192.168.1.72/admin"
echo "  • API:         https://192.168.1.72/api"
echo ""
echo "📝 Next Steps:"
echo "  1. Start your services:"
echo "     cd /root/Mediczy && ./restart-all-production.sh"
echo ""
echo "  2. For production, replace self-signed certificate with:"
echo "     - Let's Encrypt (free): certbot --nginx -d yourdomain.com"
echo "     - Or commercial SSL certificate"
echo ""
echo "  3. Update DNS to point to this server IP"
echo ""
echo "🔍 Check Status:"
echo "  • Nginx:    sudo systemctl status nginx"
echo "  • Frontend: curl http://localhost:9443"
echo "  • Backend:  curl http://localhost:8000/health"
echo "  • HTTPS:    curl -k https://localhost"
echo ""
