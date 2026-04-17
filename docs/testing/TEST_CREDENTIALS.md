# 🎯 MEDICZY TEST CREDENTIALS - Complete Reference

## 🔐 ALL USER TYPES WITH RING-FENCING (13 Verticals)

### Password Pattern: `{UserType}123`

---

## MAIN TEST ACCOUNTS

### 1. 👤 Patient / Regular User
```
📧 Email: user@mediczy.com
🔑 Password: User123
🌐 URL: /login
📱 Access: Health tracking, appointments, consultations, AI doctor
```

### 2. 🩺 Doctor
```
📧 Email: doctor@mediczy.com
🔑 Password: Doctor123
🌐 URL: /doctor/login
📱 Access: Appointments, prescriptions, patient records, video calls
```

### 3. 👨‍💼 Admin (Super User)
```
📧 Email: admin@mediczy.com
🔑 Password: Admin123
🌐 URL: /admin/login
📱 Access: Full system management, all CRUD operations
```

### 4. 👥 Team Member
```
📧 Email: team@mediczy.com
🔑 Password: Team123
🌐 URL: /team/login
📱 Access: Limited admin functions, user/doctor management
```

### 5. 👩‍⚕️ Nurse
```
📧 Email: nurse@mediczy.com
🔑 Password: Nurse123
🌐 URL: /nurse/login
📱 Access: Patient vitals, medications, notes, registration
```

### 6. 🧑‍💼 Assistant
```
📧 Email: assistant@mediczy.com
🔑 Password: Assistant123
🌐 URL: /assistant/login
📱 Access: Order processing, patient registration
```

### 7. 🏢 Corporate
```
📧 Email: corporate@mediczy.com
🔑 Password: Corporate123
🌐 URL: /corporate/login
📱 Access: Employee health, benefits, analytics, claims
```

### 8. 🏥 Hospital
```
📧 Email: hospital@mediczy.com
🔑 Password: Hospital123
🌐 URL: /hospital/login
📱 Access: Hospital provider dashboard
```

### 9. 🏨 Clinic
```
📧 Email: clinic@mediczy.com
🔑 Password: Clinic123
🌐 URL: /clinic/login
📱 Access: Practice management, appointments, billing, inventory
```

### 10. 🧪 Laboratory
```
📧 Email: lab@mediczy.com
🔑 Password: Lab123
🌐 URL: /lab/login
📱 Access: Lab tests, results, reports
```

### 11. 💊 Pharmacy
```
📧 Email: pharmacy@mediczy.com
🔑 Password: Pharmacy123
🌐 URL: /pharmacy/login
📱 Access: Inventory, prescriptions, orders
```

### 12. 🚑 Ambulance (NEW)
```
📧 Email: ambulance@mediczy.com
🔑 Password: Ambulance123
🌐 URL: /ambulance/login
📱 Access: Emergency dispatch, fleet management, trip tracking
```

### 13. 🏠 Homecare (NEW)
```
📧 Email: homecare@mediczy.com
🔑 Password: Homecare123
🌐 URL: /homecare/login
📱 Access: Patient care, caregiver management, scheduling
```

---

## LEGACY TEST ACCOUNTS

### 👤 Additional Users
```
📧 patient@test.com     - John Patient (Mumbai) - test123
📧 user@test.com        - Sarah User (Delhi) - test123
📧 wellness@test.com    - Mike Wellness (Bangalore) - test123
```

### 👨‍⚕️ Additional Doctors
```
📧 cardio@test.com      - Dr. Rajesh Sharma | Cardiologist - test123
📧 neuro@test.com       - Dr. Priya Patel | Neurologist - test123
📧 gp@test.com          - Dr. Amit Kumar | GP - test123
📧 pediatric@test.com   - Dr. Sunita Singh | Pediatrician - test123
📧 ortho@test.com       - Dr. Arjun Reddy | Orthopedist - test123
```

### 🌐 System Accounts
```
📧 admin@mediczy.local  - Platform Admin - test123
📧 kumar@test.com       - Kumar Jay - test123
```

---

## 📊 QUICK REFERENCE TABLE

