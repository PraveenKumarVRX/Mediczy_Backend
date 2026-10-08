# Mediczy PostgreSQL and AWS RDS Remediation Implementation Plan

**Plan date:** 2026-09-01 UTC  
**Plan ID:** DB-RDS-PLAN-2026-09-01  
**Source audit:** `docs/audits/POSTGRESQL_RDS_MICROAUDIT_2026-09-01.md`  
**Status:** **PLAN ONLY — NOT APPROVED FOR EXECUTION**  
**Production environment:** `mediczy-prod`, AWS `ap-south-1`, PostgreSQL 18  
**Expected program duration:** 8-12 weeks, followed by recurring control validation  

**Related application architecture remediation:** [Multi-app HMIS findings and solution fix plan (7 October 2026)](MULTI_APP_BFF_SOLUTION_FIX_PLAN_2026-10-07.md). Its tenant-context, migration, audit and connection work depends on this plan's existing gates; the companion does not change their approval or completion status.

This document defines the complete implementation sequence. Creating this plan does not authorize database DDL, data correction, secret rotation, AWS resource changes, backup deletion, production deployment, or cutover. Each production phase requires the approvals and gates defined below.

## 1. Purpose and required outcomes

The program will convert the audit findings into a secure, reproducible, recoverable PostgreSQL platform without combining too many high-risk changes in one maintenance event.

The required end state is:

1. Tenant-owned and PHI-bearing data has a documented owner and a fail-closed isolation control.
2. The application runtime role cannot own or mutate schema, create in `public`, create extensions, bypass RLS, or self-assert platform-administrator access.
3. RDS is KMS-encrypted, Multi-AZ, deletion-protected, autoscaling, monitored, tagged, and defined through infrastructure as code.
4. Backups are encrypted, immutable or independently protected, checksum-verified, and regularly restored in an isolated environment.
5. One migration system is authoritative; application startup never performs DDL.
6. Duplicate indexes, unvalidated constraints, orphan rows, unused partition scaffolding, and duplicate semantic columns are resolved through controlled migrations.
7. Connection capacity, timeouts, TLS verification, query telemetry, logging, and alarms are standardized.
8. Every change has a tested rollback, objective acceptance evidence, and named owner.

## 2. Non-goals

The first remediation program will not:

- Rewrite the product or migrate away from PostgreSQL.
- Split all 742 tables into microservice databases immediately.
- Mass-enable RLS without application-route coverage and negative tests.
- Drop all empty tables solely because statistics report zero rows.
- Create all 247 possible FK indexes without workload evidence.
- Convert all 382 timestamp columns in one release.
- Replace pgvector, n8n, DuckDB, Redis, Kafka, or application frameworks unless a workstream proves that change necessary.
- Tune CPU/memory by intuition; current resource utilization is healthy and tuning will be telemetry-driven.

## 3. Delivery principles

1. **Fail closed:** missing identity or tenant context denies tenant-owned data.
2. **Separate duties:** owners migrate; runtimes perform bounded DML; backups read; analysts read approved projections.
3. **One variable per cutover:** infrastructure cutover, RLS activation, and catalog cleanup are separate change events.
4. **Expand, migrate, contract:** breaking schema changes use compatibility phases.
5. **Restore before delete:** no destructive cleanup proceeds until the current backup is restored successfully.
6. **Evidence over assertion:** every gate requires machine-produced evidence.
7. **No runtime DDL:** schema changes are deploy-time migrations only.
8. **No plaintext secrets:** secrets are stored and delivered through AWS-managed secret stores.
9. **No PHI in telemetry:** logs, traces, query samples, test fixtures, and reports must redact data values.
10. **Rollback is designed first:** a change without a bounded rollback is not ready.

## 4. Target architecture

```text
Internet / clients
        |
   API / workers / n8n
        |
   service-specific Secrets Manager credentials
        |
   RDS Proxy (or approved PgBouncer alternative)
        |
  +--------------------------------------------------+
  | Encrypted PostgreSQL RDS, private subnets         |
  | Multi-AZ + deletion protection + autoscaling      |
  | custom parameter group + logs + PI + monitoring   |
  |                                                   |
  | no-login object owner                             |
  | migration role -> DDL only in deployment jobs     |
  | runtime roles  -> bounded DML, NOBYPASSRLS         |
  | admin runtime -> separate secret/pool and policies|
  | backup role   -> controlled read/BYPASSRLS job    |
  | analytics role-> approved views/projections       |
  +--------------------------------------------------+
       |                         |
  RDS automated/PITR       logical custom dumps
       |                         |
  AWS Backup vault         KMS + versioned/Object Lock S3
       |                         |
  cross-region copy        automated isolated restore drill
```

### 4.1 Target database roles

Final names may be adjusted, but responsibilities must remain separate.

| Role | Login | Intended rights | Explicitly forbidden |
|---|---:|---|---|
| `mediczy_owner` | No | Own application schemas/tables/functions | Direct application use |
| `mediczy_migrator` | Yes, deployment only | `SET ROLE mediczy_owner`; approved DDL | Routine application traffic |
| `mediczy_runtime` | Yes | Required DML on application tables; execute approved functions | Ownership, DDL, `BYPASSRLS`, admin bypass |
| `mediczy_admin_runtime` | Yes, isolated service/pool | Admin-policy DML explicitly granted | Membership by ordinary runtime; schema ownership |
| `mediczy_worker_runtime` | Yes | Job-specific DML only | Broad interactive access |
| `n8n_runtime` | Yes | n8n schema and approved integration functions | Public application tables by default |
| `mediczy_readonly` | Yes | Approved views or tables, masked where needed | Writes, raw secrets, security tables |
| `mediczy_backup` | Yes, scheduled job only | Full read required for logical backup; `BYPASSRLS` only if approved | DDL, application use, network access outside backup runner |
| `mediczy_breakglass` | Yes, normally disabled | Incident-only privileged access | Persistent use; shared credentials |

### 4.2 Target tenancy model

The default design remains shared-schema multi-tenancy, with explicit exceptions:

- Every tenant-owned row has one canonical `tenant_id` or `organization_id` whose meaning is documented.
- Tenant keys are `NOT NULL` after backfill unless the table is explicitly classified as global.
- Tenant-scoped unique constraints include the tenant key when the business identifier is tenant-local.
- RLS is `ENABLE` + `FORCE` for shared tenant tables, and policies include both `USING` and `WITH CHECK`.
- Missing context returns zero rows/permission denial; it never means global access.
- Ordinary and administrative runtime identities use separate DB roles and secret paths.
- Client-set custom GUCs are defense-in-depth against missing filters, not a trusted admin credential.
- High-risk customers requiring a hard isolation boundary may use a dedicated database/cluster strategy through a separate architecture decision; that is not hidden behind the shared-schema policy.

## 5. Governance and responsibility model

Named people must be assigned before Phase 0 exits.

| Responsibility | Accountable role | Required participants |
|---|---|---|
| Program approval and risk acceptance | CTO/Engineering Director | Security, product, clinical/compliance |
| Database design and migration approval | Lead PostgreSQL DBA/DB architect | Backend leads, SRE |
| AWS/RDS/IaC changes | Cloud/SRE lead | DBA, security |
| Tenant authorization design | Security architect | DBA, backend/API owners |
| Application remediation | Backend lead | API/module owners, QA |
| Backup/restore and DR | SRE lead | DBA, security/compliance |
| PHI/retention decisions | Privacy/compliance owner | Clinical data owner, legal as needed |
| Test sign-off | QA lead | Backend, mobile/web, security |
| Production change approval | Change Advisory Board/on-call owner | All workstream leads |

