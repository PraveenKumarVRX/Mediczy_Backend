import { useEffect, useState } from 'react';
import { Bot, Clock3, Loader2, Pause, Pencil, Play, Plus, Search, Trash2, Workflow, X, Zap } from 'lucide-react';
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

const TRIGGERS = [
  { value: 'lead_created', label: 'A new lead is created' },
  { value: 'segment_entered', label: 'A lead enters a segment' },
  { value: 'lifecycle_stage_changed', label: 'A lead reaches a lifecycle stage' },
  { value: 'lead_score_above', label: 'A lead\'s score goes above a threshold' },
  { value: 'source_equals', label: 'A lead comes from a specific source' },
  { value: 'no_activity_days', label: 'A lead has had no activity for N days' },
];
const ACTIONS = [
  { value: 'send_message', label: 'Send a message' },
  { value: 'add_tag', label: 'Add a tag' },
  { value: 'assign_owner', label: 'Assign an owner' },
];

type Automation = {
  id: number; name: string; description: string | null; trigger_type: string; trigger_config: any;
  delay_minutes: number; action_type: string; action_config: any; status: 'draft' | 'published' | 'paused';
};
type Segment = { id: number; name: string; member_count: number };
type AssignableUser = { id: number; email: string; crm_role: string };

function statusClass(status: string) {
  if (status === 'published') return 'text-emerald-300 bg-emerald-500/10';
  if (status === 'paused') return 'text-amber-300 bg-amber-500/10';
  return 'text-slate-400 bg-slate-500/10';
}

const emptyForm = {
  name: '', triggerType: 'lead_created', segmentId: '', toStage: 'contacted', score: '50', source: '', days: '14',
  delayMinutes: '0', actionType: 'send_message', channel: 'email', subject: '', message: '', tag: '', ownerUserId: '',
};

