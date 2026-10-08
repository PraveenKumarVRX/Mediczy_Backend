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
| `minio-upload.service.js` AV fail-closed, `doctor.enhanced`/`user.route` confirm-upload checks, profile bucket split, oauth-profile-picture to MinIO | **Hold** | `clamav-daemon` is inactive on this host; fail-closed would return 503 for every upload. Needs ClamAV running, `S3_PROFILE_BUCKET` created and `s3:ListBucket` granted first. Auto-creating buckets on `NoSuchBucket` is not appropriate for prod |
| `hmis-tenant-guard.js`, `hmis-security-guard.js` | **Reject as written** | `set_config(..., false)` is session-scoped on a pooled connection and leaks tenant context to the next request; RLS is not FORCEd. Needs `set_config(..., true)` inside a transaction (`withRlsTransaction`) |
| GPU scheduler, embedding service, entity extractor, document queue, `llm-provider`/`cognitive-router`/`brain.py` tier routing, `ai-gpu-metrics` | **Needs owner** | rewrites every LLM call path (main's llm-provider has had 16 commits since the fork) and assumes the 3090/3060 nodes. Port only against a confirmed GPU topology, behind a flag, with the SaMD gates in CLAUDE.md |
| `ai-brain.route.js` async document queue | **Hold** | changes the upload response to 202 and depends on the queue above; clients expect the synchronous result |
| Personal health assistant (`personal-health-assistant*`, `health-program-engine`, migration) | **Port later** | additive, but tables need the migration applied by hand, and main already has `health-programs` + `health-coaching-framework`; needs a decision on overlap. Coaching output touches clinical escalation (`program_escalation_log`) so classify under SaMD first |
| WhatsApp copilot (589 lines), prod `whatsapp-production.route.js` | **Superseded** | main has moved to the Gupshup/Chatwoot provider path (ef4dc2cb); would need a rewrite onto `whatsapp-production.service` |
| Display CMS / wayfinding / OT-proctor backends + `ringFencing` entries | **Hold** | main's kiosk pages call `/api/display/kiosk/*`, a different API; prod's routes serve nothing that main's client uses |
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
