# CRM dialer audit remediation — 21 October 2026

**All 11 findings are fixed, deployed and verified on https://app.mediqzy.com/crm/dialer.** Scope: all 11 findings in [the dialer audit](../audits/CRM_DIALER_AUDIT_2026-10-21.md).

| Finding | Remediation |
|---|---|
| DIAL-01 | Restore active/undisposed terminal calls; retain reserved identity on detail failure; expose provider reconciliation, honest progress text and Contact Center recovery |
| DIAL-02 | Preserve request key and body fingerprint across uncertain retries and reload; block a changed recipient; new keys follow definitive rejection or known completion |
| DIAL-03 | Atomic, owner-validated outcome/task transitions with required future callback time, single-event retry protection and rollback on persistence failure |
| DIAL-04 | Serialize presence, stop hidden heartbeats, invalidate stale reads and refresh only after pending offline updates |
| DIAL-05 | Revoke CRM refresh sessions before clearing all CRM credentials; stop late updates and lock dialing with visible retry if revocation fails |
| DIAL-06 | One origination readiness rule for provider/phone/availability/active call/wrap-up/visibility; native callback handoff to Contact Center |
| DIAL-07 | Separate loading/error/empty/setup states, keep prior data on failure and expose a named global Refresh |
| DIAL-08 | Server totals and previous/next pages with stable unique-ID ordering |
| DIAL-09 | Reuse scoped contact-center theme, coordinated text/surfaces and tested contrast under both saved preferences |
| DIAL-10 | Existing Mediqzy logo/HealthOS identity, consistent CRM accents, bounded desktop width and Contact Center navigation |
| DIAL-11 | Named Refresh, programmatic queue selection and explicit 44px minimum control sizes |

Pre-deploy checks: **63 frontend tests**, **76 backend tests**, **63 disposable PostgreSQL checks**, targeted dialer TypeScript check and **33 browser checks** passed. The browser set includes nine functional checks and 24 visual combinations of desktop/mobile, light/dark preference and leads/setup/callback/active/wrap-up/error states. Minimum checked enabled text contrast is 5.67:1. Mutating browser requests are intercepted synthetic fixtures. Real authenticated production reads and post-publication results are recorded in [the verification record](../testing/CRM_DIALER_FIXES_VERIFICATION_2026-10-21.json).

Database tests verify concurrent task creation, claimed-task rescheduling, resolution, wrong-agent/tenant rejection, and full rollback after a call-write failure following a task update. They run against disposable PostgreSQL, with no production mutations. The fix changes no schema and requires no migration. Approved staff/provider configuration and real telephone/device acceptance remain separate from these code corrections; no assignments, consent or phone mappings are invented.

The callback-required API now requires `followup_at`; clients using that outcome must supply a time. Existing ordinary wrap-up requests remain valid. The older audit evidence remains a historical snapshot; the remediation verification record supersedes its open status for this release.

## Production publication and verification

Commit `08304f02` is pushed to main. The API runs from `/home/ubuntu/mediqzy-releases/contact-center-20261021-03/server`, preserving parent `contact-center-20261021-02` and overlaying 90 reviewed committed files with verified hashes. The frontend was built from that same commit in isolated checkout `contact-center-build-20261021-04`, passing in 1m 42s with existing dependency/chunk-size warnings. Assets and the entry point are published to Nginx and S3, with CloudFront invalidation and old hashed assets retained. Public dialer and contact-center entry points match SHA-256 `4e48d94be549ff36df1f6d55544d18bc333e8026880514596a70881455a35480`.

Post-deploy verification passed **33 dialer browser checks** (nine functional, 24 visual), **14 API/database smoke checks**, **one safe invalid-wrap-up contract check**, **five actual-data CRM browser checks**, and **three nursing-access browser checks**. CRM/dialer browser suites reported zero JavaScript errors. The 24 visual scenarios retain a minimum checked enabled-text contrast of 5.67:1. The contract check sends an invalid missing-time outcome and verifies HTTP 400 before any service write. Browser call/task/logout transitions use intercepted synthetic responses; they do not create production calls or revoke real staff sessions.

The API is online after one expected deployment reload (lifetime counter 286 → 287). Existing STT, bot and job workers remain online on the compatible prior release, with zero restarts. PM2 state is saved privately. No production database migration, staff role change, provider binding or consent creation occurred. The demo's absent assignments/provider configuration remain actual prerequisites, with explicit disabled controls and guidance.

Private evidence, screenshots, release manifest and previous frontend entry point are under `/home/ubuntu/dialer-fix-evidence/20261021`. Hard-refresh an existing browser tab to load the new build. To roll back application behavior, restore retained API release `contact-center-20261021-02` and the saved preceding frontend index together, then invalidate CloudFront. Preserve the active encrypted database, scheduled callback rows, immutable audit history and all hashed assets; no schema rollback is required.
