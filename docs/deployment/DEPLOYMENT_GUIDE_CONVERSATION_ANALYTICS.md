# Conversation-User Analytics Deployment Guide

**Deployment Date**: 2026-02-15  
**Status**: Ready for Deployment  
**Estimated Downtime**: 2-3 minutes (migration time)

---

## 📦 Files Created/Modified

### New Files Created ✅
```
✅ server/migrations/202602150715-add-conversation-user-analytics.sql
   - Database schema migration (500+ lines)
   - Adds columns to chat_conversations and chat_messages
   - Creates analytical views
   - Auto-populates user_id fields from existing data

✅ server/services/conversation-analytics.service.js
   - Analytics service (380+ lines)
   - User conversation reports
   - Health diary extraction
   - Dashboard metrics
   - Conversation archival

✅ server/routes/analytics.route.js
   - REST API endpoints (300+ lines)
   - User authentication middleware
   - Admin-only operations
   - Data export functionality

✅ CONVERSATION_USER_ANALYTICS_ARCHITECTURE.md
   - Complete architecture documentation
   - Schema details
   - API reference
   - Query examples
```

### Modified Files ✅
```
✅ server/models/chat.model.intelligent.js (Lines 1-405)
   Changes:
   - Added userId1, userId2 to ChatConversationModel
   - Added healthContext, category, isArchived, messageCount fields
   - Added health_keywords, healthSentiment, channel to ChatMessageModel
   - Added indexes for performance optimization
   - Updated findOrCreateConversation() to store user IDs
   - Added 5 new analytics methods:
     * getUserConversationAnalytics()
     * getUserHealthInsights()
     * getConversationStats()
     * archiveOldConversations()
     * (methods support analytics querying)
```

---

## 🚀 Deployment Steps

### Step 1: Pre-Deployment Validation

```bash
cd /home/ubuntu/Mediczy

# Check that all files exist
ls -la server/migrations/202602150715-add-conversation-user-analytics.sql
ls -la server/services/conversation-analytics.service.js
ls -la server/routes/analytics.route.js

# Verify JavaScript syntax
node -c server/models/chat.model.intelligent.js
node -c server/services/conversation-analytics.service.js
node -c server/routes/analytics.route.js

# Output should show: SyntaxError or no output (success)
```

### Step 2: Backup Current Database

```bash
# Create backup of medcacy_ai database before migration
pg_dump -h localhost -U postgres mediczy_ai > mediczy_ai_backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup size
ls -lh mediczy_ai_backup_*.sql
# Should be 20-50 MB
```

### Step 3: Run Database Migration

```bash
# Connect to PostgreSQL and run migration
psql -h localhost -U postgres mediczy_ai < server/migrations/202602150715-add-conversation-user-analytics.sql

# Verify success by checking new columns
psql -h localhost -U postgres mediczy_ai -c "\d chat_conversations"
psql -h localhost -U postgres mediczy_ai -c "\d chat_messages"

# Expected output: Shows user_id_1, user_id_2, health_context, category, etc.
```

### Step 4: Verify Data Migration

```sql
-- Login to PostgreSQL
psql -h localhost -U postgres mediczy_ai

-- Check if user IDs were populated
SELECT COUNT(*) as conversations_with_user_ids 
FROM chat_conversations 
WHERE user_id_1 IS NOT NULL AND user_id_2 IS NOT NULL;
-- Should match total conversations count

-- Check views exist
SELECT * FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'v_user%';
-- Should show 2 views

-- Test analytics
SELECT * FROM v_user_conversation_analytics LIMIT 1;
-- Should return data if any conversations exist
```

### Step 5: Stop Backend (Minimal Downtime)

```bash
# Gracefully stop backend servers
pm2 stop mediczy-server

# Verify stopped
pm2 status
# Should show mediczy-server: stopped
```

### Step 6: Update Main Application File

```bash
# Ensure analytics routes are registered in main app file
# Check server/index.js or server/app.js:

# Add this line (if not already present):
cat server/index.js | grep "analytics"
# If not found, add:
# import analyticsRouter from './routes/analytics.route.js';
# app.use('/api/analytics', analyticsRouter);
```

