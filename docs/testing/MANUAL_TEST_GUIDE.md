# MEDICZY MOBILE APP - MANUAL TESTING GUIDE

## Quick Start

**APK Download:** http://13.234.17.52/app-release.apk (115 MB)
**Installation:** Install APK on Android device/emulator

---

## TEST PATH 1: NEW FEATURES WALKTHROUGH (15 min)

### Step 1: Sign In
```
Email: test@mediczy.com
Password: Test@1234
```
✓ Verify: No errors, HOME screen loads

### Step 2: Profile → Membership Card
```
Expected:
- Card displays with gradient background (purple/blue)
- Shows: Member name, ID, plan name, validity date
- "View All Plans & Upgrade" button
```
✓ PASS/FAIL: ___

### Step 3: Profile → ABHA Health ID
```
Action 1: Enter 10-digit mobile number
Action 2: Tap "Send OTP"
Expected: OTP input appears, "Resend OTP" button visible
Action 3: Enter any 4+ digit code
Action 4: Tap "Verify & Link ABHA"
Expected: ABHA card displays with ID
```
✓ PASS/FAIL: ___

### Step 4: Profile → Scan & Share Reports
```
Expected:
- List of reports (if any exist)
- Quick action bar: Camera, Gallery, Share, AI Analyze
- "Upload First Report" CTA if empty
Action: Tap "AI Analyze" on any report (if exists)
Expected: Alert shows analysis
```
✓ PASS/FAIL: ___

### Step 5: Profile → Health Risk Assessment
```
Expected: Question 1 displayed with options
Action: Tap any option
Expected: Progress bar updates, "Next" button enables
Action: Continue clicking Next for all 10 questions
Expected: "Get Results" button appears on question 10
Action: Tap "Get Results"
Expected: Results screen with risk score (0-100)
```
✓ PASS/FAIL: ___

### Step 6: Profile → Health Feed
```
Expected:
- Daily tip banner at top (auto-rotates every 5 sec)
- Category filter chips (All, Nutrition, Fitness, etc.)
- Featured card "Take Assessment"
- 8+ article cards below
Action: Click category "Fitness"
Expected: Articles filtered to fitness only
Action: Tap "Read More" on any article
Expected: No crash, article preview appears
```
✓ PASS/FAIL: ___

---

## TEST PATH 2: NAVIGATION VERIFICATION (10 min)

### From Home Screen:
```
1. Tap Hamburger icon (top-left)
   Expected: Sidebar drawer opens

2. In Sidebar, tap "Health Feed"
   Expected: HealthFeed screen appears

3. Tap back arrow (top-left)
   Expected: Returns to Home

4. Tap "Health Diary" quick action
   Expected: Navigates to GoogleFitScreen
```
✓ PASS/FAIL: ___

### From Sidebar (Open drawer again):
```
HEALTH TOOLS section should show:
├─ Health Feed
├─ Health Risk Check
├─ ABHA Health ID
└─ Scan & Share Reports

Action: Tap each item
Expected: Each navigates to correct screen without errors
```
✓ PASS/FAIL: ___

### From Profile Screen:
```
Expected menu items include:
- Membership Card
- Order History
- Health Feed
- ABHA Health ID
- Scan & Share Reports
- Health Risk Assessment

Action: Tap each NEW item (6 total)
Expected: Each navigates to correct screen
```
✓ PASS/FAIL: ___

---

## TEST PATH 3: BUTTON INTERACTION TESTING (20 min)

### Home Screen:
```
Button 1: Health Diary (Quick Action)
  → Tap → Should navigate to GoogleFitScreen
  ✓ PASS/FAIL: ___

Button 2: Pull-to-Refresh
  → Pull down → Dashboard data reloads
  ✓ PASS/FAIL: ___

Button 3: Hamburger Menu
  → Tap → Sidebar opens
  ✓ PASS/FAIL: ___

Button 4: Notifications Bell
  → Tap → Notifications screen appears
  ✓ PASS/FAIL: ___
```

### Profile Screen:
```
Button 1: Edit Profile
  → Tap → Modal appears with form
  → Fill name/email
  → Tap Submit
  Expected: No crash, profile updates
  ✓ PASS/FAIL: ___

Button 2: Logout (bottom of menu)
  → Tap → Confirmation dialog
  → Tap Yes
  Expected: Returns to SignIn screen
  ✓ PASS/FAIL: ___
```

### Membership Card:
```
Button 1: Back
  → Tap → Returns to Profile
  ✓ PASS/FAIL: ___

Button 2: View All Plans & Upgrade
  → Tap → Should navigate to Benefits screen
  ✓ PASS/FAIL: ___
```

