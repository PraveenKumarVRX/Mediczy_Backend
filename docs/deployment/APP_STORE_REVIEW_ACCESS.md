# App-store review access — Play Console & App Store Connect

**Audience:** whoever fills in the store listing and presses Submit.
**Status (2026-11-08):** reviewer account created; the review origin is **not yet bound** (one
command, below); the app itself is **not yet submittable** — see [Blockers](#blockers).

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
| Password | not recorded here — see [§5](#5-getting-or-rotating-the-password) |
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

The reviewer account is necessary but **not** sufficient. As of 2026-11-08:

| # | Blocker | Severity |
|---|---|---|
| 1 | **The app has no functionality past login.** `mobile/App.tsx` is a server-address field, an email/password form, and the text "Signed in successfully." There is no navigation, no appointments, no records, no booking. `src/screens/LiveKitVideoCallScreen.js` is never imported. | **Blocks submission.** Google rejects this under *Minimum Functionality* ("little to no functionality"). Repeated rejections escalate to account-level enforcement. |
| 2 | Review origin not bound → discovery returns 503 on every host, so the reviewer cannot reach a login form. | Blocks review; one command (§3). |
| 3 | Play **Data safety** form and the **Health apps declaration** are required for a health app handling personal and health data, and must match what the app actually transmits. | Blocks submission. |
| 4 | Patient login is throttled to **5 attempts / 15 min per email**, in-process (`controller/unified-patient.controller.js`). A reviewer who signs out and back in a few times can lock themselves out for 15 minutes and report the app as broken. | Should fix before submitting. |

Fix 1 before anything else: it is the submission, not a detail of it. Items 2–4 are cheap and
can be done in any order once there is an app worth reviewing.

## 5. Getting or rotating the password

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

## 6. Verifying before you submit

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
