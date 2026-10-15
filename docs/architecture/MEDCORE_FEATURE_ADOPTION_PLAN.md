# MedCore feature-adoption plan — designs to bring into mediqzy, license-safely

**Status:** Implemented behind the `/api/medcore-adoption` feature boundary; production migration applied and CI gate validated on 15 October 2026.
**Date:** 2026-10-15.
**Source:** MedCore (`github.com/Globussoft-Technologies/medcore`) — a peer Indian HIS (80+ API
routers, 155+ Prisma models, RN patient app).
**Goal:** Adopt the specific *designs/functionalities* where MedCore is ahead of mediqzy — **without
infringing its license** — built on mediqzy's existing infrastructure.

> mediqzy already overlaps MedCore broadly and exceeds it in several areas (SaMD governance,
> interpretability, quality gates, PACS/DICOM, OHC, phlebotomy, corporate wellness, insurance CRM,
> 4-channel notifications with quiet-hours). This plan adopts a **short list of verified gaps**, not a
> rebuild.

---

## 0. License-safety framework (read first — binding)

### 0.1 MedCore's license is the strictest we've evaluated

MedCore ships a **dual / ambiguous license**: the `LICENSE` file is **AGPL-3.0**, while the README
states **"MedCore is proprietary software owned by Globussoft … published for transparency and
evaluation"** and sells **commercial licenses**.

**Both readings forbid copying its code into mediqzy:**
- If **AGPL-3.0** governs → strong copyleft + network clause: incorporating its code would force AGPL
  on the entire mediqzy service (unacceptable for proprietary mediqzy).
- If **"proprietary, evaluation-only"** governs → no reuse rights at all without a commercial license.

### 0.2 The only safe adoption modes

1. **Clean-room / concepts-only (default).** Adopt the *functionality and design* (not copyrightable),
   re-implemented independently in mediqzy's own stack. **No MedCore code, schema, Prisma models,
   migrations, test fixtures, SNOMED/translation files, or prompt text copied, translated, or
   adapted.**
2. **Commercial license (optional).** If Globussoft grants one, specific code reuse may become
   permissible under its terms. Until a signed agreement exists, **mode 1 is mandatory.**

### 0.3 Clean-room discipline (same as the CRM/comms plan)
- Spec from the README / public demo / these notes (the *what*), implement independently (the *how*).
- No verbatim or line-by-line porting; mediqzy-native expression only (ESM Node/Express, `pool` from
  `pgPool.js`, LLM via `ai-brain/llm-provider.js`, React client).
- Do **not** copy MedCore's curated clinical datasets (its SNOMED subset, drug-pair list, gold
  fixtures, i18n keys) — mediqzy sources/authors its own.
- Every PR carries: "Capability modeled on MedCore behavior; implementation, schema, datasets and
  prompts independently authored; no MedCore code or assets used."
- **Counsel sign-off before any production ship.**

### 0.4 Hard do-not-touch
❌ MedCore code / Prisma schema / migrations · ❌ its `ai-eval` gold fixtures · ❌ its SNOMED-CT subset
& Hindi-synonym tables · ❌ its drug-interaction pair list · ❌ its i18n translation files · ❌ prompt
text. ✅ Generic permissive libraries (MIT/BSD/Apache-2.0), vetted.

---

## 1. What mediqzy already has (do not rebuild)

Emergency triage with deterministic red-flags; AI scribe; drug-interaction service; PACS/DICOM; ABDM;
SaMD governance (model cards, PCCP, drift); quality gates; interpretability (SHAP/LIME/confidence);
4-channel notifications (WhatsApp/SMS/email/push) with quiet-hours; CRM; evaluation-engine (telemetry
/ dry-run). New clinical-AI work **must** plug into the SaMD governance + quality-gate +
interpretability layer per `CLAUDE.md`.

---

## 2. Adoption workstreams (verified gaps, prioritized)

Each item was checked against the mediqzy codebase; only verified gaps are included.

### WS-1 — Multilingual AI triage + explainable specialty matching  ·  provenance: CLEAN-ROOM  ·  **SaMD**

