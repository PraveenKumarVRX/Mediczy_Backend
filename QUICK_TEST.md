# 🚀 Quick Test Guide - 2 Minutes

## Test the Video Call System NOW!

### What You Need
- 2 browsers (Chrome + Firefox, or Chrome + Incognito)
- 5 minutes

---

## Step 1: Open Doctor Dashboard (Browser 1)
```
URL: https://mediqzy.com/doctor/login
Login: doctor@mediczy.com / <password>
Go to: /doctor/triage
```
✅ Should see: Triage dashboard loading

---

## Step 2: Open Patient Page (Browser 2)
```
URL: https://mediqzy.com/login
Login: <any patient account>
Go to: /emergency
Scroll: Find "Connect to Online Emergency Doctor" card
```
✅ Should see: Green "Connect Now" button

---

## Step 3: Patient Connects
**Click:** "Connect Now (Next Available)"

**Browser 2 (Patient) should show:**
- 🔔 "Waiting for Dr. Nandita Agarwal..."
- Spinner animation
- "Pending" badge

---

## Step 4: Doctor Receives Call
**Browser 1 (Doctor) should show:**

🚨 **FULLSCREEN INCOMING CALL!**
- Patient name
- Symptoms
- Timer counting down from 60s
- Green "Accept" button (pulsing)
- Red "Reject" button

---

## Step 5: Doctor Accepts
**Click:** Green "Accept" button

**Browser 1 (Doctor):**
- Video iframe opens
- MiroTalk room loads

**Browser 2 (Patient):**
- "✅ Doctor Accepted! Ready to Join"
- Green "Join Video Call" button appears

---

## Step 6: Both Join Video
**Both browsers:** Click "Join Video Call"

✅ **SUCCESS!** Both in same video room

---

## 🐛 Debugging

**If patient doesn't see "waiting":**
- Check console for Socket.IO connection
- Refresh page and try again

**If doctor doesn't get notification:**
- Check console: Should see socket connection
- Make sure on /doctor/triage page
- Check PM2: `pm2 logs mediczy-server`

**If video doesn't load:**
- Check MiroTalk: `pm2 list | grep mirotalk`
- Should show "online"

---

## ✅ What to Expect

**Console Logs (Browser 1 - Doctor):**
```
🔌 Connecting Socket.IO for doctor: 70
✅ Socket connected: abc123xyz
📞 Incoming triage call request: {...}
```

**Console Logs (Browser 2 - Patient):**
```
🔌 Connecting Socket.IO for patient: 45
✅ Socket connected: xyz789abc
✅ Doctor accepted call: {...}
```

---

## 🎉 Test Complete!

**If you see the fullscreen incoming call on doctor side, the system is working!**

For detailed testing: See [TEST_RESULTS.md](TEST_RESULTS.md)
For full documentation: See [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)

---
**Ready to test? GO!** 🚀
