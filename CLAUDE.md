# Mediczy / Mediqzy — Codebase Guide for Claude

This file gives Claude essential context for working in this repository.

---

## Architecture Quick Reference

| Layer | Technology | Location |
|---|---|---|
| Frontend | React + Vite + Tailwind | `client/` |
| Backend API | Node.js + Express (ESM) | `server/` |
| Database | PostgreSQL (pgPool) | `server/db/pgPool.js` |
| AI Services | Node.js services + Python microservices | `server/services/ai-*`, `scribe_service/`, `offline_scribe/`, `ai-engine/` |
| Offline STT | whisper.cpp (C++) | `whisper.cpp/` |
| NestJS (future) | NestJS + Prisma scaffold | `nestjs-app/` |

**Live deployment:** mediqzy.com (EC2 + PM2, Node 20)
**Future prod:** mediczy.in (ECS Fargate)

---

## Key Conventions

- **ESM throughout**: all server files use `import/export`, not `require()`
- **DB**: always use `pool` from `server/db/pgPool.js`; never raw `pg.Client`
- **Auth**: `authUser` middleware in `server/middleware/`; role checked with `requireRole('roleName')`
- **Cron jobs**: registered in `server/utils/cronRegistry.js`; use `tick()`, `tickStart()`, `tickError()`
- **LLM calls**: always go through `server/services/ai-brain/llm-provider.js` — never call OpenAI/Groq/Anthropic directly from routes

---

## SaMD Governance — MANDATORY FOR ALL AI WORK

This is a healthcare platform with AI features that qualify as **Software as a Medical Device (SaMD)**. Any work touching AI/ML components must follow these rules:

### 1. Before adding or modifying any AI diagnostic feature

Read first:
- [docs/ai/SAMD_READINESS_SCORECARD.md](docs/ai/SAMD_READINESS_SCORECARD.md) — regulatory classification and what's required
- [docs/ai/MEDICZY_AI_LAYER_MAP.md](docs/ai/MEDICZY_AI_LAYER_MAP.md) — 7-layer capability map, service owners, SLOs
- [docs/ai/AI_MODEL_CARDS.md](docs/ai/AI_MODEL_CARDS.md) — existing model documentation
- [docs/ai/AI_INTERPRETABILITY_AND_QUALITY_GATES.md](docs/ai/AI_INTERPRETABILITY_AND_QUALITY_GATES.md) — SHAP/LIME/gates technical spec

### 2. Every new AI output that influences a clinical decision must:

- [ ] Call a quality gate: `qualityGates.checkXxx()` from `server/services/ai-quality-gates.service.js`
- [ ] Emit a confidence score via `interpretabilityService.computeConfidenceScore()`
- [ ] Emit an explanation (SHAP for tabular models, LIME for text/triage)
- [ ] Log gate results to `ai_quality_gate_log`

### 3. Model changes (weights, thresholds, prompts) must NEVER be applied autonomously

All self-learning pipeline changes flow through:
```
governanceService.proposeChange() → medical director review → governanceService.approveChange()
```
See: `server/services/ai-model-governance.service.js`

### 4. New AI components need a Model Card

Add an entry to `MODEL_CARDS` in `server/services/ai-model-governance.service.js` and run:
```
POST /api/ai-governance/model-cards/sync
```

### 5. SaMD risk classification for new features

| Feature type | Default classification | Why |
|---|---|---|
| Diagnostic output (drives clinical decision) | Class III SaMD | Direct patient harm potential |
| Risk stratification (informs, doesn't decide) | Class IIb SaMD | Indirect patient harm |
| Administrative / booking / scheduling | NOT SaMD | No clinical decision impact |
| Documentation (with mandatory physician review) | NOT SaMD | Physician is the clinical actor |

---

## Governance Dashboard

Medical directors and super-admins access the governance dashboard at:

```
GET /api/ai-governance/dashboard          — Full overview (includes aiLayerMap)
GET /api/ai-governance/layer-map            — AI capability layer registry (MED-AI-LAYER-001)
GET /api/ai-governance/changes/pending      — Pending model changes for review
POST /api/ai-governance/changes/:id/approve — Approve a change
GET /api/ai-governance/samd-readiness       — Readiness checklist (22/27)
GET /api/ai-governance/patient/:id/explanation — SHAP explanation for a patient
```

**Doctor AI unified gateway (AI-PLATFORM-001):**

```
POST /api/doctor-copilot/chat    — Single doctor copilot entry (agent + clinical routing)
GET  /api/doctor-copilot/layer-map — Layer map for doctor app
```

Legacy paths still supported: `/api/voice-assistant/agent`, `/api/medical-ai/consult`.

---

## Database Migration — New Tables (2026-06-01)

Run `server/migrations/samd-interpretability-governance.migration.js` if setting up a new environment.

New tables created:
- `ai_model_change_log` — PCCP change control audit trail
- `ai_model_cards` — model card registry
- `ai_drift_monitor` — PSI drift detection log
- `ai_quality_gate_log` — pre-flight safety check audit log
- `ai_demographic_parity_log` — demographic bias monitoring
- `ai_triage_interpretations` — LIME attribution per triage event

New columns on `ai_health_risk_scores`:
- `shap_values`, `feature_attributions`, `counterfactuals` — interpretability
- `confidence_score`, `data_completeness` — data quality tracking

---

## Cron Job Schedule

| Job | File | Frequency |
|---|---|---|
| Health Risk Scoring | `ai-health-risk-cron.service.js` | Every 6h (now includes SHAP + quality gate) |
| Self-Learning Pipeline | `ai-self-learning-pipeline.service.js` | Every 4h (now routes changes through governance) |
| Clinical Insights | `ai-clinical-insights-cron.service.js` | Every 4h |
| Drift Monitor | `ai-model-governance.service.js:runDriftMonitor()` | Weekly (trigger: `POST /api/ai-governance/drift/run`) |

---

## Key File Map

```
server/
  services/
    ai-interpretability.service.js     ← SHAP + LIME + counterfactuals + confidence
    ai-model-governance.service.js     ← Model cards + PCCP + drift detection
    ai-layer-map.service.js            ← 7-layer capability registry (MED-AI-LAYER-001)
    doctor-copilot.service.js          ← Unified doctor AI gateway (AI-PLATFORM-001)
    ai-quality-gates.service.js        ← 8 pre-flight safety checks
    ai-health-risk-cron.service.js     ← Patient risk scoring (6h, now with SHAP)
    ai-emergency-triage.service.js     ← ESI triage (now with LIME + gates)
    ai-drug-interaction.service.js     ← Drug safety checker
    ai-self-learning-pipeline.service.js ← Continuous learning (now governed)
    ai-brain/
      llm-provider.js                  ← Unified LLM cascade (iSHA → Groq → OpenAI)
      evaluation-engine.js             ← Telemetry + dry-run optimization
  routes/
    ai-governance.route.js             ← All governance API endpoints
    doctor-copilot.route.js              ← Unified doctor copilot gateway
  migrations/
    samd-interpretability-governance.migration.js ← Run once per new environment

docs/ai/
  SAMD_READINESS_SCORECARD.md         ← Regulatory compliance tracker
  MEDICZY_AI_LAYER_MAP.md             ← 7-layer capability map, owners, SLOs
  AI_MODEL_CARDS.md                   ← Per-component AI documentation
  AI_INTERPRETABILITY_AND_QUALITY_GATES.md ← Technical spec
```
