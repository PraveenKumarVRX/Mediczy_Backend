# Health-checkup sanity and smoke tests — 21 October 2026

**PASS:** 47 live checks and 64 regression tests. No production business data was changed, no employee accounts were activated, and no bookings, payments or notifications were created.

| Suite | Result |
| --- | --- |
| Deployment sanity | 18 passed |
| Read-only production API smoke | 25 passed |
| Production browser smoke | 4 passed; zero runtime errors |
| Backend regressions | 48 passed |
| Client regressions | 16 passed |

The API is healthy with PostgreSQL and Redis connected. PM2 remains online at restart count 14 with no new restarts. Runtime source hashes and the nginx/public frontend match the deployed release. Six SPA paths and their entry assets load correctly.

The package catalog contains three real packages, including Dairy Day’s two packages. The active-slot unique index is valid and there are no duplicate active lab/date/slot bookings. All 42 active verified Agilus lab records remain mapped to Dairy Day for all employees, have configured slots, and have matching corporate UID references.

Browser checks confirm genuine package display, readable corporate selection, required package selection before activation, and the two real Dairy Day package choices. The activation UI uses a synthetic intercepted planning batch; package options come from the live API. Non-GET API requests are blocked during browser checks.

**Acceptance limit:** all 175 Dairy Day employee accounts remain inactive. Member API probes use an existing active employee from another corporate and confirm that unrelated Agilus access is denied. Full Dairy Day employee booking/payment acceptance still requires an approved active employee and real payment-provider testing. Citus and DuckDB remain disconnected optional analytics dependencies; neither causes these health-checkup checks to fail.

Detailed sanitized results: [verification JSON](HEALTH_CHECKUP_SANITY_SMOKE_2026-10-21.json). Private logs: `/home/ubuntu/health-checkup-release-evidence/20261021/sanity-smoke/`.
