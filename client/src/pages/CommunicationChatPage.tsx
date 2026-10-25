import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminChatDashboard from './admin/AdminChatDashboard';
import AdminLayout from '@/components/layout/AdminLayout';
import MainLayout from '@/components/layout/MainLayout';
import ChatwootWorkspace from '@/components/communication/ChatwootWorkspace';
import ChannelNavigation from '@/components/communication/ChannelNavigation';
import ConversationWorkspace, { useCommunicationWorkspace } from '@/components/communication/ConversationWorkspace';

export default function CommunicationChatPage({portal='admin'}:{portal?:'admin'|'team'}) {
 const [params,setParams]=useSearchParams();const tenantUid=portal==='admin'?params.get('tenantUid')||undefined:undefined;
 const [selection,setSelection]=useState(tenantUid||'');
 const endpoint=`/${portal}/communication-workspace`;
 const capability=useCommunicationWorkspace(endpoint,portal,tenantUid);
 const Layout=portal==='admin'?AdminLayout:MainLayout;
 if(capability.loading)return <Layout><p role="status">Loading communication workspace…</p></Layout>;
 if(!capability.enabled||params.get('legacy')==='1')return <>
  {portal==='admin'&&<form aria-label="Select communication organisation" className="fixed bottom-3 right-3 z-50 flex gap-2 rounded-xl border bg-slate-900 p-3 text-white shadow-xl" onSubmit={event=>{event.preventDefault();setParams({tenantUid:selection.trim()});}}><input aria-label="Organisation UID" placeholder="Organisation UID" value={selection} onChange={event=>setSelection(event.target.value)} className="w-40 rounded bg-slate-800 p-2"/><button className="rounded bg-teal-700 px-3">Open organisation</button></form>}
  <AdminChatDashboard portal={portal}/>
 </>;
 return <Layout>
  <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Communication</h1><Link className="text-sm underline" to={portal==='admin'?`/admin/chat?tenantUid=${encodeURIComponent(tenantUid||'')}&legacy=1`:'/team/chat?legacy=1'}>Previous chat tools</Link></header>
  <ChannelNavigation active="chat" links={portal==='admin'?{chat:`/admin/chat?tenantUid=${encodeURIComponent(tenantUid||'')}`,email:'/admin/email',sms:'/admin/sms',whatsapp:'/admin/whatsapp',video:'/admin/video',voice:'/admin/voice'}:{chat:'/team/chat',email:'/team/email-inbox',whatsapp:'/team/whatsapp-inbox'}}/>
  <ChatwootWorkspace endpoint={`${endpoint}/chatwoot`} portal={portal} tenantUid={tenantUid} token={localStorage.getItem(`${portal}Token`)}/>
  <ConversationWorkspace key={`${capability.tenantUid}:${capability.userId}:${portal}`} endpoint={endpoint} portal={portal} tenantUid={tenantUid} capability={capability}/>
 </Layout>;
}
