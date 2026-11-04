# Mediqzy chatbot: feasibility, existing capabilities and missing features

Date: 2026-11-04 · Assessment: source review and targeted local tests

Implementation plan: [Chatbot gaps implementation plan](CHATBOT_GAPS_IMPLEMENTATION_PLAN_2026-11-04.md).

## CTO verdict

Mediqzy has enough existing infrastructure to extend Dr. iSHA into an evidence-grounded health assistant and clinician copilot. A replacement chatbot application would duplicate the UI, conversational backend, retrieval, identity, booking, triage and governance modules already present. The priority is to unify contracts and close safety/privacy gaps across channels before adding another model or agent framework.

The inspected code does not establish physician-level medical accuracy or readiness for autonomous diagnosis/prescribing. Model names, architecture diagrams, source retrieval and passing unit tests are not clinical validation. Product scope should distinguish patient education/navigation from clinician-reviewed decision support.

## Attachment limitation and assessment scope

The requested attachment, `/home/ubuntu/.codex/attachments/672e64bd-ec9b-4f2a-86d7-6868417c2d97/Pasted text.txt`, was unavailable; the attachments directory itself was absent during this review. Only its supplied title fragment is visible: a chatbot acting as a medical doctor with high medical capability. Its repository shortlist, detailed requirements and claims cannot be evaluated or quoted.

Consequently, this is a completed baseline assessment of the existing app with an explicitly pending attachment comparison. The capability matrix below is a proposed product baseline, not a reconstruction of the missing attachment. Reconcile it against the full text when available. No external repository ranking or adoption decision is made here.

Reviewed the web client, Express chat routes, configured Python entrypoint, alternate Python server, retrieval, conversation/session services, WhatsApp flow, booking adapters and existing AI architecture/governance documents. No production access, live patient queries, model evaluation, migration or deployment was performed. “Present” means source implementation exists; deployment and clinical performance remain unverified.

## Existing architecture and duplicate-development boundaries

The configured root PM2 path is `ecosystem.config.js` → `scripts/sib-fastapi-start.sh` → `uvicorn app:app` in `ai-engine/doctor_bot`. That server is distinct from `sib_app.py`, which older startup scripts still launch. They expose similar APIs but do not enforce identical contracts or consent behavior. Do not infer production behavior from the alternate entrypoint.

| Surface | Existing path | Assessment |
|---|---|---|
| Patient web chat | `DrISHAChat.tsx` → `client/src/services/drIsha.ts` → `/api/medical-ai/consult` | Existing UI, conversation, voice affordances and escalation; contract gaps below. |
| WhatsApp health guidance | `server/routes/whatsapp-production.route.js` → Python `/chat` | Existing account linking, explicit patient-specific context fields and consent handling; reuse this boundary pattern. |
| Admin bot selection | `server/routes/sib-chatbots.route.js` → `unified-conversation.service.js` | Existing multi-bot surface; locally declared admin/team intent is not consistently enforced by route auth. |
| Clinician voice/copilot | `server/routes/voice-assistant.route.js`, shared doctor-mobile copilot service | Existing separate surface. The AI layer map already records the need for a common gateway, session store and trace. |
| Retrieval | `sib/retrieval/unified_rag.py`, `app.py`, `ai-brain/rag-pipeline.js` | Knowledge chunks and patient-specific retrieval exist; do not create another vector database by default. |
| Generation | `server/services/ai-brain/llm-provider.js`, Python medical pipeline | Provider routing/fallback infrastructure exists. Consolidate configuration and policy rather than adding another independent gateway. |
| Tasks | WhatsApp agentic booking, SIB task router, application appointment services | Reuse deterministic task services; chatbot text is not proof of a completed transaction. |
| Governance | SIB AI guard, quality gates, model cards, evaluation engine | Existing foundation; execution coverage and clinical evidence must be verified per path. |

## Capability and feasibility matrix

