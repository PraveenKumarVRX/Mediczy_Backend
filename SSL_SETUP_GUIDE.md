# SSL/TLS Setup Guide for Mediczy

## ✅ Current Status

- **Nginx**: Installed and configured as reverse proxy
- **Certbot**: Installed and ready for SSL certificate generation
- **HTTP Proxy**: Working on port 80 → Node.js on port 8000
- **Rate Limiting**: Configured (100 req/min for API, 5 req/min for auth)
- **Security Headers**: Ready to be enabled after SSL

---

## 🔐 SSL Certificate Setup with Let's Encrypt

### Prerequisites

Before obtaining an SSL certificate, you need:

1. **A registered domain name** pointing to this server's public IP
2. **Port 80 and 443** open in your firewall (already configured)
3. **DNS A/AAAA records** configured to point to your server

---

## Step 1: Configure Your Domain

### Option A: Using a Domain Name

If you have a domain (e.g., `mediczy.com` or `api.mediczy.com`):

```bash
# Update the Nginx configuration with your domain
sed -i 's/server_name _;/server_name mediczy.com www.mediczy.com;/' /etc/nginx/sites-available/mediczy

# Test the configuration
nginx -t

# Reload Nginx
systemctl reload nginx
```

### Option B: Using a Subdomain

If using a subdomain for the API (e.g., `api.mediczy.com`):

```bash
# Update with your subdomain
sed -i 's/server_name _;/server_name api.mediczy.com;/' /etc/nginx/sites-available/mediczy

# Test and reload
nginx -t && systemctl reload nginx
```

---

## Step 2: Obtain SSL Certificate

### Automatic Configuration (Recommended)

Certbot will automatically configure Nginx with SSL:

```bash
# For a single domain
certbot --nginx -d mediczy.com -d www.mediczy.com

# For a subdomain only
certbot --nginx -d api.mediczy.com

# With email for renewal notifications
certbot --nginx -d mediczy.com -d www.mediczy.com --email admin@mediczy.com --agree-tos
```

### Manual Certificate Only

If you prefer to configure Nginx manually:

```bash
certbot certonly --nginx -d mediczy.com -d www.mediczy.com
```

---

## Step 3: Verify SSL Certificate

After obtaining the certificate:

```bash
# Check certificate details
certbot certificates

# Test SSL configuration
curl -I https://your-domain.com

# Test SSL rating (optional)
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=your-domain.com
```

---

## Step 4: Configure Automatic Renewal

Let's Encrypt certificates expire every 90 days. Certbot automatically sets up renewal:

```bash
# Test renewal process (dry run)
certbot renew --dry-run

# Check certbot timer status
systemctl status certbot.timer

# Enable automatic renewal if not enabled
systemctl enable certbot.timer
systemctl start certbot.timer
```

---

## 🔒 Enhanced Security Configuration

After SSL is enabled, add these security enhancements:

### 1. Force HTTPS Redirect

Certbot usually adds this automatically. If not, edit `/etc/nginx/sites-available/mediczy`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### 2. Security Headers (Already Configured)

Your HTTPS server block includes:
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options` (Clickjacking protection)
- `X-Content-Type-Options` (MIME sniffing protection)
- `X-XSS-Protection` (XSS protection)
- `Referrer-Policy` (Privacy)

### 3. Update Application for HTTPS

Update `/root/Mediczy/server/.env`:

```bash
# Add/update these variables
echo "FRONTEND_URL=https://your-domain.com" >> /root/Mediczy/server/.env
echo "API_URL=https://api.your-domain.com" >> /root/Mediczy/server/.env
echo "SECURE_COOKIES=true" >> /root/Mediczy/server/.env

# Restart the application
pm2 restart mediczy-server
```

---

## 🧪 Testing Your SSL Setup

### 1. Basic Connection Test

```bash
# Test HTTP (should redirect to HTTPS)
curl -I http://your-domain.com

# Test HTTPS
curl -I https://your-domain.com

