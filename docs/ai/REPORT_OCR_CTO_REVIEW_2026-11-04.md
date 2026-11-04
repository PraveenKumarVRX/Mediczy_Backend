# CTO review: report OCR direction and duplicate development

Date: 2026-11-04

## Decision

Proceed with consolidation of Mediqzy's existing report pipeline. Revise the implementation plan before building WP1–WP5. A new EHR, second mailbox poller, independent terminology platform, or eight-service pipeline would duplicate capabilities and expand operating cost without establishing extraction accuracy.

The direction is right; the current execution specification is not ready for an unconditional implementation go-ahead. “70% built” measures neither tested coverage nor remaining effort and should be replaced with capability-level evidence.

## Scope and evidence limits

Reviewed both repository documents, `REPORT_OCR_INGESTION_FEASIBILITY_AND_GAPS.md` and `REPORT_OCR_IMPLEMENTATION_PLAN.md`, the available pasted conversation, the WP0 migration, and relevant ingestion/extraction/consumer code. The attachment at `2b33ed44-9032-42b5-827a-ef7860d30727/Pasted text.txt` is absent from this workspace; the second attachment is available. This review cannot claim to have compared two distinct pasted attachments.

This is a source inspection, not a production audit. Production row counts, earlier dry-run outcomes, runtime queue health, and migration application status are historical claims from the documents/conversation, not independently verified here. No database migration, deployment, or patient-data processing was performed.

## Findings that change the plan

