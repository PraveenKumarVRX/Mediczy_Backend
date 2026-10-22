/** Keep corporate-only access in step with HR roster changes; personal plans are untouched. */
export async function synchronizeCorporateEmployment(
  database,
  corporateId,
  employees,
  active,
  transaction,
) {
  const userIds = [
    ...new Set(employees.map((employee) => employee.userId).filter(Boolean)),
  ];
  if (!userIds.length) return;
  const options = {
    transaction,
    replacements: {
      corporateId,
      userIds,
      active,
      associationStatus: active ? "active" : "inactive",
    },
  };
  await database.query(
    `UPDATE user_associations SET status=:associationStatus,"updatedAt"=NOW()
   WHERE "entityType"='corporate' AND "entityId"=:corporateId AND role='employee' AND "userId" IN (:userIds)`,
    options,
  );
  if (active) {
    await database.query(
      `INSERT INTO user_associations("userId","entityType","entityId",role,status,corporate_unique_id,metadata,"createdAt","updatedAt")
   SELECT DISTINCT ce."userId",'corporate',ce.corporate_id,'employee','active',c.unique_id,jsonb_build_object('employeeId',ce."employeeId"),NOW(),NOW()
   FROM corporate_employees ce JOIN corporates c ON c.id=ce.corporate_id WHERE ce.corporate_id=:corporateId AND ce."userId" IN (:userIds) AND ce."isActive"=true
   AND NOT EXISTS(SELECT 1 FROM user_associations ua WHERE ua."userId"=ce."userId" AND ua."entityType"='corporate' AND ua."entityId"=ce.corporate_id AND ua.role='employee')`,
      options,
    );
    await database.query(
      `UPDATE user_health_packages SET status='active',"packageDetails"="packageDetails"-'corporateOffboarded',"updatedAt"=NOW()
   WHERE corporate_id=:corporateId AND "userId" IN (:userIds) AND "packageDetails"->>'corporateOffboarded'='true' AND ("validTo" IS NULL OR "validTo">=NOW())`,
      options,
    );
    await database.query(
      `UPDATE user_subscriptions us SET status='ACTIVE',metadata=COALESCE(us.metadata,'{}')-'corporateOffboarded',updated_at=NOW()
   FROM subscription_plans p WHERE p.id=us.plan_id AND p.type='CORPORATE' AND p.metadata->>'corporateId'=:corporateId::text AND p.is_active=true
   AND us.user_id IN (:userIds) AND us.metadata->>'corporateOffboarded'='true' AND (us.end_date IS NULL OR us.end_date>=NOW())`,
      options,
    );
  } else {
    await database.query(
      `UPDATE user_health_packages SET status='inactive',"packageDetails"=COALESCE("packageDetails",'{}')||'{"corporateOffboarded":true}'::jsonb,"updatedAt"=NOW()
   WHERE corporate_id=:corporateId AND "userId" IN (:userIds) AND status='active'`,
      options,
    );
    await database.query(
      `UPDATE user_subscriptions us SET status='CANCELLED',metadata=COALESCE(us.metadata,'{}')||'{"corporateOffboarded":true}'::jsonb,updated_at=NOW()
   FROM subscription_plans p WHERE p.id=us.plan_id AND p.type='CORPORATE' AND p.metadata->>'corporateId'=:corporateId::text AND us.user_id IN (:userIds) AND us.status='ACTIVE'`,
      options,
    );
  }
}
