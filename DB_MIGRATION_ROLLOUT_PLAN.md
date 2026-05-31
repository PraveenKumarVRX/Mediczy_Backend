# DB Migration Rollout Plan

Date: 2026-05-31
Project: Mediczy hospital SaaS platform
Scope: Apply and validate backend DB migrations without disturbing current production flow or data.

## Goal

Roll out the new database capabilities safely:

- RLS tenant/PHI isolation
- DB-level FTS triggers
- Table partitioning support
- HNSW vector indexes
- Official AI agent run tables
- Patient allergy/medication/condition junction tables
- Anonymous patient and consent tables
- UUID shadow migration support

This plan is intentionally staging-first. Do not apply these migrations directly to production without first proving them on a production-like staging clone.

## Migration Files

Run these from repo root:

```bash
server/db/migrations/020-row-level-security-phi.sql
server/db/migrations/021-fts-triggers.sql
server/db/migrations/022-table-partitioning.sql
server/db/migrations/023-hnsw-vector-index.sql
server/db/migrations/024-ai-agent-runs-official.sql
server/db/migrations/025-normalise-array-fields.sql
server/db/migrations/026-anonymous-patients-consent.sql
server/db/migrations/030-uuid-shadow-migration.sql
```

Recommended order:

```text
024-ai-agent-runs-official.sql
021-fts-triggers.sql
025-normalise-array-fields.sql
026-anonymous-patients-consent.sql
023-hnsw-vector-index.sql
030-uuid-shadow-migration.sql
022-table-partitioning.sql
020-row-level-security-phi.sql
```

Reason: apply additive tables/indexes first, keep RLS last because it can affect reads immediately if app DB session context is wrong.

## Pre-Rollout Rules

- Do not run on production first.
- Do not run during peak traffic.
- Do not run RLS migration until staging validates `app.current_org_id`, `app.current_user_id`, and admin bypass behavior.
- Do not run UUID cutover blocks. `030-uuid-shadow-migration.sql` contains shadow/backfill support only; any primary-key cutover must be a separate later release.
- Do not run `npm audit fix --force` as part of DB rollout.

## Environment Setup

Use separate env files for staging and production. Keep credentials out of git.

Example staging env file: `/tmp/mediczy-db-staging.env`

```bash
export PGHOST='staging-db-host'
export PGPORT='5432'
export PGDATABASE='mediczy_ai_staging'
export PGUSER='mediczy_helper'
export PGPASSWORD='replace_me'
export PGSSLMODE='require'
```

Example production env file: `/tmp/mediczy-db-prod.env`

```bash
export PGHOST='prod-db-host'
export PGPORT='5432'
export PGDATABASE='mediczy_ai'
export PGUSER='mediczy_helper'
export PGPASSWORD='replace_me'
export PGSSLMODE='require'
```

Load the selected environment:

```bash
source /tmp/mediczy-db-staging.env
psql -v ON_ERROR_STOP=1 -c 'SELECT current_database(), current_user, now();'
```

## Backup Plan

### Option A: AWS RDS Snapshot

Use this if production PostgreSQL is RDS.

```bash
aws rds create-db-snapshot \
  --db-instance-identifier mediczy-prod-db \
  --db-snapshot-identifier mediczy-prod-pre-migration-$(date +%Y%m%d%H%M%S)
```

Wait until snapshot is available:

```bash
aws rds wait db-snapshot-available \
  --db-snapshot-identifier mediczy-prod-pre-migration-YYYYMMDDHHMMSS
```

Restore that snapshot into a staging DB instance before testing.

### Option B: Logical Backup With pg_dump

Use this if you manage PostgreSQL directly.

```bash
source /tmp/mediczy-db-prod.env
mkdir -p /tmp/mediczy-db-backups
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=/tmp/mediczy-db-backups/mediczy-prod-pre-migration-$(date +%Y%m%d%H%M%S).dump \
  "$PGDATABASE"
```

Restore into staging:

```bash
source /tmp/mediczy-db-staging.env
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname="$PGDATABASE" \
  /tmp/mediczy-db-backups/mediczy-prod-pre-migration-YYYYMMDDHHMMSS.dump
```

## Staging Migration Execution

Run from repo root:

```bash
cd /home/ubuntu/Mediczy
source /tmp/mediczy-db-staging.env
```

Create a migration audit table in staging:

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migration_audit (
  id BIGSERIAL PRIMARY KEY,
  migration_name TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL DEFAULT current_user,
  notes TEXT
);
SQL
```

Apply additive migrations first:

```bash
psql -v ON_ERROR_STOP=1 -f server/db/migrations/024-ai-agent-runs-official.sql
psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migration_audit (migration_name) VALUES ('024-ai-agent-runs-official.sql') ON CONFLICT DO NOTHING;"

