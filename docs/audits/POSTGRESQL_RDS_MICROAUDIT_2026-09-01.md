# Mediczy PostgreSQL and AWS RDS Microaudit

**Audit date:** 2026-09-01 UTC  
**Report ID:** DB-RDS-AUDIT-2026-09-01  
**Audit type:** Read-only production architecture, security, integrity, performance, resilience, and operability review  
**Environment examined:** `mediczy-prod`, AWS `ap-south-1`, PostgreSQL 18.3  
**Overall assessment:** **Critical risk / remediation required before treating the platform as a resilient healthcare system of record**

No database rows, AWS resources, application files, or configuration values were changed. Data checks used catalog metadata and aggregate counts only; no PHI values were retrieved.

## 1. Executive summary

The production database is currently responsive and lightly loaded, but its safety properties are substantially weaker than the application and migration comments claim.

The most urgent issue is tenant isolation. Of 371 tables containing a recognizable tenant or organization key, 357 do not have RLS enabled. More seriously, RLS is disabled on `users` and `api_appointments` even though policies and `FORCE ROW LEVEL SECURITY` exist. Several API policies explicitly permit all rows when tenant context is absent. The API middleware sets a transaction-local context outside the transaction and then releases that connection, so the context is gone before route queries execute. Two other helpers issue parameterized `SET LOCAL ... = $1`, which PostgreSQL rejects with SQLSTATE `42601`. Finally, the shared application role can set `app.is_platform_admin=true` itself; a read-only proof showed visibility change from 0 to 691 appointments and from 0 to 66 prescriptions. RLS therefore does not constitute a trustworthy security boundary in its current design.

RDS has a second cluster of critical control gaps: storage and automated backups are unencrypted, the instance is single-AZ, deletion protection is off, storage autoscaling is not configured, Performance Insights and Enhanced Monitoring are off, no PostgreSQL log exports, CloudWatch alarms, or RDS event subscriptions exist, and no read replica or RDS Proxy exists. The endpoint is private and the security group is appropriately source-security-group restricted, which is positive.

Schema governance is also failing in production. There are 742 public tables, 459 estimated empty tables, 15,734 indexes, and 13,306 copies of the same `UNIQUE ("userId")` constraint on one empty table. The duplicate indexes occupy 104 MB on that table alone. The codebase has 140 Sequelize model files, 73 Prisma models but no Prisma migrations, 27 SQL files in one migration tree, roughly 100 migrations in another, route/service startup DDL, and an incomplete “unified” runner. The only shared migration ledger has five entries and one recorded failure.

Backups are succeeding daily, but recovery assurance is incomplete. RDS retains automated backups for 30 days and daily full logical dumps are reaching a private, versioned S3 bucket. However, the live dump is plain SQL compressed with gzip while the restore runbook uses `pg_restore`, which only accepts archive formats. The S3 lifecycle rule targets `postgres/` while actual backups are stored under `db/`, so the rule does not govern those backups. There is no Object Lock, cross-region replication, or evidence of a completed automated restore drill. Duplicate cron entries launch the same backup script at 02:00, and another cron entry points to a file that no longer exists.

### Risk scorecard

| Domain | Rating | Summary |
|---|---:|---|
| Tenant/PHI isolation | 1/10 | RLS coverage is 3.8% of tenant-key tables; context and bypass design are unsafe |
| Encryption and secrets | 2/10 | RDS and automated backups unencrypted; tracked credentials; partial field encryption |
| Availability and DR | 3/10 | Single-AZ, no deletion protection, no replica; backups exist but restore is unproven |
| Schema integrity | 3/10 | Constraint/index explosion, unvalidated FKs, orphan rows, competing schemas |
| Performance | 6/10 current, 2/10 governance | Present load is low, but index/pool/schema growth creates preventable future failure modes |
| Observability | 2/10 | No PI, Enhanced Monitoring, log exports, alarms, events, or statement statistics |
| Change management | 2/10 | Multiple migration systems, startup DDL, incomplete ledger, failed migration recorded |
| Overall | **3/10** | Immediate security and resilience remediation is warranted |

## 2. Scope and evidence

The audit covered:

