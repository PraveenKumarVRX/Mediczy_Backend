/** Dedicated single-installation CRM runtime. Never imports the shared app/startup. */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { validateDedicatedEnvironment, dedicatedBoundary } from './installations/crm/runtime-boundary.js';
const installation = validateDedicatedEnvironment(process.env);
process.env.DEDICATED_CRM_RUNTIME = 'true';
const { default: pool } = await import('./db/pgPool.js');
const { authCRM } = await import('./middleware/crm.middleware.js');
const { buildMobileDiscoveryRouter } = await import('./routes/mobile-discovery.route.js');
const { tenantMobileDiscovery } = await import('./services/tenant-mobile-apps.service.js');
const { default: jwt } = await import('jsonwebtoken');
const {default:Redis}=await import('ioredis');
const readinessRedis=new Redis({host:process.env.REDIS_HOST,port:Number(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD,maxRetriesPerRequest:1,enableOfflineQueue:false,connectTimeout:2000,commandTimeout:2000});
readinessRedis.on('error',()=>{});
async function checkDependencies(){
 const required=['public.tenants','public.users','public.entity_registry','public.api_v2_refresh_tokens','public.crm_login_attempts','public.crm_leads','public.crm_leads_v2','public.crm_contacts','public.crm_deals','public.crm_activities','public.feature_flags','public.crm_installation_versions'];
 const result=await pool.query('SELECT bool_and(to_regclass(name) IS NOT NULL) AS ready FROM unnest($1::text[]) AS name',[required]);
 if(!result.rows[0]?.ready)throw Error('Schema unavailable');
 await readinessRedis.ping();
}

const tenant = (await pool.query('SELECT id,unique_id,name,status,settings FROM tenants WHERE unique_id=$1 AND id=$2', [installation.tenantUid, installation.tenantId])).rows[0];
if (!tenant || tenant.status !== 'active') throw Error('Dedicated installation tenant is unavailable.');
const app=express();app.disable('x-powered-by');app.set('trust proxy','loopback');
app.use(helmet({contentSecurityPolicy:false}));
app.use(cors({origin:installation.origin,credentials:true}));
app.use(express.json({limit:'10mb'}));
app.get('/health/live',(_req,res)=>res.json({status:'ok',service:'dedicated-crm'}));
app.get('/health/ready',async(_req,res)=>{try{await checkDependencies();res.json({status:'ready',tenantUid:installation.tenantUid,release:process.env.RELEASE_SHA});}catch{res.status(503).json({status:'unavailable'});}});
app.use(dedicatedBoundary(installation));
app.use('/api/mobile',buildMobileDiscoveryRouter({resolveTenant:async()=>tenantMobileDiscovery(tenant)}));
app.use('/api/crm',async(req,res,next)=>{
 req.mobileTenant={id:tenant.id,product:'crm',config:tenant.settings.mobileApps};req.tenantId=tenant.id;
 if(req.method==='POST'&&['/login','/auth/refresh'].includes(req.path))return next();
 return authCRM(req,res,next);
});
// Fresh deployments must explicitly configure and accept external channels before
// enabling delivery. This fence also prevents accidental imported provider defaults.
app.use('/api/crm',(req,res,next)=>{
 if(process.env.CRM_OUTBOUND_ENABLED!=='true'&&req.method!=='GET'&&/(?:^|\/)(?:send|send-test|schedule|blast|dispatch|execute|publish|sync|call)(?:\/|$)/i.test(req.path))return res.status(503).json({success:false,code:'integration_not_configured',message:'External delivery is not configured for this installation.'});
 next();
});
const routes=[
 ['/api/crm','crm.route.js'],['/api/crm/team','crm-team.route.js'],
 ['/api/crm/v2','hospital-crm-v2.route.js'],['/api/crm/worldclass','hospital-crm-worldclass.route.js'],
 ['/api/crm/growth','hospital-crm-growth.route.js'],['/api/crm/growth','hospital-crm-specialty.route.js'],
 ['/api/crm/communication-hub','hospital-crm-communication-hub.route.js'],
 ['/api/crm/segments','crm-segments.route.js'],['/api/crm/automations','crm-automations.route.js'],
 ['/api/crm/emails','crmEmail.route.js'],['/api/crm/campaigns','crmCampaigns.route.js'],
 ['/api/crm/campaign-analytics','crmCampaignAnalytics.route.js'],['/api/crm/ai','crm-ai.route.js'],
 ['/api/crm/flows','crm-flow-builder.route.js'],['/api/crm/social','crm-social-growth.route.js'],
 ['/api/crm/social','crm-brightbean-chat.route.js'],['/api/crm/field-force','crm-field-force.route.js'],
];
for(const[path,module]of routes)app.use(path,(await import('./routes/'+module)).default);
const { publicFeatureFlagsRouter }=await import('./routes/feature-flags.route.js');
app.use('/api/feature-flags',publicFeatureFlagsRouter);
app.use((_req,res)=>res.status(404).json({success:false,code:'not_in_crm_runtime'}));
app.use((error,_req,res,_next)=>{console.error('[dedicated-crm]',error.code||error.name);res.status(error.status||500).json({success:false,message:error.status&&error.status<500?error.message:'The request could not be completed.'});});
const server=createServer(app);
const io=new SocketServer(server,{cors:{origin:installation.origin,credentials:true}});
io.use(async(socket,next)=>{try{
 const token=socket.handshake.auth?.token;const decoded=jwt.verify(token,process.env.JWT_SECRET);
 if(decoded.tokenType!=='access'||!decoded.isCRM||!decoded.jti)throw Error('Invalid CRM session');
 const session=await pool.query("SELECT 1 FROM api_v2_refresh_tokens t JOIN users u ON u.id=t.user_id WHERE t.jti=$1 AND t.role='crm' AND NOT t.revoked AND u.status='active'",[decoded.jti]);
 if(!session.rows.length)throw Error('Revoked CRM session');
 const {mobileUserBelongsToTenant}=await import('./services/mobile-tenant-membership.service.js');
 if(!await mobileUserBelongsToTenant({mobileTenant:{id:tenant.id}},decoded.id))throw Error('Wrong tenant');
 socket.data.userId=decoded.id;next();
}catch{next(Error('Unauthorized'));}});
io.on('connection',socket=>{socket.join('crm-user-'+socket.data.userId);});app.set('io',io);
server.listen(Number(process.env.PORT||8888),'0.0.0.0',()=>console.log(JSON.stringify({service:'dedicated-crm',tenantUid:installation.tenantUid,release:process.env.RELEASE_SHA,port:Number(process.env.PORT||8888)})));
// Dedicated reporting is outbound-only. No clinical/contact fields are collected.
if(process.env.DEDICATED_CONNECTOR_TOKEN_FILE){
 const {readFile}=await import('node:fs/promises');const {randomUUID}=await import('node:crypto');
 const {sendInstallationReport}=await import('./scripts/report-dedicated-installation.mjs');
 const {ReportOutbox}=await import('./installations/crm/report-outbox.mjs');
 const outbox=new ReportOutbox('/app/data/connector/outbox',async report=>{
  const token=(await readFile(process.env.DEDICATED_CONNECTOR_TOKEN_FILE,'utf8')).trim();
  return sendInstallationReport({origin:process.env.DEDICATED_CONTROL_PLANE_URL,token,profile:'crm',report});
 });
 let reporting=false;
 async function report(){if(reporting)return;reporting=true;try{
  const now=new Date().toISOString();let health='healthy';
  try{await checkDependencies();}catch{health='unavailable';}
  await outbox.enqueue({eventId:randomUUID(),observedAt:now,day:now.slice(0,10),release:process.env.RELEASE_SHA,health,metrics:{}});
  await outbox.drain();
 }catch(error){console.error('[connector]',error.message?.startsWith('Report rejected')?error.message:'Report delivery unavailable; report retained');}finally{reporting=false;}}
 setInterval(report,60000).unref();report();
}
async function stop(){server.close();readinessRedis.disconnect();await pool.end();process.exit(0);}process.on('SIGTERM',stop);process.on('SIGINT',stop);