# Test with verbose SSL info
curl -v https://your-domain.com 2>&1 | grep -E "SSL|TLS"
```

### 2. Check Certificate Details

```bash
# Using OpenSSL
openssl s_client -connect your-domain.com:443 -servername your-domain.com < /dev/null 2>/dev/null | openssl x509 -noout -dates -subject

# Using certbot
certbot certificates
```

### 3. Test API Endpoints

```bash
# Health check
curl https://your-domain.com/health

# API endpoint
curl https://your-domain.com/api/health
```

---

## 🚨 Troubleshooting

### Certificate Generation Fails

**Error**: "Failed authorization procedure"

**Solution**:
1. Ensure DNS is pointing to your server: `dig your-domain.com +short`
2. Check port 80 is accessible: `nc -zv your-domain.com 80`
3. Verify Nginx is running: `systemctl status nginx`
4. Check certbot logs: `journalctl -u certbot -n 50`

### Mixed Content Warnings

**Issue**: Browser shows "Not Secure" even with HTTPS

**Solution**:
1. Ensure all resources (images, scripts, APIs) use HTTPS URLs
2. Update `Content-Security-Policy` headers
3. Check for hardcoded HTTP URLs in your frontend code

### Certificate Renewal Fails

**Check renewal status**:
```bash
certbot renew --dry-run
journalctl -u certbot.timer
```

**Manual renewal**:
```bash
certbot renew --force-renewal
```

---

## 📋 Current Configuration Summary

### Nginx Configuration
- **Config File**: `/etc/nginx/sites-available/mediczy`
- **Enabled Site**: `/etc/nginx/sites-enabled/mediczy`
- **HTTP Port**: 80 (reverse proxy)
- **HTTPS Port**: 443 (will be configured by certbot)

### Rate Limits
- **API Endpoints**: 100 requests/minute
- **Auth Endpoints**: 5 requests/minute
- **Burst**: 20 for API, 10 for auth

### Proxy Features
- HTTP/1.1 with keep-alive
- WebSocket support for Socket.IO
- Gzip compression
- Static file caching (30 days)
- 50MB upload limit
- Security headers
- Health check endpoint (no rate limit)
- Metrics endpoint (localhost only)

---

## 🔄 After SSL Setup Checklist

- [ ] SSL certificate obtained and installed
- [ ] HTTPS redirect enabled (HTTP → HTTPS)
- [ ] Certificate auto-renewal verified
- [ ] Application updated with HTTPS URLs
- [ ] Secure cookies enabled in app config
- [ ] Security headers verified in browser
- [ ] API endpoints tested over HTTPS
- [ ] WebSocket connections tested (if applicable)
- [ ] Frontend updated to use HTTPS API endpoints
- [ ] DNS records verified and propagated
- [ ] SSL test completed (ssllabs.com)
- [ ] Browser cache cleared for testing
- [ ] HSTS preload considered (optional)

---

## 📞 Quick Commands Reference

```bash
# Check Nginx status
systemctl status nginx

# Test Nginx config
nginx -t

# Reload Nginx
systemctl reload nginx

# Check certificates
certbot certificates

# Renew certificates manually
certbot renew

# Check renewal timer
systemctl status certbot.timer

# View Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Test HTTPS connection
curl -I https://your-domain.com

# Check PM2 status
pm2 status

# View app logs
pm2 logs mediczy-server
```

---

## 🌐 Next Steps

1. **Provide your domain name** to complete SSL setup
2. Run certbot with your domain: `certbot --nginx -d your-domain.com`
3. Verify the certificate is working
4. Update application environment variables
5. Test all functionality over HTTPS

---

## 🔗 Useful Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot User Guide](https://eff-certbot.readthedocs.io/)
- [Nginx SSL Configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)

---

**Note**: This guide assumes you have a domain name. If you're running locally or don't have a domain, you can:
1. Use a service like [nip.io](http://nip.io) for development
2. Set up a local CA for testing
3. Use self-signed certificates (not recommended for production)
