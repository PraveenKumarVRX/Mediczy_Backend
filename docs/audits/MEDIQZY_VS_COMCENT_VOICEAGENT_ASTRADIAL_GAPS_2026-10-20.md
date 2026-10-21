# MediQzy compared with Comcent CE, VoiceAgent and Astradial

Assessment date: **20 October 2026 (Asia/Kolkata)**. Scope: source review and feature-gap documentation, with a proposed implementation sequence. No third-party application was installed or executed, no phone calls were placed, and no production configuration was changed for this assessment.

## Findings

MediQzy has useful healthcare, CRM, messaging, STT/TTS, knowledge retrieval and voice-assistant foundations. Its main gap against these repositories is an operational **telephone contact center**: provider-connected calls, a browser phone, queues/IVR, agent supervision, call-linked work items and call-specific analytics. These are different capabilities from video consultation, outpatient queues or a clinical voice assistant.

The review identifies **18 workstreams** below. They are scoped implementation gaps, not a claim that all three repositories implement every feature or that MediQzy lacks all communications functionality.

Four findings change the priorities:

1. **Provider settings are not working telephony.** MediQzy's `initiateProviderCall()` explicitly throws because no real provider integration is implemented. Its per-provider examples and credential-presence tests must not be treated as successful calls. [M1]
2. **Existing chat support is only partially migrated.** The current Chatwoot adapter has real API paths, configuration gates and intentionally unavailable legacy methods. Historical RocketChat setup instructions are not current implementation evidence. [M7] [M8]
3. **Free-text PHI protection has a confirmed gap.** The shared LLM sanitizer processes object content, but passes string content through. The object masker also leaves primitive strings unchanged. A synthetic-only local check confirmed that distinction. This must be addressed before adding call transcripts to external AI processing. [M9] [M10]
4. **The reference projects also need qualification.** Comcent CE has Enterprise boundaries and external media/bot images; VoiceAgent has default-authentication and biometric-model limitations; Astradial has entrypoint-dependent workflow integrations and a published deployment security advisory. See the repository notes rather than treating any README as production acceptance.

## Review basis and status definitions

