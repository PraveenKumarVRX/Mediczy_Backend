# Mediczy Patient Portal — UX Implementation Plan

**Date:** 2026-06-02  
**Owner:** AI CTO Team / UX Research  
**Source Audit:** June 2026 full patient portal audit (login → dashboard → all 25+ patient pages)  
**Current UX Score:** 58 / 100  
**Target UX Score:** 80 / 100 (Sprint 1–3), 90+ (Sprint 4–6)  
**Benchmark:** Epic MyChart, Apollo 247, Apple Health

---

## Design Mandate

> Every screen a patient sees must answer three questions in under 3 seconds:  
> **Where am I? What can I do here? What should I do next?**

Every change in this document serves one of five outcomes:

| Outcome | Why it matters in healthcare UX |
|---|---|
| Reduce friction | Sick or anxious users abandon at the first obstacle |
| Build trust | Patients share the most sensitive data they own — the UI must earn it |
| Communicate clearly | Ambiguous health information causes anxiety or missed action |
| Recover gracefully | Network failures are common; silent failure is unacceptable |
| Perform on mobile | 70%+ of Indian users are phone-first; desktop-first layouts fail them |

---

## Sprint Plan Overview

| Sprint | Theme | UX Score Gain | Estimated Effort |
|---|---|---|---|
| Sprint 1 | Navigation IA + empty/error states | +8 pts | 1–2 weeks |
| Sprint 2 | Dashboard live data + auth hardening | +6 pts | 1–2 weeks |
| Sprint 3 | Page-level UX fixes (lab, pharmacy, reports, claims) | +5 pts | 2 weeks |
| Sprint 4 | Mobile bottom nav + global search | +6 pts | 2 weeks |
| Sprint 5 | Accessibility (WCAG AA) + performance | +5 pts | 2 weeks |
| Sprint 6 | Trust signals + AI result context + sharing | +4 pts | 1–2 weeks |

---

## Sprint 1 — Navigation IA + Empty/Error States

**Goal:** Users can find any feature in ≤ 2 taps. No page ever shows a blank or opaque error.

### 1.1 Sidebar Consolidation

**File:** `client/src/components/layout/Sidebar.tsx`  
**Problem:** 33 visible menu items across 6 unlabelled categories. No user needs 33 top-level destinations. Epic MyChart has 7; Apple Health has 5.  
**Acceptance criteria:**
- Sidebar has exactly 7 top-level sections
- All 33 current destinations reachable within the 7 sections (none removed, just grouped)
- Each section label uses patient language, not system/technical language
- Sections can expand/collapse (accordion pattern)
- Active sub-item is highlighted, parent section stays open

**New structure:**

```
🏠  Home                    → /
❤️  My Health               → /health-dashboard, /health-intelligence, /health-diary,
                               /health-risk-assessment, /health-tracker, /sib-control (admin only),
                               /patient/vital-reports, /patient/watch-analytics, /diet, /health-feed
📅  Care                    → /appointments, /doctors, /consultation, /my-prescriptions,
                               /patient/lab-tests, /report-scanner, /symptom-checker, /ai-doctor,
                               /smart-care-navigator, /smart-opd
💊  Pharmacy                → /patient/pharmacy
🛡️  Insurance & Benefits    → /my-insurance, /patient/claims-express, /claims-management,
                               /buy-insurance, /benefits, /patient/smart-benefits, /ayushman
👨‍👩‍👧  Family                 → /family-hub
💳  Wallet & Plans          → /wallet, /my-plans, /membership-card, /wellness-rewards,
                               /billing/orders, /billing/invoices, /patient/gamification,
                               /wellness-calendar

    ── footer ──────────────
🔔  Notifications            → /patient/notifications
👤  My Profile              → /profile
🙋  Help & Contact           → /help, /contact-us
```

**Rename map (internal label → patient-facing label):**

| Current | New |
|---|---|
| Health Intelligence | My Health Score |
| Health Risk Assessment | Risk Check |
| SIB Control | *(admin only — hidden for patients)* |
| Smart Benefits Hub | My Benefits |
| Claims Express | File a Claim |
| Vital Reports | My Vitals |
| AI Report Scanner | Scan a Report |
| Watch Analytics | My Wearables |
| Smart Care Navigator | Care Guide |
| Smart OPD | Find the Right Doctor |
| Health Feed | Health Tips |
| Wellness Rewards | Rewards & Streaks |

