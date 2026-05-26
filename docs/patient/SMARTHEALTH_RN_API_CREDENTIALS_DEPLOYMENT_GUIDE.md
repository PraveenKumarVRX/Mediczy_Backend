# 🚀 DEPLOYMENT & SETUP GUIDE: API Credentials System

**Version**: 1.0  
**Last Updated**: February 8, 2026  
**Status**: ✅ Ready for Production

---

## 📋 Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Phase 1: Database Setup](#phase-1-database-setup)
3. [Phase 2: Application Integration](#phase-2-application-integration)
4. [Phase 3: Testing](#phase-3-testing)
5. [Phase 4: Production Deployment](#phase-4-production-deployment)
6. [Phase 5: Monitoring](#phase-5-monitoring)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## ✅ Pre-Deployment Checklist

### Prerequisites
- [ ] Node.js 16+ installed
- [ ] PostgreSQL 12+ running
- [ ] Database backup created (CRITICAL)
- [ ] Staging environment available
- [ ] Access to `/workspaces/Mediczy` directory
- [ ] Super admin account created in database
- [ ] DevOps team briefed

### Code Review
- [ ] Code review completed for `/server/api/admin/api-credentials.routes.js`
- [ ] Security review completed (bcrypt, auth validation)
- [ ] Performance review completed (indexes on audit table)
- [ ] Database schema validated
- [ ] Documentation reviewed

### Team Readiness
- [ ] DevOps team ready to deploy
- [ ] Support team briefed on new system
- [ ] Super admin team trained on new workflows
- [ ] Mobile development team ready to update app

---

## 🗄️ Phase 1: Database Setup

### Step 1.1: Create Database Backup

```bash
# Backup the database before making changes
cd /workspaces/Mediczy

# Create backup (timestamp: YYYY-MM-DD_HH-MM-SS)
pg_dump -U <db_user> -h <db_host> <db_name> \
  --verbose \
  --file=./database-backup-$(date +%Y-%m-%d_%H-%M-%S).sql

# Verify backup size
ls -lh database-backup-*.sql

# Expected: 50MB - 500MB depending on data size
```

### Step 1.2: Run Database Migration

```bash
# Navigate to workspace
cd /workspaces/Mediczy

# Execute migration (Method 1: Using psql directly)
psql -U <db_user> -h <db_host> -d <db_name> \
  --file=server/database/migrations/001-api-credentials.sql \
  --echo-all

# Expected output:
# CREATE EXTENSION
# CREATE TABLE api_credentials
# CREATE TABLE api_credential_audit_log
# CREATE TABLE api_credential_rotation_templates
# CREATE SEQUENCE
# CREATE FUNCTION generate_client_id
# ... (200+ lines of output)
# SUCCESS: api_credentials table created
# SUCCESS: api_credential_audit_log table created
# SUCCESS: api_credential_rotation_templates table created
```

### Step 1.3: Verify Database Tables

```bash
# Connect to database
psql -U <db_user> -h <db_host> -d <db_name>

# In psql> prompt, run:

-- List all new tables
\dt api_credential*

-- Expected output:
-- Schema |                  Name                   | Type  |  Owner
-- --------+------------------------------------------+-------+----------
--  public | api_credential_audit_log                | table | postgres
--  public | api_credentials                         | table | postgres
--  public | api_credential_rotation_templates       | table | postgres

-- Verify columns in main table
\d api_credentials

-- Verify indexes
SELECT * FROM pg_indexes WHERE tablename LIKE 'api_credential%' ORDER BY tablename;

-- Expected: 10+ indexes per table

-- Verify functions were created
SELECT proname FROM pg_proc WHERE proname LIKE 'generate_client_id%' OR proname LIKE 'log_credential_audit%' OR proname LIKE 'check_credential%' OR proname LIKE 'get_credential_status%';

-- Expected output:
--        proname
-- -----------------------
--  check_credential_expired
--  check_rotation_required
--  generate_client_id
--  get_credential_status
--  log_credential_audit

-- Verify views
SELECT * FROM information_schema.views WHERE table_schema = 'public' AND table_name LIKE 'active_api_credentials%';

-- Expected: 2 views (active_api_credentials, credential_audit_summary)

-- Exit psql
\q
```

### Step 1.4: Verify Migration Success

```bash
# Quick health check script
cat > /tmp/check-migration.sql << 'EOF'
-- Check table row counts (should all be 0 for new tables)
SELECT 'api_credentials' as table_name, COUNT(*) as row_count FROM api_credentials
UNION ALL
SELECT 'api_credential_audit_log', COUNT(*) FROM api_credential_audit_log
UNION ALL
SELECT 'api_credential_rotation_templates', COUNT(*) FROM api_credential_rotation_templates;

-- Check sequence
SELECT last_value FROM api_credential_client_id_seq;

-- Expected output:
--           table_name            | row_count
-- --------------------------------+-----------
--  api_credentials                |         0
--  api_credential_audit_log       |         0
--  api_credential_rotation_templates |    0
-- 
--  last_value
-- -----------
--       1000
EOF

psql -U <db_user> -h <db_host> -d <db_name> -f /tmp/check-migration.sql

# Expected: All tables have 0 rows, sequence starts at 1000
```

**Status**: ✅ Database migration complete!

---

## 🔌 Phase 2: Application Integration

### Step 2.1: Verify Route File Exists

```bash
cd /workspaces/Mediczy

# Check if route file exists
ls -lh server/api/admin/api-credentials.routes.js

# Expected: File should exist and be ~720 lines
wc -l server/api/admin/api-credentials.routes.js

# Expected output: ~720 server/api/admin/api-credentials.routes.js
```

### Step 2.2: Register Routes in app.js

```bash
# Backup app.js first
cp server/app.js server/app.js.backup.$(date +%s)

# Edit app.js to add route registration
# Find this section:
# import authRoutes from './api/auth/index.js';
# app.use('/api/auth', authRoutes);

# Add after existing route registrations:
# import apiCredentialsRoutes from './api/admin/api-credentials.routes.js';
# app.use('/api/admin', apiCredentialsRoutes);
```

**Manual Edit (if not using automated script)**:

```javascript
// In server/app.js, near line 50-100 where routes are registered:

// Add this import at the top with other route imports:
import apiCredentialsRoutes from './api/admin/api-credentials.routes.js';

// Add this registration with other app.use() statements:
app.use('/api/admin', apiCredentialsRoutes);

// The order should be:
// 1. Authentication routes
// 2. Admin routes (NEW)
// 3. Mobile routes
// 4. Web routes
// 5. Error handling middleware
```

### Step 2.3: Verify Environment Variables

```bash
cd /workspaces/Mediczy

# Check .env file has required variables
grep -E "DB_|BCRYPT_|JWT_|NODE_ENV=" .env

# Required variables:
# DB_HOST=<host>
# DB_PORT=<port>
# DB_USER=<user>
# DB_PASSWORD=<password>
# DB_NAME=<name>
# BCRYPT_ROUNDS=12  (for secret hashing)
# JWT_SECRET=<secret>
# NODE_ENV=production

# If missing, add them:
echo "BCRYPT_ROUNDS=12" >> .env
echo "API_CREDENTIAL_ROTATION_DAYS=90" >> .env
echo "API_CREDENTIAL_GRACE_PERIOD_DAYS=7" >> .env
echo "API_CREDENTIAL_EXPIRATION_DAYS=365" >> .env
```

### Step 2.4: Install Dependencies

```bash
cd /workspaces/Mediczy

# Ensure bcryptjs is installed (needed for secret hashing)
npm list bcryptjs

# If not installed:
npm install bcryptjs

# Current version should be: ^2.4.3 or higher
```

### Step 2.5: Test Application Startup

```bash
cd /workspaces/Mediczy

# Start application in test mode
NODE_ENV=test npm start

# Expected output:
# Server starting...
# Connected to database
# Loading routes...
# ✓ Admin routes registered
# ✓ API credentials routes registered
# Server listening on port 3000
# Database connection successful
# All migrations verified

# Let it run for 10 seconds, then stop (Ctrl+C)
```

**Status**: ✅ Routes registered and app starts successfully!

---

## 🧪 Phase 3: Testing

### Step 3.1: Test API Endpoints - Generate Credentials

```bash
# Start the server if not running
cd /workspaces/Mediczy
npm start &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test: Generate API credentials
curl -X POST http://localhost:3000/api/admin/api-credentials/generate \
  -H "Authorization: Bearer <super_admin_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "<org_uuid>",
    "name": "SmartHealth RN - Test",
    "description": "Test credentials for SmartHealth RN mobile app",
    "integration_type": "smarthealth_rn_mobile",
    "scopes": ["mobile:auth", "doctors:search", "appointments:view"]
  }' | jq .

# Expected response:
# {
#   "success": true,
#   "message": "API credentials generated successfully",
#   "data": {
#     "id": "<uuid>",
#     "client_id": "cred_smarthealth_<random>",
#     "status": "active",
#     "created_at": "2026-02-08T...",
#     "client_secret": "<64-char-secret>",  # Only shown once!
#     "scopes": ["mobile:auth", "doctors:search", "appointments:view"]
#   }
# }

# IMPORTANT: Save the client_secret immediately - it won't be shown again!
# Store in secure location (1Password, Vault, etc.)

kill $SERVER_PID
```

### Step 3.2: Test API Endpoints - List Credentials

```bash
npm start &
SERVER_PID=$!
sleep 3

# Test: List all credentials
curl -X GET http://localhost:3000/api/admin/api-credentials \
  -H "Authorization: Bearer <super_admin_jwt_token>" \
  -H "Content-Type: application/json" | jq .

# Expected response shows list of credentials with:
# - id, client_id, name, status, version
# - created_at, last_used_at, rotation_required_at
# - usage_count, failed_attempts
# - No client_secret (sensitive data never returned)

kill $SERVER_PID
```

### Step 3.3: Test Mobile Auth Endpoint

```bash
npm start &
SERVER_PID=$!
sleep 3

# Test: Mobile app authentication with API credentials
curl -X POST http://localhost:3000/api/mobile/auth/api-credentials \
  -H "Authorization: Basic $(echo -n '<client_id>:<client_secret>' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "userPassword123",
    "deviceId": "device-unique-id",
    "pushToken": "fcm-push-token-123456"
  }' | jq .

# Expected response:
# {
#   "success": true,
#   "message": "Authentication successful",
#   "data": {
#     "token": "<jwt-token>",
#     "user": { ... },
#     "expiry": 3600,
#     "deviceId": "device-unique-id"
#   }
# }

kill $SERVER_PID
```

### Step 3.4: Verify Audit Logging

```bash
# Connect to database
psql -U <db_user> -h <db_host> -d <db_name>

-- Check audit log entries
SELECT * FROM api_credential_audit_log 
ORDER BY timestamp DESC 
LIMIT 10;

-- Expected: Should see entries like:
-- id | credential_id | action | action_status | performed_by | timestamp
-- ... | ... | created | success | <uuid> | 2026-02-08T...
-- ... | ... | accessed | success | <uuid> | 2026-02-08T...

\q
```

**Status**: ✅ All endpoints functional and logging!

---

## 🚀 Phase 4: Production Deployment

### Step 4.1: Code Deployment

```bash
cd /workspaces/Mediczy

# Create deployment branch
git checkout -b deploy/api-credentials-system
git add .

# Commit all changes
git commit -m "feat(api): Add API credentials rotation and management system

- Add api-credentials.routes.js with 5 new endpoints
- Add database migration (001-api-credentials.sql)
- Add comprehensive audit logging
- Implement OAuth-like credential management
- Enable credential rotation with grace period
- Support emergency revocation
- HIPAA/DPDP compliant audit trail

Closes: #<issue-number>"

# Push to repo
git push origin deploy/api-credentials-system

# Create pull request for review
echo "Create PR at: https://github.com/<org>/<repo>/pull/new/deploy/api-credentials-system"
```

### Step 4.2: Production Database Migration

```bash
# SSH into production server
ssh <prod_server>
cd /apps/mediczy

# Create backup before deployment
pg_dump -U <prod_db_user> -h <prod_db_host> <prod_db_name> \
  --verbose \
  --file=./backups/db-backup-pre-api-credentials-$(date +%Y-%m-%d_%H-%M-%S).sql

# Run migration on production
psql -U <prod_db_user> -h <prod_db_host> -d <prod_db_name> \
  --file=server/database/migrations/001-api-credentials.sql

# Verify migration success
psql -U <prod_db_user> -h <prod_db_host> -d <prod_db_name> -c \
  "SELECT COUNT(*) FROM api_credentials;"

# Expected: 0 (tables created, no data yet)
```

### Step 4.3: Production Application Deployment

```bash
# On production server
cd /apps/mediczy

# Update code
git pull origin main
git checkout deploy/api-credentials-system

# Merge to main (after PR approval)
git merge --no-ff deploy/api-credentials-system

# Install dependencies
npm ci --production

# Stop existing application
sudo systemctl stop mediczy

# Restart application
sudo systemctl start mediczy

# Check status
sudo systemctl status mediczy

# Monitor logs
tail -f /var/log/mediczy/app.log | grep -E "api-credential|API cred|routes"

# Expected: No errors, routes registered successfully
```

### Step 4.4: Generate First Production Credentials

```bash
# After production deployment, generate first credentials
# You'll need a super admin JWT token

# Using API:
curl -X POST https://api.mediczy.com/api/admin/api-credentials/generate \
  -H "Authorization: Bearer <super_admin_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "<production_org_uuid>",
    "name": "SmartHealth RN - Production",
    "description": "Production credentials for SmartHealth RN mobile app",
    "integration_type": "smarthealth_rn_mobile"
  }'

# CRITICAL: Save the client_secret to secure location immediately
# The secret is only shown once and cannot be retrieved later

# Share credentials with development team:
# 1. Use 1Password or equivalent vault
# 2. Create shared item with client_id and secret
# 3. Set access permissions (specific team members only)
# 4. Enable audit logging for access
# 5. Schedule 90-day rotation reminders
```

**Status**: ✅ Production deployed and first credentials generated!

---

## 📊 Phase 5: Monitoring

### Step 5.1: Setup Monitoring Dashboard

```bash
# Create monitoring script
cat > /opt/mediczy/monitor-api-credentials.sh << 'EOF'
#!/bin/bash

# Monitor API credentials system health
# Run: /opt/mediczy/monitor-api-credentials.sh

DB_HOST="<prod_db_host>"
DB_NAME="<prod_db_name>"
DB_USER="<prod_db_user>"

echo "=== API Credentials System Health Check ==="
echo "Time: $(date)"
echo ""

# 1. Check active credentials count
echo "📊 Active Credentials:"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c \
  "SELECT COUNT(*) FROM api_credentials WHERE is_active = true AND deleted_at IS NULL;"

# 2. Check credentials needing rotation
echo ""
echo "⏰ Credentials Needing Rotation (overdue or due within 14 days):"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c \
  "SELECT name, status, rotation_required_at FROM active_api_credentials 
   WHERE rotation_urgency IN ('OVERDUE', 'UPCOMING') 
   ORDER BY rotation_required_at ASC;"

# 3. Check for revoked credentials
echo ""
echo "🛑 Revoked Credentials (last 7 days):"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c \
  "SELECT name, revoked_at, revocation_reason FROM api_credentials 
   WHERE revoked_at >= NOW() - INTERVAL '7 days';"

# 4. Check recent audit activity
echo ""
echo "📝 Recent Audit Activity (last 24 hours):"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c \
  "SELECT action, COUNT(*) as count, COUNT(*) FILTER (WHERE action_status = 'failure') as failures
   FROM api_credential_audit_log 
   WHERE timestamp >= NOW() - INTERVAL '24 hours'
   GROUP BY action
   ORDER BY count DESC;"

# 5. Check for failed authentication attempts
echo ""
echo "⚠️ Failed Auth Attempts (last 1 hour):"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c \
  "SELECT credential_id, COUNT(*) as fail_count, MAX(timestamp) as latest
   FROM api_credential_audit_log
   WHERE action = 'failed_access' AND timestamp >= NOW() - INTERVAL '1 hour'
   GROUP BY credential_id
   ORDER BY fail_count DESC;"

echo ""
echo "✅ Health check complete"
EOF

chmod +x /opt/mediczy/monitor-api-credentials.sh

# Schedule daily execution at 9 AM
echo "0 9 * * * /opt/mediczy/monitor-api-credentials.sh >> /var/log/mediczy/api-credentials-monitor.log 2>&1" | \
  sudo crontab -

# Run immediately to verify
/opt/mediczy/monitor-api-credentials.sh
```

### Step 5.2: Setup Alerts

```bash
# Alert: Credentials needing rotation (overdue)
# Alert: Failed authentication attempts > 5 in 1 hour
# Alert: Revoked credentials (security incident)
# Alert: Credential expiration within 30 days

# Configure in your monitoring system (DataDog, NewRelic, Prometheus, etc.)
cat > /opt/mediczy/alerts-api-credentials.json << 'EOF'
{
  "alerts": [
    {
      "name": "API Credentials - Rotation Overdue",
      "query": "SELECT COUNT(*) FROM active_api_credentials WHERE rotation_urgency = 'OVERDUE'",
      "threshold": 0,
      "condition": "greater_than",
      "severity": "warning",
      "notify": ["security-team@mediczy.com"]
    },
    {
      "name": "API Credentials - High Failed Attempts",
      "query": "SELECT COUNT(*) FROM api_credential_audit_log WHERE action = 'failed_access' AND timestamp >= NOW() - INTERVAL '1 hour'",
      "threshold": 5,
      "condition": "greater_than",
      "severity": "critical",
      "notify": ["security-team@mediczy.com", "ops-team@mediczy.com"]
    },
    {
      "name": "API Credentials - Recently Revoked",
      "query": "SELECT COUNT(*) FROM api_credentials WHERE revoked_at >= NOW() - INTERVAL '1 hour'",
      "threshold": 0,
      "condition": "greater_than",
      "severity": "critical",
      "notify": ["security-team@mediczy.com"]
    },
    {
      "name": "API Credentials - Expiring Soon",
      "query": "SELECT COUNT(*) FROM api_credentials WHERE expiration_status = 'EXPIRING_SOON'",
      "threshold": 0,
      "condition": "greater_than",
      "severity": "warning",
      "notify": ["security-team@mediczy.com"]
    }
  ]
}
EOF
```

### Step 5.3: Setup Weekly Report

```bash
# Create weekly report generation
cat > /opt/mediczy/weekly-api-credentials-report.sh << 'EOF'
#!/bin/bash

DB_HOST="<prod_db_host>"
DB_NAME="<prod_db_name>"
DB_USER="<prod_db_user>"

REPORT_FILE="/tmp/api-credentials-week-report-$(date +%Y-%m-%d).txt"

cat > $REPORT_FILE << 'REPORT'
=================================================================
API CREDENTIALS MANAGEMENT - WEEKLY REPORT
Generated: $(date)
=================================================================

1. CREDENTIAL STATUS SUMMARY
$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
  SELECT 
    status, 
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM api_credentials WHERE deleted_at IS NULL), 2) as percentage
  FROM api_credentials 
  WHERE deleted_at IS NULL
  GROUP BY status
  ORDER BY count DESC;
")

2. CREDENTIALS REQUIRING ATTENTION
$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
  SELECT name, status, rotation_required_at, expiration_status
  FROM active_api_credentials
  WHERE rotation_urgency IN ('OVERDUE', 'UPCOMING')
     OR expiration_status IN ('EXPIRED', 'EXPIRING_SOON')
  ORDER BY rotation_required_at ASC
  LIMIT 10;
")

3. AUDIT ACTIVITY (Week Summary)
$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
  SELECT action, COUNT(*) as count
  FROM api_credential_audit_log
  WHERE timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '7 days')
  GROUP BY action
  ORDER BY count DESC;
")

4. SECURITY EVENTS
$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
  SELECT 
    'Revoked' as event, COUNT(*) as count
  FROM api_credentials
  WHERE revoked_at >= DATE_TRUNC('week', NOW() - INTERVAL '7 days')
  UNION ALL
  SELECT 'Failed Auth Attempts', COUNT(*)
  FROM api_credential_audit_log
  WHERE action = 'failed_access' 
    AND timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '7 days');
")

5. RECOMMENDATIONS
- [ ] Review credentials with OVERDUE rotation status
- [ ] Plan rotations for credentials with UPCOMING status
- [ ] Investigate failed authentication attempts
- [ ] Verify all active credentials are in use

Generated: $(date)
=================================================================
REPORT

# Send report via email
mail -s "API Credentials - Weekly Report $(date +%Y-%m-%d)" security-team@mediczy.com < $REPORT_FILE

# Keep report in archive
cp $REPORT_FILE /var/log/mediczy/api-credentials-reports/

echo "Weekly report generated: $REPORT_FILE"
EOF

chmod +x /opt/mediczy/weekly-api-credentials-report.sh

# Schedule for every Monday at 10 AM
echo "0 10 * * 1 /opt/mediczy/weekly-api-credentials-report.sh" | \
  sudo crontab -
```

**Status**: ✅ Monitoring and alerting configured!

---

## 🔄 Rollback Procedures

### If Deployment Fails

```bash
# Step 1: Restore database from backup
psql -U <db_user> -h <db_host> -d <db_name> < /path/to/backup.sql

# Step 2: Revert application code
cd /workspaces/Mediczy
git reset --hard HEAD~1
git push --force origin main

# Step 3: Restart application
sudo systemctl restart mediczy

# Step 4: Verify rollback
curl http://localhost:3000/api/health
tail -f /var/log/mediczy/app.log

# Step 5: Notify team
# "Rollback complete. Investigating issue before re-deployment."
```

### If Database Migration Fails

```bash
# Connect to database
psql -U <db_user> -h <db_host> -d <db_name>

-- Drop new tables (if partially created)
DROP TABLE IF EXISTS api_credential_audit_log CASCADE;
DROP TABLE IF EXISTS api_credentials CASCADE;
DROP TABLE IF EXISTS api_credential_rotation_templates CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS log_credential_audit CASCADE;
DROP FUNCTION IF EXISTS generate_client_id CASCADE;

-- Drop sequences
DROP SEQUENCE IF EXISTS api_credential_client_id_seq;

-- Exit and verify no trace of new objects
\q

-- Verify rollback
psql -U <db_user> -h <db_host> -d <db_name> -c \
  "\dt api_credential*"
  
# Expected: No tables listed
```

---

## 🔧 Troubleshooting

### Issue: Routes Not Loading

```bash
# Check logs
tail -f /var/log/mediczy/app.log | grep -i "routes\|credential"

# Verify route file syntax
npm run lint server/api/admin/api-credentials.routes.js

# Verify import in app.js
grep "api-credentials" server/app.js

# Test import directly
node -e "import('./server/api/admin/api-credentials.routes.js').then(() => console.log('Import OK'))"
```

### Issue: Database Connection Error

```bash
# Verify database is running
pg_isready -h <db_host> -p <db_port>

# Expected: "accepting connections"

# Verify credentials
psql -U <db_user> -h <db_host> -d <db_name> -c "SELECT 1"

# Check environment variables
echo $DB_HOST $DB_USER $DB_NAME
```

### Issue: Bcrypt Hashing Errors

```bash
# Verify bcryptjs is installed
npm list bcryptjs

# Test bcrypt directly
node -e "const bc = require('bcryptjs'); const h = bc.hashSync('test'); console.log(h);"

# Should output a bcrypt hash (starts with $2a$ or $2b$)
```

### Issue: Audit Logging Not Working

```bash
# Check if function exists
psql -U <db_user> -h <db_host> -d <db_name> -c \
  "SELECT proname FROM pg_proc WHERE proname = 'log_credential_audit';"

# Expected: log_credential_audit

# Test function manually
psql -U <db_user> -h <db_host> -d <db_name> -c "
  SELECT log_credential_audit(
    NULL::uuid,  -- credential_id (NULL for test)
    '<org_uuid>'::uuid,  -- organization_id
    'test_action',  -- action
    NULL::uuid,  -- performed_by
    'admin'  -- performer_role
  );
"

# Should return a UUID
```

---

## ✅ Post-Deployment Verification Checklist

After deployment, verify:

- [ ] Database tables created successfully
- [ ] All indexes exist
- [ ] All functions deployed
- [ ] Routes register without errors
- [ ] Application starts successfully
- [ ] Generate API credentials test works
- [ ] List credentials endpoint works
- [ ] Mobile auth endpoint works
- [ ] Audit logging records actions
- [ ] First production credentials generated
- [ ] Credentials shared securely with team
- [ ] Super admin dashboard accessible
- [ ] Monitoring dashboards show data
- [ ] Weekly reports being generated
- [ ] Alert system triggered (test)
- [ ] Documentation shared with team

---

## 📞 Support & Escalation

### Critical Issues (Page on-call)
- Database migration failure
- Application won't start
- Credentials can't be generated
- Authentication failing for all users

### High Priority (Within 1 hour)
- Audit logging not working
- Routes not accessible
- Failed attempts tracking not recording
- Credential revocation not working

### Normal Priority (Within business hours)
- Monitoring alerts not configured
- Weekly reports not generating
- UI dashboard issues
- Documentation updates

---

## 📝 Sign-Off

- [ ] Deployment Lead: __________________ Date: ________
- [ ] Database Admin: __________________ Date: ________
- [ ] Security Lead: __________________ Date: ________
- [ ] Super Admin Lead: __________________ Date: ________

---

**Deployment completed successfully!** 🎉

Next steps:
1. Update SmartHealth RN app to use new endpoint
2. Submit app to app stores
3. Monitor first week of production usage
4. Gather feedback from users and support team
5. Schedule 90-day rotation reviews

