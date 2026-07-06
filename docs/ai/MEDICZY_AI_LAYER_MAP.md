# Mediczy AI Layer Map
**One-page capability map — aligned to SaMD Readiness Scorecard (22/27 · 81%)**

| Document ID | MED-AI-LAYER-001 |
|---|---|
| Version | 1.0 |
| Date | 2026-06-17 |
| Owner | AI CTO |
| Co-owners | Medical Director · Platform Engineering · AI Engineering |
| Review cycle | Quarterly (with SaMD scorecard) |
| Related | [SAMD_READINESS_SCORECARD.md](./SAMD_READINESS_SCORECARD.md) · [AI_MODEL_CARDS.md](./AI_MODEL_CARDS.md) |

---

## 1. The 7 Layers — Mediczy Positioning

```
┌─────────────────────────────────────────────────────────────────┐
│  L7  AGI — NOT IN SCOPE (human-level general intelligence)      │
├─────────────────────────────────────────────────────────────────┤
│  L6  AGENTIC — goal-driven, tool-using copilots                 │
├─────────────────────────────────────────────────────────────────┤
│  L5  GENERATIVE — LLM text / reasoning / content                │
├─────────────────────────────────────────────────────────────────┤
│  L4  DEEP LEARNING — embeddings, representation learning        │
├─────────────────────────────────────────────────────────────────┤
│  L3  NEURAL NETWORKS — STT, NLP classifiers, vision             │
├─────────────────────────────────────────────────────────────────┤
│  L2  MACHINE LEARNING — statistical prediction, drift           │
├─────────────────────────────────────────────────────────────────┤
│  L1  CLASSICAL AI — rules, workflows, validation, data truth    │
└─────────────────────────────────────────────────────────────────┘
```

**Operating principle:** Outer layers deliver user-facing intelligence; **Layer 1 must be correct or every outer layer fails.** Recent doctor-app incidents (slot duration, vitals read path, SIB routing) were L1/L6 integration defects — not model quality issues.

**Product boundary:** Mediczy operates at **L1–L6**. L7 (AGI) is explicitly excluded from product claims, regulatory filings, and marketing.

---

## 2. Service Registry by Layer

