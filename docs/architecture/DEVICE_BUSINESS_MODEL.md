# Device Management Business Model

## Overview
Smart Android tablets (SIM-enabled) provided to healthcare providers with integrated software and AMC (Annual Maintenance Contract).

## Business Model Components

### 1. **Device (Hardware)**
- SIM-enabled Android tablets
- Calling capability (voice + video)
- Models: Tab10, Tab12, TabPro
- Pre-installed Mediczy software
- IMEI tracking for device security

### 2. **Software Subscription**
- Monthly recurring fee
- Feature access based on plan:
  - **Basic**: Patient management, appointments, prescriptions
  - **Standard**: + Billing, reports, inventory
  - **Premium**: + Analytics, AI assistant, telemedicine
  - **Enterprise**: + Custom integrations, priority support

### 3. **AMC (Annual Maintenance Contract)**
- Annual fee for device maintenance
- Includes:
  - Hardware repair/replacement
  - Software updates
  - Technical support (phone/email)
  - On-site support (if needed)
  - Battery replacement (if required)
  - Screen replacement (accidental damage)

## Revenue Streams

### One-Time
- **Device Cost**: ₹15,000 - ₹35,000 (depending on model)
- **Installation**: ₹5,000 (setup + training)

### Recurring (Monthly)
- **Software Subscription**: ₹1,500 - ₹8,000/month (plan-based)
- **AMC**: ₹3,000 - ₹6,000/year (₹250-500/month amortized)

### Total Monthly Revenue per Device
- Basic: ₹1,500 + ₹250 = **₹1,750/month**
- Standard: ₹3,500 + ₹400 = **₹3,900/month**
- Premium: ₹5,500 + ₹500 = **₹6,000/month**
- Enterprise: ₹8,000 + ₹500 = **₹8,500/month**

## Target Customers

### 1. **Clinics**
- Use Case: OPD management, appointments, prescriptions
- Devices: 1-3 tablets
- Plan: Basic/Standard
- Revenue: ₹1,750 - ₹11,700/month

### 2. **Hospitals**
- Use Case: Department-wise OPD, IPD, billing, pharmacy
- Devices: 10-50 tablets
- Plan: Premium/Enterprise
- Revenue: ₹60,000 - ₹4,25,000/month

### 3. **Labs**
- Use Case: Sample collection, test orders, results, billing
- Devices: 2-10 tablets
- Plan: Standard/Premium
- Revenue: ₹7,800 - ₹60,000/month

### 4. **Pharmacies**
- Use Case: POS, inventory, prescription validation
- Devices: 1-5 tablets
- Plan: Basic/Standard
- Revenue: ₹1,750 - ₹19,500/month

### 5. **Individual Doctors**
- Use Case: Personal practice management, video consultations
- Devices: 1-2 tablets
- Plan: Basic/Standard
- Revenue: ₹1,750 - ₹7,800/month

### 6. **Doctor Assistants**
- Use Case: Patient registration, appointment scheduling
- Devices: 1 tablet
- Plan: Basic
- Revenue: ₹1,750/month

## Device Features

### Hardware
- 10-12 inch touchscreen
- 4G LTE + WiFi connectivity
- Front + rear cameras (for video consultations)
- Fingerprint sensor (for authentication)
- 8+ hour battery life
- USB-C charging
- Stereo speakers (for calling)

### Software Modules
- **Patient Management**: Registration, records, history
- **Appointment Booking**: Scheduling, reminders, calendar
- **Prescriptions**: Digital prescription generation
- **Billing & Invoicing**: Generate bills, payment tracking
- **Inventory**: Stock management (pharmacy/lab)
- **Reports & Analytics**: Business insights, performance metrics
- **Telemedicine**: Video consultations, remote diagnosis
- **Voice/Video Calling**: Direct patient communication
- **Offline Mode**: Works without internet (syncs later)

## AMC Benefits

### Included Services
1. **Hardware Maintenance**
   - Screen replacement (1x per year)
   - Battery replacement (if health < 80%)
   - Charging port repair
   - Speaker/mic repair

2. **Software Support**
   - Automatic app updates
   - Bug fixes within 48 hours
   - Feature upgrades (included in plan)
   - Data backup & recovery

3. **Technical Support**
   - Phone support (9 AM - 9 PM)
   - Email support (24/7)
   - Remote troubleshooting
   - On-site visit (if unresolved remotely)

4. **Training**
   - Initial training (2 hours)
   - Quarterly refresher sessions
   - New feature training
   - Documentation & video tutorials

