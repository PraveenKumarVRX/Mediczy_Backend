# Wearable Health Monitoring System

## Overview
Health monitoring wearables (smartwatch, smart band, smart ring) provided as part of user subscription. Tracks real-time health metrics and syncs data to the platform.

---

## Device Types

### 1. **Smartwatch**
- Full-featured health monitoring
- Touchscreen display
- GPS tracking
- Call/notification support
- Features: Heart rate, BP, SpO2, ECG, steps, sleep, stress
- Battery: 1-3 days
- Examples: Mediczy Watch Pro, Apple Watch, Galaxy Watch

### 2. **Smart Band**
- Essential health monitoring
- OLED display
- Lightweight design
- Features: Heart rate, SpO2, steps, sleep, calories
- Battery: 5-10 days
- Examples: Mediczy Band 7, Fitbit Charge, Mi Band

### 3. **Smart Ring**
- Minimal design wearable
- No display
- 24/7 wear (including sleep)
- Features: Heart rate, HRV, SpO2, temperature, sleep
- Battery: 4-7 days
- Examples: Mediczy Ring, Oura Ring, Samsung Galaxy Ring

---

## Subscription Model

### Free Tier
- 1 device (smart band only)
- Basic metrics (steps, heart rate, sleep)
- Weekly summary
- 30-day data retention

### Basic Tier (₹299/month)
- 2 devices (band + watch/ring)
- All health metrics
- Daily insights
- 90-day data retention
- Email alerts

### Premium Tier (₹499/month)
- 3 devices (all types)
- Advanced metrics (ECG, stress, HRV)
- Real-time monitoring
- Unlimited data retention
- AI health insights
- Doctor consultations

### Corporate Tier (Custom pricing)
- Unlimited devices for employees
- Corporate dashboard
- Group analytics
- Wellness programs
- Custom integrations
- Dedicated support

---

## Health Metrics Tracked

### Continuous Monitoring
1. **Heart Rate (HR)**
   - Resting HR: 60-100 bpm (normal)
   - Active HR: varies by activity
   - Alerts: < 50 bpm or > 120 bpm (resting)

2. **Blood Oxygen (SpO2)**
   - Normal: 95-100%
   - Alerts: < 90%

3. **Sleep Tracking**
   - Sleep duration
   - Sleep stages (light, deep, REM)
   - Sleep quality score
   - Wake-up times

### Periodic Monitoring
4. **Blood Pressure (BP)**
   - Systolic/Diastolic
   - Normal: < 120/80 mmHg
   - Alerts: > 140/90 mmHg

5. **Stress Level**
   - Measured via HRV
   - Scale: Low, Medium, High

6. **Body Temperature**
   - Normal: 97-99°F
   - Fever detection

### Activity Tracking
7. **Steps**
   - Daily goal: 10,000 steps
   - Distance traveled
   - Calories burned

8. **Exercise**
   - Workout type detection
   - Duration and intensity
   - Calories burned

---

## API Endpoints

### Device Management

**Provision Device (Admin)**
```
POST /api/wearables/provision
Body: {
  device_id, device_name, type, brand, model,
  mac_address, serial_number, features
}
```

**Assign to User**
```
POST /api/wearables/:id/assign
Body: {
  user_id, tenant_id, subscription_type, subscription_months
}
```

**List All Devices**
```
GET /api/wearables?type=smartwatch&status=active
```

**Get User's Devices**
```
GET /api/wearables/user/:user_id
```

**Get Device Details**
```
GET /api/wearables/:id
```

### Data Sync

**Sync Device Status**
```
PUT /api/wearables/:id/sync
Body: {
  battery_level, is_charging, current_metrics, firmware_version
}
```

**Upload Health Readings**
```
POST /api/wearables/:id/readings
Body: {
  readings: [
    {
      type: "heart_rate",
      value: 72,
      unit: "bpm",
      timestamp: "2025-12-09T10:30:00Z",
      activity: "resting"
    }
  ]
}
```

**Get Device Readings**
```
GET /api/wearables/:id/readings?type=heart_rate&start_date=2025-12-01&end_date=2025-12-09
```

**Get User Health Summary**
```
GET /api/wearables/user/:user_id/health-summary?days=7
```

**Update Device Settings**
```
PUT /api/wearables/:id/settings
Body: {
  settings: {
    notification_enabled: true,
    auto_sync: true,
    heart_rate_monitoring: "continuous"
  }
}
```

---

## Database Schema

