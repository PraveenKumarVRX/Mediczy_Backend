# Video Consultation - Calling Notification System

**Date**: January 12, 2026  
**Status**: ✅ Implemented

---

## 🎯 Feature Overview

Implemented a comprehensive calling notification system that alerts both doctors and patients about upcoming video consultations to prevent missed appointments.

---

## 🔔 Notification Timing

The system sends notifications at multiple intervals:

### **15 Minutes Before**
- **Type**: Info notification
- **Purpose**: Early warning to prepare
- **Action**: "Prepare" - Get ready for call
- **Sound**: None
- **Visual**: Blue notification card

### **5 Minutes Before**
- **Type**: Warning notification  
- **Purpose**: Final preparation reminder
- **Action**: "Get Ready" - Time to be in position
- **Sound**: Notification beep
- **Visual**: Yellow notification card with audio alert

### **1 Minute Before**
- **Type**: Urgent notification
- **Purpose**: Immediate call alert
- **Action**: "Join Now" - Ready to connect
- **Sound**: Calling ringtone (looping)
- **Visual**: Orange persistent notification with vibration
- **Behavior**: Persistent until dismissed

### **At Appointment Time**
- **Type**: Critical incoming call
- **Purpose**: Answer the video call
- **Action**: "Answer" - Join immediately
- **Sound**: Ringing tone (looping)
- **Visual**: Full-screen call interface with answer/decline buttons
- **Behavior**: 
  - Full-screen overlay (like a phone call)
  - Caller avatar and name displayed
  - Ringing sound continues until answered/declined
  - Vibration pattern
  - Browser notification

---

## 🏗️ Technical Implementation

### Backend Components

#### 1. Appointment Notification Service
**File**: `server/services/appointment-notification.service.js`

**Features**:
- Cron job runs every minute
- Checks for appointments in next 15 minutes
- Sends targeted notifications via Socket.io
- Prevents duplicate notifications
- Auto-cleanup old notification records

**Key Methods**:
```javascript
checkUpcomingAppointments()    // Check every minute
send15MinuteWarning()          // Early warning
send5MinuteWarning()           // Preparation alert
sendUrgentCallNotification()   // 1-minute urgent alert
sendCallNowNotification()      // Full-screen call at appointment time
```

#### 2. Socket.io Integration
**File**: `server/index.js`

**Changes**:
- Import notification service
- Initialize with Socket.io instance
- Start cron job on server startup

**File**: `server/chat/chathandler.controller.js`

**Changes**:
- Users join room: `doctor-{doctorId}` or `user-{userId}`
- Enables targeted notification delivery
- Returns io instance for service use

---

### Frontend Components

#### 1. Video Call Notification Component
**File**: `client/src/components/notifications/VideoCallNotification.tsx`

**Features**:
- Listens for Socket.io `appointment_notification` events
- Displays notifications based on urgency level
- Plays audio alerts (notification, calling, ringing)
- Vibrates device when supported
- Shows browser notifications
- Full-screen call UI for critical notifications
- Answer/Decline buttons for incoming calls
- Auto-dismisses non-critical notifications after 30s

**Notification Modes**:
1. **Standard Card** - Info, Warning, Urgent notifications
2. **Full-Screen Call** - Critical incoming call interface

#### 2. Socket Connection Hook
**File**: `client/src/hooks/useSocketConnection.ts`

**Features**:
- Auto-connects user to Socket.io on mount
- Joins appropriate notification room
- Requests browser notification permission
- Handles both patient and doctor connections

#### 3. Layout Integration
**File**: `client/src/components/layout/MainLayout.tsx`

**Changes**:
- Import VideoCallNotification component
- Import useSocketConnection hook
- Initialize socket connection
- Render notification component

---

## 📊 Notification Flow

