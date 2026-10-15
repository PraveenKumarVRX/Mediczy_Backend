# Mediqzy Department Module Implementation Plan

**Date:** 2026-10-14  
**Owner:** Product, Engineering, Clinical Operations, and Implementation  
**Scope:** Hospital departments, diagnostics, revenue, workforce, quality, and the shared platform services that connect them  
**Status:** Delivery baseline for estimation and acceptance planning

This document turns the current module inventory and hospital gap register into a department-by-department implementation plan. It is deliberately stricter than a route or screen inventory: a department is complete only when its workflow, data model, permissions, audit trail, integrations, empty/error states, and acceptance tests work together.

The current-state labels below are taken from the capability matrix and the hospital implementation documents. Those documents contain a few status conflicts with the codebase; where that happens, the work item begins with executable verification rather than being declared complete.

Related documents:

- [Complete module list](../MEDIQZY_COMPLETE_MODULE_LIST.md)
- [v2 capability matrix](../architecture/MEDIQZY_V2_CAPABILITY_MATRIX.md)
- [Hospital OS master gap implementation](../hospital/MEDIQZY_HOSPITAL_OS_MASTER_GAP_IMPLEMENTATION.md)
- [Implementation status and next steps](../IMPLEMENTATION_STATUS_AND_NEXT_STEPS.md)
- [Lab and phlebotomy audit](./LAB_MODULE_PHLEBOTOMY_REQUIREMENTS_AVAILABILITY_AND_IMPLEMENTATION_PLAN_2026-10-07.md)

## 1. Definition of done

Every department module must satisfy all of the following before it is marked `built`:

1. **A canonical workflow exists.** The state transitions, exception paths, reversals, and handoffs are documented and enforced server-side.
2. **The data model is durable.** Tables, indexes, foreign keys, tenant keys, history, and migration rollback or correction behavior are defined. Request-time table creation is not acceptable for production workflows.
3. **The API is explicit.** Endpoints have request/response schemas, pagination, idempotency where a retry can duplicate work, consistent error envelopes, and OpenAPI or equivalent contract documentation.
4. **The UI is operational.** Role-specific screens have loading, empty, error, retry, permission-denied, confirmation, and success states. Operational screens must use live tenant data and must never show fabricated records or counts.
5. **Access is enforced twice.** The UI hides actions the role cannot use, and the API enforces tenant, role, department, and patient-scope authorization independently.
6. **The module is auditable.** Creation, approval, assignment, issue, receipt, correction, cancellation, export, and other material actions record actor, tenant, timestamp, reason, before/after where relevant, and correlation ID.
7. **Cross-module events are defined.** Handoffs use versioned events or stable service contracts. Consumers are idempotent and failures are visible for retry.
8. **Clinical and operational safety is explicit.** Hard stops, override roles, escalation timers, critical-value handling, consent, and privacy restrictions are tested.
9. **Testing covers the risk.** Unit and schema tests cover rules; API integration tests cover happy and failure paths; UI tests cover role and empty/error states; a smoke test proves the module boots and its routes do not crash.
10. **Pilot evidence exists.** A named department owner completes a scripted walkthrough using tenant data, including at least one exception path.

Status meanings used in this plan:

| Status | Meaning |
|---|---|
| `built` | End-to-end path is usable and accepted against live-shaped data. |
| `partial` | A meaningful implementation exists, but workflow, integration, controls, or acceptance evidence is incomplete. |
| `shell` | A page, login, route, or model exists without a complete business workflow. |
| `missing` | No dependable implementation has been identified. |
| `verify` | Code exists or documentation claims completion, but the evidence is contradictory and must be tested before planning further work. |

## 2. Delivery sequence and dependencies

The departments cannot be delivered independently. The programme should use the following sequence.

| Phase | Duration target | Primary outcome | Departments/workstreams |
|---|---:|---|---|
| **P0 — Platform foundation** | 3–4 weeks | Stable tenant, identity, contracts, audit, migrations, UI shell, test gates | Auth/SSO, tenant/RLS, RBAC, shared API schemas, event envelope, design system, observability |
| **P1 — Day-one clinical spine** | 6–8 weeks | Patient arrival through OPD, emergency, admission, ward care, and discharge | Queue/Kiosk, OPD, ER, ADT/Beds, Nursing/eMAR/Vitals, Discharge, MRD |
| **P2 — Diagnostics and treatment** | 8–12 weeks | Orders become results, images, medicines, and transfusions | LIS/Phlebotomy, RIS/PACS, Pharmacy, Blood Bank, Dietary |
| **P3 — Theatre and hospital operations** | 8–12 weeks | Surgery, sterilization, purchasing, stock, assets, safety, quality | OT/Anesthesia, CSSD, Procurement/Stores, Biomedical, Infection Control, Mortuary |
| **P4 — Revenue, people, experience** | 6–10 weeks | Financial closure, claims, workforce, feedback, command centre | Billing/Finance, Insurance/TPA, HR/Payroll, PREMS/Complaints, Analytics |
| **P5 — Intelligence and scale** | Continuous | Governed AI, device mesh, interoperability, mobile, multi-site rollout | AI safety, HyperGrid, FHIR/HL7/ABDM, mobile, RWE, implementation tooling |

P0 is a gate for every later phase. P1 must be pilot-ready before departments begin creating inpatient production data. P2 and P3 should be delivered with the integration events defined in P1, even if their screens arrive later.

## 3. Shared implementation workstreams

These workstreams apply to every department and should be funded as shared platform work rather than repeatedly rebuilt inside each module.

### 3.1 Tenant, identity, and access

- Consolidate staff sign-in around one staff identity and role claims; department portals may retain department-specific screens but should not require unrelated re-authentication.
- **Delivered in the 2026-10-14 tranche:** refresh-token/revocation storage is now migration-owned (`20261015001700-auth-session-revocation.migration.js`) and request paths fail closed when the auth schema is unavailable. Tenant-scoped encrypted TOTP step-up storage and routes are migration-owned (`20261015001800-mfa-step-up.migration.js`, `/api/auth/mfa/status`, `/enroll`, `/verify-enrollment`, `/step-up`, `/disable`); privileged permission checks consume only the verified `mfaVerified` token claim. This is a step-up control, not the final unified staff login or a claim that every privileged route is already configured to require MFA.
- Enforce tenant and facility scope in middleware, database policies, and service queries. The shared
  HRMS privilege middleware now gates prescribing, pharmacy dispense, and blood-bank issue,
  cross-match, and transfusion writes against active, verified qualifications; lab shared-logins still
  require a separate operator-identity mapping before the same gate can be applied safely.
- Define role bundles for clinical staff, department supervisors, finance, HR, auditor, and super-admin. Add department capability flags for optional modules.
- Add access-review reports: inactive accounts, excessive privileges, failed sign-ins, and cross-tenant denials.

**Acceptance:** a user with the same job title in two hospitals can see only the assigned facility; a user removed from a department loses access on the next request; every privileged action has an audit record.

### 3.2 Contract and data foundation

