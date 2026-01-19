# 📊 Automated Welcome Email System - Visual Flow Diagram

## 🔄 Complete User Creation & Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ADMIN PANEL                                      │
│                                                                          │
│  [Create Doctor] [Create Hospital] [Create Corporate] [Create Team]    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Fill Form & Submit
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BACKEND - User Creation                             │
│                                                                          │
│  1. Validate input data                                                 │
│  2. Check for existing user (email uniqueness)                          │
│  3. ⚡ Generate secure random password (12 chars)                        │
│     - Uppercase + Lowercase + Numbers + Special chars                   │
│     - Cryptographically random (crypto.randomInt)                       │
│  4. Hash password with bcrypt (10 rounds)                               │
│  5. Set metadata: { requirePasswordChange: true }                       │
│  6. Create user record in database                                      │
│  7. 📧 Send welcome email (async, non-blocking)                          │
│     - Includes temporary password                                        │
│     - Beautiful HTML template                                            │
│     - Role-specific content                                              │
│  8. Return success response                                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌───────────────────┐          ┌───────────────────┐
        │   DATABASE        │          │   SENDGRID API    │
        │                   │          │                   │
        │  User Created     │          │  📧 Email Sent    │
        │  ✓ Password Hash  │          │  ✓ HTML Template  │
        │  ✓ Metadata Flag  │          │  ✓ Credentials    │
        └───────────────────┘          └───────────────────┘
                                                │
                                                ▼
                                    ┌───────────────────┐
                                    │  USER INBOX 📬    │
                                    │                   │
                                    │  Subject: Welcome │
                                    │  to Mediqzy! 🎉   │
                                    │                   │
                                    │  Dear Dr. Name,   │
                                    │                   │
                                    │  🔐 Credentials:  │
                                    │  Email: ...       │
                                    │  Password: ...    │
                                    │                   │
                                    │  [Login Button]   │
                                    └───────────────────┘
                                                │
                                                │ User clicks login
                                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      LOGIN FLOW - First Time                             │
│                                                                          │
│  1. User enters email + temporary password                              │
│  2. System validates credentials                                         │
│  3. JWT token issued                                                     │
│  4. User metadata checked: requirePasswordChange = true                 │
│  5. User redirected to dashboard/features                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   MIDDLEWARE - Password Check                            │
│                                                                          │
│  🛡️ checkPasswordChangeRequired middleware intercepts:                  │
│                                                                          │
│  if (user.metadata.requirePasswordChange === true) {                    │
│    return 403 Forbidden                                                 │
│    message: "Password change required"                                  │
│    changePasswordUrl: "/api/users/change-password"                      │
│  }                                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Access Denied
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CHANGE PASSWORD PAGE                                  │
│                                                                          │
│  ⚠️  You must change your password to continue                          │
│                                                                          │
│  New Password: [___________________]                                    │
│  Confirm Password: [___________________]                                │
│                                                                          │
│  Password Requirements:                                                 │
│  ✓ Minimum 8 characters                                                 │
│  ✓ Uppercase letter (A-Z)                                               │
│  ✓ Lowercase letter (a-z)                                               │
│  ✓ Number (0-9)                                                         │
│  ✓ Special character (@$!%*?&)                                          │
│  ✓ Different from current password                                      │
│                                                                          │
│  [Change Password]                                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Submit new password
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  BACKEND - Password Update                               │
│                                                                          │
│  1. Validate password requirements                                      │
│  2. Check password is different from current                            │
│  3. Hash new password with bcrypt                                       │
│  4. Update user.password in database                                    │
│  5. Update metadata: { requirePasswordChange: false }                   │
│  6. Log password change event                                           │
│  7. Return success response                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Password Changed
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ✅ FULL ACCESS GRANTED                              │
│                                                                          │
│  User can now access all features:                                      │
│  - Dashboard                                                            │
│  - Profile management                                                   │
│  - Appointments                                                         │
│  - Patients                                                             │
│  - Reports                                                              │
│  - All protected routes                                                 │
│                                                                          │
│  Middleware now allows access (requirePasswordChange = false)           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📧 Email Template Structure

