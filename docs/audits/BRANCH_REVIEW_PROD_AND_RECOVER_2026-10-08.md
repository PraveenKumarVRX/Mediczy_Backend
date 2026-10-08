# Review of the unmerged `prod` and `recover/care-intelligence-mesh` branches

Reviewed 2026-10-08 against `main` @ d9ec6795 (fork points: `prod` 2026-06-20, `recover/...` 2026-07-06; `main` is 520-720 commits ahead of both).
Neither branch can be merged or rebased wholesale: `git merge-tree` reports conflicts in `app.js`, `admin.route.js`, `llm-provider.js`, `whatsapp-production.route.js`, the socket/doctor client files and others, and main has since re-implemented several of the same features differently.

## Ported to main (this change)

| From | What | Why safe |
|---|---|---|
| prod | `aggregator-auth.route.js`: `auditLoginAttempt(req, userId, email, success, msg)` | main passed an object where the helper takes positional args, so aggregator login/registration audit rows were wrong |
| prod | `doctor-settings.route.js`: Google-verified-location check only on the false -> true transition | main blocked any save (e.g. slot duration) while in-person was already enabled |
| prod | `health-intelligence.route.js`: tolerant JSON extraction, JSON mode | pure parsing hardening; `responseFormat` is already supported by main's llm-provider |
| recover | `clinicalPortalPaths.ts`: hospital-only screens (`command-center`, `beds/map`, `emar`, `echart`, `ai-ops`) link to `/hospital/*` | portalClinicalRoutes mounts them only under /hospital, so the doctor/nurse links 404ed. Test added |
| recover | socket.io `transports` polling-first (5 call sites) | Cloudflare fails the WS upgrade over HTTP/2 on this domain (diagnosed 2026-07-05). **Valid only while `mediczy-server` runs as one process**; more instances need sticky sessions or a Redis adapter |

## Not ported, with reasons

### prod branch
| Cluster | Disposition | Reason |
|---|---|---|
| `server/config/env-validator.js` dotenv change | **Reject** | loads `server/.env` with `override: true` in production, so a stray file would override SSM/PM2 environment |
| `minio-upload.service.js` AV fail-closed | **Ported 2026-10-08** | ClamAV is now running (signatures refreshed, daemon and freshclam enabled at boot); the port also adds `--fdpass`, which the branch lacked. `AV_SCAN_FAIL_OPEN=true` is the emergency override |
| `doctor.enhanced`/`user.route` confirm-upload checks, profile bucket split, oauth-profile-picture to MinIO | **Hold** | needs `S3_PROFILE_BUCKET` created and `s3:ListBucket` granted first. Auto-creating buckets on `NoSuchBucket` is not appropriate for prod |
| `hmis-tenant-guard.js`, `hmis-security-guard.js` | **Reject as written** | `set_config(..., false)` is session-scoped on a pooled connection and leaks tenant context to the next request; RLS is not FORCEd. Needs `set_config(..., true)` inside a transaction (`withRlsTransaction`) |
| GPU scheduler, `cognitive_tier` routing (`brain.py`, `sib_app.py`, `llm-provider`), `ai-gpu-metrics`, embedding service | **Ported 2026-10-08, off by default** | the nodes are remote iSHA endpoints, not on this host. Scheduler behind `AI_GPU_SCHEDULER_ENABLED`; SIB tier routing defaults to the current node1-first behaviour. Both endpoints returned 502/530 when ported. `medical-entity-extractor`, the BullMQ document queue and the direct-provider `TIER_PROVIDERS` mapping were not ported |
| `ai-brain.route.js` async document queue | **Hold** | changes the upload response to 202 and depends on the queue above; clients expect the synchronous result |
| Personal health assistant (`personal-health-assistant*`, `health-program-engine`, migration) | **Port later** | additive, but tables need the migration applied by hand, and main already has `health-programs` + `health-coaching-framework`; needs a decision on overlap. Coaching output touches clinical escalation (`program_escalation_log`) so classify under SaMD first |
| WhatsApp copilot (589 lines), prod `whatsapp-production.route.js` | **Superseded (verified)** | main's `whatsapp-sib-brain` + agentic booking + user context + emergency detection cover search/booking/appointments, on the Gupshup path |
| Kiosk wayfinding | **Reimplemented 2026-10-08** | this was NOT superseded: main's endpoint was a hardcoded keyword table that invented directions, and the page sent no device token. Now answers only from admin-configured floor maps of the device's own organization |
| OT proctoring video | **Fixed 2026-10-08** | main's page posted to `/api/display/kiosk/video-session`, which does not exist. It now uses the existing `/api/display/video/sessions`; a tenant-scoped subscribe-only observer endpoint was added. The branch's `ot-proctor.route` trusted a client-supplied `hospitalId` and was not ported |
| Display CMS + `ringFencing` entries | **Hold** | no client on main uses it |
| `proposeFineTuning` / `approveFineTuning` (governance wrapper) | **Port when training infra exists** | correctly routed through `proposeChange` -> `approveChange`; useless without the LoRA scripts and cluster |
| Team coupon / lab management UIs, `coupon.route.js` +368 | **Review separately** | main's coupon route changed in 7 commits since the fork |
| Fine-tuning and MinIO migration scripts | **Hold** | one-off ops tooling tied to the hosts of June 2026 |

### recover/care-intelligence-mesh
| Cluster | Disposition | Reason |
|---|---|---|
| Doctor sidebar HealthOS entry | **Superseded** | main's `doctorNav.config.ts` already has it |
| Care Intelligence Mesh registry, department agents, readiness service | **Needs governance** | agent roster describes clinical agents; CLAUDE.md requires model card + quality gate + confidence + explanation for anything influencing a clinical decision |
| `ai-drug-interaction.service.js` duplicate-therapy and renal-dosing rules | **Needs governance** | diagnostic/decision-support output (Class IIb-III); needs `qualityGates`, `computeConfidenceScore`, an explanation, a gate-log row and a medical-director review. Also queries `lab_results` with a bare patient id |
| careos / ADT / ICU / discharge / hospital-os service edits, Kafka consumers | **Needs rebase by owner** | 48 modified files across services main has since changed; conflicts in `adt.service`, `clinical-workspace.service` |
| `FamilyCareUpdates.tsx` | **Port later** | additive UI, depends on the careos family-portal service edits above |

## Follow-up the same day (2026-10-08, later)

- **OT remote-expert console built.** Hospital OS > Telepresence now lists the hospital's live OT proctoring sessions and lets a specialist join subscribe-only (`GET /api/display/video/sessions/ot-proctor/active`, `POST .../observer`). The room list is in memory, so it is valid only while the API runs as one process.
- **Floor map is no longer fabricated.** `/api/display/floor-map` builds nodes only from the hospital's own configured floors (Hospital OS > Wayfinding, now with `x,y | capacity | zone` per department). Occupancy comes from real sources only: ER and OPD from today's queue entries, OT from the organization's own `ot_rooms`; everything else shows "No live count". The previous version invented the layout and counts (e.g. Ward 3B = 18), read ICU occupancy from an `icu_beds` table that does not exist in production, and read `ot_rooms` across all tenants.
- **CORS headers** for the phlebotomy app added (`server/config/cors.config.js`). The origin of a web build is still a deployment setting (`CORS_ORIGIN`).
