# Health-Report OCR → Structured Data: Implementation Plan

**Date:** 2026-11-04
**Companion to:** [REPORT_OCR_INGESTION_FEASIBILITY_AND_GAPS.md](REPORT_OCR_INGESTION_FEASIBILITY_AND_GAPS.md)
**Goal:** A **headless** service that auto-extracts *all* values from health reports arriving by
email, stores them in one canonical, queryable, coded form, gates them with a clinician review,
and hands structured results back to the CRM — reusing the ~70% already built.

## Decisions (confirmed 2026-11-04)

| # | Question | **Decision** | Effect on plan |
|---|---|---|---|
| A | How do reports arrive? | **Poll the CRM's own mailbox** via IMAP (shared with other CRM mail) | WP1: filter report emails out of general CRM mail; no new mailbox |
| B | Daily volume | **Below 100/day** | WP1: **no queue** — process inline in the cron tick; simpler + cheaper |
| C | Sources | **Many labs + hospitals** (high layout variety) | WP2: full OCR depth (PaddleOCR + table parsing) retained |
| D | Interop target | **Plain JSON webhook to CRM** | WP5: JSON only on critical path; FHIR/ABDM deferred (optional) |

> Because volume is low and the mailbox is shared, WP1 loses its queue and gains a
> report-vs-other-mail filter; WP5 drops FHIR from the critical path. Net effort falls ~5 days.

## Current state (confirmed in code + prod)

- **Two divergent extraction paths, two tables** — the central problem:
  - Email: `emailAutoProcessService.extractLabResults()` = **regex**, writes **`lab_results`**
    (80 rows, visibly messy). Auto-runs on inbound email.
  - App upload: `report-analysis.service` = **LLM**, writes **`ai_report_lab_values`**
    (17 rows, cleaner). On-demand only.
- Consumers read `ai_report_lab_values`: `ai-health-risk-cron.service.js:219`, `ai-his-score.service.js:183`.
- FHIR/ABDM stack exists but is not fed by either path.

## Target architecture

```
CRM mailbox ──IMAP poll + report filter──▶ ┌─ extract (OCR fallback → LLM → canonicalise+LOINC+confidence)
 (WP1, inline, <100/day)                   │     (WP2 + WP3)
app upload ───────────────────────────────▶└─▶ canonical table (adopt `lab_results`) (WP0)
                                                 │
                                   ┌─────────────┼───────────────────┐
                               verify gate (WP4)  trends/HRA (WP6)   CRM JSON webhook (WP5)
                                                                     [FHIR/ABDM deferred]
```

---

## Work packages

### WP0 — Canonical data model (additive prep)  _(done — dry-run clean; awaiting apply)_
**Status:** migration written + dry-run verified against prod (rolled back).
**Goal:** prepare `lab_results` as the single canonical store — **purely additive, zero behaviour change.**

- **Migration** `server/migrations/report-observations-canonical.migration.js` (idempotent; `--dry-run`/`--down`):
  - Adopt **`lab_results`** as canonical (richest schema). Added columns:
    `patient_id`, `canonical_name`, `loinc_code`, `confidence`, `page`, `source_text`,
    `ocr_method`, `extraction_method`, `verification_status` (`pending|verified|rejected`),
    `verified_by`, `verified_at`. (+ indexes on `(patient_id,createdAt)`, `loinc_code`, `verification_status`.)
  - Backfill `patient_id` from `patients` via `userId` (idempotent).
  - New table `lab_parameter_catalog` (alias → `canonical_name`, `loinc_code`, `unit`, ref range),
    seeded with 24 common parameters (CBC, lipids, LFT, KFT, TSH, glucose, HbA1c — covers the
    Equitas FY25-26 panel).
- **Deferred to WP3** (because `report-analysis.service.js` still INSERTs the `ai_report_lab_values`
  base table — converting it to a view now would break that write): migrate the 17 legacy rows,
  create the `ai_report_lab_values` **compatibility view** over `lab_results`, drop the old table.
  This lands in the same change that repoints the writer.