| Priority | Evidence | Required correction |
|---|---|---|
| P0 | `server/workers/email-sync.worker.js` already uses BullMQ, calls the existing IMAP service, and schedules `periodic-sync-all` every five minutes. `server/workers/index.js` initializes and schedules it. | WP1 must inspect activation/configuration and extend this worker. Do not add `reportIngestCron` as a competing mailbox owner. Existing queue infrastructure contradicts the plan's premise that a new inline poller is simpler. |
| P0 | `inboundEmailService.js` already invokes `processEmailFull`, which files reports and writes regex values. | Adding another post-fetch extractor without removing/repointing this call chain can produce duplicate work. Keep one ingestion owner and one canonical writer; make replay safe with database-enforced scoped keys. |
| P0 | Email values key on `userId`; app analysis looks up `patients.id` and silently returns if absent (`updateHRAFromReport`). WP0 adds another bare integer identity reference. | Resolve subject identity before canonical cutover. Reuse the existing UID registry and typed UID references. Preserve corporate users without inventing patient registrations solely to satisfy a scorer. Include organization scope in matching, reads, review, dedupe and delivery. |
| P0 | `analyzeReport` marks the report completed before non-awaited value persistence. Its persistence errors are logged only. | Distinguish extraction complete, persistence complete, pending review, and delivered. Persist observations and a durable delivery event transactionally; retry failed work without repeating completed stages. |
| P0 | WP4 promises mandatory clinician review but also auto-verifies on LLM confidence and alias matching. Current HRA/HIS queries have no verification predicate. | Initially require explicit review for trusted values. Gate every consumer, including legacy compatibility reads, trends, scoring and webhook payloads. A confidence number emitted by a model is not demonstrated correctness. |
| P1 | The plan adds `lab_parameter_catalog`; `hypergrid-terminology.service.js` already owns `hg_code_map` and `hg_terminology`. | Define one terminology authority. A lab-specific alias table may be justified as a curated extension, but do not maintain two conflicting canonical mappings or fuzzy-match directly into trusted codes. |
| P1 | WP0 aliases `bun` to Urea / `22664-7`. | Split urea and urea nitrogen. Validate mappings using specimen, property, method and unit, not test-name similarity alone. BUN has a distinct LOINC entry, [3094-0](https://loinc.org/3094-0). Unknown mappings should remain explicit and reviewable. |
| P1 | `report-analysis.service.js` truncates text to 12,000 characters; its `keyValues` object keys by parameter name; `String(info.value || '')` loses numeric zero. Parse/vision fallbacks can produce empty values and still complete. | Use page-aware extraction with an observation array, preserving repeated tests, dates, specimens, qualifiers and zero. Validate output schema and completeness; empty or truncated extraction is a failure/partial state, not success. |
| P1 | PDF fallback decodes binary PDF bytes as UTF-8. WP2 uses one document-wide text-length threshold. | Remove binary-as-text fallback. Detect extraction quality per page, including mixed scanned/text PDFs; retain page/source evidence. Benchmark candidate OCR engines before adding PaddleOCR plus a second fallback and a separate deployment. |
| P1 | WP3 proposes recomputing abnormality against catalog reference ranges. | Preserve the report's supplied range and flag. Record any normalized interpretation separately, with its applicable context and rule version. Never silently substitute a generic range for the source laboratory range. |
| P1 | WP5 asks for a webhook “once per document” with retries and reviews occurring per value. | Define completion policy and correction events. Use a durable outbox and at-least-once delivery with stable event IDs, revision, HMAC and receiver idempotency. Network retries cannot guarantee exactly-once receipt. |

## Conflicts between the two documents

The feasibility document recommends extending `ai_report_lab_values`; the plan adopts `lab_results`. The feasibility document requests a dedicated reports mailbox and leaves questions open; the plan records a shared CRM mailbox and confirmed answers. The feasibility document presents email → LLM → normalized storage as one existing flow, although email actually writes regex output to another table. It also says items 1, 2 and 6 alone deliver the goal, understating identity, persistence and review dependencies.

Treat the implementation plan's confirmed requirements as authoritative, but correct its implementation details using this review. Update the feasibility document to match before separate developers work from conflicting specifications. Do not replace the old table with a view until all writers, reads, startup DDL, ORM assumptions and rollback paths have been checked. `getPatientLabValues` is another consumer beyond the two scorers named in the plan; hospital department agents also read `lab_results`.

The documents' categorical SaMD assertions are not substantiated by this code review. Do not treat a marketing label or mandatory review as proof of regulatory exclusion; record intended use and obtain a jurisdiction-specific assessment separately.

## Reuse and build boundaries

| Capability | Decision |
|---|---|
| Mail synchronization and scheduling | Reuse the existing BullMQ email worker; verify its runtime activation. |
| Report detection, identity gates, filing and storage | Reuse existing modules; test scanned reports through identity gates too, so unreadable text does not prevent OCR from being reached. |
| LLM gateway | Reuse `ai-brain/llm-provider.js`; extract a shared document-to-observations interface from the current analysis service. Keep persistence separate. |
| Terminology | Reuse HyperGrid behind a validated laboratory mapping adapter; define any new alias store as subordinate reference data. |
| OCR | Add the missing capability behind a replaceable adapter, selected by benchmark. Reusing a Python service pattern does not establish that speech-service processes should host OCR workloads. |
| Clinical store | Converge report-extracted observations on one write model. Do not automatically merge unrelated operational lab tables just because their names resemble each other. |
| Review and CRM delivery | Build the missing headless APIs, authorization, audit trail and durable outbox. Reuse existing infrastructure where its semantics fit. |
| FHIR/ABDM | Keep off the JSON MVP critical path; evaluate actual resource-generation/validation capability when required. Existing integration filenames do not establish lab FHIR conformance. |

## External reuse checkpoint

The [Google Health Medical Data Toolkit README](https://github.com/Google-Health/medical-data-toolkit/blob/main/README.md) confirms a Docker REST API for document-to-FHIR conversion, schema-based extraction, terminology mapping and ABDM profiles. It depends on an external LLM and terminology knowledge-base setup; handwriting is unsupported, and its current API is synchronous. It is a credible benchmark candidate, not evidence that Mediqzy should replace its ingestion/storage stack.

Run a time-boxed comparison of the existing extractor plus an OCR adapter against the toolkit on the same de-identified corpus. Compare exact value/unit accuracy, observation recall, identity errors, page grounding, unsupported cases, latency, cost and deployment burden. Adopt only components that outperform the current path and fit the JSON contract. Other repository names from the pasted conversation remain unverified and should not drive development commitments.

## Revised build order and release gates

1. Resolve typed subject/organization identity, canonical ownership and observation JSON contract. Specify raw value, typed value/qualifier, original and normalized unit, report/specimen dates, source range/flag, page evidence, extraction version and verification state. Unknown and qualitative values must be representable. Scope the first release to supported laboratory reports; “all health-report values” is not a measurable first-release promise.
2. Verify and repair existing email worker activation and replay behavior. Establish a persisted processing state and dedupe key scoped to organization, subject and document/version. A message/attachment key alone does not catch forwarded copies; a globally unique file hash can incorrectly collapse records across subjects.
3. Build the shared extractor and benchmark OCR choices in shadow mode. Store candidate outputs separately from clinical observations. Include long, mixed, multi-column, rotated, poor-quality and qualitative reports; test zero, repeated analytes, units and dates.
4. Add canonical persistence, review authorization and verified-only consumer reads together. Audit every legacy consumer; keep existing readers working during cutover. Do not delete the old writer until replay and rollback are demonstrated.
5. Add durable CRM delivery and corrections. Test timeout after remote acceptance, retry after restart, duplicate requests, partial review, rejected values and revoked/corrected observations.
6. Pilot for one organization, measure extraction and review outcomes, then expand layouts. Add normalized trends only after unit compatibility and observation dates are reliable.

Release evidence must include concurrent/repeated ingestion producing no duplicate clinical rows, restart recovery, no cross-organization access, correct corporate-user identity, source evidence for accepted observations, and exclusion of pending/rejected values from trusted outputs. Set accuracy/recall acceptance thresholds before benchmarking; “more than zero values” is insufficient.

The current effort table also double-counts/obscures work: WP0 (2) + WP3 (4) is listed as about 10 days, while the stated critical-path total excludes WP4 despite calling it necessary. Re-estimate once identity, OCR benchmark and delivery semantics are resolved. Do not present 15 days as a validated delivery commitment.

## Next concrete action

Revise WP1 to extend the existing worker, settle UID-based identity and canonical ownership, and benchmark extraction before expanding services. Keep WP0 additive, but review its identity references and seeded mappings before applying it. This avoids the clearest duplicate development while addressing the actual delivery blockers.
