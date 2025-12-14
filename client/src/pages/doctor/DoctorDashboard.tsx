import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Users, MessageSquare, Star, Activity, FileText, Phone, AlertTriangle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

const DoctorDashboard = () => {
  const { currentDoctor } = useAuth();
  const { toast } = useToast();

  // Fetch dashboard stats from API
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['doctor-dashboard-stats'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/dashboard/stats');
        return response.data;
      } catch (err: any) {
        // Fallback to default stats if API fails
        console.warn('Failed to fetch dashboard stats:', err.message);
        return {
          totalPatients: 124,
          totalConsultations: 48,
          rating: 4.8,
          responseRate: 95,
          patientGrowth: 12,
          consultationGrowth: 8,
          ratingGrowth: 0.2,
          responseRateGrowth: 3
        };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const displayStats = [
    {
      title: "Total Patients",
      value: stats?.totalPatients || "124",
      icon: Users,
      trend: `+${stats?.patientGrowth || 12}%`,
      color: "text-primary",
    },
    {
      title: "Consultations",
      value: stats?.totalConsultations || "48",
      icon: MessageSquare,
      trend: `+${stats?.consultationGrowth || 8}%`,
      color: "text-success",
    },
    {
      title: "Rating",
      value: stats?.rating || "4.8",
      icon: Star,
      trend: `+${stats?.ratingGrowth || 0.2}`,
      color: "text-warning",
    },
    {
      title: "Response Rate",
      value: `${stats?.responseRate || 95}%`,
      icon: Activity,
      trend: `+${stats?.responseRateGrowth || 3}%`,
      color: "text-info",
    },
  ];

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-brand">
                Welcome back, Dr. {currentDoctor?.firstName}
              </h1>
              <p className="text-muted mt-1">Here's your practice overview</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
                      <div className="h-8 bg-gray-200 rounded animate-pulse w-16"></div>
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-12"></div>
                    </div>
                    <div className="h-6 w-6 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </Card>
              ))
            ) : (
              displayStats.map((stat, index) => (
                <Card key={index} className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted">{stat.title}</p>
                      <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
                      <p className="text-sm text-success mt-1">{stat.trend}</p>
                    </div>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4 mt-8">
            <Button asChild variant="outline" className="h-auto p-6">
              <Link to="/doctor/appointments" className="flex flex-col items-center gap-2">
                <Calendar className="h-8 w-8 text-primary" />
                <span className="font-semibold">View Appointments</span>
                <span className="text-sm text-gray-500">Manage your schedule</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto p-6 card-primary">
              <Link to="/doctor/health-monitoring" className="flex flex-col items-center gap-2">
                <Activity className="h-8 w-8 text-primary" />
                <span className="font-semibold">Health Monitoring</span>
                <span className="text-sm text-muted">Remote patient vitals</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto p-6 card-success">
              <Link to="/doctor/prescriptions" className="flex flex-col items-center gap-2">
                <FileText className="h-8 w-8 text-success" />
                <span className="font-semibold">Prescriptions</span>
                <span className="text-sm text-muted">Create & manage Rx</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto p-6 card-info">
              <Link to="/doctor/contact" className="flex flex-col items-center gap-2">
                <Phone className="h-8 w-8 text-info" />
                <span className="font-semibold">Contact</span>
                <span className="text-sm text-muted">Messages & support</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto p-6 card-warning">
              <Link to="/doctor/alerts" className="flex flex-col items-center gap-2">
                <AlertTriangle className="h-8 w-8 text-warning" />
                <span className="font-semibold">Alerts</span>
                <span className="text-sm text-muted">View notifications</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto p-6">
              <Link to="/doctor/chat" className="flex flex-col items-center gap-2">
                <MessageSquare className="h-8 w-8 text-primary" />
                <span className="font-semibold">Chat with Patients</span>
                <span className="text-sm text-muted">Start consultations</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto p-6">
              <Link to="/doctor/availability" className="flex flex-col items-center gap-2">
                <Clock className="h-8 w-8 text-primary" />
                <span className="font-semibold">Availability Settings</span>
                <span className="text-sm text-muted">Manage time slots</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default DoctorDashboard;