- PostgreSQL system catalogs, roles, grants, RLS policies, constraints, indexes, table statistics, extensions, runtime settings, sessions, and aggregate integrity checks.
- AWS RDS instance, backups, subnet group, security group, maintenance state, monitoring configuration, snapshots, replicas, proxy inventory, and 14-day CloudWatch metrics.
- S3 backup bucket encryption, versioning, public access, lifecycle, replication, Object Lock, and recent backup objects.
- Application connection pools, tenant context middleware, ORM models, migrations, startup DDL, backup scripts, cron schedules, deployment configuration, and database documentation.

Important limits:

- This was not an application penetration test or a full query-by-query authorization review.
- No restore was executed because that would require a new isolated database and explicit change/cost authorization.
- Slow-query attribution was impossible because `pg_stat_statements` is not installed and PostgreSQL logs are not exported.
- Table row counts are PostgreSQL statistics estimates except where an explicit aggregate integrity count is stated.

## 3. Production facts at audit time

### RDS

| Property | Live value | Assessment |
|---|---|---|
| Engine | PostgreSQL 18.3, patch 18.3.R2 pending | Patch planning required |
| Instance | `db.t4g.medium` | Adequate for current load; burstable class merits monitoring |
| Storage | 100 GiB gp3, about 100 GB free | Ample space now |
| Storage autoscaling | Not configured | Risk of hard storage ceiling |
| Encryption | **Off** | Critical for PHI/PII risk management |
| Multi-AZ | **Off** | No synchronous standby/failover |
| Public access | Off | Good |
| Subnets | Default subnet group; all three subnets map public IPs | Endpoint remains private, but dedicated private DB subnets are preferable |
| Security group | Port 5432 only from two source security groups; no CIDR ingress | Good |
| Backup retention | 30 days | Good baseline |
| Deletion protection | **Off** | High-risk control gap |
| Manual snapshots | 0 | No durable change/cutover checkpoint |
| AWS Backup | No plans; RDS instance is not a protected resource | No independent managed backup policy |
| Read replicas | 0 | No read-scale or independent replica recovery path |
| RDS Proxy | None | Connection storms go directly to the instance |
| Performance Insights | Off | Diagnostic blind spot |
| Enhanced Monitoring | Off | Diagnostic blind spot |
| PostgreSQL log exports | None | Audit/incident blind spot |
| CloudWatch alarms | 0 for the DB instance | No automated threshold alerts |
| RDS event subscriptions | 0 | No event-driven operational notification |
| Database Activity Stream | Stopped | No database-level activity stream |
| IAM DB authentication | Off | Password-only application authentication |
| Tags | None | No ownership, environment, criticality, or cost attribution |

### PostgreSQL

| Metric | Live value |
|---|---:|
| Database size | 1,833 MB |
| Public tables | 742, including 5 partitioned parents |
| n8n tables | 53 |
| Estimated empty public tables | 459 |
| Public indexes | 15,734 |
| Total public index size | 710 MB |
| Foreign keys | 535 |
| FKs without a leading supporting index | 247 |
| Unvalidated constraints | 9 foreign keys |
| RLS-enabled public tables | 18 |
| Tenant-key tables | 371 |
| Tenant-key tables without RLS | 357 |
| PHI-candidate tables by column-name screen | 265; 249 without RLS |
| Nullable tenant/organization key columns | 206 |
| `timestamp without time zone` columns | 382 |
| Current connections | 10-11; 14-day maximum 102 |
| Cache hit ratio | 99.90% |
| Transaction rollback rate | 4.55% |
| Deadlocks | 0 |
| Idle-in-transaction sessions | 0 at audit time |

### Fourteen-day CloudWatch workload health

| Metric | Average | Maximum/minimum | Assessment |
|---|---:|---:|---|
| CPU | 4.09% | 50.11% max | Healthy headroom |
| Connections | 11.22 | 102 max | Safe now; pool storms remain plausible |
| Free memory | 1.96 GiB | 1.78 GiB min | Healthy at current load |
| Free storage | 93.26 GiB | 93.18 GiB min | Healthy at current load |
| Read latency | 0.43 ms | 10 ms max | Healthy |
| Write latency | 1.14 ms | 43.77 ms max | Generally healthy |
| Disk queue | 0.011 | 0.43 max | Healthy |
| CPU credits | Approximately 576 | Stable | No current credit pressure |

## 4. Detailed findings

