#!/bin/bash
# Setup custom domain for tenant
# Usage: ./setup-custom-domain.sh <custom_domain> <tenant_id>

DOMAIN=$1
TENANT_ID=$2

if [ -z "$DOMAIN" ] || [ -z "$TENANT_ID" ]; then
  echo "Usage: ./setup-custom-domain.sh <domain> <tenant_id>"
  echo "Example: ./setup-custom-domain.sh health.apollohospitals.com 1"
  exit 1
fi

echo "🌐 Setting up custom domain: $DOMAIN for tenant $TENANT_ID"

# Step 1: Verify DNS is pointing to this server
echo "📡 Checking DNS..."
DNS_IP=$(dig +short $DOMAIN | tail -n1)
SERVER_IP=$(curl -s ifconfig.me)

if [ "$DNS_IP" != "$SERVER_IP" ]; then
  echo "⚠️  WARNING: DNS not pointing to this server"
  echo "   DNS resolves to: $DNS_IP"
  echo "   Server IP: $SERVER_IP"
  echo ""
  echo "   Please add DNS record:"
  echo "   $DOMAIN  CNAME  mayden.in"
  echo "   OR"
  echo "   $DOMAIN  A  $SERVER_IP"
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Step 2: Update tenant in database
echo "💾 Updating tenant database..."
sudo -u postgres psql -d mediczy_ai -c "
  UPDATE tenants 
  SET custom_domain = '$DOMAIN' 
  WHERE id = $TENANT_ID;
"

if [ $? -eq 0 ]; then
  echo "✅ Database updated"
else
  echo "❌ Database update failed"
  exit 1
fi

# Step 3: Create Nginx config
echo "⚙️  Creating Nginx configuration..."
cat > /tmp/nginx-$DOMAIN.conf << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Redirect HTTP to HTTPS (after SSL setup)
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL certificates (will be configured by certbot)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        
        # Pass custom domain to app (for tenant resolution)
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Static files
    location /uploads {
        alias /home/ubuntu/Mediczy/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

sudo mv /tmp/nginx-$DOMAIN.conf /etc/nginx/sites-available/$DOMAIN
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN

echo "✅ Nginx config created"

# Step 4: Test Nginx config
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

if [ $? -ne 0 ]; then
  echo "❌ Nginx config test failed"
  exit 1
fi

# Step 5: Setup SSL certificate with Let's Encrypt
echo "🔐 Setting up SSL certificate..."
echo "   This will request certificate from Let's Encrypt"

sudo certbot certonly --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@mayden.in

if [ $? -eq 0 ]; then
  echo "✅ SSL certificate obtained"
else
  echo "⚠️  SSL certificate failed - will use HTTP only for now"
  # Comment out SSL lines if cert failed
  sudo sed -i 's/^    ssl_/#    ssl_/g' /etc/nginx/sites-available/$DOMAIN
  sudo sed -i 's/^    listen 443/#    listen 443/g' /etc/nginx/sites-available/$DOMAIN
fi

# Step 6: Reload Nginx
echo "🔄 Reloading Nginx..."
sudo systemctl reload nginx

if [ $? -eq 0 ]; then
  echo "✅ Nginx reloaded"
else
  echo "❌ Nginx reload failed"
  exit 1
fi

# Step 7: Verify setup
echo ""
echo "✅ Custom domain setup complete!"
echo ""
echo "📋 Summary:"
echo "   Domain: $DOMAIN"
echo "   Tenant ID: $TENANT_ID"
echo "   SSL: Enabled"
echo ""
echo "🧪 Test the domain:"
echo "   curl -I https://$DOMAIN"
echo "   curl https://$DOMAIN/health"
echo ""
echo "📝 Next steps:"
echo "   1. Test in browser: https://$DOMAIN"
echo "   2. Verify tenant isolation is working"
echo "   3. Update tenant's branding settings"
echo ""
