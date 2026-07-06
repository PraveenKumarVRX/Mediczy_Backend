# Governance Proposal — Clinical-Output Gate Wrapper at the API boundary

- Proposal type: architecture / routing change affecting clinical AI outputs
- SaMD impact: **High** (touches how clinical outputs reach users)
- Status: **DRAFT — pending medical-director review** (register via `server/scripts/propose-clinical-gate-wrapper.mjs`)
- Related plan item: P1-3 in `docs/ai/AI_WORLDCLASS_IMPLEMENTATION_PLAN.md`

## Problem

The SaMD safety stack (quality gates, interpretability/confidence, audit logging) is wired into three services — `ai-emergency-triage`, `ai-drug-interaction`, `ai-health-risk-cron` — but **not** into the conversational/clinical paths that many users actually hit:

- `server/services/ai-brain/orchestrator.js` — final assistant answers (no gates)
- `server/services/ai-brain/multi-agent-orchestrator.js` — aggregated answers (no gates)
- `server/routes/medical-ai.route.js` `/emergency-triage` — parallel triage bypassing the ESI engine, gates, and LIME
- `server/services/medicalAI.service.js` — primary patient chat (bypasses gates entirely)
- `server/services/cdss.service.js` — CDSS answers (no gates)
- `ai-quality-gates.service.js checkScribeOutput()` — implemented but never called

Result: inconsistent safety enforcement and audit blind spots for clinical AI outputs.

## Proposed change

Introduce a single **clinical-output gate wrapper** invoked at the API boundary for any response classified as clinical, that:

1. Calls the appropriate `qualityGates.checkXxx()` (or a new `checkGeneralClinicalOutput()`), and **blocks/annotates** on blockers.
2. Emits a confidence score via `interpretabilityService.computeConfidenceScore()` and attaches an explanation (LIME for text).
3. Logs the gate result to `ai_quality_gate_log` with a correlation/trace id.
4. Applies PHI redaction before any third-party LLM boundary and before persistence.

Rollout: behind a feature flag (`CLINICAL_GATE_WRAPPER=shadow|enforce`) — **shadow** first (log-only, no behavior change) to gather false-positive rates, then **enforce** after medical-director sign-off.

## Why this must go through governance

It changes the safety behavior of clinical AI outputs (potentially blocking/modifying responses) and may require new gate thresholds and a new clinical-output gate prompt — all governed artifacts per `CLAUDE.md`. Therefore it is **not** applied autonomously; it is registered as a pending change for medical-director review and approved/added as a model-card-tracked component before enforcement.

## Acceptance criteria

- Shadow mode logs gate decisions for ≥2 weeks with measured false-positive rate.
- All clinical entry points (orchestrator, multi-agent, medical-ai chat/triage, cdss, scribe) route through the wrapper.
- `checkScribeOutput()` is wired and enforced in the scribe import flow.
- Trace id links query → provider cascade → gate result → persisted artifact.
- Model card added for the general clinical-output gate; `samd-readiness` updated.
