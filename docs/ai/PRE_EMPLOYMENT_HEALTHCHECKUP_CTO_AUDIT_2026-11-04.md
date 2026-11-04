# Pre-Employment Health Checkup — CTO Audit and Implementation Boundary

**Date:** 4 November 2026  
**Scope:** current repository implementation for corporate health packages, employee checkups,
corporate report uploads, OHC workflow and HRMS candidate data.  
**Companion:** [Corporate Employee implementation plan](../features/USER_CORPORATE_PROFILE_IMPLEMENTATION.md)

## Verdict

An **annual health checkup (AHC)** is correctly a corporate-sponsored employee-plan entitlement.
It belongs to the verified active employee experience and should be funded by the corporate plan.

A **pre-employment medical examination (PEME)** is a separate recruitment/occupational-health
workflow for a candidate or new joiner before employment activation. It must not be assigned as a
membership-plan package, employee wallet benefit, self-service employee booking, or retail health
plan feature.

The current implementation stores both types in the same health-package catalogue and exposes them
through shared employee/checkup and report paths. It has useful building blocks—package type,
OHC appointment/encounter/screening support, corporate report storage, report audit logs and an
HRMS candidate table—but no complete candidate-based PEME flow. Treat PEME as **not release-ready**
until the P0/P1 gaps below are closed.

This is a code audit, not a legal or occupational-medicine determination. Before pilot, the employer,
occupational-health clinical lead, privacy officer and counsel must approve the examination protocol,
consent/notice wording, retention, access model, fit-for-work criteria, escalation and jurisdictional
requirements.

## Required product boundary

| Dimension | Annual health checkup | Pre-employment medical examination |
|---|---|---|
| Subject | Active employee; covered dependant only where policy permits | Candidate/new joiner before employment access is activated |
| Purpose | Preventive wellbeing benefit | Occupational/recruitment assessment for a defined role and hazard profile |
| Funding | Corporate-sponsored employee plan entitlement | Employer-paid recruitment/occupational service; separate cost centre/order |
| Identity | Verified `corporate_employees` + employee association + employee context | Recruitment candidate/pre-hire case; no `users` or employee association is required to start |
| User journey | Employee sees, selects and books an assigned `annual` package | Candidate gets time-limited invite; provider/OHC schedules and completes a one-time case |
| Benefit wallet | May reserve/settle sponsored AHC funding | Never reads, creates or consumes an employee benefit wallet |
| Employer result | Aggregate participation and policy-approved operational status | Minimal disposition/status: pending, fit, fit with restrictions, temporarily unfit, unable to assess; no diagnosis by default |
| Clinical record | Patient-owned report; access follows existing consent/role policy | Candidate/patient-owned occupational record with a separate consent/access policy and retention schedule |
| Post-hire | Remains a recurring plan benefit | Can link to the hired employee only through explicit identity/link consent and immutable provenance; it does not become an AHC redemption |

## Current implementation findings