---

### 1.2 Empty State System

**Files:** All pages in `client/src/pages/patient/`  
**Problem:** Pages show blank white areas, zero-line charts, or no content when data is unavailable.  
**Rule:** Every list, table, or chart must have an explicit empty state with: (1) an icon or illustration, (2) a human-language explanation, (3) a single CTA.

**Standard empty-state component to create:**

**File to create:** `client/src/components/ui/EmptyState.tsx`

```tsx
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href?: string; onClick?: () => void };
}
```

Usage pattern:
```tsx
<EmptyState
  icon={FileText}
  title="No reports yet"
  description="Upload your first medical report to keep your records in one place."
  action={{ label: "Upload a report", href: "/patient/my-reports" }}
/>
```

**Per-page empty state requirements:**

| Page | Trigger | Icon | Title | Description | CTA |
|---|---|---|---|---|---|
| My Reports | No reports | `FileText` | No reports yet | Upload your first medical report to keep your records in one place | Upload a report |
| Lab Tests | No test history | `TestTube` | No lab tests yet | Book your first test and get results directly here | Book a test |
| Pharmacy | No order history | `Pill` | No orders yet | Search for medicines and place your first order | Browse medicines |
| Pharmacy search | 0 results | `SearchX` | Nothing found for "{query}" | Try a shorter name or check the spelling | Browse categories |
| Appointments | No upcoming | `Calendar` | No upcoming appointments | Book a consultation with a doctor at your convenience | Find a doctor |
| Prescriptions | No prescriptions | `ClipboardList` | No prescriptions yet | Prescriptions from your consultations will appear here | Book a consultation |
| Watch Analytics | No device | `Watch` | No wearable connected | Connect a fitness tracker to see your health trends | Connect a device |
| Vital Reports | No vitals | `Activity` | No vitals recorded | Log your blood pressure, glucose, and other vitals to track trends | Log vitals |
| Family Hub | No members | `Users` | Just you for now | Add family members to track everyone's health in one place | Add a family member |
| Network Hospitals | Location denied | `MapPin` | Location needed | We need your location to show nearby hospitals | Allow location |
| Claims | No claims | `Shield` | No claims filed | Your insurance claims will appear here once submitted | File a claim |
| Notifications | No notifications | `Bell` | You're all caught up | New health alerts and appointment reminders will appear here | — |

---

### 1.3 Error State System

**Files:** All pages, all API call sites  
**Problem:** API failures show a toast that disappears in 3 seconds with no recovery path. The page stays blank or shows stale data.  
**Rule:** Every API-dependent section must have an inline error state with a retry button. Toasts are for confirmations only — not for errors on primary content.

**Standard error-state component to create:**

**File to create:** `client/src/components/ui/InlineError.tsx`

```tsx
interface InlineErrorProps {
  message?: string;
  onRetry?: () => void;
}
```

Renders:
```
⚠  Couldn't load your reports.        [Try again]
   Check your connection and retry.
```

**Migration pattern for existing pages:**

Before (current pattern):
```tsx
const { data, isLoading, isError } = useQuery(...)
// ...
{isError && <></> /* nothing shown */}
```

After (required pattern):
```tsx
{isError && (
  <InlineError
    message="Couldn't load your lab results."
    onRetry={() => refetch()}
  />
)}
```

**Specific high-priority pages to update first:**

1. `LabTests.tsx` — payment confirmation + test booking
2. `Pharmacy.tsx` — medicine search + order history
3. `MyReports.tsx` — report list + upload
4. `SmartHealthDashboard.tsx` — AI score + insights
5. `WatchAnalytics.tsx` — device data charts
6. `DeviceIntegration.tsx` — Bluetooth pairing errors
7. `ClaimsExpress.tsx` — claim submission

---

## Sprint 2 — Dashboard Live Data + Auth Hardening

### 2.1 Replace Hardcoded Health Stats with Live Data

