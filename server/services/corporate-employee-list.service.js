/**
 * Merge corporate employee roster rows with user_association-backed accounts
 * for the team portal welcome-email workflow.
 */

function parseMetadata(value) {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function resolvedEmployeeId(row, meta = {}) {
  return row.user_employee_id
    || row.corporate_employee_id
    || meta.employeeId
    || row.employeeId
    || '';
}

function buildWelcomeFlags(row) {
  const userId = row.id != null ? Number(row.id) : null;
  const email = String(row.email || '').trim();
  const hasAssociation = row.hasAssociation !== false;
  return {
    hasUserAccount: Number.isInteger(userId) && userId > 0,
    hasAssociation,
    rosterOnly: !hasAssociation,
    welcomeEligible: Number.isInteger(userId) && userId > 0 && email.length > 0,
  };
}

export function normalizeAssociationEmployee(row) {
  const meta = parseMetadata(row.metadata);
  const employeeId = resolvedEmployeeId(row, meta);

  return {
    ...row,
    metadata: meta,
    corporate_employee_id: row.corporate_employee_id || employeeId || null,
    user_employee_id: row.user_employee_id || employeeId || null,
    hasAssociation: true,
    ...buildWelcomeFlags({ ...row, hasAssociation: true }),
  };
}

export function normalizeRosterEmployee(row) {
  const ceMeta = parseMetadata(row.ce_metadata);
  const uaMeta = parseMetadata(row.metadata);
  const meta = { ...ceMeta, ...uaMeta };
  const employeeId = row.corporate_employee_id || row.user_employee_id || meta.employeeId || '';
  const hasAssociation = Boolean(row.has_association);

  return {
    id: row.id ?? null,
    email: row.email || meta.email || '',
    firstName: row.firstName || meta.firstName || '',
    lastName: row.lastName || meta.lastName || '',
    phoneNumber: row.phoneNumber || meta.phoneNumber || '',
    address_city: row.address_city || meta.city || null,
    address_state: row.address_state || meta.state || null,
    address_zipCode: row.address_zipCode || meta.pinCode || null,
    department_name: row.department_name || row.ce_department || meta.department || null,
    user_employee_id: row.user_employee_id || employeeId || null,
    corporate_employee_id: employeeId || null,
    corporate_employee_row_id: row.corporate_employee_row_id,
    gender: row.gender || null,
    dateOfBirth: row.dateOfBirth || null,
    metadata: meta,
    status: row.status || (row.ce_is_active === false ? 'inactive' : 'active'),
    startDate: row.startDate || row.joiningDate || null,
    currentPackageId: row.currentPackageId || null,
    currentPackageName: row.currentPackageName || null,
    packageValidTo: row.packageValidTo || null,
    lastLoginAt: row.lastLoginAt || null,
    lastActivityAt: row.lastActivityAt || null,
    loginCount: row.loginCount ?? 0,
    requirePasswordChange: row.requirePasswordChange ?? true,
    welcomeEmailStatus: row.welcomeEmailStatus || null,
    welcomeEmailSentAt: row.welcomeEmailSentAt || null,
    hasAssociation,
    ...buildWelcomeFlags({ id: row.id, email: row.email || meta.email, hasAssociation }),
  };
}

function indexKeys(record) {
  const keys = [];
  if (record.id != null) keys.push(`user:${record.id}`);
  const employeeId = String(record.user_employee_id || record.corporate_employee_id || record.metadata?.employeeId || '').trim().toLowerCase();
  if (employeeId) keys.push(`emp:${employeeId}`);
  if (record.corporate_employee_row_id != null) keys.push(`ce:${record.corporate_employee_row_id}`);
  return keys;
}

/**
 * @param {Array<object>} associationRows
 * @param {Array<object>} rosterRows
 */
export function mergeCorporateEmployeeRows(associationRows = [], rosterRows = []) {
  const merged = new Map();

  const remember = (record) => {
    for (const key of indexKeys(record)) {
      if (!merged.has(key)) merged.set(key, record);
    }
  };

  const hasMatch = (record) => indexKeys(record).some((key) => merged.has(key));

  for (const row of associationRows) {
    remember(normalizeAssociationEmployee(row));
  }

  for (const row of rosterRows) {
    const normalized = normalizeRosterEmployee(row);
    if (hasMatch(normalized)) continue;
    remember(normalized);
  }

  const unique = new Map();
  for (const record of merged.values()) {
    const canonical = record.id != null
      ? `user:${record.id}`
      : (record.corporate_employee_row_id != null
        ? `ce:${record.corporate_employee_row_id}`
        : `emp:${String(record.user_employee_id || record.corporate_employee_id || '').toLowerCase()}`);
    if (!unique.has(canonical)) unique.set(canonical, record);
  }

  return [...unique.values()].sort((a, b) => {
    const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email || '';
    const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.email || '';
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });
}

export const CORPORATE_EMPLOYEE_ASSOCIATION_SQL = `
  SELECT u.id, u.email, u."firstName", u."lastName", u."phoneNumber",
         u.address_city, u.address_state, u."address_zipCode",
         u.department_name, u.employee_id AS user_employee_id,
         u.gender, u."dateOfBirth",
         ua.metadata, ua.status, ua."startDate",
         ce.id AS corporate_employee_row_id,
         ce."employeeId" AS corporate_employee_id,
         uhp."packageId" AS "currentPackageId",
         uhp."packageName" AS "currentPackageName",
         uhp."validTo" AS "packageValidTo",
         u."lastLoginAt",
         u."lastActivityAt",
         u."loginCount",
         (u.metadata->>'requirePasswordChange')::boolean AS "requirePasswordChange",
         wd.status AS "welcomeEmailStatus",
         wd.updated_at AS "welcomeEmailSentAt",
         true AS has_association
  FROM users u
  JOIN user_associations ua ON u.id = ua."userId"
  LEFT JOIN corporate_employees ce
    ON ce."userId" = u.id AND ce.corporate_id = :corporateId
  LEFT JOIN LATERAL (
    SELECT "packageId", "packageName", "validTo"
    FROM user_health_packages
    WHERE "userId" = u.id AND corporate_id = :corporateId AND status = 'active'
    ORDER BY "validTo" DESC LIMIT 1
  ) uhp ON true
  LEFT JOIN LATERAL (
    SELECT status, updated_at
    FROM corporate_welcome_email_deliveries
    WHERE corporate_id = :corporateId
      AND LOWER(recipient_email) = LOWER(u.email)
      AND COALESCE(metadata->>'source', '') <> 'brevo_transactional_history'
      AND status IN ('queued', 'sent')
    ORDER BY CASE WHEN status = 'sent' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1
  ) wd ON true
  WHERE ua."entityType" = 'corporate'
    AND ua."entityId" = :corporateId
    AND ua.role = 'employee'
`;

export const CORPORATE_EMPLOYEE_ROSTER_SQL = `
  SELECT u.id, u.email, u."firstName", u."lastName", u."phoneNumber",
         u.address_city, u.address_state, u."address_zipCode",
         u.department_name, u.employee_id AS user_employee_id,
         u.gender, u."dateOfBirth",
         ua.metadata, ua.status, ua."startDate",
         ce.id AS corporate_employee_row_id,
         ce."employeeId" AS corporate_employee_id,
         ce.department AS ce_department,
         ce.designation AS ce_designation,
         ce."joiningDate",
         ce."isActive" AS ce_is_active,
         ce.metadata AS ce_metadata,
         uhp."packageId" AS "currentPackageId",
         uhp."packageName" AS "currentPackageName",
         uhp."validTo" AS "packageValidTo",
         u."lastLoginAt",
         u."lastActivityAt",
         u."loginCount",
         (u.metadata->>'requirePasswordChange')::boolean AS "requirePasswordChange",
         wd.status AS "welcomeEmailStatus",
         wd.updated_at AS "welcomeEmailSentAt",
         (ua.id IS NOT NULL) AS has_association
  FROM corporate_employees ce
  LEFT JOIN users u ON u.id = ce."userId"
  LEFT JOIN user_associations ua
    ON ua."userId" = u.id
   AND ua."entityType" = 'corporate'
   AND ua."entityId" = :corporateId
   AND ua.role = 'employee'
  LEFT JOIN LATERAL (
    SELECT "packageId", "packageName", "validTo"
    FROM user_health_packages
    WHERE "userId" = u.id AND corporate_id = :corporateId AND status = 'active'
    ORDER BY "validTo" DESC LIMIT 1
  ) uhp ON true
  LEFT JOIN LATERAL (
    SELECT status, updated_at
    FROM corporate_welcome_email_deliveries
    WHERE corporate_id = :corporateId
      AND u.email IS NOT NULL
      AND LOWER(recipient_email) = LOWER(u.email)
      AND COALESCE(metadata->>'source', '') <> 'brevo_transactional_history'
      AND status IN ('queued', 'sent')
    ORDER BY CASE WHEN status = 'sent' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1
  ) wd ON true
  WHERE ce.corporate_id = :corporateId
`;
