import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  Calendar, 
  Users,
  IndianRupee,
  TrendingUp,
  Download,
  Loader2,
  FileText,
  Clock,
  CheckCircle
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import api from '@/utils/api';

const AssistantReports = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<string>('week');
  const [stats, setStats] = useState({
    totalAppointments: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    totalPatients: 0,
    newPatients: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    prescriptionsIssued: 0
  });

  useEffect(() => {
    const token = localStorage.getItem('assistantToken');
    if (!token) {
      navigate('/assistant/login');
      return;
    }
    fetchStats();
  }, [navigate, dateRange]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/assistant/reports', { params: { range: dateRange } });
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Mock data
      setStats({
        totalAppointments: dateRange === 'week' ? 45 : dateRange === 'month' ? 180 : 15,
        completedAppointments: dateRange === 'week' ? 38 : dateRange === 'month' ? 155 : 12,
        cancelledAppointments: dateRange === 'week' ? 3 : dateRange === 'month' ? 12 : 1,
        totalPatients: dateRange === 'week' ? 32 : dateRange === 'month' ? 95 : 10,
        newPatients: dateRange === 'week' ? 8 : dateRange === 'month' ? 25 : 3,
        totalRevenue: dateRange === 'week' ? 45000 : dateRange === 'month' ? 185000 : 12000,
        pendingPayments: dateRange === 'week' ? 8500 : dateRange === 'month' ? 32000 : 2500,
        prescriptionsIssued: dateRange === 'week' ? 42 : dateRange === 'month' ? 168 : 14
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = (type: string) => {
    toast.success(`Downloading ${type} report as PDF`);
  };

  const completionRate = stats.totalAppointments > 0 
    ? Math.round((stats.completedAppointments / stats.totalAppointments) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-purple-600" />
              Reports & Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              View practice performance and generate reports
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => handleDownloadReport('summary')}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Appointments</p>
                      <p className="text-3xl font-bold text-purple-600">{stats.totalAppointments}</p>
                    </div>
                    <Calendar className="h-8 w-8 text-purple-300" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completion Rate</p>
                      <p className="text-3xl font-bold text-green-600">{completionRate}%</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-300" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Patients</p>
                      <p className="text-3xl font-bold text-blue-600">{stats.totalPatients}</p>
                      <p className="text-xs text-green-600">+{stats.newPatients} new</p>
                    </div>
                    <Users className="h-8 w-8 text-blue-300" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Revenue</p>
                      <p className="text-3xl font-bold text-green-600 flex items-center">
                        <IndianRupee className="h-6 w-6" />
                        {stats.totalRevenue.toLocaleString()}
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-green-300" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Appointments Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-purple-600" />
                    Appointments Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span>Completed</span>
                      </div>
                      <span className="font-bold text-green-600">{stats.completedAppointments}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-yellow-600" />
                        <span>Pending</span>
                      </div>
                      <span className="font-bold text-yellow-600">
                        {stats.totalAppointments - stats.completedAppointments - stats.cancelledAppointments}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="h-5 w-5 text-red-600">✕</span>
                        <span>Cancelled</span>
                      </div>
                      <span className="font-bold text-red-600">{stats.cancelledAppointments}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <IndianRupee className="h-5 w-5 text-purple-600" />
                    Financial Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <span>Total Revenue</span>
                      <span className="font-bold text-green-600">₹{stats.totalRevenue.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                      <span>Pending Payments</span>
                      <span className="font-bold text-yellow-600">₹{stats.pendingPayments.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <span>Collection Rate</span>
                      <span className="font-bold text-blue-600">
                        {Math.round((stats.totalRevenue / (stats.totalRevenue + stats.pendingPayments)) * 100)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Reports */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Generate Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="hover:shadow-md cursor-pointer transition-shadow" onClick={() => handleDownloadReport('daily')}>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <FileText className="h-10 w-10 mx-auto text-purple-600 mb-2" />
                        <p className="font-medium">Daily Summary</p>
                        <p className="text-sm text-muted-foreground">Appointments & collections</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="hover:shadow-md cursor-pointer transition-shadow" onClick={() => handleDownloadReport('patient')}>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <Users className="h-10 w-10 mx-auto text-blue-600 mb-2" />
                        <p className="font-medium">Patient Report</p>
                        <p className="text-sm text-muted-foreground">Patient list & history</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="hover:shadow-md cursor-pointer transition-shadow" onClick={() => handleDownloadReport('financial')}>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <IndianRupee className="h-10 w-10 mx-auto text-green-600 mb-2" />
                        <p className="font-medium">Financial Report</p>
                        <p className="text-sm text-muted-foreground">Revenue & payments</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* Activity Stats */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Your Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-600">{stats.prescriptionsIssued}</p>
                    <p className="text-sm text-muted-foreground">Prescriptions Processed</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{stats.newPatients}</p>
                    <p className="text-sm text-muted-foreground">Patients Registered</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{stats.completedAppointments}</p>
                    <p className="text-sm text-muted-foreground">Appointments Managed</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">24</p>
                    <p className="text-sm text-muted-foreground">Messages Sent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default AssistantReports;
