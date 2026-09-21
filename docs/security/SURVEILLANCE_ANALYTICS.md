# Camera vision analytics (Security module)

Per-camera vision analytics for the hospital CCTV estate, inside the Security portal at
`/security/camera-analytics`. Security and safety monitoring only: **not** a clinical or SaMD
component, and not a substitute for the fire alarm, patient monitoring or a guard's judgement.

## How it connects to the DVR and camera network

```
 cameras ──► DVR / NVR ──(LAN)──► edge agent ──(HTTPS, key)──► MediQzy cloud ──► vision model
 (RTSP/ONVIF)   (snapshot URL)   edge/surveillance-agent        /api/surveillance/edge   → events, alerts
```

A cloud server cannot open connections into a hospital LAN, so a small **edge agent** runs inside
the network and only makes outbound HTTPS calls. It reads still frames from the DVR, sends them for
analysis, forwards DVR alarms, and reports camera health. Cloud → hospital never happens.

| Piece | Where it lives | What it holds |
|---|---|---|
| Gateway key | Shown once in the portal; agent config | Only its sha256 hash is stored in the cloud |
| DVR login | Agent's local `config.json` (chmod 600) | **Never sent to the cloud** |
| Camera list, cadence, rules | MediQzy portal | Agent fetches it from `/edge/config` |
| Frames | Agent memory → cloud memory | **Not stored anywhere** (no image column exists) |
| Events, counts, frame log | Postgres, per hospital | Frame log trimmed after 30 days; events kept |

### Supported recorders
Snapshot over HTTP with Basic/Digest auth: Hikvision (`/ISAPI/Streaming/channels/{ch}01/picture`),
Dahua and CP Plus (`/cgi-bin/snapshot.cgi?channel=`), Axis. Any other ONVIF/RTSP device: set
`rtspUrlTemplate` (uses `ffmpeg`) or `snapshotPath` in the agent config. DVR-side alarms
(intrusion, line crossing, tamper, video loss) can be pushed to the agent's LAN listener
(`POST /alarm?token=…`) and appear as "DVR alarm" events without any cloud vision cost.

## Analytics per camera
Crowd or queue, area unattended, vehicle congestion, intrusion in a restricted area, after-hours
presence (needs a schedule, hospital-local time, may span midnight), person down, fire or smoke,
blocked exit, unattended object. Each rule has a severity and a repeat-alert cooldown.
Cost controls per camera: analysis interval (min 10 s) and a daily frame budget.

## Privacy rules (enforced in code)
1. **No face recognition, no identification.** The model is asked for counts and flags only.
2. **Frames are never stored.** Only counts, event text, and a frame log are kept.
3. **Clinical areas are blocked by default.** Cameras classed *clinical* (wards, ICU, theatres) run
   no analytics until a hospital administrator records a privacy review (who agreed and why).
   Reclassifying a camera clears its approval. Newly added cameras take a default from the area type.
4. **Frames go only to the on-premises / SIB vision provider** unless
   `SURVEILLANCE_ALLOW_EXTERNAL_VISION=true` is set on the server. With external vision on, frames
   showing people may be processed by Gemini/Groq — confirm this against your DPDP/privacy policy first.
   The portal shows a warning banner whenever it is enabled.
5. Staff verify an alert against the **DVR recording at the time shown**; the portal holds no image.

## Setup
1. Portal → Camera Analytics → *DVR & gateway setup* → **Add gateway** (administrator). Copy the key.
2. Copy `edge/surveillance-agent/` to a machine on the CCTV network (Node 18+; ffmpeg optional).
   Copy `config.example.json` to `config.json`; set the key, DVR addresses and a **view-only** DVR user.
3. Run `node agent.mjs --config config.json` under a service manager (systemd, PM2, NSSM).
4. Portal → **Add recorder** (assign the gateway), then *Cameras & analytics* → **Add camera**
   per channel (channel number must match the DVR), then **Analytics** → add rules.

`node agent.mjs --once` does a single pass (useful to test DVR reachability).

## Operating notes
- **Server vision provider (action needed on production).** With the privacy-safe default the server needs
  an on-premises vision provider (`ALLOW_DIRECT_AI_PROVIDERS` plus `ISHA_INC_URL`, `ISHA_INC_API_KEY` and
  `ISHA_INC_VISION_MODEL`/`ISHA_INC_VISION_ENABLED`, or a SIB vision route). Until then frames are answered
  `vision_unavailable`, the portal shows *Vision engine: Unavailable*, and no false results are produced.
- Rate: one analysis per camera per interval; 240 agent requests/min/gateway; frames up to ~3 MB.
- Deactivating a gateway revokes its key immediately.
- Turn the module off per hospital with the `surveillance` module flag.

## Verify
`scripts/testing/verify-surveillance.mjs` (local database only; see its header) covers access,
tenant isolation, key handling, privacy gating, the frame pipeline, DVR alarms, schedules, races,
purge, and runs the real agent against a mock DVR that requires HTTP digest authentication.
