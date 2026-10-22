import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Download, Calendar, TrendingUp, Users, FileBarChart, Filter, Eye, Search, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';

interface Report {
  id: string;
  title: string;
  description: string;
  category: string;
  generatedDate: string;
  period: string;
  format: 'PDF' | 'Excel' | 'CSV';
  size: string;
  status: 'ready' | 'generating' | 'scheduled';
  reportKey?: string | null;
  scheduledFrequency?: string | null;
  deliveryStatus?: 'not_sent' | 'pending' | 'sent' | 'failed' | string;
  deliveredAt?: string | null;
  metrics?: {
    enrolledEmployees?: number;
    bookedCheckups?: number;
    reportsUploaded?: number;
    preEmploymentReports?: number;
    annualReports?: number;
    slaCompliancePercent?: number | null;
    slaOverdue?: number;
  };
}

const CorporateReports: React.FC = () => {
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const focusOnCategory = (category: string) => {
    setCategoryFilter(category);
    setSearchQuery('');
    setTimeout(() => {
      const el = document.getElementById('reports-list');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const loadReports = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/corporate/reports');
      const list = ((data as any)?.data?.reports || []) as Report[];
      setReports(list);
    } catch (error: any) {
      toast({
        title: 'Failed to load reports',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const reportCategories = [
    'MIS',
    'Health Metrics',
    'Claims',
    'Departmental',
    'Risk Analysis',
    'Wellness',
    'Compliance',
    'Mental Health',
    'Financial'
  ];

  const stats = {
    totalReports: reports.filter(r => r.status === 'ready').length,
    thisMonth: reports.filter(r => {
      if (r.status !== 'ready' || !r.generatedDate) return false;
      const generated = new Date(r.generatedDate);
      const now = new Date();
      return generated.getMonth() === now.getMonth() && generated.getFullYear() === now.getFullYear();
    }).length,
    scheduled: reports.filter(r => r.status === 'scheduled').length,
    generating: reports.filter(r => r.status === 'generating').length
  };

  const latestWeeklyMis = useMemo(
    () => reports.find((report) => report.category === 'MIS' || report.scheduledFrequency === 'weekly' || report.reportKey?.startsWith('weekly-mis-')),
    [reports]
  );

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesSearch =
        report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = categoryFilter === 'all' || report.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, reports, searchQuery]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'bg-green-100 text-green-800';
      case 'generating':
        return 'bg-blue-100 text-blue-800';
      case 'scheduled':
        return 'bg-slate-800 text-slate-200';
      default:
        return 'bg-slate-800 text-slate-200';
    }
  };

  const getFormatColor = (format: string) => {
    switch (format) {
      case 'PDF':
        return 'bg-red-100 text-red-800';
      case 'Excel':
        return 'bg-green-100 text-green-800';
      case 'CSV':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-slate-800 text-slate-200';
    }
  };

  const handleGenerate = async (type: string) => {
    try {
      setIsGenerating(true);
      const { data } = await api.post('/corporate/reports/generate', {
        type,
        period: selectedPeriod,
      });
      const report = (data as any)?.data?.report as Report | undefined;
      if (report) setReports((prev) => [report, ...prev]);
      else await loadReports();
      toast({ title: 'Report generated', description: 'Report is ready to preview/download.' });
    } catch (error: any) {
      toast({
        title: 'Failed to generate report',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateWeeklyMis = async () => {
    try {
      setIsGenerating(true);
      const { data } = await api.post('/corporate/reports/weekly-mis/generate', {
        period: selectedPeriod === 'week' ? 'current_week' : 'previous_week',
      });
      const report = (data as any)?.data?.report as Report | undefined;
      if (report) setReports((prev) => [report, ...prev.filter((item) => item.id !== report.id)]);
      else await loadReports();
      toast({ title: 'Weekly MIS generated', description: 'HR MIS is ready to download.' });
    } catch (error: any) {
      toast({
        title: 'Failed to generate MIS',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = (report: Report) => {
    setPreviewReport(report);
    setPreviewOpen(true);
  };

  const handleDownload = async (report: Report) => {
    try {
      const response = await api.get(`/corporate/reports/${encodeURIComponent(report.id)}/download`, {
        responseType: 'blob',
        params: { format: report.format },
      });

      // The backend only ever sends a real PDF for format=PDF; both 'Excel'
      // and 'CSV' are actually CSV content server-side (see corporate.route.js
      // report-download route) - the ext/mime here reflect what's really sent,
      // not the report's cosmetic format label.
      const isPdf = report.format === 'PDF';
      const ext = isPdf ? 'pdf' : 'csv';
      const blob = new Blob([response.data], { type: isPdf ? 'application/pdf' : 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (report.title || report.reportKey || `report-${report.id}`)
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const safePeriod = report.period ? `-${report.period.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}` : '';
      a.download = `${safeTitle}${safePeriod}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({ title: 'Downloaded', description: 'Report downloaded successfully.' });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <CorporateLayout title="Reports">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={BarChart3}
          title="Analytics & Reports"
          description="Generate and download comprehensive health reports and analytics"
          gradient="from-violet-500 to-violet-700"
          badge={`${reports.length} Reports`}
          showSearch={true}
          searchPlaceholder="Search reports by title or category..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showRefresh={true}
          onRefresh={loadReports}
          isRefreshing={isLoading}
          stats={[
            { label: 'Available Reports', value: stats.totalReports },
            { label: 'This Month', value: stats.thisMonth },
            { label: 'Scheduled', value: stats.scheduled },
            { label: 'Generating', value: stats.generating },
          ]}
          actions={
            <Button size="sm" onClick={() => handleGenerate('Custom Report')} disabled={isGenerating} className="bg-slate-900 text-violet-700 hover:bg-white/90 shadow-lg">
              <FileBarChart className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          }
        />

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Report Preview</DialogTitle>
              <DialogDescription>Basic metadata preview. Download for export.</DialogDescription>
            </DialogHeader>
            {previewReport && (
              <div className="space-y-3 text-sm">
                <div className="font-semibold text-base">{previewReport.title}</div>
                <div className="text-slate-400">{previewReport.description}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-slate-400">Category</div>
                    <div className="font-medium">{previewReport.category}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Period</div>
                    <div className="font-medium">{previewReport.period}</div>
                  </div>
                <div>
                  <div className="text-slate-400">Generated</div>
                  <div className="font-medium">{previewReport.generatedDate}</div>
                </div>
                <div>
                  <div className="text-slate-400">Format</div>
                  <div className="font-medium">{previewReport.format}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleDownload(previewReport)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Reports</CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalReports}</div>
            <p className="text-xs text-muted-foreground">Ready to download</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Calendar className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisMonth}</div>
            <p className="text-xs text-muted-foreground">Generated reports</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduled}</div>
            <p className="text-xs text-muted-foreground">Upcoming reports</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Generating</CardTitle>
            <Users className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.generating}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly MIS</CardTitle>
          <CardDescription>Automated every Monday with check-up, report, and 2-working-day SLA metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-slate-400">Latest Period</p>
              <p className="font-semibold">{latestWeeklyMis?.period || 'No MIS generated yet'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Reports Uploaded</p>
              <p className="font-semibold">{latestWeeklyMis?.metrics?.reportsUploaded ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">SLA Compliance</p>
              <p className="font-semibold">
                {latestWeeklyMis?.metrics?.slaCompliancePercent === null || latestWeeklyMis?.metrics?.slaCompliancePercent === undefined
                  ? 'N/A'
                  : `${latestWeeklyMis.metrics.slaCompliancePercent}%`}
              </p>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleGenerateWeeklyMis} disabled={isGenerating}>
                <FileBarChart className="h-4 w-4 mr-2" />
                Generate Weekly MIS
              </Button>
              {latestWeeklyMis && (
                <Button variant="outline" onClick={() => handleDownload(latestWeeklyMis)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Report Generation</CardTitle>
          <CardDescription>Generate standard reports with custom time periods</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Time Period</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="self-end" onClick={() => handleGenerate('Health Metrics')} disabled={isGenerating}>
              <FileText className="h-4 w-4 mr-2" />
              Health Metrics
            </Button>
            <Button
              className="self-end"
              variant="outline"
              onClick={() => {
                focusOnCategory('Claims');
                handleGenerate('Claims Summary');
              }}
              disabled={isGenerating}
            >
              <FileBarChart className="h-4 w-4 mr-2" />
              Claims Summary
            </Button>
            <Button
              className="self-end"
              variant="outline"
              onClick={() => {
                focusOnCategory('Risk Analysis');
                handleGenerate('Risk Analysis');
              }}
              disabled={isGenerating}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Risk Analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      <Card id="reports-list">
        <CardHeader>
          <CardTitle>Report Library</CardTitle>
          <CardDescription>Browse and download generated reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {reportCategories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {filteredReports.map((report) => (
              <Card key={report.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <FileText className="h-5 w-5 text-blue-600" />
                          <h3 className="font-semibold text-lg">{report.title}</h3>
                        </div>
                        <p className="text-sm text-slate-400">{report.description}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant="outline">{report.id}</Badge>
                        <Badge variant="secondary">{report.category}</Badge>
                        <Badge className={getFormatColor(report.format)}>{report.format}</Badge>
                        {report.scheduledFrequency === 'weekly' && <Badge variant="outline">Weekly</Badge>}
                        {report.deliveryStatus && report.deliveryStatus !== 'not_sent' && (
                          <Badge variant="outline">Delivery: {report.deliveryStatus}</Badge>
                        )}
                        <Badge className={getStatusColor(report.status)}>
                          {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400">Period</p>
                          <p className="font-semibold">{report.period}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Generated</p>
                          <p className="font-semibold">{report.generatedDate}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">File Size</p>
                          <p className="font-semibold">{report.size}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      {report.status === 'ready' && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handlePreview(report)}>
                            <Eye className="h-4 w-4 mr-1" />
                            Preview
                          </Button>
                          <Button size="sm" onClick={() => handleDownload(report)}>
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </>
                      )}
                      {report.status === 'generating' && (
                        <Button size="sm" disabled>
                          <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                          Generating...
                        </Button>
                      )}
                      {report.status === 'scheduled' && (
                        <Button size="sm" variant="outline" disabled>
                          <Calendar className="h-4 w-4 mr-1" />
                          Scheduled
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredReports.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No reports found matching your criteria</p>
            </div>
          )}

          {isLoading && reports.length === 0 && (
            <div className="text-sm text-slate-400 mt-4">Loading reports…</div>
          )}
        </CardContent>
      </Card>
      </div>
    </CorporateLayout>
  );
};

const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...props }) => (
  <label className={`text-sm font-medium ${className}`} {...props} />
);

export default CorporateReports;
