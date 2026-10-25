const fail=message=>Object.assign(new Error(message),{statusCode:403});
/** Only canonical tenant UIDs are accepted. Numeric organisation IDs can denote corporates. */
export async function resolveWorkspaceScope(pool,{userId,tenantUid,platformAdmin=false}) {
 if(!Number.isSafeInteger(Number(userId))||Number(userId)<1)throw fail('Authenticated actor required');
 const {rows:[tenant]}=await pool.query(`SELECT id,unique_id FROM tenants WHERE unique_id=$1 AND status='active'`,[tenantUid||'']);
 if(!tenant)throw fail('An active organisation must be selected');
 if(!platformAdmin){
  const {rows}=await pool.query(`SELECT id FROM users WHERE id=$1 AND organization_uid=$2 AND status='active'`,[userId,tenant.unique_id]);
  if(!rows.length)throw fail('Organisation membership is required');
 }
 return {tenantUid:tenant.unique_id,tenantId:tenant.id,userId:Number(userId)};
}

export function authoritativeTeamWorkspaceIdentity(user) {
 if(!user||user.status!=='active')throw fail('Active Team identity required');
 return {tenantUid:user.organization_uid,role:user.role,isAdmin:user.isAdmin===true};
}
