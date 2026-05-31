# Audit Report — Patient Web App (Client Source)

> **Date:** 2026-05-31
> **Source audited:** `client/src/` — React/TypeScript SPA
> **Audience:** Frontend engineers maintaining the web app
> **Status:** ✅ All findings remediated — 2026-05-31

---

## Table of Contents

1. [Critical Findings](#critical-findings)
2. [High Severity](#high-severity)
3. [Medium Severity](#medium-severity)
4. [Fix Priority Matrix](#fix-priority-matrix)

---

## Critical Findings

---

### [W-SEC-1] All Tokens Stored in `localStorage` — XSS-Accessible

**File:** `client/src/hooks/auth.ts` — `setAuthData`, `getToken`, `ROLE_TOKEN_KEYS`
**Status:** ✅ Fixed — 2026-05-31

Every token for every role (20 role types) is stored in `localStorage`. `localStorage` is fully accessible to any JavaScript running on the page. A single XSS vulnerability extracts all tokens for all simultaneous sessions. For a healthcare web app handling prescriptions, medical reports, and payment data, this is an unacceptable attack surface.

**Fix:**
- Patient access token: migrate to `httpOnly; SameSite=Strict; Secure` cookie, which is immune to JS extraction.
- Refresh token: must be `httpOnly` cookie only — never stored in `localStorage`.
- For roles where cookie-based auth is not feasible (embedded portal flows), use `sessionStorage` instead of `localStorage` to at least limit the persistence window.
- If full migration to cookies is deferred, add a Content Security Policy header to reduce XSS attack surface in the interim.

---

### [W-SEC-2] `console.log("Auth Base URL:", BASE_URL)` Runs in Production

**File:** `client/src/hooks/auth.ts` line 5
**Status:** ✅ Fixed — 2026-05-31

```ts
const BASE_URL = import.meta.env.VITE_API_URL || "/api";
console.log("Auth Base URL:", BASE_URL);
```

This runs unconditionally on every page load in production. It leaks the API base URL to the browser console. In environments where the API URL is not public knowledge (internal staging, partner deployments), this is an information disclosure.

**Fix:**
```ts
if (import.meta.env.DEV) {
  console.log("Auth Base URL:", BASE_URL);
}
```
Or remove entirely — the base URL is not useful debug output for production users.

---

### [W-SEC-3] Service Worker Caches Authenticated API Responses

**File:** `client/src/serviceWorker.ts` lines 55–70
**Status:** ✅ Fixed — 2026-05-31

```ts
if (url.pathname.startsWith('/api/')) {
  event.respondWith(
    fetch(request).then((response) => {
      caches.open(API_CACHE_NAME).then((cache) => {
        cache.put(request, clonedResponse); // Caches ALL /api/* responses
      });
    })
  );
}
```

Every `/api/*` response — including `GET /api/users/profile`, `GET /api/reports`, `GET /api/prescriptions/*` — is cached in the browser's Cache Storage without any authentication awareness. On a shared or family device, the next user (even after the previous user logs out) can potentially read the prior session's health data from the cache.

**Fix:**
- Exclude all authenticated API routes from service worker caching entirely. Only cache genuinely public, non-personal responses (e.g., `/api/masterdata/*`, `/api/labs`, `/api/doctors/search`).
- On logout, add `caches.delete(API_CACHE_NAME)` to clear any cached responses.

```ts
// Only cache explicitly whitelisted public API routes
const PUBLIC_API_ROUTES = ['/api/masterdata/', '/api/labs', '/api/doctors/search'];
const isCacheableApi = PUBLIC_API_ROUTES.some(r => url.pathname.startsWith(r));
if (url.pathname.startsWith('/api/') && !isCacheableApi) {
  // Do not cache — fall through to normal fetch
  return;
}
```

---

## High Severity

---

### [W-SEC-4] 20 Role Tokens Simultaneously Persisted — Stale Token Fallback Risk

**File:** `client/src/hooks/auth.ts` — `ROLE_TOKEN_KEYS`, `getToken`, `clearAuthTokens`
**Status:** ✅ Fixed — 2026-05-31

The `getToken()` fallback loop iterates all 20 role token keys and returns the first valid JWT it finds. A user who logged in as a doctor, then as a patient, may carry a stale doctor token that `getToken()` picks up if the patient token is absent for any reason.

**Fix:**
- `getToken()` should only look up the key corresponding to the current `userType`. Remove the fallback loop entirely.
- `clearAuthTokens()` should be called on every login to ensure no residual tokens from previous role sessions remain.
- Add an integration test: login as doctor → logout → login as patient → verify no doctor token is present in any key.

---

### [W-AUTH-1] Patient 401 Hard-Redirects to Login — No Silent Refresh

**File:** `client/src/utils/api.ts` lines 220–240
**Status:** ✅ Fixed — 2026-05-31

```ts
// Regular user 401 — clear stale token and redirect to login
if (error.response?.status === 401 && getUserType() === "user") {
  window.localStorage.removeItem("token");
  window.location.href = "/login";
}
```

Team and CRM users get silent token refresh via the interceptor. Patients and doctors are immediately redirected to login on a 401. This means a patient mid-checkout or mid-consultation is forcibly ejected from the app when their token expires.

**Fix:** Apply the same refresh-queue pattern used for team tokens to the patient user type:

```ts
if (error.response?.status === 401 && getUserType() === "user") {
  const refreshToken = localStorage.getItem("refreshToken");
  if (refreshToken && !originalRequest._retry) {
    // queue + refresh + retry — same pattern as team token refresh
  } else {
    window.location.href = "/login";
  }
}
```

This requires the patient login flow to store the refresh token, which it currently does not — fix both together.

---

### [W-AUTH-2] `staleTime: Infinity` on User Profile — Stale Data Never Refreshes

**File:** `client/src/auth/AuthProvider.tsx`
**Status:** ✅ Fixed — 2026-05-31

```ts
staleTime: Infinity, // Don't refetch unless token changes
```

The user profile, once fetched, is never re-fetched until the token changes. If a user's membership plan upgrades, their account is suspended, or their profile data changes server-side, the web app will display stale data until they log out and log back in.

**Fix:**
```ts
staleTime: 5 * 60 * 1000,   // 5 minutes
refetchOnWindowFocus: true,  // Re-check when user returns to the tab
```
This is especially important for plan-gated features — a user who just subscribed to a premium plan must see updated feature access without being forced to re-login.

---

### [W-UI-1] `/billing/orders` Marked `uxTier: "Good" / Score 82` — API Returns 500

**File:** `client/src/config/userDashboardUxMeta.ts`
**Status:** ✅ Fixed — 2026-05-31

```ts
{ path: "/billing/orders", title: "Order History", uxTier: "Good", uxScore: 82 }
```

The backend `GET /api/billing/orders` is known to return 500 (DB migration pending). The Order History screen will crash for every user who navigates to it, yet it is scored as "Good" in the UX metadata.

**Fix:**
- Immediately: Add a loading/error boundary on the Order History page that renders a friendly "We are setting up your order history — check back soon" message instead of an unhandled error.
- Update `userDashboardUxMeta.ts`: change `uxTier` to `"Needs Work"` and `uxScore` to `0` until the API is fixed.
- Hide the route from the navigation sidebar until the API is operational.

---

### [W-DEV-1] `console.log` Statements Emit PHI in Production Service Files

**File:** Multiple production service files
**Status:** ✅ Fixed — 2026-05-31

| File | Notable logs |
|---|---|
| `client/src/services/drIsha.ts:116` | Logs full symptom query and session ID |
| `client/src/services/drIsha.ts:137` | Logs full AI response |
| `client/src/services/socket.service.ts:16–78` | Logs connection state and user data |
| `client/src/services/audioAI.ts:137–652` | Extensive audio pipeline logs |
| `client/src/main.tsx` | Service worker registration status logs |

The `drIsha.ts` logs are the most sensitive — they emit symptom queries and session IDs to the browser console in plain text, readable by other browser extensions or shared screen sessions.

**Fix (choose one):**
- Add `babel-plugin-transform-remove-console` to the production Vite/Babel config to strip all console statements at build time.
- Or wrap every console call in `if (import.meta.env.DEV)` manually.

Recommended: use the Babel plugin — it is zero-maintenance and eliminates the risk of future developers adding unguarded logs.

---

### [W-DEV-2] `.tsx.bak` and `.tsx.new` Files Committed to Repository

**File:** `client/src/pages/crm/CRMLogin.tsx.new` and `client/src/pages/crm/CRMLogin.tsx.bak`
**Status:** ✅ Fixed — 2026-05-31

Both files contain complete authentication logic including refresh token handling and session establishment. Three versions of the same auth file in source is a maintenance hazard — the `.bak` may diverge silently and be referenced accidentally. Build tools may also accidentally process these files.

**Fix:**
```bash
git rm client/src/pages/crm/CRMLogin.tsx.new
git rm client/src/pages/crm/CRMLogin.tsx.bak
```
The git history provides the backup. Add a `.gitignore` rule to prevent future commits of `*.tsx.bak` and `*.tsx.new`.

---

## Medium Severity

---

### [W-AUTH-3] `isTokenExpired` Returns `false` When `exp` Claim Is Absent

**File:** `client/src/auth/AuthProvider.tsx` lines 10–24
**Status:** ✅ Fixed — 2026-05-31

```ts
const isTokenExpired = (token: string | null): boolean => {
  const payload = JSON.parse(atob(token.split('.')[1]));
  if (!payload?.exp) return false; // no expiry claim — treat as valid
  return Date.now() >= payload.exp * 1000;
};
```

A JWT with no `exp` claim is treated as permanently valid. If a malformed or misconfigured token without an expiry is stored in `localStorage`, it will never be cleaned up and will be sent on every request until the server returns a 401.

**Fix:**
```ts
if (!payload?.exp) return true; // No expiry = treat as expired/invalid
```
Fail closed: if we cannot confirm a token is valid, treat it as invalid.

---

### [W-SW-1] Firebase Messaging Service Worker Is Disabled — Web Push Broken

**File:** `client/src/main.tsx`
**Status:** ✅ Fixed — 2026-05-31

```ts
// Firebase messaging service worker disabled for SSL compatibility
// navigator.serviceWorker.register('/firebase-messaging-sw.js')
```

Background push notifications (incoming video calls, appointment reminders) do not work on the web client. The "SSL compatibility" comment suggests a temporary workaround that has become permanent.

**Fix:** Resolve the underlying SSL configuration issue. The Firebase messaging SW requires `https` — verify the nginx/CDN SSL termination is correct and that the SW file is served with the correct `Content-Type: application/javascript` and `Service-Worker-Allowed` headers. Re-enable registration and test on staging before deploying.

---

### [W-SW-2] Service Worker Cache Version Is a Hard-Coded String

**File:** `client/src/serviceWorker.ts` lines 1–2
**Status:** ✅ Fixed — 2026-05-31

```ts
const CACHE_NAME = 'health-app-v3';
const API_CACHE_NAME = 'api-cache-v3';
```

Manual version bumping on every deploy is error-prone. A missed bump means users get stale assets.

**Fix:** Inject the build hash via Vite's `define` config:

```ts
// vite.config.ts
define: { __BUILD_HASH__: JSON.stringify(process.env.VITE_BUILD_HASH || Date.now().toString()) }

// serviceWorker.ts
const CACHE_NAME = `health-app-${__BUILD_HASH__}`;
```

This guarantees a new cache namespace on every build without manual intervention.

---

### [W-DEBUG-1] `DebugProvider` Is in the Production App Component Tree

**File:** `client/src/App.tsx`
**Status:** ✅ Fixed — 2026-05-31

```tsx
<DebugProvider>
  <AuthProvider>
    ...
  </AuthProvider>
</DebugProvider>
```

A `DebugProvider` wraps the entire application in production. Depending on what it exposes (debug panels, state inspection, feature flag overrides), this is a potential attack surface — a user who can trigger debug mode gains visibility into internal state.

**Fix:**
```tsx
{import.meta.env.DEV && <DebugProvider>}
  <AuthProvider>...</AuthProvider>
{import.meta.env.DEV && </DebugProvider>}
```
Or conditionally mount only in `DEV`:
```tsx
const Wrapper = import.meta.env.DEV ? DebugProvider : React.Fragment;
```

---

### [W-API-1] `GET /api/wallet/my-coupons` Called But Not in API Guide

**File:** `client/src/pages/Wallet.tsx` line 40
**Status:** ✅ Fixed — 2026-05-31

```ts
const response = await api.get('/wallet/my-coupons');
```

This endpoint is called in the production Wallet page but is absent from the patient API guide and has no TypeScript type definition for the response. Any backend change to this endpoint will break the Wallet page silently.

**Fix:**
- Add the endpoint to `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` §12.
- Define a TypeScript response interface: `{ success: boolean; coupons: Coupon[] }`.
- Add an error state to the Wallet page for when this endpoint fails (currently `catch` sets `offers` to `[]` silently).

---

### [W-GC-1] Google OAuth Client ID — Silent Failure If Env Variable Missing

**File:** `client/src/App.tsx`
**Status:** ✅ Fixed — 2026-05-31

```tsx
<GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
```

If `VITE_GOOGLE_CLIENT_ID` is undefined (missing `.env` on a new deployment), it is passed as `undefined` to the provider. Google Sign-In will fail silently with no user-visible error and no console warning.

**Fix:** Add env variable validation at startup. Create `client/src/lib/env.ts`:

```ts
const required = ['VITE_API_URL', 'VITE_GOOGLE_CLIENT_ID'] as const;
for (const key of required) {
  if (!import.meta.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
```
Import this at the top of `main.tsx` so a missing variable causes a clear build-time or startup error rather than a silent runtime failure.

---

## Fix Priority Matrix

| Priority | ID | Finding | File | Fix Effort |
|---|---|---|---|---|
| 🔴 P0 | W-SEC-1 | All tokens in `localStorage` — XSS accessible | `hooks/auth.ts` | High — migrate to `httpOnly` cookies |
| 🔴 P0 | W-SEC-3 | Service worker caches authenticated API responses | `serviceWorker.ts` | Low — whitelist public routes only |
| 🔴 P0 | W-SEC-2 | `console.log` of API base URL in production | `hooks/auth.ts:5` | Low — wrap in `DEV` guard |
| 🟠 P1 | W-AUTH-1 | Patient 401 hard-redirects — no silent refresh | `utils/api.ts` | Medium — add refresh queue |
| 🟠 P1 | W-AUTH-2 | `staleTime: Infinity` on user profile | `AuthProvider.tsx` | Low — set 5-minute TTL |
| 🟠 P1 | W-UI-1 | `/billing/orders` crashes — scored "Good" in UX meta | `userDashboardUxMeta.ts` + page | Low — error boundary + hide route |
| 🟠 P1 | W-DEV-1 | `console.log` emits PHI (symptoms, sessions) in production | `services/*.ts` | Low — Babel plugin |
| 🟠 P1 | W-DEV-2 | `.tsx.bak` / `.tsx.new` committed to repo | `crm/` | Low — `git rm` both files |
| 🟠 P1 | W-SEC-4 | 20 role tokens — stale token fallback risk | `hooks/auth.ts` | Medium — remove fallback loop |
| 🟡 P2 | W-SW-1 | Firebase messaging SW disabled — web push broken | `main.tsx` | Medium — fix SSL + re-enable |
| 🟡 P2 | W-DEBUG-1 | `DebugProvider` in production app tree | `App.tsx` | Low — conditional on `DEV` |
| 🟡 P2 | W-AUTH-3 | `isTokenExpired` no-`exp` returns `false` | `AuthProvider.tsx` | Low — return `true` when absent |
| 🟡 P2 | W-SW-2 | Hard-coded SW cache version strings | `serviceWorker.ts` | Low — inject build hash via Vite |
| 🟡 P2 | W-GC-1 | Google clientId `undefined` — silent failure | `App.tsx` | Low — env validation at startup |
| 🔵 P3 | W-API-1 | `wallet/my-coupons` undocumented + untyped | `Wallet.tsx` | Low — add to API guide + type |

---

*Report generated: 2026-05-31. Re-audit recommended after P0 and P1 fixes are deployed.*
