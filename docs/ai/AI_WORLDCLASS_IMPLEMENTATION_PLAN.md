# AI Platform — World-Class Implementation Plan

Status: **living document**
Owner: AI CTO (with PM, BA, Principal Eng, Tech Lead, Backend, Frontend, Mobile, AI, DevOps, UX, UI, QA, Delivery, Security & Compliance)
Source: consolidated AI audit of routes, `ai-brain`/services, and the flagship features (voice assistant, task assistant, AI scribe, CDSS).

> SaMD guardrail (see `CLAUDE.md`): model weights, thresholds, and **LLM system prompts** must NOT be changed autonomously. Such changes flow through
> `governanceService.proposeChange()` → medical-director review → `governanceService.approveChange()`.
> Everything implemented directly from this plan is limited to **non-clinical** concerns: authorization, rate limiting, caching scope, configuration, observability, and integration wiring.

---

## 1. Problem statement

The platform has a strong SaMD foundation (quality gates, SHAP/LIME interpretability, model cards, PCCP change-log, drift monitoring) but **multiple parallel AI stacks bypass it**. Clinical behavior, governance, and audit are inconsistent depending on which endpoint a request hits. Goal: converge on one governed inference path and elevate voice/scribe/CDSS to world-class, without regressing safety.

Representative duplication found:
- Medical chat: `/api/medical-ai/consult` (SIB→llm-provider) vs `/api/ai/working-medical-consult` (SIB only) vs `/api/ai-health/chat` (**canned, no model**).
- Triage: 4 paths; only `/api/ai-intelligence/triage/assess` runs ESI + gates + LIME.
- Diet: 3 paths, two fully canned.
- "iSHA": doctor voice (`/voice-assistant`), LiveKit agent (`isha-agent/agent.py`), patient chat (`/medical-ai/consult`) — not unified.

---

## 2. Workstreams & phases

### Phase 0 — Safety & security hardening (non-clinical, ship now)
| ID | Item | Files | Owner | Risk |
|----|------|-------|-------|------|
| P0-1 | IDOR: `GET /ai-intelligence/risk-score/:patientId` restricted to the patient themselves or a clinician | `server/routes/ai-intelligence.route.js` | Backend/Security | Low |
| P0-2 | Config leak: `GET /v3/ai-brain/providers` restricted to admin (exposes `ai_model_configs`) | `server/routes/ai-brain.route.js` | Backend/Security | Low |
| P0-3 | Anonymous control-plane: `POST /sib/decide` now requires auth | `server/routes/sib-control.route.js` | Backend/Security | Low |
| P0-4 | Clinical semantic-cache isolation: `skipCache` on patient/clinical LLM calls so a cached answer for one patient can't be served to another | triage, drug, risk-cron services + `medical-ai.route.js` | AI/Backend | Low |
| P0-5 | (Follow-up, needs product sign-off) auth/rate-limit for public AI surfaces: `sib-chatbots/*`, `tts/stream`, `tts/voices` | various | Security/PM | Med (may be intentional widgets) |
| P0-6 | (Follow-up) Retire/replace canned endpoints: `ai-health/*`, `ai/analyze-image`, duplicate `diet/generate` | `ai-health.route.js`, `ai.js`, `diet.route.js` | PM/Backend | Med (client deps) |
| P0-7 | (Follow-up) Webhook signature verification: `support-chat` WhatsApp/RocketChat | `support-chat.route.js` | Security | Med |

### Phase 1 — Consolidate the brain
| ID | Item | Notes |
|----|------|-------|
| P1-1 | Single inference gateway: route `medicalAI.service.js` + remaining SIB routes through `llm-provider` (SIB stays a provider) | architecture |
| P1-2 | Collapse duplicate paths (3 chat / 4 triage / 3 diet → one each) | PM + Backend |
| P1-3 | Clinical-output **gate + interpretability + PHI-redaction wrapper at the API boundary** for every clinical response | *prompt/threshold parts → governance* |
| P1-4 | Close governance loop: `approveChange()` must apply `newConfig`; bring self-learning prompt mutation under PCCP | `ai-model-governance.service.js`, `ai-self-learning-pipeline.service.js` |
| P1-5 | Resilience: per-provider retry + circuit breaker + token-budget enforcement | `llm-provider.js`, `agent-permission-engine.js` |
| P1-6 | Config consolidation: one `SIB_URL`, one scribe URL, LiveKit-cloud-safe health check | typed config module |

### Phase 2 — Flagships to world-class
| ID | Item |
|----|------|
| P2-1 | Unified streaming LiveKit voice: real-time STT→LLM→TTS, barge-in, partial transcripts, task tools attached, multilingual STT, **confirmation gating on destructive actions** |
| P2-2 | Ambient scribe v2: streaming partial SOAP, speaker diarization, encrypted chunk handling, **enforced physician attestation** via clinical-workflow note signing, single backend |
| P2-3 | CDSS: licensed evidence corpus + inline citations/provenance + quality gates; connect CDSS to voice/task assistant via shared encounter context |

### Phase 3 — Platform excellence
| ID | Item |
|----|------|
| P3-1 | End-to-end trace correlation (query→tier→provider→gate→artifact) |
| P3-2 | Labeled offline eval harness for triage/scribe/CDSS (replace heuristic scoring) |
| P3-3 | Drift + demographic-parity dashboards in CI |
| P3-4 | FHIR-validated NLP outputs before downstream clinical use |

---

## 3. Compliance mapping (HIPAA / GDPR / DPDP / ISO 27001 / HL7-FHIR / NABH / JCI)
- **Access control / least privilege** → P0-1, P0-2, P0-3, P0-5.
- **PHI confidentiality** → P0-4 (cache), P1-3 (redaction at LLM boundary), localStorage/`/tmp` handling (P2-2).
- **Auditability** → P1-4 (governance apply), P3-1 (trace correlation).
- **Clinical accountability (NABH/JCI)** → P2-2 enforced attestation on AI documentation.
- **Integrity of clinical data (HL7/FHIR)** → P3-4 validation gate.

---

## 4. Definition of done (per item)
- Code change + `node --check` (and unit/contract test where infra allows).
- No change to model weights/thresholds/prompts unless routed through governance.
- Backwards compatible for legitimate flows; only over-broad access is removed.
- Documented in PR with security/compliance rationale.

---

## 5. Progress log
- **2026-06-11** — Phase 0 started: P0-1 (risk-score IDOR), P0-2 (providers admin), P0-3 (sib/decide auth), P0-4 (clinical cache isolation). Follow-ups P0-5/6/7 pending product/security sign-off. Governance-gated items (P1-3, P1-4, P2-*) to be raised via `proposeChange()`.
