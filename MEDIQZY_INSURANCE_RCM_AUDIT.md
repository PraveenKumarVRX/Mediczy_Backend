# Mediqzy (Mediczy) HospitalOS — Insurance Module Audit & India-Ready RCM Gap Analysis

**Audit subject:** server/ insurance + TPA + claims + finance modules
**Repository:** /home/ubuntu/Mediczy (Mediqzy / Mediczy HospitalOS)
**Context:** Production-oriented, India-ready hospital Revenue Cycle Management (RCM) for a multi-specialty private hospital, all payers (private insurers/TPAs + PM-JAY/Ayushman Bharat + CGHS/ECHS + cash/self-pay), hybrid deployment (on-prem + private cloud).

---

## 1. Executive Summary

Mediqzy already contains a substantial, real insurance/claims codebase — not a prototype. It includes:
- A relational insurance data model (claims, pre-authorisations, policies, denials, member/enrolment, TPA claims lifecycle).
- 18 TPA/insurance-payer adapters behind a unified aggregator (Heritage, MD India, MediAssist, Star Health, Niva Bupa, ICICI, Care, GoDigit, FHPL, etc.).
- A National Health Claims Exchange (NHCX) FHIR R4 client (eligibility, pre-auth, claim submission bundles) — scaffolded, returns an explicit "not configured" result when no credentials are set.
- An ABDM / ABHA client (ABHA generation/verification, HIE-CM consent, PHI fetch, HFR/HPR registration scaffolding).
- A pre-authorisation + cashless form PDF generator (IRDAI-style 11-section form, per-TPA branding).
- A claims rules engine (pre-submission document & policy-limit validation, room-rent advisories).
- A denial management module (create/list/draft appeal/resolve).
- A double-entry finance ledger (GL, vendors, expenses, budgets, journals, period close, reversal) plus reconciliation of unposted billing documents and an era_remittances table.
- A public, token-gated claim-status lookup (QR-based).

However, none of this adds up to a production-ready India RCM out of the box. The Ayushman/PM-JAY page is explicitly simulated/demo mode ("not connected to the real Ayushman Bharat / PM-JAY system"). There is no PM-JAY package master, no NHA/TMS pre-authorisation, no CGHS/ECHS workflow, no denial-reason-code master, no payer-wise A/R ageing, no clean-claim/collection-rate analytics, and no insurer/TPA remittance (ERA/835-equivalent) ingestion pipeline. The revenue-analytics.service.js is SaaS tenant MRR/ARR — not hospital RCM revenue analytics.

Bottom line: Mediqzy is a strong technical foundation for hospital billing + TPA claims administration, but the India-specific RCM layer (PM-JAY, CGHS/ECHS, TPA remittance reconciliation, denial workflow, regulator-grade reporting) must be built as extension modules before production deployment.


## 2. Audit Scope & Methodology

Files audited (representative, not exhaustive):

| Area | Key files |
|------|-----------|
| Claims API | server/routes/hospital-insurance.route.js (3,886 lines), server/routes/public-claim-status.route.js |
| TPA adapters | server/services/tpa-aggregator.service.js + 18 *-tpa.service.js files |
| TPA lifecycle schema | server/migrations/20261015003500-tpa-claims-lifecycle-governance.migration.js |
| NHCX gateway | server/services/nhcx-client.service.js |
| ABDM | server/services/abdm-client.service.js, server/services/abdm-aadhaar-enrol.service.js, server/services/fhir-mapper.service.js |
| Pre-auth PDF | server/services/pdf-generator.service.js (IRDAI 11-section form) |
| Rules engine | server/services/claims-rules-engine.service.js |
| Denials | server/services/denial-management.service.js, server/migrations/20260815-claim-denials-integrity.migration.js |
| Finance/Ledger | server/services/finance-ledger.service.js, server/services/finance-reconciliation.service.js, server/services/finance-gl-posting.service.js, server/services/finance-reports.service.js |
| RCM schema | server/migrations/hospital-billing-rcm-phases.migration.js (adjustments, ERA, GL, allocations, refunds, billing periods, statements) |
| Policy standards | server/services/insurance-policy-standards.service.js (IRDAI-style 1-yr validity, e-card categories) |
| AI copilot | server/services/insurance-ai-copilot.service.js (appeal letters, documentation gaps) |
| Document AI | server/services/insurance-document-ai.service.js |
| Pre-discharge audit | server/services/insurance-pre-discharge-audit.service.js |
| Claim notify | server/services/insurance-claim-notify.service.js (QR, WhatsApp/SMS) |
| Models | server/models/postgres/{insuranceClaim,preAuthorization,claimDenial,insurancePolicy,...}.postgres.js |
| Frontend (PM-JAY) | client/src/pages/Ayushman.tsx (explicitly simulated) |
| Tests | server/__tests__/hospital-insurance.test.js, server/__tests__/abdm-aadhaar-enrol.test.js |


