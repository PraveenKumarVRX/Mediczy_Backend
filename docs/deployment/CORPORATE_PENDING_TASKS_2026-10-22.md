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

Pending final rollout verification. Private recovery copies and command evidence are retained at `/home/ubuntu/corporate-pending-evidence/20261022/`. No schema migration is required. Rollback restores the three previous API source files, reloads `mediczy-server`, and restores the prior frontend index; old hashed frontend assets must be retained.