psql -v ON_ERROR_STOP=1 -f server/db/migrations/021-fts-triggers.sql
psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migration_audit (migration_name) VALUES ('021-fts-triggers.sql') ON CONFLICT DO NOTHING;"

psql -v ON_ERROR_STOP=1 -f server/db/migrations/025-normalise-array-fields.sql
psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migration_audit (migration_name) VALUES ('025-normalise-array-fields.sql') ON CONFLICT DO NOTHING;"

psql -v ON_ERROR_STOP=1 -f server/db/migrations/026-anonymous-patients-consent.sql
psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migration_audit (migration_name) VALUES ('026-anonymous-patients-consent.sql') ON CONFLICT DO NOTHING;"

psql -v ON_ERROR_STOP=1 -f server/db/migrations/023-hnsw-vector-index.sql
psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migration_audit (migration_name) VALUES ('023-hnsw-vector-index.sql') ON CONFLICT DO NOTHING;"

psql -v ON_ERROR_STOP=1 -f server/db/migrations/030-uuid-shadow-migration.sql
psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migration_audit (migration_name) VALUES ('030-uuid-shadow-migration.sql') ON CONFLICT DO NOTHING;"
```

Partitioning migration requires extra care. On tables with existing data, use the shadow-table guidance in the file instead of blindly replacing current tables.

```bash
psql -v ON_ERROR_STOP=1 -f server/db/migrations/022-table-partitioning.sql
psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migration_audit (migration_name, notes) VALUES ('022-table-partitioning.sql', 'Verify generated partitioned tables before production') ON CONFLICT DO NOTHING;"
```

Apply RLS last in staging:

```bash
psql -v ON_ERROR_STOP=1 -f server/db/migrations/020-row-level-security-phi.sql
psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migration_audit (migration_name, notes) VALUES ('020-row-level-security-phi.sql', 'RLS enabled; validate tenant isolation immediately') ON CONFLICT DO NOTHING;"
```

## Staging Validation Checklist

### 1. Basic Schema Checks

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT migration_name, applied_at FROM schema_migration_audit ORDER BY applied_at;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'ai_agent_runs',
    'ai_api_keys',
    'ai_user_agent_grants',
    'patient_allergies',
    'patient_medications',
    'patient_conditions',
    'anonymous_patients',
    'patient_consents',
    'patient_consent_history',
    'uuid_id_map'
  )
ORDER BY table_name;
SQL
```

Expected: all listed tables exist.

### 2. FTS Trigger Validation

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN ('users_fts_trigger', 'doctors_fts_trigger', 'hospitals_fts_trigger')
ORDER BY table_name::text;

SELECT COUNT(*) AS users_with_search_vector
FROM users
WHERE search_vector IS NOT NULL;
SQL
```

Functional test on a safe staging-only row:

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE users
SET "firstName" = "firstName"
WHERE id = (SELECT id FROM users LIMIT 1);

SELECT id, search_vector IS NOT NULL AS has_search_vector
FROM users
ORDER BY id
LIMIT 1;
ROLLBACK;
SQL
```

### 3. RLS Policy Validation

Pick real staging IDs:

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT id, organization_id, role, "firstName", email
FROM users
WHERE organization_id IS NOT NULL
ORDER BY organization_id, id
LIMIT 20;
SQL
```

Set test variables manually. Replace values before running:

```bash
export TEST_ORG_A='1'
export TEST_ORG_B='2'
export TEST_USER_A='100'
```

Tenant A should only see allowed rows:

```bash
psql -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT set_config('app.current_org_id', '$TEST_ORG_A', true);
SELECT set_config('app.current_user_id', '$TEST_USER_A', true);
SELECT set_config('app.is_platform_admin', 'false', true);

SELECT COUNT(*) AS visible_users_for_org_a
FROM users;

SELECT COUNT(*) AS leaked_org_b_users
FROM users
WHERE organization_id = $TEST_ORG_B;
ROLLBACK;
SQL
```

Expected: `leaked_org_b_users = 0` unless your policy intentionally allows null/shared rows.

Platform admin should see rows across orgs:

```bash
psql -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT set_config('app.current_org_id', '0', true);
SELECT set_config('app.current_user_id', '0', true);
SELECT set_config('app.is_platform_admin', 'true', true);

SELECT COUNT(DISTINCT organization_id) AS orgs_visible_to_admin
FROM users
WHERE organization_id IS NOT NULL;
ROLLBACK;
SQL
```

Expected: multiple orgs visible if staging has multi-org data.

### 4. HNSW Index Validation

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'medical_embeddings'
  AND indexname LIKE '%hnsw%'
ORDER BY indexname;
SQL
```

