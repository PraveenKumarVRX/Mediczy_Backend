# API and vendor-layer release — 14 November 2026

Status: **backend and frontend deployed and verified**.

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
- Frontend published with `scripts/deploy/deploy-frontend-nginx.sh` to the active document root,
  `/home/ubuntu/Mediczy/client/dist`. Nginx configuration validation and reload passed.
- Public `https://app.mediqzy.com/index.html` exactly matches the prepared build. The main
  bundle is `/assets/index-CC4uAVjv.js`. All four entry-point JavaScript/CSS files returned 200
  and their SHA-256 hashes match the local build.
- `verify-spa-routes.sh` passed: `/scm/dashboard`, `/scm/login`, `/doctor/login`, and
  `/team/settings` all return 200 HTML; the main bundle contains the SCM route.
- Backend health remained healthy after frontend publication. Old hashed assets were retained;
  the previous entry point is backed up at
  `.deploy/releases/2026-11-14-api-vendor/frontend-nginx/previous-index.html`.

Detailed build, reload and smoke logs are in the directory recorded by `.deploy/active-release-dir`.
The canonical runner's generated report was copied there, and the pre-existing local
`SANITY_CHECK_RESULTS.json` was restored. Unrelated local reference files were retained.

## Deployment-path correction

The initial S3 deployment attempt was denied `s3:ListBucket` and `s3:PutObject` under the
existing EC2 role. Subsequent origin verification established that **the live app is served
from Nginx `client/dist`, not from that S3 bucket**: the pre-deploy public bundle matched the
Nginx document root and differed from the S3 entry point. The S3 permission denial therefore
did not block the actual frontend deployment. No IAM permissions or CDN topology were changed.

The frontend-only shell script verifies the configured Nginx root and build references, copies
assets first without deletion, atomically replaces `index.html`, reloads Nginx, and verifies the
served index. If a step after publication fails, it restores the backed-up entry point.
The deployment neither reinstalled dependencies nor restarted the already-verified backend.

The current public frontend and backend are both verified. No frontend publishing task remains.
