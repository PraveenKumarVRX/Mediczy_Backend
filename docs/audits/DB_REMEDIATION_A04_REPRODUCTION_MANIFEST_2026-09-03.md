# A-04 Reproduction Manifest — Git Commit, Deployment Versions, PM2 Processes, Environment Keys, Migration Status

**Captured:** 2026-09-03, this session
**Workstream:** A — Immediate Containment and Evidence Preservation (per `POSTGRESQL_RDS_IMPLEMENTATION_PLAN_2026-09-01.md`, action A-04)
**Owner (per source plan):** SRE
**Method:** Read-only. No secret values captured. No database mutation. No AWS resource created or modified.
**Scope note:** This is a point-in-time reproduction manifest, not a fresh audit. It exists so a later restore/rollback/incident-response effort can answer "what was actually running, on what code, against what schema state" without guessing. It intentionally does not re-derive findings already in `POSTGRESQL_RDS_MICROAUDIT_2026-09-01.md` — it cites that document rather than repeating it, and flags where it's now two days stale relative to this capture.

---

## 1. Git state

| Field | Value |
|---|---|
| HEAD commit | `204334101af38cfb2950194838b728bbae5002cf` |
| Branch | `main` |
| Remote | `https://github.com/MySmartHealth/Mediczy.git` |
| Ahead/behind `origin/main` | 0 / 0 — HEAD is pushed, nothing local-only |

### Last 10 commits on `main`

```
20433410 fix(governance): use a valid change_type enum value ('feature_addition')
9a23a22f feat(governance): register the 5 Track B prompts for medical-director review [deploy-prod]
c78dbce3 feat: register 5 missing model cards; finish B2 (real-time push + role scoping) [deploy-prod]
5e3a73a0 fix(migrations): cast $1/$2 explicitly in specialty-module seed inserts [deploy-prod]
5b71ab10 chore: trigger production deploy for 970c3e08 [deploy-prod]
970c3e08 feat: specialty modules, audit/MRD/IAM/India-health, patient copilot, discharge+coding AI
81fbd1d2 fix(isha): restore doctor voice assistant fallbacks
d0c03cbf fix(video): recover active patient call notifications
df37719e fix(video): keep teleconsult participants in canonical room
b51d0274 Merge auth, OTP, and consultation production fixes
```

### Working tree at capture time

