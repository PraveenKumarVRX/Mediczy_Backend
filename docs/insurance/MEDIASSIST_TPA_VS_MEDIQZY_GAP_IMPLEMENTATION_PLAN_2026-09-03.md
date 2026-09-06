# Medi Assist TPA vs Mediqzy TPA Portal Gap Analysis & Implementation Plan

Date: 03 September 2026  
Scope: Mediqzy TPA portal, corporate/employee benefits flows, claims, pre-authorisation, e-card, hospital network, communication, analytics, and trust/compliance workflows.

## Executive summary

Mediqzy now has a functional TPA portal shell with login, dashboard, claims, corporates, members, policies, pre-auth, approvals, analytics, reports, settings, support, profile, communication configuration, provider integrations, e-card retrieval, hospital search, and claim-submission screens. Local smoke testing confirms the current sidebar APIs return `200`.

The gap is not basic navigation anymore. The gap is depth, trust, production-grade workflows, and member/corporate self-service. Medi Assist has a mature benefits-administration ecosystem around MAven Portal/App, e-card, policy and beneficiary details, network hospitals, hospitalisation intimation, reimbursement claim submission, real-time tracking, OPD benefits, out-of-pocket estimation, document handling, grievance/SLA mechanisms, verified communication, identity verification, AI document processing, and fraud controls.

To make Mediqzy world-class, the next work should convert the current TPA screens from mostly operational/mock data into a fully transactional claim lifecycle platform with shared member, HR, provider, insurer, and TPA workflows.

## Evidence reviewed

This comparison uses publicly accessible information only; authenticated Medi Assist internal screens were not available.

- Medi Assist TPA home page lists policyholder benefits including e-card download, hospitalisation intimation, nearby hospital search, claim form download, online reimbursement claim submission/tracking, health files, grievance redressal, insurance partners, WhatsApp support, and footprint metrics. Source: https://mediassisttpa.in/
- Medi Assist services/product pages describe MAven Portal/App capabilities: policy details, coverage and beneficiary information, e-card downloads, hospital locator, hospitalisation requests, reimbursement claims, real-time tracking, dependents, OPD benefits, and out-of-pocket expense estimation. Sources: https://mediassist.in/services/ and https://mediassist.in/products-tech/
- Medi Assist benefits administration page describes claim intimation, e-card, e-cashless planned hospitalisation, hospital locator, and reimbursement document upload. Source: https://mediassist.in/benefits-administration/
- Medi Assist FAQ describes real-time claim tracking, pre-authorisation handling, e-card use during admission, reimbursement claim timelines, required reimbursement documents, shortfall/IR handling, and claim processing/payment timelines. Source: https://mediassisttpa.in/faq/
- Medi Assist grievance page lists grievance/SLA redressal and official outbound communication channels. Source: https://mediassisttpa.in/grievance-redressal/
- 2026 news coverage describes Medi Assist’s AI platform upgrades: document processing for cashless pre-auth, real-time hospital transparency, fraud/waste/abuse detection, Aadhaar offline verification, and claim-call reduction. Sources: https://www.expresshealthcare.in/news/medi-assist-advances-access-to-cashless-healthcare/454606/ and https://www.expresshealthcare.in/news/medi-assist-integrates-uidai-aadhaar-offline-verification-into-health-benefits-platform/454439/

## Current Mediqzy baseline

Verified in code as of this document:

- TPA login and bootstrap migration exist.
- TPA dashboard API exists and returns stats.
- Sidebar routes exist for dashboard, claims, corporates, members, policies, pre-auth, approvals, analytics, reports, communication, heritage integration, settings, support, and profile.
- Frontend route `/tpa/approvals` has been added.
- `TPAPlaceholders.tsx` now renders live API-backed pages instead of static “Coming Soon”.
- Backend endpoints exist for claims, corporates, members, policies, pre-auth, approvals, analytics, reports, report download, settings, support, profile, communication config, and communication send/test/config actions.
- TPA provider integration pages exist for provider selection, e-card retrieval, claim submission, hospital search, and Heritage/MDIndia/HealthIndia-style integrations.
- Local smoke test verifies login, dashboard, and all sidebar menu APIs return `200`.

Important limitation: several TPA APIs still use sample/mock data. They prove navigation and UX shape, but not production-grade business processing.

## Feature comparison matrix

