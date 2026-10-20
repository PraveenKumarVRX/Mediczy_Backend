# Contact Center API

Implementation: 2026-10-20. Exotel-first source; live provider activation pending. See [delivery status and runbook](../deployment/CONTACT_CENTER_EXOTEL_2026-10-20.md).

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
