# Deployment Checklist for mediqzy.com

## ✅ Code Merge Status: COMPLETE

**Commit Hash:** `8ebc8d9`  
**Branch:** `main`  
**Status:** ✅ **Pushed to origin/main**  
**Date:** January 9, 2026

---

## 📋 Pre-Deployment Checklist

### Code Preparation
- [x] All code changes committed to git
- [x] Comprehensive commit message created
- [x] Code pushed to origin/main
- [x] No uncommitted changes remaining
- [x] Git history clean and linear

### Environment Setup
- [ ] Production environment file created (`.env.production`)
- [ ] JWT_SECRET configured (64+ character random string)
- [ ] Database credentials configured
- [ ] CORS origins set to mediqzy.com and www.mediqzy.com
- [ ] SSL certificates prepared and validated

### Frontend Build
- [ ] Dependencies installed: `npm install --prefix client`
- [ ] Build succeeds without errors: `npm run build --prefix client`
- [ ] Output directory created: `client/dist/`
- [ ] Static files optimized and minified
- [ ] Source maps available for debugging

### Backend Preparation
- [ ] Dependencies installed: `npm install --prefix server`
- [ ] Environment variables verified
- [ ] Database connection tested
- [ ] API routes validated
- [ ] PM2 ecosystem config reviewed

### Database
- [ ] Database server running and accessible
- [ ] Database user created with proper permissions
- [ ] Database migrations reviewed
- [ ] Backup created before deployment
- [ ] Migration scripts prepared

### Infrastructure
- [ ] SSL certificates installed in `/etc/ssl/certs/`
- [ ] Nginx configuration prepared
- [ ] Nginx configuration syntax valid: `sudo nginx -t`
- [ ] PM2 ecosystem.config.js validated
- [ ] Log directories created with proper permissions
- [ ] Firewall rules configured (ports 80, 443)

### Monitoring & Logging
- [ ] PM2 monitoring enabled
- [ ] Log rotation configured
- [ ] Error tracking service (Sentry) configured
- [ ] Performance monitoring (New Relic) configured
- [ ] Uptime monitoring service configured

---

## 🚀 Deployment Steps

### Step 1: Pre-Deployment Verification (5 minutes)
```bash
# Run verification script
bash /home/ubuntu/Mediczy/pre-deployment-verification.sh

# Expected output:
# ✅ PRE-DEPLOYMENT VERIFICATION PASSED!
```

### Step 2: Create Database Backup (5 minutes)
```bash
# Backup current database
mysqldump -u root -p mediczy > /backup/mediczy_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh /backup/mediczy_*.sql | tail -1
```

### Step 3: Build Frontend (5-10 minutes)
```bash
# Navigate to client directory
cd /home/ubuntu/Mediczy/client

# Install dependencies
npm install

# Build for production
npm run build

# Verify build succeeded
ls -la dist/
# Expected: index.html, assets/ folder, etc.
```

### Step 4: Deploy Backend Services (5 minutes)
```bash
# Navigate to root
cd /home/ubuntu/Mediczy

# Load production environment
export $(cat .env.production | grep -v '^#' | xargs)

# Start all services with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Verify all processes started
pm2 status
# Expected: All apps showing "online"

# Check logs for errors
pm2 logs mediczy-server --lines 20
```

### Step 5: Configure Nginx (5 minutes)
```bash
# Copy Nginx configuration
sudo cp /home/ubuntu/Mediczy/nginx.conf /etc/nginx/sites-available/mediqzy.com

# Enable site
sudo ln -sf /etc/nginx/sites-available/mediqzy.com /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t
# Expected: "syntax is ok"

# Reload Nginx
sudo systemctl reload nginx

# Verify Nginx running
sudo systemctl status nginx
```

### Step 6: Verify SSL Certificates (5 minutes)
```bash
# Check certificate validity
openssl x509 -in /path/to/certificate.crt -noout -dates

# Expected: notBefore and notAfter dates
# Ensure certificate is valid (not Before today and not After > 30 days)

# Verify certificate chain
openssl verify -untrusted /path/to/ca_bundle.crt /path/to/certificate.crt
```

### Step 7: Health Checks (10 minutes)
```bash
# Test API endpoint
curl -I https://mediqzy.com/api/health

# Expected: HTTP/1.1 200 OK

# Test frontend
curl -I https://mediqzy.com/

# Expected: HTTP/1.1 200 OK

# Check database connection
curl -s https://mediqzy.com/api/health | jq '.database'

# Expected: "connected" or similar

# Verify services running
pm2 status

# Expected: All apps showing "online" with positive uptime
```

### Step 8: Smoke Tests (15 minutes)
```bash
# Test user login
curl -X POST https://mediqzy.com/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Test doctor login
curl -X POST https://mediqzy.com/api/doctor/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@example.com","password":"testpass123"}'

# Test patient list fetch
TOKEN="your-valid-jwt-token"
curl -H "Authorization: Bearer $TOKEN" https://mediqzy.com/api/doctors/my-patients

# Test video consultations
curl -H "Authorization: Bearer $TOKEN" https://mediqzy.com/api/doctors/video-consultations/upcoming

# Test billing
curl -H "Authorization: Bearer $TOKEN" https://mediqzy.com/api/billing/doctor/invoices
```

