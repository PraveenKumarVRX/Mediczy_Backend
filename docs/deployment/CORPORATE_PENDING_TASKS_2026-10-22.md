# Corporate pending tasks — 22 October 2026

Continues the open corporate QA roadmap from `playful-weaving-rocket.md`. The original handoff's consent-list, HR self-identity and doctor-title fixes were already released. This change implements additional consent/audit coverage and the certificate PDF ZIP workflow.

## Implemented

- Employee health dossiers and their CSV exports require current `health_data` consent for the resolved employee in the authenticated corporate. Missing or revoked consent returns 403 before dossier data is queried. Identifiable risk/claims report exports include only active employees with current consent; AHC lists omit report URLs without consent.
- The server records generated report downloads, employee dossier views/exports, risk exports, fitness certificate PDF/ZIP downloads, consent changes, employee edits/offboarding/bulk status changes and AHC enroll-all. Employee/consent mutations and their audit rows share a transaction; success is returned after commit. Bulk status changes record each affected employee. Audit-storage failure blocks the operation.
- Corporate credentials have a separate identity namespace: their audit actor has no users-table foreign key. Invited users are attributed to their actual user ID. The old browser `log-access` callback is retained as a no-op for cached clients; it cannot forge or duplicate evidence.
- Fitness Certificates provides **Download PDFs** and **Download selected PDFs**. The server exports existing issued PDFs only, validates every selected certificate against the corporate, accepts PostgreSQL bigint string IDs, and rejects missing/non-PDF documents. Each request allows 1–100 certificates and at most 25 MB. A failed selection produces an explicit error rather than a partial archive. JSZip 3.10.1 is now a direct dependency (already present transitively).
- SSO's ineffective toggle is disabled and explains that no identity provider is connected. This does not implement SSO. Provider/issuer or metadata details have been requested.

## Validation

- Backend regression suites: 56 passed.
- Client regression suites: 7 passed.
- Local PostgreSQL: 6 checks against actual service SQL passed; temporary tables rolled back, no production data changed.
- Production database privileges: audit table INSERT, audit sequence USAGE and consent SELECT confirmed by read-only preflight.
- Entity UID verification: zero violations, one existing missing-reference-twin warning.
- Production frontend build passed. Existing dependency/browser externalization and chunk-size warnings remain.
- Full application TypeScript check fails across existing application files (2,337 diagnostic output lines). No diagnostic names a changed corporate file. This release does not claim a clean global typecheck.

Reproduce backend tests using the `corporate-access-audit`, `corporate-certificate-archive`, `fitness-certificate-pdf-naming`, `corporate-qa-continuation` and `cross-portal-sync` Jest suites. Client tests: `CorporateFitnessCertificates.test.tsx`, `CorporateQaContinuation.test.tsx`, `CorporateCrossPortalSync.test.tsx`. Disposable SQL: `node server/scripts/qa/corporate-access-sql.mjs` (requires local PostgreSQL and sudo access to its postgres account; never loads production credentials).

## Remaining roadmap

The overall phases 6–10 are not complete. Further work includes department/branch scoping and finer HR permissions, real MFA and SSO, remaining analytics/utilization/vendor/budget/satisfaction features, HR availability and certificate upload workflows, and evidence-led tenant/identity cleanup. Existing master records were not renamed or merged, clinical consent was not fabricated, and no appointments were automatically marked clinically complete.

The consent checks above cover the identified corporate dossier/export/AHC paths. They do not certify all historical document URLs or every clinical API as consent-gated. ZIP exports retain the established occupational certificate permissions.

## Deployment

Deployed product commit `4b9ab314` through the established PM2 workspace API path and a fresh frontend artifact at `/home/ubuntu/mediqzy-releases/corporate-pending-20261022/client/dist`. Nginx and S3 are published, retaining older hashed assets. API health returned a brief 502 during startup, then 200; PM2 is online with restart count stable at 17.

All **26 live checks passed**: 14 existing cross-portal API regressions and 12 new API/browser checks. The new checks verify denied access to unconsented dossiers and CSVs, ZIP validation, an unavailable or foreign certificate, current audit access and pagination, published SSO messaging, published PDF ZIP controls and no browser runtime errors. No clinical records, consent grants, employee statuses, appointments or notifications were changed for verification. Real successful PDF archive contents were tested with local synthetic documents; no production clinical document was downloaded for acceptance.

Production/nginx/artifact index SHA-256: `701c9f01966f31b0f814537cdd5f1e17ab21051c513d1e6d6014e43062a437f8`.

Evidence: [sanitized release verification](../testing/CORPORATE_PENDING_TASKS_VERIFICATION_2026-10-22.json). Runtime source hashes are in `.deploy/corporate-pending-live-release.json`. Private recovery copies and command evidence are retained at `/home/ubuntu/corporate-pending-evidence/20261022/`. No schema migration is required. Rollback restores the three previous API source files, reloads `mediczy-server`, and restores the prior frontend index; old hashed frontend assets must be retained.
