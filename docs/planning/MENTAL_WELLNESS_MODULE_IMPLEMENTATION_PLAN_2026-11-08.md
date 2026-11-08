# Mental Health & Wellness Module — Implementation Plan

**Document ID:** MED-MIND-001
**Date:** 2026-11-08
**Status:** Reviewed — approved for Phase 0
**Scope:** Individual patient/user dashboard (web) + backend. EC2 environment only.
**Surface:** `app.mediqzy.com` patient dashboard; API `/api/programs` (port 8888, EC2 + PM2)
**Classification:** Tier A = NOT SaMD · Tier B = Class IIb SaMD (deferred, governed)

---

## 1. Executive summary

A mental health & wellness capability for the patient dashboard is **feasible at low cost**, because
the platform already contains a complete, live, generic health-coaching framework. The work is
**content, one schema gap, a safety layer, and one UI surface** — not new infrastructure.

| | |
|---|---|
| Reuse of existing platform | ~70% (9 tables, 8 endpoints, 3 client pages, nav, ring-fencing all live) |
| New tables | 1 (+1 `ALTER`) |
| New API prefixes | **0** — extends `/api/programs` deliberately |
| Regulatory exposure at launch | None (Tier A only) |
| Human-coaching leg | **Real** — 61 verified specialists, all online- and walk-in-capable (§10a) |
| Phase 0 pre-flight | ✅ **All four gates resolved 2026-11-08** — Phase 1 is unblocked (§9) |
| Defects found while investigating | 3, all pre-existing: a constant posing as a clinical score, a dead dashboard panel, a platform-wide broken online-consult filter (§9a, §10a) |

**Verdict:** Proceed. Build Tier A end-to-end; hold all AI-derived mental-health inference (Tier B)
behind the existing SaMD governance pipeline.

---

## 2. Review outcome — what changed from the draft

The draft plan was revised on six evidence-backed findings. Each is a defect in the draft, not a
refinement.

