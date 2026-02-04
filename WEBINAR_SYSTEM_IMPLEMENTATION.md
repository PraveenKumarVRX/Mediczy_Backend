# 🎥 Webinar System Implementation - Complete Guide

**Created:** February 4, 2026  
**Status:** ✅ COMPLETE  
**LiveKit Integration:** Enabled

---

## 📋 Overview

Comprehensive Zoom-like webinar functionality for doctors to conduct educational webinars, managed at super admin level (admin@mediczy.com), with role-based access for all users.

### Key Features

- **Super Admin Control:** Create, schedule, edit, and delete webinars
- **Doctor Hosting:** Start, host, and end webinars with full controls
- **User Participation:** Browse, register, and join webinars
- **LiveKit Integration:** Enterprise-grade video conferencing
- **Analytics & Tracking:** Attendance, engagement scores, Q&A metrics
- **Registration System:** Approval workflow with auto-approve option
- **Recording Support:** Webinar recording with playback
- **Interactive Features:** Chat, Q&A, screen sharing

---

## 🗄️ Database Schema

### Tables Created

#### 1. `webinars`

Main webinar information and settings.

```sql
- id (SERIAL PRIMARY KEY)
- title (VARCHAR 255) - Webinar title
- description (TEXT) - Detailed description
- doctor_id (INTEGER) - FK to doctors table
- scheduled_at (TIMESTAMP) - Start time
- duration (INTEGER) - Duration in minutes (default: 60)
- max_participants (INTEGER) - Capacity (default: 100)
- status (VARCHAR) - scheduled | live | completed | cancelled
- livekit_room_name (VARCHAR) - Unique LiveKit room identifier
- meeting_url (TEXT) - Frontend join URL
- created_by (INTEGER) - FK to users (admin who created it)
- started_at (TIMESTAMP)
- ended_at (TIMESTAMP)
- recording_enabled (BOOLEAN)
- chat_enabled (BOOLEAN)
- qa_enabled (BOOLEAN)
- registration_required (BOOLEAN)
- auto_approve_registration (BOOLEAN)
- thumbnail_url (TEXT)
- tags (TEXT[])
- metadata (JSONB)
- created_at, updated_at (TIMESTAMP)
```

#### 2. `webinar_registrations`

User registrations and attendance tracking.

```sql
- id (SERIAL PRIMARY KEY)
- webinar_id (INTEGER) - FK to webinars
- user_id (INTEGER) - FK to users
- registration_status (VARCHAR) - pending | approved | rejected | cancelled
- joined_at (TIMESTAMP)
- left_at (TIMESTAMP)
- duration (INTEGER) - Seconds attended
- approved_by (INTEGER) - FK to users
- approved_at (TIMESTAMP)
- rejection_reason (TEXT)
- attendance_status (VARCHAR) - registered | attended | missed | left_early
- created_at, updated_at (TIMESTAMP)
- UNIQUE(webinar_id, user_id)
```

#### 3. `webinar_recordings`

Recording metadata and storage.

```sql
- id (SERIAL PRIMARY KEY)
- webinar_id (INTEGER) - FK to webinars
- recording_url (TEXT)
- recording_id (VARCHAR) - LiveKit recording ID
- file_size (BIGINT) - Bytes
- duration (INTEGER) - Seconds
- format (VARCHAR) - Default: mp4
- status (VARCHAR) - processing | available | failed | deleted
- started_at, ended_at (TIMESTAMP)
- is_public (BOOLEAN)
- download_count (INTEGER)
- created_at, updated_at (TIMESTAMP)
```

#### 4. `webinar_chat_messages`

Chat and Q&A messages during webinar.

```sql
- id (SERIAL PRIMARY KEY)
- webinar_id (INTEGER) - FK to webinars
- user_id (INTEGER) - FK to users
- message (TEXT)
- message_type (VARCHAR) - text | question | announcement
- is_pinned (BOOLEAN)
- is_answered (BOOLEAN)
- answered_by (INTEGER) - FK to users
- answer (TEXT)
- created_at (TIMESTAMP)
```

#### 5. `webinar_analytics`

Performance metrics and engagement data.

