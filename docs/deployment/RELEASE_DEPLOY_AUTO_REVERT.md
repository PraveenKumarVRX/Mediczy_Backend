# Production deploy: real health-check gate + automatic revert (WP-0.6)

## What changed and why

Before this change, `scripts/deploy/deploy-full-prod-s3.sh`'s health check was
`curl -sf ... || curl -sf ... || true` — the trailing `|| true` meant a failed health check was
silently swallowed and **never failed the deploy**. Nothing ever reverted, because nothing ever
reliably detected failure in the first place. The GitHub Actions workflow had its own,
separate health check that *did* fail the job, but by then the broken code was already live on
the server with no rollback step.

What's true now:

1. **The health check actually gates the deploy.** `deploy-full-prod-s3.sh` retries the local
   health endpoint 5 times (4s apart) and, if it's still unhealthy, treats that as a real failure.
2. **Any failing step reverts automatically** — not just the health check. Dependency install,
   the CRM migration, the client build, the S3 upload, the PM2 restart, or the health check
   itself: any of them failing resets the code to the commit that was live before this run,
   reinstalls that commit's server dependencies, restarts PM2 on it, and (unless `SKIP_S3=true`)
   restores the previous `index.html` to S3 and invalidates CloudFront for it. See the script's
   own header comment for the bash mechanics (a bare `exit 1` inside an `if` does **not** trigger
   bash's `ERR` trap — a real gotcha — which is why every guard calls a `fail()` helper instead of
   exiting directly).
3. **The client no longer has to build on the box serving live traffic.** A new GitHub Actions
   job (`build-client`) runs `vite build` on its own runner, uploads the result as a workflow
   artifact, and the deploy job `scp`s it to the server as `/tmp/client-dist.tar.gz`. The deploy
   script picks it up via `CLIENT_DIST_ARCHIVE=/tmp/client-dist.tar.gz` and skips its own on-host
   build entirely. Running `deploy-full-prod-s3.sh` directly on the server without that variable
   still works exactly as before (on-host build) — nothing about manual/local deploys changed.
4. **The demo QA login reset no longer runs on every production deploy.** `npm run fix:lab-login:ssm`
   was previously step 2 of every automatic deploy; it's now a manual command
   (`cd server && npm run fix:lab-login:ssm` on the host) — a QA convenience reset has no reason
   to run against production on every push.
5. **`secrets.SERVER_HOST` is now required.** The workflow no longer falls back to a hardcoded
   production IP (`13.127.125.93`) baked into version control — set the `SERVER_HOST` repository
   secret, or the deploy job fails immediately with a clear "secret not set" error instead of
   silently deploying to whatever IP happens to be committed.
6. **A rollback step covers the one thing the on-host script can't see**: a check that only runs
   *after* the script already exited 0 — the workflow's public HTTPS health check and CRM
   contract check, which can fail for reasons localhost never sees (CloudFront, the ALB, DNS). The
   deploy script records the commit that was live before it ran, in `.deploy/last-good-sha` on the
   server; if the public check fails, the workflow SSHes back in and runs
   `scripts/deploy/rollback.sh`, which resets to that recorded commit, reinstalls, restarts, and
   restores S3's `index.html`.

## What is NOT covered

- **Database migrations are never auto-rolled back.** They're additive-only by project convention
  (new tables/columns, not destructive changes), so a revert of the *code* after a migration ran
  is safe — the new columns/tables just go unused by the reverted code — but if a migration itself
  is the problem, that needs a human decision, not a blind rollback of shared production data.
  Both the automatic revert and `rollback.sh` print a reminder of this on every use.
- **This is not the "immutable release directories + symlink swap" pattern** some deploy setups
  use (`releases/<timestamp>/`, a `current` symlink, nginx/PM2 pointing at the symlink). That
  would be more robust still, but it means changing how nginx and PM2 reference the code on the
  live host — a real one-time cutover this agent could not execute or test (no production-deploy
  permission in this session) and did not want to design blind. What's here — reset-to-previous-
  commit plus a kept previous `index.html` for S3 — needed no host topology change at all and was
  possible to reason through and unit-test the bash control flow for with confidence. If release
  directories are wanted later, treat this document as the place to record that follow-up.

## Verifying it

This was written and had its bash control flow (the `trap`/`fail()`/subshell-propagation pattern)
exercised in an isolated sandbox — see the commit that introduced it for the reasoning — but the
**script has not been run against the actual production host or the real GitHub Actions runner**
(this session has no production-deploy permission). Before trusting it on a real push:

1. Dry-run the branch-protection-adjacent parts first: `bash scripts/deploy/deploy-full-prod-s3.sh --skip-s3`
   on the host by hand during a low-traffic window, and watch it complete normally end to end.
2. Deliberately break something small (e.g. temporarily rename `scripts/deploy/verify-crm-api-contract.sh`
   so that step fails) and confirm `do_revert` actually runs, the previous commit comes back, and
   PM2 ends up healthy again — then restore the file and re-run for real.
3. Trigger the GitHub Actions workflow once via `workflow_dispatch` on a non-critical change and
   watch the `build-client` → `scp` → `deploy` → health-check chain end to end before relying on
   `[deploy-prod]` auto-triggering off a normal push.
4. Confirm `SERVER_HOST`, `SERVER_USER` and `SSH_PRIVATE_KEY` are set as repository secrets —
   the workflow now fails fast (rather than silently deploying to the wrong host) if `SERVER_HOST`
   is missing.

## Manual rollback

```bash
# On the production host, roll back to whatever deploy-full-prod-s3.sh last recorded as good:
bash scripts/deploy/rollback.sh

# Or to an explicit commit:
bash scripts/deploy/rollback.sh <git-sha>

# From your own machine with the SSH key:
bash scripts/deploy/rollback.sh --remote [<git-sha>]
```
