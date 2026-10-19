# Pharmacy Module — Gap Analysis vs. Full Pharmacy ERP

**Date:** 2026-10-19
**Scope:** Compare Mediqzy's pharmacy module against the feature set of a complete retail/hospital
pharmacy ERP (OPD/IPD dispensing, cash/credit sales, batch-wise inventory with expiry/FEFO, purchase
orders, supplier management, sales/supplier returns, GST/HSN compliance, prescription linkage,
automated stock/expiry alerts) — the baseline used by DRXStore, Pharmacy POS, PharmaCare ERP and
similar open-source pharmacy systems.

---

## 0. Architecture finding that drives every gap below

The pharmacy module is not one system — it is **four parallel, mostly-disconnected data models**,
plus a hospital-wide procurement module (SCM) that never talks to pharmacy at all:

| # | Model | Tables | Used by |
|---|---|---|---|
| 1 | **"Classic" pharmacy tables** | `pharmacy_medicines`, `pharmacy_stock`, `pharmacy_batches`, `pharmacy_transactions`, `pharmacy_transaction_items`, `pharmacy_prescriptions`, `pharmacy_customers`, `pharmacy_purchase_orders`, `pharmacy_returns`, `pharmacy_invoices`, `pharmacy_stock_movements`, `pharmacy_controlled_movements`, `pharmacy_wastage`, `pharmacy_recalls` | Most of the real `/api/pharmacy/*` routes; the most ERP-complete model (has FEFO engine, governance, audit) |
| 2 | **`pharmacy_inventory`** (flat, Sequelize) | `pharmacy_inventory` | **The live POS and Inventory UI** (`inventory.routes.js`) — falls back to a **hardcoded 100-item `MASTER_MEDICINES` array with `Math.random()` fake stock/expiry** when the table is empty |
| 3 | **`api_pharmacy_orders` / `api_prescriptions`** | separate JSON-blob tables | A tenant-scoped B2B partner API (`api-v1-pharmacy.js`), unrelated to in-store operations |
| 4 | **`pharmacy_dispense_queue`** | bare status queue, `drug_name` free text | IPD eMAR dispense bridge — no link to any medicine/stock table |
| — | **SCM module** (`scm_items`, has `hsn_code`/`gst_rate`) | hospital-wide procurement | Zero references to "pharmacy" anywhere — fully separate system |

**Consequence:** the cashier searches and adds medicines from model #2 (often fake demo data), while
real stock lives in model #1. In the common case where `pharmacy_inventory` is empty, **the POS sells
against fabricated IDs with random stock/expiry, not real inventory.**

**Also confirmed by querying production directly (not just reading code):** migration
`server/db/migrations/033-pharmacy-compliance-and-returns.sql` was never applied. `pharmacy_returns`,
`pharmacy_return_items`, and `pharmacy_audit_logs` don't exist in prod; neither do
`pharmacy_medicines.is_controlled`, the `pharmacy_prescriptions` verification columns, or
`pharmacy_purchase_orders.received_at`/`received_by`. The sales-returns route, the controlled-drug
pharmacist-review gate, and audit logging are all deployed in code and look complete, but are
currently non-functional in prod because their tables/columns don't exist. Live row counts (4
pharmacies, 27 rows total in `pharmacy_inventory`, zero rows in every classic ERP table) confirm there
is no real data at risk in fixing any of this now.

A second structural problem: the single most ERP-complete code in the module —
`server/routes/pharmacy/governance.route.js` (controlled-drug register, wastage, recalls) — is fully
implemented but **never mounted into `app.js` or `pharmacy.route.js`**, so none of it is reachable by
any client. Likewise the FEFO engine in `pharmacy-inventory-governance.service.js` (`issueFefo()`) is
only ever called from a test file — never from the live sale or dispense paths.

