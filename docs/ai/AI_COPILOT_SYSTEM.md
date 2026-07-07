# Mediqzy AI Copilot System — Architecture & Module/Department Coverage

**Owner:** AI CTO
**Audience:** Product, Engineering, Clinical Governance, Sales Engineering
**Status:** Production (`/api/v3/ai-brain/*`), surfaced across multiple portals
**Related:** `CLAUDE.md`, `docs/ai/SAMD_READINESS_SCORECARD.md`, `docs/ai/AI_INTERPRETABILITY_AND_QUALITY_GATES.md`, `docs/ai/ADMIN_AI_COPILOT_IMPLEMENTATION_PLAN.md`

---

## 1. Executive Summary

Mediqzy's AI Copilot is **not a chatbot bolted onto the app**. It is a single, governed **multi-agent AI brain** (`server/services/ai-brain/`) that every portal and department calls through one control plane. The same brain powers the admin ops copilot, the doctor's voice assistant (Dr. iSHA), the clinical decision-support copilot, the insurance/TPA copilot, the analytics copilot, and the departmental assistants.

**One brain, many faces.** Each surface is a *persona/agent* over the same orchestrator, permission engine, tool library, LLM cascade, and audit trail — so behavior, security, and governance are consistent everywhere.

```
              ┌──────────────────────────────────────────────────────────┐
  Portals /   │                 AI BRAIN CONTROL PLANE                    │
  Departments │  identity → permissions → plan → route → execute → audit │
     │        └──────────────────────────────────────────────────────────┘
     │            │              │              │              │
  Admin Copilot  Doctor iSHA   Clinical CDSS  Insurance/TPA  Dept assistants
  (ops/analytics (voice + chat) (differentials, (pre-auth,    (dietary, consent,
   /revenue      appointments,  ICD-10, drug    claims,        biomedical, …)
   /quality)     patient data)  interactions)   eligibility)
```

---

## 2. Core Architecture (the shared brain)

Location: `server/services/ai-brain/`
Primary endpoint: `POST /api/v3/ai-brain/agents/process` (also `/think`, `/agents/available`, `/agents/all`, `/agents/history`, `/agents/telemetry`, `/tools`, `/documents` for RAG upload, `/health`).

### 2.1 Execution flow (`multi-agent-orchestrator.js`)

1. **resolveIdentity()** — JWT / API key → role + capabilities.
2. **Permission gate** — can this identity invoke agents at all?
3. **planTasks()** — classify intent → build a task DAG.
4. **routeAgents()** — assign tasks to agents by intent + permission.
5. **executeGraph()** — run tasks (parallel where independent, sequential for dependencies), each agent looping tool-calls up to its iteration cap.
6. **aggregateResults()** — merge multi-agent outputs into one coherent answer.
7. **auditLog()** — persist the full run to `ai_agent_runs` (user, org, role, task plan, agents used, tokens, latency, status).

Design invariants:
- **Agents never decide permissions — the Brain does.** Agents are stateless, sandboxed workers.
- **Fail-open on non-critical errors** — partial results beat total failure.
- Hard wall-clock timeout (`AGENT_RUN_TIMEOUT_MS`, default 30s) prevents hangs.

### 2.2 The agents (`agent-registry.js`)

| Agent | Icon | Purpose | LLM tier | Writes? |
|---|---|---|---|---|
| **Admin** | ⚙️ | Privileged system operator — config, audit, all tools | high | yes |
| **Clinical** | 🩺 | Doctor/nurse decision support, notes, differentials, orders | high | yes (patient) |
| **Analyst** | 📊 | Read-only analytics, population/financial trends | standard | no |
| **Worker** | ⚙️ | Task execution — scheduling, reminders, follow-ups | standard | appts only |
| **Research** | 🔬 | Medical knowledge retrieval + synthesis (no patient data) | standard | no |
| **Insurance** | 🏥 | Pre-auth, claims, eligibility, billing (TPA) | standard | financial |
| **Emergency** | 🚨 | Critical-care triage, priority 100 (runs first) | high | yes (patient) |

Each agent carries a **tool allowlist**, a **required capability**, token/iteration caps, and a **system-prompt suffix** that narrows its scope (e.g., the Clinical agent must cite evidence and flag critical values like BP > 180/120, SpO₂ < 92%).

### 2.3 Three-layer tool sandboxing

- **Layer 1 — Identity/RBAC** (`agent-permission-engine.js`): role → capability set. Roles ascend: `viewer → patient → external_api → nurse → analyst → doctor → hospital_admin → platform_admin`. Capabilities are fine-grained (`invoke:clinical_agent`, `tools:exec_write`, `data:read_patient`, `llm:high_reasoning`, `system:view_audit`, …).
- **Layer 2 — Agent allowlist** (`agent-registry.js`): even if a user is broadly privileged, the chosen agent can only call its own allowlisted tools.
- **Layer 3 — Tool flags** (`tools/index.js`): every tool is tagged `isWrite` / `isSystem`; write/system tools require the matching capability.

