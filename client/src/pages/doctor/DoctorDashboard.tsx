import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Calendar, 
  Clock, 
  Users, 
  MessageSquare, 
  Star, 
  Activity, 
  FileText, 
  AlertTriangle, 
  BarChart3, 
  FileSearch, 
  Video,
  Stethoscope,
  HeartPulse,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  CheckCircle2,
  Bell,
  Pill,
  UserCheck,
  CalendarCheck,
  DollarSign,
  ChevronRight,
  Sparkles,
  Zap,
  Award
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { currentDoctor, userType } = useAuth();
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Ring-fencing: Redirect non-doctor users
  useEffect(() => {
    const storedUserType = localStorage.getItem('userType');
    const doctorToken = localStorage.getItem('doctorToken');
    
    // If not a doctor, redirect to appropriate page
    if (storedUserType !== 'doctor' && userType !== 'doctor' && !doctorToken) {
      console.log('[DoctorDashboard] Non-doctor user detected, redirecting...');
      if (storedUserType === 'user' || !storedUserType) {
        navigate('/', { replace: true });
      } else if (storedUserType === 'clinic') {
        navigate('/clinic/dashboard', { replace: true });
      } else {
        navigate('/doctor/login', { replace: true });
      }
    }
  }, [userType, navigate]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch dashboard stats from API
  const { data: stats, isLoading } = useQuery({
    queryKey: ['doctor-dashboard-stats'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/dashboard/stats');
        return response.data;
      } catch (err: any) {
        console.warn('Failed to fetch dashboard stats:', err.message);
        return {
          totalPatients: 124,
          totalConsultations: 48,
          rating: 4.8,
          responseRate: 95,
          patientGrowth: 12,
          consultationGrowth: 8,
          ratingGrowth: 0.2,
          responseRateGrowth: 3,
          todayAppointments: 8,
          pendingAppointments: 3,
          completedToday: 5,
          revenue: 24500
        };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch today's appointments
  const { data: todayAppointments } = useQuery({
    queryKey: ['doctor-today-appointments'],
    queryFn: async () => {
      try {
        const response = await api.get('/appointments/doctor/today');
        return response.data.appointments || [];
      } catch (err) {
        return [
          { id: 1, patientName: "Rahul Sharma", time: "10:00 AM", type: "Video", status: "upcoming" },
          { id: 2, patientName: "Priya Patel", time: "11:30 AM", type: "In-Person", status: "upcoming" },
          { id: 3, patientName: "Amit Kumar", time: "02:00 PM", type: "Video", status: "upcoming" },
        ];
      }
    },
    staleTime: 2 * 60 * 1000,
  });

  // Fetch alerts
  const { data: alerts } = useQuery({
    queryKey: ['doctor-alerts'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/alerts');
        return response.data.alerts || [];
      } catch (err) {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  // Stats cards data
  const displayStats = [
    {
      title: "Total Patients",
      value: stats?.totalPatients || "124",
      icon: Users,
      trend: stats?.patientGrowth || 12,
      trendLabel: "vs last month",
      bgColor: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      title: "Today's Appointments",
      value: stats?.todayAppointments || "8",
      icon: CalendarCheck,
      trend: null,
      trendLabel: `${stats?.completedToday || 5} completed`,
      bgColor: "bg-teal-500/10",
      iconColor: "text-teal-500",
    },
    {
      title: "Rating",
      value: stats?.rating || "4.8",
      icon: Star,
      trend: stats?.ratingGrowth || 0.2,
      trendLabel: "this month",
      bgColor: "bg-amber-500/10",
      iconColor: "text-amber-500",
    },
    {
      title: "Revenue",
      value: `₹${((stats?.revenue || 24500) / 1000).toFixed(1)}K`,
      icon: DollarSign,
      trend: 15,
      trendLabel: "vs last month",
      bgColor: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
  ];

  // Quick actions
  const quickActions = [
    {
      title: "New Appointment",
      description: "Schedule a consultation",
      icon: Calendar,
      link: "/doctor/appointments",
      bgColor: "bg-blue-500/10 dark:bg-blue-500/20",
      iconColor: "text-blue-500",
    },
    {
      title: "Prescriptions",
      description: "Write & manage prescriptions",
      icon: Pill,
      link: "/doctor/prescriptions",
      bgColor: "bg-teal-500/10 dark:bg-teal-500/20",
      iconColor: "text-teal-500",
    },
    {
      title: "Video Consultation",
      description: "Start video call",
      icon: Video,
      link: "/doctor/video",
      bgColor: "bg-purple-500/10 dark:bg-purple-500/20",
      iconColor: "text-purple-500",
    },
    {
      title: "View Patients",
      description: "Patient records",
      icon: UserCheck,
      link: "/doctor/patients",
      bgColor: "bg-orange-500/10 dark:bg-orange-500/20",
      iconColor: "text-orange-500",
    },
  ];

  // Features grid
  const features = [
    {
      title: "Appointments",
      description: "Manage your schedule",
      icon: Calendar,
      link: "/doctor/appointments",
      badge: stats?.pendingAppointments ? `${stats.pendingAppointments} pending` : null,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Patients",
      description: "View patient records",
      icon: Users,
      link: "/doctor/patients",
      badge: null,
      color: "text-teal-500",
      bgColor: "bg-teal-500/10",
    },
    {
      title: "Prescriptions",
      description: "Write & manage prescriptions",
      icon: FileText,
      link: "/doctor/prescriptions",
      badge: null,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Health Monitor",
      description: "Patient vitals & trends",
      icon: HeartPulse,
      link: "/doctor/health-monitoring",
      badge: null,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      title: "Chat",
      description: "Message patients",
      icon: MessageSquare,
      link: "/doctor/chat",
      badge: null,
      color: "text-indigo-500",
      bgColor: "bg-indigo-500/10",
    },
    {
      title: "Analytics",
      description: "Practice insights",
      icon: BarChart3,
      link: "/doctor/analytics",
      badge: null,
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
    },
    {
      title: "Availability",
      description: "Set time slots",
      icon: Clock,
      link: "/doctor/availability",
      badge: null,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Document Templates",
      description: "Prescriptions & forms",
      icon: FileSearch,
      link: "/doctor/templates",
      badge: null,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
  ];

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 px-4 md:px-0">
        {/* Welcome Section - Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-400/10 to-transparent rounded-full blur-2xl" />
          
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16 border-2 border-white/20 shadow-xl">
                <AvatarImage src={currentDoctor?.profileImage} />
                <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-xl">
                  {currentDoctor?.firstName?.[0]}{currentDoctor?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                    {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </Badge>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-1">
                  {getGreeting()}, Dr. {currentDoctor?.firstName}!
                </h1>
                <p className="text-slate-300 text-sm md:text-base flex items-center gap-2">
                  <span>{currentDoctor?.specialization || "General Practitioner"}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    {stats?.rating || "4.8"}
                  </span>
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Link to="/doctor/appointments">
                <Button variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/30">
                  <Calendar className="w-4 h-4 mr-2" />
                  Schedule
                </Button>
              </Link>
              <Link to="/doctor/video">
                <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30 border-0">
                  <Video className="w-4 h-4 mr-2" />
                  Start Consultation
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded animate-pulse w-24"></div>
                    <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded animate-pulse w-16"></div>
                    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded animate-pulse w-20"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            displayStats.map((stat, index) => (
              <Card 
                key={index} 
                className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/5 transition-all duration-300 overflow-hidden group"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn("p-2 rounded-xl transition-colors", stat.bgColor, "group-hover:bg-teal-500/20")}>
                      <stat.icon className={cn("w-5 h-5 transition-colors", stat.iconColor, "group-hover:text-teal-500")} />
                    </div>
                    {stat.trend !== null && (
                      <Badge variant="outline" className={cn(
                        "text-xs border",
                        typeof stat.trend === 'number' && stat.trend >= 0 
                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700" 
                          : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700"
                      )}>
                        {typeof stat.trend === 'number' && stat.trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                        {typeof stat.trend === 'number' && stat.trend >= 0 ? "+" : ""}{stat.trend}%
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{stat.title}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-800 dark:text-white">{stat.value}</span>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{stat.trendLabel}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Quick Actions
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Link key={index} to={action.link} className="group">
                <Card className="h-full bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/10 transition-all duration-300">
                  <CardContent className="p-4">
                    <div className={cn("p-3 rounded-xl w-fit mb-3 transition-all duration-300", action.bgColor, "group-hover:scale-110")}>
                      <action.icon className={cn("w-6 h-6", action.iconColor)} />
                    </div>
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-1 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                      {action.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{action.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Schedule */}
          <Card className="lg:col-span-2 bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarCheck className="w-5 h-5 text-teal-500" />
                  Today's Schedule
                </CardTitle>
                <Link to="/doctor/appointments">
                  <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700">
                    View All <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {todayAppointments && todayAppointments.length > 0 ? (
                <div className="space-y-3">
                  {todayAppointments.slice(0, 5).map((apt: any, index: number) => (
                    <div 
                      key={apt.id || index}
                      className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-sm">
                          {apt.patientName?.split(' ').map((n: string) => n[0]).join('') || 'P'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 dark:text-white truncate">
                          {apt.patientName || (apt.patient?.firstName + ' ' + apt.patient?.lastName)}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {apt.time || apt.appointmentTime}
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className="flex items-center gap-1">
                            {apt.type === "Video" ? <Video className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                            {apt.type || apt.consultationType}
                          </span>
                        </p>
                      </div>
                      <Badge variant={apt.status === "completed" ? "secondary" : "default"} className={cn(
                        apt.status === "completed" 
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                          : "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
                      )}>
                        {apt.status || "upcoming"}
                      </Badge>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarCheck className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400">No appointments scheduled for today</p>
                  <Link to="/doctor/appointments">
                    <Button variant="outline" size="sm" className="mt-3">
                      View Schedule
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alerts & Notifications */}
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="w-5 h-5 text-amber-500" />
                Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alerts && alerts.length > 0 ? (
                <div className="space-y-3">
                  {alerts.slice(0, 4).map((alert: any, index: number) => (
                    <div key={index} className={cn(
                      "p-3 rounded-xl border",
                      alert.type === "critical" 
                        ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" 
                        : alert.type === "warning"
                        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                        : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                    )}>
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={cn(
                          "w-5 h-5 mt-0.5",
                          alert.type === "critical" ? "text-red-500" : 
                          alert.type === "warning" ? "text-amber-500" : "text-blue-500"
                        )} />
                        <div>
                          <p className="font-medium text-sm text-slate-800 dark:text-white">{alert.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{alert.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30 w-fit mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">All clear! No pending alerts</p>
                </div>
              )}
              <Link to="/doctor/alerts" className="block mt-4">
                <Button variant="outline" className="w-full">
                  View All Alerts
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Features Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-500" />
              Practice Management
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {features.map((feature, index) => (
              <Link key={index} to={feature.link} className="group">
                <Card className="h-full bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/10 transition-all duration-300">
                  <CardContent className="p-4 flex flex-col items-center text-center">
                    <div className={cn("p-3 rounded-xl mb-3 transition-all duration-300 group-hover:scale-110", feature.bgColor)}>
                      <feature.icon className={cn("w-6 h-6", feature.color)} />
                    </div>
                    <h3 className="font-medium text-slate-800 dark:text-white text-sm mb-1 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{feature.description}</p>
                    {feature.badge && (
                      <Badge variant="outline" className="mt-2 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700">
                        {feature.badge}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Performance Summary */}
        <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              {/* Performance Score Circle */}
              <div className="flex flex-col items-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200 dark:text-slate-700" />
                    <circle 
                      cx="50" cy="50" r="40" fill="none" 
                      stroke="url(#gradient)" 
                      strokeWidth="8" 
                      strokeLinecap="round"
                      strokeDasharray={`${(stats?.responseRate || 95) * 2.51} 251`}
                      className="transition-all duration-1000"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#14b8a6" />
                        <stop offset="100%" stopColor="#0d9488" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-slate-800 dark:text-white">{stats?.responseRate || 95}%</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Response</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-emerald-500 font-medium">+{stats?.responseRateGrowth || 3}% this month</span>
                </div>
              </div>

              {/* Performance Breakdown */}
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Patient Satisfaction</span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-white">92%</span>
                    </div>
                    <Progress value={92} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Consultation Rate</span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-white">88%</span>
                    </div>
                    <Progress value={88} className="h-2" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-600 dark:text-slate-400">On-time Rate</span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-white">95%</span>
                    </div>
                    <Progress value={95} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Follow-up Rate</span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-white">78%</span>
                    </div>
                    <Progress value={78} className="h-2" />
                  </div>
                </div>
              </div>

              {/* Achievements */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <Award className="w-6 h-6 text-amber-500" />
                  <span className="font-semibold text-slate-800 dark:text-white">Top Rated</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={cn(
                      "w-5 h-5",
                      star <= Math.floor(stats?.rating || 4.8) 
                        ? "text-amber-400 fill-amber-400" 
                        : "text-slate-300 dark:text-slate-600"
                    )} />
                  ))}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{stats?.totalConsultations || 48} consultations</p>
                <Link to="/doctor/analytics">
                  <Button variant="outline" size="sm">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    View Analytics
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default DoctorDashboard;
