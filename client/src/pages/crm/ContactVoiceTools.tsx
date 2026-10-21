import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useContactLiveKit} from '@/hooks/useContactLiveKit';
import crmApi from '@/utils/api';
import {captureVoiceWave} from '@/utils/capture-voice-wave';
import {ensureVoiceMicrophone} from '@/utils/voice-permission';
type Row=Record<string,any>;
type Api=(path:string,method?:string,body?:unknown,key?:string)=>Promise<any>;
const card='rounded-2xl border bg-white p-5 space-y-3';
export function ContactLiveKit({api,data,perform,supervisor,userId,pendingCallback,onCallbackHandled}:{api:Api,data:Row,perform:(fn:()=>Promise<any>)=>Promise<void>,supervisor:boolean,userId:number,pendingCallback?:Row|null,onCallbackHandled?:()=>void}){
 const voice=useContactLiveKit();
 const [id,setId]=useState(''),[pstn,setPstn]=useState(false),[number,setNumber]=useState(''),[bot,setBot]=useState(false),[transcribe,setTranscribe]=useState(false),[evidence,setEvidence]=useState(''),[invite,setInvite]=useState(''),[target,setTarget]=useState(''),[review,setReview]=useState('');
 const [busy,setBusy]=useState(false);const key=useRef<{body:string,key:string}|null>(null);
 const ownAgent=data.agents.find((a:Row)=>String(a.user_id)===String(userId));
 const ownCall=data.calls.find((c:Row)=>c.id===ownAgent?.active_call_id&&c.provider==='livekit');
 const activeId=id||ownCall?.id||'';
 const activeCall=data.calls.find((c:Row)=>c.id===activeId);
 const canControl=Boolean(activeId)&&(!activeCall||String(activeCall.agent_id)===String(userId));
 const available=ownAgent?.presence==='available'&&!ownAgent.active_call_id&&(!ownAgent.wrap_until||Date.parse(ownAgent.wrap_until)<=Date.now());
 const ready=Boolean(data.capabilities?.livekit)&&Boolean(ownAgent)&&available&&!activeId;
 useEffect(()=>{if(pendingCallback){setPstn(true);setNumber(pendingCallback.destination||'');}},[pendingCallback?.id]);
 useEffect(()=>{if(id&&activeCall&&['completed','failed','busy','no-answer','canceled'].includes(activeCall.state)){voice.disconnect();setId('');setInvite('');}},[id,activeCall?.state]);
 const run=(fn:()=>Promise<any>)=>perform(async()=>{setBusy(true);try{return await fn();}finally{setBusy(false);}});
 const join=async(callId:string,mode='agent',preflighted=false)=>{
  setId(callId);setReview('');
  if(mode!=='listen'&&!preflighted)await ensureVoiceMicrophone();
  await voice.connect(await api(`/calls/${callId}/media/join`,'POST',{mode}),mode);
 };
 const reconcile=(callId=activeId)=>run(async()=>{setId(callId);const result=await api(`/calls/${callId}/media/reconcile`,'POST',{});setReview(result.requiresOperatorReview?'This session needs review. You can end it safely without reconnecting audio.':`Session state: ${result.state}`);});
 const action=(name:string,callId=activeId)=>run(async()=>{
  await api(`/calls/${callId}/media/actions`,'POST',{action:name,...(name==='transfer'?{targetAgentId:target}:{})},crypto.randomUUID());
  if(['hangup','transfer','bot_handoff'].includes(name)){voice.disconnect();setId('');setInvite('');}
 });
 return <section className={card}><h2 className="font-semibold">Browser voice workspace</h2><p className="text-sm text-slate-500">Connect a browser caller, or use an approved phone connection.</p>{voice.error&&<p role="alert">{voice.error}</p>}
 {!ownAgent&&<p role="status">Ask your hospital administrator to assign you under Settings → Assign staff before starting calls.</p>}
 {ownAgent&&!available&&!activeId&&<p role="status">Go available in Calls after completing any wrap-up before starting a session.</p>}
 {!data.capabilities?.livekit&&<p role="status">Browser calling is not configured for this hospital.</p>}
 <label className="flex gap-2"><input type="checkbox" checked={pstn} onChange={e=>setPstn(e.target.checked)}/>Call a phone number</label>{pstn&&<Input aria-label="LiveKit phone number" value={number} onChange={e=>setNumber(e.target.value)} placeholder="+91…"/>}
 {pstn&&!data.capabilities?.nativePstn&&<p role="status">An approved phone connection must be configured before telephone calls or callbacks.</p>}
 <label className="flex gap-2"><input type="checkbox" checked={transcribe} onChange={e=>setTranscribe(e.target.checked)}/>Transcribe with consent</label><label className="flex gap-2"><input type="checkbox" checked={bot} onChange={e=>setBot(e.target.checked)}/>Use the hospital reception voice bot</label>{(bot||transcribe)&&<Input aria-label="Voice processing consent" value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Approved voice-processing consent reference"/>}
 {(bot||transcribe)&&!data.capabilities?.voiceProcessing&&<p role="status">Voice processing is not configured for this hospital.</p>}
 {pendingCallback&&<p>Returning claimed callback · {pendingCallback.destination} <Button variant="ghost" onClick={onCallbackHandled}>Clear callback selection</Button></p>}
 <Button disabled={!ready||busy||(pstn&&(!data.capabilities?.nativePstn||!/^\+[1-9]\d{7,14}$/.test(number)))||((bot||transcribe)&&(!data.capabilities?.voiceProcessing||evidence.trim().length<5))||(bot&&!data.capabilities?.voiceBot)} onClick={()=>run(async()=>{
  await ensureVoiceMicrophone();
  const body={transcribe:transcribe||bot,bot,language:'en',...(pstn?{to:number}:{}),...(pendingCallback?{callback_id:pendingCallback.id}:{}),...((bot||transcribe)?{consent:{status:'granted',source:'existing_record',evidence}}:{})};
  const serialized=JSON.stringify(body);if(key.current?.body!==serialized)key.current={body:serialized,key:crypto.randomUUID()};
  const call=await api('/calls/livekit','POST',body,key.current!.key);setId(call.id);key.current=null;onCallbackHandled?.();await join(call.id,'agent',true);
 })}>Start browser voice session</Button>
 {activeId&&<div className="space-y-3 border-t pt-3"><p>Session {voice.connected?'connected':'disconnected'} · {activeId}</p><div className="flex gap-2 flex-wrap">
 {canControl&&['hold','resume','interrupt','bot_handoff','hangup'].map(name=><Button key={name} variant="outline" disabled={busy} onClick={()=>action(name)}>{name.replaceAll('_',' ')}</Button>)}
 <Button variant="outline" disabled={busy} onClick={()=>reconcile()}>Check session status</Button>
 <Button variant="outline" onClick={voice.disconnect}>Disconnect audio</Button>
 {canControl&&<><Button variant="outline" disabled={busy} onClick={()=>run(()=>join(activeId))}>Reconnect audio</Button><Button variant="outline" disabled={busy} onClick={()=>run(async()=>{const value=await api(`/calls/${activeId}/media/invite`,'POST',{});setInvite(`${location.origin}/contact-center/join#${new URLSearchParams({tenant:value.tenantUid,call:value.callId,invite:value.invite})}`);})}>Create caller invitation</Button></>}
 </div>{review&&<p role="status">{review}</p>}{invite&&<Input aria-label="Caller invitation" readOnly value={invite}/>}
 {supervisor&&<div className="flex gap-2"><select aria-label="Transfer agent" value={target} onChange={e=>setTarget(e.target.value)} className="border rounded p-2"><option value="">Choose available agent</option>{data.agents.filter((a:Row)=>a.presence==='available'&&String(a.user_id)!==String(userId)).map((a:Row)=><option key={a.user_id} value={a.user_id}>{a.name}</option>)}</select><Button disabled={!target||busy} onClick={()=>action('transfer')}>Transfer</Button></div>}</div>}
 {Boolean(voice.transcripts?.length)&&<div role="log" aria-label="Live redacted transcript" className="max-h-64 overflow-y-auto border-t pt-3">{voice.transcripts.map(s=><p key={s.id} className="text-sm py-1"><strong>{s.speaker}: </strong>{s.text}{!s.final&&<span className="text-slate-400"> …</span>}</p>)}</div>}
 <h3 className="font-semibold">LiveKit calls</h3>{data.calls.filter((c:Row)=>c.provider==='livekit'&&!['completed','failed','busy','no-answer','canceled'].includes(c.state)).map((c:Row)=><div key={c.id} className="border-t py-2 flex flex-wrap gap-2 items-center"><span>{c.destination} · {c.state}</span>
 {String(c.agent_id)===String(userId)&&<><Button variant="outline" disabled={busy} onClick={()=>run(()=>join(c.id))}>Join as agent</Button><Button variant="outline" disabled={busy} onClick={()=>action('hangup',c.id)}>End session</Button></>}
 <Button variant="outline" disabled={busy} onClick={()=>reconcile(c.id)}>Review session</Button>
 {supervisor&&['listen','whisper','barge'].map(mode=><Button key={mode} variant="outline" disabled={busy} onClick={()=>run(()=>join(c.id,mode))}>{mode}</Button>)}</div>)}</section>;
}
export function VoiceCampaigns({api,perform,userId}:{api:Api,perform:(fn:()=>Promise<any>)=>Promise<void>,userId:number}){
 const [rows,setRows]=useState<Row[]>([]),[name,setName]=useState(''),[ids,setIds]=useState(''),[owner,setOwner]=useState(String(userId)),[bot,setBot]=useState(false);
 const load=()=>api('/voice-campaigns').then(setRows);useEffect(()=>{void perform(load);},[]);
 return <section className={card}><h2 className="font-semibold">Voice campaigns</h2><p className="text-sm text-slate-500">Recipients come from existing CRM identities. Current voice marketing consent and suppression are checked again before each call. Bots require separate transcription consent.</p><Input aria-label="Voice campaign name" placeholder="Campaign name" value={name} onChange={e=>setName(e.target.value)}/><Input aria-label="Campaign owner" value={owner} onChange={e=>setOwner(e.target.value)}/><Input aria-label="CRM recipient IDs" value={ids} onChange={e=>setIds(e.target.value)} placeholder="Existing CRM identity IDs, separated by commas"/><label className="flex gap-2"><input type="checkbox" checked={bot} onChange={e=>setBot(e.target.checked)}/>Reception bot</label><Button onClick={()=>perform(async()=>{await api('/voice-campaigns','POST',{name,owner_id:Number(owner),transport:'livekit',bot,identity_ids:ids.split(',').map(s=>Number(s.trim())).filter(Boolean)});await load();})}>Create draft</Button>{rows.map(row=><article key={row.id} className="border-t py-3"><strong>{row.name}</strong><p className="text-sm">{row.status} · {row.completed}/{row.recipients} complete · {row.unknown} need review</p><p className="text-xs">Journey campaign ID: {row.id}</p><Button variant="outline" onClick={()=>perform(async()=>{await api(`/voice-campaigns/${row.id}`,'PATCH',{status:row.status==='active'?'paused':'active'});await load();})}>{row.status==='active'?'Pause':'Publish and enable calls'}</Button><Button className="ml-2" variant="outline" disabled={row.status!=='active'} onClick={()=>perform(async()=>{await crmApi.post('/crm/growth/journeys',{name:`Voice follow-up: ${row.name}`,journeyType:'nurture',status:'active',steps:[{stepOrder:1,stepType:'message',channel:'voice',delayMinutes:0,title:row.name,config:{campaign_id:row.id}}]},{headers:{Authorization:`Bearer ${localStorage.getItem('crmToken')||''}`}});})}>Create linked journey</Button></article>)}</section>;
}
export function VoiceIdentity({api,perform,configured=false}:{api:Api,perform:(fn:()=>Promise<any>)=>Promise<void>,configured?:boolean}){
 const [identity,setIdentity]=useState(''),[enrollment,setEnrollment]=useState(''),[challenge,setChallenge]=useState<Row|null>(null),[samples,setSamples]=useState<string[]>([]),[capturing,setCapturing]=useState(false),[result,setResult]=useState<Row|null>(null);
 const abort=useRef<AbortController|null>(null);useEffect(()=>()=>abort.current?.abort(),[]);
 return <section className={card}><h2 className="font-semibold">Consented voice identity</h2><p className="text-sm text-slate-500">Use an existing CRM identity with documented biometric consent. Voice similarity is supporting evidence; secondary identity verification remains required.</p><Input aria-label="Voice identity CRM ID" value={identity} onChange={e=>{setIdentity(e.target.value);setChallenge(null);setSamples([]);}} placeholder="CRM identity ID"/><Input aria-label="Voice enrollment ID" value={enrollment} onChange={e=>setEnrollment(e.target.value)} placeholder="Enrollment ID for verification or revocation"/><div className="flex gap-2">{['enroll','verify'].map(purpose=><Button key={purpose} variant="outline" disabled={capturing||!configured} onClick={()=>perform(async()=>{setChallenge({...await api('/biometrics/challenges','POST',{identity_id:Number(identity),purpose}),purpose});setSamples([]);})}>Request {purpose} challenge</Button>)}</div>
 {!configured&&<p role="status">Voice identity is unavailable until the hospital configures its approved model service and encrypted template storage.</p>}
 {challenge&&<><p className="font-semibold">Say these digits clearly: {challenge.phrase}</p><p className="text-sm">{challenge.purpose==='enroll'?`${samples.length} of 3 samples captured`:'Capture one verification sample'}</p><Button disabled={capturing||samples.length>=(challenge.purpose==='enroll'?3:1)} onClick={()=>perform(async()=>{setCapturing(true);abort.current=new AbortController();try{const audio=await captureVoiceWave(abort.current.signal);setSamples(old=>[...old,audio]);}finally{setCapturing(false);}})}>{capturing?'Recording for six seconds…':'Record challenge'}</Button><Button className="ml-2" disabled={capturing||samples.length!==(challenge.purpose==='enroll'?3:1)} onClick={()=>perform(async()=>{const value=challenge.purpose==='enroll'?await api('/biometrics/enrollments','POST',{challenge_id:challenge.id,samples}):await api('/biometrics/verifications','POST',{challenge_id:challenge.id,enrollment_id:enrollment,audio:samples[0]});setResult(value);if(value.id&&challenge.purpose==='enroll')setEnrollment(value.id);setSamples([]);setChallenge(null);})}>Submit {challenge.purpose}</Button></>}
 {result&&<p role="status">{result.verdict||'Enrollment saved'} · Secondary verification required</p>}<Button variant="outline" disabled={!enrollment||capturing} onClick={()=>perform(async()=>{await api(`/biometrics/enrollments/${enrollment}`,'DELETE');setResult({verdict:'Enrollment revoked'});setSamples([]);})}>Revoke enrollment and delete template</Button></section>;
}
