# Health checkup QA remediation — 21 October 2026

Implementation record for the attached 44-row app.mediqzy.com report. Migration and production deployment are now complete; see [release and live verification](../deployment/HEALTH_CHECKUP_RELEASE_2026-10-21.md). The remaining employee/payment acceptance limit is documented there. The initial implementation did not publish the frontend or reload the API; the subsequent authorized deployment did both. No committed test records, new employee package assignments or outbound messages were created. The authorized Dairy Day / Agilus network assignment below was committed and verified. Database integration checks run inside a transaction that is always rolled back (including the catalog schema).

## Confirmed follow-up scope

The user clarified that kits mean **health-checkup packages**, and changed the target corporate from Test Corporate Ltd to **Dairy Day IceCreams Pvt Ltd** (active corporate 45, `CC9FL6`), with **Agilus** as the requested provider. The inactive Dairy Day record and Test Corporate were not changed.

- Committed and verified 42 active, verified Agilus centre records in Dairy Day’s network, available to all its employees (`employee_ids = "all"`). Existing providers were retained. All 42 already have configured health-checkup slots; no schedules were invented or changed. A subsequent dry run reports 42 matched and 42 already mapped.
- `/api/kits`, `/api/checkup-kits` and `/api/lab/kits` now alias the real package catalog. Admins can read/manage packages; Team reads require an authorized corporate; Labs can read active packages only from their mapped corporates. Normal employees remain denied. Mutations delegate to the same admin CRUD/tagging transaction code.
- API code, schema migration and frontend are now deployed. The live verification covers the real package aliases and network data; Dairy Day’s inactive employee accounts still limit employee-side acceptance.

## Changes

- Admin package list/detail/create/update/deactivate and tag-employees APIs now use a durable `corporate_health_package_catalog`. This catalog is separate from recurring membership subscription plans. Employee assignments continue to use the existing `user_health_packages` eligibility contract. New package IDs use a distinct `hc-<uuid>` namespace. The migration also imports genuine existing employee packages while preserving their IDs and test details, including Dairy Day’s two real assigned packages. Ambiguous IDs shared across corporates are not imported automatically.
- Removed all sample package, employee and corporate fallbacks from CorporateHealthPackages. Failures now display API errors. Employee selection uses the actual merged employee endpoint and only allows active linked employees. Dropdown IDs are strings and selected text has explicit theme contrast.
- AHC activation requires an explicitly selected corporate package, locks the batch and package, enforces capacity, creates eligible employee entitlements and in-app invitations, and updates invited/batch status atomically. Repeated activation is rejected. A past scheduled start is visibly flagged as awaiting activation; dates alone do not grant employee benefits.
- AHC reminders now go to the employee notification feed, count unique active linked recipients actually notified, update invitation state and timestamps atomically, and prevent repeated in-flight UI submissions. No email/push delivery is claimed.
- Bell and Notifications page use the same notification API and total unread count rather than a ten-item AI alert feed. Backend unread filtering consistently uses isRead. Historical repeated doctor titles are normalized for display without editing stored clinical identities.
- Personal package SQL uses the real `annual_price` and `is_active` columns. Empty lab searches have correctly delimited named parameters; production logs confirmed the original syntax error.
- Date validation rejects impossible/past dates. Missing lab IDs fail validation before SQL. Operational staff accounts cannot consume employee package eligibility through the member APIs.
- Booking/cancel/reschedule/payment writes return actual SQL rows. Successful booking confirmation no longer references an undefined variable. Cancelled/completed bookings cannot initiate payment or be revived by verification. A unique active lab/date/slot index prevents concurrent double booking; conflict responses identify unavailable slots.
- Admin corporate-booking access is allowed by the path fence and admin/team checks honor authenticated identity flags. Team employee count uses the active HR roster. Team package discovery includes the real catalog before assignments exist; empty-state wording reflects actual configuration.
- Admin dashboard counts come from database entity tables rather than transient cache directories. Admin login heading has explicit contrast.
- Browser Google SDK is optional; Google Fit renders an unavailable message when its browser client ID is absent. No credentials are fabricated; server OAuth configuration is separate and is not certified by these changes.
- Missing-auth and unknown API paths now return JSON messages instead of the reported legacy string/Express HTML.

