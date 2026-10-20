import { useEffect, useRef, useState } from 'react';
import { configurePrivateExotelLogging } from '@/utils/exotel-privacy';

type Call={Answer:()=>void;Hangup:()=>void;Hold:()=>void;UnHold:()=>void;Mute:()=>void;UnMute:()=>void;sendDTMF:(digit:string)=>void};
type Client={initWebrtc:(account:Record<string,unknown>,registration:(state:string)=>void,calls:(call:Call,state:string)=>void,sessions:(state:string)=>void)=>Promise<boolean>;DoRegister:()=>boolean;UnRegister:()=>void;getCall:()=>Call};

/** Provider SIP credentials stay in this hook's memory, never storage or logs. */
export function useExotelPhone(){
  const [state,setState]=useState('offline'),[error,setError]=useState('');
  const client=useRef<Client|null>(null),active=useRef<Call|null>(null),mounted=useRef(true);
  const connecting=useRef(false),generation=useRef(0);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;client.current?.UnRegister();client.current=null;active.current=null;};},[]);
  async function connect(){
    if(client.current||connecting.current)return;
    connecting.current=true;const current=++generation.current;
    setState('connecting');setError('');
    try{
      const mic=await navigator.mediaDevices.getUserMedia({audio:true});mic.getTracks().forEach(track=>track.stop());
      const response=await fetch('/api/crm/contact-center/browser-session',{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('crmToken')||''}`,'Content-Type':'application/json'},body:'{}'});
      const account=await response.json();if(!response.ok)throw new Error(account.error||'Browser phone is unavailable');
      const [{ExotelWebClient},{getLogger}]=await Promise.all([import('@exotel-npm-dev/webrtc-client-sdk'),import('@exotel-npm-dev/webrtc-core-sdk')]);
      configurePrivateExotelLogging(ExotelWebClient,getLogger());
      const instance=new ExotelWebClient() as Client;
      if(!mounted.current||current!==generation.current)return;
      client.current=instance;
      const ok=await instance.initWebrtc(account,
        registration=>{if(mounted.current)setState(registration);},
        (call,event)=>{active.current=event==='callEnded'?null:call;if(mounted.current)setState(event==='callEnded'?'registered':event);},
        event=>{if(mounted.current&&['websocket_disconnected','media_permission_denied'].includes(event))setError('Phone connection interrupted. Reconnect before another call.');});
      if(!mounted.current||current!==generation.current){instance.UnRegister();return;}
      if(!ok||!instance.DoRegister())throw new Error('Provider rejected browser phone initialization');
    }catch(e){client.current?.UnRegister();client.current=null;if(mounted.current){setState('offline');setError((e as Error).message);}}
    finally{connecting.current=false;}
  }
  function disconnect(){generation.current++;client.current?.UnRegister();client.current=null;active.current=null;setState('offline');}
  function control(action:keyof Call,digit?:string){
    try{const call=active.current;if(!call)throw new Error('No browser call is active');
    if(action==='sendDTMF')call.sendDTMF(digit||'');else (call[action] as ()=>void)();}
    catch(e){setError((e as Error).message);}
  }
  return {state,error,connect,disconnect,control,connected:['registered','incoming','connected','ringing'].includes(state),hasCall:!!active.current};
}
