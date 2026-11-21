/**
 * Health check-up status for one corporate: every eligible employee and where they are in the
 * annual health check-up journey, from not booked to report delivered, for one financial year.
 * Used by the Team portal (Health Check-up Status, and the tab in Corporate Health Booking) and the
 * corporate HR portal (Annual Health Checkup). Owner decision 2026-11-20: HR has full access to
 * view, download and share reports; the server records every HR access.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle, CalendarCheck, CalendarClock, CalendarX, ChevronLeft, ChevronRight, ClipboardCheck, Download, Eye,
  FileText, Hourglass, Loader2, Mail, MessageCircle, RefreshCw, Search, SearchX, Send, Share2, ShieldCheck, Stethoscope, X,
} from 'lucide-react';
import api from '@/utils/api';

type Mode = 'team' | 'hr';
type Stage = 'not_eligible' | 'not_booked' | 'booked' | 'confirmed' | 'checkup_done' | 'report_ready' | 'delivered';
/** 'eligible' (the default) = everyone with a benefit or further along; '' = everyone on the roster. */
type StageFilter = Stage | 'eligible' | '';

interface Report {
  source: 'manual' | 'email'; reportId: number; name: string | null; mimeType: string | null; sizeBytes: number | null;
  uploadedAt: string | null; checkupDate: string | null; hasFile: boolean; notifiedEmail: boolean; notifiedWhatsapp: boolean;
  lab: string | null; count: number; canShare: boolean;
}
interface Row {
  key: string;
  stage: Stage;
  employee: { userId: number; name: string | null; employeeId: string | null; department: string | null; designation: string | null; email: string | null; phone: string | null; onRoster: boolean };
  benefit: { packageName: string; validTo: string | null; active: boolean } | null;
  appointment: { source: 'employee' | 'team'; id: number; status: string; date: string | null; slot: string | null; lab: string | null; reference: string | null; bookedAt: string | null; confirmedAt: string | null; completedAt: string | null } | null;
  report: Report | null;
}
interface Summary { all: number; eligible: number; byStage: Record<Stage, number> }

interface Props {
  mode: Mode;
  corporateId?: number | string | null;
  corporateName?: string;
  className?: string;
  /** Classes added to every panel (HR's dark slate surface passes its own). */
  cardClassName?: string;
  /** Show the section title (off when the page already has one). */
  showTitle?: boolean;
}