| Layer | Service / Route | Primary function | SaMD class | Model card key | Engineering owner | SLO target |
|---|---|---|---|---|---|---|
| **L1 Classical** | `doctor-availability.route.js` · `doctor-settings.route.js` | Slot rules, schedule persistence, booking windows | Not SaMD | — | Platform Eng | API p99 < 300 ms · 0 contract-test failures |
| **L1 Classical** | `doctor.route.js` (vitals, patients) | Clinical data CRUD, IDOR guards | Not SaMD | — | Platform Eng | POST→GET parity 100% on vitals |
| **L1 Classical** | `ai-quality-gates.service.js` | 8 pre-flight safety checks | Envelope for all SaMD | — | AI Safety Eng | 100% gate execution on diagnostic outputs |
| **L1 Classical** | `ai-model-governance.service.js` | PCCP, model cards, drift, change log | Governance | All 7 cards | AI CTO + Med Director | 0 unapproved model changes applied |
| **L2 ML** | `ai-health-risk-cron.service.js` | Patient risk scoring (6h) | Class IIb | `health-risk-scoring-v2-bayesian` | AI Eng | Cron success ≥ 99% · SHAP on every score |
| **L2 ML** | `ai-model-governance.service.js:runDriftMonitor()` | PSI drift (weekly) | Surveillance | — | AI Safety Eng | PSI alert within 24 h of > 0.20 |
| **L2 ML** | `evaluation-engine.js` | Prompt telemetry, dry-run optimization | Ops | — | AI Eng | Weekly eval report |
| **L3 Neural** | `voice-assistant.route.js` `/stt` | Groq Whisper + local fallback | Not SaMD | `medical-scribe-whisper-bimedix`* | AI Eng | STT p95 < 2 s · WER monitored |
| **L3 Neural** | `intentClassifier.js` | Patient intent routing | Class I | — | AI Eng | Intent accuracy ≥ 95% on golden set |
| **L4 Deep** | `rag-pipeline.js` · `semantic-cache.service.js` | Embeddings, RAG retrieval | Class II (CDSS) | — | AI Eng | Retrieval recall@5 ≥ 0.85 on eval set |
| **L4 Deep** | `scoring-model.js` | Feature extraction for brain | Class II | — | AI Eng | Feature completeness logged |
| **L5 Generative** | `llm-provider.js` | SIB → Groq cascade (all LLM calls) | Router | `isha-buzz-bimedix2` | AI Platform Eng | Availability ≥ 99.5% · p95 < 8 s |
| **L5 Generative** | `medical-ai.route.js` `/consult` | Dr. iSHA patient/clinician chat | Class IIb | `isha-buzz-bimedix2` | AI Eng | Golden-set pass ≥ 90% · history on fallback |
| **L5 Generative** | `cdss.service.js` | Evidence-based CDSS queries | Class II | — | AI Eng | Citation rate ≥ 80% on clinical Q&A |
| **L5 Generative** | `ai-emergency-triage.service.js` | ESI 5-level triage | **Class III** | `emergency-triage-esi-v1` | AI Safety Eng | ESI-1/2 sensitivity ≥ 0.95 (validation target) |
| **L5 Generative** | `ai-drug-interaction.service.js` | Interaction checking | **Class III** | `drug-interaction-checker-v1` | AI Safety Eng | 0 missed critical pairs on test set |
| **L5 Generative** | `offline-scribe.route.js` | Note generation | Not SaMD* | `medical-scribe-whisper-bimedix` | AI Eng | Physician review required before commit |
| **L6 Agentic** | `voice-assistant.route.js` `/agent` | Doctor copilot: JSON intent + tools | Class II | — | AI Eng | Intent parse ≥ 92% · tool success ≥ 98% |
| **L6 Agentic** | `ai-brain/orchestrator.js` | Multi-agent think pipeline | Class II | — | AI Eng | End-to-end trace per request |
| **L6 Agentic** | `ai-self-learning-pipeline.service.js` | Continuous learning (governed) | Governed | — | AI CTO | 100% changes via `proposeChange()` |
| **L6 Agentic** | `whatsapp-sib-brain.service.js` | WhatsApp Dr. iSHA agent | Class I–II | — | AI Eng | Session continuity · escalation paths |
| **L7 AGI** | — | **Not implemented · not planned** | — | — | — | — |

\*Scribe is NOT SaMD only when every note requires physician review before commit.

---

## 3. SaMD Scorecard Cross-Reference

| Scorecard pillar | Score | Layer(s) served | Key services | Open gap |
|---|---|---|---|---|
| Technical interpretability | 5/5 | L2, L4, L5 | `ai-interpretability.service.js` | — |
| Model governance & PCCP | 3/3 | L1, L6 | `ai-model-governance.service.js` | — |
| Monitoring & surveillance | 2/2 | L2 | Drift monitor, demographic parity | — |
| Safety & quality gates | 1/1 | L1 (envelope) | `ai-quality-gates.service.js` | — |
| Audit & traceability | 1/1 | All | `ai_quality_gate_log`, `isha_audit_log`, `sib_decision_log` | — |
| SaMD vigilance | 3/3 | L1 | Adverse events, version pinning, IUS | — |
| CDSCO filing infrastructure | 4/4 | L1 | Regulatory doc generator | External submission pending |
| Post-market surveillance | 2/2 | L2 | PMS tooling + SOP | — |
| **Clinical validation** | 2/2* | L2, L5 | Risk scoring, triage | *In-house complete; external study for Class III |
| Quality management (ISO 13485) | 2/2* | All | 13 QMS docs | *In-house docs; certification pending |
| Risk management (ISO 14971) | 1/1 | All | FMEA (8 hazards) | — |
| DPDP privacy | 1/2 | L5 | PIA complete | LLM provider DPAs + DPO |
| External regulatory filing | 0/2 | — | — | CDSCO + FDA/CE submission |

**Overall: 22/27 (81%)** — all in-house software items complete; external filing and DPDP provider contracts remain.

