import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, XCircle, FlaskConical, Upload, FileCheck, RefreshCw, History, Users, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

/**
 * Every corporate health check-up booking for one company, whoever made it:
 *   source 'team'     — booked by the wellness team (starts Pending)
 *   source 'employee' — booked by the employee in the app (starts Pending, "booked")
 * Pending → Confirmed (once the lab confirms) → Completed → report uploaded.
 */
interface Checkup {
  id: string; source: 'team' | 'employee'; bookingReference: string; status: string;
  employee: { id: number; name?: string; email?: string; phone?: string };
  beneficiary?: { name?: string; relation?: string };
  packageName: string; lab: { name?: string; address?: any }; appointment: { date: string | null; timeSlot: string };
  reportCount: number;
  isDemo?: boolean;
}

interface HistoryEvent { from?: string | null; status: string; at: string; by?: string | null; note?: string | null }

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', booked: 'Pending', confirmed: 'Confirmed', scheduled: 'Confirmed', rescheduled: 'Confirmed',
  completed: 'Completed', reports_available: 'Report sent', cancelled: 'Cancelled',
  sample_collected: 'Sample collected', processing: 'At the lab',
};
const STATUS_CLS: Record<string, string> = {
  Pending: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300',
  Confirmed: 'bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300',
  Completed: 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300',
  'Report sent': 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  Cancelled: 'bg-muted text-muted-foreground border-border',
};
const FILTERS = ['All', 'Pending', 'Confirmed', 'Completed', 'Report sent', 'Cancelled'] as const;
type Filter = typeof FILTERS[number];

