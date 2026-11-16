import { useEffect, useRef, useState } from 'react';
import { Hash, Search, Send, Plus, ArrowLeft, Smile, AtSign, RefreshCw, Paperclip, Download, X } from 'lucide-react';
import api from '@/utils/api';
import { communicationRequestOptions, type CommunicationPortal } from './portalSession';

type Room={id:string;name:string;unread:number;last_message?:string};
type Message={id:string;sequence:string;sender_id:number;sender_name?:string;body:string;created_at:string;attachment_id?:string;attachment_name?:string;attachment_bytes?:number};
export type WorkspaceCapability={enabled:boolean;loading?:boolean;tenantUid?:string;userId?:number;canWrite?:boolean;attachments?:boolean};
export function useCommunicationWorkspace(endpoint:string,portal:CommunicationPortal,tenantUid?:string):WorkspaceCapability {
 const token=localStorage.getItem(`${portal}Token`);
 const requestKey=JSON.stringify([endpoint,portal,tenantUid,token]);
 const [state,setState]=useState<WorkspaceCapability&{requestKey?:string}>({enabled:false,loading:true});
 useEffect(()=>{
  const controller=new AbortController();setState({enabled:false,loading:true,requestKey});
  if(portal==='admin'&&!tenantUid){setState({enabled:false,loading:false,requestKey});return()=>controller.abort();}
  api.get(`${endpoint}/capabilities`,communicationRequestOptions(token,{signal:controller.signal,params:{tenantUid}},portal))
   .then(response=>{if(!controller.signal.aborted)setState({...response.data?.data,enabled:Boolean(response.data?.data?.enabled),loading:false,requestKey});})
   .catch(()=>{if(!controller.signal.aborted)setState({enabled:false,loading:false,requestKey});});
  return()=>controller.abort();
 },[endpoint,portal,token,tenantUid]);
 const {requestKey: _requestKey,...capability}=state;
 return state.requestKey===requestKey?capability:{enabled:false,loading:true};
}

