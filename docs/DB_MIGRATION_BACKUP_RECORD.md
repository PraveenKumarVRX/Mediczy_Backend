# DB Migration Backup Record

Date: 2026-05-31
Purpose: Pre expand-contract migration backup before any DB schema changes.

## Confirmed Backup

RDS snapshot was created and reached `available` status.

- DB instance: `mediczy-uat`
- Engine: `postgres`
- Allocated storage: `50 GB`
- Snapshot ID: `mediczy-uat-pre-expand-contract-20260531-122305`
- Snapshot create time: `2026-05-31T12:23:09.567000+00:00`
- Final status: `available`

## Notes

- No migration SQL was executed after this backup.
- A local `pg_dump` attempt was started first, but it is not a valid complete backup because it stopped on an existing RLS-protected table: `public.api_lab_bookings`.
- The RDS snapshot is the authoritative backup for this rollout step.

## Next Safe Step

Restore this snapshot into a separate staging/UAT validation database, then run additive migrations there first.
Do not run RLS or partitioning directly on production until staging validation passes.
