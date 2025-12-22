# Service Provider Authentication System

## Overview

Mediczy now supports authentication for multiple service provider types:
- **Labs**: Diagnostic labs and pathology centers
- **Pharmacies**: Medicine stores and pharmacy chains
- **Ambulance Services**: Emergency ambulance providers
- **Homecare Providers**: Nursing, physiotherapy, and caregiver services

## Architecture

All service provider models follow a consistent authentication pattern:
- **bcrypt** password hashing (10 rounds)
- **JWT** token generation (7-day expiry)
- **JSONB** fields for flexible data storage
- **GIN indexes** for fast JSON queries
- **Status workflow**: pending → active/inactive/suspended/rejected
- **Verification flags**: `isVerified`, `isAvailable`
- **Rating systems**: 0-5 stars with review tracking

## Models

### 1. Lab Model (`lab.model.postgres.js`)

**Purpose**: Diagnostic labs, pathology centers, radiology centers

**Key Features**:
- Test catalog with JSONB (test name, price, duration, preparation)
- Accreditation tracking (NABL, CAP, ISO)
- Operating hours and facilities
- Home collection support
- Rating and review system

**JWT Payload**:
```json
{
  "id": 1,
  "email": "lab@example.com",
  "role": "lab",
  "labName": "City Diagnostics",
  "isVerified": true
}
```

**Authentication Methods**:
- `comparePassword(candidatePassword)`: Verify password
- `generateAuthToken()`: Create JWT with role='lab'
- `findByEmail(email)`: Find lab by email
- `findActive()`: Get all active verified labs
- `findByCity(city)`: Find labs in specific city

**Service Categories**:
- Blood tests, urine analysis, radiology
- CT scan, MRI, ultrasound
- ECG, EEG, pathology
- Home sample collection

### 2. Pharmacy Model (`pharmacy.model.postgres.js`)

**Purpose**: Pharmacies, medicine stores, medical supply chains

**Key Features**:
- Inventory categories (generic, surgical, baby products, ayurvedic)
- License and GST number tracking
- 24x7 availability flag
- Home delivery support with radius and minimum order
- Operating hours scheduling

**JWT Payload**:
```json
{
  "id": 2,
  "email": "pharmacy@example.com",
  "role": "pharmacy",
  "pharmacyName": "MedPlus Pharmacy",
  "isVerified": true
}
```

**Authentication Methods**:
- `comparePassword(candidatePassword)`
- `generateAuthToken()`: JWT with role='pharmacy'
- `findByEmail(email)`
- `findActive()`
- `find24x7()`: Get all 24-hour pharmacies
- `findWithDelivery()`: Get pharmacies offering home delivery

**Inventory Flags**:
- `hasGenericMedicines`: Generic drug availability
- `hasSurgicalItems`: Surgical equipment
- `hasBabyProducts`: Baby care products
- `hasAyurvedic`: Ayurvedic medicines

**Delivery Features**:
- `homeDelivery`: Boolean flag
- `deliveryRadius`: Delivery range in km
- `minimumOrderAmount`: Minimum order for delivery

### 3. Ambulance Model (`ambulance.model.postgres.js`)

**Purpose**: Emergency ambulance service providers

**Key Features**:
- Vehicle management (6 types: basic, advanced, air, cardiac, neonatal, mortuary)
- Real-time location tracking (base + current location)
- Equipment tracking (oxygen, ventilator, defibrillator, ECG)
- Staff details (driver, paramedic names and licenses)
- Trip tracking and pricing
- Availability status (7 states)

**JWT Payload**:
```json
{
  "id": 3,
  "email": "ambulance@example.com",
  "role": "ambulance",
  "providerName": "City Ambulance Services",
  "vehicleNumber": "MH01AB1234",
  "isVerified": true
}
```

**Authentication Methods**:
- `comparePassword(candidatePassword)`
- `generateAuthToken()`: JWT with role='ambulance' and vehicleNumber
- `findByEmail(email)`
- `findAvailable(vehicleType)`: Get available ambulances by type
- `findNearby(lat, lng, radius)`: Placeholder for PostGIS integration
- `updateLocation(lat, lng)`: Update current location

**Vehicle Types**:
- `basic`: Basic Life Support (BLS)
- `advanced`: Advanced Life Support (ALS)
- `air`: Air ambulance
- `cardiac`: Cardiac ambulance
- `neonatal`: Neonatal ambulance
- `mortuary`: Mortuary van

**Status States**:
- `idle`: Available and waiting
- `on-call`: Call received
- `en-route`: Going to pickup
- `at-scene`: At patient location
- `transporting`: Patient in ambulance
- `at-hospital`: At destination
- `maintenance`: Under maintenance

