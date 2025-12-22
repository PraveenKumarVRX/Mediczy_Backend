# Device API Testing with Postman

## Base URL
```
http://localhost:8000/api/devices
```

## Authentication
Most endpoints require admin authentication. Include in headers:
```
Authorization: Bearer <admin_token>
```

---

## 1. Register New Device

**POST** `/api/devices/register`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <admin_token>"
}
```

**Body:**
```json
{
  "device_id": "MDZ-TAB-001",
  "device_name": "Mediczy Tab Pro 10",
  "sim_number": "9876543210",
  "phone_number": "+919876543210",
  "imei": "123456789012345",
  "model": "TabPro10",
  "subscription_plan": "premium",
  "device_cost": 25000,
  "monthly_software_fee": 5500,
  "amc_annual_fee": 6000
}
```

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Device registered successfully",
  "device": {
    "id": 1,
    "device_id": "MDZ-TAB-001",
    "device_name": "Mediczy Tab Pro 10",
    "phone_number": "+919876543210",
    "status": "inactive"
  }
}
```

---

## 2. Assign Device to Tenant

**POST** `/api/devices/:id/assign`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <admin_token>"
}
```

**Body:**
```json
{
  "tenant_id": 1,
  "assigned_to_type": "hospital",
  "assigned_to_id": 5,
  "deployment_site": "Apollo Hospital Chennai - OPD",
  "subscription_plan": "premium",
  "subscription_months": 12
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Device assigned successfully",
  "device": {
    "id": 1,
    "device_id": "MDZ-TAB-001",
    "assigned_to": {
      "type": "hospital",
      "id": 5,
      "tenant_id": 1
    },
    "subscription_active_until": "2026-12-09T10:30:00.000Z",
    "amc_active_until": "2026-12-09T10:30:00.000Z"
  }
}
```

---

## 3. List All Devices

**GET** `/api/devices`

**Query Parameters:**
- `status` (optional): active, inactive, maintenance, faulty, returned
- `tenant_id` (optional): Filter by tenant
- `assigned_to_type` (optional): hospital, clinic, lab, pharmacy, doctor, ambulance, homecare
- `subscription_plan` (optional): basic, standard, premium, enterprise

**Headers:**
```json
{
  "Authorization": "Bearer <admin_token>"
}
```

**Example Requests:**
```
GET /api/devices
GET /api/devices?status=active
GET /api/devices?tenant_id=1
GET /api/devices?subscription_plan=premium
GET /api/devices?status=active&assigned_to_type=hospital
```

**Expected Response (200):**
```json
{
  "success": true,
  "count": 5,
  "devices": [
    {
      "id": 1,
      "device_id": "MDZ-TAB-001",
      "device_name": "Mediczy Tab Pro 10",
      "phone_number": "+919876543210",
      "status": "active",
      "assigned_to": {
        "type": "hospital",
        "id": 5,
        "tenant_id": 1
      },
      "subscription_plan": "premium",
      "subscription_active": true,
      "amc_active": true,
      "last_online": "2025-12-09T10:25:00.000Z",
      "battery_level": 85
    }
  ]
}
```

---

## 4. Get Devices for Specific Tenant

**GET** `/api/devices/tenant/:tenant_id`

**Headers:**
```json
{
  "Authorization": "Bearer <tenant_token>"
}
```

**Example:**
```
GET /api/devices/tenant/1
```

**Expected Response (200):**
```json
{
  "success": true,
  "count": 3,
  "devices": [
    {
      "id": 1,
      "device_id": "MDZ-TAB-001",
      "device_name": "Mediczy Tab Pro 10",
      "phone_number": "+919876543210",
      "status": "active",
      "deployment_site": "Apollo Hospital Chennai - OPD",
      "subscription_plan": "premium",
      "subscription_end": "2026-12-09T10:30:00.000Z",
      "amc_end_date": "2026-12-09T10:30:00.000Z",
      "last_online": "2025-12-09T10:25:00.000Z",
      "features": {
        "voice_calling": true,
        "video_calling": true,
        "patient_management": true,
        "appointment_booking": true,
        "prescriptions": true,
        "billing": true,
        "inventory": true,
        "reports": true,
        "offline_mode": true
      }
    }
  ]
}
```

---

## 5. Get Device Details

**GET** `/api/devices/:id`

**Headers:**
```json
{
  "Authorization": "Bearer <admin_token>"
}
```

**Example:**
```
GET /api/devices/1
```

**Expected Response (200):**
```json
{
  "success": true,
  "device": {
    "id": 1,
    "device_id": "MDZ-TAB-001",
    "device_name": "Mediczy Tab Pro 10",
    "model": "TabPro10",
    "phone_number": "+919876543210",
    "sim_number": "9876543210",
    "imei": "123456789012345",
    "status": "active",
    "assigned_to": {
      "type": "hospital",
      "id": 5,
      "tenant_id": 1,
      "deployment_site": "Apollo Hospital Chennai - OPD"
    },
    "subscription": {
      "plan": "premium",
      "start": "2025-12-09T10:30:00.000Z",
      "end": "2026-12-09T10:30:00.000Z",
      "active": true
    },
    "amc": {
      "active": true,
      "start": "2025-12-09T10:30:00.000Z",
      "end": "2026-12-09T10:30:00.000Z",
      "days_until_expiry": 365
    },
    "pricing": {
      "device_cost": "25000.00",
      "monthly_software": "5500.00",
      "amc_annual": "6000.00",
      "monthly_revenue": 6000
    },
    "health": {
      "last_online": "2025-12-09T10:25:00.000Z",
      "battery_level": 85,
      "os_version": "Android 13",
      "app_version": "2.1.0"
    },
    "usage": {
      "total_calls": 245,
      "total_appointments": 1523,
      "total_prescriptions": 1420
    },
    "features": {
      "voice_calling": true,
      "video_calling": true,
      "patient_management": true,
      "appointment_booking": true,
      "prescriptions": true,
      "billing": true,
      "inventory": true,
      "reports": true,
      "offline_mode": true
    },
    "maintenance": {
      "last": "2025-11-01T00:00:00.000Z",
      "next": "2026-02-01T00:00:00.000Z",
      "needs_maintenance": false,
      "warranty_expiry": "2026-12-09T10:30:00.000Z"
    }
  }
}
```

---

## 6. Device Heartbeat (from device)

**PUT** `/api/devices/:id/heartbeat`

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "battery_level": 75,
  "location": {
    "latitude": 13.0827,
    "longitude": 80.2707,
    "address": "Apollo Hospital Chennai"
  },
  "app_version": "2.1.0",
  "os_version": "Android 13"
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Heartbeat recorded"
}
```

