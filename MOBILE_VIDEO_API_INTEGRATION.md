# 📱 Mobile App Video Consultation API - Integration Guide

Complete guide for integrating Mediczy video consultation features into your mobile application.

---

## 📚 Documentation Overview

We've created comprehensive documentation for mobile app integration:

### 1. **Complete API Reference** 
📄 [`docs/api/MOBILE_API_VIDEO_CONSULTATION.md`](docs/api/MOBILE_API_VIDEO_CONSULTATION.md)

Comprehensive API documentation including:
- Authentication endpoints (register, login, OTP)
- Doctor discovery and search
- Appointment booking and management
- Video consultation (LiveKit integration)
- Prescription management
- Wallet and payment APIs
- Real-time Socket.io events
- Error handling
- Security best practices

### 2. **Quick Start Guide**
🚀 [`docs/api/QUICK_START_MOBILE_VIDEO_API.md`](docs/api/QUICK_START_MOBILE_VIDEO_API.md)

Get started in 5 minutes with:
- Step-by-step integration flow
- React Native sample code
- Flutter/Dart sample code
- Complete booking & video call examples
- Push notification setup
- Testing guide
- Common issues & solutions

### 3. **Postman Collection**
📮 [`postman/Mediczy_Video_Consultation_API.postman_collection.json`](postman/Mediczy_Video_Consultation_API.postman_collection.json)

Ready-to-use Postman collection with:
- All API endpoints
- Pre-configured environments
- Automated token management
- Sample request bodies
- Response examples

---

## 🎯 Key Features

### ✅ Authentication
- Email/Password login
- OTP-based authentication
- JWT token management
- Secure session handling
- Tokens are valid for 24 hours
- Mobile app requests must include `x-app-key` and `x-app-secret`

### 👨‍⚕️ Doctor Discovery
- Search by specialty
- Filter by rating, fees, availability
- View doctor profiles
- Check available slots

### 📅 Appointment Management
- Book video consultations
- View upcoming/past appointments
- Cancel appointments
- Real-time status updates

### 🎥 Video Consultation
- LiveKit integration
- Real-time video/audio calls
- Screen sharing support
- Call quality monitoring
- Join/leave room management

### 💊 Prescription System
- Auto-generated after consultation
- PDF download
- WhatsApp sharing
- Digital prescription viewer

### 💰 Wallet & Payments
- Check balance
- Add money
- Pay with Health Coins
- Transaction history

### 🔔 Real-time Notifications
- Doctor call initiation
- Appointment updates
- Prescription ready alerts
- Socket.io integration

---

## 🛠️ Technology Stack

### Backend
- **Node.js** + Express
- **PostgreSQL** database
- **Socket.io** for real-time events
- **LiveKit** for video streaming
- **JWT** authentication

### Mobile Integration
- **React Native**: Full LiveKit SDK support
- **Flutter**: Native video integration
- **iOS/Android**: Platform-specific features

---

## 🔑 API Base URLs

### Production
```
https://mediczy.com/api
```

### Staging
```
https://staging.mediczy.com/api
```

### Development
```
http://localhost:8000/api
```

### WebSocket (Socket.io)
```
wss://mediczy.com
```

### LiveKit Server
```
wss://livekit.mediczy.com
```

---

## 📊 Complete API Endpoints Summary

### Authentication
```
POST   /api/auth/register           - Register new user
POST   /api/auth/login              - Login with email/password
POST   /api/users/login/send-otp    - Send OTP to phone
POST   /api/users/login/verify-otp  - Verify OTP and login
POST   /api/auth/send-otp           - Legacy OTP alias (if enabled)
POST   /api/auth/verify-otp         - Legacy OTP alias (if enabled)
```

### Doctor Discovery
```
GET    /api/consultation/doctors    - List available doctors
GET    /api/doctors/:doctorId       - Get doctor details
```

### Appointments
```
POST   /api/consultation/book       - Book video consultation
GET    /api/appointments            - Get my appointments
GET    /api/appointments/:id        - Get appointment details
POST   /api/appointments/:id/cancel - Cancel appointment
```

### Video Consultation
```
GET    /api/video/test              - Test video system (public)
POST   /api/video/livekit/token     - Get video token
POST   /api/video/room/:id/join     - Join video room
POST   /api/video/room/:id/leave    - Leave video room
GET    /api/video/room/:id/status   - Get room status
```

### Prescriptions
```
GET    /api/prescriptions/appointment/:id  - Get prescription
GET    /api/prescriptions/:id/pdf          - Download PDF
POST   /api/prescriptions/:id/share/whatsapp/:phone - Share via WhatsApp
```

### Wallet & Payments
```
GET    /api/wallet/balance          - Get wallet balance
POST   /api/wallet/topup            - Add money to wallet
GET    /api/wallet/transactions     - Transaction history
GET    /api/wallet/appointment/calculate/:fee - Calculate cost
```

---

## 🚀 Quick Integration Steps

