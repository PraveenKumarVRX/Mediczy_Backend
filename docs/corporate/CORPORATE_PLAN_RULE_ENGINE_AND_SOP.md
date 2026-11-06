# Corporate Plan & Customization — Rule Engine and SOP

**Status:** Authoritative SOP
**Last updated:** 2026-11-06
**Scope:** How corporate health-plan definitions and customization flow from **Team login → Corporate Admin (HR) → Corporate Employee**, and the rules that keep them consistent.

---

## 0. Governing principle (the one rule everything else serves)

> **Team login is the single source of truth for every corporate plan fact and customization.**
> Corporate Admin (HR) and Corporate Employee surfaces are **read models** of what Team configured.
> They may *consume, assign within, and present* that truth — they must never *redefine* it.

"Plan facts and customization" = the package catalog (tests, price, validity, frequency, eligible
relations), the approved provider/venue network, and the per-package venue rules.

---

## 1. Actors and layers

| Layer | Who | Portal / routes | Role gate |
|---|---|---|---|
| **Source of truth** | Internal Team / Super-admin | `admin.route.js`, `admin-health-packages.route.js` | `requireRole(['admin','team'])` |
| **Corporate Admin (HR)** | Employer HR | `corporate.route.js` (`authCorporate`) | corporate admin/HR |
| **Corporate Employee** | Employee | `employee-network.route.js`, `health-checkup.route.js` (`authUser`/`authEmployee`) | employee |

---

## 2. The rule engine — ownership matrix

Each **data domain** has exactly **one writer layer** (the owner) and defined reader layers. This is
the invariant set the audit confirmed and that must be preserved.

| Domain | Table | **Owner / writer (Team only)** | Corporate Admin | Employee |
|---|---|---|---|---|
| Corporate entity | `corporates` | Team (`admin /corporates`) | read | — |
| **Plan catalog** (tests, price, validity, frequency, eligibleRelations) | `corporate_health_package_catalog` | **Team** (`admin/health-packages` CRUD) | **read-only** (`/health-packages`, `/ahc/package-options`) | read (`/health-checkups/packages`) |
| **Employee entitlement** (who holds which plan) | `user_health_packages` | **Team** (`admin/health-packages` `tag-employees`) | read | read (`/health-checkups`, `/employee/home`) |
| **Approved provider/venue network** | `corporate_network_assignments` | **Team** (`admin.route`) | read (`/network-providers`) | read (`/health-checkups/labs`) |
| **Per-package venue rules** | `health_package_venues` | **Team** (`admin/health-packages`) | — | read (venue scoping in `/labs`,`/slots`,`/bookings`) |
| Employee roster | `corporate_employees` | Team **and** HR (`admin/corporate-employees`, both role-gated) | create/add | — |
| Benefit wallet (programs, tiers, spend) | `corporate_benefit_*` wallet tables | **HR** (`corporate.route benefit-wallet/*`) | own | read (`/my-benefit-wallet`) |

**Audit result:** `corporate.route.js` performs **0 INSERT/UPDATE** against the four plan-truth tables
(`corporate_health_package_catalog`, `user_health_packages`, `corporate_network_assignments`,
`health_package_venues`). The source-of-truth boundary is intact at the write layer.

---

## 3. Data flow (Team → HR → Employee)

```
TEAM (source of truth)
  ├─ define package            → corporate_health_package_catalog  (tests, price, validity, frequency, eligibleRelations, venueMode)
  ├─ define approved network   → corporate_network_assignments     (labs/hospitals the corporate may use)
  ├─ define per-package venues → health_package_venues             (optional: restrict a package to specific venues/relations)
  └─ assign to employees       → user_health_packages              (tag-employees: grant the catalog package to roster members)
        │
        ▼
CORPORATE ADMIN (HR) — read model + roster + wallet
  ├─ reads catalog             (/health-packages, /ahc/package-options)      ← same catalog rows
  ├─ reads network             (/network-providers)                          ← same corporate_network_assignments
  ├─ manages roster            (admin/corporate-employees: add/provision)    → corporate_employees (+ users login)
  └─ manages benefit wallet    (benefit-wallet/*)                            → corporate_benefit_* (SEPARATE layer)
        │
        ▼
CORPORATE EMPLOYEE — read model
  ├─ /employee/home            → entitlement + active AHC booking + wallet + "cashless network"
  └─ /health-checkups/*        → packages (catalog), labs (network+venues), slots, bookings, book/pay
```

---

## 4. Invariants (the rules the engine must always satisfy)

1. **Single writer per plan domain.** Only Team/admin routes write the four plan-truth tables.
   Any new write path from `corporate.route.js` (HR) or an employee route into those tables is a
   violation.
2. **Employee and HR read the *same* catalog row.** `/health-checkups/packages`,
   `/corporate/health-packages` and `/corporate/ahc/package-options` must all resolve a package
   from `corporate_health_package_catalog` (joined to the member's `user_health_packages` for the
   employee). No layer may synthesise plan facts (tests/price/validity) from anywhere else.