- 10 tracked files modified, not committed
- 16 untracked files/directories present
- These are **not** part of this manifest's reproducibility claim — HEAD is what's actually running (confirmed by PM2 `cwd` below pointing at this same checkout); the uncommitted files are known, separate in-progress work (corporate wellness/benefit-wallet — see the prior session's deploy discussion) that was deliberately excluded from every deploy this session.

## 2. Runtime versions

| Component | Version |
|---|---|
| Node.js | v22.21.0 |
| npm | 10.9.4 |
| `server/package.json` | 1.0.0 |
| root `package.json` | 1.0.0 |
| `client/package.json` | 0.0.0 |

## 3. PM2 process list

| Process | PID | Status | Restarts | Up since | Mode | cwd |
|---|---:|---|---:|---|---|---|
| pm2-logrotate | 600971 | online | 0 | 2026-09-02T06:55:07Z | fork | `~/.pm2/modules/pm2-logrotate` |
| mediczy-worker | 600982 | online | 0 | 2026-09-02T06:55:07Z | fork | `/home/ubuntu/Mediczy/server` |
| offline-scribe | 600988 | online | 0 | 2026-09-02T06:55:07Z | fork | `/home/ubuntu/Mediczy/offline_scribe` |
| feedback-intelligence | 600990 | online | 0 | 2026-09-02T06:55:07Z | fork | `/home/ubuntu/Mediczy/server` |
| n8n-server | 601003 | online | 0 | 2026-09-02T06:55:07Z | fork | `/home/ubuntu` |
| sib-fastapi | 601008 | online | 0 | 2026-09-02T06:55:07Z | fork | `/home/ubuntu/Mediczy/ai-engine/doctor_bot` |
| imaging-triage | 601012 | online | 0 | 2026-09-02T06:55:07Z | fork | `/home/ubuntu/Mediczy/infra/imaging/imaging-triage` |
| p125-backend | 601015 | online | 0 | 2026-09-02T06:55:07Z | fork | `/mnt/P125/node-backend` |
| p125-ai-service | 601016 | online | 0 | 2026-09-02T06:55:07Z | fork | `/mnt/P125/python-ai-service` |
| p125-pwa | 601022 | online | 0 | 2026-09-02T06:55:07Z | fork | `/mnt/P125/frontend-pwa` |
| p125-admin | 601023 | online | 0 | 2026-09-02T06:55:07Z | fork | `/mnt/P125/admin-dashboard` |
| **mediczy-server** | 936317 | online | 6 | 2026-09-03T07:24:39Z | **cluster, 1 instance** | `/home/ubuntu/Mediczy/server` |

**Notes:**
- `mediczy-server` is configured for cluster mode but is currently running exactly **1 instance** — no cross-worker duplication risk exists today for anything gated on `NODE_APP_INSTANCE === '0'` (cron jobs, the new command-center broadcast loop). This changes if instance count is ever scaled up; that gate exists for when it does, not for a problem that exists right now.
- 6 restarts on `mediczy-server` since 2026-09-02T06:55 — all 6 attributable to this session's own deploys (2 automatic on initial push, 4 manual `pm2 restart` after fixing migration/governance bugs caught in production logs). None were crash-restarts (`unstable restarts: 0` throughout).
- This PM2 process list is itself evidence for Workstream A: eleven separate long-running processes share this one box, several outside the `Mediczy` checkout entirely (`p125-*`, `n8n-server`). Any containment or maintenance action against `mediczy-prod` needs to account for what else is calling into the same database/Redis/box, not just the Mediqzy app process.

## 4. Environment configuration inventory (key names only — no values captured)

| File | Key count |
|---|---:|
| `server/.env` (active — points at `mediczy-prod` RDS) | 157 |
| `server/.env.production` | 75 |
| `server/.env.development` (points at local Postgres; credentials in this file did not work at time of testing — see below) | 64 |
| root `.env` | 48 |

**Finding, not previously documented:** `server/.env.development`'s configured local Postgres credentials (`mediczy_dev_user` / the password in that file) failed authentication when tested against the actual local Postgres 16 instance on this box during this session (`FATAL: password authentication failed`). The real local roles are `mediczy`, `mediczy_helper`, `p125`, `postgres` — none matching what `.env.development` specifies. **Practical effect: there is currently no working non-production database this checkout can reach.** Every migration and code change this session ran had production as its only reachable target. This is directly relevant to Workstream A/G1 — "safe staging" (Phase 1's own stated goal) does not currently exist in a working state on this box.

## 5. Migration status

- **77** migration files present in `server/migrations/`.
- **11** of those are actually wired into a runtime execution path (`initialization.controller.js`'s startup sequence, plus one — `audit-log-partitioning.migration.js` — invoked directly from `app.js` for a cron job): `ab-experiments`, `ai-prompt-versions`, `dicom-institution-patterns`, `mrd-module`, `patient-vitals`, `register-track-b-prompt-governance`, `specialty-module`, `specialty-prescriptions-expansion`, `ticket-sla`, `unified-feedback-signals`, `audit-log-partitioning`.
- **66** files exist on disk with no confirmed execution path found in this pass — consistent with, not a new contradiction of, the source microaudit's finding of a fragmented migration landscape (Sequelize models, Prisma models with no Prisma migrations, multiple SQL migration trees, an "incomplete unified runner"). This manifest does not claim those 66 are dead code — only that their execution path wasn't found via the two entry points checked here (`initialization.controller.js`, `app.js`). A canonical-migration-tool decision (Phase 2, per the source plan's Section 6.3) should resolve which of these 66 are live, superseded, or genuinely orphaned — that classification work is explicitly out of scope for A-04.
- The migration ledger table's actual row-level content (the microaudit's finding: "five entries and one recorded failure") was not re-queried for this manifest — re-confirming or updating that finding requires a live database query, which this manifest deliberately avoided in order to stay strictly read-only-by-construction (no query execution at all, not even read-only) for this specific containment-evidence task. If ledger row content is needed, that's a follow-up A-03 refresh action, not part of A-04.

## 6. What this manifest does not cover

- Secret values (by design — A-04 explicitly excludes them)
- AWS-side state (RDS config, snapshots, alarms — that's A-03/A-05/A-06, and A-03's baseline already exists in the 2026-09-01 microaudit, pending a refresh)
- Live migration ledger table contents (see Section 5)
- Anything about the other PM2 processes' own git/deploy state (`p125-*`, `n8n-server`, `sib-fastapi`, `imaging-triage`) beyond their process metadata above — those are separate codebases/deployments outside this repository's scope
