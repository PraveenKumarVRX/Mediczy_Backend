import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowUpRight, BarChart3, CheckCircle2, ChevronDown, Clock3,
  Inbox, Mail, MessageCircle, Pause, Play, Plus, RefreshCw, Send, Settings2,
  ShieldCheck, Smartphone, Sparkles, Users, XCircle, Zap,
} from 'lucide-react';
import api from '@/utils/api';
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
  const [tab, setTab] = useState('overview');
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
      <header className="flex flex-wrap items-center gap-3">
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
      </header>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="flex gap-1 overflow-x-auto border-b border-white/[0.06]">
        {[
          ['overview', 'Overview', BarChart3], ['campaigns', 'Campaigns', Send], ['integrations', 'Integrations', Zap],
          ['inbox', 'Conversation inbox', Inbox], ['templates', 'Templates', Sparkles],
        ].map(([key, label, Icon]: any) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-sm flex items-center gap-2 border-b-2 whitespace-nowrap ${tab === key ? 'text-violet-300 border-violet-400' : 'text-slate-500 border-transparent hover:text-slate-300'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>

      {tab === 'overview' && <Overview data={data} overview={overview} healthyIntegrations={healthyIntegrations} attentionCount={attentionCount} />}
      {tab === 'campaigns' && <Campaigns campaigns={campaigns} showForm={showCampaignForm} setShowForm={setShowCampaignForm} form={campaignForm} setForm={setCampaignForm} create={createCampaign} update={updateCampaign} />}
      {tab === 'integrations' && <Integrations integrations={integrations} />}
      {tab === 'inbox' && <ConversationInbox data={data} />}
      {tab === 'templates' && <Templates templates={templates} showForm={showTemplateForm} setShowForm={setShowTemplateForm} form={templateForm} setForm={setTemplateForm} create={createTemplate} />}
    </div>
  </CRMLayout>;
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
  return <div className="space-y-5"><div><h2 className="text-lg font-semibold text-white">Conversation inbox</h2><p className="text-sm text-slate-500 mt-1">See live patient threads alongside outbound campaign activity.</p></div><section className={`${panel} overflow-hidden`}><SectionHeader icon={Inbox} title="Open conversations" hint={`${(data.conversations || []).length} recent threads`} /><div className="divide-y divide-white/[0.05]">{(data.conversations || []).length ? (data.conversations || []).map((item: any) => <div key={item.id} className="px-5 py-4 flex items-center gap-4"><div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center"><MessageCircle className="h-4 w-4 text-violet-300" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm text-white">{item.contact_name}</span><span className="text-[11px] text-slate-600 capitalize">{item.channel}</span></div><p className="text-xs text-slate-500 truncate mt-1">{item.last_message || 'No message preview'}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(item.status)}`}>{item.status}</span></div>) : <Empty text="No conversation threads have been synced." />}</div></section><section className={`${panel} overflow-hidden`}><SectionHeader icon={Clock3} title="Message stream" hint="Inbound, outbound, and system events" /><ActivityTable rows={data.activity || []} /></section></div>;
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
