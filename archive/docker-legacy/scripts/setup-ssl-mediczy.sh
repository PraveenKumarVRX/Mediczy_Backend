#!/bin/bash

# SSL Certificate Management Script for mediczy.in
# This script sets up Let's Encrypt SSL certificates for the new domain

set -e

DOMAIN="mediczy.in"
EMAIL="admin@mediczy.in"  # Change this to your actual email
STAGING=0  # Set to 1 for testing, 0 for production

echo "🔐 Setting up SSL certificates for $DOMAIN"

# Check if running with staging flag
if [ "$1" = "--staging" ]; then
    STAGING=1
    echo "⚠️  Running in STAGING mode (test certificates)"
fi

# Function to check if domain is accessible
check_domain() {
    echo "🌐 Checking domain accessibility..."
    if curl -I http://$DOMAIN/.well-known/acme-challenge/test 2>/dev/null | grep -q "404\|200"; then
        echo "✅ Domain $DOMAIN is accessible"
        return 0
    else
        echo "❌ Domain $DOMAIN is not accessible. Please ensure:"
        echo "   1. DNS is pointing to this server"
        echo "   2. Port 80 is open"
        echo "   3. Nginx is running"
        return 1
    fi
}

# Function to generate Let's Encrypt certificate
generate_certificate() {
    local staging_flag=""
    if [ $STAGING -eq 1 ]; then
        staging_flag="--staging"
    fi

    echo "📜 Generating Let's Encrypt certificate..."
    
    docker-compose exec certbot certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email $EMAIL \
        --agree-tos \
        --no-eff-email \
        $staging_flag \
        -d $DOMAIN \
        -d www.$DOMAIN \
        --force-renewal
}

# Function to test certificate renewal
test_renewal() {
    echo "🔄 Testing certificate renewal..."
    docker-compose exec certbot certbot renew --dry-run
}

# Function to reload nginx
reload_nginx() {
    echo "🔄 Reloading Nginx configuration..."
    docker-compose exec nginx nginx -s reload
}

# Function to setup certificate renewal cron job
setup_cron() {
    echo "⏰ Setting up automatic certificate renewal..."
    
    # Create renewal script
    cat > /root/renew-certificates.sh << 'EOF'
#!/bin/bash
cd /root/Mediczy
docker-compose exec certbot certbot renew --quiet
if [ $? -eq 0 ]; then
    docker-compose exec nginx nginx -s reload
    echo "$(date): SSL certificates renewed successfully" >> /var/log/certbot-renewal.log
fi
EOF

    chmod +x /root/renew-certificates.sh

    # Add to crontab (runs twice daily as recommended)
    (crontab -l 2>/dev/null; echo "0 12 * * * /root/renew-certificates.sh") | crontab -
    (crontab -l 2>/dev/null; echo "0 0 * * * /root/renew-certificates.sh") | crontab -
    
    echo "✅ Automatic renewal scheduled (twice daily)"
}

# Function to create fallback self-signed certificate
create_self_signed() {
    echo "🔑 Creating fallback self-signed certificate for mediczy.in..."
    
    mkdir -p ./docker/ssl
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout ./docker/ssl/nginx-selfsigned.key \
        -out ./docker/ssl/nginx-selfsigned.crt \
        -subj "/C=IN/ST=State/L=City/O=Mediczy/OU=IT/CN=mediczy.in/emailAddress=admin@mediczy.in"
    
    echo "✅ Self-signed certificate created for mediczy.in"
}

# Main execution
main() {
    echo "🚀 Starting SSL setup for mediczy.in"
    
    # Create self-signed certificate as fallback
    create_self_signed
    
    # Start services if not running
    echo "🐳 Starting Docker services..."
    docker-compose up -d nginx
    
    # Wait for nginx to start
    echo "⏳ Waiting for Nginx to start..."
    sleep 10
    
    # Check if domain is accessible (optional for first setup)
    if check_domain; then
        # Generate Let's Encrypt certificate
        generate_certificate
        
        # Test renewal
        test_renewal
        
        # Reload nginx to use new certificate
        reload_nginx
        
        # Setup automatic renewal
        setup_cron
        
        echo "🎉 SSL setup completed successfully!"
        echo "🌐 Your site should now be accessible at:"
        echo "   https://mediczy.in:9443"
        echo "   https://www.mediczy.in:9443"
        
    else
        echo "⚠️  Domain not accessible. Using self-signed certificate for now."
        echo "🔧 To setup Let's Encrypt later, ensure DNS is configured and run:"
        echo "   ./setup-ssl-mediczy.sh"
    fi
}

# Help function
show_help() {
    echo "SSL Certificate Setup Script for mediczy.in"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --staging    Use Let's Encrypt staging environment (for testing)"
    echo "  --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                 # Setup production certificates"
    echo "  $0 --staging       # Setup staging certificates (for testing)"
}

# Parse command line arguments
case "$1" in
    --help)
        show_help
        exit 0
        ;;
    *)
        main
        ;;
esac