3. **One network of record per purpose.** The *bookable* corporate network is
   `corporate_network_assignments` (what `/health-checkups/labs` enforces). Any other "network"
   list shown to the employee must be derived from the same table or explicitly labelled as a
   different (wallet) network — never silently substituted.
4. **Customization lives in the catalog row, not in code.** Tests, validity window
   (`validityPeriod`), frequency, `eligibleRelations`, and `venueMode` are columns/metadata on
   `corporate_health_package_catalog`. Presentation layers read them; they do not hardcode defaults
   that override an absent value with business meaning (e.g. self-only when family was intended is
   a *config gap*, to be fixed in the catalog, not in the route).
5. **Entitlement, not catalog, gates the employee.** An employee sees/books a package only when a
   matching active, in-window, unused `user_health_packages` row exists. The catalog defines the
   plan; the entitlement grants it.

---

## 5. Known divergence to reconcile (rule #3 breach)

**Finding:** the employee dashboard's "Cashless network available to you" (`/employee/home` →
`listBenefitNetworkProviders`) reads **`corporate_benefit_network_providers`** (the HR/benefit-wallet
layer), while the AHC venue picker (`/health-checkups/labs`) reads **`corporate_network_assignments`**
(the Team source of truth). These are two different tables, and the wallet table has historically been
empty for corporates whose Team-side network *is* populated — so the dashboard shows "no network"
while the booking flow shows the real centres.

**Rule to apply:** the employee's displayed network must be derived from the **Team source**
(`corporate_network_assignments`) for anything presented as the corporate's approved care network,
or the wallet list must be clearly scoped to wallet-funded services only. Remediation options:
(a) have `listBenefitNetworkProviders` fall back to / union `corporate_network_assignments`, or
(b) relabel the dashboard section as wallet-specific. Owner: platform team.

---

## 6. SOP — configure a corporate plan end to end (Team)

Do these **in order**, all from Team/admin login. Each step writes exactly one source-of-truth domain.

1. **Create/confirm the corporate** — `admin /corporates` (entity gets its kind-prefixed UID).
2. **Define the package** — `admin/health-packages` (POST/PUT). Set, on the catalog row:
   - `features.tests` — the individual tests (one per line / delimited; the API splits them).
   - `features.type` = `annual` (so it classifies as the annual benefit).
   - `price`, `currency`.
   - `metadata.validityPeriod` (e.g. `"1 Year"` or `"45 Days"`), `metadata.frequency`.
   - `metadata.eligibleRelations` — **set explicitly** (`["self"]`, or include `spouse`/`parent`/… for
     family cover). Leaving it unset silently means self-only.
   - `metadata.venueMode` (`inherit` = use the corporate network; or restrict via step 4).
3. **Define the approved network** — `admin.route` → `corporate_network_assignments`: attach the
   labs/hospitals the corporate may use.
4. **(Optional) Restrict venues per package** — `admin/health-packages` venues →
   `health_package_venues` (per package + relation).
5. **Assign to employees** — `admin/health-packages` `tag-employees` → `user_health_packages`
   (grant the package to roster members with the correct `validFrom`/`validTo`).
6. **Provision employee logins** — `admin/corporate-employees` provision/welcome.
7. **Verify the read models** (section 8).

> HR may add employees to the roster and run the benefit-wallet, but **must not** be given a path to
> edit the catalog, network, venues, or entitlements — those remain Team-owned.

---

## 7. SOP — what each downstream layer may do

- **Corporate Admin (HR):** read the catalog/network; add & provision roster employees; run the
  benefit-wallet (programs/tiers/spend). HR changes never alter plan facts.
- **Corporate Employee:** view entitled package (tests/validity/eligible relations), pick an approved
  centre, book within the validity window, pay only when the server marks payment pending, reschedule/
  cancel. All values are read from the Team source + the employee's entitlement.

---

## 8. Verification checklist (run after any plan change)

- [ ] `corporate.route.js` still has **0** writes to the four plan-truth tables.
- [ ] `/corporate/health-packages` (HR) and `/health-checkups/packages` (employee) return the **same**
      package id, tests, price and validity for the same corporate.
- [ ] `/health-checkups/labs` returns the labs from `corporate_network_assignments` for the corporate.
- [ ] `metadata.eligibleRelations` on the catalog matches what the booking flow allows (no
      "family shown, self-only booking" contradiction).
- [ ] Employee dashboard network (section 5) is sourced from, or reconciled with,
      `corporate_network_assignments` — not a silently-empty separate table.
- [ ] Entitlements (`user_health_packages`) exist, are active, in-window, and unused for the members
      who should see the plan.
```
node server/scripts/ssm-env-loader.mjs scripts/ci/verify-entity-uid-rule.mjs   # entity integrity still green
```