- **Dry-run result (prod, 2026-11-04):** 11/11 columns add, 24 catalog rows seed, rollback clean.
- **Effort:** ~2 days (migration done; WP3 carries the view/migrate/drop).

> **Data-model finding (feeds WP3).** The two paths key differently *and* cover different people:
> `lab_results.userId` points at `users` rows that have **no `patients` row** (corporate-checkup
> employees); `ai_report_lab_values.patient_id` points at real `patients`. So corporate-employee
> lab data currently **cannot reach** the patient-keyed HRA/HIS scorers. WP3 must reconcile this —
> either auto-provision a `patients` row on first corporate lab result, or make the canonical
> model + consumers key on `userId` with `patient_id` optional. Decision needed in WP3.

### WP1 — Ingest from the CRM mailbox (inline, no queue)  _(closes G6)_
**Goal:** reports auto-processed the moment they land, without a UI. Low volume → no queue.

- **Config:** reuse the CRM mailbox IMAP creds already configured for `/api/crm/emails`
  (`inboundEmailService`); add `REPORTS_INGEST_ENABLED` + `REPORTS_INGEST_FOLDER` (default INBOX).
- **Cron** in `server/utils/cronRegistry.js` → `reportIngestCron` (every ~10 min):
  `inboundEmailService.connectAndFetchEmails` over the CRM mailbox, then for each message
  **filter to report emails** — attachment is PDF/JPG/PNG **and** passes a lightweight
  report-likelihood check (filename/subject heuristics + the existing content gate) so general
  CRM mail is skipped. Dedupe by `messageId + sha256(attachment)`.
- **Process inline** in the tick (volume < 100/day makes a queue unnecessary): call the shared
  extractor (WP3) directly. If daily volume ever rises, promote to a Redis-Streams worker
  modelled on `gupshup-inbound-queue.service.js` — noted, not built now.
- Reuse the existing **identity-match + cross-validation** gates in `emailAutoProcessService`
  (do not rebuild — just call them).
- **Tests:** report-vs-non-report filter unit tests; a mixed 5-email fixture (2 reports, 3 other)
  processes only the 2; dedupe test.
- **Effort:** ~2 days.

### WP2 — OCR fallback for scanned PDFs  _(closes G1)_
**Goal:** scanned/photographed lab PDFs (the common case) actually extract.

- In the shared extractor: if `pdf-parse` text `< 200` chars, rasterise pages
  (`pdftoppm`/`pdf-to-img`) → OCR.
- **OCR engine:** add a `/ocr` endpoint to a Python microservice (reuse the `scribe_service`/
  `offline_scribe` pattern) running **PaddleOCR** (best for multi-lab layout + tables); fall back
  to Tesseract. Node calls it over HTTP. Keep **Claude Vision** for image attachments.
- Persist `ocr_method`, per-page text, and `page` per extracted value.
- **Tests:** a scanned-PDF fixture yields > 0 values; a text-PDF skips OCR.
- **Effort:** ~4 days (incl. the Python service + deploy).

### WP3 — Unify on LLM extraction + canonicalise + code + confidence  _(closes G2/G3, kills the regex)_
**Goal:** one good extractor for both paths; coded, confident, provenance-bearing values.

- New `server/services/report-extraction.service.js` exposing
  `extractReportObservations(buffer, mime) → { observations[], reportDate, labName }`,
  wrapping the LLM structuring already in `report-analysis.service` + WP2 OCR.
  Each observation: `{rawName, canonicalName, loincCode, value, numericValue, unit,
  referenceRange, status, confidence, page, sourceText}`.
