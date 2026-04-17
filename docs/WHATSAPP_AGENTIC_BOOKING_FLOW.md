# WhatsApp Agentic Health Checkup Booking Flow

## 🤖 How the Bot Responds as an Agentic AI

When a user wants to book a health checkup via WhatsApp, the bot operates as an **autonomous agent** that:
1. **Understands intent** - Detects booking/checkup keywords
2. **Gathers information** - Conversationally collects required details
3. **Takes action** - Actually creates the appointment in the database
4. **Confirms** - Sends booking confirmation with all details

---

## 📱 Example Conversation Flow

```
👤 User: "I want to book a health checkup"

🤖 Dr. iSHA: Hi Rahul! 🏥 I can help you book a health checkup.

*Available Health Packages:*

*1. Basic Health Checkup*
   ₹1499 | 60 mins
   _CBC, Blood Sugar, Lipid Profile, Liver & Kidney Function_

*2. Comprehensive Health Checkup*
   ₹3499 | 120 mins
   _All basic tests + Thyroid, Vitamin D, B12, ECG, Chest X-ray_

*3. Cardiac Health Checkup*
   ₹4999 | 90 mins
   _ECG, 2D Echo, TMT, Lipid Profile, Cardiac Markers_

*4. Diabetic Care Checkup*
   ₹1999 | 60 mins
   _HbA1c, Fasting & PP Sugar, Kidney Function, Foot Exam_

*5. Women's Wellness Checkup*
   ₹3999 | 90 mins
   _CBC, Thyroid, Vitamin D, B12, Pap Smear, Breast Exam_

*6. Senior Citizen Health Checkup*
   ₹5999 | 150 mins
   _Complete body checkup + Bone density, Vision, Hearing test_

Which package would you like? Reply with the *number* (1-6) or the package name.
```

```
👤 User: "2"

🤖 Dr. iSHA: ✅ Great choice! You've selected:

*Comprehensive Health Checkup*
💰 ₹3499
⏱️ Duration: 120 mins

📅 When would you like to schedule this?

You can say:
• "Tomorrow"
• "Next Monday"
• "January 25"
• Or any specific date
```

```
👤 User: "Next Saturday"

🤖 Dr. iSHA: 📅 Perfect! *Saturday, January 25, 2025*

What time works best for you?

🌅 Morning (9 AM - 12 PM)
☀️ Afternoon (12 PM - 4 PM)
🌆 Evening (4 PM - 8 PM)

Or specify a time like "10:30 AM"
```

```
👤 User: "Morning"

🤖 Dr. iSHA: 🎉 Great news! I found available slots:

*1. 09:00 AM*
   📍 Mediczy Health Center
   💰 ₹3499

*2. 10:30 AM*
   📍 Mediczy Health Center
   💰 ₹3499

*3. 02:00 PM*
   📍 Mediczy Health Center
   💰 ₹3499

Reply with the *slot number* to confirm your booking.
```

```
👤 User: "1"

🤖 Dr. iSHA: ✅ *BOOKING CONFIRMED!*

📋 *Booking ID:* MED000147
📅 *Date:* Saturday, January 25, 2025
⏰ *Time:* 09:00 AM
🏥 *Package:* Comprehensive Health Checkup
💰 *Amount:* ₹3499

*What's Next:*
• You'll receive a confirmation SMS shortly
• Please arrive 15 minutes early
• Bring a valid ID and any previous reports

Need to reschedule? Just say "reschedule my appointment"

Thank you for choosing Mediczy! 💙
```

---

## 🔄 State Machine Architecture

