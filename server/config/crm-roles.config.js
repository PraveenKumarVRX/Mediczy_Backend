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
  [CRM_ROLES.TELECALLER]: 'Call Centre Agent',
  [CRM_ROLES.CONVERSION]: 'Conversion',
  [CRM_ROLES.SALES_REP]: 'Field Marketing Executive',
});

// Legacy default: any CRM login created before this role model existed has no
// `metadata.crmRole` set. Falling back to `sales_rep` preserves exactly the
// permission set those accounts already had (leads/deals/contacts/activities/
// reports) — nothing already in production loses access it was using.
export const DEFAULT_CRM_ROLE = CRM_ROLES.SALES_REP;

// capability -> roles allowed (besides admin, who always passes every check).
export const CRM_CAPABILITY_ROLES = Object.freeze({
  'contact_center:biometrics': [CRM_ROLES.BUSINESS_HEAD],
  'contact_center:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION],
  'contact_center:write': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION],
  'contact_center:configure': [CRM_ROLES.BUSINESS_HEAD],
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

  'segments:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'segments:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],

  'automations:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'automations:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING],
  // Running campaigns and editing campaign templates (Engage). Front-line roles message one patient at a time.
  'campaigns:manage': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING],

  'communication:configure': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD],
  'communication:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  // Includes telecaller/conversion/sales_rep alongside marketing: these are the
  // roles that actually work individual leads/deals day-to-day (the send scope
  // here is real leads/contacts/deals, not campaign broadcast — see
  // sendCrmMessage in hospital-crm-communication-hub.service.js).
  'communication:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],

  'foundation:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'foundation:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],

  // Broad read baseline — matches today's behavior, where any logged-in CRM
  // user could read these operational views (SLA queue, comms timeline, etc).
  'worldclass:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'worldclass:write': [CRM_ROLES.MARKETING_HEAD, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],

  // CRM team/user management — admin only.
  'team:manage': [],

  // Field force management — Business Head sees all, Sales Rep sees own data.
  'field_force:read':   [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.SALES_REP],
  'field_force:manage': [CRM_ROLES.BUSINESS_HEAD], // approve expenses, set targets, assign territories
});

// Capabilities business_head does NOT get for free, even as an executive
// override — provisioning/removing other people's CRM logins is a distinct,
// more sensitive action than operating the CRM itself.
const BUSINESS_HEAD_EXCLUDED_CAPABILITIES = new Set(['team:manage']);

/**
 * Does this CRM user have the given capability?
 * `isAdmin` / `crmRole === 'admin'` always passes. `business_head` is an
 * executive override — every capability except the excluded set above —
 * rather than being read-only in every domain: a hospital's business head
 * is accountable for the CRM's outcomes, not just its dashboards, and until
 * dedicated marketing_head/sales_rep logins exist in production, business_head
 * is also the only real account able to act on anything built here at all.
 */
export function hasCRMCapability(crmUser, capability) {
  if (!crmUser) return false;
  if (crmUser.isAdmin || crmUser.crmRole === CRM_ROLES.ADMIN) return true;
  const allowedRoles = CRM_CAPABILITY_ROLES[capability];
  if (!allowedRoles) return false; // unknown capability — fail closed
  const role = crmUser.crmRole || DEFAULT_CRM_ROLE;
  if (role === CRM_ROLES.BUSINESS_HEAD && !BUSINESS_HEAD_EXCLUDED_CAPABILITIES.has(capability)) return true;
  return allowedRoles.includes(role);
}

export function crmPermissionsForRole(role) {
  // Legacy `crmPermissions` array, kept for older client code paths that
  // still read `crmUser.permissions` rather than `crmUser.crmRole`.
  const base = ['leads', 'deals', 'contacts', 'activities', 'reports'];
  if (role === CRM_ROLES.ADMIN) return ['*', ...base];
  return base;
}