## 3. Reusable Modules Inventory — What EXISTS in Mediqzy

These modules can be reused selectively as the RCM foundation. Each should be inspected for schema, tests, auth boundaries, and licence before adoption.

### 3.1 Core insurance / claims data model
- insurance_claims — claim number, patient, hospital, appointment, pre-auth link, policy, insurer, TPA, amounts (claimed/approved/settled/deducted), claim type (cashless/reimbursement/emergency/government_scheme), scheme name (CGHS/RGHS/Ayushman/ECHS placeholder), status, settlement status, documents status, diagnosis, treatment details, documents array, query history, courier tracking, notification log.
- pre_authorizations — pre-auth request to approval lifecycle.
- claim_denials — denial code, reason, denied amount, appeal letter, resolution.
- insurance_policies — policy number, validity (enforced 1 year), category, e-card eligibility.
- tpa_claims, tpa_claim_events, tpa_claim_documents, tpa_claim_shortfalls, tpa_preauth_requests, tpa_members, tpa_cashless_requests, tpa_claim_adjudications, tpa_claim_payment_advices, tpa_claim_bill_entries, tpa_provider_contracts, tpa_member_enrollments, etc. (full TPA governance schema).
- era_remittances — payer name, check number, payment/adjustment/patient-responsibility amounts, raw payload.

### 3.2 TPA / payer adapter layer (18 integrations)
server/services/tpa-aggregator.service.js wires: Heritage, MD India, Health India, Care Health, Future Generali, GoDigit, ICICI, MediAssist, Star Health, FHPL, MedSave, Niva Bupa, Paramount, Raksha, Vidal, Volo, EWAT. Capability flags: enrollment, claims, claim intimation, claim status, e-card, network hospitals, policy details, pre-auth, document upload.

### 3.3 NHCX (National Health Claims Exchange) client
FHIR R4 CoverageEligibilityRequest, Claim (use=preauthorization and use=claim) bundle builder + gateway sender. Explicitly sandbox-ready; not NHCX-certified; returns {configured: false} unless NHCX_CLIENT_ID/SECRET are set.

### 3.4 Pre-authorisation & cashless forms
pdf-generator.service.js generates the IRDAI-standard 11-section cashless pre-authorisation form with per-TPA branding (Heritage, Medi Assist, FHPL, TTK, etc.) and auto TPA selection. hospital-insurance.route.js serves /pre-auth/:id/pdf.

### 3.5 Claims rules engine (pre-submission validation)
Document completeness per claim type, pre-approval ceiling tolerance (+-10%), high-value-claim warning, insurer-specific room-rent advisories (Star Health, Niva Bupa, Care, ICICI, HDFC Ergo, etc.). Returns canSubmit + errors/warnings — advisory, not a hard clinical gate.

### 3.6 Denial management (basic)
Create/list/draft appeal/resolve denials; appeal letters via AI copilot or template; denial linked to a claim flips claim status to denied. No denial-reason-code master, no SLA/deadline tracking, no work-queue assignment, no appeal-outcome analytics.

