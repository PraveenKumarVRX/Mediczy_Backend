import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

const ACTION_COLUMN = { view: 'can_view', create: 'can_create', edit: 'can_edit', delete: 'can_delete', export: 'can_export' };
const orgIdOf = (v) => parseInt(v, 10) || 0;

// tenant_entitlements has RLS, so the lookup must run inside a tenant-scoped transaction.
export async function hasModuleEntitlement(organizationId, moduleId, action = 'view') {
  const orgId = orgIdOf(organizationId);
  if (!organizationId || !moduleId || !ACTION_COLUMN[action]) return false;
  return withRlsTransaction(pool, { orgId, userId: 0, isPlatformAdmin: false }, async (client) => {
    const { rows } = await client.query(
      `SELECT 1 FROM tenant_entitlements e
       JOIN entitlement_packages p ON p.id = e.package_id AND p.is_active = TRUE
       WHERE e.organization_id = $1 AND e.module_id = $2 AND e.is_active = TRUE
         AND (e.${ACTION_COLUMN[action]} = TRUE)
         AND (e.starts_at IS NULL OR e.starts_at <= NOW())
         AND (e.ends_at IS NULL OR e.ends_at > NOW())
       LIMIT 1`,
      [orgId, moduleId]
    );
    return rows.length > 0;
  });
}

export function requireModuleEntitlement(moduleId, action = 'view') {
  return async (req, res, next) => {
    try {
      const organizationId = req.hospitalId || req.tenantId || req.user?.hospital_id || req.user?.tenant_id;
      if (!organizationId) return res.status(403).json({ success: false, code: 'TENANT_CONTEXT_REQUIRED', message: 'A tenant context is required for this module' });
      if (!(await hasModuleEntitlement(organizationId, moduleId, action))) {
        return res.status(403).json({ success: false, code: 'MODULE_NOT_ENTITLED', moduleId, action, message: 'This module is not enabled for your organization' });
      }
      return next();
    } catch (err) {
      console.error('[entitlement] lookup failed:', err);
      return res.status(503).json({ success: false, code: 'ENTITLEMENT_UNAVAILABLE', message: 'Module entitlement could not be verified' });
    }
  };
}

// ── Package lifecycle (platform-admin scoped) ─────────────────────────────────
// RLS policies allow app.is_platform_admin, so these use a platform-admin transaction.

const platformAdmin = (work) => withRlsTransaction(pool, { orgId: 0, userId: 0, isPlatformAdmin: true }, work);

export async function listEntitlements({ organizationId } = {}) {
  return platformAdmin(async (client) => (await client.query(
    `SELECT e.*, p.package_code, p.package_name,
            (e.is_active AND (e.starts_at IS NULL OR e.starts_at <= NOW()) AND (e.ends_at IS NULL OR e.ends_at > NOW())) AS currently_effective
     FROM tenant_entitlements e JOIN entitlement_packages p ON p.id = e.package_id
     WHERE ($1::bigint IS NULL OR e.organization_id = $1)
     ORDER BY e.organization_id, p.package_code, e.module_id`,
    [orgIdOf(organizationId) || null]
  )).rows);
}

export async function grantEntitlement(input, actorId) {
  const orgId = orgIdOf(input.organizationId);
  if (!orgId || !input.packageCode || !input.moduleId) throw new Error('organizationId, packageCode and moduleId are required');
  return platformAdmin(async (client) => {
    const pkg = (await client.query(
      `INSERT INTO entitlement_packages (package_code, package_name) VALUES ($1, COALESCE($2, $1))
       ON CONFLICT (package_code) DO UPDATE SET package_name = COALESCE(entitlement_packages.package_name, EXCLUDED.package_name) RETURNING id`,
      [input.packageCode, input.packageName || null]
    )).rows[0];
    return (await client.query(
      `INSERT INTO tenant_entitlements (organization_id, package_id, module_id, can_view, can_create, can_edit, can_delete, can_export, starts_at, ends_at, is_active, granted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11)
       ON CONFLICT (organization_id, package_id, module_id) DO UPDATE SET
         can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create, can_edit = EXCLUDED.can_edit,
         can_delete = EXCLUDED.can_delete, can_export = EXCLUDED.can_export, starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at, is_active = TRUE, granted_by = EXCLUDED.granted_by
       RETURNING *`,
      [orgId, pkg.id, input.moduleId,
        input.canView !== false, !!input.canCreate, !!input.canEdit, !!input.canDelete, !!input.canExport,
        input.startsAt || null, input.endsAt || null, actorId || null]
    )).rows[0];
  });
}

