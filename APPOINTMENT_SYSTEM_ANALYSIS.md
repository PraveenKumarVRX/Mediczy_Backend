# Appointment System - Current State Analysis

## Current Implementation

### Frontend (Client)
1. **ConsultationBooking.tsx** (`/client/src/pages/ConsultationBooking.tsx`)
   - Date selection (7 days, excluding weekends)
   - Time slot selection (9 AM - 4:30 PM, 30-min intervals)
   - Hardcoded time slots
   - Stores bookings in **localStorage only**
   - No API calls to backend
   - Redirects to chat after booking

2. **MyBookings.tsx** (`/client/src/pages/MyBookings.tsx`)
   - Displays appointments from **localStorage**
   - Shows booking status (scheduled, completed, cancelled)
   - Cancel booking feature
   - Join video call button (placeholder)
   - No backend sync

3. **Consultation.tsx** (`/client/src/pages/Consultation.tsx`)
   - Doctor listing with filters
   - Uses **dummy data** (`dummyDoctors`)
   - Navigates to `/consultation/:doctorId` for booking

### Backend (Server)
- ✅ Firebase notification support for appointments
- ✅ Async task helpers (`sendAppointmentConfirmation`, `scheduleAppointmentReminder`)
- ❌ **NO appointment routes**
- ❌ **NO appointment controller**
- ❌ **NO appointment model** (before today)
- ❌ **NO doctor availability management**

### Created Today
1. **appointment.model.mariadb.js** - Comprehensive appointment model with:
   - Patient & doctor information
   - Date, time, duration, consultation type
   - Status tracking (scheduled, confirmed, in-progress, completed, cancelled, no-show, rescheduled)
   - Payment information (fee, status, transaction ID)
   - Meeting information (link, ID, recording)
   - Cancellation & rescheduling support
   - Rating & feedback
   - Helper methods (canBeCancelled, canBeRescheduled, isUpcoming, isPast)

2. **doctorAvailability.model.mariadb.js** - Doctor availability model with:
   - Day of week scheduling
   - Start/end times
   - Slot duration configuration
   - Break times
   - Consultation type availability (video/audio/chat/in-person)
   - Pricing per consultation type
   - Max appointments per slot
   - Helper method (generateTimeSlots)

## What's Missing

### Backend
1. ❌ Appointment routes (`/api/appointments`)
2. ❌ Appointment controller (CRUD operations)
3. ❌ Doctor availability routes (`/api/doctors/:id/availability`)
4. ❌ Availability controller (manage schedules)
5. ❌ Slot availability checking logic
6. ❌ Integration with payment gateway
7. ❌ Notification triggers on appointment events

### Frontend
1. ❌ API integration (replace localStorage with backend calls)
2. ❌ Real-time availability checking
3. ❌ Payment flow integration
4. ❌ Doctor dashboard for managing appointments
5. ❌ Doctor availability settings page
6. ❌ Real-time notifications for appointment updates
7. ❌ Video call integration with appointments
8. ❌ Prescription attachment after consultation

## Recommended Implementation Plan

### Phase 1: Backend API (Priority: HIGH)
1. Create appointment controller with endpoints:
   - POST `/api/appointments` - Create appointment
   - GET `/api/appointments` - List user's appointments
   - GET `/api/appointments/:id` - Get appointment details
   - PATCH `/api/appointments/:id` - Update appointment (reschedule)
   - DELETE `/api/appointments/:id` - Cancel appointment
   - POST `/api/appointments/:id/complete` - Mark complete
   - POST `/api/appointments/:id/rating` - Submit rating

2. Create doctor availability controller:
   - GET `/api/doctors/:id/availability` - Get doctor's schedule
   - GET `/api/doctors/:id/available-slots` - Get available time slots for date
   - POST `/api/doctors/:id/availability` - Set availability (doctor only)
   - PATCH `/api/doctors/:id/availability/:scheduleId` - Update schedule
   - DELETE `/api/doctors/:id/availability/:scheduleId` - Remove schedule

3. Add routes to app.js

4. Integrate with async tasks:
   - Send appointment confirmation email
   - Schedule 24-hour reminder
   - Publish to Kafka (appointment-events topic)
   - Track metrics in Prometheus

### Phase 2: Frontend Integration (Priority: HIGH)
1. Replace localStorage with API calls in:
   - ConsultationBooking.tsx
   - MyBookings.tsx

2. Fetch real-time availability from backend

3. Add loading states and error handling

4. Integrate with payment gateway (Phase 3)

### Phase 3: Doctor Dashboard (Priority: MEDIUM)
1. Appointments management page
   - View today's appointments
   - View upcoming appointments
   - View appointment history
   - Mark appointments complete
   - Add notes/prescriptions

2. Availability settings page
   - Set weekly schedule
   - Define time slots
   - Set break times
   - Set consultation fees
   - Enable/disable consultation types

### Phase 4: Enhanced Features (Priority: MEDIUM)
1. Real-time notifications (Socket.io)
2. Video call integration with appointments
3. Prescription management
4. Follow-up appointment suggestions
5. Appointment analytics dashboard

### Phase 5: Payment Integration (Priority: HIGH)
1. Razorpay/Stripe integration
2. Payment status tracking
3. Transaction history
4. Invoice generation
5. Refund handling

## Next Steps
1. ✅ Models created (appointment, doctorAvailability)
2. ⏳ Create appointment controller
3. ⏳ Create appointment routes
4. ⏳ Create availability controller & routes
5. ⏳ Update frontend to use APIs
6. ⏳ Add payment integration
7. ⏳ Build doctor dashboard features