### 2.4 Tool library (`server/services/ai-brain/tools/`)

Grouped, capability-gated tools the agents call to take **real actions** (not just talk):
- **Patient** — profile, vitals, history, allergies, meds; write notes/vitals/meds.
- **Appointments** — book / reschedule / cancel / slots / reminders.
- **Labs** — results, history, radiology reports; order tests.
- **Wellness** — health score, medication schedule, diet/exercise plans.
- **Intelligence** — drug-interaction check, emergency triage, risk score, differential, symptom analysis.
- **Finance/Insurance** — invoice, payment status, eligibility, claims, pre-auth, TPA.
- **RAG/Knowledge** — search knowledge base, clinical guidelines, drug info, literature.
- **Memory** — per-user long-term memory.
- **System (admin-only)** — list agents, system status, audit logs, agent metrics, governance queue.

### 2.5 LLM cascade + cost/latency intelligence (`llm-provider.js`, `cognitive-router.js`)

- **Cascade:** iSHA / **bi-medix2** (clinical model, "high") → **Groq** (Llama, "standard") → OpenAI / local SLM ("basic"). Falls through gracefully if any provider is down.
- **Cognitive router:** classifies each request as **reflex / standard / deep** and picks the cheapest tier that can do the job (deep clinical reasoning gets a longer budget).
- **Semantic cache:** repeated/similar clinical queries served from cache (scoped for PHI safety).
- **Evaluation engine:** every call emits telemetry that self-optimizes routing over time.
- **Anti-hallucination guardrails** and grounding via the **RAG pipeline** (upload clinical PDFs → retrieval-augmented answers with citations).

---

## 3. Copilot surfaces — by module / department

Every surface below is the **same brain** with a different persona, permission scope, and UI.

### 3.1 Admin / Platform Ops Copilot
- **Where:** `/admin/copilot` (`client/src/pages/admin/AdminCopilot.tsx`, `services/adminCopilot.ts`)
- **Four personas** (each pins a `forceAgent`):
  - **Operations** → *admin agent*: system status, registered agents, audit log, governance queue.
  - **Analytics** → *analyst agent*: tenant stats, LLM provider performance, error trends, revenue summary.
  - **Revenue & TPA** → *insurance agent*: pending pre-auths, claims summary, billing anomalies.
  - **Quality & Safety** → *clinical agent*: quality-gate failures, SaMD governance changes, triage escalation patterns, demographic-parity status.
- **Advantage:** admins run the hospital by *asking questions*, with high-risk writes gated behind human approval.

### 3.2 Doctor Copilot — **Dr. iSHA** (voice + chat)
- **Where:** `/doctor/assistant` (`DoctorVoiceAssistant.tsx`), hospital variant at `/hospital/voice-assistant`.
- **Voice-first:** wake word "Hey iSHA", LiveKit audio, ElevenLabs/OpenAI TTS, Whisper STT — with an **on-device Web-Speech fallback** so it keeps working with zero cloud keys.
- **Actions:** list/book/cancel/reschedule appointments, patient health + vitals, drug info & interactions, clinical notes, tasks/reminders, proactive briefings, in-app navigation, and medical Q&A.
- **Routing:** deterministic fast-paths for common commands; LLM (Groq for instruction-following JSON intent) for the rest; medical answers cascade through iSHA/bi-medix2. Confirmation short-circuit for "yes/confirm" on pending cancel/reschedule.
- **Advantage:** hands-free at the point of care; the physician stays the decision-maker.

### 3.3 Clinical Decision Support (CDSS) Copilot
- **Where:** doctor triage / CDSS (`/doctor/triage`, hospital `clinical-cdss`).
- **Capabilities:** specialty-aware diagnosis/treatment/dosage/guideline queries, differential diagnosis, lab suggestions, critical warnings, **ICD-10 codes**, references; **CIMS-backed** medication alternatives; **drug-drug interaction** checks.
- **Advantage:** faster point-of-care thinking, grounded in the medical knowledge base + uploaded PDFs.

### 3.4 Insurance / TPA / Revenue Copilot
- **Where:** insurance desk + admin "Revenue & TPA" persona (*insurance agent*).
- **Capabilities:** pre-auth checks, claims processing, eligibility, TPA details, billing anomaly detection — built for **NHCX** workflows.
- **Advantage:** faster cashless claims, fewer denials, revenue-leak detection.

### 3.5 Analytics Copilot
- **Where:** admin "Analytics" persona (*analyst agent*, read-only).
- **Capabilities:** tenant stats, LLM performance, error trends, revenue summaries — always with sample size + confidence caveats.