### F-01 — Critical: tenant isolation is incomplete, fail-open, and self-bypassable

**Evidence**

1. Only 14 of 371 tenant-key tables have RLS enabled: 3.8% coverage. Examples without RLS include `hg_dicom_instances` (~193k rows), `his_scores` (~32.5k), `hospitals` (~10.8k), `users` (~6.7k), `notifications` (~3.5k), and `doctors` (~1.1k).
2. `users` and `api_appointments` have policies and `FORCE ROW LEVEL SECURITY`, but `relrowsecurity=false`. `FORCE` without `ENABLE` does not activate RLS.
3. API policies permit access when `app.current_tenant` is empty or absent and often when `tenant_id IS NULL`. A missing context therefore opens the table instead of denying access.
4. `verifyTenant` calls `set_config(..., true)` outside an explicit transaction and releases the client before downstream queries. The `true` setting is transaction-local and disappears at the end of that statement’s implicit transaction. See `server/middleware/api-auth.js:391-400`. This middleware is attached to numerous API v1 route families.
5. `server/middleware/tenant-context.js:15-53` and `server/middleware/tenantScope.middleware.js:218-233` issue `SET LOCAL app.current_tenant = $1`. Live read-only validation proved PostgreSQL rejects that statement with SQLSTATE `42601`; `set_config` must be used for a parameterized value.
6. The tenant-scope resolver explicitly fails open and returns `1=1` when scope resolution fails or no accessible IDs are present. See `server/middleware/tenantScope.middleware.js:163-167` and `:198-206`.
7. The platform-admin policy trusts an arbitrary custom GUC (`app.is_platform_admin`) set by the same shared application role. In a read-only transaction, `mediczy_helper` could self-assert that value and change visibility from 0 to 691 appointment rows and from 0 to 66 prescription rows. The design is visible in `server/db/migrations/020-row-level-security-phi.sql:22-43` and context setting in `server/middleware/rls-context.middleware.js:29-54`.
8. `PUBLIC` and `mediczy_helper` both have `CREATE` on schema `public`; the search path is `"$user", public`. This creates object-shadowing and privilege-escalation risk, especially around security-definer functions.

**Impact**

- One missing application `WHERE` clause, SQL injection, compromised worker, leaked DB password, or context failure can expose cross-tenant PHI/PII.
- The database security layer gives a false assurance: migrations state that a missing application filter cannot expose other tenants, but the live behavior contradicts that claim.
- A direct, immediate `ENABLE RLS` change could break production because many paths do not establish a valid context. Remediation must be staged and tested, not applied blindly.

**Required remediation**

1. Treat this as an incident-level architecture defect. Inventory every route/job touching tenant-owned tables and add cross-tenant negative tests.
2. Create separate roles: a non-owner runtime role with only required DML; a no-login table owner; a migration role; a read-only analytics role; and narrowly controlled break-glass administration. The runtime role must not own tables, create extensions, create in `public`, or bypass RLS.
3. Revoke `CREATE` on `public` from `PUBLIC`; move extensions to controlled schemas where supported; give security-definer functions a fixed safe `search_path`; revoke public function execution unless required.
4. Replace client-asserted admin GUC authorization. Use a separate privileged role/connection path or a security-definer context setter that verifies a server-side session principal against trusted authorization data. Do not let a runtime connection declare itself an admin.
5. Make all tenant policies fail closed when context is null. Do not include `current_setting(...) IS NULL`, empty string, or `tenant_id IS NULL` as universal allow clauses.
6. Use one transaction wrapper that starts a transaction, calls parameterized `set_config`, executes all work on the same checked-out client, commits/rolls back, and releases it. Remove the three competing context mechanisms.
7. Make tenant keys `NOT NULL` for tenant-owned data, with explicit global/reference-table exceptions.
8. Enable and force RLS table-by-table only after route coverage and negative tests pass. Start with canary tables and monitor denied operations.

### F-02 — Critical: database credentials and other secrets are present in tracked repository files

**Evidence**

- `server/ecosystem.config.cjs:146-152` and `:194-200` contain a literal database username/password and disable TLS certificate verification.
- `docs/deployment/EC2_DATABASE_SETUP.md` contains plaintext historical database credentials.
- A tracked quarantine artifact contains a literal `pg` client password.
- Several environment-style files are tracked, including production-local and testing variants. A broad static scan found many likely credential/test-password assignments. Not every match is a live credential, but the confirmed database examples are sufficient to require rotation.