| ID | Priority | Evidence | Gap and risk | Required change |
|---|---|---|---|---|
| PEME-01 | P0 | `server/routes/health-checkup.route.js` resolves any active `user_health_packages` row and does not filter package `features.type`; corporate bookings set amount to zero whenever corporate context exists. | An assigned `pre_employment` package can appear in the employee checkup catalogue and can be booked as a corporate-funded employee health-checkup. This violates the required plan boundary. | Create a strict package class. Employee plan endpoints accept only `type='annual'`; fail closed for missing, legacy or any other type. Remove `pre_employment` from employee benefits/wallet/checkup navigation and checkout. |
| PEME-02 | P0 | `corporate_health_package_catalog` and `user_health_packages` carry both `pre_employment` and `annual`; `CorporateBenefits.tsx` displays both in the HR package view. | Shared catalogue/assignment semantics make it too easy to treat PEME as a benefit entitlement and to mix funding/utilization. | Separate persistent models: `corporate_annual_checkup_packages`/employee assignments, and `pre_employment_protocols`/case orders. A compatibility migration may retain catalogue rows but must set explicit `workflow_class`. |
| PEME-03 | P0 | OHC `ohc_appointments.employee_user_id` and `ohc_encounters.employee_user_id` are non-null FKs to `users`; `ohc.service.js:employeeAt` requires an active linked `corporate_employees` row. | A genuine candidate cannot be scheduled or assessed until they already have a user account and active employee record. Creating those records first falsely grants employee identity/benefit context and corrupts employment lifecycle data. | Introduce a candidate/pre-hire subject and `pre_employment_cases`. OHC appointment/encounter must support exactly one of employee subject or candidate subject. Do not manufacture an employee account solely for screening. |
| PEME-04 | P0 | `POST /api/corporate-bookings/reports/upload` requires a `users` record and an active corporate employee association. `saveCorporateHealthReports` repeats the same association requirement. | PEME report upload cannot reliably support a pre-hire candidate. Teams may workaround by prematurely linking a candidate as employee or by misclassifying the report. | Use a dedicated PEME result upload endpoint keyed to a case and candidate subject; authorize clinic/OHC/provider scope and consent state, not an employee association. |
| PEME-05 | P0 | The corporate report upload defaults `reportType` to `annual_health_checkup`; report type is caller-supplied. | An omitted or incorrect type misclassifies a PEME as AHC. That can place a recruitment assessment in employee benefit reporting and retention/export paths. | PEME endpoint fixes its record/workflow type server-side. AHC endpoint fixes `annual_health_checkup`; clients cannot choose the workflow class. Validate provider/order/case type at completion. |
| PEME-06 | P0 | `GET /api/corporate-bookings/reports` lists corporate reports to Team/Admin users with corporate access and issues report download URLs. The shown listing path does not invoke `requireHealthConsent`; the employee health-record view does. | Sensitive PEME reports can be broadly visible within a corporate support/team scope, while the dedicated employee health-record endpoint requires consent. This is an inconsistent and unsafe access boundary. | Replace broad report list with case-based authorization: clinical/OHC staff view full clinical documents; authorised recruitment/HR users view only minimal disposition; candidate sees own record. Require a purpose-specific access decision and audit every document read/download. |
| PEME-07 | P1 | `saveCorporateHealthReports` writes both `corporate_health_reports` and patient `reports` rows; the patient report metadata identifies the corporate and team uploader. | A shared storage/projection pattern has no explicit candidate consent, separate retention, immutable disposition, or post-hire linkage policy. It risks mixing candidate clinical records with employee benefit records. | Store an immutable PEME case result/document reference with clinical and employer-view projections separated. Link after hire only with an audited mapping; preserve original source/type and do not copy it into AHC history. |
| PEME-08 | P1 | OHC supports `pre_employment` appointment/encounter/screening types and fitness certificates, but the known screening types are limited and no role/protocol-specific panel/configuration is found. | A label alone is not a complete examination workflow. There is no demonstrated protocol version, required tests, contraindication/escalation, clinician review, candidate acknowledgement, or disposition lifecycle. | Create protocol versioning by role/hazard/location; required test checklist; clinician review/finalization; amend-not-overwrite results; disposition and restricted-duty model; referral/escalation and candidate notification. |
| PEME-09 | P1 | HRMS has `hr_recruitment_candidates`, requisitions and candidate stages, but repository search finds no PEME flow linked to those candidate records. | Recruitment and occupational systems have disconnected identities; HR cannot reliably track invite, appointment, completion and final hiring gate without manual work. | Add an explicit one-to-one/many-to-one link from PEME case to HR candidate/requisition, scoped by tenant/corporate mapping. Use status events, not clinical data, to drive the hiring checklist. |
| PEME-10 | P1 | `health-checkup.route.js` accepts a `patient` JSON object for a booking. Existing package policy documentation states it has no dependent identity verification or per-person quota. | For AHC, a self/dependant booking can contain unverified demographic details. For PEME, this is unacceptable identity assurance. | Bind AHC beneficiary to a validated user/family record. PEME uses a verified candidate identity, invite nonce and provider check-in identity process; prohibit client-supplied free-form subject substitution. |
| PEME-11 | P1 | Corporate package queries and assignment UIs allow package selection/eligibility based on current employees and `user_health_packages`. | Candidate invitations, expiry, rescheduling, no-show, withdrawal, duplicate screening and offer withdrawal are not modeled independently. | Implement PEME cases/states and candidate invite lifecycle outside `user_health_packages`; employer pays a case/order, not an employee plan assignment. |
| PEME-12 | P1 | Lab completion projects reports to `corporate_health_reports` when the patient is an active linked corporate employee. | If a pre-hire candidate is prematurely linked, laboratory completion can automatically project their result into employer health-report datasets. | Provider completion must branch by order workflow class. PEME writes case clinical result + employer disposition only; AHC writes benefit booking/result records. |
| PEME-13 | P2 | Current notifications send generic report links via email/WhatsApp and upload defaults to notifying the employee. | Candidate notice, secure delivery, consent withdrawal, failed contact, reschedule/reminder and translation/accessibility are not modeled. | Use a short-lived invite portal and authenticated/OTP retrieval; do not send durable clinical file URLs in message bodies. Track delivery separately from clinical result. |
| PEME-14 | P2 | Corporate wellness MIS counts `pre_employment` reports and annual reports separately. | Count separation exists, but no verified denominator, case status, turnaround/quality measure, or workforce decision boundary is demonstrated. | Report operational counts and turnaround by case status; do not expose diagnosis/test values or infer hiring decisions in employer analytics. |