| Area | Medi Assist public capability | Mediqzy current state | Gap | Priority |
| --- | --- | --- | --- | --- |
| Login/access | Separate sign-ins for retail policyholder, corporate employee, corporate HR, provider, insurer, agent, broker | TPA login works; Mediqzy also has many portal roles, but TPA-specific RBAC is shallow | Need TPA role hierarchy, branch/team users, maker-checker approvals, MFA, audit dashboards | P0 |
| E-card | Download/generate e-card for member and beneficiaries | E-card retrieval page exists through provider APIs | Need native Mediqzy e-card generation, QR verification, dependent cards, wallet download, share link | P0 |
| Policy/beneficiary details | Policy details, coverage, beneficiary information | Policies/members pages exist but mostly simple records | Need policy benefits engine, exclusions, waiting periods, balances, family floater/dependent hierarchy | P0 |
| Network hospitals | Search nearby/network hospitals | Hospital search page exists via provider integration | Need geolocation, tariff/package metadata, cashless eligibility, insurer/TPA-network filters, map UX | P0 |
| Hospitalisation intimation | Planned/emergency intimation before/around admission | Heritage claim intimation exists; not unified across TPA portal | Need first-class intimation workflow, SLA timers, hospital handoff, status timeline | P0 |
| Cashless pre-auth | E-cashless planned hospitalisation and pre-auth flow | Pre-auth list exists; Heritage preauth integration exists | Need complete intake, document upload, triage, medical review, enhancement, denial reasons, approval letter | P0 |
| Reimbursement claim submission | Online reimbursement claim submission and tracking | Claim submission page exists; generic TPA integration exists | Need native multi-step wizard, document checklist, bank verification, declaration, claim reference, shortfall handling | P0 |
| Real-time claim tracking | Real-time claim status and notifications | Claims list exists; dashboard stats exist | Need lifecycle event stream: submitted, IR, approved, settled, rejected, paid; employee/HR/provider views | P0 |
| Claim forms/document pack | Download claim forms and upload documents | Reports download added; no native claim-form/document pack generator | Need dynamic claim form generator, document checklist by claim type, PDF bundle, OCR status | P1 |
| My Health Files | Upload/manage prescriptions, reports, discharge summaries | Mediqzy has broader health-record modules, not deeply linked to TPA claim file | Need claim-file vault connected to patient documents, consent, OCR, dedupe, retention | P1 |
| OPD benefits | OPD benefits supported in MAven | Mediqzy corporate benefits work exists; TPA OPD claim flow not mature | Need OPD wallets, benefit rules, pharmacy/lab claims, reimbursement/cashless OPD | P1 |
| OOPE estimator | Out-of-pocket expense estimator | Not present in TPA portal | Need estimator using policy coverage, hospital package/tariff, co-pay, exclusions, room-rent limits | P1 |
| Dependents | Manage dependents/beneficiaries | Members page shows dependents count only | Need add/edit/deactivate dependents, age/relationship validation, policy endorsement workflow | P1 |
| Grievance/SLA | SLA/grievance redressal and ombudsman path | Support page exists with simple tickets | Need grievance workflow, escalation matrix, SLA breach flags, IRDAI-style audit log | P1 |
| Verified communication | Official outbound channels, WhatsApp support | Communication hub exists for Email/SMS/WhatsApp/Voice config | Need claim-triggered templates, DLT/TRAI compliance, WhatsApp bot, delivery receipts, anti-phishing notices | P1 |
| Hospital/provider transparency | MAgnum provides provider real-time visibility | Mediqzy hospital/insurance desk modules exist separately | Need unified TPA-provider workbench: eligibility, pre-auth status, settlement, query resolution | P1 |
| AI document processing | MAven IDP structures hospitalisation documents | Mediqzy has AI/report scanner capabilities elsewhere, not wired into TPA lifecycle | Need TPA IDP pipeline: OCR, extraction, coding, completeness, clinical summary, shortfall prediction | P1 |
| Fraud/waste/abuse controls | MAven Guard detects FWA | No dedicated TPA FWA engine | Need rules + ML risk scoring, provider/member anomaly detection, duplicate claim detection, audit queue | P1 |
| Digital identity | Aadhaar Offline Verification integration announced | Aadhaar QR/OCR modules exist elsewhere, not TPA-specific | Need consented identity verification at admission/reimbursement, audit-safe storage, privacy controls | P1 |
| Analytics | Claims, SLA, fraud, provider, NPS outcomes publicly emphasised | Analytics endpoint/page exists but simple sample data | Need operational dashboards by corporate, provider, insurer, city, SLA, claim type, leakage, NPS | P1 |
| Scale/reliability | Large network and high claims volume | Current TPA module not load-tested | Need queue-based processing, idempotency, audit events, retry, observability, export jobs | P2 |
| Compliance | IRDAI license, public disclosures, grievance path | Mediqzy has compliance docs/modules but not TPA-specific controls | Need TPA compliance register, retention policy, privacy notices, consent ledger, audit export | P2 |

