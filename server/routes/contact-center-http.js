import { Router } from 'express';
import { z } from 'zod';
import { tenant, fail } from '../services/contact-center/policy.js';

const tags=z.array(z.string().trim().min(1).max(40)).max(20).default([]);
const config=z.object({provider:z.enum(['exotel','telecmi','zoom_phone','airtel_iq','twilio','plivo']).default('exotel'),credential_prefix:z.string().regex(/^VOICE_[A-Z0-9_]{3,60}$/),number:z.string().regex(/^\+[1-9]\d{7,14}$/),enabled:z.boolean().default(false),recording_enabled:z.boolean().default(false),retention_days:z.number().int().min(1).max(3650).default(30),gateway_prefix:z.string().regex(/^VOICE_[A-Z0-9_]{3,60}$/).nullable().optional()}).strict();
const agent=z.object({user_id:z.coerce.number().int().positive(),name:z.string().trim().min(1).max(100),phone:z.string(),role:z.enum(['agent','supervisor','admin']).default('agent'),skills:tags,languages:tags,priority:z.number().int().min(0).max(100).default(1)}).strict();
const queue=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(1).max(100),skills:tags,languages:tags,wrap_seconds:z.number().int().min(0).max(1800).default(60),timeout_seconds:z.number().int().min(15).max(3600).default(120)}).strict();
const dial=z.object({to:z.string().regex(/^\+[1-9]\d{7,14}$/),queue_id:z.string().uuid().optional(),callback_id:z.string().uuid().optional(),transport:z.enum(['phone','browser']).default('phone'),record:z.boolean().default(false),consent:z.object({status:z.enum(['granted','denied']),source:z.enum(['verbal','written','existing_record']),evidence:z.string().trim().min(5).max(500)}).strict().optional()}).strict();
const flow=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(1).max(100),graph:z.object({start:z.string(),nodes:z.array(z.record(z.any())).max(100)}).strict(),publish:z.boolean().default(false)}).strict();
const disposition=z.object({disposition:z.enum(['appointment_followup','information_provided','callback_required','wrong_number','no_action']),followup_at:z.string().datetime({offset:true}).optional()}).strict().refine(v=>v.disposition!=='callback_required'||Boolean(v.followup_at),'Choose a callback time');
const callback=z.object({status:z.enum(['open','in_progress','resolved']),resolution:z.string().max(500).optional()}).strict();
const action=z.object({action:z.enum(['hold','resume','transfer','hangup','listen','whisper','barge','bot_handoff','interrupt']),targetAgentId:z.string().max(50).optional()}).strict();
const segment=z.object({id:z.string().regex(/^[\w.-]{1,80}$/),speaker:z.enum(['caller','agent']),startMs:z.number().int().min(0),endMs:z.number().int().min(0),final:z.boolean(),text:z.string().min(1).max(10000),revision:z.number().int().min(0)}).strict().refine(s=>s.endMs>=s.startMs,'Invalid segment times');
const gatewayEvent=z.object({callId:z.string().uuid(),type:z.literal('transcript'),segment}).strict();

