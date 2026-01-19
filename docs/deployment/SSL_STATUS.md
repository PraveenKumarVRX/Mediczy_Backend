# SSL/HTTPS Setup Status for Mediczy

## ✅ Current Configuration

### Domain: isha-inc.com (www.isha-inc.com)

### SSL Certificate: Self-Signed (Temporary)
- **Type**: Self-signed certificate
- **Valid for**: 365 days
- **Location**: `/etc/nginx/ssl/isha-inc.com.crt`
- **Key**: `/etc/nginx/ssl/isha-inc.com.key`
- **Created**: November 10, 2025

### Nginx Configuration
- **HTTP Port 80**: Redirects to HTTPS
- **HTTPS Port 443**: Active with TLS 1.2/1.3
- **Reverse Proxy**: Port 443 → Node.js on port 8000
- **Domain**: isha-inc.com, www.isha-inc.com

---

## 🔒 Security Features Enabled

✅ **HTTPS/SSL**: Active (self-signed certificate)
✅ **HTTP → HTTPS Redirect**: Automatic redirect
✅ **TLS Protocols**: TLS 1.2 and TLS 1.3
✅ **Security Headers**:
- Strict-Transport-Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Referrer-Policy

✅ **Compression**: Gzip enabled
✅ **Rate Limiting**: 
- API: 100 requests/minute
- Auth: 5 requests/minute

✅ **WebSocket**: Supported
✅ **File Uploads**: 50MB max

---

## ⚠️ Important Notes

### Why Self-Signed Certificate?

**Port 80 is blocked from external access**, preventing Let's Encrypt validation. This is due to:
- NAT/Router configuration
- ISP firewall
- Network restrictions

**Test results:**
```
✅ Local access (localhost:80) - Works
❌ External access (115.99.14.95:80) - Blocked: "No route to host"
```

### Browser Warning

Self-signed certificates will show security warnings in browsers:
- Chrome: "Your connection is not private" (NET::ERR_CERT_AUTHORITY_INVALID)
- Firefox: "Warning: Potential Security Risk Ahead"
- Safari: "This Connection Is Not Private"

This is **NORMAL** for self-signed certificates. Click "Advanced" → "Proceed" to access the site.

---

## 🔄 Upgrade to Let's Encrypt (Trusted Certificate)

### Option 1: Configure Port Forwarding (Recommended)

If your server is behind a router/firewall, configure port forwarding:

1. **Access your router admin panel**
2. **Set up port forwarding rules**:
   - External Port **80** → Internal `192.168.1.72:80`
   - External Port **443** → Internal `192.168.1.72:443`

3. **Test external access**:
```bash
curl -v http://isha-inc.com/
```

4. **Run Let's Encrypt**:
```bash
certbot --nginx -d isha-inc.com -d www.isha-inc.com --email your-sk@mysmarthealth.in --agree-tos
```

### Option 2: Use Cloudflare (Free SSL + CDN)

1. Add isha-inc.com to Cloudflare
2. Point DNS to your server (115.99.14.95)
3. Enable "Full" SSL mode
4. Cloudflare provides SSL termination automatically

### Option 3: Contact Your ISP/Network Admin

- Ask to open port 80 and 443 for external access
- Or request a public IP with no port restrictions

---

## 📊 Server Information

### Public IP
```
115.99.14.95
```

### Private IP
```
192.168.1.72
```

### DNS Records (Current)
```
isha-inc.com     → 115.99.14.95 ✅
www.isha-inc.com → 115.99.14.95 ✅
```

### Services Running
```
✅ Nginx:      Active on ports 80, 443
✅ PM2:        4 cluster instances
✅ Node.js:    Running on port 8000
✅ MariaDB:    Active
✅ MongoDB:    Active
✅ Redis:      Active
```

---

## 🧪 Testing Your Setup

### 1. Test HTTPS Locally
```bash
curl -k -I https://localhost/
```

### 2. Test from Browser
```
https://isha-inc.com
```
(Accept security warning for self-signed certificate)

### 3. Test API Endpoint
```bash
curl -k https://isha-inc.com/api/health
```

### 4. Check SSL Certificate
```bash
openssl s_client -connect isha-inc.com:443 -servername isha-inc.com < /dev/null 2>/dev/null | openssl x509 -noout -text
```

### 5. Check Nginx Status
```bash
systemctl status nginx
ss -tlnp | grep -E ':80|:443'
```

---

## 🛠️ Troubleshooting

### Issue: Browser shows "Not Secure"
**Cause**: Self-signed certificate not trusted by browsers
**Solution**: This is expected. Either:
- Accept the warning and proceed
- Upgrade to Let's Encrypt certificate (see above)

### Issue: Can't connect to https://isha-inc.com
**Check:**
1. DNS resolves correctly: `dig +short isha-inc.com`
2. Nginx is running: `systemctl status nginx`
3. Port 443 is open: `ss -tlnp | grep :443`

### Issue: 502 Bad Gateway
**Cause**: Node.js app not responding
**Check:**
```bash
pm2 status
pm2 logs mediczy-server --lines 50
curl http://localhost:8000/
```

---

## 📁 Configuration Files

### Nginx Config
```
/etc/nginx/sites-available/mediczy
/etc/nginx/sites-enabled/mediczy
```

### SSL Certificates
```
/etc/nginx/ssl/isha-inc.com.crt
/etc/nginx/ssl/isha-inc.com.key
```

### Let's Encrypt (when ready)
```
/etc/letsencrypt/live/isha-inc.com/fullchain.pem
/etc/letsencrypt/live/isha-inc.com/privkey.pem
```

---

## 🎯 Next Steps

1. **For Production**: Set up port forwarding and obtain Let's Encrypt certificate
2. **For Development**: Current self-signed certificate works (accept browser warnings)
3. **Update Application**: Configure app to trust HTTPS in production:

```bash
# Update .env file
nano /root/Mediczy/server/.env

# Add/update:
FRONTEND_URL=https://isha-inc.com
API_URL=https://isha-inc.com/api
SECURE_COOKIES=true
NODE_ENV=production

# Restart app
pm2 restart mediczy-server
```

---

## 📞 Quick Commands

```bash
# Check SSL certificate details
openssl x509 -in /etc/nginx/ssl/isha-inc.com.crt -noout -text

# Test Nginx config
nginx -t

# Reload Nginx
systemctl reload nginx

# View Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Check DNS
dig +short isha-inc.com

# Test external port access
curl -v http://115.99.14.95/

# Check firewall
ufw status

# PM2 status
pm2 status
pm2 logs mediczy-server
```

---

## ✨ Summary

**Current Status**: ✅ HTTPS is configured and working with self-signed certificate

**Limitations**: 
- Browser security warnings (self-signed cert)
- Port 80 blocked from external access

**To Upgrade to Trusted SSL**:
1. Configure port forwarding (ports 80 & 443)
2. Run: `certbot --nginx -d isha-inc.com -d www.isha-inc.com`
3. Certificates will auto-renew every 90 days

**Production Ready**: ⚠️ Yes (with self-signed cert), but recommend upgrading to Let's Encrypt for public access

---

**Last Updated**: November 10, 2025
**Domain**: isha-inc.com
**Server IP**: 115.99.14.95
