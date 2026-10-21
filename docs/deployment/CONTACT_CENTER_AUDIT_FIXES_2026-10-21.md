# Contact-center audit remediation — 21 October 2026

Status: **all eight audit findings fixed, deployed and verified on https://app.mediqzy.com/crm/contact-center**. Scope: the [eight confirmed functional audit findings](../audits/CONTACT_CENTER_FUNCTIONAL_AUDIT_2026-10-21.md), plus observed setup/readiness feedback.

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

Production evidence is in [the remediation verification record](../testing/CONTACT_CENTER_AUDIT_FIXES_VERIFICATION_2026-10-21.json). Real PSTN operation still requires approved provider/trunk references; biometric/clinical acceptance still requires the existing explicit configuration and human/model evidence. Automated browser fixtures intercept every mutation, and cannot establish real telephone or biometric accuracy.

## Production release and verification

- Backend commit `44840b54`, active release `/home/ubuntu/mediqzy-releases/contact-center-20261021-02/server`; previous release `contact-center-20261021-01` retained for rollback. Frontend commit `cceee585` adds the routing editor reset only; server sources are identical between those commits. Both commits are on `origin/main`.
- Isolated production build passed in 1m 35s with existing dependency/chunk-size warnings. Published to both Nginx and S3, with CloudFront invalidation. Public `/` and `/crm/contact-center` both match the reviewed entry-point SHA-256 `97c88d8c12f947ab0eb2b370efa555293baa8c3815eac0c1b7224851dde045c7`. Older hashed assets remain available.
- Post-deploy: **14 API/database checks**, **5 authenticated CRM browser checks**, **7 deployed-bundle recovery/readiness checks**, **6 real LiveKit audio checks**, and **3 nursing access browser checks** passed. Both CRM browser suites reported zero JavaScript page errors. Real audio checks use generated audio and temporary rooms, including private coaching isolation and hold/resume.
- Recovery browser checks combine actual demo read-only setup state with synthetic intercepted calls, callback claims, graph publications and access expiry. These verify the deployed JavaScript's behavior without production call/clinical mutations. Token rotation's failure/concurrency cases are also covered by unit tests; the browser harness does not rotate a real stored refresh token.
- API process is online with one expected deployment reload (lifetime counter 285 → 286). Dedicated STT, bot and job workers remain online on the compatible previous release, with zero restarts. PM2 state was saved privately.
- The demo still has no assigned contact-center agent, approved PSTN binding or configured biometric service/storage. The page now explains these prerequisites and disables the corresponding starts/capture. LiveKit browser transport is configured; no assigned staff IDs, telephone references or consent were invented.

Private release evidence and the preceding frontend index are under `/home/ubuntu/contact-center-fix-evidence/20261021`, outside the served checkout. To roll back this application fix, activate the retained `contact-center-20261021-01` package and restore `frontend-previous-index.html` to both origins, then invalidate CloudFront. Preserve all hashed assets, the active encrypted database and existing worker processes. No database rollback or schema removal is needed.
