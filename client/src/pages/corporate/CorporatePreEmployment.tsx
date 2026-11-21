import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, Send, CalendarClock, XCircle, History, Loader2, Stethoscope, Mail, Phone, Briefcase, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

/**
 * Pre-employment health check-ups (PEME) for candidates (HR QA 2026-11-21 #2).
 * Separate from employee benefits: add a candidate, send the consent invitation,
 * schedule the check-up once they consent; the company doctor records fitness.
 *   draft → invited → consented → scheduled → completed (fit / fit with restrictions / unfit)
 */
interface PemeCase {
  id: string; status: string; positionTitle: string | null; appointmentAt: string | null;
  venue: { name?: string; address?: string } | null; consentedAt: string | null; fitnessStatus: string | null;
  candidate: { id: number; name: string; email: string | null; phone: string | null };
  createdAt: string; updatedAt: string; fitnessIssuedAt: string | null;
}
interface PemeEvent { type: string; actor: string; by: string | null; at: string; detail: string | null }

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Not invited', cls: 'bg-slate-600/30 text-slate-300' },
  invited: { label: 'Invited · awaiting consent', cls: 'bg-amber-500/15 text-amber-300' },
  consent_pending: { label: 'Awaiting consent', cls: 'bg-amber-500/15 text-amber-300' },
  consented: { label: 'Consented · to schedule', cls: 'bg-sky-500/15 text-sky-300' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-500/15 text-blue-300' },
  in_progress: { label: 'Check-up in progress', cls: 'bg-indigo-500/15 text-indigo-300' },
  clinical_review: { label: 'With the doctor', cls: 'bg-violet-500/15 text-violet-300' },
  completed: { label: 'Completed', cls: 'bg-emerald-500/15 text-emerald-300' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-700/50 text-slate-400' },
  expired: { label: 'Invitation expired', cls: 'bg-red-500/15 text-red-300' },
};
const FITNESS: Record<string, string> = { fit: 'Fit', fit_with_restrictions: 'Fit with restrictions', temporarily_unfit: 'Temporarily unfit', unfit: 'Unfit' };
const EVENT_LABEL: Record<string, string> = {
  case_created: 'Candidate added', invitation_issued: 'Consent invitation sent', consent_recorded: 'Candidate consented',
  appointment_scheduled: 'Check-up scheduled', fitness_outcome_recorded: 'Fitness outcome recorded', case_cancelled: 'Cancelled',
};
const FILTERS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'invite', label: 'To invite / awaiting consent', match: (s) => ['draft', 'invited', 'consent_pending', 'expired'].includes(s) },
  { key: 'schedule', label: 'To schedule', match: (s) => s === 'consented' },
  { key: 'scheduled', label: 'Scheduled', match: (s) => ['scheduled', 'in_progress', 'clinical_review'].includes(s) },
  { key: 'completed', label: 'Completed', match: (s) => s === 'completed' },
  { key: 'cancelled', label: 'Cancelled', match: (s) => s === 'cancelled' },
];
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const err = (e: any, fallback: string) => e?.response?.data?.message || fallback;

