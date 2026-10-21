# Contact Center API

Implementation: 2026-10-20; API/frontend and dedicated workers deployed 2026-10-21. See the [production release](../deployment/CONTACT_CENTER_PRODUCTION_RELEASE_2026-10-21.md) for remaining provider/model acceptance gates. See the [initial delivery](../deployment/CONTACT_CENTER_EXOTEL_2026-10-20.md) and [LiveKit extension/activation record](../deployment/CONTACT_CENTER_LIVEKIT_CLOSURE_2026-10-20.md).

Base: `/api/crm/contact-center`, JSON, CRM Bearer JWT. Tenant UID and actor come exclusively from CRM authentication. A corporate login must resolve its owning healthcare tenant first. Capability `contact_center:read` is required throughout; changes require `contact_center:write`, and administration requires `contact_center:configure` (Business Head/admin).

| Method/path | Purpose |
|---|---|
| `GET /` | Tenant configuration/readiness, capabilities, agents, queues, last 100 calls, callbacks, flow versions and 24-hour provider metrics |
| `PUT /config` | Credential **reference**, approved ExoPhone, enable/record flags and retention days; enabled configuration must match server `VOICE_PROVIDER_BINDINGS` |
| `PUT /agents` | Assign active tenant staff ID, display name, E.164 agent phone, role, skills/languages and priority |
| `PATCH /presence` | Own `available`, `busy` or `offline` presence; busy/wrap-up guards apply; available agents require a heartbeat within two minutes |
| `POST /browser-session` | Rotate and return only own approved SIP subscriber credentials; `Cache-Control: no-store`; no management/account token returned |
| `PUT /queues` | Name, optional existing UUID, skills/languages, `wrap_seconds` and `timeout_seconds` |
| `POST /flows` | Save a validated graph version; `publish: true` selects the current version; provider routing must be connected separately |
| `POST /calls` | Explicit agent-first call; required `Idempotency-Key`; responds 202 with durable local call record |
| `GET /calls/:id` | Call, immutable events, redacted transcripts, reviewed/unreviewed artifacts and available recording IDs |
| `POST /calls/:id/reconcile` | Fetch canonical provider state; cannot redial an uncertain call |
| `POST /calls/:id/disposition` | Assigned-agent wrap-up after confirmed terminal state |
| `POST /calls/:id/actions` | Authorized media-gateway action; unavailable gateway returns 503, not simulated success |
| `POST /calls/:id/artifacts/:kind` | `summary`, `copilot`, `qa` draft from final segments and approved FAQ evidence |
| `POST /calls/:id/artifacts/:kind/review` | Record human reviewer and audit event |
| `POST /calls/:id/index` | Generate a model-labeled 768-dimensional embedding using existing embedding infrastructure |
| `POST /calls/:id/recording` | Import completed, consented provider recording into private KMS storage |
| `GET /recordings/:id/playback` | Audited private playback URL valid for 120 seconds; no-store response |
| `POST /recordings/expire` | Administrator retention processing; also runs automatically in the explicit tenant worker |
| `PATCH /callbacks/:id` | Claim/update/resolve owned callback; claims do not count as dial attempts |
| `POST /suppressions` | Tenant phone suppression with redacted reason |
| `GET /knowledge` | Published tenant FAQ entries |
| `PUT /knowledge` | Administrator save/publish/unpublish approved FAQ; `id`, `title`, `body`, `published` |
| `GET /search?q=...&mode=keyword` | Tenant-filtered full-text search of final redacted segments |
| `GET /search?q=...&mode=semantic` | Tenant/model-filtered nearest call embeddings and summary snippets |

Example call body (synthetic numbers only):

```json
{
  "to": "+919999999991",
  "transport": "phone",
  "record": false
}
```

`transport` is `phone` or `browser`. Optional `queue_id` requires a supervisor and selects an available qualified agent. Optional `callback_id` requires an in-progress callback owned by the caller and the exact stored recipient number; queue assignment is not allowed for that request. Each newly reserved callback call increments attempts once. Replaying the same idempotency key and body returns the same call; changing its body returns 409.

To request recording, set `record: true` and provide `consent: {"status":"granted","source":"written","evidence":"approved consent reference"}`. Sources are `verbal`, `written`, `existing_record`. Enabled tenant policy and configured private storage are also required. A checked client checkbox alone does not establish consent outside the recorded approved evidence. Inbound recording/consent capture is not automatically supplied by provider status import.

Provider call state: `submitting`, `unknown`, `queued`, `ringing`, `answered`, `completed`, `failed`, `busy`, `no-answer`, `canceled`. Terminal states do not regress under delayed callbacks. `provider_duration_seconds` comes from canonical provider details and must not be labeled talk time. An ambiguous provider outcome remains `unknown`, preserving the busy reservation until reconciliation or an operator investigation. No automatic redial is performed.

Errors have `{success:false,error,code}`. Common codes: `VOICE_NOT_CONFIGURED`/`VOICE_BINDING_REQUIRED`/`MEDIA_GATEWAY_NOT_CONFIGURED` (503), `NO_AVAILABLE_AGENT`/`IDEMPOTENCY_CONFLICT`/`CONSENT_REQUIRED`/`CALLBACK_SCOPE_MISMATCH` (409), `CALL_CONTENT_EXPIRED` (410), `INVALID_SIGNATURE` (403), `EVENT_REPLAY` (409), `PROVIDER_OUTCOME_UNKNOWN` (502). Use stable codes to show useful app feedback; do not expose raw provider credentials or response bodies.