### 3.7 Finance ledger & reconciliation
Double-entry GL (accounts, vendors, expenses, budgets, journal entries, fiscal periods, open/close, reversal-as-offset). finance-reconciliation.service.js finds billing documents with no journal entry and re-posts them (invoices, payments, refunds, adjustments). era_remittances supports remittance posting.

### 3.8 ABDM / ABHA client
ABHA generation/verification, HIE-CM consent (grant/revoke/fetch), PHI request/fetch, HFR facility registration, HPR provider registration. Sandbox-aware with circuit breaker. Not ABDM-certified; HFR/HPR path constants flagged as best-effort, unverified against live NHA specs.

### 3.9 PM-JAY / Ayushman frontend — SIMULATED
client/src/pages/Ayushman.tsx lines 272-277: "Demo mode — this screen is not yet connected to the real Ayushman Bharat / PM-JAY system. Card verification and balances shown are simulated." No NHA beneficiary verification, no package master, no pre-auth, no TMS integration.

### 3.10 Public claim status
Token-gated, non-PHI claim-status lookup (QR target). Safe for patient/payer portals.


## 4. RCM Feature Comparison — Mediqzy vs Required India-Ready RCM

Legend: Yes = documented/implemented; Partial = scaffolded or needs validation; Not available = no evidence in codebase.

| RCM capability (India-ready requirement) | Mediqzy status | Evidence / notes |
|---|---|---|
| React/TypeScript frontend (registration, billing, insurance desk, TPA desk, finance, admin) | Yes | React client + role-based dept logins (FinanceLogin, TPA login, insurer login) |
| Node.js/NestJS/Express backend | Partial | Express (NestJS mentioned in some docs; core API is Express) |
| Patient registration / UHID | Yes | Patient master, UHID in hospital core |
| OPD / IPD admission-discharge | Yes | ADT, OT booking, discharge summaries |
| Service catalogue & billing (INR, GSTIN, tax/discount) | Yes | hospital_billing_charges, hospital_invoices (GSTIN, period), hospital_credit_accounts |
| Partial payments / refunds / credit notes | Yes | hospital_payment_refunds, hospital_bill_adjustments, refund_amount on payments |
| Pharmacy & inventory | Yes | Documented pharmacy module |
| Lab / radiology (Orthanc/DICOM) | Partial | infra/imaging, Orthanc referenced |
| Role-based access + audit trail | Yes | RBAC, RLS, audit logs, socket notifications |
| Insurance master (insurer/TPA/policy/plan/coverage/exclusions) | Partial | insurance_policies, tpa_members, insurance_providers — no dedicated network-status/exclusions master |
| Member eligibility verification (cashless) | Partial | getMemberEligibility in TPA lifecycle (TPA member data only, not live insurer API) |
| Cashless pre-authorisation workbench | Partial | Pre-auth requests table + PDF form; approval/extension/query workflow not fully wired |
| PM-JAY beneficiary verification & package master | Not available | Ayushman page explicitly simulated; no NHA/TMS integration |
| PM-JAY pre-authorisation, claim, settlement | Not available | claimType: government_scheme exists as a label only |
| CGHS / ECHS referral, package, claim workflow | Not available | scheme_name label only; no workflow |
| TPA claim filing & status tracking | Yes (TPA portal mirror) | tpa_claims, status transitions, claim events, SLA due dates |
| TPA remittance / payment advice ingestion | Partial | era_remittances + tpa_claim_payment_advices — no automated ERA parse/reconcile pipeline |
| Payment posting, deductions, short-payments | Partial | deducted_amount, approved_amount, settled_amount fields; allocation via hospital_payment_allocations |
| Denial queue, reason codes, appeal deadlines | Partial | Denial create/appeal/resolve exists; no reason-code master, no SLA/deadline, no work queue |
| Resubmission / corrected claims | Partial | Claim status transitions + query history; no formal corrected-claim workflow |
| A/R ageing by payer | Not available | revenue-analytics.service.js = SaaS tenant MRR/ARR, not hospital payer-wise A/R |
| Clean-claim rate / denial rate / collection rate | Not available | Not present |
| Payer-wise reconciliation to bank/payer records | Partial | Finance reconciliation of unposted GL docs; no payer-statement matching |
| ABDM ABHA / consent / HFR | Partial | ABDM client exists, sandbox, not certified, HFR/HPR unverified |
| NHCX claims exchange | Partial | Scaffolded; not configured/certified |
| Document encryption, signed URLs, retention | Partial | MinIO uploadToMinio, encrypted object storage referenced |
| Production security/compliance validation | Not available | No VAPT/pen-test evidence, no DR tested, no compliance certification in repo |