## Product gaps to close first

### P0 — Must-have parity for real enterprise TPA use

1. **Native claim lifecycle engine**
   - Current: claims list is usable but sample-backed.
   - Build: `claims`, `claim_events`, `claim_documents`, `claim_financials`, `claim_shortfalls`, `claim_approvals`, `claim_payments`.
   - UI: claim detail page with timeline, document checklist, notes, decision panel, approval/rejection letters, settlement status.
   - APIs: create claim, update stage, upload documents, raise IR/shortfall, approve, reject, settle, export.

2. **Cashless pre-authorisation workflow**
   - Current: pre-auth list and provider-specific Heritage actions exist.
   - Build: planned/emergency pre-auth intake, hospital initiated request, medical reviewer queue, query/IR, enhancement, approval letter, denial reason.
   - SLA: planned and emergency timers, breach flags, escalation.

3. **E-card and member eligibility**
   - Current: external/provider e-card retrieval exists.
   - Build: native e-card PDF/card renderer, QR verification endpoint, member/dependent eligibility, coverage balance, policy terms, beneficiary list.

4. **Network hospital search with cashless intelligence**
   - Current: hospital search component exists.
   - Build: hospital network master, insurer/TPA mapping, specialties, geolocation, cashless status, tariff/package metadata, preferred providers, directions.

5. **Corporate HR + employee claim views**
   - Current: TPA portal exists; corporate wellness/HR modules exist separately.
   - Build: HR view for employee claim statuses, bulk member upload, endorsement requests, MIS, escalation, policy utilisation.
   - Employee view: submit/track claims, download e-card, view dependents, see policy balance and claim history.

### P1 — World-class differentiators

1. **AI document-processing pipeline**
   - Intake documents from employee, HR, hospital, or TPA.
   - OCR and classify bills, discharge summary, prescriptions, investigation reports, claim form, ID proof, bank proof.
   - Extract ICD/procedure hints, dates, hospital name, bill line items, totals, missing documents.
   - Generate medical summary and shortfall prediction.

2. **Fraud, Waste and Abuse risk engine**
   - Rules: duplicate bills, inflated package rates, repeated admissions, suspicious provider/member patterns, mismatched dates, blacklisted providers.
   - Risk score on every claim/pre-auth.
   - Reviewer queue with explainability, evidence, and disposition.

3. **OOPE and benefit estimator**
   - Inputs: member, policy, hospital, procedure, estimated cost, room category.
   - Output: payable estimate, co-pay, exclusions, likely out-of-pocket, required documents, pre-auth recommendation.

4. **Verified communication and WhatsApp bot**
   - Claim status push, shortfall reminders, approval/rejection alerts, payment alerts.
   - DLT/TRAI-safe templates, official-number banner, delivery/read receipts.
   - WhatsApp self-service: claim status, e-card, hospital search, document upload link.

5. **Grievance and SLA cockpit**
   - Ticket lifecycle, escalation matrix, SLA deadlines, ombudsman/legal escalation metadata, internal notes, public response templates.

### P2 — Enterprise hardening

1. **RBAC and maker-checker**
   - TPA admin, claims processor, medical reviewer, finance approver, support agent, auditor, read-only client manager.
   - Maker-checker for payment, rejection, high-value approval, provider empanelment edits.

2. **Integration fabric**
   - Insurer APIs, hospital/provider APIs, NHCX/ABDM-ready exchange, webhook subscriptions, idempotency keys, retry queues.

3. **Auditability and observability**
   - Immutable claim event log, exportable audit trails, PII access logging, job monitoring, latency/SLA dashboards.

4. **Performance and resilience**
   - Async jobs for large exports/OCR, paginated APIs, search indexes, queue-based integrations, load testing for high-claim-volume days.

## Proposed implementation architecture

