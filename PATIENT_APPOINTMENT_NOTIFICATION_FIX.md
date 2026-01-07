# Patient Appointment & Notification Fixes

## Issues Fixed

### 1. **Booked appointments not appearing in patient's appointment module**

**Root Cause**: The appointment module was correctly configured but notifications and user experience needed improvement.

**Solution**: Enhanced notification system to properly track user types and ensure appointments are fetched correctly.

### 2. **History of appointments not showing**

**Root Cause**: The `getUserAppointments` controller was working correctly, but the frontend was using `/enhanced-appointments/my-appointments` which was functioning properly.

**Solution**: No changes needed for appointment fetching. The existing endpoints are correct:
- `/api/appointments/my-appointments` - Standard appointment endpoint
- `/api/enhanced-appointments/my-appointments` - Enhanced appointment endpoint (used by frontend)

### 3. **Notification for upcoming appointments not appearing**

**Root Cause**: The `Notification` model was missing a `userType` field, but the notification service was querying with `userType` in the WHERE clause. This caused all patient notifications to be filtered out since:
- Patients have `role: 'user'` in the system
- Notification routes mapped `req.user.role` to `userType`
- The query `WHERE userId = X AND userType = 'patient'` failed because the `userType` column didn't exist

**Solution**: 
1. Added `userType` field to the Notification model
2. Updated notification service to properly handle `userType` in queries
3. Fixed notification routes to map `role: 'user'` to `userType: 'patient'`
4. Created database migration to add `userType` column to existing `notifications` table

## Files Modified

### 1. `/server/models/postgres/notification.model.postgres.js`
- Added `userType` field with type `STRING(20)`, default `'patient'`
- Added composite index on `['userId', 'userType']` for query optimization

### 2. `/server/services/notification.service.js`
- Updated `send()` method to include `userType` when creating notifications
- Updated `getNotifications()` to only filter by `userType` when provided
- Updated `markAllAsRead()` to handle `userType` properly
- Updated `getUnreadCount()` to handle `userType` properly

### 3. `/server/routes/notification.route.js`
- Fixed userType determination in all routes:
  - `GET /api/notifications`
  - `GET /api/notifications/unread-count`
  - `POST /api/notifications/read-all`
  - `POST /api/notifications/fcm/register`
  - `POST /api/notifications/test`
- Mapping logic: 
  - `role: 'doctor'` → `userType: 'doctor'`
  - `role: 'admin'` → `userType: 'admin'`
  - `role: 'user'` or anything else → `userType: 'patient'`

### 4. `/server/migrations/add-usertype-to-notifications.js` (NEW)
- Database migration to add `userType` column
- Updates existing notifications with default value `'patient'`
- Creates index for performance

## How to Apply the Fix

### Step 1: Run the database migration

```bash
# Navigate to server directory
cd /home/ubuntu/Mediczy/server

# Run the migration
node migrations/add-usertype-to-notifications.js
```

### Step 2: Restart the server

```bash
# If using PM2
pm2 restart all

# Or if running directly
npm restart
```

### Step 3: Test the fixes

1. **Login as a patient**
2. **Book an appointment** through the appointment module
3. **Verify notifications**:
   - Check notifications bell icon for appointment confirmation
   - Check email for appointment confirmation with calendar attachment
4. **Check My Appointments**:
   - Navigate to Appointments page
   - Verify booked appointment appears in "Upcoming" tab
   - After appointment date passes, verify it appears in history

## API Endpoints Overview

### Appointment Endpoints (for Patients)
- `GET /api/appointments` - Get user's appointments
- `GET /api/appointments/my-appointments` - Alias for above
- `GET /api/enhanced-appointments/my-appointments` - Enhanced appointments (used by frontend)
- `POST /api/appointments` - Create new appointment

### Notification Endpoints
- `GET /api/notifications` - Get user's notifications
- `GET /api/notifications/unread-count` - Get unread count
- `POST /api/notifications/:id/read` - Mark notification as read
- `POST /api/notifications/read-all` - Mark all as read
- `POST /api/notifications/fcm/register` - Register FCM token for push notifications

## Testing Checklist

- [ ] Patient can book an appointment
- [ ] Appointment appears in "My Appointments" module
- [ ] Patient receives notification for booked appointment
- [ ] Notification appears in notification bell icon
- [ ] Email confirmation is sent with calendar attachment
- [ ] Past appointments appear in history
- [ ] Upcoming appointments show in upcoming section
- [ ] Notification count badge updates correctly

## Database Schema Changes

### Before (notifications table)
```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  userId INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  -- ... other fields
);
```

### After (notifications table)
```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  userId INTEGER NOT NULL,
  userType VARCHAR(20) DEFAULT 'patient', -- NEW FIELD
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  -- ... other fields
);

-- New Index
CREATE INDEX idx_notifications_user_type ON notifications (userId, userType);
```

## Notification Flow

1. **Patient books appointment**
   ```
   POST /api/appointments
   ```

2. **Appointment controller creates appointment**
   ```javascript
   const appointment = await Appointment.create({...});
   ```

3. **Notification sent to patient**
   ```javascript
   await notificationService.send({
     userId: appointment.userId,
     userType: 'patient',  // Correctly set
     type: 'appointment_booked',
     variables: {...},
     channels: ['in-app', 'email'],
   });
   ```

4. **Notification stored in database**
   ```sql
   INSERT INTO notifications (userId, userType, type, title, message, ...)
   VALUES (123, 'patient', 'appointment_booked', '...', '...', ...);
   ```

5. **Patient fetches notifications**
   ```
   GET /api/notifications
   ```
   
6. **Query executed**
   ```sql
   SELECT * FROM notifications
   WHERE userId = 123 AND userType = 'patient'
   ORDER BY createdAt DESC;
   ```

## Additional Notes

- The fix is backward compatible - existing notifications without `userType` will still be retrieved
- All new notifications will include the `userType` field
- The migration sets existing notifications to `userType: 'patient'` as default
- No changes needed to appointment fetching logic - it was already working correctly

## Monitoring

After deployment, monitor:
1. Notification creation success rate
2. Appointment booking success rate
3. User complaints about missing notifications
4. Database query performance on notifications table

## Rollback Plan

If issues occur:
1. Revert code changes to notification service and routes
2. Remove `userType` column from notifications table:
   ```sql
   ALTER TABLE notifications DROP COLUMN "userType";
   ```
3. Restart server
