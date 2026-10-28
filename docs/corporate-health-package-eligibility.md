# Corporate health package eligibility

Team members with Corporate Management access manage packages at
`/team/corporate-health-packages` (also linked from Corporate Management).
Admin access remains at `/admin/corporate-health-packages`.

Each package supports any nonempty subset of `self`, `spouse`, `child`,
`parent`, `parent_in_law`, and `sibling`. Exclude `self` for dependent-only
packages. Employees are individually assigned through the package's Tag action;
the assignment dialog identifies existing active enrollments. An employee may
hold multiple packages.

Venue policy is explicit: inherit the corporate network, or restrict to selected
labs/diagnostic centres and hospitals for each covered relation. Restricted venues
must already belong to the corporate network. Both package configuration and venue
changes save in the same transaction. Existing packages default to self-only and
inherit their corporate network. Malformed eligibility fails closed.

Employees book at `/health-checkups`, including links from Corporate Benefits.
The API checks the active employee assignment, current catalog, requested relation,
corporate network, package/relation venue restrictions, and configured slot.
Hospital IDs use `hospital:<id>`; numeric lab IDs remain compatible. Hospitals use
`metadata.healthCheckupSlots` with the same slot format as labs. Only configured
slots are bookable. Employer-sponsored packages do not collect employee payment.
Individual package payment remains unchanged. HR's Corporate Benefits view shows
catalog coverage, venue policy, tests and active assignment counts.

The existing one-active-booking-per-employee/package entitlement rule remains.
Coverage controls who may redeem that entitlement; it does not introduce per-person
family quotas, dependent identity verification, or change redemption frequency.

The retired `/api/corporate/book-checkup` write returns HTTP 410. Historical rows
and the legacy history read endpoint remain intact. New bookings and reschedules
use `health_checkup_bookings`; catalog policy changes are protected with row locks
in the same transaction as booking. Database unique indexes arbitrate competing
lab/hospital slot requests.

## Deployment

Apply `server/migrations/20261028000100-health-package-eligibility.migration.js`
before deploying these API changes. It is registered in `server/scripts/migrate-all.mjs`.
Use the normal migration workflow; no live database changes are part of this code
update. Rollback refuses to discard hospital venue history when hospital bookings
exist. The new columns and venue constraints preserve all existing lab bookings.

## Validation

From `server/`:

```sh
npm test -- --runTestsByPath __tests__/admin-health-packages.test.js __tests__/health-checkup-api-regression.test.js __tests__/health-checkup-booking-schema.test.js
sudo -u postgres env HEALTH_PACKAGE_POLICY_SQL_INTEGRATION=1 node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --runTestsByPath __tests__/health-package-policy-sql.integration.test.js
```

The opt-in PostgreSQL suite uses only the local Unix socket, creates an isolated
schema inside a transaction, and rolls back fixtures and DDL. It exercises actual
migration SQL (including repeat application), Team configuration and assignment,
relation-specific lab/hospital discovery, rejected bookings, employer billing,
duplicate booking prevention, and revalidation on rescheduling.
