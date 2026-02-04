# 🎥 Webinar System - Quick Start Guide

## 📚 Overview

Zoom-like webinar system using LiveKit for video conferencing, managed at super admin level, accessible to all users based on their roles.

---

## 🚀 Quick Start

### 1. Setup LiveKit (Required)

```bash
# Add to .env file:
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_secret_here
LIVEKIT_URL=wss://your-livekit-server.com
```

**Get LiveKit credentials:**

1. Go to https://livekit.io/
2. Sign up and create project
3. Copy credentials from dashboard

### 2. Verify Installation

```bash
# Check database tables
sudo -u postgres psql -d mediczy_ai -c "\dt webinar*"

# Expected: 5 tables (webinars, webinar_registrations, webinar_recordings,
#                      webinar_chat_messages, webinar_analytics)

# Check server routes
cd server
grep -n "webinar" app.js

# Expected: Import statements and route mounts
```

### 3. Start Servers

```bash
# Terminal 1: Backend
cd server && npm run dev:watch

# Terminal 2: Frontend
cd client && npm run dev
```

---

## 👥 User Workflows

### Super Admin Workflow (admin@mediczy.com)

**Dashboard:** `http://localhost:5173/admin/webinars`

1. **Create Webinar**
   - Click "Create New Webinar"
   - Fill in details (title, description, date/time, max attendees)
   - Assign doctor as host
   - Set pricing (free/paid)
   - Click "Create"

2. **Manage Registrations**
   - View all registered users
   - Approve/reject registrations (if approval required)
   - Export attendee list

3. **View Analytics**
   - Total registrations
   - Attendance rate
   - Average watch time
   - Engagement metrics
   - Q&A statistics

4. **Manage Webinars**
   - Edit webinar details
   - Reschedule
   - Cancel webinar
   - Delete webinar

### Doctor Workflow

**Dashboard:** `http://localhost:5173/doctor/webinars`

1. **View Assigned Webinars**
   - See upcoming webinars assigned to you
   - View past webinars
   - Check registration count

2. **Start Webinar**
   - Click "Start" on upcoming webinar
   - Enter LiveKit room as host
   - Full host controls available:
     - Mute/unmute participants
     - Share screen
     - Start/stop recording
     - Manage Q&A

3. **During Webinar**
   - Monitor attendee list
   - Answer questions in Q&A
   - Share screen for presentations
   - Record session

4. **End Webinar**
   - Click "End Webinar"
   - Recording automatically saved
   - Analytics generated

5. **Post-Webinar**
   - View recordings
   - Download recordings
   - Review analytics
   - Read Q&A transcript

### User Workflow

**Browse Webinars:** `http://localhost:5173/webinars`

1. **Discover Webinars**
   - Browse upcoming webinars
   - Search by title/description
   - Filter by:
     - Status (upcoming/live/past)
     - Category
     - Doctor
     - Date range

2. **Register for Webinar**
   - Click on webinar card
   - Click "Register"
   - Confirm registration
   - Receive confirmation email

3. **Join Live Webinar**
   - At scheduled time, click "Join"
   - Enter LiveKit room as attendee
   - Attendee controls:
     - Mute/unmute microphone
     - Enable/disable camera
     - View host screen share
     - Ask questions in Q&A

4. **During Webinar**
   - Watch presentation
   - Ask questions
   - Interact via chat
   - Raise hand (if feature enabled)

5. **Post-Webinar**
   - Access recording (if available)
   - View your registrations
   - Leave feedback/rating

---

## 🔌 API Usage Examples

### Get JWT Token First

```bash
# Login as admin
curl -X POST http://localhost:8888/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mediczy.com","password":"your_password"}'

# Save the token from response
export JWT_TOKEN="eyJhbGc..."
```

### Admin: Create Webinar