### ABHA Screen:
```
Button 1: Send OTP
  → Enter phone number (10 digits)
  → Tap Send OTP
  Expected: OTP input appears
  ✓ PASS/FAIL: ___

Button 2: Verify & Link ABHA
  → Enter OTP (any 4+ digits)
  → Tap Verify
  Expected: ABHA card displays
  ✓ PASS/FAIL: ___
```

### Health Risk Assessment:
```
Question Flow:
  → Tap any option
  → Progress bar updates
  → "Next" button enables
  → Tap Next
  → Repeat for all 10 questions
  → On Q10: "Get Results" appears
  → Tap Get Results
  Expected: Results page with score, level, factors
  ✓ PASS/FAIL: ___

Retake Button:
  → Tap "Retake Assessment"
  Expected: Returns to Q1
  ✓ PASS/FAIL: ___
```

---

## TEST PATH 4: FORM VALIDATION (10 min)

### Sign In Screen:
```
Test 1: Empty email → Tap Login
  Expected: Error message ("Email required")
  ✓ PASS/FAIL: ___

Test 2: Invalid email → Enter "abc" → Tap Login
  Expected: Error message ("Invalid email format")
  ✓ PASS/FAIL: ___

Test 3: Empty password → Tap Login
  Expected: Error message ("Password required")
  ✓ PASS/FAIL: ___
```

### ABHA Screen:
```
Test 1: Mobile number < 10 digits → Tap "Send OTP"
  Expected: Button disabled or error
  ✓ PASS/FAIL: ___

Test 2: OTP < 4 digits → Tap "Verify"
  Expected: Button disabled or error
  ✓ PASS/FAIL: ___
```

### Profile Edit:
```
Test 1: Clear name field → Tap Submit
  Expected: Error message
  ✓ PASS/FAIL: ___

Test 2: Enter name, change email → Tap Submit
  Expected: Profile updates
  ✓ PASS/FAIL: ___
```

---

## TEST PATH 5: ERROR SCENARIOS (10 min)

### Test 1: API Timeout
```
Action: Open MembershipCard while in airplane mode
Expected: Shows fallback values or spinner then timeout
✓ PASS/FAIL: ___
```

### Test 2: Empty Data
```
Action: Open ScanAndShare (if no reports)
Expected: Shows "Upload First Report" CTA, no crash
✓ PASS/FAIL: ___
```

### Test 3: Network Recovery
```
Action 1: Enable airplane mode
Action 2: Try to load profile
Expected: Error message
Action 3: Disable airplane mode
Action 4: Pull-to-refresh or reload
Expected: Data loads successfully
✓ PASS/FAIL: ___
```

---

## TEST PATH 6: CROSS-PLATFORM CHECKS (5 min)

### Portrait Mode:
```
Action: Open any new screen in portrait
Expected: Content fits without scroll or is properly scrollable
✓ PASS/FAIL: ___
```

### Landscape Mode:
```
Action: Rotate device to landscape on each new screen
Expected: Layout adapts, no text cutoff or overlap
✓ PASS/FAIL: ___
```

### Bottom Sheet/Modal:
```
Action: Open Profile edit modal
Expected: Appears on top of background, dismissible
Action: Tap outside modal
Expected: Modal closes
✓ PASS/FAIL: ___
```

---

## ENDPOINT TESTING CHECKLIST

### Auth Endpoints:
- [ ] POST /users/login → Returns bearer token
- [ ] POST /users/register/send-otp → OTP sent (ABHA screen)
- [ ] POST /users/change-password → Password updated

### User Endpoints:
- [ ] GET /users/profile → User data + subscription
- [ ] PUT /users/profile → Profile updated (Edit form)

### Report Endpoints:
- [ ] GET /reports → Reports list displayed
- [ ] POST /reports/{id}/analyze → Analysis shown in alert

### Health Endpoints:
- [ ] GET /health/vitals → Vitals displayed on Home
- [ ] GET /health/dashboard → Dashboard data loaded

### AI Endpoints:
- [ ] POST /ai-health/chat → Risk assessment results returned

### Family Endpoints:
- [ ] GET /family-members → List displayed
- [ ] POST /family-members → Member added
- [ ] PUT /family-members/{id} → Member edited
- [ ] DELETE /family-members/{id} → Member deleted

---

## BACKEND QA QUICK CHECKLIST (Auth + AI Scribe)

Use this section to validate the issues raised in manual QA around invalid credentials, 429 lockouts, and AI scribe behavior.

### Preconditions

1. Ensure backend health is OK:

```bash
BASE='http://127.0.0.1:8888'
curl -s -w '\n%{http_code}\n' "$BASE/health"
```

Expected: JSON response and status code 200.

2. If credentials/rate-limit state seems stale, reset QA auth state:

```bash
cd /home/ubuntu/Mediczy/server
npm run fix:qa-login-blockers:ssm
```

Expected: script reports created/updated QA accounts and cleared local rate-limit keys.

