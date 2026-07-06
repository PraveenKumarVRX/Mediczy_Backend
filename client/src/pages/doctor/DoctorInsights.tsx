import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayoutdoctor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3, TrendingUp, Calendar, DollarSign, Download, Loader2, FileSpreadsheet, Users,
} from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function analyticsToCsv(analytics: Record<string, unknown>, period: string): string {
  const lines = [`Practice Insights Report — last ${period} days`, `Generated,${new Date().toISOString()}`, ''];
  lines.push('Metric,Value');
  if (analytics.totalRevenue != null) lines.push(`Total Revenue,${analytics.totalRevenue}`);
  const byStatus = (analytics.appointmentsByStatus as Array<{ status: string; count: number }>) || [];
  byStatus.forEach((row) => lines.push(`Appointments (${row.status}),${row.count}`));
  lines.push('');
  lines.push('Date,Appointments');
  const byDay = (analytics.appointmentsByDay as Array<{ date: string; count: number }>) || [];
  byDay.forEach((row) => lines.push(`${row.date},${row.count}`));
  return lines.join('\n');
}

export default function DoctorInsights() {
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState('30');
  const [reportType, setReportType] = useState('appointments');
  const [exporting, setExporting] = useState(false);
  const insightsTab = searchParams.get('tab') === 'export' ? 'export' : 'overview';
  const { toast } = useToast();

  const { data: analytics, isLoading, error, isError } = useQuery({
    queryKey: ['doctor-insights', period],
    queryFn: async () => {
      const response = await api.get(`/doctors/analytics?period=${period}`);
      return response.data.analytics;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: reportsList } = useQuery({
    queryKey: ['doctor-reports-list', period],
    queryFn: async () => {
      const periodKey = period === '365' ? '1y' : `${period}d`;
      const response = await api.get(`/doctors/reports?period=${periodKey}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const statusColors: Record<string, string> = {
    completed: 'bg-green-500',
    scheduled: 'bg-blue-500',
    cancelled: 'bg-red-500',
    pending: 'bg-yellow-500',
  };

  const maxCount = Math.max(...(analytics?.appointmentsByDay?.map((d: { count: number }) => d.count) || [1]));

  const handleExportCsv = async () => {
    if (!analytics) {
      toast({ title: 'No data', description: 'Load analytics before exporting.', variant: 'destructive' });
      return;
    }
    setExporting(true);
    try {
      const csv = analyticsToCsv(analytics, period);
      downloadBlob(csv, `practice-insights-${period}d.csv`, 'text/csv');
      toast({ title: 'Export ready', description: 'CSV downloaded from live analytics data.' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const periodKey = period === '365' ? '1y' : `${period}d`;
      const { data } = await api.post('/doctors/reports/generate', {
        type: reportType,
        period: periodKey,
        format: 'json',
      });
      const payload = JSON.stringify({ analytics, report: data.report, summary: reportsList?.summary }, null, 2);
      downloadBlob(payload, `doctor-report-${reportType}-${periodKey}.json`, 'application/json');
      toast({ title: 'Export ready', description: 'JSON report downloaded.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      toast({ title: 'Export failed', description: message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-teal-500" />
              Practice Insights
            </h1>
            <p className="text-muted-foreground">Analytics and exportable reports for your practice</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue={insightsTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : isError || !analytics ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Unable to load analytics. Check your connection and try again.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <DollarSign className="h-4 w-4" /> Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">₹{((analytics.totalRevenue || 0) / 1000).toFixed(1)}K</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> Appointments
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        {(analytics.appointmentsByStatus || []).reduce((s: number, r: { count: number }) => s + r.count, 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" /> Period
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{period} days</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>By status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(analytics.appointmentsByStatus || []).map((item: { status: string; count: number }) => (
                        <div key={item.status} className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${statusColors[item.status] || 'bg-gray-400'}`} />
                          <span className="flex-1 capitalize">{item.status}</span>
                          <span className="font-semibold">{item.count}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Daily volume</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-1 h-32">
                        {(analytics.appointmentsByDay || []).map((day: { date: string; count: number }) => (
                          <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full bg-teal-500 rounded-t"
                              style={{ height: `${maxCount > 0 ? (day.count / maxCount) * 100 : 0}%`, minHeight: day.count > 0 ? 4 : 0 }}
                            />
                            <span className="text-[9px] text-muted-foreground">
                              {new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="export" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Export reports
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  CSV exports use live analytics data. JSON export includes the server-generated report envelope.
                </p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Report type</label>
                    <Select value={reportType} onValueChange={setReportType}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="appointments">Appointments</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                        <SelectItem value="patients">Patients</SelectItem>
                        <SelectItem value="activity">Activity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleExportCsv} disabled={exporting || !analytics} variant="outline" className="gap-2">
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download CSV
                  </Button>
                  <Button onClick={handleExportJson} disabled={exporting} className="gap-2">
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                    Download JSON
                  </Button>
                </div>
                {reportsList?.summary && (
                  <div className="rounded-lg bg-muted/50 p-4 text-sm grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><span className="text-muted-foreground">Total</span><p className="font-semibold">{reportsList.summary.total}</p></div>
                    <div><span className="text-muted-foreground">Completed</span><p className="font-semibold">{reportsList.summary.completed}</p></div>
                    <div><span className="text-muted-foreground">Cancelled</span><p className="font-semibold">{reportsList.summary.cancelled}</p></div>
                    <div><span className="text-muted-foreground">Revenue</span><p className="font-semibold">₹{reportsList.summary.revenue}</p></div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