```bash
curl -X POST http://localhost:8888/api/admin/webinars \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Introduction to Telemedicine",
    "description": "Learn the basics of telemedicine and remote patient care",
    "scheduled_start": "2026-02-10T14:00:00Z",
    "scheduled_end": "2026-02-10T15:30:00Z",
    "max_attendees": 100,
    "is_paid": false,
    "price": 0,
    "currency": "INR",
    "doctor_id": 70,
    "requires_approval": false,
    "allow_recording": true,
    "allow_qa": true
  }'
```

### Admin: Get All Webinars

```bash
curl -X GET "http://localhost:8888/api/admin/webinars?page=1&limit=10" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Admin: Get Analytics

```bash
curl -X GET http://localhost:8888/api/admin/webinars/1/analytics \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Doctor: Get My Webinars

```bash
curl -X GET http://localhost:8888/api/doctor/webinars/my-webinars \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Doctor: Start Webinar

```bash
curl -X POST http://localhost:8888/api/doctor/webinars/1/start \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### User: Browse Webinars

```bash
curl -X GET "http://localhost:8888/api/webinars?status=upcoming&search=telemedicine" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### User: Register for Webinar

```bash
curl -X POST http://localhost:8888/api/webinars/1/register \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### User: Join Live Webinar

```bash
curl -X POST http://localhost:8888/api/webinars/1/join \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userName": "Dr. John Doe"}'

# Response will include LiveKit token:
{
  "success": true,
  "data": {
    "token": "eyJhbGc...",
    "wsUrl": "wss://your-livekit-server.com",
    "roomName": "webinar-1-2026-02-10",
    "participantName": "Dr. John Doe"
  }
}
```

### User: Post Question in Q&A

```bash
curl -X POST http://localhost:8888/api/webinars/1/questions \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I integrate telemedicine in my practice?"}'
```

---

## 📊 Database Schema Reference

### webinars

- `id` - Primary key
- `title` - Webinar title
- `description` - Full description
- `scheduled_start` - Start date/time
- `scheduled_end` - End date/time
- `actual_start` - When doctor actually started
- `actual_end` - When doctor ended
- `status` - scheduled/live/completed/cancelled
- `max_attendees` - Maximum capacity
- `current_attendees` - Live count
- `doctor_id` - Host doctor ID
- `livekit_room_name` - LiveKit room identifier
- `is_paid` - Free or paid webinar
- `price` - Cost (if paid)
- `currency` - INR/USD/etc
- `requires_approval` - Auto-approve or manual
- `allow_recording` - Can record?
- `allow_qa` - Enable Q&A?

### webinar_registrations

- `id` - Primary key
- `webinar_id` - Foreign key to webinars
- `user_id` - Registered user ID
- `user_type` - patient/doctor/clinic_staff
- `status` - registered/approved/rejected/attended/cancelled
- `payment_status` - pending/completed/failed
- `joined_at` - When user joined live session
- `left_at` - When user left

### webinar_chat_messages

- `id` - Primary key
- `webinar_id` - Foreign key to webinars
- `user_id` - Message sender
- `message` - Message content
- `message_type` - chat/question/announcement
- `is_answered` - For Q&A tracking
- `answered_by` - Doctor/moderator who answered

### webinar_recordings

- `id` - Primary key
- `webinar_id` - Foreign key to webinars
- `recording_url` - S3/storage URL
- `duration_seconds` - Recording length
- `file_size_mb` - Storage size
- `status` - processing/available/deleted

### webinar_analytics

- `id` - Primary key
- `webinar_id` - Foreign key to webinars
- `total_registered` - Count
- `total_attended` - Count
- `peak_concurrent_users` - Max simultaneous
- `average_watch_time_minutes` - Engagement metric
- `total_questions` - Q&A activity
- `total_messages` - Chat activity

---

## 🎨 Frontend Component Reference

### SuperAdminWebinarManagement.tsx

**Path:** `/admin/webinars`
**Features:**

- DataTable with all webinars
- Create/Edit webinar form
- Delete confirmation dialog
- Registration management modal
- Analytics dashboard
- Export functionality