/** The journey, in order. "No active benefit" sits outside it. */
const JOURNEY: Stage[] = ['not_booked', 'booked', 'confirmed', 'checkup_done', 'report_ready', 'delivered'];
const STAGE: Record<Stage, { label: string; short: string; icon: ReactNode; dot: string; pill: string; bar: string }> = {
  not_eligible: { label: 'No active benefit', short: 'No benefit', icon: <CalendarX className="h-3.5 w-3.5" />, dot: 'bg-muted-foreground/40', pill: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground/30' },
  not_booked: { label: 'Not booked', short: 'Not booked', icon: <CalendarClock className="h-3.5 w-3.5" />, dot: 'bg-slate-400', pill: 'bg-slate-500/15 text-slate-600 dark:text-slate-300', bar: 'bg-slate-400' },
  booked: { label: 'Pending confirmation', short: 'Pending', icon: <Hourglass className="h-3.5 w-3.5" />, dot: 'bg-amber-500', pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' },
  confirmed: { label: 'Appointment confirmed', short: 'Confirmed', icon: <CalendarCheck className="h-3.5 w-3.5" />, dot: 'bg-sky-500', pill: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', bar: 'bg-sky-500' },
  checkup_done: { label: 'Check-up done', short: 'Done', icon: <Stethoscope className="h-3.5 w-3.5" />, dot: 'bg-violet-500', pill: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', bar: 'bg-violet-500' },
  report_ready: { label: 'Report ready', short: 'Report ready', icon: <FileText className="h-3.5 w-3.5" />, dot: 'bg-teal-500', pill: 'bg-teal-500/15 text-teal-700 dark:text-teal-300', bar: 'bg-teal-500' },
  delivered: { label: 'Report delivered', short: 'Delivered', icon: <ClipboardCheck className="h-3.5 w-3.5" />, dot: 'bg-emerald-500', pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
};

const PAGE_SIZE = 25;
const EMPTY: Summary = { all: 0, eligible: 0, byStage: { not_eligible: 0, not_booked: 0, booked: 0, confirmed: 0, checkup_done: 0, report_ready: 0, delivered: 0 } };
const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const fmtDate = (v: string | null) => (v ? new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtSize = (b: number | null) => (b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const titleCase = (s: string | null) => (s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '');
const initials = (name: string | null) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
const TONES = ['bg-sky-500/15 text-sky-600 dark:text-sky-300', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', 'bg-violet-500/15 text-violet-600 dark:text-violet-300', 'bg-amber-500/15 text-amber-700 dark:text-amber-300', 'bg-rose-500/15 text-rose-600 dark:text-rose-300', 'bg-teal-500/15 text-teal-600 dark:text-teal-300'];
function fyOptions() {
  const [y, m] = todayIst().split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return [0, 1, 2].map((i) => { const s = start - i; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; });
}
const fileName = (row: Row) => `${(row.employee.name || 'employee').trim().replace(/[^A-Za-z0-9]+/g, '-')}-${(row.report?.name || 'health-report').replace(/[^A-Za-z0-9.]+/g, '-')}`
  .replace(/-+/g, '-').slice(0, 120) + (/\.\w{2,4}$/.test(row.report?.name || '') ? '' : '.pdf');

export default function HealthCheckupStatusBoard({ mode, corporateId, corporateName = '', className = '', cardClassName = '', showTitle = true }: Props) {
  const { toast } = useToast();
  const base = mode === 'team' ? '/corporate-bookings' : '/corporate';
  const corpParam = mode === 'team' && corporateId ? String(corporateId) : '';
  const years = useMemo(fyOptions, []);

  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fy, setFy] = useState(years[0]);
  const [stage, setStage] = useState<StageFilter>('eligible');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);
  const [preview, setPreview] = useState<{ row: Row; url: string | null; type: string; error: string } | null>(null);
  const [shareRow, setShareRow] = useState<Row | null>(null);
  const [shareEmail, setShareEmail] = useState(true);
  const [shareWhatsapp, setShareWhatsapp] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (nextPage = 1) => {
    if (mode === 'team' && !corporateId) return;
    const id = ++seq.current;
    setLoading(true); setLoadError('');
    try {
      const params = new URLSearchParams({ fy, page: String(nextPage), limit: String(PAGE_SIZE) });
      if (corpParam) params.set('corporateId', corpParam);
      if (debounced) params.set('search', debounced);
      if (stage) params.set('stage', stage);
      const { data } = await api.get(`${base}/checkup-status?${params.toString()}`);
      if (id !== seq.current) return;
      setRows(data.data.rows || []);
      setSummary({ ...EMPTY, ...(data.data.summary || {}), byStage: { ...EMPTY.byStage, ...(data.data.summary?.byStage || {}) } });
      setTotal(data.data.total || 0);
      setPage(nextPage);
    } catch (err: any) {
      if (id === seq.current) setLoadError(err?.response?.data?.message || 'Could not load health check-up status.');
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [base, corpParam, corporateId, debounced, fy, mode, stage]);
  useEffect(() => { load(1); }, [load]);

  // ── report actions ──
  const fileUrl = (row: Row, download: boolean) => {
    const q = [corpParam ? `corporateId=${encodeURIComponent(corpParam)}` : '', download ? 'download=1' : ''].filter(Boolean).join('&');
    return `${base}/checkup-reports/${row.report!.source}/${row.report!.reportId}/file${q ? `?${q}` : ''}`;
  };
  const errorText = async (err: any) => {
    try { const b = JSON.parse(await err?.response?.data?.text?.()); if (b?.message) return b.message as string; } catch { /* not JSON */ }
    return 'The report file is unavailable right now. Please try again.';
  };
  const openPreview = async (row: Row) => {
    if (!row.report?.hasFile) return;
    setPreview({ row, url: null, type: row.report.mimeType || 'application/pdf', error: '' });
    try {
      const res = await api.get(fileUrl(row, false), { responseType: 'blob' });
      const type = res.data?.type || row.report.mimeType || 'application/pdf';
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      setPreview((p) => { if (p && p.row.key === row.key) return { ...p, url, type }; URL.revokeObjectURL(url); return p; });
    } catch (err) {
      const error = await errorText(err);
      setPreview((p) => (p && p.row.key === row.key ? { ...p, error } : p));
    }
  };
  const closePreview = () => setPreview((p) => { if (p?.url) URL.revokeObjectURL(p.url); return null; });
  const download = async (row: Row) => {
    if (!row.report?.hasFile) return;
    setBusy(`${row.key}-dl`);
    try {
      const res = await api.get(fileUrl(row, true), { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: res.data?.type || row.report.mimeType || 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = fileName(row);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast({ title: 'Download failed', description: await errorText(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };
  const askShare = (row: Row) => { setShareEmail(!!row.employee.email); setShareWhatsapp(!!row.employee.phone); setShareRow(row); };
  const confirmShare = async () => {
    if (!shareRow?.report) return;
    setSharing(true);
    try {
      const body = { sendEmail: shareEmail, sendWhatsapp: shareWhatsapp };
      const { data } = mode === 'team'
        ? await api.post(`/corporate-bookings/reports/${shareRow.report.reportId}/share`, { ...body, corporateId, corporateName })
        : await api.post(`/corporate/checkup-reports/${shareRow.report.reportId}/share`, body);
      const n = data?.notifications || {};
      const sent = [n.email === 'sent' && 'email', n.whatsapp === 'sent' && 'WhatsApp'].filter(Boolean).join(' and ');
      toast({ title: sent ? `Report sent by ${sent}` : 'Report could not be delivered', description: sent ? `${titleCase(shareRow.employee.name) || 'The employee'} has been sent a secure link to the report.` : `Email: ${n.email || 'skipped'} · WhatsApp: ${n.whatsapp || 'skipped'}`, variant: sent ? undefined : 'destructive' });
      setShareRow(null); load(page);
    } catch (err: any) {
      toast({ title: 'Could not send the report', description: err?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally { setSharing(false); }
  };

  const panel = `rounded-xl border bg-card text-card-foreground ${cardClassName}`;
  const eligible = summary.eligible;
  const completed = summary.byStage.checkup_done + summary.byStage.report_ready + summary.byStage.delivered;
  const completedPct = eligible ? Math.round((completed / eligible) * 100) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = !!(debounced || stage !== 'eligible');
  const realStage = stage && stage !== 'eligible' ? stage : null;
  const resetFilters = () => { setSearch(''); setDebounced(''); setStage('eligible'); };
  const today = todayIst();

  return (
    <TooltipProvider delayDuration={200}>
      <section className={`space-y-4 ${className}`} aria-label="Health check-up status">
        {showTitle && (
          <div>
            <h2 className="text-base font-semibold tracking-tight flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-emerald-500" /> Health check-up status</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Every eligible employee and where they are, from not booked to report delivered.</p>
          </div>
        )}

        {/* Journey overview */}
        <div className={`${panel} p-4 sm:p-5`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Financial year {fy} · {eligible.toLocaleString('en-IN')} eligible employee{eligible === 1 ? '' : 's'}</p>
              {loading && !rows.length ? <Skeleton className="h-7 w-64 mt-1.5" /> : (
                <p className="text-xl font-semibold tracking-tight mt-0.5">
                  <span className="tabular-nums">{completed.toLocaleString('en-IN')}</span> of <span className="tabular-nums">{eligible.toLocaleString('en-IN')}</span> have completed their check-up
                  <span className="ml-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">{completedPct}%</span>
                </p>
              )}
            </div>
            <Select value={fy} onValueChange={(v) => { setFy(v); setStage('eligible'); }}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Financial year"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>FY {y}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* stacked distribution */}
          <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Employees at each stage">
            {eligible > 0 && JOURNEY.map((s) => summary.byStage[s] > 0 && (
              <div key={s} className={`${STAGE[s].bar} h-full transition-all`} style={{ width: `${(summary.byStage[s] / eligible) * 100}%` }} title={`${STAGE[s].label}: ${summary.byStage[s]}`} />
            ))}
          </div>

          {/* stage steps */}
          <ol className="mt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 auto-rows-fr gap-2">
            {JOURNEY.map((s, i) => {
              const n = summary.byStage[s];
              const active = stage === s;
              return (
                <li key={s} className="h-full">
                  <button type="button" onClick={() => setStage(active ? 'eligible' : s)} aria-pressed={active}
                    className={`h-full w-full flex flex-col justify-between text-left rounded-lg border px-3 py-2.5 transition-colors ${active ? 'border-primary/60 bg-primary/5' : 'hover:bg-muted/50'}`}>
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ${STAGE[s].dot}`}>{i + 1}</span>
                      {STAGE[s].label}
                    </span>
                    <span className="mt-1 flex items-baseline gap-1.5">
                      {loading && !rows.length ? <Skeleton className="h-6 w-10" /> : <span className="text-xl font-semibold tabular-nums">{n.toLocaleString('en-IN')}</span>}
                      {eligible > 0 && !loading && <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round((n / eligible) * 100)}%</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {summary.byStage.not_eligible > 0 && (
            <button type="button" onClick={() => setStage(stage === 'not_eligible' ? 'eligible' : 'not_eligible')} aria-pressed={stage === 'not_eligible'}
              className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${stage === 'not_eligible' ? 'border-primary/60 bg-primary/5 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <CalendarX className="h-3.5 w-3.5" /> {summary.byStage.not_eligible.toLocaleString('en-IN')} on the roster with no active check-up benefit this year
            </button>
          )}
        </div>

        {/* Toolbar + table */}
        <div className={panel}>
          <div className="p-3 sm:p-4 border-b flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, employee ID, department, email or phone" className="pl-9 h-9" aria-label="Search employees" />
            </div>
            <div className="flex items-center gap-1.5">
              {realStage && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STAGE[realStage].pill}`}>
                  {STAGE[realStage].icon} {STAGE[realStage].label}
                  <button type="button" onClick={() => setStage('eligible')} aria-label="Remove stage filter" className="ml-0.5 opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
                </span>
              )}
              {filtersActive && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>Clear</Button>}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load(page)} disabled={loading} aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {loadError ? (
            <Empty icon={<AlertTriangle className="h-5 w-5 text-destructive" />} title="Could not load the status" text={loadError} action={<Button size="sm" variant="outline" onClick={() => load(page)}>Try again</Button>} />
          ) : loading && !rows.length ? (
            <div className="divide-y">{Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-44" /><Skeleton className="h-3 w-28" /></div>
                <Skeleton className="h-3.5 w-28 hidden lg:block" /><Skeleton className="h-3.5 w-32 hidden md:block" /><Skeleton className="h-6 w-40" />
              </div>
            ))}</div>
          ) : !rows.length ? (
            filtersActive
              ? <Empty icon={<SearchX className="h-5 w-5 text-muted-foreground" />} title="No matches" text="No employees match these filters." action={<Button size="sm" variant="outline" onClick={resetFilters}>Clear filters</Button>} />
              : summary.byStage.not_eligible > 0
                ? <Empty icon={<CalendarX className="h-5 w-5 text-muted-foreground" />} title="No one has an active check-up benefit this year" text={`${summary.byStage.not_eligible.toLocaleString('en-IN')} employees are on the roster without an active annual check-up package for FY ${fy}.`} action={<Button size="sm" variant="outline" onClick={() => setStage('not_eligible')}>Show them</Button>} />
                : <Empty icon={<ClipboardCheck className="h-5 w-5 text-muted-foreground" />} title="No employees yet" text="Employees appear here once they are on the roster or have a check-up benefit." />
          ) : (
            <>
              <div className={`hidden md:block overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
                <table className="w-full table-fixed text-sm min-w-[980px]">
                  <colgroup><col className="w-[21%]" /><col className="w-[14%]" /><col className="w-[17%]" /><col className="w-[20%]" /><col className="w-[16%]" /><col className="w-[12%]" /></colgroup>
                  <thead>
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
                      <th className="px-4 py-2.5 font-medium">Employee</th>
                      <th className="px-3 py-2.5 font-medium">Check-up benefit</th>
                      <th className="px-3 py-2.5 font-medium">Appointment</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Report</th>
                      <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <tr key={row.key} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 align-middle"><EmployeeCell row={row} /></td>
                        <td className="px-3 py-3 align-middle"><BenefitCell row={row} /></td>
                        <td className="px-3 py-3 align-middle"><AppointmentCell row={row} today={today} /></td>
                        <td className="px-3 py-3 align-middle"><StageCell stage={row.stage} /></td>
                        <td className="px-3 py-3 align-middle"><ReportCell row={row} onOpen={() => openPreview(row)} /></td>
                        <td className="px-4 py-3 align-middle"><Actions row={row} busy={busy} onView={() => openPreview(row)} onDownload={() => download(row)} onShare={() => askShare(row)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className={`md:hidden divide-y ${loading ? 'opacity-60' : ''}`}>
                {rows.map((row) => (
                  <li key={row.key} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3"><EmployeeCell row={row} /><StagePill stage={row.stage} /></div>
                    <StageTrack stage={row.stage} />
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><p className="text-muted-foreground mb-0.5">Benefit</p><BenefitCell row={row} /></div>
                      <div><p className="text-muted-foreground mb-0.5">Appointment</p><AppointmentCell row={row} today={today} /></div>
                    </div>
                    {row.report && (
                      <div className="flex items-center justify-between gap-2">
                        <ReportCell row={row} onOpen={() => openPreview(row)} />
                        <Actions row={row} busy={busy} onView={() => openPreview(row)} onDownload={() => download(row)} onShare={() => askShare(row)} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t text-xs text-muted-foreground">
                <span className="tabular-nums">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString('en-IN')}</span>
                {pages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1 || loading} onClick={() => load(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="px-2 tabular-nums">Page {page} of {pages}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pages || loading} onClick={() => load(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {mode === 'hr' && <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Health reports are confidential medical records. Every view, download and share is recorded.</p>}

        {/* Report preview */}
        <Sheet open={!!preview} onOpenChange={(o) => { if (!o) closePreview(); }}>
          <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col gap-0">
            {preview?.row.report && (
              <>
                <SheetHeader className="px-5 py-4 border-b space-y-1 text-left">
                  <SheetTitle className="text-base pr-8 truncate">{preview.row.report.name || 'Health report'}</SheetTitle>
                  <SheetDescription className="text-xs">{titleCase(preview.row.employee.name) || 'Employee'}{preview.row.employee.employeeId ? ` · ${preview.row.employee.employeeId}` : ''} · Check-up {fmtDate(preview.row.report.checkupDate)}</SheetDescription>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => download(preview.row)} disabled={busy === `${preview.row.key}-dl`}>
                      {busy === `${preview.row.key}-dl` ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Download
                    </Button>
                    {preview.row.report.canShare && <Button size="sm" variant="outline" onClick={() => askShare(preview.row)}><Share2 className="h-4 w-4 mr-1.5" /> Send to employee</Button>}
                  </div>
                </SheetHeader>
                <div className="flex-1 min-h-0 bg-muted/40">
                  {preview.error ? <Empty icon={<AlertTriangle className="h-5 w-5 text-destructive" />} title="Could not open the report" text={preview.error} />
                    : !preview.url ? <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /> Loading report{preview.row.report.sizeBytes ? ` (${fmtSize(preview.row.report.sizeBytes)})` : ''}…</div>
                      : preview.type.startsWith('image/') ? <div className="h-full overflow-auto p-4 flex items-start justify-center"><img src={preview.url} alt={preview.row.report.name || 'Health report'} className="max-w-full rounded-md shadow" /></div>
                        : <iframe title="Health report preview" src={preview.url} className="w-full h-full border-0" />}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Send confirmation */}
        <Dialog open={!!shareRow} onOpenChange={(o) => { if (!o && !sharing) setShareRow(null); }}>
          <DialogContent className="sm:max-w-md">
            {shareRow?.report && (
              <>
                <DialogHeader>
                  <DialogTitle>Send report to {titleCase(shareRow.employee.name) || 'the employee'}</DialogTitle>
                  <DialogDescription>The employee receives a secure link to “{shareRow.report.name || 'their health report'}”.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-1">
                  <Channel icon={<Mail className="h-4 w-4" />} label="Email" detail={shareRow.employee.email} checked={shareEmail} onChange={setShareEmail} already={shareRow.report.notifiedEmail} />
                  <Channel icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" detail={shareRow.employee.phone} checked={shareWhatsapp} onChange={setShareWhatsapp} already={shareRow.report.notifiedWhatsapp} />
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="ghost" onClick={() => setShareRow(null)} disabled={sharing}>Cancel</Button>
                  <Button onClick={confirmShare} disabled={sharing || (!shareEmail && !shareWhatsapp)}>{sharing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />} Send report</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </section>
    </TooltipProvider>
  );
}

function EmployeeCell({ row }: { row: Row }) {
  const e = row.employee;
  const sub = [e.employeeId, titleCase(e.department || e.designation)].filter(Boolean);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${TONES[Math.abs(e.userId) % TONES.length]}`} aria-hidden>{initials(e.name)}</span>
      <div className="min-w-0">
        <div className="font-medium truncate" title={e.name || ''}>{titleCase(e.name) || '—'}</div>
        <div className="text-xs text-muted-foreground truncate" title={[e.employeeId, e.department, e.designation, e.email, e.phone].filter(Boolean).join(' · ')}>
          {sub.length ? <>{e.employeeId && <span className="font-mono">{e.employeeId}</span>}{e.employeeId && sub.length > 1 && ' · '}{sub.length > 1 || !e.employeeId ? sub[sub.length - 1] : ''}</> : (e.email || e.phone || '')}
          {!e.onRoster && <span className="ml-1.5 text-amber-600 dark:text-amber-400">· not on roster</span>}
        </div>
      </div>
    </div>
  );
}

function BenefitCell({ row }: { row: Row }) {
  const b = row.benefit;
  if (!b) return <span className="text-xs text-muted-foreground">No check-up benefit</span>;
  return (
    <div className="min-w-0">
      <div className={`truncate text-sm ${b.active ? '' : 'text-muted-foreground'}`} title={b.packageName}>{b.packageName}</div>
      <div className={`text-xs truncate ${b.active ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>{b.active ? `Valid till ${fmtDate(b.validTo)}` : 'Inactive'}</div>
    </div>
  );
}

function AppointmentCell({ row, today }: { row: Row; today: string }) {
  const a = row.appointment;
  if (!a) return <span className="text-xs text-muted-foreground">{row.stage === 'not_booked' ? 'Not booked yet' : '—'}</span>;
  const overdue = row.stage === 'confirmed' && a.date && a.date.slice(0, 10) < today;
  const cancelled = a.status === 'cancelled';
  return (
    <div className="min-w-0">
      <div className={`font-medium tabular-nums ${cancelled ? 'line-through text-muted-foreground' : ''}`}>{fmtDate(a.date)}{a.slot ? <span className="font-normal text-muted-foreground"> · {a.slot}</span> : null}</div>
      <div className="text-xs text-muted-foreground truncate" title={[a.lab, a.reference].filter(Boolean).join(' · ')}>{a.lab || 'Lab not set'}</div>
      <div className="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-1.5">
        <span className="text-muted-foreground">{a.source === 'team' ? 'Booked by Team' : 'Booked by employee'}</span>
        {cancelled && <span className="text-rose-600 dark:text-rose-400">Cancelled</span>}
        {overdue && <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 whitespace-nowrap" title="The appointment date has passed. Update the booking once the check-up is done.">· <AlertTriangle className="h-3 w-3" /> Date passed</span>}
      </div>
    </div>
  );
}

function StagePill({ stage }: { stage: Stage }) {
  const s = STAGE[stage];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${s.pill}`}>{s.icon} {s.label}</span>;
}

function StageTrack({ stage }: { stage: Stage }) {
  const at = JOURNEY.indexOf(stage);
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {JOURNEY.map((s, i) => (
        <span key={s} className={`h-1.5 flex-1 rounded-full ${at >= 0 && i <= at ? STAGE[stage].bar : 'bg-muted'}`} />
      ))}
    </div>
  );
}

function StageCell({ stage }: { stage: Stage }) {
  return (
    <div className="space-y-2">
      <StagePill stage={stage} />
      {stage !== 'not_eligible' && <StageTrack stage={stage} />}
    </div>
  );
}

function ReportCell({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const r = row.report;
  if (!r) return <span className="text-xs text-muted-foreground">{row.stage === 'checkup_done' ? 'Awaiting report' : '—'}</span>;
  const meta = r.hasFile ? [fmtSize(r.sizeBytes), r.uploadedAt ? fmtDate(r.uploadedAt) : ''].filter(Boolean).join(' · ') : 'File not stored, upload again';
  const inner = (
    <>
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${r.hasFile ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'}`}><FileText className="h-4 w-4" /></span>
      <span className="min-w-0 text-left">
        <span className={`block truncate font-medium ${r.hasFile ? 'group-hover/r:text-primary' : 'text-muted-foreground'}`} title={r.name || ''}>{r.name || 'Health report'}</span>
        <span className="block text-xs text-muted-foreground truncate">{meta}{r.count > 1 ? ` · +${r.count - 1} more` : ''}</span>
      </span>
    </>
  );
  return r.hasFile
    ? <button type="button" onClick={onOpen} className="group/r flex items-center gap-2 min-w-0 max-w-full rounded-md -m-1 p-1 hover:bg-muted/60 transition-colors">{inner}</button>
    : <div className="flex items-center gap-2 min-w-0">{inner}</div>;
}

function Actions({ row, busy, onView, onDownload, onShare }: { row: Row; busy: string | null; onView: () => void; onDownload: () => void; onShare: () => void }) {
  if (!row.report?.hasFile) return <div className="text-right text-xs text-muted-foreground">—</div>;
  const dl = busy === `${row.key}-dl`;
  const icon = (label: string, node: ReactNode, onClick: () => void, disabled = false) => (
    <Tooltip>
      <TooltipTrigger asChild><Button variant="outline" size="icon" className="h-8 w-8" onClick={onClick} disabled={disabled} aria-label={label}>{node}</Button></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <div className="flex items-center justify-end gap-1.5">
      {icon('View report', <Eye className="h-4 w-4" />, onView)}
      {icon('Download', dl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />, onDownload, dl)}
      {row.report.canShare ? icon('Send to employee', <Share2 className="h-4 w-4" />, onShare) : (
        <Tooltip>
          <TooltipTrigger asChild><span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dashed text-muted-foreground/40"><Share2 className="h-4 w-4" /></span></TooltipTrigger>
          <TooltipContent>Lab reports received by email are already with the employee</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function Channel({ icon, label, detail, checked, onChange, already }: { icon: ReactNode; label: string; detail: string | null; checked: boolean; onChange: (v: boolean) => void; already: boolean }) {
  return (
    <label className={`flex items-center gap-3 rounded-lg border p-3 ${detail ? 'cursor-pointer hover:bg-muted/40' : 'opacity-60'}`}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}{already && <span className="ml-2 text-[11px] font-normal text-emerald-600 dark:text-emerald-400">sent before</span>}</span>
        <span className="block text-xs text-muted-foreground truncate">{detail || `No ${label.toLowerCase()} on file`}</span>
      </span>
      <Switch checked={checked && !!detail} onCheckedChange={onChange} disabled={!detail} aria-label={`Send by ${label}`} />
    </label>
  );
}

function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 px-6 py-14">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted">{icon}</span>
      <p className="text-sm font-medium mt-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
