# GoDaddy SSL Certificate Download Guide for Nginx

## 🔐 SSL Certificate Download Instructions

When GoDaddy asks for server type during SSL certificate download:

### ✅ **Server Type Selection**
**Choose:** `Other` or `Nginx` (if available)

If those options aren't available, choose:
- `Apache` (the format is compatible)
- `Other/Generic`

### 📦 **Files You'll Receive**

GoDaddy will provide you with these files:

1. **Primary Certificate**: `your-domain.crt` or `mayden_in.crt`
2. **Intermediate Certificate**: `gd_bundle-g2-g1.crt` or similar
3. **Root Certificate**: Usually included in bundle

### 🔧 **Certificate Preparation for Nginx**

You need to create a **combined certificate file** for nginx:

```bash
# Create the combined certificate file
cat your-domain.crt gd_bundle-g2-g1.crt > mayden.in.crt
```

**File Structure Order:**
1. Your domain certificate (first)
2. Intermediate certificate(s) (second)
3. Root certificate (if separate)

### 📋 **Installation Steps**

After downloading from GoDaddy:

```bash
# 1. Combine the certificates (important for nginx!)
cat your-domain.crt gd_bundle-g2-g1.crt > mayden.in.crt

# 2. Copy to nginx SSL directory
sudo cp mayden.in.crt /etc/nginx/ssl/mayden.in.crt
sudo cp your-private-key.key /etc/nginx/ssl/mayden.in.key

# 3. Set proper permissions
sudo chmod 644 /etc/nginx/ssl/mayden.in.crt
sudo chmod 600 /etc/nginx/ssl/mayden.in.key
sudo chown root:root /etc/nginx/ssl/mayden.in.*

# 4. Run our SSL installation script
cd /root/Mediczy
./install-ssl.sh
```

### ⚠️ **Important Notes**

1. **Certificate Chain Order Matters**: Domain cert must be first, then intermediates
2. **Private Key**: Keep the same private key you used for the CSR
3. **File Format**: Use `.crt` extension for certificates, `.key` for private key
4. **Permissions**: Certificate (644), Private key (600)

### 🔍 **Verification Commands**

After installation, verify your setup:

```bash
# Check certificate content
openssl x509 -in /etc/nginx/ssl/mayden.in.crt -text -noout | grep -A2 "Subject:"

# Verify certificate chain
openssl verify -CAfile /etc/nginx/ssl/mayden.in.crt /etc/nginx/ssl/mayden.in.crt

# Test nginx configuration
sudo nginx -t

# Check SSL handshake (after DNS points to your server)
openssl s_client -connect mayden.in:443 -servername mayden.in
```

---

## 🎯 **Quick Summary**

**For GoDaddy SSL Download:**
- Server Type: `Other` or `Nginx`
- Download all certificate files
- Combine domain + intermediate certificates
- Use our `./install-ssl.sh` script for easy installation