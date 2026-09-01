# Mediczy — Business Document Feasibility Study, Gap Analysis & Implementation Plan

> **Source document:** `docs/architecture/Below is a comprehensive busin.docx`
> **Audited codebase:** Mediczy (`/home/ubuntu/Mediczy`) — branch `main` @ `530166c`
> **Date:** 2026-08-27
> **Author:** Feasibility Engineering Review

---

## 0. Purpose

This document converts the business plan *"Hospital-Linked Healthtech Solutions for India — Multi-Model Approach (Tier 2/3 & Uttarakhand)"* into an engineering decision record. It answers three questions:

1. **Feasibility** — how mature is the existing codebase against each of the plan's 6 revenue models + the integrated Uttarakhand solution?
2. **Requirement availability gap** — precisely what exists, what is partial, and what is wholly greenfield, mapped to buildable features.
3. **Implementation plan** — a phased, dependency-ordered roadmap sized to the gaps, with success criteria and governance/regulatory guardrails.

The conclusion: the codebase is **ready to host Models 1, 2, 4 and 6** with modest integration, **Models 3 and 5 are feasible but require new self-contained modules**, and the **Uttarakhand MMU/drone logistics** and **locum specialist marketplace** are the only pure greenfield territory.

**Scope note:** this document also includes the **Hospital OS delivery track for Mahalakshmi Hospital** (§8) — a RAG (Requirements · Availability · Gaps)-based gap-closure and deployment implementation plan derived from the approved client proposal, which runs in parallel with the model roadmap above.

---

## 1. Executive Summary (TL;DR)

| Doc Model | Codebase Readiness | Feasibility | Effort | Business Priority |
|---|---|---|---|---|
| M1 — Tele-ICU / Specialty-as-a-Service | 🟢 Mostly exists | **High** | Low–Med | Primary entry (aligns with doc) |
| M2 — Hospital-at-Home | 🟢 Near-product | **High** | Low | High |
| M3 — Surgical Equipment-as-a-Service | 🔴 Greenfield | **Medium** | Med | Later (capex-heavy) |
| M4 — AI RCM & Claims Optimization | 🟢 Most mature | **High** | Low | Ship now |
| M5 — Central Sterile Processing & Logistics | 🔴 Greenfield | **Medium** | Med-High | Later (infra play) |
| M6 — Locum/Specialist Marketplace & 2nd Opinion | 🟡 Partial | **Medium–High** | Med | High (fastest revenue) |
| M7 — Integrated Uttarakhand Hub-and-Spoke | 🟡 Partial | **Medium** | High | Phased pilot |

> **Recommended entry sequence (lowest risk → highest):**
> `M4 (RCM) → M2 (Hospital-at-Home) → M1 (Tele-ICU) → M6 (Marketplace) → M3 (Equipment-as-a-Service) → M5 (Sterile Processing) → M7 (Uttarakhand grid)`

This matches the business plan's own advice ("fastest time to revenue" = marketplace; "commodity-ready" = RCM; "phased low-risk entry").

---

## 2. Codebase Baseline (What the platform already is)

- **Backend:** Node.js + Express (ESM), `server/routes/` (291 route files), services + controllers + repositories.
- **Frontend:** React + Vite + Tailwind (`client/src/`), typed pages under `pages/`, feature modules under `features/`, `api/`, `services/`.
- **DB:** PostgreSQL via `server/db/pgPool.js` (Sequelize for some domains).
- **Realtime / comms:** Agora RTC (video consults), FCM push, WhatsApp/Brevo, BullMQ + Redis async jobs.
- **AI:** Deep AI layer (LLM cascade, AI scribe, CDSS, emergency triage, health-risk cron) with a **mandatory SaMD governance layer** (quality gates, SHAP/LIME interpretability, model-change control, drift/bias monitors).
- **Specialty systems already present:**
  - ICU module (admissions, census, ventilator charts, drips, severity scoring, daily goals).
  - NEWS2 early-warning service + ambient deterioration.
  - RIS/PACS imaging with tele-radiology + second-opinion workflow, Orthanc bridge.
  - Insurance desk, claims engine, pre-auth engine, TPA integrations, ABDM, Ayushman.
  - Homecare booking, nurse booking, device/IoT telemetry, device AMC/monitoring.
  - Hospital multi-tenancy with hierarchical org model, corporate/TPA/lab/clinic tenants, subscriptions & wallet.
