/** Read-only post-release sanity checks. No migrations, accounts or bookings are modified. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {postgresSequelize as db} from '../../db/postgres-sequelize.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const output=process.env.HEALTH_SANITY_OUTPUT;if(!output)throw new Error('HEALTH_SANITY_OUTPUT private JSON path is required');
const manifest=JSON.parse(readFileSync(root+(process.env.RELEASE_MANIFEST || '.deploy/health-checkup-live-release.json'),'utf8'));
const checks=[],observations={};
const hash=data=>createHash('sha256').update(data).digest('hex');
const check=(name,passed,detail)=>checks.push({name,passed,...(detail?{detail}:{} )});
const select=sql=>db.query(sql,{type:db.QueryTypes.SELECT});
try {
  const healthResponse=await fetch('https://app.mediqzy.com/api/health',{signal:AbortSignal.timeout(20000)});
  const health=await healthResponse.json();
  check('Public API health and primary dependencies',healthResponse.status===200&&health.status==='healthy'&&['postgres','postgresSequelize','redis'].every(key=>health.databases?.[key]==='connected'));
  observations.optionalDependencies=Object.entries(health.databases||{}).filter(([,state])=>state!=='connected').map(([name,state])=>({name,state}));
  const processes=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'}));
  const api=processes.find(p=>p.name==='mediczy-server');
  observations.api={status:api?.pm2_env.status,restarts:api?.pm2_env.restart_time,uptimeSeconds:api?Math.floor((Date.now()-api.pm2_env.pm_uptime)/1000):null};
  check('API online without new restarts',observations.api.status==='online'&&observations.api.restarts===manifest.apiRestartCount);
  const drift=Object.entries(manifest.sourceFiles).filter(([file,expected])=>hash(readFileSync(root+file))!==expected).map(([file])=>file);
  check('Runtime source matches deployed release snapshot',!drift.length,drift);
  check('nginx index matches deployed artifact',hash(readFileSync(root+'client/dist/index.html'))===manifest.indexSha256);
  for(const path of ['/','/admin/login','/admin/corporate-health-packages','/corporate/annual-health-checkup','/health-checkups','/patient/notifications','/corporate/notifications','/corporate/health-analysis','/crm/contact-center']){
    const response=await fetch('https://app.mediqzy.com'+path,{signal:AbortSignal.timeout(20000)}),body=await response.text();
    check('SPA route '+path,response.status===200&&hash(body)===manifest.indexSha256);
  }
  const index=readFileSync(root+'client/dist/index.html','utf8');
  const assets=[...index.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m=>m[1]);
  for(const asset of assets){const response=await fetch(new URL(asset,'https://app.mediqzy.com'),{method:'HEAD',signal:AbortSignal.timeout(20000)});check('Published entry asset '+asset,response.status===200&&!response.headers.get('content-type')?.includes('text/html'));}
  const [catalog]=await select(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE corporate_id=45)::int AS dairy_day FROM corporate_health_package_catalog`);
  observations.catalog=catalog;check('Real package catalog persisted',catalog.total>=3&&catalog.dairy_day===2);
  const indexes=await select(`SELECT i.indisvalid,i.indisunique FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='uniq_health_checkup_active_lab_slot'`);
  check('Active-slot uniqueness index is valid',indexes.length===1&&indexes[0].indisvalid&&indexes[0].indisunique);
  const [mapping]=await select(`SELECT COUNT(*)::int AS mapped,COUNT(*) FILTER (WHERE a.employee_ids='"all"'::jsonb)::int AS all_employees,COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(l.metadata->'healthCheckupSlots','[]'::jsonb))>0)::int AS configured_slots,COUNT(*) FILTER (WHERE a.corporate_uid=c.unique_id)::int AS uid_parity FROM corporate_network_assignments a JOIN labs l ON l.id=a.partner_id JOIN corporates c ON c.id=a.corporate_id WHERE a.corporate_id=45 AND a.partner_type='lab' AND l.name ILIKE '%agilus%' AND LOWER(l.status::text)='active' AND l."isVerified"=true`);
  observations.agilus=mapping;check('Dairy Day–Agilus mappings, slots and UID references',Object.values(mapping).every(value=>value===42));
  const [conflicts]=await select(`SELECT COUNT(*)::int AS total FROM (SELECT lab_id,appointment_date,time_slot FROM health_checkup_bookings WHERE status IN ('payment_pending','confirmed','scheduled','rescheduled') GROUP BY lab_id,appointment_date,time_slot HAVING COUNT(*)>1) duplicates`);
  check('No double-booked active lab slots',conflicts.total===0);
  const accounts=await select(`SELECT u.status::text AS status,COUNT(*)::int AS count FROM users u JOIN user_associations a ON a."userId"=u.id AND a."entityType"='corporate' AND a.role='employee' AND a.status='active' WHERE a."entityId"=45 GROUP BY u.status`);
  observations.dairyDayEmployeeAccounts=accounts;
  const result={at:new Date().toISOString(),productionMutations:0,passed:checks.every(c=>c.passed),checks,observations};
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({passed:result.passed,checks:checks.length,failed:checks.filter(c=>!c.passed),observations}));if(!result.passed)process.exitCode=1;
} catch(error) {writeFileSync(output,JSON.stringify({passed:false,productionMutations:0,checks,observations,error:error.message},null,2)+'\n',{mode:0o600});throw error;} finally {await db.close();}