| Repository | Reviewed commit | Commit timestamp | License file observed |
|---|---|---|---|
| [Comcent CE](https://github.com/comcent-io/comcent-ce) | `6ab320b39beba3c65b1b56a18555fae4b5f01f61` | 2026-10-09, as recorded by Git | AGPL-3.0 [C0] |
| [VoiceAgent](https://github.com/kapiljain1989/voiceagent) | `097dfc87935112b86d13b42b31ae85faab61e2ea` | 2026-06-21, as recorded by Git | Apache-2.0 [V0] |
| [Astradial](https://github.com/astradial/astradial) | `3188ac5ff87b43cb8489b493a35d959b74c17e16` | 2026-08-20, as recorded by Git | AGPL-3.0 [A0] |
| MediQzy working tree | HEAD `0031ee8f46f16d475e9db9e74cb0f6c12cf5e907`, plus local changes | Reviewed on 2026-10-20 | This comparison does not determine MediQzy's distribution-license obligations |

The [evidence manifest](./COMMUNICATIONS_REPO_REVIEW_EVIDENCE_2026-10-20.json) records file hashes, repository pins, search scope and the synthetic privacy check. MediQzy's working tree contains unrelated ongoing changes, including a new sentiment helper. This is a review of the inspected source, **not certification that those changes are deployed**. Native Smart-Force source and phone-system acceptance were not reviewed.

- **Source present:** relevant implementation was inspected; deployment and behavior under load remain unverified.
- **Partial:** useful implementation exists, but the comparable telephone workflow is incomplete.
- **Gap:** the relevant implementation was explicitly unavailable or not located in the inspected communications paths. A search result alone does not prove repository-wide absence.
- **Unverified:** a README claim or deployment dependency was not established by the inspected code or runtime testing.

## What each repository contributes

### Comcent Community Edition

Comcent is a contact-center reference with a browser dialer, number flows, queue scheduling, call transcripts and a call-search index. Its inspected architecture combines an Elixir/Phoenix service, Svelte frontend, FreeSWITCH media and separate bot components. [C1] [C2] [C3] [C4] [C5]

Useful patterns for MediQzy are the queue/agent state separation, number-specific routing graphs, speaker/timestamp transcript representation, and asynchronous call processing. The queue scheduler explicitly coordinates waiting calls and available agents, rather than using an outpatient appointment queue. [C2] [C3] [C6] [C10]

Limits:

- The README positions billing/metered usage, GDPR workflows, audit logs, SLA tracking, outbound campaigns and executive summaries as Enterprise offerings. Some related schemas or jobs remain in CE; their presence does not establish the complete Enterprise workflow. For example, CE's charging functions are explicit no-ops. [C1] [C7]
- Transcription and AI processing depend on configured providers. The deployment references separately versioned FreeSWITCH and voice-bot images; their complete implementations were not audited here. [C4] [C6]
- The README describes provider-credential encryption as conditional on configuring its encryption key. That configuration needs verification before any real provider credentials are stored. [C1]

### VoiceAgent

VoiceAgent is the strongest of these references for an AI-assisted agent desktop: SIP B2BUA and SIPREC paths, WebRTC audio, skill/priority/idle-based agent selection, supervisor audio modes and call-specific AI/security modules are present in source. [V1] [V2] [V3] [V4] [V5]

It is particularly useful for studying a passive call-observation adapter and speaker-aware agent assistance. Its source also provides acoustic-feature sentiment, transcript pattern masking, recordings, webhook retries and a knowledge-retrieval client. These are implementation references, not measured accuracy or reliability results. [V6] [V7] [V8] [V9] [V10]

Limits:

- `auth.go` seeds a default administrator in an empty database and logs its generated credential information. Its database-unavailable branch includes a hardcoded administrator fallback. This is a concrete reason to require an authentication/security review before reuse; the project description's “production-grade” wording is not acceptance evidence. No exploit or deployment test was performed. [V11]
- Its voiceprint extractor uses a simple 32-feature energy representation and explicitly calls for replacement with a neural speaker-embedding model for production. Do not classify this as validated patient authentication. [V7]
- Tenant management and tenant schema code exist, but this review does not establish isolation across every API, live stream, knowledge collection and recording. [V12]
- SIPREC observation does not itself give an observer control over the original PBX call. Active transfer or barge-in depends on the chosen call/media topology. [V1] [V3] [V5]

### Astradial

Astradial is a useful business-phone-system reference: Node/Express and Next.js around Asterisk, with queues, call-control APIs, call-log-driven tickets, recording-consent dialplans and workflow actions. It has CRM functionality, but it is not a replacement for MediQzy's clinical record or medication workflows. [A1] [A2] [A3] [A4] [A5]

Useful patterns are missed-call/queue-timeout reconciliation, duplicate-safe ticket events, explicit recording-consent branches and call events feeding follow-up work. Call APIs invoke Asterisk AMI/ARI rather than returning a fabricated call identifier. [A2] [A3] [A4]

Limits:

- Its README documents a historical database/cache exposure incident and points to `SECURITY.md`. This is historical upstream deployment evidence, not a statement that every current installation is vulnerable. [A6]
- Workflow entrypoints differ: the Dockerfile starts root `server.js`, while the package start command uses `src/server.js`. The root ticket executor targets a hosted Astradial events service; the `src` variant targets `events.example.com`. Treat this action as environment-dependent/vendor-coupled, not a verified self-contained ticket workflow. The separate call-log ticket classifier is implemented independently. [A3] [A5] [A7] [A8] [A12]
- The README says some editor features still require Firebase and describes optional external voice/storage integrations. A local installation does not establish that every advertised feature is available without those services. [A1]

## Feature comparison

Peer columns describe inspected source or a stated dependency, not live acceptance. Evidence links identify the relevant implementations. Missing peer entries mean “not established in this review,” not “impossible.”

| Capability | Comcent CE | VoiceAgent | Astradial | MediQzy finding | Gap |
|---|---|---|---|---|---|
| Real inbound/outbound telephone calls, trunks and DIDs | SIP/media deployment [C4] | SIP server/trunks [V2] | AMI/ARI call control [A2] | Provider configuration exists; central initiation deliberately throws [M1] | CT-01 |
| Browser phone with hold/transfer/conference | Browser dialer [C5] | WebRTC and call controls [V16] [V17] | Hold/transfer APIs [A2] | Video/LiveKit components exist; PSTN agent desktop not located [M2] [M3] | CT-02 |
| Editable IVR, DTMF, business-hours call routing | Number flow graph [C1] [C3] | IVR engine [V15] | Generated dialplan [A4] | Named messaging journeys exist; not an editable telephone flow [M4] | CT-03 |
| Agent presence, call queues and skills-based distribution | Queue scheduler [C2] | ACD skill/idle scoring [V4] | Queue services [A9] | Telephone agent distribution not located; clinic queues serve a different purpose | CT-04 |
| Supervisor listen/whisper/barge | Not established here | Supervisor audio implementation [V5] | Not established here | Supervisor media modes not located | CT-05 |
| SIPREC passive observation | Not established here | SIPREC parsing/media path [V3] | Not established here | No SIPREC adapter located | CT-06 |
| Live call copilot with retrieved context | Bot integration, different role [C4] | LLM/RAG and call events [V3] [V10] | AI-bot connection [A10] | Clinical assistant/tools and retrieval are reusable; no call-linked live copilot [M2] [M11] | CT-07 |
| Caller/agent transcription with timing | Speaker/timestamp representation [C10] | Separate call-media processing [V3] | Bot audio pipeline [A10] | Audio-file STT exists; telephone speaker/segment pipeline not located [M2] | CT-08 |
| AI telephone conversation, interruption and human handoff | Separate voice-bot service [C4] | IVR/copilot building blocks [V15] | WebSocket bot pipeline [A10] | STT, TTS and LiveKit dispatch exist; PSTN bridge/handoff not established [M2] [M3] [M17] | CT-09 |
| Call recording, consent and lifecycle | Call recording infrastructure [C4] [C6] | WAV recording [V8] | Consent branches in dialplan [A4] | Consultation recording/access/download paths exist; telephone consent state machine not found [M5] | CT-10 |
| Free-text transcript redaction before AI | Not established as complete | Pattern masker wired before AI in gateway path [V7] [V13] | Not established as complete | Object masking exists; string content passes through LLM sanitizer [M9] [M10] | CT-11 |
| Call summaries, action items and semantic transcript search | Call processor/search index [C6] [C8] | Call summary/RAG modules [V3] [V10] | Bot/workflow pieces [A5] | General RAG and CRM summaries are reusable; call artifact ingestion/search not established [M11] [M12] | CT-12 |
| Contact-center metrics: waiting, talk/hold/wrap-up, abandonment | Queue/call events; Enterprise boundary applies [C1] [C2] | Metrics/reporting modules [V14] | Call logs/queues [A2] [A9] | Messaging/revenue dashboards and CRM call activities exist; provider-derived call measures absent from audited path [M6] | CT-13 |
| Missed-call tickets and owned callbacks | Call webhooks [C9] | Call-event webhooks [V9] | Ticket classifier and scheduler [A3] [A11] | Tickets and messaging bridge exist; PSTN outcomes do not feed them [M7] [M13] | CT-14 |
| Voice-triggered workflows and campaign steps | Call events; outbound campaigns positioned in EE [C1] [C9] | Event webhook retries [V9] | Workflow call action, caveats above [A5] | Real messaging dispatch/journeys exist; no telephone execution node [M4] [M6] [M13] | CT-15 |
| Acoustic sentiment and conversation QA | Transcript sentiment processing [C6] | Acoustic feature module [V6] | Not established here | Text sentiment helper is wired in working-tree chat/review/PREMS paths; no acoustic call scoring [M12] [M14] [M19] [M20] | CT-16 |
| Caller biometrics and robocall/fraud signals | Not established here | Prototype voiceprint/security modules [V7] | Not established here | Consent/enrollment/result records exist; score is supplied by caller, no validated inference shown [M15] | CT-17 |
| Shared identity, tenant isolation and signed integration events | Organization contexts/webhooks [C2] [C9] | Tenant schema/routes, not isolation proof [V12] | Organization roles and call APIs [A2] | Tenant-aware auth, clinical RBAC and message webhooks exist; a new voice service still needs trusted tenant mapping and media authorization [M13] [M16] [M18] | CT-18 |
| CRM and customer follow-up | Contact-center focus | Integration/webhooks | Clients/leads/deals | Existing healthcare CRM, communication log and lead/deal activity; extend instead of replacing [M6] [M12] | Existing strength |
| WhatsApp/SMS/email and appointment journeys | Not the main benchmark | Not the main benchmark | Optional integrations/workflows | Actual dispatch/bridge and healthcare journey code exist; provider/runtime verification remains separate [M4] [M6] [M13] | Existing foundation |
| Clinical assistant, medical context and hospital workflows | No comparable clinical workflow established | No comparable clinical workflow established | Business-phone/CRM focus | Clinical tool actions, knowledge retrieval, nursing and medication source exist; preserve their authorization boundaries [M2] [M11] [M16] | Existing domain strength |
| Support agent workspace | Own voice application | Own agent application | Own phone/CRM application | Chatwoot integration is partial; legacy console methods explicitly unavailable [M7] [M8] | Related dependency |

## Prioritized implementation backlog

P0 means a foundation or release gate before a real telephone pilot, not a claim of a current production outage. P1 completes the first contact-center workflow. P2 follows measured pilot demand. Effort and dates require an agreed provider, target topology, call volume and team capacity; no unsupported delivery dates are assigned.

| ID | Priority / source status | Required implementation | Acceptance evidence |
|---|---|---|---|
| CT-01 | P0 / gap | One real provider adapter with number/trunk mapping, outbound initiation, inbound/status/recording webhooks and durable call events. Keep unsupported providers explicitly disabled. | Provider-issued call ID, successful inbound/outbound test calls, validated signatures, duplicate and out-of-order callback tests; provider failure cannot appear as success. |
| CT-02 | P1 / gap | Agent browser phone, expiring media credentials, ringing/answered/hold/resume/transfer states, reconnect behavior and patient-context link. | Two agents complete hold/resume/transfer with audible verification and consistent server state after reconnect. |
| CT-03 | P1 / partial | Versioned, validated IVR graph: greeting, language, keypad input, timeout, hours/holiday branches, queues and human fallback. | Invalid graphs rejected; approved/published versions distinguished; after-hours, invalid input and timeout calls follow expected paths. |
| CT-04 | P1 / gap | Agent presence, skills/languages, distribution policy, wrap-up, overflow and owned callback queue. | One agent cannot receive conflicting assignments; queue waits, overflow and reassignment verified under concurrent calls. |
| CT-05 | P2 / gap | Supervisor audio modes with role checks, consent/policy controls and an audit record. | A permitted supervisor can listen/coach/join; unauthorized agents and another tenant cannot attach; coaching audio is absent from caller leg. |
| CT-06 | P2 / gap | Optional SIPREC ingestion for hospitals keeping an existing PBX; map streams and metadata without taking over routing. | An isolated PBX fixture provides two labeled streams; observer failure leaves the original call running. |
| CT-07 | P1 / partial | Stream call segments into an agent copilot with scoped hospital/CRM retrieval, evidence links and explicit human confirmation for actions. | Suggestions cite allowed records; no cross-patient data retrieval or unconfirmed scheduling/prescription action occurs. |
| CT-08 | P1 / partial | Streaming STT adapter, caller/agent segment schema, timestamps, partial/final corrections and measured language coverage. | Labeled dual-channel test set, medical-term review, latency/error results per selected language and reconnect/reordering tests. |
| CT-09 | P2 / partial | Telephone media-to-agent bridge, interruption handling, bounded turn state and reliable transfer to a human. | Caller interruption cancels stale speech; bot failure transfers/ends predictably; tool and recording permissions remain enforced. |
| CT-10 | P0 / partial | Per-call recording policy, captured consent evidence, pause/resume, private object storage, expiring playback, access audit and retention/deletion jobs. | Consent-denied call produces no recording artifact; access across tenants denied; expiry, retention and deletion verified on synthetic calls. |
| CT-11 | P0 / confirmed gap | Actual string/entity redaction at transcript/LLM/logging boundaries, with pseudonymous context where useful. Extend beyond object-key masking. | Synthetic names, contacts and selected healthcare identifiers are redacted in provider-bound strings and logs; nested/multimodal cases and false positives tested. |
| CT-12 | P1 / partial | Durable call transcript/summary/action-item records, tenant/patient/encounter links, asynchronous indexing and access-filtered search. | A completed call yields a reviewable summary and searchable authorized transcript; replay does not duplicate artifacts; deletion also removes search entries. |
| CT-13 | P1 / partial | Provider-event-based durations, hold/wrap-up, answer/abandonment measures, agent dashboards and drill-down to call events. | Aggregate figures reconcile to call events; transfers do not inflate calls; dashboards never substitute random or manually entered values for actual duration. |
| CT-14 | P1 / partial | Missed/abandoned-call ticket reconciliation, duplicate-safe event ingestion, callback ownership/due time and resolution history. | Replayed callbacks create one ticket; an answered transfer is not marked missed; callback attempts and owner changes are auditable. |
| CT-15 | P2 / partial | Add governed voice actions to existing messaging journeys/campaigns, consent/suppression checks, retries and delivery state. | Suppressed recipients are not dialed; retries cannot dial twice ambiguously; message and call outcomes share an activity timeline. |
| CT-16 | P2 / partial | Text/acoustic conversation analytics and reviewed QA rubric, with provenance, uncertainty and agent appeal/review. | Evaluation separates text classification from acoustic heuristics; language/bias checks are recorded; no clinical decision depends on a sentiment score. |
| CT-17 | P2 / partial, defer | Validated speaker-model integration, enrollment/revocation, anti-spoofing evaluation and fallback identity verification. | Reproducible false-accept/reject and spoofing evaluation, consent/revocation tests; caller-supplied scores cannot authenticate a patient. |
| CT-18 | P0 / partial integration foundation | Tenant-scoped voice entities, service/media credentials, scoped event contracts, request replay protection, integration health and voice-specific operational metrics. | Cross-tenant calls/streams/recordings/search denied; expired stream tokens rejected; provider outage/recovery and event reconciliation tested; jitter/loss and AI latency observable. |

## Suggested implementation sequence

1. **Foundation and provider decision — CT-11, CT-18, CT-10, CT-01.** Agree managed telephony versus an isolated self-hosted PBX. Build the event/tenant/recording contracts and address string redaction first. Provider credentials, a test number/trunk and a reachable signed-webhook endpoint are required for real-call acceptance, but most schema, UI and adapter-contract work can proceed using synthetic fixtures.
2. **Human-operated pilot — CT-02, CT-03, CT-04, CT-14, CT-13.** Start with hospital appointment/callback support, browser agents and a simple queue. Integrate the existing CRM and Chatwoot workspace instead of creating a second patient/customer master.
3. **Call intelligence — CT-08, CT-12, CT-07.** Add transcription, reviewable summaries and retrieval-grounded copilot assistance. Measure language accuracy and latency using consented or synthetic evaluation audio.
4. **Advanced automation — CT-05, CT-06, CT-09, CT-15, CT-16.** Choose passive SIPREC or active routing based on the hospital's phone topology. Add supervisor controls and AI voice only after the human-agent workflow is accepted.
5. **Optional identity research — CT-17.** Keep voice biometrics out of the authentication-critical path until it passes its own evaluation.

Suggested model boundaries: `voice_numbers`, `voice_trunks`, `voice_agent_sessions`, `voice_queues`, `voice_queue_members`, `voice_calls`, append-only `voice_call_events`, `voice_recordings`, `voice_transcript_segments`, `voice_summaries` and `voice_callback_tasks`. These are **proposed contracts**, not migrations created by this review. Keep MediQzy's existing patient, encounter, CRM and consent records authoritative; map provider IDs to them through trusted tenant-scoped relationships.

For a bounded MediQzy extension, start with a single adapter around the current service interface. Study Comcent for queue/call lifecycle design, VoiceAgent for SIPREC/copilot architecture, and Astradial for missed-call ticketing and consent routing. Do not combine all three PBX/media stacks or replace the hospital system merely to gain a phone console. License review and source/security qualification precede copying or distributing third-party code; this assessment is not a legal determination.

## Verification performed and limits

- Opened the three supplied GitHub pages and fetched shallow source snapshots; inspected pinned implementations and license files. Repository installers, containers, migrations and tests were not run.
- Inspected MediQzy route mounting, provider initiation, voice-assistant/STT/LiveKit paths, TTS, recording routes, messaging/Chatwoot services, CRM activities, RAG, sentiment and voice-biometric records. Search terms included SIPREC, SIP trunk, dialer, transfer, supervisor, consent, transcription and masking. “Not located” findings are limited to those paths/searches.
- Executed only a small local synthetic check against MediQzy's pure `maskPhi()` helper. It returned the test string unchanged and redacted an equivalent structured `phone` property. No real patient data, provider request or production database was used.
- Did not verify a real SIP trunk, phone number, audio path, GPU capacity, provider credentials, live Chatwoot configuration, call concurrency, deployment isolation or regulatory compliance. Do not infer those from configuration flags or older setup documents.
- The existing Claude plan was read for context only. Its instructions to implement or deploy work were not treated as authorization for this documentation request.

## Evidence links

Reference IDs below resolve to pinned upstream files or inspected local source. File-level hashes and the full review scope are in the accompanying manifest. Findings describe this snapshot and may change after the next upstream or local update.


<!-- BEGIN GENERATED SOURCE REFERENCES -->
[C0]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/LICENSE "comcent-ce: LICENSE"
[C1]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/README.md "comcent-ce: README.md"
[C2]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/server/lib/comcent/queue/queue_scheduler.ex "comcent-ce: server/lib/comcent/queue/queue_scheduler.ex"
[C3]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/server/lib/comcent/number_flow_graphs.ex "comcent-ce: server/lib/comcent/number_flow_graphs.ex"
[C4]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/docker-compose.deploy.yaml "comcent-ce: docker-compose.deploy.yaml"
[C5]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/packages/web-app/src/lib/components/DialerWidget/CurrentCall.svelte "comcent-ce: packages/web-app/src/lib/components/DialerWidget/CurrentCall.svelte"
[C6]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/server/lib/comcent/new_call_story_processor.ex "comcent-ce: server/lib/comcent/new_call_story_processor.ex"
[C7]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/server/lib/comcent/ce_stubs/charges.ex "comcent-ce: server/lib/comcent/ce_stubs/charges.ex"
[C8]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/server/lib/comcent/search.ex "comcent-ce: server/lib/comcent/search.ex"
[C9]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/server/lib/comcent/webhook_pusher.ex "comcent-ce: server/lib/comcent/webhook_pusher.ex"
[C10]: https://github.com/comcent-io/comcent-ce/blob/6ab320b39beba3c65b1b56a18555fae4b5f01f61/server/lib/comcent/transcript.ex "comcent-ce: server/lib/comcent/transcript.ex"
[V0]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/LICENSE "voiceagent: LICENSE"
[V1]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/README.md "voiceagent: README.md"
[V2]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/sipserver.go "voiceagent: gateway/sipserver.go"
[V3]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/siprec.go "voiceagent: gateway/siprec.go"
[V4]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/acd.go "voiceagent: gateway/acd.go"
[V5]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/supervisor.go "voiceagent: gateway/supervisor.go"
[V6]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/sentiment.go "voiceagent: gateway/sentiment.go"
[V7]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/security.go "voiceagent: gateway/security.go"
[V8]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/recording.go "voiceagent: gateway/recording.go"
[V9]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/webhooks.go "voiceagent: gateway/webhooks.go"
[V10]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/rag.go "voiceagent: gateway/rag.go"
[V11]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/auth.go "voiceagent: gateway/auth.go"
[V12]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/tenant.go "voiceagent: gateway/tenant.go"
[V13]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/main.go "voiceagent: gateway/main.go"
[V14]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/metrics.go "voiceagent: gateway/metrics.go"
[V15]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/ivr.go "voiceagent: gateway/ivr.go"
[V16]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/callcontrol.go "voiceagent: gateway/callcontrol.go"
[V17]: https://github.com/kapiljain1989/voiceagent/blob/097dfc87935112b86d13b42b31ae85faab61e2ea/gateway/webrtc.go "voiceagent: gateway/webrtc.go"
[A0]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/LICENSE "astradial: LICENSE"
[A1]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/README.md "astradial: README.md"
[A2]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/api/src/routes/calls.js "astradial: api/src/routes/calls.js"
[A3]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/api/src/services/ticketClassifier.js "astradial: api/src/services/ticketClassifier.js"
[A4]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/api/src/services/asterisk/dialplanGenerator.js "astradial: api/src/services/asterisk/dialplanGenerator.js"
[A5]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/workflow-engine/src/executors.js "astradial: workflow-engine/src/executors.js"
[A6]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/SECURITY.md "astradial: SECURITY.md"
[A7]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/workflow-engine/executors.js "astradial: workflow-engine/executors.js"
[A8]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/workflow-engine/Dockerfile "astradial: workflow-engine/Dockerfile"
[A9]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/api/src/services/asterisk/queueService.js "astradial: api/src/services/asterisk/queueService.js"
[A10]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/pipecat-flow/gateway/pipeline.py "astradial: pipecat-flow/gateway/pipeline.py"
[A11]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/api/src/jobs/ticketsFromCallLogsScheduler.js "astradial: api/src/jobs/ticketsFromCallLogsScheduler.js"
[A12]: https://github.com/astradial/astradial/blob/3188ac5ff87b43cb8489b493a35d959b74c17e16/workflow-engine/package.json "astradial: workflow-engine/package.json"
[M1]: ../../server/services/voiceCall.service.js "mediqzy: server/services/voiceCall.service.js"
[M2]: ../../server/routes/voice-assistant.route.js "mediqzy: server/routes/voice-assistant.route.js"
[M3]: ../../client/src/hooks/useLiveKit.tsx "mediqzy: client/src/hooks/useLiveKit.tsx"
[M4]: ../../server/routes/omnichannel-journey.route.js "mediqzy: server/routes/omnichannel-journey.route.js"
[M5]: ../../server/routes/recording.route.js "mediqzy: server/routes/recording.route.js"
[M6]: ../../server/services/hospital-crm-communication-hub.service.js "mediqzy: server/services/hospital-crm-communication-hub.service.js"
[M7]: ../../server/services/support-chat-provider.service.js "mediqzy: server/services/support-chat-provider.service.js"
[M8]: ../../docs/integrations/ROCKETCHAT_RETIREMENT.md "mediqzy: docs/integrations/ROCKETCHAT_RETIREMENT.md"
[M9]: ../../server/services/ai-brain/llm-provider.js "mediqzy: server/services/ai-brain/llm-provider.js"
[M10]: ../../server/utils/phi-masker.js "mediqzy: server/utils/phi-masker.js"
[M11]: ../../server/services/ai-brain/rag-pipeline.js "mediqzy: server/services/ai-brain/rag-pipeline.js"
[M12]: ../../server/services/hospital-crm-worldclass.service.js "mediqzy: server/services/hospital-crm-worldclass.service.js"
[M13]: ../../server/services/chatwoot-bridge.service.js "mediqzy: server/services/chatwoot-bridge.service.js"
[M14]: ../../server/services/ai-brain/sentiment-classifier.service.js "mediqzy: server/services/ai-brain/sentiment-classifier.service.js"
[M15]: ../../server/routes/roadmap-intelligence.route.js "mediqzy: server/routes/roadmap-intelligence.route.js"
[M16]: ../../server/routes/nursing-ipd.route.js "mediqzy: server/routes/nursing-ipd.route.js"
[M17]: ../../server/routes/tts.route.js "mediqzy: server/routes/tts.route.js"
[M18]: ../../server/middleware/team.middleware.js "mediqzy: server/middleware/team.middleware.js"
[M19]: ../../server/models/chat.model.intelligent.js "mediqzy: server/models/chat.model.intelligent.js"
[M20]: ../../server/routes/hospital/practice.route.js "mediqzy: server/routes/hospital/practice.route.js"
[M21]: ../../server/app.js "mediqzy: server/app.js"
[M22]: ../../server/services/crm-campaign-dispatcher.service.js "mediqzy: server/services/crm-campaign-dispatcher.service.js"
[M23]: ../../server/routes/voiceConfig.route.js "mediqzy: server/routes/voiceConfig.route.js"
<!-- END GENERATED SOURCE REFERENCES -->
