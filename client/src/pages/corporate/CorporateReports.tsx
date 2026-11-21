import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Download, FileBarChart, Eye, Search, BarChart3, Loader2, CalendarDays, Rows3, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

/**
 * HR reports. A generated report is saved with its rows (it reads the same whenever it
 * is opened), listed under "Generated reports" with its name, date and size, and can be
 * previewed and downloaded at any time.
 */
interface MisMetrics {
  enrolledEmployees?: number;
  bookedCheckups?: number;
  annualCheckupsBooked?: number;
  preEmploymentBooked?: number;
  bookingsByStatus?: { pending?: number; confirmed?: number; completed?: number; cancelled?: number };
  completedCheckups?: number;
  reportsUploaded?: number;
  slaCompliancePercent?: number | null;
}
interface Report {
  id: string;
  title: string;
  description: string;
  category: string;
  reportType?: string;
  generatedDate: string;
  generatedAt?: string | null;
  period: string;
  format: 'PDF' | 'Excel' | 'CSV' | string;
  size: string;
  rowCount?: number | null;
  saved?: boolean;
  status: string;
  reportKey?: string | null;
  scheduledFrequency?: string | null;
  metrics?: MisMetrics;
}
interface ReportType { key: string; label: string; description: string }
interface Preview { report: Report; headers: string[]; rows: Record<string, unknown>[]; totalRows: number; saved: boolean }

const FALLBACK_TYPES: ReportType[] = [
  { key: 'checkup_status', label: 'Health Check-up Status', description: 'Every employee and where they are in this year\'s annual check-up.' },
  { key: 'pre_employment', label: 'Pre-employment check-ups', description: 'Candidates, their appointment and fitness outcome.' },
  { key: 'weekly_mis', label: 'Weekly MIS', description: 'Bookings by status and type, reports and SLA for one week.' },
  { key: 'employees', label: 'Employee list', description: 'The active employee roster.' },
];