## 5. Gaps — Features NOT Available in Mediqzy (to be built)

Grouped by priority (P0 = essential for initial payer workflows; P1 = next stage; P2 = later enhancement), matching the earlier RCM architecture.

### P0 — Essential (blockers for Indian payer go-live)

| # | Module | Missing capability | Why it matters |
|---|--------|-------------------|----------------|
| P0-1 | PM-JAY (Ayushman Bharat) adapter | Beneficiary verification, PM-JAY package master, pre-authorisation, treatment/discharge documentation, claim status, queries, settlement via NHA/TMS | Mandatory for cashless PM-JAY patients; current Ayushman page is simulated |
| P0-2 | CGHS / ECHS adapter | Referral validation, applicable package/rate rules, authorisation, scheme-specific claim documents | Required for government/referral patients |
| P0-3 | Insurance master | Insurer, TPA, policy, plan, coverage limits, exclusions, network status, room-rent sub-limits per plan | Rules engine currently uses hardcoded advisories, not a live per-policy master |
| P0-4 | Cashless desk / eligibility | Live eligibility verification against insurer/TPA, pre-auth intake (planned/emergency), approval limits, extensions, query/IR handling | Current eligibility reads TPA member rows only |
| P0-5 | Claim workbench | Claim creation, document checklist, submission reference, status history, resubmissions/corrected claims | Basic CRUD exists; end-to-end workbench not complete |
| P0-6 | Remittance & reconciliation | Payment allocation, deductions, short-payments, adjustments, outstanding balances, reconciliation to bank/payer statements | era_remittances stores data; no ingestion/matching pipeline |
| P0-7 | Payer adapters (production) | Live insurer/TPA API credentials, sandbox acceptance, idempotency keys, retry/dead-letter queues | Adapters exist but are credential-gated/unverified |

### P1 — Next implementation stage

| # | Module | Missing capability |
|---|--------|-------------------|
| P1-1 | Denial management | Standard denial-reason-code master (IRDAI/TPA codes), denial categories, owner assignment, appeal deadlines, work queue, resubmission tracking, denial-rate analytics |
| P1-2 | Revenue analytics (hospital RCM) | Payer-wise A/R ageing, days in A/R, clean-claim rate, denial rate, collection rate, expected-vs-received revenue (current revenue-analytics.service.js is SaaS MRR/ARR) |
| P1-3 | ABDM interoperability (certified) | ABHA/HFR integration validated against NHA specs, consent-aware HIE, HIP registration for the facility |
| P1-4 | Electronic remittance advice (ERA) parsing | Standard remittance file ingestion and auto-allocation to invoices/claims |

### P2 — Later enhancement

| # | Module | Missing capability |
|---|--------|-------------------|
| P2-1 | OCR / document AI | Document classification, anomaly detection, assisted denial analysis |
| P2-2 | AI-based underwriting/loading | IRDAI loss-ratio/loading guidance (referenced in .claude/settings.local.json only) |
| P2-3 | Advanced automation | Auto-coding, CPT/ICD validation against NABH/insurer rules |


## 6. Integration Gaps by Payer

