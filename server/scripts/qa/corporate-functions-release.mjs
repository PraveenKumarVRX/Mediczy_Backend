/** Explicit additive release migrations. Default is read-only; --apply commits the three migrations. */
import {writeFileSync} from 'node:fs';
import {postgresSequelize as database} from '../../db/postgres-sequelize.js';
import {up as scheduleUp} from '../../migrations/20261022010000-corporate-scheduling-doctor-uid.migration.js';
import {up as ssoUp} from '../../migrations/20261022011000-corporate-sso-sessions.migration.js';
import {up as identityUp} from '../../migrations/20261022012000-corporate-identity-uniqueness.migration.js';
const output=process.env.CORPORATE_RELEASE_OUTPUT;
if(!output)throw new Error('Private evidence output required');
try{
 const select=sql=>database.query(sql,{type:database.QueryTypes.SELECT});
 const dairyDay=await select(`SELECT unique_id,"companyName",status FROM corporates WHERE "companyName" ILIKE '%dairy%' ORDER BY id`);
 const duplicateNames=await select(`SELECT COUNT(*) FROM corporates WHERE LOWER(status) IN ('active','pending') AND LENGTH(REGEXP_REPLACE("companyName",'[^a-zA-Z0-9]','','g'))>0 GROUP BY LOWER(REGEXP_REPLACE("companyName",'[^a-zA-Z0-9]','','g')) HAVING COUNT(*)>1`);
 const duplicateEmails=await select(`SELECT COUNT(*) FROM corporates WHERE email IS NOT NULL AND TRIM(email)<>'' GROUP BY LOWER(TRIM(email)) HAVING COUNT(*)>1`);
 if(duplicateNames.length||duplicateEmails.length)throw new Error('Identity conflicts must be resolved before migration');
 const applied=process.argv.includes('--apply');
 if(applied)await database.transaction(async transaction=>{
  const adapter={query:(sql,options={})=>database.query(sql,{...options,transaction})};
  await scheduleUp(adapter);await ssoUp(adapter);await identityUp(adapter);
 });
 const schema=await select(`SELECT to_regclass('public.corporate_sso_sessions') IS NOT NULL AS sso_sessions,to_regclass('public.mfa_factors') IS NOT NULL AS mfa_factors,to_regclass('public.uniq_active_corporate_normalized_name') IS NOT NULL AS name_guard,to_regclass('public.uniq_corporate_normalized_email') IS NOT NULL AS email_guard`);
 const result={at:new Date().toISOString(),applied,migrations:applied?3:0,clinicalDataMutations:0,duplicateNameGroups:duplicateNames.length,duplicateEmailGroups:duplicateEmails.length,dairyDay,schema};
 writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}finally{await database.close();}
