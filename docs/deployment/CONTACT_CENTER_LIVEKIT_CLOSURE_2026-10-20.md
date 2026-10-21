# Contact center: LiveKit implementation and release status

Date: 2026-10-20. This record supersedes the **source implementation** status of advanced media, streaming STT, reception bots, voice campaigns and biometric enrollment/verification in the [initial delivery](CONTACT_CENTER_EXOTEL_2026-10-20.md). It does not close production activation, clinical acceptance or biometric model validation. The original repository comparison and earlier verification record remain historical evidence.

## Delivered implementation

| Requested area | Implemented behavior | Verification and remaining acceptance |
|---|---|---|
| Advanced media | Reuses existing LiveKit credentials; native browser caller invitations; separate primary/coaching rooms; assigned-agent joins; supervisor listen, private whisper and barge; server-enforced caller hold/resume; transfer, bot interruption and hangup; expiring room grants and one-hour session cleanup | Real synthetic audio traversed the existing LiveKit project. Caller received agent audio; agent received coaching audio; caller had no coaching-room subscription. Hold/resume permissions were verified. Hospital microphone/headset, reconnect and network failure acceptance remains. |
| Continuous STT | Independent caller/agent audio subscriptions, VAD-driven recognition using the existing Groq Whisper provider, speaker labels from actual participants, segment timestamps/revisions, redaction before persistence and broadcast, live transcript UI and final-segment jobs | Actual worker functions and audio contracts tested with injected STT results. Whisper produces utterance finals; word-by-word provider interim results and latency/medical-language accuracy are **not** established. Live STT provider acceptance remains. |
| Reception voice bot | Existing LiveKit Agents stack plus Groq STT/ElevenLabs TTS; hospital-approved FAQ retrieval; evidence-checked output; AI disclosure, speech interruption, signed interrupt commands, human handoff and durable callback fallback | Worker control, failure fallback, handoff, consent and cited replies tested. Default SDK text forwarding is disabled; only the observer's backend-redacted transcripts are broadcast. No autonomous diagnosis, prescribing, patient lookup or identity authentication tools. Audible provider/end-to-end bot acceptance remains. |
| Campaigns and journeys | Existing CRM identities and latest documented voice marketing consent; separate transcription consent for bots; quiet hours, suppression, explicit draft/publish/pause, assigned agent availability, bounded attempts, shared CRM communication history, canonical outcome reconciliation and atomic voice journey enqueue | Real PostgreSQL checks cover delivery, duplicate enqueue, consent withdrawal, quiet hours, agent race and ambiguous provider failures. Real destination calls remain disabled until a hospital/provider mapping and approved test destination are supplied. |
| Biometrics | Fresh spoken challenges; three distinct enrollment captures; pinned local SpeechBrain ECAPA inference; backend cosine similarity; challenge transcription; tenant/identity-bound KMS encryption; revocation and expiry/consent withdrawal cleanup; restricted staff UI; optional pinned anti-spoof model and held-out evaluation tool | Real CPU encoder returned 192 finite dimensions on a generated non-speech tone. This establishes model loading/inference only. No recognition accuracy, spoof resistance or authentication acceptance is claimed. Every response returns `authenticationAllowed: false`; secondary verification is always required. |

Code entrypoints: [media service](../../server/services/contact-center/media-service.js), [LiveKit transport](../../server/services/contact-center/livekit.js), [STT/bot worker](../../server/isha-agent/contact_center_worker.py), [campaign service](../../server/services/contact-center/campaigns.js), [biometrics](../../server/services/contact-center/biometrics.js), [model service](../../server/voice-biometrics/service.py), [CRM voice workspace](../../client/src/pages/crm/ContactVoiceTools.tsx) and [API](../api/CONTACT_CENTER_API.md).

Eight new tables extend the original fourteen to **22**. All use forced tenant RLS, composite tenant references and the separate NOLOGIN schema owner. Runtime credentials do not own the tables. The administrator runner and runtime migration check both include the full set.

## Failure and privacy behavior