### 4. Homecare Provider Model (`homecare.model.postgres.js`)

**Purpose**: Home healthcare providers (nurses, physiotherapists, caregivers)

**Key Features**:
- Provider types (individual, agency, organization)
- Service categories (nursing, physiotherapy, eldercare, babycare, post-surgical care)
- Staff tracking (qualified nurses, physiotherapists, caregivers)
- Service area management with JSONB
- Equipment rental (hospital beds, wheelchairs, oxygen concentrators)
- 24x7 and emergency service flags
- Flexible pricing (hourly, daily, monthly rates)

**JWT Payload**:
```json
{
  "id": 4,
  "email": "homecare@example.com",
  "role": "homecare",
  "providerName": "Care at Home Services",
  "providerType": "agency",
  "isVerified": true
}
```

**Authentication Methods**:
- `comparePassword(candidatePassword)`
- `generateAuthToken()`: JWT with role='homecare' and providerType
- `findByEmail(email)`
- `findAvailable(serviceType)`: Get available providers by service type
- `find24x7()`: Get 24x7 available providers
- `isActive()`: Check if provider is active and available

**Service Types**:
- `nursing`: Professional nursing care
- `physiotherapy`: Physiotherapy services
- `eldercare`: Elder care and companionship
- `babycare`: Baby and infant care
- `postsurgical`: Post-surgical care
- Medical equipment rental

**Provider Types**:
- `individual`: Solo practitioner
- `agency`: Staffing agency
- `organization`: Healthcare organization

## Common Features

All service provider models share:

### Authentication Flow
```javascript
// 1. Register/Create account
const provider = await ServiceProvider.create({
  name: "Provider Name",
  email: "provider@example.com",
  password: "securePassword123",
  phone: "+1234567890",
  // ... other fields
});

// 2. Login
const provider = await ServiceProvider.findByEmail(email);
const isMatch = await provider.comparePassword(password);
if (isMatch) {
  const token = provider.generateAuthToken();
  // Return token to client
}

// 3. Verify token in middleware
const decoded = jwt.verify(token, process.env.JWT_SECRET);
// decoded.role will be 'lab', 'pharmacy', 'ambulance', or 'homecare'
```

### Password Security
- Hashed using bcrypt with 10 rounds
- Automatically hashed on create and update
- Never exposed in JSON responses (toJSON method removes it)
- `comparePassword()` method for verification

### JWT Token Structure
```javascript
{
  id: 123,
  email: "provider@example.com",
  role: "lab" | "pharmacy" | "ambulance" | "homecare",
  providerName: "Provider Name", // lab/pharmacy/ambulance/homecare specific
  isVerified: true,
  iat: 1234567890,
  exp: 1234567890  // 7 days from issue
}
```

### Status Workflow
1. **pending**: Initial registration, awaiting verification
2. **active**: Verified and operational
3. **inactive**: Temporarily disabled by provider
4. **suspended**: Suspended by admin
5. **rejected**: Registration rejected

### Verification Process
- `isVerified`: Boolean flag set by admin
- Only verified providers can accept bookings
- Verification requires document upload (license, registration, etc.)

### Rating System
```javascript
{
  rating: 4.5,           // Average rating (0-5)
  totalReviews: 120,     // Number of reviews
  totalBookings: 250     // Total bookings (ambulance/homecare)
  totalTrips: 250        // Total trips (ambulance only)
}
```

### JSONB Fields

All models use JSONB for flexible data:

**Address**:
```json
{
  "street": "123 Main Street",
  "city": "Mumbai",
  "state": "Maharashtra",
  "zipCode": "400001",
  "country": "India",
  "coordinates": {
    "lat": 19.0760,
    "lng": 72.8777
  }
}
```

**Services** (Lab/Pharmacy/Homecare):
```json
[
  {
    "type": "blood_test",
    "name": "Complete Blood Count",
    "price": 500,
    "duration": "24 hours",
    "description": "CBC with differential"
  }
]
```

**Operating Hours**:
```json
{
  "monday": {"open": "09:00", "close": "21:00"},
  "tuesday": {"open": "09:00", "close": "21:00"},
  "wednesday": {"open": "09:00", "close": "21:00"},
  "thursday": {"open": "09:00", "close": "21:00"},
  "friday": {"open": "09:00", "close": "21:00"},
  "saturday": {"open": "09:00", "close": "18:00"},
  "sunday": "closed"
}
```

**Equipment** (Ambulance):
```json
[
  {
    "name": "Oxygen Cylinder",
    "quantity": 2,
    "status": "functional"
  },
  {
    "name": "Defibrillator",
    "quantity": 1,
    "status": "functional"
  }
]
```

