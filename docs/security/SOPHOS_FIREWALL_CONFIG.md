# Sophos Firewall Port Forwarding Configuration for Mediczy
# Domain: isha-inc.com
# Internal Server: 192.168.1.72 (Mediczy Healthcare App)

## 📋 **Required Port Forwarding Rules**

### 🌐 **Web Traffic (Essential)**
1. **HTTPS (Port 443)**
   - External Port: 443
   - Internal IP: 192.168.1.72
   - Internal Port: 443
   - Protocol: TCP
   - Description: Mediczy HTTPS Web Traffic

2. **HTTP (Port 80)**
   - External Port: 80
   - Internal IP: 192.168.1.72
   - Internal Port: 80
   - Protocol: TCP
   - Description: Mediczy HTTP Web Traffic (redirects to HTTPS)

### 🔧 **API & Backend Services**
3. **Backend API (Port 8000)**
   - External Port: 8000
   - Internal IP: 192.168.1.72
   - Internal Port: 8000
   - Protocol: TCP
   - Description: Mediczy Backend API & Socket.IO

## 🔒 **Sophos Firewall Configuration Steps**

### Step 1: Access Sophos Admin Console
1. Open browser and navigate to your Sophos firewall admin interface
2. Login with administrator credentials
3. Navigate to **Network > NAT Rules** or **Network > Port Forwarding**

### Step 2: Create HTTPS Rule (Priority 1)
```
Rule Name: Mediczy-HTTPS
Action: DNAT
Source Zone: WAN
Destination Zone: LAN
Service: HTTPS (TCP 443)
Original Destination: Any
Translated Destination: 192.168.1.72:443
Status: Enabled
```

### Step 3: Create HTTP Rule (Priority 2)
```
Rule Name: Mediczy-HTTP
Action: DNAT
Source Zone: WAN
Destination Zone: LAN
Service: HTTP (TCP 80)
Original Destination: Any
Translated Destination: 192.168.1.72:80
Status: Enabled
```

### Step 4: Create API Rule (Priority 3)
```
Rule Name: Mediczy-API
Action: DNAT
Source Zone: WAN
Destination Zone: LAN
Service: TCP 8000
Original Destination: Any
Translated Destination: 192.168.1.72:8000
Status: Enabled
```

### Step 5: Firewall Rules (Allow Traffic)
```
Rule 1:
- Name: Allow-Mediczy-HTTPS
- Source: Any
- Destination: 192.168.1.72
- Service: HTTPS
- Action: Allow

Rule 2:
- Name: Allow-Mediczy-HTTP
- Source: Any
- Destination: 192.168.1.72
- Service: HTTP
- Action: Allow

Rule 3:
- Name: Allow-Mediczy-API
- Source: Any
- Destination: 192.168.1.72
- Service: TCP 8000
- Action: Allow
```

## 🌍 **DNS Configuration for isha-inc.com**

### Required DNS Records
```
# A Records
isha-inc.com.           IN  A     115.99.14.95
www.isha-inc.com.       IN  A     115.99.14.95

# Optional subdomains
api.isha-inc.com.       IN  A     115.99.14.95
app.isha-inc.com.       IN  A     115.99.14.95
mediczy.isha-inc.com.   IN  A     115.99.14.95

# CNAME (if preferred)
www.isha-inc.com.       IN  CNAME isha-inc.com.
```

## 🔐 **SSL Certificate Configuration**

### Option 1: Let's Encrypt (Recommended)
```bash
# On your server (192.168.1.72)
sudo certbot --nginx -d isha-inc.com -d www.isha-inc.com
```

### Option 2: Update Nginx for Domain
```nginx
# Update /etc/nginx/sites-available/default
server {
    listen 443 ssl;
    server_name isha-inc.com www.isha-inc.com;
    
    ssl_certificate /etc/letsencrypt/live/isha-inc.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/isha-inc.com/privkey.pem;
    
    # Rest of your existing configuration...
}

server {
    listen 80;
    server_name isha-inc.com www.isha-inc.com;
    return 301 https://$server_name$request_uri;
}
```

## 🧪 **Testing Configuration**

### Internal Testing (After Port Forwarding)
```bash
# Test from external network
curl -I https://isha-inc.com
curl -I http://isha-inc.com
curl -I https://isha-inc.com/api/health
```

### Expected Response URLs
```
✅ https://isha-inc.com/                    # Main App
✅ https://isha-inc.com/ai-doctor           # AI Doctor
✅ https://isha-inc.com/video-test          # Video Calls
✅ https://isha-inc.com/api/health          # API Health
✅ https://isha-inc.com/api/medical-ai/     # Medical AI APIs
```

## ⚠️ **Security Considerations**

### 1. Enable DDoS Protection
- Configure rate limiting on Sophos
- Enable intrusion prevention

### 2. Geo-blocking (Optional)
- Restrict access to specific countries if needed
- Allow India, US, and other target regions

### 3. SSL/TLS Security
```nginx
# Add to Nginx config
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
ssl_prefer_server_ciphers off;
add_header Strict-Transport-Security "max-age=63072000" always;
```

## 🔍 **Verification Commands**

### After DNS Propagation (24-48 hours)
```bash
# Check DNS resolution
nslookup isha-inc.com
dig isha-inc.com A

# Test HTTPS
curl -I https://isha-inc.com

# Test API
curl https://isha-inc.com/api/health
```

## 📝 **Summary Checklist**
- [ ] Configure Sophos port forwarding (443, 80, 8000)
- [ ] Create firewall allow rules
- [ ] Update DNS A records to point to 115.99.14.95
- [ ] Generate SSL certificates for isha-inc.com
- [ ] Update Nginx server_name configuration
- [ ] Test external access from different network
- [ ] Verify all app features work through domain

**Next Steps:**
1. Configure the port forwarding rules in Sophos
2. Update DNS records at your domain registrar
3. Once DNS propagates, generate SSL certificates
4. Test all functionality through isha-inc.com

Would you like me to help with any specific part of this configuration?