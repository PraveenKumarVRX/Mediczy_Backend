# SmartHealth RN Mobile API - Quick Reference

## Corporate Employee Authentication & Services

### Authentication
```
POST /api/mobile/auth/corporate-login
├─ Email: user@mediczy.com
├─ Password: SecurePassword123
├─ CorporateSlug: my-smarthealth (optional)
└─ Returns: accessToken, user with corporate context
```

### Corporate Endpoints

#### Profile & Dashboard
```
GET /api/mobile/corporate/profile
└─ Returns: User profile with corporate affiliation, available services

GET /api/mobile/corporate/dashboard  
└─ Returns: Dashboard data, upcoming appointments, quick actions
```

#### Doctor & Appointments
```
GET /api/mobile/doctors?corporateOnly=true
└─ Returns: Doctors from corporate's network

POST /api/mobile/appointments
└─ Book appointment with doctor

POST /api/mobile/video/token
└─ Get token for video consultation (Agora/LiveKit)
```

### Wellness Services

#### Services Management
```
GET /api/mobile/wellness/services
└─ Returns: Lab, Pharmacy, Homecare, Ambulance services

GET /api/mobile/wellness/requests
└─ Returns: All wellness requests history
```

#### Lab Services
```
POST /api/mobile/wellness/lab/request
├─ TestType: Complete Blood Count
├─ PreferredDate: 2026-02-10
└─ PreferredTime: 09:00
```

#### Pharmacy Services
```
POST /api/mobile/wellness/pharmacy/order
├─ Medicines: Array of medicine objects
├─ PrescriptionUrl: URL of prescription image
└─ DeliveryAddress: Delivery address
```

#### Homecare Services
```
POST /api/mobile/wellness/homecare/request
├─ ServiceType: Post-operative care
├─ Duration: 7 days
└─ PreferredDate: 2026-02-12
```

#### Ambulance Services
```
POST /api/mobile/wellness/ambulance/request
├─ Emergency: true/false
├─ ServiceType: BLS equipped | ALS equipped | ICU ambulance
├─ PickupAddress: Current location
└─ DestinationAddress: Hospital/Clinic
```

---

## Use Case: Video Consultation (user@mediczy.com + doctor@mediqzy.com)

### Step-by-Step

**1. Corporate Employee Login**
```bash
POST /api/mobile/auth/corporate-login
{
  "email": "user@mediczy.com",
  "password": "SecurePassword123",
  "corporateSlug": "my-smarthealth"
}
```

**2. View Corporate Dashboard**
```bash
GET /api/mobile/corporate/dashboard
Header: Authorization: Bearer {accessToken}
```

**3. Search Doctors (Corporate Network)**
```bash
GET /api/mobile/doctors?corporateOnly=true&specialty=General%20Medicine
Header: Authorization: Bearer {accessToken}
```

**4. Book Video Appointment**
```bash
POST /api/mobile/appointments
Header: Authorization: Bearer {accessToken}
{
  "doctorId": 201,
  "appointmentDate": "2026-02-15",
  "appointmentTime": "14:00",
  "type": "video"
}
```

**5. Get Video Token**
```bash
POST /api/mobile/video/token
Header: Authorization: Bearer {accessToken}
{
  "appointmentId": 5001,
  "channelName": "appointment_5001"
}
```

**6. Join Video Call**
```javascript
// Use token from step 5 to join video call with doctor@mediqzy.com
AgoraRtcEngine.joinChannel(token, channelName, userId)
```

---

## Key Features

✅ **Corporate Employee Access**
- Login with corporate email
- Corporate context automatically applied
- Restricted to corporate's network services

✅ **Doctor Consultation**
- Search corporate's network doctors
- Book online/in-person appointments
- Real-time video consultations

✅ **Wellness Services**
- Lab tests with home sample collection
- Medicine delivery via pharmacy
- Homecare and nursing services
- Emergency ambulance support

✅ **Security**
- Access token with 30-day expiry
- Fixed to corporate organization
- Device tracking for security

---

## Integration Checklist

- [ ] Set API_BASE_URL and MOBILE_API_BASE_URL in .env
- [ ] Implement corporate login screen
- [ ] Store accessToken securely (Keychain/Keystore)
- [ ] Add Authorization header to all requests
- [ ] Implement offline queue for requests
- [ ] Add token refresh logic
- [ ] Test corporate employee login
- [ ] Test doctor search (corporate only)
- [ ] Test appointment booking and video token
- [ ] Test wellness service requests
- [ ] Implement push notifications (FCM/APNS)
- [ ] Add error handling and retry logic

