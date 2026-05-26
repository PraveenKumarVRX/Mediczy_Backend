# Technical Implementation Details - Bug Fixes

## Issue Analysis & Resolution

### 1. Authentication Token Management (Issue #1)

**Technical Details:**

- The `Index.tsx` component checks `userType` and stored tokens to route users
- Problem: Multiple token keys stored in localStorage from different login sessions
- Solution: Use `clearAuthTokens()` from auth hook which systematically removes all role-specific tokens

**Token Keys Cleared:**

```typescript
const ALL_TOKEN_KEYS = [
  "token",
  "doctorToken",
  "clinicToken",
  "labToken",
  "pharmacyToken",
  "hospitalToken",
  "corporateToken",
  "nurseToken",
  "assistantToken",
  "adminToken",
  "teamToken",
  "ambulanceToken",
  "homecareToken",
  "insuranceCompanyToken",
  "insuranceBrokerToken",
  "tpaToken",
  "psuToken",
  "insurerToken",
  "ngoToken",
];
```

**Affected Login Paths:**

1. `/users/login/verify-otp` - Line 122 in Login.tsx
2. Development bypass - Line 200 in Login.tsx
3. Standard login via `useLogin` hook - Already handles via `setAuthData()`

---

### 2. API Endpoint Routing (Issue #2)

**Technical Details:**

- The API utility in `/utils/api.ts` automatically appends `/api` to base URL
- Example: `BASE_URL = "http://localhost:8000/api"`
- When code calls `api.put("/api/users/profile", data)` it becomes:
  - `http://localhost:8000/api/api/users/profile` ❌ (WRONG)
- Should call `api.put("/users/profile", data)` which becomes:
  - `http://localhost:8000/api/users/profile` ✅ (CORRECT)

**API Utility Resolution Logic:**

```typescript
const resolveBaseURL = () => {
  // Ensures /api suffix is added if missing
  // Prevents double /api/ prefixes
  const ensureApiSuffix = (base: string) => {
    if (!path.includes("/api")) {
      url.pathname = `${path}/api`;
    }
    return trimmed;
  };
};
```

**Fix Applied:**

- Removed `/api` prefix from client-side endpoint paths in ProfileEnhanced.tsx
- Pattern: Use relative paths starting with `/users/`, `/doctors/`, etc.
- The API utility handles the `/api` prefix automatically

---

### 3. Notification System (Issue #3)

**Technical Details - Already Working Correctly:**

```typescript
// Filter state supports all three options
const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read'>('all');

// Filter logic correctly handles all cases
const filtered = notifications
  .filter((notification) => {
    if (filterStatus === 'unread') return !notification.read;
    if (filterStatus === 'read') return notification.read;
    return true; // 'all' case
  });

// UI buttons properly set filter state
<Button onClick={() => setFilterStatus('read')}>Read ({readCount})</Button>
```

**No code changes required** - The implementation is correct and functional.

---

### 4. Video Token Fetching (Issue #4)

**Technical Details:**

- LiveKit requires both `roomId` and `appointmentId` to generate valid tokens
- Original code silently returned when either was missing
- API errors weren't being properly captured or displayed to users

**Enhancement Made:**

```typescript
// Added validation with logging
if (!roomId || !appointmentIdFromUrl) {
  console.warn('🎥 Missing roomId or appointmentId', {
    roomId,
    appointmentIdFromUrl
  });
  return; // Exit early
}

// Better error capture
catch (error: any) {
  const errorMessage = error.response?.data?.message ||
                       error.message ||
                       'Failed to initialize video connection';
  toast({
    description: `${errorMessage}. Please try joining again or contact support.`
  });
}
```

**Debugging Features:**

- Console logs show exact missing parameters
- Toast messages include API-specific error details
- Development teams can now identify root cause from client logs

---

### 5. Diet Plan Personalization (Issue #5)

**Technical Details:**

- Component had `selectedPlan` state but personalized calculations weren't saved
- Calculations included:
  - BMI-based category recommendations
  - TDEE (Total Daily Energy Expenditure) calculation
  - Personalized meal suggestions
  - Adjusted daily calorie targets

**Problem Flow (Before):**

```typescript
const plan = { ...dietPlans[type] };
plan.suggestions = getPersonalizedSuggestions(...); // ← Calculated
plan.dailyCalories = Math.max(1200, calculatedTDEE - 500); // ← Calculated

setSelectedPlan(type); // ← Only type stored
// plan object is immediately lost! ❌
```

**Solution (After):**

```typescript
const plan = { ...dietPlans[type] };
plan.suggestions = getPersonalizedSuggestions(...);
plan.dailyCalories = Math.max(1200, calculatedTDEE - 500);

setSelectedPlan(type);
setPersonalizedPlan(plan); // ← Store complete plan! ✅

// UI uses personalized data if available
const displayPlan = personalizedPlan || dietPlans[selectedPlan];
```

**TDEE Calculation:**

```typescript
const calculateTDEE = () => {
  const weightNum = parseFloat(weight);
  const heightInCm = getHeightInCm();
  const ageNum = parseFloat(age);

  if (!weightNum || !heightInCm || !ageNum) return null;

  // Mifflin-St Jeor formula for BMR
  const bmr =
    gender === "male"
      ? 10 * weightNum + 6.25 * heightInCm - 5 * ageNum + 5
      : 10 * weightNum + 6.25 * heightInCm - 5 * ageNum - 161;

  // Apply activity multiplier
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9,
  };

  return Math.round(bmr * multipliers[activityLevel]);
};
```

---

### 6. Appointment Navigation (Issue #6)

**Technical Details - Already Working Correctly:**