Any implementation plan has to fix this fragmentation first (pick model #1 as the single source of
truth and retire/migrate model #2), or every feature built on top inherits the same split-brain bug.

---

## 1. Capability matrix

| Capability | Status | Evidence | Gap |
|---|---|---|---|
| **OPD dispensing → billing** | Partial | `prescriptions.route.js` → `emr-order-router.service.js:finalizePharmacyDispenseBilling()` creates `pharmacy_invoices` + posts to `hospital_billing_charges` | Billing is created but **inventory is never deducted** — totals come from `unit_price`, not stock/batches |
| **IPD dispensing (eMAR)** | Minimal | `pharmacy_dispense_queue` + `emar-pharmacy-bridge.service.js`, `pending`→`dispensed` status only | No stock/batch deduction, no FEFO, no billing-charge creation on dispense |
| **Cash sales / POS** | Partial | `transactions.route.js` real DB insert + aggregate `pharmacy_stock` decrement; `PharmacyPOSPage` wired to it | Medicine search hits the fake-fallback model #2; stock decrement is aggregate-only (hardcoded `batchId: 0`), not FEFO/batch-aware |
| **Credit sales (OTC customer)** | **Missing** | `pharmacy_customers` has only `loyalty_points`; `payment_method` is free text | No credit limit/balance/ledger table for pharmacy-counter customers at all (hospital-wide `hospital_credit_ledger` is a different, patient-billing concept) |
| **Batch inventory + expiry/FEFO** | Built but orphaned | `pharmacy_batches` table + `issueFefo()` in `pharmacy-inventory-governance.service.js` is a real, correct FEFO engine | Never called by `transactions.route.js` or `prescriptions.route.js` — FEFO logic exists and is dead |
| **Purchase orders** | Exists | `purchase-orders.route.js`: create + `/receive` bumps `pharmacy_stock.quantity` | Receiving doesn't create a `pharmacy_batches` row — no automatic batch/expiry capture on goods-in |
| **Supplier management** | **Missing** | `supplier` is a bare `VARCHAR(255)` duplicated across 3 tables | No supplier master (contact, GSTIN, payment terms, outstanding payable, performance) |
| **Sales returns** | Exists | `returns.route.js`: validates qty against sold-minus-returned, restocks, audit-logged | Restock goes to flat `pharmacy_stock` only, no batch re-association |
| **Supplier returns** | **Missing** | — | No route/table anywhere for returning expired/damaged stock to a supplier |
| **GST/HSN compliance** | **Partial** | The `pharmacies` tenant table already has a `gstNumber` column (readable/writable via the existing profile endpoints); `pharmacy_medicines` has no `hsn_code`/`gst_rate`; `pharmacy_invoices` has flat `tax_amount` only, no CGST/SGST/IGST split | Per-medicine HSN/rate and per-invoice tax split are missing; the pharmacy-level GSTIN itself is not a gap |
| **Prescription linkage (POS)** | Partial | EMR-side `pharmacy_prescriptions` workflow is real; `pharmacy.service.ts` types accept `prescriptionId` | `transactions.route.js`'s actual handler never reads/stores it — no DB column links a counter sale back to a prescription |
| **Low-stock / near-expiry alerts** | Manual only | `pharmacy_stock_alerts` table + route let a user create an alert by hand; dashboard counts are computed client-side from often-fake inventory data | **No cron job scans stock/batches automatically** — the only pharmacy-tagged cron is `drug_price_sync` (catalog pricing, unrelated) |
| **Controlled-drug register / wastage / recalls** | Built but dead | `governance.route.js` fully implements all three against real tables | Route file is never imported/mounted — 0% reachable via HTTP |
| **Dashboard stats** | Partial | The page actually used, `PharmacyDashboard.tsx`, calls `analytics.route.js`'s `/dashboard` — a real, correct query against `pharmacy_stock`/`pharmacy_transactions`. `dashboard.routes.js` (`/api/pharmacy/dashboard/stats`) is 100% hardcoded mock JSON, but is dead code — zero references anywhere in the client | The real dashboard shows real zeros only because the underlying tables are empty (see §0); fixing the data-model unification fixes this with no dashboard code changes. The dead mock route should just be deleted |

---

## 2. Recommended build order

Fixing fragmentation has to come before most feature work, or new features get built on the wrong
data model again.

1. **Unify on model #1** — make `inventory.routes.js` read/write the real `pharmacy_medicines` /
   `pharmacy_stock` / `pharmacy_batches` tables instead of the flat `pharmacy_inventory` model, and
   delete the `MASTER_MEDICINES` fake-data fallback. This alone fixes the POS/cart mismatch.
2. **Wire the existing FEFO engine into the live paths** — call `issueFefo()` from
   `transactions.route.js` (POS sale) and the OPD/IPD dispense paths instead of the aggregate
   `pharmacy_stock` decrement. The engine already exists; this is integration, not new logic.
3. **Mount `governance.route.js`** — zero-cost win: controlled-drug register, wastage, recalls are
   fully built, just need one line in `pharmacy.route.js`/`app.js`.
4. **Replace the fake dashboard** with real aggregate queries once #1 is fixed (the numbers are
   meaningless until inventory is real).
5. **Add automated low-stock/near-expiry cron** — a scheduled job over the now-real `pharmacy_stock`/
   `pharmacy_batches`, following the `tick()`/`tickStart()`/`tickError()` convention in
   `server/utils/cronRegistry.js`.
6. **New schema + features**: supplier master table, pharmacy customer credit ledger, GST/HSN columns
   on `pharmacy_medicines`/`pharmacy_invoices` + CGST/SGST/IGST split, supplier-return workflow,
   prescription-linkage column on `pharmacy_transactions`, batch-row creation on PO receive.

Steps 1–4 are prerequisite plumbing fixes to code that already exists; step 6 is genuinely new feature
work. Attempting step 6 before steps 1–3 would add GST/credit/supplier features on top of the broken
dual-model split and the dead FEFO engine, reproducing the same bugs in new code.
