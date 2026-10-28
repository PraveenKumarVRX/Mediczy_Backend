import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';

function positiveId(value, name) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)<1) {
    throw Object.assign(new Error(`A valid ${name} is required`), {status:400});
  }
  return Number(value);
}

/** Caller must authorize corporate access first. Context is local to this transaction/connection. */
export async function withCorporateBookingContext({corporateId, bookedByUserId}, callback, transaction) {
  const orgId=positiveId(corporateId,'corporateId'), userId=positiveId(bookedByUserId,'bookedByUserId');
  const run=async tx=>{
    await setRlsContext(tx,{orgId,userId,isPlatformAdmin:false});
    return callback(tx);
  };
  return transaction ? run(transaction) : db.transaction(run);
}

export async function createCorporateCheckupOrder(input, transaction) {
  const corporateId=positiveId(input.corporateId,'corporateId');
  const employeeId=positiveId(input.employeeId,'employeeId'), labId=positiveId(input.labId,'labId');
  return withCorporateBookingContext({...input,corporateId},async tx=>{
    const query=(sql,replacements)=>db.query(sql,{replacements,transaction:tx,type:db.QueryTypes.SELECT});
    const [member]=await query(`SELECT 1 FROM user_associations WHERE "userId"=:employeeId AND "entityType"='corporate' AND "entityId"=:corporateId AND role='employee' AND status='active' LIMIT 1 FOR SHARE`,{employeeId,corporateId});
    if(!member) throw Object.assign(new Error('Employee is not assigned to this corporate'),{status:403});
    const [venue]=await query(`SELECT l.id FROM labs l JOIN corporate_network_assignments n ON n.partner_id=l.id AND n.partner_type='lab' WHERE n.corporate_id=:corporateId AND l.id=:labId AND LOWER(COALESCE(l.status::text,'active'))='active' LIMIT 1 FOR SHARE OF l,n`,{corporateId,labId});
    if(!venue) throw Object.assign(new Error('Selected lab is not available in this corporate network'),{status:403});
    const [order]=await query(`INSERT INTO lab_orders (order_number,patient_id,lab_id,test_type,test_category,status,notes,organization_id,created_at,updated_at)
      VALUES (:orderNumber,:employeeId,:labId,:testPackage,'corporate_health_checkup','pending',:notes,:corporateId,NOW(),NOW()) RETURNING id,order_number`,
      {corporateId,employeeId,labId,orderNumber:input.orderNumber,testPackage:input.testPackage,notes:input.notes});
    if(!order) throw new Error('Booking did not return a saved order');
    return order;
  },transaction);
}
