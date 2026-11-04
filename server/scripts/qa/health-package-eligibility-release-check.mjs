/** Read-only production API, schema and deployed artifact verification. No bookings or notifications. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import jwt from 'jsonwebtoken';
import {postgresSequelize as db} from '../../db/postgres-sequelize.js';
const base=process.env.HEALTH_SMOKE_BASE||'https://app.mediqzy.com';
const output=process.env.HEALTH_POLICY_OUTPUT;
if(!output) throw new Error('HEALTH_POLICY_OUTPUT evidence path is required');
const checks=[];
const check=(name,passed,detail)=>checks.push({name,passed,...(detail?{detail}:{} )});
const select=(sql,replacements={})=>db.query(sql,{replacements,type:db.QueryTypes.SELECT});
const sign=(user,role)=>jwt.sign({id:user.id,userId:user.id,role,userType:role,tokenType:'access',isAdmin:role==='admin',isTeam:role==='team',...(role==='corporate'?{corporateId:user.id,organization_id:user.id}:{})},process.env.JWT_SECRET,{expiresIn:600});
async function api(name,path,token,status=200,validate=()=>true,method='GET',body) {
  const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));
  check(name,response.status===status&&validate(data),{status:response.status,expected:status,reason:data.code||data.errorCode||data.error||data.message||undefined});
  return data;
}
try {
  await api('Public health','/api/health',null,200,b=>b.status==='healthy'&&['postgres','postgresSequelize','redis'].every(k=>b.databases?.[k]==='connected'));
  const indexes=await select(`SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname IN ('uniq_health_checkup_active_hospital_slot','uniq_health_checkup_active_lab_slot') AND i.indisvalid AND i.indisunique`);
  check('Unique active slot indexes for labs and hospitals',indexes.length===2);
  const columns=await select(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='health_checkup_bookings' AND column_name IN ('hospital_id','beneficiary_relation')`);
  check('Booking policy columns installed',columns.length===2);
  const constraints=await select(`SELECT conname FROM pg_constraint WHERE conrelid='health_checkup_bookings'::regclass AND conname='health_checkup_one_venue'`);
  check('Exactly one venue constraint installed',constraints.length===1);
  const [{invalid}]=await select(`SELECT COUNT(*)::int AS invalid FROM health_checkup_bookings WHERE beneficiary_relation IS NULL OR (lab_id IS NOT NULL)::int+(hospital_id IS NOT NULL)::int<>1`);
  check('Existing booking rows retain valid beneficiary and venue',invalid===0);
  const [admin]=await select(`SELECT id FROM users WHERE "isAdmin"=true AND LOWER(status::text)='active' ORDER BY id LIMIT 1`);
  const teams=await select(`SELECT id,metadata FROM users WHERE "isTeam"=true AND COALESCE("isAdmin",false)=false AND LOWER(status::text)='active' ORDER BY id`);
  const permitted=u=>{let m=u.metadata||{};if(typeof m==='string'){try{m=JSON.parse(m);}catch{return false;}}return m.accessLevel==='full'||(m.permissions||[]).some(p=>['corporate management','corporate management access','all access'].includes(String(p).trim().toLowerCase()));};
  const team=teams.find(permitted),limitedTeam=teams.find(u=>!permitted(u));
  const [member]=await select(`SELECT u.id,a."entityId" AS corporate_id FROM users u JOIN LATERAL (SELECT a."entityId" FROM user_associations a JOIN corporates c ON c.id=a."entityId" AND LOWER(c.status)='active' JOIN corporate_employees ce ON ce."userId"=a."userId" AND ce.corporate_id=a."entityId" AND ce."isActive"=true WHERE a."userId"=u.id AND a."entityType"='corporate' AND a.role='employee' AND a.status='active' ORDER BY a."createdAt" DESC LIMIT 1) a ON true WHERE LOWER(u.status::text)='active' AND COALESCE(u."isAdmin",false)=false AND COALESCE(u."isTeam",false)=false AND COALESCE(u.metadata->>'requirePasswordChange','false')<>'true' ORDER BY EXISTS (SELECT 1 FROM user_health_packages h JOIN corporate_health_package_catalog p ON p.id=h."packageId" AND p.corporate_id=h.corporate_id WHERE h."userId"=u.id AND h.corporate_id=a."entityId" AND LOWER(h.status)='active') DESC,u.id LIMIT 1`);
  if(!admin||!member||!team) throw new Error('Active admin, corporate employee and permitted Team identities are required');
  const adminToken=sign(admin,'admin'),memberToken=sign(member,'user'),teamToken=sign(team,'team');
  const catalog=await api('Admin package catalog','/api/admin/health-packages',adminToken,200,b=>Array.isArray(b.data)&&b.data.every(p=>Array.isArray(p.eligibleRelations)&&p.eligibleRelations.length>0&&Array.isArray(p.venues)&&['inherit','restricted'].includes(p.venueMode)));
  await api('Team package catalog with Corporate Management permission','/api/admin/health-packages',teamToken,200,b=>Array.isArray(b.data));
  if(limitedTeam) await api('Team without permission cannot read policy catalog','/api/admin/health-packages',sign(limitedTeam,'team'),403);
  await api('Member cannot manage packages','/api/admin/health-packages',memberToken,403);
  await api('Admin cannot consume employee packages','/api/health-checkups/packages',adminToken,403);
  const pkg=catalog.data?.[0];
  if(pkg){
    await api('Team sees corporate network venue choices',`/api/admin/health-packages/corporates/${pkg.corporateId}/venues`,teamToken,200,b=>Array.isArray(b.data));
    await api('Team can inspect employee assignments',`/api/admin/health-packages/${encodeURIComponent(pkg.id)}/assignments`,teamToken,200,b=>Array.isArray(b.data));
    const [corporate]=await select(`SELECT id FROM corporates WHERE id=:id AND LOWER(status::text) IN ('active','pending')`,{id:pkg.corporateId});
    if(corporate) await api('HR sees authoritative policy and venue data','/api/corporate/health-packages',sign(corporate,'corporate'),200,b=>Array.isArray(b.data?.packages)&&b.data.packages.every(p=>Array.isArray(p.eligibleRelations)&&Array.isArray(p.venues)));
  }
  await api('Member profile','/api/health-checkups/me',memberToken,200,b=>Number(b.corporate?.id)===Number(member.corporate_id));
  const packages=await api('Member packages include current eligibility','/api/health-checkups/packages',memberToken,200,b=>Array.isArray(b.packages)&&b.packages.every(p=>Array.isArray(p.eligibleRelations)));
  await api('Member network discovery','/api/health-checkups/labs',memberToken,200,b=>Array.isArray(b.labs));
  for(const p of packages.packages||[]){
    await api('Package and beneficiary venue filtering',`/api/health-checkups/labs?packageId=${encodeURIComponent(p.id)}&relation=${p.eligibleRelations[0]}`,memberToken,200,b=>Array.isArray(b.labs));
  }
  await api('Member booking history','/api/health-checkups/bookings',memberToken,200,b=>Array.isArray(b.bookings));
  await api('Legacy booking write is retired','/api/corporate/book-checkup',memberToken,410,b=>b.code==='booking_endpoint_retired','POST',{});
  await api('Unknown relation rejected before booking','/api/health-checkups/bookings',memberToken,400,b=>b.code==='invalid_relation','POST',{packageId:'invalid-smoke-package',labId:1,date:'2099-01-01',timeSlot:'09:00',relation:'uncle',patient:{name:'Validation only',phone:'9999999999'}});
  await api('No unauthenticated package access','/api/admin/health-packages',null,401);
  if(process.env.HEALTH_POLICY_INDEX){
    const expected=createHash('sha256').update(readFileSync(process.env.HEALTH_POLICY_INDEX)).digest('hex');
    for(const path of ['/','/team/corporate-health-packages','/admin/corporate-health-packages','/corporate/benefits','/health-checkups']) {
      const response=await fetch(base+path,{signal:AbortSignal.timeout(20000)}),html=await response.text();
      check('Published SPA '+path,response.status===200&&createHash('sha256').update(html).digest('hex')===expected);
    }
    const html=readFileSync(process.env.HEALTH_POLICY_INDEX,'utf8');
    for(const [,path] of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
      const response=await fetch(new URL(path,base),{method:'HEAD',signal:AbortSignal.timeout(20000)});
      check('Published entry asset '+path,response.status===200&&!response.headers.get('content-type')?.includes('text/html'));
    }
  }
  const processes=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})),runtime=processes.find(p=>p.name==='mediczy-server');
  check('API process online',runtime?.pm2_env.status==='online');
} catch(error){check('Release checks completed',false,{message:error.message});}
finally {await db.close();const result={at:new Date().toISOString(),base,productionMutations:0,passed:checks.every(c=>c.passed),checks};writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({passed:result.passed,checks:checks.length,failed:checks.filter(c=>!c.passed)}));if(!result.passed) process.exitCode=1;}
