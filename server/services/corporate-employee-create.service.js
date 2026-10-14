/**
 * Adding ONE employee to a corporate's list (POST /api/corporate/employees).
 *
 * Unlike bulk upload (which is deliberately an upsert), a single add must never silently overwrite
 * an existing employee: the old handler did, returned 201 anyway, and the page then prepended the
 * "created" row, so the same person showed up twice. It also reset an invited employee's metadata.
 *
 *   - employee ID already active in this corporate      -> EMPLOYEE_EXISTS (409)
 *   - same email on a different active employee         -> EMPLOYEE_EMAIL_EXISTS (409)
 *   - employee ID exists but was removed (isActive=false) -> re-activated (that is the only update)
 */

export class EmployeeConflictError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.statusCode = 409;
  }
}

const unwrapRows = (result) => (Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : []);

/** @param query async (sql, replacements) => Sequelize raw result */
export async function createCorporateEmployee(query, { corporateId, employeeId, name, email, businessUnit, department, designation, joiningDate }) {
  const normalizedEmployeeId = String(employeeId).trim();
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

  if (normalizedEmail) {
    const dup = unwrapRows(await query(
      `SELECT "employeeId" FROM corporate_employees
        WHERE corporate_id = :corporateId AND "isActive" = true
          AND lower(email) = :email AND "employeeId" <> :employeeId
        LIMIT 1`,
      { corporateId, email: normalizedEmail, employeeId: normalizedEmployeeId }
    ));
    if (dup.length) {
      throw new EmployeeConflictError('EMPLOYEE_EMAIL_EXISTS', `Another employee (ID ${dup[0].employeeId}) already uses this email.`);
    }
  }

  const [firstName, ...lastNameParts] = String(name).trim().split(/\s+/);
  const metadata = JSON.stringify({ firstName, lastName: lastNameParts.join(' '), profileActivation: 'inactive', activatedAt: null });

  // The ON CONFLICT branch only fires for a removed (inactive) row; for an active one the WHERE is false,
  // nothing is written and RETURNING yields no row.
  const written = unwrapRows(await query(
    `INSERT INTO corporate_employees (corporate_id, "userId", "employeeId", email, business_unit, department, designation, "joiningDate", metadata, "isActive", "createdAt", "updatedAt")
     VALUES (:corporateId, NULL, :employeeId, :email, :businessUnit, :department, :designation, :joiningDate, CAST(:metadata AS JSONB), true, NOW(), NOW())
     ON CONFLICT (corporate_id, "employeeId") DO UPDATE SET
       email = COALESCE(:email, corporate_employees.email),
       business_unit = :businessUnit,
       department = :department,
       designation = :designation,
       "joiningDate" = :joiningDate,
       metadata = CASE
         WHEN corporate_employees."userId" IS NOT NULL
           THEN COALESCE(corporate_employees.metadata, '{}'::jsonb) || jsonb_build_object('profileActivation', 'active')
         ELSE CAST(:metadata AS JSONB)
       END,
       "isActive" = true,
       "updatedAt" = NOW()
     WHERE corporate_employees."isActive" = false
     RETURNING "employeeId"`,
    {
      corporateId, employeeId: normalizedEmployeeId, email: normalizedEmail,
      businessUnit: businessUnit || null, department: department || null, designation: designation || null,
      joiningDate: joiningDate || null, metadata,
    }
  ));

  if (!written.length) {
    throw new EmployeeConflictError('EMPLOYEE_EXISTS', `An employee with ID ${normalizedEmployeeId} already exists. Edit that employee instead.`);
  }

  return {
    id: normalizedEmployeeId, employeeId: normalizedEmployeeId, name, email: normalizedEmail || '', phone: '',
    businessUnit: businessUnit || '', department: department || '', designation: designation || '', joiningDate: joiningDate || '',
    healthStatus: 'good', lastCheckup: '', insurancePlan: 'Standard Plan', appStatus: 'not_invited',
  };
}