```typescript
// Book Follow-up button uses correct dynamic navigation
const handleFollowUp = () => {
  const doctorId = appointment.doctor.id;
  if (!doctorId) {
    toast({
      title: "Unable to book follow-up",
      description: "Doctor details are missing",
    });
    return;
  }
  navigate(`/consultation/${doctorId}`); // ✅ Correct routing
};
```

**No code changes needed** - Implementation already handles this correctly.

---

### 7. Lab Test Filter UX (Issue #7)

**Technical Details:**

- Stat cards need visual feedback to indicate they're interactive
- Required CSS classes and click handlers

**CSS/UX Improvements:**

```typescript
// Added interactive styling
className="...
  cursor-pointer           // Shows clickable cursor
  hover:shadow-lg         // Provides hover feedback
  transition-shadow       // Smooth animation
"
onClick={() => setFilterStatus('all')} // Sets filter
```

**Filter Status Values:**

```typescript
type FilterStatus = 'all' | 'pending' | 'in_progress' | 'completed';

// Each stat card maps to filter value
- Total Tests → 'all'
- Pending → 'pending'
- In Progress → 'in_progress'
- Completed → 'completed'
```

---

### 8. Error Response Handling (Issue #8)

**Technical Details:**

- Different API versions return data in different formats
- Need to handle multiple response structures gracefully

**Response Format Handling:**

```typescript
// Format 1: Success wrapper with data array
if (response.data?.success && response.data?.data) {
  setReports(response.data.data);
}
// Format 2: Direct array response
else if (Array.isArray(response.data)) {
  setReports(response.data);
}
// Format 3: Reports property
else if (response.data?.reports) {
  setReports(response.data.reports);
}
// Format 4: Unexpected
else {
  console.error("Unexpected response format:", response.data);
  setReports([]);
}
```

**Error Detail Extraction:**

```typescript
// Multi-level fallback for error messages
const errorMessage =
  error.response?.data?.message || // API error message
  error.message || // HTTP error
  "Failed to load reports"; // Default message

toast({
  variant: "destructive",
  title: "Error",
  description: errorMessage, // ← User sees specific error
});
```

---

## Code Quality Patterns

### 1. Error Handling Best Practices

```typescript
try {
  // Main logic
} catch (error: any) {
  // Specific error extraction
  const errorMsg =
    error.response?.data?.message || error.message || "Default error";

  // User-facing toast
  toast({
    variant: "destructive",
    title: "Error",
    description: errorMsg,
  });

  // Dev-facing console log
  console.error("Context:", error);
}
```

### 2. State Management for Derived Data

```typescript
// When storing derived/calculated data
const [baseData, setBaseData] = useState(defaultValue);
const [derivedData, setDerivedData] = useState<Type | null>(null);

const handleCalculate = (input: Input) => {
  const calculated = performCalculation(input);
  setBaseData(newValue);
  setDerivedData(calculated); // ← Always store derived data!
};

// In UI - use derived with fallback
const displayData = derivedData || baseData;
```

### 3. API Response Resilience

```typescript
// Handle multiple response structures
const extractData = (response: any) => {
  // Try primary structure
  if (response?.success && response?.data) return response.data;
  // Try secondary structures
  if (Array.isArray(response)) return response;
  if (response?.items) return response.items;
  // Fallback
  return [];
};
```

---

## Performance Considerations

### Authentication Token Clearing

- `clearAuthTokens()` removes ~20 tokens from localStorage
- Minimal performance impact (localStorage operations are O(1))
- Only runs on login/logout, not on every render

### State Optimization

- Added `personalizedPlan` state reduces recalculations
- Uses memoized `getPersonalizedSuggestions()` function
- Avoids recalculating on every render

### API Response Handling

- Multiple format support adds minimal overhead
- Try-catch blocks are fast for success paths
- Only exception handling (error case) has overhead

---

## Browser Compatibility

All fixes use standard JavaScript/React patterns compatible with:

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

No polyfills required for:

- `Array.isArray()`
- Optional chaining (`?.`)
- Nullish coalescing (`??`)
- `localStorage`

---

## Testing Strategy

### Unit Tests

```typescript
// Test personalized plan calculation
test('handlePlanChange stores personalized plan', () => {
  const component = render(<Diet />);
  fireEvent.change(weightInput, { target: { value: '75' } });
  fireEvent.change(heightInput, { target: { value: '175' } });
  fireEvent.click(weightLossTab);

  expect(personalizedPlan).not.toBeNull();
  expect(personalizedPlan.dailyCalories).toBeLessThan(defaultPlan.dailyCalories);
});
```

### Integration Tests

```typescript
// Test API endpoint routing
test("profile update uses correct API path", () => {
  const mockApi = jest.fn();
  fireEvent.click(saveButton);

  expect(mockApi).toHaveBeenCalledWith("/users/profile", data);
  expect(mockApi).not.toHaveBeenCalledWith("/api/users/profile", data);
});
```

### E2E Tests

```typescript
// Test complete user flow
test("user login redirects to dashboard not lab", () => {
  cy.visit("/login");
  cy.get("[name=email]").type("user@example.com");
  cy.get("[name=password]").type("Password123");
  cy.get("[type=submit]").click();

  cy.url().should("eq", "/");
  cy.url().should("not.contain", "/lab/dashboard");
});
```

---

## Documentation References

- [Auth Hook Documentation](/home/ubuntu/Mediczy/client/src/hooks/auth.ts)
- [API Utility Documentation](/home/ubuntu/Mediczy/client/src/utils/api.ts)
- [Component Architecture](/home/ubuntu/Mediczy/docs/ARCHITECTURE.md)

---

**Technical Review Completed:** February 4, 2026  
**Verified By:** Code Analysis & Manual Testing
