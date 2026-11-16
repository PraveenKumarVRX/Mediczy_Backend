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
// cache.set/get (used by OTP.generate, among others) assumes connectRedis() already ran
// somewhere in process startup — true in the shared app.js boot sequence, never true here.
// Without this, the first OTP-issuing call in a fresh container always throws "Redis not connected".
const { connectRedis } = await import('./db/redis.js');
await connectRedis().catch(error => console.error('[dedicated-crm] Redis warm-up failed:', error.message));
async function checkDependencies(){
 const required=['public.tenants','public.users','public.entity_registry','public.api_v2_refresh_tokens','public.crm_login_attempts','public.crm_leads','public.crm_leads_v2','public.crm_contacts','public.crm_deals','public.crm_activities','public.feature_flags','public.crm_installation_versions'];
 if((process.env.COMMUNICATION_WORKSPACE_ENABLED_TENANTS||'').split(',').includes(installation.tenantUid))required.push('public.communication_workspace_rooms','public.communication_workspace_members','public.communication_workspace_messages','public.communication_workspace_attachments');
 const result=await pool.query('SELECT bool_and(to_regclass(name) IS NOT NULL) AS ready FROM unnest($1::text[]) AS name',[required]);
 if(!result.rows[0]?.ready)throw Error('Schema unavailable');
 await readinessRedis.ping();
}

const tenant = (await pool.query('SELECT id,unique_id,name,status,settings,branding FROM tenants WHERE unique_id=$1 AND id=$2', [installation.tenantUid, installation.tenantId])).rows[0];
if (!tenant || tenant.status !== 'active') throw Error('Dedicated installation tenant is unavailable.');
const app=express();app.disable('x-powered-by');// nginx reaches the API over the compose networks (172.16/12), not loopback, so 'loopback' alone made
// req.ip the nginx container for every visitor (one shared rate-limit bucket, useless audit IPs).
// Bridge gateways (x.x.0.1) are excluded: published-port traffic can arrive from them.
app.set('trust proxy',(addr)=>{const a=String(addr).replace(/^::ffff:/,'');if(a==='127.0.0.1'||a==='::1')return true;const m=/^172\.(\d+)\.(\d+)\.(\d+)$/.exec(a);return Boolean(m&&+m[1]>=16&&+m[1]<=31&&!(m[2]==='0'&&m[3]==='1'));});
app.use(helmet({contentSecurityPolicy:false}));
app.use(cors({origin:installation.origin,credentials:true}));
// Mounted before express.json(): both need the raw request body (HMAC verification for the
// connector, provider-specific parsing for webhooks) rather than the globally pre-parsed one.
// That means they also run before dedicatedBoundary() below — reinstating just its host check
// here, since that property still matters even though each route has its own real auth (HMAC
// signature, webhook token) on top of it.
const voiceHost=(req,res,next)=>req.get('host')?.toLowerCase()!==new URL(installation.origin).host?res.status(421).json({success:false,code:'wrong_installation_host'}):next();
app.use('/api/voice-connector',voiceHost,(await import('./routes/voice-connector.route.js')).buildVoiceConnectorRouter());
app.use('/api/voice-webhooks',voiceHost,(await import('./routes/voice-webhooks.route.js')).buildVoiceWebhooksRouter());
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
 // Bulk sends only enqueue jobs; this runtime starts no queue workers, so without one they would be
 // accepted and silently never delivered. Keep them refused until a worker is actually running.
 if(process.env.CRM_BULK_SENDING_ENABLED!=='true'&&req.method!=='GET'&&/^\/(?:segments\/[^/]+\/send|campaigns\/campaigns\/[^/]+\/schedule)\/?$/i.test(req.path))return res.status(503).json({success:false,code:'bulk_sending_unavailable',message:'Bulk sending needs the campaign worker, which is not running on this installation. Messages would be queued but never delivered.'});
 next();
});
app.use('/api/crm/workspace',(await import('./routes/crm-communication-workspace.route.mjs')).default);
app.use('/api/password-reset',(await import('./routes/crm-password-reset.route.js')).buildCrmPasswordResetRouter(tenant.id));
app.use('/api/branding',(await import('./routes/crm-branding.route.js')).buildCrmBrandingRouter(tenant));
app.use('/api/onboarding',(await import('./routes/crm-onboarding.route.js')).buildCrmOnboardingRouter({pool,tenantId:tenant.id}));
// Smart-Force field app (github.com/MySmartHealth/smart-force): sign-in at /api/team, field API at /api/field.
// Auth is CRM-user/role based and tenant-pinned; see routes/crm-smart-force-auth.route.js.
{const sf=await import('./routes/crm-smart-force-auth.route.js');
 app.use('/api/team',sf.buildSmartForceAuthRouter({tenantId:tenant.id}));
 app.use('/api/field',sf.smartForceAuth({tenantId:tenant.id}),(await import('./routes/field-force.route.js')).default);}
