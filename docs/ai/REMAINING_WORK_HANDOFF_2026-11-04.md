# Remaining-Work Handoff — focused sessions

**Date:** 2026-11-04 · **State:** all work this session committed + pushed to origin; prod healthy; client build green.

This scopes the two tracks that should **not** be rushed in a general session: the `tsc` deep tail
(needs per-file bug triage) and the Codex C0–C4 clinical core (needs clinical review + tests, some
externally gated). Everything else from this session is done, deployed, and verified.

---

## Session A — `tsc` tail (file-by-file, with bug triage)

**Start state:** 319 type errors (down from 862; **63% already cleared** over 10 committed batches).
The **vite build is green** — these are type-check-only; nothing is blocking prod. Pure type-only
fixes are safe (vite strips types), but the tail contains **real bugs**, so no blind casting.

**Triage order (do the real bugs FIRST — these are not type gaps):**

1. **TS2367 "comparison has no overlap" (19) — likely logic/enum bugs.** Each compares a value to a
   literal it can never equal. Read the logic; fix the comparison or the type, do **not** cast:
   - `components/team/EmailInbox.tsx:1221-1222` — number vs string
   - `pages/admin/HyperGridIoTView.tsx:279,307` — status `offline|maintenance` vs `degraded`
   - `pages/admin/WhatsAppNumberManagement.tsx:513` — `general-support` vs `custom`
   - `pages/doctor/DoctorAppointments.tsx:400-401` — `walkin|in-person` vs `audio`/`chat`
   - `pages/doctor/DoctorPrescriptions.tsx:675` — `cancelled|expired|draft` vs `active`
   - …and the rest of the 19.
2. **AssetBadge (10) — a component that was never defined** (`pages/security/SecurityModulePages.tsx`).
   Define it or remove its usages; it's a real gap, not a type.
3. **TS2307 "cannot find module" (8)** — missing/renamed imports; verify each path.

**Then the bulk (type-gaps — type the source, don't `any` blindly):**
- **TS2339 (98)** — mostly property access on `unknown` (untyped API responses, `useState()` without a
  type, test-mock data). Type the source variable/response; cast only test mocks.
- **TS2322 (67) / TS2345 (28) / TS2353 (9)** — assignability / argument / excess-prop mismatches.
  Review each — some are real (wrong value passed), some are missing optional fields.
- **TS2749 (8)** — "X refers to a value but is used as a type" — usually `typeof X` missing.

**Focus files (most errors first):** `UserHealthRiskAssessment` (16), `SecurityModulePages` (15),
`VideoChatdoctor` (14), `AdminAppointments` (14), `TeamCorporateManagement` (11), `WhatsAppManagement`
(10), `HospitalsManagement` (10), `Profile` (10).

**Method:** one file at a time → read → categorize each error (bug vs type-gap) → fix properly →
`npx tsc -p client/tsconfig.app.json --noEmit` to verify → commit per few files. **Guardrail:** never
silence a TS2367/TS2345 with a cast without confirming it isn't a real defect.

**Patterns already fixed (don't redo):** Hospital interface; `icon: React.ElementType`→`ComponentType`;
axios header index-signatures; profileProps/doctorProfileProps union; framer-motion `Variants` cast;
tsconfig lib→ES2022 + `@types/web-bluetooth`; Email/Window globals; optional `children`; record-typed
family/personal history.

---

## Sessions B.0–B.4 — Codex chatbot C0–C4 (one package each, clinical review)

Reference: `docs/testing/CHATBOT_GAPS_IMPLEMENTATION_VALIDATION_2026-11-04.md` ("still required"
column) and `docs/ai/CHATBOT_ROLLOUT_RUNBOOK_2026-11-04.md`. **Each needs clinician-reviewed tests;
do not synthesize clinical behavior.** SaMD clinical-eval gate is currently **waived**
(`docs/ai/SAMD_WAIVER_2026-11-04.md`) — reinstate before clinical reliance.

| Pkg | Remaining | Note |
|---|---|---|
| **C0** | one versioned request/response contract across web/WhatsApp/admin/doctor; authenticated Python service boundary; runtime verification | contract-first; adapter inventory |
| **C1** | durable **cross-channel** history/retention migration; delegated clinical-chart authorization | extends `chatbot_sessions`; don't call Redis-TTL an archive |
| **C2** | full channel/provider **safety conformance**; clinician-labelled multilingual/red-flag evaluation | service access controls required |
| **C3** | approved-source freshness/version policy; **claim-to-citation** validation | retrieved excerpts ≠ validated citations |
| **C4** | transactional booking contention/idempotency; cancellation/rescheduling adapters; durable clinician-acceptance/handoff states | Codex did part; finish + test |

**Already advanced this session (not pending):**
- **C5** (clinical context / OCR) — report-OCR pipeline WP0→Stage F built, migrated, deployed; verified-lab-value reads exist.
- **C6** (typecheck / Node↔Python) — chatbot migration applied; `tsc` 63% cleared (Session A finishes it).

**External gates (not code):** Medical-Director evaluation dataset/thresholds (C2/C3 + release gate);
enable IMAP in Zoho + Gupshup templates (unrelated to C0–C4 but still open from this session).

---

## Done this session (for context — all committed + pushed, deployed, verified)
WhatsApp OTP fix · welcome-email flow · **report-OCR pipeline** (feasibility→plan→WP0→Stage F) ·
Codex chatbot merge + migration · **MinIO outage recovery** (disk reclaim + PACS routing) ·
pre-employment migration · **tsc 862→319 (63%)**. Build green; all 12 PM2 services online.