Expected: HNSW index rows exist. If `medical_embeddings` is large, confirm build duration and no lock impact before production.

### 5. UUID Shadow Validation

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'users' AS table_name, COUNT(*) AS rows, COUNT(uuid_id) AS uuid_rows FROM users
UNION ALL
SELECT 'doctors', COUNT(*), COUNT(uuid_id) FROM doctors
UNION ALL
SELECT 'appointments', COUNT(*), COUNT(uuid_id) FROM appointments;

SELECT entity_type, COUNT(*)
FROM uuid_id_map
GROUP BY entity_type
ORDER BY entity_type;
SQL
```

Expected: `uuid_rows = rows` for each table, and `uuid_id_map` has matching mappings.

### 6. App Flow Validation In Staging

Run these from the app UI or API client:

- Patient login works.
- Doctor login works.
- Admin login works.
- Patient can view own profile and appointments.
- Doctor can view permitted patient/appointment data.
- Cross-tenant data does not appear.
- Appointment booking works.
- Appointment cancellation/reschedule works.
- Prescription flow works.
- Lab order flow works.
- Insurance claim flow works.
- AI chat writes an `ai_agent_runs` row.
- Search still returns users/doctors/hospitals.

## RLS Application Validation

The RLS middleware is code-ready, but routes that use raw `pg` should wrap RLS-protected queries with:

```js
await req.withRlsTransaction(pool, async (client) => {
  return client.query('SELECT * FROM users WHERE ...');
});
```

Routes that use Sequelize transactions should call:

```js
await req.setSequelizeRlsContext(transaction);
```

Staging validation must confirm critical routes use the correct request context before enabling RLS in production.

## Worker Smoke Tests

Build/start side processes only in staging first.

```bash
cd /home/ubuntu/Mediczy/server
node --check workers/index.js
node --check config/queues.js
```

Start worker with PM2 in staging:

```bash
pm2 start ecosystem.config.cjs --only mediczy-worker
pm2 show mediczy-worker
pm2 logs mediczy-worker --lines 80
```

Queue validation from Node:

```bash
cd /home/ubuntu/Mediczy/server
node --input-type=module <<'NODE'
import { dispatchEmergencyAlert, getAllQueuesStats } from './config/queues.js';

await dispatchEmergencyAlert({
  userId: 1,
  patientName: 'Staging Smoke Patient',
  alertType: 'TRIAGE_SMOKE_TEST',
  severity: 'test',
  orgId: 1,
  metadata: { smoke: true, source: 'DB_MIGRATION_ROLLOUT_PLAN' }
});

console.log(await getAllQueuesStats());
process.exit(0);
NODE
```

Expected:

- Worker process stays online.
- Emergency job is accepted.
- API process remains unaffected.
- No repeated Redis/BullMQ connection errors.

## NestJS Runtime Smoke Tests

Build first:

```bash
cd /home/ubuntu/Mediczy/nestjs-app
npm run prisma:generate
npm run build
```

Start NestJS in staging on port `8001`:

```bash
cd /home/ubuntu/Mediczy/server
pm2 start ecosystem.config.cjs --only mediczy-nestjs
pm2 show mediczy-nestjs
pm2 logs mediczy-nestjs --lines 80
```

Smoke endpoints:

```bash
curl -i http://127.0.0.1:8001/api/docs
curl -i http://127.0.0.1:8001/auth/login
```

If auth routes are prefixed differently by deployment proxy, test the internal route and then the proxy route separately.

Expected:

- NestJS process starts.
- Express process remains online.
- NestJS does not bind to Express port.
- No unhandled Prisma/JWT/Redis startup exceptions.

## Production Rollout

Only proceed after staging passes.

### Step 1: Backup Production

Use RDS snapshot or `pg_dump` from the backup section.

### Step 2: Put Monitoring In Watch Mode

Before migrations:

```bash
pm2 list
pm2 logs mediczy-server --lines 80
pm2 logs mediczy-worker --lines 80
```

Database health:

```bash
source /tmp/mediczy-db-prod.env
psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT now(), count(*) FROM pg_stat_activity;
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;
SQL
```

### Step 3: Apply Additive Migrations First

```bash
cd /home/ubuntu/Mediczy
source /tmp/mediczy-db-prod.env