### 5.1 Change-control requirements

Every production change record must contain:

- Change ID and linked work-package ID from this plan.
- Exact target resource/database/schema/table list.
- Reviewed command or migration checksum.
- Expected locks, duration, resource impact, and user-visible impact.
- Pre-change backup/snapshot ID and restore verification status.
- Monitoring dashboard and named observer.
- Stop conditions and rollback commands.
- Communications plan and incident bridge owner.
- Post-change evidence and sign-off.

### 5.2 Mandatory four-eyes rules

Two qualified reviewers are required for:

- RLS policy, role, grant, or security-definer function changes.
- KMS, Secrets Manager, security group, subnet, RDS, backup vault, or S3 policy changes.
- Production DDL affecting more than one table.
- Any data correction, index/constraint removal, table drop, or Git-history rewrite.
- Cutover and rollback decisions.

## 6. Program sequencing and gates

| Phase | Indicative time | Purpose | Production mutation allowed? |
|---|---|---|---:|
| Phase 0 | Days 0-2 | Mobilize, freeze hazards, capture evidence, approve architecture | Only separately approved containment |
| Phase 1 | Days 1-7 | Rotate secrets, stop runtime DDL, add minimum alarms, create safe staging | Yes, small reversible changes |
| Phase 2 | Weeks 1-3 | Canonical migrations, roles, tenant-context code, RLS tests in staging | No mass production RLS |
| Phase 3 | Weeks 2-4 | Build encrypted Multi-AZ target and recovery controls | New resources only |
| Phase 4 | Weeks 4-5 | Rehearse and execute RDS cutover | Approved maintenance event |
| Phase 5 | Weeks 5-8 | Deploy RLS in batches and repair integrity/catalog debt | Controlled table batches |
| Phase 6 | Weeks 7-12 | Pool, partition, time-type, schema, and documentation normalization | Expand/contract only |
| Phase 7 | Ongoing | Continuous evidence, restore/failover exercises, closure | Normal controlled operation |

### 6.1 Hard gates

| Gate | Must be true before proceeding |
|---|---|
| G0 — Program ready | Owners named; incident/change IDs opened; freeze communicated; no unreviewed production migrations |
| G1 — Restore proven | Current backup restores in isolation; integrity and application smokes pass; measured RTO recorded |
| G2 — Code safe for RLS | One context wrapper; fail-closed behavior; route/job negative tests; no broken `SET LOCAL $1` |
| G3 — Target RDS ready | KMS, private subnets, Multi-AZ, monitoring, backups, proxy/TLS, parameter group, and load tests pass |
| G4 — Cutover ready | Two rehearsals succeed; runbook timed; rollback tested; secrets/DNS and write-freeze plan approved |
| G5 — RLS batch ready | Table classification, null-key remediation, policy test matrix, canary and rollback all pass |
| G6 — Cleanup ready | Growth source stopped; dependency manifest reviewed; backup restore current; batch locks measured |
| G7 — Program closure | All acceptance criteria pass for 30 continuous days; residual risks formally accepted |

### 6.2 Critical path and parallel work

The critical path is:

```text
freeze runtime DDL
  -> prove current restore
  -> establish canonical migration baseline
  -> fix/test tenant transaction context
  -> build and rehearse encrypted RDS target
  -> cut over infrastructure
  -> activate production RLS in batches
  -> clean catalog/integrity debt
  -> complete 30-day stability window
```

Secret scanning/rotation, minimum monitoring, table classification, IaC development, and backup redesign may run in parallel after G0. Production duplicate-index cleanup cannot run before runtime DDL is stopped and G1 restore is proven. Mass RLS cannot run before G2. The RDS cutover and first production RLS batch must not occur in the same maintenance window.

### 6.3 Decisions required before execution

| Decision | Required by | Recommended default | Approver |
|---|---|---|---|
| Approved RTO and RPO | G0/G1 | Set from clinical/business impact analysis, not infrastructure preference | CTO, product, compliance |
| RDS migration path | G4 | Snapshot cutover if a 60-120 minute write outage is acceptable; otherwise DMS/CDC | CTO, SRE, DBA |
| Infrastructure-as-code standard | Phase 1 | Terraform unless an organizational CDK/CloudFormation standard exists | Cloud lead |
| Canonical migration tool | Phase 2 | Flyway SQL | DBA/backend architecture |
| Backup retention and immutability mode | Phase 3 | 35-day daily plus approved monthly/annual tiers; separate-account immutable copy | Compliance, SRE |
| Admin service boundary | G2 | Separate DB role, secret, pool, and restricted route/deployment boundary | Security architect |
| Restore-staging data handling | G1 | Sanitized data where possible; otherwise tightly controlled time-bound production restore | Privacy/compliance |
| RDS Proxy versus direct/PgBouncer | G3 | RDS Proxy if transaction context and session pinning tests pass | SRE/DBA |
| Dedicated database tenants | Phase 6 | Reserve for contractual/high-risk tenants through a separate ADR | Architecture/product |

## 7. Workstream A — Immediate containment and evidence preservation

### Objective

Stop risk from getting worse while preserving production availability and forensic evidence.

| ID | Action | Owner | Dependency | Exit evidence |
|---|---|---|---|---|
| A-01 | Open security/architecture incident and master change epic | Program lead | None | IDs and escalation contacts recorded |
| A-02 | Announce schema freeze: no `sync alter/force`, ad-hoc SQL, or unledgered migrations | DBA/backend lead | A-01 | Written freeze and exceptions process |
| A-03 | Capture sanitized baseline catalogs, RDS JSON, alarms, backup inventory, roles/grants, RLS, constraints, index signatures, and metrics | DBA/SRE | A-01 | Timestamped read-only baseline artifact with checksum |
| A-04 | Capture Git commit, deployment versions, PM2 process list, environment-key names, and migration status without secret values | SRE | A-01 | Reproduction manifest |
| A-05 | Create a manual pre-remediation RDS snapshot and enable deletion protection | SRE | Approval | Snapshot available; deletion protection verified |
| A-06 | Add temporary alarms for CPU, memory, storage, connections, latency, and RDS events | SRE | Approval | Alarm tests delivered to on-call |
| A-07 | Disable or feature-flag production initialization paths that execute ORM alter/force DDL | Backend | A-02 | Three restart cycles produce zero DDL/index-count change |
| A-08 | Preserve audit/backup logs required for incident review; do not run broad log cleanup | Security/SRE | A-01 | Retention hold documented |

### Stop conditions

- Any unexpected DDL after A-07.
- Backup failure or inability to create a snapshot.
- Connection, latency, or error-rate increase attributable to containment.
- Evidence that exposed credentials are actively used from an unknown source.

## 8. Workstream B — Secret eradication and identity hardening

### Objective

Remove tracked credentials, rotate affected identities, and deliver secrets only through approved AWS channels.

### B.1 Inventory and classification

1. Run an approved full-history secret scanner over Git, build artifacts, CI logs, AMIs, S3 artifacts, and deployment hosts.
2. Classify every finding as live, expired, test-only, false positive, or unknown.
3. Treat unknown credentials as live until disproved.
4. Build a rotation graph so dependent services are not cut off unexpectedly.