| Capability | Current evidence/status | Missing work or proof | Feasibility |
|---|---|---|---|
| Multi-turn web conversation | Present: Redis memory, client history and browser restoration | Enforce ownership on every read/write, isolate accounts, reconcile deletion and concurrent writes | High; integration work |
| General medical education | Present: Python medical pipeline and provider fallbacks | Define supported scope, validate factuality and abstention using clinician-reviewed cases | Feasible; performance unproven |
| Evidence-grounded answers | Partial: unified knowledge retrieval; Python emits retrieval counts/source categories | User-visible claim citations, document identifiers/sections, version/date, source freshness and unsupported-answer behavior | High; extend existing retrieval |
| Personalized EHR answers | Partial: WhatsApp sends scoped context; Python checks authoritative consent when patient-specific | Repair web request contract; authorize patient/chart relationship and tenant; test revoked/missing consent | High; priority blocker |
| Clinical symptom intake | Partial: free-text consultation and symptom-analysis endpoint | Structured missing-information collection, temporal context, risk-specific intake and evaluated clarification policy | Feasible; clinical design needed |
| Emergency routing | Present: Python emergency detection, governed ESI endpoint and video escalation | Preserve emergency flags through adapters; apply consistent behavior during provider failure; confirm real handoff availability | High; end-to-end validation needed |
| Clinician copilot | Present across chat/voice services | One role-scoped contract, authorized chart context, evidence and review boundary; administrative roles must not inherit prescribing authority | High; consolidate |
| Drug interaction/medication questions | Relevant pharmacy and safety services exist; conversational dose/prescription filters exist | Demonstrate tool wiring, medication/allergy completeness, evidence version and clinician review. Do not equate filters with an interaction checker | Feasible as reviewed assistance |
| Report explanation and trends | Existing report analysis, lab stores and wearable context | Connect only verified observations with dates/units/provenance; resolve OCR findings in the companion CTO review | High, dependent on OCR convergence |
| Appointment booking | Present: slot lookup, confirmation states and appointment writes | Eliminate fabricated fallback slots; test slot contention, idempotency, authorized identity and transaction outcomes | High; reuse existing services |
| Cancellation/rescheduling | Existing architecture explicitly records final adapters as incomplete | Verify actual transactional adapters before advertising completion; cancellation of an in-progress booking is not cancellation of an existing appointment | High; bounded workflow work |
| Reminders/adherence/follow-up | Existing notification, adherence and follow-up modules; prior smoke script references them | Validate chat tool invocation, opt-outs, timezone, delivery retries and accurate completion messages | High; integration |
| Multilingual text/voice | Present: language parameters, translation service, browser speech APIs | Evaluate selected supported languages, code-switching, transcription errors and safety parity; browser voice support is not universal | Feasible; validate language by language |
| Human support and clinician handoff | Existing support widgets, intent escalation and video route | Confirm transcript handoff, clinician acceptance, patient notification, failed/no-provider state and status tracking | High; workflow validation |
| Clinical accuracy monitoring | Existing evaluation/governance infrastructure and selected tests | Clinician-labelled golden set, specialty/language results, unsafe-answer rate, citation support, regressions by provider/version | Essential; ongoing work |

## Confirmed source findings and prioritized gaps

### P0 — identity, privacy and channel safety

**G1. Web/Python request contract mismatch.** `medical-ai.route.js:303` sends `patient_id` as the session ID and context under `patient_data`. The configured `app.py` `/chat` reads authenticated identity from top-level `user_id`, context from `patient_context` or `user_context`, and requires `is_patient_specific` before authorizing personalized context. The inspected web payload supplies none of those three expected fields. The result can be generic answers despite fetched chart data, skipped personalized retrieval, and inconsistent consent semantics. WhatsApp already sends the expected fields. Define one versioned envelope with separate conversation ID, actor UID, subject UID, organization scope, intent and authorized context. Derive identity/roles server-side.

