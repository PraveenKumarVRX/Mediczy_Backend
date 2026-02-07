# 🏥 MEDIQZY API INTEGRATION PLAN
## Comprehensive API Documentation for Multi-Tenant Wellness Platform

**Platform**: Mediqzy Wellness & Health Insurance Integration Platform  
**Version**: v2.0  
**Date**: February 6, 2026  
**Architecture**: Multi-Tenant B2B2C Model  

---

## 📋 TABLE OF CONTENTS

1. [Platform Overview](#platform-overview)
2. [API Architecture](#api-architecture)
3. [Authentication & Authorization](#authentication--authorization)
4. [Core API Modules](#core-api-modules)
5. [Stakeholder-Specific APIs](#stakeholder-specific-apis)
6. [Integration Patterns](#integration-patterns)
7. [Security & Compliance](#security--compliance)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Webhooks & Real-time Events](#webhooks--real-time-events)
10. [API Versioning Strategy](#api-versioning-strategy)

---

## 🎯 PLATFORM OVERVIEW

### Business Model
Mediqzy operates as a **B2B2C wellness platform** providing IT infrastructure and wellness services to health insurance stakeholders.

### Stakeholder Types
1. **Clinics** - Primary care providers
2. **Hospitals** - Multi-specialty healthcare institutions
3. **Corporates** - Employee wellness programs
4. **Brokers** - Insurance intermediaries
5. **TPAs** (Third Party Administrators) - Claims processors
6. **Insurance Companies** - Policy providers

### Service Offerings
- 🩺 Doctor Consultations (Online/Offline)
- 📹 Video Call Consultations
- 💬 Chat with Doctors
- 🧪 Lab Appointment Booking
- 💊 Pharmacy Orders & Medicine Delivery
- 🏠 Home Healthcare Services
- 🏋️ Wellness & Fitness Plans
- 📊 Personalized HRA (Health Risk Assessment)
- 📈 Activity Tracker Integration
- ❤️ Health Monitoring (Vitals, Wearables)
- 🥗 Diet & Nutrition Plans

---

## 🏗️ API ARCHITECTURE

### Base URL Structure
```
Production:  https://api.mediqzy.com/v2
Staging:     https://api-staging.mediqzy.com/v2
Sandbox:     https://api-sandbox.mediqzy.com/v2
```

### Multi-Tenant Architecture
Each stakeholder gets:
- **Tenant ID**: Unique identifier for organization
- **White-labeled endpoints**: Custom branding support
- **Isolated data**: Complete data segregation
- **Custom configuration**: Configurable features per tenant

### URL Pattern
```
/{version}/{tenant-id}/{resource}/{resource-id}

Examples:
/v2/clinic-apollo/appointments/12345
/v2/corporate-tcs/employees/emp001/wellness-plan
/v2/insurance-hdfc/policies/POL123456/claims
```

---

## 🔐 AUTHENTICATION & AUTHORIZATION

### Authentication Methods

#### 1. OAuth 2.0 (Recommended)
```http
POST /v2/oauth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "your_client_id",
  "client_secret": "your_client_secret",
  "tenant_id": "clinic-apollo",
  "scope": "appointments.read appointments.write consultations.video"
}

Response:
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "appointments.read appointments.write",
  "tenant_id": "clinic-apollo"
}
```

#### 2. API Key Authentication
```http
GET /v2/clinic-apollo/appointments
X-API-Key: your_api_key
X-Tenant-ID: clinic-apollo
```

#### 3. JWT Bearer Token
```http
GET /v2/clinic-apollo/appointments
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Authorization Scopes

| Scope | Description | Stakeholders |
|-------|-------------|--------------|
| `appointments.*` | Full appointment management | All |
| `consultations.video` | Video consultation access | Clinics, Hospitals |
| `consultations.chat` | Chat consultation access | All |
| `pharmacy.*` | Pharmacy orders & fulfillment | Hospitals, TPAs |
| `lab.*` | Lab appointments & reports | Clinics, Hospitals, Corporates |
| `wellness.*` | Wellness & fitness plans | Corporates, Insurance |
| `hra.*` | Health risk assessments | All |
| `claims.*` | Insurance claims processing | TPAs, Insurance |
| `users.*` | User management | All |
| `admin.*` | Administrative functions | Platform admins only |

### Role-Based Access Control (RBAC)

```json
{
  "roles": {
    "patient": ["appointments.read", "consultations.video", "pharmacy.read"],
    "doctor": ["appointments.*", "consultations.*", "prescriptions.*"],
    "clinic_admin": ["appointments.*", "users.read", "reports.read"],
    "corporate_admin": ["employees.*", "wellness.*", "hra.*"],
    "insurance_admin": ["policies.*", "claims.*", "users.*"],
    "tpa_admin": ["claims.*", "approvals.*", "reports.*"]
  }
}
```

---

## 📦 CORE API MODULES

### 1. DOCTOR CONSULTATIONS API

#### Book Appointment
```http
POST /v2/{tenant-id}/appointments
Authorization: Bearer {token}
Content-Type: application/json

{
  "patient_id": "PAT12345",
  "doctor_id": "DOC67890",
  "appointment_date": "2026-02-10",
  "start_time": "10:00",
  "end_time": "10:30",
  "consultation_type": "online",  // online | offline | home-visit
  "symptoms": "Fever and headache for 3 days",
  "preferred_language": "English",
  "insurance_policy_id": "POL123456",
  "metadata": {
    "source_app": "apollo-patient-app",
    "device_type": "mobile",
    "utm_source": "wellness_campaign"
  }
}

Response: 201 Created
{
  "success": true,
  "appointment": {
    "id": 12345,
    "appointment_number": "MED000012345",
    "patient_id": "PAT12345",
    "doctor_id": "DOC67890",
    "doctor_name": "Dr. Sarah Johnson",
    "appointment_date": "2026-02-10",
    "time_slot": "10:00 - 10:30",
    "consultation_type": "online",
    "status": "confirmed",
    "meeting_details": {
      "room_id": "apt-12345-a1b2c3d4",  // Canonical meeting ID (Phase 3.1)
      "meeting_link": "https://meet.mediqzy.com/apt-12345-a1b2c3d4",
      "join_instructions": "Click link 5 minutes before appointment"
    },
    "insurance_verified": true,
    "copay_amount": 250.00,
    "currency": "INR",
    "created_at": "2026-02-06T14:30:00Z"
  }
}
```

#### Get Appointments
```http
GET /v2/{tenant-id}/appointments?patient_id=PAT12345&status=upcoming&limit=10
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "appointments": [...],
  "pagination": {
    "total": 45,
    "page": 1,
    "per_page": 10,
    "total_pages": 5
  }
}
```

#### Cancel Appointment
```http
PUT /v2/{tenant-id}/appointments/{appointment_id}/cancel
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Patient not available",
  "refund_required": true
}

Response: 200 OK
{
  "success": true,
  "appointment": {
    "id": 12345,
    "status": "cancelled",
    "refund_amount": 250.00,
    "refund_initiated": true
  }
}
```

### 2. VIDEO CONSULTATION API

#### Join Video Room
```http
POST /v2/{tenant-id}/video/room/{room_id}/join
Authorization: Bearer {token}
Content-Type: application/json

{
  "appointment_id": 12345,
  "user_role": "patient",  // patient | doctor
  "device_info": {
    "platform": "ios",
    "app_version": "2.1.0",
    "camera_available": true,
    "microphone_available": true
  }
}

Response: 200 OK
{
  "success": true,
  "room_data": {
    "room_id": "apt-12345-a1b2c3d4",
    "appointment_id": 12345,
    "user_role": "patient",
    "video_token": "eyJhbGc...",
    "server_url": "wss://video.mediqzy.com",
    "expires_at": "2026-02-06T15:30:00Z"
  },
  "livekit": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "server_url": "wss://video.mediqzy.com",
    "room_name": "apt-12345-a1b2c3d4",
    "participant_identity": "patient-PAT12345",
    "participant_name": "John Doe"
  },
  "room_settings": {
    "max_duration_minutes": 30,
    "recording_enabled": true,
    "waiting_room_enabled": true,
    "screen_share_enabled": true,
    "chat_enabled": true
  }
}
```

#### End Video Consultation
```http
POST /v2/{tenant-id}/video/room/{room_id}/end
Authorization: Bearer {token}

{
  "appointment_id": 12345,
  "duration_minutes": 25,
  "prescription_added": true
}

Response: 200 OK
{
  "success": true,
  "consultation_summary": {
    "duration_minutes": 25,
    "recording_url": "https://recordings.mediqzy.com/apt-12345.mp4",
    "prescription_id": "PRES98765",
    "next_followup": "2026-02-20"
  }
}
```

### 3. CHAT CONSULTATION API

#### Send Message
```http
POST /v2/{tenant-id}/chat/conversations/{conversation_id}/messages
Authorization: Bearer {token}
Content-Type: application/json

{
  "sender_id": "PAT12345",
  "sender_role": "patient",
  "message_type": "text",  // text | image | audio | file
  "content": "I have been experiencing headaches",
  "attachments": [
    {
      "type": "image",
      "url": "https://uploads.mediqzy.com/abc123.jpg",
      "filename": "symptom_photo.jpg"
    }
  ]
}

Response: 201 Created
{
  "success": true,
  "message": {
    "id": "MSG123456",
    "conversation_id": "CONV789",
    "sender_id": "PAT12345",
    "content": "I have been experiencing headaches",
    "timestamp": "2026-02-06T14:35:00Z",
    "read": false
  }
}
```

#### Get Chat History
```http
GET /v2/{tenant-id}/chat/conversations/{conversation_id}/messages?limit=50
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "messages": [...],
  "participants": [
    {"id": "PAT12345", "name": "John Doe", "role": "patient"},
    {"id": "DOC67890", "name": "Dr. Sarah Johnson", "role": "doctor"}
  ]
}
```

### 4. LAB APPOINTMENT BOOKING API

#### Search Labs
```http
GET /v2/{tenant-id}/labs/search?city=Mumbai&test_type=blood&sort=rating
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "labs": [
    {
      "lab_id": "LAB001",
      "name": "PathLabs - Andheri",
      "address": "123 Main Street, Andheri West, Mumbai",
      "rating": 4.5,
      "available_tests": ["Complete Blood Count", "Lipid Profile", "HbA1c"],
      "home_collection": true,
      "next_available_slot": "2026-02-07T09:00:00Z",
      "price_range": {
        "min": 500,
        "max": 2000,
        "currency": "INR"
      }
    }
  ]
}
```

#### Book Lab Appointment
```http
POST /v2/{tenant-id}/lab-appointments
Authorization: Bearer {token}
Content-Type: application/json

{
  "patient_id": "PAT12345",
  "lab_id": "LAB001",
  "test_ids": ["TEST001", "TEST002"],
  "appointment_date": "2026-02-07",
  "appointment_time": "09:00",
  "collection_type": "home",  // home | lab-visit
  "collection_address": {
    "line1": "456 Apartment Complex",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400053"
  },
  "prescription_id": "PRES98765",
  "insurance_claim": true
}

Response: 201 Created
{
  "success": true,
  "lab_appointment": {
    "id": "LABAPP123",
    "appointment_number": "LAB000123",
    "lab_name": "PathLabs - Andheri",
    "tests": ["Complete Blood Count", "Lipid Profile"],
    "collection_date": "2026-02-07",
    "collection_time": "09:00 - 09:30",
    "collection_type": "home",
    "total_amount": 1500,
    "insurance_covered": 1200,
    "patient_copay": 300,
    "status": "confirmed"
  }
}
```

#### Get Lab Reports
```http
GET /v2/{tenant-id}/lab-reports?patient_id=PAT12345
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "reports": [
    {
      "report_id": "REPORT456",
      "lab_appointment_id": "LABAPP123",
      "test_name": "Complete Blood Count",
      "report_date": "2026-02-08",
      "status": "available",
      "report_url": "https://reports.mediqzy.com/REPORT456.pdf",
      "critical_values": false,
      "doctor_reviewed": true
    }
  ]
}
```

### 5. PHARMACY ORDERS API

#### Search Medicines
```http
GET /v2/{tenant-id}/pharmacy/medicines/search?query=paracetamol&location=Mumbai
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "medicines": [
    {
      "medicine_id": "MED001",
      "name": "Paracetamol 500mg",
      "brand": "Crocin",
      "manufacturer": "GSK",
      "price": 25.00,
      "mrp": 30.00,
      "discount": "17%",
      "prescription_required": false,
      "in_stock": true,
      "available_qty": 500,
      "delivery_available": true,
      "estimated_delivery": "2026-02-07"
    }
  ]
}
```

#### Create Pharmacy Order
```http
POST /v2/{tenant-id}/pharmacy/orders
Authorization: Bearer {token}
Content-Type: application/json

{
  "patient_id": "PAT12345",
  "prescription_id": "PRES98765",
  "delivery_address": {
    "line1": "456 Apartment Complex",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400053"
  },
  "items": [
    {
      "medicine_id": "MED001",
      "quantity": 10,
      "dosage": "2 times daily after meals"
    }
  ],
  "delivery_type": "express",  // standard | express | same-day
  "payment_method": "insurance",  // cod | online | insurance
  "insurance_claim": true
}

Response: 201 Created
{
  "success": true,
  "order": {
    "order_id": "ORD789",
    "order_number": "PHARM000789",
    "patient_id": "PAT12345",
    "items_count": 1,
    "total_amount": 250.00,
    "insurance_covered": 200.00,
    "patient_copay": 50.00,
    "delivery_charges": 0,
    "estimated_delivery": "2026-02-07T18:00:00Z",
    "status": "confirmed",
    "tracking_url": "https://track.mediqzy.com/ORD789"
  }
}
```

#### Track Order
```http
GET /v2/{tenant-id}/pharmacy/orders/{order_id}/track
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "tracking": {
    "order_id": "ORD789",
    "status": "out_for_delivery",
    "current_location": "Andheri Hub",
    "estimated_delivery": "2026-02-07T18:00:00Z",
    "delivery_person": {
      "name": "Rahul Kumar",
      "phone": "+91-9876543210"
    },
    "timeline": [
      {
        "status": "confirmed",
        "timestamp": "2026-02-06T14:00:00Z",
        "location": "Pharmacy"
      },
      {
        "status": "packed",
        "timestamp": "2026-02-06T15:00:00Z",
        "location": "Pharmacy"
      },
      {
        "status": "shipped",
        "timestamp": "2026-02-07T10:00:00Z",
        "location": "Andheri Hub"
      },
      {
        "status": "out_for_delivery",
        "timestamp": "2026-02-07T16:00:00Z",
        "location": "Andheri Hub"
      }
    ]
  }
}
```

### 6. HOME HEALTHCARE API

#### Search Home Healthcare Services
```http
GET /v2/{tenant-id}/home-healthcare/services?city=Mumbai&service_type=nursing
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "services": [
    {
      "service_id": "HHS001",
      "service_type": "nursing",
      "service_name": "Post-Surgery Nursing Care",
      "provider": "CareNow Healthcare",
      "rating": 4.7,
      "price_per_visit": 1500,
      "price_per_day": 3500,
      "available_from": "2026-02-07",
      "qualifications": ["BSc Nursing", "5+ years experience"],
      "services_included": [
        "Wound dressing",
        "Medication administration",
        "Vital monitoring",
        "Patient care"
      ]
    }
  ]
}
```

#### Book Home Healthcare
```http
POST /v2/{tenant-id}/home-healthcare/bookings
Authorization: Bearer {token}
Content-Type: application/json

