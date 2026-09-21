/**
 * Tenant isolation for the department modules that create their own tables on first use (WP-0.5, PRs 2 and 3):
 * blood bank, CSSD and dietary. Same mechanism as supply chain (see tenant-scope.service.js). These tables do not exist
 * on production yet, so there is nothing to backfill: the routes create them, then ensure() adds organization_id and
 * forced row-level security before the first request is served.
 */
import { createTenantScope } from './tenant-scope.service.js';

export const bloodBankScope = createTenantScope({
  name: 'BloodBank',
  tables: ['blood_bank_units', 'blood_bank_requisitions', 'blood_bank_donors', 'blood_donor_donations',
    'blood_donor_communications', 'blood_donor_comm_recipients', 'blood_bank_audit_events'],
  perOrgUnique: [['blood_bank_units', 'unit_number'], ['blood_bank_requisitions', 'requisition_number'], ['blood_bank_donors', 'donor_id']],
  // donor_id on the donors table is the donor's public code (text), so references are taken from declared foreign keys only.
});

export const cssdScope = createTenantScope({
  name: 'CSSD',
  tables: ['cssd_sets', 'cssd_cycles', 'cssd_jobs', 'cssd_set_usage'],
  perOrgUnique: [['cssd_sets', 'set_code'], ['cssd_jobs', 'job_number']],
  refStems: { set: 'cssd_sets', cycle: 'cssd_cycles' },
});

export const dietaryScope = createTenantScope({
  name: 'Dietary',
  tables: ['dietary_orders', 'dietary_templates', 'dietary_counselling'],
  perOrgUnique: [['dietary_orders', 'order_number']],
  refStems: { order: 'dietary_orders' },
});
