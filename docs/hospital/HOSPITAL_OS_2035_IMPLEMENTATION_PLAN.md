# Mediczy Hospital OS 2035 — Implementation Plan

| Field | Value |
|-------|-------|
| **Document ID** | MED-HOSP-OS-2035-001 |
| **Version** | 1.0 |
| **Date** | 2026-07-05 |
| **Owner** | AI CTO |
| **Status** | ACTIVE — master delivery plan |
| **Related** | `SMART_HOSPITAL_OS_VISION.md`, `MEDIQZY_HOSPITAL_OS_MASTER_GAP_IMPLEMENTATION.md`, `SAMD_READINESS_SCORECARD.md` |

---

## 1. Executive summary

This plan transforms Mediczy from a **modular AI-native HMIS** into a **Hospital Operating System (2030–2040 vision)** where:

- One **Hospital Copilot** serves every clinician (replacing 26 fragmented copilots at the UX layer)
- **Digital twins** model hospital operations and individual patients
- **Ambient documentation** flows into an **approval inbox** (human-final)
- **Voice-first** commands draft orders and tasks — never auto-execute high-risk actions
- **Command center AI** recommends actions before bottlenecks escalate

**Governance principle:** AI proposes → human approves → system executes → audit logs immutable.

---

## 2. Architecture

```
Experience Layer     Hospital Copilot · Voice Shell · Mobile · Displays · Smart Rooms
        ↓
Intelligence Layer   Copilot Orchestrator · Knowledge Graph · Predictive Models · What-If Simulator
        ↓
Twin Layer           Hospital Digital Twin · Patient Digital Twin
        ↓
Automation Layer     Ambient Docs · Approval Inbox · Task Orchestration · ED Forecast · Journey Optimizer
        ↓
Data Plane           EHR · FHIR · HL7 · DICOM · IoT MQTT · Event Bus
        ↓
Control Plane        SaMD Governance · Zero Trust · RLS · Audit · Tenant Isolation
```

### API surface (new)

| Base path | Purpose |
|-----------|---------|
| `/api/v3/hospital-os` | Unified Hospital OS APIs |
| `/api/v3/hospital-os/copilot` | Single hospital copilot chat |
| `/api/v3/hospital-os/approvals` | Approval inbox (draft orders, notes, letters) |
| `/api/v3/hospital-os/twins/patient/:id` | Patient digital twin |
| `/api/v3/hospital-os/twins/hospital` | Hospital operational twin |
| `/api/v3/hospital-os/simulate` | What-if scenarios |
| `/api/v3/hospital-os/nurse/handover` | AI shift handover brief |
| `/api/v3/hospital-os/command-center/ai` | AI recommendations |
| `/api/v3/hospital-os/translator` | Clinical translator |
| `/api/v3/hospital-os/voice/draft` | Voice command → draft action |
| `/api/v3/hospital-os/journey` | Personalized patient journey |
| `/api/v3/hospital-os/ed/forecast` | Predictive ED |
| `/api/v3/hospital-os/research` | Governed research hub |
| `/api/v3/hospital-os/knowledge-graph` | Semantic graph queries |

---

## 3. Twenty pillars — feature specification & implementation status

### Pillar 1 — AI Hospital Copilot

**Feature:** Single assistant for clinical questions, patient lookup, discharge letters, lab trends, care pathways, cross-department tasks.

| Component | Implementation | Files |
|-----------|----------------|-------|
| Unified chat API | **Wave 1** | `server/services/hospital-os/hospital-copilot.service.js` |
| Role-aware context | **Wave 1** | Enriches from `clinical-workspace.service.js` |
| Module routing | **Wave 1** | Delegates to `multi-agent-orchestrator` with `forceAgent` by intent |
| Frontend shell | **Wave 1** | `client/src/pages/hmis/HospitalCopilot.tsx` |
| SaMD gates | Existing | `sib-ai-guard.middleware.js`, quality gates |

**Acceptance criteria:**
- [ ] Doctor can ask "summarize patient 123" and receive workspace summary
- [ ] CFO can ask "bed occupancy trend" via analyst agent
- [ ] All responses cite whether action requires approval

---

### Pillar 2 — Digital Twin Hospital

**Feature:** Live virtual replica for patient flow, ED surges, beds, OT, staffing, equipment.

| Component | Wave | Status |
|-----------|------|--------|
| Twin registry | 1 | Extends `hypergrid-twins.service.js` |
| Live state sync | 1 | `hospital-twin-simulator.service.js` pulls analytics + beds |
| What-if simulation | 2 | Discrete-event scenarios in simulator |
| Admin UI | 2 | Command center simulation tab |

