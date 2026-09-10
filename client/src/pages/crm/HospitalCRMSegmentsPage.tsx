import { useEffect, useState } from 'react';
import { Filter, Loader2, Mail, MessageCircle, Plus, RefreshCw, Send, Smartphone, Trash2, Users, X } from 'lucide-react';
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

const FIELDS = [
  { value: 'lifecycle_stage', label: 'Lifecycle stage' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'score', label: 'Score' },
  { value: 'source_detail', label: 'Source' },
  { value: 'created_at', label: 'Created' },
];
const OPERATORS = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'contains', label: 'contains' },
  { value: 'since_days', label: 'within last N days' },
];

type Condition = { field: string; op: string; value: string };
type Segment = { id: number; name: string; description: string | null; member_count: number; last_refreshed_at: string | null; is_active: boolean; filter_definition: { conditions: Condition[] } };

export default function HospitalCRMSegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<Condition[]>([{ field: 'lifecycle_stage', op: 'eq', value: 'new' }]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [sendTarget, setSendTarget] = useState<Segment | null>(null);
  const [sendChannel, setSendChannel] = useState<'email' | 'whatsapp' | 'sms'>('email');
  const [sendSubject, setSendSubject] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/crm/segments', { headers: headers() });
      setSegments(response.data?.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load segments');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const addCondition = () => setConditions([...conditions, { field: 'lifecycle_stage', op: 'eq', value: '' }]);
  const updateCondition = (i: number, patch: Partial<Condition>) => setConditions(conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const removeCondition = (i: number) => setConditions(conditions.filter((_, idx) => idx !== i));

  const create = async () => {
    if (!name.trim() || !conditions.length) return;
    setSaving(true);
    try {
      await api.post('/crm/segments', { name, filterDefinition: { conditions } }, { headers: headers() });
      setName('');
      setConditions([{ field: 'lifecycle_stage', op: 'eq', value: 'new' }]);
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not create segment');
    } finally { setSaving(false); }
  };

  const refresh = async (id: number) => {
    setRefreshingId(id);
    try {
      await api.post(`/crm/segments/${id}/refresh`, {}, { headers: headers() });
      await load();
    } finally { setRefreshingId(null); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this segment?')) return;
    await api.delete(`/crm/segments/${id}`, { headers: headers() });
    if (expanded === id) setExpanded(null);
    await load();
  };

  const openSend = (seg: Segment) => {
    setSendTarget(seg);
    setSendChannel('email');
    setSendSubject('');
    setSendMessage('');
    setSendResult(null);
  };

  const sendBlast = async () => {
    if (!sendTarget || !sendMessage.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const response = await api.post(`/crm/segments/${sendTarget.id}/send`, { channel: sendChannel, subject: sendSubject, message: sendMessage }, { headers: headers() });
      setSendResult({ ok: true, text: `Queued for ${response.data?.data?.queued ?? sendTarget.member_count} leads.` });
    } catch (e: any) {
      setSendResult({ ok: false, text: e?.response?.data?.message || 'Could not start send.' });
    } finally { setSending(false); }
  };

  const toggleMembers = async (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setMembersLoading(true);
    try {
      const response = await api.get(`/crm/segments/${id}/members`, { headers: headers(), params: { limit: 25 } });
      setMembers(response.data?.data || []);
    } finally { setMembersLoading(false); }
  };

  return <CRMLayout title="Segments">
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-violet-400">Dynamic audiences</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Segments</h1>
          <p className="text-sm text-slate-500 mt-1">Leads matching a filter, kept current automatically every 15 minutes.</p>
        </div>
        <div className="flex-1" />
        <button className={button} onClick={load}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh list</button>
        <button className={primary} onClick={() => setShowForm(!showForm)}>{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? 'Close' : 'New segment'}</button>
      </header>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {showForm && <section className={`${panel} p-5 space-y-4`}>
        <input className={`${input} w-full`} placeholder="Segment name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-600">Match leads where all of these are true</div>
          {conditions.map((c, i) => (
            <div key={i} className="flex gap-2 items-center flex-wrap">
              <select className={input} value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })}>
                {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select className={input} value={c.op} onChange={(e) => updateCondition(i, { op: e.target.value })}>
                {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input className={`${input} flex-1 min-w-[140px]`} placeholder="value" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} />
              {conditions.length > 1 && <button className="text-slate-500 hover:text-red-400" onClick={() => removeCondition(i)}><X className="h-4 w-4" /></button>}
            </div>
          ))}
          <button className={button} onClick={addCondition}><Plus className="h-3.5 w-3.5" /> Add condition</button>
        </div>
        <button className={primary} disabled={saving || !name.trim()} onClick={create}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}{saving ? 'Creating…' : 'Create segment'}</button>
      </section>}

      <section className={`${panel} overflow-hidden`}>
        {segments.length ? <div className="divide-y divide-white/[0.05]">
          {segments.map((seg) => <div key={seg.id}>
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center"><Users className="h-4 w-4 text-violet-300" /></div>
              <div className="min-w-0 flex-1">
                <button className="text-sm text-white hover:text-violet-300" onClick={() => toggleMembers(seg.id)}>{seg.name}</button>
                <p className="text-xs text-slate-500 mt-1">{(seg.filter_definition?.conditions || []).map((c) => `${c.field} ${c.op} ${c.value}`).join(' · ')}</p>
              </div>
              <span className="text-sm text-slate-300 tabular-nums">{seg.member_count} leads</span>
              <span className="text-[11px] text-slate-600 hidden sm:block">{seg.last_refreshed_at ? `Refreshed ${new Date(seg.last_refreshed_at).toLocaleTimeString()}` : 'Never refreshed'}</span>
              <button className="h-8 w-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-slate-400 hover:text-white" onClick={() => refresh(seg.id)} title="Refresh now">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshingId === seg.id ? 'animate-spin' : ''}`} />
              </button>
              <button className={`${button} h-8 px-3`} disabled={!seg.member_count} onClick={() => openSend(seg)} title="Send to this segment"><Send className="h-3.5 w-3.5" /> Send</button>
              <button className="h-8 w-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-slate-400 hover:text-red-400" onClick={() => remove(seg.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {expanded === seg.id && <div className="px-5 pb-4">
              {membersLoading ? <div className="text-xs text-slate-500 flex items-center gap-2 py-3"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading members…</div> : (
                members.length ? <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    {members.map((m: any) => <tr key={m.lead_id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-3 py-2 text-slate-200">{m.name}</td>
                      <td className="px-3 py-2 text-slate-500">{m.email || m.phone}</td>
                      <td className="px-3 py-2 text-slate-500 capitalize">{m.lifecycle_stage}</td>
                    </tr>)}
                  </tbody></table>
                </div> : <div className="text-xs text-slate-600 py-3">No leads currently match this segment.</div>
              )}
            </div>}
          </div>)}
        </div> : <div className="px-5 py-10 text-center text-sm text-slate-600">{loading ? 'Loading…' : 'No segments yet. Create one to start targeting leads by lifecycle stage, score, or source.'}</div>}
      </section>

      {sendTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setSendTarget(null)}>
        <div className={`${panel} bg-[#141422] w-full max-w-lg p-5 space-y-4`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Send to "{sendTarget.name}"</h3>
              <p className="text-xs text-slate-500 mt-1">{sendTarget.member_count} leads will receive this message.</p>
            </div>
            <button className="text-slate-500 hover:text-white" onClick={() => setSendTarget(null)}><X className="h-4 w-4" /></button>
          </div>
          <div className="flex gap-2">
            {([['email', Mail], ['whatsapp', MessageCircle], ['sms', Smartphone]] as const).map(([key, Icon]) => (
              <button key={key} className={`h-9 px-3 rounded-lg text-xs capitalize flex items-center gap-1.5 ${sendChannel === key ? 'bg-violet-600 text-white' : 'bg-white/[0.05] text-slate-400'}`} onClick={() => setSendChannel(key)}><Icon className="h-3.5 w-3.5" />{key}</button>
            ))}
          </div>
          {sendChannel === 'email' && <input className={`${input} w-full`} placeholder="Subject" value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} />}
          <textarea className="min-h-28 w-full rounded-xl bg-white/[0.05] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40" placeholder="Message" value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} />
          {sendResult && <div className={`rounded-xl px-3 py-2 text-sm ${sendResult.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'}`}>{sendResult.text}</div>}
          <button className={`${primary} w-full justify-center`} disabled={sending || !sendMessage.trim()} onClick={sendBlast}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Queuing…' : `Send to ${sendTarget.member_count} leads`}</button>
        </div>
      </div>}
    </div>
  </CRMLayout>;
}
