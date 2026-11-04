# Corporate-sponsored annual health checkup (AHC)

## CTO / UX / market audit — 5 November 2026

### Scope and non-negotiable product rule

This journey is for an active employee's **annual, employer-sponsored preventive health checkup**. It is not the pre-employment medical examination (PEME) workflow. PEME is an employer-initiated occupational/fitness case, may require different evidence and a fitness decision, and must remain outside the employee's personal plan and AHC entitlement.

The target employee journey is:

1. Log in in Corporate Employee mode and see the AHC entitlement first.
2. Select the covered beneficiary and package.
3. Choose a supported delivery mode (centre, home collection, or employer camp where configured).
4. Choose a corporate-approved venue, date, and available slot.
5. Review identity, preparation instructions, privacy, and price before confirmation.
6. Receive a provider-backed booking reference at ₹0 where the employer sponsors the benefit.
7. Manage the booking, reminders, reports, and clinically appropriate follow-up from one care timeline.

## What is already sound

| Area | Verified implementation |
| --- | --- |
| Login separation | Corporate Employee mode enters a separate employee benefits/dashboard experience. |
| Entitlement security | The server checks an active `user_health_packages` assignment, validity dates, corporate catalog status, workflow class, relation, and package use state. It locks the entitlement row while booking. |
| Correct plan scope | Only `annual_benefit` corporate packages are accepted by `/health-checkups`; pre-employment and periodic services are rejected from this flow. |
| Network isolation | Approved venues are constrained to corporate network assignments and can be further restricted by package and beneficiary relation. |
| Price integrity | The server, not the client, sets a corporate booking to ₹0 and `confirmed` / `not_required`; Razorpay is not invoked for that case. |
| Slot integrity | Future-date validation, transaction locking, active-slot uniqueness, and duplicate-key handling prevent double booking. |
| Lifecycle | Member booking, cancellation, reschedule, and booking history exist. Cancellation, confirmation, and reschedule use the shared notifier; T-24h reminders are scheduled. |
| Notification recipients | A beneficiary is notified, and the employee is also notified for a non-self booking. WhatsApp is preferred when configured, with SMS fallback and email where available. |

## Release-critical gap found and fixed in this change

### P0 — database index contradicted family-beneficiary policy

The route's duplicate guard was already beneficiary-aware, but the original partial unique index was still `(user_id, package_id)`. PostgreSQL would therefore reject a spouse/parent booking after an employee booked the same package for self.

**Implemented:** migration `20261104000300-health-checkup-beneficiary-uniqueness.migration.js` changes the active uniqueness key to `(user_id, package_id, COALESCE(beneficiary_relation, 'self'))`. It is registered in the migration orchestrator and regression-tested. This permits only one active booking for each covered beneficiary, not unlimited family use.

## UX and operating-model gaps

| Priority | Gap and impact | Implementation decision |
| --- | --- | --- |
| P0 | A local slot is treated as confirmed without a diagnostic-partner acknowledgement or external appointment identifier. A member can arrive at a centre with no provider-side reservation. | Add a provider booking adapter and a `pending_provider_confirmation` state. Persist provider reference, expiry/retry policy, and a concierge fallback queue. Do not label it “confirmed” until the provider accepts. |
| P0 | Family eligibility is relation-based, not a verified dependent identity. A user can type arbitrary name/phone data for “spouse” or “parent”. | Add a verified dependants record with DOB, sex where clinically necessary, relationship, consent, and a beneficiary ID. Bind booking to that ID; retain only an immutable booking snapshot. |
| P1 | Centre selection was a large plain dropdown and the UI restricted the user to the next 14 dates despite the API allowing future booking. | Implemented: searchable approved-centre lookup and a future-date picker. Next: pincode/location ranking, distance, operating hours, accessibility, rating/accreditation, and live service capability. |
| P1 | The employee needs preparation details before committing. Package tests existed but preparation was not surfaced. | Implemented transport and display of catalogued `preparationInstructions`. Make package-owner entry of instructions, fasting requirement, duration, ID requirement, and report TAT mandatory before activation. |
| P1 | The ₹0 value was implicit (“Corporate benefit”), which creates payment anxiety and support contacts. | Implemented explicit “₹0 · employer paid”, no-payment explanation, and `Confirm ₹0 booking` CTA. |
| P1 | A booking only had a toast after submission. It was easy to lose the reference or be uncertain about next steps. | Implemented in-page success state with reference, date/time, notification expectation, and Manage booking CTA. |
| P1 | Centre-only delivery excludes remote, hybrid, mobility-limited, and shift workers. | Add delivery-mode inventory: centre appointment, home collection, and office/plant camp. Each mode needs different capacity, instructions, cancellation, and chain-of-custody controls. |
| P1 | Employee privacy expectation is not explicit at the point of booking. | Add a concise notice: HR sees aggregate utilisation/programme analytics, not individual clinical reports, except where lawful occupational fitness handling and notice/consent apply. Link to the corporate privacy notice. |
| P1 | Cancellation/reschedule policy, cut-off time, no-show policy, and support escalation are absent from the member view. | Serve policy from the package/corporate configuration and show it before confirmation and in booking management. Include a benefit-support route with booking reference prefilled. |
| P2 | Reports and abnormal-result follow-up are not yet the visible end of the AHC journey. | Use the report-OCR pipeline to attach validated results to the employee's longitudinal record. Offer employee-controlled follow-up consult/retest; expose only aggregate, privacy-safe programme metrics to HR. |
| P2 | No supported “covered package + self-paid add-on” journey. | Model add-ons separately from the ₹0 entitlement; show an unambiguous itemised review and use payment only for the opted-in add-on. Never silently convert an employer-covered booking to a paid one. |