**Scenarios (Wave 2):**
- `ed_surge_20pct` — +20% ED arrivals for 4 hours
- `close_ot` — OT room offline
- `icu_overflow` — ICU at 95% capacity

---

### Pillar 3 — AI Patient Digital Twin

**Feature:** Per-patient virtual model: history, genetics, wearables, labs, imaging, lifestyle → risk + outcome simulation.

| Data source | Wave | Service |
|-------------|------|---------|
| Clinical workspace | 1 | `patient-twin.service.js` |
| HyperGrid patient twin | 1 | `upsertTwin('patient', ...)` |
| Wearables | 1 | `apple-health`, BLE routes |
| Labs time-series | 1 | Lab results aggregation |
| Genomics/PGx | 3 | `roadmap-intelligence` PGx (extend) |
| Outcome simulation | 2 | `what-if-simulator.service.js` |

---

### Pillar 4 — Autonomous Clinical Documentation

**Feature:** Ambient listen → structured notes → Rx draft → insurance → discharge pack → clinician sign-off.

| Step | Wave | Existing | Gap |
|------|------|----------|-----|
| STT | 1 | `offline-scribe` | — |
| Structured note | 1 | Scribe pipeline | — |
| Rx draft | 1 | AI scribe | Wire to approval inbox |
| Insurance packet | 2 | Billing routes | Auto-generate draft |
| Discharge pack | 1 | Template discharge | LLM discharge in approval flow |
| Sign-off | 1 | **Approval inbox** | `approval-inbox.service.js` |

---

### Pillar 5 — Hospital Command Center + AI

**Feature:** Real-time ops hub with AI recommendations.

| Tile | Wave | Backend |
|------|------|---------|
| Live snapshot | Done | `analytics.service.js` |
| AI recommendations | 1 | `command-center-ai.service.js` |
| Predictive alerts | 2 | ED forecast + bed forecast |

---

### Pillar 6 — Smart Patient Rooms

**Feature:** Falls, sleep, mobility, distress, environment, voice, med reminders.

| Component | Wave | Notes |
|-----------|------|-------|
| MQTT device bridge | Done | `device-alarm-bridge.service.js` |
| Room edge gateway | 3 | New IoT room profile |
| Fall detection | 4 | Partner CV / mmWave |
| Voice bedside | 2 | Patient-safe copilot mode |

---

### Pillar 7 — AI Nurse Assistant

**Feature:** Prioritization, deterioration, care tasks, handover summaries.

| Feature | Wave | Service |
|---------|------|---------|
| Patient prioritization | 1 | NEWS2 + overdue tasks |
| Shift handover SBAR | 1 | `nurse-handover.service.js` |
| Deterioration watch | 1 | `vitals-ews.service.js` (existing) |

---

### Pillar 8 — Predictive Emergency Department

**Feature:** Forecast volume, diagnoses, specialists, beds, blood, imaging.

| Model | Wave | Service |
|-------|------|---------|
| Hourly arrival forecast | 1 | `ed-forecast.service.js` (historical + heuristics) |
| ML demand model | 3 | Train on `er_visits` time series |

---

### Pillar 9 — Autonomous Pharmacy

**Feature:** Robotic dispense, inventory prediction, interaction checks at dispense.

| Step | Wave | Status |
|------|------|--------|
| Interaction at dispense | 1 | Wire CDSS to pharmacy route |
| Inventory prediction | 2 | SCM PAR + pharmacy analytics |
| Robotics gateway | 4 | Robot OS abstraction |

---

### Pillar 10 — Intelligent Operating Theatre

| Feature | Wave | Status |
|---------|------|--------|
| OT scheduling + checklist | Done | `ot-scheduling.service.js` |
| Voice OT notes | 1 | Scribe + approval inbox |
| Instrument recognition | 4 | CV partner |

---

### Pillar 11 — AR/VR Clinical Support

| Feature | Wave | Status |
|---------|------|--------|
| Remote proctoring | 2 | LiveKit (existing) |
| Surgical navigation | 4 | Partner integration |

---

### Pillar 12 — AI Hospital Translator

| Feature | Wave | Service |
|---------|------|---------|
| Voice/text translation | 1 | `translator.service.js` |
| Medical glossary | 2 | Terminology service + RAG |

---

### Pillar 13 — Continuous Health Monitoring (post-discharge)

| Feature | Wave | Status |
|---------|------|--------|
| Wearable ingest | Done | Apple Health, BLE |
| Post-discharge alerts | 2 | Patient twin + escalation rules |

---

### Pillar 14 — Hyper-Personalized Patient Journey

| Feature | Wave | Service |
|---------|------|---------|
| Journey optimizer | 1 | `journey-optimizer.service.js` |
| Appointment clustering | 2 | Scheduling engine |

---

### Pillar 15 — Voice-First Hospital

