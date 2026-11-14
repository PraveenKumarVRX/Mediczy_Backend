# API and vendor-layer release — 14 November 2026

Status: **backend deployed and verified; frontend build ready, publication blocked by AWS IAM**.

## Source and build

Changes were integrated on the synchronized `main` branch and pushed to origin:

- `e5724ff4`: mobile API contracts and managed vendor transports.
- `916481a8`: allow `doctorId: null` for lab appointments in the contract, found by the live smoke test.

The running backend serves OpenAPI **1.2.1**, with 191 paths / 210 operations. No dependency or
schema changes were required for this release, so unrelated database migrations were not run.
The previous backend commit is `482ffc39`; `.deploy/last-good-sha` retains that rollback target.

Production frontend build passed (7,929 modules, approximately 94 seconds). Its archive is:

`.deploy/releases/2026-11-14-api-vendor/client-dist.tar.gz` (23 MiB)

SHA-256: `2172af33d0a2a9b6c11df30963725c26868461d4d35828756a9cfc1467d77023`

No frontend source changed between the build commit and the contract correction.

## Deployment and validation

- `mediczy-server`, `mediczy-worker`, and `feedback-intelligence` reloaded successfully and are online.
  Their existing process configuration and SSM secret loader were retained.
- `/api/health` on localhost:8888 reports healthy.
- Four CRM route checks returned the expected unauthenticated HTTP 401.
- Seven live admin checks passed: authentication, patient-role denial, exact OpenAPI match,
  Swagger UI, catalogue summary and single-vendor status. The live catalogue reports
  18 core-managed vendors, 1 own-client vendor and 0 unmanaged vendors.
- **26/26 authenticated patient contract smoke checks passed**. These include appointments,
  lab history, pharmacy orders/catalogue, billing orders and membership state.
- Canonical sanity/smoke run: **GO**, exit 0, zero failed steps or critical failures. It used
  `SMOKE_READ_ONLY=true`; mutation/call/notification scenarios were deliberately skipped.
- The contract correction passed 35 focused contract tests. Before deployment the full
  backend suite passed 3,081 tests; final transport/contact-center checks passed 96 tests.
- Existing public frontend HTTPS returns 200. Direct localhost:443 with the app hostname instead
  reaches the server's separate self-signed `smart-chat.live` certificate; it is not the public
  frontend TLS termination and was not treated as the app's certificate check.

Detailed build, reload and smoke logs are in the directory recorded by `.deploy/active-release-dir`.
The canonical runner's generated report was copied there, and the pre-existing local
`SANITY_CHECK_RESULTS.json` was restored. Unrelated local reference files were retained.

## Remaining external blocker: frontend publication

The existing EC2 identity `EC2-SSM-Role` was denied both:

- `s3:ListBucket` on `arn:aws:s3:::app.mediqzy.com` during the normal deploy script.
- `s3:PutObject` on the known build asset when attempting an upload without listing.

Only the default AWS profile is present; neither local environment files nor the approved
SSM runtime environment provides another deployment identity. No IAM permissions were changed.
The existing S3 `index.html` is byte-for-byte unchanged after the denied uploads. No frontend
entry point was replaced and no production assets were deleted.

An approved deployment identity/environment with S3 publishing and the intended CloudFront
permissions is required to finish. The build is already packaged; extract it to a build directory
and run `BUILD_DIR=<that-directory> bash scripts/deploy/deploy-frontend-s3.sh` under that identity.
Then verify the published index/assets and SPA routes before marking frontend deployment complete.
