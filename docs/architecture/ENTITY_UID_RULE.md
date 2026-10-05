# Entity UID Rule

**Status (2026-10-05): the migration is MERGED but NOT YET APPLIED to production.** Until it is applied,
the triggers described below do not exist in the live database, `tenants` still has no UID, and the rule
is enforced only by the application code. Apply it with
`node scripts/ssm-env-loader.mjs scripts/ops/apply-entity-uid-rule.mjs --apply` (a dry run, without
`--apply`, rolls back and is safe at any time: 48 checks passed against production data).
Until then, `scripts/ci/verify-entity-uid-rule.mjs` reports the migration as missing.
**Rule of record:** the *Entity IDs* section of [CLAUDE.md](../../CLAUDE.md).

## The problem this removes

Entities were identified by a mix of bare integers and 6-character IDs, and the two were not kept
apart:

- `tenants` — the table every subdomain and tenant gate resolves through — had **no UID at all**.
- `users.organization_id` held a **tenants id for some users and a `corporates` id for others**. Id `49`
  is *Madras Medical Mission Chennai* in `tenants` and *Ninjacart* in `corporates`. 11 integer values
  exist in both tables. A corporate HR user with `organization_id = 49` was **rejected on
  ninjacart.mediqzy.com** and **admitted on madras-medical-mission-chennai.mediqzy.com**.
- The UID rule lived in Sequelize `beforeCreate` hooks and a JS helper. Raw SQL, `bulkCreate` and
  scripts bypassed it: no table had a default or trigger, and only `corporates.unique_id` was `NOT NULL`.
