# Mediqzy — AI-Native Healthcare Operating System: Implementation & Wiring Plan

**Owner:** AI CTO
**Audience:** Engineering, Product, Clinical Governance, Founders
**Purpose:** Map the "Living Patient Workspace + Care Intelligence Mesh" vision onto the **actual codebase**, define how modules are wired via events, and lay out a phased build order.
**Related:** `CLAUDE.md`, `docs/ai/AI_COPILOT_SYSTEM.md`, `docs/ai/SAMD_READINESS_SCORECARD.md`

---

## 0. The one-paragraph thesis

Mediqzy is **not starting from a traditional HIS**. It already has the three hardest pieces of an AI-native OS: (1) a **canonical event bus** ("HyperGrid" — Redis pub/sub + optional Kafka), (2) a **governed multi-agent AI brain** (7 agents, orchestrator, permission engine, tool sandbox, LLM cascade, RAG, self-optimizing evaluation engine), and (3) **interoperability + device ingestion** (HL7 MLLP, FHIR subscriptions, MQTT device/display bridges, digital twins). The vision is realized by making **one thing the center of gravity — the Living Patient Workspace — and wiring every module and every AI agent to it through events.** This document is the wiring plan.

---

## 1. Vision → Codebase mapping (current state is the moat)

| Vision layer | Vision concept | **Already exists in code** | Gap to close |
|---|---|---|---|
| Nervous system | Event bus, "nothing in isolation" | **`hypergrid-event-bus.service.js`** (Redis `hg:events` + Kafka `hg.health.events`, canonical `{type,source,tenantId,patientId,payload}`) | Publish events from **every** module consistently; formal event catalog |
| Augmented AI | AI care team / Care Intelligence Mesh | **`server/services/ai-brain/`** — 7 agents, `multi-agent-orchestrator.js`, `agent-permission-engine.js`, tools, `llm-provider.js` cascade, `evaluation-engine.js`, `rag-pipeline.js` | Make agents **always-on & event-subscribed**; add per-patient agent instances |
| Living Patient Workspace | One workspace per patient | **`InpatientWorkspace`** (`/hmis/patient/:id/workspace`), `clinical-workspace.service.js` | Elevate to a first-class **event-projected workspace** with timeline + AI team members |
| Command Center | Real-time ops | **`/hmis/command-center`** + executive dashboards (CEO/CFO/COO/MS) | Drive from live event stream; add predictive agents |
| Integration | HL7/FHIR/PACS/devices/wearables | **HL7 MLLP gateway, FHIR subscriptions, HyperGrid MQTT, device-alarm-bridge, display-mqtt-bridge, digital twins** | Normalize all inbound into canonical events |
| Collaboration | Video, chat, tasks, whiteboard — patient-linked | `socket.service.js`, video routes, communication hub, ADT/nursing tasks | Bind all collaboration to the workspace + timeline |
| Platform services | Identity, RBAC, audit, notifications, search | `authUser`/`requireRole`, `ringFencing`, audit logs, `notification-orchestrator`, tenant isolation | Master Patient Index (MPI), global search (OpenSearch) |
| Clinical modules | HIS/EHR/Pharmacy/Lab/RIS/OT/ICU/ER/Billing/Insurance | All present (ADT, eMAR, e-chart, LIS, RIS/PACS OHIF, OT command, ICU, ER ESI triage, charge master, NHCX claims, MRD) | Ensure each **emits + subscribes** to workspace events |
| Governance | Safe AI in healthcare | Quality gates, model governance, SHAP/LIME interpretability, drift/PSI, model cards, medical-director review | Extend to per-agent recommendations in the mesh |

**Takeaway:** ~70% of the platform substrate exists. The work is *convergence and wiring*, not invention.

---

## 2. Architectural principles (non-negotiable)

