# Exotel contact-center implementation and activation

Date: 2026-10-20. **Source implementation and synthetic verification; not a live release.** Exotel is the selected first provider. No real calls, persistent production schema changes, paid infrastructure provisioning or clinical acceptance occurred for this release. The administrator migration passed a rollback-only rehearsal against the active encrypted RDS target.

The historical [repository comparison](../audits/MEDIQZY_VS_COMCENT_VOICEAGENT_ASTRADIAL_GAPS_2026-10-20.md) remains the baseline. Its evidence hashes describe the pre-implementation audit. This document tracks subsequent implementation without rewriting that evidence.

## Implemented source

- CRM Contact Center at `/crm/contact-center`: assigned agent availability and heartbeat, telephone/browser call initiation, recent calls, owned callbacks, recording import/playback, transcript search, reviewable summaries/copilot/QA drafts, approved hospital knowledge, queue configuration and versioned routing editor.
- Exotel agent-first v1 adapter and authenticated canonical call-detail reconciliation. Inbound missed calls can be imported when the verified provider record matches the tenant's ExoPhone. Callback body status/recording URLs are never trusted. This is not an inbound routing engine.
- Atomic tenant-scoped call reservation, idempotency/request conflict detection, agent skill/language selection, suppression, wrap-up and immutable event history. Ambiguous provider failures keep the reservation and require reconciliation rather than automatic redial.
- Fourteen PostgreSQL tables with forced tenant RLS, composite tenant foreign keys and a separate `mediqzy_voice_owner` NOLOGIN owner. Runtime cannot alter these tables or update/delete/truncate audit events. A separate administrator migration rehearses transactionally by default and requires a fresh encrypted recovery snapshot for apply.
- Signed external transcript contract with timestamps, separate caller/agent segments, revisions, replay rejection and redaction before persistence. Final segments feed leased summary/index jobs, approved tenant FAQ retrieval, validated evidence IDs and 768-dimensional tenant/model-filtered semantic search using the existing embedding service.
- Consent checks before recording/transcription, private SSE-KMS recording import, audited 120-second playback, version-aware S3 deletion, text/vector/artifact retention and rejection of events that would recreate expired content.
- Free-text masking at the shared LLM request boundary, serialized tool JSON and audit output. Ordinary clinical numbers and multimodal attachments are preserved. This is rule-based protection, not a complete multilingual named-entity detector or compliance certification.
- Official Exotel browser SDK integration. Server rotates only the authenticated assigned subscriber's password; account-management credentials never reach the browser. SDK persistent logging is replaced before supplying SIP secrets. Credentials remain sensitive browser-memory credentials, not expiring session tokens.

## Workstream status

“Implemented” below means source and synthetic checks only. None has real-call acceptance.

