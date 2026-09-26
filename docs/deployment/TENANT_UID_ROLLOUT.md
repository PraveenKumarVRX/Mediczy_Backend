# Imaging tenant UID rollout

Problem: imaging data is keyed by an integer `tenant_id` (a lab id) and integers are not unique across account tables
(hospitals, labs and users all contain 70, 2368, 2429, 2433; lab ids 1–57 also exist as platform tenants). The fix is a typed
registry, `imaging_tenants (kind, source_id, uid)`, where a lab's tenant UID **is** `labs.uid`. See
`server/migrations/20260926000005-imaging-tenant-registry.migration.js` (supersedes the unapplied 20260926000004 drafts).

Scope decision: imaging only. Hospital tenancy (`organization_id` + RLS) is NOT being converted to UIDs — that leak was a code
fallback, now fixed and pinned by tests. Revisit only if a second real collision appears.

## Step 0 — read-only measurements (run as the app role; nothing is changed)
```sql
SELECT relname, n_live_tup FROM pg_stat_user_tables
 WHERE relname IN ('hg_dicom_studies','hg_dicom_instances','hg_dicom_worklist','hg_dicom_reports','hg_dicom_access_log','ris_studies');
SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('hg_dicom_studies','hg_dicom_instances','hg_dicom_worklist','hg_dicom_reports','hg_dicom_access_log','ris_studies','labs');
SELECT current_user, version();
SELECT count(*) FROM pg_stat_activity WHERE state <> 'idle';
```
The app role must OWN these tables (ALTER/TRIGGER need it). If not, stop and fix ownership first.

## Step 1 — rehearse on real data (RDS snapshot restore; never on production)
```bash
aws rds describe-db-snapshots --db-instance-identifier mediczy-prod --query 'reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[0].DBSnapshotIdentifier'
aws rds restore-db-instance-from-db-snapshot --db-instance-identifier mediczy-uid-rehearsal \
  --db-snapshot-identifier <snapshot> --db-instance-class db.t4g.medium --no-multi-az --publicly-accessible false
aws rds wait db-instance-available --db-instance-identifier mediczy-uid-rehearsal
# from this host (same VPC), with the restored instance's endpoint and credentials — NOT the production ones:
REHEARSAL_ALLOW_REMOTE=snapshot-restore DRYRUN_HOST=<endpoint> DRYRUN_DATABASE=<db> DRYRUN_USER=<u> DRYRUN_PASSWORD=<p> DRYRUN_SSL=true \
  node -e "import('./migrations/20260926000005-imaging-tenant-registry.migration.js').then(m=>m.up()).then(()=>process.exit(0))"
# then scripts/ops/verify-tenant-uid.mjs against the same env; record the timings.
aws rds delete-db-instance --db-instance-identifier mediczy-uid-rehearsal --skip-final-snapshot   # cost stops here
```
(`scripts/qa/tenant-uid-rehearsal.mjs` is the synthetic version for a local scratch database: 225k rows, concurrent writer,
idempotence, rollback.) Gate: verifier exits 0; no INVALID indexes; timing acceptable.

## Step 2 — apply to production, then verify, THEN deploy the code that reads it
1. Off-peak. Run a wrapper that imports `up()` (the ssm loader makes `argv[1]` the loader, so a self-run guard would not fire).
2. `scripts/ops/verify-tenant-uid.mjs` must exit 0. Review the "ambiguities" list (ids that are both a lab and a platform
   tenant): confirm each is a lab and `UPDATE imaging_tenant_ambiguities SET reviewed = true`.
3. Rows reported as "keyed by an id that is not a lab" stay NULL and become invisible to UID reads: resolve (assign or
   archive) or record an explicit decision before the contract phase.
4. Only now deploy code that requires `imaging_tenants` (`resolveImagingTenant`, `tenantUid` claims). That code must not ship first.

## Step 3 — contract phase, one table at a time
1. Reads accept `tenantUid` alongside the integer; log every request where they disagree.
2. After a week with no disagreement: switch reads to `tenant_uid` only, table by table.
3. Last: drop the integer fallback.

## Rollback
The old integer columns and route checks keep working throughout. `down()` removes triggers, indexes, `tenant_uid`
columns and the registry (keeps `labs.uid`). Because a lab's tenant UID is `labs.uid`, re-applying after a rollback yields
the same UIDs, so tokens already minted stay valid.