| Payer / channel | Mediqzy state | Gap to production |
|---|---|---|
| Private insurers / TPAs | 18 adapters; enrollment, claims, status, pre-auth, e-card stubs | Credentials not configured; no live sandbox acceptance testing; no remittance auto-reconciliation; no denial-appeal integration |
| PM-JAY / Ayushman Bharat | Frontend simulated; claimType: government_scheme label only | No NHA beneficiary verification, no package master, no pre-auth/claim via TMS, no settlement tracking |
| CGHS / ECHS | scheme_name label only | No referral validation, package rates, authorisation, claim workflow |
| ABDM | Client + HFR/HPR scaffolding (sandbox) | Not NHA-certified; HFR/HPR paths unverified; no production credentials |
| NHCX | FHIR R4 bundles; configured: false unless env set | Not NHCX-certified (Level 1/2); no live routing/payer mapping |
| Accounting (Tally/SAP/etc.) | GL export referenced; finance-gl-posting.service.js | No confirmed ERP connector or e-invoice (IRN) integration |
| Lab / PACS | Orthanc/DICOM referenced | Not integrated into RCM claim document bundle |


## 7. Security, Compliance & Production Readiness Gaps

These must be resolved before any hospital deployment (India-specific):

- Data protection: DPDP Act 2023 obligations (consent, purpose limitation, erasure, breach notification) — ABDM client cites DPDP §6/§14 but no documented DPDP compliance implementation across the insurance module.
- Encryption at rest / in transit: MinIO object storage and signed URLs referenced; no evidence of field-level encryption for policy/claim data or enforced TLS/mTLS for payer adapters.
- Audit trail: RLS + lastModifiedBy + notification log exist; no immutable, tamper-evident audit log for claim status transitions and payment postings.
- Access control: RBAC present; least-privilege and branch isolation not evidenced for insurance desk vs TPA desk.
- Backups & DR: Not evidenced in repo; no tested restore or disaster-recovery runbook for RCM data.
- Payer duplicate prevention: Architecture guidance exists (idempotency keys, durable integration jobs) but not evidenced as implemented across TPA/NHCX adapters.
- Open-source licences: 18 TPA adapters + dependencies — no licence inventory approved for commercial deployment.
- VAPT / pen-test: No security audit evidence in repo (.gitleaks.toml, .github exist but no VAPT report).
- NHA certifications: PM-JAY/TMS and ABDM/NHCX certifications are business/compliance processes not performed by the code.

## 8. Implementation Roadmap (Mediqzy as foundation)

Aligning to the earlier 5-phase plan, using Mediqzy modules where they exist:

| Phase | Weeks | Focus | Build on Mediqzy | Build new |
|-------|-------|-------|-----------------|-----------|
| 1 | 1–3 | Repo assessment & architecture | Audit licence, schema, tests, security of insurance module | Canonical claim data model, deployment boundaries (hybrid) |
| 2 | 4–8 | Hospital core & billing | Patient master, UHID, OPD/IPD, service catalogue, invoices, refunds, GL posting | INR/GSTIN rate cards, payer/patient responsibility split |
| 3 | 9–13 | Insurance & claims | TPA aggregator, claims lifecycle, pre-auth PDF, rules engine, denial create/appeal | Insurance master, cashless desk, PM-JAY & CGHS/ECHS adapters, claim workbench |
| 4 | 14–18 | Reconciliation & interop | Finance reconciliation, era_remittances, ABDM client, NHCX client | Remittance ingestion pipeline, payer-wise A/R, denial reason codes, NHCX/PM-JAY sandbox acceptance |
| 5 | 19–24 | Security, UAT, pilot | RBAC, audit, public claim status, MinIO documents | VAPT, DR drills, DPDP compliance, parallel reconciliation, UAT, go-live approval |

## 9. Recommendation

Adopt Mediqzy as the codebase foundation, but treat it as a foundation, not a finished RCM.

Reuse selectively: the insurance data model, TPA aggregator + adapters, NHCX client, pre-auth PDF, claims rules engine, denial module, finance ledger/reconciliation, and ABDM client.

Do not deploy unchanged for Indian RCM. The following must be built/validated first: PM-JAY and CGHS/ECHS adapters, live insurer/TPA credentials with sandbox acceptance, remittance reconciliation, denial reason codes + work queue, payer-wise A/R analytics, ABDM/NHCX certification, and DPDP/security hardening.


