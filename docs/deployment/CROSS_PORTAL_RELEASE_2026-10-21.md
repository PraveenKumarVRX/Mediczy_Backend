# Cross-portal and calling-provider release — 21 October 2026

Merged into `main`, built, deployed and verified at https://app.mediqzy.com. Production source commit: `2c3f97ca0caae43f377e2576dfb089d8b1a6be48` (functional change `682c63f4`, followed by read-only acceptance scripts). Unrelated workspace edits were preserved.

This release publishes the implemented cross-portal corrections for notification delivery/counts, employee and AHC details, measured participation/health data, roster-based eligibility, wellness invitations, doctor selection, appointment aggregation and past-slot validation. It also commits the already deployed health-checkup package work and publishes the six-provider contact-center selector. It does not close the broader report's outstanding MFA, consent/report workflows and reporting features.

## Rollout and verification

- Recovery snapshot: `mediqzy-crossportal-20261021-release`, encrypted, available before migration.
- Additive provider migration: `20261021010000-contact-center-providers`; rollback rehearsal and administrator apply passed, preserving forced tenant RLS and separate NOLOGIN ownership across 22 tables. Existing provider configurations were not changed.
- API: established `/home/ubuntu/Mediczy/server` path, PM2 `mediczy-server`; one reload, restart count 14 → 15, stable afterward. The immediate startup health request briefly returned 502; subsequent API checks and health checks passed.
- Frontend: fresh production build at `/home/ubuntu/mediqzy-releases/crossportal-20261021/client/dist`; nginx and S3 publication completed, with previous hashed assets retained.
- Artifact/nginx/public index SHA-256: `76be950eaaaf27574666df261a7b84ae974a7fcf2f2ebfdec7f7b523c5ea99a6`.
- CloudFront invalidation `I3HAF6VZIFL03Y8GNG0E14MUPA`: completed.
- Tests: 185 backend, 15 client, 63 disposable PostgreSQL checks, and 4 read-only production SQL preflight checks passed. Entity UID verification: zero violations and one existing reference-twin warning.
- Live acceptance: **70 checks passed** — 39 read-only API, 10 browser, 21 deployment sanity. Browser runtime errors: zero. Browser acceptance blocked every non-GET API request. No test bookings, payments, notifications, provider configuration changes or real calls were performed.

The database and Redis are healthy. Optional Citus and DuckDB remain disconnected, as before this release. Dairy Day employee accounts remain inactive; the existing employee probes use an active account in another corporate and confirm unrelated Agilus access is denied.

The new TeleCMI/Airtel IQ/Twilio/Plivo options require approved server connectors and accounts. Zoom Phone requires its licensed signed-in desktop client. Exotel and LiveKit remain available according to existing configuration. Provider catalog visibility does not certify live vendor delivery; see [provider contract and setup](CONTACT_CENTER_PROVIDERS_2026-10-21.md).

Sanitized evidence: [release verification](../testing/CROSS_PORTAL_RELEASE_VERIFICATION_2026-10-21.json). Exact source hashes are retained locally in `.deploy/cross-portal-live-release.json`. Private logs, prior frontend indexes, migration evidence and prior API sources: `/home/ubuntu/crossportal-release-evidence/20261021/`.

## Rollback

Restore only the paths in the private `rollback-files.json` from `api-rollback/` to the established workspace and reload `mediczy-server`. These restore the previous live health-checkup source snapshot plus the prior committed files for this release's additional API changes. Retain additive database columns/constraints and historical call configuration. Restore `previous-nginx-index.html` to `client/dist/index.html` atomically and `previous-s3-index.html` to S3 `index.html`, then invalidate CloudFront. Prior hashed assets are retained. Use this explicit prior-live snapshot rather than assuming the earlier working-tree health-checkup release was represented by its base commit.
