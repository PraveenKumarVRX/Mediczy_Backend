# Webinar System - Sanity & Functional Tests

## ✅ COMPLETED CHECKS

### 1. Database Migration

- ✅ **5 tables created successfully**:
  - `webinars` (main webinar table)
  - `webinar_registrations` (user registrations)
  - `webinar_recordings` (recording metadata)
  - `webinar_chat_messages` (chat and Q&A)
  - `webinar_analytics` (engagement metrics)
- ✅ Indexes created (10 indexes)
- ✅ Triggers created (4 updated_at triggers)
- ✅ Table comments added

### 2. Backend Routes - Module System

- ✅ Converted from CommonJS to ES6 modules
- ✅ Fixed imports: `import` instead of `require`
- ✅ Fixed exports: `export default` instead of `module.exports`
- ✅ Added Sequelize database connection
- ✅ Replaced all `db.query` with `sequelize.query`
- ✅ All 3 route files pass Node.js syntax check

**Files Fixed:**

- `/server/routes/admin/webinar.routes.js` - 7 endpoints
- `/server/routes/doctor/webinar.routes.js` - 7 endpoints
- `/server/routes/webinar.routes.js` - 9 endpoints

### 3. Backend Server

- ✅ Server starts without errors
- ✅ All route modules load successfully
- ✅ Sequelize connects to PostgreSQL
- ✅ No module import errors
- ✅ Authentication middleware available

### 4. Frontend Components

- ✅ No TypeScript errors
- ✅ All 4 components compile cleanly:
  - `SuperAdminWebinarManagement.tsx`
  - `WebinarRoomPage.tsx` (LiveKit integration)
  - `WebinarListPage.tsx`
  - `DoctorWebinarDashboard.tsx`

### 5. LiveKit Integration

- ✅ Backend package installed: `livekit-server-sdk@2.15.0`
- ✅ Frontend packages installed:
  - `@livekit/components-react@2.9.19`
  - `livekit-client@2.17.0`
- ✅ Fixed LiveKit API usage: `room.numParticipants` (was incorrect `room.participants.size`)

### 6. Route Integration (app.js)

- ✅ Routes imported with ES6 syntax
- ✅ Routes mounted with authentication:
  - `/api/admin/webinars` → authUser + requireRole('admin')
  - `/api/doctor/webinars` → authUser
  - `/api/webinars` → authUser

---

## 🧪 FUNCTIONAL TESTS TO RUN

### Admin Endpoints (POST with admin@mediczy.com JWT)

```bash
# 1. Create Webinar
curl -X POST http://localhost:8888/api/admin/webinars \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Introduction to Telemedicine",
    "description": "Learn about modern telemedicine practices",
    "scheduled_start": "2026-02-10T14:00:00Z",
    "scheduled_end": "2026-02-10T15:30:00Z",
    "max_attendees": 100,
    "is_paid": false,
    "doctor_id": 70
  }'

# 2. Get All Webinars
curl http://localhost:8888/api/admin/webinars \
  -H "Authorization: Bearer <ADMIN_JWT>"

# 3. Get Webinar by ID
curl http://localhost:8888/api/admin/webinars/1 \
  -H "Authorization: Bearer <ADMIN_JWT>"

# 4. Update Webinar
curl -X PUT http://localhost:8888/api/admin/webinars/1 \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"max_attendees": 150}'

# 5. Get Registrations
curl http://localhost:8888/api/admin/webinars/1/registrations \
  -H "Authorization: Bearer <ADMIN_JWT>"

# 6. Approve Registration
curl -X POST http://localhost:8888/api/admin/webinars/registrations/1/approve \
  -H "Authorization: Bearer <ADMIN_JWT>"

# 7. Get Analytics
curl http://localhost:8888/api/admin/webinars/1/analytics \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

### Doctor Endpoints (POST with doctor JWT)

```bash
# 1. Get My Webinars
curl http://localhost:8888/api/doctor/webinars/my-webinars \
  -H "Authorization: Bearer <DOCTOR_JWT>"

# 2. Get Webinar Details
curl http://localhost:8888/api/doctor/webinars/1 \
  -H "Authorization: Bearer <DOCTOR_JWT>"

# 3. Start Webinar
curl -X POST http://localhost:8888/api/doctor/webinars/1/start \
  -H "Authorization: Bearer <DOCTOR_JWT>"

# 4. Get Attendees
curl http://localhost:8888/api/doctor/webinars/1/attendees \
  -H "Authorization: Bearer <DOCTOR_JWT>"

# 5. Get Questions
curl http://localhost:8888/api/doctor/webinars/1/questions \
  -H "Authorization: Bearer <DOCTOR_JWT>"

# 6. End Webinar
curl -X POST http://localhost:8888/api/doctor/webinars/1/end \
  -H "Authorization: Bearer <DOCTOR_JWT>"

# 7. Get Recordings
curl http://localhost:8888/api/doctor/webinars/1/recordings \
  -H "Authorization: Bearer <DOCTOR_JWT>"