/** Shared tenant-scoped chat. Polling is bounded, cancelled on navigation and never duplicates sends. */
export default function ConversationWorkspace({endpoint,portal,capability,tenantUid}:{endpoint:string;portal:CommunicationPortal;capability:WorkspaceCapability;tenantUid?:string}) {
 const token=localStorage.getItem(`${portal}Token`);
 const identity=JSON.stringify([api.defaults?.baseURL||location.origin,capability.tenantUid,portal,capability.userId]);
 const [rooms,setRooms]=useState<Room[]>([]),[selected,setSelected]=useState(''),[messages,setMessages]=useState<Message[]>([]);
 const [query,setQuery]=useState(''),[draft,setDraft]=useState(''),[error,setError]=useState(''),[sending,setSending]=useState(false);
 const [hasMore,setHasMore]=useState(false),[cursor,setCursor]=useState<string|undefined>(),[picker,setPicker]=useState<'emoji'|'mention'|null>(null);
 const [members,setMembers]=useState<{id:number;name:string}[]>([]),[creating,setCreating]=useState(false),[roomName,setRoomName]=useState(''),[invitees,setInvitees]=useState<number[]>([]);
 const [mobileThread,setMobileThread]=useState(false);
 const [attachment,setAttachment]=useState<{id:string;name:string}|null>(null),[uploading,setUploading]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null);
 const requestGeneration=useRef(0),sendingRef=useRef(false),retry=useRef<{room:string;body:string;clientId:string;attachmentId?:string}|null>(null),composer=useRef<HTMLTextAreaElement>(null);
 const currentRoom=rooms.find(room=>room.id===selected);
 const draftKey=(room:string)=>`communication-draft:${identity}:${room}`;
 const pendingKey=(room:string)=>`communication-pending:${identity}:${room}`;
 const attachmentKey=(room:string)=>`communication-attachment:${identity}:${room}`;
 const options=(signal?:AbortSignal)=>communicationRequestOptions(token,{signal,params:{tenantUid}},portal);
 const selectedRef=useRef('');selectedRef.current=selected;
 const writeDraft=(body:string)=>{setDraft(body);try{if(selected)localStorage.setItem(draftKey(selected),body);}catch{setError('Draft could not be saved on this device');}};
 useEffect(()=>{
  requestGeneration.current++;setSelected('');setMessages([]);setRooms([]);setError('');retry.current=null;
  const controller=new AbortController();let active=true,busy=false;
  async function refresh(){if(busy||document.hidden)return;busy=true;try{
   const response=await api.get(`${endpoint}/rooms`,options(controller.signal));
   if(!active)return;const items=response.data?.data||[];setRooms(items);
   setSelected(previous=>items.some((room:Room)=>room.id===previous)?previous:items[0]?.id||'');
  }catch(e:any){if(active)setError(e.response?.data?.message||'Conversations could not be loaded');}finally{busy=false;}}
  refresh();const interval=setInterval(refresh,10000);
  api.get(`${endpoint}/members`,options(controller.signal)).then(response=>{if(active)setMembers(response.data?.data||[]);}).catch(()=>{});
  return()=>{active=false;controller.abort();clearInterval(interval);requestGeneration.current++;};
 },[endpoint,identity,token,tenantUid]);
 useEffect(()=>{
  const generation=++requestGeneration.current;let active=true,busy=false,firstPage=true;const controller=new AbortController();
  setMessages([]);setHasMore(false);setCursor(undefined);setPicker(null);setAttachment(null);
  try{setAttachment(JSON.parse(localStorage.getItem(attachmentKey(selected))||'null'));}catch{}
  try{setDraft(selected?localStorage.getItem(draftKey(selected))||'':'');}catch{setDraft('');}
  async function refresh(){if(!selected||busy||document.hidden)return;busy=true;try{
   const response=await api.get(`${endpoint}/rooms/${selected}/messages`,options(controller.signal));
   if(!active||generation!==requestGeneration.current)return;
   const data=response.data?.data;setMessages(previous=>{
    const merged=new Map(previous.map(message=>[message.id,message]));for(const message of data.messages)merged.set(message.id,message);
    return [...merged.values()].sort((a,b)=>BigInt(a.sequence)<BigInt(b.sequence)?-1:1);
   });if(firstPage){setHasMore(data.hasMore);setCursor(data.nextCursor);firstPage=false;}
   if(data.messages.length){await api.post(`${endpoint}/rooms/${selected}/read`,{sequence:data.messages.at(-1).sequence},options(controller.signal));}
  }catch(e:any){if(active){setError(e.response?.data?.message||'Conversation unavailable');if([401,403,404].includes(e.response?.status))setMessages([]);}}finally{busy=false;}}
  refresh();const interval=setInterval(refresh,5000);return()=>{active=false;controller.abort();clearInterval(interval);};
 },[selected,endpoint,identity,token,tenantUid]);
 const older=async()=>{
  const generation=requestGeneration.current;
  try{const response=await api.get(`${endpoint}/rooms/${selected}/messages`,communicationRequestOptions(token,{params:{tenantUid,before:cursor}},portal));
   if(generation!==requestGeneration.current)return;const data=response.data.data;
   setMessages(previous=>[...data.messages,...previous.filter(message=>!data.messages.some((m:Message)=>m.id===message.id))]);setHasMore(data.hasMore);setCursor(data.nextCursor);
  }catch{setError('Earlier messages could not be loaded');}
 };
 const send=async()=>{
  const body=draft.trim(),room=selected,generation=requestGeneration.current;if(!body||!room||sendingRef.current||uploading||!capability.canWrite)return;
  sendingRef.current=true;setSending(true);setError('');
  let stored: {room:string;body:string;clientId:string;attachmentId?:string}|null=null;
  try{stored=JSON.parse(localStorage.getItem(pendingKey(room))||'null');}catch{}
  const pending=stored?.room===room&&stored.body===body&&stored.attachmentId===attachment?.id?stored:retry.current?.room===room&&retry.current?.body===body&&retry.current?.attachmentId===attachment?.id?retry.current:{room,body,clientId:crypto.randomUUID(),attachmentId:attachment?.id};retry.current=pending;
  try{localStorage.setItem(pendingKey(room),JSON.stringify(pending));}catch{setError('Retry identity cannot be saved on this device');sendingRef.current=false;setSending(false);return;}
  try{const response=await api.post(`${endpoint}/rooms/${room}/messages`,{body,clientId:pending.clientId,attachmentId:pending.attachmentId},options());
   // Clear only the sent draft. A user can switch rooms while the request is in flight.
   localStorage.removeItem(draftKey(room));localStorage.removeItem(pendingKey(room));localStorage.removeItem(attachmentKey(room));retry.current=null;
   if(generation!==requestGeneration.current)return;setDraft('');setAttachment(null);setMessages(previous=>previous.some(m=>m.id===response.data.data.id)?previous:[...previous,response.data.data]);
  }catch(e:any){if(generation===requestGeneration.current)setError(e.response?.data?.message||'Message not confirmed. Retry safely using the same request.');}
  finally{sendingRef.current=false;setSending(false);}
 };
 const uploadFile=async(file?:File)=>{
  if(!file||!selected||!capability.canWrite)return;
  if(file.size>8388608){setError('Choose a file up to 8 MB');return;}
  const room=selected,generation=requestGeneration.current;setUploading(true);setError('');
  try{const form=new FormData();form.append('file',file);
   const response=await api.post(`${endpoint}/rooms/${room}/attachments`,form,communicationRequestOptions(token,{params:{tenantUid},headers:{'Content-Type':'multipart/form-data'}},portal));
   localStorage.setItem(attachmentKey(room),JSON.stringify(response.data.data));
   if(generation!==requestGeneration.current)return;setAttachment(response.data.data);if(!draft.trim())writeDraft(file.name.slice(0,180));
  }catch(e:any){if(generation===requestGeneration.current)setError(e.response?.data?.message||'Attachment upload failed');}finally{setUploading(false);if(fileInput.current)fileInput.current.value='';}
 };
 const download=async(message:Message)=>{
  try{const response=await api.get(`${endpoint}/rooms/${selected}/attachments/${message.attachment_id}`,communicationRequestOptions(token,{params:{tenantUid},responseType:'blob'},portal));
   const url=URL.createObjectURL(response.data),link=document.createElement('a');link.href=url;link.download=message.attachment_name||'attachment';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{setError('Attachment could not be downloaded');}
 };
 const create=async()=>{
  if(sendingRef.current)return;sendingRef.current=true;setSending(true);setError('');
  try{const response=await api.post(`${endpoint}/rooms`,{name:roomName,members:invitees},options());const room=response.data.data;setRooms(previous=>[room,...previous]);setSelected(room.id);setCreating(false);setRoomName('');setInvitees([]);setMobileThread(true);}
  catch(e:any){setError(e.response?.data?.message||'Conversation could not be created');}finally{sendingRef.current=false;setSending(false);}
 };
 const insert=(value:string)=>{const start=composer.current?.selectionStart??draft.length,end=composer.current?.selectionEnd??start;writeDraft(draft.slice(0,start)+value+draft.slice(end));setPicker(null);composer.current?.focus();};
 return <section aria-label="Organisation conversations" className="overflow-hidden rounded-2xl border border-slate-400/20 bg-slate-950 text-slate-100">
  {error&&<div role="alert" className="border-b border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
  <div className="grid h-[min(640px,calc(100dvh-320px))] min-h-[360px] md:grid-cols-[280px_1fr]">
   <aside className={`${mobileThread?'hidden md:flex':'flex'} min-h-0 flex-col border-r border-slate-400/20 p-3`}>
    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Conversations</h2>{capability.canWrite&&<button aria-label="New conversation" className="p-2" onClick={()=>setCreating(!creating)}><Plus className="h-5 w-5"/></button>}</div>
    {creating&&<form className="mb-3 space-y-2" onSubmit={event=>{event.preventDefault();create();}}>
     <input aria-label="Conversation name" maxLength={120} required value={roomName} onChange={event=>setRoomName(event.target.value)} className="w-full rounded bg-slate-800 p-2"/>
     <label className="block text-xs">Participants<select aria-label="Conversation participants" multiple value={invitees.map(String)} onChange={event=>setInvitees([...event.target.selectedOptions].map(option=>Number(option.value)))} className="mt-1 w-full rounded bg-slate-800 p-2">{members.filter(member=>member.id!==capability.userId).map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
     <button disabled={sending} className="rounded bg-teal-700 px-3 py-2">Create conversation</button>
    </form>}
    <div className="mb-3 flex items-center gap-2 rounded bg-slate-800 px-2"><Search className="h-4 w-4"/><input aria-label="Search conversations" placeholder="Search" value={query} onChange={event=>setQuery(event.target.value)} className="min-w-0 bg-transparent py-2 outline-none"/></div>
    <div className="min-h-0 flex-1 overflow-y-auto">{rooms.filter(room=>room.name.toLowerCase().includes(query.toLowerCase())).map(room=><button key={room.id} aria-pressed={selected===room.id} onClick={()=>{setSelected(room.id);setMobileThread(true);setError('');}} className={`mb-1 w-full rounded-xl p-3 text-left ${selected===room.id?'bg-teal-700/40':'hover:bg-slate-800'}`}>
     <div className="flex items-center gap-2"><Hash className="h-4 w-4"/><span className="flex-1 truncate">{room.name}</span>{room.unread>0&&<span aria-label={`${room.unread} unread`} className="rounded-full bg-teal-600 px-2 text-xs">{room.unread}</span>}</div><p className="mt-1 truncate text-xs text-slate-400">{room.last_message||'No messages yet'}</p>
    </button>)}{!rooms.length&&<p className="p-3 text-sm text-slate-400">No conversations yet.</p>}</div>
   </aside>
   <div className={`${!mobileThread?'hidden md:flex':'flex'} min-h-0 min-w-0 flex-col`}>
    <header className="flex items-center gap-2 border-b border-slate-400/20 p-4"><button aria-label="Back to conversations" onClick={()=>setMobileThread(false)} className="p-1 md:hidden"><ArrowLeft className="h-5 w-5"/></button><Hash className="h-5 w-5"/><h3>{currentRoom?.name||'Select a conversation'}</h3></header>
    <div aria-label="Message history" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
     {hasMore&&<button onClick={older} className="text-sm text-teal-300">Load earlier messages</button>}
     {messages.map(message=><article key={message.id} className={`rounded-xl p-3 ${message.sender_id===capability.userId?'bg-teal-800/30':'bg-slate-800/70'}`}><div className="mb-1 flex gap-3 text-xs text-slate-400"><span>{message.sender_name||(message.sender_id===capability.userId?'You':'Team member')}</span><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time></div><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>{message.attachment_id&&<button onClick={()=>download(message)} className="mt-2 inline-flex items-center gap-2 text-sm text-teal-300"><Download className="h-4 w-4"/>{message.attachment_name||'Download attachment'}</button>}</article>)}
     {selected&&!messages.length&&<p className="text-sm text-slate-400">No messages yet. Start the conversation.</p>}
    </div>
    <div className="border-t border-slate-400/20 p-3">
     {picker==='emoji'&&<div aria-label="Emoji picker" className="mb-2 flex gap-2">{['👍','✅','🙏','🙂','📅','❤️'].map(emoji=><button key={emoji} aria-label={`Insert ${emoji}`} onClick={()=>insert(emoji)} className="p-2">{emoji}</button>)}</div>}
     {picker==='mention'&&<div aria-label="Mention picker" className="mb-2 max-h-32 overflow-y-auto">{members.map(member=><button key={member.id} className="block p-2 text-sm" onClick={()=>insert(`@${member.name} `)}>{member.name}</button>)}<p className="text-xs text-slate-400">Mentions insert a name; they do not grant access or send a notification.</p></div>}
     {attachment&&<div className="mb-2 flex items-center gap-2 text-sm"><Paperclip className="h-4 w-4"/>{attachment.name}<button aria-label="Remove attachment" onClick={()=>{setAttachment(null);localStorage.removeItem(attachmentKey(selected));}}><X className="h-4 w-4"/></button></div>}
     <input ref={fileInput} type="file" aria-label="Choose attachment" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt" onChange={event=>uploadFile(event.target.files?.[0])}/>
     <form onSubmit={event=>{event.preventDefault();send();}} className="flex items-end gap-2"><textarea ref={composer} aria-label="Message" placeholder={currentRoom?`Message #${currentRoom.name}`:'Select a conversation'} maxLength={4000} disabled={!selected||!capability.canWrite||sending||uploading} value={draft} onChange={event=>writeDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();send();}}} className="min-h-12 flex-1 resize-y rounded-xl border border-slate-500/30 bg-slate-900 p-3"/>
      <button type="submit" aria-label="Send message" disabled={!selected||!draft.trim()||sending||uploading||!capability.canWrite} className="rounded-xl bg-teal-600 p-3 disabled:opacity-40">{sending?<RefreshCw className="h-5 w-5 animate-spin"/>:<Send className="h-5 w-5"/>}</button></form>
     <div className="mt-2 flex items-center gap-3">{capability.attachments&&<button aria-label="Attach file" disabled={!selected||!capability.canWrite||uploading||sending} onClick={()=>fileInput.current?.click()} className="p-1"><Paperclip className="h-5 w-5"/></button>}{uploading&&<span className="text-xs">Uploading…</span>}<button aria-label="Choose emoji" disabled={!selected||!capability.canWrite} onClick={()=>setPicker(picker==='emoji'?null:'emoji')} className="p-1"><Smile className="h-5 w-5"/></button><button aria-label="Mention member" disabled={!selected||!capability.canWrite} onClick={()=>setPicker(picker==='mention'?null:'mention')} className="p-1"><AtSign className="h-5 w-5"/></button><span className="text-xs text-slate-400">{capability.canWrite?'Enter to send · Shift+Enter for a new line':'Read-only access'}</span></div>
    </div>
   </div>
  </div>
 </section>;
}
