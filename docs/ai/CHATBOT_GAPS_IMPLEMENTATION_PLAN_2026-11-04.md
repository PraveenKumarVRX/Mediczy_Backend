# Dr. iSHA chatbot gaps: implementation plan

Latest engineering implementation and release gates: [completion and rollout runbook](CHATBOT_ROLLOUT_RUNBOOK_2026-11-04.md). This supersedes the earlier pending-code status below; production/clinical outcomes remain gated.

Date: 2026-11-04 · Status: implementation in progress; local changes tested, not deployed

Implementation update: local code changes and focused tests are recorded in [implementation validation and remaining work](../testing/CHATBOT_GAPS_IMPLEMENTATION_VALIDATION_2026-11-04.md). The package status table there is authoritative for implementation progress; this plan is not a claim that every package is complete. No deployment has been performed.

Assessment: [Chatbot feasibility and gaps](CHATBOT_FEASIBILITY_AND_GAPS_2026-11-04.md).
Related dependency: [Report OCR CTO review](REPORT_OCR_CTO_REVIEW_2026-11-04.md).

## Objective and scope

Consolidate Mediqzy's existing chatbot into a consistent, authorized, evidence-grounded service across patient web, WhatsApp, admin/team and clinician channels. Deliver patient education/navigation and clinician-reviewed assistance with truthful task execution. Autonomous diagnosis and prescribing are outside this release.

This plan implements the source-verified gaps G1–G13 in the assessment. The earlier attachment is unavailable, so its proposed features and repositories remain pending comparison. That does not block the confirmed security and integration fixes. Reconcile additional requirements before committing the complete feature-release scope.

Existing UI, retrieval stores, LLM gateway, consent infrastructure, UID registry, appointment services and governance modules remain the starting points. New services or tables require an explicit capability gap and an owner; overlapping names alone do not justify replacement or consolidation.

## Delivery sequence and accountability

Owner names below are responsibilities to assign, not staffing commitments. Independent fixes such as token redaction and removal of invented confidence can ship ahead of gateway consolidation.

| Package | Priority / gaps | Accountable role | Depends on | Exit result |
|---|---|---|---|---|
| C0 | P0: G1, G12 | Backend lead + AI lead | Existing call-path inventory | Versioned channel contract and supported runtime recorded |
| C1 | P0: G2–G5; G11 privileges | Backend/security lead + frontend lead | C0 for shared contract; immediate fixes independent | Authorized, account-isolated sessions and context |
| C2 | P0: G6, G7 | AI lead + clinical safety owner | C0, C1 | Normal and degraded paths preserve safety decisions |
| C3 | P1: G8, G9 | Retrieval lead + frontend lead | C0, C2; confidence fix independent | Grounded citations and honest uncertainty |
| C4 | P1: G10; missing task adapters | Workflow/backend lead | C0, C1, C2 | Authoritative booking and durable handoff outcomes |
| C5 | P1/P2: clinical context integration | Clinical-data lead | C1–C3; verified OCR read contract | Authorized, dated, provenance-bearing personalization |
| C6 | Release gate: G11, G13 | QA lead + Medical Director + platform lead | Relevant packages complete | Evaluated, observable, reversible pilot |

Sequence: C0 → C1 → C2 → C3, with C4 after C2 and C5 after the verified clinical-data interface is available. C6 evaluation design starts during C0; its release gate closes last. The generic assistant need not wait for OCR completion: keep report personalization disabled until C5 passes.

## C0 — establish one contract and supported runtime

**Modify/inspect:** `server/routes/medical-ai.route.js`, `server/routes/whatsapp-production.route.js`, `server/routes/sib-chatbots.route.js`, `server/services/unified-conversation.service.js`, `server/routes/voice-assistant.route.js`, `shared/doctor-mobile-api/ishaCopilot.service.js`, `ai-engine/doctor_bot/app.py`, `sib_app.py`, root PM2 and startup scripts.

1. Inventory every supported caller, request shape, auth boundary, history store and fallback. Confirm the deployed entrypoint separately from source configuration. Root configuration currently points at `app:app`; older launch scripts use `sib_app:app`.
2. Define shared JSON request/response schemas and adapter tests. Extend an existing gateway when its responsibilities fit; create a small adapter module only if needed. Do not start another chatbot server or vector store.
3. Separate actor, clinical subject and conversation identity. Resolve typed entity UIDs through existing registry/reference helpers; legacy numeric IDs may remain private adapter details. Client-selected patient IDs never grant chart access.
4. Map the canonical request to Python's current `user_id`, `patient_context` and `is_patient_specific` fields inside a trusted server adapter. Session ID must never substitute for patient identity. Python must receive only context already authorized for the actor and purpose, and retain authoritative consent enforcement.
5. Document which Python runtime is supported and test that startup path. Deprecate alternatives only after their callers and operational dependencies are accounted for.