- Have the LLM emit a **per-value confidence**; map `rawName → canonical_name/loinc` via
  `lab_parameter_catalog` + `hypergrid-terminology.service.js`; recompute `status` against the
  catalog reference range when available (not just the LLM's word).
- **Delete** `emailAutoProcessService.extractLabResults` (regex) and route both email + app paths
  through the new service, writing the canonical table.
- **Tests:** golden-file test on real anonymised lab PDFs (incl. the Medall sample) asserting
  clean `canonicalName`/`loinc` and no glued-unit names.
- **Effort:** ~4 days.

### WP4 — Clinician verify gate  _(closes G4; SaMD posture)_
**Goal:** no unverified AI value is treated as trusted.

- Auto-verify when `confidence ≥ threshold` **and** canonical match; else `verification_status = pending`.
- Endpoints (`server/routes/report-extraction.route.js`):
  `GET /api/report-extraction/review-queue`, `POST /api/report-extraction/:id/verify|reject`.
  Headless-first (CRM can drive it); optional thin internal admin page.
- Log every gate decision to `ai_quality_gate_log` via `ai-quality-gates.service.js`; add a
  **model card** in `ai-model-governance.service.js` and sync it.
- **Governance:** classify as *documentation assistance with mandatory review* → keeps it **out
  of SaMD**; if abnormal-flagging later drives clinical action, re-classify (IIb/III) per CLAUDE.md.
- **Tests:** low-confidence → queue; verify flips status + stamps `verified_by/at`.
- **Effort:** ~3 days.

### WP5 — Outbound CRM webhook (JSON)  _(closes G7 — the headless deliverable)_
**Goal:** structured results land back in the CRM as plain JSON (decision D).

- **Webhook:** on `verification_status` reaching `verified` (or immediately for auto-verified),
  `POST {CRM_WEBHOOK_URL}` the contract:
  `{patient_id, document_id, document_type, report_date, observations[], processing_status}`,
  HMAC-signed (`CRM_WEBHOOK_SECRET`), retried with backoff; delivery logged.
- **Pull endpoints:** `GET /documents/:id/extraction`, `GET /patients/:id/observations`.
- **Tests:** webhook fires once per document with correct payload + signature; retry on 5xx.
- **Effort:** ~3 days.
- **Deferred (not on critical path, decision D):** FHIR `Observation`/`DiagnosticReport` emit via
  `cda-r2.service.js` + ABDM push via `abdm-client.service.js` — add later if interop is needed
  (~3 days). G5 (FHIR emit) stays open until then.

### WP6 — Analytics/trend hardening  _(closes G8)_
- Fix `report_date` capture (parse from report; fallback to email date).
- Key trends on `canonical_name`/`loinc_code` so one test trends across labs; reuse
  `/api/health-data/trends/:dataType` and `summarizeLabTrends`.
- **Effort:** ~2 days.

---

## Sequencing & effort

| Phase | WPs | Outcome | Effort |
|---|---|---|---|
| 1 | WP0 → WP3 | Clean, unified, coded extraction into one table (both paths) | ~10 days |
| 2 | WP1 → WP2 | Auto-ingest from CRM mailbox (inline), scanned PDFs handled | ~6 days |
| 3 | WP4 → WP5(JSON) | Verify gate + JSON results back to CRM = **headless deliverable done** | ~6 days |
| 4 | WP6 (+ deferred FHIR/ABDM) | Solid trends now; interoperability later if needed | ~2 days (+3) |

**Critical path to the headless ask (reports in → structured JSON to CRM):** WP0, WP1, WP2, WP3,
WP5(JSON) ≈ **~15 dev-days**. WP4 should land with it for clinical safety. FHIR/ABDM is deferred
per decision D.

## Rollout & verification (per CLAUDE.md conventions)

1. Each migration dry-run via `ssm-env-loader`, applied only on go-ahead; verify entity-UID rule
   if any new entity table is added (`scripts/ci/verify-entity-uid-rule.mjs`).
2. Shadow-run WP3 extractor against the 51 already-analysed reports; diff vs regex output before cutover.
3. Feature-flag `REPORTS_INGEST_ENABLED` + `CRM_WEBHOOK_URL`; enable on a test corporate first.
4. Live smoke: email a sample lab PDF → confirm a canonical row, a review-queue entry (if low
   confidence), and a signed webhook to a test endpoint.
5. `pm2 reload`, sanity check (30/30) + log tail, per standard deploy.

## Non-goals (unchanged)
- No new patient-facing EHR UI (headless).
- Self-registration, appointments, OHC, etc. untouched.

---

# Appendix A — WP1 & WP3 detailed design (2026-11-04)

## A.0 Decision: `userId` vs `patient_id` → **auto-provision a patient (Option A)**

Lab data arrives keyed on `userId` (email path) or `patient_id` (app path); every consumer
(HRA `ai-health-risk-cron`, HIS `ai-his-score`, trends) iterates **`FROM patients`** and reads by
`patient_id`. For report data to be usable, the person must have a `patients` row.

**Chosen:** during ingestion, **find-or-create** the `patients` row for the `userId`, then store
**both** `userId` and the resolved `patient_id` on `lab_results`. All consumers stay `patient_id`-keyed
and unchanged.

Why (not Option B — re-key everything on `userId`):
1. `patients` is the clinical anchor the whole platform keys on; re-keying HRA/HIS/trends/appointments
   is a large blast radius for no benefit.
2. The pattern already exists and is proven safe: `api/mobile/index.js:905` does
   `INSERT INTO patients ("userId", status, ...) ON CONFLICT ("userId") DO NOTHING`; `patients` has a
   `UNIQUE(userId)` and `unique_id` is trigger-generated (entity-UID rule), so a minimal upsert is valid.
3. Someone with a health report *is* a patient — provisioning the row is semantically correct.

**Helper** (new, shared) `ensurePatientId(userId, { tenant_id, corporate_id }) → patient_id`:
```sql
INSERT INTO patients ("userId", status, "createdAt", "updatedAt")
VALUES ($1, 'active', NOW(), NOW())
ON CONFLICT ("userId") DO UPDATE SET "updatedAt" = NOW()   -- no-op upsert to RETURNING
RETURNING id;
```
Inherit `tenant_id`/corporate linkage from the matched user where the column exists. Do **not** supply
`unique_id` (trigger issues it). Idempotent.

## A.1 WP1 — Ingest from the CRM mailbox (inline)

- **Trigger:** `reportIngestCron` in `server/utils/cronRegistry.js`, every ~10 min, guarded by
  `REPORTS_INGEST_ENABLED`. Uses `tick/tickStart/tickError`.
- **Source:** reuse `inboundEmailService.connectAndFetchEmails` with the CRM mailbox creds already
  configured for `/api/crm/emails`; `REPORTS_INGEST_FOLDER` (default INBOX), `daysBack` small.
- **Report filter** (skip general CRM mail): keep a message only if it has an attachment with mime in
  `{application/pdf, image/jpeg, image/png}` **and** a report-likelihood signal — subject/filename
  matches `/report|result|lab|test|cbc|lipid|scan|x-?ray|mri|ct|ecg|ultrasound|diagnos/i` — then the
  existing content gate in `emailAutoProcessService` confirms. Non-matching mail is ignored (no ticket).
- **Dedupe:** by `messageId` + `sha256(attachment)`; persist processed markers so re-polling is safe.
- **Per-message flow (inline, <100/day):**
  1. identity match + cross-validation — **reuse** `emailAutoProcessService` gates (don't rebuild);
  2. `ensurePatientId(userId)` (A.0);
  3. upsert the `reports` row (reuse existing insert);
  4. call `reportExtraction.extractReportObservations()` (A.2) **inline**;
  5. `persistObservations()` → `lab_results`.
- **Isolation:** per-attachment `try/catch` → log + continue; one bad PDF never stalls the batch.
- **Scale note:** if volume ever exceeds ~100/day, lift steps 4–5 into a Redis-Streams worker modelled
  on `gupshup-inbound-queue.service.js`. Not built now.
- **Tests:** filter unit tests (report vs non-report); mixed-fixture run processes only reports; dedupe;
  `ensurePatientId` idempotency.

## A.2 WP3 — Unified extractor + convergence

### A.2.1 New service `server/services/report-extraction.service.js`
`extractReportObservations(buffer, mime, ctx) → { observations[], reportDate, labName, method }`
- Pipeline: `pdf-parse` text → if `< 200` chars, **OCR** (WP2) → **LLM** structuring (reuse the
  `report-analysis.service` prompt) → **canonicalise** each `rawName` via `lab_parameter_catalog`
  (alias match) + `hypergrid-terminology.service` → set `canonical_name` + `loinc_code` → **status**
  recomputed against the catalog ref range when numeric → **confidence** per value (LLM-emitted).
- Observation shape:
  `{ rawName, canonicalName, loincCode, value, numericValue, unit, referenceRange, status, confidence, page, sourceText }`.

### A.2.2 Single writer `persistObservations(reportId, userId, observations, meta)`
Writes **`lab_results`** only, with: `userId`, `patient_id` (via `ensurePatientId`), `testName`
(= rawName, kept for display), `canonical_name`, `loinc_code`, `value`, `numericValue`, `unit`,
`referenceRange`, `flag`/`status`, `isAbnormal`, `confidence`, `page`, `source_text`,
`ocr_method`, `extraction_method='llm'`, `verification_status` (auto-rule below), `reportDate`.

### A.2.3 Convergence (the deferred WP0 items — a *separate* migration, run with this code)
`server/migrations/report-observations-converge.migration.js`:
1. **Repoint writers:** replace the `ai_report_lab_values` INSERT in `report-analysis.service.js:401`
   and **delete** `emailAutoProcessService.extractLabResults` (regex) — both now call
   `persistObservations`.
2. **Migrate** the 17 legacy `ai_report_lab_values` rows into `lab_results` (map `patient_id → userId`
   via `patients`; `extraction_method='llm-legacy'`, `verification_status='verified'`; guard with
   `NOT EXISTS` for re-runs).
3. **Drop** base table `ai_report_lab_values`; **create compat view** of the same name so
   `ai-health-risk-cron` / `ai-his-score` keep working **unchanged**:
   ```sql
   CREATE VIEW ai_report_lab_values AS
   SELECT lr.id, lr.patient_id, lr."reportId" AS report_id,
          COALESCE(lr.canonical_name, lr."testName") AS parameter_name,
          lr.value, lr.unit,
          COALESCE(NULLIF(lr.flag,''), CASE WHEN lr."isAbnormal" THEN 'abnormal' ELSE 'normal' END) AS status,
          lr."referenceRange" AS reference_range,
          lr."reportDate"::date AS report_date,
          lr."createdAt" AS extracted_at
   FROM lab_results lr;
   ```
   The view is **unfiltered** by `verification_status` so HRA sees exactly what it sees today (no
   regression). WP4's verify gate governs the **CRM push + "trusted" trend queries**, not this view.
- **Must deploy atomically:** the writer repoint and the view swap ship together; shadow-run the new
  extractor against the 51 already-analysed reports and diff vs regex before cutover.

### A.2.4 Auto-verify rule (set here, enforced in WP4)
`verification_status='verified'` when `confidence ≥ 0.90` AND canonical match AND `numericValue IS NOT NULL`;
else `'pending'` (→ WP4 review queue).

## A.3 Revised sequence
WP0 (apply) → **WP3 code + converge migration (atomic)** → WP1 ingestion → WP2 OCR (can land with/before
WP3) → WP4 verify gate → WP5 CRM webhook → WP6 trends.
