# App-store review access — Play Console & App Store Connect

**Audience:** whoever fills in the store listing and presses Submit.
**Status (2026-11-08):** reviewer account created; the patient app now has real functionality
past login and bundles for Android; the review origin is **not yet bound** (one command, §3) and
the Play **Data safety** form and **Health apps declaration** are still owed. Nothing has been
rendered on a device yet. See [§4 Blockers](#4-blockers) and [§5](#5-what-was-verified-and-what-was-not).

---

## 1. What the stores are asking for

Any app behind a login must be given working credentials:

| Store | Where it goes |
|---|---|
| Google Play | Play Console → **App content → App access** → "All or some functionality is restricted" |
| Apple | App Store Connect → **App Review Information** → Sign-In Required |

Reviewers keep these on file and reuse them for **every future release and every policy
re-review**, so they have to keep working indefinitely. Credentials that stop working are
recorded as "we could not access the app" — a rejection, not a request for more information.

## 2. The reviewer account

| Field | Value |
|---|---|
| Username | `play.reviewer@mysmarthealth.in` |
| Password | not recorded here — see [§7](#7-getting-or-rotating-the-password) |
| Organisation server URL | `https://demo.mediqzy.com` (the app's first screen asks for this — **reviewers must be given it**) |
| Backing record | `users` id 7639, uid `UE7M5J`, `role = 'patient'`, `organization_id = 11` |
| Organisation | tenant 11, *Smart Hospital*, flagged `metadata.demo = 'true'` |

Managed by `server/scripts/qa/ensure-play-reviewer-account.mjs`. It is idempotent: re-running
does **not** change the password unless you pass `--rotate`.

### Do not use the shared QA account for this

`user@mediczy.com` is wrong for store review on three independent counts:

1. **It cannot sign in to the mobile app at all.** `POST /api/patient/login` selects on
   `role = 'patient'` AND `organization_id = <clinic>`; that row is `role = 'user'` with
   `organization_id = NULL`, so the endpoint returns 401 for it whichever clinic is supplied.
2. **Its password is rewritten by hand during QA**, by
   `server/scripts/qa/reset-user-qa-account.mjs`. A reset while a review is in flight breaks
   the reviewer's credentials.
3. **Its credentials are published** in `docs/testing/TEST_CREDENTIALS.md` and shared by
   everyone doing QA. Concurrent use also burns the per-email login throttle
   (5 attempts / 15 min) that the reviewer needs.

### Why a demo organisation

A patient mobile session is bound to exactly one clinic, so the reviewer is necessarily a
patient *of* that clinic and sees it from the inside. Tenant 11 holds **no real patient
records**. Pointing a reviewer at a live hospital tenant would hand a third party access
inside that hospital's data, so `ensure-play-reviewer-account.mjs` refuses any tenant not
flagged `metadata.demo = 'true'` without an explicit `--force`.

**Never attach real reports, prescriptions or appointments to this account.** If the reviewer
needs to see populated screens, seed obviously synthetic records.

## 3. Bind the review origin (required — not yet done)

The app's first screen asks for an organisation server URL and calls
`GET /api/mobile/discovery` on it. Until a tenant claims that exact origin, every host answers
`503 mobile_not_configured` and the reviewer never reaches a login form at all.

```bash
cd /home/ubuntu/Mediczy/server
npm run store:review-origin:ssm -- --dry-run   # inspect first
npm run store:review-origin:ssm                # bind tenant 11 -> https://demo.mediqzy.com
curl -s https://demo.mediqzy.com/api/mobile/discovery   # expect the JSON payload, not 503
```

No restart, DNS, nginx or TLS change is needed: discovery resolves per request from the
database, wildcard DNS already resolves `*.mediqzy.com`, and the default nginx vhost already
serves it (`https://demo.mediqzy.com/api/health` returns 200 today).

Rollback: `npm run store:review-origin:ssm -- --remove`.

> ### Do not bind `app.mediqzy.com`
> `server/middleware/tenant-mobile-context.js` matches the routed `Host` exactly and, for any
> origin it matches, returns **403 on every** `/api/{patient,phlebotomy,crm,field,team}`
> request whose product is not in that tenant's app list. Claiming the live host for a
> patient-only config would 403 the Team and CRM portal logins in production. A dedicated
> origin keeps the blast radius at one hostname nothing else uses.

> ### Why `medstar.mediqzy.com` is dark
> Tenant 70 *is* configured and enabled for `crm` + `smart-force`, but its status is
> `pending`, and `tenantMobileDiscovery()` returns null for any non-active tenant. Configuring
> an origin is not sufficient; the tenant must also be `active`.

## 4. Blockers

The reviewer account is necessary but not sufficient. State as of 2026-11-08:

| # | Blocker | Status |
|---|---|---|
| 1 | **The app had no functionality past login** — a server-address field, a login form, and the text "Signed in successfully." Google rejects that under *Minimum Functionality*, and repeated rejections escalate to account-level enforcement. | **Fixed.** The patient app now has five tabs over live API data: home summary, appointments, a doctor/day/slot booking flow that writes a real appointment, prescriptions and reports, vitals and checkups, and a profile with sign-out and account deletion. See [§6](#6-what-the-app-does-now). |
| 2 | **The app could not be bundled at all**, on any platform: `react-native-reanimated@4.3.0` requires the peer `react-native-worklets`, which was never installed, so its Babel plugin threw before Metro read a single module. Nothing imported reanimated. | **Fixed** by dropping that dependency. `npx expo export --platform android` now produces a 2.27 MB Hermes bundle. |
| 3 | Patient login counted **every** attempt against 5 per 15 minutes per email and cleared only when the window expired, so five *correct* logins locked out the sixth. | **Fixed** in `controller/unified-patient.controller.js`: failures count, success clears. Covered by `__tests__/patient-login-throttle.test.js`. |
| 4 | **Review origin not bound** → `/api/mobile/discovery` answers 503 on every host, so the reviewer never reaches a login form. | **Open.** One command, §3. |
| 5 | Play **Data safety** form and the **Health apps declaration**, which must match what the app actually transmits. | **Open**, but answerable: the field-by-field answers are in [PLAY_DATA_SAFETY_AND_HEALTH_DECLARATION.md](PLAY_DATA_SAFETY_AND_HEALTH_DECLARATION.md). Submitting them is a Play Console task. |

`mobile/src/screens/LiveKitVideoCallScreen.js` is still dead code: nothing imports it, and the
`@livekit/react-native` and `livekit-client` packages it needs are not in `mobile/package.json`.
It is harmless while unreferenced — Metro never resolves it — but importing it will break the
build until those packages are added.

## 5. What was verified, and what was not

Verified: the module graph bundles for Android (Metro + Hermes); `tsc --noEmit` is clean;
`npm run test:connection` passes 12/12, including the new session-resume and query-string cases;
the server suites for the changed code pass (`patient-login-throttle`, `account-erasure-guard`,
`review-mobile-origin`, `mobile-discovery`, the appointment suites). Every API path the app calls
was first exercised against the live server with the reviewer's own token and returns 200.

**Not** verified: the app has not been rendered on a device or emulator. Expo's web target would
need `react-dom` and `react-native-web`, which are not installed, and there is no emulator on
this host. Layout, navigation feel and the booking flow end to end still need one pass on a real
device before submitting.

## 6. What the app does now

| Tab | What a reviewer sees | Server endpoints |
|---|---|---|
| Home | Name, organisation, counts of upcoming visits / prescriptions / unread alerts, the next appointment, recent notifications | `/api/patient/profile`, `/api/patient/appointments`, `/api/prescriptions/patient`, `/api/notifications` |
| Visits | Upcoming and past appointments with doctor, specialty, date, time, type and status | `/api/patient/appointments` |
| Booking | Doctor search over the live directory, a 14-day picker, video or in-person, the doctor's actually-free slots, optional reason, then a real booking | `/api/doctors`, `/api/doctors/available-slots/:id?date=`, `POST /api/appointments` |
| Records | Prescriptions with diagnosis, medicines, dosage and advice; reports with type, date and an Open button | `/api/prescriptions/patient`, `/api/patient/reports` |
| Health | Latest vitals and history, booked checkups, available packages | `/api/health-data/vitals`, `/api/health-checkups/bookings`, `/api/health-checkups/packages` |
| Profile | Profile and organisation details, sign out, change organisation, and account deletion behind a typed confirmation | `/api/patient/profile`, `POST /api/users/data/erasure` |

Every one of those paths is inside the `patient` allow-list in
`server/middleware/ringFencing.js`. A path outside that list answers 403 for a patient however
correct the route is, so a new screen needs its endpoint added there too.

**The reviewer's own account shows empty states**, by design: tenant 11 holds no patient records,
so Records, Health and Visits each render their empty state until the reviewer books something.
The doctor directory is live, so booking is the path that shows the app working. If a populated
walkthrough is wanted, seed obviously synthetic records against the reviewer account — never real
ones.

### Account deletion

Play requires an in-app deletion path for any app that can create accounts, and this app can.
Profile → Delete account requires the word DELETE to be typed, then calls
`POST /api/users/data/erasure`, which erases immediately. Two guards were added with it: the
request must carry `confirm: "ERASE"`, and accounts flagged `metadata.doNotDelete` are refused
with `account_protected`. **The reviewer account is flagged**, so a reviewer who taps through the
deletion flow gets a clear "managed account" message instead of destroying the credentials every
future review depends on. If a reviewer queries that, the answer is that the account is
organisation-managed; an ordinary patient account deletes for real.

## 7. Getting or rotating the password

The password is deliberately **not** stored in this repository — that is the mistake
`docs/testing/TEST_CREDENTIALS.md` makes, and it is why those credentials are unusable for
store review. It is printed once, by the script, and not recoverable afterwards.

```bash
cd /home/ubuntu/Mediczy/server
npm run store:reviewer-account:ssm -- --rotate   # issues and prints a new password
```

Copy it straight into Play Console / App Store Connect. Rotate it if it is ever pasted into a
chat, a ticket or a shared document.

Other options:

```bash
# bind to a different organisation (must be active; non-demo needs --force)
npm run store:reviewer-account:ssm -- --clinic 7 --force

# set an exact password instead of generating one
PLAY_REVIEWER_PASSWORD='...' npm run store:reviewer-account:ssm
```

## 8. Verifying before you submit

```bash
# 1. discovery answers on the review origin
curl -s https://demo.mediqzy.com/api/mobile/discovery

# 2. the account authenticates (substitute the real password)
curl -s -X POST https://demo.mediqzy.com/api/patient/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"play.reviewer@mysmarthealth.in","password":"..."}'
```

Step 2 deliberately sends **no** clinic identifier: on a bound origin the server supplies it,
and `mobile-patient-binding.js` strips any the client sends. If step 2 only works when you add
`"clinic_id":"11"` by hand, the origin is not bound and step 1 is still returning 503.

Then run the contract tests:

```bash
cd /home/ubuntu/Mediczy/server
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand \
  __tests__/review-mobile-origin.test.js __tests__/mobile-discovery.test.js
```

---

*Related:* `docs/api/TENANT_MOBILE_SERVER_CONNECTION.md` ·
`docs/architecture/TENANT_APP_PLATFORM_ARCHITECTURE_2026-10-25.md` ·
`scripts/qa/tenant-app-release-smoke.mjs`
