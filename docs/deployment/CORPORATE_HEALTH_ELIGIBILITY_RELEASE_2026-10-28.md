# Corporate health eligibility production release — 28 October 2026

Deployed to https://app.mediqzy.com after merging and pushing the feature to main.
Product merge: `647b63200ea886ab1ba7692689fa78d054145fc1`.
Smoke identity selection correction: `ba46418a1db3a6332ad0e5af299b29ca3a5e198a`.
The correction changes only the verification script; the frontend and API product source remain the merged build.

- Production Vite build passed in 1 minute 34 seconds.
- The additive eligibility migration passed a rollback-only production rehearsal, then applied successfully in a transaction.
- PM2 API restarted and remained healthy, with PostgreSQL and Redis connected and no extra restart during verification.
- Frontend published to nginx and S3; public and S3 index hashes match the build. Existing hashed assets were retained. CloudFront invalidation completed.
- 60 unit/regression tests, 5 real PostgreSQL integration tests, 30 public API/schema/artifact checks, and 8 browser acceptance checks passed.
- Browser checks covered the Team session, all six relations, dependent-only selection, explicit inherited/restricted venue policy, the existing admin page, and member booking controls including hospitals.
- Production verification created no bookings and sent no notifications. Booking writes and hospital-slot collision handling were exercised in an isolated PostgreSQL transaction that rolled back.

The deployment host's pre-existing automatic IP block was cleared through the authenticated admin API for that IP alone. Rate-limit/security rules were not changed.

The member page's unrelated support-chat widget returns HTTP 503 with `SUPPORT_CHAT_NOT_CONFIGURED`. This is recorded separately from the health-checkup checks; support-chat source was unchanged by this release.

The existing one-active-booking-per-employee/package limit remains. This release does not add separate family-member redemption quotas.

Release fingerprints and check counts are recorded in `.deploy/corporate-health-eligibility-live-release.json`. Private detailed evidence and the previous frontend archive are retained at `/home/ubuntu/mediqzy-releases/corporate-health-eligibility-20261028/evidence/`.
