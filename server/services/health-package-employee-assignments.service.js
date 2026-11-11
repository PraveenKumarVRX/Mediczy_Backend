import { postgresSequelize as db } from '../db/postgres-sequelize.js';
import { validityPeriodToInterval } from './health-package-policy.js';
import { ahcWindow } from './corporate-ahc-entitlement-policy.service.js';
const error=(message,status=400)=>Object.assign(new Error(message),{status});
export function assignmentIds(value){
  if(!Array.isArray(value)||value.length>10000||value.some(id=>!/^\d+$/.test(String(id))||!Number.isSafeInteger(Number(id))||Number(id)<1))throw error('Provide linked employee IDs');
  return [...new Set(value.map(Number))];
}
/** Change only explicit additions/removals; never replace an unseen or filtered roster. */
export async function updatePackageEmployeeAssignments(packageId,{addEmployeeIds=[],removeEmployeeIds=[]},transaction){
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(String(packageId)))throw error('Package not found',404);
  const add=assignmentIds(addEmployeeIds),remove=assignmentIds(removeEmployeeIds);
  if(add.some(id=>remove.includes(id)))throw error('An employee cannot be added and removed together');
  const run=async tx=>{
    const q=(sql,replacements={})=>db.query(sql,{replacements,transaction:tx,type:db.QueryTypes.SELECT});
    const [p]=await q(`SELECT * FROM corporate_health_package_catalog WHERE id=:packageId AND metadata->>'kind'='health_checkup' FOR UPDATE`,{packageId});
    if(!p)throw error('Package not found',404);
    if(add.length&&!p.is_active)throw error('Activate this package before adding employees');
    const current=await q(`SELECT "userId",status FROM user_health_packages WHERE "packageId"=:packageId AND corporate_id=:corporateId FOR UPDATE`,{packageId,corporateId:p.corporate_id});
    const active=new Set(current.filter(r=>String(r.status).toLowerCase()==='active').map(r=>Number(r.userId)));
    const additions=add.filter(id=>!active.has(id)),removals=remove.filter(id=>active.has(id));
    if(additions.length){
      const linked=await q(`SELECT DISTINCT ua."userId" FROM user_associations ua WHERE ua."entityId"=:corporateId AND ua."entityType"='corporate' AND ua.role='employee' AND ua.status='active' AND ua."userId" IN (:ids)
        AND (NOT EXISTS (SELECT 1 FROM corporate_employees ce WHERE ce.corporate_id=:corporateId AND ce."userId"=ua."userId") OR EXISTS (SELECT 1 FROM corporate_employees ce WHERE ce.corporate_id=:corporateId AND ce."userId"=ua."userId" AND ce."isActive"=true))`,{corporateId:p.corporate_id,ids:additions});
      if(linked.length!==additions.length)throw error('All additions must be active linked employees of this corporate');
    }
    const enrolled=active.size-removals.length+additions.length;
    if(additions.length&&enrolled>p.max_users)throw error('Package employee capacity exceeded. Remove assignments or increase this package capacity.',409);
    if(removals.length)await q(`UPDATE user_health_packages SET status='inactive',"updatedAt"=NOW() WHERE "packageId"=:packageId AND corporate_id=:corporateId AND "userId" IN (:ids) RETURNING "userId"`,{packageId,corporateId:p.corporate_id,ids:removals});
    const metadata=typeof p.metadata==='string'?JSON.parse(p.metadata):p.metadata||{};
    const entitlement=metadata.corporateValidFrom&&metadata.corporateValidTo?ahcWindow({
      assignedOn:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
      validityPeriod:metadata.individualValidityPeriod||metadata.validityPeriod,
      corporateValidFrom:metadata.corporateValidFrom,
      corporateValidTo:metadata.corporateValidTo,
    }):null;
    const validityInterval=validityPeriodToInterval(metadata.validityPeriod);
    for(const userId of additions){
      const defaultValidTo=(validityInterval.years||validityInterval.days)?new Date(Date.now()+((validityInterval.years*365+validityInterval.days)*86400000)).toISOString().slice(0,10):null;
      const rows=await q(`INSERT INTO user_health_packages ("userId",corporate_id,"packageId","packageName","packageDetails","validFrom","validTo",status,"createdAt","updatedAt") VALUES (:userId,:corporateId,:packageId,:name,:details,:validFrom,:validTo,'active',NOW(),NOW())
        ON CONFLICT ("userId","packageId") DO UPDATE SET "packageName"=EXCLUDED."packageName","packageDetails"=EXCLUDED."packageDetails",status='active',"updatedAt"=NOW() WHERE user_health_packages.corporate_id=EXCLUDED.corporate_id RETURNING "userId"`,{userId,corporateId:p.corporate_id,packageId,name:p.name,details:JSON.stringify(p.features),validFrom:entitlement?.validFrom||new Date().toISOString().slice(0,10),validTo:entitlement?.validTo||defaultValidTo});
      if(!rows.length)throw error('Employee assignment belongs to another corporate',409);
    }
    return {added:additions.length,removed:removals.length,enrolled};
  };
  return transaction?run(transaction):db.transaction(run);
}