## What can be reused

| Existing component | Reuse | Do not reuse unchanged |
|---|---|---|
| OHC units, clinician access and OHC audit log | Provider/OHC location and clinician-scoped operations | The employee-only `employee_user_id` subject model |
| OHC appointment, encounter, screening and certificate concepts | Appointment lifecycle, clinical drafting/finalization, screening-event patterns | Certificate issuance to an employee-only record, or employer access to full clinical encounter |
| HRMS candidate/requisition tables | Candidate identity, invitation contact, offer/hire workflow and tenant scope | `metadata` as the clinical source of truth |
| Corporate provider network and venue slots | Contracted lab/hospital lookup and scheduling serviceability | Employee benefits package/wallet entitlement checks |
| Corporate report storage | Encrypted/object storage patterns, malware controls and audit mechanics | Broad team report listing, pre-signed link sharing and employee-association gate |
| Health package policy | Annual package relation/venue checks | PEME eligibility, funding or candidate subject validation |
| Wallet authorization ledger/outbox ideas | Idempotency, lifecycle and reconciliation patterns | Employee wallet balances or annual plan usage for PEME |

## Target PEME model

### Case, not benefit entitlement

Create a `pre_employment_cases` record, with a case subject that can reference either an HR candidate
or a privacy-preserving pre-hire profile. Do not create a `users`/`corporate_employees` relationship
at invitation time.

```text
pre_employment_cases
  id, case_uid, corporate_id, tenant_uid
  candidate_id nullable -> hr_recruitment_candidates
  subject_profile_id
  requisition_id nullable, job_role, work_location, hazard_profile_version
  protocol_id, protocol_version, provider_id, scheduled_appointment_id
  status, disposition, disposition_reason_code, restrictions_summary
  employer_order_status, employer_paid_amount, currency
  notice_version, consent_status, consented_at, consent_evidence
  invite_hash, invite_expires_at, candidate_verified_at
  clinical_finalized_at, disposition_issued_at, linked_employee_id nullable
  retention_until, created_by, created_at, updated_at
```

Use state transitions with immutable audit entries:

```text
draft → invited → consented → scheduled → checked_in → in_progress
     → clinician_review → disposition_issued → closed
                         ↘ needs_follow_up / candidate_withdrew / expired / cancelled
```

Transitions are server-validated. A case cannot be booked before consent/identity checks, cannot be
finalized by a non-clinician, cannot be overwritten after clinical finalization, and cannot be
converted into an employee-plan AHC entitlement.

### Separate views of the result

| Audience | May see |
|---|---|
| Candidate | Notice/consent, appointment, their report and clinically appropriate explanation/next step under protocol |
| Provider/OHC clinician | Full clinical record necessary to examine, assess, amend and finalize |
| Recruitment/HR | Case operational status and minimal final disposition/restrictions only when the approved purpose and policy permits it |
| Corporate wellness/benefits team | No default clinical result; only authorised operational counts |
| Employee after hiring | Their personal health record only under the explicit post-hire linkage policy; annual-benefit history remains distinct |

Do not derive, display or export diagnosis, laboratory values, imaging, clinician notes or a generic
“health score” to HR. The disposition taxonomy, restrictions text and release rules require clinical,
privacy and employment-policy approval before configuration.

## API and workflow design

### HR/recruitment commands

| Endpoint | Actor | Rule |
|---|---|---|
| `POST /api/corporate/pre-employment/cases` | scoped HR/recruiter | candidate/requisition belongs to corporate/tenant; protocol exists; creates draft only |
| `POST /api/corporate/pre-employment/cases/:id/invite` | scoped HR/recruiter | sends one-time invite; no clinical data in notification |
| `POST /api/corporate/pre-employment/cases/:id/cancel` | scoped HR/recruiter | allowed pre-finalization; preserves audit; triggers provider cancellation if applicable |
| `GET /api/corporate/pre-employment/cases` | scoped HR/recruiter | status/disposition projection only, no clinical document URLs |
| `GET /api/corporate/pre-employment/cases/:id` | scoped HR/recruiter | same minimum employer projection and audit |

### Candidate commands

| Endpoint | Actor | Rule |
|---|---|---|
| `POST /api/pre-employment/invites/verify` | candidate with invite/OTP | verifies the single case, records attempt limits and expiry |
| `POST /api/pre-employment/cases/:id/consent` | verified candidate | records versioned notice/consent evidence; withdrawal path is explicit |
| `GET /api/pre-employment/cases/:id/appointment` | verified candidate | own case only |
| `POST /api/pre-employment/cases/:id/reschedule-request` | verified candidate | provider/policy window checked; no change to employer disposition |
| `GET /api/pre-employment/cases/:id/result` | verified candidate | own result/report per post-review release policy |

### Provider/OHC commands

| Endpoint | Actor | Rule |
|---|---|---|
| `POST /api/ohc-workspace/pre-employment/appointments` | assigned OHC staff/clinician | provider contract and case scope; candidate subject allowed |
| `POST /api/ohc-workspace/pre-employment/cases/:id/check-in` | OHC staff | identity/check-in evidence, no employment activation |
| `PUT /api/ohc-workspace/pre-employment/cases/:id/encounter` | clinician | protocol fields and observations; draft only until clinical finalization |
| `POST /api/ohc-workspace/pre-employment/cases/:id/results` | authorised provider | case-bound document upload, malware scan, immutable provenance |
| `POST /api/ohc-workspace/pre-employment/cases/:id/finalize` | registered clinician | disposition/restrictions with protocol version; append amendment rather than overwrite |

All endpoints check the corporate/OHC contract and case ownership. A candidate ID, case ID, order ID
or report ID alone never grants access.

## AHC changes required immediately

These changes prevent the current product from incorrectly treating PEME as a plan benefit while
the new PEME workflow is built.

1. Introduce an explicit immutable `workflow_class` on health checkup catalogue rows:
   `annual_benefit`, `pre_employment_service`, `occupational_periodic_service`, `other`.
   Backfill from reviewed data; unknown rows become `other` and are invisible to employee booking.
