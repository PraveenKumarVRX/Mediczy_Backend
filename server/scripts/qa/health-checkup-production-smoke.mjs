/** Read-only health-checkup release smoke; uses existing identities, never books or notifies. */
import {writeFileSync} from 'node:fs';
import jwt from 'jsonwebtoken';
import {postgresSequelize as db} from '../../db/postgres-sequelize.js';
const base=process.env.HEALTH_SMOKE_BASE || 'https://app.mediqzy.com';
const output=process.env.HEALTH_SMOKE_OUTPUT;
if(!output)throw new Error('HEALTH_SMOKE_OUTPUT private JSON path is required');
const checks=[];
const select=sql=>db.query(sql,{type:db.QueryTypes.SELECT});
const token=(user,role)=>jwt.sign({id:user.id,userId:user.id,role,userType:role,isAdmin:role==='admin',isTeam:role==='team',...(role==='corporate'?{corporateId:user.id,organization_id:user.id}:{}),tokenType:'access'},process.env.JWT_SECRET,{expiresIn:600});
const check=async(name,path,auth,expected=200,validate=()=>true)=>{
  const r=await fetch(base+path,{headers:auth?{Authorization:`Bearer ${auth}`}:{},signal:AbortSignal.timeout(20000)});
  let body;try{body=await r.json();}catch{body={};}
  const passed=r.status===expected&&validate(body);
  checks.push({name,path,status:r.status,expected,passed});
  return body;
};
try{
  const [admin]=await select(`SELECT id FROM users WHERE "isAdmin"=true AND LOWER(status::text)='active' ORDER BY id LIMIT 1`);
  const [member]=await select(`SELECT u.id,a."entityId" AS corporate_id FROM users u JOIN user_associations a ON a."userId"=u.id AND a."entityType"='corporate' AND a.role='employee' AND a.status='active' WHERE LOWER(u.status::text)='active' AND COALESCE(u."isAdmin",false)=false AND COALESCE(u."isTeam",false)=false ORDER BY (a."entityId"=45) DESC,(a."entityId"=3) DESC,u.id LIMIT 1`);
  const [lab]=await select(`SELECT id FROM labs WHERE name ILIKE '%agilus%' AND LOWER(status::text)='active' AND "isVerified"=true ORDER BY id LIMIT 1`);
  if(!admin||!member||!lab)throw new Error('Expected existing active Admin, employee and Agilus identities');
  const adminToken=token(admin,'admin'),memberToken=token(member,'user'),labToken=token(lab,'lab');
  const hrToken=token({id:45},'corporate');
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  for(const alias of ['/api/kits','/api/checkup-kits','/api/lab/kits']){
    await check('Admin package alias',alias+'?corporateId=45',adminToken,200,b=>b.kits?.length===2);
    await check('Lab scoped package alias',alias+'?corporateId=45',labToken,200,b=>b.kits?.length>0&&b.kits.every(p=>p.corporateId==='45'));
    await check('Employee kit denial',alias,memberToken,403);
  }
  const catalog=await check('Real admin package list','/api/admin/health-packages',adminToken,200,b=>b.data?.filter(p=>p.corporateId==='45').length===2);
  const packageId=catalog.data?.find(p=>p.corporateId==='45')?.id;
  if(packageId)await check('Real package detail','/api/admin/health-packages/'+encodeURIComponent(packageId),adminToken,200,b=>b.data?.id===packageId);
  await check('Corporate booking packages','/api/corporate-bookings/packages?corporateId=45',adminToken,200,b=>b.packages?.length>=2);
  await check('Member profile','/api/health-checkups/me',memberToken,200,b=>b.corporate?.id===member.corporate_id);
  await check('Member packages','/api/health-checkups/packages',memberToken,200,b=>Array.isArray(b.packages));
  await check('Member lab query succeeds','/api/health-checkups/labs',memberToken,200,b=>Array.isArray(b.labs));
  await check('Dairy Day mapped Agilus centres','/api/corporate-bookings/labs?corporateId=45&search=agilus',adminToken,200,b=>b.labs?.length>0);
  await check('Configured Agilus slots',`/api/health-checkups/slots?date=${tomorrow}&labId=${lab.id}`,memberToken,member.corporate_id===45?200:404,b=>member.corporate_id===45?b.slots?.length>0:b.code==='lab_not_available');
  await check('Past slot date rejected','/api/health-checkups/slots?date=2020-01-01&labId='+lab.id,memberToken,400);
  await check('Missing lab rejected','/api/health-checkups/slots?date='+tomorrow,memberToken,400);
  await check('Admin cannot consume employee entitlements','/api/health-checkups/packages',adminToken,403);
  await check('Corporate activation package options','/api/corporate/ahc/package-options',hrToken,200,b=>b.data?.packages?.length===2);
  await check('Unread count','/api/notifications/unread-count',memberToken,200,b=>typeof b.unreadCount==='number');
  await check('Dashboard entity counts','/api/admin/dashboard/stats',adminToken,200,b=>b.stats?.labs>0&&b.stats?.corporates>0&&b.stats?.clinics>0);
  await check('Unauthenticated kit denial','/api/kits',null,401);
  await check('Unknown API returns JSON','/api/admin/qa-missing-endpoint',adminToken,404,b=>b.code==='not_found');
  const result={at:new Date().toISOString(),base,productionMutations:0,limitations:member.corporate_id===45?[]:['Dairy Day employees are inactive; member probes use an existing active corporate employee and verify denial of unrelated Agilus access.'],passed:checks.every(c=>c.passed),checks};
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({passed:result.passed,checks:checks.length,failed:checks.filter(c=>!c.passed)}));
  if(!result.passed)process.exitCode=1;
}catch(error){writeFileSync(output,JSON.stringify({passed:false,productionMutations:0,checks,error:error.message},null,2)+'\n',{mode:0o600});throw error;}finally{await db.close();}
