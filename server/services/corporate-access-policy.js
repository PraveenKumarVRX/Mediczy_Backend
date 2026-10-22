const denied = () =>
  Object.assign(
    new Error("This action is outside your assigned corporate access"),
    { statusCode: 403 },
  );
export function normalizeCorporateAccess(value = {}) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !["staff", "coordinator", "viewer"].includes(value.level)
  )
    throw Object.assign(
      new Error("Access level must be staff, coordinator or viewer"),
      { statusCode: 400 },
    );
  const result = { level: value.level };
  for (const key of ["departments", "businessUnits", "branches"]) {
    if (
      value[key] != null &&
      (!Array.isArray(value[key]) ||
        value[key].length > 100 ||
        value[key].some(
          (item) =>
            typeof item !== "string" || !item.trim() || item.length > 150,
        ))
    )
      throw Object.assign(new Error(`Invalid ${key} scope`), {
        statusCode: 400,
      });
    result[key] = [...new Set((value[key] || []).map((item) => item.trim()))];
  }
  return result;
}
export const isRestrictedCorporateAccess = (policy) =>
  Boolean(
    policy &&
      (policy.level === "coordinator" ||
        policy.level === "viewer" ||
        ["departments", "businessUnits", "branches"].some(
          (key) => policy[key]?.length,
        )),
  );
export function corporateScopeSql(policy, alias = "ce") {
  // Policies are always read from the database; reject malformed values rather than broadening access.
  const normalized = normalizeCorporateAccess(policy);
  const filters = [];
  const replacements = {};
  if (normalized.departments.length) {
    filters.push(`${alias}.department IN (:accessDepartments)`);
    replacements.accessDepartments = normalized.departments;
  }
  if (normalized.businessUnits.length) {
    filters.push(`${alias}.business_unit IN (:accessBusinessUnits)`);
    replacements.accessBusinessUnits = normalized.businessUnits;
  }
  if (normalized.branches.length) {
    filters.push(
      `COALESCE(NULLIF(${alias}.metadata->>'branch',''),(SELECT CASE WHEN COUNT(*)=1 THEN MIN(d.location) ELSE NULL END FROM corporate_departments d WHERE d.corporate_id=${alias}.corporate_id AND d.name=${alias}.department),'') IN (:accessBranches)`,
    );
    replacements.accessBranches = normalized.branches;
  }
  return { sql: filters.length ? filters.join(" AND ") : "TRUE", replacements };
}
export async function enforceCorporateAccess(req, database) {
  if (!isRestrictedCorporateAccess(req.corporateAccess)) return;
  const path = req.originalUrl.split("?")[0].replace(/\/$/, "");
  const read =
    /^\/api\/corporate\/(access\/(me|assigned-employees|appointments)|security\/mfa|my-benefits|doctors|programs\/doctors\/[^/]+\/availability)$/;
  if (req.method === "GET" && read.test(path)) return;
  if (
    req.method === "POST" &&
    /^\/api\/corporate\/security\/mfa\/(enroll|confirm|disable)$/.test(path)
  )
    return;
  if (req.corporateAccess.level === "viewer") throw denied();
  const create =
    req.method === "POST" && path === "/api/corporate/appointments";
  const update =
    req.method === "PUT" &&
    /^\/api\/corporate\/appointments\/[^/]+$/.test(path);
  if (!create && !update) throw denied();
  const scope = corporateScopeSql(req.corporateAccess);
  const replacements = {
    ...scope.replacements,
    corporateId: req.user.corporateId,
  };
  let sql;
  if (create) {
    sql = `SELECT ce.id FROM corporate_employees ce WHERE ce.corporate_id= :corporateId AND ce."employeeId"= :employeeId AND ce."isActive"=true AND ${scope.sql}`;
    replacements.employeeId = req.body.employeeId || "";
  } else {
    sql = `SELECT ce.id FROM corporate_scheduled_appointments a JOIN corporate_employees ce ON ce.corporate_id=a.corporate_id AND ce."employeeId"=a."employeeId" WHERE a.corporate_id= :corporateId AND a.id::text = :appointmentId AND ce."isActive"=true AND ${scope.sql}`;
    replacements.appointmentId = path.split("/").at(-1);
  }
  const rows = await database.query(sql, {
    replacements,
    type: database.QueryTypes.SELECT,
  });
  if (!rows.length) throw denied();
}