**File:** `client/src/pages/Index.tsx`  
**Severity:** Patient safety concern — displaying wrong health numbers.  
**Problem:** Steps (6,542), Heart Rate (72 bpm), Sleep (7.2 hours), Water (5/8 glasses), Calories (1,850) appear to be static demo values rendered for all users.

**Required change:**
- Fetch real data from `GET /health-data/summary` on mount
- Show skeleton loaders while fetching (already have `Skeleton` component)
- If no device connected, show the empty state: *"Connect a wearable to see real-time stats"* with CTA to `/patient/device-integration`
- Add last-updated timestamp under each metric: *"Updated 4 minutes ago"*
- Add a refresh button (↺) in the section header

**Data contract expected from `GET /health-data/summary`:**
```json
{
  "steps": { "value": 6542, "goal": 10000, "updatedAt": "2026-06-02T09:30:00Z" },
  "heartRate": { "value": 72, "unit": "bpm", "updatedAt": "..." },
  "sleep": { "value": 7.2, "unit": "hours", "updatedAt": "..." },
  "water": { "value": 5, "goal": 8, "unit": "glasses", "updatedAt": "..." },
  "calories": { "value": 1850, "goal": 2200, "updatedAt": "..." }
}
```

If the endpoint is not yet live, show explicit placeholder:
```tsx
<EmptyState
  icon={Activity}
  title="No health data yet"
  description="Connect a wearable or log your vitals to see your daily stats here."
  action={{ label: "Connect a device", href: "/patient/device-integration" }}
/>
```

---

### 2.2 Dashboard Last-Updated Timestamps

**File:** `client/src/pages/Index.tsx`  
**Add to every data widget section header:**

```tsx
<div className="flex items-center justify-between">
  <h2 className="text-sm font-semibold text-slate-500">Health Stats</h2>
  <div className="flex items-center gap-2">
    <span className="text-xs text-slate-400">Updated {timeAgo(lastSyncedAt)}</span>
    <button onClick={refetch} className="text-slate-400 hover:text-teal-500">
      <RefreshCw className="w-3.5 h-3.5" />
    </button>
  </div>
</div>
```

---

### 2.3 Proactive Session Expiry Warning

**File:** `client/src/auth/AuthProvider.tsx`  
**Problem:** JWT expiry is discovered only when a 401 comes back from an API mid-session. The user loses in-progress work and is redirected silently.

**Required implementation:**

```tsx
// In AuthProvider, after decoding the token:
useEffect(() => {
  if (!token) return;
  try {
    const { exp } = jwtDecode(token);
    const msUntilExpiry = exp * 1000 - Date.now();
    const msUntilWarning = msUntilExpiry - 5 * 60 * 1000; // warn 5 min before

    if (msUntilWarning <= 0) return; // already close to expiry

    const warningTimer = setTimeout(() => {
      setShowSessionWarning(true);
    }, msUntilWarning);

    return () => clearTimeout(warningTimer);
  } catch {}
}, [token]);
```

**Warning banner UI** (show as a sticky bottom bar, not a modal):
```
🔒  Your session expires in 5 minutes.        [Stay signed in]  [Sign out]
```

Clicking "Stay signed in" triggers `POST /auth/refresh` silently. If refresh fails, redirect to login with message: *"Your session expired. Sign in to continue."*

---

### 2.4 Login Error Message Improvements

**File:** `client/src/auth/Login.tsx`  
**Change the error message map:**

| API error code | Current message | New message |
|---|---|---|
| `INVALID_CREDENTIALS` | "Invalid credentials. Please try again." | "We couldn't find an account with those details. Check your email or [reset your password]." |
| `ACCOUNT_INACTIVE` (expired) | Generic | "Your membership has expired. [Renew your plan →]" |
| `ACCOUNT_INACTIVE` (no plan) | Generic | "You need an active plan to sign in. [Choose a plan →]" |
| `ACCOUNT_SUSPENDED` | Generic | "Your account has been suspended. Contact support at support@mediczy.com." |
| Network error | Nothing | "No connection. Check your internet and try again." |

**After 2 failed password attempts**, add below the password field:
```tsx
{failedAttempts >= 2 && (
  <p className="text-xs text-slate-500 mt-1">
    Having trouble? <Link to="/user/forgot-password" className="text-teal-600 underline">Reset your password</Link>
  </p>
)}
```

