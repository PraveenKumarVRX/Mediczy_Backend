# Lab booking history fix — 14 November 2026

`POST /api/labs/book` previously wrote only `appointments`, while mobile Orders reads `GET /api/lab-tests` from `lab_tests`.

The handler now creates a LabTest and saves `appointment.metadata.labTestId` inside the existing RLS transaction. The LabTest stores its reciprocal `metadata.appointmentId`, patient/family reference, lab directory reference, test name, schedule and price. Failure rolls back both records. Lab directory IDs are stored in metadata rather than the unrelated hospitals foreign key.

The response preserves `appointment.id` and adds `labTestId` at the top level and within `appointment`. Mobile clients should use `labTestId` for lab Orders/details and retain `appointment.id` for appointment operations. Billing order metadata includes both references.

Cancellation and schedule updates through the appointment and lab-test endpoints update both records in a transaction, scoped by user and reciprocal reference. A broken existing link causes the operation to fail instead of committing only one side.

## Validation

From `server`:

```sh
npm test -- --runTestsByPath __tests__/lab-appointment-link.test.js __tests__/patient-lab-workflow.test.js __tests__/patient-lab-checkout.test.js __tests__/appointment.repository.test.js __tests__/appointment-identity.service.test.js __tests__/appointment-slot-time.test.js
```

42 tests passed. Changed JavaScript files also pass `node --check`. These are local tests with mocked persistence; staging database/RLS verification remains necessary.

## Staging acceptance

1. Book through `/api/labs/book` as a patient and confirm both returned references.
2. List `/api/lab-tests` as the same patient and open the returned LabTest ID. Check test name, date, price, lab and family reference.
3. Cancel through each endpoint on separate bookings; verify both rows.
4. Reschedule through each endpoint on separate bookings; verify both schedules.
5. Repeat as another user and confirm the bookings cannot be viewed or changed.
6. Verify billing/payment flow for a fee-bearing booking with both references preserved.

## Existing bookings and deployment

This change prevents new missing history records. It does not automatically repair historical appointments. Before recovery, inventory lab appointments without `metadata.labTestId` in the target database under the correct tenant context. Check for an existing LabTest with matching `metadata.appointmentId` before creating any record, and reconcile ambiguous older matches manually. Preserve cancellation/completion state and payment references during recovery. Take a backup and validate a small staging sample first.

No database schema migration is required. No staging or production deployment or historical data repair was performed as part of this local change. The mobile source referenced in the original Windows handoff was not available here; tab navigation changes have not been validated.