- The JS prefix map said `clinic → C` (corporate's letter) while its own reverse map said `K`; all 547
  clinic ids carry the wrong prefix. `generateUniqueId('P')` and `('T')` passed a *letter* where a
  *role* belongs, silently fell back to `U`, and gave every patient and team member a `U` id.
- The lab bulk import minted `Math.random().toString(36)` ids: no prefix, and it can emit `0`/`O`.
  13 labs hold them.
- There were 603 integer cross-entity columns (`tenant_id` in 246 tables, `organization_id` in 205,
  `hospital_id` in 50, `corporate_id` in 41, `tpa_id` in 24, …).

## The rule

> Every entity has a database-issued, kind-prefixed, immutable, globally unique 6-character UID. A
> numeric `id` never identifies an entity across tables or kinds.

### Kinds

| Kind | Prefix | Stored as |
|---|---|---|
| corporate | `C` | `corporates`, `tenants.type = corporate` |
| hospital | `H` | `hospitals`, `tenants.type = hospital` |
| clinic | `K` | `provider_clinics`, `tenants.type = clinic` |
| lab | `L` | `labs`, `tenants.type = lab` |
| pharmacy | `P` | `pharmacies`, `tenants.type = pharmacy` |
| ambulance | `B` | `ambulances`, `tenants.type = ambulance` |
| homecare | `M` | `homecare_providers`, `tenants.type = homecare` |
| diagnostic centre | `Y` | `crm_diagnostic_centres` |
| NGO | `G` | `tenants.type = ngo` |
| TPA | `X` | `tpas`, `tenants.type = tpa` |
| insurance company | `I` | `insurance_companies`, `tenants.type = insurer` |
| broker | `V` | `insurance_brokers.broker_uid`, `tenants.type = broker` |
| wellness company | `W` | *no table yet* |
| PSU | `S` | `tenants.type = psu` |
| aggregator | `Z` | `tenants.type = aggregator` |

People tables (`users`, `patients`, `doctors`, `nurses`, `doctor_assistants`, `team_members`,
`corporate_employees`) are under the same global registry but **relaxed**: they carry role prefixes
(`U D N A T E`; `hr_staff` is hospital staff and carries `T`) and the prefix is not forced to match a single kind. Organisation prefixes are unique
among organisations (`uq_entity_kinds_org_prefix`), so an organisation uid's first letter names its kind.

**NGO and wellness company have no dedicated table.** NGOs are `tenants` rows (`type = ngo`) and get a
`G…` uid automatically. Wellness companies and diagnostic centres cannot be `tenants` rows because
`enum_tenants_type` has no such label (adding one needs `ALTER TYPE` as the type owner, `postgres`).
The kinds are registered, so the day a table exists, `attach_entity_uid_rule` is one line.

## How it is enforced

`entity_kinds` — kind → prefix. `entity_registry` — **one row per uid across every table**
(`uid` PK, `kind`, `source_table`, `source_id`, `legacy`, `retired_at`). Per attached table, three triggers:

| Trigger | Behaviour |
|---|---|
| `trg_entity_uid_bi` BEFORE INSERT | No uid supplied → generate one with the kind's prefix. A uid supplied → must be `^[A-Z0-9]{6}$` and (strict) start with the kind's prefix. Either way it is registered, so a duplicate **anywhere** raises `23505`. |
| `trg_entity_uid_bu` BEFORE UPDATE | Fires only when the uid changes or is `NULL`. A set uid cannot be changed or cleared (`23514`). |
| `trg_entity_uid_ad` AFTER DELETE | Retires the registry row. A uid is never reused. |

Plus `NOT NULL` and a unique index on the column. `tenants` derives the kind per row from `type`.

**Registration happens in the BEFORE trigger on purpose.** AFTER ROW triggers of a multi-row INSERT fire
only after every BEFORE trigger has run, so a bulk insert would generate all its uids before
registering any. In a 32⁵ = 33.5M space the expected collisions are n²/2N — about 1.5 per 10,000
rows. Verified: 30,000 rows in one `INSERT` statement, every uid distinct.

### The uid twin

`attach_uid_reference(table, int_col, uid_col, target)` adds a uid column next to an integer reference,
backfills it, adds a foreign key into `entity_registry(uid)`, and installs a trigger that:

- fills the uid when only the integer is written, and the integer when only the uid is written;
- **rejects a write where the two disagree**;
- **rejects a uid that belongs to a different table** (a hospital uid in a tenants reference).

Applied so far: `corporates.tenant_id → tenant_uid`. `users.organization_uid` exists with a registry
foreign key; it is **not** filled mechanically because the integer it shadows is the ambiguous one.

## HR is two different modules

`hr_staff` is one role string used in two unrelated places:

| | Hospital HR | Corporate HR |
|---|---|---|
| Module | the hospital's own **HRMS** (its staff, attendance, payroll) | **employee wellness programmes** of a corporate client; no HRMS |
| Organisation | a hospital (or other provider) tenant, kind `hospital`/`clinic`/… | a corporate, kind `corporate` |
| Sign-in | `/api/hospital/staff/hr/login` | `/api/corporate/login` |
| Example | `hr.mediczy` (Smart Hospital) | `ninjacart.hr`, `arun.kamble` |

Both are also employees of their organisation, which is why their work email cannot be their login.
Because the role string is shared, **the role can never decide which portal or organisation a user belongs
to — the kind of their organisation does.** That is what `users.organization_uid` carries: a corporate
user's uid resolves to a `corporate` registry entry, a hospital HR user's to a `hospital` tenant.
`corporate-scope.service.js` refuses a hospital HRMS user at the corporate portal even though the role
matches, `backfill-organization-uid.mjs` resolves by organisation kind, and check 7 of the verifier fails on
any user whose role and organisation kind disagree.

## Relation to ring-fencing and Row-Level Security

Ring-fencing (`middleware/ringFencing.js`) is **not** a tenant-isolation mechanism and never was: in 130
commits no tenant check was ever added or removed. It does two things.

1. **A role → path allowlist** (`corporate` may call `/api/corporate/*`). Mounted at `app.js:1084`; 330
   routers sit behind it. The ~13 department routers mounted ahead of it (finance, blood bank, mortuary,
   procurement, …) authenticate themselves: 36 unauthenticated probes against production all returned 401.
2. **An own-id check on URLs** of the form `/api/<kind>/<number>`, comparing the number with
   `decoded.id || userId || doctorId || … || corporateId || hospitalId || …`. That caller identity is
   whichever of ~15 integers is first non-null, so a company-account token (`id` = a `corporates` id) and an
   HR sub-user token (`id` = a `users` id) put integers from different tables in the same variable.
   Admin and team tokens bypass it (audit-logged).

It never compares an organisation, a tenant or a uid. Row-Level Security is the database layer meant to do
that. 79 of 944 tables have RLS enabled and forced, with 100 policies; the app role is a non-superuser
without `BYPASSRLS`, so where RLS is on it binds. The limits:

- Every policy keys on an **integer** (`organization_id`, `tenant_id`, `user_id`); none references a uid.
- The 8 `app.current_tenant` policies (including `corporates`) have a **fail-open first clause**
  (`current_setting('app.current_tenant') IS NULL OR … = ''` ⇒ allow). That setting is made only in
  `middleware/api-auth.js` (the aggregator API-key path), never for portal logins.
- `tenants`, `hospitals` and `doctors` have no RLS; `users` is forced but not enabled, a no-op.

The UID rule does not replace either layer. It gives them an unambiguous key to enforce on. Moving
ring-fencing's ownership check and the RLS policies from integers to uids is steps 3–5 of the plan above,
and the RLS context being set universally and transaction-locally is the open prerequisite for RLS to bind.

## Legacy ids

561 ids pre-date the rule and are registered with `legacy = true`. A uid is a public identifier, so it is
never silently rewritten.

| Table | Count | Why | Status |
|---|---|---|---|
| `provider_clinics` | 547 | all carry `C…`, from the `clinic → C` bug | **re-issue APPROVED** (as `K…`) |
| `labs` | 13 | prefix-less `Math.random()` ids from the bulk import | not approved |
| `insurance_brokers` | 1 | `B…`, the ambulance prefix; brokers are `V` | not approved |

Legacy ids still resolve unambiguously because the registry stores the **kind**, so a `C…` clinic is never
mistaken for a corporate.

**Re-issuing** is done only by `reissue_entity_uid(table, id, reason)`; a hand-written `UPDATE` of a uid is
still refused. The old uid is retired (it can never be issued again), kept in `entity_uid_aliases`, and
`resolve_entity_uid(old)` returns the new one, so an id that was printed or shared does not break. Aliases are
flattened on every re-issue, so resolution stays one hop. The tool is
`scripts/ops/reissue-legacy-uids.mjs --table provider_clinics [--apply]` (dry run by default, writes the
old → new mapping to a CSV before it commits). It is separate from the migration, so approving one does not
approve the other. Rehearsed against production inside a rolled-back savepoint: all 547 clinics move to `K…`,
all distinct, all 547 old ids still resolve. Nothing referenced the clinic uids: 1,359 text columns across
every populated table were scanned and none held one, and the only code that resolves a clinic by public id
(`admin/clinics.routes.js`) now also accepts an old id.

## What this does not do yet — and the plan

The rule makes every entity identifiable and stops new ambiguity at the database. It does **not**
rewrite the remaining integer references. [ENTITY_REFERENCE_AUDIT.md](ENTITY_REFERENCE_AUDIT.md) measured
them: of 637 candidate columns, **467 are in empty tables** and need no data migration, and only **140 hold
data (about 490,000 rows, 423,808 of them in one table that is already dual-keyed)**. Column names cannot be
trusted as targets: 30 columns named `tenant_id`/`hospital_id` hold values from a different id-space (imaging's
`tenant_id` is a lab id). The expand/contract pattern used for imaging (dual-key reads) is the route.

1. **Written and rehearsed, not yet applied** — registry, kinds, triggers; every entity and people table
   attached; `corporates.tenant_uid`.
2. **Not yet done** — move the corporate sign-in gate onto uids: resolve the user's organisation through
   `users.organization_uid → entity_registry` and compare tenant **uids**, never integers. Needs step 1
   applied and `users.organization_uid` backfilled first. **Until then the tenant-isolation defect is
   still live**: `somya.pagare` (`organization_id = 49`) is rejected on ninjacart.mediqzy.com and admitted
   on madras-medical-mission-chennai.mediqzy.com.
3. **Next, by blast radius** — `attach_uid_reference` on the highest-traffic references: `users`
   (`tenant_id`), `hospitals`/`doctors`/`nurses`/`insurance_brokers` (`tenant_id`), then the
   `hospital_id`, `corporate_id`, `tpa_id`, `lab_id`, `pharmacy_id` families.
4. **Then** switch each reader from the integer to the uid, table by table.
5. **Finally** (contract) make the uid column `NOT NULL` and stop writing the integer.

`scripts/ci/verify-entity-uid-rule.mjs` is the guard throughout.

## Operations

- **Orphans.** `INSERT … ON CONFLICT DO UPDATE` fires the BEFORE INSERT trigger for a row that is then
  updated instead of inserted, leaving a registry row with no source row. Harmless; the verifier reports
  them and `--fix` retires them.
- **Bringing in a table:** `SELECT attach_entity_uid_rule('<table>', '<kind>'[, '<column>'[, strict[, type_column]]]);`
- **Test it:** `node scripts/ssm-env-loader.mjs scripts/ops/apply-entity-uid-rule.mjs` (dry run, rolls back).