- Native browser voice does not require Exotel account credentials or a SIP trunk. PSTN calls require a server-controlled tenant-to-trunk/caller-ID mapping; caller requests cannot choose it.
- JWTs permit only a named room and microphone publication appropriate to the mode, expire after 120 seconds and grant no room administration. JWT expiry controls joining, not the lifetime of an already connected participant. Membership is bounded by the session's one-hour lifetime, and signed webhook processing removes revoked/rejoining members. Configure the webhook before enabling a tenant.
- Whisper publishes into a distinct coaching room. Switching modes revokes obsolete membership and removes the previous audio capability. Failed revocation is not reported as a successful mode change.
- Concurrent handoffs lock the canonical call assignment. Failed cleanup leaves an unknown media state and blocks new joins. Unknown origination/actions require operator review; they cannot trigger automatic redial. Hangup remains available to terminate an uncertain session. An unavailable human leaves a durable callback and keeps the caller connected.
- Project webhook retries reapply idempotent state/permission effects after an audit event has committed. Signed events for unrelated rooms are acknowledged without cross-tenant lookup or mutation; coaching-room departure cannot end the caller's primary room.
- Recording consent, transcription consent and marketing consent are separate. A recording is not enabled by campaign consent. No raw speaker audio is persisted by the model service. Existing text/recording retention also operates for native calls without an Exotel configuration.
- Voice identity is restricted by `contact_center:biometrics`. Caller-provided scores are rejected in both the new inference endpoint and the older roadmap endpoint. Templates have a separate KMS key and encryption context; encryption is not a substitute for model validation.

## Reproducible checks

Current results, exact source hashes and acceptance exclusions are in [the verification record](../testing/CONTACT_CENTER_LIVEKIT_VERIFICATION_2026-10-20.json). Earlier Exotel verification remains a separate snapshot.

From the repository root:

```sh
# Creates and removes its own disposable loopback PostgreSQL container.
VOICE_QA_EVIDENCE=/tmp/voice-db.json node server/scripts/qa/run-contact-center-tests.mjs

# Uses the existing LiveKit project with isolated temporary rooms and generated audio.
# No telephone calls, hospital identities or production database writes.
node server/scripts/qa/livekit-contact-media.mjs /tmp/voice-media.json

.venv/bin/python -m unittest discover -s server/isha-agent -p 'test_contact_center_worker.py' -v
```

The real media check requires the existing AWS SSM read permissions and Python RTC environment. Temporary tokens are mode-600 files and are deleted with the rooms in cleanup. Do not print token files or process environments.

The full frontend production build and focused frontend/server suites also pass; their commands and counts are recorded in the verification JSON. Build warnings about existing chunk sizes, stale Browserslist metadata and dependency directives are retained in the build log.

## Activation sequence

1. Package only the reviewed contact-center files on top of the current active release, preserving live hotfixes. The workspace also contains unrelated clinical/mobile/database changes. Install server dependencies from the reviewed lockfile; the speaker KMS client is now an explicit dependency. Use the existing frontend release workflow for the built assets.
2. Rehearse `server/scripts/ops/migrate-contact-center.mjs` with the exact active encrypted host from SSM and `--evidence`. The default transaction rolls back. This version passed a rollback-only rehearsal for all 22 tables. Persistent application requires an available encrypted recovery snapshot of that exact instance less than one hour old and explicit `--apply --snapshot`. Preserve new tables/events on application rollback.
3. Store `VOICE_PUBLIC_BASE_URL`, a generated SecureString `VOICE_INTERNAL_SECRET`, and the approved `VOICE_TENANT_UIDS` allowlist under the existing SSM prefix. Reuse `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GROQ_API_KEY` and `ELEVENLABS_API_KEY`. No second LiveKit project is needed. A processing consent reference must exist before requesting STT/bot dispatch.
4. Configure LiveKit project webhooks to the exact HTTPS `/api/contact-center/hooks/livekit/<tenantUid>` endpoint for each enabled tenant. The SDK verifies the signed raw `application/webhook+json` body. A shared project sends other-room events too; only matching tenant sessions are changed. The API also exposes narrowly scoped signed agent and single-use guest hooks.
5. Start the [existing contact-center job worker](../../infra/contact-center/worker.config.cjs) and the two dedicated [LiveKit workers](../../infra/contact-center/livekit-workers.config.cjs) with `VOICE_RELEASE_SERVER` pointing at the reviewed release. Their names are `mediqzy-contact-stt` and `mediqzy-contact-bot`. The launcher forwards only speech/control configuration to Python, not database or AWS credentials. Do not replace Dr Isha or video workers.
6. Assign approved active staff through existing contact-center administration. Verify available heartbeat, a browser invitation, audible caller/agent/coaching isolation, hold, transfer, interruption, consent refusal, duplicate events, revoked tokens and worker/provider failure. Use approved test staff and destinations; do not invent patient consent or clinical sign-off.
7. To enable telephone recipients, store `VOICE_LIVEKIT_BINDINGS` mapping the exact healthcare tenant UID to an approved `outbound_trunk_id` and E.164 `number`, or configure the previously delivered Exotel adapter. The mapping is not required for browser invitations. No SIP trunk, telephone number or paid PSTN call was provisioned by this implementation.
8. Provision the reviewed private storage/KMS template when enabling recordings/templates. It now has distinct recording and biometric keys, scoped runtime IAM and a `VoiceBiometricKMSKeyArn` output. AWS `validate-template` passed; no stack was created. Put output values into SecureString configuration and verify actual IAM/KMS/storage operations before capture.