**Impact**

- Anyone with repository or history access may obtain credentials; removing the current line does not remove Git history.
- Password reuse can turn a UAT leak into production compromise.

**Required remediation**

1. Rotate every credential matching or historically reusing the exposed values: PostgreSQL roles, n8n, test/admin users, Redis, OAuth, messaging, and integration secrets.
2. Replace literals with AWS Secrets Manager or SSM SecureString references and short-lived delivery to the process.
3. Purge secrets from Git history using an approved history-rewrite process; invalidate old clones and CI caches.
4. Add CI secret scanning and a pre-commit detector. Block `.env*`, credential-bearing ecosystem files, dumps, tokens, and private keys by policy.

### F-03 — Critical: RDS data and automated backups are unencrypted

**Evidence**

- `StorageEncrypted=false` on `mediczy-prod`.
- RDS automated backup metadata also reports `Encrypted=false`.
- Field encryption is only partial. Prescription medication encryption covers 28 of 66 rows with medications. Common identifiers such as email and phone remain plaintext by design.
- The field-encryption migration adds sidecar columns and requires a separate manual backfill. See `server/db/migrations/027-phi-encryption.sql:28-43`, `:80-123`, and `:125-142`.

**Impact**

- Snapshots, underlying storage, and copied automated backups lack KMS protection.
- Field-level encryption cannot substitute for volume/snapshot encryption; it covers selected fields only and adds key-management/application complexity.

**Required remediation**

1. Take a controlled snapshot, copy it with a customer-managed KMS key, restore to a new encrypted RDS instance, validate, and cut over. RDS storage encryption cannot be enabled in place.
2. Build the replacement as Multi-AZ with deletion protection, storage autoscaling, monitoring, log exports, and a custom parameter group before cutover.
3. Define KMS key ownership, rotation, grants, break-glass access, and cross-region recovery policy.
4. Complete or deliberately redesign field encryption. Never leave rows in a mixed state without dual-read/write rules, parity gates, and rollback criteria.

### F-04 — Critical: schema change governance is causing live catalog and index corruption

**Evidence**

- `user_notification_preferences` is empty but has 13,307 indexes and 13,306 copies of `UNIQUE ("userId")`, consuming 104 MB.
- Across the public schema there are 58 duplicate-index groups and 13,365 excess indexes by exact structural comparison.
- The database has 742 public tables; 459 are estimated empty.
- Runtime code executes `sync({ alter: true })`, including `server/services/notification-automation.service.js:91-108` and vector services. Other scripts contain `sync({ force: true })`.
- `server/db/postgres.js:109-286` creates extensions/tables/indexes; connection startup invokes all mutation paths at `:381-386`.
- There are 140 Sequelize model files, 73 Prisma models, zero Prisma migrations, 27 SQL migrations under `server/db/migrations`, about 100 SQL/JS migrations under `server/migrations`, and additional root/database migration trees.
- `server/scripts/migrate-all.mjs:12-18` includes only three top-level steps; optional failures continue, while many other migrations are not ledgered.
- `_migrations_run` contains only five records and one remains `failed` (`core/insurance-company-corporate`). It has no checksum, version graph, or dirty-state protection.

**Impact**

- Every restart or partial migration can mutate production differently.
- Catalog planning, backups, DDL, autovacuum, and writes to the affected table become progressively more expensive. The index explosion is an active, unbounded failure mode.
- Environments cannot be recreated deterministically or reliably compared.

**Required remediation**

1. Immediately stop all production `sync({alter:true})`, `sync({force:true})`, route-level DDL, and extension/schema creation on application startup.
2. Freeze schema changes until a canonical migration owner and ledger are selected.
3. Choose one migration system with immutable ordered migrations, checksums, transactional behavior where possible, advisory locking, dirty-state blocking, and environment drift checks.
4. Reconcile live schema to that source of truth. Prisma may remain a client schema, but it cannot be called the source of truth without migrations and drift control.
5. Remove duplicate constraints/indexes with a reviewed, resumable production plan. Preserve one valid unique constraint and use lock-aware/concurrent techniques where available; do not bulk-drop blindly.
6. Resolve the failed migration record and add CI tests that build an empty database and upgrade a production-like snapshot.