export async function revokeEntitlement(organizationId, packageCode, moduleId) {
  return platformAdmin(async (client) => {
    const { rows } = await client.query(
      `UPDATE tenant_entitlements e SET is_active = FALSE
       FROM entitlement_packages p
       WHERE p.id = e.package_id AND e.organization_id = $1 AND p.package_code = $2 AND e.module_id = $3
       RETURNING e.*`,
      [orgIdOf(organizationId), packageCode, moduleId]
    );
    if (!rows[0]) { const err = new Error('Entitlement not found'); err.status = 404; throw err; }
    return rows[0];
  });
}

// ── Seed data ────────────────────────────────────────────────────────────────
// Chart of accounts, the current fiscal period, standard GST codes and the first
// finance package grant. Idempotent: safe to re-run after each deployment.

export const DEFAULT_CHART_OF_ACCOUNTS = [
  ['1000', 'Cash', 'asset'], ['1010', 'Bank', 'asset'],
  ['1200', 'Accounts Receivable - Patient', 'asset'], ['1210', 'Accounts Receivable - Insurance', 'asset'],
  ['1500', 'Inventory', 'asset'], ['1800', 'Fixed Assets', 'asset'],
  ['2000', 'Accounts Payable', 'liability'], ['2100', 'Refunds Payable', 'liability'],
  ['2200', 'Accrued Expenses', 'liability'], ['2500', 'GST Payable', 'liability'],
  ['3000', 'Opening Balance Equity', 'equity'], ['3900', 'Retained Earnings', 'equity'],
  ['4000', 'Patient Revenue', 'income'], ['4010', 'Contractual Adjustments', 'income'],
  ['4900', 'Other Income', 'income'],
  ['5000', 'Operating Expenses', 'expense'], ['5100', 'Salaries & Wages', 'expense'],
  ['5200', 'Consumables', 'expense'], ['5300', 'Utilities', 'expense'],
];

export const DEFAULT_TAX_CODES = [
  ['GST0', 'GST 0%', 'gst', 0], ['GST5', 'GST 5%', 'gst', 5],
  ['GST12', 'GST 12%', 'gst', 12], ['GST18', 'GST 18%', 'gst', 18],
  ['GST28', 'GST 28%', 'gst', 28],
];

export async function seedDefaultFinanceSetup(organizationId, { periodCode, grantedBy } = {}) {
  const orgId = orgIdOf(organizationId);
  if (!orgId) throw new Error('organizationId is required');
  const year = new Date().getUTCFullYear();
  const code = periodCode || `${year}-04`; // Indian fiscal year starts in April
  const start = code.endsWith('-04') ? `${year}-04-01` : `${year}-01-01`;
  const end = code.endsWith('-04') ? `${year + 1}-03-31` : `${year}-12-31`;

  return platformAdmin(async (client) => {
    for (const [accountCode, name, type] of DEFAULT_CHART_OF_ACCOUNTS) {
      await client.query(
        `INSERT INTO finance_accounts (organization_id, account_code, account_name, account_type, is_system)
         VALUES ($1,$2,$3,$4,TRUE) ON CONFLICT (organization_id, account_code) DO NOTHING`,
        [orgId, accountCode, name, type]
      );
    }
    for (const [taxCode, name, taxType, rate] of DEFAULT_TAX_CODES) {
      await client.query(
        `INSERT INTO finance_tax_codes (organization_id, tax_code, tax_name, tax_type, rate)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id, tax_code) DO NOTHING`,
        [orgId, taxCode, name, taxType, rate]
      );
    }
    const period = (await client.query(
      `INSERT INTO finance_fiscal_periods (organization_id, period_code, start_date, end_date)
       VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id, period_code) DO NOTHING RETURNING *`,
      [orgId, code, start, end]
    )).rows[0];
    const pkg = (await client.query(
      `INSERT INTO entitlement_packages (package_code, package_name, description)
       VALUES ('essentials_finance','Essentials Finance','Core accounts module')
       ON CONFLICT (package_code) DO UPDATE SET package_name = EXCLUDED.package_name RETURNING id`
    )).rows[0];
    const grant = (await client.query(
      `INSERT INTO tenant_entitlements (organization_id, package_id, module_id, can_view, can_create, can_edit, can_export, granted_by)
       VALUES ($1,$2,'accounts_finance',TRUE,TRUE,TRUE,TRUE,$3)
       ON CONFLICT (organization_id, package_id, module_id) DO NOTHING RETURNING *`,
      [orgId, pkg.id, grantedBy || null]
    )).rows[0];
    return { organizationId: orgId, accounts: DEFAULT_CHART_OF_ACCOUNTS.length, taxCodes: DEFAULT_TAX_CODES.length, period, grant };
  });
}

export default {
  hasModuleEntitlement, requireModuleEntitlement, listEntitlements,
  grantEntitlement, revokeEntitlement, seedDefaultFinanceSetup,
};