- Create shared request/response schemas for patient, encounter, admission, order, specimen, result, medication, stock item, invoice, claim, and audit event.
- Standardize identifiers: patient/MPI ID, encounter ID, admission ID, order ID, specimen ID, accession number, unit number, invoice ID, and tenant/facility ID.
- Replace route-local response shapes with versioned contracts and generated client types where practical.
- Finish migrations for remaining operational tables. Remove request-time `CREATE TABLE` behavior from production paths.
- **Auth storage note:** token revocation and MFA tables are included in the migration manifest; deployments must apply the manifest before enabling the corresponding endpoints. No auth route creates these tables during a request.
- Define retention, archival, correction, and deletion behavior for PHI, images, audio, audit records, and financial records.

**Acceptance:** a contract test can create a patient and trace one encounter through order, result, charge, claim, discharge, and audit without translating undocumented field names.

### 3.3 Event and integration backbone

Use a common event envelope:

```json
{
  "eventId": "uuid",
  "eventType": "lab.result.finalized",
  "tenantId": "uuid",
  "facilityId": "uuid",
  "entityId": "uuid",
  "occurredAt": "ISO-8601",
  "correlationId": "string",
  "schemaVersion": 1,
  "payload": {}
}
```

Initial events:

`patient.registered`, `appointment.checked_in`, `queue.token_called`, `er.triaged`, `admission.created`, `bed.allocated`, `order.created`, `specimen.collected`, `lab.result.finalized`, `imaging.report.finalized`, `medication.administered`, `blood.unit.issued`, `ot.case.completed`, `stock.received`, `invoice.posted`, `claim.submitted`, `discharge.ready`, `discharge.completed`, and `critical.alert.created`.

Every consumer must record the event ID, ignore duplicates, expose failures, and support replay from a dead-letter queue.

### 3.4 Shared UI and design system

- Establish one staff shell: facility selector, role-aware navigation, global patient search, notifications, help, audit context, and user menu.
- Keep branded login and patient/corporate experiences separate from the clinical operations shell.
- Standardize page headers, filter bars, tables, status badges, empty/error states, modal confirmation, and audit-history panels.
- Remove decorative 3D transforms and motion from clinical tables and high-frequency work queues.
- Add keyboard navigation, visible focus, minimum touch target size, high-contrast status colors, print styles, and reduced-motion support.

**Acceptance:** a nurse, lab technician, procurement user, and administrator can navigate the same shell without learning four different interaction patterns; axe and keyboard checks pass on all release-critical screens.

### 3.5 Testing and release gates

- Unit tests for pure rules and calculations.
- Contract tests for every schema and role-sensitive endpoint.
- Integration tests against a disposable PostgreSQL schema.
- Playwright smoke flows for each role and department.
- Failure-mode tests for empty data, API 500, permission denial, duplicate submission, timeout/retry, and stale version.
- Migration safety checks, backup/restore drill, security scanning, and accessibility scanning in CI.

**Release gate:** no department may be promoted from `partial` or `shell` on the basis of a screenshot, login page, route count, or seeded demo data alone.

## 4. Department implementation plans

### 4.1 Queue, kiosk, and patient arrival

**Baseline:** Partial-to-built components exist, but the master plan records fragmented queue implementations and polling/display gaps.

**Target workflow:** appointment lookup or walk-in registration → identity/consent → token generation → queue assignment → token call → room/counter completion → wait-time and SLA analytics.

**Implementation work:**

- Create one queue service and canonical `QueueEntry` model; migrate or reconcile existing queue tables.
- Keep queue schema creation in the release migration chain. The queue service now performs a read-only readiness check and fails closed with `SCHEMA_NOT_MIGRATED`; it no longer imports or executes migrations during a request. `20261015000800-hospital-queue-schema-hardening.migration.js` owns the sequence, journey-token columns, indexes, and appointment uniqueness hardening.
- Check-in retries now accept a stable `Idempotency-Key`; the migration adds an organization-scoped unique key and request hash, and concurrent duplicate submissions replay the original entry or return `idempotency_key_reuse` without issuing another token.
- Support appointment, walk-in, ER, lab, pharmacy, billing, and procedure queues with configurable priority rules.
- Add idempotent token generation with facility/date/queue uniqueness.
- Publish `token_called`, `token_recalled`, `patient_no_show`, and `queue_completed` events through SSE/WebSocket.
- Build kiosk check-in, staff queue console, patient display, department display, and accessibility-friendly audio/text call states.
- Add wait-time prediction, counter load balancing, no-show handling, and proactive patient notifications.

**Acceptance:** a walk-in receives exactly one token under concurrent requests; the token appears on staff and public displays within the agreed SLA; calling a token updates the correct queue only; an offline or failed display shows last-updated status rather than invented data.

**Dependencies:** identity, patient MPI, appointments, event backbone, notification service.

### 4.2 OPD, doctor workspace, and clinical orders

**Baseline:** Broad OPD, doctor, EMR, prescription, and clinical workflow routes exist. Remaining work is contract consolidation, clinical sign-off, and cross-module reliability.

**Target workflow:** queue call → patient context → history/allergies/problems → SOAP note → diagnosis/coding suggestion → prescription/lab/imaging/procedure order → billing or admission decision → signed encounter.

**Implementation work:**

- Consolidate patient timeline and encounter context across doctor, hospital, and mobile views.
- Enforce allergy, problem-list, medication reconciliation, and duplicate-order checks before signing.
- Make AI scribe and coding suggestions reviewable; never auto-finalize clinical or billing codes.
- Add order status lifecycle: draft, signed, accepted, in-progress, completed, cancelled, corrected.
- Generate patient-facing instructions and clinician/auditor audit history.
- Add referral, follow-up, and care-plan handoff events.

**Acceptance:** a doctor can complete an OPD encounter without leaving the workspace; a signed order is visible to the receiving department; a cancelled or corrected order leaves a trace; unsigned reconciliation blocks the configured admission/discharge action.

**Dependencies:** patient/MPI, queue, terminology, pharmacy, LIS, RIS, billing, AI governance.

### 4.3 Emergency department

**Baseline:** ER routes and triage UI exist; the master plan classifies the end-to-end workflow as partial.

**Target workflow:** arrival → rapid registration → ESI/clinical triage → resuscitation/bed assignment → orders and critical alerts → disposition to discharge, OT, ward, or ICU.

**Implementation work:**

- Implement a server-owned triage state machine with acuity, reassessment, escalation, and disposition.
- Store triage observations, NEWS2/qSOFA or equivalent scoring, red flags, timestamps, and clinician overrides.
- Link ER cases to queue, orders, imaging, blood bank, OT, ADT, ICU, billing, and MLC/medico-legal records.
- Build live ER board with privacy-safe patient identifiers and clear stale-data indicators.
- Add Code Blue, trauma, emergency OT, and transfer-out workflows.
- Add four-question guided triage where the product requires it; do not substitute an ungoverned manual picker.

**Acceptance:** a patient can be registered, triaged, reassessed, escalated, and dispositioned; a critical case cannot disappear from the active board; transfer to ICU/OT/ADT creates one linked encounter and audit trail.

### 4.4 ADT, beds, wards, and discharge

**Baseline:** ADT, beds, wards, discharge readiness, and displays exist, with remaining work around data unification and multidisciplinary gates.

