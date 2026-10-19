# Encrypted PostgreSQL cutover

Production change: 19 October 2026. The user authorized live work without staging and subsequently requested database hardening. This runbook records the bounded migration from `mediczy-prod` to `mediczy-prod-encrypted-20261019`; it does not authorize deletion of recovery history.

## Before the write pause

1. Apply and verify the bounded clinical ownership/TLS change described in [the hardening record](DATABASE_HARDENING_2026-10-19.md).
2. Wait for `mediqzy-encrypted-database` to reach CREATE_COMPLETE. Verify private access, KMS encryption, Multi-AZ, deletion protection, 30-day backups, autoscaling and an active managed administrator secret. Keep application traffic on the source.
3. Capture an authenticated encrypted full pg_dump 18 through `server/scripts/ops/database-recovery-dump.mjs`. It uses an exported repeatable-read snapshot for table counts and the dump. Keep all evidence outside the served checkout, mode 0700/0600.
4. Restore it with `server/scripts/ops/database-recovery-restore.mjs` into `hardening_restore_verification` on the isolated target. Verify exact row counts, sequence positions, protected owners, forced RLS and signed history. The encrypted GCM artifact must authenticate in full before SQL reaches PostgreSQL. A failed restore is investigated before any source write pause.
5. Install/test the reversible Nginx flag gate in the two Mediczy catch-all servers: `/home/ubuntu/database-maintenance.flag` returns 503 for backend proxy locations. Without the flag, existing behavior is unchanged. Save the prior Nginx configuration privately and run `nginx -t` before reload.
6. Run the cutover script without `--apply`. It verifies the exact isolated backend, current SSM target, target security, completed restore, expected PM2 processes and source writer addresses. Unexpected writers stop the operation.

The four database services are `mediczy-server`, `mediczy-worker`, `feedback-intelligence`, and `sib-fastapi`. n8n is configured to use its existing SQLite database; unrelated AI workers remain outside the database pause. Runtime host/password values are never printed or placed in command arguments.

## Fenced final copy

Invoke from the repository root after the preceding checks:

```bash
node server/scripts/ops/database-encrypted-cutover.mjs \
  --evidence /home/ubuntu/database-hardening-evidence/20261019

node server/scripts/ops/database-encrypted-cutover.mjs --apply \
  --evidence /home/ubuntu/database-hardening-evidence/20261019
```

The script:

1. Saves process/env/SSM rollback state privately; enables the 503 gate; verifies it; stops the four services.
2. Sets the source application role NOLOGIN and terminates its existing sessions. No source data is deleted. Unknown writer identities/hosts fail preflight. The source administrator is used solely for deployment/recovery operations.
3. Captures a fresh encrypted full dump under the write fence. Its receipt proves the runtime was fenced and records exact row counts and sequence positions.
4. Replaces only the **unrouted encrypted target's** `mediczy_prod`. The restore command refuses source replacement, an unfenced source, an archive without a fence/count manifest, a target with connected clients, invalid ciphertext or an unprotected target. It validates every recorded table count and sequence value before promotion.
5. Updates both primary/discrete SSM hosts, the RDS instance identifier, production `.env` targets and the affected PM2 environments. It restores the runtime transaction/lock limits on the target; ordinary runtime credentials retain their existing value.
6. Starts services against the encrypted target; checks internal health; removes the API maintenance flag and saves PM2. The source application role stays NOLOGIN to prevent stale clients from writing to the old database.

Afterward, re-run real demo login/worklist/signing/immutability/vitals/handover/export, image storage, database privilege/RLS probes, public health and worker checks. Verify active sessions and SSM/local targets refer to the encrypted instance. Keep a post-cutover recovery snapshot and move RDS monitoring dimensions to the active identifier.

## Rollback boundary

Before services start against the replacement, a failure restores the original SSM/env values, re-enables the source runtime login, starts the prior services and lifts maintenance. Newly introduced SSM parameters are removed during that rollback.

**After services start, automatic rollback to the old data is prohibited.** Startup jobs or requests may already have written to the replacement. Keep the source fenced and repair forward. A reverse migration requires another write fence and a fresh, verified copy of the latest encrypted database. Restoring an earlier snapshot over later clinical writes is never an application rollback.

The old source and historical snapshots are retained for recovery. Encryption does not retroactively encrypt that retained history. Decommissioning follows a separate retention/recovery decision; the cutover script does not delete either instance.

AWS confirms that existing unencrypted RDS storage is migrated by creating an encrypted snapshot copy and restoring a new instance; it cannot be enabled in place. [RDS encryption documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html). Certificate and hostname validation follow [AWS PostgreSQL TLS guidance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html).