| # | Type | Email | Password | Path |
|---|------|-------|----------|------|
| 1 | Patient | `user@mediczy.com` | `User123` | `/login` |
| 2 | Doctor | `doctor@mediczy.com` | `Doctor123` | `/doctor/login` |
| 3 | Admin | `admin@mediczy.com` | `Admin123` | `/admin/login` |
| 4 | Team | `team@mediczy.com` | `Team123` | `/team/login` |
| 5 | Nurse | `nurse@mediczy.com` | `Nurse123` | `/nurse/login` |
| 6 | Assistant | `assistant@mediczy.com` | `Assistant123` | `/assistant/login` |
| 7 | Corporate | `corporate@mediczy.com` | `Corporate123` | `/corporate/login` |
| 8 | Hospital | `hospital@mediczy.com` | `Hospital123` | `/hospital/login` |
| 9 | Clinic | `clinic@mediczy.com` | `Clinic123` | `/clinic/login` |
| 10 | Lab | `lab@mediczy.com` | `Lab123` | `/lab/login` |
| 11 | Pharmacy | `pharmacy@mediczy.com` | `Pharmacy123` | `/pharmacy/login` |
| 12 | Ambulance | `ambulance@mediczy.com` | `Ambulance123` | `/ambulance/login` |
| 13 | Homecare | `homecare@mediczy.com` | `Homecare123` | `/homecare/login` |

---

## 🚀 QUICK TEST FLOWS

### Patient Journey
```
1. Login: user@mediczy.com / User123
2. Search doctors, book appointment
3. Access health tracking, AI doctor
4. View prescriptions, manage plans
```

### Provider Workflows
```
Doctor:    doctor@mediczy.com → Appointments → Prescriptions
Clinic:    clinic@mediczy.com → Practice Management → Billing
Hospital:  hospital@mediczy.com → Provider Dashboard
Lab:       lab@mediczy.com → Test Management → Reports
Pharmacy:  pharmacy@mediczy.com → Inventory → Orders
```

### Emergency Services
```
Ambulance: ambulance@mediczy.com → Dispatch → Fleet Tracking
Homecare:  homecare@mediczy.com → Patient Care → Scheduling
```

### Administrative
```
Admin:     admin@mediczy.com → Full System Access
Team:      team@mediczy.com → Limited Admin Functions
Nurse:     nurse@mediczy.com → Clinical Operations
Assistant: assistant@mediczy.com → Support Operations
```

---

## 🛡️ RING-FENCING STATUS

✅ **All 13 user types are ring-fenced**
- Each user type isolated to their vertical
- Cross-access automatically blocked
- Token isolation enforced
- Automatic redirection on unauthorized access

### Test Ring-Fencing:
1. Login as Clinic → Try `/ambulance/dashboard` → Redirected to `/clinic/dashboard`
2. Login as Doctor → Try `/admin/users` → Redirected to `/doctor-dashboard`
3. Login as User → Try `/clinic/dashboard` → Redirected to `/login`

---

## 📱 PLATFORM FEATURES

### Core Features
- 🔬 **Labs**: 2,362+ laboratories with filtering
- 👨‍⚕️ **Doctors**: 5,000+ healthcare providers
- 📅 **Appointments**: Full booking system
- 🤖 **AI Chat**: Medical AI assistance  
- 📊 **Health Tracking**: BMI, calories, vitals
- 🚨 **Emergency**: Ambulance & triage services
- 🏠 **Homecare**: Home health services
- 💊 **Pharmacy**: Medicine orders & delivery

### Provider Dashboards
- 🏨 **Clinic**: 5-module practice management
- 🚑 **Ambulance**: Emergency dispatch control
- 🏠 **Homecare**: Patient & caregiver management
- 🏥 **Hospital**: Provider operations
- 🧪 **Lab**: Test & report management
- 💊 **Pharmacy**: Inventory & prescriptions

---

## 🌐 ENVIRONMENT URLS

### Production
```
Base: https://app.mediqzy.com
API:  https://app.mediqzy.com/api
```

### Development
```
Base: http://localhost:5173
API:  http://localhost:8000/api
```

---

## 🔧 API TESTING

### Login Example (cURL)
```bash
curl -X POST https://app.mediqzy.com/api/clinic/login \
  -H "Content-Type: application/json" \
  -d '{"email":"clinic@mediczy.com","password":"Clinic123"}'
```

### Authenticated Request
```bash
curl -X GET https://app.mediqzy.com/api/clinic/dashboard/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## ⚠️ SECURITY NOTES

**IMPORTANT**: Development credentials only!

- ❌ Do NOT use in production
- ❌ Do NOT share publicly  
- ✅ Change all passwords before production
- ✅ Implement proper registration
- ✅ Enable 2FA for production

---

## 📞 SUPPORT

**Issues?**
- Check browser console
- Verify localStorage tokens
- Clear cache and retry
- Contact: support@mediczy.com

---

**Last Updated**: December 4, 2025  
**Total Verticals**: 13  
**Ring-Fencing**: ✅ Active  
**Auth**: JWT (7-day expiry)