const CorporatePreEmployment: React.FC = () => {
  const { toast } = useToast();
  const [cases, setCases] = useState<PemeCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ candidateName: '', candidateEmail: '', candidatePhone: '', positionTitle: '', inviteNow: true });
  const [scheduleFor, setScheduleFor] = useState<PemeCase | null>(null);
  const [sched, setSched] = useState({ at: '', venueName: '', venueAddress: '' });
  const [cancelFor, setCancelFor] = useState<PemeCase | null>(null);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<Record<string, PemeEvent[] | 'loading'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/corporate/pre-employment/cases');
      setCases((data as any)?.cases || []);
    } catch (e) { toast({ title: 'Could not load candidates', description: err(e, 'Please try again.'), variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, cases.filter((c) => f.match(c.status)).length])), [cases]);
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) || FILTERS[0];
    const q = search.trim().toLowerCase();
    return cases.filter((c) => f.match(c.status) && (!q || `${c.candidate.name} ${c.candidate.email || ''} ${c.candidate.phone || ''} ${c.positionTitle || ''}`.toLowerCase().includes(q)));
  }, [cases, filter, search]);

  const invite = async (c: PemeCase) => {
    setBusy(`invite-${c.id}`);
    try {
      await api.post(`/corporate/pre-employment/cases/${c.id}/invite`, {});
      toast({ title: 'Invitation sent', description: `${c.candidate.name} has a secure consent link by email, valid for 7 days.` });
      load();
    } catch (e) { toast({ title: 'Invitation not sent', description: err(e, 'Please try again.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const addCandidate = async () => {
    setBusy('add');
    try {
      const { data } = await api.post('/corporate/pre-employment/cases', {
        candidateName: form.candidateName, candidateEmail: form.candidateEmail, candidatePhone: form.candidatePhone || undefined, positionTitle: form.positionTitle || undefined,
      });
      const created = (data as any)?.case as PemeCase | undefined;
      setAddOpen(false);
      setForm({ candidateName: '', candidateEmail: '', candidatePhone: '', positionTitle: '', inviteNow: true });
      if (created && form.inviteNow) await invite(created);
      else { toast({ title: 'Candidate added', description: 'Send the consent invitation when ready.' }); load(); }
    } catch (e) { toast({ title: 'Could not add the candidate', description: err(e, 'Please try again.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const schedule = async () => {
    if (!scheduleFor) return;
    setBusy('schedule');
    try {
      await api.post(`/corporate/pre-employment/cases/${scheduleFor.id}/schedule`, {
        appointmentAt: new Date(sched.at).toISOString(), venue: { name: sched.venueName.trim(), address: sched.venueAddress.trim() },
      });
      toast({ title: 'Check-up scheduled', description: `${scheduleFor.candidate.name} · ${fmt(new Date(sched.at).toISOString())}` });
      setScheduleFor(null);
      load();
    } catch (e) { toast({ title: 'Could not schedule', description: err(e, 'Please try again.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const cancel = async () => {
    if (!cancelFor) return;
    setBusy('cancel');
    try {
      await api.post(`/corporate/pre-employment/cases/${cancelFor.id}/cancel`, { reason });
      toast({ title: 'Case cancelled' });
      setCancelFor(null); setReason('');
      load();
    } catch (e) { toast({ title: 'Could not cancel', description: err(e, 'Please try again.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const toggleHistory = async (c: PemeCase) => {
    if (history[c.id]) { setHistory(({ [c.id]: _d, ...rest }) => rest); return; }
    setHistory((h) => ({ ...h, [c.id]: 'loading' }));
    try {
      const { data } = await api.get(`/corporate/pre-employment/cases/${c.id}/events`);
      setHistory((h) => ({ ...h, [c.id]: (data as any)?.events || [] }));
    } catch { setHistory(({ [c.id]: _d, ...rest }) => rest); toast({ title: 'Could not load the history', variant: 'destructive' }); }
  };

  const openSchedule = (c: PemeCase) => {
    setScheduleFor(c);
    setSched({ at: c.appointmentAt ? new Date(c.appointmentAt).toISOString().slice(0, 16) : '', venueName: c.venue?.name || '', venueAddress: c.venue?.address || '' });
  };

  return (
    <CorporateLayout title="Pre-Employment Check-ups">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={Stethoscope}
          title="Pre-Employment Check-ups"
          description="Candidates' pre-employment health check-ups, from consent to fitness outcome. Separate from employee benefits."
          gradient="from-teal-500 to-teal-700"
          badge={`${cases.length} candidates`}
          showRefresh
          onRefresh={load}
          isRefreshing={loading}
          stats={[
            { label: 'Awaiting consent', value: counts.invite || 0 },
            { label: 'To schedule', value: counts.schedule || 0 },
            { label: 'Scheduled', value: counts.scheduled || 0 },
            { label: 'Completed', value: counts.completed || 0 },
          ]}
          actions={
            <Button size="sm" onClick={() => setAddOpen(true)} className="bg-slate-900 text-teal-300 hover:bg-slate-800 shadow-lg">
              <UserPlus className="h-4 w-4 mr-2" /> Add candidate
            </Button>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Candidates</CardTitle>
            <CardDescription>The candidate must consent through the secure email link before the check-up can be scheduled. The fitness outcome is recorded by your company doctor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1.5" role="tablist">
                {FILTERS.map((f) => (
                  <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f.key ? 'border-teal-500 bg-teal-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'}`}>
                    {f.label} <span className="ml-1 tabular-nums opacity-75">{counts[f.key] || 0}</span>
                  </button>
                ))}
              </div>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, position" className="lg:max-w-xs" />
            </div>

            {loading && !cases.length ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : shown.length === 0 ? (
              <div className="py-14 text-center text-slate-400">
                <Stethoscope className="mx-auto mb-3 h-10 w-10 opacity-40" />
                <p>{cases.length ? 'No candidates match.' : 'No candidates yet. Use Add candidate to start a pre-employment check-up.'}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
                {shown.map((c) => {
                  const st = STATUS[c.status] || { label: c.status, cls: 'bg-slate-700/50 text-slate-300' };
                  const h = history[c.id];
                  const canInvite = ['draft', 'invited', 'consent_pending', 'expired'].includes(c.status);
                  const canSchedule = ['consented', 'scheduled'].includes(c.status);
                  const open = !['completed', 'cancelled'].includes(c.status);
                  return (
                    <li key={c.id} className="p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-100">{c.candidate.name}</span>
                            <Badge className={st.cls}>{st.label}</Badge>
                            {c.fitnessStatus && <Badge className={c.fitnessStatus === 'fit' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}>{FITNESS[c.fitnessStatus] || c.fitnessStatus}</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                            {c.positionTitle && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{c.positionTitle}</span>}
                            {c.candidate.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.candidate.email}</span>}
                            {c.candidate.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.candidate.phone}</span>}
                            {c.appointmentAt && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{fmt(c.appointmentAt)}{c.venue?.name ? ` · ${c.venue.name}` : ''}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {canInvite && (
                            <Button size="sm" disabled={busy === `invite-${c.id}`} onClick={() => invite(c)}>
                              {busy === `invite-${c.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : c.status === 'draft' ? <Send className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                              <span className="ml-1.5">{c.status === 'draft' ? 'Send invitation' : 'Resend invitation'}</span>
                            </Button>
                          )}
                          {canSchedule && (
                            <Button size="sm" variant={c.status === 'consented' ? 'default' : 'outline'} onClick={() => openSchedule(c)}>
                              <CalendarClock className="h-4 w-4" /><span className="ml-1.5">{c.status === 'scheduled' ? 'Reschedule' : 'Schedule check-up'}</span>
                            </Button>
                          )}
                          {open && <Button size="sm" variant="ghost" onClick={() => { setCancelFor(c); setReason(''); }}><XCircle className="h-4 w-4" /><span className="ml-1.5">Cancel</span></Button>}
                          <Button size="sm" variant="ghost" onClick={() => toggleHistory(c)} aria-expanded={!!h}><History className="h-4 w-4" /><span className="ml-1.5">History</span></Button>
                        </div>
                      </div>
                      {h && (
                        <div className="mt-3 border-t border-slate-800 pt-3">
                          {h === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : (
                            <ol className="space-y-1.5">
                              {h.map((e, i) => (
                                <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden />
                                  <span className="font-medium text-slate-200">{EVENT_LABEL[e.type] || e.type.replace(/_/g, ' ')}</span>
                                  <span className="text-slate-400">{fmt(e.at)}</span>
                                  {e.by && <span className="text-slate-400">by {e.by}</span>}
                                  {e.actor === 'candidate' && <span className="text-slate-400">by the candidate</span>}
                                  {e.detail && <span className="text-slate-400">· {e.type === 'appointment_scheduled' ? fmt(e.detail) : FITNESS[e.detail] || e.detail}</span>}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Add candidate */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add a candidate</DialogTitle>
              <DialogDescription>The candidate receives a secure link by email to consent to the pre-employment check-up.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Full name *" value={form.candidateName} onChange={(e) => setForm({ ...form, candidateName: e.target.value })} />
              <Input type="email" placeholder="Email *" value={form.candidateEmail} onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })} />
              <Input placeholder="Phone" value={form.candidatePhone} onChange={(e) => setForm({ ...form, candidatePhone: e.target.value })} />
              <Input placeholder="Position applied for" value={form.positionTitle} onChange={(e) => setForm({ ...form, positionTitle: e.target.value })} />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.inviteNow} onChange={(e) => setForm({ ...form, inviteNow: e.target.checked })} />
                Send the consent invitation now
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={addCandidate} disabled={busy === 'add' || !form.candidateName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.candidateEmail.trim())}>
                {busy === 'add' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}Add candidate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Schedule */}
        <Dialog open={!!scheduleFor} onOpenChange={(o) => !o && setScheduleFor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{scheduleFor?.status === 'scheduled' ? 'Reschedule' : 'Schedule'} the check-up</DialogTitle>
              <DialogDescription>{scheduleFor?.candidate.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <label className="block space-y-1 text-sm"><span className="text-slate-300">Date and time *</span>
                <Input type="datetime-local" value={sched.at} min={new Date().toISOString().slice(0, 16)} onChange={(e) => setSched({ ...sched, at: e.target.value })} />
              </label>
              <Input placeholder="Lab or clinic name *" value={sched.venueName} onChange={(e) => setSched({ ...sched, venueName: e.target.value })} />
              <Input placeholder="Address" value={sched.venueAddress} onChange={(e) => setSched({ ...sched, venueAddress: e.target.value })} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setScheduleFor(null)}>Cancel</Button>
              <Button onClick={schedule} disabled={busy === 'schedule' || !sched.at || !sched.venueName.trim()}>
                {busy === 'schedule' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarClock className="h-4 w-4 mr-2" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel */}
        <Dialog open={!!cancelFor} onOpenChange={(o) => !o && setCancelFor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel this pre-employment check-up?</DialogTitle>
              <DialogDescription>{cancelFor?.candidate.name}. Any open invitation link stops working.</DialogDescription>
            </DialogHeader>
            <Input autoFocus placeholder="Reason (kept in the history)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelFor(null)}>Keep</Button>
              <Button variant="destructive" onClick={cancel} disabled={busy === 'cancel' || reason.trim().length < 3}>
                {busy === 'cancel' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Cancel check-up
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CorporateLayout>
  );
};

export default CorporatePreEmployment;