---

### 2.5 OTP Login Step Transition

**File:** `client/src/auth/Login.tsx`  
**Problem:** Switch from email input to OTP entry is abrupt — no animation, no delivery confirmation.

**Required changes:**
1. Add a slide-left transition between Step 1 (enter email) and Step 2 (enter OTP)
2. Add a delivery confirmation above the OTP input:
   ```tsx
   <p className="text-sm text-slate-600">
     6-digit code sent to <strong>{maskEmail(identifier)}</strong>
   </p>
   ```
3. Helper `maskEmail("shyam@gmail.com")` → `"sh***@gmail.com"`
4. Add OTP expiry indicator: *"Code expires in 9:45"* with a countdown

---

## Sprint 3 — Page-Level UX Fixes

### 3.1 Lab Tests — Payment Confirmation & Result ETA

**File:** `client/src/pages/patient/LabTests.tsx`

**Issues to fix:**

**A. Payment confirmation is unclear after Razorpay redirect**  
After `razorpay.verify` succeeds, show an explicit confirmation card:
```
✅  Test Booked
    Thyroid Profile (T3, T4, TSH)
    Home collection: Thu 5 Jun, 7:00–9:00 AM
    Results expected by: Fri 6 Jun, 6:00 PM
    Booking ID: LAB-2026-00482
    [View Booking]  [Download Receipt]
```

**B. No result delivery ETA shown**  
Add `resultEta` field to the lab test booking response. Display: *"Results expected by [date]"* on the booked test card.

**C. No file size warning before upload**  
If the page accepts report uploads, add before upload:
```tsx
if (file.size > 10 * 1024 * 1024) {
  toast({ title: "File too large", description: "Maximum upload size is 10 MB. Please compress the file." });
  return;
}
```

---

### 3.2 Pharmacy — Cart Persistence + Prescription Gate

**File:** `client/src/pages/patient/Pharmacy.tsx`

**A. Cart persistence across sessions**  
- Save cart to `localStorage` (key: `pharmacyCart_{userId}`) on every cart mutation
- Restore from `localStorage` on component mount
- Show a toast when restoring: *"Your cart from your last visit has been restored."*

**B. Prescription requirement flag — surface at product level, not checkout**  
- Add a `requiresPrescription: boolean` field to the medicine search response
- Display a small `Rx` badge on medicines that require a prescription
- Show a tooltip on hover: *"Prescription required. You can upload it at checkout."*
- Do NOT block add-to-cart; block checkout if Rx items present without upload

**C. No medicine substitute shown when out of stock**  
- When `inStock: false`, show: *"Out of stock. Similar medicines:"* with 2–3 alternatives
- API: `GET /pharmacy/medicines/{id}/alternatives`

---

### 3.3 My Reports — Folder System + Sharing

**File:** `client/src/pages/patient/MyReports.tsx`

**A. Category/folder filter**  
Add filter chips above the report list:
```
[All]  [Blood Tests]  [Imaging]  [Prescriptions]  [Discharge Summaries]  [Other]
```
Map to a `category` field on the report object. When uploading, prompt user to select category.

**B. Report freshness indicator**  
For blood test reports older than 6 months, show a subtle badge:
```tsx
{isOlderThan(report.date, 180) && (
  <Badge variant="outline" className="text-orange-500 border-orange-300 text-xs">
    Over 6 months old
  </Badge>
)}
```

**C. Share with Doctor**  
Add a share button to each report card:
```tsx
<Button variant="ghost" size="sm" onClick={() => openShareDialog(report)}>
  <Share2 className="w-4 h-4 mr-1" /> Share with doctor
</Button>
```
Share dialog: search for doctor by name → `POST /reports/{id}/share` with `{ doctorId }`.  
Doctor receives an in-app notification and sees the report in their patient file.

---

### 3.4 AI Symptom Triage — Escalation + Session Save

**File:** `client/src/pages/patient/AISymptomTriage.tsx`

