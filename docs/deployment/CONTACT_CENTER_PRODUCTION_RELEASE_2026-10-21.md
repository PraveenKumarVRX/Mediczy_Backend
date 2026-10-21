# Contact-center production release — 21 October 2026

Deployed to **https://app.mediqzy.com** on 21 October 2026, approximately 07:13 IST. The user explicitly requested merging to main, deployment, a production build, sanity checks and smoke tests.

## Release and main

- Main was already synchronized with `origin/main`. The remaining communications changes were committed and pushed as `eac39773`, followed by webhook-denial and release-check fixes in **`a9c04f65a0ac506bf84d384b2c2657eb34f71734`**.
- Backend: `/home/ubuntu/mediqzy-releases/contact-center-20261021-01/server`, activated as the existing PM2 `mediczy-server`. The parent is `/home/ubuntu/mediqzy-releases/nursing-20261019-09-mobile-auth`. The package preserves the running baseline and overlays 80 explicitly reviewed, committed files; unrelated dirty clinical/database/AI edits were excluded.
- Frontend: isolated build from `eac39773`; `a9c04f65` makes no client changes. Built assets were published to the existing Nginx origin and `s3://app.mediqzy.com`. CloudFront distribution `E1UX9F7HUS472M` was invalidated. Both origins retain old hashed assets for existing browser sessions. The public entry-point hash matches the reviewed build.
- Database: the 22-table administrator migration/hardening completed against the active encrypted private Multi-AZ RDS instance. It was preceded by a successful rollback rehearsal and encrypted snapshot **`pre-contact-livekit-20261021-0140`**, verified available before apply. Existing voice tables were present; apply reasserted the idempotent schema/ownership/RLS contract. No clinical migrations, patient seeding or old-database reactivation occurred.
- PM2 now also runs `mediqzy-contact-stt`, `mediqzy-contact-bot` and `mediqzy-contact-center-worker` from the isolated release. The two media workers registered with the existing LiveKit project; their health servers bind to loopback ports 8871/8872. The job worker initially allows only the existing active demo tenant linked to Smart Hospital, canonical tenant `11`. PM2 state was saved with private dump permissions.

The release manifest is stored beside the isolated release, and sanitized hashes/results are in [production verification](../testing/CONTACT_CENTER_PRODUCTION_VERIFICATION_2026-10-21.json). Private detailed evidence and the preceding frontend entry point are under `/home/ubuntu/contact-center-release-evidence/20261021`, outside the served checkout. Do not publish process dumps, credential stores or that directory.

## Configuration and availability

Existing LiveKit, Groq and ElevenLabs secret-store configuration was reused. New SecureString parameters contain the public control-API base, worker HMAC secret and demo-only tenant allowlist. Existing provider secrets and staff credentials were not rotated. No phone trunk/number, paid infrastructure stack, patient consent or clinical privileges were manufactured.

The deployed CRM console supports native browser media, private coaching, hold/resume, transfer, redacted continuous STT, reception-bot dispatch, campaign/journey management and guarded voice-identity screens. Workers are registered and available for appropriately consented, authorized sessions. Draft campaign creation alone cannot dial recipients.

**Deployment does not establish clinical or biometric acceptance.** PSTN needs approved Exotel references or a tenant-bound LiveKit SIP trunk/caller ID. Signed project webhooks must be configured before an operational native-call pilot; no existing project webhook settings were changed by this release. The private speaker inference service, approved TLS/KMS configuration and a representative anti-spoof/recognition evaluation remain separate activation requirements. Biometric results never independently authorize login or patient access. No PSTN calls or real human/patient biometric enrollments were performed during these checks.

## Verification

| Check | Result |
|---|---|
| Server regression, including contact-center, privacy, nursing fences and mobile authentication | 141 tests / 15 suites passed; the later explicit webhook-denial assertion also passed in the 14-test native suite |
| Frontend, native media hook, dialer and nursing session/routes | 27 tests passed |
| Python audio/worker/evaluation contracts | 9 tests passed |
| Disposable PostgreSQL isolation, migration, concurrency, campaigns and biometrics | 54 checks passed |
| Isolated production frontend build | Passed, 1m 41s; existing chunk-size/dependency warnings |
| Existing general sanity and source smoke scripts | Exit 0; these are source/configuration checks, not full platform functional acceptance |
| Post-deploy runtime/API smoke | 14 passed, including real authenticated reads for existing active demo CRM staff, all 22 RLS/ownership checks, unscoped denial and invalid signature/invitation denial |
| Public HTTP/entry point/assets and Smart-Force login validation | 14 passed; app and marketing-host team login return JSON 400 for an empty request rather than 405/HTML |
| Authenticated CRM browser | 5 passed: console, LiveKit workspace, campaigns, guarded biometrics and mobile dialer; zero page errors |
| Existing nursing browser access | 3 passed; protected screens require login, with no layout overflow or page errors |
| Real existing-project LiveKit audio | 6 passed: audio both directions, private coaching received only in coaching room, caller isolation, hold and resume |
| Dedicated workers | Online, zero restarts, LiveKit registration confirmed, no worker errors in inspected logs |

A pre-deploy smoke check found invalid LiveKit signatures surfacing as HTTP 500. The transport now maps verification failures to HTTP 403 `INVALID_SIGNATURE`; a regression assertion and real post-deploy request verify the fix.

Authenticated smoke checks used short-lived signed access tokens for an **existing active demo CRM account with its stored role**, followed by the real API's user-status/tenant/role checks. Password login credentials and stored staff roles were not changed. Browser checks did not initiate calls, capture microphones, enroll speakers or publish campaigns. Nursing checks did not sign in or access patient records.

## Repeat and rollback

From the reviewed checkout with existing AWS permissions:

```sh
node server/scripts/qa/contact-center-release-smoke.mjs \
  --base https://app.mediqzy.com --evidence /tmp/contact-center-live.json
node client/scripts/contact-center-live-browser.mjs /tmp/contact-center-browser.json
node server/scripts/qa/livekit-contact-media.mjs /tmp/contact-center-media.json
```

These scripts fetch only their required configuration in memory and exclude credentials from output. The real media harness creates isolated temporary rooms, uses generated audio, and removes those rooms/tokens during cleanup. Run mutation-heavy legacy field-operation smoke scripts only against explicitly approved fixtures; they are not part of this release's live checks.

If rollback is necessary, use the prior nursing activation helper to restore the retained parent backend, then restore the saved preceding `frontend-previous-index.html` to the Nginx origin and S3 and invalidate CloudFront. Keep all hashed assets and the current encrypted database. Stop only the new media dispatch workers if reverting their API behavior; preserve controlled retention processing for any stored voice data. Do not drop audit/schema tables or restore an older database over subsequent clinical writes. Retain private evidence and verify health, authentication and nursing access after rollback.

The older [source closure record](CONTACT_CENTER_LIVEKIT_CLOSURE_2026-10-20.md) remains the implementation/activation reference. This document supersedes its statement that the application/schema/workers had not been deployed; provider and human/model acceptance gates remain explicit.
