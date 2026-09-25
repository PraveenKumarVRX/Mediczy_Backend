# Audit remediation — rollout runbook (2026-09-26)

State: code is on `main` (`99f1b6ef`), **production still runs `3941b30d`.** Nothing below has been done yet.
Do the steps **in order**; each one is safe to stop after.

## 0. Restore the server dependencies (blocking)
`/home/ubuntu/Mediczy/server/node_modules` is currently a self-referential symlink (see the audit doc, §10).
```
cd /home/ubuntu/Mediczy/server && rm node_modules && npm ci --omit=dev --prefer-offline
ls node_modules/@aws-sdk/client-ssm      # must exist
```
(The deploy script's own step 2 also runs `npm ci --omit=dev`, but do this first so steps 1–3 can run.)
For running tests you additionally need dev dependencies: `npm ci` (no `--omit`).

## 1. Verify before touching production (optional but recommended)
```
cd server && npm test -- --forceExit                  # compare to main: no new failures
sudo -u postgres createdb ...                         # disposable local DB; see scripts/qa/phase1-audit-regression.mjs header
npm run test:phase1-audit-regression                  # 61 checks, non-superuser role
```

## 2. Apply migration 3 to the production database (BEFORE the code restarts)
Adds the balance trigger, `revoked_by/revoked_at`, the UHID sequence. Additive and idempotent. Launching it through
`ssm-env-loader.mjs` directly silently does nothing (its `argv[1]` guard) — import `up()` from a wrapper and **verify**:
```
cat > server/_m3.mjs <<'X'
import { up } from './migrations/20260926000003-audit-remediation.migration.js'; await up(); console.log('m3 applied'); process.exit(0);
X
NODE_ENV=production AWS_REGION=ap-south-1 SSM_PARAM_PATH=/mediczy/prod node server/scripts/ssm-env-loader.mjs server/_m3.mjs; rm server/_m3.mjs
# verify: tenant_entitlements.revoked_by exists, patient_uhid_seq exists, trigger trg_finance_lines_balanced exists
```

## 3. Force row-level security on the phase-1 tables (FIN-10)
```
NODE_ENV=production AWS_REGION=ap-south-1 SSM_PARAM_PATH=/mediczy/prod \
  node server/scripts/ssm-env-loader.mjs server/scripts/ops/force-rls-phase1.mjs --check    # inspect
  node server/scripts/ssm-env-loader.mjs server/scripts/ops/force-rls-phase1.mjs            # apply
```
Every code path already sets the tenant context, and this was shown safe in a rolled-back transaction. Rollback:
`ALTER TABLE <t> NO FORCE ROW LEVEL SECURITY;`

## 4. Deploy
The client archive must be a build of the current `main` from a **clean checkout** (never `git add -A` there):
```
git worktree add --detach /home/ubuntu/build-release main && ln -s /home/ubuntu/Mediczy/client/node_modules /home/ubuntu/build-release/client/node_modules
# build inside a memory-capped scope (peak ~4.6 GB) and package, keeping old chunks with times preserved:
#   vite build --outDir dist-out ; cp -np <live>/assets/* dist-out/assets/ ; tar -czf /tmp/client-dist.tar.gz -C dist-out .
CLIENT_DIST_ARCHIVE=/tmp/client-dist.tar.gz SKIP_S3=true bash scripts/deploy/deploy-full-prod-s3.sh
```
The script records the live commit for auto-revert, stashes a dirty tree (it now lists the files), health-gates, and
reverts on failure. Restore any stash with `git stash apply <sha>` — never a bare pop.

## 5. Smoke test (read-only in effect)
```
NODE_ENV=production AWS_REGION=ap-south-1 SSM_PARAM_PATH=/mediczy/prod \
  node server/scripts/ssm-env-loader.mjs server/scripts/qa/audit-smoke.mjs
```
Expect 100% PASS. It checks anonymous refusal on every new route, the tenant-less token 403, role gates (MRD, discharge,
triage), the discharge packet scoping, danger-zone up-triage, and finance failing closed — with synthetic tokens for a
tenant that does not exist and only requests that are rejected before any write.

Also confirm: `GET /api/health` 200, `https://app.mediqzy.com` loads, `pm2 jlist` shows all apps online, and
`journalctl`/`logs/mediczy-server-error.log` has no new stack traces since the restart.

## 6. Then merge the cron-guard branch
`audit/remediation-2026-09-25` (`229ce542`) guards 16 more cron callbacks. Run
`npm test -- cron-lease-wiring cron-single-flight`, then merge and reload. It changes when scheduled jobs run, so
watch `logs/` for `[cron] skipping …` lines for the first day.