**A. Session save**  
- Save triage progress to `sessionStorage` on each step completion
- On mount: if `sessionStorage.getItem('triageSession')` exists, show: *"Continue your symptom check from earlier?"* with [Resume] / [Start fresh] options

**B. High-risk escalation CTA**  
When triage score is HIGH or EMERGENCY, the result card must show:
```
🚨  Your symptoms may need urgent attention.
    [Book Emergency Consultation Now]   [Call 112]
```
not just a score number.

**C. Disclaimer at the start, not the end**  
Move the AI disclaimer to a pre-triage consent card (one-time dismissal stored in `localStorage`):
```
ℹ  This AI-assisted triage is for guidance only. It is not a medical diagnosis.
   Always consult a qualified doctor for medical advice.
                                                [I understand, continue →]
```

---

### 3.5 Insurance Claims — Status Tracker

**File:** `client/src/pages/patient/ClaimsExpress.tsx` and `client/src/pages/patient/ClaimsManagement.tsx`

**Problem:** Once a claim is filed, users have no visibility into its progress. This is the single biggest anxiety point in insurance UX.

**Required UI — claim status timeline:**
```
✅  Claim Submitted          5 Jun 2026
⏳  Under Review            Expected by 10 Jun
○   Decision
○   Payment (if approved)
```

**Implementation:**
- `GET /employee/claims/{id}` should return a `statusHistory` array
- Render as a vertical timeline component
- Add a `GET /employee/claims/{id}/status` endpoint if not exists, polled every 60 seconds when claim is `in_review`

**Vision AI extraction failure handling:**  
```tsx
if (extractionFailed) {
  toast({
    title: "Auto-fill unavailable",
    description: "We couldn't read your insurance card automatically. Please fill in the details manually.",
    variant: "default" // not destructive — it's not the user's fault
  });
}
```

---

### 3.6 Family Health Hub — Simplified Add Member Flow

**File:** `client/src/pages/patient/FamilyHealthHub.tsx`

**Problem:** Adding a family member requires 10+ fields. International best practice is: 3 required fields, everything else optional later.

**Required fields (Step 1):**
1. First name
2. Relationship (dropdown: Spouse / Child / Parent / Sibling / Other)
3. Date of birth

**Optional fields (Step 2 — "Add more details" accordion, collapsed by default):**
- Phone, Email, Blood type, ABHA Health ID, Allergies, Medications

**Add a family member summary card** on the hub landing page showing each member's:
- Name + relationship
- Last appointment (if any)
- Any overdue health actions (prescription renewal, scheduled test)

---

## Sprint 4 — Mobile Bottom Navigation + Global Search

### 4.1 Mobile Bottom Tab Bar

**New file:** `client/src/components/layout/BottomNav.tsx`  
**Condition:** Render only when `window.innerWidth < 768px` (or use Tailwind `md:hidden`)

**5 tabs:**

| Tab | Icon | Route | Badge |
|---|---|---|---|
| Home | `Home` | `/` | — |
| Care | `Stethoscope` | `/appointments` | Upcoming appointment count |
| Health | `Heart` | `/health-dashboard` | — |
| Wallet | `Wallet` | `/wallet` | Unread reward count |
| Profile | `User` | `/profile` | — |

**Behaviour:**
- Fixed to bottom, above system navigation (use `pb-safe` for iOS safe area)
- Active tab: teal fill icon + teal label
- Inactive: slate-400 icon, no label
- Tap on active tab: scroll to top of current page
- Never hidden — persists across all patient routes

**Integration in MainLayout:**
```tsx
// client/src/components/layout/MainLayout.tsx
<main className="pb-16 md:pb-0"> {/* reserve space for bottom nav on mobile */}
  {children}
</main>
<BottomNav className="md:hidden" />
```

---

### 4.2 Global Search

**New file:** `client/src/components/GlobalSearch.tsx`  
**Placement:** Pinned to the top of the home dashboard, also accessible via `Cmd+K` / `Ctrl+K`

**Search scopes:**

| Scope | Endpoint | Result type |
|---|---|---|
| Health records | `GET /search/records?q=` | Reports, lab results, prescriptions |
| Doctors | `GET /doctors/search?q=` | Doctor name, speciality |
| Medicines | `GET /pharmacy/medicines/search?q=` | Medicine name, generic name |
| Appointments | Client-side filter on cached appointments | Upcoming / past appointments |