```sql
- id (SERIAL PRIMARY KEY)
- webinar_id (INTEGER) - FK to webinars (UNIQUE)
- total_registrations (INTEGER)
- total_attendees (INTEGER)
- peak_concurrent_users (INTEGER)
- average_watch_duration (INTEGER) - Seconds
- total_questions (INTEGER)
- total_chat_messages (INTEGER)
- engagement_score (DECIMAL) - 0-100
- completion_rate (DECIMAL) - Percentage
- created_at, updated_at (TIMESTAMP)
```

**Migration File:** `/server/migrations/create_webinar_tables.sql`

---

## 🔌 API Endpoints

### Super Admin Routes (`/api/admin/webinars`)

| Method | Endpoint                             | Description                      | Auth Required |
| ------ | ------------------------------------ | -------------------------------- | ------------- |
| POST   | `/`                                  | Create new webinar               | Admin         |
| GET    | `/`                                  | List all webinars (with filters) | Admin         |
| GET    | `/:id`                               | Get webinar details              | Admin         |
| PUT    | `/:id`                               | Update webinar                   | Admin         |
| DELETE | `/:id`                               | Delete webinar                   | Admin         |
| PUT    | `/:id/registrations/:registrationId` | Approve/reject registration      | Admin         |
| GET    | `/:id/analytics`                     | Get webinar analytics            | Admin         |

**Request Example - Create Webinar:**

```json
POST /api/admin/webinars
{
  "title": "Understanding Diabetes Management",
  "description": "Comprehensive guide to diabetes care",
  "doctorId": 70,
  "scheduledAt": "2026-02-10T10:00:00Z",
  "duration": 90,
  "maxParticipants": 200,
  "recordingEnabled": true,
  "chatEnabled": true,
  "qaEnabled": true,
  "registrationRequired": true,
  "autoApproveRegistration": false,
  "tags": ["diabetes", "chronic-care", "nutrition"]
}
```

**Response:**

```json
{
  "success": true,
  "message": "Webinar created successfully",
  "webinar": {
    "id": 1,
    "title": "Understanding Diabetes Management",
    "roomName": "webinar-1738656000000-x9k2m5n7p",
    "meetingUrl": "https://mediczy.com/webinar/1",
    "status": "scheduled",
    "createdAt": "2026-02-04T12:00:00Z"
  }
}
```

---

### Doctor Routes (`/api/doctor/webinars`)

| Method | Endpoint                            | Description             | Auth Required |
| ------ | ----------------------------------- | ----------------------- | ------------- |
| GET    | `/my-webinars`                      | Get my webinars         | Doctor        |
| GET    | `/:id`                              | Get webinar details     | Doctor        |
| POST   | `/:id/start`                        | Start webinar (go live) | Doctor        |
| POST   | `/:id/end`                          | End webinar             | Doctor        |
| GET    | `/:id/attendees`                    | Get attendee list       | Doctor        |
| GET    | `/:id/questions`                    | Get Q&A questions       | Doctor        |
| POST   | `/:id/questions/:questionId/answer` | Answer question         | Doctor        |
| GET    | `/:id/recordings`                   | Get recordings          | Doctor        |

**Request Example - Start Webinar:**

```json
POST /api/doctor/webinars/1/start
```

**Response:**

```json
{
  "success": true,
  "message": "Webinar started successfully",
  "webinar": {
    "id": 1,
    "title": "Understanding Diabetes Management",
    "status": "live",
    "roomName": "webinar-1738656000000-x9k2m5n7p",
    "startedAt": "2026-02-10T10:00:00Z"
  },
  "livekit": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "serverUrl": "wss://video.mediczy.com",
    "roomName": "webinar-1738656000000-x9k2m5n7p"
  }
}
```

---

### Public Routes (`/api/webinars`)

| Method | Endpoint                 | Description              | Auth Required |
| ------ | ------------------------ | ------------------------ | ------------- |
| GET    | `/`                      | Browse webinars          | No            |
| GET    | `/:id`                   | Get webinar details      | No            |
| POST   | `/:id/register`          | Register for webinar     | Yes           |
| DELETE | `/:id/register`          | Cancel registration      | Yes           |
| POST   | `/:id/join`              | Join webinar (get token) | Yes           |
| POST   | `/:id/leave`             | Leave webinar            | Yes           |
| POST   | `/:id/questions`         | Post Q&A question        | Yes           |
| GET    | `/user/my-registrations` | Get my registrations     | Yes           |

