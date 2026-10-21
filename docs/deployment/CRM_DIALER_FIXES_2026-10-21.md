# CRM dialer audit remediation — 21 October 2026

Implementation and pre-deploy verification complete; production publication pending. Scope: all 11 findings in [the dialer audit](../audits/CRM_DIALER_AUDIT_2026-10-21.md).

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

Pre-deploy checks: **63 frontend tests**, **76 backend tests**, **63 disposable PostgreSQL checks**, targeted dialer TypeScript check and **33 browser checks** passed. The browser set includes nine functional checks and 24 visual combinations of desktop/mobile, light/dark preference and leads/setup/callback/active/wrap-up/error states. Minimum checked enabled text contrast is 5.67:1. Mutating browser requests are intercepted synthetic fixtures. Real authenticated production reads and post-publication checks will be recorded separately.

Database tests verify concurrent task creation, claimed-task rescheduling, resolution, wrong-agent/tenant rejection, and full rollback after a call-write failure following a task update. They run against disposable PostgreSQL, with no production mutations. The fix changes no schema and requires no migration. Approved staff/provider configuration and real telephone/device acceptance remain separate from these code corrections; no assignments, consent or phone mappings are invented.

The callback-required API now requires `followup_at`; clients using that outcome must supply a time. Existing ordinary wrap-up requests remain valid. The older audit evidence remains a historical snapshot; the remediation verification record will supersede its open status after live checks pass.