### Doctor Welcome Email
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ╔════════════════════════════════════════════════╗ │
│  ║  Welcome to Mediqzy! 🎉                        ║ │
│  ╚════════════════════════════════════════════════╝ │
│                                                     │
│  Dear Dr. [FirstName] [LastName],                  │
│                                                     │
│  Your doctor account has been successfully         │
│  created on the Mediqzy Healthcare Platform! 🏥    │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  Your Account Details                       │   │
│  │  ───────────────────────────────────────    │   │
│  │  Name: Dr. [FirstName] [LastName]          │   │
│  │  Email: [email@example.com]                │   │
│  │  Specialization: [Cardiology]              │   │
│  │  Role: Doctor                               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  🔐 Login Credentials                       │   │
│  │  ───────────────────────────────────────    │   │
│  │  Email: [email@example.com]                │   │
│  │  Temporary Password: [Abc123!@#X]          │   │
│  │                                             │   │
│  │  ⚠️ Important: You will be required to      │   │
│  │  change this password upon first login      │   │
│  │  for security reasons.                      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  What's Next?                                       │
│  • 🔐 Login with your credentials                  │
│  • 🔑 Change your password (required)              │
│  • 👤 Complete your doctor profile                 │
│  • 📅 Set your availability schedule               │
│  • 👥 Start managing patient appointments          │
│  • 💊 Prescribe medications and treatments         │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │     [Login to Doctor Portal →]              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Need assistance? Our support team is available    │
│  24/7:                                              │
│  📧 Email: support@mediqzy.com                     │
│  📞 Phone: +91-1234567890                          │
│                                                     │
│  Best regards,                                      │
│  The Mediqzy Team                                   │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  © 2026 Mediqzy Healthcare. All rights reserved.   │
└─────────────────────────────────────────────────────┘
```

---

## 🔒 Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURITY LAYERS                              │
└─────────────────────────────────────────────────────────────────┘

Layer 1: Password Generation
├── Cryptographic Random (crypto.randomInt)
├── Character Complexity (Upper + Lower + Number + Special)
├── Minimum Length (12 characters)
└── No Predictable Patterns

Layer 2: Password Storage
├── Bcrypt Hashing (10 rounds)
├── Salted Hash
├── No plaintext storage
└── One-way encryption

Layer 3: Email Transmission
├── SendGrid TLS Encryption
├── HTTPS API calls
├── Temporary password sent once
└── Recipient verification recommended

Layer 4: First Login Protection
├── Metadata flag: requirePasswordChange
├── Middleware enforcement
├── Route-level blocking
└── JWT validation

Layer 5: Password Change Enforcement
├── Strong password requirements
├── Password similarity check
├── Current password verification (non-first login)
├── Immediate metadata update

Layer 6: Audit & Monitoring
├── Password change events logged
├── Email delivery tracking
├── Failed login monitoring
└── Access attempt logging
```

---

## 📊 Data Flow Diagram

### User Metadata Structure
```json
{
  "id": 123,
  "email": "doctor@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "doctor",
  "password": "$2b$10$hashedpassword...",
  "metadata": {
    "specialization": "Cardiology",
    "qualification": "MBBS, MD",
    "experience": 10,
    "isDoctor": true,
    "requirePasswordChange": true,    ← FLAG SET ON CREATION
    "passwordChangedAt": null         ← UPDATED AFTER CHANGE
  }
}
```

### After Password Change
```json
{
  "metadata": {
    "specialization": "Cardiology",
    "qualification": "MBBS, MD",
    "experience": 10,
    "isDoctor": true,
    "requirePasswordChange": false,   ← FLAG CLEARED
    "passwordChangedAt": "2026-01-15T10:30:00.000Z"
  }
}
```

---

## 🎯 API Response Flow

### Create Doctor (Success)
```
Admin → POST /api/admin/doctors
        {
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@example.com",
          specialization: "Cardiology"
        }

        ↓ System generates password: "Abc123!@#X"
        ↓ Creates user in database
        ↓ Sends welcome email (async)

Response ← {
  success: true,
  message: "Doctor created successfully. Welcome email sent...",
  doctor: {
    id: 45,
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    specialization: "Cardiology"
  },
  notification: "Welcome email sent to john.doe@example.com"
}
```

### First Login Attempt
```
User → POST /api/users/login
       {
         email: "john.doe@example.com",
         password: "Abc123!@#X"
       }

Response ← {
  success: true,
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  user: {
    id: 45,
    email: "john.doe@example.com",
    role: "doctor"
  }
}
```

### Access Protected Route (Blocked)
```
User → GET /api/doctors/profile
       Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

       ↓ Middleware checks metadata
       ↓ requirePasswordChange = true

Response ← 403 Forbidden
{
  success: false,
  message: "Password change required. Please update...",
  requirePasswordChange: true,
  changePasswordUrl: "/api/users/change-password"
}
```

### Change Password (Success)
```
User → POST /api/users/change-password
       Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
       {
         newPassword: "MyNewSecure@Pass123",
         confirmPassword: "MyNewSecure@Pass123"
       }

       ↓ Validates password
       ↓ Updates database
       ↓ Clears requirePasswordChange flag

Response ← {
  success: true,
  message: "Password changed successfully. You can now access...",
  firstLoginComplete: true
}
```

### Access Protected Route (Allowed)
```
User → GET /api/doctors/profile
       Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

       ↓ Middleware checks metadata
       ↓ requirePasswordChange = false
       ↓ Access granted

Response ← {
  success: true,
  doctor: {
    id: 45,
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    specialization: "Cardiology",
    ...
  }
}
```

---

## 🔄 State Machine Diagram

```
┌──────────────┐
│   CREATED    │ ← User created by admin
│              │   - Password: Auto-generated
│ require:true │   - Welcome email sent
└──────┬───────┘
       │
       │ User receives email
       │
       ▼
┌──────────────┐
│ FIRST LOGIN  │ ← User logs in with temp password
│              │   - JWT issued
│ require:true │   - Access to change-password only
└──────┬───────┘
       │
       │ Attempts to access features
       │
       ▼
┌──────────────┐
│   BLOCKED    │ ← Middleware blocks access
│              │   - Returns 403
│ require:true │   - Redirects to password change
└──────┬───────┘
       │
       │ Changes password
       │
       ▼
┌──────────────┐
│   ACTIVE     │ ← Full access granted
│              │   - All features accessible
│require:false │   - Normal user state
└──────────────┘
```

---

**Created**: January 15, 2026  
**Visual Guide Version**: 1.0.0  
**Status**: Complete
