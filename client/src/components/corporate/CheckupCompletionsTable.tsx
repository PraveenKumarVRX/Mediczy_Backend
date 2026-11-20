/**
 * Completed health check-ups with their reports, for one corporate. Used by the Team portal
 * (Corporate Health Booking → Completed Check-ups) and the corporate HR portal (Annual Health
 * Checkup). Owner decision 2026-11-20: HR has full access to view, download and share reports;
 * the server records every HR access.
 *
 * Files are fetched with the signed-in session and opened/saved locally, so no public link is made.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Download, Eye, FileText, RefreshCw, Search, Share2 } from 'lucide-react';
import api from '@/utils/api';

type Mode = 'team' | 'hr';

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

interface Props {
  mode: Mode;
  corporateId?: number | string | null;
  corporateName?: string;
  className?: string;
}

const PAGE_SIZE = 50;
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtSize = (b: number | null) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const typeLabel = (t: string | null) => (t ? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Health check-up');

export default function CheckupCompletionsTable({ mode, corporateId, corporateName = '', className = '' }: Props) {
  const { toast } = useToast();
  const base = mode === 'team' ? '/corporate-bookings' : '/corporate';
  const corpQuery = mode === 'team' && corporateId ? `corporateId=${encodeURIComponent(String(corporateId))}` : '';
  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [summary, setSummary] = useState({ employeesCompleted: 0, reports: 0, awaitingReports: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async (nextPage = 1) => {
    if (mode === 'team' && !corporateId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      if (search.trim()) params.set('search', search.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const { data } = await api.get(`${base}/checkup-completions?${corpQuery ? `${corpQuery}&` : ''}${params.toString()}`);
      setRows(data.data.rows || []);
      setSummary(data.data.summary || { employeesCompleted: 0, reports: 0, awaitingReports: 0 });
      setTotal(data.data.total || 0);
      setPage(nextPage);
    } catch (err: any) {
      toast({ title: 'Could not load completed check-ups', description: err?.response?.data?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [base, corpQuery, corporateId, from, mode, search, to, toast]);

  useEffect(() => { load(1); }, [corporateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFile = async (row: CompletionRow, download: boolean) => {
    if (!row.report) return;
    setBusyKey(`${row.key}-${download ? 'dl' : 'view'}`);
    try {
      const q = [corpQuery, download ? 'download=1' : ''].filter(Boolean).join('&');
      const res = await api.get(`${base}/checkup-reports/${row.source}/${row.reportId}/file${q ? `?${q}` : ''}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: res.data?.type || row.report.mimeType || 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(row.employee.name || 'employee').replace(/[^A-Za-z0-9]+/g, '-')}-${row.report.name || 'health-report'}`.slice(0, 120);
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, '_blank', 'noopener');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      let message = 'The file may be unavailable. Please try again.';
      try { const body = JSON.parse(await err?.response?.data?.text?.()); if (body?.message) message = body.message; } catch { /* not JSON */ }
      toast({ title: 'Could not open the report', description: message, variant: 'destructive' });
    } finally {
      setBusyKey(null);
    }
  };

  const share = async (row: CompletionRow) => {
    setBusyKey(`${row.key}-share`);
    try {
      const { data } = mode === 'team'
        ? await api.post(`/corporate-bookings/reports/${row.reportId}/share`, { corporateId, corporateName, sendEmail: true, sendWhatsapp: true })
        : await api.post(`/corporate/checkup-reports/${row.reportId}/share`, { sendEmail: true, sendWhatsapp: true });
      const n = data?.notifications || {};
      toast({ title: 'Report shared with the employee', description: `Email: ${n.email || 'skipped'} · WhatsApp: ${n.whatsapp || 'skipped'}` });
      load(page);
    } catch (err: any) {
      toast({ title: 'Could not share the report', description: err?.response?.data?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setBusyKey(null);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500" /> Completed Check-ups &amp; Reports</CardTitle>
            <CardDescription className="text-xs">Employees who have completed their health check-up, with their reports to view, download or share with the employee.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="h-8">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="secondary">{summary.employeesCompleted} employees completed</Badge>
          <Badge variant="secondary">{summary.reports} reports</Badge>
          {summary.awaitingReports > 0 && <Badge variant="outline">{summary.awaitingReports} awaiting report</Badge>}
        </div>
        <form className="flex flex-wrap gap-2 pt-3" onSubmit={(e) => { e.preventDefault(); load(1); }}>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, employee ID, department, email or phone" className="pl-8 h-9" />
          </div>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" aria-label="To date" />
          <Button type="submit" size="sm" className="h-9">Apply</Button>
        </form>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No completed check-ups found{search || from || to ? ' for these filters' : ''}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="py-2 pr-3">Employee</th>
                  <th className="py-2 pr-3">Emp ID</th>
                  <th className="py-2 pr-3">Department</th>
                  <th className="py-2 pr-3">Check-up</th>
                  <th className="py-2 pr-3">Report</th>
                  <th className="py-2 pr-3">Sent to employee</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b last:border-0 align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{row.employee.name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{row.employee.email || row.employee.phone || ''}</div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{row.employee.employeeId || '—'}</td>
                    <td className="py-2.5 pr-3">
                      <div>{row.employee.department || '—'}</div>
                      {row.employee.designation && <div className="text-xs text-muted-foreground">{row.employee.designation}</div>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div>{fmtDate(row.checkupDate)}</div>
                      <div className="text-xs text-muted-foreground">{typeLabel(row.checkupType)}{row.labName ? ` · ${row.labName}` : ''}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.report ? (
                        <div className="flex items-start gap-1.5">
                          <FileText className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                          <div>
                            <div className="break-all">{row.report.name || 'Health report'}</div>
                            <div className="text-xs text-muted-foreground">{fmtDate(row.report.uploadedAt)}{row.report.sizeBytes ? ` · ${fmtSize(row.report.sizeBytes)}` : ''}</div>
                          </div>
                        </div>
                      ) : (
                        <Badge variant="outline">Awaiting report</Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.report ? (
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={row.report.notifiedEmail ? 'secondary' : 'outline'}>Email {row.report.notifiedEmail ? 'sent' : '—'}</Badge>
                          <Badge variant={row.report.notifiedWhatsapp ? 'secondary' : 'outline'}>WA {row.report.notifiedWhatsapp ? 'sent' : '—'}</Badge>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {row.report?.hasFile ? (
                        <div className="inline-flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => fetchFile(row, false)} disabled={busyKey !== null} aria-label="View report">
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => fetchFile(row, true)} disabled={busyKey !== null} aria-label="Download report">
                            <Download className="h-3.5 w-3.5 mr-1" /> Download
                          </Button>
                          {row.canShare && (
                            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => share(row)} disabled={busyKey !== null} aria-label="Share report with the employee">
                              <Share2 className="h-3.5 w-3.5 mr-1" /> {busyKey === `${row.key}-share` ? 'Sharing…' : 'Share'}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{row.report ? 'File not stored' : '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
            <span>Page {page} of {pages} · {total} rows</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" className="h-7" disabled={page >= pages || loading} onClick={() => load(page + 1)}>Next</Button>
            </div>
          </div>
        )}
        {mode === 'hr' && (
          <p className="text-[11px] text-muted-foreground pt-3">Health reports are confidential medical records. Every view, download and share is recorded.</p>
        )}
      </CardContent>
    </Card>
  );
}
