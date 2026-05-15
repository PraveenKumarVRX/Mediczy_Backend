/**
 * BiomedicalDashboardPage — world-class clinical engineering operations dashboard.
 * Live device status, maintenance pipeline, calibration compliance, work orders.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { biomedNav } from "./DepartmentDashboards";
import { BiomedicalAIAssistant } from "@/components/biomedical/BiomedicalAIAssistant";
import {
  Wrench, Stethoscope, AlertTriangle, CheckCircle2, Clock, Bell,
  TrendingUp, TrendingDown, Minus, Activity, BarChart3, ShieldCheck,
  CalendarClock, ListChecks, RefreshCw, ArrowRight, Zap, LayoutDashboard,
  Cpu, Radio, Monitor, Battery, Wifi, WifiOff, AlertCircle,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── Static data ───────────────────────────────────────────────────────────────

const uptimeData = [
  { time: "00:00", online: 318, warning: 10, offline: 8 },
  { time: "02:00", online: 316, warning: 12, offline: 8 },
  { time: "04:00", online: 315, warning: 13, offline: 8 },
  { time: "06:00", online: 317, warning: 11, offline: 8 },
  { time: "08:00", online: 320, warning:  9, offline: 7 },
  { time: "10:00", online: 322, warning:  8, offline: 6 },
  { time: "12:00", online: 321, warning:  9, offline: 6 },
  { time: "14:00", online: 319, warning: 11, offline: 6 },
  { time: "16:00", online: 318, warning: 12, offline: 6 },
  { time: "18:00", online: 317, warning: 12, offline: 7 },
  { time: "20:00", online: 318, warning: 12, offline: 8 },
  { time: "22:00", online: 318, warning: 12, offline: 8 },
];

const deviceStatusData = [
  { name: "Online",        value: 318, color: "#22c55e" },
  { name: "Warning",       value: 12,  color: "#f59e0b" },
  { name: "Offline",       value: 8,   color: "#ef4444" },
  { name: "Maintenance",   value: 4,   color: "#3b82f6" },
];

const workOrdersByDept = [
  { dept: "ICU",       open: 3, overdue: 1, completed: 8  },
  { dept: "OT",        open: 2, overdue: 0, completed: 12 },
  { dept: "Cardio",    open: 4, overdue: 2, completed: 6  },
  { dept: "Emergency", open: 5, overdue: 1, completed: 9  },
  { dept: "Radiology", open: 1, overdue: 0, completed: 15 },
  { dept: "Lab",       open: 2, overdue: 0, completed: 11 },
  { dept: "General",   open: 6, overdue: 3, completed: 7  },
];

const maintenanceTrend = [
  { month: "Dec", completed: 42, overdue: 8 },
  { month: "Jan", completed: 48, overdue: 6 },
  { month: "Feb", completed: 51, overdue: 5 },
  { month: "Mar", completed: 55, overdue: 4 },
  { month: "Apr", completed: 58, overdue: 3 },
  { month: "May", completed: 61, overdue: 2 },
];

const recentWorkOrders = [
  { id: "WO-3841", device: "Ventilator — Drager V500",  dept: "ICU-2",      type: "Breakdown",    status: "open",      priority: "critical", engineer: "Rajan K.",  time: "08:32" },
  { id: "WO-3840", device: "ECG Machine — GE MAC 5500", dept: "Cardio",      type: "Calibration",  status: "in-progress",priority: "high",     engineer: "Priya M.", time: "07:55" },
  { id: "WO-3839", device: "Infusion Pump — BD Alaris", dept: "General-3",   type: "PPM",          status: "completed",  priority: "normal",   engineer: "Suresh P.",time: "07:30" },
  { id: "WO-3838", device: "Patient Monitor — Philips", dept: "ICU-1",       type: "Breakdown",    status: "open",      priority: "high",     engineer: "Rajan K.", time: "06:48" },
  { id: "WO-3837", device: "Defibrillator — Zoll R",   dept: "Emergency",   type: "PPM",          status: "completed",  priority: "normal",   engineer: "Meena S.", time: "06:20" },
  { id: "WO-3836", device: "SpO2 Monitor — Nellcor",   dept: "OT-3",        type: "Installation", status: "in-progress",priority: "normal",   engineer: "Priya M.", time: "06:00" },
  { id: "WO-3835", device: "Autoclave — Tuttnauer",    dept: "CSSD",        type: "Breakdown",    status: "open",      priority: "high",     engineer: "Anil R.",  time: "05:30" },
];

const upcomingCalibrations = [
  { device: "Blood Gas Analyser — Radiometer",   dept: "Lab",        dueDate: "2026-05-18", daysLeft: 3,  cert: "NABL-12043" },
  { device: "Patient Monitor — Nihon Kohden",    dept: "ICU-3",      dueDate: "2026-05-20", daysLeft: 5,  cert: "BME-CAL-221" },
  { device: "Infusion Pump — Baxter",            dept: "Oncology",   dueDate: "2026-05-22", daysLeft: 7,  cert: "BME-CAL-198" },
  { device: "Defibrillator — Philips HeartStart",dept: "Emergency",  dueDate: "2026-05-25", daysLeft: 10, cert: "BME-CAL-205" },
  { device: "ECG Machine — BPL Cardiart",        dept: "Cardio-2",   dueDate: "2026-05-30", daysLeft: 15, cert: "BME-CAL-187" },
];

const criticalAlerts = [
  { device: "Ventilator — Drager V500",     dept: "ICU-2",   issue: "Low-pressure alarm, circuit suspected",   severity: "critical" },
  { device: "Autoclave — Tuttnauer 3870E",  dept: "CSSD",    issue: "Heating element failure — cycle aborting", severity: "critical" },
  { device: "Defibrillator — ZOLL AED Pro", dept: "Gen-1",   issue: "Battery charge below 20%",                severity: "warning"  },
  { device: "Patient Monitor — Mindray",    dept: "Neuro",   issue: "SpO2 probe connection intermittent",       severity: "warning"  },
];

// ─── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  iconBg: string;
  iconColor: string;
  urgent?: boolean;
}

const StatCard = ({ icon: Icon, label, value, sub, trend, trendValue, iconBg, iconColor, urgent }: StatCardProps) => (
  <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
    <Card className={`overflow-hidden ${urgent ? "border-red-200 dark:border-red-800" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide truncate">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${urgent ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
        {trend && trendValue && (
          <div className="mt-3 flex items-center gap-1.5">
            {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-green-500" />}
            {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
            {trend === "neutral" && <Minus className="h-3.5 w-3.5 text-slate-400" />}
            <span className={`text-xs font-medium ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-slate-500"}`}>{trendValue}</span>
          </div>
        )}
      </CardContent>
    </Card>
  </motion.div>
);

const woStatusConfig: Record<string, { label: string; cls: string }> = {
  open:         { label: "Open",        cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  "in-progress":{ label: "In Progress", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  completed:    { label: "Completed",   cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
};
const priorityConfig: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  high:     "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  normal:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

// ─── Dashboard content ─────────────────────────────────────────────────────────

const BiomedicalDashboardContent = () => {
  const navigate = useNavigate();
  const [clock, setClock] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const totalDevices = 342;
  const onlineDevices = 318;
  const uptimePct = Math.round((onlineDevices / totalDevices) * 100);

  return (
    <div className="space-y-6">

      {/* ── Hero Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-6 text-white"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #1d4ed8 70%, #0284c7 100%)" }}
      >
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/5 rounded-full" />
        <div className="absolute -bottom-16 -right-4 w-80 h-80 bg-white/5 rounded-full" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 shadow-lg">
              <Cpu className="h-9 w-9 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-white/15 text-white border-white/25 text-[10px] font-semibold">Clinical Engineering</Badge>
                <Badge className="bg-cyan-400/20 text-cyan-200 border-cyan-400/30 text-[10px] font-semibold">
                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full mr-1.5 animate-pulse" />Live
                </Badge>
              </div>
              <h2 className="text-2xl font-bold">Biomedical Engineering Operations</h2>
              <p className="text-white/60 text-sm mt-0.5">
                {clock.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center hidden md:block">
              <p className="text-4xl font-bold tracking-tight tabular-nums">
                {clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
              <p className="text-white/50 text-xs mt-1">IST — Indian Standard Time</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 1200); }}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl">
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="relative z-10 mt-5 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Cpu,         label: "Total Devices",   value: totalDevices.toString() },
            { icon: Wifi,        label: "Online Devices",  value: `${onlineDevices} (${uptimePct}%)` },
            { icon: AlertTriangle,label: "Critical Alerts",value: criticalAlerts.filter(a => a.severity === "critical").length.toString() },
            { icon: ListChecks,  label: "Open Work Orders",value: recentWorkOrders.filter(o => o.status === "open").length.toString() },
          ].map(({ icon: Ic, label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <Ic className="h-5 w-5 text-blue-300 shrink-0" />
              <div>
                <p className="text-white font-bold text-xl leading-none">{value}</p>
                <p className="text-white/50 text-xs mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Critical Alert Strip ── */}
      {criticalAlerts.filter(a => a.severity === "critical").length > 0 && (
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl">
          <div className="w-9 h-9 bg-red-100 dark:bg-red-900 rounded-xl flex items-center justify-center shrink-0 border border-red-200 dark:border-red-700">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700 dark:text-red-300">
              {criticalAlerts.filter(a => a.severity === "critical").length} Critical Device Failures
            </p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70 truncate">
              {criticalAlerts.filter(a => a.severity === "critical").map(a => a.device.split(" — ")[0]).join(" • ")}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/biomedical/monitoring")}
            className="shrink-0 border-red-200 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950">
            View Monitoring
          </Button>
        </motion.div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Cpu}         label="Total Equipment"      value={totalDevices}  sub="Across all departments" trend="up"      trendValue="+8 new this month" iconBg="bg-blue-100 dark:bg-blue-950"   iconColor="text-blue-600 dark:text-blue-400" />
        <StatCard icon={ListChecks}  label="Open Work Orders"     value={recentWorkOrders.filter(o=>o.status==="open").length}  sub="3 critical priority" trend="down" trendValue="-2 vs yesterday" iconBg="bg-red-100 dark:bg-red-950" iconColor="text-red-600 dark:text-red-400" urgent />
        <StatCard icon={CalendarClock}label="Calibration Due"     value={upcomingCalibrations.filter(c=>c.daysLeft<=7).length} sub="Within 7 days" trend="neutral" trendValue="Same as last week"  iconBg="bg-amber-100 dark:bg-amber-950" iconColor="text-amber-600 dark:text-amber-400" />
        <StatCard icon={ShieldCheck} label="PPM Compliance"       value="94%"           sub="NABH target: 95%"      trend="up"      trendValue="+3% vs last month" iconBg="bg-green-100 dark:bg-green-950" iconColor="text-green-600 dark:text-green-400" />
      </div>

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Device Uptime Timeline */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" /> Device Uptime — 24h
              </CardTitle>
              <Badge variant="outline" className="text-xs">Live</Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Online vs warning vs offline count across the day</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={uptimeData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="onlineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="warnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="offGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="online"  name="Online"  stroke="#22c55e" strokeWidth={2} fill="url(#onlineGrad)" dot={false} />
                <Area type="monotone" dataKey="warning" name="Warning" stroke="#f59e0b" strokeWidth={2} fill="url(#warnGrad)"  dot={false} />
                <Area type="monotone" dataKey="offline" name="Offline" stroke="#ef4444" strokeWidth={2} fill="url(#offGrad)"   dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Device Status Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4 text-blue-600" />Device Status</CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">Current fleet health snapshot</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={deviceStatusData} cx="50%" cy="50%" outerRadius={65} innerRadius={38} dataKey="value" paddingAngle={2}>
                  {deviceStatusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {deviceStatusData.map(({ name, value, color }) => (
                <div key={name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-slate-600 dark:text-slate-400 truncate">{name}</span>
                  <span className="ml-auto font-semibold text-slate-700 dark:text-slate-300">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row 2 ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-600" />Work Orders by Department</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={workOrdersByDept} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="dept" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="open"      name="Open"      fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="overdue"   name="Overdue"   fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600" />Maintenance Completion Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={maintenanceTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="completed" name="Completed" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="overdue"   name="Overdue"   fill="#fca5a5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Work Orders + Upcoming Calibrations ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-blue-600" />Recent Work Orders</CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate("/biomedical/work-orders")} className="gap-1 text-xs">
                All Orders <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {["WO #", "Device", "Type", "Priority", "Status", "Engineer"].map(h => (
                      <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentWorkOrders.map(wo => (
                    <tr key={wo.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800 dark:text-white text-xs">{wo.id}</p>
                        <p className="text-[10px] text-slate-400">{wo.dept}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-xs text-slate-700 dark:text-slate-300 max-w-[160px] truncate">{wo.device}</p>
                      </td>
                      <td className="px-5 py-3"><span className="text-xs text-slate-600 dark:text-slate-400">{wo.type}</span></td>
                      <td className="px-5 py-3">
                        <Badge className={`text-[10px] border-0 font-medium ${priorityConfig[wo.priority]}`}>{wo.priority}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge className={`text-[10px] border-0 font-medium ${woStatusConfig[wo.status].cls}`}>{woStatusConfig[wo.status].label}</Badge>
                      </td>
                      <td className="px-5 py-3"><span className="text-xs text-slate-600 dark:text-slate-400">{wo.engineer}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Calibrations */}
        <Card className="border-amber-100 dark:border-amber-900/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <CalendarClock className="h-4 w-4" />Upcoming Calibrations
              </CardTitle>
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-0 text-xs">{upcomingCalibrations.length} due</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingCalibrations.map((c) => (
              <div key={c.cert} className={`flex items-start gap-3 p-3 rounded-xl border ${c.daysLeft <= 5 ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" : c.daysLeft <= 10 ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" : "bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700"}`}>
                <CalendarClock className={`h-4 w-4 shrink-0 mt-0.5 ${c.daysLeft <= 5 ? "text-red-600" : c.daysLeft <= 10 ? "text-amber-600" : "text-slate-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate text-slate-800 dark:text-white">{c.device.split(" — ")[0]}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{c.dept} · {c.dueDate}</p>
                  <Badge className={`mt-1 text-[9px] border-0 ${c.daysLeft <= 5 ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"}`}>
                    {c.daysLeft} days left
                  </Badge>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full text-xs border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950 mt-1"
              onClick={() => navigate("/biomedical/calibration")}>
              View All Calibrations
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Actions ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><LayoutDashboard className="h-4 w-4 text-blue-600" />Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: ListChecks,  label: "New Work Order",     path: "/biomedical/work-orders",  color: "text-red-600 bg-red-50 dark:bg-red-950 group-hover:bg-red-100" },
              { icon: Stethoscope, label: "Equipment List",     path: "/biomedical/equipment",    color: "text-blue-600 bg-blue-50 dark:bg-blue-950 group-hover:bg-blue-100" },
              { icon: CalendarClock,label:"Calibration Log",   path: "/biomedical/calibration",  color: "text-amber-600 bg-amber-50 dark:bg-amber-950 group-hover:bg-amber-100" },
              { icon: Monitor,     label: "Device Monitoring",  path: "/biomedical/monitoring",   color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950 group-hover:bg-cyan-100" },
              { icon: BarChart3,   label: "Reports",            path: "/biomedical/reports",      color: "text-purple-600 bg-purple-50 dark:bg-purple-950 group-hover:bg-purple-100" },
              { icon: ShieldCheck, label: "Compliance",         path: "/biomedical/reports",      color: "text-green-600 bg-green-50 dark:bg-green-950 group-hover:bg-green-100" },
            ].map(action => (
              <button key={action.label} onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:shadow-sm transition-all duration-200 group">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${action.color}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Exported page ─────────────────────────────────────────────────────────────

export const BiomedicalDashboard = () => (
  <DeptStaffLayout
    deptKey="biomedical"
    deptName="Biomedical Engineering"
    badgeLabel="BIOMED"
    loginPath="/biomedical/login"
    DeptIcon={Wrench}
    navSections={biomedNav}
    title="Dashboard"
    subtitle="Clinical engineering operations center"
  >
    <BiomedicalDashboardContent />
    <BiomedicalAIAssistant />
  </DeptStaffLayout>
);