### B.2 Rotation order

| Order | Credential class | Rotation approach | Verification |
|---:|---|---|---|
| 1 | RDS privileged/master/backup | Rotate in Secrets Manager/SSM; test backup and break-glass separately | Old credential rejected; new jobs succeed |
| 2 | Application DB roles | Create new role/secret, dual-deploy, drain old pools, revoke old login | No old-role sessions; app smokes pass |
| 3 | n8n and worker DB identities | Separate role and schema grants; update service secrets | Workflows and queues pass |
| 4 | Redis/Kafka/internal services | Coordinated dual-secret rotation where supported | Connections authenticated; old secret rejected |
| 5 | OAuth, messaging, payment, email, third-party APIs | Provider-specific rotation | Callback/webhook and outbound tests pass |
| 6 | Test/admin/demo accounts | Invalidate shared passwords; generate controlled fixtures | No documented reusable password remains |

### B.3 Repository controls

- Remove literal credentials from tracked ecosystem files and documentation.
- Replace values with secret references or variable names; examples use unmistakable placeholders.
- Rewrite Git history only under a dedicated approved change with a mirror backup, contributor coordination, force-push window, clone invalidation, and post-rewrite scan.
- Add CI secret scanning, pre-commit scanning, branch protection, and artifact scanning.
- Block tracked `.env`, dumps, private keys, access tokens, and password exports.
- Record secret owner, rotation interval, last rotation, consumers, and emergency procedure.

### Rollback

Rollback means restoring service availability with the new credential path or a second newly generated credential. It never means re-enabling a credential known to be exposed.

### Exit criteria

- Confirmed exposed values are rejected by their providers.
- Production processes read no literal secret from Git.
- Old database roles show zero sessions for 24 hours, then `NOLOGIN`/drop is approved.
- Full-history and working-tree scans pass the agreed policy.

## 9. Workstream C — Canonical migration system and runtime DDL removal

### Objective

Make production schema deterministic, reviewable, and reproducible.

### C.1 Architecture decision

Recommended decision: use **Flyway with SQL migrations** as the authoritative database migration layer because the estate is SQL-heavy and consumed by Node.js, Prisma, Python, n8n, and operational scripts. Prisma remains a generated client schema, not the production migration authority. If the team selects another tool, it must still provide ordered immutable versions, checksums, locking, validation, dirty-state blocking, repair audit, and repeatable clean-build tests.

The decision is recorded as an ADR before code migration begins.

### C.2 Repository layout

```text
database/
  flyway.conf.example
  migrations/
    V20260901_001__baseline_marker.sql
    V202609xx_...__description.sql
  repeatable/
    R__approved_views.sql
  verification/
    preflight.sql
    postflight.sql
    drift.sql
  manifests/
    production-baseline.sha256
```

Secrets do not appear in Flyway configuration; CI/deployment injects them from Secrets Manager.

### C.3 Baseline process

1. Export a schema-only representation from production and checksum it.
2. Inventory every existing migration tree and map each migration to live objects.
3. Mark migrations as applied, superseded, missing, failed, or unknown; do not infer success from object existence alone.
4. Resolve `_migrations_run` failed state with evidence.
5. Create one explicit baseline record on a restored clone after validation; never use automatic production baselining without review.
6. Build an empty database from the new baseline/reference schema and upgrade a restored production clone.
7. Archive old runners as read-only history; remove them from deployment and startup paths.

### C.4 Runtime code changes

- Remove `sync({alter:true})` and `sync({force:true})` from services and scripts used in deployed processes.
- Replace `.sync()` initialization with readiness checks that fail with an actionable “migration required” error.
- Remove `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, and `CREATE EXTENSION` from route handlers, service constructors, workers, and connection startup.
- Keep extension installation and version checks in migrations/IaC.
- Give the runtime role no DDL permission so regression becomes impossible even if code remains.

### C.5 CI/CD gates

Every PR containing a migration must pass:

1. Clean database build.
2. Upgrade from the current release snapshot.
3. Downstream ORM generation/introspection.
4. Migration checksum validation.
5. Static checks for destructive/unbounded DDL, non-concurrent large indexes, missing lock/statement timeout, and `NOT VALID` without validation ticket.
6. Schema drift comparison.
7. Tenant/RLS and grant verification.
8. Backup/restore compatibility test for any backup-affecting change.

### Exit criteria

- Three production-equivalent deployments and restarts produce no unledgered DDL.
- One ledger accounts for all post-baseline changes.
- A clean build and restored-clone upgrade are reproducible.
- Runtime credentials receive permission-denied for DDL in a controlled test.

## 10. Workstream D — Role separation, tenant context, and RLS remediation

### Objective

Build a tenant boundary that fails closed and is testable without causing a mass production outage.

### D.1 Table classification inventory

Create a machine-readable registry with one row per table:

| Field | Required content |
|---|---|
| Schema/table | Canonical identifier |
| Domain/owner | Owning service/team |
| Data class | PHI, PII, financial, operational, public reference, security, ephemeral |
| Scope | Tenant, user, global, platform, integration-only |
| Canonical tenant key | Column and referenced tenant table |
| Null semantics | Invalid, legacy, or intentionally global |
| Access principals | Patient, doctor, hospital, corporate, admin, worker, integration |
| Required operations | SELECT/INSERT/UPDATE/DELETE by principal |
| RLS decision | Required, exempt, or separate schema/database |
| Retention | Duration and deletion/legal-hold behavior |
| Test owner | Named module owner |

No table is exempt from RLS merely because it currently lacks rows.

### D.2 Role migration sequence

1. Create new roles with no broad grants.
2. Transfer ownership to `mediczy_owner` in a staging clone and find breakage.
3. Grant runtime rights explicitly through role groups; configure default privileges for future objects.
4. Qualify application `search_path`; revoke `CREATE` from `PUBLIC` on `public`.
5. Review all public and security-definer functions. Add fixed `SET search_path` and schema-qualified references; revoke `PUBLIC EXECUTE` by default.
6. Deploy applications with new runtime roles while old role remains available for immediate credential rollback.
7. Observe, then mark old role `NOLOGIN`; drop only after all dependencies are cleared.

### D.3 One transaction-context API

All raw `pg`, Sequelize, Prisma, and job code must use one conceptual operation:

```text
checkout one connection
BEGIN
set transaction timeouts
set_config('app.current_tenant_id', verified tenant, true)
set_config('app.current_user_id', verified principal, true)
execute every repository call on that same connection/transaction
COMMIT or ROLLBACK
reset/discard defensive session state if proxy/pool requires it
release connection
```

Implementation requirements:

- `SELECT set_config(..., true)` is used for parameter values; never `SET LOCAL ... = $1`.
- Context is derived from a verified server-side authentication principal, not a raw request header/path.
- Header/path tenant values are checked against the authenticated principal’s permitted tenant set.
- Missing, malformed, conflicting, or failed context resolution returns 401/403/500; never `1=1` or open scope.
- Repository calls cannot silently escape the transaction by using a global pool.
- Background jobs carry a signed/validated job principal and tenant or use a dedicated worker role/function.
- Connection release after an error always rolls back and clears state.

#### D.3.1 Required threat-model decision

A plain custom GUC, even when transaction-local and fail-closed, protects against an accidentally omitted tenant filter but does **not** protect against arbitrary SQL executed with the same runtime credential: PostgreSQL users can normally change custom GUC values. Security sign-off must therefore select and document the boundary level before G5:

| Boundary level | Protects against | Does not protect against | Permitted use |
|---|---|---|---|
| Verified application GUC | Missing/incorrect application `WHERE`, connection-context mistakes | Compromised runtime credential or arbitrary SQL that sets another tenant | Defense-in-depth only |
| Validated database context | Above plus leaked ordinary DB credential/arbitrary SQL without a valid principal assertion | Compromised identity issuer or privileged admin role | Recommended for shared PHI tables |
| Tenant-specific role/schema/database | Above plus broad shared-role compromise, subject to infrastructure design | Compromise inside that tenant boundary | Contractual/high-risk tenant option |

For validated database context, the recommended design is an opaque, short-lived principal/session assertion issued by the trusted authentication service and validated by a narrowly granted security-definer function in a protected schema. The function derives tenant/user claims from protected authorization data or verifies a signature; it does not accept an unchecked tenant ID. Policies consume only the validated claim. The runtime role cannot write the context store, read verification secrets, execute a generic signer, or activate the administrative role. Replay, expiry, revocation, connection pooling, and performance must be tested.

If that design cannot be completed in the first RLS batch, the residual limitation of GUC-only isolation must be explicitly accepted and high-risk tenants must use a stronger role/database boundary. Documentation and security testing must never describe an ordinary GUC as protection against a compromised runtime role.

### D.4 Administrative access design

Remove `app.is_platform_admin` as a policy bypass for the ordinary runtime role.

Recommended design:

- Ordinary API routes use `mediczy_runtime` and never match admin policies.
- Administrative endpoints run in a separately deployed/admin-isolated component or a separate pool using `mediczy_admin_runtime` from a distinct secret.
- RLS admin policies authorize the database role, not a client-set boolean.
- The admin role is still subject to explicit policies and auditing; it does not automatically receive `BYPASSRLS`.
- Break-glass `BYPASSRLS` remains a separately monitored human/backup mechanism, not an HTTP request path.

### D.5 Policy template

The exact function and role names require review. The required semantics are:

```sql
ALTER TABLE app.example ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.example FORCE ROW LEVEL SECURITY;

