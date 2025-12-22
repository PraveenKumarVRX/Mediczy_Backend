# Port Forwarding Configuration Guide for mayden.in

## 🌐 Network Configuration Summary

**Your Network Setup:**
- **Server Internal IP**: 192.168.1.72 (Proxmox VM)
- **Gateway/Router**: 192.168.1.2
- **External IP**: 115.99.14.95
- **Domain**: mayden.in → 115.99.14.95

## 🔧 Port Forwarding Configuration Required

### **Ports to Forward:**
1. **HTTP Port 80**: `115.99.14.95:80` → `192.168.1.72:80`
2. **HTTPS Port 443**: `115.99.14.95:443` → `192.168.1.72:443`

---

## 📋 Step-by-Step Router Configuration

### **Step 1: Access Router Admin Panel**

1. Open web browser and go to: **http://192.168.1.2**
2. Login with your router admin credentials
3. Look for sections named:
   - "Port Forwarding"
   - "Virtual Server"
   - "NAT"
   - "Advanced" → "Port Forwarding"

### **Step 2: Create Port Forwarding Rules**

**Rule 1 - HTTP (Port 80):**
```
Service Name: Mediczy-HTTP
External Port: 80
Internal IP: 192.168.1.72
Internal Port: 80
Protocol: TCP
Status: Enabled
```

**Rule 2 - HTTPS (Port 443):**
```
Service Name: Mediczy-HTTPS
External Port: 443
Internal IP: 192.168.1.72
Internal Port: 443
Protocol: TCP
Status: Enabled
```

### **Step 3: Apply and Save Configuration**

1. Save/Apply the port forwarding rules
2. Restart the router if required
3. Wait 2-3 minutes for changes to take effect

---

## 🔍 Router-Specific Instructions

### **Common Router Brands:**

#### **TP-Link Routers:**
- Advanced → NAT Forwarding → Virtual Servers
- Add new rule with above configuration

#### **Netgear Routers:**
- Dynamic DNS → Port Forwarding / Port Triggering
- Add new custom service

#### **ASUS Routers:**
- Adaptive QoS → Traditional QoS → Port Forwarding
- Enable port forwarding and add rules

#### **Linksys Routers:**
- Smart Wi-Fi Tools → Port Range Forwarding
- Add new forwarding rules

#### **D-Link Routers:**
- Advanced → Port Forwarding
- Add virtual server entries

---

## 🧪 Testing After Configuration

### **Test 1: External HTTP Access**
```bash
# From another computer/network:
curl -I http://mayden.in
# Should return: 301 redirect to HTTPS
```

### **Test 2: External HTTPS Access**
```bash
# From another computer/network:
curl -I https://mayden.in
# Should return: 200 OK with nginx headers
```

### **Test 3: Browser Access**
1. Open browser (from external network)
2. Go to: **http://mayden.in**
3. Should redirect to: **https://mayden.in**
4. Should show trusted SSL certificate (no warnings)

---

## 🛠️ Alternative Solutions

### **Option 1: Cloudflare Tunnel (If router access unavailable)**
If you cannot configure the router, we can set up Cloudflare Tunnel:

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
sudo mv cloudflared /usr/local/bin/
sudo chmod +x /usr/local/bin/cloudflared

# Create tunnel (requires Cloudflare account)
cloudflared tunnel login
cloudflared tunnel create mayden
```

### **Option 2: Reverse SSH Tunnel**
For temporary testing:

```bash
# From external server with public IP:
ssh -R 80:192.168.1.72:80 -R 443:192.168.1.72:443 user@external-server
```

---

## ✅ Verification Checklist

After configuring port forwarding:

- [ ] Router shows port forwarding rules enabled
- [ ] http://mayden.in redirects to https://mayden.in
- [ ] https://mayden.in loads with trusted SSL certificate
- [ ] Admin panel accessible: https://mayden.in/admin/login
- [ ] Team portal accessible: https://mayden.in/team/login

---

## 🚨 Common Issues & Solutions

### **Issue 1: Still can't access externally**
- **Check**: Firewall on router blocking ports
- **Solution**: Disable router firewall temporarily for testing

### **Issue 2: Timeout errors**
- **Check**: ISP blocking ports 80/443
- **Solution**: Contact ISP or use alternative ports

### **Issue 3: SSL certificate errors**
- **Check**: Certificate installed correctly
- **Solution**: Verify with: `openssl s_client -connect mayden.in:443`

---

## 📞 Need Help?

If you encounter issues:

1. **Check router logs** for port forwarding activity
2. **Test internal access**: http://192.168.1.72
3. **Verify ports are open**: https://www.yougetsignal.com/tools/open-ports/
4. **Contact ISP** if ports 80/443 are blocked

---

**Router Admin URL**: http://192.168.1.2
**Server Internal IP**: 192.168.1.72
**Test URL**: http://mayden.in → https://mayden.in