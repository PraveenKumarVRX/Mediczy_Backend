# 📖 PRODUCTION DEPLOYMENT RUNBOOK

**Date:** January 12, 2026  
**System:** Mediczy Healthcare Platform  
**Changes:** 10 Patient Login Issues - All Implemented  

---

## ⚠️ PRE-DEPLOYMENT CHECKLIST

### 24 Hours Before Deployment

- [ ] All UAT tests passed
- [ ] Security review complete
- [ ] Performance tests acceptable
- [ ] Backup strategy verified
- [ ] Rollback procedure documented
- [ ] Team notified of change window
- [ ] Stakeholders informed
- [ ] Database backups current

### 1 Hour Before Deployment

- [ ] Team assembled and ready
- [ ] All tools tested and working
- [ ] Network connectivity verified
- [ ] Database access confirmed
- [ ] Load balancer ready
- [ ] Monitoring alerts configured
- [ ] Communication channels open
- [ ] Runbook reviewed by team

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Pre-Deployment Verification (5 minutes)

```bash
# Check system health
curl -s http://localhost:3000/health | jq .

# Verify database connectivity
mysql -u user -p -e "SELECT COUNT(*) FROM users;"

# Check disk space
df -h | grep -E "Size|/var"

# Check CPU/Memory
free -h
top -bn1 | head -5
```

**Success Criteria:**
- [ ] All endpoints responding
- [ ] Database connected
- [ ] Disk space > 2GB free
- [ ] CPU usage < 50%
- [ ] Memory usage < 80%

---

### Step 2: Create Database Backup (5 minutes)

```bash
# Create timestamped backup
BACKUP_FILE="/backups/mediczy/pre_deployment_$(date +%Y%m%d_%H%M%S).sql"
mkdir -p /backups/mediczy

# Backup using appropriate method
mysqldump -u root -p --all-databases > "$BACKUP_FILE"
gzip "$BACKUP_FILE"

# Verify backup
ls -lh "$BACKUP_FILE.gz"
echo "Backup size: $(du -h $BACKUP_FILE.gz)"

# Store backup location for rollback
echo "Backup: $BACKUP_FILE.gz" > /backups/mediczy/CURRENT_BACKUP.txt
```

**Success Criteria:**
- [ ] Backup file created
- [ ] File size > 100MB
- [ ] Backup compressed
- [ ] Backup location recorded

---

### Step 3: Deploy Frontend (10 minutes)

```bash
cd /home/ubuntu/Mediczy/client

# Install dependencies
npm install --frozen-lockfile

# Build production bundle
npm run build

# Verify build output
ls -la dist/
du -h dist/

# Deploy to web root
sudo rsync -av --delete dist/ /var/www/mediczy/

# Set permissions
sudo chown -R www-data:www-data /var/www/mediczy
sudo chmod -R 755 /var/www/mediczy
```

**Success Criteria:**
- [ ] Build completes without errors
- [ ] dist/ directory exists with files
- [ ] Files synced to /var/www/mediczy
- [ ] Permissions set correctly

---

### Step 4: Deploy Backend (10 minutes)

```bash
cd /home/ubuntu/Mediczy/server

# Install dependencies
npm install --production --frozen-lockfile

# Verify new routes exist
grep -l "uploadRouter\|healthAssessmentRouter\|reportAnalysisRouter" app.js

# Check for syntax errors
node -c app.js

# Set permissions on upload directory
mkdir -p /home/ubuntu/Mediczy/uploads/reports
chmod 755 /home/ubuntu/Mediczy/uploads/reports
```

**Success Criteria:**
- [ ] All dependencies installed
- [ ] New routes found in app.js
- [ ] No syntax errors
- [ ] Upload directory exists with correct permissions

---

### Step 5: Start Services (5 minutes)

```bash
# Option 1: Using systemd (if configured)
sudo systemctl restart mediczy-server
sudo systemctl restart mediczy-client

# Option 2: Using Docker (if containerized)
docker-compose -f /home/ubuntu/Mediczy/docker-compose.yml up -d

# Option 3: Using PM2 (if configured)
pm2 restart mediczy-server
pm2 restart mediczy-client

# Wait for services to start
sleep 5

# Verify services are running
ps aux | grep -E "node|nginx" | grep -v grep
```

**Success Criteria:**
- [ ] Services started without errors
- [ ] No error messages in logs
- [ ] Services are running
- [ ] Processes are stable

---

### Step 6: Health Checks (5 minutes)

```bash
# Check backend health
echo "Backend health check..."
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/health

# Check frontend availability
echo "Frontend health check..."
curl -s http://localhost:3000/ | head -10

# Check new endpoints
echo "Checking new endpoints..."
curl -s http://localhost:3000/api/reports \
  -H "Authorization: Bearer test" \
  -H "Content-Type: application/json" | head -20

curl -s http://localhost:3000/api/health-assessment \
  -H "Authorization: Bearer test" | head -20

# Check error logs
echo "Checking error logs..."
tail -20 /var/log/mediczy/server.log
tail -20 /var/log/mediczy/client.log
```

**Success Criteria:**
- [ ] Backend health endpoint responds
- [ ] Frontend loads successfully
- [ ] All new endpoints accessible
- [ ] No error messages in logs

---

### Step 7: Smoke Tests (10 minutes)

Run minimal smoke tests to ensure core functionality:

```bash
# Test 1: Login endpoint works
echo "Test 1: Login endpoint..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"test123"}')
echo "Response: $LOGIN_RESPONSE"

# Test 2: Health assessment endpoint accessible
echo "Test 2: Health assessment endpoint..."
curl -s http://localhost:3000/api/health-assessment \
  -H "Authorization: Bearer dummy_token" | head -5

# Test 3: Upload endpoint accessible
echo "Test 3: Upload endpoint..."
curl -s -I -X POST http://localhost:3000/api/reports/upload \
  -H "Authorization: Bearer dummy_token"

# Test 4: Database connectivity
echo "Test 4: Database connectivity..."
mysql -u root -p -e "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "Query failed"
```

**Success Criteria:**
- [ ] Login endpoint responds
- [ ] Health assessment endpoint accessible
- [ ] Upload endpoint responding
- [ ] Database queries successful

---

## ⚡ POST-DEPLOYMENT

### Immediate Actions (First 30 minutes)

```bash
# Monitor application logs in real-time
tail -f /var/log/mediczy/server.log &
tail -f /var/log/mediczy/client.log &

# Monitor system resources
watch -n 5 'free -h && echo "---" && top -bn1 | head -10'

# Check error rate
tail -100 /var/log/mediczy/server.log | grep -i error | wc -l
```

### First Hour Monitoring

- [ ] No spike in error logs
- [ ] No unusual CPU usage
- [ ] No memory leaks
- [ ] All endpoints responding
- [ ] Database queries performing normally
- [ ] Users can login successfully
- [ ] New features accessible

### First 24 Hours Monitoring

- [ ] Monitor error rates continuously
- [ ] Check slow query logs
- [ ] Review user feedback
- [ ] Watch for any bugs reported
- [ ] Verify all 10 fixes working
- [ ] Check file upload functionality
- [ ] Verify health assessment calculations
- [ ] Test video consultation flow

---

## 🔄 ROLLBACK PROCEDURE

If issues occur, follow this procedure:

### Immediate Rollback (< 2 minutes)

```bash
# Step 1: Stop services
sudo systemctl stop mediczy-server mediczy-client
# OR
docker-compose -f /home/ubuntu/Mediczy/docker-compose.yml down
# OR
pm2 stop mediczy-server mediczy-client

# Step 2: Restore previous frontend
sudo rm -rf /var/www/mediczy
sudo git -C /home/ubuntu/Mediczy/client checkout HEAD~1 dist/ || true

# Step 3: Restore previous backend code
git -C /home/ubuntu/Mediczy/server checkout HEAD~1
npm install

# Step 4: Restart services
sudo systemctl start mediczy-server mediczy-client
# OR
docker-compose -f /home/ubuntu/Mediczy/docker-compose.yml up -d
# OR
pm2 start mediczy-server mediczy-client

# Step 5: Verify
curl -s http://localhost:3000/health
```

### Database Rollback (If needed)

```bash
# Find latest backup
ls -lat /backups/mediczy/*.sql.gz | head -1

# Extract backup
BACKUP_FILE="/backups/mediczy/pre_deployment_20260112_XXXXXX.sql.gz"
gunzip -c "$BACKUP_FILE" > /tmp/restore.sql

# Restore database
mysql -u root -p < /tmp/restore.sql

# Verify restoration
mysql -u root -p -e "SELECT COUNT(*) FROM users;"

# Clean up
rm -f /tmp/restore.sql
```

**Rollback Time:** ~5 minutes

---

## 📞 INCIDENT RESPONSE

### If critical issue occurs:

1. **Immediate:** Page on-call team
2. **5 minutes:** Initiate rollback if needed
3. **10 minutes:** Communicate status to stakeholders
4. **15 minutes:** Post-incident review begins
5. **1 hour:** Root cause analysis
6. **24 hours:** Full incident report

---

## 📊 DEPLOYMENT REPORT TEMPLATE

```markdown
# Production Deployment Report
**Date:** $(date)
**Deployed By:** __________________
**Reviewed By:** __________________

## Pre-Deployment
- [ ] All checks passed
- [ ] Team ready
- [ ] Backup created
- [ ] Rollback tested

## Deployment
- Start Time: __________
- End Time: __________
- Duration: __________
- Issues: None / See below

## Post-Deployment
- [ ] All endpoints responding
- [ ] No error spike
- [ ] Users can access system
- [ ] New features working

## Issues Encountered
(List any issues and resolutions)

## Sign-Off
- QA Lead: __________________ 
- Ops Lead: __________________
- Manager: __________________
```

---

## 🎯 SUCCESS CRITERIA

Deployment is considered successful when:

✅ All 10 fixes are working  
✅ No regression in existing features  
✅ Error rate < 0.1%  
✅ Response time < 1 second (99th percentile)  
✅ Database queries performing normally  
✅ No critical alerts in monitoring  
✅ Users can complete workflows  
✅ New endpoints accessible and functional  

---

## 📋 EMERGENCY CONTACTS

**On-Call Team:**
- Backend Lead: [phone]
- DevOps: [phone]
- Database Admin: [phone]
- Security: [phone]

**Escalation:**
- If no response in 5 minutes → Page manager
- If no response in 10 minutes → Trigger incident protocol

---

**RUNBOOK VERSION:** 1.0  
**LAST UPDATED:** January 12, 2026  
**NEXT REVIEW:** After first production deployment

