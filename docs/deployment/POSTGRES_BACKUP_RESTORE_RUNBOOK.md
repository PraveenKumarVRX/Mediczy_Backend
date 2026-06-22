# GAP-OPS-001 — PostgreSQL backup & restore runbook

## Backup (daily)

```bash
pg_dump -h $POSTGRES_HOST -U $POSTGRES_USER -Fc $POSTGRES_DATABASE > backup_$(date +%Y%m%d).dump
```

## Restore (staging drill)

```bash
pg_restore -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DATABASE --clean backup_YYYYMMDD.dump
```

## Verification

- Run `node server/scripts/migrate-all.mjs status`
- Run `node server/scripts/qa/hospital-portal-smoke.mjs`
