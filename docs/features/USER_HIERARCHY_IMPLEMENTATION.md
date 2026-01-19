# User Hierarchy System Implementation

## Overview
Comprehensive user hierarchy system for Mediczy that enforces business rules for user associations with entities.

## Business Rules

### 1. Base User Requirements
- **Every user MUST be associated with at least one entity:**
  - Hospital
  - Clinic
  - Corporate
  - Membership Plan
  - Homecare Service

### 2. User Types and Rules

#### Patient
- **Definition**: A User who has taken service from a Doctor
- **Creation**: Automatically created when User books first appointment/consultation
- **Requirements**: Must have association with Hospital/Clinic/Corporate/Membership Plan
- **Link**: References base User record via `userId`

#### Doctor
- **Requirements**: Must be associated with at least one of:
  - Hospital
  - Clinic
  - Homecare Service
  - Corporate
- **Can have**: Multiple associations across different entities
- **Link**: Can have optional link to User record

#### Nurse
- **Requirements**: Must be associated with at least one of:
  - Clinic
  - Hospital
  - Homecare Service
  - Corporate
- **Can have**: Multiple associations
- **Link**: Can have optional link to User record

#### Doctor Assistant
- **Requirements**: 
  - MUST be associated with Clinic OR Hospital
  - MUST be linked to a specific Doctor
- **Restrictions**: Cannot exist without doctor assignment
- **Link**: Can have optional link to User record

#### Team Member
- **Definition**: Part of Mediqzy internal team
- **Association**: Automatically associated with `mediqzy_team` entity
- **Roles**: admin, super_admin, support, operations, marketing, sales, tech, product, etc.
- **Access**: Platform-wide permissions

## Database Schema

### New Tables

#### `user_associations`
```sql
CREATE TABLE user_associations (
  id SERIAL PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  entityType ENUM('hospital', 'clinic', 'corporate', 'membership_plan', 'homecare', 'pharmacy', 'lab', 'mediqzy_team'),
  entityId INTEGER NOT NULL,
  role ENUM('patient', 'doctor', 'nurse', 'doctor_assistant', 'team_member', 'admin', 'staff', 'member', 'dependent'),
  isPrimary BOOLEAN DEFAULT false,
  status ENUM('active', 'inactive', 'suspended', 'pending') DEFAULT 'active',
  startDate TIMESTAMP DEFAULT NOW(),
  endDate TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  permissions JSONB DEFAULT '{}',
  createdBy INTEGER,
  notes TEXT,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(userId, entityType, entityId, role)
);
```

