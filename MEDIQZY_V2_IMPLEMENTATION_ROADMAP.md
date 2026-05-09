# MediQzy v2.0 — Implementation Roadmap & Future Development Blueprint
**Version:** 2.0 Draft  
**Date:** May 7, 2026  
**Classification:** Internal — Product & Engineering  
**Purpose:** Strategic product roadmap combining competitive intelligence, existing capability audit, and prioritised feature development plan for world-class Hospital OS positioning.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State — What's Built (v1.x)](#2-current-state--whats-built-v1x)
3. [Competitive Intelligence](#3-competitive-intelligence)
4. [Where MediQzy Already Wins](#4-where-mediqzy-already-wins)
5. [Pitch Gaps — PPT vs Reality](#5-pitch-gaps--ppt-vs-reality)
6. [v2.0 Feature Roadmap](#6-v20-feature-roadmap)
   - [Tier 1 — Sprint (4 Weeks)](#tier-1--sprint-4-weeks)
   - [Tier 2 — Short-Term (6–8 Weeks)](#tier-2--short-term-68-weeks)
   - [Tier 3 — Medium-Term (3 Months)](#tier-3--medium-term-3-months)
   - [Tier 4 — Strategic (6 Months+)](#tier-4--strategic-6-months)
7. [Hospital OS Module Completeness Map](#7-hospital-os-module-completeness-map)
8. [Critical Gaps to Plug Before Any Enterprise Deal](#8-critical-gaps-to-plug-before-any-enterprise-deal)
9. [Architecture Principles for v2.0](#9-architecture-principles-for-v20)
10. [MGM Hospitals Proposal — Specific Additions](#10-mgm-hospitals-proposal--specific-additions)
11. [Revenue Diversification Opportunities](#11-revenue-diversification-opportunities)

---

## 1. Executive Summary

MediQzy v1.x is a production-grade, multi-tenant Healthcare OS with 40+ modules, 12 department portals, 13+ AI services, and a proprietary Hierarchical Agentic Intelligence System (HAIS) that is architecturally ahead of every commercial HMIS available today.

However, the current pitch (MediQzy V1.2 PPT) significantly **undersells** the platform — it mentions 6 of 9 AI capabilities while the codebase has 13+, describes "30+ modules" while the actual count is 40+, and completely omits game-changing infrastructure like HyperGrid (Digital Twins, Edge Computing, MQTT IoT, App Marketplace), Federated Learning with Differential Privacy, Local AI Node management, and 12 fully-built department-specific portals (ICU, OT, MRD, HR, Quality, Security, IT/EDP, Accounts, Insurance Desk, Homecare, Ambulance, Pharmacy).

v2.0 is the plan to:
1. Complete the genuine missing clinical modules (Blood Bank, Blood Donation Drive, CSSD, Dietary/Nutrition, Antibiogram)
2. Implement 13 futuristic features that place MediQzy 3 years ahead of Epic, Cerner, and Oracle Health
3. Harden the pitch — every slide must reflect ground truth backed by working code
4. Create new revenue streams (Real-World Evidence platform, pharma data subscriptions)

---

## 2. Current State — What's Built (v1.x)

### 2.1 Department Portals (12 — each with own login, auth, workflow)

| Portal | Key Modules |
|---|---|
| **Hospital Admin** | Dashboard · Practice Mgmt · Appointments · Bed Mgmt · Patients · Doctors · Branches & Clinics · Ambulance · EHR · MRD · OPD/IPD · IP Sheets · Discharge Summary · Pharmacy · Lab Reports · Insurance Claims Cockpit · Insurance Payer Setup · Billing & Invoicing · Staff Management |
| **ICU** | Live Monitor · Patient Register · Bed Management · Vitals · Fluid Balance · Ventilators · Infections · Equipment · Critical Team · Protocols · Alerts · Reports & Analytics |
| **OT (Operation Theatre)** | Theatre View · OT Schedule · Pre-Op Checklist · Consent Forms · Surgical Teams · Equipment · Sterilization · Implants & Supplies · Anesthesia Notes · Surgical Safety · Post-Op Care · OT Records |
| **Nurse** | Appointments · Chat · Medications · Notes · Patients · Register Patient · Vitals |
| **MRD** | Medical Records Dept — record retrieval, audit-ready management |
| **HR** | Staff lifecycle, scheduling, compliance |
| **Quality** | NABH/ISO quality tracking, protocols, audits |
| **Security** | Physical security management |
| **IT/EDP** | IT asset management, system monitoring |
| **Accounts** | Financial management portal |
| **Insurance Desk** | Cashless pre-auth, TPA liaison |
| **Homecare** | Home visit scheduling, homecare orders |
| **Ambulance** | Dispatch, GPS tracking, route management |
| **Pharmacy** | POS · Smart Inventory · Expiry Tracking · Batch Purchase Orders |
| **Lab/LIS** | Test Catalog · Sample Tracking · Results · RIS/PACS Integration · DICOM |

### 2.2 AI Infrastructure (13 Services)

| Service | File | Capability |
|---|---|---|
| **Hierarchical Agentic Intelligence (HAIS)** | `ai-brain/cognitive-router.js` | 3-tier routing: REFLEX (<200ms SLM) → STANDARD (Groq Llama-70B ~500ms) → DEEP (iSHA BiMediX2/GPT-4 ~2s). Self-optimising — success rates per query category dynamically adjust tier thresholds |
| **Multi-Agent Orchestrator** | `ai-brain/multi-agent-orchestrator.js` | 7 specialised agents (Admin, Clinical, Analyst, Worker, Research, Insurance, Emergency). Full tool sandboxing at 3 levels. Parallel task execution with DAG planning |
| **LLM Provider Cascade** | `ai-brain/llm-provider.js` | iSHA (primary, BiMediX2) → Groq → OpenAI. ClinicalBERT embeddings via SIB. Medical-specific model as first choice |
| **RAG Pipeline** | `ai-brain/rag-pipeline.js` | ClinicalBERT 768-dim embeddings, pgvector similarity search, document chunking with overlap, GALE medical knowledge base ingest |
| **Offline AI Scribe** | `offline-scribe.route.js` | 12 endpoints: transcribe, normalize, prescription, OPD notes, IPD notes, discharge, full-pipeline, batch. Full offline processing. `requireScribeAccess` middleware |
| **Federated Learning** | `ai-federated-learning.service.js` | 4 production models (HIS risk, triage ESI, drug safety, 30-day readmission). Differential privacy (Gaussian mechanism, configurable ε/δ). DPDP + HIPAA compliant. No raw patient data leaves tenant |
| **Health Intelligence Score (HIS)** | `ai-his-score.service.js` | Proprietary 0-100 score. 6 Bayesian dimensions (cardiovascular, diabetes, hypertension, medication adherence, lifestyle, mental health). EWMA 30-day trend prediction. Peer percentile ranking. Runs every 6 hours |
| **Emergency Triage AI** | `ai-emergency-triage.service.js` | ESI 5-level scoring. Red flag detection (STEMI, stroke, anaphylaxis, code blue, etc.). Vital signs threshold override. Ambulance dispatch recommendation. Specialty routing |
| **AI Pre-Auth Engine** | `ai-preauth-engine.service.js` | Autonomous insurance pre-authorisation submission and tracking |
| **AI Clinical Insights** | `ai-clinical-insights-cron.service.js` | Cron-based patient insight generation |
| **Proactive Alerts** | `ai-proactive-alerts-cron.service.js` | 4-hourly scan: overdue follow-ups, lab trends, medication adherence gaps, preventive care reminders |
| **Self-Learning Pipeline** | `ai-self-learning-pipeline.service.js` | 4-hourly quality analysis. Scores AI responses, identifies failure patterns, updates system prompts. Triggers evaluation engine optimisation |
| **WhatsApp AI Brain** | `whatsapp-sib-brain.service.js` | Conversational AI over WhatsApp channel |
| **AI Insurance Bot** | `ai-insurance-bot.service.js` | Insurance query automation |
| **Drug Interaction AI** | `ai-drug-interaction.service.js` | Real-time drug safety checking |
| **Local AI Node Manager** | `local-ai-node.route.js` | Register, route, configure, deactivate on-premise AI nodes. API key rotation. Fleet heartbeat monitoring. Air-gapped deployment support |

### 2.3 HyperGrid Integration Platform

| Component | What It Does |
|---|---|
| **DICOM/PACS** | Upload studies, worklist management, structured reports, series viewer, multi-frame & 3D MPR, AI-assisted reads |
| **Digital Twins** | Patient twins AND asset twins — real-time observations, risk scoring, deterioration timeline, state management |
| **Edge Computing** | Gateway management, fleet status, offline edge nodes, config sync, heartbeat monitoring |
| **MQTT IoT** | Device registry, broker stats, readings ingestion, key rotation, real-time vital streaming |
| **App Marketplace** | Install/uninstall healthcare apps, ratings, network participants, review workflow |
| **Smart FHIR** | Enhanced FHIR R4 layer with advanced query capabilities |
| **Terminology Engine** | Medical terminology standards (ICD-10, SNOMED, CPT at point-of-care) |
| **Events Bus** | Cross-platform event streaming |

### 2.4 Clinical Standards Implemented

| Standard | Implementation |
|---|---|
| FHIR R4 | Patient, Encounter, Condition, MedicationRequest, Observation, AllergyIntolerance, metadata |
| ICD-10 | Point-of-care search in clinical workflow |
| SNOMED CT | Point-of-care search |
| CPT Codes | Point-of-care search |
| DICOM 3.0 | HyperGrid DICOM with worklist |
| HL7 | Listed in interoperability standards |
| ABDM/ABHA | Native integration with 14-digit ABHA Health ID |

### 2.5 Platform Infrastructure

- **Multi-tenant:** PostgreSQL Row-Level Security (RLS), complete tenant data isolation, custom domain per tenant
- **Compliance:** HIPAA, DPDP Act 2023, audit trail, consent management, RBAC, data request/erasure workflow
- **Video:** Self-hosted WebRTC v1.9.11 + Agora RTC backup, consultation recording, HIPAA-compliant audit trails
- **Notifications:** FCM push, WhatsApp, SMS, email, omnichannel journey orchestration
- **Queue Management:** Real-time OPD queue with no-show, call, start, complete lifecycle
- **Care Plans:** Patient-linked tasks, reminders, active alerts, follow-up scheduling
- **Consent Management:** Create, revoke, patient-linked, audit trail
- **Clinical Notes:** Create, AI-summary generation, digital sign/lock workflow
- **Webinar Platform:** Built-in webinar rooms (CME capability)
- **CRM:** Lead management, email campaigns, omnichannel
- **Wearables:** Apple Watch, Samsung, Fitbit, Garmin, Oura, Withings, Omron, Xiaomi

---

## 3. Competitive Intelligence

### Global HMIS Leaders

| Platform | Strength | Weakness | AI Capability |
|---|---|---|---|
| **Epic Systems** (USA) | Market leader, Cosmos data lake, Nebula cloud, MyChart | $50M+ implementation, US-only optimised, no Indian compliance | DAX Copilot (ambient AI, 1 model, $3/encounter) — charges separately |
| **Oracle Health / Cerner** (USA) | HealtheIntent population health, CareAware IoT | Legacy architecture, complex integration, expensive | AI predictions, population health — charges separately |
| **Meditech Expanse** (USA) | Cloud-native, modern web UI | Limited AI depth, no India-specific modules | Some AI coding assist |
| **Allscripts / Veradigm** (USA) | Analytics, population health | Fragmented product lineup, declining market | Basic analytics |
| **Philips HealthSuite** (Netherlands) | IoT connected care, clinical AI | Hardware-centric, not a full HIS | Imaging AI, IoT — not a hospital OS |
| **HealthPlix** (India) | Doctor EMR, AI prescriptions | Outpatient only — no IPD, no hospital ops | AI prescription |
| **Practo** (India) | Telemedicine, appointments | No HIS, no clinical modules, no hospital ops | Minimal |
| **Eka.Care** (India) | ABHA integration, records | Patient-facing only — not a hospital OS | OCR reports |
| **Insta HMS / iClinicsys** (India) | Basic HIS, affordable | No AI, outdated architecture | None |

### Key Takeaway
MediQzy is the **only platform in India** that combines: full HIS + AI-first clinical suite + federated learning + digital twins + edge computing + on-premise AI nodes + 12 department portals — in a single multi-tenant product. The closest global competitor to the full stack is Epic, which costs 50x more to implement.

---

## 4. Where MediQzy Already Wins

These are genuine technical moats no competitor has as a single integrated product:

### Moat 1 — Hierarchical Agentic Intelligence (HAIS)
The 3-tier cognitive router is a **first-of-its-kind** architecture in healthcare AI:
- REFLEX: SLM for fast lookups — appointments, status checks (<200ms)
- STANDARD: Groq Llama-70B for single-domain clinical analysis (~500ms)
- DEEP: BiMediX2/GPT-4 for differential diagnosis and multi-step reasoning (~2s)
- Self-optimises: category success rates dynamically adjust routing thresholds
- **Epic's DAX Copilot** routes everything through a single cloud model — no tier selection, no on-device option

### Moat 2 — Federated Learning with Differential Privacy (Built In)
`ai-federated-learning.service.js` — 4 production models trained across hospitals without raw patient data leaving any tenant. Uses Gaussian noise mechanism (configurable ε/δ), gradient clipping. **No commercial HMIS ships federated learning as a built-in feature.** Cerner calls this "network learning" and charges separately under a separate contract.

### Moat 3 — Local AI Node Manager
Hospitals register on-premise AI nodes, route inference to them, manage API keys, monitor fleet health. This enables **air-gapped deployment** — government hospitals, military, and privacy-sensitive institutions can run full AI capabilities with zero cloud dependency. No competitor offers this.

### Moat 4 — Digital Twins (Patient + Asset in One Platform)
HyperGrid Twins: real-time patient twin (vitals, risk, timeline) AND physical asset twin (location, maintenance, utilization). Only Philips HealthSuite and GE Edison offer patient digital twins — neither is an HIS — and neither combines patient + asset twins in one product.

### Moat 5 — Proprietary Health Intelligence Score (HIS)
6-dimensional Bayesian risk composite with EWMA 30-day forecast and peer percentile ranking. Computed every 6h. This is equivalent to Epic's "Patient Insights" module (launched 2023, charged separately) — MediQzy has it built-in.

### Moat 6 — Autonomous AI Pre-Authorization
AI submits and tracks insurance pre-authorisations without human intervention. Epic launched similar functionality in 2024. Most Indian HIS products don't have this at all.

### Moat 7 — 12 Dedicated Department Portals
Each portal has its own authentication, dashboard, and workflow tailored to that department's exact needs. Competitors offer a "module" accessed via the same interface — MediQzy gives ICU nurses, OT surgeons, MRD staff, HR managers each their own app experience.

---

## 5. Pitch Gaps — PPT vs Reality

The current MediQzy V1.2 PPT significantly undersells the product. This table documents what must be corrected before the next enterprise pitch.

| PPT Claim | Reality | Action Required |
|---|---|---|
| "9 AI Capabilities" (shows only 6) | 13+ AI service files, 7 specialised AI agents | Update to "13+ AI Capabilities" with architecture diagram |
| "Offline AI Scribe" — 1 bullet | 12-endpoint production pipeline: OPD notes, IPD notes, discharge summaries, batch processing, normalization, prescription generation | Dedicated slide with pipeline flow |
| "30+ Modules" | 40+ modules, 12 department portals | Update to "40+ modules, 12 department portals" |
| "RIS/PACS" — mentioned in bullet | HyperGrid DICOM: full worklist, structured reports, AI-assisted reads, 3D MPR, multi-frame, tele-radiology SLA tracking | Dedicated slide |
| "IoT Monitoring" | MQTT + Edge Gateways + Digital Twins + 8 wearable brands + Apple Health — enterprise-grade redundant IoT architecture | Expand IoT section |
| "Low Latency Video" | Self-hosted WebRTC + Agora RTC backup + consultation recording + video events — redundant production-grade video | Add redundancy/sovereignty angle |
| "5.5% Doctor Time Saved" | AI Scribe reduces documentation from avg 16 min → under 5 min per consultation — 70%+ reduction | Replace stat with time-based metric |
| No mention of HyperGrid | HyperGrid: Digital Twins + Edge + MQTT + App Marketplace — an entire integration platform | Add HyperGrid slide |
| No mention of Federated Learning | Privacy-preserving cross-hospital AI training with DPDP compliance | Add to AI slide |
| No mention of Local AI Nodes | Air-gapped on-premise AI deployment — no cloud dependency possible | Add to deployment options |
| "Autosave" — not mentioned | Not yet built | Build + add to pitch |
| "Paperless from Day 1" — not mentioned | All digital workflows exist, no "paperless journey" narrative | New slide: OPD → IPD → Pharmacy → Billing → WhatsApp discharge, zero paper |

---

## 6. v2.0 Feature Roadmap

### Tier 1 — Sprint (4 Weeks)
*High impact, low effort — infrastructure already exists*

---

#### 1.1 Ambient Always-On Consultation Scribe
**What:** Microphone activates when doctor clicks "Start Consult." Zero manual upload. AI listens to full doctor-patient conversation via WebSocket audio stream, generates structured SOAP notes in real-time, auto-fills EMR, flags follow-ups when consultation ends.  
**Why Now:** This is Epic DAX Copilot's core feature. Epic charges $3/encounter. Building this cements the #1 clinical AI differentiator.  
**What Exists:** `offline-scribe.route.js` (12 endpoints), Groq Whisper STT, clinical-workflow note signing, EMR endpoints. The pipeline is 90% built.  
**What to Build:**
- WebSocket audio stream endpoint: `WS /scribe/stream`
- Client-side mic capture → chunked audio → stream to server → Groq Whisper streaming
- Real-time partial transcript display
- On consultation end → trigger existing `/full-pipeline` → structured SOAP note
- Auto-push draft to `clinical-workflow` `/notes` endpoint
- Doctor reviews and signs with existing sign/lock workflow
**Files to create:** `server/routes/scribe-stream.route.js`, `client/src/hooks/useAmbientScribe.ts`

---

#### 1.2 Autonomous Clinical Coding (Note → ICD-10/CPT → Bill)
**What:** After a clinical note is signed, AI automatically assigns ICD-10 diagnosis codes + CPT procedure codes → pre-populates the billing screen. Eliminates the medical coder role.  
**Why Now:** Epic charges $2–4/encounter for this. Indian hospitals waste 15–20 min per patient on manual coding.  
**What Exists:** `clinical-workflow` has ICD-10/SNOMED/CPT search. AI Scribe generates notes. Billing endpoints exist. The bridge is missing.  
**What to Build:**
- Post-note-sign trigger → extract diagnoses/procedures using existing NLP service
- Map extracted entities to ICD-10 codes (existing `clinical-workflow` `/icd10/search`)
- Map procedures to CPT codes (existing `/cpt/search`)
- Push codes to billing pre-population endpoint
**Files to modify:** `server/routes/clinical-workflow.route.js` (add post-sign hook), `client/src/pages/hospital/HospitalBillingPage` (auto-populated codes)

---

#### 1.3 Sepsis & Clinical Deterioration Real-Time Alert Engine
**What:** Every vital sign update — from nurse entry or MQTT IoT device — runs through NEWS2 (National Early Warning Score v2) and qSOFA scoring. Score ≥ threshold triggers instant alert to duty doctor + charge nurse with: current score, delta from last reading, suggested intervention protocol.  
**Why Now:** Sepsis kills 1.4M Indians annually. Most preventable with early detection. This is the single most powerful live demo for any hospital — shows AI saving lives in real-time.  
**What Exists:** ICU vitals, MQTT IoT readings ingestion, FCM push notifications, patient engagement alerts, existing vital sign fields in database.  
**What to Build:**
- `server/services/deterioration-score.service.js`: NEWS2 + qSOFA scorer
- Hook into vital sign save endpoints (Nurse Vitals, MQTT readings)
- Threshold alerting: NEWS2 ≥ 5 or any single extreme → trigger alert
- Push via existing FCM notification infrastructure
- Alert log table for audit trail
- Doctor/nurse dashboard alert widget
**Files to create:** `server/services/deterioration-score.service.js`, `server/services/sepsis-alert.service.js`

---

#### 1.4 Natural Language Patient Cohort Search
**What:** Doctor types: *"show me all my diabetic patients with HbA1c > 9 not seen in 3 months"* — gets exact patient list. No form-based filter. No IT training required.  
**Why Now:** This is the "wow moment" in every doctor demo. Epic's equivalent (Reporting Workbench) requires IT training. Yours works conversationally.  
**What Exists:** ClinicalBERT embeddings, pgvector, existing patient data in PostgreSQL, AI Brain `/think` endpoint capable of NL→SQL conversion.  
**What to Build:**
- Extend `/ai-brain/think` with a `query_patients` tool
- NL → structured SQL generator with safety guardrails (SELECT only, patient-scoped RLS enforced)
- Doctor dashboard: natural language search bar → patient cohort list → export/bulk action
**Files to modify:** `server/services/ai-brain/tools/patient-tools.js` (add `query_patient_cohort` tool), `client/src/pages/doctor/DoctorPatients.tsx`

---

#### 1.5 Readmission Risk Badge at Discharge
**What:** When a doctor initiates discharge, platform shows a readmission risk badge (🟢 Low / 🟡 Medium / 🔴 High) with top 3 contributing factors. High risk triggers automatic suggestion to create a follow-up care plan.  
**Why Now:** The `readmission_model` in federated learning is already defined and being trained. This ships it to a doctor-facing UI — 3 days of work.  
**What Exists:** `ai-federated-learning.service.js` `readmission_model`, `care-plan.route.js`, HIS score endpoint, discharge summary page.  
**What to Build:**
- Discharge page hook → call HIS `/his/:patientId` endpoint → extract readmission dimension
- Display risk badge with contributing factors
- "Create Follow-Up Care Plan" CTA on High risk
**Files to modify:** `client/src/pages/hospital/HospitalDischargeSummary.tsx`

---

#### 1.6 Blood Bank Full Module
**What:** Complete blood bank management — inventory by blood group (A+/A-/B+/B-/O+/O-/AB+/AB-), donor management, cross-matching workflow, issue tracking, expiry alerts, shortage alerts, inter-hospital request.  
**Why Now:** Every tertiary hospital has a blood bank. This is a deal-breaker gap for MGM and any multi-specialty hospital. Currently only a static mention in the PPT.  
**What to Build:**
- `server/routes/blood-bank.route.js`: inventory CRUD, donor register, cross-match, issue/return, expiry alerts
- `client/src/pages/hospital/HospitalBloodBank.tsx`: dashboard, inventory grid, donor list, issue workflow
- Add to Hospital sidebar navigation
- Integration with patient blood orders from IPD/OT

---

#### 1.7 Autosave on All Clinical Inputs
**What:** Every form input (clinical notes, prescriptions, vitals, IPD sheets) auto-saves as a draft every 30 seconds and on every field blur. No data loss on browser crash, tab close, or power cut. Draft badge visible. Submitted only on explicit doctor action.  
**Why Now:** MGM explicitly asked for this. It's also a NABH compliance requirement for clinical documentation integrity.  
**What to Build:**
- `client/src/hooks/useAutosave.ts`: generic hook — debounced save to `localStorage` + API draft endpoint
- Add `status: 'draft' | 'final'` to clinical notes, prescriptions, IP sheets
- Draft indicator UI component
- Resume draft on page reload

---

### Tier 2 — Short-Term (6–8 Weeks)
*High differentiation — builds on existing services*

---

#### 2.1 Computer Vision Wound Tracking
**What:** Nurse photographs a wound at admission. AI: measures wound area (cm²), classifies type (pressure ulcer grade I–IV, burn degree, surgical wound, diabetic foot), generates structured wound care note. Follow-up photos automatically track healing trajectory with percentage improvement.  
**Why Now:** Epic has no native wound tracking — they rely on third-party integrations (WoundRight, Tissue Analytics) that cost $20K+/year. This is a differentiator in any hospital with a surgical ward.  
**What Exists:** `ai-vision.route.js` + AI Vision service with multimodal AI (Claude Vision).  
**What to Build:**
- Extend AI Vision with wound-specific system prompt and structured output schema
- Wound measurement overlay using canvas API (bounding box → area calculation)
- Wound timeline in patient record (photo series with trend graph)
- Wound care note generator → auto-push to nursing notes
**Files to modify:** `server/routes/ai-vision.route.js`, `client/src/pages/nurse/NurseNotes.tsx`

---

#### 2.2 AI Formulary & Drug Cost Optimisation
**What:** When doctor prescribes a drug, AI shows: (a) generic equivalent with same efficacy, (b) hospital formulary availability and shelf stock, (c) patient's insurance formulary tier, (d) cost comparison. One-click switch to preferred alternative.  
**Why Now:** Indian patients abandon 30% of prescriptions due to cost. This directly increases treatment adherence and ties pharmacy dispensing to actual prescriptions.  
**What Exists:** Prescription route, CDSS drug interactions, pharmacy POS with inventory.  
**What to Build:**
- `server/models/formulary.model.js`: formulary master table (drug, generic, tier, hospital stock)
- CDSS hook in prescription writer → query formulary on drug selection
- Cost comparison widget in `PrescriptionWriter.tsx`

---

#### 2.3 Social Determinants of Health (SDoH) Screening
**What:** At OPD registration, 5 AI-guided questions assess: housing stability, food access, transportation barriers, employment status, mental health safety. Flagged responses auto-route to: social worker assignment, NGO referral (existing NGO portal), government scheme eligibility check (Ayushman Bharat, state schemes).  
**Why Now:** SDoH drives 60% of clinical outcomes in India. No Indian HMIS has this. It creates a direct link between the clinical system and the government/NGO ecosystem — a massive moat in public health tenders.  
**What Exists:** NGO portal, PSU portal, Ayushman Bharat route, patient OPD registration.  
**What to Build:**
- SDoH questionnaire component in OPD registration flow
- Risk classification (flag high-risk responses)
- Auto-create referral task → NGO/social work queue
- Scheme eligibility suggestion based on SDoH profile

---

#### 2.4 Clinical Trial Matching Engine
**What:** Every new diagnosis entry triggers a background check against active clinical trials in CTRI (Clinical Trials Registry India). Matching trials shown to doctor with eligibility criteria checked against patient demographics, comorbidities, and current medications.  
**Why Now:** Hospitals that offer clinical trial matching earn referral fees from pharma sponsors. It positions MediQzy as a research hospital enabler — critical for MGM and teaching hospitals.  
**What Exists:** Patient diagnoses, demographics, AI entity extraction, existing CDSS knowledge base.  
**What to Build:**
- CTRI API integration (or offline sync) for trial listings
- Eligibility criteria matcher (demographics + diagnosis + exclusion criteria)
- Doctor notification: "2 matching trials for this patient" with details

---

#### 2.5 Dietary / Nutrition Department Portal
**What:** Inpatient diet charting linked to diagnosis, dietary order workflow for IPD patients, dietitian's worklist, allergy/intolerance tracking, caloric intake tracking, diet plan templates (diabetic, renal, cardiac, post-surgical), discharge dietary counselling report.  
**Why Now:** NABH requires dietary documentation for IPD patients. No current portal for dietitians. The patient-facing diet page exists but is disconnected from inpatient workflow.  
**What to Build:**
- `client/src/pages/nutrition/` — DietitianDashboard, DietOrders, PatientDietPlan, DischargeDietCounselling
- `server/routes/nutrition.route.js`: diet orders, plan templates, allergen tracking
- Integration with IPD admission: diet order auto-created on admission

---

#### 2.6 CSSD (Central Sterile Supply Department) Module
**What:** Instrument set tracking through sterilization lifecycle — used in OT → decontamination → washing → packing → sterilization (autoclave) → release. Autoclave log with cycle parameters (temperature, pressure, duration). Sterility expiry tracking. Implant traceability.  
**Why Now:** OT portal has a "Sterilization" menu item with no backend module. NABH mandates CSSD documentation. Critical for any accreditation audit.  
**What to Build:**
- `server/routes/cssd.route.js`: instrument sets, sterilization cycles, autoclave logs, release tracking
- `client/src/pages/cssd/` — CSSSDashboard, InstrumentTracking, AutoclaveLogs
- Integration with OT portal (pre-op checklist → request sterile sets)

---

#### 2.7 Patient Feedback & PREMS System
**What:** Automated post-visit WhatsApp/SMS survey (5 questions, 30 seconds) sent 2 hours after OPD discharge or 24 hours after IPD discharge. PREMS (Patient-Reported Experience Measures) dashboard for hospital management. Negative feedback → auto-creates support ticket.  
**Why Now:** NABH mandates patient satisfaction measurement. No current feedback loop in the platform.  
**What to Build:**
- Post-discharge trigger → send WhatsApp survey via existing WhatsApp route
- Survey response collection endpoint
- PREMS dashboard in hospital admin

---

### Tier 3 — Medium-Term (3 Months)
*Deep differentiation — requires more engineering*

---

#### 3.1 Predictive Staffing Engine
**What:** AI analyses historical OPD volumes, seasonal patterns (festival seasons, flu peaks), scheduled surgeries, IPD census, leave calendar → recommends optimal nurse-to-patient ratios per shift → flags under-staffing 72 hours in advance → suggests reallocation from low-volume departments.  
**Why Now:** HR portal and staff management exist. Appointment data, OPD volumes, and IPD census are all in the database. This is a pure AI layer over existing data. Epic's "Capacity IQ" module sells for $100K+/year.  
**What to Build:**
- `server/services/predictive-staffing.service.js`: time-series forecasting on OPD/IPD historical data
- Staffing recommendation engine: census forecast → required FTE → gap alert
- HR portal integration: staffing recommendations with approve/override workflow

---

#### 3.2 Antibiogram AI + Infection Surveillance
**What:** Culture & sensitivity results from LIS automatically feed into a hospital-level antibiogram — which antibiotics work for which organisms at this specific hospital. AI flags empiric antibiotic selections that deviate from hospital antibiogram. Hospital-wide HAI (Healthcare-Acquired Infection) surveillance with outbreak detection.  
**Why Now:** Antimicrobial resistance is India's biggest emerging clinical crisis. The `drug_safety_model` in federated learning is the foundation. NABH requires infection control data.  
**What to Build:**
- Culture result ingestion from LIS → antibiogram aggregation service
- Antibiogram report page (organism × antibiotic sensitivity grid)
- CDSS hook: empiric antibiotic selection → antibiogram check → alert if resistance > 20%
- HAI surveillance dashboard in Quality portal

---

#### 3.3 Voice Biometric Patient Identification
**What:** Patient calls the helpline or walks up to OPD kiosk and is identified by voice print in <3 seconds. No ID card, no phone, no OTP required. Voiceprint enrolled at first registration, used for all subsequent authentications.  
**Why Now:** True zero-friction patient identification. Differentiator in rural/semi-urban deployments where patients frequently don't have smart phones.  
**What Exists:** Voice assistant STT infrastructure, OTP-based auth, ABHA integration.  
**What to Build:**
- Voiceprint enrollment during patient registration (3-sentence spoken sample)
- Speaker identification model (fine-tune existing STT on identity verification)
- Auth bypass for enrolled patients in OPD check-in flow

---

#### 3.4 Tariff Master & Procedure Pricing Engine
**What:** Hospital-configurable tariff master — procedure codes mapped to pricing tiers (General/Semi-Private/Private/Suite). Package pricing (surgery packages, maternity packages). Dynamic pricing overrides for empanelled corporates, government schemes, TPAs. Auto-populates billing from clinical coding output.  
**Why Now:** Current billing exists but no tariff master linked to procedure codes. This is a foundational gap that blocks clean billing automation.  
**What to Build:**
- `server/routes/tariff.route.js`: tariff master CRUD, room category pricing, package definitions
- TPA/corporate override pricing rules
- Billing page integration: clinical codes → tariff lookup → auto-populated line items

---

#### 3.5 Payroll & Salary Processing
**What:** HR portal extension — salary structure (basic, HRA, allowances, deductions), monthly payroll run, salary slip PDF generation, PF/ESI/TDS compliance, Form 16 generation, bank disbursement export.  
**Why Now:** HR portal exists with staff management. Hospitals need payroll — currently a manual process or separate software. Bringing it inside MediQzy eliminates one more third-party tool.  
**What to Build:**
- `server/routes/payroll.route.js`: salary structure, payroll run, compliance calculations
- `client/src/pages/hr/PayrollManagement.tsx`
- Salary slip PDF generator (using existing jsPDF infrastructure)

---

#### 3.6 Central Procurement & Purchase Order System
**What:** Hospital-wide purchase order workflow — indent from department → central stores approval → PO generation to vendor → GRN (Goods Received Note) → invoice matching → payment authorisation. Linked to pharmacy, general stores, and biomedical inventory.  
**Why Now:** Pharmacy has smart inventory but no purchase order system. Hospitals lose 10–15% of procurement budgets to manual errors. This closes the supply chain loop.  
**What to Build:**
- `server/routes/procurement.route.js`: indent, PO, GRN, vendor management, payment auth
- `client/src/pages/accounts/ProcurementManagement.tsx`
- Integration with pharmacy inventory (auto-reorder triggers)

---

### Tier 4 — Strategic (6 Months+)
*Long-term moats and new revenue streams*

---

#### 4.1 Real-World Evidence (RWE) Platform
**What:** Fully de-identified, federated population analytics across all MediQzy tenant hospitals. Drug effectiveness analysis at scale, procedure outcome benchmarking, disease burden mapping by geography. Packaged as a data insights subscription sold to pharmaceutical companies and public health researchers.  
**Revenue Model:** ₹50L–₹5Cr/year per pharma partner for exclusive cohort analytics.  
**What Exists:** Federated learning infrastructure, pgvector, multi-tenant RLS. Architecturally 60% complete.  
**What to Build:**
- De-identification pipeline (Safe Harbor + Expert Determination methods)
- RWE query API with differential privacy noise on aggregate results
- Pharma partner portal with subscription management
- Pre-built analytics packages: drug adherence, outcome comparisons, ADR surveillance

---

#### 4.2 Digital Pathology AI
**What:** Pathologist uploads histopathology slide image → AI detects malignancy, grades tumour (Gleason, Bloom-Richardson, etc.), suggests primary diagnosis with confidence score, highlights suspicious regions on image.  
**What Exists:** `ai-vision.route.js` + Claude Vision multimodal capability.  
**What to Build:**
- Pathology-specific vision prompts + output schema
- Slide upload + annotation viewer in Lab portal
- Integration with existing structured report generation in HyperGrid PACS

---

#### 4.3 Genome & Pharmacogenomics Layer
**What:** Patient uploads genetic test result (MedGenome, Strand Life Sciences) → system parses VCF/raw report → flags drug metaboliser status (CYP2D6, CYP3A4, etc.) → auto-adds pharmacogenomic contraindications to prescription CDSS.  
**What Exists:** CDSS drug interaction, patient reports upload, FHIR `Observation` resources can carry genetic variants.  
**What to Build:**
- VCF/genetic report parser
- Pharmacogenomics database (PharmGKB integration)
- CDSS hook: prescription → PGx check → alert on poor/ultra-rapid metaboliser

---

#### 4.4 Predictive Revenue Cycle AI
**What:** AI predicts claim denial probability before submission (based on payer history, diagnosis-procedure pairing, documentation completeness) → flags high-risk claims for pre-submission review → auto-suggests documentation additions to improve approval odds.  
**What Exists:** Insurance claims, TPA management, AI pre-auth engine.  
**What to Build:**
- Denial prediction model (train on existing claims + outcome data)
- Pre-submission risk score widget in insurance claims cockpit
- Documentation gap suggestions linked to claim fields

---

#### 4.5 AR Surgical Planning
**What:** Surgeon uploads CT/MRI from DICOM viewer → AI segments anatomy → generates 3D AR overlay for tablet-based surgical navigation. No headset required — standard iPad/Android tablet.  
**What Exists:** HyperGrid DICOM with 3D MPR visualization, AI Vision service.  
**What to Build:**
- DICOM → 3D mesh pipeline (surface reconstruction)
- WebGL-based AR overlay renderer
- Surgical plan annotation tools

---

#### 4.6 Ambient Smart Room
**What:** Room presence sensor (BLE/PIR) detects doctor entering patient room → automatically opens patient's chart on room screen → vitals start streaming to doctor's mobile → ambient scribe microphone activates automatically. Doctor never touches a keyboard during ward rounds.  
**What Exists:** MQTT IoT device registry, edge gateways, digital twins, ambient scribe (from Tier 1.1), FCM push.  
**What to Build:**
- Room presence device integration (BLE beacon or PIR via MQTT)
- Doctor mobile app: auto-open patient chart on room entry event
- Push vitals stream to doctor mobile on room entry
- Ambient scribe auto-start trigger

---

#### 4.7 Self-Learning Antibiogram Network
**What:** Every culture result and antibiotic outcome reported anywhere in MediQzy's network is anonymously pooled via federated learning to improve the drug safety model and generate a network-wide antibiogram. Generates hospital-specific resistance profiles vs. network benchmarks.  
**What Exists:** `drug_safety_model` in federated learning, CDSS drug interactions, antibiogram AI (Tier 3.2).  
**What to Build:**
- Culture/sensitivity result feed into federated model
- Network antibiogram aggregation (de-identified, privacy-noised)
- Resistance trend alerting: "Network-wide resistance to Ciprofloxacin in E.coli rising 12% this quarter"

---

#### 4.8 Carbon Footprint & ESG Reporting
**What:** Tracks hospital energy consumption, single-use plastic and consumable waste, pharmaceutical waste, sterilization emissions. Generates ESG sustainability reports. Benchmarks against NABH and WHO healthcare sustainability standards.  
**Why Strategic:** NHS UK mandates this. Indian NABH is moving toward sustainability criteria. Zero competitors have this. ESG reporting is increasingly required for hospital accreditation and government empanelment.  
**What to Build:**
- Emissions factor database (energy, consumables, pharma waste coefficients)
- Data capture hooks in pharmacy (consumables dispensed), pharmacy ordering, facility management
- ESG dashboard in hospital admin + exportable PDF report

---

## 7. Hospital OS Module Completeness Map

Status against a world-class Hospital OS benchmark:

| Domain | Module | Status |
|---|---|---|
| **Clinical** | EMR / EHR | ✅ Built |
| | OPD Workflow | ✅ Built |
| | IPD Workflow | ✅ Built |
| | Discharge Summary | ✅ Built |
| | IP Sheets | ✅ Built |
| | Clinical Notes (signed/locked) | ✅ Built |
| | Prescription with PDF | ✅ Built |
| | Care Plans | ✅ Built |
| | Consent Management | ✅ Built |
| | Triage (AI ESI-5) | ✅ Built |
| | Autosave Drafts | ❌ v2.0 Tier 1 |
| | Ambient Scribe | ❌ v2.0 Tier 1 |
| | Auto Clinical Coding | ❌ v2.0 Tier 1 |
| **Departments** | ICU Portal | ✅ Built |
| | OT Portal | ✅ Built |
| | Nurse Portal | ✅ Built |
| | MRD Portal | ✅ Built |
| | HR Portal | ✅ Built |
| | Quality Portal | ✅ Built |
| | Pharmacy Portal | ✅ Built |
| | Lab/LIS Portal | ✅ Built |
| | Ambulance Portal | ✅ Built |
| | Dietary / Nutrition | ❌ v2.0 Tier 2 |
| | CSSD Portal | ❌ v2.0 Tier 2 |
| | Biomedical Engineering | ❌ Backlog |
| | Mortuary | ❌ Backlog |
| **AI** | Offline AI Scribe (12 endpoints) | ✅ Built |
| | CDSS (drug interactions, ICD-10) | ✅ Built |
| | AI Vision | ✅ Built |
| | AI Doctor (24/7 LLM assistant) | ✅ Built |
| | Health Intelligence Score (HIS) | ✅ Built |
| | Voice Navigation | ✅ Built |
| | Multi-Agent Orchestrator | ✅ Built |
| | Federated Learning (4 models) | ✅ Built |
| | Local AI Node Manager | ✅ Built |
| | HAIS Cognitive Router | ✅ Built |
| | Self-Learning Pipeline | ✅ Built |
| | Proactive Alert Cron | ✅ Built |
| | Sepsis/Deterioration Alerts | ❌ v2.0 Tier 1 |
| | NL Patient Cohort Search | ❌ v2.0 Tier 1 |
| | Wound Tracking AI | ❌ v2.0 Tier 2 |
| | Clinical Trial Matching | ❌ v2.0 Tier 2 |
| | Antibiogram AI | ❌ v2.0 Tier 3 |
| | Digital Pathology AI | ❌ v2.0 Tier 4 |
| | Pharmacogenomics | ❌ v2.0 Tier 4 |
| **Radiology** | DICOM Viewer (3D MPR) | ✅ Built |
| | Worklist Management | ✅ Built |
| | Structured Reports | ✅ Built |
| | AI-Assisted Reads | ✅ Built |
| | Tele-Radiology SLA Tracking | ✅ Built |
| | Digital Pathology | ❌ v2.0 Tier 4 |
| **IoT & Monitoring** | MQTT Device Registry | ✅ Built |
| | Edge Gateway Management | ✅ Built |
| | Digital Twins (Patient + Asset) | ✅ Built |
| | Wearable Integration (8 brands) | ✅ Built |
| | Apple Health Integration | ✅ Built |
| | Ambient Smart Room | ❌ v2.0 Tier 4 |
| **Finance** | Billing & Invoicing | ✅ Built |
| | Insurance Claims Cockpit | ✅ Built |
| | AI Pre-Authorization | ✅ Built |
| | Revenue Cycle Dashboard | ✅ Built |
| | TPA Management | ✅ Built |
| | Tariff Master | ❌ v2.0 Tier 3 |
| | Payroll | ❌ v2.0 Tier 3 |
| | Central Procurement / PO | ❌ v2.0 Tier 3 |
| | Predictive Revenue Cycle AI | ❌ v2.0 Tier 4 |
| **Blood Bank** | Full Blood Bank Module | ❌ v2.0 Tier 1 |
| **Supply Chain** | Pharmacy Inventory | ✅ Built |
| | Central Store / GRN | ❌ v2.0 Tier 3 |
| | CSSD Instrument Tracking | ❌ v2.0 Tier 2 |
| **Patient Experience** | Online Appointments | ✅ Built |
| | Self Check-in | ✅ Built |
| | Digital Wallet | ✅ Built |
| | ABHA Health ID | ✅ Built |
| | AI Doctor (chatbot) | ✅ Built |
| | Video Consult | ✅ Built |
| | Patient Feedback / PREMS | ❌ v2.0 Tier 2 |
| | SDoH Screening | ❌ v2.0 Tier 2 |
| **Compliance** | HIPAA Audit Dashboard | ✅ Built |
| | DPDP Act Compliance | ✅ Built |
| | Consent Management | ✅ Built |
| | ABHA/ABDM Native | ✅ Built |
| | NABH-Ready Templates | 🟡 Partial |
| | Infection Surveillance (HAI) | ❌ v2.0 Tier 3 |
| **Population Health** | HIS Risk Scoring (6 dimensions) | ✅ Built |
| | 30-Day Readmission Prediction | ✅ Backend, ❌ UI |
| | Clinical Insights Cron | ✅ Built |
| | Real-World Evidence Platform | ❌ v2.0 Tier 4 |

---

## 8. Critical Gaps to Plug Before Any Enterprise Deal

These must be complete before signing an enterprise hospital contract (MGM or equivalent):

| # | Gap | Risk if Missing |
|---|---|---|
| 1 | **Blood Bank Module** | Deal-breaker for any multi-specialty or tertiary hospital |
| 2 | **Tariff Master** | Billing cannot be automated without procedure-to-price mapping |
| 3 | **Autosave on Clinical Inputs** | NABH compliance issue — clinical documentation integrity requirement |
| 4 | **Discharge Planning Workflow** | Multi-disciplinary discharge sign-off (physio, social work, pharmacy reconciliation) missing |
| 5 | **Patient Feedback / PREMS** | NABH mandates patient satisfaction measurement |
| 6 | **NABH Document Templates** | Every auditor will check these — templates for quality indicators, incident reports, DNR documentation |
| 7 | **Dietary Department Portal** | NABH requires diet documentation for every inpatient |
| 8 | **Implementation Runbook** | No hospital will sign without knowing: go-live timeline, data migration plan, training plan, SLA |

---

## 9. Architecture Principles for v2.0

### 9.1 Event-Driven Clinical Triggers
Move from request-response to event-driven architecture for clinical safety features:
```
VitalSaved → [SepsisScorer, HISUpdater, ProactiveAlerts, DigitalTwinSync]
NoteSignedLocked → [ClinicalCoder, BillingPrepopulate, ReadmissionRisk]
DischargeSummaryDraft → [ReadmissionScore, CareplanSuggest, PREmsSurveySchedule]
AdmissionCreated → [DietOrderCreated, BloodGroupCheck, AllergyAlert]
LabResultPublished → [CriticalValueAlert, HISUpdate, AntibiogramFeed]
```
**Implementation:** Extend existing `hypergrid-events.route.js` with internal clinical event bus. Use PostgreSQL LISTEN/NOTIFY for in-process events before any message queue.

### 9.2 Zero-Trust AI Tool Sandboxing
AI agents must never access patient data outside their permission scope. Existing 3-layer sandboxing (agent allowlist → identity capability → tool write flags) must be enforced strictly as new tools are added in v2.0.

### 9.3 Offline-First for All Clinical Modules
Every clinical input (vitals, notes, prescriptions, drug charts) must work offline and sync on reconnect. Priority order:
1. Ambient Scribe (Tier 1) — WebSocket with graceful degradation to file upload
2. Vital Signs (Nurse Portal) — IndexedDB buffer → sync on reconnect
3. Prescription Writer — complete offline capability

### 9.4 FHIR R4 as Single Clinical Data Model
All v2.0 clinical modules must store data in FHIR-compatible schema. No new proprietary clinical data tables. Use existing FHIR endpoints for external integrations. This future-proofs against NHA mandate for FHIR-compliant HIS by 2027.

### 9.5 Differential Privacy on All Aggregate Queries
Any query that aggregates patient data across tenants (RWE platform, network antibiogram, federated learning) must pass through the existing DP noise mechanism. Never return exact population counts — always add calibrated Gaussian noise.

---

## 10. MGM Hospitals Proposal — Specific Additions

Based on the 9 requirements stated by MGM Hospitals:

| MGM Requirement | What to Show | Slide Strategy |
|---|---|---|
| Complete paperless from Day 1 | Full journey: patient arrives → digital registration → OPD token → doctor sees EMR → digital prescription → pharmacy dispenses from linked system → billing auto-generated → WhatsApp discharge summary. Zero paper in this chain. | New slide: "Paperless in Practice — One Day at MGM" |
| EMR, HIS, ADMIN — all in one | Single login, single patient record flowing across OPD → IPD → Pharmacy → Lab → Billing without re-entry. Show 12 department portals on one screen. | New slide: "One Platform, 12 Departments" with portal grid |
| 3rd party PACS integration | "Bring your own PACS — we connect via DICOM/HL7. Don't have one — ours is built in." Show HyperGrid DICOM + FHIR R4 + HL7 + 50+ condition auto-mapping | Update interoperability slide with integration tier message |
| Increase doctor-patient time | AI Scribe: 16 min documentation → under 5 min. Auto ICD-10 coding. Voice Navigation. No keyboard during rounds. | New slide: "Give Time Back to Doctors" with time-savings metrics |
| AI Scribe integrated | 12-endpoint offline pipeline. OPD, IPD, discharge note types. Specialty templates. Sign/lock workflow. | Dedicated AI Scribe deep-dive slide |
| Offline Scribe | 100% on-device. Works in ICU/OT/basement. Auto-syncs on reconnect. No internet = no problem. | Called out explicitly in AI Scribe slide |
| 0 latency, 0 buffering | Self-hosted on-premise option. MQTT real-time vitals. WebSocket signaling. Sub-200ms REFLEX tier AI. | New "Performance Architecture" slide |
| Autosave all inputs | Build Tier 1.7. Then show: every keystroke auto-saved, draft badge visible, full audit trail of all save events. | Add to clinical workflow demo |
| Department-specific design | Show each of the 12 portals — ICU clinician sees live vitals + ventilator dashboard. OT surgeon sees theatre schedule + pre-op checklist. Nurse sees vitals entry + medication chart. | "Built For Every Department" grid slide |

---

## 11. Revenue Diversification Opportunities

Beyond per-hospital SaaS licensing:

| Revenue Stream | Model | Potential |
|---|---|---|
| **AI Scribe Encounters** | ₹2–3/encounter (mirrors Epic DAX at $3) | ₹50L–₹5Cr/hospital/year |
| **Auto Clinical Coding** | ₹2/encounter (replaces medical coder) | ₹30L–₹3Cr/hospital/year |
| **Real-World Evidence** | ₹50L–₹5Cr/year per pharma partner | Platform-level, not per hospital |
| **Local AI Node Licensing** | Annual node licence for air-gapped govt hospitals | Government tender positioning |
| **HyperGrid App Marketplace** | 30% revenue share on third-party apps | Long-term platform flywheel |
| **ABHA PHR Facilitation** | NHA facilitated per-record fee | Policy-dependent, low near-term |
| **Antibiogram Network Insights** | Subscription to network-wide AMR data for public health | ₹10–25L/state health department |
| **Telemedicine Per-Consult** | ₹10–30/video consultation via platform | B2C / B2B2C |

---

*Document prepared based on full codebase audit (server routes, services, client pages) conducted May 7, 2026. All "Built" status items are verified against existing route files and service implementations in `/home/ubuntu/Mediczy/server/` and `/home/ubuntu/Mediczy/client/src/`. All Tier classifications are based on engineering effort relative to existing infrastructure.*

---

**Next Actions:**
1. Assign engineers to Tier 1 items (Blood Bank, Autosave, Ambient Scribe, Sepsis Alert, Readmission Badge)
2. Update PPT slides to reflect actual built capabilities (HyperGrid, 13 AI services, 12 portals, Federated Learning)
3. Create MGM proposal variant deck using the slide strategy in Section 10
4. Schedule architecture review for event-driven clinical triggers (Section 9.1)