### Data model additions

Add migrations for:

- `tpa_users`: users under one TPA with role, branch, permissions, MFA status.
- `tpa_claims`: core claim record, claim type, source, member, corporate, provider, policy, amounts, status.
- `tpa_claim_events`: immutable timeline.
- `tpa_claim_documents`: file metadata, classification, OCR status, verification result.
- `tpa_claim_shortfalls`: missing/insufficient information requests.
- `tpa_preauth_requests`: cashless pre-auth intake, planned/emergency, hospital, proposed treatment, estimated amount.
- `tpa_preauth_decisions`: approvals, enhancements, denials, validity period, letter URL.
- `tpa_members`: member/dependent coverage snapshot or mapping to existing corporate employee/member tables.
- `tpa_policy_benefits`: benefits, exclusions, co-pay, sublimits, waiting periods, room-rent rules.
- `tpa_network_hospitals`: provider master with TPA/insurer network mapping.
- `tpa_grievances`: support/grievance tickets with SLA and escalation.
- `tpa_communications`: message events and delivery receipts.
- `tpa_fwa_scores`: fraud/waste/abuse risk score, rules fired, reviewer disposition.

### Backend services

- `tpa-claims.service.js`
- `tpa-preauth.service.js`
- `tpa-ecard.service.js`
- `tpa-network-hospital.service.js`
- `tpa-benefit-estimator.service.js`
- `tpa-document-intelligence.service.js`
- `tpa-fwa.service.js`
- `tpa-grievance.service.js`
- `tpa-notification.service.js`
- `tpa-mis.service.js`

### API roadmap

P0 APIs:

- `POST /api/tpa/claims`
- `GET /api/tpa/claims/:id`
- `POST /api/tpa/claims/:id/documents`
- `POST /api/tpa/claims/:id/shortfalls`
- `POST /api/tpa/claims/:id/decision`
- `POST /api/tpa/claims/:id/settlement`
- `GET /api/tpa/claims/:id/timeline`
- `POST /api/tpa/pre-auth`
- `GET /api/tpa/pre-auth/:id`
- `POST /api/tpa/pre-auth/:id/decision`
- `POST /api/tpa/pre-auth/:id/enhancement`
- `GET /api/tpa/members/:id/eligibility`
- `GET /api/tpa/members/:id/ecard`
- `GET /api/tpa/network-hospitals`

P1 APIs:

- `POST /api/tpa/documents/classify`
- `POST /api/tpa/claims/:id/ocr`
- `GET /api/tpa/claims/:id/fwa-score`
- `POST /api/tpa/benefits/estimate`
- `POST /api/tpa/communications/send-template`
- `POST /api/tpa/grievances`
- `GET /api/tpa/mis/weekly`

## UI implementation plan

### Sprint 1: TPA portal foundation hardening

Duration: 1 week

- Add protected route wrapper for all `/tpa/*` pages.
- Add role-aware sidebar.
- Add claim detail shell.
- Replace sample data with database-backed claims/policies/members where available.
- Add empty/error/loading states consistently.
- Add smoke tests for every sidebar route and API.

Acceptance criteria:

- Every sidebar click renders a page.
- Every sidebar page has a backing API.
- Unauthorized users redirect to `/tpa/login`.
- No page shows “Coming Soon”.

### Sprint 2: Claims and pre-auth lifecycle

Duration: 2 weeks

- Implement claim creation, detail, timeline, documents, shortfall, approval/rejection.
- Implement cashless pre-auth intake, decision, enhancement.
- Generate approval/rejection letters.
- Add SLA timers and escalation badges.

Acceptance criteria:

- TPA user can process a claim from submission to approved/rejected/settled.
- TPA user can process pre-auth from request to approval/denial/enhancement.
- Claim/pre-auth timeline is immutable and visible.

### Sprint 3: Member, e-card, eligibility, policy benefits

Duration: 1.5 weeks

- Member profile with dependents.
- Policy coverage view with benefits/exclusions/sublimits.
- E-card generator with QR verification.
- Eligibility check endpoint and UI.

Acceptance criteria:

- Member/dependent eligibility can be checked before claim/pre-auth.
- E-card can be downloaded and verified by QR endpoint.
- Policy details are readable by HR/employee/TPA.

### Sprint 4: Network hospitals and OOPE estimator

Duration: 1.5 weeks