### Wearables Table
```sql
CREATE TABLE wearables (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  device_name VARCHAR(100) NOT NULL,
  type ENUM('smartwatch', 'smartband', 'smartring') NOT NULL,
  brand VARCHAR(50),
  model VARCHAR(100) NOT NULL,
  mac_address VARCHAR(17) UNIQUE,
  serial_number VARCHAR(50) UNIQUE,
  
  -- Assignment
  user_id INT REFERENCES users(id),
  tenant_id INT REFERENCES tenants(id),
  assigned_date TIMESTAMP,
  
  -- Subscription
  subscription_type ENUM('free', 'basic', 'premium', 'corporate'),
  subscription_start TIMESTAMP,
  subscription_end TIMESTAMP,
  is_active_subscription BOOLEAN DEFAULT FALSE,
  
  -- Status
  status ENUM('available', 'assigned', 'active', 'inactive', 'lost', 'damaged', 'returned'),
  battery_level INT,
  last_sync TIMESTAMP,
  is_charging BOOLEAN DEFAULT FALSE,
  firmware_version VARCHAR(20),
  
  -- Features & Settings
  features JSONB,
  current_metrics JSONB,
  settings JSONB,
  connectivity JSONB,
  alerts JSONB,
  
  -- Stats
  total_syncs INT DEFAULT 0,
  total_days_worn INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Health Readings Table
```sql
CREATE TABLE health_readings (
  id SERIAL PRIMARY KEY,
  wearable_id INT REFERENCES wearables(id) NOT NULL,
  user_id INT REFERENCES users(id) NOT NULL,
  reading_type ENUM(
    'heart_rate', 'blood_pressure', 'spo2', 'steps',
    'sleep', 'calories', 'distance', 'stress',
    'ecg', 'temperature', 'blood_glucose'
  ) NOT NULL,
  value JSONB NOT NULL,
  unit VARCHAR(20),
  recorded_at TIMESTAMP NOT NULL,
  synced_at TIMESTAMP DEFAULT NOW(),
  activity VARCHAR(50),
  location JSONB,
  is_normal BOOLEAN,
  alert_triggered BOOLEAN DEFAULT FALSE,
  alert_severity ENUM('info', 'warning', 'critical'),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_readings_user ON health_readings(user_id);
CREATE INDEX idx_readings_type ON health_readings(reading_type);
CREATE INDEX idx_readings_time ON health_readings(recorded_at);
CREATE INDEX idx_readings_alerts ON health_readings(alert_triggered);
```

---

## Integration Flow

### Device Provisioning
1. Admin provisions device in system
2. Device gets unique device_id and MAC address
3. QR code generated for device pairing

### User Assignment
1. User selects subscription plan
2. Admin/System assigns wearable to user
3. User receives device with pairing instructions
4. User pairs device with mobile app

### Data Sync Flow
1. Wearable records health metrics continuously
2. Device syncs with mobile app via Bluetooth
3. Mobile app uploads readings to server
4. Server stores readings in health_readings table
5. Server analyzes readings for abnormalities
6. Alerts triggered if readings outside normal range

### Health Monitoring
1. User views real-time metrics in app
2. Historical trends displayed as charts
3. AI generates health insights
4. Abnormal readings alert user + doctor
5. Weekly/Monthly health reports generated

---

## Mobile App Integration

### Required Features

**Device Pairing**
- Scan QR code or enter device_id
- Bluetooth pairing
- Device activation

**Data Sync**
- Auto-sync every 15 minutes
- Manual sync option
- Sync status indicator

**Health Dashboard**
- Current metrics cards
- Historical charts (7d, 30d, 90d, 1y)
- Activity summary
- Sleep analysis

**Alerts & Notifications**
- Abnormal readings
- Low battery warning
- Sync failed alert
- Daily activity reminders

**Settings**
- Device preferences
- Notification preferences
- Sync interval
- Health goals

---

## Alert System

### Critical Alerts (Immediate notification)
- Heart rate < 40 or > 140 bpm (resting)
- SpO2 < 85%
- Blood pressure > 180/120 mmHg
- Fall detection triggered
- Emergency SOS activated

### Warning Alerts (1-hour delay)
- Heart rate 40-50 or 120-140 bpm
- SpO2 85-90%
- Blood pressure 140-180/90-120 mmHg
- Unusual sleep pattern
- High stress level (> 6 hours)

### Info Alerts (Daily summary)
- Activity goal achieved
- Sleep quality report
- Low battery (< 20%)
- Sync reminder

---

## Data Retention Policy

### Free Tier
- Last 30 days of data
- No historical analysis

### Basic Tier
- Last 90 days of data
- Basic trends

### Premium Tier
- Unlimited retention
- Full historical analysis
- AI insights

### Corporate Tier
- Unlimited retention
- Group analytics
- Custom reporting

---

## Privacy & Security

### Data Encryption
- End-to-end encryption for health data
- AES-256 encryption at rest
- TLS 1.3 for data in transit

### Access Control
- User owns their data
- Doctor access requires consent
- Corporate access aggregated only (no PII)

### Compliance
- HIPAA compliant
- GDPR compliant
- Data anonymization for research

---

## Revenue Model

### Subscription Revenue
- Free: ₹0 (user acquisition)
- Basic: ₹299/month × users
- Premium: ₹499/month × users
- Corporate: ₹199/user/month (min 50 users)

### Device Revenue
- Smartwatch: ₹8,000 - ₹15,000
- Smart Band: ₹2,500 - ₹4,500
- Smart Ring: ₹12,000 - ₹20,000

### Example: 1000 Users
- 400 Free (₹0)
- 400 Basic (₹1,19,600/month)
- 150 Premium (₹74,850/month)
- 50 Corporate (₹9,950/month)
- **Total: ₹2,04,400/month = ₹24.5L/year**

---

## Implementation Status

✅ Backend Models (Wearable, HealthReading)
✅ Backend Routes (provision, assign, sync, readings)
✅ Database tables synced
✅ Frontend Dashboard (WearablesDashboard)
✅ Frontend User Health View (UserWearables)
✅ Health Summary API
✅ Alert system structure

⏳ Mobile app integration
⏳ Bluetooth pairing SDK
⏳ Chart visualizations
⏳ AI health insights
⏳ Doctor consultation integration