2. Update `GET /api/health-checkups/packages`, package detail, venue, slot, booking and reschedule
   checks to require `workflow_class='annual_benefit'` for corporate employee sessions.
3. Update `resolvePackage` so it joins/locks the catalogue and rejects missing/legacy type rather
   than accepting every active `user_health_packages` assignment.
4. Prevent Team/Admin package assignment UI from assigning `pre_employment_service` rows through
   `user_health_packages`; add a clear “not an employee benefit” label in HR screens.
5. Remove pre-employment packages from employee `SmartBenefitsHub`, `/health-checkups`, employee
   dashboard and all wallet/benefit usage counters.
6. Require a validated employee/family beneficiary identity for AHC. Do not let a free-form
   `patient` JSON object substitute a self/dependant identity.
7. Add regression tests: employee with annual + pre-employment package sees/books only annual;
   only a corporate-sponsored annual booking has zero employee charge; individual flow remains
   unchanged.

## PEME delivery sequence

| Phase | Deliverable | Exit criteria |
|---|---|---|
| P0: containment | AHC type filter, hide PEME from employee plan, disable PEME assignment to `user_health_packages`, restrict broad clinical report list | Candidate/employee cannot book PEME from plan flow; existing PEME documents are not newly exposed through broad list/download paths |
| P1: governance and protocol | Approved purpose, protocol versions, subject minimum data, consent/notice, disposition taxonomy, retention/deletion and access matrix | Clinical, privacy, HR/recruitment and security owners sign the implementation contract |
| P2: case foundation | Case/candidate profile tables, state machine, audit/outbox, recruitment integration, invitation/verification | Candidate can be invited without `users` or employee link; cross-corporate reads fail |
| P3: OHC/provider workflow | Candidate appointment, check-in, encounter, screening, document upload, clinician finalization/amendment | Only assigned clinician finalizes; employer view remains minimum disposition |
| P4: hiring handoff | Controlled link from case to a hired employee, candidate result access, operational status sync to HRMS | Link preserves provenance and does not create AHC usage or duplicate records |
| P5: pilot | One employer/protocol/provider, reconciliation, incident and withdrawal drills | Identity, consent, report access and disposition tests pass; operational owners support the pilot |

## Verification requirements

- Candidate with no Mediczy user account completes invite/consent/scheduling without being inserted
  into `corporate_employees`, `user_associations`, `user_health_packages` or employee wallet.
- Active employee cannot use annual AHC route to book a PEME package, even if a legacy assignment
  exists.
- A recruiter cannot read a clinical PDF, observations, diagnosis or clinician note through API,
  export, notification URL, browser cache or report-list endpoint.
- A clinician cannot finalize without the required protocol/identity/consent state; a finalized
  outcome can only be amended with author/reason/timestamp.
- An offboarded/newly hired transition does not alter case clinical history or create annual-plan
  usage; links are auditable and revocable for access purposes.
- Duplicate invite, booking, provider callback and result upload are idempotent.
- Candidate withdrawal/expiry, no-show, reschedule, referral, provider cancellation, adverse
  result and hiring cancellation follow documented state transitions without leaking data.
- AHC and PEME financial ledgers reconcile independently. PEME has an employer order/cost record;
  AHC has employee-plan entitlement/usage.

## Validation performed

Reviewed `health-checkup.route.js`, `corporate.route.js`, `corporate-bookings.route.js`,
`corporate-health-checkup-booking.service.js`, `corporate-health-reports.service.js`, the health
package policy document, OHC service/routes/migration, HRMS candidate schema/routes, lab result
projection and associated tests. No mutation, candidate invite, booking, report upload, notification
or production data access was performed for this audit.

The repository contains tests for selected package eligibility, booking, report and OHC components,
but no end-to-end candidate PEME workflow was found. Passing AHC/booking tests must not be read as
evidence that PEME candidate identity, consent, disclosure, provider completion or hiring handoff is
implemented.