### 3.6 Emergency / Triage Copilot
- **Where:** ER triage flows (*emergency agent*, priority 100).
- **Capabilities:** ESI/ESI-style 5-level triage (RED/ORANGE/YELLOW/GREEN/BLUE), fastest response, safety-first escalation.
- **Governance:** classified as high-risk SaMD → interpretability (LIME) + quality gates.

### 3.7 AI Scribe (ambient documentation)
- **Where:** doctor/clinic `voice-scribe`.
- **Capabilities:** listens to the consultation → structured clinical note; **offline** (whisper.cpp) + **multilingual** (Indian languages).
- **Governance note:** NOT SaMD *only if* a physician reviews & signs every note before it enters the record.

### 3.8 Departmental assistants
- **Dietary** (`DietaryAIAssistant.tsx`), **Consent** (`ConsentAIAssistant.tsx`), **Biomedical** (`BiomedicalAIAssistant.tsx`), plus the floating **Dr. iSHA** patient/general health assistant (`FloatingDrISHA.tsx`, `DrISHAChat.tsx`).
- **Team/Corporate Copilot** (`TeamCorporateManagement.tsx`) — corporate-admin actions with tool-call execution and anti-hallucination guardrails.
- **Advantage:** every department gets a task-aware assistant without a new backend — they inherit the same governance and tools.

---

## 4. Security & governance (why this is safe for healthcare)

- **RBAC/ABAC before any agent runs** — capability checks, not vibes.
- **Sandboxed tools** — 3 enforcement layers; write/system tools need explicit capability + (for high-risk writes) human approval.
- **Full audit trail** — every run in `ai_agent_runs` (who, what agent, tools, tokens, latency, outcome); PHI masked in logs.
- **SaMD governance hooks** (per `CLAUDE.md`): clinical AI outputs carry a **confidence score** + **explanation (SHAP for tabular, LIME for triage/text)**, pass **pre-flight quality gates** (`ai-quality-gates.service.js`), and model/threshold/prompt changes flow through **medical-director review** (`ai-model-governance.service.js`) with **drift (PSI)** and **demographic-parity** monitoring. Nothing self-learns into production autonomously.
- **Kill switch / rate limits** via the SIB guard layer.

---

## 5. Advantages (the "so what")

**Product & clinical**
1. **Action, not just chat** — copilots *do* things (book, cancel, order, claim, note) through governed tools.
2. **Voice-first & hands-free** for clinicians; **offline + multilingual** where connectivity is poor.
3. **Grounded & explainable** — RAG citations, confidence scores, SHAP/LIME — trust at the point of care.
4. **Physician-in-control** by design — assists, never overrides.

**Engineering & economics**
5. **One brain, many faces** — every department reuses the same orchestrator/tools/LLM/audit → faster feature velocity, consistent behavior, lower maintenance.
6. **Resilient LLM cascade** — no single-vendor dependency; graceful fallback (down to on-device voice).
7. **Cost/latency-optimized** — cognitive tiering + semantic cache + self-optimizing routing spend the minimum needed per query.
8. **Multi-tenant & role-scoped** — the same copilot safely serves platform admins, hospital admins, doctors, nurses, analysts, and external API partners with different powers.

**Business & compliance**
9. **Regulatory moat** — SaMD-grade governance (CDSCO/FDA/EU-aligned), interpretability, drift monitoring, model cards, change control. Competitors can copy a chatbot; they can't quickly copy the governance.
10. **Revenue impact** — insurance/TPA copilot speeds cashless claims and flags billing anomalies; analytics copilot surfaces leakage; ops copilot cuts admin time.

---

## 6. Quick reference

| Concern | Where |
|---|---|
| Endpoint | `POST /api/v3/ai-brain/agents/process` (`forceAgent`, `conversationHistory`) |
| Orchestrator | `server/services/ai-brain/multi-agent-orchestrator.js` |
| Agents | `server/services/ai-brain/agent-registry.js` |
| Permissions | `server/services/ai-brain/agent-permission-engine.js` |
| Tools | `server/services/ai-brain/tools/*` |
| LLM cascade | `server/services/ai-brain/llm-provider.js` + `cognitive-router.js` |
| Admin Copilot UI | `client/src/pages/admin/AdminCopilot.tsx` + `services/adminCopilot.ts` |
| Doctor voice copilot | `client/src/pages/doctor/DoctorVoiceAssistant.tsx` + `server/routes/voice-assistant.route.js` |
| Governance | `ai-quality-gates.service.js`, `ai-model-governance.service.js`, `ai-interpretability.service.js` |
| Audit | `ai_agent_runs` table |

---
*Positioning note: describe SaMD compliance as "built to CDSCO/FDA/EU frameworks and governance-ready," not "certified," until certification is formally granted.*