### Portal Login Verification Matrix

Run each command and confirm HTTP 200 with success message.

Doctor:

```bash
BASE='http://127.0.0.1:8888'
curl -s -w '\n%{http_code}\n' -X POST "$BASE/api/doctors/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"doctor@mediczy.com","password":"Doctor123"}'
```

Lab:

```bash
BASE='http://127.0.0.1:8888'
curl -s -w '\n%{http_code}\n' -X POST "$BASE/api/lab/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa.lab@mediczy.com","password":"QaLab@123"}'
```

Pharmacy:

```bash
BASE='http://127.0.0.1:8888'
curl -s -w '\n%{http_code}\n' -X POST "$BASE/api/pharmacy/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa.pharmacy@mediczy.com","password":"QaPharm@123"}'
```

Nurse:

```bash
BASE='http://127.0.0.1:8888'
curl -s -w '\n%{http_code}\n' -X POST "$BASE/api/nurse/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa.nurse@mediczy.com","password":"QaNurse@123"}'
```

Hospital:

```bash
BASE='http://127.0.0.1:8888'
curl -s -w '\n%{http_code}\n' -X POST "$BASE/api/hospital/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa.hospital@mediczy.com","password":"QaHosp@123"}'
```

### AI Scribe Validation

1. Fetch doctor token:

```bash
BASE='http://127.0.0.1:8888'
LOGIN=$(curl -s -X POST "$BASE/api/doctors/login" -H 'Content-Type: application/json' -d '{"email":"doctor@mediczy.com","password":"Doctor123"}')
TOKEN=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.token||'')}catch(e){console.log('')}})")
echo "$TOKEN"
```

Expected: non-empty JWT token string.

2. Autocomplete endpoint:

```bash
BASE='http://127.0.0.1:8888'
curl -s -w '\n%{http_code}\n' -G "$BASE/api/ai/scribe/autocomplete" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'q=headache'
```

Expected: status 200 and success true.

3. Generate prescription (correct payload field):

```bash
BASE='http://127.0.0.1:8888'
curl -s -w '\n%{http_code}\n' -X POST "$BASE/api/ai/scribe/generate-prescription" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"consultationNotes":"Patient with fever and cough for 3 days. advised paracetamol 650 mg three times daily after food for 3 days.","saveToDatabase":false,"language":"en"}'
```

Expected: status 200 and success true.

4. Negative contract check (required-field behavior):

```bash
BASE='http://127.0.0.1:8888'
curl -s -w '\n%{http_code}\n' -X POST "$BASE/api/ai/scribe/generate-prescription" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"notes":"This should fail because consultationNotes is missing"}'
```

Expected: status 400 with code NOTES_REQUIRED.

### Execution Result Sheet (Single Screenshot Friendly)

| Check | Expected | Actual Status | PASS/FAIL |
|---|---|---|---|
| Health endpoint | 200 | ___ | ___ |
| Doctor login | 200 + login success message | ___ | ___ |
| Lab login | 200 + login success message | ___ | ___ |
| Pharmacy login | 200 + success true | ___ | ___ |
| Nurse login | 200 + nurse login success message | ___ | ___ |
| Hospital login | 200 + login success message | ___ | ___ |
| AI autocomplete | 200 + success true | ___ | ___ |
| AI generate prescription | 200 + success true | ___ | ___ |
| AI generate negative check | 400 + code NOTES_REQUIRED | ___ | ___ |

Tester: __________  Date: __________  Environment: __________

---

## CRASH TESTING

**Try these to ensure no crashes:**

1. Open Membership Card, force close app, reopen
   Expected: No crash ✓ PASS/FAIL: ___

2. Rapid tap buttons 10 times quickly
   Expected: No crash or duplicate submissions ✓ PASS/FAIL: ___

3. Rotate screen during API call
   Expected: Call continues, no crash ✓ PASS/FAIL: ___

4. Alt+Tab out and back into app
   Expected: App state preserved, no crash ✓ PASS/FAIL: ___

5. Submit form multiple times without waiting
   Expected: No crash, only 1 submission ✓ PASS/FAIL: ___

---

## FINAL CHECKLIST

- [ ] All 5 new screens accessible and load without errors
- [ ] All buttons respond to taps
- [ ] Navigation works in all directions
- [ ] Forms validate correctly
- [ ] API calls return expected data
- [ ] Error states display gracefully
- [ ] No crashes during any interaction
- [ ] UI looks consistent across screens
- [ ] Branding colors applied correctly
- [ ] Font sizes readable on all screens

---

## SIGN-OFF

**Tested by:** _______________
**Date:** _______________
**Device:** Android _______ (Version)
**Overall Status:** ☐ PASS ☐ FAIL ☐ NEEDS FIXES

**Notes:**
_________________________________________________________________________
_________________________________________________________________________

