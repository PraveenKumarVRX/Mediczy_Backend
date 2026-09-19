# GAP-OPS-001 — PostgreSQL backup & restore runbook

**Corrected 2026-09-18** — this runbook previously documented a `pg_restore`
procedure against a custom-format (`-Fc`) dump, but the actual production
backup jobs (`scripts/database/backup-database.sh`,
`scripts/backup/daily-offsite-backup.sh`, cron `0 2 * * *`) produce
**plain-SQL, gzip-compressed** dumps (`mediczy_db_<timestamp>.sql.gz`).
`pg_restore` cannot read a plain-SQL file — running the old command against
a real backup would fail. This version documents the restore procedure that
actually matches the real backup format.

## Backup (daily, as actually run in production)

The real, scheduled command (see `scripts/database/backup-database.sh`):

```bash
pg_dump -h $POSTGRES_HOST -U $POSTGRES_USER $POSTGRES_DATABASE > mediczy_db_$(date +%Y%m%d_%H%M%S).sql
gzip -f mediczy_db_*.sql
```

Produces `mediczy_db_<timestamp>.sql.gz` — plain SQL text, not a `pg_restore`-compatible archive.

## Restore (staging drill)

```bash
gunzip -c mediczy_db_YYYYMMDD_HHMMSS.sql.gz | psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DATABASE
```

**Do not use `pg_restore` against these files** — it will fail with "input
file does not appear to be a valid archive." If a custom-format (`-Fc`)
archive is ever produced instead (e.g. for a faster parallel restore), the
backup script must be changed to `pg_dump -Fc` first, and this runbook
updated to match — the two must never drift apart again.

## Verification

- Run `node server/scripts/migrate-all.mjs status`
- Run `node server/scripts/qa/hospital-portal-smoke.mjs`

## Outstanding gap (not fixed by this correction)

Per `docs/audits/POSTGRESQL_RDS_MICROAUDIT_2026-09-01.md`: this restore
procedure has never actually been run as a drill against production data,
there is no RDS read replica / automatic failover, and RTO/RPO targets in
`docs/deployment/PRODUCTION_CHECKLIST.md` were not derived from a real
business-impact analysis. Fixing the documented command doesn't substitute
for actually running the drill once — that's the next real step here.