---

## 3. Feasibility Study

### 3.1 Model 1 — Tele-ICU & Specialty-as-a-Service (Primary Entry)

**Doc asks for:** 24/7 remote intensivist coverage from a command centre; AI early-warning (sepsis/respiratory); networked monitors/cameras per bed; protocols + nurse training; pay-per-use/revenue-share financing; HIS/EMR–pharmacy–lab integration.

**Codebase evidence:**
- `server/routes/icu.route.js` — admit/discharge ICU, census, ventilator charting, IV drips, daily goals, severity scores (SOFA/severity), ICU event log, summary.
- `client/.../doctor/RemoteHealthMonitoring.tsx` — **"ICU Command Center"** dashboard with **ICU Bedside Monitor components** + grid view of beds.
- `client/.../display/ICUBoardDisplay.tsx` — live board with **NEWS2** red/orange/yellow alert thresholds.
- `server/services/vitals-ews.service.js` — full **NEWS2** scoring (RR, SpO₂/O₂, systolic BP, pulse, temp, consciousness) + threshold breach alerts.
- `server/services/ambient-deterioration.service.js` — ambient deterioration detection.
- AI copilot layer map includes **ICU Copilot** with NEWS2 alerts, ventilator summary, sepsis bundle.
- `server/routes/device.route.js` + `telemetry.route.js` — IoT vitals ingestion + device/heartbeat monitoring.

**Gaps:**
- No PTZ camera / bedside audio-speaking orchestration tied to each ICU bed (needs a device bridge feeding the existing video + telemetry stack).
- No shared command-centre / cross-hospital ICU rostering (single-hospital scope today).
- No per-bed pay-per-use / revenue-share financing ledger.

**Feasibility: HIGH.** The core clinical + alerting + display is present; the gaps are orchestration and multi-tenant monetisation, not redesign.

---

### 3.2 Model 2 — Hospital-at-Home (Post-Acute & Chronic Care)

**Feasibility: HIGH (near-product).**

**Evidence:**
- `client/src/pages/HomecareBooking.tsx`, `client/src/pages/NurseBooking.tsx`, `client/src/pages/homecare/`, `client/src/pages/nurse/` — booking UIs.
- `server/routes/api-v1-homecare.js` + `server/routes/homecare/auth.routes.js` — service + auth.
- `client/src/pages/MyPrograms.tsx`, `ProgramDetail.tsx`, `ProgramJourney.tsx` — disease-specific programs.
- Device/IoT + telemetry + `apple-health.route.js` for remote/wearable vitals.

**Gap:** Episode-based pricing, 24/7 helpline funnel, and per-patient chronic subscription billing are partial and need a billing wrapper.

---

### 3.3 Model 3 — Surgical Equipment-as-a-Service

**Feasibility: MEDIUM (mostly greenfield).**

**Evidence / adjacency:**
- `server/routes/device.route.js` — device register/assign/heartbeat, **AMC renew**, revenue stats, monitoring. Closest reusable substrate.
- `server/routes/ot-scheduling.route.js`, `ot-rooms-admin.route.js` — OT infrastructure.
- `server/services/scm-par-reorder-cron.service.js` — supply/inventory; `dept/procurement.route.js`.

**Missing (greenfield):** equipment catalog, lease/rental contracts, pay-per-procedure usage billing / utilization>60%, technician dispatch, remote proctoring session.

---

### 3.4 Model 4 — AI-Powered Revenue Cycle & Claims Optimization

**Feasibility: HIGH (most mature here).**