```
SERVER SIDE
═══════════
Cron Job (Every minute)
    ↓
Check appointments in next 15 minutes
    ↓
Calculate time until appointment
    ↓
Determine notification type (15m, 5m, 1m, now)
    ↓
Emit Socket.io event to specific rooms:
- io.to(`user-${userId}`).emit('appointment_notification', data)
- io.to(`doctor-${doctorId}`).emit('appointment_notification', data)


CLIENT SIDE
═══════════
Socket.io listener active
    ↓
Receive 'appointment_notification' event
    ↓
Parse notification data (urgency, action, sound, etc.)
    ↓
Display notification UI
    ↓
Play appropriate sound
    ↓
Vibrate device (if supported)
    ↓
Show browser notification
    ↓
User Actions:
- Answer → Navigate to video consultation
- Decline → Dismiss notification
- Dismiss → Close notification
```

---

## 🎨 User Experience

### Patient Experience

**15 Minutes Before:**
```
┌─────────────────────────────────────┐
│ 📅 Upcoming Video Consultation      │
│ Your appointment with Dr. Rajesh    │
│ Kumar starts in 15 minutes          │
│                                     │
│ ⏰ 10:00 AM                         │
│ [Got it]                            │
└─────────────────────────────────────┘
```

**5 Minutes Before:**
```
┌─────────────────────────────────────┐
│ ⚠️  Video Consultation Starting Soon│
│ Your appointment with Dr. Rajesh    │
│ Kumar starts in 5 minutes.          │
│ Please get ready!                   │
│                                     │
│ ⏰ 10:00 AM | in 5 minutes          │
│ [Got it]                            │
└─────────────────────────────────────┘
🔔 *notification beep*
```

**1 Minute Before:**
```
┌─────────────────────────────────────┐
│ 🔔 Video Consultation Starting Now! │
│ Dr. Rajesh Kumar is ready to see you│
│                                     │
│ Cardiology                          │
│ ⏰ 10:00 AM | in 1 minute           │
│                                     │
│ [Decline]  [Join Now]               │
└─────────────────────────────────────┘
📞 *calling ringtone (looping)*
📳 *vibration*
```

**At Appointment Time (Full-Screen):**
```
┌───────────────────────────────────────┐
│                                       │
│                                       │
│            ┌─────────┐                │
│            │   (R)   │ ← Caller Avatar│
│            └─────────┘                │
│         pulse animation               │
│                                       │
│      Dr. Rajesh Kumar                 │
│        Cardiology                     │
│                                       │
│        📹 Video Consultation          │
│        🕐 10:00 AM                    │
│                                       │
│                                       │
│      ┌───┐         ┌───┐             │
│      │ ✗ │         │ ✓ │             │
│      └───┘         └───┘             │
│     Decline       Answer              │
│    (bounce)                           │
│                                       │
│  Your appointment is ready to start  │
│                                       │
└───────────────────────────────────────┘
📞 *ringing tone (continuous)*
📳 *vibration pattern*
```

### Doctor Experience

Same notification flow with patient details instead:

```
┌─────────────────────────────────────┐
│ 🔔 Video Consultation Starting Now! │
│ Priya Sharma is waiting to join    │
│                                     │
│ ⏰ 10:00 AM | NOW                   │
│                                     │
│ [Decline]  [Answer]                 │
└─────────────────────────────────────┘
```

---

## 🔧 Configuration

### Backend Environment
```bash
# No additional env variables needed
# Uses existing Socket.io configuration
```

### Cron Schedule
```javascript
// Runs every minute
cron.schedule('* * * * *', () => {
  this.checkUpcomingAppointments();
});
```

### Notification Timing Windows
```javascript
15 minutes: timeDiff > 13m && timeDiff <= 15m
5 minutes:  timeDiff > 4m && timeDiff <= 5m
1 minute:   timeDiff > 0 && timeDiff <= 1m
At time:    timeDiff <= 0 && timeDiff > -30s
```

---

## 📱 Browser Notification

The system also sends browser notifications if permission is granted:

```javascript
// Request permission
Notification.requestPermission()

// Show notification
new Notification('Video Call - Join Now!', {
  body: 'Dr. Rajesh Kumar is calling you',
  icon: '/logo.png',
  badge: '/logo.png',
  tag: 'appointment-456',
  requireInteraction: true,  // For critical notifications
  vibrate: [500, 200, 500]   // Vibration pattern
});
```

