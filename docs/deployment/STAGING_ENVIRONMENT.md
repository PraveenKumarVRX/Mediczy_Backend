# Staging environment (WP-0.6)

**Status: planned and configured, not provisioned.** This document and `ecosystem.staging.config.js`
/ `server/.env.staging.example` are ready to use; the actual one-time host/DNS/database setup below
has not been done — it's real AWS infrastructure, which is out of scope for this agent to create on
its own (standing rule: code and runbooks only). A human (or a future session with the right
permissions) does the steps under "One-time setup."

## Why staging didn't exist before this

`ecosystem.staging.config.js` existed already but pointed at `server/index.js` and `server/worker.js`
— neither file exists (the real entrypoints are `start-wrapper.cjs` / `worker-wrapper.cjs`), and
`server/.env.staging.example` used `DATABASE_URL`/`DB_HOST` variable names the app never reads
(`server/db/pgPool.js` reads `POSTGRES_*`). Both were leftover templates from before the current
app shape and would not have actually started the server. Both are fixed now; provisioning is what's
left.

## Two ways to stand it up

### Option A — same EC2 host, different port (cheap, fast, some shared blast radius)

Runs a second copy of the app on the same box as production, on a different port, proxied by a
second nginx server block for `staging.mediqzy.com`. Good enough for "does this branch behave
correctly against real data shapes" testing; NOT isolated from production's CPU/memory/disk.

1. **Second checkout**: `git clone git@github.com:MySmartHealth/Mediczy.git /home/ubuntu/Mediczy-staging`
   (matches `STAGING_HOME` in `ecosystem.staging.config.js`).
2. **Database**: on the same RDS instance, `CREATE DATABASE mediczy_staging;` and a dedicated role
   (`CREATE ROLE mediczy_staging_helper LOGIN PASSWORD '...';` then grant it ownership the same way
   `mediczy_helper` owns tables in prod — see `docs/deployment/OFFSITE_BACKUP_IAM.md` for the pattern
   of a non-superuser app role). **Never point staging at `mediczy_prod`.** Run every migration under
   `server/migrations/` and `server/db/migrations/` against `mediczy_staging` once, in the same
   dependency order they were applied to production (check each migration's own comments/filename
   ordering), to bring it to the same schema shape.
   - Seed data: either restore a redacted copy of a production backup (strip PHI — this is a real
     compliance decision, not a technical one, make it deliberately) or run any `server/scripts/`
     seed/demo scripts this repo already has for hospital-OS demo data.
3. **Env file**: `cp server/.env.staging.example /home/ubuntu/Mediczy-staging/server/.env.staging`,
   fill in real values — a **separate** `JWT_SECRET`, a **separate** Razorpay test-mode key pair
   (never live keys), and the `POSTGRES_*` values from step 2.
4. **nginx**: a new server block for `staging.mediqzy.com` (copy `/etc/nginx/sites-available/mediczy`'s
   structure) with `root /home/ubuntu/Mediczy-staging/client/dist` and `proxy_pass http://localhost:8100`
   (or whatever `STAGING_PORT` is set to) in place of `8888`. Get a cert for the subdomain (certbot,
   same as the other `*.mediqzy.com` subdomains already configured).
5. **DNS**: an A/CNAME record for `staging.mediqzy.com` pointing at the same EC2 instance.
6. **Build + start**: `cd /home/ubuntu/Mediczy-staging/client && npm ci --include=dev && npm run build`,
   then `cd .. && pm2 start ecosystem.staging.config.js && pm2 save`.
7. **Deploy from CI (optional)**: add a `staging` branch and a workflow mirroring
   `.github/workflows/deploy-with-checks.yml` but targeting `/home/ubuntu/Mediczy-staging` and
   `ecosystem.staging.config.js` — or use `ecosystem.staging.config.js`'s own `deploy.staging` block
   with `pm2 deploy ecosystem.staging.config.js staging setup` / `pm2 deploy ... staging`.

### Option B — separate EC2 instance (real isolation, real cost)

Same steps as Option A, but on its own (smaller/cheaper) instance, with its own RDS instance too
(or the same RDS instance but still its own database, if the extra RDS cost isn't justified yet).
This is the version worth moving to once staging gets used for anything load-sensitive, or once a
bad staging deploy has actually caused a production resource problem under Option A.

## What staging is for once it exists

- Running a schema migration against it before running it against production — this is the main
  practical payoff and worth having even in the cheapest Option A form.
- A place to point a `[deploy-prod]`-style manual trigger at before the real one, once a
  `staging` deploy workflow exists (see step 7).
- Manual QA / demo walkthroughs without touching real patient data.

It is not, by itself, a substitute for the local socket-DB `verify-*.mjs` scripts this repo already
uses for RLS/tenant-isolation testing (`scripts/testing/verify-*.mjs`) — keep running those; staging
is for schema and cross-service integration checks those scripts can't cover (real S3/CloudFront,
real nginx routing, real subdomain cookies).
