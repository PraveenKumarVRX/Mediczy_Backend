/**
 * Doctor Mobile App Home Page
 * Standalone screen — no sidebar, purpose-built for phone viewports.
 * Looks and behaves like a native iOS/Android health app.
 */

import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import socketService from "@/services/socket.service";
import { IncomingCallNotification } from "@/components/IncomingCallNotification";
import {
  Home,
  Calendar,
  Users,
  MessageSquare,
  User,
  Video,
  Pill,
  Bell,
  Star,
  Clock,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  ChevronRight,
  Phone,
  BarChart3,
  FileText,
  HeartPulse,
  Stethoscope,
  Zap,
  ArrowRight,
  Activity,
  DollarSign,
  Siren,
  BrainCircuit,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// Bottom Tab Bar config
// ────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "home",         label: "Home",         icon: Home,         path: "/doctor/home" },
  { id: "schedule",     label: "Schedule",     icon: Calendar,     path: "/doctor/appointments" },
  { id: "patients",     label: "Patients",     icon: Users,        path: "/doctor/patients" },
  { id: "chat",         label: "Messages",     icon: MessageSquare, path: "/doctor/chat" },
  { id: "profile",      label: "Profile",      icon: User,         path: "/doctor/settings" },
];

// ────────────────────────────────────────────────────────────────────────────
// Quick actions (2 × 4 grid)
// ────────────────────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Video Call",     icon: Video,      path: "/doctor/video",              bg: "bg-violet-500/15", icon_color: "text-violet-500",  ring: "ring-violet-400/30" },
  { label: "Prescription",   icon: Pill,       path: "/doctor/prescriptions",      bg: "bg-teal-500/15",   icon_color: "text-teal-500",    ring: "ring-teal-400/30" },
  { label: "AI Assist",      icon: BrainCircuit, path: "/doctor/assist",           bg: "bg-cyan-500/15",   icon_color: "text-cyan-500",    ring: "ring-cyan-400/30" },
  { label: "Triage",         icon: Siren,      path: "/doctor/triage",             bg: "bg-red-500/15",    icon_color: "text-red-500",     ring: "ring-red-400/30" },
  { label: "Patients",       icon: Users,      path: "/doctor/patients",           bg: "bg-blue-500/15",   icon_color: "text-blue-500",    ring: "ring-blue-400/30" },
  { label: "Health Mon.",    icon: HeartPulse, path: "/doctor/health-monitoring",  bg: "bg-pink-500/15",   icon_color: "text-pink-500",    ring: "ring-pink-400/30" },
  { label: "Analytics",      icon: BarChart3,  path: "/doctor/analytics",          bg: "bg-amber-500/15",  icon_color: "text-amber-500",   ring: "ring-amber-400/30" },
  { label: "Webinars",       icon: FileText,   path: "/doctor/webinars",           bg: "bg-emerald-500/15",icon_color: "text-emerald-500", ring: "ring-emerald-400/30" },
];

// ────────────────────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────────────────────
const getGreeting = (hour: number) => {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
};

const initials = (name?: string) =>
  (name || "DR").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