**Evidence:**
- `server/routes/ai-revenue.route.js` — `/billing-gaps`, `/leakage-score`, `/denial-risk`, `/smart-orders`.
- `server/services/claims-rules-engine.service.js` — claim validation, room-rent advisory, pre-auth ceiling, docs-per-claim-type.
- `server/services/ai-preauth-engine.service.js` + `hmis-preauth.route.js` — pre-auth automation.
- `server/services/ai-revenue-intelligence.service.js` — revenue/denial intelligence; TPA routes + API kits; billing ledger bridge.
- Insurance-desk hardening in recent history.

**Gaps:** dedicated **success-fee ledger** and denial-prediction→workflow automation (partial). Low lift.

---

### 3.5 Model 5 — Central Sterile Processing & Surgical Logistics

**Feasibility: LOW–MEDIUM (greenfield).**

**Evidence:** only `CSSDLogin`, `DepartmentLoginPages`, dept staff layout, marketing asset-tracking claims, and OT scheduling exist. **No** instrument/tray module, RFID/RTLS event stream, per-tray billing, or logistics/quality chain.

**Feasibility note:** build as a single-city isolated pilot per the doc's own guidance.

---

### 3.6 Model 6 — B2B Marketplace for Locum Specialists & Tele-Radiology/Pathology

**Feasibility: MEDIUM–HIGH.**

**Evidence:**
- **Second opinion:** `DoctorServices` (`offersSecondOpinion`), second-opinion template, RIS second-opinion workflow.
- **Tele-radiology (strong):** `imaging-platform.route.js` (workflow/queue, MWL, triage, collab, VNA), `orthanc-webhook.route.js`, `dicom-modality.route.js`, `doctor-ris-referred.route.js`; AI triage.
- `hypergrid-marketplace.route.js` — app/plugin marketplace, **not** a specialist marketplace.
- `provider-network-bot.route.js` — provider-network agent, not an exchange.
---

### 3.7 Model 7 — Integrated Uttarakhand Hub-and-Spoke (Command Centre + MMU + Drone)

**Feasibility: MEDIUM (partial).**

**Existing:** command centre/tele-ICU, teleconsults, ABDM (`abdm.route.js`), Ayushman (`ayushman.route.js`), EHR, ambulances (`server/routes/ambulance/auth.routes.js`), offline-first **partial** (`migrations/cloud-mother-local-ai-nodes.sql` local AI nodes; offline scribe).

**Greenfield:**
- **Mobile Medical Unit** and **drone delivery** modules (physical/logistics).
- **Community/ASHA training content + enrolment**, HWC workflow.
- State-contract / NHM outcome-based payment modelling.

---

## 4. Requirement Availability Gap Analysis

### 4.1 Gap classification

| Class | Meaning |
|---|---|
| 🟢 **Present** | Functionality already exists; reuse or minor glue |
| 🟡 **Partial** | Core exists; missing one or more features/monetisation |
| 🔴 **Greenfield** | No meaningful code path; new module required |

### 4.2 Consolidated gap matrix (by requirement)