**Location** (Ambulance):
```json
{
  "lat": 19.0760,
  "lng": 72.8777,
  "address": "Andheri West, Mumbai",
  "lastUpdated": "2024-01-15T10:30:00Z"
}
```

**Service Areas** (Homecare):
```json
[
  {
    "city": "Mumbai",
    "localities": ["Andheri", "Bandra", "Juhu"],
    "radius": 10
  }
]
```

### GIN Indexes

All models have GIN indexes for fast JSONB queries:
- `idx_{model}_address_gin`: Fast address searches
- `idx_{model}_services_gin`: Fast service lookups
- Model-specific indexes (test catalog, equipment, service areas)

## Database Tables

When service providers onboard, tables will be created automatically:

```javascript
import { Lab, Pharmacy, Ambulance, HomecareProvider } from './models/index.js';

// Sync models to create tables
await Lab.sync();
await Pharmacy.sync();
await Ambulance.sync();
await HomecareProvider.sync();
```

## API Endpoints (Recommended)

### Registration
```javascript
POST /api/lab/register
POST /api/pharmacy/register
POST /api/ambulance/register
POST /api/homecare/register

Body: {
  name: string,
  email: string,
  password: string,
  phone: string,
  // ... other required fields
}
```

### Login
```javascript
POST /api/lab/login
POST /api/pharmacy/login
POST /api/ambulance/login
POST /api/homecare/login

Body: {
  email: string,
  password: string
}

Response: {
  token: string,
  provider: {...}
}
```

### Protected Routes
```javascript
GET /api/lab/profile
GET /api/pharmacy/profile
GET /api/ambulance/profile
GET /api/homecare/profile

Headers: {
  Authorization: "Bearer <token>"
}
```

## Middleware Integration

Update `ringFencing.js` to support new roles:

```javascript
const rolePermissions = {
  user: ['/api/appointments', '/api/prescriptions'],
  doctor: ['/api/doctor/appointments', '/api/doctor/prescriptions'],
  admin: ['/api/admin/*'],
  lab: ['/api/lab/*', '/api/lab/bookings'],
  pharmacy: ['/api/pharmacy/*', '/api/pharmacy/orders'],
  ambulance: ['/api/ambulance/*', '/api/ambulance/trips'],
  homecare: ['/api/homecare/*', '/api/homecare/bookings']
};

function checkRole(allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}
```

## Migration Status

**Current State**: ✅ Models Created, No Data Yet

- Lab model: ✅ Ready for use (226 lines)
- Pharmacy model: ✅ Ready for use (233 lines)
- Ambulance model: ✅ Ready for use (305 lines)
- Homecare model: ✅ Ready for use (293 lines)
- Model exports: ✅ Updated in `index.js`

**Next Steps**:
1. Create API routes for registration and login
2. Add role-based middleware support
3. Build service provider onboarding flow
4. Test authentication with sample data
5. Create admin panel for provider verification

## Testing

When service providers register:

```javascript
// Test Lab Authentication
const lab = await Lab.create({
  name: "City Diagnostics",
  email: "lab@citydiagnostics.com",
  password: "secure123",
  phone: "+919876543210",
  address: { city: "Mumbai", state: "Maharashtra" },
  services: [
    { type: "blood_test", name: "CBC", price: 500 }
  ]
});

const token = lab.generateAuthToken();
const isValid = await lab.comparePassword("secure123");
console.log("Token:", token);
console.log("Password valid:", isValid);
```

## Security Considerations

1. **Password Storage**: All passwords hashed with bcrypt (never stored plain)
2. **JWT Secret**: Use strong secret in production (`process.env.JWT_SECRET`)
3. **Token Expiry**: 7-day expiry, refresh tokens recommended
4. **Email Validation**: Emails converted to lowercase, validated format
5. **Unique Constraints**: Email, phone, license numbers must be unique
6. **toJSON Override**: Passwords excluded from API responses
7. **Verification Required**: Only verified providers can provide services

## Future Enhancements

1. **PostGIS Integration**: For ambulance location-based queries
2. **Real-time Tracking**: WebSocket support for ambulance location updates
3. **Booking System**: Integration with appointment/booking models
4. **Payment Integration**: Connect with payment gateway
5. **Rating System**: Customer reviews and ratings
6. **Analytics**: Track provider performance and utilization
7. **Mobile Apps**: Dedicated apps for service providers

## Summary

✅ **Complete**: All four service provider models created with authentication
✅ **Consistent**: Same authentication pattern across all models
✅ **Secure**: bcrypt hashing, JWT tokens, password hiding
✅ **Flexible**: JSONB for dynamic data, GIN indexes for performance
✅ **Ready**: Models exported and available for use
✅ **Scalable**: Status workflows, verification, rating systems

When service providers start onboarding, authentication infrastructure is immediately available!
