# Video Consultation - Quick Start Guide

## 🎥 For Patients

### Method 1: Video Consultation Page
1. Login to your account at http://mediqzy.com
2. Click "Video Consultation" from the main menu or navigate to: http://mediqzy.com/video-consultation
3. You'll see:
   - **Quick Join**: Enter a room code if your doctor provided one
   - **Upcoming Appointments**: Your confirmed online consultations
   - **Join Now** button (green) appears 15 minutes before your appointment

### Method 2: My Bookings Page
1. Go to "My Bookings" at http://mediqzy.com/my-bookings
2. Find your online consultation
3. Click the blue **"Join Video Call"** button
4. Video call opens in a new browser tab

### Before Your Call
- Allow camera and microphone permissions when prompted
- Use Chrome, Firefox, Safari, or Edge (latest versions)
- Ensure stable internet connection
- Test your equipment beforehand

## 👨‍⚕️ For Doctors

### Method 1: Quick Start (Instant Room)
1. Login to doctor dashboard at http://mediqzy.com/doctor/login
2. Navigate to http://mediqzy.com/doctor/video
3. Click **"Quick Start"** button
4. Share the room ID with your patient
5. Patient can join using the room code on their video consultation page

### Method 2: From Scheduled Appointments
1. Go to doctor video dashboard
2. View "Upcoming Consultations"
3. Click **"Start Call"** on the appointment
4. Video call opens in a new tab with patient name pre-filled

### Method 3: Manual Room Join
1. On doctor video dashboard
2. Enter the room ID in the "Join Existing Room" section
3. Click "Join Room"

## 🔗 Direct MiroTalk Access

You can also access MiroTalk directly:
- Base URL: http://mediqzy.com:3010
- Join specific room: http://mediqzy.com:3010/join/{ROOM_ID}?name={YOUR_NAME}

Example:
```
http://mediqzy.com:3010/join/apt-12345?name=Dr.%20Smith
```

## 📅 Room ID Formats

- **Appointment-based**: `apt-{appointmentId}` (e.g., `apt-67890`)
- **Doctor Quick Start**: `dr-{doctorId}-{timestamp}` (e.g., `dr-123-1735987654321`)
- **Custom**: Any alphanumeric code you create

## ⏰ Join Window

Patients can join video calls **15 minutes before** the scheduled appointment time. The "Join Now" button turns green when the join window opens.

## 🛠️ System Requirements

### Supported Browsers
- ✅ Google Chrome 74+
- ✅ Mozilla Firefox 66+
- ✅ Safari 12+
- ✅ Microsoft Edge 79+

### Required Permissions
- 📹 Camera access
- 🎤 Microphone access
- (Optional) Screen sharing

## 🎯 Features Available During Call

- **Video/Audio**: Real-time video and audio streaming
- **Screen Sharing**: Share your screen with participants
- **Chat**: Text messaging during the call
- **Recording**: Record consultations (if enabled)
- **Mute/Unmute**: Control your microphone
- **Camera On/Off**: Control your camera
- **Full Screen**: Expand to full screen mode

## 🚨 Troubleshooting

### Video/Audio Not Working
1. Check browser permissions (camera/microphone)
2. Try refreshing the page
3. Ensure no other app is using camera/microphone
4. Try a different browser

### Cannot Join Call
1. Verify you're within the 15-minute join window
2. Check your internet connection
3. Ensure appointment status is "confirmed"
4. Try joining with the room code directly

### Room Not Found
1. Double-check the room ID
2. Ensure the doctor has started the call
3. Verify the meeting link is correct

### Poor Quality
1. Close other browser tabs/applications
2. Check your internet speed
3. Move closer to WiFi router
4. Disable screen sharing if active

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Try using the direct MiroTalk URL
3. Contact technical support with:
   - Browser name and version
   - Error message (if any)
   - Appointment ID or room code

## 🔐 Privacy & Security

- All video calls are encrypted using WebRTC
- No call data is stored on servers (unless recording is enabled)
- Only participants with the room ID can join
- Camera/microphone permissions are required and controlled by you

---

**Need Help?** Visit the Video Consultation page for system requirements and detailed instructions.
