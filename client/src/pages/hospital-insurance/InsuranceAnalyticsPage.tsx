import { useState } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { BarChart3, TrendingUp, Download, PieChart, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const InsuranceAnalyticsPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState('30d');

  const overviewStats = [
    { label: 'Total Claims Value', value: '₹45,62,000', change: '+12%', up: true },
    { label: 'Avg Settlement Time', value: '8.2 days', change: '-15%', up: false },
    { label: 'Approval Rate', value: '78%', change: '+3%', up: true },
    { label: 'Avg Deduction %', value: '6.4%', change: '-2%', up: false },
    { label: 'Pending Claims', value: '23', change: '+5', up: true },
    { label: 'Query Response TAT', value: '2.1 hrs', change: '-0.5h', up: false },
  ];

  const agingData = [
    { range: '0-7 days', count: 12, value: '₹8,40,000' },
    { range: '8-15 days', count: 8, value: '₹5,60,000' },
    { range: '16-30 days', count: 5, value: '₹3,20,000' },
    { range: '31-60 days', count: 3, value: '₹2,10,000' },
    { range: '60+ days', count: 2, value: '₹1,80,000' },
  ];

  const insurerWise = [
    { name: 'Star Health', claims: 45, approved: 38, rejected: 3, pending: 4, value: '₹12,50,000', settlementRate: '84%' },
    { name: 'ICICI Lombard', claims: 32, approved: 25, rejected: 4, pending: 3, value: '₹9,80,000', settlementRate: '78%' },
    { name: 'HDFC Ergo', claims: 28, approved: 22, rejected: 2, pending: 4, value: '₹8,40,000', settlementRate: '79%' },
    { name: 'Bajaj Allianz', claims: 18, approved: 14, rejected: 2, pending: 2, value: '₹5,60,000', settlementRate: '78%' },
    { name: 'New India Assurance', claims: 15, approved: 11, rejected: 1, pending: 3, value: '₹4,20,000', settlementRate: '73%' },
    { name: 'Max Bupa', claims: 12, approved: 10, rejected: 1, pending: 1, value: '₹3,80,000', settlementRate: '83%' },
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
                    {agingData.map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="py-2 px-3 font-medium">{row.range}</td>
                        <td className="py-2 px-3 text-center">{row.count}</td>
                        <td className="py-2 px-3 text-right">{row.value}</td>
                        <td className="py-2 px-3 text-right">{Math.round(row.count / 30 * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800 font-medium">
                    <tr>
                      <td className="py-2 px-3">Total</td>
                      <td className="py-2 px-3 text-center">{agingData.reduce((s, r) => s + r.count, 0)}</td>
                      <td className="py-2 px-3 text-right">₹21,10,000</td>
                      <td className="py-2 px-3 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insurer" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Insurer-wise Performance</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="py-2 px-3 text-left font-medium">Insurer</th>
                        <th className="py-2 px-3 text-center font-medium">Total Claims</th>
                        <th className="py-2 px-3 text-center font-medium">Approved</th>
                        <th className="py-2 px-3 text-center font-medium">Rejected</th>
                        <th className="py-2 px-3 text-center font-medium">Pending</th>
                        <th className="py-2 px-3 text-right font-medium">Total Value</th>
                        <th className="py-2 px-3 text-right font-medium">Settlement %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insurerWise.map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2 px-3 font-medium">{row.name}</td>
                          <td className="py-2 px-3 text-center">{row.claims}</td>
                          <td className="py-2 px-3 text-center text-green-600">{row.approved}</td>
                          <td className="py-2 px-3 text-center text-red-600">{row.rejected}</td>
                          <td className="py-2 px-3 text-center text-amber-600">{row.pending}</td>
                          <td className="py-2 px-3 text-right">{row.value}</td>
                          <td className="py-2 px-3 text-right">
                            <Badge className={parseInt(row.settlementRate) >= 80 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                              {row.settlementRate}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
