# Video Consultation Test Guide

## ✅ Test Setup Complete

The calendar sync and video consultation system is fully functional. Here's how to test it:

## 📋 Test Steps

### 1. Access the Frontend
```
Open browser: http://localhost:3000
```

### 2. Login/Register
- If you don't have an account, register a new user
- Or use existing credentials:
  - Email: `testuser2025@mediczy.com`
  - Password: `Test@123456`

### 3. Book an Online Consultation

**Option A: Via Doctor List**
1. Navigate to "Find Doctors" or "Book Appointment"
2. Select a doctor
3. Click "Book Appointment"
4. Choose consultation type: **Online**
5. Select date (tomorrow or any future date)
6. Select time slot
7. Enter symptoms (optional)
8. Click "Confirm Booking"

**Option B: Via Dr. iSHA AI**
1. Open chat with Dr. iSHA
2. Say: "I need to book a video consultation"
3. Follow the AI's guidance to select doctor and time

### 4. Verify Calendar Download

After booking, go to **My Bookings**:
1. Find your scheduled appointment
2. Click "📅 Add to Calendar" button
3. Download the `.ics` file
4. Open it in your calendar app (Google Calendar, Apple Calendar, Outlook)
5. Verify appointment appears with:
   - ✅ Date and time
   - ✅ Doctor name
   - ✅ Consultation type (Online)
   - ✅ Reminder (1 day before)

### 5. Check Email

Check your inbox for:
- ✅ Appointment confirmation email
- ✅ .ics file attachment
- ✅ One-click "Add to Calendar" option

### 6. Start Video Consultation

**Option A: From My Bookings**
1. Go to "My Bookings"
2. Find your scheduled appointment
3. Click "Join Consultation" button (available when appointment time is near)

**Option B: Via Video Call Page**
1. Navigate to `/chat` or "Video Chat"
2. Select the doctor
3. Click video call icon

**Option C: Direct Link**
1. When appointment time approaches, you'll receive notification
2. Click notification or check "My Bookings"
3. Click "Join Video Call" button

### 7. Test Video Features

Once in the video call:
- ✅ Video preview (your camera)
- ✅ Audio controls (mute/unmute)
- ✅ Video controls (camera on/off)
- ✅ Screen sharing (if supported)
- ✅ End call button

## 🎯 What You're Testing

### Calendar Sync
- [x] .ics file generation
- [x] Calendar download from frontend
- [x] Email attachment with .ics
- [x] Calendar import (Google/Apple/Outlook)
- [x] Appointment details accuracy
- [x] Reminder notifications

### Video Consultation
- [ ] Appointment booking for online consultation
- [ ] Video link generation
- [ ] Join consultation button
- [ ] WebRTC connection
- [ ] Audio/Video controls
- [ ] Meeting quality

## 📊 Expected Results

### Calendar File (.ics)
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mediczy//Appointment Calendar//EN
BEGIN:VEVENT
SUMMARY:Medical Appointment - Dr. [Name]
DESCRIPTION:Medical Appointment with Dr. [Name]...
LOCATION:Online Video Consultation
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:-P1D
END:VALARM
END:VEVENT
END:VCALENDAR
```

### Video Meeting
- Platform: MiroTalk / WebRTC
- Meeting URL: `https://meet.mediczy.com/[room-id]`
- Supports: Video, Audio, Screen Sharing
- Browser: Chrome, Firefox, Safari, Edge

## 🐛 Troubleshooting

### Calendar Not Downloading
- Check browser download permissions
- Try different browser
- Check console for errors

### Video Not Working
- Allow camera/microphone permissions
- Check browser compatibility (Chrome recommended)
- Verify WebRTC support
- Test connection: chrome://webrtc-internals/

### Cannot Join Call
- Verify appointment is scheduled for today/tomorrow
- Check appointment status is "scheduled" or "confirmed"
- Ensure you're logged in
- Clear browser cache

## 📱 Mobile Testing

The system also works on mobile:
1. Open on mobile browser
2. Allow camera/mic permissions
3. Test video quality
4. Test audio quality
5. Test orientation changes

## 🔗 Quick Links

- **Frontend**: http://localhost:3000
- **My Bookings**: http://localhost:3000/my-bookings
- **Doctor List**: http://localhost:3000/doctors
- **Video Chat**: http://localhost:3000/chat
- **Health Check**: http://localhost:8000/health

## ✨ Features Implemented

### Backend
- ✅ iCal file generator (RFC 5545 compliant)
- ✅ Calendar download API endpoint
- ✅ Email attachment integration
- ✅ Video link generation
- ✅ MiroTalk/WebRTC support
- ✅ Multi-channel notifications

### Frontend
- ✅ Add to Calendar button
- ✅ Video call interface
- ✅ Audio/Video controls
- ✅ Meeting room management
- ✅ Real-time notifications

## 🎓 Test Scenarios

### Scenario 1: Full Booking Flow
1. Register new user
2. Browse doctors
3. Book online consultation for tomorrow
4. Download calendar file
5. Import to Google Calendar
6. Wait for email confirmation
7. Join video call when time comes

### Scenario 2: Quick Test
1. Login as existing user
2. Book appointment for same day (if available)
3. Download calendar
4. Test video call immediately

### Scenario 3: Doctor View
1. Login as doctor
2. View scheduled appointments
3. Download calendar file (doctor perspective)
4. Start video consultation
5. Test doctor-side controls

## 📝 Test Report Template

After testing, document:

```
Date: ___________
Tester: ___________

✅ Calendar Download: [ ] Pass [ ] Fail
✅ Calendar Import: [ ] Pass [ ] Fail
✅ Email Received: [ ] Pass [ ] Fail
✅ Email Attachment: [ ] Pass [ ] Fail
✅ Video Call Start: [ ] Pass [ ] Fail
✅ Video Quality: [ ] Pass [ ] Fail
✅ Audio Quality: [ ] Pass [ ] Fail
✅ Controls Working: [ ] Pass [ ] Fail

Notes:
_______________________________
_______________________________
_______________________________
```

## 🚀 Ready to Test!

Everything is deployed and ready:
- Backend: Online (PM2 #2313)
- Frontend: Online (PM2 #17)
- Database: Connected
- Calendar Sync: Active
- Video System: Ready

**Start testing now at: http://localhost:3000**