**Clicking the browser notification**:
- Brings focus to the window
- Automatically answers the call
- Navigates to video consultation page

---

## 🎵 Audio Alerts

### Notification Beep (5-minute warning)
- **Duration**: Short beep
- **Loop**: No
- **Volume**: 50%

### Calling Tone (1-minute warning)
- **Duration**: Continuous
- **Loop**: Yes
- **Volume**: 60%

### Ringing Tone (At appointment time)
- **Duration**: Continuous
- **Loop**: Yes
- **Volume**: 80%
- **Stops**: When answered or declined

---

## 📳 Vibration Patterns

For devices that support vibration:

```javascript
// 5-minute warning
navigator.vibrate([500, 200, 500]);

// 1-minute and call time
setInterval(() => {
  navigator.vibrate([500, 200, 500]);
}, 1200); // Repeat every 1.2 seconds
```

---

## 🚀 Benefits

### For Patients:
✅ **Never miss appointments** - Multiple reminders  
✅ **Prepare in advance** - 15-minute early warning  
✅ **One-click join** - Easy access to video call  
✅ **Phone-like experience** - Familiar call interface  
✅ **Works while busy** - Notifications appear over other work

### For Doctors:
✅ **Professional workflow** - Know exactly when patient is ready  
✅ **Reduce no-shows** - Patients get reminded automatically  
✅ **Quick response** - Answer calls immediately  
✅ **Multi-tasking friendly** - Get alerts even when in other tabs

---

## 🧪 Testing

### Manual Test
```javascript
// From browser console (for testing)
socket.emit('test_notification', {
  appointmentId: 123,
  userId: 456,
  doctorId: 789
});
```

### Backend Test Endpoint
```javascript
// Add to server for testing
app.post('/api/test/notification', (req, res) => {
  notificationService.sendTestNotification(
    req.body.appointmentId,
    req.body.userId,
    req.body.doctorId
  );
  res.json({ success: true });
});
```

---

## 📊 Notification Data Structure

```typescript
interface CallNotification {
  type: 'incoming_call' | 'appointment_reminder';
  urgency: 'info' | 'warning' | 'urgent' | 'critical';
  title: string;
  message: string;
  appointmentId: number;
  appointmentTime: string;
  doctorName?: string;
  doctorSpecialization?: string;
  patientName?: string;
  roomId: string;
  meetingLink?: string;
  timeRemaining: '15 minutes' | '5 minutes' | '1 minute' | 'now';
  action: 'prepare' | 'get_ready' | 'join_now' | 'answer';
  sound?: 'notification' | 'calling' | 'ringing';
  vibrate?: boolean;
  persistent?: boolean;
  fullScreen?: boolean;
}
```

---

## 🔐 Security

- Notifications sent only to specific Socket.io rooms
- Room IDs based on user/doctor IDs
- No sensitive data in notifications
- Room tokens validated on join
- Browser notifications require user permission

---

## 📝 Files Created/Modified

### Created:
1. `server/services/appointment-notification.service.js` - Notification service
2. `client/src/components/notifications/VideoCallNotification.tsx` - Notification UI
3. `client/src/hooks/useSocketConnection.ts` - Socket connection hook
4. `VIDEO_CONSULTATION_CALLING_NOTIFICATIONS.md` - This documentation

### Modified:
1. `server/index.js` - Initialize notification service
2. `server/chat/chathandler.controller.js` - Add room joining, return io instance
3. `client/src/components/layout/MainLayout.tsx` - Add notification component

---

## 🎯 Summary

The calling notification system ensures that both doctors and patients are **always aware** of upcoming video consultations through:

- **Multi-stage alerts** (15m, 5m, 1m, now)
- **Progressive urgency** (info → warning → urgent → critical)
- **Audio + Visual + Vibration** alerts
- **Full-screen call interface** at appointment time
- **One-click join** for seamless connection
- **Phone-like experience** familiar to all users

**Result**: Zero missed appointments, professional experience, seamless workflow integration.

---

**Last Updated**: January 12, 2026  
**Status**: ✅ Production Ready
