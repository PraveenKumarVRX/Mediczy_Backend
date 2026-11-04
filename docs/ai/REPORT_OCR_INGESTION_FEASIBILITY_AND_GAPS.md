# Health-Report OCR → Structured Data: Feasibility & Gap Assessment

**Date:** 2026-11-04
**Question assessed:** Can Mediqzy auto-populate *all* values from health reports (that
"land on email") into a structured, queryable form for viewing and analytics — ideally as a
**headless** service that hands results back to an external CRM, with no new patient-facing UI?

**Implementation plan:** [REPORT_OCR_IMPLEMENTATION_PLAN.md](REPORT_OCR_IMPLEMENTATION_PLAN.md)
**CTO review (authoritative on implementation details):** [REPORT_OCR_CTO_REVIEW_2026-11-04.md](REPORT_OCR_CTO_REVIEW_2026-11-04.md)

> **Corrections (2026-11-04), after the CTO review — read these before this document's body:**
> - **Canonical store is `lab_results`, not `ai_report_lab_values`.** This document described
>   `ai_report_lab_values` as the normalized store; that is only the *app-upload* path's table.
>   Convergence adopts **`lab_results`** (see the plan). Don't extend `ai_report_lab_values`.
> - **Email path is NOT "email → LLM → normalized store".** Inbound email runs a **regex** parser
>   (`emailAutoProcessService.extractLabResults`, via `inboundEmailService.processEmailFull`, driven
>   by the **existing BullMQ `email-sync.worker`**) writing to `lab_results`. The LLM path is
>   app-upload only. They are two divergent paths — that is the core problem to fix, not an existing
>   unified flow.
> - **More consumers than named here:** besides HRA + HIS, `getPatientLabValues` and hospital-dept
>   agent reads also consume this data; all must be gated verified-only on cutover.
> - **"~70% built" / "items 1,2,6 deliver the goal" understates** identity, persistence and review
>   dependencies. Treat those as first-class, per the plan's Reconciliation section.

**Verdict:** **Feasible, and largely already built.** ~70% of the pipeline the request
describes exists and runs in production today (email report detection → LLM extraction →
normalized per-test value store → risk-scoring consumption), on top of a full FHIR/ABDM stack.
The remaining work is to (a) add a true OCR fallback for scanned PDFs, (b) canonicalise +
code the extracted parameters, (c) add a clinician verify gate, and (d) expose it **headless**
(dedicated ingestion mailbox + outbound CRM webhook). None of these require a rebuild.

---

## 1. Target pipeline (from the request)

```
CRM mailbox (reports as PDF/JPG/PNG)
  → ingest attachment + identify patient + dedupe
  → OCR / layout / tables
  → extract test name · value · unit · reference range · date
  → structured store (JSON / PostgreSQL / FHIR R4)
  → push back to CRM via API / webhook (with source doc, page, confidence)
```

## 2. What Mediqzy already has (component by component)