| Requirement (from doc) | Class | Codebase anchor (exists) | Missing piece (build) |
|---|---|---|---|
| ICU admission/overview (M1) | 🟢 | `icu.route.js`, `icu.service.js` | — |
| ICU risk (sepsis/respiratory) | 🟢 | `vitals-ews.service.js`, `ambient-deterioration.service.js` | — |
| ICU display / command centre | 🟢 | `RemoteHealthMonitoring.tsx`, `ICUBoardDisplay.tsx` | cross-hospital command-centre state |
| Networked bed monitors/cameras | 🟡 | `device.route`, `telemetry.route` | PTZ camera + bedside audio bridge |
| Revenue-share / pay-per-use ICU billing | 🟡 | `billing.route` | ICU bed-day ledger + share settlement |
| Hospital-at-Home service | 🟢 | `homecare`, `nurse`, `HomecareBooking` | episode + 24/7 helpline wrapper |
| Chronic care programs | 🟢 | `MyPrograms`, `ProgramJourney` | chronic subscription billing |
| Wearable / RPM vitals | 🟢 | `apple-health`, telemetry, device | — |
| Equipment lease/rental catalog | 🔴 | `device` (AMC) | **lease/rental + per-procedure billing** |
| RCM / claims / pre-auth | 🟢 | `ai-revenue.route`, `claims-rules-engine`, `ai-preauth` | success-fee ledger, denial modelling |
| Sterile processing workflow | 🔴 | — | **instrument/tray + RFID event + per-tray billing** |
| Surgical logistics + tracking | 🔴 | `ot-scheduling`, `scm` | **delivery pipeline, asset tracking** |
| Second opinion | 🟢 | DoctorServices, imaging platform | — |
| Locum marketplace | 🔴 | `hypergrid-marketplace` (unrelated) | **specialist registry + commission ledger** |
| Tele-radiology / pathology | 🟢 | `imaging-platform`, `orthanc-webhook` | — |
| Command centre (hub) | 🟢 | `CommandCenterRouter`, OT command centre | — |
| Mobile Medical Unit | 🔴 | `ambulance` | **logistics + consults** |
| Drone delivery | 🔴 | — | **logistics integration** |
| Offline-first client | 🟡 | local AI nodes migration | client offline/batch-sync |
| ASHA community training/enrol | 🔴 | — | **training + tracking** |
| DPDP / SaMD compliance | 🟢 | SaMD governance layer, consent mgmt | keep aligned |

### 4.3 Effort summary

| Track | Effort | Reuse-forward |
|---|---|---|
| Tele-ICU monetisation + camera bridge | **Med** | Yes (glue) |
| Hospital-at-Home billing | **Low** | Yes |
| Equipment-as-a-Service | **Med–High** | Some (device+OT) |
| RCM success-fee + denial | **Med** | Mostly |
| Sterile Processing & logistics | **High** | Low |
| Locum marketplace | **Med–High** | Some |
| Uttarakhand MMU/drone + community | **High** | Low |
---

## 5. Implementation Plan (Phased Roadmap)