#### `patients`
```sql
CREATE TABLE patients (
  id SERIAL PRIMARY KEY,
  userId INTEGER NOT NULL UNIQUE REFERENCES Users(id) ON DELETE CASCADE,
  unique_id VARCHAR(6) UNIQUE,
  mrn VARCHAR(50),
  firstVisitDate TIMESTAMP,
  firstDoctorId INTEGER,
  firstAppointmentId INTEGER,
  bloodGroup ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
  height DECIMAL(5,2),
  weight DECIMAL(5,2),
  emergencyContact JSONB DEFAULT '{}',
  allergies TEXT[],
  chronicConditions TEXT[],
  currentMedications JSONB DEFAULT '[]',
  primaryInsuranceId INTEGER,
  secondaryInsuranceId INTEGER,
  status ENUM('active', 'inactive', 'deceased', 'transferred') DEFAULT 'active',
  totalVisits INTEGER DEFAULT 0,
  lastVisitDate TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  consentGiven BOOLEAN DEFAULT false,
  consentDate TIMESTAMP,
  medicalNotes TEXT,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

#### `team_members`
```sql
CREATE TABLE team_members (
  id SERIAL PRIMARY KEY,
  userId INTEGER UNIQUE REFERENCES Users(id) ON DELETE SET NULL,
  unique_id VARCHAR(6) UNIQUE,
  employeeId VARCHAR(50) UNIQUE NOT NULL,
  firstName VARCHAR(100) NOT NULL,
  lastName VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phoneNumber VARCHAR(20) NOT NULL,
  profileImage VARCHAR(500),
  role ENUM('admin', 'super_admin', 'support', 'operations', etc.),
  department VARCHAR(100),
  designation VARCHAR(100),
  joiningDate TIMESTAMP DEFAULT NOW(),
  exitDate TIMESTAMP,
  employmentStatus ENUM('active', 'inactive', 'on_leave', 'terminated'),
  employmentType ENUM('full_time', 'part_time', 'contract', 'intern'),
  permissions JSONB DEFAULT '{}',
  accessLevel INTEGER DEFAULT 1,
  workLocation VARCHAR(255),
  emergencyContact JSONB DEFAULT '{}',
  managerId INTEGER,
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  isActive BOOLEAN DEFAULT true,
  twoFactorEnabled BOOLEAN DEFAULT false,
  twoFactorSecret VARCHAR(255),
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

### User Associations

#### Create Association
```http
POST /api/user-associations
Authorization: Bearer {token}
Content-Type: application/json

{
  "userId": 123,
  "entityType": "hospital",
  "entityId": 5,
  "role": "patient",
  "isPrimary": true,
  "metadata": {}
}
```

#### Associate with Hospital
```http
POST /api/user-associations/hospital
{
  "userId": 123,
  "hospitalId": 5,
  "role": "patient"
}
```

#### Associate with Clinic
```http
POST /api/user-associations/clinic
{
  "userId": 123,
  "clinicId": 10,
  "role": "patient"
}
```

#### Associate Doctor
```http
POST /api/user-associations/doctor
{
  "doctorId": 456,
  "entityType": "hospital",
  "entityId": 5
}
```

#### Associate Doctor Assistant
```http
POST /api/user-associations/doctor-assistant
{
  "assistantId": 789,
  "entityType": "clinic",
  "entityId": 10,
  "doctorId": 456
}
```

#### Get User Associations
```http
GET /api/user-associations/user/:userId
```

#### Get Entity Users
```http
GET /api/user-associations/entity/:entityType/:entityId?role=doctor
```

#### Get User Hierarchy
```http
GET /api/user-associations/hierarchy/:userId
```

Response:
```json
{
  "success": true,
  "data": {
    "isPatient": true,
    "isDoctor": false,
    "isNurse": false,
    "isDoctorAssistant": false,
    "isTeamMember": false,
    "roles": ["patient"],
    "associations": [
      {
        "entityType": "hospital",
        "entityId": 5,
        "role": "patient",
        "isPrimary": true
      }
    ]
  }
}
```

## Usage Examples

### 1. Register New User and Associate with Hospital
```javascript
import UserAssociationService from './services/userAssociation.service.js';

// Create user
const user = await User.create({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  // ... other fields
});

// Associate with hospital
await UserAssociationService.associateWithHospital(
  user.id,
  hospitalId,
  'patient',
  { isPrimary: true }
);
```

### 2. Convert User to Patient on First Visit
```javascript
import UserAssociationService from './services/userAssociation.service.js';

// When user books first appointment
const patient = await UserAssociationService.convertToPatient(
  userId,
  doctorId,
  appointmentId
);
```

### 3. Add Doctor to Clinic
```javascript
// Associate existing doctor with clinic
await UserAssociationService.associateDoctor(
  doctorId,
  'clinic',
  clinicId,
  { isPrimary: false }
);
```

### 4. Create Doctor Assistant
```javascript
// Create assistant record
const assistant = await DoctorAssistant.create({
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@clinic.com',
  password: hashedPassword,
  // ... other fields
});

// Associate with clinic and doctor
await UserAssociationService.associateDoctorAssistant(
  assistant.id,
  'clinic',
  clinicId,
  doctorId
);
```

### 5. Check User Permissions
```javascript
import { getUserRoleHierarchy, canAccessEntity } from './middleware/userHierarchy.middleware.js';

// Get user's role hierarchy
const hierarchy = await getUserRoleHierarchy(userId);

// Check entity access
const hasAccess = await canAccessEntity(userId, 'hospital', hospitalId);
```

## Middleware Usage

### Validate User Associations
```javascript
import { validateUserAssociations } from './middleware/userHierarchy.middleware.js';

router.post('/some-endpoint', 
  authUser, 
  validateUserAssociations,
  controller
);
```

### Validate Doctor Associations
```javascript
import { validateDoctorAssociations } from './middleware/userHierarchy.middleware.js';

router.post('/doctor-endpoint', 
  authDoctor, 
  validateDoctorAssociations,
  controller
);
```

### Require Entity Access
```javascript
import { requireEntityAccess } from './middleware/userHierarchy.middleware.js';

router.get('/hospital/:hospitalId/patients',
  authUser,
  requireEntityAccess('hospital', 'hospitalId'),
  controller
);
```

## Migration

Run migration to create tables:
```bash
cd server
npx sequelize-cli db:migrate
```

Or manually run:
```javascript
import { up } from './migrations/20260113000000-user-hierarchy-system.js';
await up(queryInterface, Sequelize);
```

## Setup in Application

In your main server file:
```javascript
import setupUserHierarchyAssociations from './models/userHierarchy.associations.js';
import userAssociationRoutes from './routes/userAssociation.route.js';

// Setup model associations
setupUserHierarchyAssociations();

// Mount routes
app.use('/api/user-associations', userAssociationRoutes);
```

## Validation Rules Enforced

1. ✅ Every user must have at least one active association
2. ✅ Cannot delete last association
3. ✅ Doctors must be associated with hospital/clinic/homecare/corporate
4. ✅ Nurses must be associated with clinic/hospital/homecare/corporate
5. ✅ Doctor Assistants must be linked to both entity AND doctor
6. ✅ Team Members automatically associated with mediqzy_team
7. ✅ Patients created only after first doctor visit

## Files Created

1. `/server/models/postgres/user-association.model.postgres.js` - UserAssociation model
2. `/server/models/postgres/patient.model.postgres.js` - Patient model
3. `/server/models/postgres/team-member.model.postgres.js` - TeamMember model
4. `/server/middleware/userHierarchy.middleware.js` - Validation middleware
5. `/server/services/userAssociation.service.js` - Business logic service
6. `/server/models/userHierarchy.associations.js` - Model associations
7. `/server/routes/userAssociation.route.js` - API routes
8. `/server/migrations/20260113000000-user-hierarchy-system.js` - Database migration

## Next Steps

1. Run database migration
2. Setup model associations in server initialization
3. Mount routes in Express app
4. Update existing user registration flows to create associations
5. Update appointment booking to convert users to patients
6. Add UI for managing user associations
7. Implement association-based access control throughout the app

## Benefits

- ✅ Enforces business logic at database level
- ✅ Flexible multi-tenant architecture
- ✅ Clear separation of user roles
- ✅ Auditable association history
- ✅ Scalable to support future entity types
- ✅ JSONB metadata for extensibility
- ✅ Polymorphic associations without complexity
