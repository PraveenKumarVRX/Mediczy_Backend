# Controlled Rollout Plan: Expand-Contract (Staging First)

Date: 2026-05-31
Owner: Platform + DB + API
Status: Ready for staged execution

## Guardrails

1. Freeze non-rollout schema changes until rollout validation completes.
2. Take a fresh production snapshot before any production migration.
3. Restore production snapshot into staging clone (mask PHI if staging is not fully secured).
4. Never run first on production.

## Migration Order (Staging First)

Apply in this exact order:

1. 020-row-level-security-phi.sql
2. 021-fts-triggers.sql
3. 022-table-partitioning.sql
4. 023-hnsw-vector-index.sql
5. 024-ai-agent-runs-official.sql
6. 025-normalise-array-fields.sql
7. 026-anonymous-patients-consent.sql
8. 030-uuid-shadow-migration.sql

## Staging Execution Script

Use the staging-only runner:

```bash
export ROLLOUT_ENV=staging
export TARGET_DB=mediczy_ai_migration_staging
export PGHOST=localhost
export PGPORT=5432
export PGUSER=mediczy_helper
export PGPASSWORD='<staging_password>'

# Optional backup guardrails
# export BACKUP_ARTIFACT_PATH=/tmp/your-backup.dump
# export BACKUP_CHECKSUM_PATH=/tmp/your-backup.dump.sha256

bash scripts/db/controlled-rollout-staging.sh
```

Safety behavior:

- Refuses production-like targets (`mediczy_ai`, RDS hostnames) unless `ALLOW_PROD_BYPASS=true` is explicitly set.
- Requires `ROLLOUT_ENV=staging`.
- Fails on first migration error (`ON_ERROR_STOP=1`).

## App Flow Validation (Staging)

Validate all before production:

1. patient login
2. doctor login
3. appointment booking
4. patient records
5. prescriptions
6. lab orders
7. insurance claims
8. AI chat
9. admin dashboards

## RLS Validation (Staging)

Confirm policy correctness:

1. user from hospital A cannot see hospital B records
2. patient sees only own records
3. doctor sees only allowed org/patient records
4. platform admin can see all
5. unauthenticated queries fail or return no data

## Worker Smoke Tests (Staging)

1. BullMQ worker starts cleanly
2. emergency queue accepts test job
3. normal email/notification/report queues work
4. worker restart does not affect API

## NestJS Sidecar Smoke (Staging)

Start NestJS on port 8001 alongside Express and validate:

1. /auth/login
2. /users
3. /appointments
4. /ai-brain

Ensure Express remains unchanged for live traffic.

## Production Rollout (After Staging Green)

1. Apply low-risk additive migrations first.
2. Run `CREATE INDEX CONCURRENTLY` during low traffic windows.
3. Keep Express as main API.
4. Keep NestJS side-by-side without live routing first.
5. Do not enforce strict RLS globally until middleware/session context is validated.

## Critical Warning

Do not enable RLS blindly in production.

If `app.current_org_id` / `app.current_user_id` are not set consistently, valid application queries may return zero rows.

## Lowest-Risk Rollout Pattern

1. Add new tables, columns, indexes, triggers.
2. Backfill data.
3. Run app with old and new structures side-by-side.
4. Verify reads/writes.
5. Only then enforce RLS, cut over, and retire old paths.
