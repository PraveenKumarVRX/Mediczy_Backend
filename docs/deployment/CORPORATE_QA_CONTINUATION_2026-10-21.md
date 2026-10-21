# Corporate QA continuation — 21 October 2026

Completed the Compliance Centre, direct corporate HR identity and duplicate doctor-title work described in the supplied handoff transcript. Product changes are committed and pushed to `main` in `65fe444e` and `3d354739`. Earlier consent SQL and HR response fixes (`16bd6441`, `85199600`) are included in the running API.

## Result

- **Compliance:** `/api/corporate/consent/employees` returned 500 before deployment and now returns 200 with both active Test Corporate employees. The summary and list agree: total 2, granted 0, pending 2. Summary grants now exclude inactive employees, unrelated consent types and other corporations. The UI exposes failed loads with retry, preserves previously loaded data and disables stale exports/consent actions.
- **HR Team:** the response includes exactly one direct corporate identity, using `corporate:3` rather than a colliding users-table ID. The page marks that row “you”, preserves its read-only row actions and excludes the display alias from invited-seat usage. Existing invited-user permissions are unchanged.
- **Appointment names:** a shared display formatter handles bare, titled and repeatedly titled names. Booking creation, notification templates, email appointment details, calendar titles/reminders/participants and socket reminders use it. Doctor master records and existing patient records were not rewritten. Message tests use synthetic recipients; no production notification was sent.
- **CRM settings:** the separate [settings audit](../audits/CRM_SETTINGS_AUDIT_2026-10-21.md) documents 14 open findings. This release records that audit; it does not implement its findings.

## Validation

| Check | Result |
|---|---|
| Backend regression suites | 25 tests passed across three suites |
| Corporate UI regression tests | 3 passed |
| Exact consent SQL on local PostgreSQL | 3 read-only synthetic scenarios passed |
| Production frontend build | Passed; existing dependency/chunk-size warnings |
| Platform smoke checks | 14 passed: database health/isolation, CRM reads, LiveKit readiness and denied unauthenticated/invalid requests |
| Corporate browser verification | 4 passed: live summary/list agreement, direct identity/self label, intercepted load failure and retry recovery |
| Public SPA routes | 8 returned 200 and the expected built index |
| Source parity | 9 relevant source files match API commit `3d354739` |
| Browser runtime errors | 0 |

Evidence: [sanitized verification JSON](../testing/CORPORATE_QA_CONTINUATION_VERIFICATION_2026-10-21.json). Private logs and before/after results: `/home/ubuntu/corporate-qa-continuation-evidence/20261021/`.

Reproduce UI checks with `npm test --prefix client -- src/pages/corporate/CorporateQaContinuation.test.tsx`. Reproduce backend checks with `npm test --prefix server -- --runTestsByPath __tests__/corporate-qa-continuation.test.js __tests__/care-team-notification.test.js __tests__/corporate-employee-create.test.js`. The authenticated live browser check is `node client/scripts/corporate-qa-live-browser.mjs <private-output.json>`; it blocks production mutations.

## Deployment

The API runs under PM2 `mediczy-server` at the established `/home/ubuntu/Mediczy/server` path, with relevant committed source matching `3d3547391879583f9385e26fc4a0099049cb724a`. Frontend output was built from clean commit `65fe444e`; the later commit changes backend code and a QA script, with no additional product UI change. The same frontend was published to nginx's `client/dist` and S3, retaining older hashed assets. CloudFront invalidation `I3KG6HVOZ9K9HFG5N3RZXMXWM8` completed. The index uses `text/html` with `no-cache,no-store,must-revalidate`.

Public index SHA-256: `05a445a53f12d76c3b7af520b4d95cd5bf19796eacdfbae78302e6d37cba23b5`.

**Deployment incident:** the first isolated server-only package omitted `client/src/shared/emergencyKeywords.json`, a runtime API dependency. Its startup failed and PM2 restarted it. The API was restored to its previous workspace path and is healthy there, running the verified fixes. Restart count stabilized at 11; subsequent platform and corporate checks pass. The incomplete artifact `/home/ubuntu/mediqzy-releases/corporate-qa-20261021-01` is marked inactive with `DO_NOT_ACTIVATE`. Future isolated packaging must include sibling runtime modules and pass a startup/dependency preflight before replacing the live process. No database migration was needed for this release.

Rollback references: the previous nginx index is retained privately as `previous-index.html`; old hashed assets remain available. Backend product changes can be reverted independently using the two fix commits, followed by the established PM2 reload and the same smoke checks. No secret-store or provider configuration changed.

## Roadmap status

These results close the three concrete continuation items in the attachment. The broader phases in `/home/ubuntu/.claude/plans/playful-weaving-rocket.md` still require separate implementation and acceptance: expanded report access/audit coverage, finer HR roles and department/branch scoping, eligibility controls, real MFA/SSO configuration, reporting/analytics additions, availability/certificate workflows and approved data cleanup. Clinical consent records, staff privileges and identity data were not fabricated to mark those phases complete.