### Step 1: Get Credentials
1. **Production:** Contact dev@mediczy.com to get provisioned:
   - Mobile app key and secret
   - API access credentials
   - Environment-specific URLs

2. **Development:** Get credentials from your team lead

3. **Configure:** Add to your app's secure environment config

### Step 2: Authentication
```bash
# Register or login to get auth token
curl -X POST https://mediczy.com/api/auth/login \
  -H "Content-Type: application/json" \
  -H "x-app-key: YOUR_MOBILE_APP_KEY" \
  -H "x-app-secret: YOUR_MOBILE_APP_SECRET" \
  -d '{
    "email": "user@example.com",
    "password": "user_password"
  }'

# Response includes JWT token - store securely
```

### Step 3: Find Doctors
```bash
# Get list of doctors
curl -X GET "https://mediczy.com/api/consultation/doctors?specialty=Cardiology" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "x-app-key: YOUR_MOBILE_APP_KEY" \
  -H "x-app-secret: YOUR_MOBILE_APP_SECRET"
```

### Step 4: Book Appointment
```bash
# Book video consultation
curl -X POST https://mediczy.com/api/consultation/book \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "x-app-key: YOUR_MOBILE_APP_KEY" \
  -H "x-app-secret: YOUR_MOBILE_APP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorId": 70,
    "consultationType": "online",
    "appointmentDate": "2026-01-28",
    "appointmentTime": "10:00 AM",
    "symptoms": "Health consultation",
    "paymentMethod": "wallet"
  }'
```

### Step 5: Get Video Token & Join
```bash
# Get LiveKit token for video call
curl -X POST https://mediczy.com/api/video/livekit/token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "x-app-key: YOUR_MOBILE_APP_KEY" \
  -H "x-app-secret: YOUR_MOBILE_APP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "roomName": "apt-456",
    "participantName": "Patient Name"
  }'
```

Then use the returned token with LiveKit SDK in your mobile app.

---

## 📱 Mobile SDK Setup

### React Native
```bash
# Install dependencies
npm install @livekit/react-native @livekit/react-native-webrtc socket.io-client axios

# See complete code examples in:
docs/api/QUICK_START_MOBILE_VIDEO_API.md
```

### Flutter
```yaml
# Add to pubspec.yaml
dependencies:
  livekit_client: ^2.0.0
  socket_io_client: ^2.0.3
  http: ^1.2.0

# See complete code examples in:
# docs/api/QUICK_START_MOBILE_VIDEO_API.md
```

---

## 🧪 Testing

### Development Environment Only

⚠️ **IMPORTANT:** Test credentials are provided separately and securely. Contact your system administrator for:
- Development API access credentials
- Test user accounts
- Mobile app keys for testing

**DO NOT use production credentials for testing!**

### Postman Collection
Import and test all APIs:
```
File: postman/Mediczy_Video_Consultation_API.postman_collection.json
```

**Setup:**
1. Import collection into Postman
2. Configure environment variables (dev/staging/prod)
3. Add your credentials to environment (never commit)
4. Test against development/staging environments first

---

## 🔐 Security

### API Authentication
All protected endpoints require JWT token in header:
```
Authorization: Bearer <your_jwt_token>
```

### Mobile App Credentials (Required)
Mobile app requests must include app-level authentication:
```
x-app-key: <your_mobile_app_key>
x-app-secret: <your_mobile_app_secret>
```

**🔒 Credential Management:**
- **Production:** Contact dev@mediczy.com to provision app credentials
- **Development:** Request dev credentials from your team lead
- **Rotation:** Credentials are rotated every 90 days
- **Storage:** Never hardcode credentials - use secure environment variables
- **Multiple Environments:** Use different credentials for dev/staging/prod

### Token Security
- Access tokens expire in 24 hours
- Implement refresh token mechanism
- Store tokens in encrypted storage (iOS Keychain, Android KeyStore)
- Never log tokens or credentials
- Clear tokens on logout

### HTTPS Only
- ✅ All API calls MUST use HTTPS in production
- ✅ WebSocket connections use WSS (secure)
- ✅ Certificate pinning recommended for production
- ❌ Never use HTTP in production

### Data Privacy & Compliance
- 🔒 Patient data encrypted at rest and in transit
- 📋 HIPAA compliance maintained
- 🎥 Video streaming uses end-to-end encryption
- 🗑️ Data retention policies enforced
- 🔍 Regular security audits conducted

---

## 📊 Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| Authentication | 10/min |
| Doctor Search | 20/min |
| Booking | 5/min |
| Video Token | 10/min |
| General | 100/min |

---

## 🔔 Push Notifications

### Events to Handle

1. **Doctor Initiated Call**
   - Alert user when doctor starts consultation
   - Deep link to video call screen

2. **Appointment Reminder**
   - 30 minutes before consultation
   - 5 minutes before consultation

3. **Prescription Ready**
   - Notify when prescription is available
   - Link to download PDF

4. **Payment Updates**
   - Payment confirmation
   - Refund notifications

