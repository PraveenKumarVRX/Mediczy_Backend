# Equitas AHC FY 2026–27: entitlement implementation plan

Date: 2026-11-11

## Approved operating policy

- The Equitas corporate AHC programme runs from **1 November 2026** through **31 March 2027**.
- The HR-supplied annual roster is the only source of AHC eligibility. It is not a continuation of the prior year's roster.
- Each eligible employee receives one AHC entitlement for **45 days from the date the entitlement is assigned**.
- The effective expiry is `min(assigned date + 45 days, 31 March 2027)`.
- An entitlement may be used once only. Completion marks it consumed; an expired or consumed entitlement cannot be booked.
- A Team member may grant one HR-requested extension of at most **15 days**. The extended expiry cannot pass the corporate end date. Every extension must retain the request reference, reason, approver and old/new expiry values.
- Employees must receive an email and WhatsApp notification containing their own effective expiry date. Extension approval sends the revised expiry by the same channels.

## Delivery sequence

1. Retire FY 2025 AHC catalogue/entitlements. This has been completed.
2. Create an active FY 2026–27 AHC catalogue package with capacity 850, the contracted test list, corporate validity window, 45-day individual validity and 15-day extension limit.
3. Reconcile the HR file against the active employee roster using Employee ID first and official email second. Provision only net-new employees; do not offboard employees missing from the AHC file.
4. Tag only the reconciled 850 linked employee accounts to the FY 2026–27 package. Assignment persists an individual `validFrom`/`validTo` pair with the corporate cap applied.
5. Send the entitlement invitation after QA of a pilot employee. The message includes the package, personal expiry date and booking URL.
6. Run reminders, process bookings and mark the entitlement consumed only when the checkup is completed.
7. Handle exceptions through the audited one-time extension endpoint. A request is rejected after use, after a prior extension, or when the corporate end date would not increase the employee's entitlement.

## Implementation changes

| Area | Change | Acceptance condition |
|---|---|---|
| Catalogue metadata | Store `corporateValidFrom`, `corporateValidTo`, `individualValidityDays` and `maxExtensionDays`. | An AHC package cannot be configured with an invalid corporate window, individual validity other than a positive duration, or an extension above 15 days. |
| Assignment | Derive a personal window at assignment: `min(start + duration, corporate end)`. | An employee assigned on 15 February 2027 expires no later than 31 March 2027. |
| One-time use | Mark `user_health_packages.usedAt` when the Team completes a checkup. | A completed employee cannot start another AHC booking. |
| Extension | Add an immutable `corporate_ahc_entitlement_extensions` audit table and Team endpoint. | Exactly one authorised extension, at most 15 days and never past 31 March 2027. |
| Notifications | Add a delivery ledger and entitlement invitation/extension notification service. | Email and WhatsApp copy include the employee-specific expiry; duplicate delivery for the same event/expiry is suppressed. |

## Scope guardrails

- The 850-person HR file must be uploaded/reconciled before any FY 2026–27 entitlement is assigned.
- The corporate HR roster sync option must remain off for this file: absence from this list means “not eligible for this year’s AHC,” not “resigned.”
- The active 2026 subscription plan is administrative context only. A bookable AHC requires the catalogue package and employee-level entitlement created by this workflow.
- No production employees are assigned or messaged by this implementation itself. Those are controlled, later Team actions after review of the HR roster.