**Target workflow:** reserve bed → admit → transfer → ward/ICU/OT movement → discharge readiness → summary and medication reconciliation → bill/TPA clearance → discharge → bed release and follow-up.

**Implementation work:**

- Select one canonical admission, encounter, ward, room, and bed model; migrate duplicate models.
- Enforce bed state transitions: available, reserved, occupied, cleaning, blocked, maintenance.
- Add admission source and linked referral/ER/OPD context.
- Build discharge readiness dimensions: clinical, nursing education, medication reconciliation, billing, TPA, summary, and transport.
- Add override roles with reason and audit trail; prevent silent discharge bypass.
- Publish bed and discharge events to command centre, displays, housekeeping, billing, and follow-up.

**Implemented in the current tranche (2026-10-14):** discharge planning storage is now owned by
`20261015002800-discharge-planning.migration.js`; the practice routes perform a read-only readiness
check and return `SCHEMA_NOT_MIGRATED` until the migration is applied. The plan remains a workflow
slice: admission-linked gates, billing/TPA clearance, bed-release events, escalation, and clinical
sign-off still require the phase acceptance test below.

ADT readiness and override audit tables are now additionally owned by
`20261015003100-discharge-readiness-governance.migration.js`; the ADT service performs read-only
readiness checks, checklist initialization is idempotent per admission/dimension, and readiness routes
return a typed schema error instead of creating tables at import time. OT consumables, implant traceability,
and family-notification tables are owned by `20261015003200-ot-consumables-governance.migration.js`;
all OT consumables endpoints now fail closed with a typed schema error when that migration is absent.

**Acceptance:** an admitted patient can be transferred without losing orders or audit history; a bed cannot be double-allocated; discharge is blocked until required dimensions clear or an authorized override is recorded; bed occupancy updates immediately after discharge.

### 4.5 Ward nursing, eMAR, and vitals

**Baseline:** Nursing, eMAR, e-chart, vitals, and care-plan surfaces exist; integration and hard-stop verification remain important.

**Target workflow:** admission assessment → care plan and task board → vitals/EWS → medication due list → barcode/identity check → administration or refusal → handoff → escalation.

**Implementation work:**

- Create admission-linked nursing assessment, task, handoff, and escalation models.
- Complete eMAR states: scheduled, due, held, administered, refused, omitted, discontinued, late, and corrected.
- Link eMAR to prescriptions, pharmacy dispensing, allergies, renal/hepatic flags, and billing where appropriate.
- Implement vitals trend, NEWS2/qSOFA rules, alert owner, acknowledgement, escalation, snooze, and resolution.
- Build shift handoff with unresolved tasks and high-risk patient list.
- Support offline-safe draft capture with conflict resolution and audit.

**Acceptance:** a medication cannot be documented as administered without the required checks; a refusal creates a task/escalation; vital thresholds create an owned alert; shift handoff shows unresolved work and no fabricated patient data.

### 4.6 ICU/HDU

**Baseline:** ICU portal, scoring, device bridge, and display scaffolds exist; full operational acceptance is still required.

**Target workflow:** ICU admission → bed/device assignment → ventilator/drip/vitals charting → severity score and goals → multidisciplinary review → transfer, discharge, or mortuary pathway.

**Implementation work:**

- Define ICU bed, device, ventilator, infusion, line, and daily-goal models.
- Ingest device data through HyperGrid with source, timestamp, quality, and alarm state.
- Build clinician confirmation for device-derived values before they become signed chart data.
- Add severity scoring, deterioration alerts, escalation ownership, and audit.
- Add ICU-to-ward and ward-to-ICU transfers preserving orders and medication context.
- Add privacy-safe ICU display and family status view.

**Acceptance:** a device disconnect is distinct from a zero reading; an alert has an owner and escalation timer; ICU transfer produces a complete handoff; the display never exposes unnecessary PHI.

### 4.7 Operation theatre and anesthesia

**Baseline:** OT scheduling, rooms, anesthesia, implants, checklists, and displays exist; the master plan marks the end-to-end workflow partial.

**Target workflow:** case request → schedule/approve → pre-op assessment and consent → WHO checklist → anesthesia → instrument and implant verification → intra-op timing → operative note → PACU → ward/ICU → billing/MRD.

**Implementation work:**

- Model case request, schedule, room, team, procedure, anesthesia assessment, checklist, implant, consumable, specimen, and operative note.
- Enforce pre-op checklist and consent gates server-side.
- Link CSSD instrument release and biomedical equipment readiness to case start.
- Add barcode/lot/serial capture for implants and high-risk consumables.
- Add emergency OT path from ER and cancellation/rescheduling rules.
- Sync case completion to billing, MRD, infection surveillance, and family notification.

**Implemented in the current tranche (2026-10-14):** OT checklist-bypass audit storage is now owned by
`20261015002900-ot-safety-governance.migration.js`; structured operative notes are owned by
`20261015003000-operative-notes-governance.migration.js`; OT consumables and implant/family-notification storage are additionally owned by `20261015003200-ot-consumables-governance.migration.js`; and the scheduling/operative-note services
no longer create tables at import/request time. Incision/completion transitions fail closed with
`SCHEMA_NOT_MIGRATED` when the migration is absent, and completion returns `OPERATIVE_NOTE_REQUIRED`
until a signed note exists. WHO checklist hard-stops and authorized override auditing remain active;
the full OT/CSSD/biomedical/billing acceptance walkthrough is still required.

**Acceptance:** a case cannot start without required checklist/consent or an authorized override; implant traceability includes lot and serial; operative note is signed before case closure; post-op destination and charges are recorded.

### 4.8 Laboratory, LIS, and phlebotomy

**Baseline:** Lab orders, result routes, lab portal, collection operations, and phlebotomist APIs exist. The dedicated audit identifies gaps and must remain the detailed source for the collection workflow.

**Implemented in the first delivery tranche (2026-10-14):** durable QC material lots and runs, deterministic Westgard evaluation (`1_2S`, `1_3S`, `2_2S`, `R_4S`, `4_1S`, `10_X`), Levey–Jennings chart bands, release-state locking, supervisor unlock with reason, lab-scoped QC APIs under `/api/lab/qc`, audit events, migration registration, and unit tests. Result status updates now lock the order row, persist result/QC version metadata, record release events, and refuse completion against a locked or review-state QC material.

**Target workflow:** order → accession → collection/identity verification → transport → receipt → processing/QC → result validation → critical-value notification → report/FHIR → billing and clinical timeline.

**Implementation work:**

- Complete the lab order/specimen state machine and accession-number uniqueness.
- Finish collector creation, assignment, home/ward collection, idempotent offline command queue, and exception handling as documented in the phlebotomy audit.
- Add analyzer/interface mapping, result normalization, units, reference ranges, delta checks, panic values, corrected reports, and report versioning.
- Implement QC runs, lot/calibrator tracking, Westgard rules, Levey–Jennings charts, QC lockouts, and supervisor approval.
- Add TAT timers, specimen rejection/redraw workflow, chain of custody, and temperature/transport rules.
- Produce signed PDF and FHIR DiagnosticReport/Observation output.
- Separate lab, phlebotomist, doctor, patient, and billing scopes.

