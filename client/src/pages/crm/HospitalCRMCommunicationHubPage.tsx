import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowUpRight, BarChart3, CheckCircle2, ChevronDown, Clock3,
  Inbox, Loader2, Mail, MessageCircle, Pause, Phone, PhoneCall, Play, Plus, RefreshCw, Search, Send, Settings2,
  ShieldCheck, Smartphone, Sparkles, Users, X, XCircle, Zap,
} from 'lucide-react';
import api from '@/utils/api';
import { useSearchParams } from 'react-router-dom';
import ChannelNavigation, { type CommunicationChannel } from '@/components/communication/ChannelNavigation';
import ChatwootWorkspace from '@/components/communication/ChatwootWorkspace';
import ConversationWorkspace, { useCommunicationWorkspace } from '@/components/communication/ConversationWorkspace';
import { CRMLayout } from './CRMModulePages';

const headers = () => {
  const token = localStorage.getItem('crmToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const panel = 'rounded-2xl bg-white/[0.03] border border-white/[0.06]';
const input = 'h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40';
const button = 'h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-sm flex items-center gap-2 transition-colors';
const primary = 'h-10 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center gap-2 transition-colors';

type HubData = {
  overview?: any;
  channels?: any[];
  campaigns?: any[];
  integrations?: any[];
  conversations?: any[];
  activity?: any[];
  alerts?: any[];
};

const channelIcon = (channel: string) => {
  if (channel === 'email') return Mail;
  if (channel === 'whatsapp') return MessageCircle;
  if (channel === 'sms') return Smartphone;
  return Send;
};

const money = (value: any) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const pct = (value: any) => `${Number(value || 0).toFixed(1)}%`;

export default function HospitalCRMCommunicationHubPage() {
  const [data, setData] = useState<HubData>({});
  const [searchParams] = useSearchParams();
  const requestedChannel = searchParams.get('channel');
  const workspace = useCommunicationWorkspace('/crm/workspace','crm');
  const channel = ['chat', 'email', 'sms', 'whatsapp', 'voice'].includes(requestedChannel || '') ? requestedChannel as CommunicationChannel : undefined;
  const [tab, setTab] = useState('overview');
  useEffect(() => {
    if(channel === 'chat')setTab(workspace.enabled?'chat':'overview');
    else if(!channel&&workspace.enabled)setTab('chat');
    else if (channel === 'voice') setTab('calls');
    else if (channel) setTab('compose');
  }, [channel,workspace.enabled]);
  const [days, setDays] = useState('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: '', channel: 'email', objective: 'patient_engagement', audienceRef: '', templateRef: '', budgetAmount: '' });
  const [templateForm, setTemplateForm] = useState({ name: '', channel: 'email', category: 'appointment', subject: '', body: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    const from = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();
    try {
      const response = await api.get('/crm/communication-hub/dashboard', { headers: headers(), params: { from, to: new Date().toISOString() } });
      setData(response.data?.data || {});
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Communication hub could not be loaded');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [days]);

  const overview = data.overview || {};
  const campaigns = data.campaigns || [];
  const integrations = data.integrations || [];
  const templates = (data as any).templates || [];
  const healthyIntegrations = integrations.filter((item) => ['connected', 'healthy', 'active'].includes(item.status)).length;
  const attentionCount = integrations.filter((item) => ['error', 'degraded'].includes(item.status) || Number(item.open_errors) > 0).length + (data.alerts || []).length;

  const refresh = () => load();

  const updateCampaign = async (id: number, status: string) => {
    await api.patch(`/crm/communication-hub/campaigns/${id}/status`, { status }, { headers: headers() });
    await load();
  };

  const createCampaign = async () => {
    if (!campaignForm.name.trim()) return;
    await api.post('/crm/communication-hub/campaigns', { ...campaignForm, budgetAmount: campaignForm.budgetAmount ? Number(campaignForm.budgetAmount) : undefined }, { headers: headers() });
    setCampaignForm({ name: '', channel: 'email', objective: 'patient_engagement', audienceRef: '', templateRef: '', budgetAmount: '' });
    setShowCampaignForm(false);
    await load();
  };

  const createTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.body.trim()) return;
    await api.post('/crm/communication-hub/templates', templateForm, { headers: headers() });
    setTemplateForm({ name: '', channel: 'email', category: 'appointment', subject: '', body: '' });
    setShowTemplateForm(false);
    await load();
  };

  return <CRMLayout title="Communication Hub">
    <div className="space-y-5">
      <ChannelNavigation active={tab==='chat'?'chat':channel} links={{
        ...(workspace.enabled?{chat:'/crm/hospital/communication-hub?channel=chat'}:{}),
        email: '/crm/hospital/communication-hub?channel=email',
        sms: '/crm/hospital/communication-hub?channel=sms',
        whatsapp: '/crm/hospital/communication-hub?channel=whatsapp',
        voice: '/crm/hospital/communication-hub?channel=voice',
      }} />
      {tab !== 'chat' && <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-violet-400">Brevo-style orchestration</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Communication Hub</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor every patient message, campaign, integration, and delivery signal.</p>
        </div>
        <div className="flex-1" />
        <select aria-label="Reporting period" className={`${input} appearance-none pr-8`} value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
        </select>
        <button className={button} onClick={refresh} title="Refresh monitoring data"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        <button className={primary} onClick={() => { setTab('campaigns'); setShowCampaignForm(true); }}><Plus className="h-4 w-4" /> New campaign</button>
      </header>}

      <div className="text-slate-200"><ChatwootWorkspace endpoint="/crm/communication-hub/chatwoot" token={localStorage.getItem('crmToken')} /></div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="flex gap-1 overflow-x-auto border-b border-white/[0.06]">
        {[
          ...(workspace.enabled?[['chat','Chat',MessageCircle]]:[]),
          ['overview', 'Overview', BarChart3], ['compose', 'Send message', Send], ['calls', 'Calls', PhoneCall],
          ['campaigns', 'Campaigns', Send], ['integrations', 'Integrations', Zap],
          ['inbox', 'Conversation inbox', Inbox], ['templates', 'Templates', Sparkles],
        ].map(([key, label, Icon]: any) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-sm flex items-center gap-2 border-b-2 whitespace-nowrap ${tab === key ? 'text-violet-300 border-violet-400' : 'text-slate-500 border-transparent hover:text-slate-300'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>

      {tab === 'chat' && workspace.enabled && <ConversationWorkspace key={`${workspace.tenantUid}:${workspace.userId}:crm`} endpoint="/crm/workspace" portal="crm" capability={workspace} />}
      {tab === 'overview' && <Overview data={data} overview={overview} healthyIntegrations={healthyIntegrations} attentionCount={attentionCount} />}
      {tab === 'compose' && <ComposeMessage key={channel || 'default'} initialChannel={channel === 'sms' || channel === 'whatsapp' ? channel : 'email'} />}
      {tab === 'calls' && <CallsPanel />}
      {tab === 'campaigns' && <Campaigns campaigns={campaigns} showForm={showCampaignForm} setShowForm={setShowCampaignForm} form={campaignForm} setForm={setCampaignForm} create={createCampaign} update={updateCampaign} />}
      {tab === 'integrations' && <Integrations integrations={integrations} />}
      {tab === 'inbox' && <ConversationInbox data={data} />}
      {tab === 'templates' && <Templates templates={templates} showForm={showTemplateForm} setShowForm={setShowTemplateForm} form={templateForm} setForm={setTemplateForm} create={createTemplate} />}
    </div>
  </CRMLayout>;
}

type CrmRecord = { id: number; name: string; email?: string; phone?: string; company?: string };

function RecipientPicker({ recipientType, setRecipientType, selected, onSelect }: {
  recipientType: 'lead' | 'deal' | 'contact';
  setRecipientType: (type: 'lead' | 'deal' | 'contact') => void;
  selected: CrmRecord | null;
  onSelect: (record: CrmRecord | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CrmRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const endpoint = recipientType === 'lead' ? '/crm/leads' : recipientType === 'deal' ? '/crm/deals' : '/crm/contacts';
        const response = await api.get(endpoint, { headers: headers(), params: { search: query, limit: 8 } });
        const rows = response.data?.data || [];
        setResults(rows.map((row: any): CrmRecord => recipientType === 'deal'
          ? { id: row.id, name: row.contact_name || row.title, email: row.contact_email, phone: row.contact_phone, company: row.company }
          : { id: row.id, name: row.name, email: row.email, phone: row.phone, company: row.company }));
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, recipientType]);

  return <div className="space-y-2">
    <div className="flex gap-2">
      {(['lead', 'deal', 'contact'] as const).map((type) => <button key={type} className={`h-8 px-3 rounded-lg text-xs capitalize ${recipientType === type ? 'bg-violet-600 text-white' : 'bg-white/[0.05] text-slate-400'}`} onClick={() => { setRecipientType(type); onSelect(null); setQuery(''); }}>{type}</button>)}
    </div>
    {selected ? (
      <div className="flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2">
        <div><div className="text-sm text-white">{selected.name || `${recipientType} #${selected.id}`}</div><div className="text-xs text-slate-500">{selected.email || selected.phone || 'No contact info'}</div></div>
        <button className="text-slate-400 hover:text-white" onClick={() => onSelect(null)}><X className="h-4 w-4" /></button>
      </div>
    ) : (
      <div className="relative">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" /><input className={`${input} w-full pl-9`} placeholder={`Search ${recipientType}s by name, email, or phone`} value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} /></div>
        {open && query.trim() && (
          <div className="absolute z-10 mt-1 w-full rounded-xl border border-white/[0.08] bg-[#141422] shadow-xl max-h-64 overflow-y-auto">
            {searching && <div className="px-3 py-3 text-xs text-slate-500 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching…</div>}
            {!searching && results.length === 0 && <div className="px-3 py-3 text-xs text-slate-600">No matches.</div>}
            {!searching && results.map((record) => (
              <button key={record.id} className="w-full text-left px-3 py-2 hover:bg-white/[0.05] text-sm text-slate-200" onClick={() => { onSelect(record); setOpen(false); }}>
                <div>{record.name || `${recipientType} #${record.id}`}</div>
                <div className="text-xs text-slate-500">{record.email || record.phone || 'No contact info'}{record.company ? ` · ${record.company}` : ''}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    )}
  </div>;
}

function ComposeMessage({ initialChannel = 'email' }: { initialChannel?: 'email' | 'whatsapp' | 'sms' }) {
  const [recipientType, setRecipientType] = useState<'lead' | 'deal' | 'contact'>('lead');
  const [selected, setSelected] = useState<CrmRecord | null>(null);
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'sms'>(initialChannel);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<any[]>([]);

  const loadLog = async (leadId?: number, dealId?: number) => {
    try {
      const response = await api.get('/crm/communication-hub/log', { headers: headers(), params: { leadId, dealId, limit: 15 } });
      setLog(response.data?.data || []);
    } catch { setLog([]); }
  };

  useEffect(() => {
    if (selected && recipientType !== 'contact') loadLog(recipientType === 'lead' ? selected.id : undefined, recipientType === 'deal' ? selected.id : undefined);
    else setLog([]);
  }, [selected, recipientType]);

  const send = async () => {
    if (!selected || !message.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const payload: any = { channel, subject, message };
      if (recipientType === 'lead') payload.leadId = selected.id;
      if (recipientType === 'deal') payload.dealId = selected.id;
      if (recipientType === 'contact') payload.contactId = selected.id;
      const response = await api.post('/crm/communication-hub/send', payload, { headers: headers() });
      setResult({ ok: true, text: response.data?.message || `${channel} sent to ${selected.name}.` });
      setMessage('');
      if (recipientType !== 'contact') loadLog(recipientType === 'lead' ? selected.id : undefined, recipientType === 'deal' ? selected.id : undefined);
    } catch (e: any) {
      setResult({ ok: false, text: e?.response?.data?.message || `Failed to send ${channel}.` });
    } finally { setSending(false); }
  };

  return <div className="space-y-5">
    <div><h2 className="text-lg font-semibold text-white">Send a message</h2><p className="text-sm text-slate-500 mt-1">Email, WhatsApp, or SMS to one of your own leads, contacts, or deals. Corporate account messaging stays in the Team portal.</p></div>
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className={`${panel} p-5 space-y-4`}>
        <div><div className="text-xs uppercase tracking-wide text-slate-600 mb-2">Recipient</div><RecipientPicker recipientType={recipientType} setRecipientType={setRecipientType} selected={selected} onSelect={setSelected} /></div>
        <div><div className="text-xs uppercase tracking-wide text-slate-600 mb-2">Channel</div>
          <div className="flex gap-2">
            {([['email', Mail], ['whatsapp', MessageCircle], ['sms', Smartphone]] as const).map(([key, Icon]) => <button key={key} className={`h-9 px-3 rounded-lg text-xs capitalize flex items-center gap-1.5 ${channel === key ? 'bg-violet-600 text-white' : 'bg-white/[0.05] text-slate-400'}`} onClick={() => setChannel(key)}><Icon className="h-3.5 w-3.5" />{key}</button>)}
          </div>
        </div>
        {channel === 'email' && <input className={`${input} w-full`} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />}
        <textarea className="min-h-32 w-full rounded-xl bg-white/[0.05] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40" placeholder="Message" value={message} onChange={(e) => setMessage(e.target.value)} />
        {result && <div className={`rounded-xl px-3 py-2 text-sm ${result.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'}`}>{result.text}</div>}
        <button className={`${primary} w-full justify-center`} disabled={!selected || !message.trim() || sending} onClick={send}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Sending…' : 'Send'}</button>
      </section>
      <section className={`${panel} overflow-hidden`}>
        <SectionHeader icon={Clock3} title="Recent messages" hint={selected ? `History for ${selected.name || 'this record'}` : 'Select a recipient to see their message history'} />
        {log.length ? <div className="divide-y divide-white/[0.05]">{log.map((row: any) => <div key={row.id} className="px-5 py-3"><div className="flex items-center gap-2 text-sm"><span className="text-white capitalize">{row.type}</span><span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass(String(row.outcome || '').startsWith('failed') ? 'failed' : 'sent')}`}>{String(row.outcome || '').startsWith('failed') ? 'failed' : 'sent'}</span></div><p className="text-xs text-slate-500 mt-1 whitespace-pre-line line-clamp-3">{row.description}</p><p className="text-[11px] text-slate-600 mt-1">{row.created_at ? new Date(row.created_at).toLocaleString() : ''}</p></div>)}</div> : <Empty text="No messages sent yet." />}
      </section>
    </div>
  </div>;
}

function CallsPanel() {
  const [recipientType, setRecipientType] = useState<'lead' | 'deal'>('lead');
  const [selected, setSelected] = useState<CrmRecord | null>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logging, setLogging] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get('/crm/communication-hub/calls', { headers: headers(), params: { leadId: recipientType === 'lead' ? selected?.id : undefined, dealId: recipientType === 'deal' ? selected?.id : undefined, limit: 50 } });
      setCalls(response.data?.data || []);
    } catch { setCalls([]); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [selected, recipientType]);

  const logCall = async () => {
    if (!selected || !outcome.trim()) return;
    setLogging(true);
    try {
      const created = await api.post('/crm/activities', {
        type: 'call',
        title: `Call with ${selected.name || `${recipientType} #${selected.id}`}`,
        description: notes,
        lead_id: recipientType === 'lead' ? selected.id : undefined,
        deal_id: recipientType === 'deal' ? selected.id : undefined,
      }, { headers: headers() });
      const activityId = created.data?.data?.id;
      if (activityId) await api.put(`/crm/activities/${activityId}/complete`, { outcome }, { headers: headers() });
      setOutcome(''); setNotes('');
      await load();
    } catch { /* surfaced via unchanged list */ } finally { setLogging(false); }
  };

  return <div className="space-y-5">
    <div><h2 className="text-lg font-semibold text-white">Calls</h2><p className="text-sm text-slate-500 mt-1">Call activity already logged on your leads and deals, surfaced alongside the other channels.</p></div>
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className={`${panel} p-5 space-y-4`}>
        <div><div className="text-xs uppercase tracking-wide text-slate-600 mb-2">Filter by</div><RecipientPicker recipientType={recipientType} setRecipientType={(t) => setRecipientType(t as 'lead' | 'deal')} selected={selected} onSelect={setSelected} /></div>
        {selected && <div className="space-y-2 pt-2 border-t border-white/[0.06]">
          <div className="text-xs uppercase tracking-wide text-slate-600">Log a call</div>
          <select className={`${input} w-full`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">Outcome…</option>
            <option value="connected">Connected</option>
            <option value="no_answer">No answer</option>
            <option value="voicemail">Voicemail</option>
            <option value="follow_up_needed">Follow-up needed</option>
            <option value="not_interested">Not interested</option>
          </select>
          <textarea className="min-h-20 w-full rounded-xl bg-white/[0.05] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40" placeholder="Call notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className={`${primary} w-full justify-center`} disabled={!outcome.trim() || logging} onClick={logCall}>{logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}{logging ? 'Logging…' : 'Log call'}</button>
        </div>}
      </section>
      <section className={`${panel} overflow-hidden`}>
        <SectionHeader icon={PhoneCall} title="Call history" hint={loading ? 'Loading…' : `${calls.length} calls`} />
        {calls.length ? <div className="divide-y divide-white/[0.05]">{calls.map((call: any) => <div key={call.id} className="px-5 py-3"><div className="flex items-center gap-2 text-sm"><span className="text-white">{call.lead_name || call.deal_title || call.title}</span>{call.outcome && <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass(call.outcome)}`}>{call.outcome}</span>}</div>{call.description && <p className="text-xs text-slate-500 mt-1 whitespace-pre-line line-clamp-2">{call.description}</p>}<p className="text-[11px] text-slate-600 mt-1">{(call.completed_at || call.created_at) ? new Date(call.completed_at || call.created_at).toLocaleString() : ''}</p></div>)}</div> : <Empty text="No calls logged yet." />}
      </section>
    </div>
  </div>;
}

function Overview({ data, overview, healthyIntegrations, attentionCount }: { data: HubData; overview: any; healthyIntegrations: number; attentionCount: number }) {
  const metrics = [
    ['Messages sent', Number(overview.sent || 0).toLocaleString(), Send, 'text-violet-300'],
    ['Delivery rate', pct(overview.deliveryRate), CheckCircle2, 'text-emerald-300'],
    ['Open rate', pct(overview.openRate), Mail, 'text-sky-300'],
    ['Click rate', pct(overview.clickRate), ArrowUpRight, 'text-amber-300'],
    ['People reached', Number(overview.reached || 0).toLocaleString(), Users, 'text-fuchsia-300'],
    ['Needs attention', attentionCount, AlertTriangle, attentionCount ? 'text-red-300' : 'text-slate-400'],
  ];
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{metrics.map(([label, value, Icon, color]: any) => <div key={label} className={`${panel} p-4`}><div className="flex items-center justify-between text-xs text-slate-500"><span>{label}</span><Icon className={`h-4 w-4 ${color}`} /></div><div className="mt-3 text-2xl font-semibold text-white">{value}</div><div className="mt-2 text-[11px] text-slate-600">Last selected period</div></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section className={`${panel} overflow-hidden`}><SectionHeader icon={BarChart3} title="Channel performance" hint="Delivery and engagement by channel" /><div className="divide-y divide-white/[0.05]">{(data.channels || []).length ? (data.channels || []).map((channel: any) => { const Icon = channelIcon(channel.channel); return <div key={channel.channel} className="grid grid-cols-[1.4fr_repeat(4,1fr)] gap-3 items-center px-5 py-4 text-sm"><div className="flex items-center gap-3 text-white"><span className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center"><Icon className="h-4 w-4 text-violet-300" /></span><span className="capitalize">{channel.channel}</span></div><Value label="Sent" value={channel.sent} /><Value label="Delivered" value={pct(channel.deliveryRate)} /><Value label="Opened" value={pct(channel.openRate)} /><Value label="Clicked" value={pct(channel.clickRate)} /></div>; }) : <Empty text="No communication events in this period." />}</div></section>
      <section className={`${panel} overflow-hidden`}><SectionHeader icon={ShieldCheck} title="Integration pulse" hint={`${healthyIntegrations}/${(data.integrations || []).length} healthy`} /><div className="divide-y divide-white/[0.05]">{(data.integrations || []).slice(0, 5).map((item: any) => <IntegrationRow key={item.id} item={item} />)}{!(data.integrations || []).length && <Empty text="Connect a channel to start monitoring." />}</div></section>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className={`${panel} overflow-hidden`}><SectionHeader icon={Send} title="Campaign watchlist" hint="Top campaigns by revenue and reach" /><CampaignTable campaigns={(data.campaigns || []).slice(0, 6)} compact /></section>
      <section className={`${panel} overflow-hidden`}><SectionHeader icon={AlertTriangle} title="Attention queue" hint="Integration and delivery issues" /><div className="divide-y divide-white/[0.05]">{(data.alerts || []).length ? (data.alerts || []).map((alert: any) => <div key={alert.id} className="px-5 py-4"><div className="flex items-center gap-2 text-sm text-red-300"><AlertTriangle className="h-4 w-4" />{alert.title}</div><p className="text-xs text-slate-500 mt-1">{alert.alert_type} · {alert.status}</p></div>) : <Empty text="No open hub alerts." />}</div></section>
    </div>
    <section className={`${panel} overflow-hidden`}><SectionHeader icon={Clock3} title="Recent activity" hint="Latest outbound and inbound events" /><ActivityTable rows={(data.activity || []).slice(0, 8)} /></section>
  </div>;
}

function Campaigns({ campaigns, showForm, setShowForm, form, setForm, create, update }: any) {
  return <div className="space-y-5">
    <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Campaign monitoring</h2><p className="text-sm text-slate-500 mt-1">Track delivery, engagement, spend, and patient revenue.</p></div><button className={primary} onClick={() => setShowForm(!showForm)}>{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? 'Close' : 'New campaign'}</button></div>
    {showForm && <section className={`${panel} p-5`}><div className="grid gap-3 md:grid-cols-3"><input className={input} placeholder="Campaign name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><select className={input} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="push">Push</option></select><input className={input} placeholder="Audience reference" value={form.audienceRef} onChange={(e) => setForm({ ...form, audienceRef: e.target.value })} /><input className={input} placeholder="Template reference" value={form.templateRef} onChange={(e) => setForm({ ...form, templateRef: e.target.value })} /><input className={input} type="number" placeholder="Budget (INR)" value={form.budgetAmount} onChange={(e) => setForm({ ...form, budgetAmount: e.target.value })} /><select className={input} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })}><option value="patient_engagement">Patient engagement</option><option value="appointment_reactivation">Appointment reactivation</option><option value="lead_nurture">Lead nurture</option><option value="feedback">Feedback and reviews</option></select></div><div className="mt-4 flex justify-end"><button className={primary} onClick={create}><Plus className="h-4 w-4" />Create draft</button></div></section>}
    <section className={`${panel} overflow-hidden`}><CampaignTable campaigns={campaigns} onStatus={update} /></section>
  </div>;
}

function CampaignTable({ campaigns, compact = false, onStatus }: { campaigns: any[]; compact?: boolean; onStatus?: (id: number, status: string) => void }) {
  if (!campaigns.length) return <Empty text="No campaigns found for this period." />;
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[11px] uppercase tracking-wider text-slate-600 border-b border-white/[0.06]"><tr><th className="p-4 text-left">Campaign</th><th className="text-left">Status</th><th className="text-right">Sent</th><th className="text-right">Delivered</th><th className="text-right">Open</th><th className="text-right">Clicks</th><th className="text-right">Revenue</th>{!compact && <th className="p-4 text-right">Action</th>}</tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id} className="border-b border-white/[0.04] last:border-0"><td className="p-4"><div className="font-medium text-white">{campaign.name}</div><div className="text-xs text-slate-600 capitalize">{campaign.channel} · {campaign.objective || 'engagement'}</div></td><td><span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(campaign.lifecycle_status)}`}>{campaign.lifecycle_status}</span></td><td className="text-right text-slate-300">{campaign.sent || 0}</td><td className="text-right text-slate-400">{campaign.delivered || 0}</td><td className="text-right text-slate-400">{pct(Number(campaign.opened || 0) / Math.max(Number(campaign.delivered || campaign.sent || 0), 1) * 100)}</td><td className="text-right text-slate-400">{campaign.clicked || 0}</td><td className="text-right text-emerald-300">{money(campaign.revenue)}</td>{!compact && <td className="p-4 text-right">{onStatus && <button className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/[0.05] px-2 text-xs text-slate-300" onClick={() => onStatus(campaign.id, campaign.lifecycle_status === 'active' ? 'paused' : 'active')} title={campaign.lifecycle_status === 'active' ? 'Pause campaign' : 'Activate campaign'}>{campaign.lifecycle_status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{campaign.lifecycle_status === 'active' ? 'Pause' : 'Activate'}</button>}</td>}</tr>)}</tbody></table></div>;
}

function Integrations({ integrations }: { integrations: any[] }) {
  return <div className="space-y-5"><div><h2 className="text-lg font-semibold text-white">Integration monitoring</h2><p className="text-sm text-slate-500 mt-1">Watch sync freshness, run failures, and channel readiness.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{integrations.length ? integrations.map((item) => <div key={item.id} className={`${panel} p-5`}><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Zap className="h-5 w-5 text-emerald-300" /></div><div><h3 className="text-white font-medium capitalize">{item.provider}</h3><p className="text-xs text-slate-600">{item.integration_type} · {item.account_ref || 'No account mapped'}</p></div></div><span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(item.status)}`}>{item.status || 'unknown'}</span></div><div className="grid grid-cols-2 gap-3 mt-5"><Value label="Health score" value={item.health_score == null ? '—' : `${item.health_score}/100`} /><Value label="Open errors" value={item.open_errors || 0} /><Value label="Last sync" value={item.last_sync_at ? new Date(item.last_sync_at).toLocaleDateString() : 'Never'} /><Value label="Latest run" value={item.latest_run_status || 'No run'} /></div>{item.health_message && <p className="mt-4 text-xs text-amber-300">{item.health_message}</p>}</div>) : <Empty text="No channel integrations configured yet." />}</div></div>;
}

function ConversationInbox({ data }: { data: HubData }) {
  const [openId, setOpenId] = useState<number | null>(null);
  return <div className="space-y-5"><div><h2 className="text-lg font-semibold text-white">Conversation inbox</h2><p className="text-sm text-slate-500 mt-1">See live patient threads alongside outbound campaign activity.</p></div><section className={`${panel} overflow-hidden`}><SectionHeader icon={Inbox} title="Open conversations" hint={`${(data.conversations || []).length} recent threads`} /><div className="divide-y divide-white/[0.05]">{(data.conversations || []).length ? (data.conversations || []).map((item: any) => <button key={item.id} onClick={() => setOpenId(item.id)} className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/[0.03] transition-colors"><div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center"><MessageCircle className="h-4 w-4 text-violet-300" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm text-white">{item.contact_name}</span><span className="text-[11px] text-slate-600 capitalize">{item.channel}</span></div><p className="text-xs text-slate-500 truncate mt-1">{item.last_message || 'No message preview'}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(item.status)}`}>{item.status}</span></button>) : <Empty text="No conversation threads have been synced." />}</div></section><section className={`${panel} overflow-hidden`}><SectionHeader icon={Clock3} title="Message stream" hint="Inbound, outbound, and system events" /><ActivityTable rows={data.activity || []} /></section>
    {openId != null && <ConversationThreadModal conversationId={openId} onClose={() => setOpenId(null)} />}
  </div>;
}

function ConversationThreadModal({ conversationId, onClose }: { conversationId: number; onClose: () => void }) {
  const [thread, setThread] = useState<{ conversation: any; messages: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/crm/communication-hub/conversations/${conversationId}`, { headers: headers() });
      setThread(response.data?.data || null);
    } catch { setThread(null); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [conversationId]);

  const reply = async () => {
    if (!thread?.conversation?.legacy_lead_id || !message.trim()) return;
    setSending(true);
    setResult(null);
    try {
      await api.post('/crm/communication-hub/send', { channel: thread.conversation.channel, message, leadId: thread.conversation.legacy_lead_id }, { headers: headers() });
      setMessage('');
      await load();
    } catch (e: any) {
      setResult({ ok: false, text: e?.response?.data?.message || 'Failed to send reply.' });
    } finally { setSending(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
    <div className={`${panel} bg-[#141422] w-full max-w-lg max-h-[80vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
        <div>
          <h3 className="text-sm font-semibold text-white">{thread?.conversation?.contact_name || 'Conversation'}</h3>
          <p className="text-xs text-slate-500 mt-1 capitalize">{thread?.conversation?.channel} · {thread?.conversation?.email || thread?.conversation?.phone || ''}</p>
        </div>
        <button className="text-slate-500 hover:text-white" onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {loading ? <div className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</div> :
          (thread?.messages || []).length ? thread!.messages.map((m: any) => (
            <div key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.direction === 'inbound' ? 'bg-white/[0.06] text-slate-200' : 'bg-violet-600/20 text-violet-100 ml-auto'}`}>
              <p className="whitespace-pre-line">{m.body_preview || m.subject || '(no preview)'}</p>
              <p className="text-[11px] text-slate-500 mt-1">{new Date(m.created_at).toLocaleString()} · {m.direction}{m.status === 'failed' ? ' · failed' : ''}</p>
            </div>
          )) : <Empty text="No messages in this thread yet." />}
      </div>
      <div className="p-4 border-t border-white/[0.06] space-y-2">
        {thread?.conversation?.metadata?.provider === 'chatwoot' ? (
          thread.conversation.agentUrl ? <a href={thread.conversation.agentUrl} target="_blank" rel="noopener noreferrer" className={primary}>
            <ArrowUpRight className="h-4 w-4" /> Reply in Chatwoot
          </a> : <p className="text-xs text-slate-500">Agent workspace pending</p>
        ) : <>
        {result && <div className="rounded-lg px-3 py-2 text-xs bg-red-500/10 text-red-300">{result.text}</div>}
        <div className="flex gap-2">
          <input className={`${input} flex-1`} placeholder="Reply…" value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reply()} />
          <button className={primary} title="Send reply" aria-label="Send reply" disabled={sending || !message.trim() || !thread?.conversation?.legacy_lead_id} onClick={reply}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
        </div>
        </>}
      </div>
    </div>
  </div>;
}

function Templates({ templates, showForm, setShowForm, form, setForm, create }: any) {
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Message templates</h2><p className="text-sm text-slate-500 mt-1">Govern approved email, WhatsApp, SMS, push, and in-app content.</p></div><button className={primary} onClick={() => setShowForm(!showForm)}>{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? 'Close' : 'New template'}</button></div>{showForm && <section className={`${panel} p-5`}><div className="grid gap-3 md:grid-cols-3"><input className={input} placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><select className={input} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="push">Push</option><option value="in_app">In-app</option></select><input className={input} placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><input className={`${input} md:col-span-3`} placeholder="Subject (optional)" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /><textarea className="min-h-28 md:col-span-3 rounded-xl bg-white/[0.05] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40" placeholder="Message body. Variables such as {{patient_name}} are supported." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div><div className="mt-4 flex justify-end"><button className={primary} onClick={create}><Plus className="h-4 w-4" />Save draft</button></div></section>}<section className={`${panel} overflow-hidden`}><div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">{templates.length ? templates.map((template: any) => <div key={template.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><div className="flex items-start justify-between"><div><h3 className="text-sm font-medium text-white">{template.name}</h3><p className="text-xs text-slate-600 mt-1 capitalize">{template.channel} · {template.category}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(template.status)}`}>{template.status}</span></div><p className="text-xs text-slate-500 mt-4 line-clamp-3">{template.subject || template.body}</p><p className="text-[11px] text-slate-600 mt-4">Version {template.version}</p></div>) : <Empty text="No templates yet. Create the first governed message draft." />}</div></section></div>;
}

function ActivityTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <Empty text="No activity found for this period." />;
  return <div className="divide-y divide-white/[0.05]">{rows.map((row) => <div key={row.id} className="flex items-center gap-4 px-5 py-3"><div className="h-8 w-8 rounded-lg bg-white/[0.04] flex items-center justify-center"><Send className="h-3.5 w-3.5 text-slate-400" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-sm"><span className="text-white">{row.contact_name}</span><span className="text-[11px] text-slate-600 capitalize">{row.channel} · {row.direction}</span></div><p className="truncate text-xs text-slate-500 mt-1">{row.body_preview || row.message_type || row.campaign_name || 'Communication event'}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(row.status)}`}>{row.status}</span><span className="text-[11px] text-slate-600">{row.created_at ? new Date(row.created_at).toLocaleString() : ''}</span></div>)}</div>;
}

function IntegrationRow({ item }: { item: any }) {
  return <div className="flex items-center gap-3 px-5 py-4"><div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-emerald-300" /></div><div className="min-w-0 flex-1"><div className="text-sm text-white capitalize">{item.provider}</div><div className="text-xs text-slate-600">{item.latest_run_status || item.last_sync_status || 'Awaiting first sync'}</div></div><span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(item.status)}`}>{item.status || 'unknown'}</span></div>;
}

function SectionHeader({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]"><Icon className="h-4 w-4 text-violet-300" /><div><h2 className="text-sm font-semibold text-white">{title}</h2><p className="text-[11px] text-slate-600 mt-0.5">{hint}</p></div></div>;
}

function Value({ label, value }: { label: string; value: ReactNode }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-slate-600">{label}</div><div className="mt-1 text-sm text-slate-200">{value}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-600">{text}</div>;
}

function statusClass(status: string) {
  if (['active', 'connected', 'healthy', 'approved', 'delivered', 'sent', 'completed'].includes(status)) return 'text-emerald-300 bg-emerald-500/10';
  if (['failed', 'error', 'bounced', 'critical'].includes(status)) return 'text-red-300 bg-red-500/10';
  if (['paused', 'degraded', 'pending_approval', 'warning'].includes(status)) return 'text-amber-300 bg-amber-500/10';
  return 'text-slate-400 bg-slate-500/10';
}
