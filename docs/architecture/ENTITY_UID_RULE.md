# Entity UID Rule

**Status:** database rule live from migration `20261005000000-entity-uid-rule.sql`.
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
(`U D N A T E`) and the prefix is not forced to match a single kind. Organisation prefixes are unique
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

## Legacy ids

561 ids pre-date the rule and are registered with `legacy = true`; they are never rewritten, because
an id that has been shared or printed is a public contract.

| Table | Count | Why |
|---|---|---|
| `provider_clinics` | 547 | all carry `C…`, from the `clinic → C` bug |
| `labs` | 13 | prefix-less `Math.random()` ids from the bulk import |
| `insurance_brokers` | 1 | `B…`, the ambulance prefix; brokers are `V` |

Legacy ids still resolve unambiguously — the registry stores the **kind**, so a `C…` clinic is never
mistaken for a corporate. Re-issuing them is a separate decision.

## What this does not do yet — and the plan

The rule makes every entity identifiable and stops new ambiguity at the database. It does **not**
rewrite the remaining integer references. That is deliberate: 603 columns across 300+ tables cannot be
converted safely in one change, and the expand/contract pattern used for imaging (dual-key reads) is
the proven route.

1. **Done** — registry, kinds, triggers; every entity and people table attached; `corporates.tenant_uid`.
2. **Done at the auth gates** — corporate sign-in resolves the user's organisation through
   `users.organization_uid → entity_registry` and compares tenant **uids**, never integers.
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
