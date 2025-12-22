# 🔥 SOPHOS FIREWALL - IMMEDIATE CONFIGURATION NEEDED

## ⚠️ CURRENT STATUS
- ✅ **Server**: Running perfectly at 192.168.1.72
- ✅ **Application**: Working locally
- ✅ **SSL**: Self-signed certificates working
- ❌ **External Access**: BLOCKED by firewall

## 🎯 EXACT SOPHOS CONFIGURATION REQUIRED

### Your Network Details
- **Internal Server**: 192.168.1.72 (Mediczy app)
- **Public IP**: 115.99.14.95
- **Gateway**: 192.168.1.2
- **Domain**: isha-inc.com (when DNS configured)

---

## 📋 SOPHOS FIREWALL STEPS (15 minutes)

### Step 1: Access Sophos Admin Panel
```
1. Open web browser
2. Go to: https://192.168.1.2:4444 (or your Sophos IP)
3. Login with admin credentials
```

### Step 2: Create NAT Rules (Port Forwarding)
```
Navigate: Network → NAT Rules → Add

NAT Rule 1 - HTTP:
- Rule Name: Mediczy-HTTP
- Original Source: Any
- Translated Source: Original
- Original Destination: Any  
- Translated Destination: 192.168.1.72
- Original Service: HTTP (TCP/80)
- Translated Service: Original
- Outbound Interface: LAN
- Status: Enabled

NAT Rule 2 - HTTPS:
- Rule Name: Mediczy-HTTPS  
- Original Source: Any
- Translated Source: Original
- Original Destination: Any
- Translated Destination: 192.168.1.72
- Original Service: HTTPS (TCP/9443)
- Translated Service: Original
- Outbound Interface: LAN
- Status: Enabled
```

### Step 3: Create Firewall Rules (Allow Traffic)
```
Navigate: Protect → Firewall Rules → Add

Rule 1 - Allow HTTP:
- Rule Name: Allow-Mediczy-HTTP
- Action: Allow
- Source Networks: Any
- Destination Networks: 192.168.1.72/32
- Services: HTTP (TCP/80)
- Status: Enabled

Rule 2 - Allow HTTPS:
- Rule Name: Allow-Mediczy-HTTPS
- Action: Allow  
- Source Networks: Any
- Destination Networks: 192.168.1.72/32
- Services: HTTPS (TCP/9443)
- Status: Enabled
```

### Step 4: Apply Configuration
```
1. Click "Apply" or "Save & Apply"
2. Wait for rules to activate (2-3 minutes)
```

---

## 🧪 TESTING COMMANDS

### After Sophos Configuration
```bash
# Test from any external computer:
curl -I http://115.99.14.95
curl -k -I https://115.99.14.95

# Should return HTTP 200 or 301 redirect
```

### From Your Server (to verify it's still working)
```bash
cd /root/Mediczy
./network-diagnostic.sh
```

---

## 📱 EXPECTED RESULTS

### Before Configuration (Current)
```
❌ curl http://115.99.14.95 → Connection timeout
❌ curl https://115.99.14.95 → Connection timeout
```

### After Configuration (Expected)
```
✅ curl http://115.99.14.95 → 301 Redirect to HTTPS
✅ curl https://115.99.14.95 → 200 OK (Mediczy app loads)
```

---

## 🌐 POST-FIREWALL STEPS

### 1. Verify External Access (Immediate)
```bash
# Test from external network or phone data
http://115.99.14.95  → Should redirect to HTTPS
https://115.99.14.95 → Should show Mediczy login page
```

### 2. Configure Domain DNS (Your domain registrar)
```
A Record: isha-inc.com → 115.99.14.95
A Record: www.isha-inc.com → 115.99.14.95
```

### 3. Generate Real SSL Certificates (After DNS)
```bash
cd /root/Mediczy
./setup-ssl.sh  # Generates Let's Encrypt certificates
```

---

## 🚨 TROUBLESHOOTING

### If External Access Still Fails After Sophos Config:
1. **Check Rule Order**: NAT rules should be at the top
2. **Verify Interfaces**: Ensure WAN/LAN interfaces are correct
3. **Check Logs**: Sophos Firewall → Reports → Live Log
4. **Restart Firewall**: Sometimes needed after major config changes

### Common Sophos Interface Names:
- **WAN Interface**: Usually "Port1" or "WAN"  
- **LAN Interface**: Usually "Port2" or "LAN"
- **Source Zone**: WAN
- **Destination Zone**: LAN

---

## ✅ VERIFICATION CHECKLIST

- [ ] NAT Rule for port 80 created and enabled
- [ ] NAT Rule for port 9443 created and enabled  
- [ ] Firewall rule allowing port 80 created
- [ ] Firewall rule allowing port 9443 created
- [ ] Configuration applied and active
- [ ] External HTTP test successful
- [ ] External HTTPS test successful
- [ ] Domain DNS records configured (if ready)
- [ ] SSL certificates generated (after DNS)

**🎯 PRIORITY: Configure Sophos firewall first - everything else is ready!**