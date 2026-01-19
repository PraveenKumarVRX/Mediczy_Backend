# User Corporate Profile Integration

## Overview

Users can now link their accounts to corporate insurance plans by providing employer information during registration or by updating their profile. This integration enables:

- Corporate group insurance coverage tracking
- Employee-specific benefits and wellness programs
- Streamlined claims processing for corporate members
- Family member management based on corporate policy limits

## Database Changes

### Users Table - New Fields

| Field | Type | Description |
|-------|------|-------------|
| `employer_name` | VARCHAR(200) | Name of the employer company |
| `employee_id` | VARCHAR(50) | Employee ID assigned by the company |
| `corporate_id` | INTEGER | Foreign key reference to corporates table |
| `membership_type` | VARCHAR(50) | Type of membership: 'individual', 'couple', 'family', 'corporate' |

### Indexes

- `idx_users_corporate_id` - Fast lookup of users by corporate
- `idx_users_employee_id` - Fast lookup by employee ID

## API Endpoints

### 1. User Registration with Corporate Details

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@company.com",
  "password": "SecurePassword123!",
  "phoneNumber": "+919876543210",
  "dateOfBirth": "1990-05-15",
  "gender": "Male",
  
  // Corporate employment fields (optional)
  "employerName": "Tech Corp India Pvt Ltd",
  "employeeId": "EMP001234",
  "corporateId": 5,
  "membershipType": "corporate"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 123,
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@company.com",
    "phoneNumber": "+919876543210",
    "dateOfBirth": "1990-05-15",
    "gender": "Male",
    "status": "active",
    "emailVerified": false,
    "role": "user",
    "employerName": "Tech Corp India Pvt Ltd",
    "employeeId": "EMP001234",
    "corporateId": 5,
    "membershipType": "corporate"
  }
}
```

### 2. User Login

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "john.doe@company.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 123,
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@company.com",
    "phoneNumber": "+919876543210",
    "dateOfBirth": "1990-05-15",
    "gender": "Male",
    "status": "active",
    "emailVerified": true,
    "isActive": true,
    "lastLoginAt": "2024-12-21T10:30:00Z",
    "role": "user",
    "employerName": "Tech Corp India Pvt Ltd",
    "employeeId": "EMP001234",
    "corporateId": 5,
    "membershipType": "corporate"
  }
}
```

### 3. Get User Profile

**Endpoint:** `GET /api/users/profile`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": 123,
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@company.com",
  "phoneNumber": "+919876543210",
  "dateOfBirth": "1990-05-15",
  "age": 34,
  "gender": "Male",
  "status": "active",
  "emailVerified": true,
  "employerName": "Tech Corp India Pvt Ltd",
  "employeeId": "EMP001234",
  "corporateId": 5,
  "membershipType": "corporate",
  "corporate": {
    "id": 5,
    "companyName": "Tech Corp India Pvt Ltd",
    "cin": "U72900KA2015PTC123456",
    "industry": "Information Technology",
    "employeeCount": 500
  }
}
```

### 4. Update User Profile

**Endpoint:** `PUT /api/users/profile`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+919876543210",
  "employerName": "Tech Corp India Pvt Ltd",
  "employeeId": "EMP001234",
  "corporateId": 5,
  "membershipType": "corporate"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    "id": 123,
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@company.com",
    "phoneNumber": "+919876543210",
    "dateOfBirth": "1990-05-15",
    "age": 34,
    "gender": "Male",
    "abhaHealthId": null,
    "profileImage": null,
    "employerName": "Tech Corp India Pvt Ltd",
    "employeeId": "EMP001234",
    "corporateId": 5,
    "membershipType": "corporate"
  }
}
```

## Membership Types

The `membershipType` field supports the following values:

| Type | Description | Family Members Allowed |
|------|-------------|------------------------|
| `individual` | Single person coverage | 0 |
| `couple` | Self + Spouse | 1 (spouse only) |
| `family` | Self + Spouse + Children | Up to 4 dependents |
| `corporate` | Company-sponsored group insurance | Depends on corporate policy |

## Integration with Insurance System

### Linking Users to Corporate Policies

When a user registers or updates their profile with corporate details:

1. **User Registration/Update**
   - User provides `employerName`, `employeeId`, and `corporateId`
   - System validates corporate exists in `corporates` table
   - Foreign key reference created

2. **Corporate Employee Record**
   - Create entry in `corporate_employees` table
   - Links user to corporate for policy management
   - Tracks employee metadata (department, designation, etc.)

3. **Insurance Policy Assignment**
   - Corporate admin assigns group policy to employees
   - Policy members created in `policy_members` table
   - Each user linked to specific insurance policy

4. **OPD & Wellness Wallets**
   - If corporate policy includes OPD coverage, create `opd_wallets` entry
   - If wellness program active, create `wellness_wallets` entry
   - Automatic initialization with policy limits

### Example: Corporate Employee Onboarding Flow