5. **Replacement Device**
   - Temporary device during repair
   - Permanent replacement (if unrepairable)
   - Same-day replacement (enterprise plan)

## Deployment Process

### Step 1: Device Provisioning
1. Admin registers device with IMEI, SIM, device_id
2. Device assigned to tenant (hospital/clinic/doctor)
3. Subscription plan selected (basic/standard/premium/enterprise)
4. AMC activated (1-year validity)

### Step 2: Configuration
1. Tenant-specific branding (logo, colors)
2. Feature enablement based on plan
3. User accounts created
4. Location & deployment site recorded

### Step 3: Delivery & Setup
1. Device delivered to site
2. Initial setup & configuration
3. Staff training (2 hours)
4. Go-live support (first week)

### Step 4: Monitoring
1. Device heartbeat every 5 minutes (battery, location, status)
2. Usage tracking (calls, appointments, prescriptions)
3. AMC expiry alerts (30 days before)
4. Maintenance schedule tracking

## Revenue Projections

### Scenario 1: Small Deployment (Year 1)
- 100 devices deployed
- Mix: 50 Basic, 30 Standard, 15 Premium, 5 Enterprise
- Monthly Recurring Revenue: **₹3,17,500**
- Annual Recurring Revenue: **₹38,10,000**

### Scenario 2: Medium Deployment (Year 2)
- 500 devices deployed
- Monthly Recurring Revenue: **₹15,87,500**
- Annual Recurring Revenue: **₹1,90,50,000**

### Scenario 3: Large Deployment (Year 3)
- 2000 devices deployed
- Monthly Recurring Revenue: **₹63,50,000**
- Annual Recurring Revenue: **₹7,62,00,000**

## Database Schema

```sql
CREATE TABLE devices (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  device_name VARCHAR(100) NOT NULL,
  sim_number VARCHAR(20),
  phone_number VARCHAR(20),
  imei VARCHAR(20) UNIQUE,
  
  -- Assignment
  tenant_id INT REFERENCES tenants(id),
  assigned_to_type ENUM(...),
  assigned_to_id INT,
  assigned_date TIMESTAMP,
  
  -- Subscription
  subscription_plan ENUM('basic', 'standard', 'premium', 'enterprise'),
  subscription_start TIMESTAMP,
  subscription_end TIMESTAMP,
  
  -- AMC
  amc_active BOOLEAN DEFAULT FALSE,
  amc_start_date TIMESTAMP,
  amc_end_date TIMESTAMP,
  
  -- Pricing
  device_cost DECIMAL(10, 2),
  monthly_software_fee DECIMAL(10, 2),
  amc_annual_fee DECIMAL(10, 2),
  
  -- Status
  status ENUM('active', 'inactive', 'maintenance', 'faulty', 'returned'),
  battery_level INT,
  last_online TIMESTAMP,
  
  -- Features
  features JSONB,
  
  -- Tracking
  total_calls_made INT DEFAULT 0,
  total_appointments INT DEFAULT 0,
  total_prescriptions INT DEFAULT 0
);
```

## API Endpoints

### Admin
- `POST /api/devices/register` - Register new device
- `POST /api/devices/:id/assign` - Assign device to tenant
- `GET /api/devices` - List all devices (filters: status, tenant, plan)
- `GET /api/devices/stats/revenue` - Calculate total revenue

### Tenant
- `GET /api/devices/tenant/:tenant_id` - Get tenant's devices
- `GET /api/devices/:id` - Device details

### Device
- `PUT /api/devices/:id/heartbeat` - Update status (battery, location)
- `POST /api/devices/:id/renew-amc` - Renew AMC

## Implementation Status

✅ Device model created (device.model.postgres.js)
✅ Device routes created (device.route.js)
✅ Business model documentation (this file)
⏳ Sync device table to database
⏳ Integrate device routes in app.js
⏳ Create device management dashboard
⏳ Implement heartbeat monitoring
⏳ Setup AMC expiry notifications
⏳ Create device provisioning workflow

## Next Steps

1. **Database**: Sync Device model to create table
2. **Backend**: Wire device routes in app.js
3. **Frontend**: Create device management dashboard (admin)
4. **Monitoring**: Setup device heartbeat cron job
5. **Notifications**: AMC expiry alerts (email/SMS)
6. **Billing**: Integrate payment gateway for subscriptions
7. **Mobile App**: Android app for devices (Mediczy Provider App)
8. **Analytics**: Revenue dashboard, device utilization metrics