| # | Pipeline stage | Status | Where it lives |
|---|---|---|---|
| 1 | Inbound email + attachment ingestion | ⚠️ Partial | `server/services/inboundEmailService.js` (IMAP via `imap`+`mailparser`), `/api/email-settings`, `/api/crm/emails` |
| 2 | Patient identification + dedupe | ✅ Strong | `server/services/emailAutoProcessService.js` (multi-gate identity match + cross-validation) |
| 3 | Report filing | ✅ | `emailAutoProcessService.js:1186` `INSERT INTO reports`; `reports` table |
| 4 | Text/vision extraction | ⚠️ Partial | `server/services/report-analysis.service.js` (`pdf-parse` + Claude Vision + LLM cascade) |
| 5 | Clinical value extraction (name/value/unit/range/flag) | ✅ | `report-analysis.service.js` (structured JSON prompt) |
| 6 | **Normalised per-test store** | ✅ | **`ai_report_lab_values`** table (written at `report-analysis.service.js:401`) |
| 7 | Abnormality flagging | ✅ (LLM-derived) | `status` column + `abnormalValues` |
| 8 | Analytics / trends | ⚠️ Partial | `hospital-os.summarizeLabTrends`, `/api/health-data/trends/:dataType`, HRA (`ai-health-risk-cron`), `ai-his-score` |
| 9 | FHIR R4 / ABDM | ✅ exists (not wired to this) | `abdm-client.service.js`, `cda-r2.service.js`, `nhcx-client.service.js`, `hypergrid-terminology.service.js` |
| 10 | Clinician verify/approve of values | ❌ Missing | — (prompt only *says* "flag for doctor review") |
| 11 | Headless push-back to external CRM | ❌ Missing | — (pipeline writes to Mediqzy's own DB/app) |

### The normalised store already exists (`ai_report_lab_values`)
```
patient_id · report_id · parameter_name · value · unit · status · reference_range · report_date · extracted_at
UNIQUE(patient_id, report_id, parameter_name)
```
Written by `report-analysis.service.js` (`updateHRAFromReport`), consumed by
`ai-health-risk-cron.service.js:219` and `ai-his-score.service.js:183`. This is the
"auto-populated, queryable lab values" the request asks for — it is built and functional.

### Extraction schema (already produced per report)
`findings · keyValues{param:{value,unit,referenceRange}} · abnormalValues[] · riskIndicators{cardiovascular,diabetes,kidney,liver,thyroid}`
PDFs → `pdf-parse`; images → Claude Vision; both via the LLM cascade (iSHA → Groq → OpenAI).
Prompt explicitly instructs "extract ALL numerical lab values with units and reference ranges,
flag abnormal, do NOT diagnose — flag for doctor review."

### Live evidence (production, 2026-11-04)
- `reports`: **119 total, 51 analysed** (`aiAnalysis` populated).
- `ai_report_lab_values`: **17 rows** — pipeline works but is **lightly used**; sample rows are
  wearable-derived (Steps/Heart Rate/Sleep) with `report_date = NULL`, i.e. few real lab PDFs
  have flowed through, and date capture is weak.

## 3. The gaps (what's actually missing)

| Gap | Impact | Effort |
|---|---|---|
| **G1. No true OCR fallback.** `pdf-parse` only reads PDFs that already have a text layer; scanned/photographed lab PDFs (very common) yield no text and are **not** routed to Tesseract/PaddleOCR/Textract. Images go to Claude Vision, but a scanned *PDF* falls through to a raw-text attempt. | Scanned reports extract poorly or not at all | Medium |
| **G2. Parameter names are free-text, uncoded.** `parameter_name` is whatever the LLM emits; no canonicalisation and no **LOINC/SNOMED** code (the `hypergrid-terminology` service is not wired to the extractor). "HbA1c" vs "Glycated Hemoglobin" won't trend together. | Breaks longitudinal analytics & interoperability | Medium |
| **G3. No confidence / provenance stored.** The request's core requirement — keep source doc, page, confidence, original text — is not met; `ai_report_lab_values` has no confidence or page column. | Can't triage low-confidence values; no audit trail | Low–Med |
| **G4. No clinician verify/approve gate.** The QC gates verify the *patient identity* (right person), not *value correctness*. Nothing holds an unverified extraction out of the "trusted" set. | Unverified AI values treated as clinical truth (SaMD risk — see below) | Medium |
| **G5. Not emitted as FHIR / not pushed to ABDM.** Extracted values stay in `ai_report_lab_values`; they are never turned into FHIR `Observation`/`DiagnosticReport` despite the ABDM stack existing. Also ≥3 parallel lab tables (`lab_results`, `healthos_lab_results`, `ai_report_lab_values`) with no canonical model. | No interoperability output; data fragmentation | Medium |
| **G6. Ingestion is not a headless always-on mailbox.** IMAP fetch is per-team-member / CRM-mailbox and manual (prod logs show IMAP not continuously enabled). There is **no dedicated reports mailbox poller/webhook**. | Reports aren't auto-processed on arrival at scale | Low–Med |
| **G7. No outbound CRM contract.** There is no REST/webhook that returns the structured extraction (the JSON in the request) to an **external** CRM. The pipeline is embedded in the Mediqzy app, not exposed as a service. | The "headless, hand back to my CRM" goal is unmet | Medium |
| **G8. Data-quality fixes.** `report_date` frequently NULL; no table/layout parsing (multi-column panels); dedupe is per `(patient,report,param)` only. | Weak trends, duplicate/merged panels | Low |

## 4. SaMD note (mandatory per CLAUDE.md)

Auto-extracted lab values that **inform** clinical decisions are **Class IIb** at minimum; if an
abnormality flag drives a clinical action it approaches **Class III**. Before this is relied on
clinically, G4 (clinician verify gate) plus quality-gate logging
(`ai-quality-gates.service.js`, `ai_quality_gate_log`) and a model card
(`ai-model-governance.service.js`) are required. Marketing it as *documentation assistance with
mandatory physician review* keeps it **out** of SaMD — which is the cheaper, faster posture and
aligns with G4.

## 5. Recommended path to a headless CRM-facing service (build on what exists)

Minimal additions, reusing the existing extractor and `ai_report_lab_values`:

1. **Dedicated ingestion mailbox + poller** (closes G6): one always-on IMAP/Graph poller against
   a `reports@` mailbox, feeding the existing `emailAutoProcessService` identity-match + filing.
2. **OCR fallback** (G1): when `pdf-parse` yields < N chars, rasterise → Tesseract/PaddleOCR (or
   Textract) before the LLM step. Store `ocr_method` + page refs.
3. **Canonicalise + code** (G2/G3): map `parameter_name` through `hypergrid-terminology` to LOINC;
   add `confidence`, `page`, `source_text`, `loinc_code` columns to `ai_report_lab_values`.
4. **Verify gate** (G4): route values below a confidence threshold to a review queue; only
   verified rows enter the "trusted"/trend set and the CRM push.
5. **FHIR emit** (G5): render verified rows as FHIR `Observation` + `DiagnosticReport` (reuse
   `cda-r2`/`abdm-client`); optional ABDM push.
6. **Outbound CRM webhook** (G7): `POST {crm_webhook}` with the exact `{patient_id, document_id,
   observations[], processing_status}` contract from the request, plus a
   `GET /documents/{id}/extraction` pull endpoint.

Items 1, 2, 6 alone deliver the requested headless behaviour; 3–5 add interoperability and
clinical trust.

## 6. Open questions (needed to size the real build)

From the request's own checklist:
- **Email arrival:** dedicated `reports@` mailbox vs forwarding vs CRM-already-downloads?
- **Volume:** <100 / 100–1k / 1k–10k / >10k per day (decides queue: inline vs Redis Streams/BullMQ).
- **Sources:** one lab / many labs / hospitals+labs (decides how much layout variety OCR must handle).
- **Interop target:** ABDM/ABHA FHIR, generic FHIR, or plain JSON to the CRM?

---

### File reference index
- Ingestion: `server/services/inboundEmailService.js`, `server/services/emailAutoProcessService.js`
- Extraction: `server/services/report-analysis.service.js`
- Store: `ai_report_lab_values` (DDL at `report-analysis.service.js:378`)
- Consumers: `server/services/ai-health-risk-cron.service.js:219`, `server/services/ai-his-score.service.js:183`
- Trends: `server/routes/healthData.route.js:291`, `hospital-os.summarizeLabTrends`
- FHIR/ABDM: `server/services/abdm-client.service.js`, `cda-r2.service.js`, `nhcx-client.service.js`, `hypergrid-terminology.service.js`
