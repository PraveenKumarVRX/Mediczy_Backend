# Entity Reference Audit — the remaining integer references

Produced by `server/scripts/ci/audit-entity-references.mjs` (read-only). Run on production, 2026-10-05.
Companion to [ENTITY_UID_RULE.md](ENTITY_UID_RULE.md).

## Status, 2026-10-05 (later): the expand step is done

| | |
|---|---|
| **Twins applied** | **131** uid twins (61,759 rows), kept in step with their integer by trigger, each with a foreign key to `entity_registry`. 28 by declared FK, 74 by a convention corroborated by the data, 29 imaging/lab. |
| **Verified** | for every twin: column, FK, trigger, every row filled, every uid agrees with its integer and its table (`verify-entity-uid-rule.mjs`, check 6). A new populated reference column without a twin is flagged (check 6b). |
| **Writers fixed** | `corporate-hr-management.service.js` and `hrms.route.js` record `users.organization_uid`; a trigger on `users` derives it for the other nine writers and refuses a role/kind mismatch. |
| **Left alone, 7 columns** | needs a decision, listed below |

Two defects found and fixed while doing it: the twin trigger refused an ordinary update of the integer while a
uid was set (it now makes the other side **follow**; confirmed live on `corporates.tenant_id`), and the
generator re-twinned a pair an earlier migration had already made.

### The 7 columns left alone

| Column | Why |
|---|---|
| `display_devices`, `hospital_queue_entries`, `hospital_queue_token_sequences`, `hospital_uhid_sequences`, `kiosk_registration_invites` `.organization_id` | **Two id-spaces in one column.** Real tenant ids (1, 3, 4, 11) are mixed with `hospitals`-directory ids (2368 "Ruby Medical Centre", 11332 "QA General Hospital"), and `11` is both the Smart Hospital tenant and directory hospital #11. An integer cannot say which hospital a UHID sequence or a queue entry belongs to. **Decision needed:** does "organization" in the queue module mean the tenant or the directory hospital? The 2368 and 11332 rows look like QA data. |
| `clinical_alerts.tenant_id` | the 4 values exist in no `tenants` row (they fit `hospitals`, `labs`, `provider_clinics`) |
| `hg_dicom_instances.tenant_id` | 423,808 rows: too large to rewrite inside a migration; already carries the older UUID `tenant_uid`, and the imaging tables around it now also have `lab_uid` |

`users.organization_id` is covered by `organization_uid` and its trigger rather than a twin. 16 users stay
`NULL` because their integer (1, 2, 3 or 5) is both a tenant and a corporates id.

### Decisions I made, for your review

- **Imaging `tenant_id` → `lab_uid`** (29 columns). Every value exists in `labs` and in none of `tenants`, and
  `utils/tenant-identity.js` documents `tenant_id` there as a lab account id. The five `hg_dicom_*` tables and
  `ris_studies` therefore carry two twins now (the older UUID `tenant_uid` and the 6-character `lab_uid`):
  redundant but harmless; unifying them is a later cleanup.
- **`users.aggregator_id` → `insurance_brokers`**, by the precedent of `corporates.aggregator_id`'s declared FK.
  All 39 populated values are `2`, which as a tenant would be a clinic ("mediczy-test-clinic"), as a broker is
  `VV8DGT`. A single small integer is weak evidence on its own; the FK precedent carries the decision.
- **`hospital_id` → `tenants`**, by the FK on `pre_authorizations.hospital_id` and the three `resolveTenantId`
  implementations, and checked per column against the data.

## Headline

The earlier figure of "603 integer cross-entity columns" was misleading in both directions. A wider
name pattern finds **637** candidate columns, but **467 of them (73%) are in empty tables** and need no
data migration at all. Only **140 columns hold data, about 490,000 rows**, and 423,808 of those rows are a
single table (`hg_dicom_instances`) that already has its uid twin from the imaging migration.

**Zero dangling references.** Every value in every column exists in at least one id-space. The problem is
not integrity; it is *meaning*: small integers exist in many id-spaces at once, so a bare integer cannot say
what it points at.

| | columns | rows |
|---|---|---|
| Candidate columns | 637 | |
| in **empty** tables (nothing to migrate) | 467 | 0 |
| populated, never set | 30 | 0 |
| **hold data** | **140** | 490,000 |

## What the 140 columns are

| Wave | What | Columns | Rows | Certainty |
|---|---|---|---|---|
| **A** | Declared foreign key; the FK names the target | 28 | 32,673 | certain |
| **B** | Named for a table, no FK, and the data fits that table | 50 | 19,109 | high; confirm per column |
| **C** | `organization_id` / `org_id`: no name, no FK | 31 | 8,287 | by code convention: `tenants.id` |
| **D** | Named for one table but the **values fit another** | 30 | 425,577 | name is WRONG; needs a decision |
| **E** | `aggregator_id`, no target table | 1 | 6,852 | undecided |

### Wave D is why column names cannot be trusted

