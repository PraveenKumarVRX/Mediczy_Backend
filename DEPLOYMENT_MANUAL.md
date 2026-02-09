# 🚀 Manual Deployment Guide - API Credentials

## Changes Pushed to GitHub ✓

**Commit**: `009f040` - feat: API credentials management - complete implementation  
**Branch**: `main`  
**GitHub**: https://github.com/MySmartHealth/Mediczy

---

## Quick Deploy (From Your Local Machine with SSH Access)

### Option 1: One-Command Deploy

```bash
ssh ubuntu@13.234.17.52 "cd /home/ubuntu/Mediczy && git pull origin main && pm2 restart mediczy-server"
```

### Option 2: Step-by-Step Deploy

```bash
# 1. SSH to production
ssh ubuntu@13.234.17.52

# 2. Pull latest changes
cd /home/ubuntu/Mediczy
git pull origin main

# 3. Restart backend (applies route fixes)
pm2 restart mediczy-server

# 4. Verify server is running
pm2 status

# 5. Test the API endpoint
curl -X POST http://localhost:8888/api/admin/api-credentials/generate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Credential",
    "integration_type": "smarthealth-rn",
    "organization_id": 1
  }'

# 6. Build frontend (if needed)
cd /home/ubuntu/Mediczy/client
npm run build

# 7. Exit
exit
```

---

## What Was Deployed

### Backend Changes (Immediate - Auto-reloaded)
✅ **File**: `server/api/admin/api-credentials.routes.js`
- Fixed route paths (removed double `/api-credentials` prefix)
- Routes now work correctly:
  - `POST /api/admin/api-credentials/generate`
  - `GET /api/admin/api-credentials`
  - `POST /api/admin/api-credentials/:id/rotate`
  - `POST /api/admin/api-credentials/:id/revoke`

### Frontend Changes (Requires Build)
✅ **New Component**: `client/src/pages/admin/ApiCredentialsManagement.tsx`
✅ **Updated Service**: `client/src/services/api-credentials.service.ts`
✅ **Updated Routes**: `client/src/routes/index.tsx`
✅ **Updated Navigation**: `client/src/components/layout/AdminLayout.tsx`

---

## Verify Deployment

### Test Backend API (Should work immediately after restart)

```bash
# From your local machine
curl -X POST https://app.mediqzy.com/api/admin/api-credentials/generate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SmartHealth RN - Production Test",
    "description": "Testing deployment",
    "integration_type": "smarthealth-rn",
    "organization_id": 1,
    "expires_in_days": 365,
    "rotation_required_in_days": 90,
    "scopes": ["mobile:auth", "doctors:search", "appointments:book"]
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "credential_id": "uuid-here",
    "client_id": "cred_smarthealth_xxxxx",
    "client_secret": "64-char-secret-here",
    "name": "SmartHealth RN - Production Test",
    "status": "active",
    ...
  }
}
```

### Test Frontend UI (After build)

1. Navigate to: https://app.mediqzy.com/admin/api-credentials
2. Should see the API Credentials Management page
3. Click "Generate New Credential" button
4. Form should appear

---

## Build Frontend (If Not Auto-Built)

```bash
# SSH to production
ssh ubuntu@13.234.17.52

# Navigate to client folder
cd /home/ubuntu/Mediczy/client

# Install dependencies (if needed)
npm install

# Build for production
npm run build

# Restart nginx (if using nginx)
sudo systemctl restart nginx

# OR if using PM2 to serve
pm2 restart frontend
```

---

## Troubleshooting

### Issue: "Cannot POST /api/admin/api-credentials/generate"
**Solution**: Backend not restarted. Run: `pm2 restart mediczy-server`

### Issue: UI shows 404 or old page
**Solution**: Frontend not built. Run: `cd client && npm run build`

### Issue: "Unauthorized" error
**Solution**: Make sure you're logged in as super_admin or admin role

### Issue: Database error
**Solution**: Check if `api_credentials` table exists:
```sql
\c mediczy_ai
\dt api_credentials
```

---

## Success Checklist

- [ ] Git pull completed on production
- [ ] PM2 restarted successfully
- [ ] Backend API test returns credentials
- [ ] Frontend build completed (if needed)
- [ ] Can access UI at /admin/api-credentials
- [ ] Can generate test credentials
- [ ] Can see credentials in list

---

## Quick Reference

**Production Server**: `ubuntu@13.234.17.52`  
**App Path**: `/home/ubuntu/Mediczy`  
**API Base**: `https://app.mediqzy.com/api`  
**Admin UI**: `https://app.mediqzy.com/admin/api-credentials`  
**PM2 Process**: `mediczy-server`  

**Backend**: Auto-reloads on `pm2 restart`  
**Frontend**: Requires `npm run build` in client folder  

---

## Ready to Test!

The changes are live on GitHub. Just pull and restart! 🚀