**Acceptance:** every result traces to order, specimen, collector, analyzer/manual entry, QC status, validator, and report version; a critical value is acknowledged by the correct clinical role; failed QC blocks affected release; duplicate barcode/accession is rejected; a redraw creates a linked new task without overwriting the original.

**Dependencies:** OPD/orders, patient identity, billing, FHIR/HL7, notification, phlebotomy mobile app.

### 4.9 Radiology, RIS, PACS, and teleradiology

**Baseline:** RIS, DICOM, PACS, Orthanc, imaging sessions, and report surfaces exist; acceptance must verify production tenant isolation and report lifecycle.

**Implemented in the current tranche (2026-10-14):** RIS/PACS study, audit, custody, QC, result-context, critical-alert, and QC-template tables are now owned by `20261015003600-ris-imaging-governance.migration.js`. RIS endpoints perform a read-only schema readiness check and return `SCHEMA_NOT_MIGRATED` rather than creating imaging tables on import. Tenant isolation, report lifecycle, critical-finding escalation, and large-file/PACS acceptance evidence remain required for the module to be marked built.

**Target workflow:** order → scheduling → modality worklist → acquisition/upload → radiologist assignment → draft/report → critical finding acknowledgement → final report → clinician/patient access.

**Implementation work:**

- Normalize imaging order, study, series, accession, modality, and report identifiers.
- Complete DICOMweb/Orthanc tenant isolation, retention, and signed access URLs.
- Add radiologist worklist, peer review, addendum, critical finding escalation, and report finalization.
- Add AI draft with mandatory human approval; AI must not finalize a report.
- Link imaging report to encounter, MRD, insurance, and patient app.
- Test large-file, partial-upload, retry, duplicate-study, and modality-offline behavior.

**Acceptance:** an order produces one traceable study and report; a critical finding reaches an accountable recipient; a revoked user cannot retrieve image bytes; a corrected report preserves the previous version and reason.

### 4.10 Pharmacy and medication supply

**Baseline:** Pharmacy inventory, dispensing, expiry, POS, patient orders, and eMAR bridge exist; the eMAR-to-dispense loop remains a named gap.

**Implemented in the delivery tranche (2026-10-14):** `20261015001200-pharmacy-dispense-governance.migration.js` adds organization-scoped idempotency/request hashes and unique administration links; `20261015001300-emar-safety-governance.migration.js` owns the eMAR safety audit columns/table. The eMAR bridge now validates the order/admission/patient relationship, replays safe retries, rejects key reuse, skips refused/held doses, and fails closed when the queue or safety schema cannot be written. Dispense updates lock the row and enforce `pending -> dispensed`; duplicate completion is harmless and cross-tenant/missing rows return typed errors. The pending and dispense endpoints now enforce clinical/pharmacy roles and expose explicit failure envelopes. Blood Bank can consume the shared cold-chain sensor/alert data under its own tenant-scoped token, with alert acknowledgement in the dashboard.

The same tranche now removes random stock/expiry/batch fallbacks from pharmacy inventory: catalogue-only rows report zero stock and cannot be dispensed, inventory detail returns not-found without a persisted row, and writes fail closed when the inventory schema is unavailable. A tenant-scoped FEFO batch lookup is available at `GET /api/pharmacy/batches/fefo/:medicineId`.

The follow-on governance tranche adds `20261015001600-pharmacy-inventory-governance.migration.js`: POS transactions require an idempotency key and consume non-expired batches in FEFO order; stock movements preserve batch, quantity, reference, actor, and request hash; controlled-drug movements require a witness and are available through `/api/pharmacy/governance/controlled-movements`; wastage deducts a selected batch transactionally; and recall headers/items are persisted with tenant scope and audit. The endpoints fail closed until the migration is applied.

**Target workflow:** prescription/order → pharmacist review → stock/batch selection → dispense → eMAR administration → charge/claim → return, substitution, recall, or wastage.

**Implementation work:**

- Canonicalize medicine, formulation, batch, expiry, unit, location, and inventory ledger.
- Add pharmacist verification, allergy/interaction/contraindication checks, controlled-drug rules, and substitution approval.
- Implement FEFO picking, partial dispense, returns, wastage, recalls, and stock adjustments with reasons.
- Complete eMAR-to-pharmacy reservation/dispense/charge events; reservations and charge posting are still pending.
- Add stock forecasting and reorder integration only after ledger correctness is proven.

**Acceptance:** dispensing cannot exceed available stock; every issued batch and quantity is traceable; an administered dose links to the dispense; controlled medicine requires the configured register and role; a return or correction reverses the ledger rather than mutating history.

### 4.11 Blood bank and transfusion

**Baseline:** Mediqzy has a blood-bank route, donor and unit tables, requisitions, and donor communications. The capability matrix still labels the module a shell, so the complete workflow must be verified rather than assumed.

**Implemented in the delivery tranche (2026-10-14):** Blood Bank schema creation was moved out of the request path into `20261015000300-blood-bank-schema-hardening.migration.js`; the unified migration manifest now owns the inventory, requisition, donor, donation, outreach, recipient, and audit tables; tenant isolation is applied before the route is used; and the route now only binds an organization-scoped connection. Persisted cross-match and transfusion tables are added by `20261015000700-blood-crossmatch-transfusion.migration.js`; issue now requires a compatible recorded cross-match, returns are blocked after transfusion starts, and unit-level transfusion/reaction state is audited. The request-time DDL tripwire was updated and passes for the migrated department routes.

**Target workflow:** donor registration → collection/testing → component processing → inventory/expiry → patient requisition → ABO/Rh/cross-match → reservation → issue → transfusion record → reaction/recall.

**Implementation work:**

- Verify donor eligibility, donation history, testing, deferral, and consent.
- Add component separation and unit-level traceability.
- Implement compatibility and cross-match rules with two-person verification where required.
- Add reservation, issue, return, discard, expiry, recall, and adverse reaction workflows.
- Link issue and transfusion to patient, ward/OT, e-chart, billing, and audit.
- Build inventory and expiry board with real tenant data; no fallback donors or units.

**Acceptance:** incompatible issue is blocked; a unit cannot be issued twice; expiry and recall remove units from available stock; transfusion reaction creates an escalation; the full chain from donor to patient is exportable for audit.

### 4.12 Dietary and nutrition

**Baseline:** Dietary routes and pages exist, but the capability matrix classifies the workflow partial.

**Target workflow:** admission/order → diet assessment → allergy/NPO/clinical restrictions → dietitian review → kitchen production → tray dispatch/delivery → intake/feedback → discharge counselling.

**Implementation work:**

- Create diet order versioning linked to admission, allergies, diagnosis, procedures, and NPO status.
- Add dietitian approval and conflict warnings.
- Build kitchen production list, tray status, delivery confirmation, missed-tray exception, and patient feedback.
- Link meal charges where applicable and preserve the clinical diet history.
- Add discharge diet instructions and multilingual patient-facing output.

**Acceptance:** an allergy or NPO conflict blocks release; an updated order invalidates the old kitchen list; missed delivery is visible and escalated; discharge instructions match the signed diet plan.

