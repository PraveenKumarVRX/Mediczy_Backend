# Report OCR — Step 1: Subject/Org Identity, Canonical Ownership & Observation Contract

**Date:** 2026-11-04
**Parent:** [REPORT_OCR_IMPLEMENTATION_PLAN.md](REPORT_OCR_IMPLEMENTATION_PLAN.md) ·
**Review:** [REPORT_OCR_CTO_REVIEW_2026-11-04.md](REPORT_OCR_CTO_REVIEW_2026-11-04.md)

This is the first item of the revised build order: resolve typed subject + organization identity,
fix canonical ownership, and freeze the observation JSON contract — before any extractor/OCR/delivery
work. It supersedes Appendix §A.0 (the `patient_id` auto-provision) of the plan.

---

## 0. Worker-activation finding (feeds WP1, verified in prod 2026-11-04)

The existing BullMQ `email-sync.worker` **is scheduled but failing every cycle**:
- `mediczy-worker` PM2 process online; `schedulePeriodicSync()` fires every 5 min.
- Every run logs `0 accounts synced, 0 new emails, 1 failed`, `team member undefined`.
- 3 active `email_settings` rows (all `user_id=110`: `care@`, `parinitha@`, `hello@mysmarthealth.in`),
  all `is_active + sync_enabled`, but **`last_sync_at` is NULL** for all; `parinitha@` has **no IMAP
  password**; `user_id=110` does not resolve to a `TeamMember`, so the per-member sync aborts.

**So report ingestion is effectively dead in prod today.** WP1's first task is **repair**, not extend:
resolve the owner→TeamMember (or drop that coupling), fix credentials, and make the sync write
`last_sync_at`/`last_sync_status` so health is observable.

---

## 1. Identity model — typed UID, resolved via the registry

**Principle (CLAUDE.md entity-UID rule):** never reference a subject by a bare integer, and never
infer kind from a uid prefix — `patient` and `user` **both** use prefix `U`, and some `users` rows
carry an `E` uid. Resolve through `entity_registry(uid) → (kind, source_table, source_id)`.

A report observation has two identities:

| Field | Meaning | Source |
|---|---|---|
| `subject_uid` | the person the report is about | `entity_registry` (kind ∈ patient/user/corporate_employee) |
| `subject_kind` | denormalised kind for fast filtering | `entity_registry.kind` |
| `organization_uid` | the org context (corporate/hospital/lab) that owns the data for scoping | matched corporate/tenant uid |

Both are **typed uid references** added with the project helper:
```sql
SELECT attach_uid_reference('lab_results', NULL, 'subject_uid',      NULL);        -- cross-kind: validated against entity_registry
SELECT attach_uid_reference('lab_results', NULL, 'organization_uid', NULL);
```
(The existing integer twins `userId`/`patient_id` remain for the compatibility view during cutover but
are **not** the authoritative key; the uid is. A trigger keeps any twin consistent.)

### Why not auto-provision a `patients` row (reversing §A.0)
The scorers key on `patients.id`, but **inventing a `patients` row just to satisfy a scorer** creates
fake clinical registrations for corporate employees who have never had a clinical encounter (the review's
objection). Instead:
- Store every observation against its true `subject_uid` (patient **or** user **or** corporate_employee).
- A `patients` row is linked **only when one already exists or is created by a real clinical event**
  (appointment, kiosk, etc. — the existing paths). Then `patient_uid` is populated and scoring picks it up.
- Corporate-only subjects are still fully stored, verified and **delivered to the CRM** (the headless
  goal needs no `patients` row). They are simply not risk-scored until they become patients — acceptable,
  and honest.

### Resolution algorithm (ingestion)
1. Reuse `emailAutoProcessService` identity gates to match the report to a person + employee metadata.
2. Map the matched row to its `unique_id`; look it up in `entity_registry` to get `(kind, source_table,
   source_id)` → that is `subject_uid`/`subject_kind`.
