# Mediczy employee benefits: Getvisit, ekincare and MediBuddy reference analysis

Reviewed: 4 November 2026. Companion: [Mediczy implementation audit](./INDIVIDUAL_CORPORATE_EMPLOYEE_CTO_AUDIT_2026-11-04.md).

## Decision

Build one complete employee benefits journey before expanding the service catalogue. Mediczy has substantial backend foundations, but employees cannot reliably discover and complete all existing functions through a distinct corporate experience. Prioritize identity and entitlement controls, employee dashboard, covered checkout, and service completion.

This comparison uses public first-party product material, not authenticated competitor accounts. Advertised features are references, not independently tested service quality. Employer contracts determine actual coverage. No evidence reviewed establishes that these competitors use the exact Individual / Corporate toggle requested for Mediczy; that selector is our product decision.

## What to reference from each product

| Product | Publicly documented reference | Recommended Mediczy interpretation |
|---|---|---|
| Getvisit / Visit Health | Consultations, diagnostics, pharmacy, dental, vision, physiotherapy, vaccinations and annual checks; employee assistance covering counselling and other life needs; employer onboarding and account support. [Visit employer offering](https://getvisitapp.com/for-employers/) | Make entitled care easy to discover; add a service only with provider availability, booking, completion and support. Keep confidential assistance distinct from employer reporting. |
| ekincare | Benefits hub with wallet, sponsored services and health score; configurable policies including grades, copay and family coverage; employer utilization, invoicing and wellness engagement. [ekincare platform](https://www.ekincare.com/) | Create an employer-aware employee home and a shared entitlement engine. Connect employer configuration to what the employee can actually book. |
| MediBuddy | Its Tech Mahindra Wellness Flex program describes wallet-funded cashless services for employees/enrolled beneficiaries and payment for expenses outside policy terms. Categories include consultations, labs, medicines and other care. [MediBuddy Wellness Flex](https://surgeries.medibuddy.in/opd) | Show covered amount and employee contribution before confirmation; make beneficiary and policy selection explicit. This program is a specific example, not a universal MediBuddy policy. |

Do not copy advertised network sizes, savings, response times or outcome claims into Mediczy. Set service commitments from Mediczy's own contracted capacity and measured performance.

## Mediczy gap matrix

Status vocabulary: **confirmed gap** = directly supported by inspected code; **partial** = foundations exist but journey/integration is incomplete; **unverified** = further tracing or live employee testing is required, not an assertion of absence.

| Capability | Mediczy evidence / status | Implementation requirement | Priority |
|---|---|---|---|
| Individual / employee entry | **Confirmed gap:** `Login.tsx` has password/OTP selection but no audience toggle | Accessible audience selector, separate HR entry, consistent password/OTP/social success routing | P1 |
| Verified employment | **Confirmed gap:** multiple employer resolvers; self-service corporate profile fields and insufficiently restricted association creation | Server-owned employer context; roster/link validation, dates, offboarding and tenant checks; fix audit G04/G05 | P0 |
| Employee home | **Confirmed gap:** shared patient shell; success routes to retail plan selection or `/` | Employer name, eligible beneficiaries, sponsored services, balances, pending actions and support | P1 |
| Employer policy rules | **Partial:** wallet program eligibility JSON and funding types exist | Evaluate relation, grade, age, service, dates, per-person/per-family/category limits, frequency, prescription requirements and exclusions on quote and commit | P1 |
| Benefits explanation | **Partial:** `SmartBenefitsHub` and `/employee/benefits` exist | Plain-language covered services, remaining allowance, validity, exclusions and reason when a service is unavailable | P1 |
| Employee wallet | **Partial:** reserved/utilized balances, tier selection, settlement and cancellation exist | Move employee controls out of HR layout; show allocation, available, pending, used, expiry and transaction history | P1 |
| Covered checkout | **Unverified integration:** program `co_pay` is accepted, but that alone does not prove copay calculation or payment integration | Server quote: price, discount, sponsored contribution and employee payable; hold balance; reconcile payment and booking; expose expiry | P1 |
| Cashless fulfillment | **Partial:** authorization and booking foundations exist | Link employee booking/order to provider confirmation, authorization consumption, completion, cancellation and refund | P1 |
| Beneficiary choice | **Partial:** family APIs and benefit family fields exist | Choose eligible self/dependant first; enforce relation and enrolment rules server-side; explain uncovered costs | P1 |
| Network discovery | **Partial:** employer labs/hospitals/clinics endpoints exist | Search by service/location, actual coverage, collection mode, availability and price; recheck provider eligibility during booking | P1 |
| Annual health check | **Partial:** assigned packages and booking service exist | One guided flow: beneficiary → package → venue/home collection → slot → confirmation → preparation → report → benefit usage | P1 |
| Prescription-led labs/pharmacy | **Unverified complete corporate journey:** shared service pages exist | Link prescription, eligible items, provider inventory/serviceability, substitutions, delivery/collection and payer breakdown | P1 |
| Claims and reimbursement | **Partial:** eligibility/create/list APIs exist | Required-document guidance, upload/reupload, review reasons, status timeline, notifications and settlement reference | P1 |
| Confidential employee assistance | **Unverified dedicated journey:** mental wellness benefit category exists | Contracted counsellors, confidential scheduling, eligibility/session allowance, suitable private records and safe aggregate employer reporting | P2 |
| Dental/vision/physio/vaccination | **Partial catalogue:** dental, vision, vaccination categories exist; physio is not an explicit wallet category | Verify service mappings and provider workflows; add category/schema support if needed. Category labels alone do not establish fulfillment | P2 |
| Wellness engagement | **Confirmed gaps:** employee gamification component has no rendering route; draft challenges appear in employee query | Fix routes and publication rules, then verify activity evidence, scoring, leaderboards and reward delivery | P2 |
| Personalized follow-up | **Unverified employee integration:** shared health/AI pages exist | Consent-aware follow-up after checks and consultations, clinically reviewed rules and measurable completion | P2 |
| HR lifecycle | **Partial:** corporate/team employee administration exists | Activation funnel, failed invitations, verified updates, effective dates, offboarding propagation and employer imports/integrations | P1 |
| Employer analytics/billing | **Partial:** corporate analytics, MIS and billing infrastructure exist | Reconcile eligible lives, activation, service use, authorizations, settlements and employer invoices using consistent definitions | P2 |
| Help and escalation | **Unverified unified employee journey:** patient and corporate support paths exist | One employee case linked to booking/claim, owner, promised response, escalation and resolution notification | P1 |

## Important implementation distinction

The wallet service already supports category programs, active date checks, available-balance calculations, row locking during authorization requests, reservation release, and settlement. Preserve and test this work rather than building another wallet.

However, `fundingType='co_pay'` is a configuration value; it is not evidence that every booking/payment path calculates and collects the correct share. Likewise, storing `eligibility` JSON does not prove that its rules are enforced. In the inspected authorization request path, the wallet query checks user, employer, active status, category and dates; broader beneficiary/grade/prescription rules require explicit tracing and tests.

Relevant implementation anchors:

- `client/src/auth/Login.tsx`, `client/src/hooks/auth.ts`: entry and session handling.
- `client/src/components/layout/Sidebar.tsx`, `client/src/routes/index.tsx`: employee discovery and routes.
- `client/src/pages/CorporateBenefits.tsx`, `client/src/components/corporate/CorporateLayout.tsx`: employee controls mixed with HR layout.
- `client/src/pages/patient/SmartBenefitsHub.tsx`, `client/src/hooks/patient/useSmartBenefits.ts`: reuse benefits display and individual fallback.
- `server/routes/employee-network.route.js`: employer/network/benefits/claims resolution.
- `server/services/corporate-benefit-wallet.service.js`: program rules, wallet, authorization, settlement and cancellation.
- `server/services/corporate-health-checkup-booking.service.js`: existing booking validation.
- `server/routes/corporate.route.js`: employee calendar/challenge and wallet endpoints.

## Proposed employee flow

1. Select Corporate Employee and authenticate. Server validates employer eligibility; an individual-only account gets an actionable explanation.
2. Open employer home: benefits, available wallet, enrolled family, next action and contact support.
3. Select beneficiary and service. Filter by policy, provider network and availability.
4. Receive a server-calculated quote showing employer-funded amount, employee contribution and any rule preventing booking.
5. Confirm once. Reserve allowance and coordinate payment/provider booking with retry-safe operations.
6. Track confirmation, appointment/order, report/prescription and completion from one activity view.
7. Update utilization after fulfillment; release holds/refund correctly after cancellation. Continue personal care and records after employment ends while employer-funded access follows policy.

Proposed APIs are implementation suggestions, not existing endpoints: `GET /employee/context`, `POST /employee/benefit-quotes`, and a single employee booking/checkout orchestration boundary. Reuse existing provider, wallet, claim and booking services behind that boundary.

## Sequenced backlog with acceptance criteria

| Work package | Deliverable | Required acceptance proof |
|---|---|---|
| A — security and identity | Restrict corporate linkage/profile writes; centralize active employee context and revocation | Individual cannot gain employee rights; employee A cannot use employer B; offboarded employee loses sponsored access; HR permissions remain separate |
| B — employee experience | Toggle, audience routing, employee dashboard/menu, wallet and benefits pages | Supplied individual account keeps individual flow; valid employee avoids unnecessary retail plan selection; direct URLs enforce capabilities |
| C — first complete service | Assigned annual checkup from discovery through results and usage | Eligible self/dependant books assigned provider; duplicate submission does not double-book/debit; cancellation releases funds; report belongs to correct person |
| D — reusable covered checkout | Quote/policy evaluation, contribution split, authorization/payment/booking state management | Boundary/sub-limit tests; stale quote rejected; failed payment/booking compensated; concurrent requests cannot overspend |
| E — ongoing care and support | Consults, prescriptions, labs/pharmacy, claims and case tracking | Provider completion drives utilization; reimbursement has document/status loop; support case links to transaction |
| F — engagement and administration | Published challenges, events, assistance, HR reporting and reconciliation | No draft exposure; invitation/beneficiary rules hold; no individual confidential data in unauthorized HR views; invoice totals reconcile |

Order is dependency-based, not a delivery-time estimate. Confirm staffing, provider contracts and integration readiness before assigning dates.

## Definition of competitive readiness

Measure activation-to-first-service conversion; eligible-to-utilizing employees; booking success and time; wallet/claim accuracy; payment/booking reconciliation exceptions; cancellation/refund completion; report turnaround; support response/resolution; employer invoice variance. Set initial targets from Mediczy pilots, not competitor marketing.

For release, require desktop/mobile browser proof for individual, employee, HR, dependant, expired and offboarded accounts, plus API negative tests for tenant/ownership/eligibility and concurrent financial mutations. The 42 passing tests from the earlier audit are useful foundations, not evidence of competitor parity.

This turn adds a reference and implementation analysis only. Competitor apps were not authenticated, application code was not changed, and no additional runtime feature certification is claimed.