## Competitor patterns worth adopting

Visit Health's member guidance makes the policy concrete: employees choose among network diagnostic partners based on location and availability, can track the order, access reports, and have several support routes. Its product positioning also covers centre and home collection. [Visit Health help](https://getvisit.atlassian.net/wiki/spaces/VH/overview) and [employer platform](https://getvisitapp.com/for-employers/).

ekincare presents AHC as a connected programme rather than a single lab order: onsite, at-home, in-clinic, and hybrid delivery; a personal health record and score; and privacy-safe aggregate employer analytics. [Corporate health-checkup platform](https://www.ekincare.com/platform/corporate-health-checkup) and [employee experience](https://www.ekincare.com/).

MediBuddy highlights the complementary enterprise model: onsite camps and annual checks feed a corporate analytical report, while care continues beyond the screening. [Corporate preventive-care overview](https://www.medibuddy.in/blog/what-is-medibuddy-indias-largest-digital-healthcare-company-explained/).

**Product stance:** Mediczy should match the table stakes—verified entitlement, cashless clarity, broad delivery modes, reminders, support, reports, and dependants—then differentiate through tenant-safe network control, report ingestion into a longitudinal record, and consented, clinically governed follow-up.

## Delivery plan

### Phase 0 — release gate

- Apply the beneficiary-aware index migration using the checked migration runner.
- Prove: self and spouse may each hold one active booking; a second booking for either relation fails; cancelled/completed bookings no longer block rebooking.
- Add production monitoring for provider booking failures, notification delivery failures, slot conflicts, and the percentage of bookings that reach provider acceptance.

### Phase 1 — completed in this change

- Show employer-paid ₹0 before confirmation; do not expose a payment step for an eligible corporate AHC.
- Support centre/city search and any future date permitted by the API.
- Surface package preparation instructions when configured.
- Preserve a clear booking-success state and direct management entry point.

### Phase 2 — partner and access completion

- Provider adapter, provider confirmation reference, retry/reconciliation queue, and service-recovery owner.
- Pincode/geolocation, map/list, distance, capabilities, accreditation, wheelchair access, home collection, and onsite-camp selection.
- Verified dependants and per-beneficiary entitlement limits configured by corporate policy.

### Phase 3 — preventive-care loop

- Report delivery SLA, OCR ingestion with review gates, risk explanations, employee-consented follow-up, and a separate HR aggregate dashboard.
- Programme nudges: unbooked eligible employees, upcoming reminders, no-show recovery, and report-follow-up completion.

## Acceptance criteria

- A corporate employee can see an active AHC in Home and Benefits, and select it without seeing a payment form.
- Server rejects inactive, expired, used, non-annual, non-corporate, unassigned, or relation-ineligible packages.
- Family packages permit one active booking for each eligible beneficiary; they do not permit a duplicate for the same beneficiary.
- Every selected venue is corporate/package/relation authorised; the booking is only `confirmed` after partner acceptance once a live integration exists.
- A successful booking shows package, beneficiary, venue, time, ₹0 amount, reference, preparation, cancellation policy, and notification status.
- Cancellation and reschedule notify the beneficiary and booker; a reminder is deduplicated and observable.
- PEME remains outside plan entitlement and is never displayed as an employee AHC benefit.

## Success measures

- Entitlement-to-booking conversion, booking completion, and no-show rate by delivery mode/location.
- Median time to an available slot; provider confirmation failure rate; reschedule/cancel reasons.
- Report SLA and clinical follow-up completion, measured only with appropriate consent and privacy controls.
- HR reporting is aggregate and privacy-safe; individual results are not exposed as a utilisation dashboard.