### Implementation
See push notification setup in:
[`docs/api/QUICK_START_MOBILE_VIDEO_API.md`](docs/api/QUICK_START_MOBILE_VIDEO_API.md#-push-notifications-setup)

---

## 🔒 Production Deployment Checklist

Before going live:

### Security
- [ ] Production API credentials provisioned
- [ ] Mobile app key/secret configured (not hardcoded)
- [ ] JWT secret rotated from default
- [ ] HTTPS/WSS enforced for all connections
- [ ] Certificate pinning implemented
- [ ] Secrets stored in secure environment variables
- [ ] Test credentials removed from production builds

### Infrastructure
- [ ] Production database configured
- [ ] Redis configured for session management
- [ ] LiveKit production server configured
- [ ] Socket.io server scaled for production load
- [ ] CDN configured for static assets
- [ ] Monitoring and logging enabled

### Compliance
- [ ] HIPAA compliance verified
- [ ] Privacy policy updated
- [ ] Terms of service in place
- [ ] Data retention policies configured
- [ ] Backup and disaster recovery tested

### Testing
- [ ] All API endpoints tested on staging
- [ ] Video calls tested on real devices
- [ ] Payment flows tested end-to-end
- [ ] Error handling verified
- [ ] Load testing completed
- [ ] Security audit passed

---

## 🆘 Support & Resources

### Documentation
- 📖 Complete API Reference: [`docs/api/MOBILE_API_VIDEO_CONSULTATION.md`](docs/api/MOBILE_API_VIDEO_CONSULTATION.md)
- 🚀 Quick Start Guide: [`docs/api/QUICK_START_MOBILE_VIDEO_API.md`](docs/api/QUICK_START_MOBILE_VIDEO_API.md)
- 📮 Postman Collection: [`postman/Mediczy_Video_Consultation_API.postman_collection.json`](postman/Mediczy_Video_Consultation_API.postman_collection.json)

### Credential Provisioning
- **Production Access**: dev@mediczy.com (include: app name, bundle ID, team info)
- **Credential Rotation**: api-support@mediczy.com
- **Emergency**: +91-1800-XXX-XXXX (24/7 support)

### Technical Support
- **API Issues**: api-support@mediczy.com
- **Integration Help**: dev@mediczy.com
- **Documentation**: https://docs.mediczy.com
- **Status Page**: https://status.mediczy.com

### External Resources
- LiveKit Documentation: https://docs.livekit.io
- Socket.io Documentation: https://socket.io/docs
- React Native LiveKit: https://github.com/livekit/client-sdk-react-native

---

## ✅ Integration Checklist

### Phase 1: Authentication & Setup
- [ ] Implement user registration
- [ ] Implement login flow
- [ ] Set up OTP authentication
- [ ] Implement token storage
- [ ] Add token refresh mechanism

### Phase 2: Doctor Discovery
- [ ] Implement doctor listing
- [ ] Add search and filters
- [ ] Show doctor profiles
- [ ] Display availability

### Phase 3: Booking System
- [ ] Create booking flow
- [ ] Implement appointment list
- [ ] Add cancellation feature
- [ ] Show appointment details

### Phase 4: Video Consultation
- [ ] Integrate LiveKit SDK
- [ ] Implement video call UI
- [ ] Add join/leave functionality
- [ ] Handle call quality
- [ ] Test on real devices

### Phase 5: Post-Consultation
- [ ] Display prescriptions
- [ ] PDF download feature
- [ ] WhatsApp sharing
- [ ] Rating & review

### Phase 6: Payments
- [ ] Show wallet balance
- [ ] Add money to wallet
- [ ] Payment for consultations
- [ ] Transaction history

### Phase 7: Notifications
- [ ] Set up push notifications
- [ ] Handle deep links
- [ ] Socket.io integration
- [ ] Real-time updates

### Phase 8: Testing & Launch
- [ ] Unit testing
- [ ] Integration testing
- [ ] User acceptance testing
- [ ] Performance testing
- [ ] Security audit
- [ ] App store submission

---

## 📈 Performance Tips

1. **Optimize API Calls**
   - Cache doctor list
   - Batch requests when possible
   - Use pagination

2. **Video Quality**
   - Adaptive bitrate streaming
   - Network quality monitoring
   - Fallback to audio-only if needed

3. **Offline Support**
   - Cache appointment data
   - Queue actions for later
   - Download prescriptions for offline viewing

4. **Battery Optimization**
   - Stop camera when app in background
   - Reduce frame rate for poor connections
   - Optimize socket connections

---

## 🎉 You're Ready!

With these resources, you have everything needed to integrate video consultation into your mobile app:

1. ✅ Complete API documentation
2. ✅ Sample code for React Native & Flutter
3. ✅ Postman collection for testing
4. ✅ Security best practices
5. ✅ Real-time event handling
6. ✅ Payment integration
7. ✅ Prescription management

**Start with the Quick Start Guide and refer to the Complete API Reference as needed!**

---

**Happy Coding! 🚀**