**G2. Web session ownership is not enforced on consult.** `/consult` accepts a supplied session ID and loads/appends Redis memory using that ID without calling `ownsSession`. Delete does call it, but its accepted HMAC/legacy/test prefixes do not match the frontend-generated `dr_isha_*` format and prefix matching is not a stored ownership relationship. Treat this as a source-level cross-user isolation risk; exploitability was not tested. Bind opaque sessions to actor and organization in persistent metadata, check ownership before every operation, and reject unowned IDs.

**G3. Account-independent browser history.** `DrISHAChat.tsx` uses the single key `dr_isha_session` for message restoration. The inspected component does not scope it to the authenticated account. Verify all logout/account-switch handlers; either avoid persistent PHI in browser storage or implement an explicit retention policy, account isolation and clearing. “Clear chat” must cover browser, Node, Python and persistent conversation stores according to the intended deletion policy.

**G4. Credentials are included in client error logging.** `client/src/services/drIsha.ts` logs `headers: this.getAuthHeaders()` in its consultation catch block, including the Authorization bearer value. Remove credentials from error diagnostics; redact PHI and tokens across all channels. This is a confirmed code path, not evidence that a particular external logging system received tokens.

**G5. Admin/team bot endpoints lack local authentication.** In `sib-chatbots.route.js`, `/:botId/chat`, symptom analysis, emergency triage and appointment booking omit the `authAdmin` middleware used on stats/config endpoints. They accept body identity/context. The app mounts an AI guard, but rate/kill-switch middleware is not a substitute for user authentication and role authorization. Inspect parent middleware and deployment reachability; apply explicit role/scope and subject authorization before accepting personal context or mutations.

**G6. Emergency and safety metadata disappear at the web adapter.** Python returns `emergency` or `is_emergency` and retrieval metadata; `buildSibConsultation` only forwards text, confidence and selected intent/navigation fields. Structured emergency escalation therefore cannot rely on the full Python contract. Preserve a validated urgency/safety envelope, including human-review requirement, evidence and handoff state, and make the UI consume those fields.

**G7. Fallback safety is inconsistent.** On SIB non-OK/empty responses, web consult calls the generic LLM gateway using a short system prompt. This branch does not explicitly run the Python emergency/prescription filters or attach retrieval evidence. A request timeout returns a 504; a network error takes a different path again. Apply a common pre-generation and post-generation policy independently of provider choice. Treat authorization/consent failures differently from infrastructure failures; do not turn a policy denial into an alternate provider attempt.

### P1 — evidence quality, truthful workflows and governance

**G8. No complete citation contract in web chat.** Python currently returns source categories/counts, and the web response adapter drops even that metadata. `DrIshaResponse` and the chat message type lack structured citations. Add a source schema including document ID/title, exact supporting section or span, version/review date and access-safe link. Retrieval similarity and presence of a source are not evidence that a claim follows from it. Check claim support and abstain/escalate when evidence is insufficient.

**G9. Confidence display overstates certainty.** The UI uses `response.data.confidence || 0.9`, replacing both missing confidence and an explicit zero with 90%, then renders a percentage. Remove the invented default. Show unknown where appropriate and distinguish routing/retrieval confidence from medically validated answer reliability.

**G10. Booking can return invented slots after errors.** `whatsapp-agentic-booking.service.js` returns three default consultation times/prices in `findAvailableSlots`' catch branch for non-mental-health bookings. Mental-health bookings already return no slots. Use authoritative availability or an explicit unavailable/manual-assistance state for every booking type. Re-check slot eligibility inside the transaction and test repeated confirmations.

**G11. Governance is not equivalent to content safety.** The AI guard supplies operational checks; clinician conversations also trigger best-effort logging. Neither proves every generated answer was clinically evaluated or authorized for a given role. `/consult` includes admin in `isClinicalAuthority`; review this mapping against actual licensed clinical privileges. Reuse model/change-control services, but record model, prompt, retrieval and safety-rule versions with each evaluated release.

