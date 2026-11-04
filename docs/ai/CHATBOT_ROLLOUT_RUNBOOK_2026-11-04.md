# Dr. iSHA engineering completion and rollout runbook

Date: 2026-11-04. Scope: the remaining chatbot work packages C0–C6. This is a source release, not a record of production deployment or clinical approval.

This supersedes the pending engineering list in [the earlier validation report](../testing/CHATBOT_GAPS_IMPLEMENTATION_VALIDATION_2026-11-04.md). The unavailable attachment remains outside the verified requirements.

## Implemented work

| Package | Implementation |
|---|---|
| C0: channel/runtime contract | Signed HMAC transport with body/path binding, freshness and nonce replay checks; configured primary SIB runtime; legacy web consultation aliases delegate to the canonical handler; WhatsApp, admin facade and doctor clinical replies use the same bounded request contract. Mobile SDK exposes real confirmation and handoff methods. |
| C1: identity/history/retention | Owned PostgreSQL sessions extend the existing `chatbot_sessions` table. Atomic append, expiry, idempotent erasure, channel isolation and restart recovery replace web Redis-only history and facade transcript maps. Registered patient UIDs and existing relationship authorization guard delegated chart context; consent is checked for the actual subject. Retention runs through the existing cron registry. |
| C2: provider/safety parity | Clinical replies use the governed Python path; denials cannot trigger a cloud-provider bypass. Missing evidence produces abstention. Legacy EHR embeddings without organization provenance are excluded from chat prompts; verified source projections remain available. Clinical language scope is explicit. Intent classification never supplies an unfiltered clinical reply or fabricated task success. |
| C3: source review/citations | Medical Director preview/review/revocation endpoints, version and expiry checks, approval history, SHA-256 fingerprints of exact chunks and deterministic claim/span validation. Changed/reprocessed content invalidates the approval fingerprint. Default clinical answers are exact safe source excerpts, not unverified paraphrases. |
| C4: tasks/handoff | Booking revalidates availability and conflicts inside an RLS transaction, takes date-scoped locks and persists a unique receipt. Cancellation/rescheduling proposals require an owned expiring confirmation token; existing controllers execute inside the receipt transaction. In-app delivery retries use existing notification infrastructure with stable event IDs. Handoff states distinguish offered, accepted, connected, interrupted and terminal states; verified LiveKit events must identify the actual participants. |
| C5: clinical context | Verified lab values retain date/unit/report/page/source attribution; stale and future wearable readings omit current values; medication references reuse signed reconciliation and are labelled historical; preferences reuse existing reminder settings. Feedback is persisted against an owned conversation. No pending lab value or missing record is interpreted as normal. |
| C6: engineering/release evidence | Local PostgreSQL contention, erasure, receipt and delivery recovery tests; signed Node→Python ASGI integration; actual client/route tests; a focused typecheck and production bundle; versioned model card and trace telemetry using the existing evaluation store. Clinical release evaluation requires an approved exact evidence fingerprint, not invented scores. |

Clinical evaluation and live rollout are still external gates. Implementing those gates does not establish their outcomes. The full repository TypeScript check retains unrelated diagnostics; the focused chatbot typecheck and production bundle are the relevant completed code checks. Do not suppress unrelated errors to create a false full-repository green result.

## Channel inventory and trust boundaries

| Entry | Current ownership and routing |
|---|---|
| Web `/api/medical-ai/consult` | Authentication → owned durable session → optional subject/consent projection → signed canonical Python chat |
| Legacy `/api/ai/working-medical-consult` | Delegates to the same web handler; no separate regex/LLM consultation pipeline |
| WhatsApp production medical branch | Existing provider verification + account linking + consent → durable channel session → signed Python chat |
| Admin/team bot console | Explicit role gate; body-supplied patient identities rejected; generic education uses the shared facade and owned session |
| Communication assistant | Authenticated actor supplies ownership; client identity/context cannot replace it; analytics retain metadata rather than another raw transcript |
| Doctor copilot/mobile clinical path | Existing gateway resolves registered subject identity, delegates to canonical chat and preserves a shared trace ID |
| Doctor voice clinical answers | Relationship and consent guard → canonical channel chat; routing/administrative tools remain separate deterministic workflows |
| SIB knowledge/embedding/CDSS/scribe consumers | Existing service calls use signed transport. They are not evidence of chatbot clinical accuracy or authorization for arbitrary chart access. |

Legacy `sib_app.py` remains a compatibility implementation; supported startup scripts point at `app:app`. Both entrypoints enforce service authentication. Do not deploy the alternate runtime as the clinical chatbot implementation. Old prototype CommonJS task-router/example files are not supported entrypoints.

## Prepare a reviewable release

1. Include all changed Node/client/shared SDK files and Python `app.py`, retrieval/pipeline modules, `utils/chat_contract.py` and `utils/service_auth.py`. Python's directory is repository-ignored, so the new helpers must be explicitly included in release packaging.
2. Keep a database backup and previous application artifact under the existing deployment process. The additive migration has no automatic destructive down.
3. Configure one shared service secret of at least 32 characters in Node and Python. Prefer `SIB_SERVICE_SECRET`; `JWT_SECRET` is a compatibility fallback. The primary startup script loads it from the existing SSM path without printing it. Python binds loopback by default. Configure a deliberate private transport if the services run on different machines.
4. Pin `CHATBOT_PROMPT_VERSION` to the reviewed release and set `CHATBOT_SUPPORTED_LANGUAGES` to the evaluated languages. `en` is the conservative default, not a claim of English clinical validation.
5. Set `CHATBOT_TASK_MUTATIONS_ENABLED=false` and `CHATBOT_PERSONAL_CONTEXT_ENABLED=false` during preparation. Enable each only after its migration, authorization, workflow and pilot checks pass. Existing AI guard/kill-switch controls still apply.

