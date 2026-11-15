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
- **App-facing API contract**: `server/openapi/` (OpenAPI 3.0.3) is the source of truth for `/api/employee`, `/api/addresses` lookup and admin integrations. Change the spec in the same commit as the route, then `cd server && npm run openapi:export`; `__tests__/openapi-contract.test.js` fails on drift. See [docs/architecture/API_CONTRACT_AND_INTEGRATIONS.md](docs/architecture/API_CONTRACT_AND_INTEGRATIONS.md)
- **Cloud cost gate (MANDATORY)**: never create or enlarge a billed cloud resource on your own — new servers/databases, bigger instance types, Multi-AZ, storage, load balancers, NAT, Elastic IPs, snapshots/images, ECS/scaling, Savings Plans, `terraform apply`/`cdk deploy`. First tell the owner what it is, its monthly USD cost and why, and wait for an explicit yes. Monthly AWS budget USD 333. A PreToolUse hook (`.claude/hooks/cloud-cost-gate.sh`) enforces it; never work around it. See [docs/operations/CLOUD_COST_POLICY.md](docs/operations/CLOUD_COST_POLICY.md)
- **Third-party APIs**: every new outbound vendor call goes through `server/integrations/` (catalogue entry + client on `defineIntegration().fetchJson()`), never a direct `fetch`/`axios` from a service or route. No invented fallback data in production. Status: `GET /api/admin/integrations`

---

## Entity IDs — MANDATORY FOR ALL WORK THAT CREATES OR REFERENCES AN ENTITY

Every entity has a **6-character, kind-prefixed UID** (`H7K2PX` = hospital, `C4M9TA` = corporate)
issued **by the database** on insert. A numeric `id` is private to its own table and **must never be
used to point at an entity of another table or kind** — id `49` is Madras Medical Mission in `tenants`
and Ninjacart in `corporates`, which is how a corporate HR user ended up admitted to the wrong
tenant's subdomain.

**Entities** (each has a kind and prefix in `entity_kinds`): corporate `C` · hospital `H` · clinic `K` ·
lab `L` · pharmacy `P` · ambulance `B` · homecare `M` · diagnostic centre `Y` · NGO `G` · TPA `X` ·
insurance company `I` · broker `V` · wellness company `W` · PSU `S` · aggregator `Z`.
People tables (users, patients, doctors, nurses, assistants, team, corporate employees) are under the
same global registry with role prefixes.

> **Rollout status (2026-10-05):** live in production. The database triggers, `entity_registry` and the uid
> twins are applied and `scripts/ci/verify-entity-uid-rule.mjs` reports 0 violations. The remaining integer
> references are being migrated in waves; see
> [docs/architecture/ENTITY_REFERENCE_AUDIT.md](docs/architecture/ENTITY_REFERENCE_AUDIT.md).

### The rules

1. **Never mint an id in application code, and never supply `unique_id` on INSERT.** Omit it; the
   `trg_entity_uid_*` triggers generate it, register it in `entity_registry` and guarantee it is unique
   across **every** table. `Math.random().toString(36)` ids are how 13 labs ended up with prefix-less ids.
2. **A uid is immutable** once set, and is never reused after deletion (the registry row is retired).
3. **Never reference another entity by a bare integer.** Store the uid (or both — see below) and look
   it up through `entity_registry(uid) -> kind, source_table, source_id`, never by guessing which table
   an integer belongs to. Comparing `a.organization_id !== req.tenant.id` is the bug this rule exists to prevent.
4. **A new entity table is not finished until it is under the rule.** In the same migration:
   `SELECT attach_entity_uid_rule('<table>', '<kind>');` — this adds the column, registers existing rows,
   makes it `NOT NULL` + unique and installs the triggers. A new kind needs a row in `entity_kinds`
   **and** an entry in `ENTITY_KIND_PREFIXES` (`server/utils/uniqueIdGenerator.js`).
5. **A new cross-entity reference gets a uid column from day one**, and an existing integer reference
   is migrated with `SELECT attach_uid_reference('<table>', '<int_col>', '<uid_col>', '<target_table>');`.
   The pair is then kept consistent by trigger: a write where the integer and the uid disagree, or where
   a uid belongs to the wrong table, is rejected.
6. **Verify before you finish:** `node scripts/ssm-env-loader.mjs scripts/ci/verify-entity-uid-rule.mjs`
   must exit 0. It fails on database/code prefix drift, on any table with a `unique_id` column that is
   not under the rule, on unregistered rows and on disagreeing uid twins.

Design, kinds, legacy ids and the phased plan for the remaining integer references:
[docs/architecture/ENTITY_UID_RULE.md](docs/architecture/ENTITY_UID_RULE.md).

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