{
  "patient_id": "PAT12345",
  "service_id": "HHS001",
  "service_type": "nursing",
  "start_date": "2026-02-08",
  "duration_days": 7,
  "visits_per_day": 2,
  "service_address": {
    "line1": "456 Apartment Complex",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400053"
  },
  "preferred_time_slots": ["09:00-10:00", "18:00-19:00"],
  "special_instructions": "Patient recovering from knee surgery",
  "insurance_claim": true
}

Response: 201 Created
{
  "success": true,
  "booking": {
    "booking_id": "HHB456",
    "booking_number": "HOME000456",
    "service_type": "nursing",
    "provider": "CareNow Healthcare",
    "start_date": "2026-02-08",
    "end_date": "2026-02-14",
    "total_visits": 14,
    "total_amount": 21000,
    "insurance_covered": 18000,
    "patient_copay": 3000,
    "status": "confirmed",
    "care_professional": {
      "name": "Nurse Priya Sharma",
      "qualification": "BSc Nursing",
      "experience": "7 years",
      "phone": "+91-9876543210"
    }
  }
}
```

### 7. WELLNESS & FITNESS PLANS API

#### Get Wellness Plans
```http
GET /v2/{tenant-id}/wellness/plans?category=fitness&age_group=30-40
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "plans": [
    {
      "plan_id": "WP001",
      "name": "Corporate Wellness Pro",
      "category": "fitness",
      "duration_months": 6,
      "price": 15000,
      "currency": "INR",
      "features": [
        "Personalized workout plans",
        "Diet consultation",
        "Weekly health coaching",
        "Fitness tracker integration",
        "Monthly health assessments"
      ],
      "target_audience": "Working professionals 30-45",
      "expected_outcomes": [
        "Weight management",
        "Improved fitness levels",
        "Better sleep quality",
        "Stress reduction"
      ]
    }
  ]
}
```

#### Enroll in Wellness Plan
```http
POST /v2/{tenant-id}/wellness/enrollments
Authorization: Bearer {token}
Content-Type: application/json

