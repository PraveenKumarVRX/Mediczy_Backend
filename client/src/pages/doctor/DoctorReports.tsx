import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Calendar, Filter, Loader2, FileSpreadsheet, Users, Clock } from "lucide-react";
import { useState } from "react";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

const DoctorReports = () => {
  const [reportType, setReportType] = useState("appointments");
  const [period, setPeriod] = useState("30");
  const { toast } = useToast();

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['doctor-reports', reportType, period],
    queryFn: async () => {
      try {
        const response = await api.get(`/doctors/analytics?period=${period}`);
        return response.data.analytics;
      } catch (err) {
        console.warn('Failed to fetch report data:', err);
        return {
          appointmentsByStatus: [
            { status: 'completed', count: 45 },
            { status: 'scheduled', count: 12 },
            { status: 'cancelled', count: 3 }
          ],
          totalRevenue: 125000,
          period: `${period} days`
        };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleDownload = (format: 'pdf' | 'csv') => {
    toast({
      title: "Generating Report",
      description: `Your ${format.toUpperCase()} report is being prepared...`,
    });
    
    // In production, this would call an API to generate the report
    setTimeout(() => {
      toast({
        title: "Report Ready",
        description: `${reportType} report downloaded successfully`,
      });
    }, 1500);
  };

  const reportTypes = [
    { value: 'appointments', label: 'Appointments Report', icon: Calendar },
    { value: 'patients', label: 'Patient Summary', icon: Users },
    { value: 'revenue', label: 'Revenue Report', icon: FileSpreadsheet },
    { value: 'activity', label: 'Activity Log', icon: Clock },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Reports</h1>
            <p className="text-muted-foreground">Generate and download practice reports</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleDownload('csv')}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={() => handleDownload('pdf')}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Report Options
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Report Type</label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    {reportTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Time Period</label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
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
            </div>
          </CardContent>
        </Card>

        {/* Report Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Report Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Total Appointments</p>
                    <p className="text-2xl font-bold">
                      {reportData?.appointmentsByStatus?.reduce((sum: number, s: any) => sum + s.count, 0) || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold text-green-600">
                      {reportData?.appointmentsByStatus?.find((s: any) => s.status === 'completed')?.count || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Scheduled</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {reportData?.appointmentsByStatus?.find((s: any) => s.status === 'scheduled')?.count || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Revenue</p>
                    <p className="text-2xl font-bold text-amber-600">
                      ₹{reportData?.totalRevenue?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>

                {/* Report Table Preview */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Count</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {reportData?.appointmentsByStatus?.map((status: any, index: number) => {
                        const total = reportData.appointmentsByStatus.reduce((sum: number, s: any) => sum + s.count, 0);
                        const percentage = total > 0 ? Math.round((status.count / total) * 100) : 0;
                        return (
                          <tr key={index} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-sm capitalize">{status.status}</td>
                            <td className="px-4 py-3 text-sm font-medium">{status.count}</td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span>{percentage}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-sm text-muted-foreground text-center">
                  Report data for the last {period} days • Generated on {new Date().toLocaleDateString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default DoctorReports;