### Step 9: Monitor Initial Deployment (30 minutes)
```bash
# Watch logs in real-time
pm2 logs mediczy-server

# Monitor Nginx
sudo tail -f /var/log/nginx/access.log | grep mediqzy.com

# Check system resources
top -n 1 | head -15

# Monitor error rate
tail -f /var/log/app.log | grep -i error
```

---

## 📊 Post-Deployment Verification

### Immediate Checks (First 5 minutes)
- [ ] All PM2 processes showing "online"
- [ ] No critical errors in logs
- [ ] Website loads at https://mediqzy.com
- [ ] API responds to health check
- [ ] Database connected and responsive

### Functional Tests (5-15 minutes)
- [ ] User can login
- [ ] Doctor can login
- [ ] Patient list loads
- [ ] Video consultation page works
- [ ] Billing page loads
- [ ] Can create new patient
- [ ] Can create invoice

### Performance Checks (15-30 minutes)
- [ ] Page load time < 2 seconds
- [ ] API response time < 500ms
- [ ] No JavaScript errors in browser console
- [ ] Images load properly
- [ ] Responsive design works on mobile

### Security Checks (10 minutes)
- [ ] SSL certificate valid
- [ ] HTTPS redirect working
- [ ] CORS headers correct
- [ ] Authentication tokens working
- [ ] Database not exposed

### Monitoring Setup (10 minutes)
- [ ] PM2 monitoring active
- [ ] Log aggregation running
- [ ] Error tracking capturing errors
- [ ] Performance monitoring enabled
- [ ] Uptime monitoring started

---

## 🔄 Rollback Procedure

If critical issues occur:

### Option 1: Revert Code (Fast Rollback)
```bash
# Identify previous stable commit
git log --oneline | head -5

# Revert to previous commit
git revert HEAD
git push origin main

# Rebuild and restart
npm run build --prefix client
pm2 restart all
```

### Option 2: Restore from Backup
```bash
# Stop services
pm2 stop all

# Restore database from backup
mysql -u root -p mediczy < /backup/mediczy_YYYYMMDD_HHMMSS.sql

# Restart services
pm2 start all
```

### Option 3: Manual Rollback
```bash
# Switch to previous branch/tag
git checkout <previous-tag>

# Rebuild
npm run build --prefix client

# Clear PM2 and restart
pm2 flush
pm2 start ecosystem.config.js --env production
```

---

## 📞 Support & Escalation

### During Deployment
- **Technical Lead:** On standby for escalation
- **Database Admin:** Available for database issues
- **DevOps Engineer:** Available for infrastructure issues

### Contact Information
- Incident Report: Create issue in GitHub
- Escalation: Contact technical lead
- Emergency: Page on-call engineer

---

## 📝 Deployment Log Template

### Deployment Information
```
Date: _______________
Time Started: _______________
Time Completed: _______________
Deployed By: _______________
Approved By: _______________

Commit Hash: 8ebc8d9
Branch: main
Version: v2.0
```

### Pre-Deployment
```
✓ Code merged to main
✓ Environment configured
✓ Database backup created
✓ SSL certificates verified
✓ Verification script passed
```

### Deployment
```
✓ Frontend built
✓ Backend services started
✓ Nginx configured
✓ Health checks passed
✓ Smoke tests completed
```

### Post-Deployment
```
✓ All systems operational
✓ Performance acceptable
✓ Monitoring active
✓ No critical errors
```

### Issues Encountered
```
None

or

[List any issues and resolutions]
```

---

## ✅ Sign-Off

- [ ] All deployment steps completed
- [ ] All verification checks passed
- [ ] No critical issues identified
- [ ] Monitoring and alerting active
- [ ] Team notified of successful deployment
- [ ] Documentation updated

---

## 📚 Related Documentation

- [DEPLOYMENT_TO_MEDIQZY_PLAN.md](./DEPLOYMENT_TO_MEDIQZY_PLAN.md) - Detailed deployment guide
- [DOCTOR_PORTAL_FIXES_COMPLETE.md](./DOCTOR_PORTAL_FIXES_COMPLETE.md) - Doctor portal fixes overview
- [DOCTOR_PORTAL_TECHNICAL_DETAILS.md](./DOCTOR_PORTAL_TECHNICAL_DETAILS.md) - Technical details
- [DHYAN_HOSPITAL_COMPLETE_SETUP.md](./DHYAN_HOSPITAL_COMPLETE_SETUP.md) - Hospital multitenancy setup
- [pre-deployment-verification.sh](./pre-deployment-verification.sh) - Automated verification script

---

## 🎯 Key Metrics for Success

| Metric | Target | Status |
|--------|--------|--------|
| Page Load Time | < 2s | ___ |
| API Response | < 500ms | ___ |
| Uptime | > 99.9% | ___ |
| Error Rate | < 0.1% | ___ |
| SSL Score | A+ | ___ |
| Performance Score | > 90 | ___ |

---

**Deployment Status: READY FOR PRODUCTION** ✅

All code, documentation, and procedures are ready for deployment to mediqzy.com.

Generated: January 9, 2026