---

## 4. Dr. iSHA — Dual-Path Architecture (L5 + L6)

| Surface | Route | Layer | Context sent | Known risk | Target SLO |
|---|---|---|---|---|---|
| **iSHA Assistant** (doctor mobile/web) | `POST /api/voice-assistant/agent` | L6 Agentic | Screen path, history (10 turns), doctor name | JSON intent fragility; minimal patient context | Intent parse ≥ 92% |
| **Dr. iSHA Chat** (patient + clinician) | `POST /api/medical-ai/consult` | L5 Generative | Session history (15 turns), patient data, channel | Two-path divergence from assistant | Golden-set ≥ 90% |
| **AI Doctor Assist** | `GET /api/cdss/knowledge/query` | L5 Generative | Structured CDSS query | Lower risk — evidence lookup | Citation rate ≥ 80% |
| **Shared router** | `llm-provider.js` → SIB → Groq | L5 | All LLM traffic | Port/config drift (fixed 2026-06-17) | SIB availability ≥ 99.5% |

**CTO action (Q3 2026):** Unify doctor copilot behind one gateway — shared session store, patient/chart context injection, single observability trace ID. Tracked as **AI-PLATFORM-001**.

---

## 5. Incident Layer Attribution (2026-06-17 fixes)

| User report | Root layer | Component | Fix class |
|---|---|---|---|
| Slot duration not saving | **L1 Classical** | `doctor-availability.route.js`, `doctor-settings.route.js` | API contract + persistence |
| Vitals not reflecting | **L1 Classical** | `doctor.route.js` vitals-history | Data-plane read path |
| Dr. iSHA wrong answers | **L5 + L6** | `llm-provider.js`, `medical-ai.route.js` | Routing, history, SIB port |

**Lesson for AI Eng team:** Triage incidents by layer before touching models. L1 failures masquerade as "AI is broken."

---

## 6. Team Ownership & Escalation

| Role | Scope | Escalation trigger |
|---|---|---|
| **AI CTO** | Layer map, PCCP, architecture, SLO policy | Any unapproved model change; SLO breach > 4 h |
| **AI Engineering** | L3–L6 services, golden tests, `llm-provider` | Intent parse < 90% for 24 h; golden-set regression |
| **AI Safety Engineering** | Class III components, quality gates, drift | ESI under-triage event; PSI > 0.25 |
| **Medical Director** | Model card approval, adverse events, clinical validation | Any patient harm attribution to AI output |
| **Platform Engineering** | L1 data truth, API contracts, mobile/web parity | POST→GET data mismatch; contract test failure |

---

## 7. Q3 2026 Engineering Priorities (layer-ordered)

| Priority | Layer | Initiative | SaMD alignment | Owner |
|---|---|---|---|---|
| P0 | L1 | Contract tests: vitals POST→GET, availability save→reload | Audit traceability | Platform Eng |
| P0 | L6 | Unified doctor copilot gateway (AI-PLATFORM-001) | CDSS Class II consistency | AI Eng |
| P0 | L5 | Clinical golden-set regression (200 prompts) on every deploy | Clinical validation | AI Eng |
| P1 | L2 | External triage validation study (≥200 cases) | Class III filing blocker | Med Director |
| P1 | L1 | ISO 14971 FMEA review against live failure modes | Risk management | AI Safety Eng |
| P2 | L5 | DPDP DPAs with SIB/Groq/OpenAI providers | DPDP 1/2 → 2/2 | AI CTO |

---

## 8. How to Use This Document

1. **New AI feature?** Classify its layer first, then check SaMD class in Section 2 before writing code.
2. **Production incident?** Use Section 5 pattern — attribute to layer, not "the model."
3. **Sprint planning?** Pull from Section 7; never skip L1 contract tests when shipping L5/L6 features.
4. **Regulatory review?** Cross-walk Section 3 with [SAMD_READINESS_SCORECARD.md](./SAMD_READINESS_SCORECARD.md).

---

*Next review: 2026-09-17 · Update when new MODEL_CARDS entries are added or SLOs are breached.*
