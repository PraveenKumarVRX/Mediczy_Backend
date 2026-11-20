/**
 * Call centre: the agent's working screen (plan: "Call Centre Agent: the web Inbox and Calls are the job").
 *
 *   Status          Available / On break / Offline; TeleCMI only rings available agents (user/status API)
 *   My day          calls answered and placed, missed calls returned, median reply time, tasks, break time
 *   Callbacks       missed calls not yet returned and follow-ups due today, in due-time order, one click to call
 *   Scripts         call scripts and quick answers (doctor timings, packages, common questions); managers edit
 *   Team            managers: every agent's status and day
 *
 * API: /api/crm/call-centre (queue, status, day, team, quick-answers); calls go through the Inbox's
 * click-to-call (/api/crm/inbox/:leadId/call) or the doctor's (/api/crm/referral-network/doctors/:id/call).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, PhoneMissed, PhoneCall, CheckCircle2, Clock, Coffee, Power, Search, Plus, Pencil, Trash2, Copy, MapPin,
  Headphones, MessageSquareText, Users, AlarmClock, Inbox as InboxIcon, Stethoscope, BookOpen, CircleDot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';
import {
  Pill, Card, CardHead, Kpi, Field, Opt, Tabs, Empty, Flash, Loading, Table, STAGE,
  inputCls, selectCls, primaryCls, ghostCls, rowCls, cellCls, type FlashMsg,
} from './ReferralNetworkPages';

const auth = () => { const t = localStorage.getItem('crmToken'); return t ? { Authorization: `Bearer ${t}` } : {}; };
async function req<T = any>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: unknown, params?: Record<string, any>): Promise<T> {
  try {
    const res = await api.request({ url, method, data: body, params, headers: auth() });
    return res.data?.data as T;
  } catch (err: any) {
    if (err.response?.status === 401) window.location.assign('/crm/login');
    throw new Error(err.response?.data?.message || err.message || 'Request failed');
  }
}
const me = () => { try { return JSON.parse(localStorage.getItem('crmUserData') || 'null'); } catch { return null; } };

const STATUS = {
  available: { label: 'Available', icon: Headphones, dot: 'bg-emerald-400', on: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' },
  break: { label: 'On break', icon: Coffee, dot: 'bg-amber-400', on: 'border-amber-500/40 bg-amber-500/15 text-amber-200' },
  offline: { label: 'Offline', icon: Power, dot: 'bg-slate-500', on: 'border-slate-500/40 bg-slate-500/15 text-slate-200' },
} as const;
type StatusKey = keyof typeof STATUS;
const BREAK_REASONS = ['Lunch', 'Tea', 'Meeting', 'Training', 'Other'];

// The hospital works on Indian time, whatever the viewer's device is set to.
const timeOf = (d: string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
function dueText(item: any) {
  const ms = Date.now() - new Date(item.due_at).getTime();
  const mins = Math.round(Math.abs(ms) / 60000);
  const span = mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
  if (item.kind === 'missed_call') return `${span} ago`;
  return ms >= 0 ? `due ${span} ago` : `due ${timeOf(item.due_at)}`;
}
const minutes = (m: number | null | undefined) => (m == null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

export function CallCentrePage() {
  const user = me();
  const manager = Boolean(user?.isAdmin) || ['admin', 'business_head', 'marketing_head'].includes(user?.crmRole);
  const [tab, setTab] = useState<'queue' | 'scripts' | 'team'>('queue');
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [status, setStatus] = useState<any>(null);
  const [day, setDay] = useState<any>(null);
  const [telephony, setTelephony] = useState<any>(null);

  const loadDay = useCallback(() => req('get', '/crm/call-centre/day').then(setDay).catch(() => setDay(null)), []);
  useEffect(() => {
    req('get', '/crm/call-centre/status').then(setStatus).catch((e) => setFlash({ text: e.message, ok: false }));
    req('get', '/crm/inbox/telephony').then(setTelephony).catch(() => setTelephony(null));
    loadDay();
    const t = window.setInterval(() => { if (!document.hidden) loadDay(); }, 60000);
    return () => window.clearInterval(t);
  }, [loadDay]);

  const changeStatus = async (next: StatusKey, reason?: string) => {
    try {
      const s = await req('put', '/crm/call-centre/status', { status: next, reason });
      setStatus(s);
      setFlash(s.telecmi?.synced ? { text: `You are ${STATUS[next].label.toLowerCase()}. TeleCMI ${next === 'available' ? 'will ring you for calls' : 'will not ring you'}.`, ok: true }
        : { text: `You are ${STATUS[next].label.toLowerCase()}. ${s.telecmi?.error || ''}`, ok: Boolean(!s.telecmi?.linked) });
      loadDay();
    } catch (e: any) { setFlash({ text: e.message, ok: false }); }
  };

  return (
    <CRMLayout title="Call centre">
      <div className="space-y-4">
        <Flash msg={flash} onClose={() => setFlash(null)} />
        <StatusBar status={status} onChange={changeStatus} />
        {day && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={PhoneCall} label="Calls answered" value={day.calls_answered} sub={day.talk_seconds ? `${Math.round(day.talk_seconds / 60)} min talk time` : 'today'} />
            <Kpi icon={Phone} label="Calls placed" value={day.calls_placed} sub={`${day.calls_connected} connected`} />
            <Kpi icon={PhoneMissed} label="Missed calls returned" value={day.missed_returned} sub="today" />
            <Kpi icon={MessageSquareText} label="Median reply time" value={day.median_reply_min == null ? '—' : minutes(day.median_reply_min)} sub={day.replies ? `${day.replies} WhatsApp/SMS replies` : 'no replies yet today'} tone={day.median_reply_min > 15 ? 'warn' : undefined} />
            <Kpi icon={CheckCircle2} label="Follow-ups done" value={day.tasks_done} sub={day.tasks_overdue ? `${day.tasks_overdue} overdue` : 'none overdue'} tone={day.tasks_overdue ? 'warn' : 'up'} />
            <Kpi icon={Coffee} label="On break" value={minutes(day.break_minutes)} sub={`${minutes(day.available_minutes)} available`} />
          </div>
        )}
        <Tabs<'queue' | 'scripts' | 'team'> tabs={[{ id: 'queue' as const, label: 'Callbacks' }, { id: 'scripts' as const, label: 'Scripts and answers' }, ...(manager ? [{ id: 'team' as const, label: 'Team' }] : [])]} value={tab} onChange={setTab} />
        {tab === 'queue' && <QueueTab telephony={telephony} onFlash={setFlash} onChanged={loadDay} />}
        {tab === 'scripts' && <ScriptsTab manager={manager} onFlash={setFlash} />}
        {tab === 'team' && manager && <TeamTab />}
      </div>
    </CRMLayout>
  );
}

function StatusBar({ status, onChange }: { status: any; onChange: (s: StatusKey, reason?: string) => void }) {
  const [askBreak, setAskBreak] = useState(false);
  const current: StatusKey = status?.status || 'offline';
  return (
    <Card className="p-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS[current].dot} ${current === 'available' ? 'animate-pulse' : ''}`} aria-hidden />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">You are {STATUS[current].label.toLowerCase()}{status?.reason ? ` (${status.reason.toLowerCase()})` : ''}</div>
            <div className="text-xs text-slate-500">
              {status?.since ? `Since ${timeOf(status.since)}. ` : ''}
              {!status?.telecmi?.linked ? 'Not linked to a TeleCMI agent: calls are not routed to you. Ask an administrator to link you in Settings.'
                : !status?.since ? 'Choose Available when you are ready to take calls.'
                : status.telecmi.synced ? (current === 'available' ? 'TeleCMI is ringing you for calls.' : 'TeleCMI will not ring you.') : status.telecmi.error || 'TeleCMI did not confirm your status.'}
            </div>
          </div>
        </div>
        <div className="lg:ml-auto flex flex-wrap gap-2" role="radiogroup" aria-label="Your status">
          {(Object.keys(STATUS) as StatusKey[]).map((k) => {
            const S = STATUS[k];
            return (
              <button key={k} role="radio" aria-checked={current === k} onClick={() => (k === 'break' ? setAskBreak(true) : onChange(k))}
                className={`h-10 px-4 rounded-xl border text-sm inline-flex items-center gap-2 transition-colors ${current === k ? S.on : 'border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'}`}>
                <S.icon className="h-4 w-4" />{S.label}
              </button>
            );
          })}
        </div>
      </div>
      {askBreak && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
          <span className="text-xs text-slate-400">Break for:</span>
          {BREAK_REASONS.map((r) => <button key={r} className={ghostCls} onClick={() => { setAskBreak(false); onChange('break', r); }}>{r}</button>)}
          <button className="text-xs text-slate-500 hover:text-slate-300 ml-1" onClick={() => setAskBreak(false)}>Cancel</button>
        </div>
      )}
    </Card>
  );
}

function QueueTab({ telephony, onFlash, onChanged }: { telephony: any; onFlash: (m: FlashMsg) => void; onChanged: () => void }) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [q, setQ] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => req('get', '/crm/call-centre/queue', undefined, { scope }).then(setQ).catch((e) => { onFlash({ text: e.message, ok: false }); setQ({ items: [], counts: {} }); }), [scope, onFlash]);
  useEffect(() => { setQ(null); load(); const t = window.setInterval(() => { if (!document.hidden) load(); }, 30000); return () => window.clearInterval(t); }, [load]);

  const act = async (key: string, fn: () => Promise<any>, ok?: string) => {
    setBusy(key);
    try { const r = await fn(); if (ok || r?.message) onFlash({ text: r?.message || ok || 'Done', ok: true }); await load(); onChanged(); }
    catch (e: any) { onFlash({ text: e.message, ok: false }); }
    finally { setBusy(null); }
  };
  const call = (item: any) => act(item.id, () => (item.lead_id ? req('post', `/crm/inbox/${item.lead_id}/call`, {}) : req('post', `/crm/referral-network/doctors/${item.doctor_id}/call`, {})));
  const done = (item: any) => act(item.id, () => (item.kind === 'task' ? req('patch', `/crm/call-centre/tasks/${item.task_id}`, { done: true }) : req('post', `/crm/call-centre/queue/missed/${item.lead_id}/clear`, {})), item.kind === 'task' ? 'Follow-up done.' : 'Missed call cleared.');
  const snooze = (item: any) => act(item.id, () => req('patch', `/crm/call-centre/tasks/${item.task_id}`, { dueAt: new Date(Date.now() + 3600e3).toISOString() }), 'Moved one hour later.');

  const canCall = telephony?.canCall;
  return (
    <Card>
      <CardHead title="Callbacks" sub={q ? `${q.counts?.missed_calls ?? 0} missed calls to return · ${q.counts?.tasks ?? 0} follow-ups due today · ${q.counts?.overdue ?? 0} overdue` : 'Missed calls first, then follow-ups, in the order they fell due'}
        right={q?.canSeeAll && (
          <div className="flex rounded-xl border border-white/[0.08] p-0.5" role="radiogroup" aria-label="Whose callbacks">
            {(['mine', 'all'] as const).map((s) => <button key={s} role="radio" aria-checked={scope === s} onClick={() => setScope(s)} className={`h-8 px-3 rounded-lg text-xs ${scope === s ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:text-slate-200'}`}>{s === 'mine' ? 'Mine' : 'Everyone'}</button>)}
          </div>
        )} />
      {!canCall && telephony && <div className="mx-5 mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Click-to-call is not available: {telephony.reason}</div>}
      {!q ? <Loading /> : q.items.length === 0 ? (
        <Empty icon={CheckCircle2} title="Nothing to call back" body={scope === 'mine' ? 'Missed calls on your patients (or nobody\'s) and your follow-ups due today appear here. Switch to Everyone to help the team.' : 'No missed calls waiting and no follow-ups due today.'} />
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {q.items.map((it: any) => {
            const Icon = it.kind === 'missed_call' ? PhoneMissed : it.field ? MapPin : AlarmClock;
            const stage = it.stage ? STAGE[it.stage] : null;
            return (
              <li key={it.id} className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-3 hover:bg-white/[0.02]">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`h-9 w-9 shrink-0 rounded-xl grid place-items-center ${it.kind === 'missed_call' ? 'bg-red-500/10 text-red-300' : it.overdue ? 'bg-amber-500/10 text-amber-300' : 'bg-white/[0.04] text-slate-300'}`}><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white truncate">{it.name}</span>
                      {stage && <Pill tone={stage.tone}>{stage.label}</Pill>}
                      {it.field && <Pill tone="blue">field follow-up</Pill>}
                      {it.attempts > 0 && <Pill tone="amber">{it.attempts} {it.attempts === 1 ? 'try' : 'tries'}</Pill>}
                    </div>
                    <div className="mt-0.5 text-sm text-slate-300 truncate">{it.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      <span className={it.overdue ? 'text-amber-300' : ''}>{dueText(it)}</span>
                      {it.phone ? ` · ${it.phone}` : ''}{it.owner_name ? ` · ${it.owner_name}` : it.kind === 'missed_call' ? ' · no owner' : ''}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {(it.lead_id || it.doctor_id) && <Button className={primaryCls} disabled={!canCall || busy === it.id} onClick={() => call(it)} title={canCall ? 'TeleCMI rings your phone, then connects the call' : telephony?.reason}><Phone className="h-4 w-4 mr-1.5" />Call</Button>}
                  {it.legacy_lead_id ? <Link className={ghostCls} to={`/crm/inbox?lead=${it.legacy_lead_id}`}><InboxIcon className="h-4 w-4" />Open</Link>
                    : it.doctor_id ? <Link className={ghostCls} to={`/crm/doctors/${it.doctor_id}`}><Stethoscope className="h-4 w-4" />Doctor</Link> : null}
                  {it.kind === 'task' && <button className={ghostCls} disabled={busy === it.id} onClick={() => snooze(it)} title="Move one hour later"><Clock className="h-4 w-4" />1 h</button>}
                  <button className={ghostCls} disabled={busy === it.id} onClick={() => done(it)}><CheckCircle2 className="h-4 w-4" />{it.kind === 'task' ? 'Done' : 'Clear'}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const EMPTY_QA = { kind: 'answer', category: '', title: '', body: '', active: true };
function ScriptsTab({ manager, onFlash }: { manager: boolean; onFlash: (m: FlashMsg) => void }) {
  const [kind, setKind] = useState<'script' | 'answer'>('script');
  const [search, setSearch] = useState('');
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<any>(null);
  const load = useCallback(() => req('get', '/crm/call-centre/quick-answers').then(setD).catch((e) => { onFlash({ text: e.message, ok: false }); setD({ items: [] }); }), [onFlash]);
  useEffect(() => { load(); }, [load]);
  const items = useMemo(() => (d?.items || []).filter((x: any) => x.kind === kind && (!search || `${x.title} ${x.body} ${x.category}`.toLowerCase().includes(search.toLowerCase()))), [d, kind, search]);
  const groups = useMemo(() => items.reduce((m: Record<string, any[]>, x: any) => { (m[x.category] ||= []).push(x); return m; }, {}), [items]);
  const counts = { script: (d?.items || []).filter((x: any) => x.kind === 'script').length, answer: (d?.items || []).filter((x: any) => x.kind === 'answer').length };
  const copy = async (x: any) => {
    try { await navigator.clipboard.writeText(x.body); onFlash({ text: `Copied "${x.title}". Paste it into your reply.`, ok: true }); req('post', `/crm/call-centre/quick-answers/${x.id}/used`, {}).catch(() => {}); }
    catch { onFlash({ text: 'Your browser blocked copying. Select the text instead.', ok: false }); }
  };
  const save = async () => {
    try { form.id ? await req('patch', `/crm/call-centre/quick-answers/${form.id}`, form) : await req('post', '/crm/call-centre/quick-answers', form); setForm(null); onFlash({ text: 'Saved. Agents see it straight away.', ok: true }); load(); }
    catch (e: any) { onFlash({ text: e.message, ok: false }); }
  };
  const remove = async (x: any) => {
    if (!window.confirm(`Delete "${x.title}"?`)) return;
    try { await req('delete', `/crm/call-centre/quick-answers/${x.id}`); load(); } catch (e: any) { onFlash({ text: e.message, ok: false }); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-white/[0.08] p-0.5" role="radiogroup" aria-label="Kind">
          {(['script', 'answer'] as const).map((k) => <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`h-9 px-3 rounded-lg text-sm ${kind === k ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:text-slate-200'}`}>{k === 'script' ? 'Call scripts' : 'Quick answers'} <span className="text-xs text-slate-500">{counts[k]}</span></button>)}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input className={`${inputCls} pl-9`} placeholder="Search: timings, package, MRI…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search scripts and answers" /></div>
        {manager && <Button className={`${primaryCls} ml-auto`} onClick={() => setForm({ ...EMPTY_QA, kind })}><Plus className="h-4 w-4 mr-1.5" />New</Button>}
      </div>
      {!d ? <Loading /> : items.length === 0 ? (
        <Card><Empty icon={BookOpen} title={search ? 'Nothing matches' : kind === 'answer' ? 'No quick answers yet' : 'No call scripts yet'}
          body={kind === 'answer' ? 'Quick answers hold what callers ask most: OPD timings, doctor schedules, health-check packages and prices, directions. A Business Head or Marketing Head adds them here; agents copy them into replies.' : 'Call scripts guide each kind of call.'}
          action={manager && !search ? <Button className={primaryCls} onClick={() => setForm({ ...EMPTY_QA, kind })}><Plus className="h-4 w-4 mr-1.5" />Add the first one</Button> : undefined} /></Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {Object.entries(groups).map(([cat, list]) => (
            <Card key={cat}>
              <CardHead title={cat} sub={`${(list as any[]).length} ${kind === 'script' ? 'script' : 'answer'}${(list as any[]).length === 1 ? '' : 's'}`} />
              <ul className="divide-y divide-white/[0.04]">
                {(list as any[]).map((x) => (
                  <li key={x.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button className="flex-1 text-left text-sm font-medium text-white hover:text-violet-300" onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>{x.title}</button>
                      {!x.active && <Pill>hidden</Pill>}
                      <button className="p-1.5 text-slate-400 hover:text-white" onClick={() => copy(x)} aria-label={`Copy ${x.title}`} title="Copy"><Copy className="h-4 w-4" /></button>
                      {manager && <button className="p-1.5 text-slate-400 hover:text-white" onClick={() => setForm(x)} aria-label={`Edit ${x.title}`}><Pencil className="h-4 w-4" /></button>}
                      {manager && <button className="p-1.5 text-slate-400 hover:text-red-300" onClick={() => remove(x)} aria-label={`Delete ${x.title}`}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                    {open === x.id && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{x.body}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg bg-[#0d1120] border-white/[0.08] text-white">
          <DialogHeader><DialogTitle>{form?.id ? 'Edit' : 'New'} {form?.kind === 'script' ? 'call script' : 'quick answer'}</DialogTitle></DialogHeader>
          {form && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind"><select className={`${selectCls} w-full`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><Opt value="answer">Quick answer</Opt><Opt value="script">Call script</Opt></select></Field>
            <Field label="Category"><input className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Timings, Packages, Cardiology…" /></Field>
            <Field label="Title *" wide><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="OPD timings" autoFocus /></Field>
            <Field label="Text *" wide><textarea className={`${inputCls} h-40 py-2`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Show to agents</label>
          </div>}
          <div className="flex justify-end gap-2"><button className={ghostCls} onClick={() => setForm(null)}>Cancel</button><Button className={primaryCls} disabled={!form?.title?.trim() || !form?.body?.trim()} onClick={save}>Save</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamTab() {
  const [t, setT] = useState<any[] | null>(null);
  useEffect(() => {
    const load = () => req('get', '/crm/call-centre/team').then(setT).catch(() => setT([]));
    load(); const id = window.setInterval(() => { if (!document.hidden) load(); }, 60000); return () => window.clearInterval(id);
  }, []);
  return (
    <Card>
      <CardHead title="Agents today" sub="Status and calls for everyone who takes calls. Refreshes every minute." />
      {!t ? <Loading /> : t.length === 0 ? <Empty icon={Users} title="No call centre agents yet" body="Add team members with the Call Centre Agent role, then link each one to their TeleCMI agent in Settings." /> : (
        <Table head={['Agent', 'Status', 'Answered', 'Placed', 'Missed returned', 'Median reply', 'Follow-ups', 'Break']}>
          {t.map((p) => { const S = STATUS[(p.status?.status || 'offline') as StatusKey]; return (
            <tr key={p.id} className={rowCls}>
              <td className={`${cellCls} text-white`}>{p.name}{!p.linked && <div className="text-xs text-amber-300">not linked to TeleCMI</div>}</td>
              <td className={cellCls}><span className="inline-flex items-center gap-2 text-slate-200"><CircleDot className={`h-3.5 w-3.5 ${S === STATUS.available ? 'text-emerald-400' : S === STATUS.break ? 'text-amber-400' : 'text-slate-500'}`} />{S.label}</span>{p.status?.since && <div className="text-xs text-slate-500">since {timeOf(p.status.since)}</div>}</td>
              <td className={`${cellCls} tabular-nums text-slate-200`}>{p.day.calls_answered}</td>
              <td className={`${cellCls} tabular-nums text-slate-200`}>{p.day.calls_placed}<span className="text-xs text-slate-500"> / {p.day.calls_connected} connected</span></td>
              <td className={`${cellCls} tabular-nums text-slate-200`}>{p.day.missed_returned}</td>
              <td className={`${cellCls} tabular-nums ${p.day.median_reply_min > 15 ? 'text-amber-300' : 'text-slate-200'}`}>{p.day.median_reply_min == null ? '—' : minutes(p.day.median_reply_min)}</td>
              <td className={`${cellCls} tabular-nums text-slate-200`}>{p.day.tasks_done}{p.day.tasks_overdue ? <span className="text-xs text-amber-300"> · {p.day.tasks_overdue} overdue</span> : null}</td>
              <td className={`${cellCls} tabular-nums text-slate-300`}>{minutes(p.day.break_minutes)}</td>
            </tr>
          ); })}
        </Table>
      )}
    </Card>
  );
}

export default CallCentrePage;