{
  "user_id": "USR12345",
  "plan_id": "WP001",
  "start_date": "2026-02-10",
  "payment_method": "corporate",  // individual | corporate | insurance
  "corporate_id": "CORP001",
  "health_goals": [
    "weight_loss",
    "fitness_improvement",
    "stress_management"
  ],
  "current_health_metrics": {
    "weight": 78,
    "height": 175,
    "bmi": 25.5,
    "activity_level": "moderate"
  }
}

Response: 201 Created
{
  "success": true,
  "enrollment": {
    "enrollment_id": "ENROLL789",
    "user_id": "USR12345",
    "plan_name": "Corporate Wellness Pro",
    "start_date": "2026-02-10",
    "end_date": "2026-08-10",
    "status": "active",
    "assigned_coach": {
      "name": "Coach Anita Desai",
      "specialization": "Fitness & Nutrition",
      "phone": "+91-9876543210"
    },
    "next_milestone": {
      "date": "2026-03-10",
      "type": "health_assessment",
      "description": "First month health review"
    }
  }
}
```

### 8. HEALTH RISK ASSESSMENT (HRA) API

#### Create HRA Assessment
```http
POST /v2/{tenant-id}/hra/assessments
Authorization: Bearer {token}
Content-Type: application/json

{
  "user_id": "USR12345",
  "assessment_type": "comprehensive",  // basic | comprehensive | diabetes | cardiac
  "responses": {
    "age": 35,
    "gender": "male",
    "height": 175,
    "weight": 78,
    "smoking": false,
    "alcohol": "social",
    "exercise_frequency": "3_times_week",
    "family_history": {
      "diabetes": true,
      "heart_disease": false,
      "hypertension": true
    },
    "current_medications": ["Metformin"],
    "chronic_conditions": ["Pre-diabetes"],
    "stress_level": "moderate",
    "sleep_hours": 7,
    "diet_type": "vegetarian"
  }
}