### 4.13 CSSD and sterile services

**Baseline:** CSSD login, routes, and pages exist; the capability matrix calls it a shell.

**Target workflow:** instrument/set receipt → decontamination → packing → sterilization cycle → biological/chemical indicator review → release/hold → issue to OT/ward → return and traceability.

**Implementation work:**

- Define instrument set, item, job, cycle, machine, indicator, operator, location, and release models.
- Add barcode/RFID traceability for set and instrument where available.
- Implement cycle parameters, failed/held cycle, indicator evidence, supervisor release, and expiry.
- Link set availability to OT case readiness and stock/maintenance.
- Add maintenance/calibration and machine downtime handling.

**Acceptance:** a failed or incomplete cycle cannot release a set; OT cannot start if required sets are unavailable; every issued set traces to cycle, indicator, operator, and receiving case; reprocessing is auditable.

### 4.14 Procurement, central stores, and supply chain

**Baseline:** Procurement routes and UI exist, but the capability matrix classifies Procurement/GRN as shell and Central Stores as missing.

**Implemented in the delivery tranche (2026-10-14):** SCM tables and tenant policies are migration-owned and registered in the unified migration chain; SCM and Procurement no longer perform request-time schema/policy DDL; GRN creation validates PO-line ownership and ordered quantities inside a row-locked transaction; GRN posting is row-locked, rejects empty receipts, and is safe against concurrent duplicate posting; governance approvals and audit tables are migration-owned. A follow-on traceability migration carries warehouse, bin, batch, and expiry into ledger rows, and `/api/scm/inventory/lots` exposes lot-level balances and expiry status.

**Target workflow:** requisition/indent → budget and approval → supplier quotation → purchase order → receipt/partial GRN → inspection → stock ledger → department issue → invoice three-way match → payment proposal.

**Implementation work:**

- Implement item master with unit, category, reorder level, par level, batch, expiry, location, and valuation method.
- Add requisition, approval matrix, supplier, quotation, PO, amendment, cancellation, and commitment tracking.
- Add full and partial GRN with quantity/quality/expiry checks and discrepancy resolution.
- Post accepted GRN to an immutable stock ledger exactly once.
- Add issue/return/transfer/cycle count/stock adjustment with reasons and approvals.
- Implement PO–GRN–invoice three-way matching and exception queue.
- Feed pharmacy, lab, CSSD, biomedical, dietary, and OT replenishment.

**Acceptance:** duplicate GRN or invoice cannot increase stock twice; partial receipt leaves an auditable balance; a quantity or price mismatch routes to exception; stock valuation reconciles to ledger; a department can see request-to-issue history.

### 4.15 Biomedical engineering and assets

**Baseline:** Biomedical and asset surfaces exist, but operational completeness must be verified against the data-first requirement.

**Implemented in the delivery tranche (2026-10-14):** the HyperGrid equipment registry is migration-owned with tenant/serial indexing, and its sync endpoint no longer creates schema during a request.

The biomedical maintenance-ticket and calibration-schedule registry is also now registered in the unified migration chain. Equipment and calibration writes are tenant-scoped, and missing registry tables surface as operational errors rather than being silently treated as an empty inventory. This closes schema ownership and basic calibration tracking; CMMS approvals, preventive-maintenance automation, cold-chain telemetry, and the clinical-use hard stop remain open acceptance work.

The follow-on biomedical tranche adds migration-owned preventive-maintenance schedules, due/overdue listing, completion rollover, a leased daily overdue sweep, and a fail-closed `/equipment/:id/use-check` endpoint. It also adds tenant-scoped cold-chain sensors, readings, out-of-range alerts, idempotent ingestion, and acknowledgement/resolution endpoints. The overdue sweep is registered as a guarded application cron job and covered by the cron guard suite. Certificate attachments, approval policy, and clinical pilot evidence are still required before this workstream can be marked built.

**Target workflow:** asset register → commissioning → location/owner → preventive maintenance → calibration → breakdown work order → downtime/loaner → retirement/disposal.

**Implementation work:**

- Create asset, component, warranty, calibration, service vendor, work order, and location models.
- Add QR/serial lookup and attachment storage with ACLs.
- Add preventive maintenance scheduler, overdue escalation, service history, and calibration certificate expiry.
- Link device readiness to ICU, OT, lab, radiology, and CSSD workflows.
- Add depreciation and disposal handoff to finance.

**Acceptance:** an expired calibration blocks configured clinical use; downtime is visible to the affected department; service history is immutable; disposal requires approval and asset status changes consistently everywhere.

### 4.16 Infection control and antimicrobial surveillance

**Baseline:** The hospital plan identifies infection control as a scaffold/login-only department; the capability matrix calls related analytics future work.

**Target workflow:** infection event/surveillance entry → isolation precaution → exposure/contact tracing → specimen/result linkage → antimicrobial review → HAI/antibiogram report → corrective action.

**Implementation work:**

- Add infection case, organism, specimen, isolation, exposure, precaution, and review models.
- Link lab results and patient location history to exposure investigation.
- Implement isolation orders and ward display signals with minimum necessary PHI.
- Add antimicrobial stewardship review and antibiogram/HAI reporting.
- Add outbreak dashboard, action owner, due date, escalation, and closure evidence.

**Delivery status (2026-10-14):** The first production-safe tranche is now implemented. Migration
`20261015001400-infection-mortuary-workflows.migration.js` owns tenant-scoped case, isolation,
exposure, stewardship, and audit tables. `infection-control.service.js` provides fail-closed schema
readiness, idempotent case creation, tenant-scoped listing/detail, confirm/close transitions,
isolation and exposure lifecycle, stewardship decisions, and audit retrieval. The department route
enforces JWT tenant context and role allow-listing. The client dashboard and surveillance/incident/
alert/report screens now fetch live records, show loading/error/empty states, and expose guarded case
creation and close/confirm actions. Lab-result linkage, ward display signaling, and outbreak/HAI
analytics remain follow-on work and are deliberately not represented as complete.

**Acceptance:** an isolation order reaches nursing/bed management; exposure lists are tenant- and role-scoped; a confirmed HAI is not counted twice; stewardship actions have owner and closure evidence.

### 4.17 Mortuary, medico-legal, and death records

**Baseline:** Mortuary is identified as a login-only/scaffold department.

**Target workflow:** death declaration → identity verification → medico-legal hold or release → body location/cold-room tracking → authorized handover → documentation and audit.

**Implementation work:**

- Add death event, certificate status, body/container, location, property, legal hold, next-of-kin, release authorization, and handover models.
- Link death to admission, MRD, billing, insurance, blood, infection, and bed release.
- Enforce two-person verification for identity and handover where policy requires.
- Add restricted-access audit and document retention.

**Delivery status (2026-10-14):** Migration `20261015001400-infection-mortuary-workflows.migration.js`
also owns death, body, handoff, and mortuary audit tables. `mortuary.service.js` now implements
fail-closed readiness, idempotent death declaration, body registration, legal holds, two-person
handover checks, medico-legal authorization checks, tenant-scoped reads, and audit history. The
route enforces tenant context and role authorization. The client dashboard and cases/releases/
records/reports screens now use the live death register with real counts, create flow, and honest
loading/error/empty states. MRD/billing/bed-release integrations, document retention workflows, and
clinical/legal sign-off remain required before this module is production-complete.

