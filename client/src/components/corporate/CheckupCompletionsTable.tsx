/**
 * Completed health check-ups with their reports, for one corporate. Used by the Team portal
 * (Completed Check-ups page, and the tab in Corporate Health Booking) and the corporate HR portal
 * (Annual Health Checkup). Owner decision 2026-11-20: HR has full access to view, download and
 * share reports; the server records every HR access.
 *
 * Files are fetched with the signed-in session and shown in an in-app preview or saved locally,
 * so no public link is made.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock, Download, Eye, FileCheck2, FileText,
  Loader2, Mail, MessageCircle, RefreshCw, Search, SearchX, Send, Share2, ShieldCheck, Users, X,
} from 'lucide-react';
import api from '@/utils/api';

type Mode = 'team' | 'hr';
type Status = '' | 'report_available' | 'not_sent' | 'awaiting_report';

interface CompletionRow {
  key: string;
  source: 'manual' | 'email' | 'booking';
  reportId: number;
  employee: { userId: number; name: string | null; employeeId: string | null; department: string | null; designation: string | null; email: string | null; phone: string | null };
  checkupDate: string | null;
  checkupType: string | null;
  labName: string | null;
  orderNumber: string | null;
  report: null | { name: string; mimeType: string | null; sizeBytes: number | null; uploadedAt: string | null; hasFile: boolean; notifiedEmail: boolean; notifiedWhatsapp: boolean; slaStatus: string | null; deliveredAt: string | null };
  status: 'report_available' | 'awaiting_report';
  canShare: boolean;
}

interface Summary { employeesCompleted: number; reports: number; awaitingReports: number; sentToEmployee: number; notSent: number; all: number }

interface Props {
  mode: Mode;
  corporateId?: number | string | null;
  corporateName?: string;
  /** Classes for the outer wrapper. */
  className?: string;
  /** Classes added to every panel (HR's dark slate surface passes its own). */
  cardClassName?: string;
  /** Show the section title (off when the page already has one). */
  showTitle?: boolean;
}

