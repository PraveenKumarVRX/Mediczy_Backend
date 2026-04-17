# Mediczy Test Login Credentials - November 2025

## 📊 Database Summary
- **Total Users**: 17
- **Total Doctors**: 3
- **Total Nurses**: 2
- **Total Assistants**: 2

## 🔐 Login Portals

### Admin Portal
**URL**: https://app.mediqzy.com/admin/login

```
✅ Email: admin@mediqzy.com
✅ Password: SecurePass123
✅ Status: WORKING
```

---

### User/Staff Login
**URL**: https://app.mediqzy.com/login

⚠️ **Status**: User login endpoint needs intelligent-db model fix
✅ **Workaround**: Use admin portal to verify accounts exist

---

## 📋 Test Accounts by Role

### 👨‍⚕️ DOCTORS (3)

**Dr. Rajesh Kumar** - Cardiologist
- Email: `rajesh.doctor@mediqzy.com`
- Password: `Doctor123!`
- Experience: 15 years
- Registration: MCI-2024-001
- Consultation Fee: ₹800

**Dr. Meera Singh** - Pediatrician
- Email: `meera.doctor@mediqzy.com`
- Password: `Doctor123!`
- Experience: 10 years
- Registration: MCI-2024-002
- Consultation Fee: ₹600

**Dr. Amit Desai** - General Practitioner
- Email: `amit.doctor@mediqzy.com`
- Password: `Doctor123!`
- Experience: 8 years
- Registration: MCI-2024-003
- Consultation Fee: ₹500

---

### 👩‍⚕️ NURSES (2)

**Priya Sharma** - ICU Care
- Email: `priya.nurse@mediqzy.com`
- Password: `Nurse123!`
- License: NUR-2024-001

**Anjali Reddy** - Pediatric Care
- Email: `anjali.nurse@mediqzy.com`
- Password: `Nurse123!`
- License: NUR-2024-002

---

### 👨‍💼 ASSISTANTS (2)

**Rahul Verma**
- Email: `rahul.assistant@mediqzy.com`
- Password: `Assistant123!`
- Qualification: Medical Assistant Diploma
- Experience: 3 years

**Neha Patel**
- Email: `neha.assistant@mediqzy.com`
- Password: `Assistant123!`
- Qualification: Healthcare Assistant Certificate
- Experience: 2 years

---

### 👥 STAFF (2)

**Rohan Sharma**
- Email: `rohan.staff@mediqzy.com`
- Password: `Staff123!`

**Pooja Gupta**
- Email: `pooja.staff@mediqzy.com`
- Password: `Staff123!`

---

### 🏢 CORPORATE HR (2)

**Vijay Malhotra** - TechCorp Solutions
- Email: `vijay.hr@techcorp.com`
- Password: `Corporate123!`

**Sunita Iyer** - HealthPlus Insurance
- Email: `sunita.hr@healthplus.com`
- Password: `Corporate123!`

---

### 👤 PATIENTS (4)

- Email: `ramesh.patient@example.com` / Password: `Patient123!`
- Email: `kavita.patient@example.com` / Password: `Patient123!`
- Email: `suresh.patient@example.com` / Password: `Patient123!`
- Email: `lakshmi.patient@example.com` / Password: `Patient123!`

---

## 🔧 System Status

### ✅ Working
- Admin Login & Authentication
- Admin Dashboard Stats API
- Admin Profile API
- Database Connections (5/5)
- All PM2 Processes (5/5 online)

### ⚠️ Known Issues
- User login endpoint returning 500 error (intelligent-db model issue)
- Needs fix in `user.controller.js` similar to admin controller

### 📁 Database Tables
- `users` - 17 accounts
- `doctors` - 3 profiles
- `nurses` - 2 profiles
- `doctor_assistants` - 2 profiles

---

**Created**: November 29, 2025
**Domain**: https://app.mediqzy.com
**Environment**: Production (AWS EC2)
