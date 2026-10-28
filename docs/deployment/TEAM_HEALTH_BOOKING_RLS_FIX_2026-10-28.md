# Team health booking RLS correction — 28 October 2026

Deployed to https://app.mediqzy.com from main merge `a5af9224`.

The Team page `/team/corporate-health-booking` uses
`POST /api/corporate-bookings/health-checkup`, which writes `lab_orders`.
The route had no transaction-local corporate RLS context, so the runtime
PostgreSQL role correctly rejected its insert. The selected lab was also
only recorded in free-text notes rather than `lab_id`.

The corrected booking service sets the authorized, resolved corporate ID and
staff user ID on the same transaction/connection used for the insert. Platform
admin bypass remains false. Active employee association and the active lab's
membership of the corporate network are checked within that transaction.
The selected lab ID and real saved order ID are persisted/returned.
Booking-history rows and counts now use the same scoped transaction pattern.
Notifications execute after a successful committed insert and respect the
Team page's existing email/WhatsApp switches.

Verification:

- 85 unit/regression/access checks passed.
- The actual Team POST and history handlers passed two integration tests using
  the production database, real corporate authorization, and forced RLS under
  the normal runtime role. Their outer transaction was rolled back.
- Six post-deploy public smoke checks passed, including the Dairy Day Sales
  package, employee search, mapped labs, history and API health.
- Six production RLS checks reproduced the original rejection, proved the
  corrected insert and lab/corporate fields, verified bypass remained disabled,
  proved isolation from another corporate context, and verified rollback cleanup.

The API process was reloaded and is healthy. No schema migration or frontend
change was required. No production test booking was committed, and no email or
WhatsApp notification was sent. The user's failed request was not replayed.

Private evidence: `/home/ubuntu/mediqzy-releases/team-health-booking-fix-20261028/evidence/`.
Reproduce the rollback-only SQL probe through the normal SSM loader with
`CORPORATE_BOOKING_SMOKE_OUTPUT` set and entrypoint
`server/scripts/qa/corporate-team-booking-rls-smoke.mjs`.
