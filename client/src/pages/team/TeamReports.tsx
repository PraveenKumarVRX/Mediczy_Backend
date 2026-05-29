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
  FileSpreadsheet,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/utils/api';

// ─── CSV helper ───────────────────────────────────────────────────────────────
const downloadCsv = (filename: string, rows: Array<Record<string, any>>) => {
  if (!rows.length) return;
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

// ─── Data fetching ────────────────────────────────────────────────────────────
const useModuleStats = () =>
  useQuery({
    queryKey: ['team-module-stats'],
    queryFn: async () => {
      const { data } = await api.get('/team/module-stats');
      return data;
    },
    staleTime: 60_000,
  });

const useAppointmentReport = () =>
  useQuery({
    queryKey: ['team-appointment-report'],
    queryFn: async () => {
      const { data } = await api.get('/team/appointments?limit=100');
      return data;
    },
    staleTime: 60_000,
  });

const useActivityStats = () =>
  useQuery({
    queryKey: ['team-activity-stats-report'],
    queryFn: async () => {
      const { data } = await api.get('/team/activity-stats');
      return data;
    },
    staleTime: 60_000,
  });

// ─── Component ────────────────────────────────────────────────────────────────
const TeamReports = () => {
  const { toast } = useToast();
  const { data: moduleStatsData, isLoading: statsLoading, refetch: refetchStats } = useModuleStats();
  const { data: apptData, isLoading: apptLoading, refetch: refetchAppt } = useAppointmentReport();
  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity } = useActivityStats();

  const moduleStats = moduleStatsData?.stats;
  const appointments: any[] = apptData?.appointments || [];
  const activityStats = activityData?.stats;

  const stamp = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const handleDownloadReport = (reportType: string) => {
    toast({ title: 'Download started', description: `Preparing ${reportType} report...` });

    if (reportType === 'appointments') {
      const rows = appointments.map((a) => ({
        id: a.id,
        patientName: a.patientName || '',
        doctorName: a.doctorName || '',
        date: a.appointmentDate || '',
        time: a.appointmentTime || '',
        type: a.consultationType || '',
        status: a.status || '',
        fee: a.totalFee || a.consultationFee || '',
      }));
      downloadCsv(`appointments-${stamp()}.csv`, rows.length ? rows : [{ note: 'No data' }]);
      return;
    }

    if (reportType === 'performance') {
      const rows = [
        { metric: 'Total users', value: moduleStats?.users?.total ?? '—' },
        { metric: 'Active users', value: moduleStats?.users?.active ?? '—' },
        { metric: 'Total doctors', value: moduleStats?.doctors?.total ?? '—' },
        { metric: 'Pending doctor verifications', value: moduleStats?.doctors?.pendingVerification ?? '—' },
        { metric: 'Appointments today', value: moduleStats?.appointments?.today ?? '—' },
        { metric: 'Total corporates', value: moduleStats?.corporates?.total ?? '—' },
      ];
      downloadCsv(`performance-${stamp()}.csv`, rows);
      return;
    }

    // analytics — activity stats
    const rows = [
      { metric: 'Events (24h)', value: activityStats?.last24Hours ?? '—' },
      { metric: 'Failures (24h)', value: activityStats?.failures24h ?? '—' },
      { metric: 'Events (7 days)', value: activityStats?.last7Days ?? '—' },
      { metric: 'Total events', value: activityStats?.total ?? '—' },
    ];
    downloadCsv(`user-analytics-${stamp()}.csv`, rows);
  };

  const statCards = [
    {
      title: 'Total Users',
      value: statsLoading ? '…' : (moduleStats?.users?.total?.toLocaleString() ?? '—'),
      subValue: moduleStats?.users?.active != null ? `${moduleStats.users.active.toLocaleString()} active` : undefined,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Doctors',
      value: statsLoading ? '…' : (moduleStats?.doctors?.total?.toLocaleString() ?? '—'),
      subValue: moduleStats?.doctors?.pendingVerification != null
        ? `${moduleStats.doctors.pendingVerification} pending verification`
        : undefined,
      icon: Activity,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Appointments Today',
      value: statsLoading ? '…' : (moduleStats?.appointments?.today?.toLocaleString() ?? '—'),
      icon: Calendar,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Activity Events (24h)',
      value: activityLoading ? '…' : (activityStats?.last24Hours?.toLocaleString() ?? '—'),
      subValue: activityStats?.failures24h != null ? `${activityStats.failures24h} failures` : undefined,
      icon: Clock,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
              <BarChart3 className="h-8 w-8 text-purple-500" />
              Reports & Analytics
            </h1>
            <p className="text-muted-foreground">Live platform metrics and exportable data</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchStats(); refetchAppt(); refetchActivity(); }}
            disabled={statsLoading || apptLoading || activityLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(statsLoading || apptLoading || activityLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="downloads">Downloads</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Live Stats Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {statCards.map((stat, index) => (
                <Card key={index} className="group hover:shadow-lg transition-all duration-300">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                        <stat.icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      {stat.subValue && (
                        <p className="text-xs text-muted-foreground mt-1">{stat.subValue}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Activity Summary */}
            {activityStats && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-6 w-6 text-blue-500" />
                    Platform Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total events', value: activityStats.total?.toLocaleString() },
                      { label: 'Last 7 days', value: activityStats.last7Days?.toLocaleString() },
                      { label: 'Last 24 hours', value: activityStats.last24Hours?.toLocaleString() },
                      { label: 'Failures (24h)', value: activityStats.failures24h?.toLocaleString() },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border bg-muted/40 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                        <p className="text-2xl font-semibold mt-1">{item.value ?? '—'}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
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
                    <p className="text-xs text-left opacity-90">Activity stats CSV</p>
                  </Button>

                  <Button className="h-auto flex-col items-start p-4 gap-2" variant="outline" onClick={() => handleDownloadReport('appointments')}>
                    <div className="flex items-center gap-2 w-full">
                      <Calendar className="h-5 w-5" />
                      <span className="font-semibold">Appointments</span>
                    </div>
                    <p className="text-xs text-left text-muted-foreground">Live appointment data CSV</p>
                  </Button>

                  <Button className="h-auto flex-col items-start p-4 gap-2" variant="outline" onClick={() => handleDownloadReport('performance')}>
                    <div className="flex items-center gap-2 w-full">
                      <TrendingUp className="h-5 w-5" />
                      <span className="font-semibold">Performance</span>
                    </div>
                    <p className="text-xs text-left text-muted-foreground">Module stats CSV</p>
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
                    Appointment Data
                  </span>
                  <Button size="sm" variant="outline" onClick={() => handleDownloadReport('appointments')}>
                    <Download className="h-4 w-4 mr-1" />
                    Download CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {apptLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Loading appointments...
                  </div>
                ) : appointments.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <AlertCircle className="h-6 w-6" />
                    <p>No appointments found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b text-xs uppercase text-muted-foreground">
                          <th className="py-2 px-2">Patient</th>
                          <th className="py-2 px-2">Doctor</th>
                          <th className="py-2 px-2">Date</th>
                          <th className="py-2 px-2">Type</th>
                          <th className="py-2 px-2">Status</th>
                          <th className="py-2 px-2">Fee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.map((row) => (
                          <tr key={row.id} className="border-b hover:bg-muted/20">
                            <td className="py-2 px-2">{row.patientName || '—'}</td>
                            <td className="py-2 px-2">{row.doctorName || '—'}</td>
                            <td className="py-2 px-2">{row.appointmentDate || '—'}</td>
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="text-xs capitalize">{row.consultationType || '—'}</Badge>
                            </td>
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="text-xs capitalize">{row.status || '—'}</Badge>
                            </td>
                            <td className="py-2 px-2">{row.consultationFee ? `₹${row.consultationFee}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-green-500" />
                    Platform Performance
                  </span>
                  <Button size="sm" variant="outline" onClick={() => handleDownloadReport('performance')}>
                    <Download className="h-4 w-4 mr-1" />
                    Download CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {statsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Loading stats...
                  </div>
                ) : (
                  [
                    { metric: 'Total users', value: moduleStats?.users?.total?.toLocaleString() ?? '—' },
                    { metric: 'Active users', value: moduleStats?.users?.active?.toLocaleString() ?? '—' },
                    { metric: 'Total doctors', value: moduleStats?.doctors?.total?.toLocaleString() ?? '—' },
                    { metric: 'Pending doctor verifications', value: moduleStats?.doctors?.pendingVerification?.toLocaleString() ?? '—' },
                    { metric: 'Appointments today', value: moduleStats?.appointments?.today?.toLocaleString() ?? '—' },
                    { metric: 'Total corporates', value: moduleStats?.corporates?.total?.toLocaleString() ?? '—' },
                  ].map((row) => (
                    <div key={row.metric} className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                      <p className="font-medium">{row.metric}</p>
                      <Badge variant="outline">{row.value}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default TeamReports;
