/** Read-only evidence for repairs that need verified identity/ownership facts. */
import {writeFileSync} from 'node:fs';
import {postgresSequelize as database} from '../../db/postgres-sequelize.js';
const output=process.env.CORPORATE_DATA_AUDIT_OUTPUT;if(!output)throw new Error('Private output path required');
try{
 const select=sql=>database.query(sql,{type:database.QueryTypes.SELECT});
 const duplicateActive=await select(`SELECT LOWER(REGEXP_REPLACE("companyName",'[^a-zA-Z0-9]','','g')) AS key,ARRAY_AGG(unique_id ORDER BY id) AS corporate_uids,COUNT(*)::int AS records FROM corporates WHERE LOWER(status) IN('active','pending') GROUP BY 1 HAVING COUNT(*)>1`);
 const duplicateEmail=await select(`SELECT COUNT(*)::int AS records FROM corporates WHERE email IS NOT NULL AND TRIM(email)<>'' GROUP BY LOWER(TRIM(email)) HAVING COUNT(*)>1`);
 const displayCandidates=await select(`SELECT unique_id,"companyName",status FROM corporates WHERE "companyName" ~ '\\s+,' OR "companyName" ~ ',\\s*$' OR "companyName" ILIKE '%retired test%' ORDER BY id`);
 const doctorCandidates=await select(`SELECT unique_id,CONCAT_WS(' ',"firstName","lastName") AS name,status FROM doctors WHERE CONCAT_WS(' ',"firstName","lastName") ~* '^\\s*(Dr[.]?\\s+){2,}' OR "firstName" ~* '(^|\\s)(test|dummy|placeholder)(\\s|$)' ORDER BY id LIMIT 200`);
 const employeeCandidates=await select(`SELECT ce.unique_id,ce."employeeId",c.unique_id AS corporate_uid,u.unique_id AS user_uid,
  CASE WHEN LOWER(COALESCE(u."firstName",'')) ~ '^user[0-9]*$' THEN true ELSE false END AS placeholder_name,
  NULLIF(TRIM(CONCAT_WS(' ',ce.metadata->>'firstName',ce.metadata->>'lastName')),'') IS NOT NULL AS has_roster_name
  FROM corporate_employees ce JOIN corporates c ON c.id=ce.corporate_id LEFT JOIN users u ON u.id=ce."userId" WHERE ce."employeeId"='TEST-SK01'`);
 const result={at:new Date().toISOString(),productionMutations:0,duplicateActive,duplicateEmail,displayCandidates,doctorCandidates,employeeCandidates,
  repairPolicy:'Candidates are evidence for review. No clinical identity, company UID, account or certificate is changed or deleted.'};
 writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({productionMutations:0,activeDuplicateGroups:duplicateActive.length,emailDuplicateGroups:duplicateEmail.length,companyDisplayCandidates:displayCandidates.length,doctorReviewCandidates:doctorCandidates.length,employeeIdentityCandidates:employeeCandidates.length}));
}finally{await database.close();}
