# Package-specific employee eligibility editor — 28 October 2026

Deployed to https://app.mediqzy.com from main merge `cc32d4b6`.

Dairy Day had all 175 employees actively assigned to both its Sales and
pre-employment packages. The old tagging dialog disabled already assigned
employees and only supported additions, preventing staff from correcting a full
package's employee list.

The editor now starts with the selected package's current assignments checked.
Staff can tick or untick employees, filter by department, designation and saved
assignment state, select/deselect only the visible group, and inspect pending
addition/removal counts before choosing **Save eligibility changes**. Controls
and the save action remain usable at the reported screen size, with theme-aware
colors and a scrollable employee list.

The new PATCH endpoint saves explicit additions/removals in a transaction while
locking the package. It validates additions against that corporate's linked
employee roster and checks resulting capacity, allowing replacement at full
capacity and removal-only saves. Removals preserve existing validity/usage data
and booking history. Other packages and hidden/concurrent assignments are kept.
The roster includes linked employees who have no separate corporate roster row.
Designation/department/employee-ID values resolve from roster, corporate
association and account data.

Editing catalog packages now preserves individual assignment status. The legacy
Team catalog status toggle changes package availability independently from the
employee list; its aggregate view reads the catalog's availability.

Verification passed:

- 94 backend unit/regression/access tests and 5 frontend selection tests.
- 6 isolated PostgreSQL tests, including swap at capacity, removal-only saves,
  independent pre-employment assignment and preservation after package edits.
- 3 actual endpoint tests against Dairy Day's production data, using one outer
  transaction that was rolled back and checked for exact assignment restoration.
- 30 production sanity/API/artifact checks plus 4 package roster/read checks
  covering both Dairy Day and Equitas and the legacy Team package view.
- 9 browser checks covering editable assigned employees at capacity, filters,
  hidden selection preservation, a scoped save payload intercepted before any
  production write, independent pre-employment state, and unchanged real data.

The production build passed. API is healthy; local/public/S3 frontend index
hashes match and CloudFront invalidation completed. No schema migration was
needed. No real eligibility selection was changed by deployment/testing, and no
notification was sent. Existing assignments remain selected until staff save
their intended package-specific changes.

Private evidence: `/home/ubuntu/mediqzy-releases/package-employee-assignment-fix-20261028/evidence/`.