| # | Finding | Consequence for the plan |
|---|---|---|
| R-1 | **`health-coaching-framework.migration.js` is not referenced anywhere in `server/scripts/migrate-all.mjs`.** That script runs an explicit hardcoded list, not a directory scan. | The framework may never have been applied in production, and definitely is not applied on a fresh environment. The draft's `ALTER TABLE program_content` and FK to `program_enrollments` would then **fail at migration time**. → New blocking **Phase 0** (§9); the new migration becomes self-sufficient; both migrations get added to `migrate-all.mjs`. |
| R-2 | **`/api/programs/...` matches none of the PHI patterns in `isPHIEndpoint()`** ([audit.middleware.js:16-32](../../server/middleware/audit.middleware.js#L16-L32)). | Mental-health instrument responses would be written and read as **unaudited PHI**. → Adding `/\/programs/i` to `phiPatterns` becomes a Phase 1 deliverable, not an afterthought. |
| R-3 | **`GET /api/programs/:slug` is a documented catch-all that must remain last** in the router. | Any new `GET /api/programs/instruments` declared after it is shadowed and returns 404 "Program not found". → Route-ordering is now an explicit, tested acceptance criterion. |
| R-4 | **`HealthDiary` already has an `isPrivate BOOLEAN` column** ([ehr.model.postgres.js](../../server/models/postgres/ehr.model.postgres.js)). | The confidentiality mechanism does not need inventing. → Reuse `isPrivate`, default **true** for mind entries, rather than adding a parallel flag. |
| R-5 | **The concurrent corporate-wellness WIP is already imported into two modified pages** (`CorporateProgramAnalytics.tsx`, `CorporateEmployeeDashboard.tsx`) and calls `/corporate/wellness/*`, but `corporate-wellness-foundation.route.js` **is not mounted in `app.js`**. | Higher collision risk than assumed. → Hard file-level boundary in §4; those files are out of scope. |
| R-6 | **`mental_health_score` already exists** in `ai_health_risk_scores` and is already rendered to patients at [SmartHealthDashboard.tsx:232](../../client/src/pages/patient/SmartHealthDashboard.tsx#L232). | If anything currently computes it, there may already be an **ungoverned Class IIb output in production**. → Became a Phase 0 compliance gate (§9, PF-4), ahead of any new work. |

---

## 3. Existing assets (verified in code, 2026-11-08)

| Capability | Location | State |
|---|---|---|
| Program framework: catalog, tracking params, tasks, content, assessments, enrollments, task logs, composite scores, device links (9 tables) | [health-coaching-framework.migration.js](../../server/migrations/health-coaching-framework.migration.js) | Written; **application status unverified** (R-1) |
| Program API — list, detail, my, enroll, complete task, register device, admin create | [health-programs.route.js](../../server/routes/health-programs.route.js), mounted `/api/programs` at [app.js:1428](../../server/app.js#L1428) | Live |
| Ring-fencing allow-list for `/api/programs` | [ringFencing.js:44](../../server/middleware/ringFencing.js#L44) (`user`), [:133](../../server/middleware/ringFencing.js#L133) (`patient`) | Live — already done |
| Admin-only program creation (role gate inside handler) | `health-programs.route.js` `POST /` | Live |
| Patient UI shell | [MyPrograms.tsx](../../client/src/pages/MyPrograms.tsx), [ProgramDetail.tsx](../../client/src/pages/ProgramDetail.tsx), [ProgramJourney.tsx](../../client/src/pages/ProgramJourney.tsx) | Live |
| Sidebar entry "My Programs", conditionally shown | [Sidebar.tsx:51](../../client/src/components/layout/Sidebar.tsx#L51), [useProgramAvailability.ts](../../client/src/hooks/useProgramAvailability.ts) | Live |
| Mood (1–5) + sleep + free-text self-logging | [HealthDiary.tsx](../../client/src/pages/HealthDiary.tsx) → `/api/health-diary` → `HealthDiary` model | Live |
| `isPrivate` flag on diary entries | `ehr.model.postgres.js` | Live, unused by the mind flow |
| `mental_health_score` field + patient-facing tile | [010-deeptech-intelligence-layer.sql:29](../../server/db/migrations/010-deeptech-intelligence-layer.sql#L29); dashboard tile | Live |
| AI wellness tools (risk score, wellness goals incl. `meditation`, log wellness data) | [wellness-tools.js](../../server/services/ai-brain/tools/wellness-tools.js) | Live |
| Suicidality red flag → ESI 2 / `CRISIS_INTERVENTION` | [ai-emergency-triage.service.js:40](../../server/services/ai-emergency-triage.service.js#L40) | Live, **unreachable from any wellness surface** |
| Psychologist/Psychiatrist specialty intent mapping | [appointmentIntent.js:65-66](../../server/utils/appointmentIntent.js#L65-L66) | Live |
| Quality gates, interpretability, model governance (for Tier B) | `ai-quality-gates.service.js`, `ai-interpretability.service.js`, `ai-model-governance.service.js` | Live |

**Framework is dormant, not missing.** `useProgramAvailability` hides the nav item unless ≥1 active
program exists, so seeding the first program is what makes the capability visible.

---

## 4. Scope boundaries

### In scope
Individual patient/user lane: `/api/programs` (+ extensions), `health_programs` family of tables,
one new patient page, one new sidebar item, instrument scoring, crisis pathway.

### Out of scope — do not modify
A concurrent session is mid-build on the **corporate** wellness lane. These files are theirs:

```
server/services/corporate-wellness-foundation.service.js      (untracked)
server/routes/corporate-wellness-foundation.route.js          (untracked, NOT mounted)
server/migrations/20261105000100-corporate-wellness-foundation.migration.js (untracked)
server/__tests__/corporate-wellness-foundation.test.js        (untracked)
client/src/features/corporate-wellness/*                      (untracked)
client/src/pages/corporate/CorporateProgramAnalytics.tsx      (modified)
client/src/pages/employee/CorporateEmployeeDashboard.tsx      (modified)
client/src/components/corporate/CorporateSidebar.tsx          (modified)
```

### Lane boundary (architectural rule)

| Lane | API | Tables | Owner |
|---|---|---|---|
| Individual patient mental health | `/api/programs` | `health_programs`, `program_*` | This plan |
| Corporate / HR wellness | `/api/corporate/wellness` | `wellness_*` | Concurrent session |

The two lanes **never** share a table and **never** join. §7 makes this a tested invariant.

### Explicitly rejected: the open-source React Native repositories

Evaluated and declined. They are React Native *applications*, not modules — the patient dashboard is
React + Vite web, so there is nothing to drop in. Hey Linda is **AGPL-3.0** (unsuitable for a
commercial health platform). Each ships a parallel data model that would sit alongside
`health_programs` and duplicate it. Breathly (MPL-2.0) has the one reusable idea, a breathing
animation, which is ~100 lines of CSS keyframes to author fresh and avoids the licence entirely.
**Decision: take content taxonomy as inspiration; vendor no code.**

---

## 5. Gap register

| ID | Gap | Evidence | Phase |
|---|---|---|---|
| G-1 | No validated instrument exists (PHQ-9, GAD-7, PSS-10, WHO-5, ISI, AUDIT-C) | Repo-wide grep: zero hits | 1 |
| G-2 | `program_assessments` is defined but responses are never captured; `assessment_answers` is written by no code, and is one JSONB per enrollment so cannot hold a repeated instrument | grep of route + services | 1 |
| G-3 | `program_content.content_type` CHECK is `('video','article','tip','recipe','exercise')` — no `'audio'` for guided meditation | migration source | 1 |
| G-4 | No crisis pathway on any patient surface; the detector exists but nothing calls it from mood/journal input | `ai-emergency-triage.service.js:40` | 3 |
| G-5 | `/api/programs` is not treated as PHI by the audit middleware | `audit.middleware.js:16` | 1 |
| G-6 | `program_enrollments.user_id` is `INTEGER NOT NULL` with **no** foreign key to `users` | migration source | 1 (note only) |
| ~~G-7~~ | ✅ FIXED in the Mind & Mood page, which populates the `mood` column | `HealthDiary.tsx:377` vs `health-diary.route.js:169-197` | 2 |
| G-8 | Confidentiality boundary between the mental-health lane and HR aggregation is undefined | `wellness_metric_events.corporate_id` + `/corporate/wellness/analytics` | 1 (code), 3 (test) |
| ~~**G-9**~~ | ✅ FIXED — **the panel showed `--` on all five rows** — the client type declares flat fields that the API never returns (they live in `subscores` JSONB), and `Respiratory` is never computed | `ai-brain-intelligence.sql:262-281` vs `aiHealthServices.ts:20-35`; §9a | 2 (quick win) |
| ~~**G-10**~~ | ✅ FIXED — **sub-score was a hardcoded `7.0`** — identical for all 22 risk rows and all 44,179 HIS rows | `ai-health-risk-cron.service.js:248`; §9a | 2 (replace with real instrument data) |
| ~~**F-1**~~ | ✅ FIXED + DEPLOYED — all three consultation-type filters tested the wrong signal | `doctor.enhanced.route.js:346-351`; §10a | 3 (blocks the booking CTA) |
| ~~**F-2**~~ | ✅ FIXED — fragmented across 13 variants; exact `'Psychiatrist'` reached only 15 of 61 | §10a | 3 |

---

## 6. Regulatory position — SaMD

Per the classification table in [CLAUDE.md](../../CLAUDE.md), the module splits in two.

### Tier A — NOT SaMD (launch scope)

Published, deterministic, fixed-scoring instruments, presented as **raw score + the instrument's own
published severity band**, with an explicit non-diagnostic disclaimer; a clinician or counsellor is
the clinical actor. No quality gate, confidence score or model card required.

Conditions that must all hold for Tier A to remain valid:
- Scoring is a pure function of the answers — no model, no inference, no personalisation.
- No output phrased as a diagnosis, prediction, or clinical recommendation.
- Every result carries: *"This is a self-report screening score, not a diagnosis."*
- Instrument, version and scoring table are recorded with each response (`instrument_code`).

### Tier B — Class IIb SaMD (deferred)

Any **AI-derived** mental-health inference — e.g. "your depression risk is rising based on mood,
sleep and activity trends". Requires the full existing pipeline: `qualityGates.checkXxx()`,
`interpretabilityService.computeConfidenceScore()`, a LIME explanation, a row in
`ai_quality_gate_log`, a `MODEL_CARDS` entry, and `POST /api/ai-governance/model-cards/sync`. Model
and threshold changes flow only through `governanceService.proposeChange()` → medical director →
`approveChange()`.

### Open compliance item — **closed 2026-11-08**

`mental_health_score` is already surfaced to patients, so it was investigated as a possible
ungoverned Class IIb output. It is **a hardcoded constant `7.0`, not a model** — confirmed in
production across 22 risk rows and 44,179 HIS rows, every one identical (§9a). **No SaMD exposure, no
governance finding.** It is reclassified as a data-integrity defect (G-10) alongside the broken
dashboard panel (G-9).

---

## 7. Privacy position

Mental-health data is the most sensitive category this platform handles. Three rules, enforced in
code and covered by tests.

**P-1 — Private by default.** Mind entries are written with `isPrivate = true` (reusing the existing
column, R-4). Instrument responses are visible to the patient and to a clinician they have booked;
to nobody else.

**P-2 — No employer path, enforced structurally.** `program_assessment_responses` has **no
`corporate_id` column and no join path to one** — the lane boundary in §4 is what makes this true,
not a filter that someone could later forget. A test asserts that no corporate or HR endpoint can
return a row from it.

**P-3 — Purpose limitation and retention.** Instrument responses are used only to show the patient
their own trend and to support a consult they initiate. They are not inputs to underwriting,
insurance pricing, claims, CRM, or any corporate aggregate. A retention period is an open decision
(§13, D-3).

**Audit.** `/\/programs/i` is added to `isPHIEndpoint()` so every read and write is audit-logged
(G-5). Consent for the mental-health module is explicit and separate from the general platform
consent (§13, D-2).

---

## 8. Architecture decisions

| ID | Decision | Rationale |
|---|---|---|
| AD-1 | **Extend `/api/programs`; create no new API prefix.** | Ring-fencing already allow-lists it for both `user` and `patient` ([ringFencing.js:44](../../server/middleware/ringFencing.js#L44),[:133](../../server/middleware/ringFencing.js#L133)). A new prefix means a 403 for every patient until both allow-lists are edited — the standing failure mode recorded for this codebase. Zero ring-fencing work is the cheapest and safest path. |
| AD-2 | **Model mental wellness as content in the generic framework**, not a bespoke subsystem. | `program_tracking_params` (mood, stress, sleep), `program_tasks` (breathing, gratitude, wind-down), `program_content` (audio/exercise), `program_assessments` (instruments), `program_health_scores` (composite) already express everything needed. A parallel subsystem would duplicate nine tables. |
| AD-3 | **One new table, `program_assessment_responses`**, for longitudinal instrument capture. | `assessment_answers` is a single JSONB on the enrollment; a fortnightly PHQ-9 needs a time series (G-2). This is the only genuine schema gap. |
| AD-4 | **Reuse `/api/health-diary` for the daily mood check-in; do not create a second mood store.** | Mood logging already works end to end. A second store would fork patient history. Also closes G-7 by populating the `mood` column the API already accepts. |
| AD-5 | **Instrument definitions and scoring live in server-side code, not in the database.** | Scoring must be deterministic, version-pinned, diffable and unit-testable. A score produced by an editable DB row cannot be defended to a regulator. `program_assessments.questions` carries only presentation metadata. |
| AD-6 | **Crisis detection is extracted into a shared helper, not duplicated.** | The pattern at `ai-emergency-triage.service.js:40` is the one place suicidality is defined. Two copies would drift, and the drift would be silent. |
| AD-7 | **Tier B ships behind governance in a separate phase**, never bundled with Tier A. | Keeps launch out of SaMD scope entirely (§6), and keeps the regulatory review surface small. |
| AD-8 | **The new migration is self-sufficient**: it creates the nine framework tables `IF NOT EXISTS` before altering them, and both migrations are registered in `migrate-all.mjs`. | R-1 — the framework migration is in no runner list, so its prior application cannot be assumed on any environment. |
| AD-9 | **No `unique_id` on the new table.** | `program_assessment_responses` holds child records of an enrollment, not an entity. Adding a `unique_id` column without registering it under the rule is exactly what `verify-entity-uid-rule.mjs` fails on; omitting it keeps the check green and is correct by the rule's own definition. |

---

## 9. Phase 0 — Pre-flight gates — **ALL RESOLVED 2026-11-08**

Investigated against the production database (read-only) and the codebase. Scripts, both read-only:
`server/scripts/verify-mind-preflight.mjs`, `server/scripts/verify-mind-specialists.mjs`.

```bash
cd /home/ubuntu/Mediczy/server
node scripts/ssm-env-loader.mjs scripts/verify-mind-preflight.mjs
node scripts/ssm-env-loader.mjs scripts/verify-mind-specialists.mjs
```

| ID | Gate | Outcome |
|---|---|---|
| **PF-1** | Do the nine framework tables exist in production? | ✅ **All 9 PRESENT.** The framework *is* applied, despite being in no runner list (R-1). `program_assessment_responses` is correctly MISSING — it is this plan's new table. **AD-8 still stands** for fresh environments. |
| **PF-2** | Is anything seeded? | ⚠️ **7 active programs, 0 enrollments, 0 task logs.** The framework is live, visible and **never used by a single patient**. No mental-health category among them. |
| **PF-3** | Bookable psychiatrists / psychologists? | ✅ **61 active, all verified, all teleconsult- and walk-in-capable, all with weekly availability.** But two code defects block the booking CTA — see §10a F-1 and F-2. |
| **PF-4** | What computes `mental_health_score`? | ✅ **Nothing. It is a hardcoded constant `7.0`.** Not a model. Not SaMD. But it is a fabricated clinical number on a patient-facing surface — see §9a. |

### Phase 0 findings in detail

**PF-2 — the framework is a ghost town.** Seven active programs exist (`diabetes-reset`,
`weight-reset`, `pcos-reset`, `fatty-liver-reset`, `corporate-wellness`, `hypertension-reset`,
`executive-health`) with `coach_type` values of `hybrid`, `ai` and `human` — so `'hybrid'` is an
established value. `program_enrollments` and `program_task_logs` are both **empty**: the "My Programs"
nav item has been visible to patients all along and nobody has ever enrolled. Two consequences:
seeding is additive, not first-run (the seed script must not clobber the seven); and whatever is
suppressing enrollment is a product problem this module should not blindly inherit.

**Mood tracking is effectively unused** — `health_diary` holds **4** `mood` entries in total (3 with
the `mood` column populated) against 65 `ai_consultation` and 48 `lab_result` rows. Phase 2 is
greenfield, and G-7 is trivial to fix at this volume.

### 9a. PF-4 resolved — the "Mental Health" score is a constant, and the tile is broken anyway

Two independent defects, neither previously known:

**1. The score is a hardcoded literal.**
[ai-health-risk-cron.service.js:248](../../server/services/ai-health-risk-cron.service.js#L248):

```js
subscores.mental_health = 7.0; // Baseline — enhanced when mood tracking available
```

Production confirms it: of 22 rows in `ai_health_risk_scores`, **all 22** have
`mental_health = 7`, `distinct = 1`. The second path, `his_scores` (written by
`ai-his-score.service.js` every 6h), computes `_calcMentalHealth()` as a keyword regex over clinical
entities with a default of 7 — and across **44,179 rows** it too has `distinct = 1`, so the regex has
never once matched. Both paths emit the same constant for every patient on the platform.

**Regulatory read:** a constant is not a model and not an inference, so **there is no ungoverned
Class IIb output** — R-6's worst case does not hold, and no governance finding is needed. What exists
instead is a **data-integrity and trust defect**: a number presented as a clinical sub-score that was
never computed. That is the same class of problem as the fabricated clinical mock data found across
~27 client pages, and it should be fixed, not governed.

**2. The patient-facing tile reads fields that do not exist.** `GET /v3/ai-intelligence/risk-score/me`
returns `hrs.*` — a raw `ai_health_risk_scores` row whose only score payload is the **`subscores`
JSONB** (keys `cardiovascular`, `diabetes`, `hypertension`, `medication_adherence`, `lifestyle`,
`mental_health`). The client's `HealthRiskScore` interface declares them as **flat top-level fields**
(`mental_health_score`, `cardiovascular_risk`, `diabetes_risk`, `respiratory_risk`, `lifestyle_score`)
— none of which exist on the row, and `respiratory` is never computed at all. Because
[SmartHealthDashboard.tsx:241](../../client/src/pages/patient/SmartHealthDashboard.tsx#L241) renders
`{metric.value ?? '--'}` with `width: Math.min(metric.value ?? 0, 100)%`, the result is that **all
five rows of the "Risk Analysis" panel show `--` with empty bars** for every patient. It fails
silently and has presumably done so since the panel shipped.

**Recommendation (G-9, a quick win independent of this module):** map `subscores` to the client
contract in the route (or read `subscores.*` in the component), drop the uncomputed `Respiratory`
row, and either compute `mental_health` honestly from the Phase 1/2 instruments — which is precisely
what the `// enhanced when mood tracking available` comment anticipated — or remove the tile until it
is real. **Do not ship a Mind & Mood page beside a "Mental Health: --" tile.**

---

## 10. Phase 1 — Backend foundation — ✅ BUILT 2026-11-08

**Goal:** instruments can be served, answered, scored and stored, with audit — nothing user-visible yet.

**Status: ✅ DEPLOYED 2026-11-08.** Migration applied, server reloaded (restart 113, clean), seed run
— `mood-care` (309), `calm-resilience` (310), `sleep-reset` (311) are live and active; the 7
pre-existing programs are untouched (7/7 still active). 43 tests pass. `verify-entity-uid-rule.mjs`
exits 0.

**Verified against production after deploy:**

| Check | Result |
|---|---|
| `program_assessment_responses` | PRESENT; privacy invariant OK (no employer-linking column) |
| `program_content` accepts `'audio'` | YES — and a real `'audio'` insert succeeded |
| Route INSERT + history SELECT | run against the live schema inside a rolled-back transaction — `raw_score`, `severity_band` and `flagged_items` all round-trip; PHQ-9 item 9 = 2 ⇒ `crisis`, band `moderate` |
| Seeded content | params/tasks/content/assessments counts all as specified; each assessment row carries only an `instrumentCode` pointer, no scoring logic (AD-5 holds) |
| `program_assessment_responses` rows | 0 — nobody has taken a check-in yet |

**Still unverified:** an authenticated round-trip through the three endpoints. Ring-fencing rejects
any request without a valid patient token before routing, so this needs a real patient login (or a
Phase 2 click-through). Handler behaviour is covered by 13 HTTP contract tests against the real
router, and the SQL by the live rolled-back transaction above.

| Deliverable | File | State |
|---|---|---|
| Migration | [20261110000100-mental-wellness-instruments.migration.js](../../server/migrations/20261110000100-mental-wellness-instruments.migration.js) | written, `--check` run |
| Instrument registry + scoring | [mental-wellness-instruments.service.js](../../server/services/mental-wellness-instruments.service.js) | PHQ-9 + GAD-7 |
| 3 API endpoints | [health-programs.route.js](../../server/routes/health-programs.route.js) (above `/:slug`) | written |
| Audit PHI pattern | [audit.middleware.js](../../server/middleware/audit.middleware.js) | `/\/programs/i` added |
| Seed | [seed-mental-wellness-programs.mjs](../../server/scripts/seed-mental-wellness-programs.mjs) | dry-run verified |
| Runner registration | [migrate-all.mjs](../../server/scripts/migrate-all.mjs) | both migrations added |
| Tests | [mental-wellness-instruments.test.js](../../server/__tests__/mental-wellness-instruments.test.js) | 19 passing |

### Two decisions taken during the build

**Only PHQ-9 and GAD-7 ship (RK-8 / D-5).** Both were released for use without permission ("no
permission required to reproduce, translate, display or distribute"). The others are withheld and
named in `PENDING_LICENCE_REVIEW`, with `getInstrument()` returning null for each, so one cannot be
used by accident: **ISI** is copyrighted and commercially licensed, **PSS-10** is free only for
academic use, **WHO-5** needs permission for commercial use, **AUDIT-C** derivative terms unconfirmed.
Consequence: *Sleep Reset* ships habit-led (`coach_type: 'ai'`) with no validated instrument.

**AD-8 revised — the migration imports the framework's `up()` instead of duplicating its DDL.**
The original wording said to re-declare the nine tables `IF NOT EXISTS`, which would have created two
sources of truth for the same schema. The framework migration exports `up()`, so the new migration
runs it when the base tables are missing. Production already has all nine (PF-1); this only matters
on a fresh environment.

### R-7 — a seventh review finding, discovered while running the migration

`scripts/ssm-env-loader.mjs` loads its target with `await import(entryUrl)` and **does not rewrite
`process.argv`**, so the conventional entry guard
`import.meta.url === pathToFileURL(process.argv[1]).href` never fires: argv[1] is the loader. The
first `--check` run therefore connected to production, printed nothing, and exited 0 — a **silent
skip**, the same class of failure already recorded against this loader. Both the migration and the
seed script now use a loader-aware guard that accepts argv[1] or argv[2]. Any future migration run
through this loader needs the same guard, or it will appear to succeed while doing nothing.

### Deliverables

**1. Migration** — `server/migrations/20261110000100-mental-wellness-instruments.migration.js`
- Creates the nine framework tables `IF NOT EXISTS` (AD-8), idempotent, by reusing the DDL from
  `health-coaching-framework.migration.js`.
- Creates `program_assessment_responses` (§11).
- `ALTER` `program_content.content_type` CHECK to add `'audio'` (G-3) — drop and recreate the
  constraint, no data migration needed.
- Registers both this migration and `health-coaching-framework.migration.js` in
  `server/scripts/migrate-all.mjs`.
- Single transaction; `--check` mode supported, matching the `contact-center` precedent in
  `migrate-all.mjs`.
- No `unique_id` column (AD-9).

**2. Instrument service** — `server/services/mental-wellness-instruments.service.js`
- Instrument definitions as pure version-pinned data: `PHQ9`, `GAD7`, `PSS10`, `WHO5`, `ISI`.
- `score(instrumentCode, answers)` → `{ rawScore, band, interpretation, flaggedItems, version }` —
  a pure function, no I/O, no model (AD-5).
- `PHQ9` **item 9 is special-cased**: any non-zero answer sets `flaggedItems: ['PHQ9_Q9']` and
  `crisis: true`.
- Every return carries the non-diagnostic disclaimer string (§6 Tier A condition).

**3. Route extensions** — `server/routes/health-programs.route.js`
- `GET  /api/programs/instruments` — catalogue of instrument definitions.
- `POST /api/programs/enrollment/:id/assessments` — submit answers; scores server-side; persists.
- `GET  /api/programs/enrollment/:id/assessments` — the patient's own response history.
- All `authUser`; every handler scopes by `user_id = req.user.id` **and** verifies the enrollment
  belongs to that user before touching a response row.
- **All three declared before `GET /:slug`** (R-3).

**4. Audit** — `server/middleware/audit.middleware.js`
- Add `/\/programs/i` to `phiPatterns` (G-5).

**5. Seed** — `server/scripts/seed-mental-wellness-programs.mjs`
- Three programs: *Calm & Resilience* (stress/anxiety, 60d, GAD-7 + PSS-10, `coach_type: 'hybrid'`),
  *Sleep Reset* (45d, ISI, `coach_type: 'ai'`), *Mood Care* (90d, PHQ-9, `coach_type: 'hybrid'`) —
  hybrid confirmed by PF-3 (§10a).
- Each with tracking params (mood, stress, sleep hours), daily tasks (breathing, gratitude note,
  wind-down routine), content rows, and assessment definitions.
- Idempotent on `slug`; `--dry-run` supported. **Additive, not first-run** — PF-2 found 7 active
  programs already live (`diabetes-reset`, `weight-reset`, `pcos-reset`, `fatty-liver-reset`,
  `corporate-wellness`, `hypertension-reset`, `executive-health`). The script must not modify or
  deactivate any of them.

### Acceptance criteria
- `GET /api/programs/instruments` returns the catalogue — **not** a 404 from the `:slug` catch-all (R-3).
- Submitting a PHQ-9 with item 9 = 1 returns `crisis: true` and persists `flagged_items`.
- Patient A cannot read or write patient B's responses (403, by enrollment ownership).
- `node scripts/ssm-env-loader.mjs scripts/ci/verify-entity-uid-rule.mjs` exits 0.
- Migration is idempotent: running it twice is a no-op.
- An audit row with `isPHI: true` is written for an assessment submission.

**Estimate:** 2–3 days.

---

## 10a. The human-coaching leg (PF-3 resolved)

Psychiatrists and psychologists are on the platform and consultable **online and offline**
(owner-confirmed, 2026-11-08). **The production data agrees** — but two code defects currently stop
the booking path from returning any of them.

### What the data says

| Metric (active mental-health doctors) | Value |
|---|---|
| Total | **61** |
| Verified | 61 |
| `consultationTypes.online.available = true` | **61** |
| `consultationTypes.walkIn.available = true` | **61** |
| Has `weeklyAvailability` | 61 |
| Has an online fee | 61 |
| `isOnline = true` | **0** |

So the capability is real and complete: every one of the 61 is set up for both online and in-person
consults, with availability. The owner's statement is confirmed.

### F-1 — ✅ FIXED AND VERIFIED LIVE 2026-11-08

**Post-reload, measured on the live endpoint:**

| `/api/doctors/available` | Before | After |
|---|---|---|
| `consultationType=online` | 5 | **970** |
| `online&specialization=Psychiatrist` | **0** | **15** (61 once F-2 is fixed) |
| `consultationType=walkIn` | **0** | **966** |
| `consultationType=homeVisit` | 0 | 0 — truthful, nobody records the capability |
| unrecognised value (`telepathy`) | — | 970 = no filter applied, not the wrong one |
| no filter | 970 | 970 |

`walkIn` landed on exactly the 966 predicted from the data. `online` equals the unfiltered 970,
which is the permissive-by-design caveat below showing up in practice.


The investigation found the defect was **wider than the online filter**: all three
consultation types were resolving to the wrong signal, and the live endpoint confirmed it.

| Live, pre-fix (`/api/doctors/available`) | Returned | Should be |
|---|---|---|
| `consultationType=online` | **5** of 1104 | 1104 active / 978 verified |
| `consultationType=online&specialization=Psychiatrist` | **0** | 15 (61 with F-2 fixed) |
| `consultationType=walkIn` | **0** | 1032 active / 966 verified |
| `consultationType=homeVisit` | 0 | 0 (accurate — nobody offers them) |
| no filter | 100 (page limit) | — |

**Part 1 — online tested presence.** `("isOnline" = true)`, but `isOnline` is a plain boolean
defaulting to `false`, declared beside `lastLoginAt` and computed from the active-socket set in
`chat.route.js`: it means **"logged in right now"**, not "offers teleconsultation". True for 5 of 1104.

**Part 2 — walk-in required a Google verification that was never populated.** The in-person predicate
was `hasAddress AND googleVerifiedLocation`, and the Google conjunct matched **0 of 1104**: across
every active row `clinicAddress_json` holds only `state`/`city`/`pincode`/`country`/`street`/`line1`
— never `placeId`, `source` or `provider` — so it is **unsatisfiable by construction**. In-person
search returned an empty list for every patient, in every specialty.

**Part 3 — home visits shared the walk-in predicate**, so a home-visit search could have returned
doctors who do not offer one.

**The fix.** Predicates and the full rationale moved into
[doctorConsultationCapability.js](../../server/utils/doctorConsultationCapability.js), replacing the
duplicated branch in both route blocks with one `consultationCapabilitySql()` call:

| Type | New predicate |
|---|---|
| `online` | `consultationTypes->'online'->'available' = 'true'::jsonb` |
| `walkIn` | that for `'walkIn'`, **AND** a usable address — so a result has somewhere to go |
| `homeVisit` | its own `'homeVisit'` key, never walk-in's |
| unrecognised | `null` → no filter applied, rather than the wrong one |

Compared as `jsonb` rather than cast with `::boolean`, so a non-boolean value cannot raise at query
time. `strictQcLiteral` deliberately **keeps** the presence check: that OR-branch has been dead, so
strict QC has been address-based in practice, and switching it would let 72 doctors with no usable
address pass QC on a bulk-defaulted flag.

**Honest caveat.** All 1104 active doctors carry `online.available = true` and 1103 carry
`walkIn.available = true` — the same legacy model default that produced the placeholder fees. So
these filters are **permissive by design** and will match nearly every doctor until per-doctor
capability is curated. This follows the established precedent in `doctorNormalizer.js`: where a bulk
default cannot be distinguished from a real value, label it and stay honest rather than invent a
distinction. Filtering on a column that means something else was strictly worse.

**Verification done:** 9 unit tests in
[doctor-consultation-capability.test.js](../../server/__tests__/doctor-consultation-capability.test.js)
(including an explicit regression guard that `isOnline` can never return to the capability filter);
every predicate executed through the real Sequelize + `literal()` path against production via
`scripts/verify-f1-query-path.mjs` (online 1104, walkIn 1032, homeVisit 0, verified 978/966,
mental-health specialists 61 online / 60 walk-in); 4 adjacent doctor/audit suites still pass.
**Outstanding: `pm2 reload` (gated) and a live re-run of the table above.**

### F-2 — ✅ FIXED 2026-11-08

`specialization` keeps its **exact** match, so no existing caller changes behaviour
(`Cardiology` still returns 29). A new opt-in `specializationLike` parameter does a
comma-separated OR of substring matches, with terms under 3 characters dropped so a degenerate
value applies **no** filter rather than matching everything.

Verified through the real Sequelize path against production: exact `'Psychiatrist'` → 15,
`specializationLike=psychiatr,psycholog` → **61**, i.e. 46 more specialists now reachable; combined
with the F-1 capability filter, 61 online and 61 walk-in. Normalising the specialization master
remains the proper long-term fix and is still out of scope.


The 61 doctors are spread across **13 distinct specialization strings**:

```
 26  Psychiatry                        1  Forensic Psychiatry
 15  Psychiatrist                      1  Addiction Medicine & Psychiatry
 10  Psychologist                      1  Molecular Genetics & Psychiatry
  1  Clinical Psychologist             1  Old Age Psychiatry
  1  Clinical Psychology               1  Psychiatry & Mental Health
  1  Geriatric Psychiatry              1  Child & Adolescent Psychiatry
  1  Child Psychiatry
```

An exact match on `'Psychiatrist'` — the string [appointmentIntent.js:65-66](../../server/utils/appointmentIntent.js#L65-L66)
maps to — returned **15 of 61**, missing the largest bucket (`Psychiatry`, 26) entirely. Exact
`'Psychologist'` returned 10 of the 13 psychology-ish records.

### Mechanism

```
GET /api/doctors/available?specialization=Psychiatrist&consultationType=online
GET /api/doctors/available?specialization=Psychologist&consultationType=walkIn
```

- Both parameters are already validated by [doctor.enhanced.route.js:215-218](../../server/routes/doctor.enhanced.route.js#L215-L218);
  `consultationType` accepts `online` | `walkIn` | `homeVisit`, which maps exactly onto the
  online/offline requirement (`walkIn` = in-person).
- `GET /api/doctors*` is **public for GET** in ring-fencing ([ringFencing.js:1026](../../server/middleware/ringFencing.js#L1026)),
  so the CTA works before and after login.
- Specialty strings `Psychiatrist` and `Psychologist` already match the mapping in
  [appointmentIntent.js:65-66](../../server/utils/appointmentIntent.js#L65-L66), so voice/chat entry
  points reach the same doctors as the Mind & Mood page.
- Booking itself goes through the existing appointment flow — unchanged.

**Consequences for the plan:**

| Area | Resolution |
|---|---|
| `coach_type` | `'hybrid'` for *Mood Care* and *Calm & Resilience* — a human is genuinely reachable |
| Phase 3 crisis card | Helplines **and** a live "Talk to a professional" CTA, with an online/offline choice |
| Mind & Mood page | A standing "Consult a specialist" entry, not only a crisis-time affordance |
| `assigned_doctor_id` on `program_enrollments` | Becomes meaningful — a booked psychiatrist can be linked to the enrollment |

**Caveat to handle — placeholder consultation fees.** Platform-wide, 901 doctors carry a hardcoded
`onlineConsultationFee = 500`, which is why [doctorNormalizer.js](../../server/utils/doctorNormalizer.js)
exposes `feeSource` / `feeConfirmed` / `feeIsIndicative`. Within this cohort the placeholder is
concentrated in the `Psychiatry` bucket — **26 of the 61 carry exactly ₹500** (the `Psychiatrist` and
`Psychologist` buckets do not). The CTA **must respect `feeConfirmed`**: show a price only when
`feeSource === 'doctor'`, otherwise "Fee shown at booking". Quoting a placeholder ₹500 for a
psychiatric consult is a trust failure in the one place the platform can least afford it.

**Added to the test plan:** the CTA returns ≥1 psychiatrist for `consultationType=online` and ≥1 for
`consultationType=walkIn`; no unconfirmed fee is ever rendered as a price.

---

## 11. Schema — `program_assessment_responses`

```sql
CREATE TABLE IF NOT EXISTS program_assessment_responses (
  id               SERIAL PRIMARY KEY,
  enrollment_id    INTEGER NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
  assessment_id    INTEGER REFERENCES program_assessments(id) ON DELETE SET NULL,
  instrument_code  VARCHAR(40)  NOT NULL,        -- PHQ9, GAD7, PSS10, WHO5, ISI
  instrument_ver   VARCHAR(20)  NOT NULL,        -- pins the scoring table used
  answers          JSONB        NOT NULL,
  raw_score        NUMERIC(6,2),
  severity_band    VARCHAR(40),                  -- published band label, never a diagnosis
  flagged_items    JSONB        NOT NULL DEFAULT '[]'::jsonb,
  is_self_report   BOOLEAN      NOT NULL DEFAULT TRUE,
  administered_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  administered_by  INTEGER,                      -- null = patient self-administered
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_par_enrollment
  ON program_assessment_responses (enrollment_id, administered_at DESC);
CREATE INDEX IF NOT EXISTS idx_par_instrument
  ON program_assessment_responses (instrument_code, administered_at DESC);
```

Deliberate omissions, each load-bearing:
- **No `corporate_id` and no join path to one** — P-2 is structural, not a filter.
- **No `unique_id`** — child record, not an entity (AD-9).
- **No `interpretation` text column** — generated at read time from the pinned `instrument_ver`, so a
  scoring-table correction cannot leave stale interpretations in the database.
- `enrollment_id` carries the FK; patient identity is reached through `program_enrollments.user_id`
  (which itself lacks an FK to `users` — G-6, pre-existing, not fixed here to avoid a wide migration).

---

## 12. Phases 2–4

### Phase 2 — Patient dashboard UI + dashboard-tile repair — ✅ BUILT 2026-11-08

| Deliverable | File |
|---|---|
| Mind & Mood page | [MindWellness.tsx](../../client/src/pages/patient/MindWellness.tsx) at `/mind-wellness` |
| Route | `routes/index.tsx` (lazy import + one `<Route>`) |
| Nav | `Sidebar.tsx` — "Mind & Mood" under **My Health**, after Health Diary |
| G-9 server fix | [riskScoreNormalizer.js](../../server/utils/riskScoreNormalizer.js), applied in both `/risk-score` handlers |
| G-9 client fix | `aiHealthServices.ts` (`HealthRiskScore` nullable, no `respiratory_risk`), `SmartHealthDashboard.tsx` |
| G-10 | [mentalHealthSubscore.js](../../server/utils/mentalHealthSubscore.js) + `calcMentalHealthScore()` in `ai-health-risk-cron.service.js` |
| Catalogue polish | `MyPrograms.tsx` — `mental_health` label, Brain/Wind/Moon icons, plus two pre-existing `ProgramIcon` type errors fixed |

**Page contents:** daily mood check-in (writes through `/health-diary` with `isPrivate: true` and
populates the `mood` column, closing G-7 — not a second mood store, per AD-4); PHQ-9 and GAD-7
questionnaires served from the API so the client never hard-codes an item; result card with raw
score, published band and the API's own disclaimer; a check-in trend list; a guided breathing
exercise (hand-written, no vendored library — the licence-free route past Breathly); and a
"Consult a specialist" panel wired to F-1 + F-2 with online/in-person toggle, honouring
`feeConfirmed` so no placeholder ₹500 is ever shown as a price.

**Crisis card brought forward from Phase 3.** Phase 1 already returns `crisis: true` on PHQ-9 item 9,
so shipping the questionnaire without surfacing help would mean detecting suicidality and saying
nothing. The page shows a non-dismissible card with Tele-MANAS 14416 and KIRAN 1800-599-0019 (both
still to be re-verified against the current MoHFW listing before release) plus a route to a
specialist. The full Phase 3 work — the shared detector extracted from `ai-emergency-triage`, diary
free-text scanning, and the lane-boundary tests — is still outstanding.

#### G-10 exposed a worse bug, now fixed: the risk score rewarded poor habits 🔴

Replacing the hardcoded `mental_health = 7.0` was unsafe on its own. The overall-risk loop was:

```js
overall += (subscores[key] || 5) * Math.abs(weight);   // weights were NEGATIVE for 3 of 6
```

`Math.abs()` discarded the sign on the three "higher is better" subscores, so **good medication
adherence, a healthy lifestyle and good mental health all increased computed risk.** It went
unnoticed because `mental_health` was a constant and the other two rarely vary — but with a real
mental-health subscore, severe depression (a low score) would have made a patient look *healthier*.

Measured on production data before changing anything:

| | old formula | new formula |
|---|---|---|
| Same disease risk, **healthy** habits | 4.80 → `moderate` | **1.30 → `low`** |
| Same disease risk, **poor** habits | 1.65 → `low` | **4.45 → `moderate`** |

All **22 of 22** stored `overall_score` values reproduce exactly from the old formula, confirming it
is what ran in production rather than assuming it. **21 of 22 rows change risk tier** once the cron
recomputes (20 `moderate → low`, 1 `critical → high`), so most patients were being over-triaged.

Now inverted explicitly, matching the established `(10 - x) * weight` form in
`ai-his-score.service.js`, and an absent subscore is **excluded with the remaining weights
renormalised** rather than silently defaulted to 5. The risk model already runs under
`ai-quality-gates` + interpretability, so this stays inside existing governance.

**`mental_health` is now real:** latest PHQ-9/GAD-7 band within 6 months (worse of the two, since
under-stating is the more harmful error), else a mood-diary average over 30 days requiring **at least
3 entries**, else absent. Never a constant, and `null` is a meaningful answer.


- `client/src/pages/patient/MindWellness.tsx`, route `/mind-wellness` in `client/src/routes/index.tsx`.
- One sidebar item in the existing **My Health** group, after "Health Diary":
  `{ icon: Brain, label: "Mind & Mood", path: "/mind-wellness" }`.
- Sections: daily mood/stress check-in strip (writes via `/api/health-diary` with `isPrivate: true`
  and the `mood` column populated — AD-4, G-7); "Take a check-in" card per instrument with score
  history chart; breathing/meditation player; enrolled-program progress reusing `ProgramJourney`.
- Existing design tokens only. Light and dark themes.
- **Does not touch** any file listed in §4 "out of scope".

**Acceptance:** nav item appears once a program is seeded; a check-in round-trips and renders in the
trend; every score displays the non-diagnostic disclaimer; page works at 400px width.

### Phase 3 — Safety and the human leg — ✅ BUILT 2026-11-08

**Delivered**

| File | What it does |
|---|---|
| `server/utils/crisis-detection.js` *(new)* | One definition of the crisis phrases **and** of the helplines. Two tiers (`imminent`, `elevated`), 10 patterns, `detectCrisis()` + `crisisSupportPayload()`. Imports nothing — no db, no mailer, no notifier — which is asserted by test. |
| `server/services/ai-emergency-triage.service.js` | Now imports `TRIAGE_PSYCHIATRIC_RED_FLAG` instead of carrying the regex inline. **Byte-identical pattern — zero behaviour change** (see the governance note below). |
| `server/routes/health-diary.route.js` | `POST /`, `PUT /:id` and `POST /log-symptom` scan the entry's own text and return a `support` object when it reads as distress. `PUT` scans the entry *as it stands after the edit*, so an untouched body still counts. |
| `server/services/mental-wellness-instruments.service.js` | A flagged crisis item (PHQ-9 Q9 > 0) now carries `support` with the helplines. Still pure — `HELPLINES` is a frozen constant. |
| `server/routes/health-programs.route.js` | `GET /instruments` serves `helplines` so the client needs no hardcoded copy. |
| `client/src/pages/patient/MindWellness.tsx` | Helplines come from the server; the hardcoded list is now only a fallback for a failed fetch. `CrisisCard` renders every number per line and takes the server's wording when raised by a text scan. |
| `client/src/pages/HealthDiary.tsx` *(new banner)* | Shows the support card on a detection, with "Your entry is private. Showing this did not notify anyone." |
| `server/scripts/propose-triage-crisis-pattern-alignment.mjs` *(new)* | Files the triage-pattern broadening for medical-director review. Dry-run by default. |

**Helplines re-verified 2026-11-08** (the item the plan flagged as outstanding):

| Helpline | Numbers | Source |
|---|---|---|
| Tele-MANAS | **14416**, **1800-891-4416** | MoHFW; NIMHANS apex centre. The alternate toll-free number was **missing** from the Phase 2 card and has been added. |
| KIRAN | **1800-599-0019** | PIB release PRID 1652240 (launched 08-09-2020, 13 languages) |
| Emergency | **112** | Added — the Phase 2 card only mentioned "your local emergency number" in prose |

**⚠️ Governance: the triage red flag was deliberately NOT broadened.**
The red-flag list belongs to model card **`emergency-triage-esi-v1` — Class III SaMD (high risk)**,
whose `changeControlPlan` reads *"Changes to red-flag patterns or vital thresholds require medical
director sign-off."* Widening it changes which patients are triaged **ESI-2 (emergent)**, which is a
clinical threshold change, not a refactor. That same card already lists, under known limitations,
*"Red flag patterns are regex-based and may miss paraphrased descriptions"* — exactly the gap here.
So the extraction is behaviour-preserving and the broadening is filed as a proposal for a human to
decide:

```
node scripts/ssm-env-loader.mjs scripts/propose-triage-crisis-pattern-alignment.mjs           # dry run
node scripts/ssm-env-loader.mjs scripts/propose-triage-crisis-pattern-alignment.mjs --apply   # file it
```

The proposal measures the gap: of 10 real-world phrasings of suicidal intent, the current
four-phrase regex matches **1** and misses **9** (an explicit plan, a named means, a farewell, and
all of the hopelessness/burden phrasings). It also tells the reviewer the likeliest right answer —
adopt the `imminent` tier for triage and leave `elevated` to the patient-facing surfaces, which
needs no new code beyond a filter on `rule.level`.

**Two design decisions worth stating, because both are deliberate asymmetries**

1. **No figurative-use suppression.** "I'll kill myself if I sit through another review" matches.
   A false positive costs an unwanted panel offering a free helpline; a false negative costs a life.
2. **But four patterns are deliberately narrowed, because this is a *health* diary.** A crisis panel
   on a grazed knee teaches people to dismiss the panel, which is how a safety feature becomes
   noise. Each narrowing and the phrasing it gives up is pinned by name in
   `__tests__/crisis-detection.test.js`:

   | Narrowed | Because this is routine diary text | Cost |
   |---|---|---|
   | `kill myself` only, never bare `kill me` | "my back pain is killing me" | misses a terse "I want someone to kill me" |
   | `jump off/from` requires a place (building, terrace, bridge…) | "jumped off the treadmill when my knee twinged" | misses an unqualified "I want to jump" |
   | `this is my last` requires *message/note/entry/day/night* | "this is my last tablet of the course" | misses an unusual farewell phrasing |
   | self-harm needs a progressive form or an intent marker (`cutting myself`, `cut myself again / on purpose`) | "I cut myself shaving", "hurt myself lifting", "burned myself on the stove" | misses a terse "I cut myself" that was not an accident |

**Detection notifies nobody.** No alert, no email, no row written, no flag on the entry, no
employer visibility. Asserted three ways: the detector imports nothing; `withCrisisSupport` contains
no `notify`/`sendEmail`/`INSERT`/`alert` token; and an HTTP test proves the stored row is
*byte-identical* whether or not a detection fired. Someone who learns that typing how they feel
triggers a report stops typing how they feel.

**Tests: 89 added, all passing** — `crisis-detection.test.js` (66), `health-diary-crisis-support.test.js`
(10), `mental-wellness-lane-boundary.test.js` (11), plus 2 in the instruments suite.

**Lane boundary, now enforced by test rather than by inspection** —
`mental-wellness-lane-boundary.test.js` sweeps every `.js/.mjs/.ts` file under `routes`, `services`,
`controllers`, `repositories`, `models`, `middleware`, `utils`, `migrations`, `scripts` and
`__tests__` (1 000+ files) and fails if any file outside a 10-entry allow-list so much as *mentions*
`program_assessment_responses`; separately it fails if any corporate/HR/OHC/CMO-named file does. It
also asserts the table's `CREATE TABLE` body declares no `corporate_id`/`employer_id`/`tenant_id`
and that its only foreign keys are `program_enrollments` and `program_assessments` — so the absence
of a join path to an employer is a *checked* property, not a remembered one.

**Still open:** the broadening proposal needs filing (`--apply`) and then a medical director.

<details>
<summary>Original Phase 3 plan (for the record)</summary>

- Extract the suicidality pattern from `ai-emergency-triage.service.js:40` into
  `server/utils/crisis-detection.js`; the triage service imports it (AD-6 — one definition).
- Call it on: PHQ-9 item 9 > 0; Health Diary mood free-text; mood score of 1 with a note.
- On trigger: a prominent, non-blocking crisis card carrying the national helplines
  (**Tele-MANAS 14416**, **KIRAN 1800-599-0019** — *both to be re-verified against the current MoHFW
  listing before release*), plus a one-tap "Talk to a professional" CTA — real, per PF-3 — offering
  **online or in-person** via `GET /api/doctors/available?specialization=Psychiatrist&consultationType=…`
  (§10a), honouring `feeConfirmed`.
- A standing (non-crisis) "Consult a specialist" entry on the Mind & Mood page, same mechanism,
  offering Psychiatrist and Psychologist across both consult modes.
- Never blocks the user from continuing. **Never notifies an employer** (P-2).
- Enforce and test the lane boundary: no corporate or HR endpoint can return a
  `program_assessment_responses` row.

**Acceptance:** a crisis-triggering entry surfaces the card and is recorded; the specialist CTA
returns ≥1 psychiatrist for both `online` and `walkIn`; no unconfirmed fee is rendered as a price; no
corporate endpoint returns a mind response (negative test); the triage service's existing behaviour
is unchanged after the extraction (regression test).

</details>

### Phase 4 — AI coach, Tier B *(deferred, needs governance sign-off)*

Routed through `doctor-copilot` / `llm-provider` only — never a direct provider call. Requires the
complete SaMD set per §6: quality gate, confidence score, LIME explanation, `ai_quality_gate_log`
row, `MODEL_CARDS` entry, `model-cards/sync`. Hard-coded refusal to diagnose; crisis detector runs on
every turn. **Not to be started until Phases 1–3 are live and PF-4 is resolved.**

---

## 13. Test plan

`server/__tests__/mental-wellness-instruments.test.js`
- Scoring correctness for each instrument against published reference vectors, at band boundaries.
- PHQ-9 item 9 > 0 ⇒ `crisis: true` and `flaggedItems` populated; item 9 = 0 ⇒ not flagged.
- Scoring is pure: same answers ⇒ identical output, no I/O.

`server/__tests__/mental-wellness-api.test.js`
- `GET /api/programs/instruments` resolves to the catalogue, not the `:slug` handler (R-3 regression).
- Cross-patient isolation: A cannot read or write B's responses.
- Response rows cannot be reached through any corporate/HR endpoint (P-2).
- Migration idempotency; `verify-entity-uid-rule.mjs` exits 0.
- An audit row with `isPHI: true` is written on submission (G-5 regression).

`server/__tests__/crisis-detection.test.js`
- Shared helper matches the documented phrases; emergency-triage behaviour unchanged post-extraction.
- Specialist CTA: `specialization=Psychiatrist` returns ≥1 doctor for `consultationType=online` and
  ≥1 for `walkIn`; a doctor with `feeConfirmed === false` never renders a numeric price (RK-9).

**Manual E2E:** seed → nav item appears → enroll → daily mood check-in → take PHQ-9 → score + band +
disclaimer render → trend chart updates → crisis path shows helplines → (PF-3 permitting) booking CTA
reaches a real psychiatrist.

---

## 14. Deployment runbook — EC2 only

ECS / Fargate (`mediczy.in`) is **out of scope and must not be touched**. Never put `[deploy-prod]`
in a commit message.

1. Apply the migration (operator-run, gated):
   `cd server && node scripts/ssm-env-loader.mjs migrations/20261110000100-mental-wellness-instruments.migration.js`
2. Verify: `node scripts/ssm-env-loader.mjs scripts/ci/verify-entity-uid-rule.mjs` → exit 0.
3. Seed: `node scripts/ssm-env-loader.mjs scripts/seed-mental-wellness-programs.mjs --dry-run`, review, then run live.
4. `pm2 reload mediczy-server --update-env` (operator-run, gated).
5. `cd client && npm run build` — `app.mediqzy.com` serves `client/dist` from nginx on the box.
6. Smoke-test the **live** endpoints with a real patient token — route mounting and SQL checks are
   not sufficient; send a real request through each new handler.

> Step 6 is non-negotiable. A production 500 on `validate-employee` (2026-11-07) was caught only by
> smoke-testing the live endpoint after reload, having passed both route-mounting and SQL checks.

**Commit discipline:** always `git commit -- <explicit paths>` and verify `git diff --cached` first.
The git index is shared with a concurrent session, and a pathspec-less commit sweeps their staged
files onto `main`.

---

## 15. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| ~~RK-1~~ | ~~Framework tables absent in production~~ | — | — | **CLOSED by PF-1: all 9 tables present.** AD-8 retained for fresh environments |
| RK-2 | Collision with the concurrent corporate-wellness session | Medium | High | §4 file-level boundary; separate lanes; explicit-pathspec commits |
| RK-3 | Mental-health data reaches an HR aggregate | Low | **Severe** | P-2 structural (no `corporate_id`, no join path) + negative test |
| RK-4 | Tier A scope creep into Tier B during build | Medium | High | AD-7; §6 conditions are acceptance criteria; no model in Phase 1–3 |
| ~~RK-5~~ | ~~`mental_health_score` is a live ungoverned Class IIb output~~ | — | — | **CLOSED by PF-4: it is a hardcoded constant, not a model — no SaMD exposure.** Replaced by G-9/G-10 (data integrity, not governance) |
| ~~RK-10~~ | ~~Mind & Mood shipping beside a "Mental Health: --" tile~~ | — | — | **CLOSED: G-9 and G-10 fixed in the same change** |
| ~~RK-11~~ | ~~F-1 changes doctor search for every specialty~~ | — | — | **CLOSED: shipped as its own commit with a production verification pass; measured live** |
| **RK-12** | The risk-direction fix moves **21 of 22** patients' `risk_level` on the next cron run (mostly `moderate -> low`), which also changes `recommendations` and any downstream notification | Certain | **High** | Intended — the old direction was inverted. Flagged to the platform owner; the model is already under `ai-quality-gates`, which logs the shift |
| RK-6 | New `GET` route shadowed by the `:slug` catch-all | Medium | Medium | R-3 ordering is a tested acceptance criterion |
| RK-7 | Crisis helpline numbers stale or wrong | Low | **Severe** | Re-verify against the current MoHFW listing before release; make them config, not literals |
| RK-8 | Instrument licensing — PHQ-9/GAD-7 are free for clinical use; PSS-10/ISI terms need checking | Medium | Medium | Confirm each instrument's licence before shipping it; drop any that is not clearly free to use |
| RK-9 | A placeholder ₹500 fee is shown for a psychiatric consult (901 doctors carry the hardcoded value) | **High if unhandled** | High | Render a price only when `feeConfirmed` / `feeSource === 'doctor'`; otherwise "Fee shown at booking" (§10a) |

---

## 16. Open decisions

| ID | Decision needed | Default if unanswered |
|---|---|---|
| ~~**D-1**~~ | ~~Run the Phase 0 preflight~~ | **RESOLVED 2026-11-08 — all four gates answered (§9). Phase 1 is unblocked** |
| ~~**D-7**~~ | ~~Fix F-1 here or separately?~~ | **RESOLVED: fixed first, as its own change, before Phase 1 (§10a). It turned out to affect all three consultation types, not just online** |
| ~~**D-8**~~ | ~~Compute `mental_health` or remove it?~~ | **RESOLVED in build: computed from PHQ-9/GAD-7, else a 3+ entry mood-diary average, else absent and the row is omitted** |
| **D-2** | Does the mental-health module require its own explicit consent step, separate from general platform consent? | Yes — add a one-time consent gate before the first instrument |
| **D-3** | Retention period for instrument responses | Keep indefinitely as part of the patient record, patient-deletable on request |
| ~~**D-4**~~ | ~~Are Psychiatrist/Psychologist doctors bookable?~~ | **RESOLVED 2026-11-08: yes, online and offline. `coach_type: 'hybrid'`; live booking CTA across both modes (§10a)** |
| ~~**D-5**~~ | ~~Which instruments ship first?~~ | **RESOLVED in build: PHQ-9 + GAD-7 only. ISI/PSS-10/WHO-5/AUDIT-C withheld in `PENDING_LICENCE_REVIEW` until their terms are confirmed in writing (§10)** |
| **D-6** | Should the dormant framework be seeded with the mental-health programs only, or should other categories (diabetes, cardiac) be seeded at the same time? | Mental health only — keeps this change reviewable |

---

## 17. Sequence summary

```
Phase 0  Preflight gates PF-1..PF-4                    ✅ DONE      2026-11-08
F-1      Consultation-type filters (all 3 types)       ✅ DEPLOYED  2026-11-08, verified live
Phase 1  Migration + instruments + API + audit + seed  ✅ DEPLOYED  2026-11-08, verified on prod
F-2      Opt-in substring specialization match         ✅ BUILT     2026-11-08, verified on prod
Phase 2  Mind & Mood page + G-9 + G-10 + risk-direction ✅ BUILT     2026-11-08, needs reload + build
Phase 3  Shared crisis detector + lane-boundary tests        1–2 d   ← next (crisis CARD already shipped)
Phase 4  AI coach (Tier B)                   DEFERRED — needs governance sign-off
```

**Backend is live; nothing is patient-visible yet** — the three mental-health programmes appear in
the existing "My Programs" catalogue, but there is no Mind & Mood surface, no instrument UI and no
crisis pathway until Phase 2 and Phase 3. The one remaining gap in Phase 1 verification is an
authenticated round-trip (see §10), which Phase 2's click-through will supply.

**Not yet committed to git.** ⚠️ `server/scripts/migrate-all.mjs` carries a concurrent session's
edits alongside this work: commit with an explicit pathspec and check `git diff --cached` first.

**Remaining to a user-visible, non-SaMD launch: 4–6 working days.** Phase 3 is gated on F-2, a
pre-existing data-quality defect rather than new work.
