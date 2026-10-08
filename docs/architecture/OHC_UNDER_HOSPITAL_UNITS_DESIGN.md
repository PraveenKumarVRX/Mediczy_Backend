# Design: Occupational Health Clinics (OHC) under a hospital's outreach clinics and medical centres

| | |
|---|---|
| **Status** | **v2 (2026-10-08): decisions answered, backend and UI built on branch `viveka-ohc-units`, rehearsed (140/140 dry-run checks, 16 client tests). NOT applied, NOT merged, NOT deployed.** Sections 1–7 are the original proposal; §8 records the answers and where the build departs from it. |
| **Date** | 2026-10-08 |
| **Author's inputs (the lead, 2026-10-08)** | OHC = *Occupational Health Clinic within a company*, delivered under a hospital tenant **and** a corporate tenant. Under a hospital, OHCs sit **under its outreach clinics and medical centres**. Store the hierarchy by **extending the branch table**. OHC staff are **hospital-portal users assigned to the OHC unit**. |
| **Related** | [ENTITY_UID_RULE.md](./ENTITY_UID_RULE.md) · `server/routes/hospital-branch.route.js` · `server/routes/clinic-occupational-health.route.js` · `server/routes/corporate-hmis.route.js` |

---

## 1. What exists today (measured, production, 2026-10-08)

| Area | State |
|---|---|
| **Corporate side** | Roles `corporate_ohc` (OHC Staff) and `corporate_cmo` are invitable by a corporate's super-HR (HR Team → Invite) and sign in at `/corporate/login`. They can issue fitness certificates / return-to-work and decide claims. **No user holds either role in production.** |
| **Clinic side** | `/api/clinic/occupational-health` lets a *clinic doctor* issue fitness certificates for an employer's employees. It is a doctor flow, not an OHC unit. |
| **Mediqzy team** | `team-occupational-health.route.js`: Mediqzy's own clinicians running on-site camps. |
| **Hospital side** | **Nothing OHC-specific.** Department logins (asset, blood bank, consent, …) have no OHC entry. |
| **Outreach clinics** | Exist only as a **client-side mock**: the "Branches & Outreach Clinics" page seeds `initialClinics` in the browser; there is no table and no API. |
| **Medical centres** | Do not exist in code or data. |
| **Branches** | **Two tables.** `hospital_branches` (plural, 4 rows; written by `routes/hospital/practice.route.js`, types `main`/`branch`, has `hospital_uid`) and `hospital_branch` (singular, **0 rows**; the multi-branch architecture: `staff_branch_assignment` FKs to it, `branch_id` columns on ~37 queries — wards, beds, admissions, tariff overrides — and `dialysis.service` read from it). |
| **Fitness certificates** | Table `fitness_certificates` (0 rows). `organization_id` is the **employer** as a bare integer (no uid twin) and there is no issuing-unit column. |
| **Hospital staff roles** | Enumerated in at least four places: `middleware/hospitalAuth.middleware.js`, `routes/unified-hospital-staff.routes.js`, `routes/hrms.route.js`, `routes/hospital/practice.route.js`. Ring-fencing has a `hospitalStaffAuthPattern` for staff logins. |

Consequence: the pieces to attach an OHC to (outreach clinic, medical centre) are not real yet, and "the branch table" is ambiguous. This design makes the unit hierarchy real first, then hangs the OHC off it.

## 2. Model

### 2.1 One unit table: `hospital_branch` (singular), extended

Reasons to pick the singular table: it is the one the rest of the hospital module already scopes by (`branch_id`, staff assignment, tariff overrides); it is empty, so there is nothing to migrate in place; the plural table's 4 rows (types `main`/`branch`, one per hospital) are copied across and the plural table becomes read-only history. *(Decision D2.)*

New/changed columns:

| Column | Purpose |
|---|---|
| `unit_type` text, CHECK in `main`, `branch`, `outreach_clinic`, `medical_centre`, `ohc` | What the unit is. Default `branch`; existing `is_main` rows become `main`. |
| `parent_unit_id` integer → `hospital_branch(id)` | Hierarchy. |
| `corporate_uid` text → `entity_registry(uid)` | The company an OHC serves. **Required for `ohc`, forbidden otherwise.** |
| `visit_pattern` text, CHECK in `daily`, `weekly`, `monthly`, `mobile` | Outreach clinics only (the values the existing page already uses). |
| `hospital_uid` text → `entity_registry(uid)` | The owning hospital by uid (ENTITY_UID_RULE: no bare integers across entities). `organization_id` stays as the legacy twin. |
| `unique_id` text | The unit's own uid — **see D1**. |
| `status`, `address`, `city`, `phone`, `manager` | Carried over from the plural table. |