```

### Public User Endpoints (Any authenticated user)

```bash
# 1. Browse Webinars
curl http://localhost:8888/api/webinars \
  -H "Authorization: Bearer <USER_JWT>"

# 2. Search Webinars
curl "http://localhost:8888/api/webinars?search=telemedicine&status=upcoming" \
  -H "Authorization: Bearer <USER_JWT>"

# 3. Get Webinar Details
curl http://localhost:8888/api/webinars/1 \
  -H "Authorization: Bearer <USER_JWT>"

# 4. Register for Webinar
curl -X POST http://localhost:8888/api/webinars/1/register \
  -H "Authorization: Bearer <USER_JWT>"

# 5. Get My Registrations
curl http://localhost:8888/api/webinars/my-registrations \
  -H "Authorization: Bearer <USER_JWT>"

# 6. Join Webinar (get LiveKit token)
curl -X POST http://localhost:8888/api/webinars/1/join \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"userName": "John Doe"}'

# 7. Post Question
curl -X POST http://localhost:8888/api/webinars/1/questions \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I enable telemedicine in my clinic?"}'

# 8. Leave Webinar
curl -X POST http://localhost:8888/api/webinars/1/leave \
  -H "Authorization: Bearer <USER_JWT>"

# 9. Cancel Registration
curl -X DELETE http://localhost:8888/api/webinars/1/register \
  -H "Authorization: Bearer <USER_JWT>"
```

---

## 📋 UI TESTING CHECKLIST

### Super Admin Dashboard (`/admin/webinars`)

- [ ] View all webinars in a table
- [ ] Create new webinar with form
- [ ] Edit existing webinar
- [ ] Delete webinar
- [ ] View registration statistics
- [ ] Approve/reject registrations
- [ ] View analytics dashboard

### Doctor Dashboard (`/doctor/webinars`)

- [ ] View my assigned webinars
- [ ] See upcoming webinars
- [ ] Start a webinar (get host controls)
- [ ] View attendee list
- [ ] Manage Q&A
- [ ] End webinar
- [ ] View past recordings

### Public Webinar List (`/webinars`)

- [ ] Browse available webinars
- [ ] Search by title/description
- [ ] Filter by status (upcoming/live/past)
- [ ] View webinar details
- [ ] Register for webinar
- [ ] Join live webinar
- [ ] View my registrations

### Webinar Room (`/webinar/:id/room`)

- [ ] Join as host (doctor)
- [ ] Join as attendee (user)
- [ ] Video/audio controls work
- [ ] Screen sharing works
- [ ] Participant list updates
- [ ] Q&A/Chat works
- [ ] Recording controls (host only)
- [ ] Leave webinar

---

## 🔧 ENVIRONMENT VARIABLES NEEDED

Add to `.env`:

```env
# LiveKit Configuration
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here
LIVEKIT_URL=wss://your-livekit-server.com
```

**To get LiveKit credentials:**

1. Sign up at https://livekit.io/
2. Create a project
3. Get API Key and Secret from dashboard
4. Copy WebSocket URL

---

## 🎯 KNOWN WORKING STATES

### Database

- ✅ PostgreSQL 16.11
- ✅ Database: `mediczy_ai`
- ✅ All 5 webinar tables exist
- ✅ Triggers and indexes active

### Backend

- ✅ Node.js v22.21.0
- ✅ Express server running on port 8888
- ✅ ES6 modules system
- ✅ Sequelize ORM connected
- ✅ All routes loaded

### Frontend

- ✅ React 18 + TypeScript
- ✅ Vite dev server
- ✅ No compilation errors
- ✅ LiveKit components imported

---

## 🚨 REQUIREMENTS BEFORE PRODUCTION

1. **LiveKit Setup**:
   - [ ] Create LiveKit cloud account OR self-host LiveKit server
   - [ ] Add credentials to `.env`
   - [ ] Test video connection

2. **Storage**:
   - [ ] Set up S3/Cloud Storage for webinar recordings
   - [ ] Configure CDN for video delivery

3. **Email Notifications**:
   - [ ] Webinar invitation emails
   - [ ] Webinar reminder emails (1 hour before)
   - [ ] Registration confirmation emails
   - [ ] Recording ready emails

4. **Monitoring**:
   - [ ] LiveKit analytics integration
   - [ ] Webinar attendance tracking
   - [ ] Video quality monitoring
   - [ ] Error logging for dropped connections

5. **Security**:
   - [ ] Rate limiting on join endpoint
   - [ ] Validate LiveKit tokens
   - [ ] Prevent token reuse
   - [ ] Implement attendee kick/ban

---

## ✅ SUMMARY

**All sanity checks PASSED:**

- Database migration ✅
- Backend routes (ES6 conversion) ✅
- Server startup ✅
- Frontend compilation ✅
- LiveKit packages ✅
- Route integration ✅

**Ready for functional testing:**

- All 23 API endpoints available
- All 4 UI components ready
- LiveKit integration complete

**Next Steps:**

1. Add LiveKit credentials to `.env`
2. Run curl tests against API endpoints
3. Test UI flows in browser
4. Create test webinar and verify video works