| Workstream | Current delivery | Remaining acceptance or implementation |
|---|---|---|
| CT-01 provider calls | Exotel adapter, bindings, inbound/status reconciliation | Exotel references, approved number, real inbound/outbound/failure tests |
| CT-02 browser phone | SDK registration, answer/hold/resume/mute/hangup; agent-phone alternative | Vendor WebRTC onboarding, account mappings, audible transfer/conference and reconnect acceptance; expiring credential lifecycle |
| CT-03 IVR | Validated versioned graph/editor; DTMF/hours/holiday evaluator | Connect published graph to provider execution; language nodes, richer menu editing and live timeout/fallback calls |
| CT-04 ACD | Presence TTL/heartbeat, skill/language reservation, concurrency and wrap-up | Inbound waiting/overflow/reassignment execution and UI for advanced skill administration |
| CT-05 supervision | Authorization/audit and signed external media-action contract; gated controls | Implement and deploy provider/media audio modes; verify whisper cannot reach caller |
| CT-06 SIPREC | Not implemented | Select PBX topology, implement metadata/SDP/two-stream ingress and isolated failure acceptance |
| CT-07 copilot | On-demand cited drafts from final segments and approved tenant FAQ | Live push suggestions, authorized CRM/patient linkage, clinician and agent review |
| CT-08 streaming STT | Signed labeled segment ingestion and partial/final revision handling | Actual telephone streaming STT producer, measured latency/accuracy and language evaluation |
| CT-09 phone bot | Signed handoff/interrupt media-action boundary only | Telephone audio bridge, bot turn/interruption state, provider handoff and failure tests |
| CT-10 recording | Consent gate, import, private playback, S3 version/text/vector retention | Provision bucket/key and IAM, provider-side consent/retention/deletion, pause/resume recording and live acceptance |
| CT-11 redaction | Text/tool JSON/request/audit masking, synthetic privacy tests | Broader multilingual entity evaluation, media privacy and approved false-positive/false-negative limits |
| CT-12 artifacts/search | Reviewable summaries, bounded retries, FAQ retrieval, keyword/vector search | Patient/encounter/CRM relationship integration, live embedding/model validation and quality acceptance |
| CT-13 metrics | Real canonical provider states, counts and provider duration | Queue waiting, abandonment, transfer-aware talk/hold/wrap-up metrics; provider duration is not talk time |
| CT-14 callbacks | Duplicate-safe missed-call task, ownership, due date, explicit dial attempt counting and history | Link to existing CRM tickets/activity timeline, outcome reconciliation and real-call acceptance |
| CT-15 campaigns | Manual governed dial primitive and suppression available | Voice step execution in existing journeys/campaigns, marketing consent and outcome timeline integration; no automated broadcasts enabled |
| CT-16 sentiment/QA | Reviewable text-grounded QA draft | Acoustic features/model, evaluated rubric, uncertainty/bias/appeal workflow; no acoustic sentiment claim |
| CT-17 biometrics | Explicitly unavailable | Validated model, enrollment/revocation and spoofing evaluation; never authenticate from caller-supplied scores |
| CT-18 isolation/ops | Forced RLS, server bindings, role checks, signed gateway events, retry/retention worker and deployment assets | Real media authentication/expiry, monitoring/alerts, jitter/loss/latency instrumentation and outage drills |

## Provider and infrastructure configuration

Use [environment.example](../../infra/contact-center/environment.example) as a list of names, not a file containing live credentials. The existing SSM loader reads `/mediczy/prod/` before API/worker startup. Provider SID/key/token and WebRTC account token belong in SecureString parameters. Do not paste them into CRM settings, source, terminal arguments or evidence files.

`VOICE_PROVIDER_BINDINGS` is a server-controlled JSON map from the real healthcare tenant UID to its exact credential prefix, E.164 ExoPhone and optional media gateway prefix. Hospital administrators cannot select another tenant's server secret reference. `VOICE_HOSPITAL_WEBRTC_ACCOUNTS` maps actual assigned staff IDs to approved subscribers, never a caller-supplied account name. Configure the correct Exotel account region/host.

[private-voice.cloudformation.json](../../infra/contact-center/private-voice.cloudformation.json) defines a retained private versioned bucket, rotated KMS key, ACL/public-access blocking, HTTPS and exact-key encryption enforcement, scoped runtime IAM and lifecycle fallback. Supply the existing runtime IAM role name and a globally unique bucket name. The template passed AWS CloudFormation `validate-template`; no stack was created. Align `VOICE_MAX_RETENTION_DAYS` and the template's `MaximumRetentionDays`, and keep every tenant's retention within that ceiling. Storage deletion explicitly enumerates and removes exact-key versions because a plain delete only adds a delete marker in a versioned bucket. See [AWS object-version deletion semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html).

The optional gateway is an external, separately operated media system. The application does not bundle a SIPREC server or synthesize successful hold/whisper/AI-bot operations when it is absent. Required contract:

- Outbound `POST /v1/contact-center/actions`: JSON includes server-derived `tenantUid`, local `callId`, provider SID, actor and action. Reply must match tenant/call and include `accepted: true`.
- Inbound `POST /api/contact-center/hooks/gateway/:tenant`: exact JSON `{callId,type:"transcript",segment:{id,speaker,startMs,endMs,final,text,revision}}`.
- Both directions use `X-Voice-Timestamp` in epoch milliseconds, random `X-Voice-Nonce` and hex HMAC-SHA256 of `timestamp + "." + nonce + "." + JSON.stringify(body)`. Preserve JSON property order. Events must arrive within 120 seconds and nonces cannot be replayed. Rotate the gateway secret through the secret store.

