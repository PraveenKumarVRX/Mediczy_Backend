# Chatbot gaps implementation: changes and validation

Latest engineering implementation and release gates: [completion and rollout runbook](../ai/CHATBOT_ROLLOUT_RUNBOOK_2026-11-04.md). This supersedes the earlier pending-code status below; production/clinical outcomes remain gated.

Date: 2026-11-04 · Status: local implementation and validation; not deployed

Plan: [Chatbot gaps implementation plan](../ai/CHATBOT_GAPS_IMPLEMENTATION_PLAN_2026-11-04.md).

## Implemented behavior

- Web consultations use opaque, server-issued sessions. Ownership includes authenticated actor, role and available organization/tenant scope. Consult, session reads, history reads and deletion check ownership. Legacy client-generated histories are not adopted.
- Redis appends and clears use atomic scripts, bound history length and a one-hour TTL. A cleared/expired session cannot be recreated by an in-flight append. Redis failure prevents conversation access rather than silently bypassing ownership checks.
- Personal history is explicitly selected in the UI. Node checks authoritative consent before fetching context; Python checks it again. Personal and generic histories have distinct ownership scopes, preventing a generic follow-up from replaying a personal transcript without consent.
- Web requests use Python's actual `user_id`, `patient_context` and `is_patient_specific` fields. Client-supplied role, history and patient/chart context do not confer authority. Staff must use the separately authorized chart workflow for another patient's data.
- Node owns the new web conversation history. Python consumes the bounded supplied history without writing another hidden copy. Existing non-web callers retain their current store behavior; this is not a completed all-channel store migration.
- Client transcripts are no longer persisted to localStorage; old `dr_isha_session` content is removed. Account/role changes remount the chat component. Clear chat invokes the authorized server clear operation.
- The client uses the existing active-role token selector. Axios errors no longer print request configuration, authorization headers or response bodies. Python's translation log no longer prints message prefixes.
- Admin/team bot routes now require authentication and the permitted role. Unvalidated patient/context identities are rejected; the legacy admin appointment mutation path is consequently unavailable until it has an authorized subject adapter.
- Web consultations and symptom analysis no longer invoke an unfiltered Node LLM fallback after SIB denial/failure. Authorization/consent failures remain denials. Provider outages return an explicit unavailable state.
- Emergency flags survive response normalization and take precedence over non-emergency navigation. The Python generation fallback reuses only scoped retrieval context. Missing evidence produces an explicit abstention, and empty retrieval cannot reopen a legacy unscoped EHR search.
- Retrieval carries actual document/chunk identifiers, titles and bounded knowledge excerpts into the web UI. These are retrieved sources, not validated claim citations. Invented 90% defaults and uncalibrated percentage displays are removed.
- The personal context adapter reads only verified observations for the authenticated user and organization, joined to an active owned report. It preserves zero, units, report date, report/page and source text. Missing schema/data-store access returns `unavailable`, not a normal result. The Python context builder excludes pending observations and preserves data provenance. No OCR schema was applied.
- All booking fallback helpers return no slots instead of invented doctor/lab availability and prices. Booking no longer creates a placeholder patient from an unlinked phone number. Existing linked-user booking remains covered by its regression test.

## Executed checks

| Check | Result | Scope |
|---|---|---|
| Six targeted server Jest suites | 70 tests passed | Real Express consult/history/admin route wiring with isolated infrastructure, real Redis ownership/concurrent append tests, contract/consent projections, existing security/frontend helpers, booking regressions |
| Two client Vitest suites | 5 tests passed | Actual API client and rendered chat component: active-role auth, safe error logs, explicit clear/history IDs, account switching, legacy storage removal, source rendering and no invented confidence |
| Python unittest | 5 tests passed | Actual source/history/observation helpers and production chat handler isolated from model/database initialization: missing-evidence abstention and emergency precedence |
| Python compile checks | Passed | `app.py`, medical pipeline, unified retriever and chat helper |
| Node syntax and `git diff --check` | Passed | Modified backend modules and patch formatting |
| Full client TypeScript check | Failed | Repository-wide diagnostics include AuthProvider role typing and widespread Axios declarations. The run also exposed an intermediate session-variable error that was corrected; the actual client history method now has a passing regression test. A clean full typecheck is not claimed. |

Commands:

```sh
npm --prefix server test -- --runTestsByPath \
  __tests__/medical-chat-contract.test.js \
  __tests__/medical-chat-route.test.js \
  __tests__/sib-chatbots-access.test.js \
  __tests__/medical-ai-security.test.js \
  __tests__/dr-isha-frontend.test.js \
  __tests__/whatsapp-agentic-booking-mental-health.test.js

npm --prefix client test -- \
  src/services/__tests__/drIsha.test.ts \
  src/components/__tests__/DrISHAChat.test.tsx

# From ai-engine/doctor_bot:
python3 -m unittest test_chat_contract.py
python3 -m py_compile app.py sib/medical_pipeline.py sib/retrieval/unified_rag.py utils/chat_contract.py
```

No live providers, production databases, patient records, notifications or deployment were used. The Redis integration tests start and remove their own local Unix-socket Redis instance. Python endpoint tests execute the production handler with injected dependencies; they are not an operational FastAPI/model integration test.

## Package status and remaining work

| Package | Current status | Still required |
|---|---|---|
| C0 | Web contract corrected; configured runtime preserved | Complete doctor/mobile/WhatsApp adapter inventory, one versioned contract across channels, authenticated Python service boundary and runtime/deployment verification |
| C1 | Web session/access/consent fixes implemented; admin paths restricted | Durable cross-channel history/retention migration and delegated clinical-chart authorization; do not describe Redis TTL history as an audit archive |
| C2 | Web failure paths and Python retrieval fallback hardened | Full channel/provider safety conformance and clinician-labelled multilingual/red-flag evaluation; service access controls remain necessary |
| C3 | Honest confidence and retrieved sources implemented | Approved-source freshness/version policy and claim-to-citation validation; retrieved excerpts alone do not close G8 |
| C4 | Fake availability and synthetic patient creation removed | Transactional booking contention/idempotency, cancellation/rescheduling adapters and durable clinician-acceptance/handoff states |
| C5 | Verified observation read/projection implemented | Apply and validate canonical OCR work separately; complete medication/wearable freshness, reminders/preferences and supported-language integrations |
| C6 | Focused local regression checks pass | Full typecheck/build resolution, configured Node→Python integration, clinical evaluation thresholds/data, observability/version evidence, rollback rehearsal and controlled pilot |

The attachment remains unavailable. No external repository adoption or physician-level performance claim is made. These changes close concrete source defects; they do not complete every product and clinical-validation work package in the plan.

## Release considerations

Deploy Node, client, Python handler, retriever, medical pipeline and `utils/chat_contract.py` together after validation. The new Python helper and its test reside under a repository-ignored directory and have explicitly been included in the working diff; release packaging must include the helper.

Existing chat sessions intentionally start fresh. Browser reload starts a fresh UI session. Personal-history opt-in requires active consent and currently exposes only the bounded context projection. If the canonical OCR schema is absent, lab context is unavailable. If Redis is unavailable, the web conversation cannot proceed. If medical evidence is unavailable, Python abstains. The old unfiltered Node fallback is not a rollback target.

Unrelated working-tree changes, including corporate-management, admin-route, sanity-result and report-extraction work, were not modified as part of this chatbot implementation.
