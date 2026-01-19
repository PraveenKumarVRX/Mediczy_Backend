# Remaining JWT_SECRET Migration Tasks

## ✅ CRITICAL FILES FIXED (8 files)

These files had hardcoded secrets and have been migrated to `JWT_CONFIG.SECRET`:

1. ✅ `server/config/auth.config.js` - **CREATED** (source of truth)
2. ✅ `server/routes/clinic/auth.routes.js` - **FIXED** (was causing crashes)
3. ✅ `server/routes/hospital/auth.routes.js` - **FIXED**
4. ✅ `server/routes/homecare/auth.routes.js` - **FIXED**
5. ✅ `server/routes/ambulance/auth.routes.js` - **FIXED**
6. ✅ `server/controller/unified-patient.controller.js` - **FIXED**
7. ✅ `server/controller/clinic-staff-auth.controller.js` - **FIXED**
8. ✅ `server/controller/unified-hospital-staff.controller.js` - **FIXED**

## ⚠️ REMAINING FILES (65+ files)

These files still use `process.env.JWT_SECRET` directly and should be migrated during regular maintenance:

### How to Find Them:
```bash
grep -r "process.env.JWT_SECRET" server/ --include="*.js" -l
```

### Migration Pattern:

**Before:**
```javascript
import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'some-fallback-key';
```

**After:**
```javascript
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
const JWT_SECRET = JWT_CONFIG.SECRET;
```

### Why Migrate?

1. **Single Source of Truth**: All files read from one config
2. **No Fallback Secrets**: Prevents accidental use of hardcoded values
3. **Easier Updates**: Change JWT secret in one place (.env)
4. **Consistent Behavior**: All tokens use same secret
5. **Better Error Messages**: Config can validate secret on startup

### Priority for Migration:

**HIGH PRIORITY** (Active authentication endpoints):
- Any remaining `/routes/*/auth.routes.js` files
- Any remaining `/controller/*-auth.controller.js` files
- Middleware files: `server/middleware/auth.middleware.js`

**MEDIUM PRIORITY** (Supporting files):
- Utility files that generate/verify tokens
- Test files that create mock tokens
- Helper functions

**LOW PRIORITY** (Rarely used):
- Archived files
- Deprecated endpoints
- Development-only files

### Testing After Migration:

For each file migrated, test the corresponding endpoint:
```bash
# Example: After migrating pharmacy/auth.routes.js
curl -X POST http://localhost:8000/api/pharmacy/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

## Current Status

- **Files Fixed**: 8 critical files
- **Files Remaining**: ~65 files
- **Working Logins**: Clinic ✅, Hospital ✅
- **Server Status**: Running with fixes applied

## Next Steps (Optional)

1. Run migration script to identify all remaining files
2. Prioritize active authentication endpoints
3. Migrate files in batches (5-10 at a time)
4. Test each batch before proceeding
5. Update documentation with each batch

## Migration Script Example:

```bash
#!/bin/bash
# Find all files using process.env.JWT_SECRET

echo "Files still using process.env.JWT_SECRET:"
echo "==========================================="
grep -r "process.env.JWT_SECRET" server/ --include="*.js" -l | while read file; do
  echo "- $file"
done

echo ""
echo "Files already using JWT_CONFIG:"
echo "==========================================="
grep -r "JWT_CONFIG.SECRET" server/ --include="*.js" -l | while read file; do
  echo "✅ $file"
done
```

---

**Note**: The critical authentication issues have been fixed. Remaining migrations are for long-term consistency and can be done gradually during regular development.