1. **Patient-centric:** the Living Patient Workspace is the aggregate root; almost everything is a projection onto it.
2. **Event-driven:** modules communicate through **canonical events on HyperGrid**, never by hard-coding calls into each other.
3. **AI-native / Augmented Intelligence:** AI agents are **members of the care team**, always present, event-subscribed. They **observe, summarize, predict, coordinate, explain** — they **recommend; humans decide.**
4. **Governed by design:** every clinical AI recommendation carries confidence + explanation, passes quality gates, and is logged; no autonomous clinical action.
5. **API-first, modular, multi-tenant, interoperable** (HL7/FHIR/NHCX/ABDM).

---

## 3. The event backbone (HyperGrid) — the nervous system

### 3.1 Canonical event (already defined)
```jsonc
{ "id": "...", "type": "PatientAdmitted", "source": "api|hl7|fhir|mqtt|scheduler",
  "tenantId": "...", "patientId": "...", "payload": {...}, "timestamp": "ISO8601" }
```
Transport: **Redis pub/sub** channel `hg:events` for in-cluster fan-out; **Kafka** topic `hg.health.events` for durable/replayable streams (currently Redis-only mode; enable Kafka for replay + multi-service scale).

### 3.2 Formal event catalog (to standardize — the contract)
Group by domain; every module publishes these instead of calling peers:

| Domain | Events (publish) |
|---|---|
| ADT | `PatientRegistered`, `PatientAdmitted`, `PatientTransferred`, `PatientDischarged`, `BedReserved`, `BedAllocated` |
| Clinical | `EncounterOpened`, `ClinicalNoteAdded`, `OrderPlaced`, `DiagnosisUpdated`, `CarePlanUpdated` |
| Vitals/Devices | `VitalsObserved`, `DeviceAlarmRaised`, `MonitorStreamUpdated` |
| Labs/Imaging | `LabOrdered`, `LabResultAvailable`, `CriticalValueFlagged`, `ImagingOrdered`, `ImagingReported` |
| Pharmacy | `PrescriptionCreated`, `MedicationDispensed`, `MedicationAdministered` |
| Revenue | `ChargeCaptured`, `ClaimSubmitted`, `PreAuthRequested`, `PaymentPosted` |
| AI | `AIRecommendationProduced`, `AIAlertRaised`, `AIRecommendationActioned` (approved/modified/ignored) |
| Ops | `OccupancyChanged`, `StaffAssigned`, `EquipmentStatusChanged` |

**Rule:** a module NEVER imports another module's service to trigger side effects. It **publishes an event**; interested modules **subscribe**.

### 3.3 Wiring example — admission (already partially real)
```
POST /v1/adt/admit  ──►  ADT service writes ip_admissions
                     └─► eventBus.publish({type:'PatientAdmitted', patientId, payload})
                          │
        ┌─────────────────┼──────────────────┬───────────────────┬─────────────────┐
        ▼                 ▼                  ▼                   ▼                 ▼
   EHR: open encounter  Billing: open acct  Beds: mark occupied  CommandCenter:    AI Orchestrator:
   (EncounterOpened)    (ChargeCaptured…)   (OccupancyChanged)   occupancy++       spin up patient
                                                                                   AI care team +
                                                                                   Workspace created
```
None of these call each other; they all subscribe to `PatientAdmitted`.

---

## 4. The Living Patient Workspace (the aggregate root)

### 4.1 What it is
One durable, real-time workspace per patient/encounter that **projects** all events into a coherent surface. Frontend evolves `InpatientWorkspace` (`/hmis/patient/:id/workspace`); backend evolves `clinical-workspace.service.js` into a **workspace projection service**.