export default function HospitalCRMAutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [executions, setExecutions] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const set = (patch: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...patch }));

  const [runTarget, setRunTarget] = useState<Automation | null>(null);
  const [runQuery, setRunQuery] = useState('');
  const [runResults, setRunResults] = useState<any[]>([]);
  const [runSearching, setRunSearching] = useState(false);
  const [runResult, setRunResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [autoRes, segRes, userRes] = await Promise.all([
        api.get('/crm/automations', { headers: headers() }),
        api.get('/crm/segments', { headers: headers() }),
        api.get('/crm/automations/assignable-users', { headers: headers() }),
      ]);
      setAutomations(autoRes.data?.data || []);
      setSegments(segRes.data?.data || []);
      setUsers(userRes.data?.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load automations');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const buildPayload = () => {
    const triggerConfig =
      form.triggerType === 'segment_entered' ? { segmentId: Number(form.segmentId) } :
      form.triggerType === 'lifecycle_stage_changed' ? { toStage: form.toStage } :
      form.triggerType === 'lead_score_above' ? { score: Number(form.score) } :
      form.triggerType === 'source_equals' ? { source: form.source } :
      form.triggerType === 'no_activity_days' ? { days: Number(form.days) } : {};
    const actionConfig =
      form.actionType === 'send_message' ? { channel: form.channel, subject: form.subject, message: form.message } :
      form.actionType === 'add_tag' ? { tag: form.tag } : { ownerUserId: Number(form.ownerUserId) };
    return { name: form.name, triggerType: form.triggerType, triggerConfig, delayMinutes: Number(form.delayMinutes) || 0, actionType: form.actionType, actionConfig };
  };

  const startCreate = () => { setEditingId(null); setForm(emptyForm); setShowForm(true); };

  const startEdit = (a: Automation) => {
    setEditingId(a.id);
    setForm({
      name: a.name, triggerType: a.trigger_type,
      segmentId: String(a.trigger_config?.segmentId ?? ''), toStage: a.trigger_config?.toStage ?? 'contacted',
      score: String(a.trigger_config?.score ?? '50'), source: a.trigger_config?.source ?? '', days: String(a.trigger_config?.days ?? '14'),
      delayMinutes: String(a.delay_minutes ?? '0'), actionType: a.action_type,
      channel: a.action_config?.channel ?? 'email', subject: a.action_config?.subject ?? '', message: a.action_config?.message ?? '',
      tag: a.action_config?.tag ?? '', ownerUserId: String(a.action_config?.ownerUserId ?? ''),
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      if (editingId) await api.patch(`/crm/automations/${editingId}`, payload, { headers: headers() });
      else await api.post('/crm/automations', payload, { headers: headers() });
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save automation');
    } finally { setSaving(false); }
  };

  const setStatus = async (id: number, status: string) => {
    await api.patch(`/crm/automations/${id}/status`, { status }, { headers: headers() });
    await load();
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this automation?')) return;
    await api.delete(`/crm/automations/${id}`, { headers: headers() });
    if (expanded === id) setExpanded(null);
    await load();
  };

  const toggleExecutions = async (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const response = await api.get(`/crm/automations/${id}/executions`, { headers: headers(), params: { limit: 20 } });
    setExecutions(response.data?.data || []);
  };

  const openRun = (a: Automation) => { setRunTarget(a); setRunQuery(''); setRunResults([]); setRunResult(null); };

  useEffect(() => {
    if (!runTarget || !runQuery.trim()) { setRunResults([]); return; }
    const handle = setTimeout(async () => {
      setRunSearching(true);
      try {
        const response = await api.get('/crm/leads', { headers: headers(), params: { search: runQuery, limit: 8 } });
        setRunResults(response.data?.data || []);
      } catch { setRunResults([]); } finally { setRunSearching(false); }
    }, 300);
    return () => clearTimeout(handle);
  }, [runQuery, runTarget]);

  const runForLead = async (legacyLeadId: number, name: string) => {
    if (!runTarget) return;
    setRunning(true);
    setRunResult(null);
    try {
      await api.post(`/crm/automations/${runTarget.id}/run/${legacyLeadId}`, {}, { headers: headers() });
      setRunResult({ ok: true, text: `Ran successfully for ${name}.` });
      if (expanded === runTarget.id) toggleExecutions(runTarget.id).then(() => toggleExecutions(runTarget.id));
    } catch (e: any) {
      setRunResult({ ok: false, text: e?.response?.data?.message || `Failed to run for ${name}.` });
    } finally { setRunning(false); }
  };

  const segmentName = (id: number) => segments.find((s) => s.id === id)?.name || `#${id}`;
  const userLabel = (id: number) => users.find((u) => u.id === id)?.email || `#${id}`;

  const describeTrigger = (a: Automation) => {
    if (a.trigger_type === 'lead_created') return 'When a new lead is created';
    if (a.trigger_type === 'segment_entered') return `When a lead enters "${segmentName(a.trigger_config?.segmentId)}"`;
    if (a.trigger_type === 'lifecycle_stage_changed') return `When a lead reaches "${a.trigger_config?.toStage}"`;
    if (a.trigger_type === 'lead_score_above') return `When score goes above ${a.trigger_config?.score}`;
    if (a.trigger_type === 'source_equals') return `When source is "${a.trigger_config?.source}"`;
    if (a.trigger_type === 'no_activity_days') return `When inactive for ${a.trigger_config?.days}+ days`;
    return a.trigger_type;
  };
  const describeAction = (a: Automation) => {
    if (a.action_type === 'send_message') return `Send ${a.action_config?.channel}${a.delay_minutes ? ` after ${a.delay_minutes}m` : ''}`;
    if (a.action_type === 'add_tag') return `Tag "${a.action_config?.tag}"`;
    if (a.action_type === 'assign_owner') return `Assign to ${userLabel(a.action_config?.ownerUserId)}`;
    return a.action_type;
  };

  return <CRMLayout title="Automations">
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-violet-400">Rule-based, not a canvas</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Automations</h1>
          <p className="text-sm text-slate-500 mt-1">One trigger, an optional delay, one action. Checked every 5 minutes; never fires twice for the same lead unless you run it manually.</p>
        </div>
        <div className="flex-1" />
        <button className={primary} onClick={() => (showForm ? setShowForm(false) : startCreate())}>{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? 'Close' : 'New automation'}</button>
      </header>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {showForm && <section className={`${panel} p-5 space-y-4`}>
        <input className={`${input} w-full`} placeholder="Automation name" value={form.name} onChange={(e) => set({ name: e.target.value })} />

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-600">Trigger</div>
            <select className={`${input} w-full`} value={form.triggerType} onChange={(e) => set({ triggerType: e.target.value })}>
              {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {form.triggerType === 'segment_entered' && (
              <select className={`${input} w-full`} value={form.segmentId} onChange={(e) => set({ segmentId: e.target.value })}>
                <option value="">Select a segment…</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.member_count})</option>)}
              </select>
            )}
            {form.triggerType === 'lifecycle_stage_changed' && <input className={`${input} w-full`} placeholder="Target stage (e.g. contacted, qualified, won)" value={form.toStage} onChange={(e) => set({ toStage: e.target.value })} />}
            {form.triggerType === 'lead_score_above' && <input className={`${input} w-full`} type="number" placeholder="Score threshold" value={form.score} onChange={(e) => set({ score: e.target.value })} />}
            {form.triggerType === 'source_equals' && <input className={`${input} w-full`} placeholder="Source (e.g. facebook-lead-ads)" value={form.source} onChange={(e) => set({ source: e.target.value })} />}
            {form.triggerType === 'no_activity_days' && <input className={`${input} w-full`} type="number" placeholder="Days of inactivity" value={form.days} onChange={(e) => set({ days: e.target.value })} />}
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-600">Delay before acting (minutes)</div>
            <input className={`${input} w-full`} type="number" min="0" value={form.delayMinutes} onChange={(e) => set({ delayMinutes: e.target.value })} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-600">Action</div>
          <select className={`${input} w-full`} value={form.actionType} onChange={(e) => set({ actionType: e.target.value })}>
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {form.actionType === 'send_message' && <div className="space-y-2">
            <select className={`${input} w-full`} value={form.channel} onChange={(e) => set({ channel: e.target.value })}>
              <option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
            </select>
            {form.channel === 'email' && <input className={`${input} w-full`} placeholder="Subject" value={form.subject} onChange={(e) => set({ subject: e.target.value })} />}
            <textarea className="min-h-24 w-full rounded-xl bg-white/[0.05] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40" placeholder="Message" value={form.message} onChange={(e) => set({ message: e.target.value })} />
          </div>}
          {form.actionType === 'add_tag' && <input className={`${input} w-full`} placeholder="Tag to add" value={form.tag} onChange={(e) => set({ tag: e.target.value })} />}
          {form.actionType === 'assign_owner' && (
            <select className={`${input} w-full`} value={form.ownerUserId} onChange={(e) => set({ ownerUserId: e.target.value })}>
              <option value="">Select an owner…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.email} ({u.crm_role})</option>)}
            </select>
          )}
        </div>

        <button className={primary} disabled={saving || !form.name.trim()} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create as draft'}</button>
      </section>}

      <section className={`${panel} overflow-hidden`}>
        {automations.length ? <div className="divide-y divide-white/[0.05]">
          {automations.map((a) => <div key={a.id}>
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center"><Bot className="h-4 w-4 text-violet-300" /></div>
              <div className="min-w-0 flex-1">
                <button className="text-sm text-white hover:text-violet-300" onClick={() => toggleExecutions(a.id)}>{a.name}</button>
                <p className="text-xs text-slate-500 mt-1">{describeTrigger(a)} → {describeAction(a)}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(a.status)}`}>{a.status}</span>
              <button className={`${button} h-8 px-3`} onClick={() => openRun(a)} title="Run for a specific lead"><Zap className="h-3.5 w-3.5" /> Run</button>
              <button className="h-8 w-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-slate-400 hover:text-white" onClick={() => startEdit(a)} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
              {a.status === 'published' ? (
                <button className={`${button} h-8 px-3`} onClick={() => setStatus(a.id, 'paused')}><Pause className="h-3.5 w-3.5" /> Pause</button>
              ) : (
                <button className={`${button} h-8 px-3`} onClick={() => setStatus(a.id, 'published')}><Play className="h-3.5 w-3.5" /> {a.status === 'paused' ? 'Resume' : 'Publish'}</button>
              )}
              <button className="h-8 w-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-slate-400 hover:text-red-400" onClick={() => remove(a.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {expanded === a.id && <div className="px-5 pb-4">
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                {executions.length ? <table className="w-full text-xs"><tbody>
                  {executions.map((e: any) => <tr key={e.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-3 py-2 text-slate-200">{e.lead_name}</td>
                    <td className="px-3 py-2 text-slate-500">{e.status}</td>
                    <td className="px-3 py-2 text-slate-600">{e.error || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{new Date(e.created_at).toLocaleString()}</td>
                  </tr>)}
                </tbody></table> : <div className="text-xs text-slate-600 px-3 py-3 flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> No executions yet — checked every 5 minutes.</div>}
              </div>
            </div>}
          </div>)}
        </div> : <div className="px-5 py-10 text-center text-sm text-slate-600">{loading ? 'Loading…' : 'No automations yet. Create one, then publish it to start running.'}</div>}
      </section>

      {runTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setRunTarget(null)}>
        <div className={`${panel} bg-[#141422] w-full max-w-md p-5 space-y-4`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Run "{runTarget.name}"</h3>
              <p className="text-xs text-slate-500 mt-1">Runs immediately for one lead, ignoring the trigger and any delay.</p>
            </div>
            <button className="text-slate-500 hover:text-white" onClick={() => setRunTarget(null)}><X className="h-4 w-4" /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
            <input className={`${input} w-full pl-9`} placeholder="Search leads by name, email, or phone" value={runQuery} onChange={(e) => setRunQuery(e.target.value)} />
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {runSearching && <div className="text-xs text-slate-500 flex items-center gap-2 py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching…</div>}
            {!runSearching && runQuery.trim() && runResults.length === 0 && <div className="text-xs text-slate-600 py-2">No matches.</div>}
            {runResults.map((lead: any) => (
              <button key={lead.id} disabled={running} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.05] text-sm text-slate-200 disabled:opacity-50" onClick={() => runForLead(lead.id, lead.name)}>
                <div>{lead.name}</div>
                <div className="text-xs text-slate-500">{lead.email || lead.phone}</div>
              </button>
            ))}
          </div>
          {running && <div className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Running…</div>}
          {runResult && <div className={`rounded-xl px-3 py-2 text-sm ${runResult.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'}`}>{runResult.text}</div>}
        </div>
      </div>}
    </div>
  </CRMLayout>;
}