## Report coverage and remaining acceptance

| Report rows | Source remediation / acceptance state |
| --- | --- |
| 1–3 | Recipient delivery/counting, shared unread source, historical doctor-title display corrected; live employee reminder retest required. |
| 4, 34 | Booking lifecycle regressions added. Real payment-provider and end-to-end portal acceptance remain pending configured labs/packages and release. |
| 5–7, 9, 31–32 | User-confirmed package aliases implemented for all three kit paths. Admin/Team/Lab scoping and employee denial pass regression checks; live read-only acceptance passed. Other unrequested kit path spellings remain absent. |
| 8 | Member APIs reject operational identities; incorrect stored staff employee associations are not silently rewritten. |
| 10–11, 17–20 | Real admin CRUD/tagging contract and UI failure handling implemented; fake data removed. |
| 12 | Personal SQL corrected; operational accounts receive member-access 403 instead of probing employee APIs. Staff management uses admin/corporate-booking APIs. |
| 13–16 | Admin access fence, entity counts, heading contrast and optional browser SDK handling corrected. Real Google OAuth credentials/provider acceptance remain environment-dependent. |
| 21, 24, 26–30, 37–38 | Previously passing behavior retained where applicable; activation now additionally requires an explicit package. |
| 22–23, 25, 35–36, 42–43 | SQL/validation/catalog/activation fixes implemented. Empty eligible packages and lab lists remain legitimate until packages are created/assigned and a provider is explicitly mapped. |
| 33 | Missing auth/unknown-path responses corrected; no claim that every legacy API error body has been standardized. |
| 39 | Past planned start clearly flagged; activation remains an explicit operation with package selection. |
| 40 | Pending totals include invited enrollments and dashboard excludes inactive roster members. |
| 41, 44 | Employee search retained; Team employee count aligned with active roster rather than linked associations alone. |

## Required configuration and release

1. Provider mapping resolved for the corrected target: Dairy Day now has all 42 active verified Agilus centre records mapped. Existing slots and other provider mappings were preserved. Test Corporate remains unchanged.
2. Kit API contract resolved: health-checkup packages, with management restricted to admins and reads scoped for Team/Lab accounts.
3. Migration and deployment completed: catalog import and active-slot uniqueness verified; API, nginx, S3 and CloudFront now serve the release.
4. Create real corporate packages with approved prices/tests/capacity. Tag employees or select the package while activating a planning AHC batch. Existing active batches are not silently reactivated or assigned an arbitrary package.
5. Retest the report's exact HR/User/Admin/Team/Lab scenarios after release, including real provider payment verification and cancellation/refund business policy. Source tests do not certify payment settlement or refund handling.

## Validation

- 48 API unit/contract regressions pass, including kit aliases and path fencing, CRUD validation, access denial, cross-corporate tagging rejection, capacity, missing/invalid dates, row mapping, confirmation, rescheduling and payment lifecycle guards.
- 3 PostgreSQL integration scenarios pass: catalog lifecycle, AHC entitlement/invitation transaction with repeat protection, and empty-search SQL. All changes are rolled back.
- 16 client tests pass: existing AdminLogin suite and doctor-title display regressions.
- Production frontend build passes (existing dependency and chunk-size warnings).
- Entity UID verifier: zero violations, one pre-existing warning about reference columns without UID twins.
- Syntax and whitespace checks pass for touched application files. Unrelated pre-existing workspace changes were preserved.

Reproduce backend validation:

```sh
HEALTH_CHECKUP_SQL_INTEGRATION=1 npm test --prefix server -- --runTestsByPath \
  __tests__/health-checkup-sql.integration.test.js \
  __tests__/health-package-kits.test.js \
  __tests__/admin-health-packages.test.js \
  __tests__/health-checkup-api-regression.test.js \
  __tests__/health-checkup-booking-schema.test.js
```

The integration suite requires the existing database schema and an active linked employee. It does not commit test notifications or entitlements.

Provider network assignment (already applied; omit --apply for an idempotency check):

```sh
cd server
node scripts/ops/map-corporate-health-labs.mjs --corporate-id 45 --provider agilus
```