- Network hospital master and search.
- Geolocation and filters.
- Policy-aware cashless eligibility.
- Out-of-pocket estimator.

Acceptance criteria:

- User can search hospitals by location/specialty/network.
- Estimate shows payable/non-payable/out-of-pocket components.

### Sprint 5: Documents, OCR, AI assist, and fraud controls

Duration: 2 weeks

- Document upload/checklist.
- OCR/classification.
- Medical summary and shortfall suggestion.
- FWA risk scoring and review queue.

Acceptance criteria:

- Uploaded documents are classified and checked.
- Missing documents are flagged.
- Risk score appears before decision.

### Sprint 6: Communication, grievance, MIS, and enterprise polish

Duration: 2 weeks

- Communication templates and event triggers.
- WhatsApp/SMS/email claim status notifications.
- Grievance/SLA cockpit.
- Weekly MIS report generator.
- Dashboards for HR, TPA operations, insurer/provider performance.

Acceptance criteria:

- Claim status updates notify relevant users.
- Grievance tickets have SLA/escalation tracking.
- Weekly MIS can be generated/exported by corporate/TPA.

## Engineering tasks already completed in current block

- Fixed TPA login visual contrast.
- Fixed frontend login error handling for object-shaped errors and rate-limit responses.
- Added TPA login bootstrap migration.
- Added TPA role compatibility in auth middleware.
- Fixed TPA login response payload compatibility.
- Added `/tpa/approvals` route and backend endpoint.
- Replaced static TPA placeholders with API-backed pages.
- Added TPA report download endpoint.
- Fixed TPA corporates API model mapping.
- Extended smoke test to verify all sidebar APIs.

## Definition of done for “world-class TPA portal”

Mediqzy should be considered world-class when:

- Claims, pre-auth, e-card, hospital search, policy, beneficiary, communication, grievance, MIS, and analytics are not mock-backed.
- Employees, HR, providers, insurers, and TPA users see the same claim lifecycle with role-appropriate permissions.
- Every high-risk decision has audit events and maker-checker controls.
- Every claim has a document checklist, OCR status, shortfall state, SLA timer, and notification history.
- Every pre-auth has clear approval/enhancement/denial letters and hospital-facing visibility.
- Every member can verify eligibility, download e-card, manage dependents, and track claims.
- TPA admins can monitor SLA, fraud risk, provider performance, corporate utilisation, and weekly MIS from dashboards.
- The portal has tested production load, privacy controls, PII audit logs, data retention, and secure integration patterns.

## Recommended next implementation block

Start with Sprint 1 + the first half of Sprint 2:

1. Add `TPARouteGuard`.
2. Add database migrations for `tpa_claims`, `tpa_claim_events`, `tpa_claim_documents`, and `tpa_preauth_requests`.
3. Replace claims/pre-auth mock APIs with DB-backed services.
4. Add claim detail page with timeline and decision panel.
5. Add document upload/checklist shell.
6. Expand smoke test to cover claim create → detail → decision → timeline.

This gives immediate visible product depth and removes the largest enterprise credibility gap: claims/pre-auth being mostly sample data.

## Implementation update — 06 September 2026

This implementation pass closed the first major P0 claim-portal gaps from the competitor comparison:

- Added a DB-backed TPA claim lifecycle foundation via migration `046-tpa-claims-lifecycle.sql`.
- Added lifecycle tables for claims, claim events, claim documents, claim shortfalls, pre-auth requests, and fraud/waste/abuse scores.
- Added `tpa-claims-lifecycle.service.js` with claim list, claim creation, claim detail, document intelligence metadata, shortfall/query, claim decision, pre-auth list, and FWA scoring.
- Replaced the TPA claim list API mock with lifecycle-backed data while preserving the existing frontend response shape.
- Replaced the TPA pre-auth list API mock with lifecycle-backed data while preserving the existing frontend response shape.
- Added claim workbench route `/tpa/claims/:claimNumber` with timeline, documents, shortfalls, FWA score, and approve/action controls.
- Wired the Claims Management `View` action into the claim workbench.
- Expanded smoke testing to cover claim creation, detail, document upload, shortfall, decision, and FWA score.

The next authenticated foundation block was also implemented:

