# 🔧 Appointment Booking Fix

**Issue:** Clicking "Book Appointment" shows "Something went wrong"

**Root Cause:** Field name mismatch between frontend and backend

## What Was Wrong

**Frontend was sending:**
```javascript
{
  doctorId: 123,
  appointmentDate: "2026-02-09",
  appointmentTime: "10:00",
  consultationType: "video",      // ❌ Wrong field name
  symptoms: ["headache"],
  consultationFee: 500            // ❌ Backend doesn't expect this
}
```

**Backend was expecting:**
```javascript
{
  doctorId: 123,
  appointmentDate: "2026-02-09",
  appointmentTime: "10:00",
  type: "online",                 // ✅ Correct field name
  symptoms: ["headache"],
  notes: null                     // ✅ Optional field
}
```

## Fix Applied

**File:** `client/src/pages/DoctorListBooking.tsx` (Line 835-845)

**Before:**
```typescript
const bookingData = {
  doctorId,
  appointmentDate: format(selectedDate, "yyyy-MM-dd"),
  appointmentTime: normalizedTime,
  consultationType: consultationType === "online" ? "video" : "in-person",
  symptoms,
  consultationFee
};

const response = await api.post("/appointments", bookingData);
```

**After:**
```typescript
const bookingData = {
  doctorId,
  appointmentDate: format(selectedDate, "yyyy-MM-dd"),
  appointmentTime: normalizedTime,
  type: consultationType === "online" ? "online" : "in-person",  // ✅ Changed field name
  symptoms,
  notes: null                                                    // ✅ Added notes field
};

const response = await api.post("/mobile/appointments", bookingData);  // ✅ Correct endpoint
```

## Deployment Instructions

### Option 1: Manual Deployment (Quick - 2 minutes)

1. **SSH into production server:**
   ```bash
   ssh ubuntu@13.234.17.52
   ```

2. **Pull latest code:**
   ```bash
   cd /home/ubuntu/Mediczy
   git pull origin main
   ```

3. **Build frontend:**
   ```bash
   cd client
   npm run build
   ```

4. **Done! The fix is live.**

### Option 2: Using Deploy Script (Alternative)

1. **SSH into production:**
   ```bash
   ssh ubuntu@13.234.17.52
   ```

2. **Navigate to Mediczy directory:**
   ```bash
   cd /home/ubuntu/Mediczy
   ```

3. **Pull changes:**
   ```bash
   git pull origin main
   ```

4. **Run deploy script:**
   ```bash
   bash deploy-now.sh
   ```

5. **Build frontend separately (script only restarts backend):**
   ```bash
   cd client && npm run build
   ```

## Testing the Fix

1. **Login as a patient/user**
2. **Go to "Find & Book Doctor" or "Doctors" page**
3. **Select any doctor**
4. **Click "Book Appointment"**
5. **Choose date, time, and consultation type**
6. **Enter symptoms (if any)**
7. **Click "Book Appointment" button**

**Expected Result:** ✅ "Your appointment has been booked successfully"

**Previous Error:** ❌ "Something went wrong"

## What Changed

| Aspect | Before | After |
|--------|--------|-------|
| Field name | `consultationType` | `type` ✅ |
| Field value | `"video"` | `"online"` ✅ |
| Endpoint | `/appointments` | `/mobile/appointments` ✅ |
| Extra field | `consultationFee` (not used) | `notes: null` ✅ |

## Backend Validation

The backend (`server/api/mobile/index.js` line 2289) expects:

```javascript
const { doctorId, appointmentDate, appointmentTime, type, symptoms, notes } = req.body;
```

Our fix now matches this exactly! ✅

## Git Commit

```
commit b55e4e1
Fix appointment booking: use correct field names (type instead of consultationType)
```

---

**Status:** ✅ Fixed and committed  
**Deployed:** ⏳ Pending frontend build on production  
**Tested:** ⏳ Ready for testing after deployment