Response: 201 Created
{
  "success": true,
  "assessment": {
    "assessment_id": "HRA456",
    "user_id": "USR12345",
    "assessment_date": "2026-02-06",
    "status": "completed",
    "risk_score": 65,
    "risk_category": "moderate",
    "risk_factors": [
      {
        "factor": "Pre-diabetes",
        "severity": "high",
        "recommendation": "Regular blood sugar monitoring recommended"
      },
      {
        "factor": "Family history of diabetes",
        "severity": "medium",
        "recommendation": "Annual HbA1c testing"
      },
      {
        "factor": "BMI 25.5",
        "severity": "low",
        "recommendation": "Maintain healthy weight with diet and exercise"
      }
    ],
    "recommendations": [
      "Increase physical activity to 5 times per week",
      "Consultation with endocrinologist recommended",
      "Diet modification for diabetes prevention",
      "Stress management techniques"
    ],
    "next_assessment_due": "2026-08-06",
    "coach_assigned": true,
    "follow_up_required": true
  }
}
```

#### Get HRA Report
```http
GET /v2/{tenant-id}/hra/assessments/{assessment_id}/report
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "report": {
    "assessment_id": "HRA456",
    "report_url": "https://reports.mediqzy.com/hra/HRA456.pdf",
    "summary": {
      "overall_health_score": 75,
      "risk_level": "moderate",
      "areas_of_concern": ["Diabetes risk", "BMI"],
      "strengths": ["Non-smoker", "Regular sleep"]
    },
    "detailed_analysis": {...},
    "action_plan": {...}
  }
}
```

### 9. ACTIVITY TRACKER API

#### Sync Activity Data
```http
POST /v2/{tenant-id}/activity/sync
Authorization: Bearer {token}
Content-Type: application/json

{
  "user_id": "USR12345",
  "source": "fitbit",  // fitbit | apple_health | google_fit | samsung_health
  "sync_date": "2026-02-06",
  "data": {
    "steps": 8542,
    "distance_km": 6.2,
    "calories_burned": 420,
    "active_minutes": 45,
    "heart_rate_avg": 72,
    "heart_rate_max": 145,
    "sleep_hours": 7.5,
    "sleep_quality": "good",
    "workouts": [
      {
        "type": "running",
        "duration_minutes": 30,
        "calories": 280,
        "distance_km": 4.5,
        "avg_heart_rate": 135
      }
    ]
  }
}

Response: 200 OK
{
  "success": true,
  "sync_status": "completed",
  "records_synced": 8,
  "achievements": [
    {
      "type": "step_goal",
      "description": "Daily step goal achieved",
      "badge": "8000_steps"
    }
  ],
  "insights": [
    "Great job! You exceeded your daily step goal by 542 steps",
    "Your sleep quality is improving - 7.5 hours is ideal"
  ]
}
```

#### Get Activity Dashboard
```http
GET /v2/{tenant-id}/activity/dashboard?user_id=USR12345&period=week
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "dashboard": {
    "period": "2026-01-31 to 2026-02-06",
    "summary": {
      "total_steps": 52341,
      "avg_steps_per_day": 7477,
      "goal_achievement_rate": 0.86,
      "total_calories": 2940,
      "total_active_minutes": 315,
      "avg_heart_rate": 74,
      "avg_sleep_hours": 7.2
    },
    "daily_breakdown": [...],
    "trends": {
      "steps": "increasing",
      "calories": "stable",
      "sleep": "improving"
    },
    "recommendations": [
      "Try to reach 10,000 steps on more days",
      "Maintain your excellent sleep pattern"
    ]
  }
}
```

### 10. HEALTH MONITORING API

#### Record Vitals
```http
POST /v2/{tenant-id}/health-monitoring/vitals
Authorization: Bearer {token}
Content-Type: application/json