- Added migration `047-tpa-member-network-tracking.sql` for native TPA members, member/dependent eligibility snapshots, e-card verification codes, network hospitals, tariff metadata, and claim-access groundwork.
- Added native member eligibility, e-card generation, authenticated e-card verification, and network hospital intelligence methods to the TPA lifecycle service.
- Replaced the TPA members API mock with service-backed member/dependent data.
- Added authenticated APIs for `/api/tpa/members/:memberId/eligibility`, `/api/tpa/members/:memberId/ecard`, `/api/tpa/ecard/verify/:verificationCode`, and `/api/tpa/network-hospitals`.
- Rebuilt the TPA e-card page into a native Mediqzy e-card/eligibility workbench with balance, co-pay, exclusions, dependents, and QR payload display.
- Rebuilt the TPA hospitals page into a native network intelligence view with cashless eligibility, preferred-provider badges, specialty search, tariff/package hints, and expected pre-auth SLA.
- Expanded smoke testing to cover authenticated member eligibility, e-card generation, e-card verification, and network hospital APIs.

Still remaining for full world-class parity:

- Public member claim tracker should be released only after OTP/consent/rate-limit design is completed; unauthenticated claim/e-card disclosure was intentionally not exposed in this pass.
- Real hospital/provider portal submission and discharge-final approval workflow.
- Real document file upload/storage integration rather than metadata-only document entries.
- Production OCR/classification service wiring.
- Real policy-rule engine integration for payable/non-payable calculation.
- WhatsApp/SMS/email event-triggered notifications and delivery receipts.
- Maker-checker RBAC for high-value approvals, rejection, settlement, and payment.
- NHCX/API-based insurer-hospital interoperability and webhooks.


## Implementation update — 06 September 2026, enterprise controls closure

This pass closed the remaining application-side TPA parity gaps that could be completed without external vendor credentials or production change approval:

- Added migration `048-tpa-enterprise-gap-closures.sql` for claim file vault, policy rules, claim notifications, maker-checker approvals, provider handoff cases, and NHCX/API/webhook interoperability queue.
- Added runtime schema support for the same enterprise tables inside `tpa-claims-lifecycle.service.js` so local/test environments remain self-healing while production still uses migrations.
- Added real multipart claim-file upload endpoint `/api/tpa/claims/:claimNumber/files`, storing files in a scoped local TPA claim vault path with checksum, file size, consent scope, and retention metadata. Production can swap this storage provider to S3/MinIO without changing the API contract.
- Added document-intelligence endpoint `/api/tpa/claims/:claimNumber/document-intelligence` for required-document checklist, OCR-readiness status, missing-document detection, and shortfall recommendation.
- Added policy-rule payable engine endpoint `/api/tpa/claims/:claimNumber/payable-estimate` with coverage balance, co-pay, room-rent, non-payable, deduction, and payable calculation.
- Added maker-checker endpoints `/api/tpa/claims/:claimNumber/approval-requests` and `/api/tpa/approval-requests/:approvalNumber/decision` for high-value approval/rejection/payment control.
- Added claim-triggered notification endpoint `/api/tpa/claims/:claimNumber/notifications` with channel, template, payload, simulated provider message id, and delivery receipt audit record.
- Added provider workflow endpoints `/api/tpa/provider-cases` and `/api/tpa/provider-cases/:caseNumber/status` for hospital admission/pre-auth/discharge-final handoffs.
- Added interoperability queue endpoints `/api/tpa/interop/events` for NHCX/API/webhook-ready event dispatch with idempotency and retry metadata.
- Added `/api/tpa/claims/:claimNumber/enterprise-controls` to pull file-vault, maker-checker, notification, provider, and interop controls for a claim.
- Upgraded the TPA claim workbench UI with buttons and panels for file vault, OCR checklist, payable estimate, maker-checker, notification, provider handoff, and NHCX/API queue.
- Expanded the TPA smoke test to validate every new enterprise endpoint plus the existing login/sidebar/lifecycle flows.

Residual items that require external approval/credentials, not more local UI scaffolding:

- Replace local claim-file storage provider with production S3/MinIO bucket, encryption key, lifecycle policy, malware scan, and signed URL policy.
- Connect document-intelligence stubs to the selected production OCR/classification provider.
- Connect notification queue to approved WhatsApp/SMS/email providers with DLT/TRAI templates and live delivery webhooks.
- Connect interoperability queue to live NHCX/ABDM/insurer/hospital endpoints with signed payloads and retry workers.
- Split maker/checker into distinct human roles once the final TPA RBAC matrix is approved.