**UI pattern (Command Palette style):**
- Pressing search bar (or `Cmd+K`) opens a full-screen modal on mobile, a popover on desktop
- Quick filter chips: [All] [Records] [Doctors] [Medicines]
- Recent searches (stored in `localStorage`)
- Keyboard navigable (↑ ↓ Enter Esc)

---

## Sprint 5 — Accessibility (WCAG AA) + Performance

### 5.1 Accessibility Fixes

**Priority order — fix these first:**

**A. Aria-labels on icon-only buttons** (`client/src/components/layout/Sidebar.tsx`, `Index.tsx`, all pages)
```tsx
// Before
<button onClick={toggleSidebar}><Menu className="w-5 h-5" /></button>

// After
<button onClick={toggleSidebar} aria-label="Toggle navigation menu">
  <Menu className="w-5 h-5" />
</button>
```

**B. Form errors must be associated with their field** (all forms)
```tsx
// Before
{error && <p className="text-red-500">{error}</p>}

// After
<Input id="email" aria-describedby={error ? "email-error" : undefined} />
{error && <p id="email-error" role="alert" className="text-red-500">{error}</p>}
```

**C. Loading state announcements** (all pages with `isLoading`)
```tsx
// Add to root layout or per-page
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {isLoading ? "Loading your health data…" : ""}
</div>
```

**D. Colour contrast fixes**

| Element | Current | Required | Fix |
|---|---|---|---|
| Strength meter "Good" label | `text-yellow-400` (3.2:1) | 4.5:1 | Change to `text-yellow-700` |
| Strength meter "Fair" label | `text-orange-400` (2.9:1) | 4.5:1 | Change to `text-orange-700` |
| Sidebar inactive item text | `text-slate-400` (3.0:1) | 4.5:1 | Change to `text-slate-500` |
| Badge "Not connected" | `text-slate-400` on white | 4.5:1 | Change to `text-slate-600` |

**E. Skip-to-content link** (`client/src/components/layout/MainLayout.tsx`)
```tsx
// First element inside <body>
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 
             bg-white px-4 py-2 rounded shadow z-50 text-teal-700 font-medium"
>
  Skip to main content
</a>
// ...
<main id="main-content">
```

**F. OTP input keyboard navigation** (`client/src/components/OTPInput.tsx` or wherever defined)
- Auto-focus next cell on digit entry
- Auto-focus previous cell on Backspace when current cell is empty
- Handle paste of full 6-digit code

---

### 5.2 Bundle Size — Code Splitting

**File:** `client/vite.config.ts` or wherever Vite is configured  
**Problem:** `index-DdvW1cFR.js` = 1,428 kB. `cornerstoneWADOImageLoader.bundle.min` = 1,393 kB loaded for all patients.

**Actions:**

**A. Move DICOM/Cornerstone to dynamic import** — these libraries are only needed for DICOM image viewing, not for the typical patient journey.
```tsx
// In the route that needs DICOM
const CornerstoneViewer = lazy(() => import('@/components/dicom/CornerstoneViewer'));
```
This removes ~1,393 kB from the initial bundle for ~95% of users.

**B. Manual chunk splitting in vite.config.ts:**
```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-charts': ['recharts'],
        'vendor-pdf': ['jspdf', 'html2canvas'],
        'vendor-video': ['livekit-client'],
        'vendor-dicom': ['cornerstone-core', 'cornerstoneWADOImageLoader', 'cornerstoneTools'],
      }
    }
  }
}
```

**C. Lazy-load all patient pages** — verify every route in `client/src/routes/index.tsx` uses `React.lazy()`. Any static import of a patient page should be converted.

**Expected bundle reduction:** ~40% reduction in initial JS, bringing TTI from ~10s to ~6s on Jio 4G.

---

## Sprint 6 — Trust Signals + AI Context + Report Sharing

### 6.1 Data Privacy Banner

**File:** `client/src/components/layout/MainLayout.tsx` or `client/src/pages/Index.tsx`  
Show once per login session (track with `sessionStorage`):

