# Pharmacy Module — Gap Analysis vs. Full Pharmacy ERP

**Date:** 2026-10-19 · **Status as of 2026-10-19 (same day):** All gaps in §1 below are now
**implemented** (commit `504b59da`) except the one explicitly called out as unsafe to automate
(IPD stock deduction — see note after the table). This doc is kept as the record of what was wrong
and why; see the end of §1 for what changed under each row.

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

| Capability | Status (2026-10-19 start) | Status now | What changed |
|---|---|---|---|
| **OPD dispensing → billing** | Partial — billing created, inventory never deducted | ✅ Fixed | `emr-order-router.service.js:finalizePharmacyDispenseBilling()` now calls `issueFefo()` per line after posting the invoice (`server/services/emr-order-router.service.js`) |
| **IPD dispensing (eMAR)** | Minimal — status-only queue | ⚠️ Intentionally not automated | `pharmacy_dispense_queue`/`medication_orders` both store the drug as free text with no FK to `pharmacy_medicines` — wiring stock deduction would require unsafe fuzzy name-matching. Left as pure status tracking; a real fix needs a `medicine_id` column added at order-creation time (a doctor-ordering UI change, out of scope here) |
| **Cash sales / POS** | Partial — fake-model search, aggregate-only decrement | ✅ Fixed | `inventory.routes.js` rewritten onto the real catalog/stock/batches; `transactions.route.js` calls `issueFefo()`; client no longer sends a hardcoded `batchId: 0` |
| **Credit sales (OTC customer)** | Missing | ✅ Built | `pharmacy_credit_ledger` table + `credit_limit`/`credit_balance` on `pharmacy_customers`; POS supports a "Credit" payment method with limit enforcement; `credit.route.js` + a payment-recording UI on the Customers page |
| **Batch inventory + expiry/FEFO** | Built but orphaned | ✅ Wired in | `issueFefo()` now called from POS sales and OPD dispensing — verified against synthetic test data (depletes earliest-expiry batch first) |
| **Purchase orders** | Exists, no batch capture on receive | ✅ Fixed | `/receive` now optionally accepts batch/expiry per item and creates `pharmacy_batches` rows; `supplier_id` FK added alongside the free-text field |
| **Supplier management** | Missing | ✅ Built | `pharmacy_suppliers` table + `suppliers.route.js` + a Suppliers management page |
| **Sales returns** | Exists, restocks flat `pharmacy_stock` only | As-is | Still restocks the aggregate only, not a specific batch — correlating a return to the batch it was originally FEFO-issued from would need `pharmacy_transaction_items` to carry a `batch_id`, which it doesn't today. Not fixed in this pass; flagged for a follow-up if batch-level return traceability becomes a real requirement |
| **Supplier returns** | Missing | ✅ Built | `pharmacy_supplier_returns`/`pharmacy_supplier_return_items` tables + `supplier-returns.route.js` + a Supplier Returns page, decrementing stock/batches |
| **GST/HSN compliance** | Partial | ✅ Built | `hsn_code`/`gst_rate` on `pharmacy_medicines`; `cgst_amount`/`sgst_amount`/`igst_amount` on `pharmacy_invoices`, computed per line in `invoices.route.js` (intra-state CGST+SGST split; the pharmacy-level GSTIN already existed and was never a gap) |
| **Prescription linkage (POS)** | Partial — type existed, column didn't | ✅ Fixed | `pharmacy_transactions.prescription_id` column added; `transactions.route.js` now stores it |
| **Low-stock / near-expiry alerts** | Manual only | ✅ Built | `pharmacy-stock-alert-cron.service.js` scans all active pharmacies daily at 5 AM against each pharmacy's own thresholds, auto-creating `pharmacy_stock_alerts` rows |
| **Controlled-drug register / wastage / recalls** | Built but dead | ✅ Mounted | `governance.route.js` mounted at `/api/pharmacy/governance`; also fixed a real pre-existing bug found while verifying it (see below) |
| **Dashboard stats** | Partial (real route + dead mock route) | ✅ Fixed | The real `analytics.route.js` dashboard now shows real numbers since inventory is real; the dead `dashboard.routes.js` mock was deleted |

**Bonus finds while verifying the above:** `pharmacy-inventory-governance.service.js`'s schema-ready
check queried `information_schema.tables` through Sequelize, which silently reformats such queries
into a flat array of table names — so the check always failed, and would have made every FEFO-backed
POS sale throw a 503 the moment it went live. Fixed by switching that one check to the raw pg pool.
A related `recordControlledMovement` result-destructuring bug (returning the whole rows array instead
of the single inserted row) was fixed in the same pass. Both confirmed via a synthetic-pharmacy-id
smoke test against prod, then cleaned up.

---

## 2. Build order followed (completed 2026-10-19)

Fragmentation was fixed first so later feature work didn't land on the wrong data model:

1. ✅ Unified `inventory.routes.js` onto `pharmacy_medicines`/`pharmacy_stock`/`pharmacy_batches`;
   deleted the `MASTER_MEDICINES` fake-data fallback.
2. ✅ Wired `issueFefo()` into `transactions.route.js` (POS) and the OPD billing bridge.
3. ✅ Mounted `governance.route.js`; fixed the Sequelize/`information_schema` bug that would have
   broken it (and FEFO) in production.
4. ✅ Dashboard now shows real numbers now that inventory is real; dead mock route deleted.
5. ✅ Automated low-stock/near-expiry cron added (`pharmacy-stock-alert-cron.service.js`).
6. ✅ New schema + features: supplier master, customer credit ledger, GST/HSN + invoice tax split,
   supplier returns, prescription-linkage column, batch-row creation on PO receive.

Remaining, deliberately not done: IPD stock deduction (no safe medicine-id link exists yet) and
batch-level return traceability (would need a schema change to `pharmacy_transaction_items`) — see
the notes in §1's table.