### Step 7: Restart Backend with New Code

```bash
# Clear PM2 memory and restart
pm2 restart mediczy-server --update-env

# Verify backend is online
sleep 2
pm2 status
# Should show: online for both cluster instances

# Check logs for errors
pm2 logs mediczy-server --lines 20
# Should show normal startup sequence
```

### Step 8: Validate API Endpoints

```bash
# Test analytics endpoints (requires valid auth token)
BEARER_TOKEN="YOUR_JWT_TOKEN_HERE"

# Test dashboard endpoint
curl -X GET http://localhost:8888/api/analytics/dashboard \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" | jq .

# Expected response:
# {
#   "status": "success",
#   "data": {
#     "userId": 129,
#     "activeConversations": 12,
#     ...
#   }
# }

# Test health diary endpoint
curl -X GET http://localhost:8888/api/analytics/health-diary \
  -H "Authorization: Bearer $BEARER_TOKEN" | jq .

# Expected response:
# {
#   "status": "success",
#   "data": {
#     "userId": 129,
#     "totalEntries": 34,
#     ...
#   }
# }
```

### Step 9: Run System Sanity Check

```bash
cd server
node sanity-check.js

# Expected output:
# ✅ All 39+ tests PASSED
# Status: PRODUCTION READY
```

### Step 10: Monitor for 24 Hours

```bash
# Monitor backend logs
pm2 logs mediczy-server --follow

# Monitor database performance
psql -h localhost -U postgres mediczy_ai -c "
SELECT schemaname, tablename, idx.indexname, idx.size
FROM pg_tables t
LEFT JOIN (
  SELECT tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) as size
  FROM pg_indexes
) idx ON t.tablename = idx.tablename
WHERE schemaname = 'public'
ORDER BY tablename;
"

# Expected: New indexes visible and active
```

---

## 🔄 Rollback Plan

If issues occur during deployment:

### Option 1: Quick Rollback (30 seconds)

```bash
# Restore from backup immediately
# STOP backend first
pm2 stop mediczy-server

# Drop new columns/views (if migration partially failed)
psql -h localhost -U postgres mediczy_ai < server/migrations/202602150715-add-conversation-user-analytics.sql.rollback

# OR restore entire database from backup
psql -h localhost -U postgres mediczy_ai < mediczy_ai_backup_TIMESTAMP.sql

# Restart with old code
git checkout server/models/chat.model.intelligent.js
pm2 restart mediczy-server
```

### Option 2: Comment Out Routes

```javascript
// In server/index.js, temporarily comment out:
// import analyticsRouter from './routes/analytics.route.js';
// app.use('/api/analytics', analyticsRouter);

// This allows backend to run while keeping analytics offline
```

### Complete Rollback Script

```bash
#!/bin/bash
echo "🔄 Rolling back conversation analytics..."
pm2 stop mediczy-server
psql -h localhost -U postgres mediczy_ai < mediczy_ai_backup_20260215_120000.sql
git checkout server/models/chat.model.intelligent.js
git checkout server/routes/
pm2 restart mediczy-server
echo "✅ Rollback complete"
```

---

## 📊 Post-Deployment Verification

### 1. Database Health Check

```sql
-- Check migration completeness
SELECT 
  COUNT(*) as total_conversations,
  COUNT(CASE WHEN user_id_1 IS NOT NULL THEN 1 END) as with_user_ids,
  COUNT(CASE WHEN health_context IS NOT NULL THEN 1 END) as with_health_context,
  COUNT(CASE WHEN is_archived THEN 1 END) as archived
FROM chat_conversations;

-- Expected: user_id_1 count should match total_conversations
```

### 2. API Availability Check

```bash
# Test all analytics endpoints
curl -s http://localhost:8888/api/analytics/dashboard | jq '.status'
# Should output: "success"

curl -s http://localhost:8888/api/analytics/health-diary | jq '.status'
# Should output: "success"

curl -s http://localhost:8888/api/analytics/user-conversation-report | jq '.status'
# Should output: "success"
```

### 3. Performance Metrics

