# Medstar CRM divergence inventory (Phase 1)

Measured 2026-11-16 to merge the Medstar fork back into this repo. Plan and rules:
"One Product, Many Deployments — CRM Platform Architecture" (shared doc). Each item below is ported,
rejected, or turned into a module, then ticked off here.

## How the measurement was made

Medstar's server image is built from `/mnt/medstar/release/` on its host. Every file there was hashed and
compared with this repo at the commit Medstar was copied from (`58f96af3`) and at `main` (`530f4153`).

| Where the file lives | Files | Meaning |
| --- | --- | --- |
| Tracked in `MySmartHealth/medstar-crm` | 69 | Medstar's own work; listed below |
| Untracked on the host, identical to `main` | 2,099 | Copies of this repo; nothing to port |
| Untracked on the host, identical to `58f96af3` | 351 | Stale copies; replaced by the merged build |
| Untracked on the host, edited at Medstar | 6 | **Uncommitted edits**: review and port or reject |
| Untracked on the host, not in this repo | 3 | Temporary files; discard |

Two consequences:

- **The `medstar-crm` repo cannot rebuild what Medstar runs.** 2,459 of the 2,528 source files exist only on
  the host. The merged build (Phase 1) and product images (Phase 2) close this.
- **Medstar's server holds the whole platform's code** (clinical, pharmacy, everything), although only CRM
  routes are mounted. The CRM product build (Phase 2) ships only the kernel and CRM modules.

## 1. New in Medstar: product CRM modules to port (36 files, 5,341 lines)

All of these are general CRM capabilities, not Medstar-specific. They arrive as CRM modules, switched on
per installation.

| Module | Files | Lines |
| --- | --- | --- |
| Unified Inbox and contact capture | `services/crm-unified-inbox.service.js` (473), `services/crm-whatsapp-inbox.service.js` (170), `services/crm-contact-capture.service.js` (158), `services/crm-whatsapp-inbound.service.js` (154), `services/crm-channel-delivery.service.js` (103), `routes/crm-channel-webhooks.route.js` (79), `routes/crm-unified-inbox.route.js` (53) | 1,190 |
| Referral network | `services/crm-referral-network.service.js` (828), `routes/crm-referral-network.route.js` (60), `installations/crm/referral-network.sql` (10) | 898 |
| WhatsApp provider control (Gupshup) | `services/gupshup-control.service.js` (483), `services/whatsapp-template-library.js` (61), `routes/crm-whatsapp-control.route.js` (60), `migrations/20261115000000-crm-whatsapp-provider-control.sql` (31) | 635 |
| Calling (TeleCMI, Tata) | `services/telecmi-control.service.js` (281), `services/crm-telecmi-calls.service.js` (138), `routes/voice-webhooks.route.js` (85), `services/voice-providers/telecmi.js` (64), `routes/voice-connector.route.js` (60), `installations/crm/contact-center-wiring.js` (40), `routes/crm-telephony.route.js` (35), `services/voice-providers/tata.js` (31) | 734 |
| Engage (campaigns, audiences, templates, automations) | `services/crm-engage.service.js` (361), `installations/crm/consolidate-engagement.mjs` (98), `routes/crm-engage.route.js` (60) | 519 |
| Smart-Force app sign-in | `routes/crm-smart-force-auth.route.js` (185), `installations/crm/install-smart-force.mjs` (103) | 288 |
| Home, setup checklist, onboarding, branding | `services/crm-home.service.js` (122), `services/crm-setup-status.service.js` (48), `routes/crm-onboarding.route.js` (49), `routes/crm-branding.route.js` (19) | 238 |
| CRM password reset | `services/crm-password-reset.service.js` (132), `routes/crm-password-reset.route.js` (37) | 169 |
| Dedicated-runtime connector | `scripts/fetch-dedicated-config.mjs` (27) | 27 |
| Installation test suites | `installations/crm/post-deploy-smoke.mjs` (550), `installations/crm/smart-force-smoke.mjs` (93) | 643 |

Paths are under `server/`.

## 2. Edited in Medstar: changes to shared files (20 files)

Lines are against `main`. "Both" means the file also changed here after the copy, so it needs a
three-way merge, not a copy.

| File | +/− | Edited in | Note |
| --- | --- | --- | --- |
| `server/crm-app.mjs` | +104 −3 | Medstar | The CRM-only server entry. Becomes the CRM product's API entry point |
| `server/services/hospital-crm-communication-hub.service.js` | +107 −15 | Both | Three-way merge |
| `server/services/crm-automations.service.js` | +66 −42 | Both | Three-way merge |
| `server/services/crm-segments.service.js` | +51 −28 | Both | Three-way merge |
| `server/services/crm-channel-integrations.service.js` | +53 −14 | Medstar | |
| `server/routes/crm.route.js` | +37 −12 | Medstar | Shared with the Mediqzy CRM: needs tests before merge |
| `server/services/hospital-crm-foundation.service.js` | +34 −5 | Medstar | |
| `server/routes/field-force.route.js` | +31 −4 | Medstar | Shared with the platform's Field Force |
| `server/services/crm-v2-sync.service.js` | +25 −3 | Medstar | Lead-split fix |
| `server/services/hospital-crm-worldclass.service.js` | +18 −4 | Medstar | |
| `server/routes/crm-field-force.route.js` | +16 −1 | Medstar | |
| `server/services/hospital-crm-specialty.service.js` | +16 −5 | Medstar | Diagnostics dashboard without the Lab product |
| `server/installations/crm/smoke.mjs` | +7 −3 | Medstar | |
| `server/services/crm-marketing-copilot.service.js` | +4 −1 | Medstar | |
| `server/middleware/team.middleware.js` | +3 −8 | Medstar | Auth middleware: security review before merge |
| `server/config/crm-roles.config.js` | +2 −2 | Medstar | Permission map: see the access-control section of the plan |
| `server/installations/crm/runtime-boundary.js` | +1 −1 | Medstar | |
| `server/routes/contact-center-http.js` | +1 −1 | Medstar | |
| `server/services/crm-segment-blast.service.js` | +1 −1 | Medstar | |
| `shared/contact-center-providers.mjs` | +1 −0 | Medstar | |

