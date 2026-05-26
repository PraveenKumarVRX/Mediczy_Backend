# Tenant Security - Quick Reference

## 🔴 Critical Environment Variables

```bash
# .env.production - REQUIRED SETTINGS

# Tenant Security (CRITICAL)
ALLOW_TENANT_HEADER=false  # ⚠️ MUST be false in production!

# Email Service (for tenant verification)
SENDGRID_API_KEY=SG.xxx...  # Get from SendGrid dashboard
FROM_EMAIL=noreply@mayden.in

# Node Environment
NODE_ENV=production
```

## 🚀 Quick Deploy Commands

### 1. Deploy Security Fixes

```bash
# From development machine
cd /workspaces/Mediczy
git add server/middleware/tenant-context.js \
        server/services/tenant-audit.service.js \
        server/migrations/add-tenant-security.sql \
        TENANT_SECURITY_FIXES.md
git commit -m "feat: Add tenant security enhancements (RLS, audit, context)"
git push origin main

# On production server
ssh -i .venv/bin/mediqzy.pem ubuntu@13.234.17.52
cd /home/ubuntu/Mediczy
git pull origin main
./restart.sh
```

### 2. Run Database Migration

```bash
# On production server
PGPASSWORD='Mediczy2024Helper' psql \
  -h localhost \
  -U mediczy_helper \
  -d mediczy_ai \
  -f server/migrations/add-tenant-security.sql
```

### 3. Verify RLS is Enabled

```sql
-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND rowsecurity = true;

-- Expected output:
--  schemaname | tablename | rowsecurity
-- ------------+-----------+-------------
--  public     | users     | t
--  public     | api_users | t
--  public     | appointments | t
--  (etc...)
```

## 🛡️ Security Checklist

- [ ] `ALLOW_TENANT_HEADER=false` in production
- [ ] Database migration completed
- [ ] RLS policies enabled (verify with SQL above)
- [ ] Audit table created
- [ ] SendGrid API key configured
- [ ] Services restarted
- [ ] Test cross-tenant access blocked
- [ ] Monitor audit logs
- [ ] Setup alerts for suspicious activity

## 🔍 Common Issues & Solutions

### Issue 1: Header Override Warning in Logs

```
⚠️  SECURITY WARNING: ALLOW_TENANT_HEADER is enabled in production!
```

**Solution**:
```bash
# Update .env
echo "ALLOW_TENANT_HEADER=false" >> /home/ubuntu/Mediczy/.env
./restart.sh
```

### Issue 2: RLS Blocking All Queries

**Symptom**: Queries return empty results

**Solution** Check tenant context is set:
```sql
-- Current setting
SHOW app.current_tenant;

-- If empty, set it:
SET LOCAL app.current_tenant = '1';
```

**Code Fix**: Ensure middleware sets context:
```javascript
import { autoSetTenantContext } from './middleware/tenant-context.js';
app.use(extractTenant);
app.use(autoSetTenantContext); // ✅ Sets context
```

### Issue 3: Migration Fails on Missing Tables

**Error**: `relation "users" does not have column "tenant_id"`

**Solution**: Table doesn't have tenant_id yet (expected for some tables)
```sql
-- Migration handles this gracefully with IF EXISTS checks
-- No action needed - migration skips tables without tenant_id
```

## 📊 Monitoring Queries

### Check Failed Access Attempts (Last 24h)

```sql
SELECT 
  user_id,
  requested_tenant_id,
  COUNT(*) as attempts,
  array_agg(DISTINCT ip_address) as ips
FROM tenant_access_audit
WHERE success = false
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id, requested_tenant_id
ORDER BY attempts DESC
LIMIT 20;
```

### Check Tenant Access Statistics (Today)

```sql
SELECT 
  requested_tenant_id as tenant,
  COUNT(*) as total,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  COUNT(DISTINCT user_id) as unique_users
FROM tenant_access_audit
WHERE created_at >= CURRENT_DATE
GROUP BY requested_tenant_id
ORDER BY total DESC;
```

### Get Suspicious Users (3+ Failures)

```sql
SELECT * FROM v_suspicious_tenant_access;
```

## 🧪 Test Commands

### Test 1: Tenant Isolation

```bash
# Get token for tenant 1
TOKEN1=$(curl -s -X POST https://api.mayden.in/v1/auth/exchange \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": 1, ...}' | jq -r '.access_token')

# Try to access tenant 2 data
curl -X GET https://api.mayden.in/v1/2/users \
  -H "Authorization: Bearer $TOKEN1"

# Expected: 403 Forbidden
```

### Test 2: RLS Enforcement

```sql
-- Set tenant 1
SET LOCAL app.current_tenant = '1';
SELECT COUNT(*) FROM users; -- Returns tenant 1 users only

-- Set tenant 2
SET LOCAL app.current_tenant = '2';
SELECT COUNT(*) FROM users; -- Returns tenant 2 users only
```

### Test 3: Audit Logging

```bash
# Make request
curl -X GET https://api.mayden.in/v1/1/users -H "Authorization: Bearer $TOKEN"

# Check audit log (on server)
PGPASSWORD='Mediczy2024Helper' psql -h localhost -U mediczy_helper -d mediczy_ai -c \
  "SELECT * FROM tenant_access_audit ORDER BY created_at DESC LIMIT 1;"
```

## 🔐 Security Commands

### Lock Down Production

```bash
# Set correct permissions on sensitive files
chmod 600 .env .env.production
chmod 600 .venv/bin/mediqzy.pem

# Disable header override
grep -q "ALLOW_TENANT_HEADER=false" .env || echo "ALLOW_TENANT_HEADER=false" >> .env

# Verify
cat .env | grep ALLOW_TENANT_HEADER
# Should output: ALLOW_TENANT_HEADER=false
```

### Rotate Verification Tokens

```sql
-- Expire old tokens (90 days)
UPDATE tenants
SET metadata = jsonb_set(
  metadata, 
  '{verification_token}', 
  'null'
)
WHERE metadata->>'verification_sent_at' < (NOW() - INTERVAL '90 days')::TEXT;
```

### Clear Old Audit Logs (Retention)

```sql
-- Keep 90 days of audit logs
DELETE FROM tenant_access_audit
WHERE created_at < NOW() - INTERVAL '90 days';

-- Vacuum to reclaim space
VACUUM ANALYZE tenant_access_audit;
```

## 📞 Emergency Contacts

**Security Incident**:
1. Disable tenant header override: `ALLOW_TENANT_HEADER=false`
2. Check audit logs: `SELECT * FROM v_suspicious_tenant_access;`
3. Lock affected user accounts
4. Rotate credentials
5. Review recent access patterns

**RLS Issues**:
1. Check policy status: `SELECT * FROM pg_policies;`
2. Verify session variable: `SHOW app.current_tenant;`
3. Review middleware: Check `autoSetTenantContext` is applied
4. Temporarily disable RLS: `ALTER TABLE tablename DISABLE ROW LEVEL SECURITY;`

## 📚 Documentation Links

- **Full Guide**: [TENANT_SECURITY_FIXES.md](TENANT_SECURITY_FIXES.md)
- **Audit Report**: [TENANT_SETUP_AUDIT.md](TENANT_SETUP_AUDIT.md)
- **Summary**: [TENANT_AUDIT_SUMMARY.md](TENANT_AUDIT_SUMMARY.md)

---

**Last Updated**: February 6, 2026  
**Quick Help**: `cat TENANT_SECURITY_QUICK_REF.md | grep "##"`