Database-enforced invariants (a trigger, not just application code):

1. `ohc` ⇒ `parent_unit_id` is a unit of the **same hospital** whose type is `outreach_clinic` or `medical_centre`.
2. `outreach_clinic`, `medical_centre`, `branch` ⇒ parent is `main` or null; `main` ⇒ no parent; **no cycles**; the hierarchy is at most three levels.
3. `ohc` ⇒ `corporate_uid` is a **corporate** (registry kind), and that corporate is allowed to be served by this hospital (see 2.3).
4. `corporate_uid` is NULL for every other type.
5. A unit's `hospital_uid` equals its parent's.

```
hospital (tenant H…)
├── main
├── branch
├── outreach_clinic  (visit_pattern: daily | weekly | monthly | mobile)
│   └── ohc ──► corporate C…   (the company the clinic sits inside)
└── medical_centre
    └── ohc ──► corporate C…
```

### 2.2 Roles and login (hospital portal)

| Role | Who | Can |
|---|---|---|
| `ohc_doctor` | Occupational-health physician | Everything below, **and** issue fitness certificates / return-to-work (requires `doctor_reg_no`) |
| `ohc_staff` | Nurse, technician, front desk | Register/lookup the corporate's employees, record vitals/screenings, prepare certificates **for a doctor to sign**; cannot sign |

* Both are ordinary hospital-portal users (`users.organization_type = 'hospital'`), created by the hospital admin, **assigned to one or more `ohc` units** through the existing `staff_branch_assignment` (extended with these roles).
* They sign in through the existing hospital staff login (the `hospitalStaffAuthPattern` route). The two role names are added to the four staff-role lists in §1 and to ring-fencing with an allow-list limited to `/api/hospital/ohc` and the minimum shared hospital paths.
* **The unit and the corporate are never taken from the request.** Every OHC call resolves the caller's active `staff_branch_assignment` rows of type `ohc` and scopes to those units; a user with no active OHC assignment gets `403 account_unavailable`.
* Uid prefixes (people kinds): `ohc_doctor` → `D`, `ohc_staff` → `N`. *(Confirm in D4; `corporate_ohc` → `K` is unchanged and stays a corporate-portal role.)*
* The users guard trigger (`users_organization_uid_guard`) is extended: an `ohc_*` role must belong to a **hospital** organisation, never a corporate.

### 2.3 Hospital ↔ corporate relationship

A hospital may run an OHC only for a corporate it is linked to. Reuse the existing corporate-to-host link (`corporates.tenant_id`/`tenant_uid`, the host tenant the corporate is served under; see `corporate-scope.service.js`), so a corporate hosted under Smart Hospital can have OHCs under that hospital's units. A hospital cannot attach an OHC to a corporate hosted elsewhere. *(Decision D3 covers whether to allow a many-to-many link table instead, e.g. an industrial park served by one OHC.)*

### 2.4 Data and visibility

| Data | Written by | Hospital sees | Corporate sees |
|---|---|---|---|
| OHC unit (name, type, parent, schedule) | Hospital admin | Yes | Its own OHC(s): name, address, staff names |
| Employee examinations / clinical notes | OHC staff | Yes (unit-scoped) | **No** (clinical) |
| Fitness certificate (status, restrictions, validity, doctor) | `ohc_doctor` | Yes | Yes — the existing corporate Fitness Certificates page |
| Return-to-work clearance | `ohc_doctor` | Yes | Yes |

`fitness_certificates` gains `employer_uid` (twin of `organization_id`, → corporates, kept in sync by the standard `uid_ref_sync` trigger) and `issued_by_unit_id` → `hospital_branch(id)` plus `issued_by_unit_uid` if D1 is yes. Existing certificate routes (clinic, team, corporate) keep working; they simply leave the new columns NULL.

### 2.5 API (proposed)

Admin (hospital admin only; existing `adminOnly` guard):

| Endpoint | Purpose |
|---|---|
| `GET /api/hospital-branch/units?type=&parent=` | List the hierarchy |
| `POST /api/hospital-branch/units` | Create `outreach_clinic`, `medical_centre`, `ohc` (OHC takes `parentUnitId`, `corporateUid`) |
| `PATCH /api/hospital-branch/units/:id` | Rename, change status/schedule; never change type or hospital |
| `POST /api/hospital-branch/units/:id/staff` | Assign staff (extended for `ohc_*` roles; refuses a user of another hospital) |

OHC staff (`ohc_doctor`, `ohc_staff`; unit resolved server-side):