**Request Example - Register:**

```json
POST /api/webinars/1/register
```

**Response:**

```json
{
  "success": true,
  "message": "Successfully registered for webinar",
  "registration": {
    "id": 123,
    "webinarId": 1,
    "status": "approved",
    "registeredAt": "2026-02-05T14:30:00Z",
    "needsApproval": false
  }
}
```

**Request Example - Join Webinar:**

```json
POST /api/webinars/1/join
```

**Response:**

```json
{
  "success": true,
  "message": "Joined webinar successfully",
  "webinar": {
    "id": 1,
    "title": "Understanding Diabetes Management",
    "roomName": "webinar-1738656000000-x9k2m5n7p",
    "chatEnabled": true,
    "qaEnabled": true
  },
  "livekit": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "serverUrl": "wss://video.mediczy.com",
    "roomName": "webinar-1738656000000-x9k2m5n7p"
  }
}
```

---

## 🎨 Frontend Components

### 1. Super Admin Webinar Management

**File:** `/client/src/pages/admin/SuperAdminWebinarManagement.tsx`

**Features:**

- Create new webinars with full configuration
- View all webinars with filters (status, doctor)
- Edit webinar settings
- Delete webinars (only if not live)
- Manage registrations (approve/reject)
- View analytics dashboard
- Real-time webinar status updates

**Access:** Admin only (`admin@mediczy.com`)

**Usage:**

```tsx
import SuperAdminWebinarManagement from '@/pages/admin/SuperAdminWebinarManagement';

// In route config
{
  path: '/admin/webinars',
  element: <SuperAdminWebinarManagement />,
  roles: ['admin']
}
```

---

### 2. Webinar Room Page (LiveKit)

**File:** `/client/src/pages/webinar/WebinarRoomPage.tsx`

**Features:**

- **Host Mode:**
  - Full video/audio/screen share controls
  - Participant management
  - Recording controls
  - End webinar for all
- **Attendee Mode:**
  - View-only video/audio
  - Chat participation (if enabled)
  - Q&A submission
  - Raise hand feature

**LiveKit Integration:**

- Uses `@livekit/components-react`
- GridLayout for multi-participant view
- RoomAudioRenderer for audio
- ControlBar for media controls
- Real-time participant count

**Usage:**

```tsx
import WebinarRoomPage from '@/pages/webinar/WebinarRoomPage';

// Host route
{
  path: '/doctor/webinar/:webinarId/host',
  element: <WebinarRoomPage isHost={true} />
}

// Attendee route
{
  path: '/webinar/:webinarId',
  element: <WebinarRoomPage isHost={false} />
}
```

---

### 3. Public Webinar List

**File:** `/client/src/pages/webinar/WebinarListPage.tsx`

**Features:**

- Browse upcoming/live/past webinars
- Search by title/description
- Filter by specialty, status
- View webinar details
- Register for webinars
- Cancel registrations
- One-click join for live webinars
- Registration status tracking

**Access:** All users

**Usage:**

```tsx
import WebinarListPage from '@/pages/webinar/WebinarListPage';

{
  path: '/webinars',
  element: <WebinarListPage />
}
```

---

### 4. Doctor Webinar Dashboard

**File:** `/client/src/pages/doctor/DoctorWebinarDashboard.tsx`

**Features:**

- View my webinars (upcoming/live/past)
- Start webinar (opens host room)
- End live webinar
- View attendee list with statuses
- View Q&A questions
- Real-time analytics:
  - Total registrations
  - Approved participants
  - Actual attendees
  - Peak concurrent users
  - Engagement score
- Download recordings

**Access:** Doctors only

**Usage:**

```tsx
import DoctorWebinarDashboard from '@/pages/doctor/DoctorWebinarDashboard';

{
  path: '/doctor/webinars',
  element: <DoctorWebinarDashboard />
}
```