### F-05 — High: RDS is a single failure domain with weak destructive-action protection

**Evidence**

- Multi-AZ is off; there is no secondary AZ, read replica, or proxy.
- Deletion protection is off and no manual snapshots exist.
- AWS Backup has no plans and does not list the RDS instance as a protected resource.
- Storage autoscaling is unset (`MaxAllocatedStorage=null`).
- The instance uses the default subnet group and default parameter group.

**Impact**

- Host/AZ maintenance or failure creates application downtime with restore/failover as the primary recovery path.
- Accidental deletion has fewer guardrails.
- A hard storage ceiling can turn growth or WAL/temp spikes into an outage.

**Required remediation**

- Make the encrypted replacement Multi-AZ, enable deletion protection and storage autoscaling, create a pre-change manual snapshot, and define tested RTO/RPO.
- Use dedicated private database subnets and a custom parameter group under infrastructure-as-code/change control.
- Evaluate a read replica based on reporting/DR needs; Multi-AZ addresses availability, not read scaling.

### F-06 — High: backup production is healthy, but recovery controls are inconsistent and untested

**Positive evidence**

- RDS automated backups complete daily with 30-day retention.
- Full logical dumps succeeded daily through 2026-09-01 and are present in S3.
- The S3 bucket has default SSE-S3 encryption, versioning, and full public-access blocking.

**Control gaps**

1. The live dump helper uses `--format=plain` (`scripts/backup/pg-dump-prod.lib.sh:65-75`) and gzip. The runbook demonstrates a custom archive and `pg_restore` (`docs/deployment/POSTGRES_BACKUP_RESTORE_RUNBOOK.md:3-13`). `pg_restore` cannot restore a plain SQL dump; actual files require decompression piped to `psql`.
2. No evidence of a completed scheduled restore drill was found. The runbook is a command sketch, not a recorded recovery test with checksums, timings, row/constraint validation, and application smoke results.
3. The S3 lifecycle rule is scoped to `postgres/`, while real objects are under `db/YYYY-MM-DD/`; those backups do not transition or expire under the current rule.
4. Object Lock and bucket replication are absent. A compromised account can alter/delete the same-region backup set.
5. User and root crontabs both run `scripts/database/daily-backup.sh` at 02:00 without a shared `flock`. Another 02:00 cron references a missing script. Earlier zero-byte `.sql` files remain because cleanup only matches `.sql.gz`.
6. Logical dumps authenticate as the RDS master/BYPASSRLS role. That is operationally effective but increases credential blast radius.

**Required remediation**

- Standardize on either custom format (`pg_dump -Fc` plus `pg_restore`) or plain gzip (`gzip -dc | psql`) and make script/runbook/checks agree.
- Consolidate backup scheduling under one systemd timer or AWS-managed workflow with locking, failure alerts, checksums, and metrics.
- Correct the lifecycle prefix, add immutable retention/Object Lock in a dedicated backup account where feasible, and add cross-region replication.
- Run a monthly automated restore into an isolated encrypted database, execute catalog/integrity/application checks, measure RTO, then destroy the test target through an approved workflow.
- Use a narrowly scoped backup role or managed snapshot mechanisms rather than making a master password the routine path.

### F-07 — High: production database observability and forensic logging are effectively absent

**Evidence**

- Performance Insights and Enhanced Monitoring are disabled.
- No PostgreSQL logs are exported to CloudWatch.
- No CloudWatch alarms or RDS event subscriptions target the instance.
- `pg_stat_statements` and `pgaudit` are not installed; Database Activity Stream is stopped.
- `log_min_duration_statement=-1`, `log_statement=none`, `log_lock_waits=off`, `log_disconnections=off`.
- Nine of ten live application connections had a blank `application_name`.
- Database-level `statement_timeout=0`, `lock_timeout=0`, and `transaction_timeout=0`; idle-in-transaction timeout is 24 hours.

**Impact**

- Slow queries, lock incidents, abusive access, and operational regressions cannot be attributed promptly.
- A database issue can exist until users report it.

**Required remediation**