| Endpoint | Purpose |
|---|---|
| `GET /api/hospital/ohc/me` | My OHC unit(s), the corporate, my role |
| `GET /api/hospital/ohc/employees` | The corporate's employees (minimum fields) |
| `POST /api/hospital/ohc/fitness-certificates` | Issue (`ohc_doctor` only); reuses the existing renderer and table |
| `GET /api/hospital/ohc/fitness-certificates` | Certificates issued by this unit |
| `GET /api/hospital/ohc/fitness-certificates/:id/pdf` | PDF |

Every mutation follows the collection platform's rules (idempotency key, expected version where a record can be edited, audit event).

### 2.6 UI

* **Hospital → Branches & Outreach Clinics** stops being a mock: a real hierarchy view (hospital → outreach clinics / medical centres → OHCs), "Add unit" with type, parent, corporate picker (OHC), and visit schedule (outreach). The current hardcoded `initialClinics` and the local-only "Clinic Added" toast are removed.
* **OHC workspace** for `ohc_doctor` / `ohc_staff`: employees, issue certificate, issued certificates. Reuses the corporate-side fitness-certificate form components where possible.
* **Corporate → Fitness Certificates** gains the issuing unit's name.

## 3. Entity UID considerations

CLAUDE.md: a new entity needs a DB-issued uid and no bare-integer cross-entity references. Units are the open question:

| | |
|---|---|
| **Recommended (D1)** | Give units a uid of a new person-independent kind `hospital_unit` (a free prefix letter is needed: `J` or `Q`; **your pick**), issued by the trigger via `attach_entity_uid_rule('hospital_branch', 'hospital_unit', …)`, so OHC/outreach/medical-centre ids are citable across modules (`issued_by_unit_uid`, `staff_branch_assignment`). |
| Alternative | Treat OHCs as `clinic` (`K`, your earlier mapping for `corporate_ohc`) and other unit types as non-entities. Mixed semantics inside one table; I advise against it. |

Either way: `hospital_uid`, `corporate_uid`, `employer_uid` are uid columns from day one; the verifier (`verify-entity-uid-rule.mjs`) must stay at 0 violations.

## 4. Migration and rollout plan

1. **M1** — extend `hospital_branch` (columns, checks, trigger, uid rule), copy the 4 `hospital_branches` rows (`main`/`branch`), leave the plural table read-only. Checked runner, dry run first.
2. **M2** — roles: add `ohc_doctor`/`ohc_staff` to the four role lists, ring-fencing type, prefix map, extend the users guard.
3. **M3** — `fitness_certificates` twins (`employer_uid`, `issued_by_unit_*`).
4. **Code** — unit service + routes, OHC routes, page rewrite. Tests: state/invariant table tests, cross-hospital and cross-corporate negatives, the integration pattern used for the collection platform (real services, rolled-back transaction).
5. **Demo seed (script, never a migration)** — see §5.
6. Apply order, as always: migrations (with your go-ahead) → merge → reload → client build → verifier.

Rollback: M1–M3 only add objects and columns; the plural table is untouched.

## 5. Demo plan

A clearly named chain so it can be shown and removed:

```
Demo hospital (an existing test hospital tenant — D6)
 └─ Demo Outreach Clinic (outreach_clinic, weekly)
     └─ Demo Corp OHC (ohc) ──► Demo Corp (a demo corporate — D6)
          ├─ ohc_doctor  demo.ohc.doctor   (sign in at the hospital portal)
          ├─ ohc_staff   demo.ohc.staff
          └─ 5 sample employees, marked as demo
```

Credentials are generated at seed time, printed once to you, and never written to a file or the repo. The seed script is untracked (it writes passwords), idempotent, and removes everything it created with `--remove`.

## 6. Decisions needed

| # | Decision | My recommendation |
|---|---|---|
| **D1** | Do units get their own uid? Which prefix letter (free: `J`, `Q`)? | Yes, kind `hospital_unit`; letter is yours to pick |
| **D2** | Which branch table is the base? | `hospital_branch` (singular); copy the 4 rows from the plural table |
| **D3** | OHC ↔ corporate: exactly one corporate per OHC, or many-to-many? | One (the clinic sits inside one company); revisit for industrial parks |
| **D4** | Roles: `ohc_doctor` + `ohc_staff` with uid prefixes `D` and `N`? Who may sign certificates? | As stated; only `ohc_doctor` signs |
| **D5** | What may the corporate see? | Certificates and return-to-work only; no clinical notes |
| **D6** | Which hospital and which corporate host the demo? | An existing test hospital tenant and a new "Demo Corp" (not Ninjacart or any live customer) |
| **D7** | "Medical centre": what distinguishes it from a branch (no beds? outpatient only?) | Outpatient facility, no wards/beds; otherwise identical to a branch |
| **D8** | Should `corporate_ohc` (corporate-portal role) stay? | Yes, unchanged; it is the company's own people, separate from the hospital's OHC staff |

