#!/bin/bash

# SSL Certificate Installation Script for GoDaddy certificates
# Run this script after receiving your GoDaddy SSL certificates

set -e

echo "🔐 Installing GoDaddy SSL Certificates for mayden.in"
echo "=================================================="

SSL_DIR="/etc/nginx/ssl"
CERT_FILE="$SSL_DIR/mayden.in.crt"
KEY_FILE="$SSL_DIR/mayden.in.key"
TEMP_DIR="/tmp/ssl-install"

# Create directories
sudo mkdir -p "$SSL_DIR"
mkdir -p "$TEMP_DIR"

echo "📋 GoDaddy SSL Installation Guide"
echo "================================="
echo ""
echo "When downloading from GoDaddy, select server type: 'Other' or 'Nginx'"
echo ""
echo "You should have received these files:"
echo "  1. Domain certificate (e.g., mayden_in.crt or your-domain.crt)"
echo "  2. Intermediate certificate (e.g., gd_bundle-g2-g1.crt)"
echo "  3. Private key (the one you generated for CSR)"
echo ""

# Function to combine certificates
combine_certificates() {
    local domain_cert="$1"
    local intermediate_cert="$2"
    local output_cert="$3"
    
    echo "🔗 Combining certificates for nginx..."
    
    # Combine domain cert + intermediate cert
    cat "$domain_cert" "$intermediate_cert" > "$output_cert"
    
    echo "✅ Combined certificate created: $output_cert"
}

# Check if certificates are already in place
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "✅ SSL certificates found!"
    
    # Verify certificate
    echo "🔍 Verifying certificate..."
    if openssl x509 -in "$CERT_FILE" -text -noout | grep -q "mayden.in"; then
        echo "✅ Certificate is valid for mayden.in"
    else
        echo "⚠️  Warning: Certificate may not be for mayden.in domain"
        echo "    Checking subject alternative names..."
        openssl x509 -in "$CERT_FILE" -text -noout | grep -A1 "Subject Alternative Name" || true
    fi
    
    # Test private key
    echo "🔐 Verifying private key..."
    if openssl rsa -in "$KEY_FILE" -check -noout 2>/dev/null; then
        echo "✅ Private key is valid"
    else
        echo "❌ Private key verification failed"
        exit 1
    fi
    
    # Verify certificate chain
    echo "🔗 Verifying certificate chain..."
    if openssl verify -CAfile "$CERT_FILE" "$CERT_FILE" 2>/dev/null; then
        echo "✅ Certificate chain is valid"
    else
        echo "⚠️  Certificate chain verification failed (this might be normal)"
    fi
    
    # Set proper permissions
    sudo chmod 644 "$CERT_FILE"
    sudo chmod 600 "$KEY_FILE"
    sudo chown root:root "$CERT_FILE" "$KEY_FILE"
    
    echo "✅ SSL certificates configured successfully"
    
    # Test nginx configuration
    echo "🔧 Testing nginx configuration..."
    if sudo nginx -t; then
        echo "✅ Nginx configuration is valid"
        
        # Reload nginx
        sudo systemctl reload nginx
        echo "✅ Nginx reloaded with new SSL certificates"
        
        echo ""
        echo "🎉 SSL installation completed!"
        echo "🌐 Your site is now available at: https://mayden.in"
        echo "📋 Test SSL: openssl s_client -connect mayden.in:443 -servername mayden.in"
        
    else
        echo "❌ Nginx configuration test failed"
        exit 1
    fi
    
else
    echo "📥 To install your GoDaddy SSL certificates:"
    echo ""
    echo "Option 1: Manual Installation"
    echo "============================="
    echo "1. Place your certificate files in $TEMP_DIR/"
    echo "   cp your-domain.crt $TEMP_DIR/"
    echo "   cp gd_bundle-g2-g1.crt $TEMP_DIR/"
    echo "   cp your-private.key $TEMP_DIR/"
    echo ""
    echo "2. Run this script again with combine option:"
    echo "   $0 combine"
    echo ""
    echo "Option 2: Quick Installation"
    echo "============================"
    echo "1. Copy combined certificate to: $CERT_FILE"
    echo "   sudo cp your-combined-cert.crt $CERT_FILE"
    echo ""
    echo "2. Copy private key to: $KEY_FILE"
    echo "   sudo cp your-private.key $KEY_FILE"
    echo ""
    echo "3. Run this script again: $0"
    echo ""
    echo "📝 Important: For nginx, combine domain cert + intermediate cert into one file"
    echo "   cat your-domain.crt gd_bundle-g2-g1.crt > combined-cert.crt"
fi

# Handle certificate combination
if [ "$1" == "combine" ]; then
    echo ""
    echo "🔗 Certificate Combination Mode"
    echo "==============================="
    
    # Look for certificate files in temp directory
    DOMAIN_CERT=$(find "$TEMP_DIR" -name "*.crt" -not -name "*bundle*" -not -name "*intermediate*" | head -n1)
    INTERMEDIATE_CERT=$(find "$TEMP_DIR" -name "*bundle*.crt" -o -name "*intermediate*.crt" | head -n1)
    PRIVATE_KEY=$(find "$TEMP_DIR" -name "*.key" | head -n1)
    
    if [ -f "$DOMAIN_CERT" ] && [ -f "$INTERMEDIATE_CERT" ] && [ -f "$PRIVATE_KEY" ]; then
        echo "Found certificate files:"
        echo "  Domain cert: $DOMAIN_CERT"
        echo "  Intermediate: $INTERMEDIATE_CERT"
        echo "  Private key: $PRIVATE_KEY"
        echo ""
        
        # Combine certificates
        combine_certificates "$DOMAIN_CERT" "$INTERMEDIATE_CERT" "$TEMP_DIR/combined.crt"
        
        # Install certificates
        sudo cp "$TEMP_DIR/combined.crt" "$CERT_FILE"
        sudo cp "$PRIVATE_KEY" "$KEY_FILE"
        
        echo "✅ Certificates installed successfully"
        echo "🔄 Rerunning verification..."
        
        # Clean up temp files
        rm -rf "$TEMP_DIR"
        
        # Rerun script for verification
        exec "$0"
        
    else
        echo "❌ Missing certificate files in $TEMP_DIR/"
        echo "Required files:"
        echo "  - Domain certificate (.crt, not bundle)"
        echo "  - Intermediate certificate (bundle.crt or intermediate.crt)"
        echo "  - Private key (.key)"
    fi
fi