```tsx
{!sessionStorage.getItem('privacyBannerDismissed') && (
  <Alert className="border-teal-200 bg-teal-50 dark:bg-teal-950/20 mb-4">
    <Shield className="w-4 h-4 text-teal-600" />
    <AlertDescription className="text-teal-700 text-sm">
      Your health data is encrypted and stored securely. We never sell your data.{' '}
      <a href="/privacy" className="underline">Privacy policy</a>
    </AlertDescription>
    <button onClick={() => {
      sessionStorage.setItem('privacyBannerDismissed', '1');
      setPrivacyBannerVisible(false);
    }} aria-label="Dismiss">
      <X className="w-4 h-4" />
    </button>
  </Alert>
)}
```

---

### 6.2 Active Sessions List

**File:** `client/src/pages/ProfileEnhanced.tsx` — Security tab  
**Problem:** "Sign Out All Devices" button exists, but users cannot see what devices are active.

**Required addition above the "Sign Out All" button:**

```tsx
<div className="space-y-2 mb-4">
  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Active Sessions</p>
  {sessions.map(session => (
    <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border">
      <div className="flex items-center gap-3">
        <Monitor className="w-4 h-4 text-slate-400" />
        <div>
          <p className="text-sm font-medium">{session.deviceName || 'Unknown device'}</p>
          <p className="text-xs text-slate-400">{session.ip} · {timeAgo(session.lastActiveAt)}</p>
        </div>
      </div>
      {session.isCurrent
        ? <Badge className="text-xs">Current</Badge>
        : <Button variant="ghost" size="sm" onClick={() => revokeSession(session.id)}>Sign out</Button>
      }
    </div>
  ))}
</div>
```

**Backend requirement:** `GET /users/security/sessions` → returns array of active session metadata (device, IP, last active).

---

### 6.3 AI Result Plain-Language Context

**Files:** `client/src/pages/patient/AIHealthAnalysis.tsx`, `client/src/pages/patient/AISymptomTriage.tsx`, `client/src/pages/patient/SmartHealthDashboard.tsx`

**Problem:** AI results show a score (e.g., "Risk: High") with no plain-language explanation, no confidence qualifier, no next-step CTA.

**Required pattern for all AI result displays:**

```tsx
<Card>
  <CardContent className="space-y-3">
    {/* Score */}
    <div className="flex items-center gap-3">
      <div className={`text-2xl font-bold ${riskColor}`}>{riskLabel}</div>
      <Badge variant="outline" className="text-xs">
        {confidencePercent}% confidence
      </Badge>
    </div>

    {/* Plain-language explanation */}
    <p className="text-sm text-slate-600">{plainLanguageSummary}</p>

    {/* Top contributing factors */}
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-500">Key factors</p>
      {topFactors.map(f => (
        <div key={f.name} className="flex items-center gap-2">
          <div className="w-20 h-1.5 rounded-full bg-slate-200">
            <div className={`h-full rounded-full ${f.direction === 'up' ? 'bg-red-400' : 'bg-green-400'}`}
                 style={{ width: `${f.weight * 100}%` }} />
          </div>
          <span className="text-xs text-slate-500">{f.name}</span>
        </div>
      ))}
    </div>

    {/* Action CTA */}
    <div className="pt-2 border-t">
      <p className="text-xs text-slate-400 mb-2">
        This is AI-assisted guidance. Consult your doctor for medical advice.
      </p>
      <Button size="sm" onClick={() => navigate('/doctors')}>
        Discuss with a doctor
      </Button>
    </div>
  </CardContent>
</Card>
```

---

## Component Library Additions

These new shared components need to be created and added to `client/src/components/ui/`:

| Component | File | Used by |
|---|---|---|
| `EmptyState` | `empty-state.tsx` | All patient list/chart pages |
| `InlineError` | `inline-error.tsx` | All API-dependent sections |
| `StatusTimeline` | `status-timeline.tsx` | Claims, appointments, orders |
| `PasswordStrengthBar` | `password-strength-bar.tsx` | Change password, register |
| `BottomNav` | `../../layout/BottomNav.tsx` | Mobile shell |
| `GlobalSearch` | `../../GlobalSearch.tsx` | Dashboard, header |
| `SessionBanner` | `session-expiry-banner.tsx` | AuthProvider |