### Guiding principles
- **Ships small.** Each phase yields a usable vertical slice (doc's "minimal, phased entry").
- **Reuse-forward.** Bridge the existing modules above; never re-plumb `billing`, `device`, `imaging`, or `ai-governance`.
- **SaMD-compliant by default.** Any AI influencing a clinical decision must route through the AI governance layer.
- **Monetisation is first-class.** Every module ships with its billing/settlement/ledger link from Day 1.

---

### Phase 0 — Foundation & Monetisation Infra (shared unlocker)

**Duration:** 2–4 weeks · **Feasibility:** High · **Depends on:** nothing new

**Goals:**
1. **Multi-tenant revenue ledger** — generic `revenue_share_ledger` + commission/fee abstraction that M1, M3, M6, M7 write to (reuse/extend `billing-ledger-bridge`, subscription/wallet).
2. **Revenue-share / pay-per-use billing config** for ICU beds and HomeCare episodes.
3. **SaMD governance alignment** for the two greenfield AI prediction paths (equipment, marketplace).

**Exit criteria:** one revenue-share settlement created, reviewed and posted for an ICU bed-day; entries auditable.

---

### Phase 1 — Revenue Cycle (M4) + Hospital-at-Home (M2) — "ship now"

**Duration:** 2–4 weeks · **Feasibility:** High · **Depends on:** Phase 0

**Deliverables:**
- **M4:** success-fee ledger (3–5% of recovered revenue); denial→workflow in `ai-revenue`/`claims`; dashboard KPIs.
- **M2:** per-episode fee for HomeCare, 24/7 helpline hook, chronic subscription billing.

**Success metrics (doc §5.2):** ALOS reduction, hospital willingness to continue, nursing retention.

---

### Phase 2 — Tele-ICU scale (M1) + Specialty-as-a-Service expansion

**Duration:** 4–8 weeks · **Feasibility:** High · **Depends on:** Phase 0–1

**Deliverables:**
1. **Bed-side camera/audio bridge** — PTZ + mic orchestration integrated with the existing video pipeline, keyed per ICU bed (reuse device registry + Agora session).
2. **Multi-org ICU** view (partner hospitals) with shared command-centre rosters.
3. **Revenue-share settlement** per hospital + per-bed tech subscription layer.

**Success (doc §5.1):** >20% mortality/ALOS improvement, timely payments, retention >80%.
---

### Phase 3 — Specialist Marketplace & Second-Opinion Platform (M6)

**Duration:** 5–9 weeks · **Feasibility:** Medium–High · **Depends on:** Phase 0

**Deliverables:**
1. **Specialist registry** (verified, from partner hospitals + existing provider-network data).
2. **Booking + tele-consult + tele-radiology/pathology** (accelerated by existing imaging/second-opinion).
3. **Commission & subscription billing** — 15–20% commission → Phase 0 ledger; hospital subscription; GMV take-rate.
4. **Tele-pathology** (new) modelled on the imaging workflow.

**Exit criteria (doc §5.2):** 50+ successful matches in 3 months; commission-positive unit economics.

---

### Phase 4 — Surgical Equipment-as-a-Service (M3)

**Duration:** 6–10 weeks · **Feasibility:** Medium · **Depends on:** Phase 0 lease mechanism

**Deliverables:**
1. Equipment catalog, lease/rental contracts, QR/bundle identity (extend `device` + AMC).
2. Per-procedure usage billing, technician dispatch, remote proctoring (reuse Agora).
3. Utilization dashboards (>60% target; per-case margin positive).

**Boundary:** start with ONE equipment type (§4.3); keep capex as contract/lease only in-app.

---

### Phase 5 — Central Sterile Processing & Logistics (M5)

**Scope:** 10–16 weeks · **Feasibility:** Medium · **Depends on:** Phase 0; Phase 4 device-tracking patterns

**Deliverables:**
1. **Instrument/tray workflow** — collect → sterilize → QC → dispatch → track per tray (reuse OT + supply).
2. **RFID/BLE asset track** (concierge pilot site).
3. **Per-tray billing** via Phase 0 ledger; **audit/QC** chain for infection control.

**Success:** facility utilization >50%, zero infection events, per-tray revenue positive.

---

### Phase 6 — Integrated Uttarakhand Grid (M7) — strategic pilot

**Scope:** 9+ months, staged · **Feasibility:** Medium · **Depends on:** earlier phases

**Deliverables:**
1. **Hub-and-spoke** — command centre + district spokes (using tele-ICU/RIS backbone).
2. **Offline-first client** — batch-sync, local AI nodes (`cloud-mother-local-ai-nodes`), conflict resolution.
3. **Mobile Medical Unit** — route/availability, on-kit vitals, consult (extends `ambulance`).
4. **Drone logistics** — integrate vendor for last-mile; pilot/triage smoke test initially; contracting is the real risk.
5. **Community/ASHA training** + offline app; **ABDM/Ayushman** alignment + outcome-based payment model.

**Success (doc §5.3):** reduced referrals/mortality, patient satisfaction, NHM funding claim successful.

---

### Phase 7 — Hardening, Observability & Scale

- Reliability: queue health, redundancy (satellite/5G), offline fault-tolerance, circuit breakers.
- Fraud/audit: every ledger + workflow state audited for DPDP compliance.
- Multi-tenancy boundaries extended to provider/hospital-partner boundaries.
---

## 6. Risks, Dependencies & Governance

| Risk | Mitigation |
|---|---|
| Greenfield M3/M5 capex/asset risk | Isolated pilots; AI always behind SaMD gate |
| Specialist availability (M1/M6) | Vended contractual coverage; NMC telemedicine guidance |
| Poor connectivity (M7) | Local AI nodes, offline-first, redundant internet |
| Government payment delays | Outcome-based contracts, phased billing, reserve |
| Data privacy (DPDP) | Encryption, access control, consent management + cross-tenant audit |
| Medical-device rules (CDSCO) | Software classification via SaMD governance; file where required |

**Non-negotiable:** AI influencing clinical decisions must route through the AI governance layer (quality gate + interpretability + model card + change control). See `CLAUDE.md`.

---

## 7. Suggested Next Steps

1. **Approve Phase 0** (revenue ledger) — small and the key unlocker.
2. **Greenlight M4 + M2 now** (highest value-to-effort, no new module).
3. **Stand up Phases 1/2/3** backend + single pilot per gap.
4. **Issue separate PoCs for M3 & M5.**
5. **Do NOT begin M7 drone/MMU** until Phases 1–3 land.

---

## 8. Hospital OS Implementation Plan — Mahalakshmi (RAG-Based Gap Closure & Deployment)

This section incorporates the client-delivery implementation plan derived from the approved **MediQzy Hospital OS proposal for Mahalakshmi Hospital**. It uses the RAG format (Requirements · Availability · Gaps) and runs **in parallel** with the M1–M7 model roadmap in §5.

> Full module-level analysis: `docs/architecture/HOSPITAL_OS_MODULE_RAG_ANALYSIS.md`
> Deployment-side analysis (on-prem server, remote control plane): `docs/architecture/HOSPITAL_OS_ONPREM_RAG_IMPLEMENTATION_PLAN.md`

### 8.1 Requirement availability summary

Of the **41 modules** the proposal commits across categories A–H, **37 (90%) are fully implemented** in this codebase; **3 are partial**; none are wholly missing at category level. Compliance requirements (ABDM/ABHA, HL7/FHIR, DPDP 2023, RBAC/audit) are all satisfied in code.

| Category | Modules | Available | Partial |
|---|---|---|---|
| A — Patient Access & Front Office | 5 | 5 ✅ | — |
| B — Clinical & Nursing | 7 | 7 ✅ | — |
| C — Diagnostics & OT | 4 | 4 ✅ | — |
| D — Pharmacy & Materials | 5 | 4 ✅ | CSSD 🟡 |
| E — Billing, Insurance & Finance | 5 | 5 ✅ | — |
| F — HR & Administration | 4 | 4 ✅ | — |
| G — Support Services | 4 | 2 ✅ | Housekeeping 🟡, DMS 🟡 |
| H — Quality, Communication & Analytics | 7 | 7 ✅ | — |

### 8.2 Gap register

| ID | Module | What exists | What is missing | Severity | Effort |
|---|---|---|---|---|---|
| G-1 | **CSSD Management** | Dept login shell only | Instrument registry; tray/set assembly; sterilization cycle logging (washer/autoclave); expiry & recall; dispatch-to-OT traceability; per-set billing hooks | **High** — NABH-relevant, patient-safety adjacent | 2–3 weeks |
| G-2 | **Housekeeping & Facility** | Bed-status triggers, dashboard mentions | Task assignment board (zone/shift), cleaning checklists, turnaround SLA timers, inspection sign-off, discharge-workflow integration (dirty bed → clean) | Medium — bed-turnaround KPI impact | 1–2 weeks |
| G-3 | **Document Management (DMS)** | Templates, HelpCenter | Policy/SOP repository with versioning, review/approval cycle, dept-wise access, read-acknowledgement tracking, expiry reminders | Medium — NABH documentation requirement | 1–2 weeks |

### 8.3 Implementation plan — two parallel tracks

**Track 1 — product gap closure**

| Sprint | Work | Deliverable | Exit criteria |
|---|---|---|---|
| S1 (wk 1–2) | **G-2 Housekeeping**: zone/shift task board, checklists, SLA timers; hook bed-status events from ADT/discharge | Housekeeping module v1 | Supervisor assigns & closes tasks; dirty→clean bed transition visible on BedMap |
| S2 (wk 2–4) | **G-1 CSSD phase 1**: instrument master, tray/set assembly, sterilization cycle log, expiry | CSSD module v1 | Tray lifecycle (assemble → sterilize → dispatch → return) fully logged; recall list queryable |
| S3 (wk 4–6) | **G-1 CSSD phase 2** (dispatch-to-OT traceability, per-set billing hooks) + **G-3 DMS**: SOP repository, versioning, acknowledgement | CSSD v2 + DMS v1 | OT staff trace any instrument set to its sterilization cycle; NABH SOP pack publishable with acknowledgements |

**Track 2 — deployment** (per proposal §7): discovery → server provisioning → data migration → training → go-live → hypercare. The remote-control (Tenant Server Agent) build runs concurrently — see `HOSPITAL_OS_ONPREM_RAG_IMPLEMENTATION_PLAN.md` §5.

**Sequencing rationale:** Housekeeping first (smallest effort, visible KPI win during hypercare); CSSD spans two sprints because instrument master data must come from the hospital (gathered during Track 2 discovery); DMS last because SOP content must come from the hospital's quality team.

### 8.4 Synergy with the model roadmap (§5)

- **G-1 CSSD is the seed of Phase 5 (M5 Central Sterile Processing)** — the instrument registry, tray lifecycle and sterilization-cycle logging built here become the foundation for the multi-hospital sterile-processing model.
- Housekeeping (G-2) and DMS (G-3) strengthen the NABH/quality story that supports Models 1, 2 and 6 sales.
- The Mahalakshmi on-prem deployment track productionizes the tenant control plane that Models 1/2/6 rely on for remote operations.

---

## 9. References & Evidence Index

- `client/src/pages/doctor/RemoteHealthMonitoring.tsx` — ICU command centre.
- `client/src/pages/display/ICUBoardDisplay.tsx` — NEWS2 ICU board.
- `server/routes/icu.route.js`, `server/services/icu.service.js` — ICU clinical ops.
- `server/services/vitals-ews.service.js`, `ambient-deterioration.service.js` — NEWS2/deterioration.
- `server/routes/device.route.js`, `telemetry.route.js`, `apple-health.route.js` — IoT/RPM.
- `server/routes/ai-revenue.route.js`, `claims-rules-engine.service.js`, `ai-preauth-engine.service.js` — RCM/claims.
- `client/src/pages/{HomecareBooking,NurseBooking,MyPrograms,ProgramDetail,ProgramJourney}.tsx`, `api-v1-homecare.js`, `homecare/auth.routes.js` — Hospital-at-Home.
- `server/routes/imaging-platform.route.js`, `orthanc-webhook.route.js`, `dicom-modality.route.js`, `doctor-ris-referred.route.js` — tele-radio/2nd opinion.
- `client/src/pages/doctor/DoctorServices.tsx` — 2nd-opinion settings.
- `server/routes/hypergrid-marketplace.route.js` — (unrelated) plugin marketplace.
- `server/routes/ot-scheduling.route.js`, `ot-rooms-admin.route.js`, `scm-...cron.service.js`, `dept/procurement.route.js` — OT/supply adjacency.
- `server/migrations/cloud-mother-local-ai-nodes.sql` — offline AI nodes.
- `server/routes/ambulance/auth.routes.js`, `abdm.route.js`, `ayushman.route.js` — Uttarakhand adjacency.
- `docs/architecture/HOSPITAL_OS_MODULE_RAG_ANALYSIS.md` — module-level RAG for the Mahalakshmi Hospital OS proposal (§3 availability evidence, §4 gap register).
- `docs/architecture/HOSPITAL_OS_ONPREM_RAG_IMPLEMENTATION_PLAN.md` — deployment-side RAG (on-prem control plane, Tenant Server Agent).
- `MediQzy_HospitalOS_Proposal_Mahalakshmi_Hospital.pdf` — client proposal (§4 modules, §6 compliance, §7 implementation).

---

*End of feasibility & implementation planning document.*

**Gaps:** specialist registry + locum availability, commission/revenue-split, per-consult billing, hospital subscription, GMV take-rate ledger.