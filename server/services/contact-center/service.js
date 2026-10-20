import { randomUUID, randomBytes } from 'node:crypto';
import { fail, phone, tenant, digest, stateAfter, terminal, selectAgent, validateFlow, verifyGateway } from './policy.js';
import { ExotelProvider } from './exotel.js';
import { redactPhiText } from '../../utils/phi-text-redactor.js';

export function createContactCenter({ tx, providerFactory = config => new ExotelProvider(config), env = process.env, llm, storage, gateway, embed }) {
  function binding(uid,cfg) {
    let approved;try{approved=JSON.parse(env.VOICE_PROVIDER_BINDINGS||'{}')[tenant(uid)];}catch{/* fail closed */}
    if(!approved||approved.credential_prefix!==cfg.credential_prefix||approved.number!==cfg.number||(cfg.gateway_prefix&&cfg.gateway_prefix!==approved.gateway_prefix))throw fail(503,'VOICE_BINDING_REQUIRED','The server administrator must bind this provider reference and number to this organization');
  }
  const one = async (c, sql, args) => (await c.query(sql, args)).rows[0];
  const event = (c, uid, call, key, kind, actor, payload = {}) => c.query(`INSERT INTO cc_events(tenant_uid,call_id,source_key,kind,actor_id,payload)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_uid,source_key) DO NOTHING RETURNING id`, [uid, call, key, kind, actor, JSON.stringify(payload)]);
  const config = (uid, required = true) => tx(uid, async c => {
    const value = await one(c, 'SELECT * FROM cc_configs WHERE tenant_uid=$1', [uid]);
    if (required && !value?.enabled) throw fail(503, 'VOICE_NOT_CONFIGURED', 'Contact center is not enabled for this organization');
    if(required)binding(uid,value);
    return value;
  });
  const getCall = (uid, id) => tx(uid, async c => {
    const call = await one(c, 'SELECT * FROM cc_calls WHERE tenant_uid=$1 AND id=$2', [uid, id]);
    if (!call) throw fail(404, 'CALL_NOT_FOUND', 'Call not found'); return call;
  });
  const actorEvent = (uid, actor, kind, payload = {}) => tx(uid, c => event(c, uid, null, randomUUID(), kind, String(actor.id), payload));
  function contentAllowed(call,cfg) {
    if(call.consent?.retention_completed||(call.ended_at&&Date.parse(call.ended_at)+(cfg?.retention_days||30)*86400000<=Date.now()))throw fail(410,'CALL_CONTENT_EXPIRED','Call content retention has expired');
  }
  const privilegedAgent = async (uid, actor) => tx(uid, async c => {
    const agent = await one(c, 'SELECT role FROM cc_agents WHERE tenant_uid=$1 AND user_id=$2', [uid, String(actor.id)]);
    if (!['supervisor','admin'].includes(agent?.role)) throw fail(403, 'SUPERVISOR_REQUIRED', 'An assigned contact-center supervisor is required');
  });
  function callbackUrl(uid) {
    const base = env.VOICE_PUBLIC_BASE_URL;
    if (!base || !base.startsWith('https://')) throw fail(503, 'VOICE_NOT_CONFIGURED', 'A public HTTPS callback base URL is required');
    return new URL(`/api/contact-center/hooks/exotel/${encodeURIComponent(tenant(uid))}`, base).href;
  }
  function browserIdentity(cfg,actorId) {
    let accounts;try{accounts=JSON.parse(env[`${cfg.credential_prefix}_WEBRTC_ACCOUNTS`]||'{}');}catch{throw fail(503,'BROWSER_CALLING_NOT_CONFIGURED','Browser account mapping is invalid');}
    const value=accounts[String(actorId)];
    if(!value||!/^\w[\w.-]{0,63}$/.test(value.userName||'')||![value.domain,value.sipdomain].every(d=>/^[a-zA-Z0-9.-]+\.exotel\.com$/.test(d||''))||!Number.isInteger(Number(value.port))||Number(value.port)<1||Number(value.port)>65535||!env[`${cfg.credential_prefix}_WEBRTC_ACCOUNT_TOKEN`])throw fail(503,'BROWSER_CALLING_NOT_CONFIGURED','An approved Exotel browser subscriber is required for this agent');
    return value;
  }

  const api = {
    async overview(uid) {
      return tx(uid, async c => {
        const cfg=await one(c, 'SELECT * FROM cc_configs WHERE tenant_uid=$1', [uid]);
        const agents=await c.query('SELECT * FROM cc_agents WHERE tenant_uid=$1 ORDER BY name', [uid]);
        const queues=await c.query('SELECT * FROM cc_queues WHERE tenant_uid=$1 ORDER BY name', [uid]);
        const calls=await c.query('SELECT * FROM cc_calls WHERE tenant_uid=$1 ORDER BY started_at DESC LIMIT 100', [uid]);
        const callbacks=await c.query("SELECT b.*,c.destination FROM cc_callbacks b JOIN cc_calls c ON c.tenant_uid=b.tenant_uid AND c.id=b.call_id WHERE b.tenant_uid=$1 ORDER BY b.due_at LIMIT 100", [uid]);
        const flows=await c.query('SELECT * FROM cc_flows WHERE tenant_uid=$1 ORDER BY created_at DESC LIMIT 100', [uid]);
        const metrics=await one(c, `SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE answered_at IS NOT NULL)::int AS answered,
            COUNT(*) FILTER(WHERE state IN ('busy','no-answer','failed'))::int AS unanswered,
            COALESCE(SUM(provider_duration_seconds),0)::bigint AS provider_duration_seconds,
            COUNT(*) FILTER(WHERE state IN ('submitting','unknown','queued','ringing','answered'))::int AS active
            FROM cc_calls WHERE tenant_uid=$1 AND started_at>=now()-interval '24 hours'`, [uid]);
        let providerConfigured = false;
        if (cfg?.enabled) { try { binding(uid,cfg);providerFactory(cfg); callbackUrl(uid); providerConfigured = true; } catch { /* only non-secret readiness */ } }
        const mediaGatewayConfigured=Boolean(gateway&&cfg?.gateway_prefix&&env[`${cfg.gateway_prefix}_URL`]?.startsWith('https://')&&env[`${cfg.gateway_prefix}_EVENT_SECRET`]);
        return { config: cfg, providerConfigured, agents: agents.rows, queues: queues.rows, calls: calls.rows, callbacks: callbacks.rows, flows: flows.rows, metrics,
          capabilities: { livekit:Boolean((env.LIVEKIT_URL||env.LIVEKIT_API_URL)&&env.LIVEKIT_API_KEY&&env.LIVEKIT_API_SECRET),exotelCalling: providerConfigured, agentPhone: true,browserMedia:Boolean(cfg&&env[`${cfg.credential_prefix}_WEBRTC_ACCOUNT_TOKEN`]&&env[`${cfg.credential_prefix}_WEBRTC_ACCOUNTS`]), mediaGatewayConfigured, supervisorMedia: mediaGatewayConfigured, validatedBiometrics: false } };
      });
    },
    async configure(uid, actor, input) {
      if(input.enabled)binding(uid,input);
      const maximum=Number(env.VOICE_MAX_RETENTION_DAYS||3650);
      if(!Number.isInteger(maximum)||maximum<1||input.retention_days>maximum)throw fail(400,'RETENTION_POLICY','Retention exceeds the server storage policy');
      return tx(uid, async c => {
        const value = await one(c, `INSERT INTO cc_configs(tenant_uid,credential_prefix,number,enabled,recording_enabled,retention_days,gateway_prefix)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_uid) DO UPDATE SET credential_prefix=$2,number=$3,enabled=$4,
          recording_enabled=$5,retention_days=$6,gateway_prefix=$7,updated_at=now() RETURNING *`,
        [uid,input.credential_prefix,phone(input.number),input.enabled,input.recording_enabled,input.retention_days,input.gateway_prefix||null]);
        await event(c, uid, null, randomUUID(), 'configuration_changed', String(actor.id), { enabled: value.enabled }); return value;
      });
    },
    async saveAgent(uid, actor, input) {
      return tx(uid, async c => {
        // User identity is resolved from the authenticated CRM's owning tenant.
        const user = await one(c, `SELECT u.id FROM users u JOIN tenants t ON t.id=COALESCE(u.tenant_id,u.organization_id)
          WHERE u.id=$1 AND t.unique_id=$2 AND u.status='active'`, [input.user_id, uid]);
        if (!user) throw fail(400, 'INVALID_AGENT', 'An active staff member of this organization is required');
        const agent = await one(c, `INSERT INTO cc_agents(tenant_uid,user_id,name,phone,role,skills,languages,priority)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_uid,user_id) DO UPDATE SET name=$3,phone=$4,role=$5,skills=$6,languages=$7,priority=$8 RETURNING *`,
        [uid,String(user.id),input.name,phone(input.phone),input.role,input.skills,input.languages,input.priority]);
        await event(c, uid, null, randomUUID(), 'agent_configured', String(actor.id), { agentId: agent.user_id, role: agent.role }); return agent;
      });
    },
    async presence(uid, actor, presence) {
      return tx(uid, async c => {
        const agent = await one(c, 'SELECT * FROM cc_agents WHERE tenant_uid=$1 AND user_id=$2 FOR UPDATE', [uid,String(actor.id)]);
        if (!agent) throw fail(403, 'AGENT_NOT_ASSIGNED', 'Contact-center agent assignment is required');
        if (agent.active_call_id && presence !== 'busy') throw fail(409, 'AGENT_BUSY', 'Finish the active call before changing availability');
        if (presence === 'available' && agent.wrap_until && Date.parse(agent.wrap_until)>Date.now()) throw fail(409, 'WRAP_UP_ACTIVE', 'Complete wrap-up before becoming available');
        return one(c, 'UPDATE cc_agents SET presence=$3,updated_at=now() WHERE tenant_uid=$1 AND user_id=$2 RETURNING *', [uid,agent.user_id,presence]);
      });
    },
    async browserSession(uid,actor) {
      const cfg=await config(uid),provider=providerFactory(cfg),account=browserIdentity(cfg,actor.id);
      return tx(uid,async c=>{
      const agent=await one(c,'SELECT * FROM cc_agents WHERE tenant_uid=$1 AND user_id=$2 FOR UPDATE',[uid,String(actor.id)]);
      if(!agent)throw fail(403,'AGENT_NOT_ASSIGNED','Contact-center agent assignment is required');
      if(agent.active_call_id)throw fail(409,'CALL_ACTIVE','Finish the active call before renewing browser registration');
      const secret=randomBytes(32).toString('base64url');
      await provider.rotateSubscriber(account.userName,secret,env[`${cfg.credential_prefix}_WEBRTC_ACCOUNT_TOKEN`]);
      await event(c,uid,null,randomUUID(),'browser_subscriber_rotated',String(actor.id));
      return {userName:account.userName,authUser:account.userName,domain:account.domain,sipdomain:account.sipdomain,port:String(account.port),displayname:agent.name,displayName:agent.name,accountSid:provider.sid,secret,security:'wss',endpoint:'wss'};
      });
    },
    async saveQueue(uid, actor, input) {
      return tx(uid, async c => {
        const id = input.id || randomUUID();
        const value = await one(c, `INSERT INTO cc_queues(tenant_uid,id,name,skills,languages,wrap_seconds,timeout_seconds) VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(tenant_uid,id) DO UPDATE SET name=$3,skills=$4,languages=$5,wrap_seconds=$6,timeout_seconds=$7 RETURNING *`,
        [uid,id,input.name,input.skills,input.languages,input.wrap_seconds,input.timeout_seconds]);
        await event(c,uid,null,randomUUID(),'queue_configured',String(actor.id),{ queueId:id }); return value;
      });
    },
    async saveFlow(uid, actor, input) {
      validateFlow(input.graph);
      return tx(uid, async c => {
        const id = input.id || randomUUID();
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${uid}:flow:${id}`]);
        for (const n of input.graph.nodes.filter(n=>n.type==='queue')) {
          if (!await one(c,'SELECT id FROM cc_queues WHERE tenant_uid=$1 AND id=$2',[uid,n.queueId])) throw fail(400,'INVALID_QUEUE','Flow queue does not belong to this organization');
        }
        const row = await one(c,'SELECT COALESCE(MAX(version),0)+1 AS version FROM cc_flows WHERE tenant_uid=$1 AND id=$2',[uid,id]);
        if (input.publish) await c.query('UPDATE cc_flows SET published=false WHERE tenant_uid=$1 AND id=$2',[uid,id]);
        const flow = await one(c,`INSERT INTO cc_flows(tenant_uid,id,version,name,graph,published,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[uid,id,row.version,input.name,JSON.stringify(input.graph),input.publish,String(actor.id)]);
        await event(c,uid,null,randomUUID(),'flow_version_created',String(actor.id),{ flowId:id,version:row.version,published:input.publish }); return flow;
      });
    },
    async dial(uid, actor, input, key) {
      const cfg = await config(uid); const provider = providerFactory(cfg); const url = callbackUrl(uid); phone(input.to);
      if(input.record){if(!storage?.assertConfigured)throw fail(503,'RECORDING_STORAGE_UNAVAILABLE','Private recording storage must be configured before recording');storage.assertConfigured();}
      if (!/^[\w.-]{8,120}$/.test(key || '')) throw fail(400,'IDEMPOTENCY_REQUIRED','An Idempotency-Key is required');
      const hash = digest(input);
      const call = await tx(uid, async c => {
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${uid}:dial:${key}`]);
        const existing = await one(c,'SELECT * FROM cc_calls WHERE tenant_uid=$1 AND idempotency_key=$2',[uid,key]);
        if (existing) {
          if (existing.request_hash!==hash) throw fail(409,'IDEMPOTENCY_CONFLICT','This key was used for a different request');
          return { ...existing, duplicate: true };
        }
        // Serialize the short reservation step, never the external provider
        // request. Locking every eligible agent with SKIP LOCKED otherwise makes
        // a simultaneous request incorrectly observe an empty queue.
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${uid}:agent-assignment`]);
        if (await one(c,'SELECT phone FROM cc_suppressions WHERE tenant_uid=$1 AND phone=$2',[uid,input.to])) throw fail(409,'SUPPRESSED','This recipient is suppressed');
        if(input.callback_id){
          const callback=await one(c,`SELECT b.*,v.destination FROM cc_callbacks b JOIN cc_calls v ON v.tenant_uid=b.tenant_uid AND v.id=b.call_id WHERE b.tenant_uid=$1 AND b.id=$2 FOR UPDATE OF b`,[uid,input.callback_id]);
          if(!callback||callback.owner_id!==String(actor.id)||callback.status!=='in_progress'||callback.destination!==input.to||input.queue_id)throw fail(409,'CALLBACK_SCOPE_MISMATCH','Claim this callback and use its customer number with your assigned agent');
          await c.query('UPDATE cc_callbacks SET attempts=attempts+1 WHERE tenant_uid=$1 AND id=$2',[uid,input.callback_id]);
        }
        const queue = input.queue_id ? await one(c,'SELECT * FROM cc_queues WHERE tenant_uid=$1 AND id=$2',[uid,input.queue_id]) : null;
        if (input.queue_id && !queue) throw fail(404,'QUEUE_NOT_FOUND','Queue not found');
        const agents = (await c.query("SELECT * FROM cc_agents WHERE tenant_uid=$1 AND presence='available' AND updated_at>now()-interval '2 minutes' FOR UPDATE SKIP LOCKED",[uid])).rows;
        // A caller may originate their own calls; queue-wide assignment is a supervisor operation.
        const own = agents.find(a=>a.user_id===String(actor.id));
        const assigned = queue ? selectAgent(agents,queue) : own;
        const self=queue?await one(c,'SELECT role FROM cc_agents WHERE tenant_uid=$1 AND user_id=$2',[uid,String(actor.id)]):own;
        if (queue && !['supervisor','admin'].includes(self?.role)) throw fail(403,'SUPERVISOR_REQUIRED','Queue assignment requires a supervisor');
        if (!assigned || assigned.active_call_id) throw fail(409,'NO_AVAILABLE_AGENT','No eligible available agent');
        const record = Boolean(input.record);
        if (record && (!cfg.recording_enabled || input.consent?.status!=='granted' || !input.consent?.evidence)) throw fail(409,'CONSENT_REQUIRED','Recording requires enabled policy and recorded consent evidence');
        const id=randomUUID();
        const result = await one(c,`INSERT INTO cc_calls(tenant_uid,id,idempotency_key,request_hash,agent_id,queue_id,destination,direction,consent,recording_requested)
          VALUES($1,$2,$3,$4,$5,$6,$7,'outbound',$8,$9) RETURNING *`,[uid,id,key,hash,assigned.user_id,input.queue_id||null,input.to,JSON.stringify(input.consent||{}),record]);
        await c.query("UPDATE cc_agents SET active_call_id=$3,presence='busy',updated_at=now() WHERE tenant_uid=$1 AND user_id=$2",[uid,assigned.user_id,id]);
        const browser=input.transport==='browser'?browserIdentity(cfg,assigned.user_id):null;
        await event(c,uid,id,randomUUID(),'dial_reserved',String(actor.id),{ recording: record,transport:input.transport||'phone',...(input.callback_id?{callbackId:input.callback_id}:{}) });
        return { ...result,agentPhone:browser?`sip:${browser.userName}@${provider.sid}.voip.exotel.com`:assigned.phone };
      });
      if (call.duplicate) return call;
      let accepted;
      try { accepted=await provider.dial({ agentNumber:call.agentPhone,to:call.destination,callbackUrl:url,correlation:call.id,record:call.recording_requested }); }
      catch(error) {
        await tx(uid,async c=>{
          const state=error.code==='PROVIDER_REJECTED'?'failed':'unknown';
          await c.query('UPDATE cc_calls SET state=$3,updated_at=now() WHERE tenant_uid=$1 AND id=$2',[uid,call.id,state]);
          if(state==='failed') await c.query("UPDATE cc_agents SET active_call_id=null,presence='offline',last_call_end=now() WHERE tenant_uid=$1 AND user_id=$2 AND active_call_id=$3",[uid,call.agent_id,call.id]);
          await event(c,uid,call.id,randomUUID(),'provider_submission_failed',String(actor.id),{ code:error.code||'PROVIDER_OUTCOME_UNKNOWN' });
        }); throw error;
      }
      return tx(uid,async c=>{
        const result=await one(c,"UPDATE cc_calls SET provider_sid=$3,state=CASE WHEN state='submitting' THEN 'queued' ELSE state END,updated_at=now() WHERE tenant_uid=$1 AND id=$2 RETURNING *",[uid,call.id,accepted.Sid]);
        await event(c,uid,call.id,`accepted:${accepted.Sid}`,'provider_accepted',String(actor.id));return result;
      });
    },
    async reconcile(uid, sid) {
      const cfg=await config(uid), provider=providerFactory(cfg), remote=await provider.details(sid);
      return tx(uid,async c=>{
        let call=await one(c,'SELECT * FROM cc_calls WHERE tenant_uid=$1 AND provider_sid=$2 FOR UPDATE',[uid,remote.Sid]);
        if(!call && /^[0-9a-f-]{36}$/i.test(remote.CustomField||'')) {
          call=await one(c,'SELECT * FROM cc_calls WHERE tenant_uid=$1 AND id=$2 FOR UPDATE',[uid,remote.CustomField]);
          if(call && !call.provider_sid) await c.query('UPDATE cc_calls SET provider_sid=$3 WHERE tenant_uid=$1 AND id=$2',[uid,call.id,remote.Sid]);
        }
        if(!call&&remote.Direction==='inbound') {
          const digits=value=>String(value||'').replace(/\D/g,'');
          const did=digits(remote.PhoneNumberSid||remote.To);
          if(did.slice(-10)!==digits(cfg.number).slice(-10))throw fail(403,'NUMBER_SCOPE_MISMATCH','Provider call is not for this organization number');
          const raw=String(remote.From||'');
          const caller=raw.startsWith('+')?phone(raw):/^0?\d{10}$/.test(raw)?phone(`+91${raw.slice(-10)}`):null;
          if(!caller)throw fail(400,'INVALID_CALLER','Provider caller number cannot be normalized');
          call=await one(c,`INSERT INTO cc_calls(tenant_uid,id,idempotency_key,request_hash,provider_sid,direction,destination,state)
            VALUES($1,$2,$3,$4,$5,'inbound',$6,'queued') ON CONFLICT(tenant_uid,provider,provider_sid) DO UPDATE SET provider_sid=excluded.provider_sid RETURNING *`,
          [uid,randomUUID(),`inbound:${remote.Sid}`,digest({sid:remote.Sid}),remote.Sid,caller]);
        }
        if(!call) throw fail(404,'CALL_NOT_FOUND','No local call matches the verified provider record');
        const next=stateAfter(call.state,remote.Status);
        const key=`exotel:${remote.Sid}:${digest({status:remote.Status,duration:remote.Duration,updated:remote.DateUpdated})}`;
        const inserted=await event(c,uid,call.id,key,'provider_status',null,{ state:next });
        if(!inserted.rowCount) return { duplicate:true,callId:call.id };
        const duration=remote.Duration==null?null:Number(remote.Duration);
        await c.query(`UPDATE cc_calls SET state=$3,answered_at=CASE WHEN $3='answered' THEN COALESCE(answered_at,now()) ELSE answered_at END,
          ended_at=CASE WHEN $4 THEN COALESCE(ended_at,now()) ELSE ended_at END,
          provider_duration_seconds=COALESCE($5,provider_duration_seconds),updated_at=now() WHERE tenant_uid=$1 AND id=$2`,
        [uid,call.id,next,terminal.has(next),Number.isInteger(duration)&&duration>=0?duration:null]);
        if(terminal.has(next)) {
          await c.query(`UPDATE cc_agents SET active_call_id=null,presence='wrap_up',last_call_end=now(),wrap_until=now()+
            COALESCE((SELECT wrap_seconds FROM cc_queues WHERE tenant_uid=$1 AND id=$4),60)*interval '1 second'
            WHERE tenant_uid=$1 AND user_id=$2 AND active_call_id=$3`,[uid,call.agent_id,call.id,call.queue_id]);
          if(['busy','failed','no-answer'].includes(next)) await c.query('INSERT INTO cc_callbacks(tenant_uid,id,call_id) VALUES($1,$2,$3) ON CONFLICT(tenant_uid,call_id) DO NOTHING',[uid,randomUUID(),call.id]);
          await c.query(`INSERT INTO cc_jobs(tenant_uid,id,kind,call_id) SELECT $1,$2,'summary',$3
            WHERE NOT EXISTS(SELECT 1 FROM cc_jobs WHERE tenant_uid=$1 AND call_id=$3 AND kind='summary')`,[uid,randomUUID(),call.id]);
        }
        return { callId:call.id,state:next };
      });
    },
    async callback(uid, actor, id, input) {
      return tx(uid,async c=>{
        const agent=await one(c,'SELECT role FROM cc_agents WHERE tenant_uid=$1 AND user_id=$2',[uid,String(actor.id)]);
        if(!agent)throw fail(403,'AGENT_NOT_ASSIGNED','Contact-center agent assignment is required');
        const current=await one(c,'SELECT owner_id FROM cc_callbacks WHERE tenant_uid=$1 AND id=$2 FOR UPDATE',[uid,id]);
        if(current?.owner_id&&current.owner_id!==String(actor.id)&&!['supervisor','admin'].includes(agent.role))throw fail(409,'CALLBACK_ALREADY_CLAIMED','This callback belongs to another agent');
        const value=await one(c,`UPDATE cc_callbacks SET owner_id=$3,status=$4,resolution=$5
          WHERE tenant_uid=$1 AND id=$2 RETURNING *`,[uid,id,String(actor.id),input.status,input.resolution?redactPhiText(input.resolution):null]);
        if(!value) throw fail(404,'CALLBACK_NOT_FOUND','Callback not found');
        await event(c,uid,value.call_id,randomUUID(),'callback_updated',String(actor.id),{status:input.status}); return value;
      });
    },
    async suppress(uid,actor,input) {
      return tx(uid,async c=>{
        await c.query('INSERT INTO cc_suppressions(tenant_uid,phone,reason,created_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[uid,phone(input.phone),redactPhiText(input.reason),String(actor.id)]);
        await event(c,uid,null,randomUUID(),'recipient_suppressed',String(actor.id));return {ok:true};
      });
    },
    async callDetail(uid,id) {
      const call=await getCall(uid,id);
      return tx(uid,async c=>({call,events:(await c.query('SELECT * FROM cc_events WHERE tenant_uid=$1 AND call_id=$2 ORDER BY id',[uid,id])).rows,
        transcripts:(await c.query('SELECT * FROM cc_transcripts WHERE tenant_uid=$1 AND call_id=$2 ORDER BY start_ms',[uid,id])).rows,
        artifacts:(await c.query('SELECT * FROM cc_artifacts WHERE tenant_uid=$1 AND call_id=$2',[uid,id])).rows,
        recordings:(await c.query("SELECT id,status,expires_at FROM cc_recordings WHERE tenant_uid=$1 AND call_id=$2 AND status='stored'",[uid,id])).rows}));
    },
    async disposition(uid,actor,id,input) {
      return tx(uid,async c=>{
        const call=await one(c,'SELECT * FROM cc_calls WHERE tenant_uid=$1 AND id=$2 FOR UPDATE',[uid,id]);
        if(!call)throw fail(404,'CALL_NOT_FOUND','Call not found');
        if(call.agent_id!==String(actor.id))throw fail(403,'ASSIGNED_AGENT_REQUIRED','Only the assigned agent can complete wrap-up');
        if(!terminal.has(call.state))throw fail(409,'CALL_ACTIVE','Provider must confirm the call has ended');
        await c.query('UPDATE cc_calls SET disposition=$3 WHERE tenant_uid=$1 AND id=$2',[uid,id,input.disposition]);
        await c.query("UPDATE cc_agents SET presence='available',wrap_until=null,updated_at=now() WHERE tenant_uid=$1 AND user_id=$2 AND active_call_id IS NULL",[uid,String(actor.id)]);
        await event(c,uid,id,randomUUID(),'wrap_up_completed',String(actor.id),{disposition:input.disposition});return {ok:true};
      });
    },
    async ingest(uid, headers, input) {
      const cfg=await config(uid),prefix=cfg.gateway_prefix;
      verifyGateway({ secret:prefix&&env[`${prefix}_EVENT_SECRET`],timestamp:headers.timestamp,nonce:headers.nonce,signature:headers.signature,body:input });
      return tx(uid,async c=>{
        const call=await one(c,'SELECT * FROM cc_calls WHERE tenant_uid=$1 AND id=$2',[uid,input.callId]);
        if(!call)throw fail(404,'CALL_NOT_FOUND','Call not found');
        contentAllowed(call,cfg);
        if(call.consent?.status!=='granted')throw fail(409,'CONSENT_REQUIRED','Transcription requires captured consent');
        const inserted=await event(c,uid,input.callId,`gateway:${headers.nonce}`,'gateway_event',null,{type:input.type});
        if(!inserted.rowCount)throw fail(409,'EVENT_REPLAY','Service event was already processed');
        if(input.type==='transcript') {
          const s=input.segment;
          await c.query(`INSERT INTO cc_transcripts(tenant_uid,call_id,segment_id,speaker,start_ms,end_ms,final,text,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT(tenant_uid,call_id,segment_id) DO UPDATE SET text=excluded.text,final=excluded.final,end_ms=excluded.end_ms,revision=excluded.revision
            WHERE cc_transcripts.revision<excluded.revision AND NOT cc_transcripts.final`,
          [uid,input.callId,s.id,s.speaker,s.startMs,s.endMs,s.final,redactPhiText(s.text),s.revision]);
          if(s.final&&terminal.has(call.state))await c.query(`INSERT INTO cc_jobs(tenant_uid,id,kind,call_id) VALUES($1,$2,'summary',$3)
            ON CONFLICT(tenant_uid,call_id,kind) DO UPDATE SET generation=cc_jobs.generation+1,state=CASE WHEN cc_jobs.state='running' THEN 'running' ELSE 'pending' END,available_at=now(),attempts=0`,[uid,randomUUID(),call.id]);
        }
        return {ok:true};
      });
    },
    async mediaAction(uid,actor,id,input) {
      const call=await getCall(uid,id);const cfg=await config(uid);
      const supervisor=['listen','whisper','barge'].includes(input.action);
      if(supervisor)await privilegedAgent(uid,actor);
      else if(call.agent_id!==String(actor.id))throw fail(403,'ASSIGNED_AGENT_REQUIRED','Assigned agent required');
      if(terminal.has(call.state))throw fail(409,'CALL_ENDED','Call already ended');
      if(input.action==='transfer') {
        const target=input.targetAgentId&&await tx(uid,c=>one(c,"SELECT user_id FROM cc_agents WHERE tenant_uid=$1 AND user_id=$2 AND presence='available' AND active_call_id IS NULL",[uid,input.targetAgentId]));
        if(!target)throw fail(409,'TRANSFER_TARGET_UNAVAILABLE','Transfer target must be an available agent of this organization');
      }
      if(!gateway||!cfg.gateway_prefix)throw fail(503,'MEDIA_GATEWAY_NOT_CONFIGURED','This action needs an authorized media gateway');
      const result=await gateway(cfg,{callId:id,providerSid:call.provider_sid,actorId:String(actor.id),...input});
      await tx(uid,c=>event(c,uid,id,randomUUID(),'media_action',String(actor.id),{action:input.action}));return result;
    },
    async artifact(uid,actor,id,kind) {
      contentAllowed(await getCall(uid,id),await config(uid,false));
      const segments=await tx(uid,async c=>(await c.query('SELECT segment_id,speaker,start_ms,text FROM cc_transcripts WHERE tenant_uid=$1 AND call_id=$2 AND final ORDER BY start_ms',[uid,id])).rows);
      if(!segments.length)throw fail(409,'TRANSCRIPT_REQUIRED','Final transcript segments are required');
      if(!llm)throw fail(503,'AI_UNAVAILABLE','Call intelligence is not configured');
      const terms=[...new Set((segments.slice(-5).map(s=>s.text).join(' ').match(/\p{L}{3,}/gu)||[]).slice(-24))].join(' | ');
      const knowledge=terms?await tx(uid,async c=>(await c.query(`SELECT 'kb-'||id AS id,title,left(body,2000) AS text FROM cc_knowledge WHERE tenant_uid=$1 AND published
        AND to_tsvector('simple',title||' '||body) @@ to_tsquery('simple',$2) ORDER BY updated_at DESC LIMIT 5`,[uid,terms])).rows):[];
      const result=await llm(kind,segments,knowledge);
      return tx(uid,async c=>{
        await c.query(`INSERT INTO cc_artifacts(tenant_uid,call_id,kind,content) VALUES($1,$2,$3,$4)
          ON CONFLICT(tenant_uid,call_id,kind) DO UPDATE SET content=excluded.content,reviewed_by=null,created_at=now()`,[uid,id,kind,JSON.stringify(result)]);
        if(kind==='summary'&&embed)await c.query(`INSERT INTO cc_jobs(tenant_uid,id,kind,call_id) VALUES($1,$2,'index',$3)
          ON CONFLICT(tenant_uid,call_id,kind) DO UPDATE SET state='pending',generation=cc_jobs.generation+1,attempts=0,available_at=now()`,[uid,randomUUID(),id]);
        await event(c,uid,id,randomUUID(),`${kind}_generated`,String(actor.id));return result;
      });
    },
    async search(uid,query) {
      return tx(uid,async c=>(await c.query(`SELECT call_id,speaker,start_ms,text FROM cc_transcripts WHERE tenant_uid=$1 AND final
        AND to_tsvector('simple',text) @@ plainto_tsquery('simple',$2) ORDER BY call_id,start_ms LIMIT 100`,[uid,query])).rows);
    },
    async knowledge(uid) {return tx(uid,async c=>(await c.query('SELECT * FROM cc_knowledge WHERE tenant_uid=$1 AND published ORDER BY title',[uid])).rows);},
    async saveKnowledge(uid,actor,input) {
      return tx(uid,async c=>{
        const id=input.id||randomUUID();
        const row=await one(c,`INSERT INTO cc_knowledge(tenant_uid,id,title,body,published,approved_by) VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(tenant_uid,id) DO UPDATE SET title=$3,body=$4,published=$5,approved_by=$6,updated_at=now() RETURNING *`,[uid,id,redactPhiText(input.title),redactPhiText(input.body),input.published,input.published?String(actor.id):null]);
        await event(c,uid,null,randomUUID(),'knowledge_version_saved',String(actor.id),{id,published:input.published});return row;
      });
    },
    async indexCall(uid,id) {
      if(!embed)throw fail(503,'EMBEDDING_UNAVAILABLE','Call embeddings are not configured');
      const detail=await api.callDetail(uid,id);contentAllowed(detail.call,await config(uid,false));const text=redactPhiText(detail.transcripts.filter(s=>s.final).map(s=>`${s.speaker}: ${s.text}`).join('\n')).slice(0,16000);
      if(!text)throw fail(409,'TRANSCRIPT_REQUIRED','Final transcript required');
      const vector=await embed(text);
      if(!Array.isArray(vector)||vector.length!==768||!vector.every(Number.isFinite)||!vector.some(v=>v!==0))throw fail(502,'INVALID_EMBEDDING','Expected a finite nonzero 768-dimensional embedding');
      await tx(uid,c=>c.query(`INSERT INTO cc_embeddings(tenant_uid,call_id,embedding,model) VALUES($1,$2,$3::vector,$4)
        ON CONFLICT(tenant_uid,call_id) DO UPDATE SET embedding=excluded.embedding,model=excluded.model,updated_at=now()`,[uid,id,JSON.stringify(vector),env.VOICE_EMBEDDING_MODEL||'clinical-bert-768']));return {indexed:true};
    },
    async semanticSearch(uid,query) {
      if(!embed)throw fail(503,'EMBEDDING_UNAVAILABLE','Call embeddings are not configured');
      const vector=await embed(redactPhiText(query));
      if(!Array.isArray(vector)||vector.length!==768||!vector.every(Number.isFinite)||!vector.some(v=>v!==0))throw fail(502,'INVALID_EMBEDDING','Invalid search embedding');
      return tx(uid,async c=>(await c.query(`SELECT e.call_id,1-(e.embedding<=>$2::vector) AS score,a.content->>'summary' AS summary
        FROM cc_embeddings e LEFT JOIN cc_artifacts a ON a.tenant_uid=e.tenant_uid AND a.call_id=e.call_id AND a.kind='summary'
        WHERE e.tenant_uid=$1 AND e.model=$3 ORDER BY e.embedding<=>$2::vector LIMIT 20`,[uid,JSON.stringify(vector),env.VOICE_EMBEDDING_MODEL||'clinical-bert-768'])).rows);
    },
    async storeRecording(uid,actor,id) {
      const call=await getCall(uid,id),cfg=await config(uid);
      contentAllowed(call,cfg);
      if(!terminal.has(call.state)||!call.recording_requested||call.consent?.status!=='granted')throw fail(409,'RECORDING_NOT_PERMITTED','A completed consented recording is required');
      if(!storage)throw fail(503,'RECORDING_STORAGE_UNAVAILABLE','Recording storage is unavailable');
      const existing=await tx(uid,c=>one(c,'SELECT id,status,expires_at FROM cc_recordings WHERE tenant_uid=$1 AND call_id=$2',[uid,id]));
      if(existing){if(existing.status==='stored'&&Date.parse(existing.expires_at)>Date.now())return existing;throw fail(410,'CALL_CONTENT_EXPIRED','Recording is expired or being removed');}
      const remote=await providerFactory(cfg).details(call.provider_sid);
      if(!remote.RecordingUrl)throw fail(409,'RECORDING_PENDING','Provider recording is not available yet');
      const objectKey=`voice/${uid}/${id}.mp3`;
      await storage.importExotel(cfg,remote,objectKey);
      return tx(uid,async c=>{
        const row=await one(c,`INSERT INTO cc_recordings(tenant_uid,id,call_id,object_key,status,expires_at) VALUES($1,$2,$3,$4,'stored',$5::timestamptz+$6*interval '1 day')
          ON CONFLICT(tenant_uid,call_id) DO UPDATE SET status='stored' RETURNING id,status,expires_at`,[uid,randomUUID(),id,objectKey,call.ended_at||call.started_at,cfg.retention_days]);
        await event(c,uid,id,randomUUID(),'recording_imported',String(actor.id));return row;
      });
    },
    async playback(uid,actor,recordingId) {
      const recording=await tx(uid,c=>one(c,"SELECT * FROM cc_recordings WHERE tenant_uid=$1 AND id=$2 AND status='stored' AND expires_at>now()",[uid,recordingId]));
      if(!recording)throw fail(404,'RECORDING_NOT_FOUND','Recording is unavailable');
      if(!storage)throw fail(503,'RECORDING_STORAGE_UNAVAILABLE','Recording storage is unavailable');
      await tx(uid,c=>event(c,uid,recording.call_id,randomUUID(),'recording_playback',String(actor.id)));
      return {url:await storage.playback(recording.object_key),expiresIn:120};
    },
    async expireRecordings(uid,actor) {
      if(!storage)throw fail(503,'RECORDING_STORAGE_UNAVAILABLE','Recording storage is unavailable');
      const rows=await tx(uid,async c=>(await c.query("UPDATE cc_recordings SET status='deleting' WHERE tenant_uid=$1 AND expires_at<=now() AND status!='deleted' RETURNING *",[uid])).rows);
      for(const row of rows){await storage.remove(row.object_key);await tx(uid,async c=>{
        await c.query("UPDATE cc_recordings SET status='deleted' WHERE tenant_uid=$1 AND id=$2",[uid,row.id]);
        await c.query('DELETE FROM cc_transcripts WHERE tenant_uid=$1 AND call_id=$2',[uid,row.call_id]);
        await c.query('DELETE FROM cc_artifacts WHERE tenant_uid=$1 AND call_id=$2',[uid,row.call_id]);
        await c.query('DELETE FROM cc_embeddings WHERE tenant_uid=$1 AND call_id=$2',[uid,row.call_id]);
        await event(c,uid,row.call_id,randomUUID(),'recording_expired',String(actor.id));
      });}return {deleted:rows.length};
    },
    async expireText(uid,actor) {
      const cfg=await config(uid,false)||{retention_days:Number(env.VOICE_MAX_RETENTION_DAYS)||30};
      return tx(uid,async c=>{
        const expired=(await c.query(`SELECT id FROM cc_calls WHERE tenant_uid=$1 AND ended_at<now()-$2*interval '1 day' AND destination!='[REDACTED]' FOR UPDATE`,[uid,cfg.retention_days])).rows;
        for(const row of expired){
          for(const table of ['cc_transcripts','cc_embeddings','cc_artifacts'])await c.query(`DELETE FROM ${table} WHERE tenant_uid=$1 AND call_id=$2`,[uid,row.id]);
          await c.query("UPDATE cc_calls SET destination='[REDACTED]',consent=jsonb_build_object('status',consent->>'status','retention_completed',true) WHERE tenant_uid=$1 AND id=$2",[uid,row.id]);
          await c.query("UPDATE cc_callbacks SET status='resolved',resolution='Contact data retention expired' WHERE tenant_uid=$1 AND call_id=$2",[uid,row.id]);
          await event(c,uid,row.id,randomUUID(),'call_content_expired',String(actor.id));
        }return {expired:expired.length};
      });
    },
    async review(uid,actor,id,kind) {
      return tx(uid,async c=>{
        const row=await one(c,'UPDATE cc_artifacts SET reviewed_by=$4 WHERE tenant_uid=$1 AND call_id=$2 AND kind=$3 RETURNING *',[uid,id,kind,String(actor.id)]);
        if(!row)throw fail(404,'ARTIFACT_NOT_FOUND','Artifact not found');
        await event(c,uid,id,randomUUID(),'artifact_reviewed',String(actor.id),{kind});return row;
      });
    },
    async runJobs(uid) {
      const job=await tx(uid,async c=>one(c,`UPDATE cc_jobs SET state='running',attempts=attempts+1,lease_until=now()+interval '2 minutes'
        WHERE tenant_uid=$1 AND id=(SELECT id FROM cc_jobs WHERE tenant_uid=$1 AND attempts<5 AND available_at<=now()
          AND (state='pending' OR (state='running' AND lease_until<now())) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[uid]));
      if(!job)return {processed:0};
      try {
        if(job.kind==='summary')await api.artifact(uid,{id:'system:contact-center'},job.call_id,'summary');
        else if(job.kind==='index')await api.indexCall(uid,job.call_id);
        else throw fail(400,'UNKNOWN_JOB','Unknown contact-center job');
        await tx(uid,c=>c.query(`UPDATE cc_jobs SET state=CASE WHEN generation=$3 THEN 'done' ELSE 'pending' END,lease_until=null,error_code=null WHERE tenant_uid=$1 AND id=$2`,[uid,job.id,job.generation]));
        return {processed:1};
      } catch(error) {
        await tx(uid,c=>c.query(`UPDATE cc_jobs SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,lease_until=null,available_at=now()+interval '1 minute',error_code=$3 WHERE tenant_uid=$1 AND id=$2`,[uid,job.id,error.code||'JOB_FAILED']));
        return {processed:1,errorCode:error.code||'JOB_FAILED'};
      }
    },
    config,getCall,actorEvent,
  };
  return api;
}
