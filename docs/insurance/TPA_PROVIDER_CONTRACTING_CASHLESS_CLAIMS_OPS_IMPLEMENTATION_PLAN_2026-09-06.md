# TPA Provider Contracting, Cashless, Underwriting, Enrollment, and Claims Operations Implementation Plan

Date: 06 September 2026  
Scope: Mediqzy TPA portal modules required for policy underwriting, member enrollment, e-card issuance, provider onboarding, MOU/SOC management, cashless pre-auth, provider claim submission, and claims operations from inward to payment.

## Objective

Convert the TPA portal from a claims dashboard into an operating platform for the full insurance/TPA back office:

1. Underwrite group policies and track proposal-to-policy decisions.
2. Enroll members/dependents, generate member IDs, approve endorsements, and generate persisted e-cards from active coverage.
3. Onboard network providers with MOU, SOC, validity, blacklist/suspension, and cashless flags.
4. Accept cashless requests from providers and support approval, query, enhancement, and denial.
5. Accept provider claim submission and process claims through inward, scan, bill entry, adjudication, charge entry, and payment advice.

## Current foundation already available

- TPA login and role-compatible authentication.
- Claims lifecycle tables and APIs.
- Member/dependent eligibility snapshot and e-card payload generation.
- Network hospital master and cashless intelligence.
- Claim file vault and document intelligence checklist.
- Policy payable estimate, maker-checker, provider handoff, notification queue, and interop queue.
- Claim workbench UI and smoke test coverage.

## Gaps being closed in this implementation block

| Area | Required capability | Implementation approach |
| --- | --- | --- |
| Policy underwriting | Proposal, quote/risk inputs, underwriting status, approval/rejection | Add underwriting case table/API and list/create/decision workflow |
| Member enrollment | Bulk/single member enrollments, endorsements, generated member ID, e-card trigger | Add enrollment table/API and approval decision; approved enrollment seeds member coverage and e-card verification code |
| Provider onboarding | Add provider, MOU, validity, cashless status | Add provider contract table/API with MOU metadata and validity fields |
| SOC | Schedule of charges with effective/expiry dates | Add SOC version table/API with active/expired control |
| Blacklist provider | Blacklist/suspend provider from cashless network | Add blacklist table/API and update network/provider contract status |
| Cashless forms | Procedure/policy-specific cashless form/checklist | Add cashless form table/API with required documents JSON |
| Cashless request | Provider-initiated request, query, approval, denial, enhancement | Add cashless request table/API and decision workflow |
| Provider claim submission | Hospital submits final claim to TPA | Add provider claim submission endpoint that creates claim + inward record |
| Inward | Physical/digital claim receipt register | Add inward register table/API |
| Scan | Scan/OCR ingestion stage | Add scan batch table/API linked to claim and files |
| Bill entry | Header and line-item capture | Add bill entry and bill-line tables/API |
| Adjudication | Rule decision, approved/deducted amount, notes | Add adjudication table/API and link to payable engine |
| Charge entry | Approved charges by code/category | Add charge entry table/API |
| Payment | Payment advice, UTR/reference, paid status | Add payment advice table/API and claim status transition |

## Data model

Migration `049-tpa-underwriting-provider-cashless-claims-ops.sql` adds:

- `tpa_policy_underwriting_cases`
- `tpa_member_enrollments`
- `tpa_provider_contracts`
- `tpa_provider_soc_versions`
- `tpa_provider_blacklist`
- `tpa_cashless_forms`
- `tpa_cashless_requests`
- `tpa_claim_inward_register`
- `tpa_claim_scan_batches`
- `tpa_claim_bill_entries`
- `tpa_claim_bill_line_items`
- `tpa_claim_adjudications`
- `tpa_claim_charge_entries`
- `tpa_claim_payment_advices`

## APIs

Authenticated TPA APIs:

- `GET/POST /api/tpa/underwriting/cases`
- `POST /api/tpa/underwriting/cases/:caseNumber/decision`
- `GET/POST /api/tpa/member-enrollments` — creates enrollment and generates a member ID when one is not supplied
- `POST /api/tpa/member-enrollments/:enrollmentNumber/decision` — activates approved member and generates the e-card verification code
- `POST /api/tpa/members/:memberId/ecard/generate` — explicit persisted e-card generation endpoint
- `GET/POST /api/tpa/provider-contracts`
- `POST /api/tpa/provider-contracts/:providerCode/soc`
- `POST /api/tpa/provider-contracts/:providerCode/blacklist`
- `GET/POST /api/tpa/cashless/forms`
- `GET/POST /api/tpa/cashless/requests`
- `POST /api/tpa/cashless/requests/:requestNumber/decision`
- `POST /api/tpa/provider-claims`
- `POST /api/tpa/claims/:claimNumber/inward`
- `POST /api/tpa/claims/:claimNumber/scan`
- `POST /api/tpa/claims/:claimNumber/bill-entry`
- `POST /api/tpa/claims/:claimNumber/adjudication`
- `POST /api/tpa/claims/:claimNumber/charge-entry`
- `POST /api/tpa/claims/:claimNumber/payment-advice`
- `GET /api/tpa/claims/:claimNumber/operations`

## UI

Add a TPA Operations Workbench page with operational sections for:

- Underwriting
- Enrollment
- Provider contracting/MOU/SOC/blacklist
- Cashless forms and requests
- Provider claim submission
- Claim operations pipeline

The existing claim workbench remains the detailed per-claim reviewer console; the operations workbench is the launchpad for the TPA back office.

## Validation

Acceptance criteria for this block:

1. Backend syntax checks pass.
2. Existing TPA login/sidebar smoke remains green.
3. Smoke test exercises underwriting, enrollment approval, provider contract, SOC, blacklist, cashless form, cashless request decision, provider claim submission, inward, scan, bill entry, adjudication, charge entry, and payment advice.
4. Frontend production build passes.

## External/production dependencies

The module is application-ready, but production rollout still needs:

- Approved underwriting rules and rating inputs.
- Production provider MOU/SOC legal template.
- Live provider portal credentials if hospitals will submit directly.
- Payment/banking integration credentials for actual disbursement.
- Insurer/NHCX integration certificates and endpoint approvals.
