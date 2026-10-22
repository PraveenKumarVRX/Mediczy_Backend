# Corporate workflow completion — 22 October 2026

The remaining corporate feature work is deployed at https://app.mediqzy.com. This release extends the consent, audit and certificate ZIP release documented in [the preceding release](CORPORATE_PENDING_TASKS_2026-10-22.md).

## Delivered behavior

- **HR permissions:** Super HR can assign staff, coordinator and viewer access with department, business-unit and branch scopes. The server reloads membership and permissions on each request. Restricted users receive a scoped roster/scheduling workspace; company-wide clinical, finance, administration and reporting endpoints fail closed. Coordinator scheduling validates the target employee against the current scope; viewers cannot mutate schedules.
- **Authenticator MFA:** each corporate login or invited HR account can enroll a real TOTP factor, confirm it, use a code at login and disable it with password/code confirmation. Factors and refresh sessions distinguish company identities from users-table identities. Consumed login codes cannot be replayed, and enrollment invalidates earlier access tokens without the current factor proof. Refresh issuance requires migration-owned tracking tables and fails closed when tracking/revocation storage is unavailable.
- **OIDC SSO:** Super HR can configure an issuer, client ID and encrypted client secret. The implementation uses discovery, authorization code/S256 PKCE, signed ID tokens, state/nonce verification, one-use database sessions and an HTTP-only cookie handoff. It allows existing active corporate HR members only, binds the provider subject, and retains local MFA enforcement. Discovery is restricted to public HTTPS endpoints with pinned DNS resolution. Provider credentials are never returned through generic settings or public status responses. **No production identity provider is configured or claimed tested.**
- **Program reporting:** monthly/annual utilization, department participation, age bands, provider completion counts, paid INR spending, owner-managed annual budgets and completed-care ratings use persisted records. Twelve months are returned even when empty; absent budgets and ratings remain absent. Personal consultations are excluded. The reporting cohort uses employment dates, including departed employees whose employment overlaps the reporting year. HR scheduling records are reported separately from doctor consultations and lab checkups. CSV exports are audited and neutralize spreadsheet formulas.
- **Employee feedback:** employees can rate their own completed corporate consultations/checkups; ratings persist and feed aggregate satisfaction. Corporate/staff credentials cannot impersonate a colliding patient ID.
- **HR scheduling:** owners can manage company-specific doctor scheduling windows. New and rescheduled appointments validate an active roster employee, an active doctor UID, a real future India-time date/time and configured windows. A partial unique index prevents overlapping company bookings for a doctor at the same start time. These company windows do not override a doctor's clinical booking calendar.
- **Certificate uploads:** HR can attach an existing clinician-issued PDF to an active linked employee. PDF signature/type/size checks, antivirus scanning and encrypted object storage precede audited database persistence; failed persistence removes the uploaded object. The upload records its source and original issuer without fabricating a clinical signature. HR download/ZIP and the employee's own download decrypt the stored document. List APIs omit storage internals.
- **Real employee functions:** benefit enrollment, claims, network providers and plan listings use actual records. Unknown employees/plans return explicit errors; unavailable entitlements are not filled with sample limits. Wellness activity uses persisted events. Risk alert preferences persist per organization. This does not introduce a new alert-delivery worker.
- **Offboarding:** roster history and exit dates, corporate associations, corporate packages and subscriptions change in the same transaction as audit evidence. Personal plans and other employers' benefits remain untouched. Reactivation restores only marked, unexpired corporate entitlements. Login auto-activation cannot resurrect an explicitly offboarded roster membership or cancelled/expired subscription.
- **Identity hygiene:** new company names receive whitespace/punctuation normalization, normalized company/email indexes prevent duplicates, and an evidence-only audit identifies historical review candidates. Dairy Day's active organization is retained; its other historical organization was already inactive. Existing clinical identities and UIDs are preserved.

## Verification

- Backend: 141 passing tests across 14 relevant suites, including the additional provider-subject binding regression.
- Frontend: 13 passing tests across four corporate suites.
- Disposable PostgreSQL: 28 integration scenarios (including migration reapplication, real signed OIDC round trip, scoped SQL and offboarding/restoration) and 13 reporting scenarios passed. Personal spending and benefits are explicitly tested for exclusion.
- Live acceptance: 23 API/browser checks plus 14 existing cross-portal API checks passed. Browser checks cover the published authenticator/SSO configuration, program budget/reporting and certificate upload controls; no browser runtime errors occurred.
- Production verification changed no clinical records, consents, employee statuses, permissions, MFA enrollments, SSO provider settings or notifications. Additive schema migrations were applied separately. Successful clinical PDF uploads and external provider login were verified with synthetic/local tests, not production clinical mutations.
- Frontend production build passed. Full application TypeScript still reports the existing application-wide diagnostics; comparison against the preceding release found no new diagnostics after ignoring shifted line numbers and additional optional credential properties in three existing password-type errors. Existing browser externalization/chunk-size warnings remain.
- Entity UID verification: zero violations, one pre-existing warning about missing UID twins on older integer references.

Evidence: [sanitized verification](../testing/CORPORATE_WORKFLOW_VERIFICATION_2026-10-22.json). Private command outputs, read-only data audit and previous tracked API sources are at `/home/ubuntu/corporate-functions-evidence/20261022/`.

## Deployment and recovery

Three additive migrations were applied atomically using `server/scripts/qa/corporate-functions-release.mjs --apply`: doctor UID/schedule uniqueness, one-use SSO sessions and normalized corporate identity uniqueness. The script defaults to read-only preflight and refuses unresolved identity collisions. The general migration runner also propagates conflicts from these migrations.

The API uses the established PM2 `mediczy-server` workspace and was reloaded successfully. The frontend artifact is `/home/ubuntu/mediqzy-releases/corporate-functions-20261022/client/dist`, published to local nginx and S3, with old hashed assets retained. CloudFront invalidation `I1RGJ8DUGXK13FMCNUTLKBSG01` completed. Public, nginx and artifact index SHA-256 match: `4d4d8b79515081d81f53cb055d0cdcc24186bac267e989170767dd2c184df3b3`.

For rollback, restore the previous tracked server files from the private `api-rollback/server/` tree, reload PM2, and restore the previous frontend index on nginx/S3. Keep old hashed assets and the additive database schema. Do not run destructive migration downs against production. New modules can remain unused after the old route files are restored.

## External inputs still required

1. Configure the customer's OIDC issuer/client ID/client secret and register the displayed callback URL before provider login can be enabled and verified with that provider.
2. Supply verified name, email and phone values for TEST-SK01 before changing its clinical account linkage/contact details. The answer “dairyday” resolved the company choice; it does not identify those employee contact values.
3. Historical pending/test doctor names and retired companies remain evidence-led review candidates. A placeholder name cannot establish a real clinician's identity, and inactive historical organizations must not be silently deleted or merged.

These are recorded limits on activation and master-data repair, not unfinished UI toggles or mock service implementations.