const PAGE_SIZE = 25;
const EMPTY_SUMMARY: Summary = { employeesCompleted: 0, reports: 0, awaitingReports: 0, sentToEmployee: 0, notSent: 0, all: 0 };
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtSize = (b: number | null) => (b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const typeLabel = (t: string | null) => (t ? t.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Health check-up');
const titleCase = (s: string | null) => (s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '—');
const initials = (name: string | null) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
const AVATAR_TONES = [
  'bg-sky-500/15 text-sky-600 dark:text-sky-300', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  'bg-violet-500/15 text-violet-600 dark:text-violet-300', 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-600 dark:text-rose-300', 'bg-teal-500/15 text-teal-600 dark:text-teal-300',
];
const toneFor = (seed: number) => AVATAR_TONES[Math.abs(seed) % AVATAR_TONES.length];
const safeFileName = (row: CompletionRow) =>
  `${(row.employee.name || 'employee').trim().replace(/[^A-Za-z0-9]+/g, '-')}-${(row.report?.name || 'health-report').replace(/[^A-Za-z0-9.]+/g, '-')}`
    .replace(/-+/g, '-').slice(0, 120) + (/\.\w{2,4}$/.test(row.report?.name || '') ? '' : '.pdf');

export default function CheckupCompletionsTable({ mode, corporateId, corporateName = '', className = '', cardClassName = '', showTitle = true }: Props) {
  const { toast } = useToast();
  const base = mode === 'team' ? '/corporate-bookings' : '/corporate';
  const corpQuery = mode === 'team' && corporateId ? `corporateId=${encodeURIComponent(String(corporateId))}` : '';

  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<Status>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // Preview drawer
  const [preview, setPreview] = useState<{ row: CompletionRow; url: string | null; type: string; error: string } | null>(null);
  // Share dialog
  const [shareRow, setShareRow] = useState<CompletionRow | null>(null);
  const [shareEmail, setShareEmail] = useState(true);
  const [shareWhatsapp, setShareWhatsapp] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (nextPage = 1) => {
    if (mode === 'team' && !corporateId) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      if (corpQuery) params.set('corporateId', String(corporateId));
      if (debounced) params.set('search', debounced);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (status) params.set('status', status);
      const { data } = await api.get(`${base}/checkup-completions?${params.toString()}`);
      if (seq !== requestSeq.current) return;
      setRows(data.data.rows || []);
      setSummary({ ...EMPTY_SUMMARY, ...(data.data.summary || {}) });
      setTotal(data.data.total || 0);
      setPage(nextPage);
    } catch (err: any) {
      if (seq !== requestSeq.current) return;
      setLoadError(err?.response?.data?.message || 'Could not load completed check-ups.');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [base, corpQuery, corporateId, debounced, from, mode, status, to]);

  useEffect(() => { load(1); }, [load]);

  const fileUrl = (row: CompletionRow, download: boolean) => {
    const q = [corpQuery, download ? 'download=1' : ''].filter(Boolean).join('&');
    return `${base}/checkup-reports/${row.source}/${row.reportId}/file${q ? `?${q}` : ''}`;
  };
  const errorMessage = async (err: any) => {
    try { const body = JSON.parse(await err?.response?.data?.text?.()); if (body?.message) return body.message as string; } catch { /* not JSON */ }
    return 'The report file is unavailable right now. Please try again.';
  };

  const openPreview = async (row: CompletionRow) => {
    if (!row.report?.hasFile) return;
    setPreview({ row, url: null, type: row.report.mimeType || 'application/pdf', error: '' });
    try {
      const res = await api.get(fileUrl(row, false), { responseType: 'blob' });
      const type = res.data?.type || row.report.mimeType || 'application/pdf';
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      setPreview((p) => (p && p.row.key === row.key ? { ...p, url, type } : (URL.revokeObjectURL(url), p)));
    } catch (err) {
      const error = await errorMessage(err);
      setPreview((p) => (p && p.row.key === row.key ? { ...p, error } : p));
    }
  };
  const closePreview = () => setPreview((p) => { if (p?.url) URL.revokeObjectURL(p.url); return null; });

  const download = async (row: CompletionRow) => {
    if (!row.report?.hasFile) return;
    setBusy(`${row.key}-dl`);
    try {
      const res = await api.get(fileUrl(row, true), { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: res.data?.type || row.report.mimeType || 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = safeFileName(row);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast({ title: 'Download failed', description: await errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const askShare = (row: CompletionRow) => {
    setShareEmail(!!row.employee.email);
    setShareWhatsapp(!!row.employee.phone);
    setShareRow(row);
  };
  const confirmShare = async () => {
    if (!shareRow) return;
    setSharing(true);
    try {
      const body = { sendEmail: shareEmail, sendWhatsapp: shareWhatsapp };
      const { data } = mode === 'team'
        ? await api.post(`/corporate-bookings/reports/${shareRow.reportId}/share`, { ...body, corporateId, corporateName })
        : await api.post(`/corporate/checkup-reports/${shareRow.reportId}/share`, body);
      const n = data?.notifications || {};
      const sent = [n.email === 'sent' && 'email', n.whatsapp === 'sent' && 'WhatsApp'].filter(Boolean).join(' and ');
      toast({ title: sent ? `Report sent by ${sent}` : 'Report could not be delivered', description: sent ? `${shareRow.employee.name || 'The employee'} has been sent a secure link to the report.` : `Email: ${n.email || 'skipped'} · WhatsApp: ${n.whatsapp || 'skipped'}`, variant: sent ? undefined : 'destructive' });
      setShareRow(null);
      load(page);
    } catch (err: any) {
      toast({ title: 'Could not share the report', description: err?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSharing(false);
    }
  };

  const filtersActive = !!(debounced || from || to || status);
  const clearFilters = () => { setSearch(''); setDebounced(''); setFrom(''); setTo(''); setStatus(''); };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sentPct = summary.reports ? Math.round((summary.sentToEmployee / summary.reports) * 100) : 0;
  const panel = `rounded-xl border bg-card text-card-foreground ${cardClassName}`;

  const chips: { id: Status; label: string; count: number }[] = useMemo(() => [
    { id: '', label: 'All', count: summary.all },
    { id: 'report_available', label: 'Report ready', count: summary.reports },
    { id: 'not_sent', label: 'Not sent yet', count: summary.notSent },
    { id: 'awaiting_report', label: 'Awaiting report', count: summary.awaitingReports },
  ], [summary]);

  return (
    <TooltipProvider delayDuration={200}>
      <section className={`space-y-4 ${className}`} aria-label="Completed check-ups and reports">
        {showTitle && (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-emerald-500" /> Completed check-ups &amp; reports</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Employees who completed their health check-up. View, download or send each report to the employee.</p>
            </div>
          </div>
        )}

        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi panel={panel} icon={<Users className="h-4 w-4" />} tone="text-sky-500 bg-sky-500/10" label="Employees completed" value={summary.employeesCompleted} loading={loading && !rows.length} />
          <Kpi panel={panel} icon={<FileCheck2 className="h-4 w-4" />} tone="text-emerald-500 bg-emerald-500/10" label="Reports ready" value={summary.reports} loading={loading && !rows.length} />
          <Kpi panel={panel} icon={<Send className="h-4 w-4" />} tone="text-violet-500 bg-violet-500/10" label="Sent to employee" value={summary.sentToEmployee} loading={loading && !rows.length}
            footer={summary.reports > 0 ? (
              <div className="mt-2.5">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${sentPct}%` }} /></div>
                <p className="text-[11px] text-muted-foreground mt-1">{sentPct}% of reports delivered</p>
              </div>
            ) : null} />
          <Kpi panel={panel} icon={summary.notSent ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            tone={summary.notSent ? 'text-amber-500 bg-amber-500/10' : 'text-muted-foreground bg-muted'}
            label={summary.notSent ? 'Not sent yet' : 'Awaiting report'} value={summary.notSent || summary.awaitingReports} loading={loading && !rows.length}
            onClick={summary.notSent ? () => setStatus('not_sent') : summary.awaitingReports ? () => setStatus('awaiting_report') : undefined}
            hint={summary.notSent ? 'Show them' : undefined} />
        </div>

        {/* Toolbar + table */}
        <div className={panel}>
          <div className="p-3 sm:p-4 border-b space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Filter by status" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
                {chips.map((c) => (
                  <button key={c.id || 'all'} role="tab" aria-selected={status === c.id} onClick={() => setStatus(c.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${status === c.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {c.label}
                    <span className={`tabular-nums rounded px-1 text-[10px] ${status === c.id ? 'bg-primary/15 text-primary' : 'bg-background/60'}`}>{c.count}</span>
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1">
                {filtersActive && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}><X className="h-3.5 w-3.5 mr-1" /> Clear filters</Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load(page)} disabled={loading} aria-label="Refresh">
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, employee ID, department, email or phone" className="pl-9 h-9" aria-label="Search employees" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 h-9">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Check-up from"
                    className="bg-transparent text-sm outline-none w-[8.5rem] [color-scheme:inherit]" />
                  <span className="text-muted-foreground text-xs">to</span>
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Check-up to"
                    className="bg-transparent text-sm outline-none w-[8.5rem] [color-scheme:inherit]" />
                </div>
              </div>
            </div>
          </div>

          {loadError ? (
            <EmptyState icon={<AlertTriangle className="h-5 w-5 text-destructive" />} title="Could not load check-ups" text={loadError}
              action={<Button size="sm" variant="outline" onClick={() => load(page)}>Try again</Button>} />
          ) : loading && rows.length === 0 ? (
            <div className="divide-y">{Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-48" /><Skeleton className="h-3 w-32" /></div>
                <Skeleton className="h-3.5 w-24 hidden md:block" /><Skeleton className="h-8 w-40 hidden md:block" /><Skeleton className="h-8 w-28" />
              </div>
            ))}</div>
          ) : rows.length === 0 ? (
            filtersActive
              ? <EmptyState icon={<SearchX className="h-5 w-5 text-muted-foreground" />} title="No matches" text="No completed check-ups match these filters." action={<Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>} />
              : <EmptyState icon={<FileCheck2 className="h-5 w-5 text-muted-foreground" />} title="No completed check-ups yet" text="Employees appear here once their check-up is done and the report is uploaded." />
          ) : (
            <>
              {/* Desktop table */}
              <div className={`hidden md:block overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
                <table className="w-full table-fixed text-sm min-w-[860px]">
                  <colgroup><col className="w-[26%]" /><col className="w-[16%]" /><col className="w-[28%]" /><col className="w-[11%]" /><col className="w-[19%]" /></colgroup>
                  <thead>
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
                      <th className="px-4 py-2.5 font-medium">Employee</th>
                      <th className="px-3 py-2.5 font-medium">Check-up</th>
                      <th className="px-3 py-2.5 font-medium">Report</th>
                      <th className="px-3 py-2.5 font-medium">Delivered</th>
                      <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <tr key={row.key} className="group hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 align-middle"><EmployeeCell row={row} /></td>
                        <td className="px-3 py-3 align-middle">
                          <div className="font-medium tabular-nums">{fmtDate(row.checkupDate)}</div>
                          <div className="text-xs text-muted-foreground truncate" title={`${typeLabel(row.checkupType)}${row.labName ? ` · ${row.labName}` : ''}`}>{typeLabel(row.checkupType)}{row.labName ? ` · ${row.labName}` : ''}</div>
                        </td>
                        <td className="px-3 py-3 align-middle"><ReportCell row={row} onOpen={() => openPreview(row)} /></td>
                        <td className="px-3 py-3 align-middle"><DeliveryCell row={row} /></td>
                        <td className="px-4 py-3 align-middle">
                          <RowActions row={row} busy={busy} onView={() => openPreview(row)} onDownload={() => download(row)} onShare={() => askShare(row)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className={`md:hidden divide-y ${loading ? 'opacity-60' : ''}`}>
                {rows.map((row) => (
                  <li key={row.key} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <EmployeeCell row={row} />
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{fmtDate(row.checkupDate)}</span>
                    </div>
                    <ReportCell row={row} onOpen={() => openPreview(row)} />
                    <div className="flex items-center justify-between gap-2">
                      <DeliveryCell row={row} />
                      <RowActions row={row} busy={busy} onView={() => openPreview(row)} onDownload={() => download(row)} onShare={() => askShare(row)} />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t text-xs text-muted-foreground">
                <span className="tabular-nums">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
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

        {mode === 'hr' && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Health reports are confidential medical records. Every view, download and share is recorded.</p>
        )}

        {/* Report preview */}
        <Sheet open={!!preview} onOpenChange={(open) => { if (!open) closePreview(); }}>
          <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col gap-0">
            {preview && (
              <>
                <SheetHeader className="px-5 py-4 border-b space-y-1 text-left">
                  <SheetTitle className="text-base pr-8 truncate">{preview.row.report?.name || 'Health report'}</SheetTitle>
                  <SheetDescription className="text-xs">
                    {preview.row.employee.name || 'Employee'}{preview.row.employee.employeeId ? ` · ${preview.row.employee.employeeId}` : ''} · Check-up {fmtDate(preview.row.checkupDate)}
                  </SheetDescription>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => download(preview.row)} disabled={busy === `${preview.row.key}-dl`}>
                      {busy === `${preview.row.key}-dl` ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Download
                    </Button>
                    {preview.row.canShare && (
                      <Button size="sm" variant="outline" onClick={() => askShare(preview.row)}><Share2 className="h-4 w-4 mr-1.5" /> Send to employee</Button>
                    )}
                  </div>
                </SheetHeader>
                <div className="flex-1 min-h-0 bg-muted/40">
                  {preview.error ? (
                    <EmptyState icon={<AlertTriangle className="h-5 w-5 text-destructive" />} title="Could not open the report" text={preview.error} />
                  ) : !preview.url ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" /> Loading report{preview.row.report?.sizeBytes ? ` (${fmtSize(preview.row.report.sizeBytes)})` : ''}…
                    </div>
                  ) : preview.type.startsWith('image/') ? (
                    <div className="h-full overflow-auto p-4 flex items-start justify-center"><img src={preview.url} alt={preview.row.report?.name || 'Health report'} className="max-w-full rounded-md shadow" /></div>
                  ) : (
                    <iframe title="Health report preview" src={preview.url} className="w-full h-full border-0" />
                  )}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Share confirmation */}
        <Dialog open={!!shareRow} onOpenChange={(open) => { if (!open && !sharing) setShareRow(null); }}>
          <DialogContent className="sm:max-w-md">
            {shareRow && (
              <>
                <DialogHeader>
                  <DialogTitle>Send report to {titleCase(shareRow.employee.name)}</DialogTitle>
                  <DialogDescription>The employee receives a secure link to “{shareRow.report?.name || 'their health report'}”.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-1">
                  <ChannelRow icon={<Mail className="h-4 w-4" />} label="Email" detail={shareRow.employee.email} checked={shareEmail} onChange={setShareEmail} already={!!shareRow.report?.notifiedEmail} />
                  <ChannelRow icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" detail={shareRow.employee.phone} checked={shareWhatsapp} onChange={setShareWhatsapp} already={!!shareRow.report?.notifiedWhatsapp} />
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="ghost" onClick={() => setShareRow(null)} disabled={sharing}>Cancel</Button>
                  <Button onClick={confirmShare} disabled={sharing || (!shareEmail && !shareWhatsapp)}>
                    {sharing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />} Send report
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </section>
    </TooltipProvider>
  );
}

function Kpi({ panel, icon, tone, label, value, loading, footer, onClick, hint }: {
  panel: string; icon: ReactNode; tone: string; label: string; value: number; loading: boolean; footer?: ReactNode; onClick?: () => void; hint?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
      </div>
      {loading ? <Skeleton className="h-7 w-16 mt-2" /> : <div className="text-2xl font-semibold tabular-nums mt-1.5 tracking-tight">{value.toLocaleString('en-IN')}</div>}
      {hint && !loading && <span className="text-[11px] text-primary mt-1 inline-block group-hover:underline">{hint} →</span>}
      {footer}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={`${panel} group p-4 text-left transition-colors hover:border-primary/40`}>{body}</button>
    : <div className={`${panel} p-4`}>{body}</div>;
}

function EmployeeCell({ row }: { row: CompletionRow }) {
  const e = row.employee;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneFor(e.userId)}`} aria-hidden>{initials(e.name)}</span>
      <div className="min-w-0">
        <div className="font-medium truncate" title={e.name || ''}>{titleCase(e.name)}</div>
        <div className="text-xs text-muted-foreground truncate" title={[e.employeeId, e.department, e.designation, e.email].filter(Boolean).join(' · ')}>
          {e.employeeId && <span className="font-mono">{e.employeeId}</span>}
          {e.employeeId && (e.department || e.designation) && ' · '}
          {(e.department || e.designation) ? titleCase(e.department || e.designation) : (!e.employeeId && (e.email || e.phone)) || ''}
        </div>
      </div>
    </div>
  );
}

function ReportCell({ row, onOpen }: { row: CompletionRow; onOpen: () => void }) {
  if (!row.report) {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2.5 py-1 text-xs font-medium"><Clock className="h-3.5 w-3.5" /> Awaiting report</span>;
  }
  const r = row.report;
  const meta = [fmtSize(r.sizeBytes), r.uploadedAt ? `Uploaded ${fmtDate(r.uploadedAt)}` : ''].filter(Boolean).join(' · ');
  const inner = (
    <>
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${r.hasFile ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'}`}><FileText className="h-4 w-4" /></span>
      <span className="min-w-0 text-left">
        <span className={`block truncate font-medium ${r.hasFile ? 'group-hover/report:text-primary' : 'text-muted-foreground'}`} title={r.name}>{r.name || 'Health report'}</span>
        <span className="block text-xs text-muted-foreground truncate">{r.hasFile ? meta : 'File not stored — upload it again'}</span>
      </span>
    </>
  );
  return r.hasFile
    ? <button type="button" onClick={onOpen} className="group/report flex items-center gap-2.5 min-w-0 max-w-full rounded-md -m-1 p-1 hover:bg-muted/60 transition-colors">{inner}</button>
    : <div className="flex items-center gap-2.5 min-w-0">{inner}</div>;
}

function DeliveryCell({ row }: { row: CompletionRow }) {
  if (!row.report) return <span className="text-xs text-muted-foreground">—</span>;
  const pill = (on: boolean, icon: ReactNode, label: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${on ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-dashed text-muted-foreground/60'}`} aria-label={`${label} ${on ? 'sent' : 'not sent'}`}>{icon}</span>
      </TooltipTrigger>
      <TooltipContent>{label}: {on ? 'sent to the employee' : 'not sent'}</TooltipContent>
    </Tooltip>
  );
  return <div className="flex items-center gap-1.5">{pill(row.report.notifiedEmail, <Mail className="h-3.5 w-3.5" />, 'Email')}{pill(row.report.notifiedWhatsapp, <MessageCircle className="h-3.5 w-3.5" />, 'WhatsApp')}</div>;
}

function RowActions({ row, busy, onView, onDownload, onShare }: { row: CompletionRow; busy: string | null; onView: () => void; onDownload: () => void; onShare: () => void }) {
  if (!row.report?.hasFile) return <div className="text-right text-xs text-muted-foreground">—</div>;
  const action = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onClick} disabled={disabled} aria-label={label}>{icon}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  const downloading = busy === `${row.key}-dl`;
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="outline" size="sm" className="h-8 px-3" onClick={onView}><Eye className="h-3.5 w-3.5 mr-1.5" /> View</Button>
      {action('Download', downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />, onDownload, downloading)}
      {row.canShare
        ? action('Send to employee', <Share2 className="h-4 w-4" />, onShare)
        : (
          <Tooltip>
            <TooltipTrigger asChild><span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dashed text-muted-foreground/40"><Share2 className="h-4 w-4" /></span></TooltipTrigger>
            <TooltipContent>Lab reports received by email are already with the employee</TooltipContent>
          </Tooltip>
        )}
    </div>
  );
}

function ChannelRow({ icon, label, detail, checked, onChange, already }: { icon: ReactNode; label: string; detail: string | null; checked: boolean; onChange: (v: boolean) => void; already: boolean }) {
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

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 px-6 py-14">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted">{icon}</span>
      <p className="text-sm font-medium mt-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
