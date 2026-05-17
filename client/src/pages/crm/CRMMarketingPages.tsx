import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart3, Mail, Plus, Save, Send, Upload, Users } from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';

const authHeaders = () => {
  const token = localStorage.getItem('crmToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const panel = 'rounded-2xl bg-white/[0.03] border border-white/[0.06]';
const input = 'w-full h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30';

export function CRMCampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  useEffect(() => { api.get('/crm/campaigns/campaigns', { headers: authHeaders() }).then(({ data }) => setCampaigns(data.data || [])); }, []);
  return <CRMLayout title="Campaigns">
    <div className="space-y-5">
      <div className="flex justify-end"><button onClick={() => navigate('/crm/campaigns/new')} className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-medium"><Plus className="inline h-4 w-4 mr-1" />New Campaign</button></div>
      <div className={`${panel} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="border-b border-white/[0.06] text-slate-500"><tr><th className="p-4 text-left">Campaign</th><th className="text-left">Status</th><th className="text-left">Recipients</th><th className="text-left">Sent</th><th className="text-left">Failed</th></tr></thead>
          <tbody>{campaigns.map((c) => <tr key={c.id} onClick={() => navigate(`/crm/campaigns/${c.id}`)} className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer">
            <td className="p-4"><div className="text-white font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.subject}</div></td>
            <td className="text-slate-300">{c.status}</td><td className="text-slate-300">{c.recipient_count}</td><td className="text-emerald-400">{c.sent_count}</td><td className="text-red-400">{c.failed_count}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </CRMLayout>;
}

export function CRMCampaignBuilderPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [lists, setLists] = useState<any[]>([]);
  const [senders, setSenders] = useState<any[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', subject: '', preheader: '', sender_id: '', html_content: '', text_content: '', list_ids: [] });
  const isEdit = Boolean(id);
  useEffect(() => {
    Promise.all([api.get('/crm/campaigns/lists', { headers: authHeaders() }), api.get('/crm/campaigns/senders', { headers: authHeaders() })]).then(([l, s]) => { setLists(l.data.data || []); setSenders(s.data.data || []); });
    if (id) {
      api.get(`/crm/campaigns/campaigns/${id}`, { headers: authHeaders() }).then(({ data }) => setForm(data.data));
      api.get(`/crm/campaigns/campaigns/${id}/summary`, { headers: authHeaders() }).then(({ data }) => setSummary(data.data));
      api.get(`/crm/campaigns/campaigns/${id}/events`, { headers: authHeaders() }).then(({ data }) => setEvents(data.data || []));
    }
  }, [id]);
  const save = async () => {
    if (isEdit) await api.put(`/crm/campaigns/campaigns/${id}`, form, { headers: authHeaders() });
    else {
      const { data } = await api.post('/crm/campaigns/campaigns', form, { headers: authHeaders() });
      navigate(`/crm/campaigns/${data.data.id}`);
    }
  };
  const preview = async () => {
    const { data } = await api.post(`/crm/campaigns/campaigns/${id}/audience-preview`, {}, { headers: authHeaders() });
    setSummary((prev: any) => ({ ...(prev || {}), total: data.data.recipient_count }));
  };
  const schedule = async () => { if (!scheduledAt) return; await api.post(`/crm/campaigns/campaigns/${id}/schedule`, { scheduled_at: scheduledAt }, { headers: authHeaders() }); navigate("/crm/campaigns"); };
  const sendNow = async () => { await api.post(`/crm/campaigns/campaigns/${id}/send-now`, {}, { headers: authHeaders() }); navigate("/crm/campaigns"); };
  return <CRMLayout title={isEdit ? 'Edit Campaign' : 'New Campaign'}>
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className={`${panel} p-5 space-y-4`}>
        <input className={input} placeholder="Campaign name" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={input} placeholder="Subject" value={form.subject || ''} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        <input className={input} placeholder="Preheader" value={form.preheader || ''} onChange={(e) => setForm({ ...form, preheader: e.target.value })} />
        <select className={input} value={form.sender_id || ''} onChange={(e) => setForm({ ...form, sender_id: e.target.value })}>
          <option value="" className="bg-[#0d1120]">Select sender</option>{senders.map((s) => <option key={s.id} value={s.id} className="bg-[#0d1120]">{s.name} &lt;{s.email}&gt;</option>)}
        </select>
        <div className="grid gap-2">{lists.map((l) => <label key={l.id} className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={(form.list_ids || []).includes(l.id)} onChange={(e) => setForm({ ...form, list_ids: e.target.checked ? [...(form.list_ids || []), l.id] : (form.list_ids || []).filter((x: number) => x !== l.id) })} />
          {l.name} <span className="text-slate-600">({l.member_count})</span>
        </label>)}</div>
        <textarea className={`${input} h-48 py-3`} placeholder="HTML content" value={form.html_content || ''} onChange={(e) => setForm({ ...form, html_content: e.target.value })} />
        <textarea className={`${input} h-28 py-3`} placeholder="Plain-text fallback" value={form.text_content || ''} onChange={(e) => setForm({ ...form, text_content: e.target.value })} />
        <div className="flex flex-wrap gap-2"><button onClick={save} className="h-10 px-4 rounded-xl bg-violet-600 text-white"><Save className="inline h-4 w-4 mr-1" />Save</button>{isEdit && <button onClick={preview} className="h-10 px-4 rounded-xl bg-white/[0.06] text-slate-200">Preview Audience</button>}{isEdit && <input type="datetime-local" className={input} style={{ width: 220 }} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />}{isEdit && <button onClick={schedule} className="h-10 px-4 rounded-xl bg-white/[0.06] text-slate-200">Schedule</button>}{isEdit && <button onClick={sendNow} className="h-10 px-4 rounded-xl bg-emerald-600 text-white"><Send className="inline h-4 w-4 mr-1" />Send Now</button>}</div>
      </div>
      <div className={`${panel} p-5 space-y-4`}>
        <h3 className="text-white font-semibold">Campaign Summary</h3>
        <div className="space-y-2 pt-2">{events.map((e) => <div key={e.event_type} className="flex justify-between text-sm"><span className="text-slate-500">{e.event_type}</span><span className="text-slate-200">{e.count}</span></div>)}</div>
        <Stat label="Recipients" value={summary?.total ?? form.recipient_count ?? 0} icon={Users} />
        <Stat label="Sent" value={summary?.sent ?? 0} icon={Send} />
        <Stat label="Opened" value={summary?.opened ?? 0} icon={Mail} />
        <Stat label="Clicked" value={summary?.clicked ?? 0} icon={BarChart3} />
      </div>
    </div>
  </CRMLayout>;
}
function Stat({ label, value, icon: Icon }: any) { return <div className="rounded-xl bg-white/[0.04] p-4"><div className="flex items-center justify-between text-slate-500 text-sm"><span>{label}</span><Icon className="h-4 w-4" /></div><div className="mt-2 text-2xl font-semibold text-white">{value}</div></div>; }

export function CRMListsPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<any[]>([]);
  const [name, setName] = useState('');
  const fetchLists = () => api.get('/crm/campaigns/lists', { headers: authHeaders() }).then(({ data }) => setLists(data.data || []));
  useEffect(() => { fetchLists(); }, []);
  const create = async () => { await api.post('/crm/campaigns/lists', { name }, { headers: authHeaders() }); setName(''); fetchLists(); };
  return <CRMLayout title="Marketing Lists"><div className="space-y-5"><div className={`${panel} p-4 flex gap-2`}><input className={input} placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} /><button onClick={create} className="px-4 rounded-xl bg-violet-600 text-white">Create</button></div><div className={`${panel} overflow-hidden`}><table className="w-full text-sm"><tbody>{lists.map((l) => <tr key={l.id} onClick={() => navigate(`/crm/lists/${l.id}`)} className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer"><td className="p-4 text-white">{l.name}</td><td className="text-slate-400">{l.member_count} members</td></tr>)}</tbody></table></div></div></CRMLayout>;
}
export function CRMListDetailPage() {
  const { id } = useParams();
  const [list, setList] = useState<any>(null);
  const refresh = () => api.get(`/crm/campaigns/lists/${id}`, { headers: authHeaders() }).then(({ data }) => setList(data.data));
  useEffect(() => { refresh(); }, [id]);
  const upload = async (file?: File) => { if (!file) return; const fd = new FormData(); fd.append('file', file); await api.post(`/crm/campaigns/lists/${id}/import`, fd, { headers: authHeaders() }); refresh(); };
  return <CRMLayout title={list?.name || 'List'}><div className="space-y-5"><label className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-violet-600 text-white cursor-pointer"><Upload className="h-4 w-4" />Import CSV/XLSX<input hidden type="file" accept=".csv,.xlsx,.xls" onChange={(e) => upload(e.target.files?.[0])} /></label>{(list?.imports || []).length > 0 && <div className={`${panel} p-4 space-y-2`}>{list.imports.map((i: any) => <div key={i.id} className="flex justify-between text-sm"><span className="text-slate-300">{i.filename}</span><span className="text-slate-500">{i.valid_rows} valid / {i.invalid_rows} invalid / {i.duplicate_rows} duplicate</span></div>)}</div>}<div className={`${panel} overflow-hidden`}><table className="w-full text-sm"><thead className="text-slate-500"><tr><th className="p-4 text-left">Email</th><th className="text-left">Company</th><th className="text-left">City</th><th className="text-left">State</th></tr></thead><tbody>{(list?.members || []).map((m: any) => <tr key={m.id} className="border-b border-white/[0.04]"><td className="p-4 text-white">{m.email}</td><td className="text-slate-400">{m.company || '-'}</td><td className="text-slate-400">{m.city || '-'}</td><td className="text-slate-400">{m.state || '-'}</td></tr>)}</tbody></table></div></div></CRMLayout>;
}
export function CRMTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ name: '', subject: '', html_content: '', text_content: '' });
  const fetchTemplates = () => api.get('/crm/campaigns/templates', { headers: authHeaders() }).then(({ data }) => setTemplates(data.data || []));
  useEffect(() => { fetchTemplates(); }, []);
  const save = async () => { await api.post('/crm/campaigns/templates', form, { headers: authHeaders() }); setForm({ name: '', subject: '', html_content: '', text_content: '' }); fetchTemplates(); };
  return <CRMLayout title="Templates"><div className="grid gap-5 xl:grid-cols-[380px_1fr]"><div className={`${panel} p-4 space-y-3`}><input className={input} placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input className={input} placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /><textarea className={`${input} h-40 py-3`} placeholder="HTML" value={form.html_content} onChange={(e) => setForm({ ...form, html_content: e.target.value })} /><textarea className={`${input} h-28 py-3`} placeholder="Text" value={form.text_content} onChange={(e) => setForm({ ...form, text_content: e.target.value })} /><button onClick={save} className="h-10 px-4 rounded-xl bg-violet-600 text-white">Save Template</button></div><div className="space-y-3">{templates.map((t) => <div key={t.id} className={`${panel} p-4`}><div className="text-white font-medium">{t.name}</div><div className="text-sm text-slate-500">{t.subject}</div></div>)}</div></div></CRMLayout>;
}
export function CRMSendersPage() {
  const [senders, setSenders] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ name: '', email: '', reply_to: '', is_default: false });
  const fetchSenders = () => api.get('/crm/campaigns/senders', { headers: authHeaders() }).then(({ data }) => setSenders(data.data || []));
  useEffect(() => { fetchSenders(); }, []);
  const save = async () => { await api.post('/crm/campaigns/senders', form, { headers: authHeaders() }); setForm({ name: '', email: '', reply_to: '', is_default: false }); fetchSenders(); };
  return <CRMLayout title="Senders"><div className="grid gap-5 xl:grid-cols-[380px_1fr]"><div className={`${panel} p-4 space-y-3`}><input className={input} placeholder="Sender name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input className={input} placeholder="Sender email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><input className={input} placeholder="Reply-to" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} /><label className="flex items-center gap-2 text-slate-300 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />Default sender</label><button onClick={save} className="h-10 px-4 rounded-xl bg-violet-600 text-white">Add Sender</button></div><div className="space-y-3">{senders.map((s) => <div key={s.id} className={`${panel} p-4 flex items-center justify-between`}><div><div className="text-white font-medium">{s.name}</div><div className="text-sm text-slate-500">{s.email}</div></div>{s.is_default && <span className="text-xs text-emerald-400">Default</span>}</div>)}</div></div></CRMLayout>;
}
