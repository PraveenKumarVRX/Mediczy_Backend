# Insurance Management System

## Overview
Complete insurance management system for Mediczy platform with providers, policies, user enrollments, and claims tracking.

## Database Models

### InsuranceProvider
Insurance companies offering policies
- Basic info: name, code, contact details, website, logo
- Network type: TPA, Direct, or Both
- Supported services: hospital, pharmacy, diagnostic, etc.
- Claim process timeline

### InsurancePolicy
Insurance plans offered by providers
- Policy details: name, number, type (Individual/Family/Group/Senior/Critical)
- Coverage: amount, premium, co-payment %, room rent limit
- Coverage details: hospitalization, pharmacy, diagnostics, ambulance
- Exclusions and waiting period
- Validity dates

### UserInsurance
User enrollment in insurance policies
- Enrollment and expiry dates
- Status: Active, Expired, Cancelled, Suspended, PendingRenewal
- Family members covered
- Claims tracking: amount used, count
- Policy documents and card images

### InsuranceClaim
Insurance claim submissions
- Claim number, dates, amounts (claimed/approved)
- Claim type: Hospitalization, Pharmacy, Diagnostic, Consultation, Ambulance, Other
- Status: Submitted → UnderReview → Approved/Rejected/PartiallyApproved → Settled
- Treatment details: date, hospital, diagnosis
- Supporting documents
- Processing notes and rejection reasons

## API Endpoints

### Admin Routes (Protected)
```
GET    /api/insurance/admin/providers        - List all providers
POST   /api/insurance/admin/providers        - Create provider
PUT    /api/insurance/admin/providers/:id    - Update provider
DELETE /api/insurance/admin/providers/:id    - Delete provider

GET    /api/insurance/admin/policies         - List all policies
POST   /api/insurance/admin/policies         - Create policy
PUT    /api/insurance/admin/policies/:id     - Update policy
DELETE /api/insurance/admin/policies/:id     - Delete policy

GET    /api/insurance/admin/enrollments      - List all user enrollments
GET    /api/insurance/admin/claims           - List all claims
PATCH  /api/insurance/admin/claims/:id/status - Update claim status
```

### User Routes
```
GET  /api/insurance/providers               - List active providers
GET  /api/insurance/policies/:providerId    - List policies by provider
GET  /api/insurance/my/insurances           - Get user's insurances
POST /api/insurance/claims                  - Submit a claim
```

## Admin UI Features

### Dashboard Stats
- Total providers count
- Total policies count
- Active enrollments count
- Pending claims count

### Providers Tab
- Grid view of all insurance providers
- Create/Edit/Delete providers
- Fields: name, code, contact info, website, network type, claim process days
- Active/Inactive status toggle
- Shows associated policies count

### Policies Tab
- List view of all insurance policies
- Create/Edit/Delete policies
- Fields: provider, policy name/number, type, coverage amount, premium
- Co-payment %, waiting period, room rent limit
- Coverage details and exclusions
- Active/Inactive status toggle

### Enrollments Tab
- View all user insurance enrollments
- Shows: user info, provider, policy, enrollment/expiry dates
- Status badges (Active/Expired/Cancelled/etc.)
- Claims usage tracking (amount + count)

### Claims Tab
- View all insurance claims
- Claim details: number, type, hospital, dates, amounts
- Status management with dropdown selector
- Quick status updates: Submitted → Under Review → Approved/Rejected → Settled
- Color-coded status badges

## Integration Points

### With User Module
- UserInsurance.userId links to User model
- Claims submitted by authenticated users
- User profile can display active insurances

### With Appointments
- Claims can be filed for consultation fees
- Appointment data can auto-populate claim details

### With Pharmacy/Diagnostic
- Claims for pharmacy purchases
- Claims for diagnostic tests
- Service integration for automatic claim generation

### With Payment Gateway
- Link insurance approvals to payment settlement
- Track approved amounts vs paid amounts

## Usage Flow

1. **Admin Setup:**
   - Create insurance providers (e.g., ICICI Lombard, Star Health)
   - Define policies with coverage amounts and limits
   - Set active/inactive status

2. **User Enrollment:**
   - Users browse active providers and policies
   - Subscribe to a policy (enrollment flow - to be implemented)
   - Receive enrollment number and policy documents

3. **Service Usage:**
   - User consults doctor/buys medicine/books diagnostic test
   - Generates bill/invoice with service details

4. **Claim Submission:**
   - User submits claim with:
     - Service details (date, hospital/pharmacy, diagnosis)
     - Bill amount
     - Supporting documents (prescription, reports, receipts)
   - Auto-generates claim number

5. **Claim Processing:**
   - Admin reviews claim → changes status to "Under Review"
   - Verifies documents and coverage
   - Approves/Rejects/Partially Approves claim
   - Sets approved amount
   - Marks as Settled after payment

6. **Tracking:**
   - User views claim status in real-time
   - Admin dashboard shows pending claims
   - Enrollment shows total claims used against coverage

## Files Created/Modified

### Backend
- ✅ `server/models/insurance.model.mariadb.js` - 4 models (Provider, Policy, UserInsurance, Claim)
- ✅ `server/routes/insurance.route.js` - Admin & user endpoints
- ✅ `server/app.js` - Imported models and mounted routes

### Frontend
- ✅ `client/src/pages/admin/AdminInsurance.tsx` - Full admin UI with tabs
- ✅ `client/src/routes/index.tsx` - Added insurance route
- ✅ `client/src/components/layout/AdminLayout.tsx` - Added "My Insurance" menu item

## Future Enhancements

- [ ] User insurance enrollment flow (select provider → choose policy → make payment → enroll)
- [ ] User "My Insurance" page to view active policies and submit claims
- [ ] Claim document upload with file storage (S3/Cloudinary)
- [ ] Auto-claim generation after service usage
- [ ] Insurance card QR code generation
- [ ] E-card download functionality
- [ ] Policy renewal reminders (email/SMS)
- [ ] Network hospital/pharmacy integration
- [ ] Cashless claim processing
- [ ] TPA integration APIs
- [ ] Family member management
- [ ] Pre-authorization requests
- [ ] Claim timeline tracking
- [ ] Document verification workflow
- [ ] Analytics dashboard (claims ratio, rejection reasons, popular policies)
- [ ] Bulk policy upload for corporate plans