const toMinutes = (t?: string): number => {
  if (!t) return 9999;
  const [time, ampm] = (t || "").split(" ");
  const [h, m] = time.split(":").map(Number);
  return ((ampm === "PM" && h !== 12) ? h + 12 : (ampm === "AM" && h === 12) ? 0 : h) * 60 + (m || 0);
};

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
export default function DoctorMobileHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentDoctor, userType } = useAuth();
  const { toast } = useToast();

  const [now, setNow] = useState(new Date());
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  const [socketOk, setSocketOk] = useState(false);
  const [fallback, setFallback] = useState({ stats: false, appts: false, alerts: false });

  // ── Auth guard ──
  useEffect(() => {
    const stored = localStorage.getItem("userType");
    const tok = localStorage.getItem("doctorToken");
    if (stored !== "doctor" && userType !== "doctor" && !tok) {
      navigate("/doctor/login", { replace: true });
    }
  }, [userType, navigate]);

  // ── Clock ──
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // ── Socket ──
  useEffect(() => {
    if (!currentDoctor?.id) return;
    socketService.connect(currentDoctor.id, "doctor");
    setSocketOk(true);
    const handler = (callData: any) => {
      setIncomingCall(callData);
      try {
        const ctx = new AudioContext();
        const t = ctx.currentTime;
        [[880, 0.0], [880, 0.2], [1175, 0.4]].forEach(([freq, start]) => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'square'; osc.frequency.setValueAtTime(freq as number, start as number);
          gain.gain.setValueAtTime(0, start as number);
          gain.gain.linearRampToValueAtTime(0.55, (start as number) + 0.01);
          gain.gain.linearRampToValueAtTime(0, (start as number) + 0.14);
          osc.start(t + (start as number)); osc.stop(t + (start as number) + 0.14);
        });
        setTimeout(() => ctx.close(), 1000);
      } catch (_) { /* ignore audio failures */ }
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("🚨 Emergency Call", {
          body: `${callData.patientName} needs urgent help`,
          tag: `call-${callData.appointmentId}`,
          requireInteraction: true,
        });
      }
      toast({ title: "🚨 Emergency Call", description: `${callData.patientName} needs help urgently` });
    };
    socketService.on("triage-call-request", handler);
    return () => {
      socketService.off("triage-call-request", handler);
      setSocketOk(false);
    };
  }, [currentDoctor?.id, toast]);

  // ── API data ──
  const { data: stats, isLoading: statsLoading, refetch: refetchStats, isRefetching: statsRefetching } = useQuery({
    queryKey: ["doctor-dash-stats"],
    queryFn: async () => {
      try {
        const r = await api.get("/doctors/dashboard/stats");
        setFallback(f => ({ ...f, stats: false }));
        return r.data;
      } catch {
        setFallback(f => ({ ...f, stats: true }));
        return { totalPatients: 124, totalConsultations: 48, rating: 4.8, responseRate: 95,
                 patientGrowth: 12, ratingGrowth: 0.2, todayAppointments: 8,
                 pendingAppointments: 3, completedToday: 5, revenue: 24500 };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: rawAppts, refetch: refetchAppts, isRefetching: apptsRefetching } = useQuery({
    queryKey: ["doctor-today-appts"],
    queryFn: async () => {
      try {
        const r = await api.get("/appointments/doctor/today");
        setFallback(f => ({ ...f, appts: false }));
        return r.data.appointments || [];
      } catch {
        setFallback(f => ({ ...f, appts: true }));
        return [
          { id: 1, patientName: "Rahul Sharma",   time: "10:00 AM", type: "Video",     status: "upcoming" },
          { id: 2, patientName: "Priya Patel",     time: "11:30 AM", type: "In-Person", status: "upcoming" },
          { id: 3, patientName: "Amit Kumar",      time: "02:00 PM", type: "Video",     status: "upcoming" },
          { id: 4, patientName: "Sunita Rao",      time: "03:30 PM", type: "In-Person", status: "upcoming" },
        ];
      }
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: alerts, refetch: refetchAlerts } = useQuery({
    queryKey: ["doctor-alerts"],
    queryFn: async () => {
      try {
        const r = await api.get("/doctors/alerts");
        setFallback(f => ({ ...f, alerts: false }));
        return r.data.alerts || [];
      } catch {
        setFallback(f => ({ ...f, alerts: true }));
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const appts = [...(rawAppts || [])].sort(
    (a: any, b: any) => toMinutes(a.time || a.appointmentTime) - toMinutes(b.time || b.appointmentTime)
  );
  const nextApt = appts.find((a: any) => a.status !== "completed");
  const doneCount = (rawAppts || []).filter((a: any) => a.status === "completed").length;
  const totalToday = stats?.todayAppointments || appts.length || 0;
  const pct = totalToday > 0 ? Math.round((doneCount / totalToday) * 100) : 0;
  const anyFallback = Object.values(fallback).some(Boolean);
  const isRefreshing = statsRefetching || apptsRefetching;

  const handleRefresh = () => Promise.all([refetchStats(), refetchAppts(), refetchAlerts()]);

  const acceptCall = async (apptId: number) => {
    try {
      const r = await api.post("/doctors/triage/accept-call", { appointmentId: apptId });
      setIncomingCall(null);
      toast({ title: "Call Accepted", description: "Joining video consultation..." });
      const roomId = r.data.appointment?.roomId || r.data.appointment?.meetingId;
      const lk = r.data.livekit;
      if (lk?.token && lk?.serverUrl) {
        try {
          sessionStorage.setItem('doctorLivekitHandoff', JSON.stringify({
            appointmentId: String(apptId),
            roomId: String(roomId || ''),
            token: lk.token,
            serverUrl: lk.serverUrl,
            expiresAt: Date.now() + 2 * 60 * 1000,
          }));
        } catch {
          // non-fatal
        }
        navigate(`/doctor/video?room=${encodeURIComponent(String(roomId))}&appointmentId=${apptId}`);
      } else if (roomId) {
        navigate(`/doctor/video?room=${encodeURIComponent(String(roomId))}&appointmentId=${apptId}`);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.response?.data?.message || "Failed to accept call", variant: "destructive" });
    }
  };

  const rejectCall = async (apptId: number) => {
    try {
      await api.post("/doctors/triage/reject-call", { appointmentId: apptId, reason: "Doctor unavailable" });
      setIncomingCall(null);
      toast({ title: "Call Rejected", description: "Patient has been notified" });
    } catch (e: any) {
      toast({ title: "Error", description: e.response?.data?.message || "Failed to reject call", variant: "destructive" });
    }
  };

  // ────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-[#f5f6fa] dark:bg-[#0d0f14] flex flex-col">

      {/* ── Emergency call overlay ── */}
      {incomingCall && (
        <IncomingCallNotification
          callData={incomingCall}
          onAccept={acceptCall}
          onReject={rejectCall}
          autoRejectTimeout={60}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SCROLLABLE CONTENT
          ══════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto pb-24">

        {/* ──────────────────────────────────────────────────────────────
            HERO HEADER (dark gradient — full bleed)
            ────────────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#07101f] via-[#0c213d] to-[#0e2546] px-5 pt-12 pb-8 select-none">
          {/* Ambient blobs */}
          <div className="pointer-events-none absolute -top-10 -right-10 w-56 h-56 rounded-full bg-teal-500/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 w-44 h-44 rounded-full bg-blue-600/10 blur-3xl" />

          {/* Status row */}
          <div className="relative flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Avatar className="h-12 w-12 border-2 border-white/15 shadow-xl">
                  <AvatarImage src={currentDoctor?.profileImage} />
                  <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-600 text-white font-extrabold text-base">
                    {initials(`${currentDoctor?.firstName} ${currentDoctor?.lastName}`)}
                  </AvatarFallback>
                </Avatar>
                {/* online pulse */}
                <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-[#0c213d] bg-emerald-400">
                  {socketOk && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />}
                </span>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-teal-300/70 font-semibold">
                  {getGreeting(now.getHours())}
                </p>
                <h1 className="text-[17px] font-extrabold text-white leading-tight">
                  Dr. {currentDoctor?.firstName} {currentDoctor?.lastName}
                </h1>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {currentDoctor?.specialization || "General Practitioner"}
                  <span className="ml-2 inline-flex items-center gap-0.5 text-amber-300">
                    <Star className="w-2.5 h-2.5 fill-amber-300" />
                    {stats?.rating || "4.8"}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* refresh */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2.5 rounded-2xl bg-white/8 border border-white/10 active:scale-90 transition-all"
              >
                <RefreshCw className={cn("w-4 h-4 text-white/50", isRefreshing && "animate-spin")} />
              </button>
              {/* bell */}
              <Link to="/doctor/alerts">
                <div className="relative p-2.5 rounded-2xl bg-white/8 border border-white/10 active:scale-90 transition-all">
                  <Bell className="w-4 h-4 text-white/50" />
                  {(alerts?.length ?? 0) > 0 && (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full" />
                  )}
                </div>
              </Link>
            </div>
          </div>

          {/* ── STAT CHIPS (horizontal scroll) ── */}
          <div className="relative flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {[
              { label: "Today",    val: statsLoading ? "—" : (totalToday || "—"),                      icon: Calendar,    color: "text-cyan-300",    bg: "bg-cyan-500/15" },
              { label: "Done",     val: statsLoading ? "—" : doneCount,                               icon: CheckCircle2, color: "text-emerald-300", bg: "bg-emerald-500/15" },
              { label: "Patients", val: statsLoading ? "—" : (stats?.totalPatients || "—"),           icon: Users,        color: "text-blue-300",    bg: "bg-blue-500/15" },
              { label: "Rating",   val: statsLoading ? "—" : (stats?.rating || "—"),                  icon: Star,         color: "text-amber-300",   bg: "bg-amber-500/15" },
              { label: "Revenue",  val: statsLoading ? "—" : `₹${((stats?.revenue||0)/1000).toFixed(0)}K`, icon: TrendingUp, color: "text-violet-300", bg: "bg-violet-500/15" },
            ].map((s, i) => (
              <div key={i} className={cn(
                "flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border border-white/10 shrink-0 min-w-[100px]",
                s.bg
              )}>
                <s.icon className={cn("w-4 h-4 shrink-0", s.color)} />
                <div>
                  <p className="text-base font-extrabold text-white tabular-nums leading-none">{s.val}</p>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Connection badge */}
          {!socketOk && (
            <div className="relative mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
              <WifiOff className="w-3 h-3" /> Live triage disconnected
            </div>
          )}
        </div>

        {/* ──────────────────────────────────────────────────────────────
            CONTENT AREA
            ────────────────────────────────────────────────────────────── */}
        <div className="px-4 space-y-5 pt-5">

          {/* Fallback warning */}
          {anyFallback && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Showing cached data — some services may be unavailable.
              </p>
            </div>
          )}

          {/* ── NEXT PATIENT CARD ── */}
          {nextApt ? (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-600 p-5 shadow-2xl shadow-teal-600/30">
              {/* bg blobs */}
              <div className="pointer-events-none absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-white/5 blur-xl" />

              <div className="relative">
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">Up Next</span>
                </div>

                <div className="flex items-start gap-3.5">
                  <Avatar className="h-14 w-14 border-2 border-white/25 shadow-xl shrink-0">
                    <AvatarFallback className="bg-teal-700/60 text-white font-extrabold text-lg">
                      {initials(nextApt.patientName || nextApt.patient?.firstName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[18px] font-extrabold text-white leading-tight truncate">
                      {nextApt.patientName || `${nextApt.patient?.firstName} ${nextApt.patient?.lastName}`}
                    </h2>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] font-semibold bg-white/20 text-white rounded-xl px-2.5 py-1">
                        <Clock className="w-3 h-3" />
                        {nextApt.time || nextApt.appointmentTime}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-semibold bg-white/20 text-white rounded-xl px-2.5 py-1">
                        {(nextApt.type === "Video" || nextApt.consultationType === "video")
                          ? <><Video className="w-3 h-3" /> Video</>
                          : <><Users className="w-3 h-3" /> In-Person</>}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2.5 mt-4">
                  <Link
                    to={(nextApt.type === "Video" || nextApt.consultationType === "video")
                      ? "/doctor/video"
                      : "/doctor/appointments"}
                    className="flex-1"
                  >
                    <button className="w-full h-11 bg-white hover:bg-teal-50 active:scale-95 text-teal-700 font-extrabold rounded-2xl shadow-lg text-sm transition-all flex items-center justify-center gap-2">
                      <Video className="w-4 h-4" /> Start Session
                    </button>
                  </Link>
                  <Link to="/doctor/patients" className="flex-1">
                    <button className="w-full h-11 bg-white/20 hover:bg-white/30 active:scale-95 text-white font-bold rounded-2xl border border-white/20 text-sm transition-all flex items-center justify-center gap-2">
                      <FileText className="w-4 h-4" /> View Notes
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 p-5 text-center">
              <div className="inline-flex p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 mb-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <p className="font-extrabold text-slate-700 dark:text-slate-200 text-base">All caught up!</p>
              <p className="text-sm text-slate-400 mt-1">No upcoming appointments today</p>
              <Link to="/doctor/appointments">
                <button className="mt-4 text-xs font-bold border border-teal-200 dark:border-teal-700 text-teal-600 dark:text-teal-400 px-5 py-2.5 rounded-2xl hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors">
                  + Add appointment
                </button>
              </Link>
            </div>
          )}

          {/* ── TODAY'S PROGRESS ── */}
          <div className="rounded-3xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-500" />
                Today's Progress
              </h2>
              <span className="text-xs font-bold text-teal-600 dark:text-teal-400">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2.5 rounded-full mb-4" />
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total",     val: totalToday, color: "text-slate-700 dark:text-white" },
                { label: "Completed", val: doneCount,  color: "text-emerald-600 dark:text-emerald-400" },
                { label: "Remaining", val: Math.max(0, totalToday - doneCount), color: "text-amber-600 dark:text-amber-400" },
              ].map((m, i) => (
                <div key={i} className="flex flex-col items-center py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                  <span className={cn("text-2xl font-extrabold tabular-nums", m.color)}>{m.val}</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── QUICK ACTIONS ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Quick Actions
              </h2>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {QUICK_ACTIONS.map((a, i) => (
                <Link key={i} to={a.path} className="group">
                  <div className="flex flex-col items-center gap-2 py-3.5 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 hover:border-teal-100 dark:hover:border-teal-700/50 active:scale-90 transition-all duration-150 shadow-sm hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/20">
                    <div className={cn(
                      "p-2.5 rounded-xl transition-transform duration-150 group-hover:scale-110 ring-1",
                      a.bg, a.ring
                    )}>
                      <a.icon className={cn("w-5 h-5", a.icon_color)} />
                    </div>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 text-center leading-tight group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors px-0.5">
                      {a.label}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ── TODAY'S SCHEDULE (timeline) ── */}
          <div className="rounded-3xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700/50">
              <h2 className="font-extrabold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-500" />
                Today's Schedule
              </h2>
              <Link to="/doctor/appointments" className="flex items-center gap-0.5 text-[11px] text-teal-600 dark:text-teal-400 font-bold">
                See all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="px-4 pb-4 pt-3 space-y-0">
              {appts.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-6">No appointments scheduled today</p>
              )}
              {appts.slice(0, 5).map((apt: any, idx: number) => {
                const isNext = apt.id === nextApt?.id;
                const isDone = apt.status === "completed";
                const isVideo = apt.type === "Video" || apt.consultationType === "video";
                return (
                  <div key={apt.id || idx} className="flex gap-3 py-3 relative">
                    {/* Timeline line (not for last) */}
                    {idx < Math.min(appts.length - 1, 4) && (
                      <div className="absolute left-[29px] top-[38px] bottom-0 w-px bg-slate-100 dark:bg-slate-700/50" />
                    )}

                    {/* Time */}
                    <div className="w-[52px] shrink-0 pt-0.5 text-right">
                      <span className={cn(
                        "text-[11px] font-bold tabular-nums",
                        isDone ? "text-slate-300 dark:text-slate-600" :
                        isNext ? "text-teal-600 dark:text-teal-400" : "text-slate-400 dark:text-slate-500"
                      )}>
                        {(apt.time || apt.appointmentTime || "").replace(" AM","a").replace(" PM","p")}
                      </span>
                    </div>

                    {/* Dot */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className={cn(
                        "w-3 h-3 mt-1 rounded-full shrink-0 z-10",
                        isDone ? "bg-emerald-400" :
                        isNext ? "bg-teal-500 ring-4 ring-teal-500/20" : "bg-slate-300 dark:bg-slate-600"
                      )} />
                    </div>

                    {/* Content */}
                    <div className={cn(
                      "flex-1 flex items-center gap-3 px-3.5 py-2.5 rounded-2xl transition-all",
                      isDone ? "bg-slate-50 dark:bg-slate-800/30 opacity-60" :
                      isNext ? "bg-gradient-to-r from-teal-50 to-cyan-50/50 dark:from-teal-900/20 dark:to-transparent border border-teal-200 dark:border-teal-700/50 shadow-sm" :
                      "bg-slate-50/60 dark:bg-slate-800/30"
                    )}>
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className={cn(
                          "text-[11px] font-extrabold",
                          isNext ? "bg-gradient-to-br from-teal-500 to-cyan-600 text-white" :
                          isDone ? "bg-slate-200 dark:bg-slate-700 text-slate-400" :
                          "bg-slate-100 dark:bg-slate-700 text-slate-500"
                        )}>
                          {initials(apt.patientName || apt.patient?.firstName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-[13px] font-bold truncate",
                          isNext ? "text-teal-700 dark:text-teal-300" :
                          isDone ? "text-slate-400" : "text-slate-700 dark:text-slate-200"
                        )}>
                          {apt.patientName || `${apt.patient?.firstName} ${apt.patient?.lastName}`}
                        </p>
                        <span className={cn(
                          "inline-flex items-center gap-1 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                          isVideo
                            ? "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300"
                            : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                        )}>
                          {isVideo ? <><Video className="w-2.5 h-2.5" />Video</> : <><Users className="w-2.5 h-2.5" />In-Person</>}
                        </span>
                      </div>
                      {isDone
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : (
                          <Link to={isVideo ? "/doctor/video" : "/doctor/appointments"}>
                            <button className={cn(
                              "text-[11px] font-extrabold px-3 py-1.5 rounded-xl shrink-0 transition-all active:scale-95",
                              isNext
                                ? "bg-teal-500 hover:bg-teal-600 text-white shadow-sm shadow-teal-500/30"
                                : "text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600"
                            )}>
                              {isNext ? "Start" : "View"}
                            </button>
                          </Link>
                        )
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── ALERTS ── */}
          {(alerts?.length ?? 0) > 0 && (
            <div className="rounded-3xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700/50">
                <h2 className="font-extrabold text-slate-700 dark:text-white text-sm flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  Alerts
                </h2>
                <span className="text-[10px] font-extrabold bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 px-2 py-0.5 rounded-full">
                  {alerts.length}
                </span>
              </div>
              <div className="px-4 pb-4 pt-3 space-y-2.5">
                {alerts.slice(0, 3).map((al: any, i: number) => (
                  <div key={i} className={cn(
                    "flex items-start gap-3 p-3 rounded-2xl border text-xs",
                    al.type === "critical" ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40" :
                    al.type === "warning"  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40" :
                    "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40"
                  )}>
                    <AlertTriangle className={cn(
                      "w-3.5 h-3.5 mt-0.5 shrink-0",
                      al.type === "critical" ? "text-red-500" :
                      al.type === "warning"  ? "text-amber-500" : "text-blue-500"
                    )} />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{al.title}</p>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-[10px] line-clamp-2">{al.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PERFORMANCE CARD (dark) ── */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-[#07101f] p-5 shadow-xl">
            <div className="pointer-events-none absolute -top-8 -right-8 w-40 h-40 rounded-full bg-teal-500/10 blur-3xl" />
            <div className="relative">
              <h2 className="font-extrabold text-white text-sm flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-teal-400" />
                Performance
              </h2>
              <div className="flex items-center gap-4">
                {/* Ring */}
                <div className="relative w-24 h-24 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" strokeWidth="6" stroke="rgba(255,255,255,0.08)" />
                    <circle cx="40" cy="40" r="32" fill="none" strokeWidth="6"
                      stroke="url(#perfGrad)"
                      strokeLinecap="round"
                      strokeDasharray={`${(stats?.responseRate || 95) * 2.011} 201.1`}
                    />
                    <defs>
                      <linearGradient id="perfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2dd4bf" />
                        <stop offset="100%" stopColor="#0ea5e9" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold text-white">{stats?.responseRate || 95}%</span>
                    <span className="text-[9px] text-slate-400 uppercase tracking-wide">Response</span>
                  </div>
                </div>
                {/* Stats */}
                <div className="flex-1 grid grid-cols-2 gap-2.5">
                  {[
                    { label: "Patients",      val: stats?.totalPatients || 124,    good: true  },
                    { label: "Consultations", val: stats?.totalConsultations || 48, good: true  },
                    { label: "Pending",       val: stats?.pendingAppointments || 3, good: false },
                    { label: "Revenue",       val: `₹${((stats?.revenue||0)/1000).toFixed(0)}K`, good: true },
                  ].map((m, i) => (
                    <div key={i} className="bg-white/6 rounded-2xl px-3 py-2.5 border border-white/8">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{m.label}</p>
                      <p className="text-base font-extrabold text-white tabular-nums mt-0.5">{m.val}</p>
                      {m.good
                        ? <TrendingUp className="w-3 h-3 text-emerald-400 mt-1" />
                        : <TrendingDown className="w-3 h-3 text-amber-400 mt-1" />}
                    </div>
                  ))}
                </div>
              </div>
              <Link to="/doctor/analytics" className="flex items-center justify-end gap-1 mt-4">
                <span className="text-xs text-teal-400 font-bold">Full analytics</span>
                <ArrowRight className="w-3 h-3 text-teal-400" />
              </Link>
            </div>
          </div>

          {/* ── EMERGENCY BUTTON (full-width) ── */}
          <Link to="/doctor/triage">
            <button className="w-full h-14 flex items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 active:scale-95 text-white font-extrabold text-base shadow-xl shadow-red-500/30 transition-all">
              <Siren className="w-5 h-5" />
              Emergency / Triage
            </button>
          </Link>

          {/* bottom breathing room */}
          <div className="h-2" />
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════════════
          BOTTOM TAB BAR (fixed, blurred glass)
          ══════════════════════════════════════════════════════════════════ */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/85 dark:bg-[#0d0f14]/90 backdrop-blur-2xl border-t border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-stretch px-2 pt-2 pb-3 max-w-lg mx-auto">
          {TABS.map((tab) => {
            const active = location.pathname === tab.path ||
              (tab.id === "home" && (location.pathname === "/doctor/dashboard" || location.pathname === "/doctor-dashboard"));
            return (
              <Link key={tab.id} to={tab.path} className="flex-1">
                <div className="flex flex-col items-center gap-1.5 py-1 active:scale-90 transition-transform">
                  <div className={cn(
                    "p-2 rounded-2xl transition-all duration-200",
                    active
                      ? "bg-gradient-to-br from-teal-500 to-cyan-500 shadow-lg shadow-teal-500/30"
                      : "bg-transparent"
                  )}>
                    <tab.icon className={cn(
                      "w-[22px] h-[22px] transition-colors",
                      active ? "text-white" : "text-slate-400 dark:text-slate-500"
                    )} />
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold transition-colors",
                    active ? "text-teal-600 dark:text-teal-400" : "text-slate-400 dark:text-slate-500"
                  )}>
                    {tab.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

    </div>
  );
}
