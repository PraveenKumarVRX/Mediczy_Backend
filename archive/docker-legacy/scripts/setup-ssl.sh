#!/bin/bash

# SSL Certificate Setup Script for isha-inc.com
# Run this AFTER DNS propagation and port forwarding is configured

echo "🔐 SSL Certificate Setup for isha-inc.com"
echo "=========================================="

# Check if domain resolves to our server
echo "📡 Checking DNS resolution..."
DOMAIN_IP=$(dig +short isha-inc.com)
SERVER_IP=$(curl -s ifconfig.me)

echo "Domain isha-inc.com resolves to: $DOMAIN_IP"
echo "Server public IP: $SERVER_IP"

if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
    echo "⚠️  DNS not yet propagated or incorrect. Please wait and try again."
    echo "Expected: $SERVER_IP"
    echo "Current:  $DOMAIN_IP"
    exit 1
fi

echo "✅ DNS resolution looks good!"

# Install certbot if not already installed
echo "📦 Installing/Updating Certbot..."
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Stop nginx temporarily for certificate generation
echo "🔄 Stopping Nginx temporarily..."
sudo systemctl stop nginx

# Generate SSL certificates
echo "🔐 Generating SSL certificates for isha-inc.com..."
sudo certbot certonly --standalone \
    -d isha-inc.com \
    -d www.isha-inc.com \
    --email admin@isha-inc.com \
    --agree-tos \
    --non-interactive

# Check if certificates were generated successfully
if [ -f "/etc/letsencrypt/live/isha-inc.com/fullchain.pem" ]; then
    echo "✅ SSL certificates generated successfully!"
    
    # Update Nginx configuration to use Let's Encrypt certificates
    echo "🔧 Updating Nginx configuration..."
    
    # Create backup of current config
    cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup
    
    # Update SSL certificate paths in Docker nginx config
    sed -i 's|ssl_certificate /etc/nginx/ssl/nginx-selfsigned.crt;|ssl_certificate /etc/letsencrypt/live/isha-inc.com/fullchain.pem;|g' /root/Mediczy/docker/nginx/default.conf
    sed -i 's|ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;|ssl_certificate_key /etc/letsencrypt/live/isha-inc.com/privkey.pem;|g' /root/Mediczy/docker/nginx/default.conf
    
    # Update docker-compose.yml to mount SSL certificates
    echo "🐳 Updating Docker configuration..."
    
    # Add SSL mount to docker-compose if not already there
    if ! grep -q "letsencrypt" /root/Mediczy/docker-compose.yml; then
        sed -i '/- .\/docker\/nginx\/default.conf:\/etc\/nginx\/conf.d\/default.conf/a\      - \/etc\/letsencrypt:\/etc\/letsencrypt:ro' /root/Mediczy/docker-compose.yml
    fi
    
else
    echo "❌ SSL certificate generation failed!"
    echo "Please check the error messages above and ensure:"
    echo "1. Domain points to this server"
    echo "2. Ports 80 and 443 are accessible from internet"
    echo "3. No other web server is running on port 80"
fi

# Start nginx again
echo "🔄 Starting Nginx..."
sudo systemctl start nginx

# Setup auto-renewal
echo "⏰ Setting up automatic certificate renewal..."
sudo crontab -l 2>/dev/null | grep -v "certbot renew" | sudo crontab -
echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'" | sudo crontab -

# Test the setup
echo "🧪 Testing HTTPS access..."
sleep 3

if curl -I https://isha-inc.com >/dev/null 2>&1; then
    echo "✅ HTTPS is working!"
    echo ""
    echo "🎉 Setup Complete!"
    echo "Your Mediczy app is now accessible at:"
    echo "   https://isha-inc.com"
    echo "   https://www.isha-inc.com"
    echo ""
    echo "Test these URLs:"
    echo "   https://isha-inc.com/ai-doctor"
    echo "   https://isha-inc.com/video-test"
    echo "   https://isha-inc.com/api/health"
else
    echo "⚠️  HTTPS test failed. Please check configuration."
fi

echo ""
echo "📋 Next Steps:"
echo "1. Test all app functionality through isha-inc.com"
echo "2. Update any hardcoded URLs in your app to use the domain"
echo "3. Configure monitoring and backups"
echo "4. Set up CDN if needed for better performance"