Proposed internal envelope, finalized in C0 rather than added directly to a public endpoint:

```json
{
  "schemaVersion": "1",
  "conversationId": "server-issued-opaque-id",
  "traceId": "server-issued-trace",
  "actor": { "uid": "resolved-actor-uid", "mode": "patient" },
  "subject": { "uid": "authorized-subject-uid" },
  "organizationUid": "resolved-organization-uid",
  "channel": "web",
  "purpose": "health_guidance",
  "language": "en",
  "message": "user text"
}
```

Actor, mode, organization and subject authorization are server-derived. Context and history are assembled after authorization; this example does not authorize accepting those fields from clients. General education can omit subject and clinical context. Runtime internal endpoints also need authenticated service access or a verified equivalent boundary; a private URL alone is insufficient.

**Acceptance:** real adapter contract tests cover patient web, WhatsApp, clinician and admin requests; disallowed/unknown fields do not elevate privileges; generic queries omit EHR data; patient-specific queries use the authorized subject and consent path. Node and Python agree on schema version and error categories.

## C1 — sessions, authorization, consent and privacy

**Modify/inspect:** `medical-ai.route.js`, `sib-chatbots.route.js`, `server/repositories/chatbotSessions.repository.js`, `DrISHAChat.tsx`, `client/src/services/drIsha.ts`, existing auth/consent and logout handlers.

1. Immediately remove authorization headers from client error diagnostics and redact prompts, tokens and patient context from logs. Keep operational trace IDs and error codes.
2. Require authentication and explicit approved roles/scopes on admin/team bot operations. Derive identity from middleware. Keep any intentionally anonymous health-education surface separate from personal-data and mutation permissions.
3. Replace prefix-based session ownership with an authoritative owner/organization association checked before consult, history, append, clear and archive. Use opaque server-issued conversation IDs. Reuse the session repository if its schema supports this; inspect existing migrations before extending it.
4. For migration, require proof of ownership before associating legacy histories. Reject or start fresh for ambiguous client-generated sessions; never attach historical content merely because the client supplies its ID.
5. Select one durable conversation record with optional Redis caching. Make append atomic/versioned to avoid lost turns under concurrent requests. Define expiry and clear/archive behavior across Node and Python; preserve audit records according to a separately documented retention policy.
6. Remove account-independent restoration from `dr_isha_session`. Prefer server-restored history; any retained client cache must be account-scoped, minimized, expiring and cleared on logout/account switch.
7. Resolve patient context only after subject/organization access and authoritative consent checks. Consent denied, revoked, expired or unavailable must prevent personal context/retrieval. General education may continue without personal context, explicitly as a new generic request rather than a policy-bypass fallback.
8. Derive clinical authority from existing licensed privileges, not an admin label. Check clinician-to-subject access and delegated caregiver relationships using existing authorization services.

**Data changes:** inspect current session schema first; add owner UID, organization UID, expiry and version fields only where absent, with database constraints and appropriate UID reference helpers. Report sessions, clinical entities and reference data have different registration needs; follow the repository entity rules for actual cross-entity references. Use additive migrations and scoped backfills; no production application is part of this document task.

**Acceptance:** user A cannot read/write/delete user B's history, including guessed legacy IDs; cross-organization access fails; concurrent turns survive; account switching restores no previous user's transcript; expired/revoked consent and consent-store outages send no PHI to retrieval or generation; admin alone grants no clinical privilege; diagnostics contain no bearer tokens.

## C2 — consistent safety and failure behavior

**Modify/inspect:** `medical-ai.route.js`, Python `app.py`, medical pipeline/safety filters, `ai-quality-gates.service.js`, AI guard, provider gateway and web escalation handling.

1. Apply emergency detection before generation, shared across primary and fallback paths. Preserve structured emergency decisions through every adapter. Use the existing governed triage service where applicable; avoid a second independent urgency classifier.
2. Run a common output policy for every provider. Existing Python filters must not disappear when Node invokes a fallback. Establish one policy owner/version and cross-language conformance fixtures where implementation is split.
3. Return a validated response envelope: `status`, `answer`, `safety`, `citations`, `action`, `uncertainty`, `provenance` and `traceId`. Normalize legacy `emergency`/`is_emergency` fields. An action carries a transaction identifier only after a real commit.
4. Make patient and clinician policies explicit. Clinician drafts stay reviewed assistance; client history and retrieved content are untrusted data, never system instructions or authorization evidence.
5. Preserve safety information on timeout/provider outage. The UI must show an actionable failure or escalation state instead of silently presenting an ungrounded clinical answer.