**Gap:** mediqzy's `ai-emergency-triage.service.js` has deterministic red-flags but **no multilingual
path** and no curated explainability ontology. MedCore does triage in **8 Indian languages** with
red-flags firing *before* the LLM and a curated **SNOMED-CT subset** reconciling specialty matches for
explainability.
**Design (mediqzy-native):** add a language layer over the existing triage service (reuse mediqzy's
own translation/LLM stack — not MedCore's i18n keys); keep the deterministic red-flag gate first;
build **mediqzy's own** curated symptom→specialty concept map (license a SNOMED subset properly, or
author one) for explainable matching surfaced via the existing interpretability service.
**SaMD:** Class IIb/III (triage informs clinical routing) → full governance: model card, quality
gate, confidence + explanation, `ai_quality_gate_log`. No autonomous threshold changes.
**Phasing:** 1 language layer (Hindi first) → 2 red-flag phrase coverage per language → 3 explainable
specialty map → 4 remaining languages.
**Acceptance:** a Hindi red-flag phrase triggers the emergency path *before* any LLM call; specialty
suggestion carries an explanation; governance artefacts present.

### WS-2 — AI eval harness with gold fixtures gating CI  ·  provenance: CLEAN-ROOM  ·  governance

**Gap:** mediqzy has `evaluation-engine.js` (telemetry/dry-run) but **no gold-fixture regression
harness gating CI** on safety-critical AI behavior. MedCore gates every push on triage red-flag
recall, SOAP accuracy, and drug-safety alerts.
**Design:** a mediqzy eval harness with **mediqzy-authored** gold fixtures; wire it into the existing
quality-gate + SaMD governance flow and CI so a regression in red-flag recall / drug-safety / SOAP
quality **fails the build**. This is the highest-leverage governance upgrade — it makes the SaMD
quality gates continuously enforced, not point-in-time.
**Acceptance:** CI fails on an injected triage-recall regression; eval results logged to governance.

### WS-3 — "Unavailable vs computed-zero" metric integrity  ·  provenance: CLEAN-ROOM (pattern)  ·  cross-cutting

**Gap:** no explicit `unavailable: true` semantics found in mediqzy services. MedCore never renders an
uncomputed metric as a real zero — a KPI with no data source returns `unavailable`, not `0`.
**Design:** a small shared convention (a typed result wrapper) applied first to CRM/AI KPI surfaces,
then broadly. **Directly reinforces mediqzy's existing "no fabricated data as live" rule** — cheap,
high-value, low-risk. Pattern only (uncopyrightable); no MedCore code involved.
**Acceptance:** a KPI with no backing data shows an explicit "not available," never `0`.

### WS-4 — Drug-safety sign-off gate (two-layer)  ·  provenance: CLEAN-ROOM  ·  **SaMD**

**Gap:** mediqzy has `ai-drug-interaction.service.js`, but MedCore's pattern **blocks prescription
sign-off** on CONTRAINDICATED alerts until explicit acknowledgement, via a two-layer check
(deterministic high-risk pairs + allergy/renal/hepatic/paediatric rules, *then* LLM for the long tail),
severity-coded with generic alternatives.
**Design:** harden mediqzy's drug-interaction service into a **sign-off gate** at the prescribing step,
deterministic-first, using **mediqzy's own** curated pair/rule set, routed through quality gates +
interpretability; CONTRAINDICATED blocks sign-off pending audited acknowledgement.
**SaMD:** prescribing-time safety → governance + audit mandatory.
**Acceptance:** a contraindicated pair blocks sign-off; override is audited; deterministic layer fires
without the LLM.

### WS-5 — Holt-Winters pharmacy demand forecast  ·  provenance: CLEAN-ROOM  ·  NOT SaMD (ops)