## 3. Uncommitted edits on the Medstar host (6 files)

These run in production at Medstar but exist in no repository. Each needs its diff reviewed: port the fix,
or reject it and restore this repo's version.

- `server/app.js` (the full-platform entry; the CRM-only server should not need it)
- `server/services/password-reset.service.js`
- `server/services/signup-verification.service.js`
- `server/services/twilio-otp.service.js`
- `server/services/whatsapp-production.service.js`
- `server/__tests__/gupshup-whatsapp.test.js`

## 4. Discard (3 files)

`server/.dockerignore`, `server/tmp/create_assistant_and_token.mjs`, `server/tmp/price-sync/jan_aushadhi.xlsx`.
The last is pharmacy price data and does not belong on a hospital CRM server.

## 6. Port record (2026-11-16)

**Method.** A local reference commit `phase1/medstar-snapshot` lays `medstar-crm` 900e93a plus the 6
uncommitted host files on top of `58f96af3`. Bringing it onto `phase1/crm-merge` made git three-way merge
every file at once. Later Medstar commits arrive as patches (`git apply -3`) of their own diff only.

**Conflicts (5).** `crm-automations` and `crm-segments`: both sides kept (Mediqzy's `guardedSharedPool` plus
Medstar's `legacy_lead_id` / `deleted_at` filters). `password-reset`, `signup-verification`, `twilio-otp`:
Mediqzy kept. The communication hub merged without conflict.

**Section 3, uncommitted host edits: all 6 rejected.** Five are Medstar's version of the WhatsApp OTP
template fix (one parameter); Mediqzy fixed the same bug later and correctly (the copy-code template needs the
code twice). `app.js` removed three workspace routes, likely because their files were missing on the host; the
CRM-only server does not load `app.js`. Section 4: discarded.

**Changed while porting.**

- Vendor calls go through `server/integrations/`: Gupshup, TeleCMI, Tata Smartflo, Twilio, tenant SMTP and
  (from 1c37423) Firebase push. TeleCMI and Tata Smartflo joined the catalogue; `oauth2.googleapis.com` joined
  `firebase-fcm`. Guard test: `__tests__/crm-vendor-calls-managed.test.js`.
- Medstar's hand-run SQL became migrations `20261116000100-crm-medstar-modules` and
  `20261116000200-crm-call-centre-and-field` (both in `scripts/migrate-crm-all.mjs`, idempotent, safe on
  Medstar's database where the SQL already ran). Every new integer reference to a user gets its uid twin.
- `GET /api/branding` also returns `name`, `supportEmail`, `templatePrefix` for `crm-web`.
- Team named permissions match exactly (`middleware/team.middleware.js`). Live impact 16 Nov: user 7404
  loses Field Force Manager access held only through the substring bug.
- Field Force installed-check moved from the shared route into `crm-app.mjs`, with error handling (it hung
  the request when the check query failed).
- `crm-team.route.js` (1c37423, Business Heads invite the front line): an account flagged admin is treated
  as admin even without a `crmRole`, so a Business Head cannot deactivate an older admin login.

**medstar-crm 1c37423** (call centre, manager tools, app modes, shared follow-ups): ported on top. Its
`nginx-common.conf` change (`/login` redirect) is deployment-only and stays in `medstar-crm`. The web
changes since 6f503f1 (including 900e93a's role/menu edits, which postdated the `crm-web` copy) are in
`crm-web/`. Smart-Force 29125a6 (the phone app) is outside this repo until decision 49.

**Tests.** `crm-medstar-modules-access`, `crm-medstar-merge-shared`, `crm-medstar-call-centre-team`,
`crm-vendor-calls-managed`. End-to-end behaviour is proven by Medstar's own suites
(`installations/crm/post-deploy-smoke.mjs`, `smart-force-smoke.mjs`) in Phase 1, item 6.

All new routes are mounted only in `crm-app.mjs`; Mediqzy's `app.js` loads none of them.

**Open.** The tool pages under `crm-web/tools/` still hard-code "Medstar CRM", `/brand/medstar.svg` and the
`medstar_` template prefix; they must read `/api/branding` like the app before a second hospital uses them.

## 5. Web app

The CRM web app was rebuilt from source in `medstar-crm/client/` on 2026-11-15 and has since gained the
Referral network screens and the three-pane Inbox. It moves here as `crm-web/` (Phase 1, item 2).