```javascript
// Step 1: User registers with corporate details
POST /api/auth/register
{
  "email": "employee@company.com",
  "employerName": "Tech Corp",
  "employeeId": "EMP12345",
  "corporateId": 5
}

// Step 2: Corporate HR verifies and activates employee
POST /api/insurance-company/corporate/employees
{
  "userId": 123,
  "corporateId": 5,
  "employeeId": "EMP12345",
  "department": "Engineering",
  "designation": "Senior Software Engineer"
}

// Step 3: System assigns corporate group policy
POST /api/insurance-policy/assign-corporate-policy
{
  "corporateId": 5,
  "policyId": 10,
  "employeeIds": ["EMP12345"]
}

// Step 4: OPD and Wellness wallets auto-created
// opd_wallets: policyId=10, userId=123, annualLimit=5000
// wellness_wallets: policyId=10, userId=123, annualPoints=1000
```

## Use Cases

### 1. Corporate Employee Verification

```sql
-- Find all employees of a specific corporate
SELECT u.id, u.firstName, u.lastName, u.email, u.employeeId
FROM users u
WHERE u.corporate_id = 5
AND u.status = 'active';
```

### 2. Employee Insurance Coverage Check

```sql
-- Check if employee has active insurance
SELECT 
  u.firstName, u.lastName, u.employeeId,
  p.policyName, p.sumInsured, p.policyType,
  pm.relationshipWithPrimaryMember, pm.status
FROM users u
JOIN policy_members pm ON u.id = pm.userId
JOIN insurance_policies p ON pm.policyId = p.id
WHERE u.id = 123 AND pm.status = 'active';
```

### 3. Corporate Wellness Program Enrollment

```sql
-- Find employees eligible for wellness rewards
SELECT 
  u.id, u.firstName, u.lastName, u.employeeId,
  ww.engagementScore, ww.pointsEarned
FROM users u
JOIN wellness_wallets ww ON u.id = ww.userId
WHERE u.corporate_id = 5
AND ww.engagementScore >= 70
ORDER BY ww.pointsEarned DESC
LIMIT 10;
```

## Security Considerations

### Data Privacy (HIPAA/DPDP Compliance)

1. **Corporate Visibility**
   - Employers can see aggregate wellness metrics only
   - No access to individual medical records
   - Claims data anonymized at corporate level

2. **User Consent**
   - Users must consent to data sharing with corporate
   - Opt-in for wellness program participation
   - Right to withdraw consent

3. **Access Control**
   - `corporateId` validated before data access
   - Corporate HR can only view employees of their organization
   - Row-level security on sensitive tables

### Validation Rules

```javascript
// Corporate ID must exist
const corporate = await Corporate.findByPk(corporateId);
if (!corporate) {
  throw new Error('Invalid corporate ID');
}

// Employee ID format validation (company-specific)
if (!/^EMP\d{5,10}$/.test(employeeId)) {
  throw new Error('Invalid employee ID format');
}

// Membership type validation
const validTypes = ['individual', 'couple', 'family', 'corporate'];
if (!validTypes.includes(membershipType)) {
  throw new Error('Invalid membership type');
}
```

## Testing

### Test User Registration with Corporate

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "Employee",
    "email": "test.employee@techcorp.com",
    "password": "Test123!@#",
    "phoneNumber": "+919876543210",
    "dateOfBirth": "1995-03-20",
    "gender": "Male",
    "employerName": "Tech Corp India Pvt Ltd",
    "employeeId": "EMP789456",
    "corporateId": 1,
    "membershipType": "corporate"
  }'
```

### Test Profile Update

```bash
curl -X PUT http://localhost:8000/api/users/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "employerName": "New Company Name",
    "employeeId": "EMP999999",
    "corporateId": 2,
    "membershipType": "corporate"
  }'
```

### Test Profile Retrieval

```bash
curl -X GET http://localhost:8000/api/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Migration Guide

For existing users who want to link to corporate:

1. **User updates profile** with employer details
2. **HR verifies** employee ID in corporate system
3. **System creates** corporate_employees record
4. **Policy assigned** by corporate admin
5. **Wallets initialized** for OPD/Wellness if applicable

## Future Enhancements

- [ ] Auto-verify employee ID via HRMS integration
- [ ] Bulk employee onboarding via CSV upload
- [ ] Corporate-specific benefit customization
- [ ] Family member limit validation based on corporate policy
- [ ] Employee lifecycle management (transfers, exits)
- [ ] Corporate wellness leaderboard

## Related Documentation

- [HEALTH_INSURANCE_COMPLETE_API.md](./HEALTH_INSURANCE_COMPLETE_API.md) - Complete insurance API reference
- [ADMIN_QUICKSTART.md](./ADMIN_QUICKSTART.md) - Admin dashboard setup
- [CRM_QUICKSTART.md](./CRM_QUICKSTART.md) - CRM system guide

---

**Last Updated:** December 21, 2024  
**Database Version:** PostgreSQL 15  
**API Version:** v1.0
