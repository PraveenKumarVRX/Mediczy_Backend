# Imaging: `lab_uid` is the only twin — expand done, contract planned

**Decision (the lead, 2026-10-07):** in imaging, `tenant_id` is a *lab* id and `lab_uid` (`labs.unique_id`, the 6-character uid) is the only uid twin. The UUID `tenant_uid` columns are duplicates and are to go.

## State

| Table | rows | `tenant_id` (lab int) | `lab_uid` | UUID `tenant_uid` |
|---|---|---|---|---|
| `hg_dicom_studies` | 301 | yes | yes | yes |
| `hg_dicom_worklist` | 3 | yes | yes | yes |
| `hg_dicom_reports` | 1 | yes | yes | yes |
| `hg_dicom_access_log` | 1 | yes | yes | yes |
| `ris_studies` | 479 | **all NULL** (identity is `lab_id`) | yes (via `lab_id`) | yes |
| `hg_dicom_instances` | 423,808 | yes | **none until migration `20261007000200`** | yes |

**Expand (this change, not yet applied):** `20261007000200-hg-dicom-instances-lab-uid.sql` adds `lab_uid`, a NOT VALID foreign key and the `uid_ref_sync` trigger (instant, no table rewrite), and registers the twin. `scripts/ops/backfill-uid-twin-batched.mjs` then fills the 423,808 rows in committed 5,000-row batches (one batch rehearsed at 1.3 s), validates the foreign key and builds the index concurrently.

## Why the UUID twins are NOT dropped in the same change

They are not dead columns. They are the imaging tenant-isolation key, read by live code:

- `routes/hypergrid-dicom.route.js` — 24 references, e.g. `WHERE study_instance_uid = $1 AND tenant_id = $2 AND tenant_uid = $3`, on study, instance, worklist and report paths;
- `services/imaging-tenant.service.js` — resolves a principal to `{ id, uid, kind }` **through the `imaging_tenants` registry**, whose `uid` is the lab's UUID (`labs.uid`);
- `routes/imaging-session.route.js` — mints the PACS session claim `tenantUid` (a UUID) into a cookie;
- triggers `imaging_fill_tenant_uid` / `imaging_fill_tenant_uid_by_lab` on the six tables.

Removing them means changing the tenant identity of a **security boundary**: every predicate above, the session claim's shape (every open PACS session would be invalidated and force a re-login), the resolver, the registry and the QA scripts (`scripts/qa/imaging-uid-regression.mjs`, `tenant-uid-rehearsal.mjs`). That is a project with its own rehearsal, not a column drop.

## Contract — executed 2026-10-07 (steps 2–4, in this order)

1. **Step A — `20261007000400`** (additive): `(lab_uid, study_instance_uid)` indexes on studies and instances, replacing the old `(tenant_uid, study_instance_uid)` composites' job.
2. **Step B — code** (branch `viveka-uid-wave3`): `imaging-tenant.service.js` now resolves a tenant from `labs` alone — by `labUid` (a retired uid resolves through `resolve_entity_uid`), by `tenantId`, or from a lab account — and returns `{ id, uid: labs.unique_id, kind: 'lab' }`. The PACS cookie now carries `labUid`. Every predicate in `hypergrid-dicom.route.js` matches `lab_uid` (text) instead of the UUID `tenant_uid`. **Compatibility:** a UUID `tenantUid` claim (cookies issued before the change, one hour) still maps to the same lab through `labs.uid`; remove `LEGACY_UUID_CLAIM` after 2026-10-09.
3. **Step C — verify no readers:** the `tenant_uid` indexes' `idx_scan` counters (`pg_stat_user_indexes`) are recorded before the deploy and compared after; the harness and jest suites pass.
4. **Step D — `20261007000500`**: drop the six `trg_*_tenant_uid` triggers, `imaging_fill_tenant_uid*`, the six `tenant_uid` columns (their indexes go with them), `imaging_tenant_ambiguities` and `imaging_tenants`. Everything dropped is derivable from `labs.uid` + the row's lab id. The old migration `20260926000005` is retired (its `up()` refuses to run) and `verify-tenant-uid.mjs` / `tenant-uid-rehearsal.mjs` are removed.

**Rehearsals:** `scripts/qa/imaging-uid-regression.mjs` drives the real router with real JWTs against a disposable local database copy (18/18: bridge, claims, cookie, legacy UUID cookie, retired uid, both-keys-must-match, worklist trigger); jest imaging/tenant suites pass; both migrations dry-run clean against production inside the checked runner.

**One modelling note.** The old registry could in principle hold a *non-lab* "platform tenant" sharing an integer with a lab (only id 1 is ambiguous: 12 synthetic test rows, reviewed 2026-09-26 and assigned to the lab). With the lead's decision that imaging `tenant_id` is a lab id, that case is out of the model and its harness check was removed.
