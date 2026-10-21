import {useEffect,useRef,useState} from 'react';
import {Room,RoomEvent,Track} from 'livekit-client';
type Connection={serverUrl:string;roomName:string;token:string};
export function useContactLiveKit(){
 const rooms=useRef<Room[]>([]),elements=useRef<HTMLElement[]>([]),generation=useRef(0);
 const [connected,setConnected]=useState(false),[error,setError]=useState('');
 const [transcripts,setTranscripts]=useState<{id:string;text:string;speaker:string;final:boolean}[]>([]);
 function disconnect(){generation.current++;for(const r of rooms.current)void r.disconnect();rooms.current=[];for(const e of elements.current)e.remove();elements.current=[];setConnected(false);setTranscripts([]);}
 useEffect(()=>()=>{generation.current++;for(const r of rooms.current)void r.disconnect();for(const e of elements.current)e.remove();},[]);
 async function connect(value:{primary?:Connection|null;coaching?:Connection|null},mode='agent'){
  disconnect();const request=generation.current;setError('');
  try{
   for(const [kind,config] of Object.entries(value).filter(([key])=>['primary','coaching'].includes(key)) as [string,Connection|null][]){
    if(!config)continue;const room=new Room({adaptiveStream:true,dynacast:true});rooms.current.push(room);
    room.on(RoomEvent.TrackSubscribed,track=>{if(track.kind===Track.Kind.Audio){const el=track.attach();el.setAttribute('data-contact-voice',kind);document.body.appendChild(el);elements.current.push(el);}});
    if(kind==='primary')room.on(RoomEvent.TranscriptionReceived,(segments,participant)=>{if(request!==generation.current)return;setTranscripts(old=>{const next=new Map(old.map(s=>[s.id,s]));for(const s of segments){if(!next.get(s.id)?.final)next.set(s.id,{id:s.id,text:s.text,speaker:participant?.identity==='caller'?'Caller':'Hospital team',final:s.final});}return [...next.values()].slice(-100);});});
    room.on(RoomEvent.Disconnected,()=>{if(request===generation.current)setConnected(false);});
    await room.connect(config.serverUrl,config.token);
    if(request!==generation.current){await room.disconnect();return;}
    await room.localParticipant.setMicrophoneEnabled(kind==='primary'?['agent','barge','caller'].includes(mode):mode==='whisper');
   }
   if(request===generation.current)setConnected(true);
  }catch(e){disconnect();setError((e as Error).message);throw e;}
 }
 return {connect,disconnect,connected,error,transcripts};
}