Public hooks are the exact POST `/api/contact-center/hooks/exotel/:tenant` and `/api/contact-center/hooks/gateway/:tenant` paths. Exotel supplies a call SID pointer; the server refetches that call using the server-bound account. Gateway events use the signed contract in the runbook. They are not unauthenticated authority over call/tenant state.

## Native LiveKit voice, campaigns and biometrics

Source extension: 2026-10-20. See the [LiveKit release/acceptance record](../deployment/CONTACT_CENTER_LIVEKIT_CLOSURE_2026-10-20.md). These routes use the same CRM authentication, tenant derivation and JSON error envelope. LiveKit reuses the existing project; Exotel is not required for a browser session.

| Method/path | Capability and contract |
|---|---|
| `GET /media/readiness` | Read: `{livekit:boolean}` checks server configuration, not worker health or clinical acceptance |
| `POST /calls/livekit` | Write: required `Idempotency-Key`; `{to?,transcribe?:false,bot?:false,language?:"en",consent?}`; 202 durable call. Omit `to` for browser-only; PSTN uses the server-bound SIP trunk. STT/bot requires documented processing consent and worker signing configuration |
| `POST /calls/:id/media/join` | Write: `{mode:"agent"|"listen"|"whisper"|"barge"}`; assigned agent or assigned supervisor/admin for supervision. Returns `{primary,coaching,identity,expiresIn:120}`; each non-null connection is `{serverUrl,roomName,token,expiresIn}`. Whisper has no primary token |
| `POST /calls/:id/media/invite` | Assigned agent: single-use browser invite `{tenantUid,callId,invite,expiresIn:900}`. Use a URL fragment, not a query string or stored credential |
| `POST /calls/:id/media/actions` | Write: required action idempotency key; `{action:"hold"|"resume"|"hangup"|"interrupt"|"bot_handoff"|"transfer"|"listen"|"whisper"|"barge",targetAgentId?}`. Transfer/supervision requires assigned supervisor/admin; transfer target is a numeric staff ID string |
| `POST /calls/:id/media/reconcile` | Write: current participants and media state; unknown outcomes require operator review. It cannot redial or infer that a timed-out call never happened |
| `GET /voice-campaigns` | Configure: tenant campaigns with recipient/completed/unknown counts |
| `POST /voice-campaigns` | Configure: `{name,owner_id,transport:"livekit"|"exotel",bot?,identity_ids?,timezone?,open_time?,close_time?,days?,max_attempts?}`; creates draft, 201. Defaults Asia/Kolkata, 09:00–18:00, Mon–Sat, one attempt; maximum five. Identity IDs resolve to existing active CRM people with current documented voice marketing consent |
| `PATCH /voice-campaigns/:id` | Configure: `{status:"active"|"paused"}`; active explicitly enables worker delivery during campaign hours |
| `POST /biometrics/challenges` | Biometrics: `{identity_id,purpose:"enroll"|"verify"}`; one-use six-digit spoken challenge, 120-second expiry. Requires current `voice_biometrics` voice consent |
| `POST /biometrics/enrollments` | Biometrics: `{challenge_id,samples:[base64Wav1,base64Wav2,base64Wav3]}`; three distinct audible mono 16 kHz PCM16 WAV samples, 3–20 seconds each; 201 opaque enrollment metadata, 90-day expiry |
| `POST /biometrics/verifications` | Biometrics: `{challenge_id,enrollment_id,audio:base64Wav}`; model-computed score and verdict. Caller scores are rejected; `authenticationAllowed:false` and `secondaryVerificationRequired:true` always |
| `DELETE /biometrics/enrollments/:id` | Biometrics: revoke and remove encrypted template; audit metadata remains |

The dedicated `contact_center:biometrics` capability is restricted to Business Head/admin. Enrollment IDs or similarity results do not authorize access to any patient record. No endpoint returns raw speaker vectors or encrypted template material.

Worker-only operations use exact POST `/api/contact-center/hooks/agent/:tenant` with the existing timestamp/nonce/HMAC contract. Accepted operations are `bootstrap`, `transcript`, `bot_reply`, `handoff`, and bounded `diagnostic` codes. Clinical tool operations are rejected. Final transcript revisions cannot be replaced; returned/broadcast text is redacted. LiveKit transcription events feed the browser's live transcript display.

Exact POST `/api/contact-center/hooks/livekit/:tenant` requires the LiveKit SDK's signed Authorization token over the exact raw JSON body. Exact POST `/api/contact-center/hooks/guest/:tenant` requires `{callId,invite,consent:boolean}` and a valid unexpired single-use invite. Transcribed guest calls require affirmative processing consent. These narrowly scoped hooks do not accept tenant/actor overrides from CRM request bodies.

Existing growth journeys use `stepType:"message",channel:"voice",config:{campaign_id:"published-tenant-campaign-uuid"}`. Enqueue occurs inside the existing journey event transaction; its source key prevents duplicate delivery. Marketing/transcription consent and suppression are rechecked before each attempted call. Unknown outcomes are quarantined; unavailable-agent races defer without consuming a dial attempt.
