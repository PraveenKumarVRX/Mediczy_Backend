import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MainLayout from '@/components/layout/MainLayout';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Calendar, 
  Download,
  ArrowLeft,
  FileText,
  Activity,
  Clock,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

const TeamReports = () => {
  const { toast } = useToast();

  const downloadCsv = (filename: string, rows: Array<Record<string, any>>) => {
    const headers = Array.from(
      rows.reduce((acc, row) => {
        Object.keys(row || {}).forEach((k) => acc.add(k));
        return acc;
      }, new Set<string>())
    );

    const escape = (value: any) => {
      const str = String(value ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r?.[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadReport = (reportType: string) => {
    toast({
      title: "Download started",
      description: `Preparing ${reportType} report...`
    });

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (reportType === 'appointments') {
      downloadCsv(`appointments-${stamp}.csv`, appointmentRows);
      return;
    }
    if (reportType === 'performance') {
      downloadCsv(`performance-${stamp}.csv`, performanceRows);
      return;
    }

    downloadCsv(`user-analytics-${stamp}.csv`, analyticsRows);
  };

  const stats = [
    {
      title: 'Total Users',
      value: '12,345',
      change: '+12.5%',
      trend: 'up',
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Active Appointments',
      value: '1,234',
      change: '+8.2%',
      trend: 'up',
      icon: Calendar,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Completed Today',
      value: '567',
      change: '+15.3%',
      trend: 'up',
      icon: CheckCircle2,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    {
      title: 'Response Time',
      value: '2.3 min',
      change: '-5.1%',
      trend: 'down',
      icon: Clock,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10'
    }
  ];

  const recentReports = [
    {
      id: 1,
      title: 'Monthly User Activity Report',
      date: '2025-11-20',
      type: 'Analytics',
      status: 'Ready'
    },
    {
      id: 2,
      title: 'Appointment Statistics',
      date: '2025-11-19',
      type: 'Operations',
      status: 'Ready'
    },
    {
      id: 3,
      title: 'Patient Satisfaction Survey',
      date: '2025-11-18',
      type: 'Feedback',
      status: 'Ready'
    },
    {
      id: 4,
      title: 'System Performance Metrics',
      date: '2025-11-17',
      type: 'Technical',
      status: 'Processing'
    }
  ];

  const appointmentRows = [
    { date: '2025-12-10', booked: 612, completed: 567, cancelled: 44, noShow: 12 },
    { date: '2025-12-11', booked: 590, completed: 541, cancelled: 39, noShow: 10 },
    { date: '2025-12-12', booked: 644, completed: 603, cancelled: 42, noShow: 14 },
  ];

  const performanceRows = [
    { metric: 'API uptime', value: '99.95%', window: 'Last 30 days' },
    { metric: 'Avg API latency', value: '180ms', window: 'Last 24 hours' },
    { metric: 'Chat first response', value: '2m 10s', window: 'Last 7 days' },
    { metric: 'Appointment booking success', value: '98.8%', window: 'Last 7 days' },
  ];

  const analyticsRows = [
    { metric: 'Total users', value: 12345 },
    { metric: 'Active appointments', value: 1234 },
    { metric: 'Completed today', value: 567 },
    { metric: 'Response time', value: '2.3 min' },
  ];

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto animate-in fade-in duration-700">
        {/* Back Button */}
        <Link 
          to="/team/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8 text-purple-500" />
            Reports & Analytics
          </h1>
          <p className="text-muted-foreground">View performance metrics and generate reports</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="downloads">Downloads</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((stat, index) => (
                <Card key={index} className="group hover:shadow-lg transition-all duration-300">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                        <stat.icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          stat.trend === 'up'
                            ? 'bg-green-500/10 text-green-700 border-green-500/20'
                            : 'bg-red-500/10 text-red-700 border-red-500/20'
                        }
                      >
                        {stat.change}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Recent Reports */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-6 w-6 text-green-500" />
                  Recent Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentReports.map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                          <FileText className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{report.title}</h4>
                          <div className="flex items-center gap-4 mt-1">
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(report.date).toLocaleDateString()}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {report.type}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={report.status === 'Ready' ? 'default' : 'secondary'}
                          className={
                            report.status === 'Ready'
                              ? 'bg-green-500/10 text-green-700 border-green-500/20'
                              : 'bg-orange-500/10 text-orange-700 border-orange-500/20'
                          }
                        >
                          {report.status}
                        </Badge>
                        {report.status === 'Ready' && (
                          <Button size="sm" variant="outline" onClick={() => handleDownloadReport('analytics')}>
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="downloads" className="space-y-6">
            <Card className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-blue-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-6 w-6 text-blue-500" />
                  Downloads
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <Button className="h-auto flex-col items-start p-4 gap-2" onClick={() => handleDownloadReport('analytics')}>
                    <div className="flex items-center gap-2 w-full">
                      <Users className="h-5 w-5" />
                      <span className="font-semibold">User Analytics</span>
                    </div>
                    <p className="text-xs text-left opacity-90">Download CSV export</p>
                  </Button>

                  <Button className="h-auto flex-col items-start p-4 gap-2" variant="outline" onClick={() => handleDownloadReport('appointments')}>
                    <div className="flex items-center gap-2 w-full">
                      <Calendar className="h-5 w-5" />
                      <span className="font-semibold">Appointments</span>
                    </div>
                    <p className="text-xs text-left text-muted-foreground">Download CSV export</p>
                  </Button>

                  <Button className="h-auto flex-col items-start p-4 gap-2" variant="outline" onClick={() => handleDownloadReport('performance')}>
                    <div className="flex items-center gap-2 w-full">
                      <TrendingUp className="h-5 w-5" />
                      <span className="font-semibold">Performance</span>
                    </div>
                    <p className="text-xs text-left text-muted-foreground">Download CSV export</p>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appointments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-6 w-6 text-purple-500" />
                    Appointment Analysis
                  </span>
                  <Button size="sm" variant="outline" onClick={() => handleDownloadReport('appointments')}>
                    <Download className="h-4 w-4 mr-1" />
                    Download CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2">Date</th>
                        <th className="py-2">Booked</th>
                        <th className="py-2">Completed</th>
                        <th className="py-2">Cancelled</th>
                        <th className="py-2">No Show</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointmentRows.map((row) => (
                        <tr key={row.date} className="border-b">
                          <td className="py-2">{row.date}</td>
                          <td className="py-2">{row.booked}</td>
                          <td className="py-2">{row.completed}</td>
                          <td className="py-2">{row.cancelled}</td>
                          <td className="py-2">{row.noShow}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-green-500" />
                    Performance
                  </span>
                  <Button size="sm" variant="outline" onClick={() => handleDownloadReport('performance')}>
                    <Download className="h-4 w-4 mr-1" />
                    Download CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {performanceRows.map((row) => (
                  <div key={row.metric} className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                    <div>
                      <p className="font-medium">{row.metric}</p>
                      <p className="text-xs text-muted-foreground">{row.window}</p>
                    </div>
                    <Badge variant="outline">{row.value}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default TeamReports;