---

## API Additions Required (Backend)

The following endpoints are referenced in this plan but may not exist yet:

| Method | Endpoint | Purpose | Sprint |
|---|---|---|---|
| `GET` | `/health-data/summary` | Real-time health stats for dashboard | Sprint 2 |
| `GET` | `/users/security/sessions` | Active session list for security tab | Sprint 6 |
| `DELETE` | `/users/security/sessions/{id}` | Revoke a specific session | Sprint 6 |
| `GET` | `/pharmacy/medicines/{id}/alternatives` | Out-of-stock substitutes | Sprint 3 |
| `POST` | `/reports/{id}/share` | Share report with a doctor | Sprint 3 |
| `GET` | `/employee/claims/{id}/status` | Poll claim status | Sprint 3 |
| `GET` | `/search/records?q=` | Global health record search | Sprint 4 |

---

## Acceptance Criteria — Definition of Done

A UX change is **done** when:

- [ ] The feature works correctly on Chrome desktop, Safari mobile (iOS), and Chrome mobile (Android)
- [ ] No blank white areas remain — every empty/loading/error state is handled
- [ ] All buttons have `aria-label` if icon-only
- [ ] No hardcoded demo/mock data is displayed as if real
- [ ] Lighthouse accessibility score ≥ 85 on the modified page
- [ ] The page renders the loading skeleton within 200ms (even if data takes longer)
- [ ] A new `EmptyState` or `InlineError` uses the shared component, not a one-off implementation

---

## Metrics to Track

Once implemented, track these to measure UX improvement:

| Metric | Baseline | Sprint 1–3 Target | Sprint 4–6 Target | Tool |
|---|---|---|---|---|
| Task completion rate (book appointment) | Measure now | +15% | +25% | Hotjar / FullStory |
| Bounce rate on dashboard | Measure now | -20% | -35% | Google Analytics |
| Average session duration | Measure now | +10% | +20% | GA |
| Support tickets: "how do I..." | Measure now | -30% | -50% | Support desk |
| Lighthouse Performance score | Measure now | ≥ 65 | ≥ 80 | Lighthouse CI |
| Lighthouse Accessibility score | Measure now | ≥ 75 | ≥ 90 | Lighthouse CI |
| Login success rate (first attempt) | Measure now | +5% | +10% | Backend logs |

---

## Appendix — File Index

All files mentioned in this document:

### Files to modify
- `client/src/components/layout/Sidebar.tsx` — restructure to 7 categories
- `client/src/components/layout/MainLayout.tsx` — bottom nav, skip link, privacy banner
- `client/src/auth/AuthProvider.tsx` — session expiry proactive warning
- `client/src/auth/Login.tsx` — error messages, OTP transition, failed-attempt nudge
- `client/src/pages/Index.tsx` — live health stats, last-updated timestamp, NBA card
- `client/src/pages/patient/LabTests.tsx` — payment confirmation, result ETA
- `client/src/pages/patient/Pharmacy.tsx` — cart persistence, Rx badge, substitutes
- `client/src/pages/patient/MyReports.tsx` — categories, freshness badge, share
- `client/src/pages/patient/AISymptomTriage.tsx` — session save, escalation CTA, disclaimer
- `client/src/pages/patient/ClaimsExpress.tsx` — status timeline, Vision AI failure
- `client/src/pages/patient/ClaimsManagement.tsx` — status timeline
- `client/src/pages/patient/FamilyHealthHub.tsx` — simplified add-member, summary cards
- `client/src/pages/ProfileEnhanced.tsx` — active sessions list
- `client/vite.config.ts` — manual chunk splitting for DICOM/PDF/video

### Files to create
- `client/src/components/ui/empty-state.tsx`
- `client/src/components/ui/inline-error.tsx`
- `client/src/components/ui/status-timeline.tsx`
- `client/src/components/layout/BottomNav.tsx`
- `client/src/components/GlobalSearch.tsx`
- `client/src/components/SessionExpiryBanner.tsx`
- `docs/patient/UX_IMPLEMENTATION_PLAN.md` ← this file
