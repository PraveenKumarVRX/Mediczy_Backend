# Contact-center audit remediation — 21 October 2026

Status: implementation and regression verification complete; production deployment verification pending. Scope: the [eight confirmed functional audit findings](../audits/CONTACT_CENTER_FUNCTIONAL_AUDIT_2026-10-21.md), plus observed setup/readiness feedback.

| Finding | Change |
|---|---|
| CC-AUD-01 | Microphone preflight before reservation; retain reserved call identity, end and review controls after a failed join or uncertain outcome |
| CC-AUD-02 | Keep primary/coaching media mounted across console tabs; ongoing-call control link |
| CC-AUD-03 | Provider-aware reconciliation in both UI and generic server route; missing/ended native rooms handled without Exotel requests |
| CC-AUD-04 | Poll selected detail with overview; ignore obsolete/closed-selection responses |
| CC-AUD-05 | Load existing routing graphs; retain flow ID and display returned version when republishing |
| CC-AUD-06 | Route native callbacks into native controls; atomically validate owner, claimed status and recipient before counting a reservation attempt |
| CC-AUD-07 | Preflight guest microphone; preserve the bounded connection grant in memory for retries and clear the invitation fragment after successful connection |
| CC-AUD-08 | Single-flight CRM token renewal, stable mutation identity, terminal sign-in transition and account-switch guards; browser-phone session shares renewal |

Readiness messages explain missing staff assignment, SIP binding, voice-processing configuration and approved biometric model/storage configuration. Server authorization remains authoritative. Existing staff roles, telephone mappings and patient consent were not created or changed.

Regression verification: **45 frontend tests**, **84 backend tests across nine suites**, and **57 disposable PostgreSQL checks** passed. Frontend coverage includes native microphone failures, preserved rooms, call recovery, callback linkage, polling, existing/new flow versions, invitation retry, access renewal and setup guards. Database checks include callback ownership/destination rejection, concurrent idempotent callback retries, transaction rollback and routing version identity. Database tests used disposable PostgreSQL; no production call was created.

The fix requires no schema migration. Release packaging preserves the current isolated production baseline and excludes unrelated working-tree changes. Dedicated media/job workers have no changed worker code or protocol in this release and can remain on their existing compatible release. Existing hashed frontend assets must be retained on both Nginx and S3 for open browser sessions.

Production acceptance details will be recorded after deployment in `docs/testing/CONTACT_CENTER_AUDIT_FIXES_VERIFICATION_2026-10-21.json`. Real PSTN operation still requires approved provider/trunk references; biometric/clinical acceptance still requires the existing explicit configuration and human/model evidence. Automated browser fixtures intercept every mutation, and cannot establish real telephone or biometric accuracy.