const labelOf = (s: string) => STATUS_LABEL[s] || s.replace(/_/g, ' ');
const fmtDate = (d?: string | null) => {
  if (!d) return 'Date not set';
  const x = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtWhen = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const TeamCheckupApprovals = ({ corporateId, corporateName }: { corporateId?: number | string; corporateName?: string }) => {
  const [checkups, setCheckups] = useState<Checkup[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('Pending');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<Record<string, HistoryEvent[] | 'loading'>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const key = (c: Checkup) => `${c.source}-${c.id}`;

  const load = useCallback(async () => {
    if (!corporateId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/corporate-bookings/checkups?corporateId=${corporateId}`);
      setCheckups(data?.checkups || []);
      setHistory({});
    } catch { toast.error('Could not load bookings'); } finally { setLoading(false); }
  }, [corporateId]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: checkups.length };
    for (const x of checkups) c[labelOf(x.status)] = (c[labelOf(x.status)] || 0) + 1;
    return c;
  }, [checkups]);
  const shown = filter === 'All' ? checkups : checkups.filter((c) => labelOf(c.status) === filter);

  const act = async (c: Checkup, action: 'confirm' | 'complete' | 'cancel', note?: string) => {
    setBusy(`${action}-${key(c)}`);
    try {
      if (c.source === 'team') {
        await api.post(`/corporate-bookings/team-orders/${c.id}/${action}?corporateId=${corporateId}`, note ? { reason: note } : {});
      } else {
        const legacy = action === 'confirm' ? 'approve' : action === 'cancel' ? 'reject' : 'complete';
        await api.post(`/corporate-bookings/checkups/${c.id}/${legacy}`, note ? { reason: note } : {});
      }
      toast.success(action === 'confirm' ? 'Booking confirmed' : action === 'cancel' ? 'Booking cancelled' : 'Marked completed');
      setCancelling(null); setReason('');
      load();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Action failed'); } finally { setBusy(null); }
  };

  const uploadReports = async (c: Checkup, files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(`upload-${key(c)}`);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('reports', f));
      fd.append('reportName', `${c.packageName} report`);
      fd.append('corporateName', corporateName || '');
      fd.append('reportDate', String(c.appointment?.date || new Date().toISOString()).slice(0, 10));
      if (c.source === 'team') {
        fd.append('employeeId', String(c.employee.id));
        fd.append('labOrderId', c.id);
        fd.append('corporateId', String(corporateId));
        await api.post('/corporate-bookings/reports/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post(`/corporate-bookings/checkups/${c.id}/reports`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      toast.success('Report uploaded and the employee notified');
      load();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Upload failed'); } finally { setBusy(null); }
  };

  const toggleHistory = async (c: Checkup) => {
    const k = key(c);
    if (history[k]) { setHistory(({ [k]: _drop, ...rest }) => rest); return; }
    setHistory((h) => ({ ...h, [k]: 'loading' }));
    try {
      const { data } = await api.get(`/corporate-bookings/bookings/${c.source}/${c.id}/history?corporateId=${corporateId}`);
      setHistory((h) => ({ ...h, [k]: data?.events || [] }));
    } catch {
      toast.error('Could not load the history');
      setHistory(({ [k]: _drop, ...rest }) => rest);
    }
  };

  if (!corporateId) return <div className="py-12 text-center text-sm text-muted-foreground">Select a corporate to view check-up bookings.</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          All check-up bookings, by the team and by employees in the app. Confirm once the lab confirms, mark completed after the visit, then upload the report.
        </p>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /><span className="ml-1.5">Refresh</span></Button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
          >
            {f} <span className="ml-1 tabular-nums opacity-75">{counts[f] || 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">{checkups.length ? `No ${filter.toLowerCase()} bookings.` : 'No check-up bookings yet.'}</div>
      ) : (
        <div className="space-y-2">
          {shown.map((c) => {
            const k = key(c);
            const label = labelOf(c.status);
            const h = history[k];
            const pending = ['pending', 'booked'].includes(c.status);
            const confirmed = ['confirmed', 'scheduled', 'rescheduled'].includes(c.status);
            const canUpload = c.source === 'team'
              ? ['confirmed', 'completed', 'sample_collected', 'processing'].includes(c.status)
              : ['confirmed', 'scheduled', 'rescheduled', 'completed', 'reports_available'].includes(c.status);
            return (
              <div key={k} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-primary" />
                      <span className="font-medium text-foreground">{c.employee?.name || `Employee #${c.employee?.id}`}</span>
                      <Badge variant="outline" className={STATUS_CLS[label] || ''}>{label}</Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {c.source === 'team' ? <Users className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                        {c.source === 'team' ? 'Booked by team' : 'Booked in app'}
                      </span>
                      {c.isDemo && <Badge variant="outline" className="border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-600">Demo</Badge>}
                    </div>
                    {c.isDemo && (
                      <div className="mt-1 text-xs text-fuchsia-600">Sales demo login, not a real employee. Do not book a lab slot. Approving or uploading a sample report only updates the demo app.</div>
                    )}
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {c.packageName} · {c.lab?.name || 'Lab not set'} · {fmtDate(c.appointment?.date)} {c.appointment?.timeSlot}
                      {c.beneficiary?.relation && c.beneficiary.relation !== 'self' ? ` · for ${c.beneficiary?.name} (${c.beneficiary.relation})` : ''}
                      {c.reportCount ? ` · ${c.reportCount} report(s)` : ''}
                      {c.bookingReference ? <span className="ml-1 font-mono opacity-70">· {c.bookingReference}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {pending && (
                      <Button size="sm" disabled={busy === `confirm-${k}`} onClick={() => act(c, 'confirm')}>
                        {busy === `confirm-${k}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}<span className="ml-1.5">Confirm</span>
                      </Button>
                    )}
                    {confirmed && (
                      <Button size="sm" variant="outline" disabled={busy === `complete-${k}`} onClick={() => act(c, 'complete')}>
                        {busy === `complete-${k}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}<span className="ml-1.5">Mark completed</span>
                      </Button>
                    )}
                    {canUpload && (
                      <>
                        <input ref={(el) => (fileInputs.current[k] = el)} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" onChange={(e) => uploadReports(c, e.target.files)} />
                        <Button size="sm" variant="secondary" disabled={busy === `upload-${k}`} onClick={() => fileInputs.current[k]?.click()}>
                          {busy === `upload-${k}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}<span className="ml-1.5">Upload report</span>
                        </Button>
                      </>
                    )}
                    {(pending || (confirmed && c.source === 'team')) && (
                      <Button size="sm" variant="ghost" onClick={() => { setCancelling(cancelling === k ? null : k); setReason(''); }}>
                        <XCircle className="h-4 w-4" /><span className="ml-1.5">Cancel</span>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => toggleHistory(c)} aria-expanded={!!h}>
                      <History className="h-4 w-4" /><span className="ml-1.5">History</span>
                    </Button>
                  </div>
                </div>

                {cancelling === k && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
                    <Input autoFocus placeholder="Reason for cancelling (sent to the history)" value={reason} onChange={(e) => setReason(e.target.value)} className="sm:max-w-md" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" disabled={reason.trim().length < 3 || busy === `cancel-${k}`} onClick={() => act(c, 'cancel', reason.trim())}>
                        {busy === `cancel-${k}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Cancel booking
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(null)}>Keep</Button>
                    </div>
                  </div>
                )}

                {h && (
                  <div className="mt-3 border-t border-border pt-3">
                    {h === 'loading' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ol className="space-y-1.5">
                        {h.map((e, i) => (
                          <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                            <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-primary" aria-hidden />
                            <span className="font-medium text-foreground">{i === 0 ? 'Booked' : labelOf(e.status)}</span>
                            <span className="text-muted-foreground">{fmtWhen(e.at)}</span>
                            {e.by && <span className="text-muted-foreground">by {e.by}</span>}
                            {i > 0 && e.note && <span className="text-muted-foreground">· {e.note}</span>}
                          </li>
                        ))}
                        {h.length === 1 && labelOf(c.status) !== 'Pending' && (
                          <li className="text-xs text-muted-foreground">Now {label.toLowerCase()} (changed before history was kept).</li>
                        )}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeamCheckupApprovals;
