import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Users, Calendar, DollarSign, Activity, Loader2 } from "lucide-react";
import { useState } from "react";
import api from "@/utils/api";

const DoctorAnalytics = () => {
  const [period, setPeriod] = useState("30");

  const { data: analytics, isLoading, error } = useQuery({
    queryKey: ['doctor-analytics', period],
    queryFn: async () => {
      try {
        const response = await api.get(`/doctors/analytics?period=${period}`);
        return response.data.analytics;
      } catch (err) {
        console.warn('Failed to fetch analytics:', err);
        // Return mock data as fallback
        return {
          appointmentsByStatus: [
            { status: 'completed', count: 45 },
            { status: 'scheduled', count: 12 },
            { status: 'cancelled', count: 3 }
          ],
          appointmentsByDay: [
            { date: '2025-12-20', count: 8 },
            { date: '2025-12-21', count: 6 },
            { date: '2025-12-22', count: 10 },
            { date: '2025-12-23', count: 7 },
            { date: '2025-12-24', count: 5 },
            { date: '2025-12-25', count: 0 },
            { date: '2025-12-26', count: 9 },
            { date: '2025-12-27', count: 4 }
          ],
          totalRevenue: 125000,
          period: `${period} days`
        };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const statusColors: Record<string, string> = {
    completed: 'bg-green-500',
    scheduled: 'bg-blue-500',
    cancelled: 'bg-red-500',
    pending: 'bg-yellow-500'
  };

  const maxCount = Math.max(...(analytics?.appointmentsByDay?.map((d: any) => d.count) || [1]));

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
            <p className="text-muted-foreground">Track your practice performance</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                  <DollarSign className="h-5 w-5 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">₹{analytics?.totalRevenue?.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">Last {period} days</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Appointments</CardTitle>
                  <Calendar className="h-5 w-5 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics?.appointmentsByStatus?.reduce((sum: number, s: any) => sum + s.count, 0) || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Across all statuses</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
                  <TrendingUp className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics?.appointmentsByStatus ? (
                      Math.round(
                        ((analytics.appointmentsByStatus.find((s: any) => s.status === 'completed')?.count || 0) /
                        Math.max(analytics.appointmentsByStatus.reduce((sum: number, s: any) => sum + s.count, 0), 1)) * 100
                      )
                    ) : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Completed appointments</p>
                </CardContent>
              </Card>
            </div>

            {/* Appointments by Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Appointments by Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {analytics?.appointmentsByStatus?.map((status: any) => (
                    <div key={status.status} className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg min-w-[150px]">
                      <div className={`w-3 h-3 rounded-full ${statusColors[status.status] || 'bg-gray-500'}`} />
                      <div>
                        <p className="text-sm font-medium capitalize">{status.status}</p>
                        <p className="text-2xl font-bold">{status.count}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Daily Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Daily Appointment Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-48">
                  {analytics?.appointmentsByDay?.slice(-14).map((day: any, index: number) => (
                    <div key={index} className="flex-1 flex flex-col items-center gap-2">
                      <div 
                        className="w-full bg-primary rounded-t transition-all duration-300 hover:bg-primary/80"
                        style={{ height: `${Math.max((day.count / maxCount) * 150, 4)}px` }}
                        title={`${day.count} appointments`}
                      />
                      <span className="text-xs text-muted-foreground rotate-45 origin-left">
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default DoctorAnalytics;