## Isolated speaker model setup

Use a separate environment, preserving the running API/Dr Isha Python dependencies:

```sh
python3 -m venv /opt/mediqzy-speaker/venv
/opt/mediqzy-speaker/venv/bin/pip install -r server/voice-biometrics/requirements.txt
/opt/mediqzy-speaker/venv/bin/python server/voice-biometrics/prepare_model.py /opt/mediqzy-speaker/model
/opt/mediqzy-speaker/venv/bin/python server/scripts/qa/speaker-model-smoke.py \
  --artifact /opt/mediqzy-speaker/model --evidence /tmp/speaker-smoke.json
```

The [manifest](../../server/voice-biometrics/model-manifest.json) pins the official [SpeechBrain model](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb) revision and every loaded model/configuration artifact. Preparation verifies hashes; runtime loads the reviewed local directory and the launcher sets Hugging Face offline mode. The smoke checks a generated tone, not a person's identity.

Set `VOICE_MODEL_PYTHON`, model/config hashes and model directory from [environment.example](../../infra/contact-center/environment.example). Set a separate SecureString `VOICE_BIOMETRIC_SECRET`, `VOICE_BIOMETRIC_KMS_KEY`, and `VOICE_BIOMETRIC_URL=https://localhost:9447` for a same-host deployment. Install an approved TLS certificate with a localhost SAN and a private key accessible only to the service user; supply its paths through `VOICE_MODEL_TLS_CERT`/`VOICE_MODEL_TLS_KEY`. Configure the API's `NODE_EXTRA_CA_CERTS` to trust that CA. Never disable TLS verification. The [model PM2 configuration](../../infra/contact-center/speaker-model.config.cjs) binds only to `127.0.0.1:9447`, disables access logging and excludes database credentials. For a separate model host, use a private HTTPS endpoint with equivalent network isolation.

Model loading is lazy; run the offline smoke before starting the service. Real enrollment also requires Groq challenge transcription, KMS availability and current `voice_biometrics` consent for an existing CRM identity.

Optional anti-spoof input is a reviewed, hash-pinned TorchScript model with `[batch,samples]` input and `[spoof,bona_fide]` logits. Without it, liveness is false and results remain `review_required`. This implementation does not provide a validated anti-spoof model or fabricate a passed report.

For a consented held-out corpus, run `server/voice-biometrics/evaluate.py MANIFEST --audio-root ROOT --threshold THRESHOLD --output REPORT`. The tool checks corpus paths, rejects duplicate/identical audio comparisons, computes FAR/FRR/spoof acceptance plus Wilson 95% upper bounds, and refuses promotion without at least 5,000 impostor, 1,000 genuine and 1,000 spoof comparisons with the stated error bounds. Dataset independence, representative speakers/devices/languages and clinical/privacy approval still require review. Only a genuinely passed, model-matched report may populate `VOICE_BIOMETRIC_VALIDATION`. Even then, similarity is secondary evidence and never grants login or patient access.

## What remains open

This delivery completes the five requested source workstreams and their engineering checks. Live application/schema/worker activation, provider credentials/trunk mapping, approved staff/test destinations, real STT/TTS acceptance, infrastructure provisioning and hospital reviewers remain operational inputs. Acoustic/biometric quality and spoof evaluation remain validation work requiring real approved datasets. None is marked accepted merely because source or a synthetic test passed.

Broader CT items outside this request remain: PBX SIPREC ingress, provider-connected inbound IVR/overflow, acoustic sentiment evaluation, full multilingual redaction evaluation, richer consult/conference workflows and operational outage/performance acceptance. Native LiveKit WebRTC does not implement PBX SIPREC. See [LiveKit participant management](https://docs.livekit.io/home/server/managing-participants/), [telephony APIs](https://docs.livekit.io/reference/telephony/sip-api/) and [agent turns](https://docs.livekit.io/agents/logic/turns/).

Rollback: disable new tenant campaigns and dispatch, restore the preceding application release, stop only the dedicated voice workers, preserve audit tables and keep required retention processing active. Never replace live clinical data with an older database snapshot or re-enable the retired unencrypted database.