**Gap:** none found in mediqzy. MedCore drives 30/60/90-day procurement with triple-exponential
smoothing (seasonality).
**Design:** an explainable time-series forecast (standard Holt-Winters — a public algorithm, not
MedCore's code) over mediqzy's pharmacy/stock history, feeding reorder/procurement insights.
Administrative → no SaMD.
**Acceptance:** forecast vs actuals backtest within tolerance on real stock history.

### WS-6 — Agent Console (triage → human handoff)  ·  provenance: CLEAN-ROOM  ·  ops/UX

**Gap:** mediqzy has doctor-copilot but no unified **call-centre handoff console**. MedCore shows the
agent the full transcript + AI-extracted SOAP + top-3 doctor matches + red-flag annotations on one
screen, one-click audited handoff, realtime.
**Design:** a mediqzy console view over existing triage + doctor-matching + realtime infra; audited
handoff. Builds on what mediqzy already has.
**Acceptance:** a triage needing a human appears on the console with transcript + matches; handoff is
audited and real-time.

### WS-7 — Patient-engagement AI: Lab Explainer (HITL) + Adherence Bot  ·  provenance: CLEAN-ROOM  ·  **SaMD-adjacent**

**Gap:** MedCore has a plain-language **Lab Report Explainer** behind a **doctor-approval (HITL)
queue**, and a **Medication Adherence Bot** (scheduler → WhatsApp/SMS reminders in the patient's
language).
**Design:** Lab Explainer generates a draft that **must pass a doctor-approval queue before reaching
the patient** (HITL — patient-facing clinical output, so governed + gated). Adherence Bot reuses
mediqzy's existing notification stack (don't rebuild channels) + a scheduler.
**SaMD:** patient-facing clinical explanation → HITL approval is mandatory; documentation-with-review
is not SaMD *only if* a clinician approves each output.
**Acceptance:** no lab explanation reaches a patient without recorded doctor approval; reminders honor
quiet-hours + preferred language.

---

## 3. Sequencing

1. **WS-3** (metric integrity) + **WS-2** (eval harness) first — cross-cutting governance, low risk,
   high leverage, strengthen everything after.
2. **WS-4** (drug-safety gate) + **WS-1** (multilingual triage) — high-value clinical, via SaMD flow.
3. **WS-5** (forecast) + **WS-6** (agent console) — ops/UX, independent.
4. **WS-7** (patient-engagement AI) — depends on HITL queue discipline from WS-2/WS-4.

Each ships behind a feature flag (`CLAUDE.md` std 7); each clinical workstream completes a model card +
quality gate before production.

## 3.1 Implementation delivered (2026-10-15)

The first independently-authored implementation slice is now in the repository. It is deliberately
isolated behind one route namespace so the existing patient, doctor and lab workflows keep their
current contracts while the capability is validated with test accounts.

| Workstream | Implementation | API / operational surface |
|---|---|---|
| WS-1 | `server/services/multilingual-triage.service.js` | `POST /api/medcore-adoption/triage`; Hindi plus high-risk phrase coverage for other Indian scripts, deterministic normalization before the existing triage/LLM path, matched concepts and specialty explanation. ESI 1–2 results can automatically open the audited human handoff queue. |
| WS-2 | `server/services/ai-gold-evaluation.service.js`, `server/scripts/qa/run-ai-gold-evals.mjs` | `npm run test:ai-gold`; mediqzy-authored fixtures cover multilingual red flags, contraindications and SOAP completeness. Results are written to `ai_gold_eval_runs`; CI fails on any fixture failure (including `AI_EVAL_INJECT_FAILURE=1`). |
| WS-3 | `server/services/metric-integrity.service.js` | `GET /api/medcore-adoption/metrics/:metricKey`; every result carries `available`/`unavailable`, a nullable value and a reason, so missing data cannot render as zero. |
| WS-4 | `server/services/prescription-safety-gate.service.js` | `POST /api/medcore-adoption/drug-safety/signoff`; deterministic interaction checks run before long-tail analysis, contraindications block sign-off, and an acknowledgement reason is audited in `drug_safety_signoffs`. |
| WS-5 | `server/services/pharmacy-forecast.service.js` | `POST /api/medcore-adoption/pharmacy/forecast`; additive Holt-Winters forecast with confidence bounds, MAE and explicit unavailable semantics for short history, persisted in `pharmacy_demand_forecasts`. |
| WS-6 | `server/services/medcore-adoption.service.js`, `client/src/pages/AgentConsole.tsx` | `POST/GET/PATCH /api/medcore-adoption/agent-handoffs` and `/agent-console`; transcript, SOAP, red flags, doctor matches and audited lifecycle are shown in one queue. |
| WS-7 | `server/services/medcore-adoption.service.js` | `POST /api/medcore-adoption/lab-explainer/drafts`, `GET /lab-explainer/queue` plus approve/reject endpoints; patient delivery is allowed only after clinician approval. Adherence plans/events and `/adherence/run-due` honour quiet hours and retain language/channel. |

