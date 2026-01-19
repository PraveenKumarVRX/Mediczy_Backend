# Doctor Appointment Slots - User View Implementation

**Date:** December 20, 2025
**Status:** ✅ COMPLETE

## Overview

Implemented a comprehensive system for users to view and book doctor appointment slots based on each doctor's configured availability settings. The system displays slots dynamically based on doctor configuration including slot duration (15/30/45/60 minutes), weekly schedule, practice locations, and blocked slots.

## Implementation Details

### 1. Backend API - New Endpoint

**File:** `/server/routes/doctor.route.js`

**Endpoint:** `GET /api/doctors/:doctorId/user-slots`

**Features:**
- Public endpoint (no authentication required)
- Returns slots for specific date when `?date=YYYY-MM-DD` is provided
- Returns weekly schedule overview when no date parameter is provided
- Filters out blocked slots configured by the doctor
- Shows booked/available status for each slot
- Includes practice location details for in-person consultations

**Response Structure (with date):**
```json
{
  "success": true,
  "date": "2025-12-21",
  "dayName": "saturday",
  "slotDuration": 30,
  "isOff": false,
  "slots": {
    "online": [
      {
        "time": "09:00 - 09:30",
        "available": true,
        "blocked": false
      }
    ],
    "inPerson": [
      {
        "time": "14:00 - 14:30",
        "available": true,
        "blocked": false,
        "location": {
          "name": "City Hospital",
          "address": "123 Medical Street",
          "fee": 800
        }
      }
    ]
  },
  "fees": {
    "online": 500,
    "inPerson": 700
  }
}
```

**Response Structure (without date - weekly overview):**
```json
{
  "success": true,
  "slotDuration": 30,
  "weeklySlots": {
    "monday": {
      "isOff": false,
      "online": {
        "enabled": true,
        "startTime": "09:00",
        "endTime": "13:00"
      },
      "inPerson": {
        "enabled": true,
        "startTime": "14:00",
        "endTime": "18:00",
        "location": {
          "name": "Main Clinic",
          "address": "456 Health Ave",
          "fee": 600
        }
      }
    }
  },
  "practiceLocations": [...],
  "fees": {
    "online": 500,
    "inPerson": 700
  }
}
```

### 2. Database Model Updates

**File:** `/server/models/postgres/doctor.model.postgres.js`

**New Fields Added:**

```javascript
slotDuration: {
  type: DataTypes.INTEGER,
  defaultValue: 30,
  validate: {
    isIn: [[15, 30, 45, 60]]
  },
  comment: 'Duration of each appointment slot in minutes'
},

practiceLocations: {
  type: DataTypes.JSONB,
  defaultValue: [],
  comment: 'Array of practice location objects with id, name, address, consultationFee'
}
```

### 3. Frontend Implementation

**File:** `/client/src/pages/DoctorListBooking.tsx`

**Key Features:**

#### Dynamic Slot Loading
- Fetches slots when booking modal opens
- Updates slots when user changes date
- Shows loading spinner while fetching
- Handles errors gracefully

#### Smart Slot Display
- **Slot Duration Badge:** Shows doctor's configured slot duration (15/30/45/60 min)
- **Color Coding:**
  - Blue gradient for online consultation slots
  - Green gradient for in-person consultation slots
- **Availability Filtering:** Only shows available, non-blocked slots
- **Real-time Updates:** Refreshes when date changes

#### Location-Specific Features
When user selects in-person consultation:
- **Location Card Display:**
  ```
  📍 City Hospital
  123 Medical Street, Downtown
  Consultation Fee: ₹800
  ```
- **Dynamic Fee Display:** Shows location-specific fee instead of default fee
- **Practice Location Name:** Displays in consultation type selector

#### Empty States
- "Doctor is not available on this day" - when doctor is off
- "No available online slots for this date" - when all slots booked/blocked
- "Doctor does not have in-person consultation slots configured" - when not enabled

#### UI Components
```tsx
// Loading State
<Loader2 className="animate-spin" />
"Loading available slots..."

// Slot Buttons
<Button variant={selected ? "default" : "outline"}>
  09:00 - 09:30
</Button>

// Location Info (In-Person)
<div className="bg-green-50 border-green-200">
  <MapPin /> {location.name}
  {location.address}
  Consultation Fee: ₹{location.fee}
</div>
```

### 4. Integration Points

#### Slot Fetching Logic
```tsx
const fetchDoctorSlots = async (doctorId, date) => {
  const dateParam = date ? format(date, 'yyyy-MM-dd') : undefined;
  const { data } = await api.get(`/doctors/${doctorId}/user-slots`, {
    params: dateParam ? { date: dateParam } : {}
  });
  setDoctorSlots(data);
};

// Trigger on date change
useEffect(() => {
  if (selectedDoctor && selectedDate && showBookingModal) {
    fetchDoctorSlots(selectedDoctor._id, selectedDate);
  }
}, [selectedDate, selectedDoctor, showBookingModal]);
```

