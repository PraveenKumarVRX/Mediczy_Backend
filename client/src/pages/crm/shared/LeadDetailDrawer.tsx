import { useEffect, useState } from 'react';
import { Activity, Bot, Filter, Loader2, Mail, MessageCircle, PhoneCall, Send, Smartphone, X } from 'lucide-react';
import api from '@/utils/api';

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('crmToken') || ''}` });

const statusBadge: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  contacted: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  qualified: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  converted: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  lost: 'bg-red-500/15 text-red-400 border-red-500/20',
};

const TABS = ['Overview', 'Activities', 'Communications', 'Calls', 'Segments', 'Automations'] as const;

/**
 * The lead 360° view: one lead's activities, segment membership, automation
 * execution history, and communication log — data that already exists
 * (crm_activities, crm_segment_members, crm_automation_executions,
 * crm_communication_events) but previously required re-searching for the
 * same lead across five separate pages to see.
 */
export default function LeadDetailDrawer({ leadId, onClose }: { leadId: number; onClose: () => void }) {
  const [lead, setLead] = useState<any>(null);
  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<typeof TABS[number]>('Overview');

  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'sms'>('email');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [leadRes, contextRes] = await Promise.all([
        api.get(`/crm/leads/${leadId}`, { headers: headers() }),
        api.get(`/crm/leads/${leadId}/context`, { headers: headers() }),
      ]);
      setLead(leadRes.data?.data || null);
      setContext(contextRes.data?.data || null);
    } catch { /* surfaced via empty state */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [leadId]);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const response = await api.post('/crm/communication-hub/send', { channel, subject, message, leadId }, { headers: headers() });
      setSendResult({ ok: true, text: response.data?.message || `${channel} sent.` });
      setMessage('');
      await load();
    } catch (e: any) {
      setSendResult({ ok: false, text: e?.response?.data?.message || `Failed to send ${channel}.` });
    } finally { setSending(false); }
  };

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
    <div className="h-full w-full max-w-xl bg-[#0d1120] border-l border-white/10 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      {loading ? (
        <div className="p-8 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : !lead ? (
        <div className="p-8 text-sm text-slate-500">Lead not found.</div>
      ) : <>
        <div className="sticky top-0 bg-[#0d1120] border-b border-white/10 p-5 z-10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{lead.name}</h2>
              <p className="text-xs text-slate-500 mt-1">{lead.email || '—'} · {lead.phone || '—'}{lead.company ? ` · ${lead.company}` : ''}</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex gap-2 mt-3">
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${statusBadge[lead.status] || 'bg-slate-500/15 text-slate-400 border-slate-500/20'}`}>{lead.status}</span>
            {!context?.v2 && <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-amber-500/20 bg-amber-500/10 text-amber-300">Not yet synced to v2 — segments/automations unavailable</span>}
          </div>
          <div className="flex gap-1 mt-4 overflow-x-auto">
            {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${tab === t ? 'bg-violet-600 text-white' : 'bg-white/[0.05] text-slate-400 hover:text-white'}`}>{t}</button>)}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {tab === 'Overview' && <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-wide text-slate-600 mb-2">Details</div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-slate-600 text-xs">Priority</dt><dd className="text-white capitalize">{lead.priority}</dd></div>
                <div><dt className="text-slate-600 text-xs">Source</dt><dd className="text-white">{lead.source}</dd></div>
                <div><dt className="text-slate-600 text-xs">Created</dt><dd className="text-white">{new Date(lead.created_at).toLocaleDateString()}</dd></div>
                <div><dt className="text-slate-600 text-xs">Last contacted</dt><dd className="text-white">{lead.last_contacted ? new Date(lead.last_contacted).toLocaleDateString() : '—'}</dd></div>
              </dl>
              {lead.notes && <p className="mt-3 text-sm text-slate-400 border-t border-white/[0.06] pt-3">{lead.notes}</p>}
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-wide text-slate-600 mb-3 flex items-center gap-2"><Send className="h-3.5 w-3.5" />Send a message</div>
              <div className="flex gap-2 mb-3">
                {([['email', Mail], ['whatsapp', MessageCircle], ['sms', Smartphone]] as const).map(([key, Icon]) => (
                  <button key={key} className={`h-8 px-3 rounded-lg text-xs capitalize flex items-center gap-1.5 ${channel === key ? 'bg-violet-600 text-white' : 'bg-white/[0.05] text-slate-400'}`} onClick={() => setChannel(key)}><Icon className="h-3.5 w-3.5" />{key}</button>
                ))}
              </div>
              {channel === 'email' && <input className="h-9 w-full mb-2 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />}
              <textarea className="min-h-20 w-full rounded-lg bg-white/[0.05] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-600" placeholder="Message" value={message} onChange={(e) => setMessage(e.target.value)} />
              {sendResult && <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${sendResult.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{sendResult.text}</div>}
              <button disabled={sending || !message.trim()} onClick={send} className="mt-2 w-full h-9 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm flex items-center justify-center gap-2">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Sending…' : 'Send'}</button>
            </div>
          </div>}

          {tab === 'Activities' && <div className="space-y-2">
            {(lead.activities || []).length ? lead.activities.map((a: any) => <div key={a.id} className="rounded-lg border border-white/[0.06] px-3 py-3"><div className="flex justify-between gap-2"><span className="text-sm text-white capitalize">{a.type}: {a.title}</span><span className="text-xs text-slate-600">{new Date(a.created_at).toLocaleDateString()}</span></div>{a.description && <p className="text-xs text-slate-500 mt-1">{a.description}</p>}{a.outcome && <p className="text-xs text-slate-600 mt-1">Outcome: {a.outcome}</p>}</div>) : <Empty icon={Activity} text="No activities logged yet." />}
          </div>}

          {tab === 'Communications' && <div className="space-y-2">
            {(context?.communications || []).length ? context.communications.map((c: any) => <div key={c.id} className="rounded-lg border border-white/[0.06] px-3 py-3"><div className="flex justify-between gap-2"><span className="text-sm text-white capitalize">{c.type}</span><span className={`text-xs ${String(c.outcome || '').startsWith('failed') ? 'text-red-400' : 'text-emerald-400'}`}>{c.outcome}</span></div>{c.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</p>}<p className="text-[11px] text-slate-600 mt-1">{new Date(c.created_at).toLocaleString()}</p></div>) : <Empty icon={Mail} text="No messages sent to this lead yet." />}
          </div>}

          {tab === 'Calls' && <div className="space-y-2">
            {(context?.calls || []).length ? context.calls.map((c: any) => <div key={c.id} className="rounded-lg border border-white/[0.06] px-3 py-3"><div className="flex justify-between gap-2"><span className="text-sm text-white">{c.title}</span>{c.outcome && <span className="text-xs text-slate-400">{c.outcome}</span>}</div>{c.description && <p className="text-xs text-slate-500 mt-1">{c.description}</p>}<p className="text-[11px] text-slate-600 mt-1">{new Date(c.completed_at || c.created_at).toLocaleString()}</p></div>) : <Empty icon={PhoneCall} text="No calls logged yet." />}
          </div>}

          {tab === 'Segments' && <div className="space-y-2">
            {(context?.segments || []).length ? <div className="flex flex-wrap gap-2">{context.segments.map((s: any) => <span key={s.id} className="px-3 py-1.5 rounded-lg text-xs bg-violet-500/10 text-violet-300 border border-violet-500/20">{s.name}</span>)}</div> : <Empty icon={Filter} text="This lead doesn't match any segment right now." />}
          </div>}

          {tab === 'Automations' && <div className="space-y-2">
            {(context?.automationExecutions || []).length ? context.automationExecutions.map((e: any) => <div key={e.id} className="rounded-lg border border-white/[0.06] px-3 py-3"><div className="flex justify-between gap-2"><span className="text-sm text-white">{e.automation_name}</span><span className={`text-xs ${e.status === 'failed' ? 'text-red-400' : e.status === 'completed' ? 'text-emerald-400' : 'text-slate-400'}`}>{e.status}</span></div><p className="text-xs text-slate-500 mt-1">{e.action_type}</p>{e.error && <p className="text-xs text-red-400 mt-1">{e.error}</p>}<p className="text-[11px] text-slate-600 mt-1">{new Date(e.completed_at || e.scheduled_at).toLocaleString()}</p></div>) : <Empty icon={Bot} text="No automations have run for this lead yet." />}
          </div>}
        </div>
      </>}
    </div>
  </div>;
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return <div className="py-10 text-center"><Icon className="h-5 w-5 text-slate-700 mx-auto mb-2" /><p className="text-sm text-slate-600">{text}</p></div>;
}