**G12. Multiple overlapping servers and stores invite drift.** `app.py`, `sib_app.py`, Node Redis memory, the SQL chatbot-session repository and browser memory implement overlapping responsibilities. Older launch scripts point at the alternate server. Select a supported runtime and shared contract, inventory callers before deprecating alternatives, and test each supported startup path. Do not delete components solely because names overlap.

**G13. Accuracy and clinical scope remain unproven.** Existing documentation states broad completion percentages and readiness claims. This review did not establish a clinician-reviewed dataset, external validation, calibrated confidence or model-by-model safety results for the deployed chat paths. Define patient-assistant and clinician-copilot intended uses separately. Regulatory classification or exemption requires an appropriate assessment; this document makes no classification determination.

### P2 — feature completion after the shared boundary is reliable

Add structured intake, clinician feedback, longitudinal summaries, source-freshness monitoring, supported-language evaluation, streaming/cancellation where useful, and durable handoff tracking. Some underlying modules already exist; confirm their adapters and tests before labelling a feature missing or starting a replacement implementation.

## Report/OCR dependency

Use [REPORT_OCR_CTO_REVIEW_2026-11-04.md](REPORT_OCR_CTO_REVIEW_2026-11-04.md) for the canonical observation work. Chat should retrieve verified results with subject/organization authorization, source date, unit and report/page references. It must distinguish missing data, stale data and pending extraction from normal findings. Do not introduce a chatbot-specific lab-results store, parser or competing terminology catalog.

## Proposed implementation sequence

| Work package | Scope | Acceptance evidence |
|---|---|---|
| C0 — runtime and contract | Inventory channel callers; declare authoritative Python entrypoint; separate session/actor/subject; reconcile attachment requirements when supplied | Contract tests run against real request/response serializers for web, WhatsApp and clinician paths |
| C1 — access and privacy | Fix session ownership, admin route auth, account switching, context authorization, consent and diagnostic redaction | Two-user/two-organization isolation tests; consent denied/revoked/outage tests; no tokens/PHI in logs |
| C2 — safety parity | Shared emergency/prescription policy for normal, fallback and timeout states; propagate safety metadata | Red-flag, ambiguous, negated, multilingual and provider-outage cases exercise the real routes |
| C3 — evidence | Citation schema/UI, approved source versions, abstention, removal of invented confidence | Clinician-reviewed claim support and unsupported-answer evaluations; revoked sources do not appear |
| C4 — truthful tasks | Harden existing booking; implement/verify cancellation/rescheduling; durable handoff outcomes | No fabricated slots; concurrent booking and repeated request tests; real mutation IDs and failure states |
| C5 — personalization | Reuse verified OCR observations, wearables and medication/adherence services | Only authorized/consented/verified data; correct units/dates; no normality claims from missing data |
| C6 — controlled pilot | Select supported languages and clinical scope; pin versions and monitor failures | Medical Director approves evaluation thresholds before pilot; regression results recorded per model/channel/language |

Do not commit a delivery estimate until the attachment scope is reconciled and C0 confirms supported runtimes and consumers. Feature-count percentages would obscure the importance of C1–C3.

## Verification performed

Ran locally in `server/`:

```sh
npm test -- --runTestsByPath __tests__/medical-ai-security.test.js __tests__/dr-isha-frontend.test.js
```

Result: **2 suites passed; 48 tests passed**. These tests include logger behavior and copied/mirrored helper logic for redirects, validation, token selection and history. They are useful regression checks, but do not execute the complete browser → Express → configured Python → model/retrieval path. No claim of clinical accuracy, live consent enforcement, production availability or successful handoff follows from this result. Additional existing consent, ESI, booking and observation tests were located but not executed in this assessment.

## Recommended decision

Continue with Dr. iSHA. Prioritize C0–C3, then complete deterministic tasks and verified clinical context. Retain the existing UI, retrieval stores, provider gateway, booking and governance services. Evaluate any external repository from the attachment as a narrow component or benchmark candidate only after its full text and actual repository references are available.