CREATE POLICY example_runtime_select
ON app.example
FOR SELECT
TO mediczy_runtime
USING (
  tenant_id = app.current_tenant_id_required()
);

CREATE POLICY example_runtime_write
ON app.example
FOR ALL
TO mediczy_runtime
USING (
  tenant_id = app.current_tenant_id_required()
)
WITH CHECK (
  tenant_id = app.current_tenant_id_required()
);
```

`current_tenant_id_required()` must raise a controlled error when context is absent, expired, unvalidated, or malformed. Under the recommended boundary it returns only a claim validated as described in D.3.1, not a raw client-selected tenant ID. It must not return a value that expands access. Administrative policies are separate and role-based.

### D.6 Null tenant remediation

For each nullable tenant key:

1. Classify rows as global, corrupt, legacy, user-owned, or derivable from a parent.
2. Backfill in small batches with an immutable audit record and before/after counts.
3. Add a temporary trigger or application dual-write protection if concurrent writes can reintroduce nulls.
4. Add `CHECK (tenant_id IS NOT NULL) NOT VALID`, validate it, then convert to `NOT NULL` using the validated constraint where supported.
5. Move truly global data to an explicitly global/reference table or document an exemption; do not use null to mean global inside tenant tables.

### D.7 RLS deployment batches

| Batch | Tables | Preconditions | Observation period |
|---|---|---|---:|
| D0 | Restored staging only | Complete classification and test harness | Until all suites pass twice |
| D1 | Low-volume API v1 tenant tables with existing policies | Correct context wrapper; fail-open clauses removed | 48 hours |
| D2 | Core PHI tables: users, appointments, prescriptions, records, consents, vitals | All user/doctor/admin/background paths covered | 72 hours |
| D3 | Imaging, lab, hospital, corporate, insurance high-value tables | Load tests and integration partners validated | 72 hours |
| D4 | Remaining tenant-key tables | Exemptions signed; null-key work complete | 7 days |

Each production batch has its own migration, canary deployment, denial dashboard, and rollback. Rollback disables only the affected policies/tables and reverts application routing; it does not restore fail-open policy text as the long-term solution.

### D.8 Required tests

- Tenant A cannot read, insert, update, or delete tenant B rows.
- Patient cannot access another patient in the same organization unless explicitly authorized.
- Doctor access follows care relationship/appointment rules, not only matching numeric IDs.
- Tenant-key mutation cannot move a row into another tenant.
- Null context and null tenant key deny access.
- Pool reuse does not leak prior context.
- Admin endpoints work only with the admin DB role.
- Workers, webhooks, cron jobs, n8n, and report generators establish approved context.
- Direct unfiltered `SELECT` under runtime sees only allowed rows.
- SQL injection simulation cannot self-assert an admin boolean because ordinary policies do not recognize one.

### Exit criteria

- Registry covers 100% of public/n8n/application tables.
- Every tenant table is enforced or has an approved exception/alternative boundary.
- Cross-tenant negative tests pass in CI and production canary.
- Runtime role cannot DDL, create in `public`, bypass RLS, or match admin policies.

## 11. Workstream E — Encrypted Multi-AZ RDS replacement

### Objective

Replace the unencrypted single-AZ instance with an encrypted, observable, recoverable target while retaining a bounded rollback.

### E.1 Infrastructure as code

Recommended: create a dedicated Terraform module under `infrastructure/rds/` with encrypted remote state and state locking. If the organization standard is CloudFormation/CDK, use that standard, but console-only production configuration is not acceptable.

The module manages:

- Customer-managed KMS key, aliases, grants, rotation, deletion window, and key policy.
- Dedicated private DB subnet group across at least three AZs.
- RDS security group with source-security-group-only ingress.
- PostgreSQL 18 parameter/option groups.
- Encrypted Multi-AZ RDS instance, deletion protection, storage autoscaling, backup retention, maintenance windows, log exports, and tags.
- RDS Proxy if approved, including Secrets Manager authentication and TLS requirement.
- CloudWatch log groups, retention, alarms, dashboards, and SNS/event routes.
- AWS Backup plan/vault/copy policy if approved.

### E.2 Proposed baseline configuration

| Setting | Proposed starting value | Validation/decision |
|---|---|---|
| Engine | Current supported PostgreSQL 18 patch | Test extension and client compatibility |
| Class | `db.t4g.medium` initially | Current load supports it; reassess after PI data |
| Storage | gp3, 100 GiB | Match source; define IOPS/throughput explicitly |
| Autoscaling | 300 GiB maximum initially | Adjust to retention/growth forecast |
| Encryption | Customer-managed KMS key | Mandatory |
| Multi-AZ | Enabled | Mandatory |
| Public access | Disabled | Mandatory |
| Backup retention | 30-35 days | Confirm policy |
| Deletion protection | Enabled | Mandatory |
| Copy tags to snapshots | Enabled | Mandatory |
| Auto minor upgrade | Enabled with tested maintenance process | Confirm release policy |
| Performance Insights | Enabled, approved retention | Mandatory |
| Enhanced Monitoring | 60-second or better interval | Mandatory |
| Log exports | PostgreSQL and upgrade logs | Mandatory |
| IAM authentication | Evaluate for humans/tools; app may remain Secrets Manager initially | ADR required |
| CA verification | AWS RDS CA bundle, hostname verified | Mandatory |

### E.3 Parameter-group plan

Changes are tested on the clone. Initial candidates:

- `shared_preload_libraries`: `pg_stat_statements` and `pgaudit` after compatibility test.
- `log_lock_waits=on`.
- Privacy-reviewed slow query logging, initially 1,000 ms.
- Connection/disconnection logging where volume is acceptable.
- `idle_in_transaction_session_timeout`: reduce from 24 hours, proposed 60 seconds for runtime roles.
- Role-level `statement_timeout`: API 15-30 seconds; batch/analytics separately bounded.
- Role-level `lock_timeout`: proposed 3 seconds for normal DDL/DML, overridden only in reviewed migrations.
- Preserve `track_io_timing=on`, WAL I/O timing, WAL compression, and autovacuum improvements unless tests contradict them.
- Reassess `max_connections` after the proxy/pool budget; do not retain 400 by default without memory analysis.

### E.4 Data migration strategy decision

Two supported paths are planned. The Change Advisory Board chooses after rehearsal.

#### Option A — Encrypted snapshot copy and maintenance cutover (recommended if 60-120 minutes is acceptable)

1. Stop writes and confirm queue drain.
2. Create final source snapshot.
3. Copy snapshot with the target KMS key.
4. Restore target, apply target configuration, and validate.
5. Update Secrets Manager/RDS Proxy endpoint and restart/drain applications.
6. Run smoke/integrity checks and reopen writes.

Advantages: physical fidelity, simpler, no replication drift. Disadvantage: longer write outage.

#### Option B — Full load plus CDC using AWS DMS/logical replication (required for a short outage)

1. Enable/test required logical replication settings and reboot implications.
2. Full-load the target, then CDC while source remains writable.
3. Monitor lag and reconcile unsupported objects/DDL separately.
4. Freeze writes, drain queues, wait for zero lag, validate, and cut over.

Advantages: short final outage. Disadvantages: more moving parts, DDL/sequence/large-object caveats, replication configuration, and more rehearsal.

### E.5 Pre-cutover validation

- PostgreSQL version/extensions and extension versions match.
- Schema, constraints, indexes, functions, triggers, sequences, owners, grants, and RLS signatures match the approved manifest.
- Aggregate row counts and table sizes reconcile within known replication timing.
- Sequence values are at or above table maxima.
- Backup/restore succeeds from the target.
- TLS verification works from every service.
- API, workers, n8n, mobile/web, imaging, lab, payments, email, and admin smokes pass.
- Load test at 2x observed peak connections and agreed request throughput passes.
- Multi-AZ failover rehearsal passes and measured reconnect time is within RTO.
- Alarm and event-notification test messages reach on-call.

### E.6 Cutover runbook

| Relative time | Action | Go/no-go evidence |
|---:|---|---|
| T-7d | Complete rehearsal 2; freeze unrelated releases | Signed rehearsal report |
| T-24h | Confirm backups, snapshot quota, KMS, target health, rollback endpoint | CAB approval |
| T-2h | Open bridge; announce maintenance; verify observers | All owners present |
| T-30m | Pause batch/cron/n8n writers; drain queues | Queue depth stable/zero |
| T-10m | Enter application read-only/maintenance mode | Write probes rejected |
| T-0 | Final snapshot or CDC catch-up; record source LSN/time | Recovery marker recorded |
| T+15m | Switch proxy/secret/DNS endpoint; restart/drain pools | New connections target new DB |
| T+20m | Run critical smoke and aggregate integrity suite | All P0 checks green |
| T+30m | Re-enable writes gradually | Error/latency/replication dashboards green |
| T+60m | Resume jobs/integrations one group at a time | Each group verified |
| T+120m | Declare technical cutover complete | CAB/on-call sign-off |
| T+24h | End heightened monitoring; keep source read-only | No rollback trigger reached |

### E.7 Rollback

Rollback is allowed until writes are accepted on the target unless a reverse-replication plan has been rehearsed. To avoid split brain:

1. If failure occurs before target writes: point services back to source, restart/drain pools, reopen source writes, validate.
2. If target has accepted writes: stop all writers first. Use the rehearsed reverse-delta procedure or declare a recovery incident; do not simply point back and lose target writes.
3. Keep the old instance isolated/read-only for the approved rollback window, then snapshot and decommission through a separate change.

### Exit criteria

- New production is KMS-encrypted, Multi-AZ, private, monitored, deletion-protected, and autoscaling.
- Old instance is read-only and then decommissioned only after the rollback window and backup verification.
- RTO/RPO and failover evidence are recorded.

## 12. Workstream F — Backup, restore, and disaster recovery

### Objective

Turn daily backup production into proven recoverability.

### F.1 Standard backup formats

Use two complementary layers:

1. RDS automated/PITR and AWS Backup for fast physical recovery.
2. A daily logical custom-format dump for portability and object-level recovery.

Recommended logical command behavior:

- `pg_dump --format=custom --no-owner --no-acl` to a temporary restricted path.
- Check non-zero exit status and validate archive with `pg_restore --list`.
- Produce SHA-256 checksum and JSON manifest containing database, server/client version, start/end time, size, schema list, and backup role.
- Encrypt upload with SSE-KMS to the dedicated backup bucket/account.
- Delete temporary local files only after upload and remote checksum/head verification.

### F.2 Scheduling

- Replace duplicate user/root cron entries with one systemd timer or managed scheduler.
- Use a single global lock and emit start/success/failure/duration/size metrics.
- Remove stale cron entries and separately clean zero-byte artifacts after evidence preservation.
- Prevent backup and maintenance windows from competing.

### F.3 Storage and immutability

- Correct lifecycle scope to the actual object prefix.
- Use a dedicated backup account/bucket with versioning, SSE-KMS, least-privilege bucket policy, access logging, and Object Lock/Vault Lock where policy allows.
- Replicate/copy recovery points to a second AWS region and preferably a separate account.
- Define retention tiers, for example: daily 35 days, monthly 12 months, annual per legal/clinical policy. Compliance owner approves final values.
- Test KMS cross-account/cross-region grants before relying on copies.

### F.4 Restore drill

Monthly automation must:

1. Select the latest completed recovery point and logical dump.
2. Create an isolated encrypted target with no production egress.
3. Restore using the exact documented command.
4. Validate checksums, schema signatures, constraints, critical aggregate counts, extensions, owners/grants, and sequences.
5. Run sanitized application smoke tests and tenant-isolation tests.
6. Record RTO, recovery-point timestamp/RPO, failures, and cost.
7. Destroy the isolated target only after results are stored and approved.

Quarterly, run a broader scenario: AZ failover, credential loss, accidental table deletion, or regional restore.

### F.5 Backup role

- Use a dedicated login restricted by security group/source, secret policy, and schedule.
- Grant `pg_read_all_data`/sequence access and `BYPASSRLS` only if a full logical dump cannot otherwise be complete.
- No ownership, DDL, role management, or application access.
- Alarm on use outside the backup window.

### Exit criteria

- Two consecutive automated monthly restores pass.
- Runbook format matches actual artifacts.
- Cross-region/immutable copy can be read with tested KMS permissions.
- RTO/RPO meet approved objectives.

## 13. Workstream G — Observability, audit, and operations

### Objective

Make performance, availability, security, and backup failures visible before users report them.

### G.1 Metrics and alarms

Initial thresholds are starting points and must be tuned after 30 days.

| Alarm | Initial trigger | Severity |
|---|---|---|
| CPU high | >75% for 15 minutes | Warning; >90% critical |
| Freeable memory | <750 MiB for 10 minutes | Warning; <400 MiB critical |
| Free storage | <20 GiB or forecast <14 days | Warning; <10 GiB critical |
| Connections | >70% of budget for 10 minutes | Warning; >85% critical |
| Read/write latency | >20 ms sustained | Warning; >50 ms critical |
| Disk queue | >5 sustained | Warning; >10 critical |
| Failed login/auth spike | Baseline anomaly | Security |
| Deadlock | Any | Warning |
| Long transaction | >60 seconds runtime; separate batch threshold | Warning |
| Backup missing/failed | No successful daily recovery point/object | Critical |
| Replication lag | Above cutover/read-replica objective | Critical |
| RDS event | Failure, failover, maintenance, storage, deletion | Routed by category |

### G.2 Database telemetry

- Enable `pg_stat_statements`; capture query ID, normalized query, calls, total/mean/p95 proxy metrics, rows, I/O, WAL, and temp usage.
- Enable privacy-reviewed pgaudit classes for DDL, role/grant changes, and sensitive table access. Keep parameter logging off unless explicitly approved.
- Export PostgreSQL/upgrade logs with encryption, retention, access control, and alerting.
- Set `application_name` for API, workers, NestJS, n8n, migrations, backup, admin, and analytics.
- Dashboard active/idle/waiting connections, locks, long transactions, vacuum/analyze age, dead tuples, XID age, temp bytes, cache hit, WAL, checkpoint behavior, index usage, RLS denials, and migration state.

### G.3 Runbooks

Create and exercise runbooks for:

- Connection exhaustion.
- Blocking locks/long transaction.
- High CPU/slow query.
- Storage exhaustion.
- Failed backup/restore.
- RDS failover/unavailable.
- Suspected cross-tenant access.
- Credential leak.
- Failed/dirty migration.
- Catalog/index explosion recurrence.

### Exit criteria

- Synthetic alarm tests reach the correct on-call channel.
- A slow-query and lock test are diagnosable from dashboards without database superuser access.
- Audit events for DDL/role changes are immutable and searchable under approved retention.

## 14. Workstream H — Catalog, constraints, indexes, and data integrity

### Objective

Repair proven integrity defects and remove pathological catalog growth without indiscriminate optimization.

### H.1 Stop the source first

No duplicate constraint/index cleanup starts until:

- Runtime alter/force sync is disabled.
- Restart tests show index counts stable.
- The affected service/model is mapped to the correct table and unique constraint.
- A restore of the current backup succeeds.

### H.2 Duplicate unique-constraint cleanup

For `user_notification_preferences`:

1. Verify the table is still empty/currently unused at execution time.
2. Identify the one canonical constraint/index and all dependent objects.
3. Generate a deterministic manifest of constraints to drop; checksum and review it.
4. Test batches on a production clone and measure catalog locks, WAL, CPU, and time.
5. Drop in small batches during a maintenance window with low `lock_timeout`; stop on blocking or error.
6. Verify the canonical uniqueness rule, index count, catalog size, backup, restore, and three application restarts.

Do not issue one unbounded transaction containing 13,305 drops.

### H.3 Other duplicate indexes

- Compare full access method, columns/order, opclasses, collations, predicates, expressions, included columns, uniqueness, options, constraint ownership, validity, and usage.
- Keep indexes supporting constraints or distinct query order/predicate semantics.
- Remove non-constraint duplicates only through reviewed concurrent/lock-aware operations.
- Re-measure write latency, WAL, backup size, and query plans.

### H.4 Foreign keys

1. Repair/archive the 96 notification orphans according to data-owner policy; never silently invent a user.
2. Re-run aggregate orphan checks under a consistent snapshot.
3. Validate the eight currently clean FKs, then the notification FK.
4. For 247 missing-leading-index candidates, rank using child row count, parent update/delete rate, join/query use, and index overlap.
5. Create only justified indexes, preferably concurrently, and monitor usage for 30-60 days.

### H.5 Empty/obsolete table review

For each of 459 estimated empty tables:

- Confirm exact count under approved conditions.
- Search code, views, functions, triggers, FKs, grants, jobs, BI, and external integrations.
- Assign owner and status: active-empty, future-approved, legacy, duplicate, backup artifact, or unknown.
- Rename/move candidates to a quarantine schema first when feasible.
- Drop only after a full release cycle and restore validation.

### H.6 Continuous integrity gates

- Zero invalid indexes.
- Zero unexplained unvalidated constraints.
- No duplicate exact indexes beyond approved exceptions.
- No tenant key nulls outside classified global tables.
- Sequence headroom checks.
- Orphan checks for critical FKs.
- Migration ledger clean and checksums valid.

## 15. Workstream I — Connection pools, TLS, and query limits

### Objective

Prevent connection storms and standardize database behavior across every service.

### I.1 Pool inventory and budget

Build a live matrix of process count × pool max × deployment replicas. Proposed initial direct/proxy client budgets:

| Service | Proposed pool max per process | Notes |
|---|---:|---|
| Express API | 10-15 | Measure concurrency; min 0 |
| NestJS | 10 | Include Prisma behavior/connection limit |
| Worker process | 5 each | Two current workers; isolate long jobs |
| n8n | 5-10 | Separate role/schema |
| Control plane/admin | 3-5 | Separate admin role/pool |
| Cron/batch | 2-5 | Dedicated bounded pool |
| Analytics/read-only | 2-5 | Statement timeout appropriate to workload |
| DBA/break-glass reserve | 20+ server slots | Never consumed by app budget |

Final numbers follow load tests. The sum under maximum replica count must remain below the approved database/proxy budget with at least 20-30% emergency headroom.

### I.2 One pool abstraction per process

- Raw `pg` paths share one instrumented pool unless an explicitly approved workload pool exists.
- Sequelize/Prisma pool behavior is configured from the same central budget.
- Route modules and middleware never instantiate pools.
- Batch pools are smaller and use distinct `application_name` and timeouts.
- Graceful shutdown drains pools; readiness fails when DB unavailable; liveness does not trigger restart storms unnecessarily.

### I.3 Standard connection settings

- TLS with AWS RDS CA and hostname verification; remove `rejectUnauthorized:false`.
- `application_name` identifies service, environment, and process type without PII.
- Connection timeout 5-10 seconds.
- API statement timeout 15-30 seconds; batch-specific bounded timeout.
- Lock timeout approximately 3 seconds for normal application/migration attempts unless reviewed.
- Idle-in-transaction timeout approximately 60 seconds for runtime roles.
- TCP keepalive and retry behavior reviewed; never automatically replay non-idempotent writes.
- Transactions have explicit boundaries and always release after rollback/commit.

### I.4 Proxy decision

Recommended: use RDS Proxy when the encrypted target is built, provided transaction-local GUC behavior and prepared statements are validated under session pinning. If proxy behavior conflicts with RLS context or workload requirements, use a reviewed PgBouncer mode or direct bounded pools. The decision must be load-tested; it is not assumed.

### Exit criteria

- Peak test at two times observed concurrency remains below budget.
- No blank application names.
- Certificate verification succeeds and non-verifying configurations fail CI.
- Pool restarts do not exceed connection alarms or leak RLS context.

## 16. Workstream J — Partitioning, temporal types, schema normalization, and retention

### J.1 Partition decision

For each shadow partition family, decide **use** or **remove**.

Use partitioning only when it improves retention, pruning, maintenance, or operational isolation. If retained:

- Migrate the real active table through an online shadow/cutover design.
- Provide a default partition.
- Automate creation at least three months ahead.
- Monitor missing future partitions.
- Define partition-compatible PK/unique constraints and FK implications.
- Attach retention/archive rules approved by compliance.

If not retained, remove empty parents/children only after dependency review and backup restore.

The 497 MB `audit_logs` table receives a specific retention/partition ADR because it is the actual large table; the empty `platform_audit_logs_partitioned` family is not assumed to solve it.

### J.2 Time-type conversion

Adopt these standards:

- `timestamptz` for an instant.
- `date` for a calendar date.
- `time` plus IANA timezone for recurring local schedules.
- UTC in database/API payloads; convert at presentation boundaries.

Prioritize appointments, reminders, clinical events, payments, audit records, and integration timestamps. Each conversion uses:

1. Documented interpretation of existing naive values.
2. New `_utc`/canonical column.
3. Dual-write and parity monitoring.
4. Backfill in batches.
5. Reader switch.
6. Constraint/default/index migration.
7. Old-column removal in a later release.

### J.3 Duplicate semantic columns

Start with:

- `doctors.unique_id` versus `doctors."uniqueId"`.
- Three duplicate emergency-triage fields on `users`.
- Overlapping patient/user references and repeated appointment identity fields after domain review.

For each pair, choose a source of truth, reconcile mismatches with a business owner, add parity alerts, migrate all readers/writers, then remove the alias through expand/contract.

### J.4 Naming and schema domains

- All new identifiers use lowercase snake_case.
- Define bounded schemas such as `app`, `clinical`, `imaging`, `billing`, `integration`, `audit`, and `n8n` only after dependency analysis; do not mass-move tables in this program’s critical phases.
- Qualify object names in SQL and secure `search_path`.
- Assign every table to a service/domain owner and lifecycle state.

### J.5 Documentation

Replace contradictory architecture claims with:

- System-of-record ADR.
- Current logical/physical data-flow diagram.
- Tenancy and role model.
- Migration policy.
- Backup/restore and RTO/RPO runbook.
- RDS operations/failover runbook.
- Data classification and retention registry.
- Schema/domain ownership catalog.

Legacy documents are marked superseded with links, not silently left as current.

## 17. Test strategy

### 17.1 Environments

| Environment | Data | Purpose | Network |
|---|---|---|---|
| Unit/CI | Synthetic only | Migration build, policy and repository tests | No production access |
| Integration | Synthetic multi-tenant | API/job negative tests | Isolated |
| Restore staging | Sanitized or tightly controlled production restore | Upgrade, cleanup, restore, performance rehearsal | Private; restricted; audited |
| RDS cutover target | Production copy under change controls | Final validation | Production VPC controls |
| DR drill | Backup-derived isolated target | Recovery proof | No production write path/egress |

Production data in non-production requires privacy approval, encryption, access logging, time-bounded access, and destruction evidence. Prefer irreversible sanitization where fidelity permits.

### 17.2 Test suites

| Suite | Required coverage |
|---|---|
| Migration | Empty build, upgrade from current, repeated deploy, failure/dirty state, checksum drift |
| RLS | Cross-tenant CRUD, null context, pool reuse, admin separation, workers/webhooks/n8n |
| Integrity | Orphans, constraints, sequences, null tenant keys, duplicate-column parity |
| Performance | 2x peak load, connection storms, long query, batch contention, failover recovery |
| Backup | Archive validation, checksum, physical restore, logical restore, PITR, cross-region read |
| Application | Authentication, appointments, prescriptions, clinical records, imaging, lab, billing, notifications, integrations |
| Security | Grants, DDL denial, schema shadowing, leaked credential rejection, TLS verification, audit trail |
| Operations | Alarm delivery, failover, rollback, migration failure, backup failure, lock incident |

### 17.3 Production canary metrics

For every canary compare against the seven-day baseline:

- HTTP 4xx/5xx and authorization denials.
- DB error codes, especially RLS/permission, syntax, timeout, serialization, and constraint failures.
- Query latency p50/p95/p99 and throughput.
- Connections, waiting clients, CPU, memory, storage, I/O latency, queue depth, locks, and long transactions.
- Queue backlog and integration retry/failure rate.
- Tenant-isolation synthetic probes.

Rollback occurs on any cross-tenant visibility, unexplained write denial, sustained P95 regression over the approved threshold, error-budget breach, connection saturation, or integrity mismatch.

## 18. Deployment and rollback standards

### 18.1 Expand/contract release pattern

1. **Expand:** add compatible object/column/index/policy support.
2. **Dual support:** deploy writers/readers compatible with old and new.
3. **Backfill:** resumable batches with progress and throttling.
4. **Validate:** parity and integrity gates.
5. **Switch:** change reads/traffic under a feature flag or controlled deployment.
6. **Observe:** retain rollback compatibility for at least one release.
7. **Contract:** remove legacy object in a separate approved migration.

### 18.2 Migration safety template

Each migration must define:

- `statement_timeout` and `lock_timeout` appropriate to the operation.
- Expected lock level and table size.
- Idempotency/retry behavior.
- Backfill batch key, size, sleep/throttle, and resume marker.
- Pre/post row and constraint counts.
- Roll-forward and rollback path.
- Whether transaction wrapping is supported.
- Monitoring queries that expose only metadata/aggregates.

### 18.3 No-go operations without a dedicated plan

- Unbounded table rewrite on a live core table.
- `DROP TABLE/COLUMN` in the same release that stops its use.
- `CREATE INDEX` non-concurrently on a large active table.
- Constraint validation without lock/load rehearsal.
- Mass RLS enablement.
- Simultaneous RDS cutover and broad application/schema refactor.
- Reusing the old writable database after target writes have begun.

## 19. Risk register

| Risk | Probability | Impact | Mitigation | Trigger/response |
|---|---:|---:|---|---|
| RLS activation blocks legitimate traffic | High | Critical | Route inventory, staging restore, canary batches | Disable affected batch and fix context; do not restore fail-open text permanently |
| RLS still permits cross-tenant access | Medium | Critical | Role separation, negative tests, synthetic probes | Stop rollout, maintenance mode, incident response |
| Credential rotation causes outage | Medium | High | Dual-secret/role rollout and pool drain | Switch to second new credential; never leaked credential |
| Encrypted RDS cutover loses writes | Low-medium | Critical | Write freeze, LSN marker, queue drain, rehearsal | Stop writers and execute approved rollback/delta recovery |
| Multi-AZ/proxy changes latency | Medium | Medium | Load and failover tests | Reconfigure proxy/pools or defer proxy |
| Duplicate-index cleanup blocks catalog | Medium | High | Source stop, clone timing, small batches, low lock timeout | Stop batch and release lock |
| Backup cannot restore | Medium until proven | Critical | Gate G1 before destructive work | Halt program; repair backup first |
| Logging captures PHI | Medium | High | Parameter logging off, privacy review, access control | Disable offending log, contain/delete under policy |
| Migration baseline misstates live schema | Medium | High | Object mapping, checksums, clone build/upgrade | Block deployment and reconcile ledger |
| Timestamp conversion shifts appointments | Medium | High | Explicit zone interpretation and dual-column parity | Roll back reader, correct mapping |
| Cost exceeds estimate | Medium | Medium | Tagging, budgets, staged resource creation | Review scope; do not weaken mandatory controls |
| Team executes plan out of order | Medium | High | Gates, CAB, protected deployment roles | Revoke change access and reassess state |

## 20. Audit-to-plan traceability

| Audit finding | Primary workstreams | Controlling gates | Closure evidence |
|---|---|---|---|
| F-01 Tenant isolation fail-open/bypassable | A, C, D, I | G2, G5, G7 | Table registry, role grants, RLS signatures, cross-tenant test pack |
| F-02 Tracked credentials | B | G0, G7 | Rotation records, old-secret rejection, clean repository/history scans |
| F-03 Unencrypted RDS/backups | E, F | G3, G4, G7 | KMS-encrypted target and recovery points, cutover/restore evidence |
| F-04 Runtime DDL/migration and index explosion | A, C, H | G1, G6, G7 | Stable index counts, one clean ledger, restart/no-DDL tests |
| F-05 Single-AZ/destructive-action exposure | E, F, G | G3, G4 | Multi-AZ/deletion protection/autoscaling and failover drill |
| F-06 Recovery controls inconsistent | F | G1, G4, G7 | Format-compatible runbook and two successful restore drills |
| F-07 Observability absent | G, E | G3, G7 | PI/logs/alarms/events/statements and synthetic alert proof |
| F-08 Integrity/FK index gaps | H | G1, G6 | Orphan disposition, nine validated FKs, reviewed index decisions |
| F-09 Pool fragmentation | I, E | G3, G4, G7 | Budget matrix, consolidated pools, 2x peak test |
| F-10 Excess runtime privileges | D, C | G2, G5 | Owner/migrator/runtime separation and DDL-denial tests |
| F-11 Unused partition scaffolding | J, H | G1, G6 | Partition ADR and executed retain/migrate/remove disposition |
| F-12 Time/duplicate-column drift | J | G7 | Canonical columns, parity evidence, phased conversions |
| F-13 Documentation contradiction | C, J | G7 | Approved current ADRs/runbooks and superseded legacy docs |
| F-14 Default RDS/maintenance/TLS gaps | E, G, I | G3, G4 | Custom groups, patch evidence, tags, CA verification |

Every audit finding has an implementation owner and objective evidence path. A finding may be closed only by its accountable owner and auditor/reviewer; completing a workstream does not automatically close every linked finding.

## 21. Indicative delivery schedule

| Week | Milestones |
|---:|---|
| 0 | Owners, incident/change records, freeze, baseline, snapshot, temporary alarms |
| 1 | Secret rotation wave 1, runtime DDL disabled, restore staging created, restore drill 1 |
| 2 | Migration ADR/baseline, role design, unified context wrapper, RLS test registry |
| 3 | Target RDS IaC deployed, monitoring/logging enabled, application TLS/pool changes in staging |
| 4 | RDS rehearsal 1 and 2, failover/load/restore tests, cutover approval |
| 5 | Encrypted Multi-AZ production cutover and heightened monitoring |
| 6 | RLS batch D1, integrity repair, duplicate-index cleanup rehearsal |
| 7 | RLS batch D2, validate FKs, begin production catalog cleanup batches |
| 8 | RLS batch D3, backup immutability/cross-region, pool consolidation |
| 9-10 | RLS D4, partition/retention decisions, duplicate-column expand migrations |
| 11-12 | Documentation closure, DR drill 2, residual-risk review, 30-day control window begins |

Schedule dates depend on staffing, maintenance windows, privacy approval for restore staging, and selected RDS migration option.

## 22. Planned implementation artifacts

These artifacts are deliverables of execution, not created by this planning-only step:

1. `docs/architecture/ADR-postgresql-system-of-record.md`
2. `docs/architecture/ADR-database-tenancy-and-roles.md`
3. `docs/architecture/ADR-database-migrations.md`
4. `docs/database/TABLE_CLASSIFICATION_REGISTRY.csv`
5. `docs/deployment/RDS_ENCRYPTED_CUTOVER_RUNBOOK.md`
6. `docs/deployment/POSTGRES_BACKUP_RESTORE_RUNBOOK.md` replacement
7. `docs/operations/POSTGRES_INCIDENT_RUNBOOKS.md`
8. `database/migrations/` canonical migration tree and validation scripts
9. `infrastructure/rds/` IaC module and environment definitions
10. `server/db/` unified transaction/context/pool adapter
11. CI migration, drift, RLS, secret, and restore gates
12. Dashboards, alarms, event subscriptions, and audit-log retention configuration
13. RDS rehearsal, cutover, failover, and restore evidence packs
14. Constraint/index cleanup manifests with checksums
15. Final residual-risk and control-acceptance report

## 23. Program acceptance criteria

### Security and tenancy

- 100% of tables classified.
- 100% of tenant-owned tables enforced by RLS or an approved equivalent boundary.
- Missing context denies; no policy permits access because context is empty/null.
- Ordinary runtime cannot DDL, create in `public`, own objects, bypass RLS, or invoke admin policy.
- Admin runtime uses a separate role, pool, secret, route boundary, and audit trail.
- Cross-tenant CRUD tests pass for APIs, workers, webhooks, n8n, and direct repositories.
- Confirmed leaked credentials are rotated and rejected; repository scans pass.

### RDS and recovery

- Production RDS and snapshots are KMS-encrypted.
- Multi-AZ, deletion protection, storage autoscaling, private subnets, custom groups, tags, logs, PI, and Enhanced Monitoring are enabled.
- Alarms/events reach on-call and are tested.
- Physical/PITR and logical backups meet retention policy.
- Two consecutive isolated restore drills and one failover drill meet approved RTO/RPO.
- Immutable/cross-region recovery points are readable with tested KMS permissions.

### Change and schema integrity

- No runtime/startup DDL.
- One migration ledger is authoritative, checksum-valid, and clean.
- Clean build and production-clone upgrade pass.
- Duplicate unique-constraint explosion is removed and index count remains stable across three releases.
- All nine audited FKs are validated after approved data repair.
- No unexplained orphan/null-tenant integrity failures.
- Empty/partitioned/legacy tables have recorded owner and disposition.

### Performance and operations

- Connection budget survives 2x observed peak with emergency reserve.
- All connections identify application name and verify TLS certificates.
- Role-specific timeouts are active and tested.
- `pg_stat_statements`, approved audit telemetry, dashboards, and runbooks are operational.
- Thirty days pass without critical regression, unledgered DDL, tenant probe failure, missed backup, or uncontrolled index growth.

## 24. Definition of done and authorization boundary

The implementation program is complete only when all acceptance evidence is attached to the master change epic, residual risks are explicitly accepted by the accountable owners, and the old unencrypted RDS instance and obsolete credentials are decommissioned through separate approved changes.

This document is the required plan-first deliverable. The next step is a stakeholder review that assigns names, selects the RDS migration option, approves RTO/RPO and retention objectives, and authorizes only Phase 0/Phase 1. No later phase should inherit authorization automatically.
