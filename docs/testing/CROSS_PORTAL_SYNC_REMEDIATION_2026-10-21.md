# Cross-portal sync remediation — 21 October 2026

Status: implementation in progress. These changes have not been deployed. This is not a claim that every failed or partial report row is resolved.

## Implemented in this pass

- Appointment bell reminders write to the employee's personal inbox with appointment date/time in IST, reject past/cancelled/completed appointments, and distinguish employee bookings from HR bookings.
- Automatic reminders run each minute, honor saved reminder enablement and lead time, persist the inbox notification and deduplication marker in one row-locked transaction, and attempt selected push/email delivery after commit.
- HR notification navigation uses the live unread count, refreshes after reads, and displays one search field.
- AHC enrollment names resolve from the current linked account and departments use the same General fallback as the HR roster.
- Participation measures completed appointments/checkups rather than enrollment; department counts follow the same rule.
- Health Analysis removes invented category scores and trend improvements, shows absent scores as No data, uses roster departments, and derives checkup completion from completed enrollments.
- The dashboard removes fixed percentage trends and reads the same subscribed plan source as Billing.
- Eligibility department/designation controls select existing roster values.
- Team login returns the prior login timestamp already persisted in the account.
- Wellness invitation selection uses employee IDs from the HR roster. Active recipients receive RSVP records in the same transaction that publishes invites; headcounts come from stored recipients. Fixed count-query unpacking and missing invitation fields in event listing.
- HR cannot complete doctor consultations; completion is reserved for the treating clinician.
- The primary doctor picker saves the selected doctor name; duplicate doctor selection is hidden for doctor bookings.
- HR appointment aggregation uses current appointment columns and scoped roster identity, without returning clinical symptoms.
- Team booking/report autocomplete includes active linked HR-roster employees and returns department/employee ID.
- Doctor slots and booking validation use India time and reject earlier slots today; impossible dates are rejected.
- Legacy internal request tokens are removed from the patient lab-test notes display.

## Validation so far

- 45 focused server tests pass, covering reminders, transaction scope, participation, slot time handling, existing corporate regression coverage, and pending voice-provider adapters.
- 33 adjacent server tests pass for slot normalization, appointment identity/repositories and employee creation/bulk-plan behavior.
- 10 focused client tests pass, including absent-score rendering and one notification search.
- The pending contact-center change passes 63 disposable PostgreSQL integration checks, with zero production mutations or real calls.
- Final frontend production build passed (7,898 modules), including the clinician-only completion restriction. Log: `/tmp/crossportal-build-release.log`.

## Still open

The attachment also requests workflows requiring further implementation and end-to-end evidence: HR MFA/enforcement; consent-controlled report upload/view/download and lab-generated report synchronization; report-ready notifications; certificate upload and bulk document download; employee Excel and eligibility-list imports; dependent eligibility; scoped HR coordinator access and export/status-change audit coverage; comprehensive utilization, satisfaction, vendor and budget reporting; stale appointment reconciliation; and verification of historic booking visibility across Team/HR/patient portals.

Existing real diagnostic provider mappings and package activation were deployed in the earlier health-checkup release. This pass must not fabricate doctors, reports, evening availability, completed care or collection outcomes to make report rows appear successful. Real vendor/provider setup and historic clinical-data correction need separate evidence.

## Release boundary

Preserve unrelated working-tree changes. The pending contact-center provider schema is not yet migrated in production. Do not restart the API into an unverified schema or claim live retest success from unit fixtures. Validate current frontend source, database migrations, scoped API behavior and browser flows before rollout.