### 4.2 Data model (new tables, event-sourced projections)
```
patient_workspace         (id, patient_id, encounter_id, tenant_id, status, care_goal, created_at)
workspace_timeline        (id, workspace_id, event_type, actor(human|ai|device), summary, payload, ts)   ← append-only
workspace_care_team       (id, workspace_id, member_type(human|ai), member_ref, role, status, joined_at)
workspace_tasks           (id, workspace_id, title, assignee, status, due, source(human|ai))
workspace_ai_findings     (id, workspace_id, agent, finding, severity, confidence, explanation, status)
workspace_pathway         (id, workspace_id, milestones[], current_objective, discharge_readiness)
```
Every HyperGrid event with a `patientId` is **projected** into `workspace_timeline` (the structured, searchable audit trail the vision describes) and fans out to the relevant tab (labs, vitals, meds, imaging, AI).

### 4.3 Real-time
`socket.service.js` room per workspace (`ws:{workspaceId}`). The projection service, on each event, updates the DB and emits to the room → the workspace UI updates live (no polling). Same stream powers **Smart Interactive Displays** and the **Command Center**.

### 4.4 Dynamic Care Team (workflow engine)
Subscribe to `DiagnosisUpdated`. A rules/workflow layer maps diagnosis → required roles (human + AI) and publishes `CareTeamMemberInvited`, which populates `workspace_care_team`.
```
DiagnosisUpdated: "Acute Ischemic Stroke"
   └─► workflow: invite Neurologist, Radiologist, ICU, Stroke Nurse
       + activate AI members: Clinical, Radiology, Medication, Monitoring, Prediction agents
```

---

## 5. Augmented Intelligence — the Care Intelligence Mesh

This is the answer to *"where is the augmented AI?"* Today the ai-brain is **request/response** (you call `/agents/process`). Augmented Intelligence means the agents become **always-on, event-subscribed members of each patient's workspace**.

### 5.1 From "called" to "always present"
Add an **Agent Runtime** that subscribes to HyperGrid. When events arrive for a patient with an open workspace, the relevant agents wake, reason (via the existing orchestrator + tools + LLM cascade), and **publish `AIRecommendationProduced`** into the workspace — no one asked. Humans approve/modify/ignore; the outcome (`AIRecommendationActioned`) feeds the `evaluation-engine.js` and Learning Agent.

```
HyperGrid event (patient X) ─► Agent Runtime ─► wake subscribed agents for X
       │                                             │
       │                                   orchestrator + tools + LLM cascade
       │                                             │
       └────────────── AIRecommendationProduced ─────┘ ─► workspace_ai_findings + timeline + socket
                                                          ─► human: approve / modify / ignore
```

### 5.2 The AI care team (extend `agent-registry.js`)
Existing 7 agents (Admin, Clinical, Analyst, Worker, Research, Insurance, Emergency) become the seed. Add specialized, event-subscribed members:

| AI member | Subscribes to | Produces |
|---|---|---|
| **Clinical Intelligence** | Encounter/Diagnosis/Notes | admission briefing, differentials, care-pathway suggestions |
| **Monitoring Agent** | `VitalsObserved`, `DeviceAlarmRaised` | *contextual* deterioration/sepsis alerts (trend + labs + BP), not raw thresholds |
| **Medication Agent** | `PrescriptionCreated` | interactions, renal/hepatic dosing, allergy, duplicate therapy, formulary |
| **Laboratory Agent** | `LabResultAvailable`, `CriticalValueFlagged` | result interpretation, missing-investigation flags |
| **Radiology Agent** | `ImagingReported` | findings summary, triage support (via imaging AI/marketplace) |
| **Documentation Agent** | round audio / notes | ambient notes, shift handover, ICU progress, discharge summary (physician signs) |
| **Research Agent** | `DiagnosisUpdated` | protocol/guideline/literature briefing for rare/complex cases |
| **Workflow/Operations Agent** | orders, schedules, occupancy | "MRI slot 2h earlier if transported now"; staffing/bed suggestions |
| **Prediction Agent** | full stream | LOS, discharge date, readmission risk, bed/blood/OT demand |
| **Family Agent** | milestones | plain-language family updates (consent-gated) |
| **Translation Agent** | chat/video | live multilingual, medical-term-preserving |
| **Learning Agent** | `AIRecommendationActioned`, outcomes | indexes approved outcomes → institutional knowledge (no autonomous retraining) |