psql -v ON_ERROR_STOP=1 -f server/db/migrations/024-ai-agent-runs-official.sql
psql -v ON_ERROR_STOP=1 -f server/db/migrations/021-fts-triggers.sql
psql -v ON_ERROR_STOP=1 -f server/db/migrations/025-normalise-array-fields.sql
psql -v ON_ERROR_STOP=1 -f server/db/migrations/026-anonymous-patients-consent.sql
psql -v ON_ERROR_STOP=1 -f server/db/migrations/023-hnsw-vector-index.sql
psql -v ON_ERROR_STOP=1 -f server/db/migrations/030-uuid-shadow-migration.sql
```

### Step 4: Delay High-Risk Changes If Needed

Treat these as separate production releases if data volume is high:

```bash
server/db/migrations/022-table-partitioning.sql
server/db/migrations/020-row-level-security-phi.sql
```

Recommended production approach:

- Partitioning: run after reviewing table sizes and shadow-table strategy.
- RLS: run after confirming every RLS-protected access path sets DB context.

### Step 5: Production Smoke Tests

Immediately after each migration batch:

```bash
pm2 list
pm2 logs mediczy-server --lines 80
```

Run app/API checks:

- Login as patient.
- Login as doctor.
- Login as admin.
- Book a test appointment.
- Load patient appointments.
- Load doctor appointments.
- Run a user/doctor search.
- Trigger a non-critical AI chat.
- Confirm no 500-rate spike.

Database checks:

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT COUNT(*) FROM ai_agent_runs;
SELECT COUNT(*) FROM patient_allergies;
SELECT COUNT(*) FROM patient_medications;
SELECT COUNT(*) FROM patient_conditions;
SELECT COUNT(*) FROM anonymous_patients;
SELECT COUNT(*) FROM patient_consents;
SQL
```

## Rollback Plan

### Rollback Decision Points

Stop and rollback if any of these happen:

- Login failures spike.
- Appointment booking fails.
- Patient/doctor dashboards return empty data unexpectedly.
- Cross-tenant data appears.
- API 500s spike after migration.
- PostgreSQL CPU/locks stay elevated.
- Worker causes Redis instability.

### Fast Rollback: App Process

If only worker/NestJS is causing issues:

```bash
pm2 stop mediczy-worker
pm2 stop mediczy-nestjs
pm2 restart mediczy-server
```

This does not roll back DB changes but removes new side-process impact.

### Fast Rollback: RLS Only

If RLS causes empty reads or access failures, disable RLS while preserving schema:

```bash
source /tmp/mediczy-db-prod.env
psql -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ehrs DISABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE vital_signs DISABLE ROW LEVEL SECURITY;
ALTER TABLE lab_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_claims DISABLE ROW LEVEL SECURITY;
ALTER TABLE health_readings DISABLE ROW LEVEL SECURITY;
ALTER TABLE family_members DISABLE ROW LEVEL SECURITY;
SQL
```

Then restart API:

```bash
pm2 restart mediczy-server
```

### Fast Rollback: FTS Triggers

If FTS triggers cause write failures:

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
DROP TRIGGER IF EXISTS users_fts_trigger ON users;
DROP TRIGGER IF EXISTS doctors_fts_trigger ON doctors;
DROP TRIGGER IF EXISTS hospitals_fts_trigger ON hospitals;
SQL
```

### Fast Rollback: HNSW Index

If HNSW index causes performance/build issues:

```bash
psql -v ON_ERROR_STOP=1 <<'SQL'
DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_hnsw_cosine_idx;
DROP INDEX CONCURRENTLY IF EXISTS medical_embeddings_ns_hnsw_idx;
SQL
```

### Full Rollback: Restore Backup

Use only if data correctness is compromised.

RDS:

- Restore the pre-migration snapshot to a new instance.
- Point app config to restored DB after validation.
- Keep old DB for forensic review.

Logical backup:

```bash
source /tmp/mediczy-db-prod.env
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname="$PGDATABASE" \
  /tmp/mediczy-db-backups/mediczy-prod-pre-migration-YYYYMMDDHHMMSS.dump
```

## Final Go / No-Go Checklist

Go only if all are true:

- Staging was restored from production-like data.
- All migrations applied successfully in staging.
- RLS tenant isolation tests passed.
- Patient, doctor, admin, appointment, search, lab, insurance, and AI flows passed.
- Worker smoke tests passed.
- NestJS runtime smoke tests passed.
- Production backup exists and has been verified.
- Rollback owner and rollback commands are ready.
- Production rollout window is low-traffic.

No-go if any are true:

- RLS returns empty data for valid users.
- Cross-tenant leakage appears.
- HNSW index fails on staging.
- Partitioning strategy is unclear for existing large production tables.
- Backup restore process has not been tested.

## Recommended Rollout Strategy

Use three production releases:

1. Additive DB release:
   - `024`, `021`, `025`, `026`, `023`, `030`
2. Side-process release:
   - `mediczy-worker`
   - `mediczy-nestjs`
3. Enforcement release:
   - `020` RLS
   - `022` partitioning only after table-size review and shadow migration plan

This keeps current production flow stable while new capabilities are introduced behind validation gates.