- Enable Performance Insights, Enhanced Monitoring, PostgreSQL/error/upgrade log exports, and alarms for CPU, memory, free storage, connections, latency, queue depth, replica lag (if added), failed backups, and failover/events.
- Install and configure `pg_stat_statements`; consider `pgaudit` or Activity Streams based on the compliance/threat model.
- Set `application_name` per service and pool.
- Establish role/service-specific statement, lock, idle-transaction, and transaction timeouts. Log lock waits and a privacy-reviewed slow-query threshold.

### F-08 — High: referential integrity and index support are incomplete

**Evidence**

- Nine foreign keys are `NOT VALID`.
- Aggregate orphan checks found 96 `notifications.userId` values with no parent user. The other eight unvalidated FKs had no current orphans and can likely be validated after review.
- 247 of 535 FKs lack an index with the FK columns as the leading columns.
- The schema contains 13,609 unique constraints, almost entirely due to the index explosion.

**Impact**

- Existing orphaned data breaks relational assumptions and prevents validation.
- Parent updates/deletes and joins may scan child tables and hold locks longer.

**Required remediation**

- Define the business disposition for the 96 notification orphans, repair/archive them, then validate the FK.
- Validate the eight clean constraints with lock-aware scheduling.
- Add FK indexes based on delete/update/join workload, prioritizing high-row/high-churn tables; do not create all 247 without workload review.
- Add a release gate rejecting new unvalidated constraints unless an explicit backfill/validation ticket exists.

### F-09 — High: connection ownership and pool budgets are fragmented

**Evidence**

- Runtime code has multiple independent pool factories: raw `pg`, a singleton `pgPool`, Sequelize, a second database pool, middleware pools, Prisma, control-plane connections, and service-specific clients.
- Default maxima differ: 50 in `server/db/postgres.js:76-105`, 20 in `server/db/pgPool.js`, and 50 with minimum 10 in `server/db/postgres-sequelize.js`.
- Pool behavior differs by URI versus discrete configuration; several omit query timeout, statement timeout, application name, or consistent TLS settings.
- The instance allows 400 connections. Fourteen-day connections peaked at 102, while current usage was only 10-11. No RDS Proxy exists.

**Impact**

- Restarts, worker scaling, cron overlap, and incidents can multiply connections beyond the intended budget.
- Different code paths have different timeout and TLS behavior.

**Required remediation**

- Inventory runtime processes and calculate a hard connection budget: reserve administration/autovacuum capacity, then allocate per service and replica count.
- Consolidate each process on one pool abstraction; keep a deliberately small separate batch pool only when justified.
- Set minimum pools to zero unless measured warm capacity is required.
- Evaluate RDS Proxy or PgBouncer for connection-storm protection, especially before horizontal scaling.
- Standardize timeouts, TLS verification, `application_name`, metrics, and graceful shutdown.

### F-10 — High: application runtime roles have excessive ownership and DDL capability

**Evidence**

- `mediczy_helper` owns schema `public`, can create in it, and has `TRUNCATE`, `TRIGGER`, `REFERENCES`, and full DML on core PHI tables.
- Application startup creates extensions and schema objects (`server/db/postgres.js:109-286` and `:381-386`).
- A security-definer `decrypt_phi` function is executable by `PUBLIC` and has no fixed `search_path` (`server/db/migrations/027-phi-encryption.sql:69-78`).

**Impact**

- Compromise of the application credential becomes schema compromise, not only row compromise.
- Runtime deployment and migration concerns cannot be independently controlled or audited.

**Required remediation**

- Apply the separate owner/migrator/runtime roles described in F-01.
- Revoke unnecessary table privileges, default public function execution, and public schema creation.
- Review every security-definer function for owner, fixed search path, qualification, input validation, and minimal grants.

### F-11 — Medium: partitioning is deployed as unused shadow tables

**Evidence**

- Five partitioned parents and 60 child partitions exist, all empty.
- Active tables continue receiving data: `appointments` has ~691 rows, `notifications` ~3,451, and `ai_agent_runs` ~116, while their `_partitioned` equivalents have zero.
- `audit_logs`, the largest table at ~1.55 million rows/497 MB, is not the partitioned `platform_audit_logs` structure.
- Monthly shadow partitions stop after May 2027; weekly platform audit partitions stopped in July 2026. No default partitions exist.

**Impact**

- The system pays catalog/maintenance complexity without pruning or lifecycle benefit.
- Switching traffic later can fail on out-of-range inserts unless partition creation is automated.