| Command tier | Behavior | Wave |
|--------------|----------|------|
| T0 Read | Execute immediately | 1 |
| T1 Draft | Approval inbox | 1 |
| T2 Confirm | 60s confirm window | 2 |
| T3 Physician-only | Block for non-doctor | 1 |

**Tools added:** `draft_lab_order`, `draft_imaging_order`, `notify_clinical_team`, `show_icu_admissions`

---

### Pillar 16 — AI Workforce Management

| Feature | Wave | Service |
|---------|------|---------|
| Shift gap analysis | 2 | `workforce-ai.service.js` |
| Auto scheduling | 3 | HR integration |

---

### Pillar 17 — Drone & Robot Integration

| Feature | Wave | Status |
|---------|------|--------|
| Robot gateway API | 4 | `robot-gateway.service.js` (stub) |
| AGV pilot | 4 | Partner |

---

### Pillar 18 — AI Medical Research Hub

| Feature | Wave | Service |
|---------|------|---------|
| Trial matching | 1 | `research-hub.service.js` |
| De-identified cohorts | 3 | Separate trust zone |

---

### Pillar 19 — Hospital Knowledge Graph

| Feature | Wave | Service |
|---------|------|---------|
| Graph edges table | 1 | `knowledge-graph.service.js` |
| Patient subgraph | 1 | Auto-build from chart |
| Guideline links | 2 | CDSS + RAG |

---

### Pillar 20 — AI What-If Simulator

| Feature | Wave | Service |
|---------|------|---------|
| Treatment scenarios | 1 | `what-if-simulator.service.js` |
| ICU discharge timing | 2 | Twin + rules |
| Evidence citations | 2 | RAG + guidelines |

---

## 4. Data model (Wave 1 tables)

```sql
hospital_os_events          -- clinical + ops event bus
hospital_os_approvals       -- human approval inbox
hospital_os_kg_nodes        -- knowledge graph nodes
hospital_os_kg_edges        -- knowledge graph edges
hospital_os_simulations     -- what-if / hospital twin runs
hospital_os_journey_plans   -- personalized journey
hospital_os_voice_drafts    -- voice → draft actions
```

Migration: `server/migrations/hospital-os-2035.migration.js`

---

## 5. Delivery waves

### Wave 1 (2026 Q3) — **Trusted AI Hospital** ← current sprint

- [x] Master plan document
- [ ] Hospital OS services + routes
- [ ] Unified Hospital Copilot
- [ ] Approval inbox
- [ ] Knowledge graph v1
- [ ] Patient + hospital twin services
- [ ] What-if simulator v1
- [ ] Nurse handover AI
- [ ] Command center AI recommendations
- [ ] Clinical translator
- [ ] Voice draft orders
- [ ] ED forecast heuristics
- [ ] Journey optimizer v1
- [ ] Research hub trial matching
- [ ] Brain tools + agent allowlists
- [ ] Frontend Hospital Copilot page

### Wave 2 (2026 Q4 – 2027 Q2) — Predictive Hospital

- Hospital twin simulation UI
- Post-discharge monitoring escalation
- MFA / zero-trust hardening
- Pharmacy CDSS at dispense
- ML ED forecast

### Wave 3 (2027 – 2029) — Autonomous Operations

- Smart room pilots
- Workforce AI scheduling
- Genomics twin integration
- Robotics gateway

### Wave 4 (2030 – 2035) — Physical + Spatial Hospital

- Drone/AGV logistics
- AR surgical navigation partners
- Population health twin

---

## 6. SaMD & compliance requirements

Every clinical AI output in Hospital OS must:

1. Pass `qualityGates.checkXxx()` where applicable
2. Emit confidence via `interpretabilityService.computeConfidenceScore()`
3. Log to `ai_quality_gate_log`
4. Land in **approval inbox** for T1+ actions
5. Never auto-apply diagnostic labels without physician review

---

## 7. Testing strategy

| Layer | Tests |
|-------|-------|
| Unit | `server/__tests__/hospital-os.test.js` |
| Integration | `server/scripts/qa/hospital-os-smoke.mjs` |
| E2E | `tests/e2e/hospital-copilot.spec.ts` |
| Prod | Extend `smoke-test-prod.sh` with hospital-os health |

---

## 8. Success metrics

| Metric | Target (Wave 1) |
|--------|-----------------|
| Copilot response latency (p95) | < 8s |
| Approval inbox adoption | 50% of voice drafts reviewed within 1h |
| Nurse handover generation | < 5s |
| Command center AI actions | 3+ recommendations per snapshot |
| SaMD gate pass rate | > 99% for triage/drug checks |

---

*This document is the single source of truth for Hospital OS 2035 delivery. Update version on each wave completion.*
