// Client-side mirror of server/config/crm-roles.config.js.
// These are role-name strings only (nothing sensitive) — kept here so the
// sidebar can filter synchronously from localStorage without a round trip.
// If you change the server-side capability map, mirror the change here.

export const CRM_ROLES = {
  ADMIN: 'admin',
  BUSINESS_HEAD: 'business_head',
  MARKETING_HEAD: 'marketing_head',
  MARKETING: 'marketing',
  TELECALLER: 'telecaller',
  CONVERSION: 'conversion',
  SALES_REP: 'sales_rep',
} as const;

export type CRMRole = typeof CRM_ROLES[keyof typeof CRM_ROLES];

export const CRM_ROLE_LIST: CRMRole[] = Object.values(CRM_ROLES);

export const CRM_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  business_head: 'Business Head',
  marketing_head: 'Marketing Head',
  marketing: 'Marketing',
  telecaller: 'Telecaller',
  conversion: 'Conversion',
  sales_rep: 'Sales Representative',
};

export const CRM_CAPABILITY_ROLES: Record<string, string[]> = {
  'contact_center:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION],
  'contact_center:write': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION],
  'contact_center:configure': [CRM_ROLES.BUSINESS_HEAD],
  'contact_center:biometrics': [CRM_ROLES.BUSINESS_HEAD],
  'dashboard:business-head': [CRM_ROLES.BUSINESS_HEAD],
  'dashboard:marketing-head': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD],
  'dashboard:command-center': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD],
  'dashboard:people-performance': [CRM_ROLES.BUSINESS_HEAD],
  'dashboard:service-lines': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD],
  'dashboard:doctors': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD],

  'growth:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'specialty:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.SALES_REP],
  'communication:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'foundation:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],
  'worldclass:read': [CRM_ROLES.BUSINESS_HEAD, CRM_ROLES.MARKETING_HEAD, CRM_ROLES.MARKETING, CRM_ROLES.TELECALLER, CRM_ROLES.CONVERSION, CRM_ROLES.SALES_REP],

  'team:manage': [],
};

/** Does this CRM user (isAdmin flag + crmRole) have the given capability? */
export function hasCRMCapability(
  crmUser: { isAdmin?: boolean; crmRole?: string } | null | undefined,
  capability: string
): boolean {
  if (!crmUser) return false;
  if (crmUser.isAdmin || crmUser.crmRole === CRM_ROLES.ADMIN) return true;
  const allowedRoles = CRM_CAPABILITY_ROLES[capability];
  if (!allowedRoles) return false;
  const role = crmUser.crmRole || CRM_ROLES.SALES_REP;
  return allowedRoles.includes(role);
}