### 5.3 AI Orchestrator = the existing `multi-agent-orchestrator.js`, upgraded
Add: (a) **event triggers** (not just user prompts), (b) **per-patient agent context/memory**, (c) **debounce/priority** so the Monitoring/Emergency agents preempt, (d) **recommendation lifecycle** (`produced → surfaced → actioned`). All still flows through the **permission engine** (3-layer sandbox), **quality gates**, and **interpretability** — so augmentation stays governed.

### 5.4 The four tiers of the mesh
| Tier | Scope | Built on |
|---|---|---|
| **Per-patient** | agents on one workspace | Agent Runtime + workspace events |
| **Per-department** | ICU/ER/OT/Pharmacy/Lab optimizers | department event subscriptions + cron agents |
| **Hospital-wide** | capacity/staffing/supply forecasting | Command Center + Prediction Agent + `duckdb-etl` |
| **Network-wide** | referrals, second opinions, surveillance | Connect module + FHIR + federation |

### 5.5 Governance guardrail (mandatory)
Per `CLAUDE.md`: every clinical AI finding calls `qualityGates.checkXxx()`, emits `interpretabilityService.computeConfidenceScore()` + SHAP/LIME, logs to `ai_quality_gate_log`, and **never** self-applies. Recommendations are advisory; the physician is the clinical actor. This is what makes "AI as a team member" safe and defensible.

---

## 6. End-to-end wiring scenarios (how functions connect)

**A. Lab result → augmented response**
```
LIS: LabResultAvailable ─► projection: timeline + labs tab (socket)
                        ─► Laboratory Agent: interpret; if abnormal → AIAlertRaised
                        ─► Monitoring/Clinical Agent: correlate with vitals/trend
                        ─► quality gate + confidence/explanation
                        ─► workspace_ai_findings; doctor + nurse notified; task auto-created
```

**B. Deterioration (contextual, not alarm spam)**
```
VitalsObserved (stream from device-alarm-bridge/MQTT) ─► Monitoring Agent maintains rolling context
   └─ "HR ↑ 4h + lactate ↑ + BP ↓ → possible early sepsis" ─► AIAlertRaised (severity high, ESI link)
       └─ Emergency Agent (priority 100) escalates ─► Command Center + on-call mobile push
```

**C. Ambient documentation**
```
Round audio ─► AI Scribe (Whisper offline/online) ─► Documentation Agent structures note
            ─► workspace timeline (draft) ─► physician reviews & signs ─► ClinicalNoteAdded
```

**D. Dynamic care team + medical board**
```
DiagnosisUpdated ─► workflow invites humans + AI members ─► one-click "Medical Board" (video via socket/WebRTC)
                 ─► Documentation Agent summarizes agreements/conflicts/action items ─► tasks + timeline
```

---

## 7. Platform modules ↔ future product modules

| Vision product module | Realized by |
|---|---|
| **Mediqzy Core (HIS/EHR)** | existing ADT/EHR/eMAR/e-chart/billing |
| **Mediqzy Collaborate (Workspace)** | §4 Living Patient Workspace + socket + video |
| **Mediqzy AI (Copilot)** | §5 Care Intelligence Mesh (ai-brain evolved) |
| **Mediqzy Command** | `/hmis/command-center` + Prediction/Operations agents |
| **Mediqzy Connect (referrals/cross-border)** | FHIR + federation + Connect service (new) |
| **Mediqzy Home (RPM)** | HyperGrid MQTT + wearables + Monitoring Agent |
| **Mediqzy Insights** | `duckdb-etl` + Analyst/Prediction agents |
| **Mediqzy Identity** | auth + RBAC + MPI (new) |
| **Mediqzy Research** | RAG pipeline + Learning Agent + consented cohorts |
| **Mediqzy Marketplace** | API gateway + tool/agent plugin contract (new) |

---

## 8. Gap analysis & build order

