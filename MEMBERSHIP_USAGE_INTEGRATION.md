# Membership Plan Usage Integration

## Overview
This document describes how membership plan usage tracking is integrated into the Mediczy consultation flow.

## Architecture

### Backend Auto-Increment
When a doctor marks an appointment as "completed" via `/api/appointments/:id/status`, the backend automatically:
1. Updates the appointment status
2. Looks up the patient's active membership plan
3. Increments their teleconsult usage counter for that specialty
4. Enforces limits (won't increment if limit exceeded)

**Implementation:** `server/routes/appointment.route.js` - PATCH `/appointments/:id/status` route

### Client-Side Hooks
Two React Query hooks are provided for manual usage tracking:

```typescript
import { useIncrementTeleconsult, useIncrementBenefit } from '@/hooks/use-plan-usage';

// Increment teleconsult usage
const { mutate: incTele } = useIncrementTeleconsult();
incTele({ specialty: 'Cardiology', count: 1 });

// Increment monetary benefit usage
const { mutate: incBenefit } = useIncrementBenefit();
incBenefit({ type: 'pharmacyINR', amount: 500 });
```

### Live Usage Banner
The `MyPlans` page displays a live banner when usage data updates, automatically showing for 5 seconds after any change.

## Integration Points

### 1. Doctor Appointments Page
**File:** `client/src/pages/doctor/DoctorAppointments.tsx`

- When doctor updates status to "completed", the backend auto-increments patient usage
- Client hook is called optimistically for immediate UI feedback (doctor's own plan if applicable)

### 2. Patient Bookings Page
**File:** `client/src/pages/MyBookings.tsx`

- Usage is tracked server-side when appointment completes
- Patient sees updated usage in their `MyPlans` page after consultation
- Rating/feedback flow does not manually increment (already done server-side)

### 3. My Plans Page
**File:** `client/src/pages/MyPlans.tsx`

- Displays live usage banner on data refresh
- Shows remaining teleconsults per specialty
- Shows remaining monetary benefits (pharmacy, homecare, ambulance)
- Optimistic UI for subscription (immediate feedback)

## API Endpoints

### Usage Increment (Manual)
```
POST /api/membership/usage/teleconsult
Body: { specialty: string, count?: number }
Auth: Required (user token)
```

```
POST /api/membership/usage/benefit
Body: { type: 'pharmacyINR'|'homeCareINR'|'ambulanceINR', amount: number }
Auth: Required (user token)
```

### Status Update (Auto-increment)
```
PATCH /api/appointments/:id/status
Body: { status: string, notes?: string }
Auth: Required (doctor token)
Effect: Auto-increments patient usage if status='completed'
```

## Usage Flow

1. **Consultation Booking:** Patient books appointment (no usage increment)
2. **Consultation Start:** Doctor starts session, status → "in-progress" (no usage increment)
3. **Consultation Complete:** Doctor marks status → "completed"
   - Backend auto-increments patient's teleconsult usage
   - Patient's plan cache refreshes
4. **Usage Display:** Patient visits `MyPlans` page
   - Sees live banner "Plan Usage Updated"
   - Sees reduced remaining teleconsults
5. **Pharmacy/Service Purchase:** After purchase completion
   - Call `useIncrementBenefit({ type: 'pharmacyINR', amount: orderTotal })`
   - Usage tracked, limits enforced

## Error Handling

- If no active plan: usage increment silently fails (no blocking)
- If limit exceeded: returns 400 error, client shows toast
- Transaction-based updates prevent race conditions
- Failed increments don't block appointment status updates

## Testing

### Manual Test Flow
1. Create a membership plan in admin panel with teleconsult limits
2. Subscribe to plan as user
3. Book appointment with doctor
4. Doctor marks appointment as completed
5. Check `MyPlans` page - see usage updated
6. Verify banner appears and usage count decrements

### API Test
```bash
# Get current usage
curl -H "Authorization: Bearer USER_TOKEN" \
  http://localhost:8000/api/membership/my/usage

# Manually increment (for testing)
curl -X POST -H "Authorization: Bearer USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"specialty":"Cardiology","count":1}' \
  http://localhost:8000/api/membership/usage/teleconsult
```

## Future Enhancements

- [ ] Idempotency keys for retry safety
- [ ] Audit log for all usage increments
- [ ] Partial refunds (negative amounts with constraints)
- [ ] SMS/email notifications when limits nearly exceeded
- [ ] Usage analytics dashboard in admin panel
- [ ] Bulk usage import/export for migrations
