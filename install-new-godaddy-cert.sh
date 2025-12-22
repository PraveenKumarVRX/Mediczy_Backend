#!/bin/bash

# GoDaddy SSL Certificate Installation Script
# Run this after receiving reissued certificate from GoDaddy

set -e

echo "🔐 SSL Certificate Installation for mediqzy.com"
echo "=================================================="
echo "⚠️  NOTE: mediqzy.com uses Cloudflare for SSL termination."
echo "   This script is for backup purposes only."
echo "   Cloudflare handles SSL automatically."
echo ""

SSL_DIR="/etc/nginx/ssl"
UPLOAD_DIR="/root/Mediczy/ssl-upload-new"
BACKUP_DIR="/etc/nginx/ssl/backup-$(date +%Y%m%d-%H%M%S)"

# Create directories
mkdir -p "$UPLOAD_DIR"
sudo mkdir -p "$BACKUP_DIR"

echo ""
echo "📋 Before running this script, upload your new certificate files to:"
echo "   $UPLOAD_DIR/"
echo ""
echo "Files needed from GoDaddy:"
echo "   1. Domain certificate (e.g., abc123def456.crt)"
echo "   2. Intermediate bundle (gd_bundle-g2.crt)"
echo ""

# Check if certificate files exist
DOMAIN_CERT=$(find "$UPLOAD_DIR" -name "*.crt" -not -name "*bundle*" | head -n1)
BUNDLE_CERT=$(find "$UPLOAD_DIR" -name "*bundle*.crt" | head -n1)

if [ ! -f "$DOMAIN_CERT" ] || [ ! -f "$BUNDLE_CERT" ]; then
    echo "❌ Certificate files not found in $UPLOAD_DIR/"
    echo ""
    echo "📤 Please upload your files and try again:"
    echo "   1. Copy domain certificate to: $UPLOAD_DIR/"
    echo "   2. Copy bundle certificate to: $UPLOAD_DIR/"
    echo "   3. Run this script again: $0"
    echo ""
    echo "🌐 You can also use VS Code to create/edit files in the ssl-upload-new folder"
    exit 1
fi

echo "✅ Found certificate files:"
echo "   Domain: $DOMAIN_CERT"
echo "   Bundle: $BUNDLE_CERT"
echo ""

# Backup current certificates
echo "📦 Creating backup of current certificates..."
sudo cp "$SSL_DIR/mediqzy.com.crt" "$BACKUP_DIR/" 2>/dev/null || true
sudo cp "$SSL_DIR/mediqzy.com.key" "$BACKUP_DIR/" 2>/dev/null || true

# Combine certificates using GoDaddy method
echo "🔗 Combining certificates (GoDaddy method)..."
sudo cat "$DOMAIN_CERT" "$BUNDLE_CERT" > "$SSL_DIR/mediqzy.com.crt"

echo "✅ Certificates combined successfully"

# Set proper permissions
sudo chmod 644 "$SSL_DIR/mediqzy.com.crt"
sudo chmod 600 "$SSL_DIR/mediqzy.com.key"
sudo chown root:root "$SSL_DIR/mediqzy.com.crt" "$SSL_DIR/mediqzy.com.key"

# Verify certificate
echo "🔍 Verifying certificate..."
if openssl x509 -in "$SSL_DIR/mediqzy.com.crt" -text -noout | grep -q "mediqzy.com"; then
    echo "✅ Certificate is valid for mediqzy.com"
else
    echo "⚠️  Warning: Certificate verification failed"
fi

# Test private key match
echo "🔐 Testing private key compatibility..."
CERT_MODULUS=$(openssl x509 -noout -modulus -in "$SSL_DIR/mediqzy.com.crt" | openssl md5)
KEY_MODULUS=$(openssl rsa -noout -modulus -in "$SSL_DIR/mediqzy.com.key" 2>/dev/null | openssl md5)

if [ "$CERT_MODULUS" = "$KEY_MODULUS" ]; then
    echo "✅ Certificate and private key match perfectly"
else
    echo "❌ Certificate and private key don't match"
    echo "This means the certificate was not issued for this private key"
    exit 1
fi

# Test nginx configuration
echo "🔧 Testing nginx configuration..."
if sudo nginx -t; then
    echo "✅ Nginx configuration is valid"
    
    # Reload nginx
    echo "🔄 Reloading nginx..."
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded successfully"
    
    echo ""
    echo "🎉 GoDaddy SSL Certificate Installation Completed!"
    echo "================================================"
    echo "🌐 Your site: https://mediqzy.com"
    echo "🔒 SSL Status: Trusted (GoDaddy Certificate)"
    echo "📊 Test SSL: https://www.ssllabs.com/ssltest/analyze.html?d=mediqzy.com"
    echo ""
    echo "🗂️  Backup location: $BACKUP_DIR"
    
else
    echo "❌ Nginx configuration test failed"
    echo "🔄 Restoring backup certificates..."
    sudo cp "$BACKUP_DIR/mediqzy.com.crt" "$SSL_DIR/" 2>/dev/null || true
    sudo systemctl reload nginx
    echo "❌ Installation failed - backup restored"
    exit 1
fi