Provider references: [Exotel two-number calling](https://developer.exotel.com/docs/voice-v1/api-reference/connect-two-numbers), [Web SDK](https://docs.exotel.com/voice-apis/client-websdk?open=browser), [subscriber management](https://docs.exotel.com/voice-apis/-qbf-subscriber-management-api). Direct SIP/media features require their own account entitlement and leg mapping; a v1 Call SID must not be substituted for a v2 leg SID.

## Deployment sequence

1. Assemble an isolated reviewed release. This checkout contains unrelated clinical/mobile changes: do not publish the whole dirty workspace or overwrite the running release. Include the new service/routes/migration/worker/privacy helper and targeted API/router/CRM capability/UI imports. Install the two pinned Exotel SDK dependencies from the lockfile. Existing server dependencies suffice.
2. Rehearse against the active encrypted RDS target using its separate managed administrator, verified TLS and the exact endpoint read from SSM:

   ```sh
   node server/scripts/ops/migrate-contact-center.mjs --expected-host "$VOICE_DB_HOST" --evidence /tmp/voice-migration-rehearsal.json
   ```

   Default is rollback-only. To apply, first create/wait for an encrypted snapshot of that exact active instance, then add `--apply --snapshot "$VOICE_RECOVERY_SNAPSHOT"`. The runner refuses stale snapshots, public/unencrypted targets or a different endpoint. It fetches the RDS-managed secret in memory and never writes it to evidence. Schema rollback is application-only; retain audit data. `migrate-all` checks pre-provisioned ownership/RLS instead of creating voice tables with runtime credentials.
3. Provision the private storage stack with the reviewed runtime role. Store its bucket and full KMS key ARN in SSM. Establish provider bindings, approved staff/subscribers and callback base URL. Keep tenant calling and recording disabled until readiness checks pass.
4. Activate the reviewed API and frontend through the existing isolated-release workflow. Verify existing authentication, nursing and Smart-Force paths remain healthy. CRM APIs require `contact_center:read/write/configure`; configuration is Business Head/admin only. The only new unauthenticated global-fence exceptions are the exact POST provider/gateway hook paths; each hook performs its own verification.
5. Start [worker.config.cjs](../../infra/contact-center/worker.config.cjs) with `VOICE_RELEASE_SERVER` set to the reviewed server directory and `VOICE_TENANT_UIDS` set to explicitly enabled tenants. Rehearse `node scripts/ssm-env-loader.mjs scripts/workers/contact-center.mjs --once` first. Monitor `contact_center_worker_error`, failed jobs, oldest pending jobs and retention failures. The worker never obtains an administrator connection or bypasses tenant RLS.
6. Assign approved active hospital staff, set agent availability and run one non-recorded call to an approved test number. Confirm audible two-way audio, correct ExoPhone and canonical terminal outcome. Then test missing/bad credentials, duplicate callbacks, out-of-order events, busy/no-answer and an ambiguous timeout without redial.
7. Test consent-denied and granted recording, browser registration, private playback expiry, deletion of all object versions and provider-copy retention. Obtain hospital reviewer evidence for transcripts, medical terms, languages and AI drafts before clinical use. No reviewer acceptance is implied by synthetic tests.

Rollback: disable tenant calling, stop the dedicated worker, restore the previous reviewed application release and preserve the new tables/events. Retention processing must continue through a controlled maintenance worker if recordings have been created. Do not drop the schema, restore an old database over new clinical data or re-enable the retired unencrypted database.

## Verification and limits

The [verification record](../testing/CONTACT_CENTER_IMPLEMENTATION_2026-10-20.json) identifies exact source hashes, test counts and build checks. Integration tests use disposable loopback PostgreSQL 16/pgvector, non-owner runtime credentials, injected provider/storage/model fixtures and synthetic identities. They do not certify real Exotel connectivity, acoustic quality, CloudFormation deployment, clinical safety or production performance.

Checks passed: 81 server tests across 10 suites, five frontend tests, 29 PostgreSQL integration checks, the full frontend production build, AWS template validation and the rollback-only administrator migration rehearsal. To rerun the database harness, supply a mode-600 JSON file containing only the disposable instance's `port`, `password` and `database: "contact_center_test"` to `node server/scripts/qa/contact-center-integration.mjs <private-file> --reset`. It fixes the host to loopback and refuses production database names. `--reset` destroys only that explicitly disposable test schema.

Outstanding inputs are approved Exotel secret-store references, ExoPhone/test number, actual staff/subscriber mapping and hospital reviewers. Several advanced workstreams also require additional code listed above; credentials alone will not complete all 18 gaps.
