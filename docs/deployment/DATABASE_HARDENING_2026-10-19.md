# Database hardening — 19 October 2026

This change follows the user's instruction to fix database hardening after the explicitly authorized live nursing release. The application remains at https://app.mediqzy.com. This is an operations record, not clinical approval.

## Applied controls

- `mediczy_clinical_owner` is a no-login, non-superuser, non-bypass role with no members. It owns 23 clinical tables, their dependent sequences, and three immutable-history trigger functions. The ordinary runtime has bounded DML and sequence usage, with no table ownership, TRUNCATE, trigger creation, grant option, or owner-role membership on these objects. Audit, infusion and goal-evaluation streams additionally deny UPDATE/DELETE.
- `public` belongs to the deployment administrator; PUBLIC cannot create in it. The application cannot drop the schema to destroy protected records. Legacy runtime CREATE is explicitly retained pending removal of request-time DDL.
- The three clinical trigger functions have a fixed `pg_catalog` search path. The two existing elevated public helpers (`decrypt_phi` and `get_tenant_scope`) now run with invoker privileges and fixed search paths; PUBLIC execution is revoked.
- The runtime retains NOSUPERUSER, NOBYPASSRLS, NOCREATEDB and NOCREATEROLE. New connections have a 60-second idle-in-transaction limit and 10-second lock timeout. No global query timeout was imposed on background jobs.
- Primary Node pools, OAuth/database pools, threat-intelligence persistence, tenant connection factories and the SIB Python client use certificate and hostname verification. The regional AWS RDS CA bundle is checked in; `POSTGRES_SSL_CA_FILE` supports a replacement trust bundle. URI SSL options cannot override the primary pools' verification. Local disposable databases remain supported.
- RDS now manages the administrator credential in Secrets Manager, with automatic seven-day rotation. A real connection using the managed secret passed; the old password was rejected and `/mediczy/prod/RDS_MASTER_PASSWORD` was deleted. The runtime loader also removes privileged DB credentials from inherited environments and excludes them from SSM injection.
- Backup helpers resolve managed credentials, select PostgreSQL 18 tools and use `verify-full`. The canonical Ubuntu nightly schedule runs `scripts/backup/encrypted-nightly-backup.sh`; the duplicate root dump was removed. Legacy local backup directories are mode 0700 and their files are 0600. A real 383 MB encrypted archive was uploaded and all three versioned KMS objects were verified in `mediqzy-database-backups-480664947830-ap-south-1`. No existing backup was deleted. The old blanket ownership repair and wholesale UAT-to-production replacement are disabled before mutation.

The SQL is [nursing-ownership.sql](../../infra/database/nursing-ownership.sql), applied using [the guarded deployment runner](../../server/scripts/ops/harden-nursing-database.mjs). It takes a five-second lock timeout, runs atomically, checks the exact RDS target and requires an available recovery snapshot under one hour old. Without `--apply`, it rehearses and rolls back.

## Encrypted recovery and replacement

- Fresh pre-change snapshot: `database-hardening-pre-20261019`.
- Encrypted copy: `database-hardening-encrypted-20261019`, using rotating customer key `alias/mediqzy-database`.
- Recovery infrastructure: CloudFormation stack `mediqzy-database-hardening`, [template](../../infra/database/recovery.cloudformation.json).
- Replacement: `mediczy-prod-encrypted-20261019`, stack `mediqzy-encrypted-database`, [template](../../infra/database/encrypted-target.cloudformation.json). The requested configuration is private, KMS-encrypted, Multi-AZ, deletion-protected, 30-day backups and storage autoscaling to 200 GiB, with forced TLS/SCRAM defaults. A replacement's creation status is not evidence that it serves traffic.
- [Recovery dump](../../server/scripts/ops/database-recovery-dump.mjs) uses pg_dump 18 and streams its complete custom-format archive through AES-256-GCM with a KMS-wrapped data key. Plaintext SQL and encryption keys never reach the filesystem. Owner, ACL and RLS definitions are preserved. The successful encrypted archive is about 383 MB.
- [Restore rehearsal](../../server/scripts/ops/database-recovery-restore.mjs) verifies the entire GCM artifact before sending SQL, then restores in one transaction into a dedicated verification database on the isolated encrypted target. It defaults to a separate rehearsal database. Its explicit target-replacement mode requires a freshly fenced source and exact counts, refuses connected target clients, and cannot replace the source. Routing is handled by the separate guarded cutover script.

**Traffic switch and restore completion must be read from the machine verification record, not inferred from infrastructure creation.** Current operation evidence is private under `/home/ubuntu/database-hardening-evidence/20261019`; it includes encrypted backups, private deployment logs and access files and must not be published.

Six CloudWatch RDS metric alarms are deployed for the replacement. They have no notification destinations, matching the old configuration; on-call delivery is not claimed.

The SIB source lives in an ignored runtime directory. Its exact before/after hashes are recorded privately, and the repeatable one-line change is [sib-verified-tls.patch](../../infra/database/sib-verified-tls.patch). Its tracked startup wrapper loads only runtime database SSM values and sets the CA bundle. A real asyncpg connection proved certificate and hostname verification with TLS 1.3.

## Validation

Eight TLS/secret-policy tests pass. Eleven focused nursing suites / 130 tests pass (the existing Jest process reports an open-handle warning). The disposable PostgreSQL upgrade, ownership, negative privilege, isolation, concurrency and recovery suite passes 36 scenarios. Live checks verify 23 protected owners, six denied DDL/owner operations, populated RLS denial, verified TLS 1.3 and ordinary runtime flags. The real ten-step synthetic nursing API walkthrough passes after ownership changes, and browser/login shells and health remain available.

## Remaining boundaries

This is a bounded clinical ownership migration. The remaining legacy runtime-owned objects and 97 files containing 286 CREATE TABLE statements have not been converted to deployment migrations. They must be migrated and tested before globally revoking runtime schema CREATE and ownership. Medication/core legacy tables do not gain new RLS merely by changing owners; existing route scoping remains relevant. Custom tenant GUCs are defense against missing filters, not an identity boundary against arbitrary SQL execution.

Administrator secret injection has been removed; complete IAM/process separation still requires removing shared privileged AWS credentials and isolating migration/backup identities from application processes. Existing IAM access is not claimed to have been redesigned by this change. Historical unencrypted snapshots require deliberate encrypted retention/decommissioning; no recovery history is deleted automatically.

Human clinical acceptance remains pending separately. Do not mark the comprehensive database remediation program or clinical acceptance complete on the basis of these checks.