function parse(schema,value){const result=schema.safeParse(value);if(!result.success)throw fail(400,'VALIDATION_ERROR',result.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`).join('; '));return result.data;}
const uuid=value=>parse(z.string().uuid(),value);
const kind=value=>parse(z.enum(['summary','copilot','qa']),value);
function handler(fn){return async(req,res)=>{try{await fn(req,res);}catch(error){const status=error.statusCode||500;res.status(status).json({success:false,error:status>=500?'Contact-center operation failed':error.message,code:error.statusCode?error.code||'CONTACT_CENTER_ERROR':'CONTACT_CENTER_ERROR'});}};}

export function createContactCenterRouter({ service, media, authenticate, authorize }) {
  const router=Router();
  router.use(authenticate,authorize('contact_center:read'));
  const uid=req=>{
    if(req.crmUser.tenantKind==='corporate')throw fail(403,'TENANT_REQUIRED','Resolve the owning healthcare tenant before using voice');
    return tenant(req.crmUser.tenantUid);
  };
  const write=authorize('contact_center:write'),configure=authorize('contact_center:configure');
  router.get('/',handler(async(req,res)=>res.json(await service.overview(uid(req)))));
  router.get('/knowledge',handler(async(req,res)=>res.json(await service.knowledge(uid(req)))));
  router.put('/knowledge',configure,handler(async(req,res)=>res.json(await service.saveKnowledge(uid(req),req.crmUser,parse(z.object({id:z.string().uuid().optional(),title:z.string().min(3).max(150),body:z.string().min(10).max(12000),published:z.boolean().default(false)}).strict(),req.body)))));
  router.put('/config',configure,handler(async(req,res)=>res.json(await service.configure(uid(req),req.crmUser,parse(config,req.body)))));
  router.post('/external-dial',write,handler(async(req,res)=>res.json(await service.externalDial(uid(req),req.crmUser,parse(z.object({to:z.string().regex(/^\+[1-9]\d{7,14}$/),callback_id:z.string().uuid().optional()}).strict(),req.body),req.get('Idempotency-Key')))));
  router.put('/agents',configure,handler(async(req,res)=>res.json(await service.saveAgent(uid(req),req.crmUser,parse(agent,req.body)))));
  router.patch('/presence',write,handler(async(req,res)=>res.json(await service.presence(uid(req),req.crmUser,parse(z.enum(['available','offline','busy']),req.body.presence)))));
  router.post('/browser-session',write,handler(async(req,res)=>{res.set('Cache-Control','no-store');res.json(await service.browserSession(uid(req),req.crmUser));}));
  router.put('/queues',configure,handler(async(req,res)=>res.json(await service.saveQueue(uid(req),req.crmUser,parse(queue,req.body)))));
  router.post('/flows',configure,handler(async(req,res)=>res.json(await service.saveFlow(uid(req),req.crmUser,parse(flow,req.body)))));
  router.post('/calls',write,handler(async(req,res)=>res.status(202).json(await service.dial(uid(req),req.crmUser,parse(dial,req.body),req.get('Idempotency-Key')))));
  router.get('/calls/:id',handler(async(req,res)=>res.json(await service.callDetail(uid(req),uuid(req.params.id)))));
  router.post('/calls/:id/reconcile',write,handler(async(req,res)=>{const call=await service.getCall(uid(req),uuid(req.params.id));if(call.provider==='livekit'){if(!media)throw fail(503,'MEDIA_NOT_CONFIGURED','Native media is unavailable');return res.json(await media.reconcile(uid(req),call.id));}if(!call.provider_sid)throw fail(409,'PROVIDER_ID_PENDING','Provider identifier is not available; do not redial automatically');res.json(call.provider&&call.provider!=='exotel'?await service.reconcile(uid(req),call.provider_sid,call.provider):await service.reconcile(uid(req),call.provider_sid));}));
  router.post('/calls/:id/actions',write,handler(async(req,res)=>res.json(await service.mediaAction(uid(req),req.crmUser,uuid(req.params.id),parse(action,req.body)))));
  router.post('/calls/:id/disposition',write,handler(async(req,res)=>res.json(await service.disposition(uid(req),req.crmUser,uuid(req.params.id),parse(disposition,req.body)))));
  router.post('/calls/:id/artifacts/:kind',write,handler(async(req,res)=>res.json(await service.artifact(uid(req),req.crmUser,uuid(req.params.id),kind(req.params.kind)))));
  router.post('/calls/:id/artifacts/:kind/review',write,handler(async(req,res)=>res.json(await service.review(uid(req),req.crmUser,uuid(req.params.id),kind(req.params.kind)))));
  router.post('/calls/:id/recording',write,handler(async(req,res)=>res.json(await service.storeRecording(uid(req),req.crmUser,uuid(req.params.id)))));
  router.post('/calls/:id/index',write,handler(async(req,res)=>res.json(await service.indexCall(uid(req),uuid(req.params.id)))));
  router.get('/recordings/:id/playback',handler(async(req,res)=>{res.set('Cache-Control','no-store');res.json(await service.playback(uid(req),req.crmUser,uuid(req.params.id)));}));
  router.post('/recordings/expire',configure,handler(async(req,res)=>res.json({recordings:await service.expireRecordings(uid(req),req.crmUser),text:await service.expireText(uid(req),req.crmUser)})));
  router.patch('/callbacks/:id',write,handler(async(req,res)=>res.json(await service.callback(uid(req),req.crmUser,uuid(req.params.id),parse(callback,req.body)))));
  router.post('/suppressions',write,handler(async(req,res)=>res.json(await service.suppress(uid(req),req.crmUser,parse(z.object({phone:z.string(),reason:z.string().min(3).max(500)}).strict(),req.body)))));
  router.get('/search',handler(async(req,res)=>{const query=parse(z.string().trim().min(2).max(200),req.query.q);res.json(req.query.mode==='semantic'?await service.semanticSearch(uid(req),query):await service.search(uid(req),query));}));
  return router;
}

export function createContactCenterHooks({service,limiter}) {
  const router=Router();if(limiter)router.use(limiter);
  // Exotel v1 callback bodies are notifications, NOT authority. The service
  // re-fetches the call from the configured account over authenticated HTTPS.
  router.post('/exotel/:tenant',handler(async(req,res)=>{
    const sid=parse(z.string().regex(/^[A-Za-z0-9]{16,64}$/),req.body.CallSid||req.body.Sid||req.body.Call?.Sid);
    await service.reconcile(tenant(req.params.tenant),sid);res.json({ok:true});
  }));
  router.post('/providers/:provider/:tenant',handler(async(req,res)=>{
    const provider=parse(z.enum(['telecmi','airtel_iq','twilio','plivo']),req.params.provider);
    const sid=parse(z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),req.body.CallSid||req.body.Sid);
    await service.reconcile(tenant(req.params.tenant),sid,provider);res.json({ok:true});
  }));
  router.post('/gateway/:tenant',handler(async(req,res)=>{
    parse(gatewayEvent,req.body);
    res.json(await service.ingest(tenant(req.params.tenant),{
      timestamp:req.get('X-Voice-Timestamp'),nonce:req.get('X-Voice-Nonce'),signature:req.get('X-Voice-Signature'),
    },req.body));
  }));
  return router;
}
