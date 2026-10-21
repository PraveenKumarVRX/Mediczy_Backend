import { postgresSequelize as db } from '../db/postgres-sequelize.js';
const problem = (message, status = 400) => Object.assign(new Error(message), { status });
export async function activateAhcBatch({ corporateId, batchId, packageId }) {
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(String(packageId || '')))
        throw problem('Select a configured health checkup package before activating this batch');
    return db.transaction(async (transaction) => {
        const query = (sql, replacements) => db.query(sql, { replacements, transaction, type: db.QueryTypes.SELECT });
        const [batch] = await query('SELECT id,status FROM corporate_ahc_batches WHERE id=:batchId AND corporate_id=:corporateId FOR UPDATE', { batchId, corporateId });
        if (!batch)
            throw problem('Batch not found', 404);
        if (batch.status !== 'planning')
            throw problem('Only planning batches can be activated', 409);
        const [plan] = await query(`SELECT * FROM corporate_health_package_catalog WHERE id=:packageId AND is_active=true AND metadata->>'kind'='health_checkup' AND metadata->>'corporateId'=:corporateId FOR UPDATE`, { packageId, corporateId: String(corporateId) });
        if (!plan)
            throw problem('Select an active package configured for this corporate');
        const members = await query(`SELECT DISTINCT ce."userId" FROM corporate_ahc_enrollments e JOIN corporate_employees ce ON ce.corporate_id=e.corporate_id AND ce."employeeId"=e.employee_id AND ce."isActive"=true JOIN user_associations ua ON ua."userId"=ce."userId" AND ua."entityId"=ce.corporate_id AND ua."entityType"='corporate' AND ua.role='employee' AND ua.status='active' WHERE e.batch_id=:batchId AND e.corporate_id=:corporateId AND e.status IN ('pending','invited')`, { batchId, corporateId });
        if (!members.length)
            throw problem('Enroll active employees with linked accounts before activating this batch');
        const ids = members.map(m => m.userId);
        const [count] = await query(`SELECT COUNT(*)::int AS total FROM user_health_packages WHERE "packageId"=:packageId AND status='active' AND "userId" NOT IN (:ids)`, { packageId: String(packageId), ids });
        if (count.total + members.length > plan.max_users)
            throw problem('Package employee capacity exceeded', 409);
        for (const member of members) {
            await query(`INSERT INTO user_health_packages ("userId",corporate_id,"packageId","packageName","packageDetails","validFrom","validTo",status,"createdAt","updatedAt") VALUES (:userId,:corporateId,:packageId,:name,:details,CURRENT_DATE,CASE WHEN :years = 0 THEN NULL ELSE CURRENT_DATE+make_interval(years=>:years) END,'active',NOW(),NOW()) ON CONFLICT ("userId","packageId") DO UPDATE SET "packageName"=EXCLUDED."packageName","packageDetails"=EXCLUDED."packageDetails",status='active',"updatedAt"=NOW() RETURNING id`, { userId: member.userId, corporateId, packageId: String(packageId), name: plan.name, details: JSON.stringify(plan.features), years: plan.metadata.validityPeriod === 'Lifetime' ? 0 : parseInt(plan.metadata.validityPeriod) || 1 });
            await query(`INSERT INTO notifications ("userId","userType",type,title,message,"isRead",status,channels,"webRoute","createdAt","updatedAt") VALUES (:userId,'patient','reminder','Annual Health Checkup Available','Your annual health checkup package is available. Open Health Checkups to select a diagnostic centre and book.',false,'sent',ARRAY['app'],'/health-checkups',NOW(),NOW()) RETURNING id`, { userId: member.userId });
        }
        await query(`UPDATE corporate_ahc_enrollments e SET status='invited',updated_at=NOW() WHERE batch_id=:batchId AND corporate_id=:corporateId AND status IN ('pending','invited') AND EXISTS (SELECT 1 FROM corporate_employees ce WHERE ce.corporate_id=e.corporate_id AND ce."employeeId"=e.employee_id AND ce."userId" IN (:ids) AND ce."isActive"=true) RETURNING id`, { batchId, corporateId, ids });
        await query(`UPDATE corporate_ahc_batches SET status='active',eligibility_criteria=COALESCE(eligibility_criteria,'{}'::jsonb)||jsonb_build_object('packageId',CAST(:packageId AS text)),updated_at=NOW() WHERE id=:batchId AND corporate_id=:corporateId RETURNING id`, { packageId: String(packageId), batchId, corporateId });
        return { invited: members.length };
    });
}

export async function remindAhcBatch({corporateId,batchId}) {
  const id=batchId;
  return db.transaction(async transaction => {
      const [batch] = await db.query(
        `SELECT id FROM corporate_ahc_batches WHERE id=:id AND corporate_id=:corporateId FOR UPDATE`,
        {replacements:{id,corporateId},transaction,type:db.QueryTypes.SELECT});
      if (!batch) return null;
      const recipients = await db.query(
        `SELECT DISTINCT ce."userId" AS user_id FROM corporate_ahc_enrollments e
         JOIN corporate_employees ce ON ce.corporate_id=e.corporate_id AND ce."employeeId"=e.employee_id AND ce."isActive"=true
         JOIN user_associations ua ON ua."userId"=ce."userId" AND ua."entityId"=ce.corporate_id AND ua."entityType"='corporate' AND ua.role='employee' AND ua.status='active'
         WHERE e.batch_id=:id AND e.corporate_id=:corporateId AND e.status IN ('pending','invited')`,
        {replacements:{id,corporateId},transaction,type:db.QueryTypes.SELECT});
      for (const recipient of recipients) await db.query(
        `INSERT INTO notifications ("userId","userType",type,title,message,priority,"isRead",status,channels,"webRoute","createdAt","updatedAt")
         VALUES (:userId,'patient','reminder','Annual Health Checkup Reminder',
         'Your annual health checkup is due. Please schedule your appointment at the earliest.','high',false,'sent',ARRAY['app'],'/health-checkups',NOW(),NOW())`,
        {replacements:{userId:recipient.user_id},transaction});
      await db.query(
        `UPDATE corporate_ahc_enrollments e SET status='invited', reminder_sent_at=NOW(),updated_at=NOW()
         WHERE e.batch_id=:id AND e.corporate_id=:corporateId AND e.status IN ('pending','invited')
         AND EXISTS (SELECT 1 FROM corporate_employees ce WHERE ce.corporate_id=e.corporate_id AND ce."employeeId"=e.employee_id AND ce."isActive"=true AND ce."userId" IN (:ids))`,
        {replacements:{id,corporateId,ids:recipients.length?recipients.map(r=>r.user_id):[0]},transaction});
      return recipients.length;
    });
}
