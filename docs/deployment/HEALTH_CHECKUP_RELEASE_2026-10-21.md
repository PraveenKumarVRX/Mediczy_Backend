# Health checkup production release — 21 October 2026

Migration and deployment are complete at https://app.mediqzy.com. This release publishes the health-checkup remediation, including the user-confirmed package-kit aliases and Dairy Day / Agilus network setup.

The new catalog contains three imported real packages, including Dairy Day’s two existing packages. Their IDs, assigned employee entitlements and tests were preserved. The migration created the unique active lab/date/slot index without conflicts. It ran transactionally with lock/statement timeouts through the production SSM environment loader. The CLI now recognizes invocation through that loader.

Dairy Day IceCreams Pvt Ltd (active corporate 45, `CC9FL6`) has 42 active verified Agilus lab records mapped for all employees. All already have configured slots. Existing providers were retained; the inactive Dairy Day duplicate and Test Corporate were not changed.

## Deployment

- API: PM2 `mediczy-server`, established `/home/ubuntu/Mediczy/server` path. Restart count increased once from 13 to 14 and remained stable. Public health reports healthy with PostgreSQL connected.
- Frontend: fresh production build at `/home/ubuntu/mediqzy-releases/health-checkup-20261021/client/dist`, published to nginx `client/dist` and `s3://app.mediqzy.com`. Older hashed assets were retained; nginx index was replaced atomically after assets were copied.
- CloudFront invalidation `I3BZ9SCPIHIKQSHU8TVGII71HN`: completed.
- Public, nginx and artifact index SHA-256: `1eff27693e6bf62337dc03e408cdd8ead231b12cea6f0ac4049e9e2d0279c538`.
- Provenance: explicit working-tree source snapshot based on `a1254c33313b82389823ebf07d307b8c58e1bbb8`, rather than claiming the uncommitted changes are contained in that commit. Exact runtime source hashes are in `.deploy/health-checkup-live-release.json`; a source copy is retained with the release. Unrelated workspace changes were preserved.

## Verification

| Check | Result |
| --- | --- |
| Backend unit/contract and rollback-only SQL integration tests | 51 passed |
| Client regressions | 16 passed during implementation |
| Fresh production build | Passed; existing dependency/chunk-size warnings |
| Live read-only API checks | 25 passed |
| Production browser checks | 4 passed, zero runtime errors |
| Public SPA routes | 6 passed with the exact new index hash |
| Entity UID check | Zero violations; existing warning about reference columns without UID twins |

Live API checks cover all three kit aliases for Admin/Lab, employee kit denial, genuine admin package list/detail, corporate booking packages/labs, member profile/packages/labs, date validation and cross-corporate lab denial, activation package options, notification count, dashboard entity counts, unauthenticated denial and JSON 404s. No bookings, payments, employee invitations or notifications were created by these checks.

Browser verification confirms that real Dairy Day packages render without sample fallback and corporate selection has visible text. A clearly identified synthetic planning batch was intercepted in the browser to test opening the activation dialog without creating or changing a real batch; package options came from the live Dairy Day API. The picker required a package and listed both real packages. All non-GET API requests were blocked during browser acceptance (one blocked request).

Sanitized summary: [deployment verification](../testing/HEALTH_CHECKUP_DEPLOYMENT_VERIFICATION_2026-10-21.json). Private logs, rollback material and detailed evidence: `/home/ubuntu/health-checkup-release-evidence/20261021/`.

## Acceptance limitation

All 175 Dairy Day employee accounts are currently inactive, despite active corporate associations. No accounts were activated as part of deployment. Live member probes used an existing active employee from another corporate and verified denial of unrelated Agilus access. Full Dairy Day employee booking/payment acceptance requires an approved active employee account and the real payment-provider workflow. Publishing this release does not certify payment settlement, refunds or outbound provider delivery.

## Rollback

Previous nginx and S3 indexes are saved separately as `previous-nginx-index.html` and `previous-s3-index.html` in the private evidence directory. Prior tracked API files are in `api-rollback.tar` (base `a1254c33`); restore only those named files to the established workspace path and reload `mediczy-server` if rollback is needed. Restore each frontend index to its original destination and invalidate CloudFront. Retained hashed assets support the previous indexes.

Leave the additive catalog/index in place during an application rollback; do not drop packages or rewrite employee entitlements. Dairy Day’s requested Agilus mapping is an independent authorized data change. Never activate the earlier incomplete corporate release artifact.