## 7. Not in scope here

OHC camps/scheduling, occupational-disease surveillance, statutory registers (e.g. Form 17), billing of corporate packages, and any change to the existing clinic/team certificate flows.

---

## 8. Decisions as answered (2026-10-08) and what was built

| # | Answer | Effect on the design |
|---|---|---|
| D1 | Units get their own uid; prefix **J** | Entity kind `care_unit` (organisation-like), `hospital_branch` under the uid rule. |
| D2 | "Clinic or hospital tenant" | The **operator** of a unit is a hospital **or** a clinic tenant (`owner_uid`, guard trigger). The base table is the singular `hospital_branch` (empty, already used for branch scoping); the 2 of 4 plural-table rows whose owner is a hospital/clinic are copied. |
| D3 | One corporate per OHC | `corporate_uid` required for an OHC, immutable, and it must be a **company record in `corporates`** (not the corporate *tenant* that hosts it: uids like `CXFXJC` are refused). |
| D4 | `ohc_doctor` (D) / `ohc_staff` (N) | Built. They are users of the operator, assigned to an OHC through `staff_branch_assignment`. They sign in through their own workspace (`/ohc/login`) rather than the general hospital APIs, so they do not get hospital-wide access; they are deliberately **not** added to the hospital staff-role lists. |
| D5 | The corporate sees "clinic admin dashboard and all services and functions and staff linked to OHC" | Built: the corporate's OHC page shows contract, services, linked staff, volumes and **every certificate in full** (status, restrictions, remarks, doctor). Every corporate read, and every certificate issue, is recorded in an append-only access log both parties can read. **Individual clinical examination records do not exist yet**; when they are built they will sit behind an employee-consent gate (an employer reading medical records is a DPDP risk) — the lead chose "everything", this is the one qualification kept. |
| D6 | Existing demo tenants | Demo operator **SmartHealth Clinic (KT5EUW)**; demo company **My SmartHealth (CMSHT1, 4 employees)**. (The earlier choice of "Reliance Industries" was a corporate *tenant* with no `corporates` record and no employees; it could not host an OHC.) |
| D7 | Medical centre = co-branded, co-owned; branch = 100% owned | `ownership` (`owned` / `co_owned`); a medical centre requires `brand_name` and a `co_owner_uid` different from the operator. |
| D8 | Keep `corporate_ohc`; OHC is usually set up by the corporate and outsourced to a clinic/hospital on contract | `corporate_ohc` unchanged. An OHC carries a **contract**: `initiated_by` (corporate or operator), `proposed` → `active` only when **both** sides accepted (operator by creating it, the company's super-HR/account owner in `/corporate/ohc`), either side can end it, and ending it stops the OHC's staff at the next request. |

### Departures from the proposal
* **Corporate-initiated requests**: a company cannot yet *request* an OHC from an operator inside the product (it cannot see the operator's units). The operator creates the unit and records `initiated_by = corporate`; the company accepts. A request flow is a follow-up.
* **Operator staff creation** was not in the proposal and is required: the hospital/clinic admin creates OHC accounts (`POST /api/care-units/:uid/staff/new`); the temporary password is returned once, stored hashed, and **must be changed at first sign-in**.
* **Legacy `hospital`-role tokens** work for administration; **legacy clinic accounts** (not `clinic_admin` users) are not supported yet.
* Corporate-side access: `corporate`, `corporate_admin`, `corporate_cmo`, `corporate_ohc` can read; only `corporate` and `corporate_admin` can accept or end a contract; `hr_staff` sees nothing of the OHC.

### Where it lives
`server/migrations/20261008000000-care-units.sql` · `services/care-units/` · `routes/care-units*.js`, `routes/corporate-ohc.route.js`, `routes/ohc-workspace.route.js` · `client/src/pages/care-units/`, `pages/ohc/`, `pages/corporate/CorporateOhc.tsx` · demo: `server/scripts/ops/seed-ohc-demo.mjs`.

### Apply order (each step needs the lead's go-ahead)
1. Dry run (done): `apply-migration-checked.mjs --file migrations/20261008000000-care-units.sql --checks scripts/ops/checks/care-units-all.checks.mjs` → 140/140, rolled back.
2. Apply the same command with `--apply`; then merge → reload API → build and install the client → `verify-entity-uid-rule.mjs` (must stay at 0 violations; the verifier reports drift until the migration is applied because the code already knows `care_unit`).
3. Seed the demo: `seed-ohc-demo.mjs` (dry run first), `--apply`, optionally `--no-force-change`.