{
  "user_id": "USR12345",
  "recorded_at": "2026-02-06T08:00:00Z",
  "vitals": {
    "blood_pressure": {
      "systolic": 120,
      "diastolic": 80,
      "unit": "mmHg"
    },
    "heart_rate": 72,
    "temperature": 98.6,
    "temperature_unit": "F",
    "oxygen_saturation": 98,
    "blood_glucose": 110,
    "glucose_unit": "mg/dL",
    "glucose_context": "fasting"
  },
  "notes": "Feeling normal",
  "device_source": "omron_bp_monitor"
}

Response: 201 Created
{
  "success": true,
  "vital_record": {
    "record_id": "VIT789",
    "user_id": "USR12345",
    "recorded_at": "2026-02-06T08:00:00Z",
    "vitals": {...},
    "analysis": {
      "blood_pressure": "normal",
      "heart_rate": "normal",
      "blood_glucose": "normal_fasting",
      "overall_status": "healthy"
    },
    "alerts": [],
    "recommendations": [
      "All vitals within normal range",
      "Continue monitoring daily"
    ]
  }
}
```

#### Get Vital Trends
```http
GET /v2/{tenant-id}/health-monitoring/vitals/trends?user_id=USR12345&vital_type=blood_pressure&period=month
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "trends": {
    "vital_type": "blood_pressure",
    "period": "2026-01-06 to 2026-02-06",
    "data_points": 30,
    "average": {
      "systolic": 122,
      "diastolic": 81
    },
    "range": {
      "systolic": {"min": 115, "max": 135},
      "diastolic": {"min": 75, "max": 88}
    },
    "trend": "stable",
    "chart_data": [...],
    "alerts": [
      {
        "date": "2026-01-25",
        "type": "elevated",
        "reading": "135/88",
        "note": "Slightly elevated, monitor closely"
      }
    ]
  }
}
```

### 11. DIET & NUTRITION PLANS API

#### Get Diet Plans
```http
GET /v2/{tenant-id}/nutrition/diet-plans?goal=weight_loss&diet_type=vegetarian
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "diet_plans": [
    {
      "plan_id": "DIET001",
      "name": "Vegetarian Weight Loss Plan",
      "goal": "weight_loss",
      "diet_type": "vegetarian",
      "duration_weeks": 12,
      "calorie_target": 1500,
      "macros": {
        "protein_percent": 30,
        "carbs_percent": 40,
        "fats_percent": 30
      },
      "meal_frequency": 5,
      "features": [
        "Customized meal plans",
        "Weekly grocery lists",
        "Recipe suggestions",
        "Nutritionist support"
      ],
      "expected_weight_loss_kg": 6
    }
  ]
}
```

#### Assign Diet Plan
```http
POST /v2/{tenant-id}/nutrition/assignments
Authorization: Bearer {token}
Content-Type: application/json

{
  "user_id": "USR12345",
  "plan_id": "DIET001",
  "start_date": "2026-02-10",
  "customizations": {
    "calorie_adjustment": -100,
    "food_allergies": ["nuts"],
    "food_preferences": ["paneer", "tofu"],
    "avoid_foods": ["brinjal", "mushrooms"]
  },
  "target_weight_kg": 72,
  "current_weight_kg": 78
}

Response: 201 Created
{
  "success": true,
  "assignment": {
    "assignment_id": "DA789",
    "user_id": "USR12345",
    "plan_name": "Vegetarian Weight Loss Plan",
    "start_date": "2026-02-10",
    "end_date": "2026-05-03",
    "daily_calorie_target": 1400,
    "assigned_nutritionist": {
      "name": "Nutritionist Kavita Patel",
      "qualification": "MSc Nutrition",
      "phone": "+91-9876543210"
    },
    "weekly_meal_plan": {
      "week_1_url": "https://meal-plans.mediqzy.com/DA789/week1.pdf"
    },
    "next_review_date": "2026-02-24"
  }
}
```

#### Log Food Intake
```http
POST /v2/{tenant-id}/nutrition/food-log
Authorization: Bearer {token}
Content-Type: application/json

{
  "user_id": "USR12345",
  "log_date": "2026-02-06",
  "meal_type": "breakfast",  // breakfast | lunch | dinner | snack
  "foods": [
    {
      "food_name": "Oatmeal",
      "quantity": 1,
      "unit": "bowl",
      "calories": 150,
      "protein_g": 5,
      "carbs_g": 27,
      "fats_g": 3
    },
    {
      "food_name": "Banana",
      "quantity": 1,
      "unit": "medium",
      "calories": 105,
      "protein_g": 1,
      "carbs_g": 27,
      "fats_g": 0.4
    }
  ]
}

