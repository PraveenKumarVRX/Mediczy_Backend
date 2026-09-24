/**
 * BiomedicalDashboardPage — world-class clinical engineering operations dashboard.
 * Live device status, maintenance pipeline, calibration compliance, work orders.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/utils/api";
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
  const [equipment, setEquipment] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [calDue, setCalDue] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadAll = () => {
    setRefreshing(true);
    const headers = { Authorization: `Bearer ${localStorage.getItem('biomedicalToken') || ''}` };
    Promise.all([
      api.get('/biomedical/equipment', { headers }),
      api.get('/biomedical/maintenance-tickets', { headers }),
      api.get('/biomedical/calibration-due?withinDays=30', { headers }),
    ])
      .then(([eq, tk, cal]) => {
        setEquipment(eq.data?.data || []);
        setTickets(tk.data?.data || []);
        setCalDue(cal.data?.data || []);
        setLoaded(true);
      })
      .catch((err) => {
        console.error('[Biomedical] dashboard load failed:', err?.message);
        setLoaded(true);
      })
      .finally(() => setRefreshing(false));
  };

  useEffect(() => { loadAll(); }, []);

  // ── Derived, all from live endpoints (no fabricated numbers — WP-0.3d) ──
  const equipById = new Map(equipment.map((e: any) => [String(e.id), e]));
  const totalDevices = loaded ? equipment.length : null;
  const openTickets = tickets.filter((t: any) => t.status === "open");
  const resolvedTickets = tickets.filter((t: any) => t.status === "resolved");
  const calDue7 = calDue.filter((c: any) =>
    c.next_due_at && new Date(c.next_due_at).getTime() <= Date.now() + 7 * 86400000);

  const recentWorkOrders = tickets.slice(0, 7).map((t: any) => {
    const eq = t.equipment_id ? equipById.get(String(t.equipment_id)) : null;
    return {
      id: `WO-${t.id}`,
      device: eq ? `${eq.device_name} — ${eq.model || eq.equipment_class || ""}` : "Unlinked equipment",
      dept: eq?.department || "—",
      type: "Issue",
      status: t.status === "resolved" ? "completed" : t.status === "open" ? "open" : String(t.status),
      priority: t.priority === "critical" ? "critical" : t.priority === "urgent" ? "high" : "normal",
      engineer: t.assigned_to || "—",
      time: String(t.opened_at || "").slice(11, 16),
    };
  });

  const upcomingCalibrations = calDue.map((c: any) => {
    const due = c.next_due_at ? new Date(c.next_due_at) : null;
    const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : 9999;
    return {
      device: c.device_name || `Equipment #${c.equipment_id}`,
      dept: c.department || "—",
      dueDate: due ? String(due.toISOString()).slice(0, 10) : "—",
      daysLeft,
      cert: `CAL-${c.id}`,
    };
  });

  const workOrdersByDept = (() => {
    const m = new Map<string, { dept: string; open: number; completed: number }>();
    tickets.forEach((t: any) => {
      const eq = t.equipment_id ? equipById.get(String(t.equipment_id)) : null;
      const dept = eq?.department || "Unassigned";
      const row = m.get(dept) || { dept, open: 0, completed: 0 };
      if (t.status === "open") row.open += 1;
      if (t.status === "resolved") row.completed += 1;
      m.set(dept, row);
    });
    return Array.from(m.values());
  })();

  const classCounts = (() => {
    const m = new Map<string, number>();
    equipment.forEach((e: any) => {
      const k = e.equipment_class || "Unclassified";
      m.set(k, (m.get(k) || 0) + 1);
    });
    const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4", "#ef4444", "#ec4899", "#64748b"];
    return Array.from(m.entries()).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
  })();

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
            <Button variant="ghost" size="icon" onClick={loadAll}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl">
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="relative z-10 mt-5 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Cpu,         label: "Total Devices",   value: totalDevices !== null ? String(totalDevices) : "—" },
            { icon: ListChecks,  label: "Open Work Orders",value: loaded ? String(openTickets.length) : "—" },
            { icon: CalendarClock,label: "Calibration Due",value: loaded ? String(calDue.length) : "—" },
            { icon: ShieldCheck, label: "Resolved WOs",    value: loaded ? String(resolvedTickets.length) : "—" },
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

      {/* No critical-alert source exists yet — strip intentionally removed (WP-0.3d) */}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Cpu}         label="Total Equipment"      value={totalDevices !== null ? totalDevices : "—"} sub="Live equipment registry" iconBg="bg-blue-100 dark:bg-blue-950"   iconColor="text-blue-600 dark:text-blue-400" />
        <StatCard icon={ListChecks}  label="Open Work Orders"     value={loaded ? openTickets.length : "—"}  sub="Maintenance tickets open" iconBg="bg-red-100 dark:bg-red-950" iconColor="text-red-600 dark:text-red-400" urgent />
        <StatCard icon={CalendarClock}label="Calibration Due"     value={loaded ? calDue7.length : "—"} sub="Within 7 days" iconBg="bg-amber-100 dark:bg-amber-950" iconColor="text-amber-600 dark:text-amber-400" />
        <StatCard icon={ShieldCheck} label="Resolved Tickets"     value={loaded ? resolvedTickets.length : "—"} sub="All time" iconBg="bg-green-100 dark:bg-green-950" iconColor="text-green-600 dark:text-green-400" />
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
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Not available yet — live device status isn’t streamed (dataAvailable: false)</p>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No uptime telemetry source is connected, so this chart intentionally shows no data (WP-0.3d).
            </p>
          </CardContent>
        </Card>

        {/* Device Status Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4 text-blue-600" />Equipment by Class</CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">Live registry breakdown by equipment class</p>
          </CardHeader>
          <CardContent>
            {!loaded && <p className="text-sm text-slate-400">Loading…</p>}
            {loaded && classCounts.length === 0 && (
              <p className="text-sm text-slate-400">No equipment registered yet.</p>
            )}
            {loaded && classCounts.length > 0 && (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={classCounts} cx="50%" cy="50%" outerRadius={65} innerRadius={38} dataKey="value" paddingAngle={2}>
                      {classCounts.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {classCounts.map(({ name, value, color }) => (
                    <div key={name} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-slate-600 dark:text-slate-400 truncate">{name}</span>
                      <span className="ml-auto font-semibold text-slate-700 dark:text-slate-300">{value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
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
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Not available yet — maintenance history isn’t recorded over time (dataAvailable: false).
            </p>
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
                  {!loaded && (
                    <tr><td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">Loading work orders…</td></tr>
                  )}
                  {loaded && recentWorkOrders.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">No maintenance tickets yet.</td></tr>
                  )}
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
                        <Badge className={`text-[10px] border-0 font-medium ${(woStatusConfig[wo.status] || woStatusConfig.open).cls}`}>{(woStatusConfig[wo.status] || woStatusConfig.open).label}</Badge>
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
            {loaded && upcomingCalibrations.length === 0 && (
              <p className="text-xs text-slate-400">No calibrations due in the next 30 days.</p>
            )}
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