## 10. Eve-Healthcare Patterns Implemented in Mediqzy

The following Eve-Healthcare (FearSmoker/Eve-Healthcare) features were missing from Mediqzy and have been implemented as additions to the insurance/RCM module:

### 10.1 Idempotent Webhook Event Log
**Files:**
- `server/migrations/20261028000000-idempotent-webhook-event-log.migration.js`
- `server/models/postgres/webhookEventLog.model.postgres.js`
- `server/services/idempotent-webhook.service.js`

**What it adds:** A durable `webhook_event_log` table keyed by `event_id` with permanent retention. Once an event_id is recorded, duplicate deliveries are detected and rejected (HTTP 202), preventing double processing of TPA claim callbacks, insurer remittances, NHCX responses, and payment webhooks. Matches Eve-Healthcare's "idempotency keys permanently retained in the database audit log" guarantee.

**API:** `recordEvent()`, `isDuplicate()`, `markProcessed()`, `markFailed()`, `listEvents()`, `getEvent()`

### 10.2 HMAC-Signed Webhook Verification Middleware
**File:** `server/middleware/hmac-webhook.middleware.js`

**What it adds:** `verifyWebhookHmac(provider)` middleware that validates HMAC-SHA256 signatures on inbound webhooks. Supports Razorpay's `body|secret` signing scheme and generic `X-Hub-Signature-256`/`X-Webhook-Signature` headers. Per-provider secrets via `WEBHOOK_SECRET_<PROVIDER>` env vars. Fails closed in production if no secret is configured.

**Routes:** `POST /api/webhooks/tpa/:provider` (example TPA webhook endpoint)

### 10.3 Admin Webhook Retry Endpoint
**Files:**
- `server/controllers/idempotentWebhookController.js`
- `server/routes/idempotent-webhook.route.js`

**What it adds:** Admin endpoints matching Eve-Healthcare's `POST /api/v1/admin/webhooks/{event_id}/retry` pattern:
- `GET /api/admin/webhooks/events` — list webhook events (with filtering)
- `GET /api/admin/webhooks/events/:eventId` — get a single event
- `POST /api/admin/webhooks/events/:eventId/retry` — manual retry of failed/duplicate events
- `GET /api/admin/webhooks/stats` — summary stats (pending/processed/failed/duplicate/HMAC verified)

**Mounted:** `app.use('/api/admin/webhooks', idempotentWebhookRouter)` in server/app.js

### 10.4 Insurance Claim / Pre-Authorisation State Machine
**File:** `server/services/insurance-claim-state-machine.service.js`

**What it adds:** A formal state machine (Eve-Healthcare's Booking State Machine pattern applied to insurance) with guarded transitions:
- Claim states: draft → submitted → pending → query → approved → paid → closed, with denial/appeal branches
- Pre-auth states: draft → submitted → pending → approved → paid → closed
- `validateClaimTransition()` / `validatePreAuthTransition()` reject invalid transitions
- `getNextClaimStates()` / `isTerminalState()` for UI workflow rendering

### 10.5 Deployment Wiring
**Modified:** `server/app.js`
- Imported and mounted `idempotentWebhookRouter` at `/api/admin/webhooks`
- Imported and mounted `tpaWebhookRouter` at `/api/webhooks/tpa`
- Added `/api/webhooks/tpa` to the unauthenticated webhook bypass list (HMAC-verified)
- Added `/api/webhooks/tpa` to the `express.json` `verify` callback for raw-body HMAC capture

**Modified:** `.env.example`
- Added `WEBHOOK_SECRET_<PROVIDER>` variables for all 18 TPA/insurer providers + NHCX + Razorpay
The first milestone should be a tested, auditable journey: admission → authorisation → treatment/discharge → claim submission → payment/denial → reconciliation — with PM-JAY/private-insurer/cash paths each validated against real (sandbox) payer interfaces.
