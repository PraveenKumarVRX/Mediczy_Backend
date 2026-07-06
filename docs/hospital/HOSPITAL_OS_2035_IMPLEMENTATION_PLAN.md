# Mediczy Hospital OS 2035 — Implementation Plan

| Field | Value |
|-------|-------|
| **Document ID** | MED-HOSP-OS-2035-001 |
| **Version** | 1.1 |
| **Date** | 2026-07-05 |
| **Owner** | AI CTO |
| **Status** | ACTIVE — master delivery plan |
| **Related** | `SMART_HOSPITAL_OS_VISION.md`, `MEDIQZY_HOSPITAL_OS_MASTER_GAP_IMPLEMENTATION.md`, `MEDIQZY_CAREOS_VISION.md`, `CAREOS_ECOSYSTEM_ARCHITECTURE.md`, `CAREOS_PLATFORM_ROADMAP.md`, `HEALTHOS_ALL_PHASES_IMPLEMENTATION.md`, `SAMD_READINESS_SCORECARD.md` |

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
- [ ] **Frontend Phase 0** — ClinicalShell + unified nav (see §9)
- [ ] **Frontend Phase 1** — AI Care Team + workspace tab extraction (see §9)

### Wave 2 (2026 Q4 – 2027 Q2) — Predictive Hospital

- Hospital twin simulation UI
- Post-discharge monitoring escalation
- MFA / zero-trust hardening
- Pharmacy CDSS at dispense
- ML ED forecast
- **Frontend Phase 2** — Command Center realtime, family portal, clinical playback (see §9)

### Wave 3 (2027 – 2029) — Autonomous Operations

- Smart room pilots
- Workforce AI scheduling
- Genomics twin integration
- Robotics gateway
- **Frontend Phase 3** — Federation console, marketplace, research hub (see §9)

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

## 9. Frontend implementation plan (HealthOS / Living Patient Workspace)

**Audience:** AI CTO, UX research, UI design, frontend engineering  
**Scope:** React/Vite client (`client/src/`) — pages, layouts, components, routes  
**Design north star:** Every clinician opens one patient and sees **human + AI care teams** in a single Living Patient Workspace. Hospital ops, intelligence, and collaboration are **modes of one screen**, not separate apps.

**Brand:** Mediqzy — *The AI-Native Healthcare Operating System* · Product line: **HealthOS**  
**Visual system:** Teal primary (`client/src/config/brand.ts`), Plus Jakarta Sans, shadcn/ui (`components/ui/`), dark mode for command surfaces

### 9.1 Current frontend baseline (as of 2026-07-05)

| Area | Status | Key paths |
|------|--------|-----------|
| HMIS / HealthOS pages | 26 screens in `client/src/pages/hmis/` | Shared via `portalClinicalRoutes.tsx` |
| Living Patient Workspace | Exists — monolithic | `hmis/LivingPatientWorkspace.tsx` |
| Legacy inpatient workspace | Coexists | `hmis/InpatientWorkspace.tsx` → consolidate |
| Command Center | Exists — standalone | `hmis/CommandCenter.tsx` (no `HospitalLayout`) |
| Hospital Copilot | Exists | `hmis/HospitalCopilot.tsx` |
| Module copilots | 26 dept widgets | `module-copilot.service.ts`, floating in layouts |
| Routes | Portal-native (`/hospital`, `/doctor`, `/nurse`) | `/hmis/*` deprecated → `HmisLegacyRedirect` |
| Navigation | **Fragmented** (3 models) | `HospitalSidebar`, `HospitalOSHub`, `HospDeptLayout` |

**UX debt to fix in Phase 0:**
- Two workspace UIs (`InpatientWorkspace` vs `LivingPatientWorkspace`)
- HMIS pages lack shared clinical shell (jarring back-button standalone chrome)
- HealthOS routes missing from doctor sidebar
- Broken OS Hub link: `/hospital/hospital-copilot` → should be `/hospital/copilot`
- AI split across ModuleCopilot, HospitalCopilot, and AI Brain — no unified patient copilot
- No AI Care Team roster UI; no SaMD confidence/gate UI on HealthOS AI outputs

### 9.2 Personas & jobs-to-be-done

| Persona | Primary job | Target experience |
|---------|-------------|-------------------|
| Attending physician | Understand patient in <30s; decide next action | One workspace: AI briefing + timeline + pathway |
| Nurse | Execute tasks, document vitals, escalate | Ops-first mode: tasks + vitals + alerts |
| ICU intensivist | Monitor deterioration continuously | Monitoring Agent alerts in workspace + ICU board link |
| Hospital admin / COO | See bottlenecks; act on capacity | Live command center with drill-down |
| Specialist (MDT) | Join case, give opinion, leave | MDT inbox + one-click video join |
| Family member | Know progress safely | Consent-gated family portal |
| Medical director | Trust AI outputs | SaMD badges + confidence on every AI artifact |