**Acceptance:** a body cannot be released under an active legal hold; identity mismatch blocks handover; bed and encounter closure happens only after the configured death workflow; every handover is signed and auditable.

### 4.18 Medical records and health information management

**Baseline:** EHR/MRD, discharge summary, digitization, and report screens exist; the standalone MRD path contains scaffold/demo risk.

**Target workflow:** record opening → document ingestion → indexing → clinical filing → coding → release request → legal hold → export/claim attachment → retention/disposal.

**Implementation work:**

- Define document classes, source, author, encounter link, version, signature, retention, and legal-hold metadata.
- Replace local/demo records with tenant-backed data.
- Add document scanning/upload validation, malware/MIME checks, signed URLs, and access logs.
- Implement release-of-information requests, patient export, insurance attachment, and correction/addendum workflow.
- Link MRD completeness to discharge and claim gates.

**Acceptance:** a record can be located from patient, encounter, admission, or document number; a corrected document preserves the original; an unauthorized user cannot download the file; exports contain only the authorized scope.

### 4.19 Quality, NABH, incident, and risk management

**Baseline:** Quality/NABH surfaces exist in parts; templates and evidence coverage are classified partial.

**Target workflow:** policy/template → incident or audit → root-cause/action plan → owner/due date → evidence upload → review/approval → closure and dashboard.

**Implementation work:**

- Create controlled document, policy version, audit, incident, CAPA, risk register, indicator, and evidence models.
- Assemble NABH/JCI template packs with version, effective date, owner, and approval.
- Add incident severity, patient-safety escalation, confidentiality, and no-retaliation controls.
- Link quality indicators to lab, infection, pharmacy, OT, nursing, complaints, and HR data.
- Add overdue action notifications and immutable closure evidence.

**Acceptance:** every open CAPA has an owner and due date; a superseded policy is no longer presented as current; an incident cannot be silently deleted; a reviewer can reconstruct evidence and approvals.

### 4.20 Billing, finance, accounts, and revenue cycle

**Baseline:** Patient billing and payment surfaces are stronger than hospital accounts; the master plan identifies finance/accounts pages as scaffold/login-only and tariff/ledger work as incomplete.

**Target workflow:** tariff/contract → estimate → running charges → discount/approval → patient/insurance split → invoice → payment/refund/credit note → ledger/export → reconciliation.

**Implementation work:**

- Build canonical tariff master for room, procedure, package, lab, imaging, pharmacy, OT, and department-specific pricing.
- Post charges from clinical events exactly once with source references.
- Add GST/receipt/invoice numbering, credit notes, refunds, discounts, deposits, and approval thresholds.
- Implement finance ledger boundaries and reconciliation reports; do not represent a payment as settled before gateway/bank confirmation.
- Add department revenue, payer settlement, variance, and month-end close.
- Link discharge readiness to billing/TPA dimensions with controlled overrides.

**Delivery status (2026-10-14):** Migrations `20261015001500-finance-clinical-charge-ledger.migration.js`,
`20261015001900-hospital-billing-suite.migration.js`, and `20261015002000-hospital-tariff-master.migration.js`
own the clinical charge ledger, cashier/invoice/payment/credit/audit/statement tables, and canonical
tariff table respectively. The legacy-order bridge and hospital billing/tariff services check migration
readiness and fail closed instead of creating financial tables during a request. Tariff periods are
validated, overlapping active payer/room scopes are rejected, active lookup is date-aware, and
deactivation is controlled. Invoice/credit-note lifecycle completeness, payment settlement,
reconciliation, department revenue, and month-end close are still open.

**Acceptance:** every invoice line has a clinical or authorized manual source; duplicate events do not duplicate charges; refunds and credit notes reverse correctly; a finance user can reconcile invoice, payment, claim, and ledger totals.

### 4.21 Insurance, TPA, preauthorization, and claims

**Baseline:** Insurance, TPA, preauth, insurer, broker, and EDI surfaces are broad; end-to-end payer acceptance still requires payer-specific testing.

**Implemented in the current tranche (2026-10-14):** the 29-table TPA claims, preauthorisation,
provider, cashless, adjudication, remittance, and interoperability schema is now owned by
`20261015003500-tpa-claims-lifecycle-governance.migration.js`. The lifecycle service performs a
read-only information-schema readiness check and returns `SCHEMA_NOT_MIGRATED` rather than creating
claims tables during a request. Payer-specific contract testing, idempotent external submission,
SLA/appeal acceptance evidence, and finance reconciliation remain open.

**Target workflow:** eligibility → preauth → clinical document submission → enhancement → approval/denial → interim/final bill → claim submission → remittance/reconciliation → appeal.

**Implementation work:**

- Define payer, policy, member, benefit, authorization, claim, attachment, status event, denial, appeal, and remittance models.
- Add 270/271 or equivalent eligibility where supported, NHCX/X12N mappings, and idempotent claim submission.
- Add SLA clocks, owner, escalation, and payer communication history.
- Generate claim drafts from signed clinical data and require human review before submission.
- Keep patient share, non-payable items, and approved amount visible throughout the encounter.

**Acceptance:** a claim can be traced from admission through remittance; a denial creates an actionable reason and owner; resubmission does not create a duplicate claim; attachments are access-controlled and auditable.

### 4.22 HR, workforce, roster, leave, and payroll

**Baseline:** HRMS, payroll, roles, shifts, delegation, and leave screens exist; payroll is partial and requires data-model reconciliation. The former HRMS request module also created its full table set at module load/request time.

**Target workflow:** staff master → credential/qualification → roster → attendance → leave → payroll input → approval → payslip/export → certification expiry.

**Implementation work:**

- Create one staff master linked to identity, department, facility, role, qualification, and employment status.
- Add shift roster, on-call, overtime, leave balance, approval, holiday calendar, and handover coverage.
- Implement qualification/certification expiry alerts and clinical privilege checks.
- Complete payroll structures, allowances, deductions, statutory fields, approval, payslips, and finance export.
- Link staffing coverage to department capacity and command-centre analytics.

**Delivery status (2026-10-14):** `20261015002100-hrms-schema.migration.js` now owns the complete
HRMS table/index set. `hrms-schema-readiness.service.js` checks all required tables through
`information_schema` and returns `SCHEMA_NOT_MIGRATED` (503) when the deployment migration is absent;
the HRMS route no longer creates tables during startup or a request. Focused readiness tests pass.
The HR dashboard now loads staff, attendance, pending leave, recruitment, and payroll run data from
their APIs and shows explicit empty/unavailable states instead of seeded people, payroll totals, or
compliance alerts.
Qualification/privilege enforcement is now represented by persisted qualification/privilege records
and a fail-closed decision service. Prescribing, pharmacy dispense, and blood-bank issue/cross-match/
transfusion writes are wired to that decision; lab shared-logins still need an operator-identity
mapping before the same check can be applied safely. Certification alert delivery and HR department
acceptance remain open.