---

## 🔐 Access Control & Permissions

### Role-Based Access

| Feature               | Admin | Doctor   | User (Patient)     |
| --------------------- | ----- | -------- | ------------------ |
| Create webinar        | ✅    | ❌       | ❌                 |
| Edit webinar          | ✅    | ❌       | ❌                 |
| Delete webinar        | ✅    | ❌       | ❌                 |
| Start/Host webinar    | ❌    | ✅       | ❌                 |
| End webinar           | ✅    | ✅       | ❌                 |
| Browse webinars       | ✅    | ✅       | ✅                 |
| Register for webinar  | ✅    | ✅       | ✅                 |
| Join webinar          | ✅    | ✅       | ✅ (if registered) |
| View analytics        | ✅    | ✅ (own) | ❌                 |
| Approve registrations | ✅    | ❌       | ❌                 |
| Answer Q&A            | ❌    | ✅ (own) | ❌                 |

### Authentication Flow

1. **Super Admin:**
   - Login as `admin@mediczy.com`
   - Navigate to `/admin/webinars`
   - Create and manage all webinars

2. **Doctor:**
   - Assigned to webinar by admin
   - Receives notification of assignment
   - Navigate to `/doctor/webinars`
   - Start webinar when scheduled
   - Opens LiveKit room as host

3. **User/Patient:**
   - Browse `/webinars`
   - Register for webinar
   - Await approval (if required)
   - Join when live via `/webinar/:id`
   - Opens LiveKit room as attendee

---

## 🎬 User Workflows

### Admin: Create Webinar

1. Navigate to Admin Dashboard → Webinars
2. Click "Create Webinar"
3. Fill in details:
   - Title: "Understanding Diabetes Management"
   - Description: Educational session
   - Doctor: Select from dropdown
   - Date/Time: Schedule
   - Duration: 60 minutes
   - Max Participants: 100
   - Settings: Enable recording, chat, Q&A
   - Registration: Required with auto-approve
4. Click "Create Webinar"
5. System generates unique room name
6. Webinar appears in list with "Scheduled" status

### Doctor: Host Webinar

1. Navigate to Doctor Dashboard → My Webinars
2. See upcoming webinar in "Upcoming" tab
3. When ready, click "Start Webinar"
4. System:
   - Updates status to "live"
   - Generates LiveKit host token
   - Opens video room
5. Doctor has full controls:
   - Camera on/off
   - Microphone on/off
   - Screen share
   - View participants
   - Answer Q&A questions
6. When done, click "End Webinar"
7. System:
   - Updates status to "completed"
   - Disconnects all participants
   - Saves recording (if enabled)
   - Generates analytics

### User: Join Webinar

1. Navigate to Webinars page
2. Browse upcoming webinars
3. Click "Details" to view full information
4. Click "Register"
5. System:
   - Creates registration
   - Auto-approves (if enabled)
   - Or awaits admin approval
6. When webinar goes live:
   - Status changes to "Live Now"
   - "Join Now" button appears
7. Click "Join Now"
8. System:
   - Generates LiveKit attendee token
   - Opens video room
   - User can view, chat, submit questions
9. Click "Leave" to exit

---

## 🔧 Configuration & Setup

### Environment Variables

Add to `.env`:

```bash
# LiveKit Configuration
LIVEKIT_URL=wss://video.mediczy.com
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here

# Frontend URL for meeting links
FRONTEND_URL=https://mediczy.com
```

### Database Migration

Run the migration to create all required tables:

```bash
cd server
psql -U postgres -d mediczy -f migrations/create_webinar_tables.sql
```

Or using your migration tool:

```bash
npm run migrate:webinars
```

### Frontend Dependencies

Ensure LiveKit packages are installed:

```bash
cd client
npm install @livekit/components-react livekit-client
```

### Backend Dependencies

LiveKit server SDK:

```bash
cd server
npm install livekit-server-sdk
```

---

## 📊 Analytics & Reporting

### Tracked Metrics

1. **Registration Metrics:**
   - Total registrations
   - Approved registrations
   - Pending registrations
   - Rejected registrations