#### Fee Calculation with Location Override
```tsx
const totalFee = (() => {
  if (consultationType === "online") {
    return selectedDoctor.consultationFee.online;
  } else {
    // Use location-specific fee if available
    const locationFee = doctorSlots?.slots?.inPerson?.[0]?.location?.fee;
    return locationFee || selectedDoctor.consultationFee.inPerson;
  }
})();
```

## User Experience Flow

### Booking an Appointment

1. **Doctor Selection:**
   - User browses doctor list
   - Clicks "Book Appointment" on doctor card

2. **Modal Opens:**
   - System fetches doctor's slots for today
   - Shows loading spinner during fetch

3. **Consultation Type Selection:**
   - User chooses Online or In-Person
   - System displays relevant slots and fees
   - In-person shows location details

4. **Date Selection:**
   - User clicks date picker
   - System fetches slots for new date
   - Shows available slots or "not available" message

5. **Time Selection:**
   - User sees slots in doctor's configured duration
   - Only available, non-blocked slots shown
   - Slots organized by consultation type

6. **Booking Summary:**
   - Shows selected date, time, type
   - Displays correct fee (location-specific if applicable)
   - User confirms and books

## Technical Highlights

### Smart Slot Generation
```javascript
const generateTimeSlots = (startTime, endTime, duration) => {
  const slots = [];
  let currentTime = startHour * 60 + startMin;
  const endTimeInMin = endHour * 60 + endMin;

  while (currentTime + duration <= endTimeInMin) {
    const startFormatted = `${hours}:${mins}`;
    const endFormatted = `${endHours}:${endMins}`;
    slots.push(`${startFormatted} - ${endFormatted}`);
    currentTime += duration;
  }
  
  return slots;
};
```

### Availability Check
```javascript
// Get booked appointments from database
const bookedAppointments = await Appointment.findAll({
  where: {
    doctorId,
    appointmentDate: date,
    status: { [Op.notIn]: ['cancelled', 'no-show'] }
  }
});

// Filter available slots
const availableSlots = allSlots.map(slot => ({
  time: slot,
  available: !bookedTimes.includes(slot) && 
             !daySchedule.blockedSlots?.includes(slot),
  blocked: daySchedule.blockedSlots?.includes(slot)
}));
```

## Benefits

### For Patients (Users)
✅ See real-time available slots
✅ View doctor's actual configured schedule
✅ Know exact slot duration (15/30/45/60 min)
✅ See practice location details for in-person visits
✅ Get accurate, location-specific fees
✅ No confusion about availability

### For Doctors
✅ Full control over slot visibility
✅ Block specific slots when needed
✅ Different locations with different fees
✅ Flexible slot durations per doctor
✅ Separate online/in-person schedules

### For System
✅ Reduced booking conflicts
✅ Better slot utilization
✅ Accurate availability data
✅ Seamless doctor-patient matching

## Build & Deployment

**Build Output:**
```
✓ 4632 modules transformed
dist/assets/index-BpqITxdf.js   6,311.87 kB │ gzip: 1,447.64 kB
✓ built in 33.88s
```

**PM2 Status:**
- Frontend: Restart #16 ✅ Online
- Backend: Restart #2297 ✅ Online

## Data Flow

```
Doctor Dashboard
  ↓
Configure Slots (slotDuration, weeklySchedule, locations, blocked slots)
  ↓
Save to Database (PostgreSQL JSONB)
  ↓
User Booking Page
  ↓
Fetch /api/doctors/:doctorId/user-slots?date=YYYY-MM-DD
  ↓
Display Available Slots
  ↓
User Selects Slot
  ↓
Book Appointment
```

## Future Enhancements (Not Implemented)

- Show next 7 days availability in doctor card
- Weekly calendar view with all slots
- Slot capacity/concurrent bookings
- Wait list for fully booked slots
- Recurring appointments
- Slot preferences (morning/evening)

## Testing Checklist

✅ Doctor with 15-minute slots
✅ Doctor with 30-minute slots  
✅ Doctor with 45-minute slots
✅ Doctor with 60-minute slots
✅ Online-only consultations
✅ In-person-only consultations
✅ Mixed (both types)
✅ Blocked slots don't appear
✅ Booked slots don't appear
✅ Off-day shows "not available"
✅ Location name displayed for in-person
✅ Location-specific fee shown
✅ Multiple practice locations
✅ Date change updates slots
✅ Consultation type change updates slots

## Related Files

**Backend:**
- `/server/routes/doctor.route.js` - API endpoint
- `/server/models/postgres/doctor.model.postgres.js` - Data model

**Frontend:**
- `/client/src/pages/DoctorListBooking.tsx` - User booking interface

**Configuration:**
- `/client/src/pages/doctor/DoctorAppointmentSettings.tsx` - Doctor slot configuration

## Completion Status

✅ Backend API created
✅ Database model updated
✅ Frontend slot display implemented
✅ Location-specific fees integrated
✅ Build successful
✅ Deployment complete
✅ All features working

---

**Implementation Complete:** December 20, 2025
**Build File:** index-BpqITxdf.js (6.31 MB)
**PM2 Restart:** #16