app.use('/api/crm/whatsapp',(await import('./routes/crm-whatsapp-control.route.js')).buildWhatsAppControlRouter());
app.use('/api/crm/referral-network',(await import('./routes/crm-referral-network.route.js')).buildReferralNetworkRouter());
app.use('/api/crm/inbox',(await import('./routes/crm-unified-inbox.route.js')).buildUnifiedInboxRouter());
app.use('/api/crm/telephony',(await import('./routes/crm-telephony.route.js')).buildTelephonyRouter());
// Safety net for TeleCMI webhooks: every 10 minutes, pull the last 6 hours of call logs and file any call
// a webhook didn't deliver (deduplicated). No-op until TeleCMI credentials are configured.
{const tc=await import('./services/telecmi-control.service.js');let syncing=false;
 setInterval(async()=>{if(syncing||!tc.telecmiConfigured())return;syncing=true;try{await tc.syncCallLogs(tenant.id,{hours:6});}catch(e){console.error('[telephony] log sync failed:',e.message);}finally{syncing=false;}},600000).unref();}
// Engage (templates, audiences, campaigns, automations) and the role-based Home replace the duplicate
// marketing screens and the eleven dashboards. Writes to the retired duplicates are refused so the
// split cannot come back (their tables were consolidated by installations/crm/consolidate-engagement.mjs).
{const {buildEngageRouter,buildHomeRouter}=await import('./routes/crm-engage.route.js');
 const moved=(what)=>(req,res,next)=>req.method==='GET'?next():res.status(410).json({success:false,code:'moved_to_engage',message:`${what} now live in Engage.`,moveTo:'/crm-tools/engage/'});
 app.use('/api/crm/campaigns',moved('Campaigns, lists, templates, senders and suppressions'));
 app.use('/api/crm/emails/templates',moved('Email templates'));
 app.use('/api/crm/growth/journeys',moved('Automated journeys'));
 app.use('/api/crm/engage',buildEngageRouter());
 app.use('/api/crm/home',buildHomeRouter());
 // Engines the shared app starts in app.js but this runtime never did: automations and segment refresh.
 // Plain timers: the shared *-cron.service.js wrappers import the platform file logger, which cannot
 // create its logs directory in this read-only image.
 const {runAutomationTick}=await import('./services/crm-automations.service.js');
 const {refreshAllActiveSegments}=await import('./services/crm-segments.service.js');
 let autoBusy=false,segBusy=false;
 setInterval(async()=>{if(autoBusy||process.env.CRM_AUTOMATION_ENABLED==='false')return;autoBusy=true;try{await runAutomationTick();}catch(e){console.error('[automations] tick failed:',e.message);}finally{autoBusy=false;}},300000).unref();
 setInterval(async()=>{if(segBusy||process.env.CRM_SEGMENT_REFRESH_ENABLED==='false')return;segBusy=true;try{await refreshAllActiveSegments();}catch(e){console.error('[segments] refresh failed:',e.message);}finally{segBusy=false;}},900000).unref();
 const {runCampaignTick}=await import('./services/crm-engage.service.js');
 setInterval(()=>runCampaignTick().catch(e=>console.error('[engage] campaign tick failed:',e.message)),60000).unref();}
