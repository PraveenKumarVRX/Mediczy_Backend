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

## Contract plan (for approval, in order)

1. Apply `20261007000200`, run the backfill, validate the FK and index. (`verify-entity-uid-rule.mjs` warns "unfilled" until done, then is silent.)
2. Resolver: `resolveImagingTenant` returns `{ id, uid: labs.unique_id, kind: 'lab' }`; keep accepting the old UUID `tenantUid` claim for one release (mapped through `imaging_tenants.source_uid`) so open sessions survive.
3. Predicates: `tenant_uid = $n` → `lab_uid = $n` (text) in the 30 sites, with `tests/imaging-uid-regression` extended to cross-lab negatives for every route; ship dual-condition for one release (`AND (lab_uid = $n)` only after the old column is no longer written).
4. Stop the `imaging_fill_tenant_uid*` triggers; drop the UUID columns and `imaging_tenants` last, after a release with no readers (grep clean, `pg_stat_user_tables` shows no reads of the columns' indexes).

Each step is independently shippable and reversible until step 4. **Step 2–4 are not done and need your go-ahead** because they change which tenant a PACS request is allowed to see.