### DoctorWebinarDashboard.tsx

**Path:** `/doctor/webinars`
**Features:**

- My webinars list
- Upcoming vs past tabs
- Start webinar button
- Attendee count
- Q&A preview
- Recording access

### WebinarListPage.tsx

**Path:** `/webinars`
**Features:**

- Card grid layout
- Search bar
- Filter dropdowns (status, category)
- Registration button
- Join live button (when live)
- My registrations section

### WebinarRoomPage.tsx

**Path:** `/webinar/:id/room`
**Features:**

- LiveKit video room
- Host vs attendee modes
- Video/audio controls
- Screen sharing
- Participant list
- Q&A sidebar
- Recording controls (host only)
- Leave/end webinar

---

## 🔐 Security & Permissions

### Role-Based Access

**Super Admin (`admin`):**

- Create/edit/delete any webinar
- Assign doctors as hosts
- View all analytics
- Manage all registrations
- Override settings

**Doctor:**

- View assigned webinars
- Start/end own webinars
- Manage attendees in own webinars
- Answer Q&A in own webinars
- Access own webinar recordings

**User (Patient/Staff):**

- Browse public webinars
- Register for webinars
- Join live webinars (if registered)
- Ask questions in Q&A
- View own registrations

### Authentication Flow

1. All endpoints require JWT token
2. Token validated by `authUser` middleware
3. Role checked by `requireRole()` middleware
4. LiveKit tokens generated on join
5. Tokens expire after webinar ends

---

## 🐛 Troubleshooting

### Issue: "Cannot connect to LiveKit"

**Solution:** Check `.env` has correct LIVEKIT_URL, API_KEY, API_SECRET

### Issue: "User not authorized"

**Solution:** Ensure JWT token in `Authorization: Bearer <token>` header

### Issue: "Webinar not found"

**Solution:** Check webinar ID exists in database

### Issue: "Maximum attendees reached"

**Solution:** Admin can increase `max_attendees` in webinar settings

### Issue: "Video not loading"

**Solution:**

- Check LiveKit server is running
- Verify firewall allows WebSocket connections
- Test with LiveKit example app first

### Issue: "Recording failed"

**Solution:**

- Check S3/storage credentials
- Verify `allow_recording` is true
- Check LiveKit recording enabled in project

---

## 📈 Performance Tips

1. **Database Indexes:** Already created on:
   - `webinars.scheduled_start`
   - `webinars.status`
   - `webinar_registrations.webinar_id`
   - `webinar_registrations.user_id`

2. **Caching:** Use Redis for:
   - Active webinar list
   - User registration status
   - Attendee counts

3. **Load Balancing:**
   - Use multiple LiveKit servers for scaling
   - Distribute attendees across regions
   - CDN for recording delivery

4. **Monitoring:**
   - Track concurrent users
   - Monitor bandwidth usage
   - Alert on dropped connections
   - Log join/leave events

---

## 📞 Support

**Documentation Files:**

- `WEBINAR_SYSTEM_IMPLEMENTATION.md` - Full technical specs
- `WEBINAR_SYSTEM_TESTS.md` - Testing guide
- `WEBINAR_SANITY_TEST_COMPLETE.md` - Test results
- `WEBINAR_QUICK_START.md` - This file

**Database Migration:**

- `server/migrations/create_webinar_tables.sql`

**Backend Routes:**

- `server/routes/admin/webinar.routes.js`
- `server/routes/doctor/webinar.routes.js`
- `server/routes/webinar.routes.js`

**Frontend Components:**

- `client/src/pages/admin/SuperAdminWebinarManagement.tsx`
- `client/src/pages/doctor/DoctorWebinarDashboard.tsx`
- `client/src/pages/webinar/WebinarListPage.tsx`
- `client/src/pages/webinar/WebinarRoomPage.tsx`

---

**System Ready for Production! 🚀**