### Already have (leverage now)
Event bus (HyperGrid), 7-agent brain + orchestrator + governance, inpatient workspace, command center, HL7/FHIR/MQTT/device bridges, sockets, cron registry, LLM cascade + RAG + evaluation engine, executive dashboards.

### To build (in order)
1. **Event catalog + publisher discipline** — make every module emit canonical events (§3.2). *Foundational; unlocks everything.*
2. **Workspace projection service + schema** (§4.2–4.3) — timeline, tabs, sockets. *The center of gravity.*
3. **Agent Runtime** (§5.1) — event-subscribed, always-on agents writing `AIRecommendationProduced`. *Turns "AI feature" into "AI team member."*
4. **Recommendation lifecycle UI** — AI findings panel in the workspace with approve/modify/ignore + explanation. *Augmented Intelligence UX.*
5. **Dynamic Care Team workflow engine** (§4.4).
6. **Prediction + Operations agents → Command Center** (§5.4 hospital tier).
7. **MPI + global search (OpenSearch)**, **Family portal**, **Clinical playback** (replay timeline).
8. **Connect (referrals/cross-border, federated)** + **Marketplace (plugin API)**.

### Suggested phasing
- **Phase 1 (Foundation):** items 1–4 → the Living Patient Workspace with an always-on AI team on top of existing modules. *This is the wedge — ship it first, make everything feed it.*
- **Phase 2 (Hospital Intelligence):** items 5–7 → device streams, smart displays, predictive Command Center, family portal, playback.
- **Phase 3 (Ecosystem):** item 8 → cross-hospital/cross-border, patient-controlled sharing, marketplace, knowledge network.

---

## 9. Technology stack: proposed vs. current (pragmatic guidance)

| Concern | Vision proposal | Current | Recommendation |
|---|---|---|---|
| Backend | .NET/Java/Node microservices | **Node/Express (ESM)** + NestJS scaffold | Stay Node; carve services along event boundaries. Adopt NestJS for new services incrementally. **Don't rewrite.** |
| Events | Kafka + RabbitMQ | **HyperGrid: Redis pub/sub + Kafka (fallback)** | Keep Redis for in-cluster; **turn Kafka on** for durability/replay when multi-node. |
| DB | PostgreSQL + Mongo + Redis + Elastic | **PostgreSQL (pgPool) + Redis + DuckDB ETL** | Postgres (incl. JSONB for notes) + Redis now; add **OpenSearch** for global search; Mongo only if a doc store is truly needed. |
| AI | Python/FastAPI/LLM gateway | **`llm-provider.js` cascade + Python scribe/offline** | Keep the JS LLM gateway as the single control point; Python microservices for heavy models (already the pattern). |
| Realtime | WebSocket/WebRTC | **socket.io + WebRTC (LiveKit)** | Already aligned. |
| Infra | Kubernetes | **EC2 + PM2; ECS Fargate (future)** | Fine for now; containerize per-service as you split; K8s when scale demands. |

**Principle:** evolve the running system along event seams; avoid a big-bang rewrite.

---

## 10. The strategic wedge (do this first)

Build **one exceptional capability hospitals feel immediately: the Living Patient Workspace with an always-on AI care team.** Then make *every* module — HIS, pharmacy, lab, radiology, ICU, command center, home monitoring — **feed events into that workspace.** Each new module then *increases the value of the whole*, which is exactly how a platform (Salesforce/ServiceNow-scale) compounds — rather than a pile of disconnected features.

> **Mediqzy — The AI-Native Healthcare Operating System:** a living workspace per patient where a human care team and a governed AI care team collaborate in real time, wired together by one event backbone, from a single clinic to a national network.

---
*Governance note: all clinical AI in the mesh is Augmented Intelligence — advisory, explainable, quality-gated, and physician-signed. Describe SaMD posture as "built to CDSCO/FDA/EU frameworks and governance-ready," not "certified," until certification is granted.*
