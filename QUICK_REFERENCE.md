# Quick Reference - Backend Fixes

## ✅ All Backend Issues Fixed

### 🎥 Video Server
```bash
# Status: Running ✅
pm2 list | grep mirotalk
# Port: 3010
curl http://localhost:3010
```

### 👤 User Profile with Role
```bash
# Endpoint: GET /api/users/profile
# Returns: { success: true, user: {...}, role: "user" }
```

### 📄 Report Upload
```bash
# Accepts both field names:
# - "file" (primary)
# - "report" (backwards compatible)

curl -X POST /api/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@report.pdf" \
  -F "reportType=lab_report"
```

### 🥗 Diet Plan
```bash
# New endpoint: POST /api/diet/generate
# Calculates BMI, BMR, TDEE, macros, meal plan

curl -X POST /api/diet/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"age": 30, "weight": 75, "height": 175, ...}'
```

### 👨‍👩‍👧 Family Membership
```bash
# User upgraded to: family plan
# Max members: 4
# Current: 0
```

## 🔧 PM2 Services

```bash
# View all services
pm2 list

# Restart backend
pm2 restart mediczy-server

# Restart video server
pm2 restart mirotalk-sfu

# View logs
pm2 logs mediczy-server --lines 50
pm2 logs mirotalk-sfu --lines 50

# Save configuration
pm2 save
```

## 🧪 Test All Fixes

```bash
# Run comprehensive verification
./verify-backend-fixes.sh

# Expected output: 5/5 fixes working ✅
```

## 📚 Documentation

- `BACKEND_FIXES_COMPLETE.md` - Full documentation
- `PATIENT_PORTAL_ISSUES_INVESTIGATION.md` - Original investigation
- `verify-backend-fixes.sh` - Automated testing

## ⚠️ Frontend Issues (Not Backend)

1. Patient login redirect → frontend routing
2. Appointment history format → frontend display

## 🎯 Status: COMPLETE ✅

All backend issues resolved and verified working!