3. Derive `organization_uid` from the matched corporate/tenant (the employee's corporate uid, else the
   report's tenant).
4. If a `patients` row exists for the subject, capture `patient_uid`; never create one here.
5. **Every** downstream step — dedupe, reads, review, delivery — is filtered by `organization_uid`
   (no cross-org access).

## 2. Canonical ownership (single writer, one table)

`lab_results` is the sole canonical store (confirmed richest schema). WP0 already adds the value/
provenance/verification columns; Step-1 adds the identity columns above. The `ai_report_lab_values`
base table becomes a **verified-only compatibility view** at WP3 cutover (not before — writers still
INSERT it). **Verified-only** applies to every consumer: the view, HRA, HIS, `getPatientLabValues`,
hospital-dept reads, trends and the webhook.

## 3. Observation JSON contract (frozen here)

One record per analyte result (the array the extractor emits and the CRM webhook delivers):

```jsonc
{
  "document_id": "<report uid>",
  "subject_uid": "U5RNB4",           // resolved via entity_registry; never a bare int
  "subject_kind": "patient",         // patient | user | corporate_employee
  "organization_uid": "C9TV9Y",      // scoping; corporate/hospital/lab
  "report_date": "2026-03-30",       // date on the report (not the email date); null if absent
  "specimen": "serum",               // nullable
  "observations": [
    {
      "raw_name": "THYROID STIMULATING HORMONE",   // verbatim from the report (display + audit)
      "canonical_name": "TSH",                       // via HyperGrid-validated mapping, else null
      "loinc_code": "3016-3",                        // only when validated; else null (never guessed)
      "raw_value": "0.35",                           // verbatim text
      "typed_value": 0.35,                           // number when numeric; preserves 0; null if non-numeric
      "qualifier": null,                              // "<", ">", "positive", "trace", "detected"…
      "unit_original": "uIU/mL",                     // as printed
      "unit_normalized": null,                        // only if a validated conversion applied
      "reference_range_source": "0.35-5.50",         // the LAB's range, verbatim — never substituted
      "flag_source": null,                            // the lab's flag (H/L/…), verbatim
      "interpretation_normalized": null,              // our computed flag, SEPARATE, with rule ref
      "interpretation_rule": null,                    // e.g. "catalog:v1" when interpretation set
      "confidence": 0.98,                             // model-emitted; NOT proof of correctness
      "page": 2,                                      // page evidence
      "source_text": "TSH 0.35 uIU/mL (0.35-5.50)",  // grounding snippet
      "extraction_version": "rx-extract@1",
      "verification_status": "pending"                // pending | verified | rejected
    }
  ],
  "processing_status": "extracted"   // extracted | persisted | pending_review | verified | delivered | failed
}
```
Rules baked into the contract:
- **Qualitative & unknown values are representable** (`typed_value: null` + `qualifier`/`raw_value`).
- **Numeric zero is preserved** (`typed_value: 0`, never coerced to empty).
- **Source range/flag preserved**; any normalized interpretation is a **separate** field with a rule
  version — never overwrites the lab's.
- **LOINC only when validated** via HyperGrid; otherwise `null` and routed to review — never fuzzy-guessed.
- **`document_id`/`subject_uid`/`organization_uid`** are uids, resolved — not bare integers.

## 4. Processing state machine (replaces "marked complete")

`extracted → persisted → pending_review → verified → delivered` (+ `failed`/`rejected`). Transitions:
- **extracted**: extractor returned a schema-valid, completeness-checked array (truncated/empty ⇒ `failed`,
  not success).
- **persisted**: observations + a delivery-outbox row written **in one transaction** (not fire-and-forget).
- **verified**: explicit review (Step 4). Only verified rows are read by trusted consumers / delivered.
- **delivered**: durable-outbox webhook acknowledged (Step 5), at-least-once with stable event id + revision.

## 5. Dedupe & scoping keys

Scoped key = `(organization_uid, subject_uid, document_hash, document_version, analyte_canonical_or_raw)`.
- A bare message-id/attachment hash misses forwarded copies and can **collapse different subjects** under
  one global file hash — so the subject + org are part of the key.
- Replay-safe: re-ingesting a document updates in place, never duplicates clinical rows (DB-enforced
  unique constraint on the scoped key).

## 6. What Step-1 delivers (before any extractor/OCR work)
1. This frozen contract + state machine.
2. A migration adding `subject_uid`, `subject_kind`, `organization_uid`, `patient_uid`, `document_version`,
   `document_hash` to `lab_results` via `attach_uid_reference`, with the scoped unique constraint.
3. An `identity.resolveReportSubject(match) → {subject_uid, subject_kind, organization_uid, patient_uid?}`
   helper over `entity_registry` + the existing match gates.
4. The WP1 worker-repair task list (§0).

Only after this land the shared extractor + OCR benchmark (Step 3).
