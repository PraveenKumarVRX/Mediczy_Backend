#!/bin/bash

# Create default nginx configuration with fallback SSL for mediczy.in
# This replaces the default.conf temporarily for initial SSL setup

cat > /root/Mediczy/docker/nginx/default-fallback.conf << 'EOF'
server {
    listen 80;
    server_name localhost 192.168.1.72 mediczy.in www.mediczy.in;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect HTTP to HTTPS (except for ACME challenge)
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name localhost 192.168.1.72 mediczy.in www.mediczy.in;

    # SSL Configuration - Self-signed fallback for initial setup
    ssl_certificate /etc/nginx/ssl/nginx-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # API routes to backend
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://mediczy-app:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Frontend application - serve static files directly
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
EOF

echo "✅ Fallback nginx configuration created"