# Main deployment, sanity and smoke checks — 21 October 2026

**Result: PASS.** Built and redeployed `bad6fc708bdcf73b29672ed30fffd13c50c1f497` from `main`. The branch already contained the reviewed settings and corporate fixes; `git fetch origin main` showed zero commits ahead/behind, and `git merge --ff-only origin/main` reported “Already up to date”. No additional feature branch merge was necessary.

## Deployment

- Clean build checkout: `/home/ubuntu/mediqzy-releases/main-build-20261021-01` at the exact release commit.
- Frontend production build passed in 1m 45s. Existing dependency-age, browser-module externalization and chunk-size warnings remained nonblocking.
- Published the build to nginx `/home/ubuntu/Mediczy/client/dist` and S3 `app.mediqzy.com`, retaining previous hashed assets.
- CloudFront invalidation `IADGCRNLR5F1HRSVIFS8PL3DZW` completed.
- Public index SHA-256: `2ff532708470b97a0422fc7879d724b25b4d7ac452875c98a2bc554fa6361b1a`. The clean build matches the prior product build byte for byte; the newer commits add QA scripts and documentation.
- Reloaded PM2 `mediczy-server` on the established `/home/ubuntu/Mediczy/server` path. Restart count increased once from 12 to 13 and stabilized; the process is online.
- Fourteen relevant API/shared/client source files match the release commit. Unrelated local changes were preserved and excluded from the clean frontend build and release commits. No database migration or provider/secret-store change was required.

The first API smoke run began before startup completed and received non-JSON HTML on four probes. Its failed results are retained privately as `api-smoke-during-reload.json`. Readiness subsequently confirmed HTTP 200 with both PostgreSQL connections healthy; all nine API smoke checks then passed. Final acceptance uses the post-readiness results.

## Checks

| Check | Passed |
|---|---:|
| Backend tests across 10 suites | 128 |
| Client tests across 6 suites | 65 |
| Disposable local PostgreSQL scenarios | 20 |
| Settings browser checks against deployed UI | 23 |
| Contact-center browser/theme checks | 41 |
| Dialer browser checks | 33 |
| Corporate browser regression checks | 4 |
| Settings API production smoke | 9 |
| Platform/database/access-control smoke | 14 |
| Public SPA routes matching the built index | 8 |
| Public entry assets with correct content types | 4 |
| Smart-Force login routing on both domains | 2 |

Both targeted TypeScript checks (`client/tsconfig.settings.json` and `client/tsconfig.dialer.json`) passed. Browser runs recorded no JavaScript page errors. The browser total is **101** checks; unit/UI tests total **193**, with another **20** database scenarios.

API verification covers database health, authenticated demo reads, credential-inventory access and input rejection, separate LiveKit readiness, forced RLS on all 22 voice tables, denied unscoped access and denied invalid/unauthenticated requests. Corporate consent summary/list both return 200 with the same two active employees, and the direct corporate identity appears exactly once and is marked “you”.

Smart-Force login was probed with an empty body at both `https://mediqzy.com/api/team/login` and `https://app.mediqzy.com/api/team/login`. Both returned the expected validation response, HTTP 400, instead of a method/routing failure. No password was submitted; this checks routing rather than a credentialed mobile sign-in.

Public routes verified: `/`, `/crm/settings`, `/crm/contact-center`, `/crm/dialer`, `/corporate/compliance`, `/corporate/hr-team`, `/hospital/login`, `/nurse/login`. Entry JavaScript/CSS assets returned 200 with their expected content types.

## Evidence and scope

[Sanitized verification JSON](../testing/MAIN_DEPLOYMENT_SANITY_SMOKE_2026-10-21.json) records the source revision, tests, source hashes, public artifact checks, browser results and before/after process state. Private logs, screenshots and the previous frontend index are retained at `/home/ubuntu/mediqzy-deploy-evidence/20261021-main-bad6fc70/`.

Browser submissions used intercepted synthetic fixtures; authenticated reads used the existing approved demo identities. Malformed API mutation probes were rejected before writes. No production credentials, clinical records or provider settings were changed, and no telephone calls or messages were sent. Real provider delivery and clinical acceptance are outside these smoke checks. Saved CRM connections remain explicitly inactive inventory; Exotel/LiveKit provisioning remains in the contact-center workflow.

Rollback can restore the retained `previous-index.html` on nginx and S3 while preserving hashed assets, then invalidate the frontend cache. API product code is unchanged from the preceding verified settings release; its rollback references remain in [the settings release report](CRM_SETTINGS_FIXES_2026-10-21.md). Do not activate the incomplete corporate package identified in that report.