**Required remediation**

- Decide whether each workload truly needs partitioning. Remove unused shadow structures after backup if not.
- If partitioning is retained, build a supported online cutover, default partition, automated future partition creation, retention/archive policy, PK/unique design, and monitoring.
- Prioritize audit-log retention/partition strategy based on actual growth and compliance retention requirements.

### F-12 — Medium: temporal types and duplicate semantic columns create functional drift

**Evidence**

- 382 columns use `timestamp without time zone`, including `appointments.appointmentDateTime`, creation/update times, cancellation times, and clinical/API events.
- The application spans UTC infrastructure and Asia/Kolkata business defaults, making implicit timestamps ambiguous.
- Four normalized duplicate-column groups exist. `doctors.unique_id` versus `doctors."uniqueId"` disagrees on 1,003 rows; 1,002 rows have only the snake-case value. Emergency-triage duplicate columns on `users` also disagree.
- 1,810 of 11,846 public columns are mixed-case, requiring quoted identifiers and increasing ORM drift.

**Impact**

- Scheduling, DST/locale conversion, reporting boundaries, and API serialization can disagree.
- Different services can read/write different columns for the same concept.

**Required remediation**

- Adopt `timestamptz` for instants, `date` for calendar dates, `time` plus an explicit IANA zone only for local schedules, and UTC at storage/API boundaries.
- Select canonical columns, backfill with parity checks, dual-write briefly if necessary, then remove aliases through expand/contract migrations.
- Standardize new identifiers on lowercase snake_case at the database boundary.

### F-13 — Medium: architecture documentation and implementation disagree

**Evidence**

- `docs/database/DATABASE_ARCHITECTURE.md:1-70` describes MariaDB as the primary OLTP system and PostgreSQL/Citus as a helper.
- Current application configuration describes PostgreSQL as primary; live production is PostgreSQL RDS with pgvector, no Citus, and no TimescaleDB.
- `nestjs-app/prisma/schema.prisma` calls its 73 models the single source of truth, yet there are no Prisma migrations and the live database has 742 public tables.

**Impact**

- Operators and developers can make changes against the wrong data-flow, migration, backup, or consistency assumptions.

**Required remediation**

- Publish one current architecture decision record defining the system of record, service ownership, tenancy model, analytics replication, vector workload, migration owner, and deprecation plan.
- Mark legacy documentation clearly and remove “complete/running” assertions that are not continuously verified.

### F-14 — Medium: default RDS configuration and maintenance hygiene are weak

**Evidence**

- The default PostgreSQL 18 parameter and option groups are used.
- An OS update and engine patch 18.3.R2 are pending.
- The DB has no resource tags.
- Client code generally uses TLS with `rejectUnauthorized:false`; the server does reject non-TLS connections, but clients do not verify the RDS certificate/hostname.
- `max_connections=400` on a 4-GiB-class instance is generous relative to memory and encourages pool sprawl.

**Required remediation**

- Create a versioned custom parameter group with reviewed settings and a patch/rollback procedure.
- Apply pending maintenance first to a clone/staging target, then production in the maintenance window.
- Add ownership, environment, data classification, criticality, backup, and cost-center tags.
- Use the AWS RDS CA bundle with hostname verification (`verify-full` semantics) rather than accepting any certificate.
- Right-size `max_connections` after introducing a global pool budget/proxy.

## 5. Healthy controls and strengths

The audit found several controls worth preserving:

- The RDS endpoint is not publicly accessible.
- Database ingress is restricted to two security-group sources; there is no `0.0.0.0/0` database ingress.
- Non-TLS connection testing was rejected; the observed session used TLS 1.3 with AES-256-GCM.
- SCRAM-SHA-256 is the password-encryption default.
- RDS automated backups are completing daily with 30-day retention.
- Full logical dumps are completing and arriving in a versioned, non-public S3 bucket every day.
- Current CPU, memory, storage, latency, disk queue, cache hit rate, and credit balance are healthy.
- No invalid indexes, unlogged public tables, deadlocks, idle-in-transaction sessions, or wraparound pressure were found.
- Autovacuum is enabled and recent on active tables.
- Application code contains a correct same-transaction `set_config` wrapper in `server/middleware/rls-context.middleware.js:46-64`; it can be the starting point for consolidation, but the authorization/bypass design still needs correction.