---

## 7. Renew AMC

**POST** `/api/devices/:id/renew-amc`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <admin_token>"
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "AMC renewed successfully",
  "amc_valid_until": "2027-12-09T10:30:00.000Z"
}
```

---

## 8. Get Revenue Statistics

**GET** `/api/devices/stats/revenue`

**Headers:**
```json
{
  "Authorization": "Bearer <admin_token>"
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "stats": {
    "total_devices": 25,
    "active_amcs": 22,
    "monthly_recurring_revenue": 98750,
    "annual_recurring_revenue": 1185000,
    "average_revenue_per_device": 3950
  }
}
```

---

## Test Sequence

### Step 1: Register 5 Devices
```bash
# Basic plan device
POST /api/devices/register
{
  "device_id": "MDZ-TAB-001",
  "device_name": "Mediczy Tab 10 Basic",
  "model": "Tab10",
  "subscription_plan": "basic",
  "device_cost": 15000,
  "monthly_software_fee": 1500,
  "amc_annual_fee": 3000
}

# Standard plan device
POST /api/devices/register
{
  "device_id": "MDZ-TAB-002",
  "device_name": "Mediczy Tab 10 Standard",
  "model": "Tab10",
  "subscription_plan": "standard",
  "device_cost": 18000,
  "monthly_software_fee": 3500,
  "amc_annual_fee": 4000
}

# Premium plan device
POST /api/devices/register
{
  "device_id": "MDZ-TAB-003",
  "device_name": "Mediczy Tab Pro 10",
  "model": "TabPro",
  "subscription_plan": "premium",
  "device_cost": 25000,
  "monthly_software_fee": 5500,
  "amc_annual_fee": 6000
}

# Enterprise plan device
POST /api/devices/register
{
  "device_id": "MDZ-TAB-004",
  "device_name": "Mediczy Tab Pro 12 Enterprise",
  "model": "TabPro12",
  "subscription_plan": "enterprise",
  "device_cost": 35000,
  "monthly_software_fee": 8000,
  "amc_annual_fee": 6000
}
```

### Step 2: Assign Devices to Different Organization Types
```bash
# Assign to hospital
POST /api/devices/1/assign
{
  "tenant_id": 1,
  "assigned_to_type": "hospital",
  "assigned_to_id": 1,
  "deployment_site": "Apollo Hospital Chennai - OPD",
  "subscription_months": 12
}

# Assign to clinic
POST /api/devices/2/assign
{
  "tenant_id": 2,
  "assigned_to_type": "clinic",
  "assigned_to_id": 1,
  "deployment_site": "City Clinic Mumbai",
  "subscription_months": 12
}

# Assign to lab
POST /api/devices/3/assign
{
  "tenant_id": 3,
  "assigned_to_type": "lab",
  "assigned_to_id": 1,
  "deployment_site": "PathLabs Delhi",
  "subscription_months": 12
}

# Assign to pharmacy
POST /api/devices/4/assign
{
  "tenant_id": 4,
  "assigned_to_type": "pharmacy",
  "assigned_to_id": 1,
  "deployment_site": "MedPlus Bangalore",
  "subscription_months": 12
}
```

### Step 3: Simulate Device Heartbeats
```bash
# Every 5 minutes from devices
PUT /api/devices/1/heartbeat
{
  "battery_level": 85,
  "location": {"latitude": 13.0827, "longitude": 80.2707},
  "app_version": "2.1.0",
  "os_version": "Android 13"
}
```

### Step 4: Check Statistics
```bash
# Get all active devices
GET /api/devices?status=active

# Get revenue stats
GET /api/devices/stats/revenue

# Get specific tenant devices
GET /api/devices/tenant/1
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (missing fields) |
| 401 | Unauthorized (invalid token) |
| 404 | Device not found |
| 409 | Conflict (device already registered) |
| 500 | Server error |

---

## Monitoring Endpoints (Admin Only)

These are called automatically by cron jobs but can be tested manually:

```bash
# Check offline devices
GET /api/devices/monitoring/offline

# Check low battery
GET /api/devices/monitoring/low-battery

# Check expiring AMCs
GET /api/devices/monitoring/expiring-amcs

# Get health report
GET /api/devices/monitoring/health-report
```