| Failure | Required behavior |
|---|---|
| Authentication/authorization failure | Return denial; no alternate provider attempt |
| Consent failure or lookup outage | Do not send personal context; return a specific consent/unavailable state |
| Emergency detected | Return the existing reviewed urgent-guidance path immediately; retain escalation metadata |
| Retrieval unavailable/no support | State the evidence limitation; abstain/escalate for claims requiring evidence |
| Provider timeout, empty output or network failure | Retry/fallback only within bounded policy; apply the same safety and evidence requirements |
| Output policy rejection | Suppress unsafe content, record redacted reason and provide the approved alternate response |
| No clinician accepts a handoff | Report no accepted handoff; preserve urgent-guidance route rather than implying care is connected |

**Acceptance:** real route tests cover normal, timeout, network, non-OK, policy-denied and empty-output branches; emergency metadata reaches the UI; prohibited patient dosing content is suppressed on all provider paths; red-flag, negation, historical symptoms, educational questions and supported-language cases use clinician-reviewed expected outcomes.

## C3 — citations and uncertainty

**Modify/inspect:** unified retriever, Python response assembly, `buildSibConsultation`, frontend API types and `DrISHAChat.tsx`; existing knowledge-ingestion and approval metadata.

1. Remove `confidence || 0.9` immediately. Preserve zero and missing values correctly. Hide medical-reliability percentages until their meaning and calibration are validated; routing similarity is not answer accuracy.
2. Preserve document/chunk identifiers and supporting sections through retrieval and generation. Return citations with title, authorized source link, section/span, document version/review date and supported claim IDs. Keep EHR citations subject-scoped and avoid exposing inaccessible source URLs.
3. Prefer approved, applicable, current knowledge. Define freshness by source type and retain approval/version metadata. Quarantine revoked or superseded material; do not introduce unrestricted live web answers as a substitute for curated retrieval.
4. Validate citation existence and claim support. Unsupported claims require removal, qualification or abstention; a model-generated URL is not a validated citation.
5. Extend the existing message component to render supporting sources and evidence-unavailable states. Preserve screen-reader access and voice summaries without reading internal retrieval scaffolding.

**Acceptance:** no invented default confidence; citations resolve to actual authorized records; unavailable/revoked sources are excluded; a clinician-labelled set measures whether cited material supports claims and whether missing evidence triggers appropriate abstention. Model/provider changes rerun the same evaluation.

## C4 — truthful tasks and clinician handoff

**Modify/inspect:** `whatsapp-agentic-booking.service.js`, appointment services/repositories, task router, instant-triage/video route, support/escalation services and existing notification infrastructure.

1. Remove default slot/price results from booking error paths. Return authoritative availability or an unavailable/manual-assistance state for every specialty.
2. Re-check actor/subject access, slot validity, booking eligibility and conflicts inside the booking transaction using existing services. Require explicit confirmation of selected provider/date/time/price before mutation.
3. Add scoped request idempotency using existing infrastructure where appropriate. Duplicate confirmations and delivery retries return the original transaction result rather than another booking.
4. Inventory cancellation/rescheduling adapters. Wire or complete transactional actions, including relevant policy/payment handling, using existing appointment operations. “Cancel this draft booking” must remain distinct from cancelling a persisted appointment.
5. Track requested → offered → accepted → connected → completed/failed handoff states using existing consultation/support records if possible. A generated video token does not mean a clinician accepted or connected. Share only authorized transcript/context, with a clear patient-facing state.
6. Reuse durable notification/retry mechanisms for outcomes. Do not ask the LLM to assert that a reminder, booking or cancellation succeeded without a persisted result.

**Acceptance:** database outage yields no fake slots; concurrent requests cannot double-book; repeated confirmations create one booking; unauthorized cancellation/rescheduling fails; failed transactions produce no success claims; no-provider and disconnected-video states are explicit; accepted handoff carries the actual consultation/support identifier.

## C5 — verified clinical personalization and feature completion

**Reuse:** canonical observation read interface from the OCR work, report storage, wearable context, pharmacy safety services, adherence/preferences and follow-up services.

