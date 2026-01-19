# MEDICZY - Healthcare Platform
## Complete Application Structure & Initialization Guide

**Version:** 1.0.0  
**Last Updated:** November 9, 2025  
**Platform Type:** Full-Stack Healthcare Management System  
**Architecture:** MERN Stack with MariaDB + Advanced Infrastructure

---

## 📋 TABLE OF CONTENTS

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Architecture](#database-architecture)
5. [API Endpoints](#api-endpoints)
6. [Frontend Routes](#frontend-routes)
7. [Key Features](#key-features)
8. [Infrastructure Services](#infrastructure-services)
9. [Environment Configuration](#environment-configuration)
10. [Startup & Deployment](#startup--deployment)
11. [Development Workflow](#development-workflow)
12. [Security & Authentication](#security--authentication)
13. [Testing](#testing)
14. [Troubleshooting](#troubleshooting)

---

## 📊 PROJECT OVERVIEW

**Mediczy** is a comprehensive healthcare management platform that connects patients, doctors, and administrators. It provides:

- **Patient Portal**: Health tracking, appointments, AI consultations, membership plans
- **Doctor Portal**: Appointment management, patient records, video consultations
- **Admin Panel**: User/doctor management, CRM, insurance, analytics
- **Real-time Communication**: Video calls (Agora), chat (Socket.io), notifications (Firebase)
- **Advanced Infrastructure**: Redis queues, Kafka messaging, Prometheus monitoring

### Core Capabilities
- 🏥 Healthcare appointment booking with real-time availability
- 💊 Membership & insurance management
- 📹 Video consultations with Agora WebRTC
- 🤖 AI-powered health assistants (Google Gemini, Groq)
- 📊 CRM system for lead management
- 🔔 Push notifications via Firebase Cloud Messaging
- 📈 Health metrics tracking & analytics
- 🌐 PWA support with offline functionality
- 🔐 Role-based access control (Patient/Doctor/Admin)

---

## 🛠 TECHNOLOGY STACK

### Backend
```yaml
Runtime: Node.js 18+ (ES Modules)
Framework: Express.js 4.21+
Database: MariaDB 10.6+ (via Sequelize ORM)
Legacy Support: MongoDB (Mongoose - backup models available)
Authentication: JWT (jsonwebtoken)
Password Hashing: bcrypt
```

### Frontend
```yaml
Framework: React 18.3+
Build Tool: Vite 5.4+
Language: TypeScript 5.5+
State Management: 
  - TanStack Query (React Query) for server state
  - Zustand for client state
Routing: React Router 6.26+
UI Library: shadcn/ui (Radix UI + Tailwind CSS)
Styling: Tailwind CSS 3.4+
Icons: Lucide React
```

### Infrastructure Services
```yaml
Cache & Queue: Redis 6.0+ (with BullMQ for job queues)
Message Broker: Apache Kafka (KafkaJS client)
Monitoring: Prometheus + express-prom-bundle
Real-time: Socket.io 4.8+
File Upload: express-fileupload
Rate Limiting: express-rate-limit
Video Calls: Agora RTC SDK 4.24+
Push Notifications: Firebase Cloud Messaging (FCM)
AI Services: Google Gemini AI, Groq SDK
```

### DevOps & Tools
```yaml
Process Manager: PM2 (recommended for production)
Reverse Proxy: Nginx (recommended)
SSL/TLS: Let's Encrypt (certbot)
Version Control: Git
Package Manager: npm (backend) / npm or bun (frontend)
```

---

## 📁 PROJECT STRUCTURE

```
Mediczy/
├── 📄 README.md                          # Main documentation
├── 📄 package.json                       # Root package (concurrently scripts)
├── 📄 __INIT__.md                        # This file
├── 📄 .gitignore                         # Git ignore rules
│
├── 📂 server/                            # Backend Node.js/Express
│   ├── 📄 index.js                       # Server entry point
│   ├── 📄 app.js                         # Express app configuration
│   ├── 📄 package.json                   # Backend dependencies
│   ├── 📄 .env                           # Environment variables (not in git)
│   ├── 📄 .env.example                   # Environment template
│   │
│   ├── 📂 config/                        # Configuration modules
│   │   ├── kafka.js                      # Kafka producer/consumer setup
│   │   ├── redis.js                      # Redis client configuration
│   │   ├── queues.js                     # BullMQ queue definitions
│   │   └── prometheus.js                 # Prometheus metrics registry
│   │
│   ├── 📂 db/                            # Database connections
│   │   ├── mariadb.js                    # Sequelize MariaDB connection
│   │   └── db.js                         # MongoDB connection (legacy)
│   │
│   ├── 📂 models/                        # Database models (Sequelize)
│   │   ├── user.model.mariadb.js         # User entity
│   │   ├── doctor.model.mariadb.js       # Doctor profiles
│   │   ├── appointment.model.mariadb.js  # Appointments
│   │   ├── doctorAvailability.model.mariadb.js  # Doctor schedules
│   │   ├── membershipPlan.model.mariadb.js      # Membership plans
│   │   ├── insurance.model.mariadb.js    # Insurance (4 models)
│   │   ├── lead.model.mariadb.js         # CRM leads
│   │   ├── leadActivity.model.mariadb.js # Lead interactions
│   │   ├── leadNote.model.mariadb.js     # Lead notes
│   │   ├── leadTask.model.mariadb.js     # Lead tasks
│   │   ├── hospital.model.mariadb.js     # Hospitals
│   │   ├── clinic.model.mariadb.js       # Clinics
│   │   ├── lab.model.mariadb.js          # Laboratories
│   │   ├── pharmacy.model.mariadb.js     # Pharmacies
│   │   ├── ambulance.model.mariadb.js    # Ambulance services
│   │   ├── homecareProvider.model.mariadb.js  # Home care
│   │   ├── corporate.model.mariadb.js    # Corporate clients
│   │   ├── chat.model.js                 # Chat messages (MongoDB)
│   │   └── FitnessData.js                # Google Fit data (MongoDB)
│   │
│   ├── 📂 routes/                        # API route definitions
│   │   ├── user.route.js                 # User auth & profile
│   │   ├── doctor.route.js               # Doctor operations
│   │   ├── admin.route.js                # Admin endpoints
│   │   ├── appointment.route.js          # Appointment CRUD
│   │   ├── availability.route.js         # Doctor availability
│   │   ├── membership.route.js           # Membership plans
│   │   ├── insurance.route.js            # Insurance management
│   │   ├── crm.route.js                  # CRM system
│   │   ├── ai.js                         # AI services (Gemini/Groq)
│   │   ├── ayushman.route.js             # Ayushman Bharat integration
│   │   ├── fitness.route.js              # Google Fit integration
│   │   ├── fcm.route.js                  # Firebase notifications
│   │   ├── places.js                     # Location services
│   │   ├── async.route.js                # Async job endpoints
│   │   └── fitnessData.js                # Fitness data endpoints
│   │
│   ├── 📂 controller/                    # Business logic
│   │   ├── user.controller.js            # User operations
│   │   ├── doctor.controller.js          # Doctor management
│   │   ├── admin.controller.js           # Admin functions
│   │   ├── appointment.controller.js     # Appointment logic
│   │   ├── availability.controller.js    # Availability management
│   │   └── crm.controller.js             # CRM operations
│   │
│   ├── 📂 middleware/                    # Express middleware
│   │   ├── auth.js                       # Legacy auth (deprecated)
│   │   └── auth.middleware.js            # JWT auth + role-based access
│   │
│   ├── 📂 chat/                          # Real-time chat
│   │   └── chathandler.controller.js     # Socket.io chat logic
│   │
│   ├── 📂 workers/                       # Background job workers
│   │   └── index.js                      # BullMQ worker definitions
│   │
│   ├── 📂 tasks/                         # Scheduled tasks
│   │   └── index.js                      # Cron jobs & periodic tasks
│   │
│   ├── 📂 services/                      # External service integrations
│   │   └── docsgpt.service.js            # DocsGPT integration
│   │
│   ├── 📂 utils/                         # Utility functions
│   │   ├── validators.js                 # Input validation
│   │   ├── validation.js                 # Custom validators
│   │   └── firebase-admin.js             # Firebase Admin SDK
│   │
│   ├── 📂 scripts/                       # Utility scripts
│   │   └── seed-admin.js                 # Create admin user
│   │
│   └── 📂 src/                           # TypeScript source (optional)
│       └── routes/
│           └── places.ts                 # Location services (TS)
│
├── 📂 client/                            # Frontend React/Vite
│   ├── 📄 index.html                     # HTML entry point
│   ├── 📄 package.json                   # Frontend dependencies
│   ├── 📄 vite.config.ts                 # Vite configuration
│   ├── 📄 tsconfig.json                  # TypeScript config
│   ├── 📄 tailwind.config.ts             # Tailwind CSS config
│   ├── 📄 postcss.config.js              # PostCSS config
│   ├── 📄 components.json                # shadcn/ui config
│   │
│   ├── 📂 public/                        # Static assets
│   │   ├── serviceWorker.js              # PWA service worker
│   │   ├── firebase-messaging-sw.js      # FCM service worker
│   │   ├── offline.html                  # Offline fallback page
│   │   └── aiH.jpg                       # Assets
│   │
│   └── 📂 src/                           # Source code
│       ├── 📄 main.tsx                   # React entry point
│       ├── 📄 App.tsx                    # Root component
│       ├── 📄 App.css                    # Global styles
│       ├── 📄 index.css                  # Tailwind imports
│       ├── 📄 vite-env.d.ts              # Vite type definitions
│       ├── 📄 serviceWorker.ts           # PWA worker registration
│       │
│       ├── 📂 auth/                      # Authentication pages
│       │   ├── AuthProvider.tsx          # Auth context & logic
│       │   ├── Login.tsx                 # User login
│       │   ├── Register.tsx              # User registration
│       │   └── DocRegister.tsx           # Doctor registration
│       │
│       ├── 📂 pages/                     # Application pages
│       │   ├── Index.tsx                 # Landing page
│       │   ├── Profile.tsx               # User profile
│       │   ├── HealthTracker.tsx         # Health metrics
│       │   ├── Appointments.tsx          # Appointment list
│       │   ├── ConsultationBooking.tsx   # Book appointment
│       │   ├── MyBookings.tsx            # User bookings
│       │   ├── MyPlans.tsx               # Membership plans
│       │   ├── Insurance.tsx             # Insurance info
│       │   ├── AiDoctor.tsx              # AI consultation
│       │   ├── Symptoms.tsx              # Symptom checker
│       │   ├── Medicine.tsx              # Medicine catalog
│       │   ├── Diet.tsx                  # Diet planning
│       │   ├── BMI.tsx                   # BMI calculator
│       │   ├── CalorieCalculator.tsx     # Calorie calc
│       │   ├── Ayushman.tsx              # Ayushman integration
│       │   ├── Emergency.tsx             # Emergency services
│       │   ├── HealthFeedPage.tsx        # Health feed
│       │   ├── Reposts.tsx               # Social features
│       │   ├── Consultation.tsx          # Consultation page
│       │   ├── NotFound.tsx              # 404 page
│       │   │
│       │   ├── 📂 doctor/                # Doctor-specific pages
│       │   │   ├── DoctorDashboard.tsx   # Doctor home
│       │   │   └── DoctorAppointments.tsx # Doctor appointments
│       │   │
│       │   ├── 📂 admin/                 # Admin panel pages
│       │   │   ├── AdminLogin.tsx        # Admin login
│       │   │   ├── AdminDashboard.tsx    # Admin home (legacy)
│       │   │   ├── AdminDashboardHome.tsx # Main admin dashboard
│       │   │   ├── UsersManagement.tsx   # User CRUD
│       │   │   ├── DoctorsManagement.tsx # Doctor CRUD
│       │   │   ├── AdminAppointments.tsx # Appointment management
│       │   │   ├── AdminPlans.tsx        # Membership plans
│       │   │   ├── AdminInsurance.tsx    # Insurance management
│       │   │   ├── LabsManagement.tsx    # Lab CRUD
│       │   │   ├── PharmaciesManagement.tsx # Pharmacy CRUD
│       │   │   ├── CorporatesManagement.tsx # Corporate CRUD
│       │   │   ├── CRMPage.tsx           # CRM dashboard
│       │   │   ├── CRMLeadDetail.tsx     # Lead details
│       │   │   └── AdminPlaceholders.tsx # Placeholder pages
│       │   │
│       │   └── 📂 chat/                  # Video chat pages
│       │       ├── VideoChat.tsx         # User video
│       │       └── VideoChatdoctor.tsx   # Doctor video (disabled)
│       │
│       ├── 📂 components/                # Reusable components
│       │   ├── 📂 ui/                    # shadcn/ui components
│       │   │   ├── button.tsx
│       │   │   ├── card.tsx
│       │   │   ├── input.tsx
│       │   │   ├── dialog.tsx
│       │   │   ├── dropdown-menu.tsx
│       │   │   ├── select.tsx
│       │   │   ├── badge.tsx
│       │   │   ├── avatar.tsx
│       │   │   ├── toast.tsx
│       │   │   └── ... (40+ components)
│       │   │
│       │   ├── 📂 layout/                # Layout components
│       │   │   ├── MainLayout.tsx        # User layout wrapper
│       │   │   ├── AdminLayout.tsx       # Admin layout wrapper
│       │   │   ├── Sidebar.tsx           # Navigation sidebar
│       │   │   └── Header.tsx            # Header component
│       │   │
│       │   ├── 📂 health/                # Health-specific components
│       │   │   ├── HealthMetrics.tsx     # Metrics display
│       │   │   ├── AddVitalsForm.tsx     # Vitals input
│       │   │   ├── VoiceInput.tsx        # Voice commands
│       │   │   └── FuturisticBackground.tsx # UI effects
│       │   │
│       │   └── 📂 features/              # Feature components
│       │       ├── HealthFeed.tsx        # Social health feed
│       │       ├── VideoPlayer.tsx       # Video component
│       │       ├── AppointmentList.tsx   # Appointment cards
│       │       ├── QuickActions.tsx      # Quick action buttons
│       │       ├── Chat.tsx              # Chat interface
│       │       ├── GoogleFitDashboard.tsx # Fit integration
│       │       ├── HealthMetricCard.tsx  # Metric card
│       │       ├── VoiceNavigation.tsx   # Voice nav
│       │       ├── OfflineIndicator.tsx  # PWA offline status
│       │       ├── GodRays.tsx           # Visual effects
│       │       └── AyushmanStatus.jsx    # Ayushman widget
│       │
│       ├── 📂 hooks/                     # Custom React hooks
│       │   ├── auth.ts                   # Auth utilities
│       │   ├── use-toast.ts              # Toast notifications
│       │   ├── use-mobile.tsx            # Mobile detection
│       │   ├── use-local-storage.ts      # LocalStorage hook
│       │   └── useOffline.ts             # Offline detection
│       │
│       ├── 📂 context/                   # React context
│       │   └── SocketContext.tsx         # Socket.io context
│       │
│       ├── 📂 routes/                    # Route configuration
│       │   └── index.tsx                 # React Router routes
│       │
│       ├── 📂 lib/                       # Library code
│       │   ├── types.ts                  # Type definitions
│       │   ├── user.type.ts              # User types
│       │   ├── utils.ts                  # Utility functions
│       │   ├── firebase-config.ts        # Firebase setup
│       │   └── agora-config.ts           # Agora setup
│       │
│       ├── 📂 utils/                     # Utility modules
│       │   ├── api.ts                    # Axios instance
│       │   ├── theme.provider.tsx        # Theme context
│       │   ├── demoData.ts               # Mock admin data
│       │   └── excelParser.ts            # Excel parsing
│       │
│       ├── 📂 services/                  # Frontend services
│       │   └── indexedDB.ts              # IndexedDB for offline
│       │
│       └── 📂 styles/                    # Style files
│           └── animations.css            # Custom animations
│
└── 📂 Documentation/                     # Additional docs
    ├── MEMBERSHIP_USAGE_INTEGRATION.md   # Membership system
    ├── INSURANCE_SYSTEM.md               # Insurance features
    ├── TESTING_GUIDE.md                  # Testing instructions
    ├── CRM_GUIDE.md                      # CRM usage
    ├── ADMIN_QUICKSTART.md               # Admin setup
    ├── FIREBASE_SETUP.md                 # Firebase config
    ├── AGORA_MIGRATION.md                # Video call setup
    ├── ASYNC_TASKS.md                    # Background jobs
    └── NOTIFICATION_SYSTEM.md            # Push notifications
```

---

## 🗄 DATABASE ARCHITECTURE

### MariaDB Tables (Sequelize Models)

#### Core Entities
```sql
-- Users (patients & general users)
Users (id, firstName, lastName, email, password, dateOfBirth, gender, 
       phoneNumber, address_*, emergency_*, medicalHistory, isAdmin, role)

-- Doctors (medical professionals)
Doctors (id, firstName, lastName, email, password, phoneNumber, 
         specialization, qualifications, registrationNumber, 
         experience, consultationFee, about, languages, 
         hospitalAffiliation, clinicAddress, availability, rating, isVerified)

-- Doctor Availability Schedules
DoctorAvailability (id, doctorId, dayOfWeek, startTime, endTime, 
                   slotDuration, maxPatients, isAvailable, createdAt, updatedAt)

-- Appointments
Appointments (id, userId, doctorId, appointmentDate, timeSlot, status, 
             reason, notes, consultationFee, paymentStatus, specialization, 
             rating, feedback, createdAt, updatedAt)
  Status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
```

#### Membership System
```sql
-- Membership Plan Templates
MembershipPlans (id, name, description, durationDays, priceINR, 
                teleConsultLimits, benefitLimits, healthCheckPackage, 
                isActive, createdAt, updatedAt)
  teleConsultLimits: JSON { allSpecialties?: number, Cardiology?: number, ... }
  benefitLimits: JSON { pharmacyLimitINR: number, homeCareLimitINR: number, ... }

-- User Subscriptions
UserPlans (id, userId, planId, startDate, endDate, status, 
          appliedLimits, usage, createdAt, updatedAt)
  appliedLimits: Snapshot of plan limits at subscription time
  usage: JSON tracking { teleConsult: {}, benefitINR: {} }
  Status: 'active' | 'expired' | 'cancelled'
```

#### Insurance System
```sql
-- Insurance Providers
InsuranceProviders (id, name, code, contactEmail, contactPhone, website, 
                   address, logo, supportedServices, networkType, 
                   claimProcessDays, isActive)
  supportedServices: ['hospital', 'pharmacy', 'diagnostic', 'ambulance', ...]
  networkType: 'TPA' | 'Direct' | 'Both'

-- Insurance Policies
InsurancePolicies (id, providerId, policyName, policyNumber, policyType, 
                  coverageAmount, premiumAmount, coverageDetails, exclusions, 
                  waitingPeriod, coPaymentPercent, roomRentLimit, 
                  validFrom, validTo, description, isActive)
  policyType: 'Individual' | 'Family' | 'Group' | 'Senior' | 'Critical'
  coverageDetails: JSON { hospitalization, pharmacy, diagnostics, ... }

-- User Insurance Enrollments
UserInsurances (id, userId, policyId, providerId, enrollmentNumber, 
               enrollmentDate, expiryDate, status, familyMembers, 
               claimsUsed, claimsCount, policyDocumentUrl, cardImageUrl, documents)
  Status: 'Active' | 'Expired' | 'Cancelled' | 'Suspended' | 'PendingRenewal'
  familyMembers: JSON array of covered family members

-- Insurance Claims
InsuranceClaims (id, userInsuranceId, claimNumber, claimAmount, approvedAmount, 
                claimType, status, treatmentDate, hospitalName, diagnosis, 
                documents, submittedDate, approvedDate, settledDate, 
                rejectionReason, processingNotes)
  claimType: 'Hospitalization' | 'Pharmacy' | 'Diagnostic' | 'Consultation' | ...
  Status: 'Submitted' | 'UnderReview' | 'Approved' | 'Rejected' | 
          'PartiallyApproved' | 'Settled'
```

#### CRM System
```sql
-- CRM Leads
Leads (id, firstName, lastName, email, phone, company, source, status, 
      value, assignedTo, tags, customFields, createdAt, updatedAt)
  Status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
  source: 'website' | 'referral' | 'cold_call' | ...

-- Lead Activities
LeadActivities (id, leadId, activityType, description, performedBy, 
               activityDate, createdAt)
  activityType: 'call' | 'email' | 'meeting' | 'note' | ...

-- Lead Notes
LeadNotes (id, leadId, note, createdBy, createdAt)

-- Lead Tasks
LeadTasks (id, leadId, title, description, dueDate, priority, status, 
          assignedTo, createdBy, createdAt, updatedAt)
  Status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
```

#### Healthcare Facilities
```sql
-- Hospitals
Hospitals (id, name, address, city, state, phone, email, website, 
          specialties, facilities, bedCount, emergencyAvailable, 
          ambulanceAvailable, isActive)

-- Clinics
Clinics (id, name, address, city, state, phone, email, 
        specialization, timings, doctorsCount, isActive)

-- Laboratories
Labs (id, name, address, city, state, phone, email, website, 
     services, accreditation, homeCollection, isActive)

-- Pharmacies
Pharmacies (id, name, address, city, state, phone, email, 
           deliveryAvailable, prescription Required, isActive)

-- Ambulance Services
Ambulances (id, providerName, phone, emergencyNumber, vehicleType, 
           equipmentLevel, basedLocation, serviceArea, isActive)
  vehicleType: 'Basic' | 'Advanced' | 'Air'

-- Home Care Providers
HomecareProviders (id, name, services, address, phone, email, 
                  qualification, experience, availability, isActive)

-- Corporate Clients
Corporates (id, companyName, industry, address, phone, email, 
           employeeCount, planType, contactPerson, isActive)
```

### MongoDB Collections (Legacy Support)
```javascript
// Chat Messages
chats {
  _id, conversationId, senderId, receiverId, message, 
  messageType, timestamp, read, deleted
}

// Google Fit Data
fitnessData {
  _id, userId, dataType, value, unit, timestamp, 
  source, syncedAt
}
```

---

## 🔌 API ENDPOINTS

### Base URL
```
Development: http://localhost:8000/api
Production: https://your-domain.com/api
```

### Authentication & Users
```
POST   /users/register          - User registration
POST   /users/login             - User login
GET    /users/profile           - Get current user profile
PUT    /users/profile           - Update user profile
POST   /users/forgot-password   - Forgot password
POST   /users/reset-password    - Reset password
```

### Doctors
```
POST   /doctors/register        - Doctor registration
POST   /doctors/login           - Doctor login
GET    /doctors                 - List all doctors (with filters)
GET    /doctors/:id             - Get doctor details
PUT    /doctors/profile         - Update doctor profile
GET    /doctors/:id/availability - Get doctor availability
POST   /doctors/availability    - Set availability slots
```

### Appointments
```
POST   /appointments            - Create appointment
GET    /appointments/user/:userId - Get user appointments
GET    /appointments/doctor/:doctorId - Get doctor appointments
GET    /appointments/:id        - Get appointment details
PATCH  /appointments/:id/status - Update appointment status
PATCH  /appointments/:id/cancel - Cancel appointment
PATCH  /appointments/:id/rating - Rate appointment
DELETE /appointments/:id        - Delete appointment (admin)
```

### Membership Plans
```
Admin Routes (requires admin auth):
GET    /membership/admin/plans         - List all plans
POST   /membership/admin/plans         - Create plan
PUT    /membership/admin/plans/:id     - Update plan
DELETE /membership/admin/plans/:id     - Delete plan

User Routes:
GET    /membership/plans               - List active plans
GET    /membership/current             - Get user's current plan
GET    /membership/usage               - Get usage statistics
POST   /membership/subscribe/:planId   - Subscribe to plan
POST   /membership/cancel              - Cancel subscription
POST   /membership/usage/teleconsult   - Increment teleconsult usage
POST   /membership/usage/benefit       - Increment benefit usage
```

### Insurance
```
Admin Routes:
GET    /insurance/admin/providers      - List providers
POST   /insurance/admin/providers      - Create provider
PUT    /insurance/admin/providers/:id  - Update provider
DELETE /insurance/admin/providers/:id  - Delete provider
GET    /insurance/admin/policies       - List policies
POST   /insurance/admin/policies       - Create policy
PUT    /insurance/admin/policies/:id   - Update policy
DELETE /insurance/admin/policies/:id   - Delete policy
GET    /insurance/admin/enrollments    - List enrollments
GET    /insurance/admin/claims         - List all claims
PATCH  /insurance/admin/claims/:id/status - Update claim status

User Routes:
GET    /insurance/providers            - List active providers
GET    /insurance/policies/:providerId - Get policies by provider
GET    /insurance/my/insurances        - Get user insurances
POST   /insurance/claims               - Submit claim
```

### CRM
```
GET    /crm/leads                 - List leads (with filters)
POST   /crm/leads                 - Create lead
GET    /crm/leads/:id             - Get lead details
PUT    /crm/leads/:id             - Update lead
DELETE /crm/leads/:id             - Delete lead
POST   /crm/leads/:id/activities  - Add activity
POST   /crm/leads/:id/notes       - Add note
POST   /crm/leads/:id/tasks       - Create task
GET    /crm/stats                 - Get CRM statistics
```

### Admin
```
POST   /admin/login               - Admin login
GET    /admin/dashboard/stats     - Dashboard statistics
GET    /admin/users               - List all users
GET    /admin/doctors             - List all doctors
POST   /admin/masters/doctors     - Bulk upload doctors
POST   /admin/masters/labs        - Bulk upload labs
POST   /admin/masters/pharmacies  - Bulk upload pharmacies
POST   /admin/masters/corporates  - Bulk upload corporates
POST   /admin/users               - Create internal user
```

### AI Services
```
POST   /ai/chat                   - AI chat (Gemini)
POST   /ai/groq                   - Groq AI chat
POST   /ai/symptoms               - Symptom analysis
POST   /ai/diet                   - Diet recommendations
```

### Firebase Notifications
```
POST   /fcm/subscribe             - Subscribe to topic
POST   /fcm/send                  - Send notification
POST   /fcm/broadcast             - Broadcast to topic
```

### Google Fit Integration
```
GET    /fitness/auth              - Initiate OAuth flow
GET    /fitness/callback          - OAuth callback
GET    /fitness/data              - Get fitness data
POST   /fitness/sync              - Sync fitness data
```

### Ayushman Bharat
```
POST   /ayushman/verify           - Verify beneficiary
GET    /ayushman/card/:number     - Get card details
```

### Async Jobs
```
POST   /async/jobs/email          - Queue email job
POST   /async/jobs/report         - Queue report generation
GET    /async/jobs/:id            - Get job status
```

---

## 🌐 FRONTEND ROUTES

### Public Routes (No Auth Required)
```
/                       - Landing page
/login                  - User login
/register               - User registration  
/doc-register           - Doctor registration
/admin/login            - Admin login
```

### Patient Routes (User Auth Required)
```
/profile                - User profile
/health-tracker         - Health metrics tracker
/symptoms               - Symptom checker
/ai-doctor              - AI consultation
/consultation           - Find doctors
/consultation/:doctorId - Book appointment
/my-bookings            - View bookings
/my-plans               - Membership plans
/medicine               - Medicine catalog
/diet                   - Diet planner
/calorie-calculator     - Calorie calculator
/ayushman               - Ayushman card verification
/health-feed            - Health social feed
/emergency              - Emergency services
```

### Doctor Routes (Doctor Auth Required)
```
/doctor-dashboard       - Doctor home
/doctor/appointments    - Manage appointments
```

### Admin Routes (Admin Auth Required)
```
/admin                  - Admin dashboard
/admin/users            - User management
/admin/doctors          - Doctor management
/admin/appointments     - Appointment management
/admin/plans            - Membership plans
/admin/insurance        - Insurance management
/admin/labs             - Lab management
/admin/pharmacies       - Pharmacy management
/admin/corporates       - Corporate management
/admin/crm              - CRM dashboard
/admin/crm/lead/:id     - Lead details
/admin/reports          - Reports
/admin/settings         - Settings
```

### Video Chat Routes (Currently Disabled)
```
/chat                   - User video chat
/chatdoctor             - Doctor video chat
```

---

## ✨ KEY FEATURES

### 1. User Management
- Registration with email/password or Google OAuth
- Profile management with medical history
- Role-based access (Patient, Doctor, Admin)
- JWT authentication with 7-day expiry
- Password reset flow

### 2. Doctor Management
- Specialized doctor registration
- Qualification verification by admin
- Availability slot management (day, time, duration)
- Rating & review system
- Consultation fee management

### 3. Appointment System
- Real-time availability checking
- Appointment booking with conflict prevention
- Status workflow: pending → confirmed → completed/cancelled
- Automatic usage increment on completion
- Email/SMS notifications
- Rating & feedback after completion

### 4. Membership Plans
- Admin-defined plan templates
- Flexible teleconsultation limits (all specialties or per-specialty)
- Monetary benefit limits (pharmacy, home care, ambulance)
- User subscription management
- Real-time usage tracking with transaction safety
- Automatic usage increment on service consumption
- Live usage updates in UI with animated banners

### 5. Insurance Management
- Multi-provider support
- Policy CRUD by admin
- User enrollment with family members
- Claim submission & tracking
- Status workflow: Submitted → Under Review → Approved/Rejected → Settled
- Document management for policies and claims
- Co-payment and coverage calculations

### 6. CRM System
- Lead management with pipeline stages
- Activity tracking (calls, emails, meetings)
- Task assignment with due dates
- Notes and custom fields
- Lead source tracking
- Conversion analytics

### 7. AI Health Assistant
- Symptom analysis via Google Gemini
- Diet recommendations
- Health tips & personalized advice
- Medical Q&A
- Alternative Groq AI integration

### 8. Video Consultations
- Agora WebRTC integration
- High-quality video/audio
- Screen sharing capability
- In-call chat
- Call recording (optional)

### 9. Real-time Communication
- Socket.io for instant messaging
- Typing indicators
- Read receipts
- Message history

### 10. Push Notifications
- Firebase Cloud Messaging
- Appointment reminders
- Status updates
- Admin broadcasts
- Service worker for background notifications

### 11. Health Tracking
- Vitals monitoring (BP, heart rate, blood sugar, weight, etc.)
- Google Fit integration
- Historical data & trends
- Chart visualizations
- Export functionality

### 12. PWA Features
- Offline mode with service worker
- App installation prompt
- IndexedDB for offline data
- Background sync
- Responsive design for all devices

### 13. Background Jobs (BullMQ)
- Email sending queue
- Report generation
- Data sync tasks
- Notification dispatch
- Scheduled reminders

### 14. Monitoring & Analytics
- Prometheus metrics collection
- Express route monitoring
- Custom business metrics
- Grafana dashboards (optional)

---

## 🔧 INFRASTRUCTURE SERVICES

### Redis (Cache & Queue)
```yaml
Purpose: 
  - Session storage
  - BullMQ job queues
  - Rate limiting
  - Caching API responses

Configuration:
  Host: localhost (or REDIS_HOST env)
  Port: 6379 (default)
  DB: 0 (default)
  
Queues:
  - emailQueue: Email sending jobs
  - notificationQueue: Push notification jobs
  - reportQueue: Report generation jobs
```

### Kafka (Message Broker)
```yaml
Purpose:
  - Event streaming
  - Async service communication
  - Audit logging
  - Analytics events

Topics:
  - user-events: User registration, login, profile updates
  - appointment-events: Booking, cancellation, completion
  - notification-events: Notification triggers
  
Producers:
  - Express routes publish events
  
Consumers:
  - Notification service
  - Analytics service
  - Logging service
```

### Prometheus (Monitoring)
```yaml
Purpose:
  - Metrics collection
  - Performance monitoring
  - Resource usage tracking

Metrics:
  - HTTP request duration
  - Request count by route
  - Error rate
  - Database query time
  - Queue job processing time
  
Scrape Config:
  Target: http://localhost:8000/metrics
  Interval: 15s
```

### Socket.io (Real-time)
```yaml
Purpose:
  - Chat messaging
  - Live notifications
  - Presence detection

Namespaces:
  - /chat: Chat messages
  - /notifications: Push notifications

Events:
  - message: Chat message
  - typing: Typing indicator
  - notification: Push notification
  - appointment-update: Real-time appointment changes
```

---

## 🔐 ENVIRONMENT CONFIGURATION

### Server Environment Variables (.env)

```bash
# Server Configuration
PORT=8000
NODE_ENV=development

# Database - MariaDB
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=mediczy_db

# Database - MongoDB (Legacy, optional)
MONGO_URI=mongodb://localhost:27017/mediczy

# JWT Authentication
SECRET_TOKEN=your-secret-key-change-this-in-production
JWT_EXPIRY=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=mediczy-server
KAFKA_GROUP_ID=mediczy-group

# Google APIs
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_API_KEY=your-google-api-key
GEMINI_API_KEY=your-gemini-api-key

# Firebase Admin (for push notifications)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-service-account.json
# OR individual Firebase config:
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Groq AI
GROQ_API_KEY=your-groq-api-key

# Agora (Video Calls)
AGORA_APP_ID=your-agora-app-id
AGORA_APP_CERTIFICATE=your-agora-certificate

# Ayushman Bharat API
AYUSHMAN_API_URL=https://api.ayushmanbharat.gov.in
AYUSHMAN_API_KEY=your-ayushman-api-key

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@mediczy.com

# SMS (optional)
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890

# Payment Gateway (optional)
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret

# AWS S3 (for file storage, optional)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=mediczy-uploads
AWS_REGION=us-east-1

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Prometheus
PROMETHEUS_PORT=9090
```

### Client Environment Variables (.env.local or .env)

```bash
# Vite prefix required for client-side access
VITE_API_BASE_URL=http://localhost:8000/api
VITE_SOCKET_URL=http://localhost:8000

# Google OAuth
VITE_GOOGLE_CLIENT_ID=your-google-client-id

# Firebase (Web Config)
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_FIREBASE_VAPID_KEY=your-vapid-key

# Agora
VITE_AGORA_APP_ID=your-agora-app-id

# Google Maps (optional)
VITE_GOOGLE_MAPS_API_KEY=your-maps-api-key

# Environment
VITE_APP_ENV=development
```

---

## 🚀 STARTUP & DEPLOYMENT

### Prerequisites
```bash
# Required
- Node.js 18+ and npm
- MariaDB 10.6+
- Redis 6.0+
- Apache Kafka 3.0+ (optional but recommended)

# Optional
- MongoDB 5.0+ (for legacy chat/fitness features)
- Prometheus 2.40+
- Nginx (for production reverse proxy)
- PM2 (for process management)
```

### Installation Steps

#### 1. Clone Repository
```bash
git clone https://github.com/your-org/mediczy.git
cd mediczy
```

#### 2. Install Root Dependencies
```bash
npm install
```

#### 3. Backend Setup
```bash
cd server

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your configuration

# Setup database
# Create MariaDB database: mediczy_db
mysql -u root -p -e "CREATE DATABASE mediczy_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Sync database tables (Sequelize auto-creates tables)
node sync-db.js

# Create admin user
npm run seed:admin
# OR manually:
node scripts/seed-admin.js

# Start server
npm start
```

#### 4. Frontend Setup
```bash
cd ../client

# Install dependencies
npm install

# Create .env.local
# Add VITE_* environment variables

# Start development server
npm run dev
```

#### 5. Infrastructure Services

**Start Redis:**
```bash
# Linux/Mac
redis-server

# Docker
docker run -d -p 6379:6379 redis:6-alpine
```

**Start Kafka (Optional):**
```bash
# Using Docker Compose
docker-compose up -d kafka zookeeper

# Or manually with Kafka binaries
bin/zookeeper-server-start.sh config/zookeeper.properties
bin/kafka-server-start.sh config/server.properties
```

**Start Prometheus (Optional):**
```bash
cd server/prometheus-2.48.0.linux-amd64
./prometheus --config.file=../prometheus.yml
```

#### 6. Access Application
```
Frontend: http://localhost:4000 (or auto-assigned port)
Backend API: http://localhost:8000/api
Prometheus: http://localhost:9090
```

### Production Deployment

#### Using PM2
```bash
# Backend
cd server
pm2 start index.js --name mediczy-server

# Monitor
pm2 logs mediczy-server
pm2 monit
```

#### Build Frontend
```bash
cd client
npm run build

# Serve static files with Nginx
# Copy dist/ to /var/www/mediczy
```

#### Nginx Configuration
```nginx
# /etc/nginx/sites-available/mediczy

server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        root /var/www/mediczy;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket (Socket.io)
    location /socket.io {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

#### SSL with Let's Encrypt
```bash
sudo certbot --nginx -d your-domain.com
```

---

## 💻 DEVELOPMENT WORKFLOW

### Running in Development
```bash
# From root directory (runs both frontend & backend)
npm run dev

# OR separately:

# Backend (with auto-reload)
cd server
npm start  # or: nodemon index.js

# Frontend (with HMR)
cd client
npm run dev
```

### Code Structure Guidelines

#### Backend
- **Models**: Use Sequelize models with MariaDB
- **Controllers**: Business logic, keep routes thin
- **Middleware**: Authentication, validation, error handling
- **Routes**: RESTful API endpoints
- **Utils**: Reusable helper functions

#### Frontend
- **Components**: Reusable UI components in `components/`
- **Pages**: Route-specific page components in `pages/`
- **Hooks**: Custom React hooks in `hooks/`
- **Utils**: Helper functions in `utils/`
- **Types**: TypeScript types in `lib/`

### State Management
- **Server State**: TanStack Query (React Query)
- **Local State**: React hooks (useState, useReducer)
- **Global State**: Zustand (if needed)
- **Context**: React Context for theme, auth, socket

### Styling
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: Pre-built accessible components
- **Custom CSS**: `styles/animations.css` for animations

### API Communication
```typescript
// Use centralized API utility
import api from '@/utils/api';

// Authenticated requests (token auto-attached)
const { data } = await api.get('/users/profile');

// Admin requests (explicit token)
const adminToken = localStorage.getItem('adminToken');
const { data } = await api.get('/admin/stats', {
  headers: { Authorization: `Bearer ${adminToken}` }
});
```

---

## 🔐 SECURITY & AUTHENTICATION

### Authentication Flow

#### User/Doctor Login
1. User submits credentials to `/users/login` or `/doctors/login`
2. Backend validates credentials with bcrypt
3. JWT token generated with payload: `{ id, email, role }`
4. Token sent to client, stored in localStorage
5. Token attached to subsequent requests via Axios interceptor
6. Backend middleware verifies token on protected routes

#### Admin Login
1. Admin submits credentials to `/admin/login`
2. Backend checks `isAdmin: true` flag in Users table
3. Separate admin token generated and stored as `adminToken`
4. Admin routes protected with `requireRole('admin')` middleware

### Middleware Chain
```javascript
// Protected user route
router.get('/profile', authUser, getUserProfile);

// Admin-only route
router.post('/admin/plans', authUser, requireRole('admin'), createPlan);
```

### Password Security
- Passwords hashed with bcrypt (salt rounds: 10)
- Never stored or transmitted in plain text
- Password reset uses time-limited tokens

### Rate Limiting
```javascript
// Applied globally
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP'
});
```

### CORS Configuration
```javascript
const corsOptions = {
  origin: ['http://localhost:4000', 'http://localhost:5173'],
  credentials: true
};
```

### Environment Variables
- Never commit `.env` files
- Use `.env.example` as template
- Different configs for dev/staging/prod

---

## 🧪 TESTING

### Manual Testing

#### 1. Authentication
```bash
# Register user
curl -X POST http://localhost:8000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test@123",...}'

# Login
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test@123"}'
```

#### 2. Appointments
```bash
# Get doctors
curl http://localhost:8000/api/doctors

# Book appointment (with token)
curl -X POST http://localhost:8000/api/appointments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"doctorId":1,"appointmentDate":"2025-11-10","timeSlot":"10:00",...}'
```

#### 3. Admin Operations
```bash
# Admin login
curl -X POST http://localhost:8000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mediczy.local","password":"Admin@1234"}'

# Get dashboard stats
curl http://localhost:8000/api/admin/dashboard/stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Frontend Testing
1. Open http://localhost:4000
2. Register new user
3. Login and navigate through pages
4. Book an appointment
5. Check admin panel at /admin/login

### Comprehensive Test Script
```bash
# Run from root directory
./comprehensive-test.sh
```

---

## 🔧 TROUBLESHOOTING

### Common Issues

#### 1. Port Already in Use
```bash
# Find process using port
lsof -i :8000   # Backend
lsof -i :4000   # Frontend

# Kill process
kill -9 <PID>
```

#### 2. Database Connection Error
```
# Check MariaDB is running
sudo systemctl status mariadb

# Test connection
mysql -u root -p -e "SHOW DATABASES;"

# Grant permissions
GRANT ALL PRIVILEGES ON mediczy_db.* TO 'your_user'@'localhost';
FLUSH PRIVILEGES;
```

#### 3. Redis Connection Error
```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Start Redis
redis-server

# Check logs
tail -f /var/log/redis/redis-server.log
```

#### 4. Frontend Build Errors
```bash
# Clear cache
rm -rf node_modules
npm install

# Clear Vite cache
rm -rf .vite

# Rebuild
npm run build
```

#### 5. CORS Errors
- Check CORS configuration in `server/app.js`
- Ensure frontend URL is in allowed origins
- Check browser console for specific error

#### 6. JWT Token Expired
- Tokens expire after 7 days
- User must re-login
- Check token expiry in middleware logs

#### 7. Blank Admin Pages
- Verify demo admin token logic in AdminDashboardHome
- Check browser console for errors
- Ensure admin routes bypass AuthProvider checks

---

## 📚 ADDITIONAL RESOURCES

### Documentation Files
- `MEMBERSHIP_USAGE_INTEGRATION.md` - Membership system guide
- `INSURANCE_SYSTEM.md` - Insurance features
- `TESTING_GUIDE.md` - Comprehensive testing instructions
- `CRM_GUIDE.md` - CRM usage and workflows
- `ADMIN_QUICKSTART.md` - Admin panel setup
- `FIREBASE_SETUP.md` - Firebase configuration
- `AGORA_MIGRATION.md` - Video call implementation
- `ASYNC_TASKS.md` - Background job details
- `NOTIFICATION_SYSTEM.md` - Push notification setup

### Admin Credentials
```
Default Admin:
Email: admin@mediczy.local
Password: Admin@1234
```

### Default Ports
```
Backend API: 8000
Frontend Dev: 4000 (or auto-assigned)
Redis: 6379
Kafka: 9092
Prometheus: 9090
MariaDB: 3306
MongoDB: 27017
```

### Key Scripts
```bash
# Server
npm run start              # Start backend
npm run seed:admin         # Create admin user

# Client  
npm run dev                # Start dev server
npm run build              # Production build
npm run preview            # Preview production build

# Root
npm run dev                # Start both frontend & backend
```

---

## 📝 NOTES

### Demo Mode
- Admin login uses a demo token workaround
- Demo token starts with `admin-demo-token-`
- Admin pages use mock data when demo token detected
- Replace with real backend authentication in production

### Video Chat
- Video chat routes currently disabled due to missing Zego dependencies
- Agora integration is configured but video chat components need fixing
- Alternative: Use Agora Web SDK directly

### Migrations
- Platform migrated from MongoDB to MariaDB
- Legacy MongoDB models kept in `*.model.js` files
- New MariaDB models use `*.model.mariadb.js` naming

### Future Enhancements
- [ ] User insurance enrollment UI
- [ ] Payment gateway integration (Razorpay/Stripe)
- [ ] Real-time notifications with Socket.io
- [ ] Advanced analytics dashboards
- [ ] Mobile apps (React Native)
- [ ] Telemedicine compliance (HIPAA, etc.)

---

## 🤝 CONTRIBUTING

### Development Guidelines
1. Follow existing code structure
2. Use TypeScript for frontend
3. Use ES Modules for backend
4. Write meaningful commit messages
5. Test before pushing

### Branch Strategy
```
main - Production-ready code
develop - Development branch
feature/* - Feature branches
bugfix/* - Bug fix branches
hotfix/* - Production hotfixes
```

---

## 📄 LICENSE

Proprietary - All rights reserved

---

## 📞 SUPPORT

For issues, questions, or feature requests:
- Email: support@mediczy.com
- Documentation: /docs
- Issue Tracker: GitHub Issues

---

**Last Updated:** November 9, 2025  
**Maintained By:** Mediczy Development Team  
**Version:** 1.0.0