The migration is `server/migrations/20261015006100-medcore-adoption.migration.js` and is registered
in `server/scripts/migrate-all.mjs`. The implementation uses mediqzy's existing `pool`, auth
middleware, triage, drug-safety, interpretability and quality-gate services. No MedCore code,
schema, fixtures, datasets, translations or prompts were copied or translated.
The accompanying safety record is [`MEDCORE_ADOPTION_MODEL_CARD.md`](./MEDCORE_ADOPTION_MODEL_CARD.md);
its approval checklist remains a release gate.

### Deployment and clinical release gates

1. Run `cd server && npm run migrate:all` (or apply migration `20261015006100-medcore-adoption.migration.js`).
2. Run `cd server && npm run test:ai-gold` and retain the JSON output as the governance evidence.
3. Set `MEDCORE_ADOPTION_ENABLED=false` until the model-card, clinical review and
   counsel clean-room sign-offs in §4 are complete. The API is authenticated, but it is not a substitute
   for those approvals.
4. Add real pharmacy history, doctor matching and notification-provider adapters before enabling the
   corresponding operational workflows; the fallback implementation records state and never claims a
   message was delivered when no provider is configured.

---

## 4. License-compliance checklist (gate — per merge)

- [ ] **No MedCore code/schema/migrations/fixtures/datasets/i18n/prompts** copied, translated or
      adapted. Grep the diff for MedCore identifiers and curated-dataset fingerprints.
- [ ] Each PR carries the clean-room provenance note (§0.3); reviewer confirms independence.
- [ ] mediqzy-authored clinical datasets (symptom→specialty map, drug pairs, gold fixtures) — **not**
      MedCore's.
- [ ] New third-party libraries are permissive (MIT/BSD/Apache-2.0) and recorded.
- [ ] New entity tables under the **Entity-UID rule**; `verify-entity-uid-rule.mjs` exits 0.
- [ ] Every clinical workstream (WS-1/4/7, and WS-2's gated behaviors) has a **model card + quality
      gate + interpretability output + governance sign-off**; no autonomous model/threshold changes.
- [ ] Patient-facing clinical AI (WS-7 Lab Explainer) enforces **HITL doctor approval**.
- [ ] **Counsel sign-off** on the clean-room approach (and on whether a MedCore commercial license is
      preferable) before first production ship.

---

## 5. Risks

- **License contamination (highest).** MedCore is AGPL *and* asserts proprietary/eval-only — stricter
  than brightbean. Mitigation: concepts-only clean-room + §4 gate + counsel; consider a commercial
  license if deep reuse is wanted.
- **SaMD scope.** WS-1/4/7 are clinical AI → must go through mediqzy's SaMD governance; skipping it is
  both a safety and a regulatory failure.
- **Dataset provenance.** Re-implementing triage/drug-safety needs *mediqzy's own* curated clinical
  data; do not lift MedCore's — both a license and a clinical-validation issue.

---

## Appendix — observed MedCore capabilities (requirements reference, not their code)

AI: 8-language triage with pre-LLM deterministic red-flags + SNOMED-CT explainability; Agent Console
handoff; AI KPI dashboards with explicit `unavailable` semantics; HITL radiology drafting; ambient
scribe → SOAP with ICD-10/CPT + auto lab-orders/referrals; two-layer drug safety blocking sign-off;
medication-adherence bot; lab-report explainer (HITL); Postgres-FTS RAG + fire-and-forget ingest
(OCR/pdf) + ambient chart search; ML no-show predictor (logistic regression); Holt-Winters pharmacy
forecast; Vitest eval harness + gold fixtures gating CI.
Non-AI (noted, mostly already in mediqzy): GST invoicing + Razorpay webhook (HMAC, idempotent); lab QC
Levey-Jennings; maternity partograph; prescription QR verification; TOTP 2FA; refresh-token rotation
with replay detection; axe-core a11y CI gate; RBAC permission-matrix tests.

**Not prioritized** (mediqzy already has, or lower value): notifications (mediqzy already 4-channel +
quiet-hours), ABDM/FHIR (mediqzy has), PACS (mediqzy has), scribe (mediqzy has), no-show (mediqzy has
partial), billing/Razorpay (mediqzy has).
