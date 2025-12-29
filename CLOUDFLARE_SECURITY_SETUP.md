# Cloudflare Security Configuration for Mediczy

## 🎯 Current Issue
- ✅ Backend API is working (`localhost:8000`)
- ✅ Nginx proxy is working
- ❌ Cloudflare is blocking admin login with 403

## 🔧 Solution: Configure Cloudflare Security Rules

### **Step 1: Allow Admin API Endpoint**

**Cloudflare Dashboard Path**: Security → Firewall Rules → Create rule

**Rule Configuration**:
```
Rule Name: Allow Admin Login
Expression: uri.path eq "/api/admin/login"
Action: Allow (or Bypass Cache)
Priority: 1
Status: Enabled
```

### **Step 2: Protect with Rate Limiting** (Optional but Recommended)

**Cloudflare Dashboard Path**: Security → Rate limiting → Create rule

**Rule Configuration**:
```
Request Path: /api/admin/login
Rate Limit: 10 requests per 10 seconds per IP
Action: Challenge
Status: Enabled
```

This prevents brute force attacks while allowing legitimate login attempts.

### **Step 3: Disable Challenge for API Endpoints**

**Cloudflare Dashboard Path**: Security → Settings

Find "Challenge Passage" and set to:
- `5 minutes` (recommended) - allows legitimate traffic
- Or disable completely for internal APIs

### **Step 4: Bot Management Settings** (If Enabled)

**Cloudflare Dashboard Path**: Security → Bots → Settings

**Configure**:
- ✅ Definitely Automated: `Block`
- ✅ Likely Automated: `Challenge`
- ✅ Verified Bots: `Allow`
- ✅ Unverified Bots: `Challenge`

### **Step 5: API Shield** (Advanced Security)

If you have Cloudflare Pro or above:

**Cloudflare Dashboard Path**: Security → API Shield

**Add Endpoint**:
```
Method: POST
Path: /api/admin/login
Authentication: mTLS (if configured) or None
```

---

## 📋 Firewall Rules Summary

| Rule Type | Path | Action | Priority | Status |
|-----------|------|--------|----------|--------|
| Whitelist | `/api/admin/login` | Allow | 1 | Enabled |
| Rate Limit | `/api/admin/login` | Challenge | 2 | Enabled |
| Whitelist | `/api//*` | Allow | 3 | Enabled* |

*\* Optional - Allow all API endpoints if internal only*

---

## 🧪 Testing After Configuration

### Test Admin Login
```bash
curl -X POST https://mediqzy.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mediczy.com","password":"SecurePass123"}'
```

Expected: `HTTP 200` with token in response

### Test CORS Preflight
```bash
curl -i -X OPTIONS https://mediqzy.com/api/admin/login \
  -H "Origin: https://mediqzy.com" \
  -H "Access-Control-Request-Method: POST"
```

Expected: `HTTP 200` with `Access-Control-Allow-*` headers

---

## 🔐 Security Best Practices

1. **Always use HTTPS** for API endpoints
2. **Implement rate limiting** to prevent brute force
3. **Use Cloudflare's DDoS protection** (enabled by default)
4. **Monitor security logs** for suspicious activity
5. **Keep API credentials** in environment variables
6. **Enable MFA** for admin accounts

---

## 📞 Cloudflare Support Resources

- **Firewall Rules Help**: https://support.cloudflare.com/hc/en-us/articles/360016473712
- **Rate Limiting Help**: https://support.cloudflare.com/hc/en-us/articles/115003414752
- **Bot Management**: https://support.cloudflare.com/hc/en-us/articles/360046044492

---

## ⚠️ Troubleshooting

If you still get 403 after creating the rule:

1. **Clear Cloudflare Cache**:
   - Dashboard → Caching → Purge Cache → Purge Everything

2. **Check Rule Priority**:
   - Rules are evaluated top-to-bottom
   - Allow rules should come before Block rules

3. **Verify Origin Header**:
   - Browser Dev Tools → Network tab
   - Check `Origin` header matches configured domain

4. **Disable WAF Temporarily** (for testing):
   - Security → Firewall Rules → Disable all rules
   - Test if login works
   - Re-enable rules one by one to find the culprit

5. **Check Cloudflare Logs**:
   - Analytics → Firewall
   - Look for blocked requests from your IP
   - Note the rule name that blocked it

---

## 💡 Additional Security Configuration

### Enable Web Application Firewall (WAF)
```
Cloudflare → Security → WAF → Managed Rules
- Enable OWASP Core Rules
- Enable Cloudflare Managed Rules
```

### Set Minimum TLS Version
```
Cloudflare → SSL/TLS → Minimum TLS Version
Set to: TLS 1.2 or 1.3
```

### Always HTTPS
```
Cloudflare → SSL/TLS → Always Use HTTPS
Toggle: ON
```

---

## 📝 Implementation Checklist

- [ ] Create firewall rule for `/api/admin/login`
- [ ] Create rate limiting rule for `/api/admin/login`
- [ ] Verify rule priority (Allow rules first)
- [ ] Clear Cloudflare cache
- [ ] Test admin login endpoint
- [ ] Monitor Cloudflare security logs
- [ ] Document custom rules in team wiki
- [ ] Schedule security rule audit (monthly)

