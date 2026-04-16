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
  RefreshCw,
  Wifi,
  WifiOff,
  Pill,
  UserCheck,
  CalendarCheck,
  DollarSign,
  ChevronRight,
  Sparkles,
  Zap,
  Award,
  Phone,
  Siren,
  LayoutGrid,
  ClipboardList,
  Wallet
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import socketService from '@/services/socket.service';
import { IncomingCallNotification } from '@/components/IncomingCallNotification';

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { currentDoctor, userType } = useAuth();
  const { toast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isUsingFallbackStats, setIsUsingFallbackStats] = useState(false);
  const [isUsingFallbackAppointments, setIsUsingFallbackAppointments] = useState(false);
  const [isUsingFallbackAlerts, setIsUsingFallbackAlerts] = useState(false);

  // Ring-fencing: Redirect non-doctor users
  useEffect(() => {
    const storedUserType = localStorage.getItem('userType');
    const doctorToken = localStorage.getItem('doctorToken');
    
    // If not a doctor, redirect to appropriate page
    if (storedUserType !== 'doctor' && userType !== 'doctor' && !doctorToken) {
      if (storedUserType === 'user' || !storedUserType) {
        navigate('/', { replace: true });
      } else if (storedUserType === 'clinic') {
        navigate('/clinic/dashboard', { replace: true });
      } else {
        navigate('/doctor/login', { replace: true });
      }
    }
  }, [userType, navigate]);

  // Socket.IO connection for emergency triage calls
  useEffect(() => {
    if (!currentDoctor?.id) return;

    console.log('🔌 Doctor Dashboard: Connecting Socket.IO for doctor:', currentDoctor.id);
    
    // Connect to Socket.IO
    socketService.connect(currentDoctor.id, 'doctor');
    setIsSocketConnected(true);

    // Listen for incoming triage call requests
    const handleTriageCallRequest = (callData: any) => {
      console.log('📞 Emergency call request received:', callData);
      setIncomingCall(callData);
      
      // Play notification sound via Web Audio API
      try {
        const ctx = new AudioContext();
        const playNote = (freq: number, start: number, dur: number) => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine'; osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.5, start + 0.02);
          gain.gain.linearRampToValueAtTime(0, start + dur);
          osc.start(start); osc.stop(start + dur);
        };
        const t = ctx.currentTime;
        playNote(784, t, 0.18); playNote(988, t + 0.2, 0.18);
        playNote(1175, t + 0.4, 0.18); playNote(1568, t + 0.62, 0.32);
        setTimeout(() => ctx.close(), 1500);
      } catch (e) {
        console.log('Audio initialization failed:', e);
      }
      
      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🚨 Emergency Call', {
          body: `${callData.patientName} needs urgent help`,
          icon: '/emergency-icon.png',
          tag: `call-${callData.appointmentId}`,
          requireInteraction: true,
        });
      }
      
      toast({
        title: "🚨 Emergency Call",
        description: `${callData.patientName} needs urgent medical attention`,
        variant: "default",
      });
    };

    socketService.on('triage-call-request', handleTriageCallRequest);

    // Cleanup on unmount
    return () => {
      console.log('🔌 Doctor Dashboard: Disconnecting Socket.IO');
      socketService.off('triage-call-request', handleTriageCallRequest);
      setIsSocketConnected(false);
    };
  }, [currentDoctor?.id, toast]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch dashboard stats from API
  const { data: stats, isLoading, refetch: refetchStats, isRefetching: isStatsRefetching } = useQuery({
    queryKey: ['doctor-dashboard-stats'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/dashboard/stats');
        setIsUsingFallbackStats(false);
        return response.data;
      } catch (err: any) {
        console.warn('Failed to fetch dashboard stats:', err.message);
        setIsUsingFallbackStats(true);
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
  const { data: todayAppointments, refetch: refetchTodayAppointments, isRefetching: isAppointmentsRefetching } = useQuery({
    queryKey: ['doctor-today-appointments'],
    queryFn: async () => {
      try {
        const response = await api.get('/appointments/doctor/today');
        setIsUsingFallbackAppointments(false);
        return response.data.appointments || [];
      } catch (err) {
        setIsUsingFallbackAppointments(true);
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
  const { data: alerts, refetch: refetchAlerts, isRefetching: isAlertsRefetching } = useQuery({
    queryKey: ['doctor-alerts'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/alerts');
        setIsUsingFallbackAlerts(false);
        return response.data.alerts || [];
      } catch (err) {
        setIsUsingFallbackAlerts(true);
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

  const handleRefreshDashboard = async () => {
    await Promise.all([refetchStats(), refetchTodayAppointments(), refetchAlerts()]);
  };

  const dashboardHasFallbackData =
    isUsingFallbackStats || isUsingFallbackAppointments || isUsingFallbackAlerts;

  // Accept incoming emergency call
  const handleAcceptIncomingCall = async (appointmentId: number) => {
    try {
      console.log('✅ Accepting emergency call:', appointmentId);
      
      const response = await api.post('/doctors/triage/accept-call', { appointmentId });
      
      toast({
        title: "✅ Call Accepted",
        description: "Joining video consultation...",
      });

      // Close incoming call notification
      setIncomingCall(null);

      // Navigate to video room with LiveKit token from accept response
      const roomId = response.data.appointment?.roomId || response.data.appointment?.meetingId;
      const livekit = response.data.livekit;
      
      if (livekit?.token && livekit?.serverUrl) {
        // Pass token via URL params so DoctorVideoConsultation can use it directly
        navigate(`/doctor/video?room=${encodeURIComponent(String(roomId))}&appointmentId=${appointmentId}&lkToken=${encodeURIComponent(livekit.token)}&lkServer=${encodeURIComponent(livekit.serverUrl)}`);
      } else if (roomId) {
        navigate(`/doctor/video?room=${encodeURIComponent(String(roomId))}&appointmentId=${appointmentId}`);
      }
    } catch (error: any) {
      console.error('Error accepting call:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to accept call",
        variant: "destructive",
      });
    }
  };

  // Reject incoming emergency call
  const handleRejectIncomingCall = async (appointmentId: number, reason?: string) => {
    try {
      console.log('❌ Rejecting emergency call:', appointmentId);
      
      await api.post('/doctors/triage/reject-call', { 
        appointmentId,
        reason: reason || 'Doctor unavailable' 
      });
      
      toast({
        title: "Call Rejected",
        description: "Patient has been notified",
      });

      // Close incoming call notification
      setIncomingCall(null);
    } catch (error: any) {
      console.error('Error rejecting call:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to reject call",
        variant: "destructive",
      });
    }
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

  // Derived values
  const sortedAppointments = (todayAppointments || []).slice().sort((a: any, b: any) => {
    const toMin = (t: string) => {
      if (!t) return 9999;
      const [time, ampm] = t.split(' ');
      const [h, m] = time.split(':').map(Number);
      return (ampm === 'PM' && h !== 12 ? h + 12 : ampm === 'AM' && h === 12 ? 0 : h) * 60 + (m || 0);
    };
    return toMin(a.time || a.appointmentTime) - toMin(b.time || b.appointmentTime);
  });
  const nextAppointment = sortedAppointments.find((a: any) => a.status !== 'completed');
  const completedCount = (todayAppointments || []).filter((a: any) => a.status === 'completed').length;
  const totalToday = stats?.todayAppointments || (todayAppointments || []).length || 8;
  const completionPct = totalToday > 0 ? Math.round((completedCount / totalToday) * 100) : 0;

  // Compact quick-launch grid (6 tiles)
  const quickLaunch = [
    { label: "Patients",      icon: Users,         link: "/doctor/patients",       bgColor: "bg-teal-500/10",      iconColor: "text-teal-600 dark:text-teal-400" },
    { label: "Prescriptions", icon: Pill,          link: "/doctor/prescriptions",  bgColor: "bg-purple-500/10",    iconColor: "text-purple-600 dark:text-purple-400" },
    { label: "Video Call",    icon: Video,         link: "/doctor/video",          bgColor: "bg-blue-500/10",      iconColor: "text-blue-600 dark:text-blue-400" },
    { label: "Health Mon.",   icon: HeartPulse,    link: "/doctor/health-monitoring", bgColor: "bg-red-500/10",   iconColor: "text-red-500" },
    { label: "Analytics",     icon: BarChart3,     link: "/doctor/analytics",      bgColor: "bg-cyan-500/10",      iconColor: "text-cyan-600 dark:text-cyan-400" },
    { label: "Billing",       icon: Wallet,        link: "/doctor/billing",        bgColor: "bg-emerald-500/10",   iconColor: "text-emerald-600 dark:text-emerald-400" },
  ];

  return (
    <MainLayout>
      {/* ─── Incoming Emergency Call Overlay ─── */}
      {incomingCall && (
        <IncomingCallNotification
          callData={incomingCall}
          onAccept={handleAcceptIncomingCall}
          onReject={handleRejectIncomingCall}
          autoRejectTimeout={60}
        />
      )}

      {/* ═══════════════════════════════════════════
          WORLD-CLASS MOBILE-FIRST DOCTOR HOME PAGE
          ═══════════════════════════════════════════ */}
      <div className="mx-auto max-w-2xl lg:max-w-7xl space-y-4 pb-24 lg:pb-6 px-4 md:px-0 animate-in fade-in duration-500">

        {/* ── HERO HEADER ── */}
        <div className="relative overflow-hidden rounded-2xl lg:rounded-3xl bg-gradient-to-br from-[#0a1628] via-[#0f2d4a] to-[#0d2540] text-white shadow-2xl">
          {/* Ambient glow orbs */}
          <div className="pointer-events-none absolute -top-12 -right-12 w-64 h-64 rounded-full bg-teal-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 w-52 h-52 rounded-full bg-blue-600/15 blur-3xl" />
          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 rounded-full bg-cyan-500/5 blur-2xl" />

          {/* Top bar */}
          <div className="relative px-5 pt-5">
            <div className="flex items-center justify-between">
              {/* Left: avatar + name */}
              <div className="flex items-center gap-3.5">
                <div className="relative shrink-0">
                  <Avatar className="h-14 w-14 border-2 border-white/20 shadow-xl">
                    <AvatarImage src={currentDoctor?.profileImage} />
                    <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-600 text-white text-xl font-bold">
                      {currentDoctor?.firstName?.[0]}{currentDoctor?.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  {/* Live status dot with ping */}
                  <span className="absolute bottom-0.5 right-0.5 block w-3.5 h-3.5 rounded-full border-2 border-[#0f2d4a]"
                    style={{ background: isSocketConnected ? '#34d399' : '#64748b' }}>
                    {isSocketConnected && (
                      <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
                    )}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-teal-300/80 font-semibold">
                    {getGreeting()}
                  </p>
                  <h1 className="text-xl font-extrabold text-white leading-tight">
                    Dr. {currentDoctor?.firstName} {currentDoctor?.lastName}
                  </h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-300 truncate max-w-[130px]">
                      {currentDoctor?.specialization || "General Practitioner"}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs text-amber-300 font-medium">
                      <Star className="w-3 h-3 fill-amber-300" />
                      {stats?.rating || "4.8"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshDashboard}
                  disabled={isStatsRefetching || isAppointmentsRefetching || isAlertsRefetching}
                  className="p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 transition-all"
                  title="Refresh"
                >
                  <RefreshCw className={cn("w-4 h-4 text-white/60", (isStatsRefetching || isAppointmentsRefetching || isAlertsRefetching) && "animate-spin")} />
                </button>
                <Link to="/doctor/alerts">
                  <div className="relative p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 transition-all cursor-pointer">
                    <Bell className="w-4 h-4 text-white/60" />
                    {alerts && alerts.length > 0 && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                    )}
                  </div>
                </Link>
              </div>
            </div>

            {/* Date + connection chips */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <div className="flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5">
                <Calendar className="w-3 h-3 text-teal-300" />
                <span className="text-xs text-white/80 font-medium">
                  {currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5">
                <Clock className="w-3 h-3 text-teal-300" />
                <span className="text-xs text-white/80 font-medium">
                  {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className={cn(
                "flex items-center gap-1.5 border rounded-lg px-3 py-1.5",
                isSocketConnected
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-slate-500/10 border-slate-500/30"
              )}>
                {isSocketConnected
                  ? <Wifi className="w-3 h-3 text-emerald-400" />
                  : <WifiOff className="w-3 h-3 text-slate-400" />}
                <span className={cn("text-xs font-medium", isSocketConnected ? "text-emerald-300" : "text-slate-400")}>
                  {isSocketConnected ? "Live triage" : "Offline"}
                </span>
              </div>
            </div>
          </div>

          {/* ── STATS STRIP (inside hero) ── */}
          <div className="relative mt-4 grid grid-cols-4 divide-x divide-white/10 border-t border-white/10">
            {[
              { label: "Today",    value: isLoading ? "—" : (stats?.todayAppointments ?? (todayAppointments?.length ?? 0)),  icon: Calendar,    color: "text-cyan-300" },
              { label: "Done",     value: isLoading ? "—" : completedCount,                                                   icon: CheckCircle2, color: "text-emerald-300" },
              { label: "Patients", value: isLoading ? "—" : (stats?.totalPatients ?? 0),                                     icon: Users,        color: "text-blue-300" },
              { label: "Revenue",  value: isLoading ? "—" : `₹${((stats?.revenue || 0) / 1000).toFixed(0)}K`,               icon: TrendingUp,   color: "text-amber-300" },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center py-4 gap-0.5 select-none">
                <s.icon className={cn("w-4 h-4 mb-0.5", s.color)} />
                <span className="text-xl font-extrabold text-white tabular-nums">{s.value}</span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── FALLBACK WARNING ── */}
        {dashboardHasFallbackData && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Showing cached / demo data — some live services may be unavailable.
            </p>
          </div>
        )}

        {/* ── NEXT PATIENT CARD ── */}
        {nextAppointment && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-500 via-teal-600 to-cyan-600 p-5 shadow-xl shadow-teal-600/25">
            <div className="pointer-events-none absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/10 blur-xl" />
            <div className="pointer-events-none absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5 blur-xl" />

            <div className="relative flex items-center gap-4">
              <Avatar className="h-13 w-13 border-2 border-white/30 shadow-lg shrink-0">
                <AvatarFallback className="bg-teal-700/50 text-white font-bold text-base">
                  {(nextAppointment.patientName || nextAppointment.patient?.firstName || 'P').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] uppercase tracking-widest text-teal-100/80 font-semibold">Next Patient</span>
                  <span className="flex items-center gap-1 text-[10px] bg-white/20 rounded-full px-2 py-0.5 text-white font-semibold">
                    <Clock className="w-2.5 h-2.5" />
                    {nextAppointment.time || nextAppointment.appointmentTime}
                  </span>
                </div>
                <p className="font-extrabold text-white text-base leading-tight truncate">
                  {nextAppointment.patientName || `${nextAppointment.patient?.firstName} ${nextAppointment.patient?.lastName}`}
                </p>
                <p className="text-teal-100 text-xs flex items-center gap-1.5 mt-0.5">
                  {(nextAppointment.type || nextAppointment.consultationType) === 'Video'
                    ? <Video className="w-3 h-3" />
                    : <Users className="w-3 h-3" />}
                  {nextAppointment.type || nextAppointment.consultationType || 'Consultation'}
                </p>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                <Link to="/doctor/video">
                  <button className="flex items-center gap-1.5 bg-white text-teal-700 hover:bg-teal-50 active:scale-95 transition-all font-bold rounded-xl px-4 py-2 text-sm shadow-lg">
                    <Video className="w-3.5 h-3.5" />
                    Start
                  </button>
                </Link>
                <Link to={`/doctor/patients`}>
                  <button className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 active:scale-95 transition-all text-white font-medium rounded-xl px-4 py-2 text-xs border border-white/20">
                    <FileText className="w-3 h-3" />
                    Notes
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── QUICK LAUNCH GRID ── */}
        <div>
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">Quick Access</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {quickLaunch.map((item, i) => (
              <Link key={i} to={item.link} className="group">
                <div className="flex flex-col items-center text-center gap-2 py-3.5 px-2 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 hover:border-teal-200 dark:hover:border-teal-600/50 hover:shadow-lg hover:shadow-teal-500/10 active:scale-95 transition-all duration-200 cursor-pointer">
                  <div className={cn("p-2.5 rounded-xl transition-transform duration-200 group-hover:scale-110", item.bgColor)}>
                    <item.icon className={cn("w-5 h-5", item.iconColor)} />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 leading-tight group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {item.label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── MAIN CONTENT GRID ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── TODAY'S SCHEDULE (VISUAL TIMELINE) ── */}
          <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700/50">
              <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
                <CalendarCheck className="w-4 h-4 text-teal-500" />
                Today's Schedule
              </h2>
              <Link to="/doctor/appointments" className="flex items-center gap-0.5 text-xs text-teal-600 dark:text-teal-400 font-semibold hover:text-teal-700">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="px-5 py-3 space-y-1.5">
              {sortedAppointments.length > 0 ? sortedAppointments.slice(0, 6).map((apt: any, index: number) => {
                const isNext = apt.id === nextAppointment?.id;
                const isDone = apt.status === 'completed';
                return (
                  <div
                    key={apt.id || index}
                    className={cn(
                      "group flex items-center gap-3 p-3 rounded-xl border transition-all duration-200",
                      isDone
                        ? "opacity-50 bg-slate-50 dark:bg-slate-800/30 border-transparent"
                        : isNext
                        ? "bg-gradient-to-r from-teal-50 to-cyan-50/50 dark:from-teal-900/20 dark:to-cyan-900/10 border-teal-200 dark:border-teal-700/50 shadow-sm"
                        : "bg-white dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/40 hover:border-slate-200 dark:hover:border-slate-600"
                    )}
                  >
                    {/* Time column */}
                    <div className="w-14 shrink-0 text-right">
                      <span className={cn(
                        "text-xs font-bold tabular-nums",
                        isDone ? "text-slate-400" :
                        isNext ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400"
                      )}>
                        {apt.time || apt.appointmentTime}
                      </span>
                    </div>

                    {/* Dot with vertical line */}
                    <div className="relative flex flex-col items-center shrink-0 self-stretch">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full mt-1 shrink-0",
                        isDone ? "bg-emerald-400" :
                        isNext ? "bg-teal-500 ring-4 ring-teal-500/20" : "bg-slate-300 dark:bg-slate-600"
                      )} />
                      {index < Math.min(sortedAppointments.length - 1, 5) && (
                        <div className="flex-1 w-px mt-1 bg-slate-200 dark:bg-slate-700" />
                      )}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className={cn(
                        "text-xs font-bold",
                        isDone ? "bg-slate-200 dark:bg-slate-700 text-slate-500" :
                        isNext ? "bg-gradient-to-br from-teal-500 to-cyan-600 text-white" :
                        "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                      )}>
                        {(apt.patientName || 'P').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm font-semibold truncate",
                        isDone ? "text-slate-400" :
                        isNext ? "text-teal-700 dark:text-teal-300" : "text-slate-700 dark:text-white"
                      )}>
                        {apt.patientName || `${apt.patient?.firstName} ${apt.patient?.lastName}`}
                      </p>
                      <span className={cn(
                        "inline-flex items-center gap-1 mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        (apt.type === 'Video' || apt.consultationType === 'video')
                          ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300"
                          : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                      )}>
                        {(apt.type === 'Video' || apt.consultationType === 'video')
                          ? <><Video className="w-2.5 h-2.5" /> Video</>
                          : <><Users className="w-2.5 h-2.5" /> In-Person</>}
                      </span>
                    </div>

                    {/* Action */}
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Link
                        to={(apt.type === 'Video' || apt.consultationType === 'video') ? '/doctor/video' : '/doctor/appointments'}
                        className={cn(
                          "shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95",
                          isNext
                            ? "bg-teal-500 hover:bg-teal-600 text-white shadow-sm shadow-teal-500/30"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 opacity-0 group-hover:opacity-100"
                        )}
                      >
                        {isNext ? "Start" : "View"}
                      </Link>
                    )}
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-700/40 mb-3">
                    <CalendarCheck className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No appointments today</p>
                  <p className="text-xs text-slate-400 mt-1">Your schedule is clear</p>
                  <Link to="/doctor/appointments">
                    <button className="mt-4 text-xs text-teal-600 dark:text-teal-400 font-semibold border border-teal-200 dark:border-teal-700 px-4 py-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors">
                      Schedule appointment
                    </button>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="space-y-4">

            {/* Today's Progress */}
            <div className="rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-4">
              <h2 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-teal-500" />
                Today's Progress
              </h2>
              <div className="flex items-center gap-4">
                {/* Ring */}
                <div className="relative w-24 h-24 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" strokeWidth="7" className="text-slate-100 dark:text-slate-700" stroke="currentColor" />
                    <circle
                      cx="40" cy="40" r="32" fill="none" strokeWidth="7"
                      stroke="url(#tealGrad)"
                      strokeLinecap="round"
                      strokeDasharray={`${completionPct * 2.011} 201.1`}
                      className="transition-all duration-1000"
                    />
                    <defs>
                      <linearGradient id="tealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2dd4bf" />
                        <stop offset="100%" stopColor="#0d9488" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold text-slate-800 dark:text-white tabular-nums">
                      {completionPct}%
                    </span>
                    <span className="text-[9px] text-slate-400 uppercase tracking-wide">Done</span>
                  </div>
                </div>

                {/* Bars */}
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Appointments</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {completedCount}/{totalToday}
                      </span>
                    </div>
                    <Progress value={completionPct} className="h-2 rounded-full" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Response Rate</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{stats?.responseRate || 95}%</span>
                    </div>
                    <Progress value={stats?.responseRate || 95} className="h-2 rounded-full" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Rating</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {stats?.rating || 4.8}
                      </span>
                    </div>
                    <Progress value={((stats?.rating || 4.8) / 5) * 100} className="h-2 rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Alerts */}
            <div className="rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  Alerts
                </h2>
                {alerts && alerts.length > 0 && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
                    {alerts.length} new
                  </span>
                )}
              </div>

              {alerts && alerts.length > 0 ? (
                <div className="space-y-2">
                  {alerts.slice(0, 3).map((alert: any, i: number) => (
                    <div key={i} className={cn(
                      "flex items-start gap-2.5 p-3 rounded-xl border text-xs",
                      alert.type === 'critical' ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50" :
                      alert.type === 'warning'  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50" :
                      "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50"
                    )}>
                      <AlertTriangle className={cn(
                        "w-3.5 h-3.5 mt-0.5 shrink-0",
                        alert.type === 'critical' ? "text-red-500" :
                        alert.type === 'warning'  ? "text-amber-500" : "text-blue-500"
                      )} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{alert.title}</p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-[10px] line-clamp-2">{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-4">
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 mb-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">All clear</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">No pending alerts</p>
                </div>
              )}

              <Link to="/doctor/alerts">
                <button className="w-full mt-3 text-xs font-semibold text-teal-600 dark:text-teal-400 border border-slate-200 dark:border-slate-700 rounded-xl py-2 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                  View All Alerts
                </button>
              </Link>
            </div>

          </div>
        </div>

        {/* ── PRACTICE MANAGEMENT GRID ── */}
        <div>
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <LayoutGrid className="w-3.5 h-3.5" />
            Practice Management
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {features.map((f, i) => (
              <Link key={i} to={f.link} className="group">
                <div className="flex flex-col p-4 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 hover:border-teal-200 dark:hover:border-teal-700/50 hover:shadow-lg hover:shadow-teal-500/10 active:scale-[0.98] transition-all duration-200 h-full">
                  <div className={cn("self-start p-2.5 rounded-xl mb-3 group-hover:scale-110 transition-transform duration-200", f.bgColor)}>
                    <f.icon className={cn("w-5 h-5", f.color)} />
                  </div>
                  <p className="font-bold text-slate-700 dark:text-white text-sm mb-0.5 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors leading-tight">
                    {f.title}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">{f.description}</p>
                  {f.badge && (
                    <span className="mt-2 self-start text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 px-2 py-0.5 rounded-full">
                      {f.badge}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── PERFORMANCE SNAPSHOT ── */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white shadow-xl overflow-hidden relative">
          <div className="pointer-events-none absolute -top-8 -right-8 w-40 h-40 rounded-full bg-teal-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-blue-500/10 blur-2xl" />

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Score ring */}
            <div className="flex flex-col items-center shrink-0">
              <div className="relative w-28 h-28">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke="url(#heroGrad)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(stats?.responseRate || 95) * 2.513} 251.3`}
                    className="transition-all duration-1000"
                  />
                  <defs>
                    <linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#2dd4bf" />
                      <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold">{stats?.responseRate || 95}%</span>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider">Response</span>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-slate-300 font-medium">Top Performer</span>
              </div>
            </div>

            {/* Stats pills */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
              {[
                { label: "Total Patients",    value: stats?.totalPatients || 124,  trend: `+${stats?.patientGrowth || 12}%`,      up: true  },
                { label: "Consultations",     value: stats?.totalConsultations || 48, trend: `+${stats?.consultationGrowth || 8}%`, up: true  },
                { label: "Avg. Rating",       value: `${stats?.rating || 4.8} ★`,  trend: `+${stats?.ratingGrowth || 0.2}`,       up: true  },
                { label: "Pending",           value: stats?.pendingAppointments || 3, trend: "review",                               up: false },
                { label: "Revenue (Month)",   value: `₹${((stats?.revenue || 24500)/1000).toFixed(1)}K`, trend: "+15%",             up: true  },
                { label: "Completed Today",   value: completedCount,               trend: `of ${totalToday}`,                      up: true  },
              ].map((item, i) => (
                <div key={i} className="bg-white/8 rounded-xl px-3 py-2.5 border border-white/10">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-1">{item.label}</p>
                  <p className="text-lg font-extrabold text-white tabular-nums leading-none">{item.value}</p>
                  <div className={cn("flex items-center gap-1 mt-1", item.up ? "text-emerald-400" : "text-amber-400")}>
                    {item.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span className="text-[10px] font-semibold">{item.trend}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex justify-end mt-4">
            <Link to="/doctor/analytics">
              <button className="flex items-center gap-1.5 text-xs text-teal-300 hover:text-teal-200 font-semibold transition-colors">
                <BarChart3 className="w-3.5 h-3.5" />
                Full analytics
                <ChevronRight className="w-3 h-3" />
              </button>
            </Link>
          </div>
        </div>

      </div>

      {/* ── STICKY BOTTOM ACTION BAR (mobile only) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800 px-4 py-3 flex gap-3 safe-area-pb">
          <Link to="/doctor/triage" className="flex-1">
            <button className="w-full flex items-center justify-center gap-2 h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-red-500/30 transition-all text-sm">
              <AlertTriangle className="w-4 h-4" />
              Emergency
            </button>
          </Link>
          <Link to="/doctor/video" className="flex-1">
            <button className="w-full flex items-center justify-center gap-2 h-12 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-teal-500/30 transition-all text-sm">
              <Video className="w-4 h-4" />
              New Consult
            </button>
          </Link>
        </div>
      </div>

    </MainLayout>
  );
};

export default DoctorDashboard;
