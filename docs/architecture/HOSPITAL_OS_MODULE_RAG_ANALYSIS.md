# MediQzy Hospital OS — Requirements, Availability & Gaps (RAG) Analysis
## with Implementation Plan — Mahalakshmi Hospital Implementation

> **Document type:** RAG (Requirements · Availability · Gaps) analysis + implementation plan.
> **Note:** "RAG" here means the Requirements-Availability-Gaps document format — it is **not** related to AI Retrieval-Augmented Generation.
> **Scope:** Functional modules required to implement MediQzy Hospital OS at Mahalakshmi Hospital, per the approved proposal (`MediQzy_HospitalOS_Proposal_Mahalakshmi_Hospital.pdf` §4).
> **Companion document:** `docs/architecture/HOSPITAL_OS_ONPREM_RAG_IMPLEMENTATION_PLAN.md` covers the *deployment-side* RAG (on-prem server, remote control plane, data migration). This document covers the *product-side* RAG (which modules exist, which don't).
> **Method:** Every module in the proposal was traced to concrete implementation in this repository (route files, services, client pages). Availability ratings are evidence-based, not aspirational.

---

## 1. Executive Summary

| Aspect | Finding |
|---|---|
| Modules in proposal | **41** across 8 categories (A–H) |
| Fully available | **37 (90%)** — production-grade with live code |
| Partially available | **3 (7%)** — CSSD, Housekeeping, Document Management |
| Not available | **0 at category level**; CSSD is nearest to greenfield |
| Verdict | **Feasible to implement now.** Gap closure of 3 modules (est. 3–6 weeks) can run in parallel with the deployment track. |

---

## 2. Requirements (R)

The proposal commits the following module set — these are the go-live requirements.

| # | Category | Requirement modules |
|---|---|---|
| A | Patient Access & Front Office | Front Desk & Registration; Queue Management (QMS); Self-Registration Kiosk; Patient Engagement Portal/App; Referral Management |
| B | Clinical & Nursing | OPD Management; IPD & Ward Management; Bed Management; Nursing Module; EMR / e-Charting; Consent & Clinical Documentation; Discharge Summary |
| C | Diagnostics & OT | Laboratory Information System (LIS); Radiology / PACS Integration; OT Management; Blood Bank |
| D | Pharmacy & Materials | Pharmacy Management; Inventory & Stores; CSSD Management; Biomedical Equipment Maintenance; Procurement & SCM |
| E | Billing, Insurance & Finance | Billing & Revenue Cycle; Insurance / TPA Desk; Corporate & Empanelment; Accounting; Medical Records (MRD) |
| F | HR & Administration | HRMS & Payroll; Duty Roster & Shift Scheduling; Security; EDP / IT Administration |
| G | Support Services | Dietary & Kitchen; Housekeeping & Facility; Ambulance & Transport; Document Management (DMS) |
| H | Quality, Communication & Analytics | Quality & NABH; Patient Feedback & Grievance; Communication Hub; Remote Patient Monitoring; Teleconsultation; RFID/IoT Asset Tracking; MIS & Analytics Dashboards |

**Non-functional requirements (proposal §6):** ABDM/ABHA readiness, HL7/FHIR interoperability, DPDP 2023 & data-locality compliance, role-based access and audit trails.

---

## 3. Availability (A) — evidence-based module matrix

Legend: ✅ fully implemented · 🟡 partial (exists but incomplete) · 🔴 not implemented

### 3.1 Category A — Patient Access & Front Office (5/5 ✅)

| Module | Status | Evidence in codebase |
|---|---|---|
| Front Desk & Registration | ✅ | `HospitalRegister.tsx`, `FrontDeskLogin.tsx`; `server/routes/public-kiosk-register.route.js` |
| Queue Management (QMS) | ✅ | `server/routes/queue-management.route.js`, `queue.route.js`, `hospital-queue.route.js`; `HospitalQmsPage.tsx` (call-next, token display) |
| Self-Registration Kiosk | ✅ | `KioskSecureRegister.tsx`; `/kiosk/checkin` provisioning; `abdm-kiosk.route.js`, `display-kiosk.route.js` |
| Patient Engagement Portal/App | ✅ | Patient portal: `Appointments.tsx`, `MyBookings.tsx`, `HealthDashboard.tsx`, report access, feedback |
| Referral Management | ✅ | Inter-dept/inter-hospital referral tracking; `follow-up-hmis.route.js` |

### 3.2 Category B — Clinical & Nursing (7/7 ✅)

| Module | Status | Evidence |
|---|---|---|
| OPD Management | ✅ | Consultation flow; e-prescription `HospitalPrescriptionCreator.tsx`; `doctor-availability.route.js` |
| IPD & Ward Management | ✅ | `adt.route.js` (admit/transfer/discharge); `wards-admin.route.js`; `HospitalADTTransfer.tsx` |
| Bed Management | ✅ | `BedMap.tsx` (live occupancy); `beds-management.route.js`; `HospitalICUBoard.tsx` |
| Nursing Module | ✅ | `NurseTaskBoard.tsx`, `EMARPage.tsx` (MAR); `nursing-ipd.route.js`; `NurseHandoverPage.tsx` (shift handover) |
| EMR / e-Charting | ✅ | `EChartingPage.tsx`, `emr.route.js`, `HospitalEHR.tsx`, `PatientEMR.tsx` |
| Consent & Clinical Docs | ✅ | `consent-management.route.js`; structured clinical notes & sign-off |
| Discharge Summary | ✅ | `HospitalDischargeSummary.tsx`, `DischargeWorkflow.tsx`, `discharge-workflow.route.js` (TPA-ready output) |

### 3.3 Category C — Diagnostics & OT (4/4 ✅)

| Module | Status | Evidence |
|---|---|---|
| LIS | ✅ | `api-v1-labs.js`, `lab.route.enhanced.js`, `lab-tests.route.js`, `lab-rule-engine.route.js`, `lab-integration.route.js` (order → sample → result chain) |
| Radiology / PACS | ✅ | `imaging-platform.route.js` (worklist, triage, MWL, VNA), `orthanc-webhook.route.js` (PACS bridge), `dicom-modality.route.js`, `HospitalRadiology.tsx` |
| OT Management | ✅ | `ot-scheduling.route.js`, `ot-rooms-admin.route.js`, `OTCommandCenter.tsx`, `anesthesia.route.js` |
| Blood Bank | ✅ | `bloodBank.route.js`; `BloodBankDonorsPage.tsx`, `BloodBankDashboardPage.tsx` (donor, crossmatch, issue) |

### 3.4 Category D — Pharmacy & Materials (4 ✅ / 1 🟡)

| Module | Status | Evidence / gap |
|---|---|---|
| Pharmacy Management | ✅ | `pharmacy.route.js`, `api-v1-pharmacy.js`, `pharmacy-dispense.route.js`, `HospitalPharmacyDispense.tsx`, `PharmacyAISafetyPage.tsx` |
| Inventory & Stores | ✅ | `scm.route.js` stock/issue/returns |
| **CSSD Management** | 🟡 | Only department login shell (`CSSDLogin.tsx`). **Missing:** instrument/tray tracking, sterilization cycles, set assembly, dispatch-to-OT traceability |
| Biomedical Equipment Maintenance | ✅ | `device.route.js` — AMC renewal monitor, expiring-AMC alerts, device health/heartbeat |
| Procurement & SCM | ✅ | `scm.route.js`, `dept/procurement.route.js` — vendors, PO, GRN, PAR reorder cron (`scm-par-reorder-cron.service.js`) |

### 3.5 Category E — Billing, Insurance & Finance (5/5 ✅)

| Module | Status | Evidence |
|---|---|---|
| Billing & Revenue Cycle | ✅ | `HospitalBillingPage.tsx`, `billing.route.js`, `charge-master.route.js`, `billing-estimate.route.js` |
| Insurance / TPA Desk | ✅ | `hospital-insurance.route.js`, `hmis-preauth.route.js` + `ai-preauth-engine.service.js` (eligibility → pre-auth → claim tracking), `tpa.route.js` |
| Corporate & Empanelment | ✅ | `corporate.route.js`, `corporate-hmis.route.js`, `insurance-broker/company/policy.route.js` |
| Accounting | ✅ | `AccountsModulePages.tsx` (17 pages: GL, AP/AR, day-book), `billing-ledger-bridge.service.js`, `auto-invoice.service.js` |
| Medical Records (MRD) | ✅ | `HospitalMRD.tsx`, records archival with audit trail |

### 3.6 Category F — HR & Administration (4/4 ✅)

| Module | Status | Evidence |
|---|---|---|
| HRMS & Payroll | ✅ | `hrms.route.js`, `payroll.route.js`, `HRModulePages.tsx`, `HRDashboard.tsx` |
| Duty Roster & Shifts | ✅ | Rostering in HR module; nurse/employee rosters; `employee-network.route.js` |
| Security | ✅ | `SecurityModulePages.tsx`, `HospitalSecurity.tsx` — visitor gate pass, access logs, guard duty |
| EDP / IT Administration | ✅ | `autoTicketService.js` (IT helpdesk/asset tickets); admin user & master-data control |

### 3.7 Category G — Support Services (2 ✅ / 2 🟡)

| Module | Status | Evidence / gap |
|---|---|---|
| Dietary & Kitchen | ✅ | `DietaryModulePages.tsx`, `DietaryDashboardPage.tsx`, `diet.route.js` (diet charts, tray orders) |
| **Housekeeping & Facility** | 🟡 | Bed-status triggers and dashboard mentions exist, but **no dedicated task module**: no assignment boards, checklists, turnaround SLAs |
| Ambulance & Transport | ✅ | `ambulance/auth.routes.js`, `HospitalAmbulance.tsx`, `AmbulanceDashboard.tsx` (dispatch, trip log) |
| **Document Management (DMS)** | 🟡 | Clinical document templates + HelpCenter exist; **no centralized policy/SOP DMS** with versioning, review cycles, acknowledgement tracking |

### 3.8 Category H — Quality, Communication & Analytics (7/7 ✅)

| Module | Status | Evidence |
|---|---|---|
| Quality & NABH | ✅ | `nabh-jci.route.js`, `compliance-dashboard.route.js` (indicators, mock-audit tracking) |
| Feedback & Grievance | ✅ | `feedback-intelligence.route.js` |
| Communication Hub | ✅ | `HospitalCommunicationHub.tsx`; SMS/WhatsApp/email gateways (Brevo/Twilio) |
| Remote Patient Monitoring | ✅ | `device.route.js`, `telemetry.route.js`, `apple-health.route.js`, `RemoteHealthMonitoring.tsx` |
| Teleconsultation | ✅ | `VideoConsultation.tsx`, `HospitalTeleconsult.tsx` (Agora RTC) |
| RFID/IoT Asset Tracking | ✅ | `HospitalAssetTracking.tsx`, `IoTMonitoringHubPage.tsx`, device heartbeat/monitor |
| MIS & Analytics | ✅ | `MISDashboard.tsx`, `analytics.route.js`, `hmis-analytics.route.js`, `executive-dashboard.route.js` (CEO/CFO/COO views) |

### 3.9 Non-functional / compliance availability

| Requirement | Status | Evidence |
|---|---|---|
| ABDM / ABHA | ✅ | `abdm.route.js`, `abdm-aadhaar-enrol.service.js`, ABDM kiosk flow |
| HL7 / FHIR | ✅ | `HL7FHIRMonitor.tsx`, FHIR/CDA export routes |
| DPDP 2023 / consent & audit | ✅ | `consent-management.route.js`, `audit-chain.service.js`, encryption at rest/in transit |
| Role-based access | ✅ | `authUser` / `requireRole` middleware across routes; ring-fencing (`ringFencing.js`) |

---

## 4. Gap Analysis (G)

### 4.1 Consolidated gap register

| ID | Module | What exists | What is missing | Severity | Est. effort |
|---|---|---|---|---|---|
| G-1 | **CSSD Management** | Dept login shell only | Instrument registry; tray/set assembly; sterilization cycle logging (washer/autoclave); expiry & recall; dispatch-to-OT traceability; per-set billing hooks | High — NABH-relevant, patient-safety adjacent | 2–3 weeks |
| G-2 | **Housekeeping & Facility** | Bed-status triggers, dashboard mentions | Task assignment board (zone/shift), cleaning checklists, turnaround SLA timers, inspection sign-off, integration with discharge workflow (dirty bed → clean) | Medium — impacts bed turnaround KPI | 1–2 weeks |
| G-3 | **Document Management (DMS)** | Templates, HelpCenter | Policy/SOP repository with versioning, review/approval cycle, dept-wise access, read-acknowledgement tracking, expiry reminders | Medium — NABH documentation requirement | 1–2 weeks |

### 4.2 Notes on the partial ratings
- None of the three gaps blocks the core clinical/billing workflow; they can be closed **in parallel** with deployment activities.
- G-1 (CSSD) is the only one with patient-safety and NABH-accreditation exposure; schedule it first.
- G-2 has the highest operational ROI (bed turnaround time directly affects IPD revenue).
- G-3 is mostly a CRUD + workflow module over existing file/consent infrastructure.

### 4.3 Deployment-side gaps
Deployment model (on-prem server, remotely controlled by MediQzy), data migration, and remote-operations requirements are analyzed in the companion document `HOSPITAL_OS_ONPREM_RAG_IMPLEMENTATION_PLAN.md` (its §4.2 identifies the Tenant Server Agent as the single architectural gap there).

---

## 5. Implementation Plan

### 5.1 Track 1 — Product gap closure (parallel with deployment)

| Sprint | Work | Deliverable | Exit criteria |
|---|---|---|---|
| S1 (wk 1–2) | **G-2 Housekeeping**: zone/shift task board, checklists, SLA timers; hook bed-status events from ADT/discharge | Housekeeping module v1 | Supervisor can assign & close tasks; dirty→clean bed transition visible on BedMap |
| S2 (wk 2–4) | **G-1 CSSD phase 1**: instrument master, tray/set assembly, sterilization cycle log, expiry | CSSD module v1 | Tray lifecycle (assemble → sterilize → dispatch → return) fully logged; recall list queryable |
| S3 (wk 4–6) | **G-1 CSSD phase 2** (dispatch-to-OT traceability, per-set billing hooks) + **G-3 DMS**: SOP repository, versioning, acknowledgement | CSSD v2 + DMS v1 | OT staff can trace any instrument set to its sterilization cycle; NABH SOP pack publishable with acknowledgements |

### 5.2 Track 2 — Deployment (see companion doc)
Discovery → server provisioning → data migration → training → go-live → hypercare, per proposal §7. The remote-control (Tenant Server Agent) build runs concurrently (companion doc §5).

### 5.3 Sequencing rationale
- Housekeeping first: smallest effort, visible KPI win during training/hypercare.
- CSSD spans two sprints because it needs instrument master data from the hospital (gather during Track 2 discovery).
- DMS last: content (SOPs) must come from the hospital's quality team anyway.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Hospital master data (instruments, SOPs, zones) arrives late | Collect templates during Track 2 discovery; modules ship with import wizards |
| CSSD scope creep (RFID/RTLS integration) | Phase 1 is barcode/manual logging; RFID deferred to post-go-live backlog |
| Parallel tracks overloading the team | G-2 and G-3 are small; only G-1 is two-sprint — assign a dedicated owner |
| NABH evidence expectations rise post go-live | DMS acknowledgement reports double as NABH training evidence |

---

## 7. Next Steps
1. Approve gap register (G-1..G-3) and effort estimates.
2. Start S1 (Housekeeping) immediately — no hospital dependencies.
3. Request CSSD instrument master template + SOP list from Mahalakshmi during discovery.
4. Re-run this RAG at each sprint exit; promote 🟡 → ✅ as gaps close.

---

## 8. References
- Proposal: `MediQzy_HospitalOS_Proposal_Mahalakshmi_Hospital.pdf` (§4 modules, §6 compliance, §7 implementation)
- Companion deployment RAG: `docs/architecture/HOSPITAL_OS_ONPREM_RAG_IMPLEMENTATION_PLAN.md`
- Evidence: files cited per-module in §3 (all paths verified in this repository)
