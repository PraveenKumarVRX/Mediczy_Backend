/**
 * Supply-chain tenant isolation (WP-0.5) — configuration for the shared factory in tenant-scope.service.js.
 * Object names (scm_current_org, scm_assert_refs, scm_tenant_isolation) predate the factory and are kept so production
 * needs no rename. scm_staff is exempt: the login lookup runs before any organization is known.
 */
import { createTenantScope, TenantScopeError } from './tenant-scope.service.js';

export const ScmTenantError = TenantScopeError;

export const scmScope = createTenantScope({
  name: 'SCM',
  tablePattern: 'scm\\_%',
  noRls: ['scm_staff'],
  orgFn: 'scm_current_org', refsFn: 'scm_assert_refs', policy: 'scm_tenant_isolation',
  perOrgUnique: [
    ['scm_ap_invoices', 'invoice_number'], ['scm_asn', 'asn_number'], ['scm_blanket_orders', 'blanket_number'],
    ['scm_case_carts', 'cart_number'], ['scm_cost_centers', 'code'], ['scm_cycle_counts', 'count_number'],
    ['scm_grns', 'grn_number'], ['scm_indents', 'indent_number'], ['scm_purchase_orders', 'po_number'],
    ['scm_requisitions', 'req_number'], ['scm_warehouses', 'code'], ['scm_items', 'item_code'], ['scm_vendors', 'vendor_code'],
  ],
  refStems: {
    vendor: 'scm_vendors', item: 'scm_items', po: 'scm_purchase_orders', order: 'scm_purchase_orders', grn: 'scm_grns',
    warehouse: 'scm_warehouses', location: 'scm_locations', indent: 'scm_indents', invoice: 'scm_ap_invoices',
    blanket_order: 'scm_blanket_orders', preference_card: 'scm_preference_cards', case_cart: 'scm_case_carts',
    cycle_count: 'scm_cycle_counts', asn: 'scm_asn', charge_capture: 'scm_charge_captures', requisition: 'scm_requisitions',
    recall: 'scm_recalls', cost_center: 'scm_cost_centers',
  },
  // Shared approvals/audit tables carry an explicit organization_id, filtered by the governance service.
  extraOrgTables: ['operations_approvals', 'operations_audit_log'],
});

export const scmTenantIsolationApplied = (db) => scmScope.applied(db);
export const applyScmTenantIsolation = (pool, log) => scmScope.apply(pool, log);
export const ensureScmTenantIsolation = (pool) => scmScope.ensure(pool);
export const scopedScmDb = (pool, organizationId) => scmScope.scopedDb(pool, organizationId);
