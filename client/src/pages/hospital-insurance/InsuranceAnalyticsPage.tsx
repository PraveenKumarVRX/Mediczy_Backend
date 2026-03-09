import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { BarChart3, TrendingUp, Download, PieChart, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';

const InsuranceAnalyticsPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [agingData, setAgingData] = useState<any[]>([]);
  const [tatData, setTatData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [dashStats, setDashStats] = useState<any>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [dashRes, agingRes, tatRes, trendRes] = await Promise.allSettled([
        api.get('/hospital/insurance/dashboard'),
        api.get('/hospital/insurance/reports/claims-aging'),
        api.get('/hospital/insurance/reports/tat'),
        api.get('/hospital/insurance/reports/query-rejection-trends'),
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value.data.success) {
        setDashStats(dashRes.value.data.dashboard?.stats);
      }
      if (agingRes.status === 'fulfilled' && agingRes.value.data.success) {
        setAgingData(agingRes.value.data.agingBuckets || agingRes.value.data.aging || []);
      }
      if (tatRes.status === 'fulfilled' && tatRes.value.data.success) {
        setTatData(tatRes.value.data.report || []);
      }
      if (trendRes.status === 'fulfilled' && trendRes.value.data.success) {
        setTrendData(trendRes.value.data.trends || []);
      }
    } catch (err) {
      console.warn('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const overviewStats = [
    { label: 'Total Claims', value: dashStats?.total?.toString() || '0', change: '', up: true },
    { label: 'Approved', value: dashStats?.approved?.toString() || '0', change: '', up: true },
    { label: 'Rejected', value: dashStats?.rejected?.toString() || '0', change: '', up: false },
    { label: 'Pending', value: dashStats?.pending?.toString() || '0', change: '', up: true },
    { label: 'Query', value: dashStats?.query?.toString() || '0', change: '', up: true },
    { label: 'Approval Rate', value: dashStats?.total ? `${Math.round((dashStats.approved / dashStats.total) * 100)}%` : '—', change: '', up: true },
  ];

  const quickReports = [
    { id: 'claims_summary', name: 'Claims Summary Report', desc: 'All claims with status, amounts, and timelines' },
    { id: 'settlement', name: 'Settlement Report', desc: 'UTR-wise settlement tracking with deductions' },
    { id: 'tat', name: 'TAT Analysis Report', desc: 'Pre-auth and claim turnaround times by insurer' },
    { id: 'rejection', name: 'Rejection Analysis', desc: 'Top rejection reasons with corrective actions' },
    { id: 'insurer_wise', name: 'Insurer-wise Summary', desc: 'Per-insurer performance breakdown' },
    { id: 'outstanding', name: 'Outstanding Report', desc: 'All pending/unsettled claims with aging' },
    { id: 'monthly', name: 'Monthly MIS Report', desc: 'Monthly performance KPIs and trends' },
    { id: 'document', name: 'Document Compliance', desc: 'Missing documents and compliance status' },
  ];

  const handleDownloadReport = (reportId: string) => {
    toast({ title: 'Generating Report', description: 'Your report will be downloaded shortly.' });
  };

  return (
    <InsurancePortalLayout title="Analytics & Reports" subtitle="Performance insights and downloadable reports">
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="6m">Last 6 Months</SelectItem>
              <SelectItem value="1y">Last 1 Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {dateRange === 'custom' && (
            <>
              <Input type="date" className="w-40" />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="date" className="w-40" />
            </>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="aging">Aging Analysis</TabsTrigger>
            <TabsTrigger value="insurer">Insurer-wise</TabsTrigger>
            <TabsTrigger value="reports">Quick Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {overviewStats.map((stat, idx) => (
                <Card key={idx}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <div className="flex items-end justify-between mt-1">
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <div className={`flex items-center text-sm ${stat.up ? (stat.label.includes('Pending') || stat.label.includes('Deduction') ? 'text-red-600' : 'text-green-600') : (stat.label.includes('Settlement') || stat.label.includes('Response') ? 'text-green-600' : 'text-red-600')}`}>
                        {stat.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {stat.change}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Claims Trend (Monthly)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-48 flex items-center justify-center bg-slate-50 dark:bg-slate-800 rounded">
                    <div className="text-center text-muted-foreground">
                      <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Chart placeholder — integrate with charting library</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-48 flex items-center justify-center bg-slate-50 dark:bg-slate-800 rounded">
                    <div className="text-center text-muted-foreground">
                      <PieChart className="h-12 w-12 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Chart placeholder — integrate with charting library</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="aging" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Claims Aging Analysis</CardTitle></CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-8 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-indigo-500" /></div>
                ) : agingData.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">No aging data available. Claims data will appear once claims are created.</div>
                ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium">Age Range</th>
                      <th className="py-2 px-3 text-center font-medium">No. of Claims</th>
                      <th className="py-2 px-3 text-right font-medium">Total Value</th>
                      <th className="py-2 px-3 text-right font-medium">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingData.map((row: any, idx: number) => {
                      const totalCount = agingData.reduce((s: number, r: any) => s + (r.count || 0), 0);
                      return (
                      <tr key={idx} className="border-b">
                        <td className="py-2 px-3 font-medium">{row.range || row.bucket}</td>
                        <td className="py-2 px-3 text-center">{row.count || 0}</td>
                        <td className="py-2 px-3 text-right">₹{(row.value || row.totalAmount || 0).toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right">{totalCount > 0 ? Math.round(((row.count || 0) / totalCount) * 100) : 0}%</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insurer" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> TAT & Rejection Analysis</CardTitle></CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-8 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-indigo-500" /></div>
                ) : tatData.length === 0 && trendData.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">No data yet. Analytics will populate as claims are processed.</div>
                ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="py-2 px-3 text-left font-medium">Metric</th>
                        <th className="py-2 px-3 text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tatData.map((row: any, idx: number) => (
                        <tr key={`tat-${idx}`} className="border-b">
                          <td className="py-2 px-3 font-medium">{row.payer || row.metric || `Payer ${idx + 1}`}</td>
                          <td className="py-2 px-3 text-right">{row.preAuthTat || row.avgTat || '—'}</td>
                        </tr>
                      ))}
                      {trendData.map((row: any, idx: number) => (
                        <tr key={`trend-${idx}`} className="border-b">
                          <td className="py-2 px-3 font-medium">{row.reason || row.type || `Trend ${idx + 1}`}</td>
                          <td className="py-2 px-3 text-right">{row.count || row.percentage || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {quickReports.map((report) => (
                <Card key={report.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{report.name}</p>
                      <p className="text-sm text-muted-foreground">{report.desc}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleDownloadReport(report.id)}>
                        <Download className="h-3 w-3 mr-1" /> CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownloadReport(report.id)}>
                        <FileText className="h-3 w-3 mr-1" /> PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceAnalyticsPage;