Response: 201 Created
{
  "success": true,
  "food_log": {
    "log_id": "FL456",
    "log_date": "2026-02-06",
    "meal_type": "breakfast",
    "total_calories": 255,
    "macros": {
      "protein_g": 6,
      "carbs_g": 54,
      "fats_g": 3.4
    },
    "analysis": {
      "calories_vs_target": "within_range",
      "macro_balance": "good",
      "recommendations": [
        "Add more protein to breakfast",
        "Good fiber intake from oatmeal"
      ]
    }
  }
}
```

---

## 🏢 STAKEHOLDER-SPECIFIC APIs

### CLINIC APIs

#### Clinic Dashboard
```http
GET /v2/clinic-apollo/dashboard
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "dashboard": {
    "today": {
      "total_appointments": 45,
      "completed": 30,
      "ongoing": 5,
      "upcoming": 10,
      "revenue": 22500
    },
    "doctors_status": [
      {
        "doctor_id": "DOC001",
        "name": "Dr. Sarah Johnson",
        "status": "busy",
        "current_patient": "PAT12345",
        "next_appointment": "15:00"
      }
    ],
    "quick_stats": {
      "patients_this_month": 456,
      "video_consultations": 234,
      "prescriptions_issued": 389
    }
  }
}
```

### HOSPITAL APIs

#### Hospital Department Management
```http
GET /v2/hospital-fortis/departments
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "departments": [
    {
      "department_id": "DEPT001",
      "name": "Cardiology",
      "doctors_count": 12,
      "beds_total": 50,
      "beds_available": 8,
      "today_appointments": 30,
      "emergency_cases": 3
    }
  ]
}
```

#### Bed Management
```http
GET /v2/hospital-fortis/beds/availability?department=cardiology
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "availability": {
    "department": "Cardiology",
    "total_beds": 50,
    "occupied": 42,
    "available": 8,
    "beds": [
      {
        "bed_id": "BED-C-101",
        "type": "ICU",
        "status": "available",
        "location": "Floor 2, Wing A"
      }
    ]
  }
}
```

### CORPORATE APIs

#### Employee Wellness Dashboard
```http
GET /v2/corporate-tcs/wellness/dashboard
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "corporate_dashboard": {
    "total_employees": 5000,
    "enrolled_employees": 4250,
    "enrollment_rate": 0.85,
    "active_wellness_plans": 3800,
    "total_consultations": 1234,
    "avg_health_score": 72,
    "top_health_concerns": [
      {"concern": "Stress", "percentage": 45},
      {"concern": "Sedentary lifestyle", "percentage": 38},
      {"concern": "Poor nutrition", "percentage": 32}
    ],
    "utilization_stats": {
      "video_consultations": 567,
      "lab_tests": 234,
      "wellness_programs": 890
    }
  }
}
```

#### Bulk Employee Enrollment
```http
POST /v2/corporate-tcs/employees/bulk-enroll
Authorization: Bearer {token}
Content-Type: application/json

{
  "corporate_id": "CORP-TCS",
  "wellness_plan_id": "WP001",
  "employees": [
    {
      "employee_id": "EMP001",
      "email": "john@tcs.com",
      "name": "John Doe",
      "age": 35,
      "department": "IT"
    }
  ]
}

Response: 201 Created
{
  "success": true,
  "enrollment_summary": {
    "total_requested": 100,
    "enrolled": 98,
    "failed": 2,
    "failed_records": [...]
  }
}
```

### INSURANCE COMPANY APIs

#### Policy Management
```http
GET /v2/insurance-hdfc/policies/{policy_number}
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "policy": {
    "policy_number": "POL123456",
    "policy_holder": "John Doe",
    "policy_type": "Family Floater",
    "sum_insured": 500000,
    "coverage_details": {
      "hospitalization": true,
      "day_care": true,
      "pre_existing_covered": true,
      "maternity": true,
      "dental": false
    },
    "premium": 15000,
    "premium_frequency": "annual",
    "status": "active",
    "members": [
      {
        "member_id": "MEM001",
        "name": "John Doe",
        "relation": "self",
        "age": 35,
        "sum_insured": 500000
      }
    ],
    "wellness_benefits": {
      "annual_checkup": true,
      "teleconsultation": "unlimited",
      "pharmacy_discount": "20%"
    }
  }
}
```

#### Claims Processing
```http
POST /v2/insurance-hdfc/claims
Authorization: Bearer {token}
Content-Type: application/json

{
  "policy_number": "POL123456",
  "member_id": "MEM001",
  "claim_type": "hospitalization",  // hospitalization | pharmacy | lab
  "claim_amount": 25000,
  "treatment_details": {
    "hospital_id": "HOSP001",
    "admission_date": "2026-02-01",
    "discharge_date": "2026-02-03",
    "diagnosis": "Appendicitis",
    "treatment": "Appendectomy"
  },
  "documents": [
    {
      "type": "hospital_bill",
      "url": "https://uploads.mediqzy.com/claim-docs/bill123.pdf"
    },
    {
      "type": "discharge_summary",
      "url": "https://uploads.mediqzy.com/claim-docs/discharge123.pdf"
    }
  ]
}

Response: 201 Created
{
  "success": true,
  "claim": {
    "claim_id": "CLM789",
    "claim_number": "CLAIM000789",
    "policy_number": "POL123456",
    "claim_amount": 25000,
    "status": "under_review",
    "submitted_date": "2026-02-06",
    "estimated_settlement_date": "2026-02-13",
    "assigned_tpa": "TPA-MEDI"
  }
}
```

### TPA (Third Party Administrator) APIs

#### Claims Queue
```http
GET /v2/tpa-medi/claims/queue?status=pending&priority=high
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "claims_queue": [
    {
      "claim_id": "CLM789",
      "claim_number": "CLAIM000789",
      "policy_number": "POL123456",
      "claim_amount": 25000,
      "submitted_date": "2026-02-06",
      "priority": "high",
      "status": "pending_review",
      "age_days": 1,
      "assigned_to": "Reviewer-123"
    }
  ],
  "queue_stats": {
    "total_pending": 45,
    "high_priority": 12,
    "avg_processing_days": 5
  }
}
```

#### Approve/Reject Claim
```http
PUT /v2/tpa-medi/claims/{claim_id}/decision
Authorization: Bearer {token}
Content-Type: application/json

