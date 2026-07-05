# Mediqzy CareOS — Product Vision & Positioning

| Field | Value |
|-------|-------|
| **Document ID** | MED-CAREOS-001 |
| **Version** | 1.0 |
| **Date** | 2026-07-05 |
| **Owner** | AI CTO / Product |
| **Tagline** | *The world's first AI-powered collaborative operating system for hospitals* |

---

## 1. The gap we target

| What vendors build | What's fragmented | **CareOS owns** |
|--------------------|-----------------|-----------------|
| AI scribes | Point documentation tools | Patient-centric workspace |
| Virtual nursing | Task lists per ward | Dynamic care team per patient |
| Remote monitoring | Device dashboards | Timeline + AI coordinator |
| Telehealth | Meeting links | One-touch clinical calls in-context |
| Command centers | Ops KPIs only | Mission control + patient threads |
| HIS/EHR | Department modules | **Everything revolves around the patient** |

**Do not market as another HIS.**  
**Market as:** `Mediqzy CareOS` — collaborative operating system for hospitals.

Analogy for investors and buyers:

> Microsoft Teams + Figma + GitHub + ICU Monitoring + ChatGPT — designed for healthcare, with human-final clinical governance.

---

## 2. North star: Living Patient Workspace

Every complex patient gets a **live digital workspace** — not a chat group.

```
Patient
├── Clinical Timeline      ← searchable forever, not disappearing chat
├── Live Vitals & Devices
├── Labs & Imaging
├── AI Clinical Coordinator
├── Dynamic Care Team
├── Living Treatment Pathway
├── Tasks & Decisions
├── MDT / Clinical Board
├── One-Touch Video
├── Family Updates (approved)
└── Clinical Playback (48h replay)
```

---

## 3. Core differentiators (feature deep-dive)

### 3.1 Clinical Timeline (replaces group chat)

Every interaction becomes a **structured, permanent timeline event**:

```
08:05  Troponin ↑
08:06  AI: Possible NSTEMI progression — review ECG vs prior
08:08  Cardiologist joined case
08:11  Nurse: Chest pain 8/10
08:12  ECG uploaded
08:14  Decision: Shift to Cath Lab
08:16  Cath Lab accepts
08:17  Transport dispatched
```

- No scrolling through thousands of messages
- Full-text search across the care journey
- AI, devices, labs, and humans use the **same event stream**

### 3.2 AI as Chief Clinical Coordinator

AI **watches continuously** (labs, vitals, meds, imaging, nurse notes, devices, guidelines) and emits **specific, actionable alerts**:

> *Hemoglobin has fallen 2.4 g/dL in 6 hours. Recent hypotension noted. Consider evaluating for active bleeding.*

Not: *"Patient unstable."*

### 3.3 Dynamic MDT (Multidisciplinary Team)

When diagnosis evolves (e.g. septic shock), AI **suggests and invites**:
- ICU, ID, Nephrology, Clinical Pharmacy, Microbiology, Dietitian, Respiratory

Nobody has to remember who to call.

### 3.4 Living Treatment Pathway

Visual progress through goals:

```
Current: Stabilize BP          ████████░░ 80%
Next:    Extubation            Pending
         Mobilization → Discharge → Home Monitoring
```

### 3.5 Intelligent Medical Board

**Instant MDT** — doctor taps *Start Clinical Board* → specialists get *Join?* in one click.

**AI Consensus** summarizes opinions + conflict areas (e.g. anticoagulation timing) — multi-agent reasoning, not replacement.

### 3.6 Hospital Mission Control Displays

ICU, OT, ER, wards, conference rooms = collaborative surfaces:
- Annotate imaging, compare ECG, replay surgery video
- One-touch join — no meeting IDs

### 3.7 AI Meeting Assistant

During video: transcribe, extract decisions, create tasks, update notes and pathway — ambient documentation aligned with SaMD policy (physician review).

### 3.8 Patient Digital Twin + Clinical Playback

One intelligent patient model; **replay last 48 hours** like CCTV for deterioration understanding.

### 3.9 Hospital Memory

> *Similar to Case #4312 (2024). Presentation match 87%. Final dx: Autoimmune encephalitis. Review lessons learned?*

Institutional knowledge compounds over time.

### 3.10 Family Collaboration Portal

Clinician-approved updates only: treatment stage, today's plan, discharge checklist, education.

---

## 4. Phase roadmap

### Phase 1 (months 1–9) — **CareOS Foundation** ← current sprint

| Deliverable | Status |
|-------------|--------|
| Living Patient Workspace UI | Implementing |
| Clinical Timeline (structured events) | Implementing |
| Dynamic Care Teams | Implementing |
| Task management on timeline | Implementing |
| AI coordinator alerts (specific) | Implementing |
| Living treatment pathway | Implementing |
| Instant MDT / Clinical Board scaffold | Implementing |
| Video call token (one-touch) | Scaffold |
| AI timeline summaries | Via Hospital Copilot |

### Phase 2 (months 9–15)

- Live device integration (MQTT → timeline)
- ICU collaborative displays
- Smart command center (Netflix-style)
- Digital whiteboards on displays
- Family portal v1

### Phase 3 (months 15–24)

- Full AI consensus engine
- Clinical playback cinematic UI
- Hospital memory similarity search
- Cross-hospital collaboration
- Predictive command center automation

---

## 5. Technical architecture

```
CareOS API          /api/v3/careos
Hospital OS         /api/v3/hospital-os  (copilot, twins, approvals)
Clinical data       /api/v1/clinical-workspace, /api/v1/navigation
Real-time           SSE + MQTT (HyperGrid)
Video               LiveKit (patient-scoped rooms)
Governance          SaMD gates, approval inbox, audit log
```

---

## 6. Messaging for GTM

**Wrong:** "Group chat for doctors"  
**Right:** "Living Patient Workspace — every patient is a real-time collaborative environment where clinicians, nurses, devices, and AI contribute to one structured, searchable care journey."

---

*Companion: `CAREOS_PHASE1_IMPLEMENTATION.md`, `HOSPITAL_OS_2035_IMPLEMENTATION_PLAN.md`*