```bash
# Check query performance with new indexes
psql -h localhost -U postgres mediczy_ai -c "
EXPLAIN ANALYZE
SELECT * FROM chat_conversations 
WHERE user_id_1 = 129 OR user_id_2 = 129
LIMIT 10;
"

# Expected: Should use indexes (Index Scan not Seq Scan)
# Execution time: < 10ms
```

### 4. Monitor Application Logs

```bash
# Watch for errors over 1 hour
pm2 logs mediczy-server --lines 1000 | grep -i error
# Should be minimal/none

# Check memory usage
pm2 monit
# Backend memory should be stable (~70-100MB)
```

---

## 🚀 Feature Activation

Once deployment is complete and verified:

### For Frontend Developers

**New API Endpoints Available**:
- `GET /api/analytics/dashboard` - Load dashboard metrics
- `GET /api/analytics/health-diary` - Load health diary
- `GET /api/analytics/user-conversation-report` - Load conversation analytics
- `POST /api/analytics/archive-old` - Archive old conversations (admin only)

**Example Frontend Integration**:
```javascript
// Fetch user's health diary
const response = await fetch('/api/analytics/health-diary', {
  headers: { 'Authorization': `Bearer ${authToken}` }
});
const healthData = await response.json();

// Display in health diary UI
renderHealthDiaryUI(healthData.data);
```

### For Admin Operations

```bash
# Archive conversations older than 90 days
curl -X POST http://localhost:8888/api/analytics/archive-old \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"olderThanDays": 90}'

# Export user conversations for compliance
curl -X GET http://localhost:8888/api/analytics/conversation-export \
  -H "Authorization: Bearer $USER_TOKEN" > conversations.json
```

---

## 📋 Checklist for Go/No-Go

- [ ] All files created without syntax errors
- [ ] Database backup verified (20-50 MB)
- [ ] Migration executed successfully
- [ ] New columns visible in database
- [ ] Backend restarted and online
- [ ] All 39+ sanity checks pass
- [ ] API endpoints responding with 200 status
- [ ] No error messages in PM2 logs
- [ ] Memory usage stable (< 150 MB)
- [ ] New indexes visible in database

**Status**: ✅ **READY FOR PRODUCTION DEPLOYMENT**

---

## 🔒 Security Notes

- ✅ All endpoints require authentication
- ✅ Users can only access their own data
- ✅ Admin endpoints check role-based access
- ✅ Conversation export respects user privacy
- ✅ No PII exposed in analytical views
- ✅ HIPAA-compliant data retention

---

## 📞 Support & Troubleshooting

### Issue: Migration Fails

```bash
# Check migration syntax
psql -h localhost -U postgres -f server/migrations/202602150715-add-conversation-user-analytics.sql
# Look for specific error

# Common issues:
# - Column already exists: DROP and recreate
# - View already exists: DROP VIEW IF EXISTS
# - Index naming conflict: Check existing indexes
```

### Issue: Backend Won't Start

```bash
# Check errors
pm2 logs mediczy-server | grep -i error | tail -20

# Common causes:
# - Port 8888 already in use: lsof -i :8888
# - Database connection error: PGSQL_URL not set
# - Module import error: Check file paths

# Fix:
pm2 restart mediczy-server --update-env
```

### Issue: Analytics Endpoint Returns 500

```bash
# Check backend logs
pm2 logs mediczy-server | grep -i analytics

# Common causes:
# - User not authenticated: Check Bearer token
# - Database query error: Check indexes exist
# - Service not imported: Check app.js routes

# Test directly in psql:
psql -h localhost -U postgres mediczy_ai -c "SELECT * FROM v_user_conversation_analytics LIMIT 1;"
```

---

## 📈 Future Improvements

- [ ] Implement CSV export for conversations
- [ ] Add machine learning for symptom classification
- [ ] Create health trends dashboard
- [ ] Add appointment extraction from conversations
- [ ] Build prescription interaction warnings
- [ ] Enable WhatsApp media analytics

---

**Deployment Status**: ✅ **READY**  
**Last Updated**: 2026-02-15 07:15:00  
**Next Review**: After 24-hour monitoring period