// Read by /crm-tools/overlay/overlay.js, which hides menu entries for screens this installation switches off.
// Derived from the same flags and tables the routes enforce, so the menu follows the server, not a copy of it.
let fieldForceInstalled;
const AI_PROVIDER_KEYS=['SARVAM_API_KEY','GROQ_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','ISHA_INC_API_KEY','WORKSTATION_LLM_API_KEY','LOCAL_LLM_URL'];
const aiConfigured=()=>AI_PROVIDER_KEYS.some(k=>{const v=String(process.env[k]||'').trim();return v&&!/^your_|^sk-proj-test/.test(v);});
app.get('/api/crm/setup-status',async(req,res)=>{try{res.set('Cache-Control','no-store').json({success:true,data:await (await import('./services/crm-setup-status.service.js')).setupStatus(tenant.id,req.crmUser?.tenantUid)});}catch(e){res.status(500).json({success:false,message:'Setup status unavailable'});}});
app.get('/api/crm/ui-config',async(req,res)=>{try{
 if(fieldForceInstalled===undefined)fieldForceInstalled=Boolean((await pool.query("SELECT to_regclass('public.field_leads') AS t")).rows[0]?.t);
 const off=[];const on=k=>process.env[k]==='true';
 if(!on('CRM_AGENT_ENABLED'))off.push('/crm/agent');
 // The Marketing Copilot needs an AI provider. Without one every reply is an error, so its menu entry
 // and dashboard banner stay hidden until a key is configured.
 if(!aiConfigured())off.push('/crm/marketing-copilot');
 if(!on('CRM_FLOW_BUILDER_ENABLED'))off.push('/crm/flow-builder');
 if(!on('CRM_SOCIAL_GROWTH_ENABLED'))off.push('/crm/social-growth','/crm/social-content');
 if(!fieldForceInstalled)off.push('/crm/field-force');
 res.set('Cache-Control','no-store').json({success:true,data:{disabledPaths:off,outboundEnabled:on('CRM_OUTBOUND_ENABLED'),whatsappTool:'/crm-tools/inbox/',inboxTool:'/crm-tools/inbox/',homeTool:'/crm-tools/home/',engageTool:'/crm-tools/engage/',callsTool:'/crm-tools/calls/',whatsappTemplates:'/crm-tools/whatsapp/',aiConfigured:aiConfigured()}});
}catch(e){res.status(500).json({success:false,message:'UI configuration unavailable'});}});
app.use('/api/channel-webhooks',(await import('./routes/crm-channel-webhooks.route.js')).buildCrmChannelWebhooksRouter({tenantId:tenant.id}));
// Field Force is a separate product. Where its tables aren't installed, answer with the same feature_disabled
// contract as Flows/Social instead of a raw database error. (Lives here, not in the shared route: the full
// platform always has Field Force.)
app.use('/api/crm/field-force',async(_req,res,next)=>{try{
 if(fieldForceInstalled===undefined)fieldForceInstalled=Boolean((await pool.query("SELECT to_regclass('public.field_leads') AS t")).rows[0]?.t);
 if(fieldForceInstalled)return next();
 res.status(404).json({success:false,code:'feature_disabled',message:'Field Force is not installed on this CRM.'});
}catch{res.status(503).json({success:false,code:'unavailable',message:'Field Force is temporarily unavailable.'});}});
app.use('/api/crm/contact-center',(await import('./installations/crm/contact-center-wiring.js')).buildContactCenterRouter({authenticate:authCRM}));
const routes=[
 ['/api/crm','crm.route.js'],['/api/crm/team','crm-team.route.js'],
 ['/api/crm/v2','hospital-crm-v2.route.js'],['/api/crm/worldclass','hospital-crm-worldclass.route.js'],
 ['/api/crm/growth','hospital-crm-growth.route.js'],['/api/crm/growth','hospital-crm-specialty.route.js'],
 ['/api/crm/communication-hub','hospital-crm-communication-hub.route.js'],
 ['/api/crm/segments','crm-segments.route.js'],['/api/crm/automations','crm-automations.route.js'],
 ['/api/crm/emails','crmEmail.route.js'],['/api/crm/campaigns','crmCampaigns.route.js'],
 ['/api/crm/campaign-analytics','crmCampaignAnalytics.route.js'],['/api/crm/ai','crm-ai.route.js'],
 ['/api/crm/flows','crm-flow-builder.route.js'],['/api/crm/social','crm-social-growth.route.js'],
 ['/api/crm/brightbean-chat','crm-brightbean-chat.route.js'],['/api/crm/field-force','crm-field-force.route.js'],
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

 // Config pull: the control plane has no push path to a dedicated instance (no inbound-
 // reachable port on its side of the tunnel), so this instance asks instead. No-op until
 // /api/admin/dedicated-installations/config exists on the control plane (fetchDedicatedInstallationConfig
 // returns null on 404) — see "Tenant Onboarding & Private Tunnel Architecture" for the full design.
 const {fetchDedicatedInstallationConfig}=await import('./scripts/fetch-dedicated-config.mjs');
 const {validateMobileApps}=await import('./services/tenant-mobile-apps.service.js');
 // The control plane has no config endpoint yet and answers 401 behind its admin auth, so log a
 // failure once per distinct message instead of every 5 minutes. Token problems still surface via reports.
 let lastAppliedRevision=tenant.settings?.controlPlaneRevision??null,pulling=false,lastPullError=null; // persisted so restarts don't re-apply
 async function pullConfig(){if(pulling)return;pulling=true;try{
  const token=(await readFile(process.env.DEDICATED_CONNECTOR_TOKEN_FILE,'utf8')).trim();
  const config=await fetchDedicatedInstallationConfig({origin:process.env.DEDICATED_CONTROL_PLANE_URL,token,revision:lastAppliedRevision});
  lastPullError=null;
  if(!config||!config.revision||config.revision===lastAppliedRevision)return;
  const next={...tenant.settings,controlPlaneRevision:config.revision};
  if(config.mobileApps)next.mobileApps=validateMobileApps(config.mobileApps,tenant.settings?.mobileApps);
  const brandingOk=!config.branding||Object.entries(config.branding).every(([k,v])=>['logo_url','favicon_url','primary_color','secondary_color'].includes(k)&&(v===null||(typeof v==='string'&&v.length<=500)));
  if(config.branding&&!brandingOk){console.error('[connector] rejected invalid branding payload from control plane');return;}
  await pool.query('UPDATE tenants SET settings=$1::jsonb, branding=COALESCE($2::jsonb,branding), updated_at=NOW() WHERE id=$3',
   [JSON.stringify(next),config.branding?JSON.stringify(config.branding):null,tenant.id]);
  tenant.settings=next;if(config.branding)tenant.branding=config.branding;
  lastAppliedRevision=config.revision;
  console.log('[connector] applied config revision',config.revision);
 }catch(error){if(error.message!==lastPullError)console.error('[connector] config pull failed (repeats suppressed):',error.message);lastPullError=error.message;}finally{pulling=false;}}
 setInterval(pullConfig,300000).unref();pullConfig();
}
async function stop(){server.close();readinessRedis.disconnect();await pool.end();process.exit(0);}process.on('SIGTERM',stop);process.on('SIGINT',stop);