**Implemented in the next tranche (2026-10-14):** migration `20261015002200-hrms-qualifications-privileges.migration.js`
now owns staff qualification and clinical privilege records. The HRMS API exposes qualification
expiry reporting, verification/update, privilege grant/revoke, and a fail-closed privilege decision
endpoint. A linked qualification is required to be active, verified, and unexpired for a privilege
to be allowed. Route-level readiness and focused service tests are in place. Prescribing, pharmacy
dispense, and blood-bank issue/cross-match/transfusion paths consume this check; lab operator identity,
certification alert delivery, and HR acceptance remain open.

Payroll structures, runs, and run lines are now owned by `20261015002300-payroll-schema.migration.js`;
the payroll route checks migration readiness and no longer creates tables on a request. Existing payroll
run creation persists employee identity on each line so payslips and exports remain reproducible.

The payroll-to-finance boundary is implemented by `payroll-finance-bridge.service.js` and
`POST /api/payroll/runs/:id/finance-post` plus `GET /api/payroll/runs/:id/finance-reconciliation`.
Only finalized (or already exported) runs are eligible. The caller supplies tenant-owned account ids for
salary expense, net salary payable, PF, ESI, TDS, and any non-zero other deductions. The bridge validates
each line in paise, posts one idempotent `payroll_run` journal, and records the journal link through
`20261015002400-payroll-finance-link.migration.js`; it never invents chart-of-account mappings.

Hospital authentication interoperability defaults, FHIR audit, hospital refresh-token, and login-lockout tables
are now owned by `20261015002500-hospital-auth-support-schema.migration.js`; hospital auth checks readiness and
no longer creates tables during module import or login. The health activity tracker table is likewise owned by
`20261015002600-daily-activity-schema.migration.js` and its route fails closed when that migration is absent.

**Acceptance:** an expired clinical qualification removes the relevant privilege; an approved leave updates coverage; payroll totals reconcile to approved inputs; a payslip can be regenerated without changing the original run.

### 4.23 Patient feedback, PREMS, complaints, and support

**Baseline:** Feedback, complaints, omnichannel, support, and PREMS code exists in parts; the capability matrix and implementation notes disagree on completeness.

**Target workflow:** discharge/visit trigger → survey invitation → response → sentiment/NPS/PREMS aggregation → complaint conversion → SLA assignment → escalation → resolution → patient communication.

**Implementation work:**

- Verify and consolidate survey invitation, response, question-version, channel, and consent models.
- Add configurable trigger rules for discharge, OPD, lab, pharmacy, and teleconsultation.
- Implement NPS, PREMS dimensions, sentiment, trend, department filters, and response-rate metrics.
- Route negative feedback into complaints with SLA, owner, escalation, and closure reason.
- Separate patient complaints from operator support tickets and enforce tenant boundaries.

**Implemented in the next tranche (2026-10-14):** migration `20261015002700-prems-feedback.migration.js`
now owns invitation and response tables, survey version, channel, consent, department, NPS, response
idempotency, and one-response-per-invitation constraints. Discharge submission creates at most one
invitation with `ON CONFLICT DO NOTHING`; PREMS response writes fail closed when the migration is missing,
replay idempotently, update invitation status, create one linked complaint ticket for a negative response,
assign an S1/S2 response and resolution SLA, and expose tenant-scoped metrics by visit type and department. The quality portal consumes live feedback
aggregates and patient-facing data does not expose internal complaint notes.

**Acceptance:** a completed discharge generates at most one invitation per configured policy; a negative response creates one linked action; response data is attributable to question version and department; patient-facing status never exposes internal notes.

### 4.24 Command centre, analytics, and reporting

**Baseline:** HMIS command centre, executive dashboards, AI operations, and telemetry surfaces exist, but upstream data quality determines their value.

**Target workflow:** operational events → governed aggregates → role-specific dashboard → drill-down → export/scheduled report → alert/action.

**Implementation work:**

- Define metric catalog with owner, formula, grain, freshness, and unavailable state.
- Separate operational queries from reporting aggregates to protect clinical transactions.
- Add census, bed pressure, queue wait, OT utilization, lab TAT, stock risk, revenue, claims, staffing, incidents, and patient-experience metrics.
- Display data freshness and source; never turn missing data into zero.
- Add scheduled reports, CSV/PDF export, row-level access, and audit.

**Acceptance:** every KPI has a documented formula and source; a failed source shows `unavailable` with last updated time; drill-down totals reconcile to source records; exports enforce the same access scope as the dashboard.

## 5. Intelligence, interoperability, and mobile overlays

These are shared overlays, not substitutes for department workflows.

### AI and clinical decision support

- Establish model cards, approved use, prohibited use, confidence, human reviewer, prompt/model version, and audit for every AI feature.
- Keep deterministic safety rules ahead of generative output for triage, drug interactions, critical results, and deterioration alerts.
- Complete ambient scribe consent, retention, pause/resume, correction, sign-off, and deletion controls before a broad pilot.
- Complete AI coding review before billing integration.
- Validate cohort search against known patient sets and fail closed for unsupported lab or clinical language.

### Interoperability

- Make FHIR Patient, Encounter, Observation, DiagnosticReport, MedicationRequest, MedicationAdministration, Procedure, Claim, and DocumentReference mappings versioned and testable.
- Maintain HL7 v2 message acknowledgements, retries, dead-letter handling, and replay.
- Keep ABDM consent artefacts and health-information exchanges separate from ordinary portal authentication.
- Add integration monitoring by tenant, facility, partner, message type, latency, and failure reason.

### Mobile and field apps

- Patient mobile: appointments, queue, prescriptions, billing, reports, consent, notifications, and offline-safe read state.
- Staff mobile: ward tasks, vitals, eMAR, escalation, handoff, and secure device lock.
- Phlebotomy mobile: implement the API contract in the lab audit, including collector provisioning by the lab portal, idempotency, expected versions, offline queue, and no fabricated tasks.
- Use secure token storage, screenshot protection, encrypted offline data, device identity, and remote session revocation.

## 6. RACI and ownership

| Workstream | Accountable | Responsible | Consulted | Evidence owner |
|---|---|---|---|---|
| Clinical safety and workflow | Medical Superintendent / Clinical Lead | Clinical product manager | Department champion, nursing, pharmacy, lab | Clinical acceptance record |
| Data and API | CTO / Platform Lead | Backend lead | Security, data, integration teams | Contract and migration report |
| UI and accessibility | Product Design Lead | Frontend lead | Department champion, accessibility reviewer | Playwright/axe evidence |
| Security and privacy | DPO / Security Lead | Security engineering | Legal, clinical, platform | Threat model and audit export |
| Operations and rollout | COO / Implementation Lead | Implementation manager | Training, support, department champions | Pilot and go-live sign-off |
| Finance and claims | CFO / Revenue Lead | Finance product owner | TPA, billing, accounting | Reconciliation report |

Each department must nominate a product owner, clinical/operational champion, technical owner, and acceptance approver before sprint planning begins.

## 7. Delivery backlog and priority gates

### P0 — must complete before a hospital pilot