{
  "decision": "approved",  // approved | rejected | more_info_required
  "approved_amount": 23000,
  "deduction_reason": "Room rent limit exceeded",
  "deduction_amount": 2000,
  "remarks": "Claim approved with room rent adjustment",
  "settlement_method": "bank_transfer",
  "bank_account": "XXXXXXX1234"
}

Response: 200 OK
{
  "success": true,
  "claim_decision": {
    "claim_id": "CLM789",
    "decision": "approved",
    "approved_amount": 23000,
    "settlement_date": "2026-02-10",
    "settlement_reference": "SETTLE123456"
  }
}
```

### BROKER APIs

#### Client Portfolio
```http
GET /v2/broker-max/clients
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "clients": [
    {
      "client_id": "CLIENT001",
      "name": "ABC Corporation",
      "client_type": "corporate",
      "policies_count": 5,
      "total_premium": 500000,
      "employees_covered": 500,
      "renewal_date": "2026-06-30",
      "status": "active"
    }
  ],
  "portfolio_summary": {
    "total_clients": 25,
    "total_premium": 5000000,
    "lives_covered": 2500,
    "renewals_this_month": 3
  }
}
```

---

## 🔌 INTEGRATION PATTERNS

### 1. Webhook Integration

#### Register Webhook
```http
POST /v2/{tenant-id}/webhooks
Authorization: Bearer {token}
Content-Type: application/json

{
  "url": "https://your-app.com/webhooks/mediqzy",
  "events": [
    "appointment.created",
    "appointment.cancelled",
    "consultation.completed",
    "prescription.created",
    "lab_report.available",
    "order.delivered"
  ],
  "secret": "your_webhook_secret",
  "active": true
}

Response: 201 Created
{
  "success": true,
  "webhook": {
    "webhook_id": "WH123",
    "url": "https://your-app.com/webhooks/mediqzy",
    "events": [...],
    "status": "active",
    "created_at": "2026-02-06T14:00:00Z"
  }
}
```

#### Webhook Payload Example
```json
{
  "event": "appointment.created",
  "timestamp": "2026-02-06T14:30:00Z",
  "tenant_id": "clinic-apollo",
  "data": {
    "appointment_id": 12345,
    "patient_id": "PAT12345",
    "doctor_id": "DOC67890",
    "appointment_date": "2026-02-10",
    "consultation_type": "online",
    "meeting_details": {
      "room_id": "apt-12345-a1b2c3d4"
    }
  },
  "signature": "sha256_hmac_signature_here"
}
```

### 2. Real-time Events (WebSocket)

#### Connect to WebSocket
```javascript
const ws = new WebSocket('wss://ws.mediqzy.com/v2');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  token: 'Bearer eyJhbGciOi...',
  tenant_id: 'clinic-apollo'
}));

// Subscribe to events
ws.send(JSON.stringify({
  type: 'subscribe',
  channels: ['appointments', 'consultations', 'notifications']
}));

// Receive events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

#### Event Types
```json
{
  "type": "appointment.status_update",
  "appointment_id": 12345,
  "old_status": "confirmed",
  "new_status": "in_progress",
  "timestamp": "2026-02-06T14:00:00Z"
}

{
  "type": "chat.new_message",
  "conversation_id": "CONV789",
  "sender": "DOC67890",
  "message": "Please take the prescribed medication",
  "timestamp": "2026-02-06T14:05:00Z"
}

{
  "type": "notification",
  "notification_id": "NOTIF456",
  "title": "Lab Report Ready",
  "message": "Your blood test report is now available",
  "action_url": "/lab-reports/REPORT456"
}
```

### 3. Batch Operations

#### Batch Upload
```http
POST /v2/{tenant-id}/batch/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: employees.csv
operation: enroll_employees
plan_id: WP001

Response: 202 Accepted
{
  "success": true,
  "batch_job": {
    "job_id": "BATCH456",
    "status": "processing",
    "total_records": 1000,
    "status_url": "/v2/{tenant-id}/batch/BATCH456/status"
  }
}
```

#### Check Batch Status
```http
GET /v2/{tenant-id}/batch/{job_id}/status
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "batch_job": {
    "job_id": "BATCH456",
    "status": "completed",
    "total_records": 1000,
    "processed": 1000,
    "successful": 985,
    "failed": 15,
    "completion_percentage": 100,
    "started_at": "2026-02-06T14:00:00Z",
    "completed_at": "2026-02-06T14:15:00Z",
    "results_url": "/v2/{tenant-id}/batch/BATCH456/results"
  }
}
```

---

## 🔒 SECURITY & COMPLIANCE

### HIPAA Compliance
- ✅ End-to-end encryption for PHI (Protected Health Information)
- ✅ Audit logs for all data access
- ✅ Data encryption at rest and in transit
- ✅ Role-based access control
- ✅ Automatic session timeout
- ✅ Multi-factor authentication support

### Data Privacy
- ✅ GDPR compliant
- ✅ Data anonymization options
- ✅ Right to be forgotten (data deletion)
- ✅ Consent management
- ✅ Data portability

### API Security Headers
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

---

## ⏱️ RATE LIMITING & QUOTAS

### Rate Limits by Tier

| Tier | Requests/Hour | Requests/Day | Concurrent Requests |
|------|---------------|--------------|---------------------|
| **Free** | 100 | 1,000 | 5 |
| **Basic** | 1,000 | 10,000 | 20 |
| **Pro** | 10,000 | 100,000 | 50 |
| **Enterprise** | Unlimited | Unlimited | 200 |

### Rate Limit Headers
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 985
X-RateLimit-Reset: 1675689600
```

### Rate Limit Response
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600

{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Please retry after 1 hour",
    "retry_after": 3600
  }
}
```

---

