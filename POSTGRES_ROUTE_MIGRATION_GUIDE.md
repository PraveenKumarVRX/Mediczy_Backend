# PostgreSQL Migration Guide - Route Updates

## Overview
This guide explains how to migrate routes from MariaDB to PostgreSQL using our dual-write adapter pattern.

## Migration Phases

### Phase 1: Dual-Write (Current)
- Writes go to BOTH PostgreSQL and MariaDB
- Reads from PostgreSQL with MariaDB fallback
- Both databases stay in sync
- Zero downtime migration

### Phase 2: PostgreSQL Primary
- PostgreSQL is primary, MariaDB is backup
- Can switch mode via environment variable
- MariaDB maintained for emergency rollback

### Phase 3: PostgreSQL Only
- MariaDB retired
- PostgreSQL is the only database
- Complete migration

## Current Status

✅ **COMPLETED:**
- PostgreSQL installed and configured
- 4 core tables migrated (users, doctors, appointments, prescriptions)
- 83 records migrated successfully
- Full-text search triggers created
- Dual-write adapter implemented
- Database orchestrator updated

📋 **CONFIGURATION:**
```bash
PRIMARY_DB=postgresql
MIGRATION_MODE=postgres-primary
DUAL_WRITE_ENABLED=true
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DATABASE=mediczy_ai
POSTGRES_USER=mediczy_helper
```

## How to Update Routes

### Method 1: Using Route Migration Helper (Recommended)

**BEFORE (MariaDB):**
```javascript
import User from '../models/user.model.mariadb.js';

router.get('/users/:id', async (req, res) => {
  const user = await User.findByPk(req.params.id);
  res.json(user);
});
```

**AFTER (Dual-Write with PostgreSQL Primary):**
```javascript
import { useModel } from '../utils/route-migration-helper.js';

const User = useModel('User');

router.get('/users/:id', async (req, res) => {
  const user = await User.findByPk(req.params.id);  // PostgreSQL primary, MariaDB fallback
  res.json(user);
});
```

### Method 2: Direct Model Import (After Full Migration)

```javascript
import { User } from '../models/index.js';  // PostgreSQL model

router.get('/users/:id', async (req, res) => {
  const user = await User.findByPk(req.params.id);  // PostgreSQL only
  res.json(user);
});
```

### Method 3: Using Dual-Write Adapter Directly

```javascript
import dualWriteAdapter from '../db/dual-write-adapter.js';
import UserMariaDB from '../models/user.model.mariadb.js';
import UserPostgres from '../models/postgres/user.model.postgres.js';

router.post('/users', async (req, res) => {
  const user = await dualWriteAdapter.create(
    UserMariaDB,
    UserPostgres,
    req.body
  );
  res.json(user);
});
```

## Route Update Checklist

For each route file, update in this order:

1. **Import the helper**
   ```javascript
   import { useModel } from '../utils/route-migration-helper.js';
   ```

2. **Replace model imports**
   ```javascript
   // Old
   // import User from '../models/user.model.mariadb.js';
   
   // New
   const User = useModel('User');
   const Doctor = useModel('Doctor');
   const Appointment = useModel('Appointment');
   const Prescription = useModel('Prescription');
   ```

3. **Keep the same Sequelize API**
   - `findAll()`, `findOne()`, `findByPk()` - work exactly the same
   - `create()`, `update()`, `destroy()` - work exactly the same
   - Transparent migration!

4. **Test the route**
   - Verify reads from PostgreSQL
   - Verify writes to both databases
   - Check error handling

## Priority Routes to Update

### HIGH PRIORITY (User-facing APIs):
1. ✅ `routes/auth.route.js` - User authentication
2. ✅ `routes/user.route.js` - User management
3. ✅ `routes/doctor.route.js` - Doctor profiles
4. ✅ `routes/appointment.route.js` - Appointment booking
5. ✅ `routes/prescription.route.js` - Prescription management

### MEDIUM PRIORITY (Admin APIs):
6. `routes/admin.route.js` - Admin operations
7. `routes/clinic/dashboard.routes.js` - Clinic dashboard
8. `routes/hospital/dashboard.routes.js` - Hospital dashboard

### LOW PRIORITY (Helper APIs):
9. `routes/ehr.route.js` - EHR records
10. `routes/health-diary.route.js` - Health diary

## Testing Migration

### 1. Verify PostgreSQL Connection
```bash
curl http://localhost:8000/api/db/health
```

Expected response:
```json
{
  "status": "healthy",
  "postgresSequelize": true,
  "mariadb": true,
  "mode": "postgres-primary"
}
```

### 2. Test CRUD Operations

**Create (writes to both):**
```bash
curl -X POST http://localhost:8000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com"}'
```

**Read (from PostgreSQL):**
```bash
curl http://localhost:8000/api/users/1
```

### 3. Verify Data Consistency

```bash
cd /home/ubuntu/Mediczy
node server/scripts/check-data-consistency.js
```

## Rollback Plan

If issues occur, rollback is simple:

### Immediate Rollback (Environment Variable)
```bash
# Update server/.env
MIGRATION_MODE=mariadb-only
PRIMARY_DB=mariadb

# Restart server
pm2 restart mediczy-backend
```

### Code Rollback
Just revert the route imports:
```javascript
// Revert to MariaDB
import User from '../models/user.model.mariadb.js';
```

## Monitoring

### Check Migration Status
```javascript
import { getMigrationStatus } from '../utils/route-migration-helper.js';

router.get('/migration-status', (req, res) => {
  res.json(getMigrationStatus());
});
```

### Monitor Database Health
```bash
# Watch database status
watch -n 5 'curl -s http://localhost:8000/api/db/stats | jq .'
```

### Check Logs
```bash
# Server logs
pm2 logs mediczy-backend

# Filter for database operations
pm2 logs mediczy-backend | grep -i "postgres\|mariadb"
```

## Timeline

**Current: Phase 1-2 (Weeks 1-8)**
- Dual-write enabled
- PostgreSQL primary, MariaDB backup
- Monitor for stability
- Update routes gradually

**Future: Phase 3 (After 2 months)**
- Run `./mariadb-retirement.sh`
- Set MariaDB read-only
- PostgreSQL becomes sole database
- Archive MariaDB data

## Support

For questions or issues:
1. Check logs: `pm2 logs mediczy-backend`
2. Run health check: `curl http://localhost:8000/api/db/health`
3. Check consistency: `node server/scripts/check-data-consistency.js`
4. Review this guide: `POSTGRES_ROUTE_MIGRATION_GUIDE.md`

## Success Metrics

✅ All routes updated to use `useModel()` helper
✅ Data consistency checks passing
✅ Zero errors in production logs for 30 days
✅ PostgreSQL query performance satisfactory
✅ Backup and rollback procedures tested

---

**Last Updated:** December 9, 2025
**Migration Phase:** Phase 1-2 (Dual-Write, PostgreSQL Primary)
**Status:** Active - Routes being updated