- Canonical tenant/facility/identity and role enforcement.
- Migration and database safety baseline.
- Shared patient, encounter, admission, order, audit, and event contracts.
- Queue, OPD, ER registration, ADT, beds, ward nursing, eMAR, discharge, and billing minimum path.
- Empty/error/no-fabricated-data controls and release smoke tests.
- Backup/restore drill, observability, incident response, and PHI access audit.

### P1 — required for a clinically credible pilot

- Lab result normalization, QC, critical values, phlebotomy, and report release.
- RIS/PACS report lifecycle and critical findings.
- Pharmacy dispensing/eMAR loop.
- Blood issue and transfusion traceability.
- OT checklist/anesthesia/operative note and CSSD release dependency.
- Insurance preauth and discharge billing gates.

### P2 — required for a full hospital operating model

- CSSD end-to-end cycle, procurement/GRN/three-way match, central stores ledger.
- Biomedical maintenance/calibration, infection surveillance, mortuary, MRD release.
- Quality/NABH CAPA and evidence management.
- Workforce qualification, roster, payroll, PREMS, complaints, and command centre metrics.

### P3 — scale and differentiation

- Governed AI productionization, predictive staffing, antibiogram/HAI, digital pathology, pharmacogenomics, smart rooms, RWE, marketplace, and multi-site federation.

## 8. Acceptance and rollout method

For each department:

1. Freeze the workflow and data dictionary with the department champion.
2. Create or reconcile migrations before adding UI features.
3. Implement API contracts and role tests.
4. Implement UI states against mocked empty, success, permission, validation, conflict, and server-failure responses.
5. Run integration tests with a disposable tenant and synthetic patients.
6. Run a clinical/operational walkthrough with one happy path and one exception path.
7. Run security, audit, accessibility, and performance checks.
8. Enable the module behind a tenant capability flag.
9. Pilot with named users and real operational data under the agreed privacy controls.
10. Record sign-off, known limitations, rollback plan, training material, and support owner.

No module should be advertised as complete until its acceptance record links to the API tests, UI smoke flow, migration version, audit evidence, and department sign-off.

## 9. Implementation snapshot (2026-10-14)

The first production-hardening tranche is now represented in code and the migration manifest:

- **LIS/QC:** Westgard evaluation, QC lot/run persistence, Levey–Jennings chart data, release lock/unlock, lab-scoped APIs, audit events, and unit tests.
- **LIS/result release:** lab-order completion now requires results, records a monotonically increasing result version, links the QC material/run when supplied, blocks unreleased QC, and writes a release event for audit/replay.
- **SCM/Procurement:** migration-owned SCM and governance schemas, read-only migration readiness checks, tenant-aware approval keys, row-locked GRN creation/posting, ordered-quantity validation, empty-receipt rejection, and duplicate-post protection.
- **Central stores traceability:** GRN batch/expiry/warehouse/bin values now persist into the stock ledger; lot-level inventory and expiry status are available through `/api/scm/inventory/lots`, with the SCM and Procurement posting paths using the same guarded transaction behavior.
- **Central stores movements:** issue, return, transfer, and signed stock-adjustment workflows now use an immutable movement header/line model, tenant-scoped idempotency keys, source-lot balance locks, transfer double-entry ledger rows, and an auditable movement history at `/api/scm/inventory/movements`.
- **Procurement UI:** GRN receipt controls now collect warehouse, bin, batch/lot, and expiry data and send the same traceability values to every receipt line; mixed lots remain separate receipts by operator policy.
- **CSSD/Dietary/Biomedical:** migration-owned schemas and tenant policy application; routes no longer create tables or policies on request and fail closed when the migration has not run.
- **Hospital OS / queue foundation:** event, approval, knowledge-graph, simulation, copilot, and queue services now use read-only schema readiness checks; `hospital-os-2035`, `hospital-queue-schema-hardening`, and queue check-in idempotency are registered in the unified migration manifest, so request handlers do not execute deployment DDL.
- **Event backbone:** Hospital OS events now use a duplicate-safe envelope with `event_id`, tenant/facility scope, correlation ID, schema version, and a registered migration. Consumers can safely retry a publication without creating a second event.
- **Blood Bank:** inventory, requisition, donor, donation, outreach, recipient, audit, persisted cross-match, issue gating, return protection, and transfusion schemas moved to migrations; tenant policy application and migration readiness checks added to the route.
- **Release evidence:** the request-time DDL tripwire, QC service and result-release route tests, Hospital OS and queue schema-readiness tests, QMS hardening tests, syntax checks, migration manifest status, frontend production build, and diff hygiene checks pass for the tranche. The DDL audit still reports the pre-existing route inventory and therefore remains a tracked P0 backlog rather than a green all-repository claim.
- **Workforce and finance:** HR qualification/privilege records fail closed when their migration is absent; prescribing, pharmacy dispense, and blood-bank issue/cross-match/transfusion writes now consume that decision. Finalized payroll runs can post exactly once to the tenant ledger with explicit account mapping and a persisted journal link. Hospital-auth support tables, daily activity, PREMS feedback, discharge planning, OT safety, operative notes, ADT readiness, OT consumables/implant/family-notification storage, consent enforcement, NABH/JCI compliance, nursing e-chart/IPD, ICU, anesthesia, follow-up/recovery, patient navigation, TPA/claims lifecycle, RIS/PACS, CRM core, CRM campaign, CRM extension, team workspace, provider-network, SIB chatbot, display/kiosk, ABDM/HFR/HPR, corporate-HMIS, imaging evidence/knowledge/provenance, and imaging operations, enterprise SSO, FHIR subscription, fee-schedule, HyperGrid inventory, RWE export, admin-portal, AI governance, clinical-intelligence, billing-estimate, clinical-support, CRM growth, HMIS workflow, and ISO 27001 storage are migration-owned as well. The remaining request-time DDL inventory is 63 statements across 29 files (47 per-request findings) and is still an open P0 backlog.

This snapshot does not mark the overall programme complete. Result-finalization/QC blocking, department UI acceptance, cross-module event replay, clinical sign-off, and the remaining department backlogs still require their own implementation and pilot evidence.

## 10. Immediate next actions

1. Resolve the status conflicts in the capability matrix: Blood Bank, PREMS, CSSD, Procurement/GRN, NEWS2/qSOFA, cohort search, and ambient scribe.
2. Select the canonical patient/encounter/admission/order/stock models and publish the data dictionary.
3. Finish P0 queue-to-discharge acceptance tests before expanding new department screens.
4. Start LIS normalization and QC as the first P1 workstream because it affects clinical analytics, cohort search, billing, and AI.
5. Run controlled GRN-to-stock and issue/return/transfer/adjustment transactions and document exactly-once posting, source-balance locking, transfer reconciliation, and valuation evidence.
6. Create one shared staff shell and component/state library; migrate department screens incrementally instead of adding more portal-specific CSS.
7. Add a release dashboard showing each module’s status, last acceptance run, open critical defects, data freshness, and owner.

## 11. Maintenance

Review this document at each quarterly planning cycle and after every production pilot. A module status may move from `built` to `partial` if a dependency, data model, security control, or acceptance test regresses. Documentation must describe the executable system, not the intended product catalogue.