2. **Attendance Metrics:**
   - Total attendees (joined)
   - Peak concurrent users
   - Average watch duration
   - Completion rate

3. **Engagement Metrics:**
   - Total chat messages
   - Total questions
   - Questions answered
   - Engagement score (calculated)

4. **Performance Metrics:**
   - Webinar duration (actual)
   - Recording size
   - Download count

### Analytics Calculation

**Engagement Score Formula:**

```
Engagement Score = (
  (Total Questions × 10) +
  (Total Chat Messages × 5) +
  (Attendees / Registrations × 50) +
  (Completion Rate × 35)
) / 100

Capped at 100
```

---

## 🎯 Best Practices

### For Admins

1. **Schedule in Advance:** Create webinars at least 1 week before
2. **Choose Right Doctor:** Assign doctors with expertise in topic
3. **Set Appropriate Capacity:** Consider bandwidth and engagement
4. **Enable Features Wisely:**
   - Recording: ON for educational content
   - Chat: ON for engagement
   - Q&A: ON for interactive sessions
   - Auto-approve: ON for public webinars, OFF for exclusive
5. **Monitor Analytics:** Review post-webinar for improvements

### For Doctors

1. **Test Setup:** Join 15 minutes early to test audio/video
2. **Prepare Content:** Have slides ready for screen share
3. **Engage Audience:** Monitor chat and Q&A during session
4. **Time Management:** Keep to scheduled duration
5. **Follow Up:** Review analytics and unanswered questions

### For Users

1. **Register Early:** Don't wait until last minute
2. **Check Requirements:** Ensure device compatibility
3. **Join on Time:** Join 5 minutes before start
4. **Use Good Connection:** Stable internet required
5. **Participate:** Use chat and Q&A features

---

## 🐛 Troubleshooting

### Common Issues

**Issue:** "Failed to start webinar"

- **Cause:** Webinar already started or past scheduled time
- **Solution:** Check webinar status, ensure it's "scheduled"

**Issue:** "Unable to join webinar"

- **Cause:** Not registered or registration not approved
- **Solution:** Check registration status, wait for approval

**Issue:** "Video/audio not working"

- **Cause:** Browser permissions or LiveKit connection
- **Solution:** Grant camera/mic permissions, check LiveKit server status

**Issue:** "Registration full"

- **Cause:** Max participants reached
- **Solution:** Admin can increase capacity or create additional session

### Debug Mode

Enable debug logging:

```javascript
// In WebinarRoomPage.tsx
const room = useRoomContext();
room.on("participantConnected", (participant) => {
  console.log("Participant joined:", participant.identity);
});

room.on("trackSubscribed", (track, publication, participant) => {
  console.log("Track subscribed:", track.kind, participant.identity);
});
```

---

## 🚀 Future Enhancements

### Planned Features

1. **Breakout Rooms:** Split participants into smaller groups
2. **Polls & Surveys:** Real-time audience feedback
3. **Whiteboard:** Collaborative drawing tool
4. **Automated Transcription:** AI-powered captions
5. **Email Notifications:** Reminders and follow-ups
6. **Payment Integration:** Paid webinars
7. **Certificates:** Post-webinar certificates
8. **Replays:** On-demand viewing with analytics

---

## 📞 Support

For issues or questions:

- **Technical Support:** support@mediczy.com
- **Admin Contact:** admin@mediczy.com
- **Documentation:** https://docs.mediczy.com/webinars
- **LiveKit Docs:** https://docs.livekit.io

---

## ✅ Implementation Checklist

- [x] Database schema created
- [x] Admin API routes implemented
- [x] Doctor API routes implemented
- [x] Public API routes implemented
- [x] Super Admin UI component
- [x] Webinar room with LiveKit
- [x] Public webinar listing
- [x] Doctor dashboard
- [x] Routes integrated in app.js
- [x] Authentication & authorization
- [x] Analytics tracking
- [x] Q&A system
- [x] Recording support
- [ ] Email notifications (future)
- [ ] Payment integration (future)
- [ ] Breakout rooms (future)

---

**Status:** ✅ PRODUCTION READY

All core features implemented and tested. System ready for deployment!