### 9.3 Layout system (build first)

#### 9.3.1 `ClinicalShell` (NEW)

**File:** `client/src/layouts/ClinicalShell.tsx`

Persistent patient context bar + left context rail + main content + optional copilot drawer.

```
┌─────────────────────────────────────────────────────────────┐
│ [← Back]  Patient: Name · MRN · Location  [Acuity] [Video]  │
├──────────┬──────────────────────────────────────────────────┤
│ Context  │  Main (workspace tab / child route)                │
│ rail     │                                                  │
│ Overview │                                                  │
│ Timeline │                                                  │
│ Team     │                                                  │
│ AI Team  │                                                  │
│ Tasks    │                                                  │
│ Pathway  │                                                  │
│ MDT      │                                                  │
│ Family   │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

**Wraps:** All Living Patient Workspace tabs and child routes under `/:portal/patient/:id/healthos/*`

#### 9.3.2 `CommandCenterShell` (NEW)

**File:** `client/src/layouts/CommandCenterShell.tsx`

Full-bleed dark ops UI: zone filters (ED, ICU, OT, Wards), KPI grid, live event feed, AI recommendations drawer.

#### 9.3.3 `FamilyPortalShell` (NEW)

**File:** `client/src/layouts/FamilyPortalShell.tsx`

Mobile-first, warm tone, plain language, consent banner on every page.

### 9.4 Route architecture

| Pattern | Example | Rule |
|---------|---------|------|
| Portal prefix | `/hospital`, `/doctor`, `/nurse` | Role-scoped permissions |
| Patient anchor | `/:portal/patient/:id/healthos` | All clinical collaboration lives here |
| Ops surfaces | `/hospital/command-center` | Hospital role unless granted |
| Legacy | `/hmis/*` | Redirect via `HmisLegacyRedirect` + `clinicalPortalPaths.ts` |

**Route registry:** `client/src/routes/portalClinicalRoutes.tsx`, `client/src/routes/index.tsx`

### 9.5 Page inventory by delivery phase

**Legend:** ✅ enhance existing · 🆕 new · 🔀 merge/redirect

#### Phase 0 — Unify & wire (Wave 1, weeks 1–4)

| # | Page / artifact | Route | File | Action |
|---|-----------------|-------|------|--------|
| 0.1 | Clinical Shell | — | `layouts/ClinicalShell.tsx` | 🆕 |
| 0.2 | Living Patient Workspace | `/:portal/patient/:id/healthos` | `hmis/LivingPatientWorkspace.tsx` | ✅ refactor into shell |
| 0.3 | Inpatient Workspace | `/:portal/patient/:id/workspace` | `hmis/InpatientWorkspace.tsx` | 🔀 redirect → `healthos?mode=ops` |
| 0.4 | Hospital Sidebar v2 | — | `components/hospital/HospitalSidebar.tsx` | ✅ HealthOS section |
| 0.5 | Doctor Sidebar v2 | — | `components/doctor/DoctorSidebar.tsx` | 🆕 extract from `MainLayoutdoctor` |
| 0.6 | Central nav config | — | `config/clinicalNav.config.ts` | 🆕 |
| 0.7 | HealthOS Hub | `/:portal/healthos` | `hmis/CareOSEcosystem.tsx` | ✅ simplify |

**Hospital clinical nav (proposed — `config/clinicalNav.config.ts`):**

| Section | Items |
|---------|-------|
| HealthOS | Command Center, Patient Workspaces, MDT Inbox, Hospital Copilot |
| Ward Operations | Bed Map, eMAR, Discharge Board, Nursing Tasks |
| Departments | ICU Board, OT Command, ER Queue, Radiology, Pharmacy |

#### Phase 1 — Living Workspace + Augmented AI (Wave 1, weeks 5–12)

Refactor `LivingPatientWorkspace.tsx` into tab routes under `ClinicalShell`:

| Tab | Route suffix | Component file | Maps to pillar |
|-----|--------------|----------------|----------------|
| Overview | `/healthos` | `features/workspace/pages/WorkspaceOverview.tsx` | Pillar 3, 14 |
| Timeline | `/healthos/timeline` | `features/workspace/pages/ClinicalTimeline.tsx` | CareOS timeline |
| Human Care Team | `/healthos/team` | `features/workspace/pages/HumanCareTeam.tsx` | Dynamic care team |
| **AI Care Team** | `/healthos/ai-team` | `features/workspace/pages/AICareTeam.tsx` | **Pillars 1, 7, 19** |
| Tasks | `/healthos/tasks` | `features/workspace/pages/CareTasks.tsx` | Task orchestration |
| Treatment Pathway | `/healthos/pathway` | `features/workspace/pages/TreatmentPathway.tsx` | Pillar 14 |
| Vitals & Monitoring | `/healthos/monitoring` | `features/workspace/pages/PatientMonitoring.tsx` | Pillars 6, 13 |
| Labs & Imaging | `/healthos/results` | `features/workspace/pages/ResultsHub.tsx` | DICOM + lab connectors |
| Clinical Playback | `/healthos/playback` | `features/workspace/pages/ClinicalPlayback.tsx` | Clinical journey replay |
| MDT Board | `/healthos/mdt` | `features/workspace/pages/MDTSession.tsx` | Collaboration |
| Family (staff) | `/healthos/family` | `features/workspace/pages/FamilyPublish.tsx` | Family updates |
| Documents | `/healthos/documents` | `features/workspace/pages/ClinicalDocuments.tsx` | Pillar 4 |

**New directory structure:**

```
client/src/
  features/workspace/
    pages/           # tab page components
    components/      # workspace widgets
    hooks/           # useWorkspace, useWorkspaceRealtime
    types/           # WorkspaceDTO, AITeamMember, TimelineEvent
  layouts/
    ClinicalShell.tsx
    CommandCenterShell.tsx
    FamilyPortalShell.tsx
  config/
    clinicalNav.config.ts
  services/
    workspace.service.ts   # wraps careos.service.ts
```

##### AI Care Team page (highest differentiation)

**Route:** `/:portal/patient/:id/healthos/ai-team`

| UI block | Components | API |
|----------|------------|-----|
| Agent roster grid | `AgentRosterCard.tsx` | Coordinator + agent registry |
| Active recommendations | `AIRecommendationCard.tsx`, `SaMDBadge.tsx`, `ConfidenceMeter.tsx` | `GET /api/v3/healthos/coordinator/:id/alerts` |
| Human-in-the-loop | `ApprovalActionBar.tsx` | Approve / Modify / Dismiss → approval inbox |
| Explainability | `SHAPAttributionDrawer.tsx` | `GET /api/ai-governance/patient/:id/explanation` |
| Activity log | `AgentActivityLog.tsx` | Audit + quality gate log |

**Agent roster (target UI):** Clinical Intelligence · Monitoring Agent · Medication Agent · Documentation Agent · Research Agent · Workflow Agent · Prediction Agent · Family Agent · Translation Agent

**Governance:** Every recommendation shows SaMD class, confidence score, data completeness; T1+ actions route to **approval inbox** (Pillar 4).

##### Unified copilot surfaces

| Surface | Scope | Component |
|---------|-------|-----------|
| Patient copilot | In workspace | `features/copilot/PatientCopilotPanel.tsx` (slide-over) |
| Module copilot | Per department | Keep `ModuleCopilot` — shared design tokens |
| Hospital copilot | Hospital-wide ops | `hmis/HospitalCopilot.tsx` ✅ |

##### MDT pages

| Page | Route | File |
|------|-------|------|
| MDT Inbox | `/hospital/mdt/inbox` | `features/mdt/MDTInbox.tsx` 🆕 |
| MDT Session | `/:portal/patient/:id/healthos/mdt` | `features/mdt/MDTSession.tsx` 🆕 |
| Global Board | `/:portal/healthos/board/:patientId` | `hmis/GlobalClinicalBoard.tsx` ✅ |
| MDT Video Room | `/:portal/mdt/:sessionId/room` | `features/mdt/MDTRoom.tsx` 🆕 (LiveKit) |

#### Phase 2 — Hospital intelligence (Wave 2, weeks 13–20)

| Page | Route | File | Pillar |
|------|-------|------|--------|
| Command Center | `/hospital/command-center` | `hmis/CommandCenter.tsx` | 5 |
| ED Board | `/hospital/command-center/ed` | `features/command/EDBoard.tsx` | 8 |
| ICU Overview | `/hospital/command-center/icu` | `features/command/ICUOverview.tsx` | 7 |
| OT Live Board | `/hospital/command-center/ot` | `features/command/OTLiveBoard.tsx` | 10 |
| Diagnostics Queue | `/hospital/command-center/diagnostics` | `features/command/DiagnosticsQueue.tsx` | — |
| AI Recommendations | `/hospital/command-center/ai` | `features/command/AIRecommendations.tsx` | 5 |
| Ward Display | `/display/ward/:wardId` | `features/display/WardBoard.tsx` | 6 |
| ICU Monitor Wall | `/display/icu/:unitId` | `features/display/ICUMonitorWall.tsx` | 6 |
| Room Display | `/display/room/:bedId` | `features/display/RoomDisplay.tsx` | 6 |
| Family Login | `/family/login` | `features/family/FamilyLogin.tsx` | — |
| Family Patient Home | `/family/patient/:id` | `features/family/FamilyPatientHome.tsx` | — |
| Similar Cases | `/:portal/patient/:id/healthos/similar-cases` | `features/workspace/pages/SimilarCases.tsx` | 19 |
| Case Library | `/hospital/knowledge/cases` | `features/knowledge/CaseLibrary.tsx` | 19 |

**Note:** Consumer `FamilyHealthHub.tsx` (`/family-hub`) remains membership/wellness — separate from inpatient CareOS family portal.

#### Phase 3 — Ecosystem (Wave 3+)

| Page | Route | Purpose |
|------|-------|---------|
| Federation Console | `/hospital/federation` | Trust agreements, partner hospitals |
| Referral Network | `/hospital/referrals` | Inbound/outbound referrals |
| Medical Passport | `/:portal/healthos/passport/:patientId` | `MedicalPassportPortal.tsx` ✅ |
| Marketplace | `/hospital/marketplace` | Third-party app install |
| Developer Portal | `/admin/developers` | API keys, sandbox |
| Research Hub | `/hospital/research` | Pillar 18 |
| Home Monitoring | `/hospital/home-care` | Pillar 13 RPM |

### 9.6 Component library extensions

#### `components/clinical/` (NEW)

`PatientBanner`, `AcuityBadge`, `VitalsStrip`, `TimelineEventCard`, `CareTeamAvatarRow`, `TaskCard`, `ClinicalEmptyState`, `SaMDBadge`, `ApprovalButtons`, `LiveIndicator`, `MilestoneNode`, `BedStatusChip`

#### `components/ai/` (NEW)

`AgentRosterCard`, `CopilotPanel`, `AIStreamingText`, `ConfidenceBar`, `GateStatusChip`, `AttributionChart`

#### Design tokens (extend `client/src/index.css`)

```css
--clinical-critical: 0 84% 60%;
--clinical-warning: 38 92% 50%;
--clinical-stable: 142 76% 36%;
--ai-surface: 270 50% 98%;
--ai-agent-active: 142 76% 36%;
--ai-agent-idle: 215 16% 65%;
```

### 9.7 Pillar → frontend mapping

| Pillar | Primary frontend surfaces |
|--------|---------------------------|
| 1 AI Hospital Copilot | `HospitalCopilot.tsx`, `PatientCopilotPanel.tsx` |
| 2 Digital Twin Hospital | Command Center simulation tab (Wave 2) |
| 3 Patient Digital Twin | `WorkspaceOverview` twin widget, `PatientMonitoring` |
| 4 Ambient Documentation | Approval inbox tab in `HospitalCopilot.tsx` |
| 5 Command Center + AI | `CommandCenter.tsx`, `AIRecommendations.tsx` |
| 7 AI Nurse Assistant | `CareTasks`, nurse handover in workspace |
| 8 Predictive ED | `EDBoard.tsx` |
| 12 Translator | MDT room + `GlobalClinicalBoard` |
| 14 Patient Journey | `TreatmentPathway.tsx` |
| 15 Voice-First | Voice shell overlay (Wave 2) |
| 19 Knowledge Graph | `SimilarCases.tsx`, `CaseLibrary.tsx` |
| 20 What-If Simulator | Twin tab in workspace / command center |

### 9.8 Key user flows (acceptance)

| Flow | Steps | Success criteria |
|------|-------|------------------|
| Admit → workspace | ADT admit → CTA → `/healthos` → AI briefing on Overview | Workspace exists before first open; briefing < 8s |
| Critical lab → action | Lab event → socket alert → AI Care Team → nurse approves → task created | End-to-end < 60s in test env |
| MDT in 60s | Overview → Start MDT → inbox notify → LiveKit join → opinion → timeline | Specialist join < 60s |
| Family update | Nurse `FamilyPublish` → preview → publish → `/family/patient/:id` | Plain language only |

### 9.9 Engineering conventions

| Concern | Choice |
|---------|--------|
| Server state | TanStack Query |
| Workspace UI state | Zustand (active tab, copilot open) |
| Realtime | `socket.service.ts` → `useWorkspaceRealtime(patientId)` |
| Code split | Lazy load each workspace tab |
| Forms | react-hook-form + zod |
| Charts | Chart.js / Recharts |
| Video | `@livekit/components-react` |
| Imaging | Cornerstone (MDT room) |
| i18n | `react-i18next` (family portal + global MDT) |

**API service:** `client/src/services/workspace.service.ts` — single import wrapping `careos.service.ts` + future `GET /api/v3/healthos/ai-team/:patientId`

### 9.10 Sprint plan (frontend)

| Sprint | Deliverables |
|--------|--------------|
| 1 | `ClinicalShell` + `clinicalNav.config` + sidebar updates |
| 2 | `useWorkspace` hook + `WorkspaceOverview` extraction |
| 3 | `ClinicalTimeline` + `PatientMonitoring` + realtime hook |
| 4 | **`AICareTeam`** + SaMD components + approval flow |
| 5 | `TreatmentPathway` + `CareTasks` + `HumanCareTeam` |
| 6 | `MDTInbox` + `MDTSession` + `MDTRoom` |
| 7 | `CommandCenterShell` + WebSocket KPIs |
| 8 | Family portal (4 pages) + `FamilyPublish` |
| 9 | `ClinicalPlayback` + `SimilarCases` + polish |

### 9.11 Page count summary

| Phase | New pages | Enhanced | New components |
|-------|-----------|----------|----------------|
| Phase 0 | 4 | 6 | 3 layouts |
| Phase 1 | 18 | 8 | ~25 clinical/AI |
| Phase 2 | 14 | 6 | ~12 display/command |
| Phase 3 | 10 | 4 | ~8 ecosystem |
| **Total** | **~46** | **~24** | **~48** |

### 9.12 Out of scope (avoid scope creep)

| Defer | Reason |
|-------|--------|
| Flutter mobile rebuild | React web + PWA first; `/api/mobile` exists |
| Redesign all 45 `pages/hospital/*` | Link incrementally into workspace |
| 26 department portal redesigns | Keep `HospDeptLayout`; link to workspace |
| Custom design system | Extend shadcn/ui |
| 3D digital twin UI | Backend simulator exists; UI Wave 3+ |
| AR surgical planning | Research-tier per feasibility doc |

### 9.13 Frontend success metrics

| Metric | Target |
|--------|--------|
| Time to patient context | < 3 clicks from any hospital page |
| Workspace load (p95) | < 2s |
| AI recommendation review rate | > 60% acknowledged |
| MDT join time (invite → video) | < 60s |
| Command Center data freshness | < 5s via WebSocket (replace 60s poll) |
| Nav discoverability | 90% find Command Center without OS Hub (tree test) |

### 9.14 Immediate actions (this week)

- [ ] Create `layouts/ClinicalShell.tsx`; wrap `LivingPatientWorkspace`
- [ ] Create `config/clinicalNav.config.ts`; update `HospitalSidebar` + doctor nav
- [ ] Extract `WorkspaceOverview` from monolithic `LivingPatientWorkspace.tsx`
- [ ] Build `AICareTeam.tsx` + `AgentRosterCard` + `AIRecommendationCard`
- [ ] Add `useWorkspaceRealtime` hook stub (Socket.IO)
- [ ] Fix OS Hub copilot link → `/hospital/copilot`
- [ ] Redirect `/patient/:id/workspace` → `/patient/:id/healthos?mode=ops`

### 9.15 Related documentation

| Document | Role |
|----------|------|
| `MEDIQZY_CAREOS_VISION.md` | Product vision & positioning |
| `CAREOS_ECOSYSTEM_ARCHITECTURE.md` | CareOS platform map |
| `CAREOS_PLATFORM_ROADMAP.md` | Stages 1–4 API/UI readiness |
| `HEALTHOS_ALL_PHASES_IMPLEMENTATION.md` | API endpoint inventory |
| `CAREOS_PHASE1_IMPLEMENTATION.md` | Phase 1 workspace API spec |
| `HMIS_PATIENT_JOURNEY_IMPLEMENTATION_PLAN.md` | Patient navigation principles |
| `docs/ai/MEDIQZY_V2_FEASIBILITY_AND_PHASED_PLAN.md` | Backend feasibility cross-check |
| `docs/ai/AI_INTERPRETABILITY_AND_QUALITY_GATES.md` | SaMD UI requirements for AI surfaces |

---

*This document is the single source of truth for Hospital OS 2035 delivery. Update version on each wave completion.*
