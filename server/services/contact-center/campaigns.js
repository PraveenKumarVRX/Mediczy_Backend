import {randomUUID} from 'node:crypto';
import {fail,phone,routeFlow} from './policy.js';
export async function crmScope(c,uid){const t=(await c.query('SELECT id FROM tenants WHERE unique_id=$1',[uid])).rows[0];if(!t)throw fail(403,'TENANT_REQUIRED','Healthcare tenant required');await c.query("SELECT set_config('app.current_org_id',$1,true),set_config('app.current_tenant_id',$1,true)",[String(t.id)]);return t.id;}
export async function identityConsent(c,uid,id,purpose='marketing'){
  const tenantId=await crmScope(c,uid);
  const person=(await c.query("SELECT id FROM crm_person_identities WHERE tenant_id=$1 AND id=$2 AND status='active'",[tenantId,id])).rows[0];
  if(!person)throw fail(404,'IDENTITY_NOT_FOUND','CRM identity does not belong to this hospital');
  // Read latest consent INCLUDING withdrawals. Filtering them out first can resurrect an older opt-in.
  const consent=(await c.query("SELECT * FROM crm_consent_records WHERE tenant_id=$1 AND identity_id=$2 AND channel='voice' AND purpose=$3 ORDER BY captured_at DESC,id DESC LIMIT 1",[tenantId,id,purpose])).rows[0];
  if(!consent||consent.status!=='opted_in'||consent.withdrawn_at||(consent.expires_at&&Date.parse(consent.expires_at)<=Date.now())||!consent.proof_ref)throw fail(409,'VOICE_CONSENT_REQUIRED','Current documented voice consent is required');
  return {tenantId,consent};
}
export function inCampaignWindow(row,now=new Date()){
  return routeFlow({start:'hours',nodes:[{id:'hours',type:'hours',timezone:row.timezone,days:row.days,open:row.open_time,close:row.close_time,inside:'open',outside:'closed'},{id:'open',type:'end'},{id:'closed',type:'end'}]},{now}).next==='open';
}
export function createVoiceCampaigns({tx,base,media}){
  return {
    async list(uid){return tx(uid,async c=>(await c.query(`SELECT p.*,COUNT(r.id)::int AS recipients,COUNT(r.id) FILTER(WHERE r.state='completed')::int AS completed,COUNT(r.id) FILTER(WHERE r.state='unknown')::int AS unknown FROM cc_voice_campaigns p LEFT JOIN cc_voice_recipients r ON r.tenant_uid=p.tenant_uid AND r.campaign_id=p.id WHERE p.tenant_uid=$1 GROUP BY p.tenant_uid,p.id ORDER BY p.created_at DESC`,[uid])).rows);},
    async create(uid,actor,input){
      inCampaignWindow(input); // Validate timezone/hours/days before creating anything.
      return tx(uid,async c=>{
        const id=randomUUID();
        const owner=(await c.query('SELECT user_id FROM cc_agents WHERE tenant_uid=$1 AND user_id=$2',[uid,String(input.owner_id)])).rows[0];if(!owner)throw fail(400,'INVALID_AGENT','Assign an active contact-center campaign owner');
        const row=(await c.query(`INSERT INTO cc_voice_campaigns(tenant_uid,id,name,owner_id,transport,bot,timezone,open_time,close_time,days,max_attempts) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[uid,id,input.name,String(input.owner_id),input.transport,input.bot,input.timezone,input.open_time,input.close_time,input.days,input.max_attempts])).rows[0];
        for(const identity of [...new Set(input.identity_ids)]){
          await identityConsent(c,uid,identity);
          await c.query('INSERT INTO cc_voice_recipients(tenant_uid,id,campaign_id,identity_id,source_key) VALUES($1,$2,$3,$4,$5)',[uid,randomUUID(),id,identity,`campaign:${id}:${identity}`]);
        }
        return row;
      });
    },
    async status(uid,id,status){return tx(uid,async c=>{const row=(await c.query('UPDATE cc_voice_campaigns SET status=$3 WHERE tenant_uid=$1 AND id=$2 RETURNING *',[uid,id,status])).rows[0];if(!row)throw fail(404,'CAMPAIGN_NOT_FOUND','Campaign not found');return row;});},
    async tick(uid){
      // A lease expiring is NOT evidence that a telephone call did not happen.
      await tx(uid,c=>c.query("UPDATE cc_voice_recipients SET state='unknown',error_code='LEASE_EXPIRED_REVIEW_REQUIRED' WHERE tenant_uid=$1 AND state='reserved' AND lease_until<now()",[uid]));
      const active=await tx(uid,async c=>(await c.query(`SELECT r.*,v.state AS call_state,p.max_attempts FROM cc_voice_recipients r JOIN cc_calls v ON v.tenant_uid=r.tenant_uid AND v.id=r.call_id JOIN cc_voice_campaigns p ON p.tenant_uid=r.tenant_uid AND p.id=r.campaign_id WHERE r.tenant_uid=$1 AND r.state='started'`,[uid])).rows);
      for(const r of active){
        if(!['completed','failed','busy','no-answer','unknown'].includes(r.call_state))continue;
        const state=r.call_state==='completed'?'completed':r.call_state==='unknown'?'unknown':r.attempts<r.max_attempts?'retry':'failed';
        await tx(uid,async c=>{await c.query("UPDATE cc_voice_recipients SET state=$3,next_run_at=now()+interval '1 day' WHERE tenant_uid=$1 AND id=$2",[uid,r.id,state]);const tenantId=await crmScope(c,uid);await c.query("UPDATE crm_communication_events SET status=$3 WHERE tenant_id=$1 AND metadata->>'voice_call_id'=$2",[tenantId,String(r.call_id),r.call_state]);});
      }
      const due=await tx(uid,async c=>{
        const rows=(await c.query(`SELECT r.*,p.owner_id,p.transport,p.bot,p.timezone,p.open_time,p.close_time,p.days FROM cc_voice_recipients r JOIN cc_voice_campaigns p ON p.tenant_uid=r.tenant_uid AND p.id=r.campaign_id WHERE r.tenant_uid=$1 AND p.status='active' AND r.state IN('pending','retry') AND r.next_run_at<=now() ORDER BY r.next_run_at FOR UPDATE OF r SKIP LOCKED LIMIT 20`,[uid])).rows;
        const r=rows.find(value=>inCampaignWindow(value));if(!r)return null;
        const a=(await c.query("SELECT user_id FROM cc_agents WHERE tenant_uid=$1 AND user_id=$2 AND presence='available' AND active_call_id IS NULL AND updated_at>now()-interval '2 minutes'",[uid,r.owner_id])).rows[0];if(!a)return null;
        let consent;try{consent=await identityConsent(c,uid,r.identity_id);}catch(e){if(e.code!=='VOICE_CONSENT_REQUIRED')throw e;await c.query("UPDATE cc_voice_recipients SET state='suppressed',error_code=$3 WHERE tenant_uid=$1 AND id=$2",[uid,r.id,e.code]);return null;}
        const processing=r.bot?await identityConsent(c,uid,r.identity_id,'transcription'):null;
        const key=(await c.query("SELECT normalized_value,raw_value FROM crm_identity_keys WHERE tenant_id=$1 AND person_id=$2 AND key_type='phone' ORDER BY is_verified DESC,id LIMIT 1",[consent.tenantId,r.identity_id])).rows[0];
        const raw=String(key?.normalized_value||key?.raw_value||'').replace(/[^+\d]/g,'');const to=phone(raw.startsWith('+')?raw:/^\d{10}$/.test(raw)?`+91${raw}`:`+${raw}`);
        if((await c.query('SELECT 1 FROM cc_suppressions WHERE tenant_uid=$1 AND phone=$2',[uid,to])).rowCount){await c.query("UPDATE cc_voice_recipients SET state='suppressed' WHERE tenant_uid=$1 AND id=$2",[uid,r.id]);return null;}
        await c.query("UPDATE cc_voice_recipients SET state='reserved',attempts=attempts+1,lease_until=now()+interval '2 minutes' WHERE tenant_uid=$1 AND id=$2",[uid,r.id]);return {...r,to,consent:processing?.consent||consent.consent,attempt:r.attempts+1,tenantId:consent.tenantId};
      });
      if(!due)return {processed:0};
      const key=`voice-${due.id}-${due.attempt}`;let call;
      try{
        // Never pass campaign consent as recording consent. Campaigns do not record.
        const input=due.transport==='livekit'?{to:due.to,bot:due.bot,transcribe:due.bot,language:'en',...(due.bot?{consent:{status:'granted',source:'existing_record',evidence:due.consent.proof_ref}}:{})}:{to:due.to,record:false,transport:'phone'};
        call=due.transport==='livekit'?await media.start(uid,{id:due.owner_id},input,key):await base.dial(uid,{id:due.owner_id},input,key);
      }catch(error){
        const existing=await tx(uid,async c=>(await c.query('SELECT * FROM cc_calls WHERE tenant_uid=$1 AND idempotency_key=$2',[uid,key])).rows[0]);
        const uncertain=existing?.state==='unknown'||!error.statusCode||error.statusCode>=500;
        await tx(uid,c=>c.query("UPDATE cc_voice_recipients SET state=$3,call_id=$4,error_code=$5 WHERE tenant_uid=$1 AND id=$2",[uid,due.id,uncertain?'unknown':existing?'started':'pending',existing?.id||null,error.code||'VOICE_DELIVERY_FAILED']));return {processed:1,errorCode:error.code||'VOICE_DELIVERY_FAILED'};
      }
      await tx(uid,async c=>{
        await c.query("UPDATE cc_voice_recipients SET state='started',call_id=$3,lease_until=null WHERE tenant_uid=$1 AND id=$2",[uid,due.id,call.id]);
        await c.query(`INSERT INTO crm_communication_events(tenant_id,identity_id,channel,direction,message_type,body_preview,provider,status,owner_user_id,metadata) VALUES($1,$2,'voice','outbound','campaign','Voice campaign call',$3,$4,$5,$6)`,[due.tenantId,due.identity_id,due.transport,call.state,Number(due.owner_id),JSON.stringify({voice_call_id:call.id,voice_campaign_id:due.campaign_id,source_key:due.source_key})]);
      });return {processed:1,callId:call.id};
    },
  };
}

/** Runs inside the existing journey transaction: enqueue and journey commit are atomic. */
export async function enqueueJourneyVoice(c,{tenantId,eventId,identityId,config}){
  if(!/^[0-9a-f-]{36}$/i.test(config?.campaign_id||''))throw fail(400,'VOICE_CAMPAIGN_REQUIRED','Voice journey step requires an approved campaign UUID');
  const t=(await c.query('SELECT unique_id FROM tenants WHERE id=$1',[tenantId])).rows[0];if(!t)throw fail(403,'TENANT_REQUIRED','Healthcare tenant required');
  await c.query("SELECT set_config('app.tenant_uid',$1,true)",[t.unique_id]);await identityConsent(c,t.unique_id,identityId);
  const p=(await c.query("SELECT id FROM cc_voice_campaigns WHERE tenant_uid=$1 AND id=$2 AND status='active'",[t.unique_id,config.campaign_id])).rows[0];if(!p)throw fail(409,'CAMPAIGN_NOT_ACTIVE','Publish a tenant-owned voice campaign first');
  await c.query('INSERT INTO cc_voice_recipients(tenant_uid,id,campaign_id,identity_id,source_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_uid,source_key) DO NOTHING',[t.unique_id,randomUUID(),p.id,identityId,`journey:${tenantId}:${eventId}`]);
}