const fyOptions = () => {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [0, 1].map((back) => `${start - back}-${String((start - back + 1) % 100).padStart(2, '0')}`);
};
const header = (h: string) => h.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());
const when = (r: Report) => (r.generatedAt ? new Date(r.generatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : r.generatedDate);

const CorporateReports: React.FC = () => {
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [types, setTypes] = useState<ReportType[]>(FALLBACK_TYPES);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [highlight, setHighlight] = useState<string | null>(null);

  const [genOpen, setGenOpen] = useState(false);
  const [genType, setGenType] = useState('checkup_status');
  const [genFormat, setGenFormat] = useState('Excel');
  const [genFy, setGenFy] = useState(fyOptions()[0]);
  const [genWeek, setGenWeek] = useState('previous_week');
  const [isGenerating, setIsGenerating] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/corporate/reports');
      setReports((data as any)?.data?.reports || []);
    } catch (error: any) {
      toast({ title: 'Failed to load reports', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    api.get('/corporate/reports/types').then(({ data }) => {
      const list = (data as any)?.data?.types;
      if (Array.isArray(list) && list.length) setTypes(list);
    }).catch(() => {});
  }, []);

  const latestWeeklyMis = useMemo(
    () => reports.find((r) => r.reportType === 'weekly_mis' || r.category === 'MIS' || r.reportKey?.startsWith('weekly-mis-')),
    [reports]
  );
  const typeLabel = (r: Report) => types.find((t) => t.key === r.reportType)?.label || r.category;

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((r) =>
      (typeFilter === 'all' || r.reportType === typeFilter)
      && (!q || `${r.title} ${r.category} ${r.period}`.toLowerCase().includes(q)));
  }, [reports, searchQuery, typeFilter]);

  const openPreview = async (report: Report) => {
    setPreviewLoading(report.id);
    try {
      const { data } = await api.get(`/corporate/reports/${encodeURIComponent(report.id)}/preview`);
      const d = (data as any)?.data;
      setPreview({ report: d?.report || report, headers: d?.headers || [], rows: d?.rows || [], totalRows: d?.totalRows ?? 0, saved: d?.saved !== false });
    } catch (error: any) {
      toast({ title: 'Preview failed', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setPreviewLoading(null);
    }
  };

  const generate = async () => {
    setIsGenerating(true);
    try {
      const { data } = await api.post('/corporate/reports/generate', { type: genType, format: genFormat, fy: genFy, period: genWeek });
      const report = (data as any)?.data?.report as Report | undefined;
      setGenOpen(false);
      if (report) {
        setReports((prev) => [report, ...prev]);
        setTypeFilter('all'); setSearchQuery('');
        setHighlight(report.id);
        setTimeout(() => document.getElementById(`report-${report.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
        setTimeout(() => setHighlight(null), 6000);
        toast({ title: 'Report generated and saved', description: `${report.title}: ${report.size}. It is listed under Generated reports.` });
        openPreview(report);
      } else {
        await loadReports();
      }
    } catch (error: any) {
      toast({ title: 'Failed to generate report', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (report: Report) => {
    try {
      const response = await api.get(`/corporate/reports/${encodeURIComponent(report.id)}/download`, { responseType: 'blob', params: { format: report.format } });
      const format = String(report.format).toLowerCase();
      const ext = format === 'pdf' ? 'pdf' : format === 'excel' ? 'xlsx' : 'csv';
      const mime = response.headers['content-type'] || (ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : ext === 'pdf' ? 'application/pdf' : 'text/csv');
      const url = window.URL.createObjectURL(new Blob([response.data], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(report.title || `report-${report.id}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.${ext}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: 'Download failed', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  const mis = latestWeeklyMis?.metrics || {};
  const byStatus = mis.bookingsByStatus;
  const genTypeInfo = types.find((t) => t.key === genType);

  return (
    <CorporateLayout title="Reports">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={BarChart3}
          title="Analytics & Reports"
          description="Generate a report, then preview or download it from Generated reports at any time"
          gradient="from-violet-500 to-violet-700"
          badge={`${reports.length} saved`}
          showRefresh={true}
          onRefresh={loadReports}
          isRefreshing={isLoading}
          actions={
            <Button size="sm" onClick={() => setGenOpen(true)} className="bg-slate-900 text-violet-300 hover:bg-slate-800 shadow-lg">
              <FileBarChart className="h-4 w-4 mr-2" />
              Generate report
            </Button>
          }
        />

        {/* Generate */}
        <Dialog open={genOpen} onOpenChange={setGenOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Generate a report</DialogTitle>
              <DialogDescription>The report is saved with today's data and listed under Generated reports.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Report</label>
                <Select value={genType} onValueChange={setGenType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{types.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                {genTypeInfo && <p className="text-xs text-slate-400">{genTypeInfo.description}</p>}
              </div>
              {genType === 'checkup_status' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Financial year</label>
                  <Select value={genFy} onValueChange={setGenFy}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{fyOptions().map((fy) => <SelectItem key={fy} value={fy}>FY {fy} (1 Apr – 31 Mar)</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {genType === 'weekly_mis' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Week</label>
                  <Select value={genWeek} onValueChange={setGenWeek}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="previous_week">Last week (Mon–Sun)</SelectItem>
                      <SelectItem value="current_week">This week so far</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Download format</label>
                <Select value={genFormat} onValueChange={setGenFormat}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="CSV">CSV</SelectItem>
                    <SelectItem value="PDF">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setGenOpen(false)}>Cancel</Button>
              <Button onClick={generate} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileBarChart className="h-4 w-4 mr-2" />}
                Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview */}
        <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>{preview?.report.title}</DialogTitle>
              <DialogDescription>
                {preview && `${typeLabel(preview.report)} · generated ${when(preview.report)} · ${preview.totalRows} row${preview.totalRows === 1 ? '' : 's'}`}
                {preview && !preview.saved && ' · made before reports were saved, so this shows current data'}
              </DialogDescription>
            </DialogHeader>
            {preview && (
              preview.rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">This report has no rows.</p>
              ) : (
                <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-700">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-900">
                      <tr>{preview.headers.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold text-slate-300">{header(h)}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={i} className="border-t border-slate-800">
                          {preview.headers.map((h) => <td key={h} className="whitespace-nowrap px-3 py-1.5 text-slate-200">{String(row[h] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
            <DialogFooter className="items-center gap-2 sm:justify-between">
              <span className="text-xs text-slate-400">{preview && preview.totalRows > preview.rows.length ? `Showing the first ${preview.rows.length} of ${preview.totalRows} rows. Download for all.` : ''}</span>
              {preview && (
                <Button onClick={() => handleDownload(preview.report)}>
                  <Download className="h-4 w-4 mr-2" /> Download {preview.report.format}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Weekly MIS */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Weekly MIS</CardTitle>
              <CardDescription>{latestWeeklyMis ? latestWeeklyMis.period : 'Generated every Monday for the week before. None yet.'}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setGenType('weekly_mis'); setGenOpen(true); }}>
                <FileBarChart className="h-4 w-4 mr-2" /> Generate MIS
              </Button>
              {latestWeeklyMis && <Button size="sm" variant="outline" onClick={() => openPreview(latestWeeklyMis)}><Eye className="h-4 w-4 mr-2" />Preview</Button>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-slate-400">Check-ups booked</p>
                <p className="text-2xl font-semibold tabular-nums">{mis.bookedCheckups ?? '—'}</p>
                {mis.annualCheckupsBooked !== undefined && (
                  <p className="text-xs text-slate-400">Annual {mis.annualCheckupsBooked} · Pre-employment {mis.preEmploymentBooked ?? 0}</p>
                )}
              </div>
              <div>
                <p className="text-sm text-slate-400">Booking status</p>
                {byStatus ? (
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="outline" className="border-amber-500/40 text-amber-300">Pending {byStatus.pending ?? 0}</Badge>
                    <Badge variant="outline" className="border-blue-500/40 text-blue-300">Confirmed {byStatus.confirmed ?? 0}</Badge>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">Completed {byStatus.completed ?? 0}</Badge>
                    <Badge variant="outline" className="text-slate-400">Cancelled {byStatus.cancelled ?? 0}</Badge>
                  </div>
                ) : <p className="text-sm text-slate-400">Generate the MIS again to see the breakdown.</p>}
              </div>
              <div>
                <p className="text-sm text-slate-400">Reports uploaded</p>
                <p className="text-2xl font-semibold tabular-nums">{mis.reportsUploaded ?? '—'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Reports on time (2 working days)</p>
                <p className="text-2xl font-semibold tabular-nums">{mis.slaCompliancePercent == null ? 'N/A' : `${mis.slaCompliancePercent}%`}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Generated reports */}
        <Card id="reports-list">
          <CardHeader>
            <CardTitle>Generated reports</CardTitle>
            <CardDescription>Every report generated for your company, newest first. Each keeps the data it was generated with.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input placeholder="Search by name or period" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="sm:w-[240px]"><SelectValue placeholder="All reports" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reports</SelectItem>
                  {types.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading && reports.length === 0 ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : filteredReports.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <FileText className="mx-auto mb-3 h-10 w-10 opacity-50" />
                <p>{reports.length ? 'No reports match.' : 'No reports yet. Use Generate report to create one.'}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
                {filteredReports.map((report) => (
                  <li
                    key={report.id}
                    id={`report-${report.id}`}
                    className={`flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${highlight === report.id ? 'bg-violet-500/10 ring-1 ring-inset ring-violet-500/50' : ''}`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="h-4 w-4 text-violet-400" />
                        <span className="font-medium text-slate-100">{report.title}</span>
                        {highlight === report.id && <Badge className="bg-violet-600 text-white"><CheckCircle2 className="mr-1 h-3 w-3" />New</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>{typeLabel(report)}</span>
                        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{when(report)}</span>
                        <span>{report.period}</span>
                        <span className="inline-flex items-center gap-1"><Rows3 className="h-3 w-3" />{report.size}</span>
                        <span>{report.format}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => openPreview(report)} disabled={previewLoading === report.id}>
                        {previewLoading === report.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Eye className="mr-1 h-4 w-4" />}Preview
                      </Button>
                      <Button size="sm" onClick={() => handleDownload(report)}>
                        <Download className="mr-1 h-4 w-4" />Download
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </CorporateLayout>
  );
};

export default CorporateReports;
