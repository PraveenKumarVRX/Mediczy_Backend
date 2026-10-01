/**
 * tenants.type -> users.organization_type.
 *
 * The two vocabularies do not match. tenants.type has 13 values (hospital, clinic, lab,
 * diagnostic_centre, pharmacy, ambulance, corporate, homecare, tpa, psu, ngo, insurer, broker —
 * plus 'aggregator', which exists in the Postgres enum but not in the Sequelize model), while
 * users.organization_type has only six (hospital, clinic, corporate, lab, pharmacy, individual).
 *
 * So some tenant types CANNOT be expressed on a user row. Those return null, and callers must
 * decide what to do rather than silently substituting a wrong value — substituting 'hospital'
 * for a corporate is exactly the bug this module exists to stop.
 */

const TENANT_TO_USER_ORG_TYPE = Object.freeze({
  hospital: 'hospital',
  clinic: 'clinic',
  corporate: 'corporate',
  lab: 'lab',
  pharmacy: 'pharmacy',
  // A diagnostic centre is a lab as far as a user row can express it.
  diagnostic_centre: 'lab',
  // No user-side equivalent: ambulance, homecare, tpa, psu, ngo, insurer, broker, aggregator.
});

/** The users.organization_type for a tenant type, or null when it cannot be expressed. */
export const userOrgTypeForTenantType = (tenantType) =>
  TENANT_TO_USER_ORG_TYPE[String(tenantType || '').toLowerCase()] || null;

/**
 * Resolve the organization_type an HR/staff session should scope by.
 *
 * Order: the tenant's own type (authoritative) -> whatever the token carried -> 'hospital'.
 * The final fallback preserves the behaviour that shipped before this module existed; it is
 * reached only for tenant types with no user-side equivalent, and `expressible` is false then
 * so callers can log it instead of trusting it.
 */
export const resolveOrgTypeForTenant = (tenant, tokenOrgType) => {
  const fromTenant = userOrgTypeForTenantType(tenant?.type);
  if (fromTenant) return { orgType: fromTenant, expressible: true, tenantType: tenant?.type || null };
  return {
    orgType: tokenOrgType || 'hospital',
    expressible: false,
    tenantType: tenant?.type || null,
  };
};

export default { userOrgTypeForTenantType, resolveOrgTypeForTenant, TENANT_TO_USER_ORG_TYPE };