```
                    ┌──────────────┐
                    │     IDLE     │ ◄──── User says "book checkup"
                    └──────┬───────┘
                           │
                           ▼
                ┌──────────────────────┐
                │   GATHERING_TYPE     │ ◄──── Shows package options
                └──────────┬───────────┘
                           │ User selects package (1-6)
                           ▼
                ┌──────────────────────┐
                │   GATHERING_DATE     │ ◄──── "Tomorrow", "Next Monday"
                └──────────┬───────────┘
                           │ Date parsed & validated
                           ▼
                ┌──────────────────────┐
                │   GATHERING_TIME     │ ◄──── "Morning", "10:30 AM"
                └──────────┬───────────┘
                           │ Finds available slots
                           ▼
                ┌──────────────────────┐
                │     CONFIRMING       │ ◄──── Shows 3 available slots
                └──────────┬───────────┘
                           │ User selects slot (1-3)
                           ▼
                ┌──────────────────────┐
         ┌──────│     COMPLETED        │ ◄──── 🎯 BOOKING CREATED IN DB!
         │      └──────────────────────┘
         │
         │  🤖 AGENTIC ACTIONS TAKEN:
         │  ✅ Appointment record created
         │  ✅ User linked (or created)
         │  ✅ Confirmation SMS sent
         │  ✅ Booking ID generated
         ▼
    Back to IDLE (ready for next booking)
```

---

## 🎯 What Makes This "Agentic"?

### ❌ OLD (Non-Agentic) Behavior:
```javascript
// Just provides information and a link
response = `Hi! To book an appointment, please visit:\n`;
response += `https://app.mediqzy.com/book-appointment`;
// User has to do everything themselves
```

### ✅ NEW (Agentic) Behavior:
```javascript
// Actually EXECUTES the booking
const appointment = await Appointment.create({
  userId: userId,
  appointmentDate: bookingData.preferredDate,
  appointmentTime: selectedSlot.time,
  consultationType: 'Health Checkup',
  packageName: 'Comprehensive Health Checkup',
  amount: 3499,
  status: 'confirmed',
  bookingSource: 'whatsapp'
});

// Confirms to user with real booking ID
response = `✅ BOOKING CONFIRMED!\n📋 Booking ID: MED${appointment.id}`;
```

---

## 🔧 Technical Implementation

### Files Involved:
1. **whatsapp-agentic-booking.service.js** (NEW)
   - State machine for booking flow
   - Natural language date/time parsing
   - Slot availability lookup
   - Appointment creation in database
   - Confirmation message generation

2. **whatsapp-ai-conversation.service.js** (UPDATED)
   - Routes booking intents to agentic service
   - Maintains session state for multi-turn conversations
   - Falls back to old handler for non-booking queries

### Key Features:
- ✅ **Multi-turn conversations** - Remembers context across messages
- ✅ **Natural language understanding** - "Next Monday", "Tomorrow morning"
- ✅ **Package selection** - 6 health checkup packages with pricing
- ✅ **Slot availability** - Checks and shows available times
- ✅ **Actual booking execution** - Creates appointment in database
- ✅ **User identification** - Links booking to existing user or creates new
- ✅ **Confirmation** - Sends booking details with ID
- ✅ **Error handling** - Graceful fallbacks on failures

---

## 📊 Session Management

Each WhatsApp number gets a session that tracks:
```javascript
{
  state: 'gathering_time',    // Current state in flow
  data: {
    bookingType: 'health_checkup',
    package: 'comprehensive',
    packageDetails: { name: '...', price: 3499, duration: 120 },
    preferredDate: Date('2025-01-25'),
    timePreference: { preference: 'morning' }
  },
  lastActivity: 1737789600000,  // For timeout (15 min)
  history: [
    { role: 'user', content: 'book checkup', timestamp: ... },
    { role: 'assistant', content: 'Hi! Which package...', timestamp: ... }
  ]
}
```

---

## 🚀 Testing the Agentic Flow

### Via WhatsApp (Production):
1. Message the Mediczy WhatsApp number
2. Say "I want to book a health checkup"
3. Follow the conversational prompts
4. Booking will be created automatically!

### Via API (Development):
```bash
curl -X POST http://localhost:8000/api/whatsapp/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+919876543210",
    "message": "I want to book a health checkup"
  }'
```

---

## 🔮 Future Enhancements

1. **Payment Integration** - Collect payment within chat
2. **Doctor Selection** - Let user choose specific doctor
3. **Rescheduling** - Agentic rescheduling flow
4. **Reminders** - Automated appointment reminders
5. **Follow-up Booking** - Suggest follow-ups after consultations
6. **Multi-language** - Hindi, Tamil, Telugu support