30 columns are named `tenant_id` or `hospital_id` and hold values that do not fit `tenants` the way the
name says. The largest group is the imaging family: `hg_dicom_instances.tenant_id` (423,808 rows), `hg_dicom_studies`, `ris_report_templates`
and 17 further imaging/DICOM tables hold values that fit `labs` (some also fit `hospitals`, because small integers fit many id-spaces). In imaging, `tenant_id` is a **lab
account id**, not a tenant (documented in `utils/tenant-identity.js`, audit finding SEC-01). The imaging
migration already added `tenant_uid` to six imaging tables (`hg_dicom_*`, `ris_studies`); 17 more remain.
The 7 `hospital_id` columns in wave D (`billing_stations`, `hospital_bill_templates`, …) have no FK. Their values fit `tenants`, and
`pre_authorizations.hospital_id` carries a foreign key to `tenants`, which suggests they hold tenant ids
and not ids from the 10,776-row `hospitals` directory. **That is an inference to confirm per column, not a proof.**

So the same column name means **three different things** in this database: `tenants.id`, `labs.id`
(imaging) and `corporates.id` (see below). A generator that infers targets from names would mis-target 30
columns. **Targets must come from a declared FK or an explicit per-column decision.**

## Root causes found

1. **Two writers put different meanings in `users.organization_id`.**
   `routes/hrms.route.js:635,766,916` write `corp.tenantId` / `tenantId` (a **tenants** id), while
   `services/corporate-hr-management.service.js:107-108` writes `corporateId` (a **corporates** id).
   The second arrived with the super-HR / staff-HR hierarchy commit `39be12c7` (2026-09-03). Both write to the
   same column. That is how `somya.pagare` (49, a corporates id) and `ninjacart.hr` (58, a tenants id) coexist.
2. **Three functions named `resolveTenantId`** (`utils/tenant-identity.js`, used by 35 files;
   `services/hospital-crm-foundation.service.js`; `middleware/moduleEntitlement.middleware.js`). They agree on
   the convention (`tenant_id || organization_id` is the tenant id) but differ in fallbacks. The shared util
   also accepts a bare `claims.id` for the legacy `hospital` role.
3. **The convention is real and the data bears it out.** In `users`, where both `organization_id` and
   `tenant_id` are set, they are equal in **54 of 54** rows, and `organization_id` never equals `corporate_id`.
   Every `organization_id` value in the hospital-ops tables exists in `tenants`. The only exceptions are the
   corporates-id users written by cause 1, and a type mismatch (a corporate user whose "tenant" is a hospital)
   detects every one of them.
4. **The FK columns cannot rescue the corporate users.** `corporate_id` is NULL for all eight HR/corporate
   portal users, so their organisation must be resolved by kind (`backfill-organization-uid.mjs`).

## Live exposure today

85 populated columns hold at least one value in the **tenants/corporates collision set**
`{1,2,3,4,5,6,45,46,47,49,52}` (26,213 rows), but this overstates the danger. Most are FK-declared
(`corporate_employees.corporate_id` → `corporates`), so a correct reader cannot misread them. The columns
where an integer comparison can genuinely be wrong, **no FK and no name**, are:

| Column | rows in collision set |
|---|---|
| `pharmacy_inventory.organization_id` | 27 of 27 |
| `hospital_queue_entries.organization_id` | 11 of 27 |
| `prescription_dispensing.organization_id` | 8 of 8 |
| `beds.organization_id` | 7 of 11 |
| `users.organization_id` (RLS-keyed) | 19 of 86 |
| `users.aggregator_id` | 39 of 6,852 |

Row-Level Security is less affected than expected: only **4** populated columns are referenced by a policy.

## Plan, in dependency order

0. **Apply the entity UID migration**, back-fill `users.organization_uid`, merge the uid-based corporate
   gate (branch `viveka-corporate-org-uid-gate`). This closes the only live cross-tenant admission.
1. **Fix the corporates-id writer** (`corporate-hr-management.service.js`) to write `organization_uid` and read
   by it. Until then, new corporate sub-users keep being created with the ambiguous integer.
2. **Wave A (28 columns):** mechanical. The FK is the target, so `attach_uid_reference(table, col, uid_col, fk_target)`
   can be generated one-to-one. Includes `users.tenant_id`, `users.corporate_id`, `doctors.tenant_id`,
   `hospitals.tenant_id`, `corporate_employees.corporate_id`, `user_health_packages.corporate_id`.
3. **Wave C (31 columns):** twin to `tenants`, justified by the three resolvers plus the 54/54 data check.
   Exclude `users.organization_id`, which `organization_uid` already covers by organisation kind.
4. **Wave B (50 columns):** confirm each target against the data, then twin and add the missing FK.
5. **Wave D (30 columns):** imaging family targets `labs` through the existing `imaging_tenants` registry;
   finish the 17 tables not yet dual-keyed. Do not generate from names.
6. **Wave E:** decide what `aggregator_id` references (`tenants.aggregator_uid` suggests an aggregator tenant).
7. **Empty tables (467): do nothing now.** Pre-adding 467 columns and triggers is bloat. Instead the rule says
   a new reference gets a uid from day one, and the verifier should flag any reference column that becomes
   populated without a twin.
8. **Contract:** switch readers (`resolveTenantId`, ring-fencing, RLS policies) from the integer to the uid,
   one table at a time, then make the uid `NOT NULL`.

Waves A–C are about 109 columns and ~60,000 rows, which is tractable in a handful of reviewed migrations.
They are deliberately **not generated yet**: each `attach_uid_reference` adds a trigger and a column, and the
targets for B and D need a human decision first.