1. Define an authorized context projection with timestamp, source and verification status per item. Preserve unknown/missing/stale states. Do not create chatbot-specific lab tables or a competing terminology catalog.
2. Include only verified OCR observations for trusted clinical summaries. Preserve original report/page, test date, value qualifier and units. Normalize trends only through validated conversions.
3. Add deterministic tool contracts for medication context, adherence, reminders and follow-up; verify underlying behavior before exposing chat actions. Clinical medication advice remains within the approved patient/clinician boundary.
4. Add structured symptom intake as a scoped feature: collect missing information without delaying urgent escalation. Medical Director defines required questions, special-population exclusions and escalation rules.
5. Pilot selected languages and speech paths individually. Evaluate code-switching and transcription errors that alter clinical meaning. Browser recognition/TTS availability must have a usable text fallback.

**Acceptance:** pending/rejected observations never become trusted summaries; missing tests are not described as normal; unit/date provenance remains visible; stale wearable values are labelled; medication tools fail explicitly on incomplete data; reminders honor opt-outs and user timezone; no action completes solely through generated text.

## C6 — evaluation, operational readiness and rollout

Existing 48 passing helper/frontend tests are a baseline, not the release gate. Retain them and add tests at the actual boundaries rather than copying implementations into test files.

| Test layer | Required evidence |
|---|---|
| Unit/contract | Actual serializers, authorization helpers, safety normalization and confidence handling |
| Integration | Express → configured Python runtime with synthetic data; consent, retrieval and provider failure injection |
| Browser | Account switch, restore/clear, citation rendering, urgent escalation and interrupted requests |
| Workflow | Concurrent/repeated booking, cancellation/rescheduling, notification failure and clinician acceptance |
| Clinical evaluation | Clinician-labelled supported cases; unsafe answers, missed urgency, factuality, claim support, appropriate abstention and task truthfulness |
| Language/special population | Separate results for each supported language and approved demographic/specialty scope |
| Operations | Kill switch, redacted audit trail, timeout budgets, safe degradation, restart recovery and rollback rehearsal |

Medical Director and QA must set numerical acceptance thresholds, dataset sizes and exclusion criteria before evaluation. Record versions and denominators. Report under-triage separately from overall accuracy; no observed failures in a small set is not proof of safety. Unsupported cohorts/languages remain outside the enabled scope.

Instrument per-channel trace ID, provider/model/prompt/retrieval/safety versions, latency, error category, fallback rate, evidence availability, blocked-policy outcomes, tool transaction IDs and handoff states. Do not log raw transcripts or patient records by default. Use existing governance/model-card/change-control services; do not create another governance database.

Rollout:

1. Ship narrow redaction/auth/confidence fixes with regression coverage.
2. Validate additive session/contract changes using synthetic accounts and controlled test services. Do not silently replace persisted histories.
3. Shadow only de-identified or appropriately authorized/consented inputs; no clinical writes or unsolicited notifications.
4. Pilot one organization and selected channels/languages, with existing clinical workflow available for handoff.
5. Enable verified report personalization only after the OCR read contract and C5 checks pass.
6. Expand when evaluation and operational targets hold. Pin the evaluated release; treat changes to provider, prompt, retrieval or policy as reevaluation triggers.

Use existing feature-flag infrastructure. Proposed separately controlled capabilities are canonical chat contract, citations, task mutations and verified report context; finalize flag names in C0. Disabling a feature must not bypass authorization, consent or safety. On rollback, disable affected mutation/personalization paths and serve the approved degraded state; never restore a known insecure legacy route. Keep schema changes additive until the cutover and retention windows are proven.

## Completion checklist and review artifacts

- [ ] C0 inventory and schema approved; attachment delta recorded when available.
- [ ] G1–G13 each linked to an implementation PR, owner and executed evidence.
- [ ] Session and context authorization tested across users, roles and organizations.
- [ ] No credential logging, invented confidence, fabricated slots or unverified task-success claims.
- [ ] Safety and evidence policies tested during primary-provider and dependency failures.
- [ ] Citations and verified clinical context preserve source access controls.
- [ ] Clinical evaluation thresholds met for the enabled scope, with Medical Director sign-off.
- [ ] Operational dashboard, support owner, incident path and rollback rehearsal recorded.
- [ ] Architecture, model cards and release notes describe actual deployed behavior.

The document delivers an implementation backlog, not approval to apply migrations or deploy changes. Estimate package effort after C0 identifies affected callers and existing schema capabilities; do not derive a deadline from feature counts or the earlier missing attachment.
