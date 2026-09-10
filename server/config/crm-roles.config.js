// CRM role model — who can log into the CRM and what each role can see/do.
// Everything here lives in `users.metadata` (JSONB) on the existing users table;
// no schema migration is required to introduce or change roles.

export const CRM_ROLES = Object.freeze({
  ADMIN: 'admin',
  BUSINESS_HEAD: 'business_head',
  MARKETING_HEAD: 'marketing_head',
  MARKETING: 'marketing',
  TELECALLER: 'telecaller',
  CONVERSION: 'conversion',
  SALES_REP: 'sales_rep',
});

export const CRM_ROLE_LIST = Object.values(CRM_ROLES);

export const CRM_ROLE_LABELS = Object.freeze({
  [CRM_ROLES.ADMIN]: 'Admin',
  [CRM_ROLES.BUSINESS_HEAD]: 'Business Head',
  [CRM_ROLES.MARKETING_HEAD]: 'Marketing Head',
  [CRM_ROLES.MARKETING]: 'Marketing',
  [CRM_ROLES.TELECALLER]: 'Telecaller',
  [CRM_ROLES.CONVERSION]: 'Conversion',
  [CRM_ROLES.SALES_REP]: 'Sales Representative',
});

// Legacy default: any CRM login created before this role model existed has no
// `metadata.crmRole` set. Falling back to `sales_rep` preserves exactly the
// permission set those accounts already had (leads/deals/contacts/activities/
// reports) — nothing already in production loses access it was using.
export const DEFAULT_CRM_ROLE = CRM_ROLES.SALES_REP;

// capability -> roles allowed (besides admin, who always passes every check).
export const CRM_CAPABILITY_ROLES = Object.freeze({
  // Executive dashboards — the sensitive ones.
  'dashboard:business-head': [CRM_ROLES.BUSINESS_HEAD],
  'dashboard:marketing-head': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD],
  // Nav-only alias covering the combined Command Center page (business-head + marketing-head sections).
  'dashboard:command-center': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD],
  'dashboard:people-performance': [CRM_ROLES.BUSINESS_HEAD], // carries salary/incentive data
  'dashboard:service-lines': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD],
  'dashboard:doctors': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD],

  // Hospital Growth OS domain — broad read, narrower write.
  'growth:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'growth:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING],

  'specialty:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.SALES_REP],
  'specialty:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING],

  'communication:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'communication:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING],

  'foundation:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'foundation:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],

  // Broad read baseline — matches today's behavior, where any logged-in CRM
  // user could read these operational views (SLA queue, comms timeline, etc).
  'worldclass:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'worldclass:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],

  // CRM team/user management — admin only.
  'team:manage': [],
});

/**
 * Does this CRM user have the given capability?
 * Either the platform `isAdmin` flag (the override pattern already used
 * throughout server/routes/crm.route.js) or `crmRole === 'admin'` always passes.
 */
export function hasCRMCapability(crmUser, capability) {
  if (!crmUser) return false;
  if (crmUser.isAdmin || crmUser.crmRole === CRM_ROLES.ADMIN) return true;
  const allowedRoles = CRM_CAPABILITY_ROLES[capability];
  if (!allowedRoles) return false; // unknown capability — fail closed
  const role = crmUser.crmRole || DEFAULT_CRM_ROLE;
  return allowedRoles.includes(role);
}

export function crmPermissionsForRole(role) {
  // Legacy `crmPermissions` array, kept for older client code paths that
  // still read `crmUser.permissions` rather than `crmUser.crmRole`.
  const base = ['leads', 'deals', 'contacts', 'activities', 'reports'];
  if (role === CRM_ROLES.ADMIN) return ['*', ...base];
  return base;
}