## 🔔 WEBHOOKS & REAL-TIME EVENTS

### Supported Events

| Event | Description |
|-------|-------------|
| `appointment.created` | New appointment booked |
| `appointment.cancelled` | Appointment cancelled |
| `appointment.rescheduled` | Appointment time changed |
| `consultation.started` | Video/chat consultation started |
| `consultation.completed` | Consultation ended |
| `prescription.created` | New prescription issued |
| `lab_report.available` | Lab test results ready |
| `order.created` | Pharmacy order placed |
| `order.shipped` | Order dispatched |
| `order.delivered` | Order delivered |
| `claim.submitted` | Insurance claim submitted |
| `claim.approved` | Claim approved |
| `claim.rejected` | Claim rejected |
| `user.enrolled` | User enrolled in wellness plan |
| `vital.abnormal` | Abnormal vital reading detected |

---

## 🔄 API VERSIONING STRATEGY

### Versioning Approach
- URL-based versioning: `/v2/...`
- Major version changes break compatibility
- Minor version changes are backward compatible
- Deprecation notice: 6 months minimum

### Current Versions
- **v2** (Current) - Released Feb 2026
- **v1** (Deprecated) - Supported until Aug 2026

### Version Migration
```http
GET /v2/migration/guide?from=v1&to=v2
Authorization: Bearer {token}

Response: 200 OK
{
  "migration_guide": {
    "breaking_changes": [...],
    "new_endpoints": [...],
    "deprecated_endpoints": [...],
    "migration_steps": [...]
  }
}
```

---

## 📊 RESPONSE FORMATS

### Success Response
```json
{
  "success": true,
  "data": {...},
  "meta": {
    "timestamp": "2026-02-06T14:30:00Z",
    "request_id": "req_abc123"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "invalid_request",
    "message": "Patient ID is required",
    "details": {
      "field": "patient_id",
      "error": "required"
    }
  },
  "meta": {
    "timestamp": "2026-02-06T14:30:00Z",
    "request_id": "req_abc123"
  }
}
```

### Pagination
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 1000,
    "page": 1,
    "per_page": 20,
    "total_pages": 50,
    "next_page": "/v2/{tenant-id}/appointments?page=2",
    "prev_page": null
  }
}
```

---

## 📚 SDK & LIBRARIES

### Official SDKs
- **JavaScript/TypeScript**: `npm install @mediqzy/api-client`
- **Python**: `pip install mediqzy-sdk`
- **Java**: Maven/Gradle dependency
- **Swift**: CocoaPods/SPM
- **Kotlin**: Gradle dependency

### Example Usage (JavaScript)
```javascript
import { MediqzyClient } from '@mediqzy/api-client';

const client = new MediqzyClient({
  apiKey: 'your_api_key',
  tenantId: 'clinic-apollo',
  environment: 'production'
});

// Book appointment
const appointment = await client.appointments.create({
  patient_id: 'PAT12345',
  doctor_id: 'DOC67890',
  appointment_date: '2026-02-10',
  consultation_type: 'online'
});

// Join video consultation
const videoSession = await client.video.join({
  room_id: appointment.meeting_details.room_id
});
```

---

## 🚀 GETTING STARTED

### 1. Register Your Application
```http
POST /v2/register
Content-Type: application/json

{
  "organization_name": "Apollo Clinics",
  "organization_type": "clinic",
  "contact_email": "tech@apollo.com",
  "contact_phone": "+91-9876543210"
}

Response: 201 Created
{
  "success": true,
  "credentials": {
    "tenant_id": "clinic-apollo",
    "client_id": "apollo_prod_12345",
    "client_secret": "secret_abc123xyz",
    "api_key": "mk_live_abc123xyz"
  },
  "sandbox_credentials": {
    "tenant_id": "clinic-apollo-sandbox",
    "api_key": "mk_test_abc123xyz"
  }
}
```

### 2. Test in Sandbox
```bash
curl -X GET https://api-sandbox.mediqzy.com/v2/clinic-apollo/test \
  -H "X-API-Key: mk_test_abc123xyz"
```

### 3. Go Live
```bash
curl -X GET https://api.mediqzy.com/v2/clinic-apollo/appointments \
  -H "X-API-Key: mk_live_abc123xyz"
```

---

## 📞 SUPPORT & RESOURCES

### Documentation
- **API Reference**: https://docs.mediqzy.com/api
- **Integration Guides**: https://docs.mediqzy.com/guides
- **SDKs**: https://docs.mediqzy.com/sdks
- **Changelog**: https://docs.mediqzy.com/changelog

### Support Channels
- **Email**: api-support@mediqzy.com
- **Developer Portal**: https://developers.mediqzy.com
- **Status Page**: https://status.mediqzy.com
- **Community Forum**: https://community.mediqzy.com

### SLA & Uptime
- **Uptime Guarantee**: 99.9%
- **Support Response**: 24 hours (Basic), 4 hours (Pro), 1 hour (Enterprise)
- **Maintenance Windows**: Announced 7 days in advance

---

## ✅ IMPLEMENTATION CHECKLIST

### For Mobile App Developers
- [ ] Obtain API credentials (client_id, client_secret)
- [ ] Test authentication in sandbox
- [ ] Implement core módules (appointments, video, chat)
- [ ] Set up webhook endpoints
- [ ] Implement error handling
- [ ] Test rate limiting scenarios
- [ ] Configure push notifications
- [ ] Implement offline mode/caching
- [ ] Security audit (API key storage)
- [ ] Load testing
- [ ] Go live with production credentials

---

**Platform**: Mediqzy  
**Documentation Version**: 2.0  
**Last Updated**: February 6, 2026  
**Status**: Production Ready ✅  

---

**Ready to integrate? Start with our sandbox environment today!** 🚀
