import {Router} from 'express';
import {z} from 'zod';
import {tenant,fail} from '../services/contact-center/policy.js';
const parse=(s,v)=>{const r=s.safeParse(v);if(!r.success)throw fail(400,'VALIDATION_ERROR',r.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`).join('; '));return r.data;};
const uuid=v=>parse(z.string().uuid(),v);
const wrap=fn=>async(req,res)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(e){res.status(e.statusCode||500).json({success:false,code:e.statusCode?e.code:'VOICE_OPERATION_FAILED',error:e.statusCode?e.message:'Voice operation failed'});}};
const consent=z.object({status:z.literal('granted'),source:z.enum(['written','verbal','existing_record']),evidence:z.string().min(5).max(500)}).strict();
const segment=z.object({id:z.string().regex(/^[\w.-]{1,100}$/),speaker:z.enum(['caller','agent']),startMs:z.number().int().min(0),endMs:z.number().int().min(0),final:z.boolean(),text:z.string().min(1).max(10000),revision:z.number().int().min(0)}).strict().refine(s=>s.endMs>=s.startMs);
const audio=z.string().min(64).max(900000).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const headers=req=>({timestamp:req.get('X-Voice-Timestamp'),nonce:req.get('X-Voice-Nonce'),signature:req.get('X-Voice-Signature')});
export function advancedRouter({media,campaigns,biometrics,authenticate,authorize}){
 const r=Router();r.use(authenticate,authorize('contact_center:read'));
 const uid=req=>{if(req.crmUser.tenantKind==='corporate')throw fail(403,'TENANT_REQUIRED','Healthcare tenant required');return tenant(req.crmUser.tenantUid);};
 const write=authorize('contact_center:write'),configure=authorize('contact_center:configure'),bio=authorize('contact_center:biometrics');
 r.get('/media/readiness',wrap(async(req,res)=>res.json({livekit:media.ready()})));
 r.post('/calls/livekit',write,wrap(async(req,res)=>res.status(202).json(await media.start(uid(req),req.crmUser,parse(z.object({to:z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),transcribe:z.boolean().default(false),bot:z.boolean().default(false),language:z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/).default('en'),consent:consent.optional()}).strict(),req.body),req.get('Idempotency-Key')))));
 r.post('/calls/:id/media/join',write,wrap(async(req,res)=>res.json(await media.join(uid(req),req.crmUser,uuid(req.params.id),parse(z.enum(['agent','listen','whisper','barge']),req.body.mode||'agent')))));
 r.post('/calls/:id/media/invite',write,wrap(async(req,res)=>res.json(await media.invite(uid(req),req.crmUser,uuid(req.params.id)))));
 r.post('/calls/:id/media/actions',write,wrap(async(req,res)=>res.json(await media.action(uid(req),req.crmUser,uuid(req.params.id),parse(z.object({action:z.enum(['hold','resume','hangup','interrupt','transfer','bot_handoff','listen','whisper','barge']),targetAgentId:z.string().regex(/^\d+$/).optional()}).strict(),req.body),req.get('Idempotency-Key')))));
 r.post('/calls/:id/media/reconcile',write,wrap(async(req,res)=>res.json(await media.reconcile(uid(req),uuid(req.params.id)))));
 r.get('/voice-campaigns',configure,wrap(async(req,res)=>res.json(await campaigns.list(uid(req)))));
 r.post('/voice-campaigns',configure,wrap(async(req,res)=>res.status(201).json(await campaigns.create(uid(req),req.crmUser,parse(z.object({name:z.string().min(3).max(100),owner_id:z.coerce.number().int().positive(),transport:z.enum(['livekit','exotel']),bot:z.boolean().default(false),timezone:z.string().default('Asia/Kolkata'),open_time:z.string().default('09:00'),close_time:z.string().default('18:00'),days:z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1,2,3,4,5,6]),max_attempts:z.number().int().min(1).max(5).default(1),identity_ids:z.array(z.number().int().positive()).max(1000).default([])}).strict(),req.body)))));
 r.patch('/voice-campaigns/:id',configure,wrap(async(req,res)=>res.json(await campaigns.status(uid(req),uuid(req.params.id),parse(z.enum(['active','paused']),req.body.status)))));
 r.post('/biometrics/challenges',bio,wrap(async(req,res)=>res.json(await biometrics.issue(uid(req),parse(z.object({identity_id:z.number().int().positive(),purpose:z.enum(['enroll','verify'])}).strict(),req.body)))));
 r.post('/biometrics/enrollments',bio,wrap(async(req,res)=>res.status(201).json(await biometrics.enroll(uid(req),req.crmUser,parse(z.object({challenge_id:z.string().uuid(),samples:z.array(audio).min(3).max(3)}).strict(),req.body)))));
 r.post('/biometrics/verifications',bio,wrap(async(req,res)=>res.json(await biometrics.verify(uid(req),parse(z.object({challenge_id:z.string().uuid(),enrollment_id:z.string().uuid(),audio}).strict(),req.body)))));
 r.delete('/biometrics/enrollments/:id',bio,wrap(async(req,res)=>res.json(await biometrics.revoke(uid(req),req.crmUser,uuid(req.params.id)))));
 return r;
}
export function advancedHooks({media,limiter}){
 const r=Router();if(limiter)r.use(limiter);
 r.post('/livekit/:tenant',wrap(async(req,res)=>{if(typeof req.rawBody!=='string'||req.rawBody.length>1000000)throw fail(400,'RAW_BODY_REQUIRED','Signed webhook raw body required');res.json(await media.webhook(tenant(req.params.tenant),req.rawBody,req.get('Authorization')));}));
 r.post('/agent/:tenant',wrap(async(req,res)=>{
  const base={callId:z.string().uuid()};parse(z.discriminatedUnion('type',[
   z.object({...base,type:z.literal('bootstrap')}).strict(),z.object({...base,type:z.literal('transcript'),segment}).strict(),z.object({...base,type:z.literal('handoff')}).strict(),z.object({...base,type:z.literal('diagnostic'),code:z.enum(['STT_FAILED','BOT_FAILED'])}).strict(),
   z.object({...base,type:z.literal('bot_reply'),text:z.string().max(4000),history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(1000)}).strict()).max(12).optional()}).strict(),
  ]),req.body);res.json(await media.internal(tenant(req.params.tenant),headers(req),req.body));
 }));
 r.post('/guest/:tenant',wrap(async(req,res)=>{const b=parse(z.object({callId:z.string().uuid(),invite:z.string().regex(/^[A-Za-z0-9_-]{43}$/),consent:z.boolean()}).strict(),req.body);res.json(await media.guest(tenant(req.params.tenant),b.callId,b.invite,b.consent));}));
 return r;
}
