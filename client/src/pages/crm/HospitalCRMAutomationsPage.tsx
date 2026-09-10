import { useEffect, useState } from 'react';
import { Bot, Clock3, Loader2, Pause, Play, Plus, Trash2, Workflow, X } from 'lucide-react';
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

function statusClass(status: string) {
  if (status === 'published') return 'text-emerald-300 bg-emerald-500/10';
  if (status === 'paused') return 'text-amber-300 bg-amber-500/10';
  return 'text-slate-400 bg-slate-500/10';
}

export default function HospitalCRMAutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [executions, setExecutions] = useState<any[]>([]);

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('lead_created');
  const [segmentId, setSegmentId] = useState('');
  const [toStage, setToStage] = useState('contacted');
  const [delayMinutes, setDelayMinutes] = useState('0');
  const [actionType, setActionType] = useState('send_message');
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [tag, setTag] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/crm/automations', { headers: headers() });
      setAutomations(response.data?.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load automations');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const triggerConfig = triggerType === 'segment_entered' ? { segmentId: Number(segmentId) } : triggerType === 'lifecycle_stage_changed' ? { toStage } : {};
      const actionConfig = actionType === 'send_message' ? { channel, subject, message } : actionType === 'add_tag' ? { tag } : { ownerUserId: Number(ownerUserId) };
      await api.post('/crm/automations', { name, triggerType, triggerConfig, delayMinutes: Number(delayMinutes) || 0, actionType, actionConfig }, { headers: headers() });
      setName(''); setSegmentId(''); setSubject(''); setMessage(''); setTag(''); setOwnerUserId(''); setDelayMinutes('0');
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not create automation');
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

  const describeTrigger = (a: Automation) => {
    if (a.trigger_type === 'lead_created') return 'When a new lead is created';
    if (a.trigger_type === 'segment_entered') return `When a lead enters segment #${a.trigger_config?.segmentId}`;
    if (a.trigger_type === 'lifecycle_stage_changed') return `When a lead reaches "${a.trigger_config?.toStage}"`;
    return a.trigger_type;
  };
  const describeAction = (a: Automation) => {
    if (a.action_type === 'send_message') return `Send ${a.action_config?.channel}${a.delay_minutes ? ` after ${a.delay_minutes}m` : ''}`;
    if (a.action_type === 'add_tag') return `Tag "${a.action_config?.tag}"`;
    if (a.action_type === 'assign_owner') return `Assign to user #${a.action_config?.ownerUserId}`;
    return a.action_type;
  };

  return <CRMLayout title="Automations">
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-violet-400">Rule-based, not a canvas</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Automations</h1>
          <p className="text-sm text-slate-500 mt-1">One trigger, an optional delay, one action. Checked every 5 minutes; never fires twice for the same lead.</p>
        </div>
        <div className="flex-1" />
        <button className={primary} onClick={() => setShowForm(!showForm)}>{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? 'Close' : 'New automation'}</button>
      </header>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {showForm && <section className={`${panel} p-5 space-y-4`}>
        <input className={`${input} w-full`} placeholder="Automation name" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-600">Trigger</div>
            <select className={`${input} w-full`} value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
              {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {triggerType === 'segment_entered' && <input className={`${input} w-full`} placeholder="Segment ID" value={segmentId} onChange={(e) => setSegmentId(e.target.value)} />}
            {triggerType === 'lifecycle_stage_changed' && <input className={`${input} w-full`} placeholder="Target stage (e.g. contacted, qualified, won)" value={toStage} onChange={(e) => setToStage(e.target.value)} />}
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-600">Delay before acting (minutes)</div>
            <input className={`${input} w-full`} type="number" min="0" value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-600">Action</div>
          <select className={`${input} w-full`} value={actionType} onChange={(e) => setActionType(e.target.value)}>
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {actionType === 'send_message' && <div className="space-y-2">
            <select className={`${input} w-full`} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
            </select>
            {channel === 'email' && <input className={`${input} w-full`} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />}
            <textarea className="min-h-24 w-full rounded-xl bg-white/[0.05] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40" placeholder="Message" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>}
          {actionType === 'add_tag' && <input className={`${input} w-full`} placeholder="Tag to add" value={tag} onChange={(e) => setTag(e.target.value)} />}
          {actionType === 'assign_owner' && <input className={`${input} w-full`} placeholder="Owner user ID" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} />}
        </div>

        <button className={primary} disabled={saving || !name.trim()} onClick={create}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}{saving ? 'Creating…' : 'Create as draft'}</button>
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
    </div>
  </CRMLayout>;
}