## Schema preparation and cutover

The new migration extends existing session, appointment and document tables. It does not auto-provision patients, register invented identities, auto-approve knowledge or apply the separate OCR migration.

Commands below are operator steps against the deliberately selected environment; they were not executed against production during implementation:

```sh
node server/scripts/ssm-env-loader.mjs server/scripts/qa/apply-chatbot-schema.mjs --dry-run
node server/scripts/ssm-env-loader.mjs server/scripts/qa/apply-chatbot-schema.mjs --apply
```

The local PostgreSQL tests execute the same migration helper, verify rollback, apply it twice and test the resulting behavior. Confirm the production schema separately before starting new code. The new appointment model selects `chat_request_key`, so schema must precede code cutover.

Keep old ownerless histories inaccessible. New web sessions start fresh; browser transcripts are not restored from localStorage. The bounded conversation store expires after an hour, with maintenance erasure on the following minute. Action confirmations expire after ten minutes; offered/accepted video handoffs without connection fail after fifteen minutes. Retain only minimal mutation/delivery receipts after transcript erasure. Regulatory audit-retention policy remains separately governed.

## Approve actual sources

Use authenticated Medical Director endpoints:

- `GET /api/medical-ai/knowledge/:id/preview` returns actual chunks and a fingerprint.
- `POST /api/medical-ai/knowledge/:id/review` takes `status`, `version`, `dueAt` and `expectedFingerprint`.
- Approval requires the authenticated reviewer's registered UID; admin status alone cannot approve.
- Revocation uses `status: "revoked"` and immediately removes the source from eligible retrieval.

Only ready global documents with a current review, version and matching content hash enter the shared knowledge corpus. Patient-specific facts use separately authorized verified projections. Existing source content is not automatically approved during migration.

Extractive answers preserve original wording. This limits conversational fluency and can abstain when retrieved material is incomplete or filtered. Source availability is not clinical suitability. Legacy callers that used `/chat` for unreviewed generative prescriptions or structured drafts are not granted that capability by this release; retain the existing reviewed document workflow/manual draft path and test those integrations before rollout.

## Clinical evaluation gate

Start from [the deliberately incomplete policy template](evaluation/CHATBOT_RELEASE_POLICY_TEMPLATE.json). A Medical Director must supply the dataset, labels, supported scope, thresholds and reviewed outcomes. Do not fill these with synthetic engineering results.

The evaluator requires complete matching case IDs, per-language sample sizes, explicit reviewed safety/quality outcomes and a single pinned model/prompt/retrieval/safety version. Under-triage, unsafe output, unsupported claims, privacy leaks and false task-completion claims are separate blocking metrics. Run each model/version separately.

```sh
node server/scripts/qa/chatbot-release-gate.mjs --fingerprint policy.json cases.json reviewed-results.json
```

Propose a change through the existing governance workflow with component `medical-chat-approved-extractive-v1` and `new_config` containing `datasetVersion` and `evaluationFingerprint`. The approval route records the authenticated Medical Director's UID for this component. Put the resulting change ID in the policy, then run:

```sh
node server/scripts/ssm-env-loader.mjs server/scripts/qa/chatbot-release-gate.mjs policy.json cases.json reviewed-results.json
```

The gate verifies that the exact evidence fingerprint has current Medical Director approval in the existing registry. Missing evidence, wrong approval scope, changed labels/results, mixed model versions or failed thresholds prevent a passing release report. A configuration preflight is separate:

```sh
node server/scripts/ssm-env-loader.mjs server/scripts/qa/chatbot-preflight.mjs --database --policy policy.json
```

Preflight confirms configuration/schema/source availability; it does not replace clinical evaluation.

## Controlled live verification

Use authorized synthetic accounts and test appointments first:

- Attempt cross-user/organization history access and revoked-consent requests; confirm no context reaches providers.
- Exercise primary service failure, missing/changed/revoked evidence and unsupported language states.
- Confirm repeated booking/cancellation/rescheduling returns a real committed receipt without another mutation.
- Configure the LiveKit project callback to `/api/medical-ai/handoffs/provider/events`. Verify signature rejection, unrelated-room rejection, assigned-doctor acceptance, both participants connected, interruption and termination.
- Observe the existing cron registry's `medical_chat_maintenance` task, receipt delivery retries, source approval history and PHI-free execution traces. No prompt/model optimization is triggered by the new trace writer.
- Enable one organization/channel/scope at a time after evaluation. Scope expansion, changed provider, changed prompts or changed safety/retrieval rules require new evidence.

No new Slack/email communication or production configuration was performed by the implementation agent.

## Safe rollback

Disable task mutations and personal context first; retain authorization, service authentication and source guards. Stop expansion if required evidence fails. Keep additive schema and committed receipts. Do not restore ownerless session access, invented slots, unfiltered LLM fallbacks or old source approvals as a rollback shortcut. Client sessions may start fresh after cutover; committed clinical/administrative records remain authoritative.