## 6. Recommended remediation sequence

### 0-24 hours: contain the highest risks

1. Open a tracked security/architecture incident for tenant isolation and exposed credentials.
2. Rotate confirmed and potentially reused secrets; stop reading credentials from tracked files.
3. Take a manual RDS snapshot before structural changes and enable deletion protection.
4. Freeze runtime schema mutation and new migrations.
5. Add immediate CloudWatch alarms and RDS event notifications.
6. Patch API tenant middleware to use one same-client transaction wrapper and fail closed. Add tests proving tenant A cannot read/write tenant B for every API v1 route family.
7. Do **not** mass-enable RLS until route/job context coverage is proven; that can cause a production outage.

### 2-7 days: restore trustworthy boundaries

1. Introduce owner, migrator, runtime, backup, analytics, and break-glass roles; revoke public schema creation.
2. Redesign the admin bypass and fail-open policies, then enable/force RLS in canary batches.
3. Stop `sync({alter:true})` and startup DDL; select one migration ledger.
4. Stop the unique-index growth source and remove duplicate constraints with a reviewed online plan.
5. Repair 96 notification orphans; validate all nine FKs; prioritize missing FK indexes.
6. Consolidate cron backups, fix the restore format/runbook and S3 lifecycle prefix, and perform the first isolated restore drill.

### 1-4 weeks: rebuild the RDS control plane safely

1. Create an encrypted, Multi-AZ replacement using a customer-managed KMS key.
2. Use dedicated private DB subnets, deletion protection, storage autoscaling, custom parameter group, Performance Insights, Enhanced Monitoring, log exports, alarms, and tags.
3. Load-test and rehearse cutover/rollback; use logical replication/DMS or an approved downtime window to minimize data loss.
4. Add immutable/cross-region backup protection and automated monthly recovery testing.
5. Install `pg_stat_statements`, establish query/lock dashboards, and tune using measured evidence.

### 1-3 months: reduce structural complexity

1. Publish a canonical database architecture and bounded-context ownership map.
2. Reconcile 742 tables and 459 empty tables; archive/drop obsolete scaffolding only after dependency and restore validation.
3. Decide the partition strategy and migrate the actual large tables, especially audit history, if justified.
4. Normalize time types and duplicate columns through expand/contract migrations.
5. Consolidate connection pools and adopt RDS Proxy/PgBouncer if scaling or connection volatility warrants it.
6. Add CI gates for clean-build migrations, upgrade migrations, checksums, schema drift, RLS coverage, tenant penetration tests, FK validation, duplicate indexes, secrets, and restore compatibility.

## 7. Acceptance criteria

The platform should not be considered remediated until all of the following are demonstrably true:

- Every tenant-owned table is classified and either has enforced fail-closed RLS or a documented alternative boundary.
- The runtime role cannot self-grant an admin context, own/alter schema, create in `public`, create extensions, or bypass RLS.
- Automated tests prove cross-tenant read/write denial for HTTP routes, background jobs, direct repositories, and admin paths.
- RDS storage/backups are KMS-encrypted, Multi-AZ is enabled, deletion protection and autoscaling are on, and failover has been tested.
- A current backup restores successfully into an isolated environment using the documented command; checksums, constraints, critical row counts, and application smokes pass within the stated RTO.
- No application startup path mutates schema.
- One migration ledger accounts for every production change and blocks failed/dirty state.
- The duplicate constraint explosion is removed and does not recur across repeated restarts/deployments.
- Unvalidated constraints are zero except for explicitly time-bounded rollout exceptions.
- Performance Insights/statement statistics, logs, alarms, and operational ownership are active.

## 8. Final opinion

The database is not presently constrained by CPU, memory, I/O, or storage. The main risk is architectural: security context is treated as trustworthy when the client can set it, migration behavior is distributed across runtime code and multiple incomplete systems, and RDS resilience/observability controls are below what a healthcare system of record should require.

The highest-value path is therefore not instance upsizing. It is: repair and prove tenant boundaries, rotate secrets and reduce role privilege, stop runtime DDL, establish one migration authority, build an encrypted Multi-AZ replacement, and prove recovery. Once those controls are stable, performance tuning and schema consolidation can proceed using reliable telemetry.
