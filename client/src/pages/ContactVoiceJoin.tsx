import {useRef,useState} from 'react';
import {ensureVoiceMicrophone} from '@/utils/voice-permission';
import {useContactLiveKit} from '@/hooks/useContactLiveKit';
import {Button} from '@/components/ui/button';
import {BRAND} from '@/config/brand';
import './crm/contact-center-theme.css';
export default function ContactVoiceJoin(){
 const voice=useContactLiveKit(),[error,setError]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
 const [invitation]=useState(()=>new URLSearchParams(location.hash.slice(1)));
 const grant=useRef<{data:any;expiresAt:number}|null>(null);
 async function join(){setBusy(true);setError('');try{
  await ensureVoiceMicrophone();
  if(!grant.current){
   const tenant=invitation.get('tenant');if(!/^[A-Za-z0-9_-]{4,64}$/.test(tenant||''))throw new Error('Invalid invitation');
   const response=await fetch(`/api/contact-center/hooks/guest/${tenant}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callId:invitation.get('call'),invite:invitation.get('invite'),consent})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Invitation is unavailable');
   grant.current={data,expiresAt:Date.now()+(data.primary?.expiresIn||120)*1000};
  }
  if(grant.current.expiresAt<=Date.now())throw new Error('The connection grant expired. Ask the hospital for a new invitation.');
  await voice.connect(grant.current.data,'caller');history.replaceState(null,'',location.pathname);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}

 return <main className="contact-center-theme min-h-screen flex items-center justify-center p-5"><section className="max-w-lg rounded-2xl bg-card text-card-foreground border border-border p-7 space-y-5"><div className="flex items-center gap-3"><img src={BRAND.logo} alt={`${BRAND.name} logo`} className="h-12 w-12 rounded-xl bg-white object-contain p-1"/><p className="font-semibold text-violet-200">{BRAND.name} · Patient communications</p></div><h1 className="font-bold text-2xl">Connect with the hospital</h1><p>Use your microphone for a secure voice call with the hospital team.</p><label className="flex gap-3 text-sm"><input type="checkbox" disabled={Boolean(grant.current)} checked={consent} onChange={e=>setConsent(e.target.checked)}/>I agree to voice transcription and automated reception assistance if enabled for this call.</label>{(error||voice.error)&&<p role="alert">{error||voice.error}</p>}<Button disabled={busy} onClick={voice.connected?voice.disconnect:join}>{voice.connected?'Leave call':busy?'Connecting…':'Join hospital call'}</Button></section></main>;
}
