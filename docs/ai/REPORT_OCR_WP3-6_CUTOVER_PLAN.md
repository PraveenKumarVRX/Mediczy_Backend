# Report-OCR WP3–WP6: Careful Cutover Plan

**Date:** 2026-11-04 · **Parent:** [REPORT_OCR_IMPLEMENTATION_PLAN.md](REPORT_OCR_IMPLEMENTATION_PLAN.md)

This is the **high-risk** part of the pipeline: it repoints the live extraction writers, migrates
and drops `ai_report_lab_values`, gates every clinical consumer on verification, and adds outward
delivery. It must be **staged with shadow validation and a rehearsed rollback at every step** — not
a single deploy. Nothing here drops data or flips a writer until the step before it is proven.

**Already in place (this session):** WP0 (canonical columns + catalog) applied · Step-1 identity
(subject/org/patient uids + FKs) applied · lab-terminology seed (HyperGrid) ready · shared extractor
+ shadow benchmark built · Groq Llama 3.3 pinned · poppler-utils installed (scanned-PDF OCR works).

---

## Stage A — Shadow soak (no production writer change) · LOW risk
**Goal:** prove the shared extractor on real traffic before it writes anything clinical.
1. Run `report-extraction-benchmark.mjs` across a representative corpus (text PDFs, scanned PDFs
   now that poppler is installed, images, long/multi-column, qualitative, zero/repeat analytes).
2. Compare shadow candidates vs the legacy `lab_results`/`ai_report_lab_values` rows: value/unit
   accuracy, observation recall, canonical/LOINC hit-rate, page grounding, latency, cost.
3. **Gate:** set and meet accuracy/recall thresholds (not "> 0 values"). Record the numbers.
**Rollback:** none needed — shadow only.

## Stage B — Dual-write behind a flag · MEDIUM risk
**Goal:** the new writer populates the canonical columns alongside the existing path, without any
consumer reading it yet.
1. `persistObservations()` writes `lab_results` with `subject_uid`/`organization_uid` (via
   `resolveReportSubject`), `canonical_name`/`loinc_code` (via the HyperGrid adapter), confidence,
   page, source_text, `extraction_method='llm'`, `verification_status='pending'`.
2. Wire it behind `REPORT_EXTRACTION_DUAL_WRITE=true`: on report ingest/upload, run BOTH the old
   path AND `persistObservations` (new rows flagged, consumers still read old).
3. Create the **scoped UNIQUE dedupe index** now (both `document_hash` and `canonical_name` exist):
   `(organization_uid, subject_uid, document_hash, document_version, COALESCE(canonical_name,"testName"))`.
4. **Gate:** dual-written rows match the shadow benchmark; no duplicate clinical rows under
   concurrent/repeat ingest; dedupe holds.
**Rollback:** unset the flag; new rows are inert (no consumer reads them); optionally delete
`extraction_method='llm'` rows.

## Stage C — Verify gate (WP4) + verified-only reads · MEDIUM-HIGH risk
**Goal:** reviewed values become the trusted set; everything reads verified-only.
1. Review queue + endpoints: `GET /review-queue`, `POST /:id/verify|reject` (role-gated). Auto-verify
   only when `confidence ≥ threshold` AND canonical match AND numeric — otherwise `pending`.
2. Log gate decisions to `ai_quality_gate_log`; add a model card (governance).
3. **Switch consumers to verified-only** one at a time, each with its own rollback: the compat view
   (see Stage D), `getPatientLabValues`, HRA, HIS, trends, and any hospital-dept read. Audit EACH
   (grep confirmed consumers before flipping).
4. **Behaviour note (decide explicitly):** verified-only means HRA/HIS read 0 report-lab rows until
   review happens. Either seed-verify the migrated legacy rows, or accept the gap. Record the call.
**Rollback:** per-consumer flag back to unfiltered; the gate is additive.

## Stage D — Converge + drop `ai_report_lab_values` · HIGH risk (atomic with writer repoint)
**Goal:** one table, one writer, compat view keeps old consumers working.
1. **Repoint writers:** replace the `ai_report_lab_values` INSERT in `report-analysis.service.js:401`
   and **delete** `emailAutoProcessService.extractLabResults` (regex) — both call `persistObservations`.
2. Migrate the 17 legacy `ai_report_lab_values` rows into `lab_results`
   (`extraction_method='llm-legacy'`; `verification_status` per Stage C decision; `NOT EXISTS` guard).
3. `DROP TABLE ai_report_lab_values`; `CREATE VIEW ai_report_lab_values` over `lab_results` (SQL in
   the parent plan §A.2.3). Verified-only filter applied here per Stage C.
4. **Ship writer code + converge migration in ONE deploy.** Shadow-run the new extractor against the
   51 analysed reports and diff before cutover.
**Rollback (rehearsed before executing):** the view can be dropped and the base table restored from
a pre-migration dump of the 17 rows; the writer repoint reverts with the previous build. Keep the
dump and the previous artifact ready. **Do not execute Stage D without a tested restore.**

## Stage E — Ingestion repair + headless flow (WP1) · MEDIUM risk
1. **Repair** the existing BullMQ `email-sync.worker` (it fails every cycle — IMAP disabled on Zoho;
   `parinitha@` has no password). External: enable IMAP in Zoho + set the password. Then it feeds
   `processEmailFull` → `persistObservations`.
2. Report-vs-other-mail filter; org/subject/document-scoped dedupe; inline processing (<100/day).
**Rollback:** disable the report path flag; mailbox sync reverts to prior behaviour.

## Stage F — CRM delivery (WP5) + trends (WP6) · MEDIUM risk
1. **Durable outbox** table; `POST {CRM_WEBHOOK_URL}` the frozen contract on `verified`, HMAC-signed,
   at-least-once with stable event id + revision + receiver idempotency; correction events on
   re-verify/reject. Pull endpoints `GET /documents/:id/extraction`, `/patients/:id/observations`.
2. Trends keyed on `canonical_name`/`loinc_code`; fix `report_date` capture.
**Rollback:** stop the outbox worker; delivery is append-only and replayable.

## Cross-cutting release evidence (required before Stage D ships)
Concurrent/repeat ingest produces no duplicate clinical rows · restart recovery · no cross-org access
· correct corporate-user identity (subject_uid) · source evidence on accepted observations ·
pending/rejected excluded from trusted outputs · accuracy/recall thresholds met and recorded.

## Sequencing
A (soak) → B (dual-write) → C (verify + verified-only reads) → **D (converge/drop, atomic, rehearsed rollback)**
→ E (ingestion repair) → F (delivery + trends). Each stage is its own deploy with its own rollback;
D is the only destructive one and gates on a tested restore.
