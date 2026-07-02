import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { bloodBankNav } from "./DepartmentDashboards";
import {
  Droplets, AlertTriangle, CheckCircle2, Clock, Users, ArrowRightLeft,
  TrendingUp, TrendingDown, Thermometer, Activity, RefreshCw, ChevronRight,
  Zap, ShieldCheck, FlaskConical, HeartPulse, Timer, BarChart3,
  ArrowRight, Bell, Archive, Syringe, CalendarCheck, UserCheck,
  TriangleAlert, CircleCheck, CircleDot,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell, PieChart, Pie,
} from "recharts";

// ─── Blood group data ─────────────────────────────────────────────────────────

interface BloodGroup {
  group: string;
  units: number;
  capacity: number;
  status: "critical" | "low" | "adequate" | "good";
  expiring: number;
}

const bloodGroups: BloodGroup[] = [
  { group: "O+",  units: 42, capacity: 80, status: "adequate", expiring: 3 },
  { group: "O−",  units: 8,  capacity: 40, status: "low",      expiring: 1 },
  { group: "A+",  units: 35, capacity: 80, status: "adequate", expiring: 2 },
  { group: "A−",  units: 4,  capacity: 30, status: "critical", expiring: 0 },
  { group: "B+",  units: 28, capacity: 60, status: "adequate", expiring: 1 },
  { group: "B−",  units: 6,  capacity: 30, status: "low",      expiring: 0 },
  { group: "AB+", units: 15, capacity: 40, status: "adequate", expiring: 1 },
  { group: "AB−", units: 2,  capacity: 20, status: "critical", expiring: 0 },
];

const statusColor: Record<BloodGroup["status"], string> = {
  critical: "bg-red-600",
  low:      "bg-amber-500",
  adequate: "bg-emerald-500",
  good:     "bg-blue-500",
};
const statusTextColor: Record<BloodGroup["status"], string> = {
  critical: "text-red-600",
  low:      "text-amber-600",
  adequate: "text-emerald-600",
  good:     "text-blue-600",
};
const statusBg: Record<BloodGroup["status"], string> = {
  critical: "bg-red-50 border-red-200",
  low:      "bg-amber-50 border-amber-200",
  adequate: "bg-emerald-50 border-emerald-100",
  good:     "bg-blue-50 border-blue-100",
};

// ─── Components data ──────────────────────────────────────────────────────────

const components = [
  { name: "Packed RBCs",      units: 84,  capacity: 150, color: "#dc2626" },
  { name: "Fresh Frozen Plasma", units: 56, capacity: 100, color: "#2563eb" },
  { name: "Platelets",        units: 18,  capacity: 60,  color: "#d97706" },
  { name: "Cryoprecipitate",  units: 12,  capacity: 40,  color: "#7c3aed" },
  { name: "Whole Blood",      units: 6,   capacity: 30,  color: "#059669" },
];

// ─── 7-day trend ──────────────────────────────────────────────────────────────

const trend7d = [
  { day: "09 May", collected: 18, issued: 14, crossmatch: 22 },
  { day: "10 May", collected: 22, issued: 19, crossmatch: 28 },
  { day: "11 May", collected: 15, issued: 20, crossmatch: 18 },
  { day: "12 May", collected: 28, issued: 16, crossmatch: 31 },
  { day: "13 May", collected: 20, issued: 22, crossmatch: 24 },
  { day: "14 May", collected: 24, issued: 18, crossmatch: 29 },
  { day: "15 May", collected: 16, issued: 12, crossmatch: 19 },
];

// ─── Cross-match queue ────────────────────────────────────────────────────────

const crossMatchQueue = [
  { id: "XM-5041", patient: "Mr. Arjun Sharma",  ward: "OT-1",       group: "A+",  component: "PRBC",   units: 2, status: "pending",   reqTime: "09:12 AM", urgency: "high" },
  { id: "XM-5040", patient: "Ms. Priya Iyer",    ward: "ICU-3",      group: "O+",  component: "PRBC",   units: 3, status: "in-process",reqTime: "08:57 AM", urgency: "critical" },
  { id: "XM-5039", patient: "Mr. Ramesh Nair",   ward: "Ward-B",     group: "B+",  component: "FFP",    units: 2, status: "ready",     reqTime: "08:30 AM", urgency: "routine" },
  { id: "XM-5038", patient: "Ms. Sunita Verma",  ward: "Labour Room",group: "AB+", component: "PRBC",   units: 4, status: "pending",   reqTime: "07:45 AM", urgency: "high" },
  { id: "XM-5037", patient: "Mr. Deepak Gupta",  ward: "OT-3",       group: "O−",  component: "PRBC",   units: 2, status: "issued",    reqTime: "07:10 AM", urgency: "high" },
  { id: "XM-5036", patient: "Ms. Kavitha Reddy", ward: "Oncology",   group: "A−",  component: "Platelets",units:1,status: "ready",     reqTime: "06:50 AM", urgency: "routine" },
];

// ─── Donors today ─────────────────────────────────────────────────────────────

const donorsToday = [
  { id: "D-4091", name: "Rajesh Kumar",    group: "O+",  type: "Voluntary", time: "10:00 AM", status: "completed" },
  { id: "D-4090", name: "Ananya Singh",    group: "A+",  type: "Replacement",time:"10:30 AM", status: "scheduled" },
  { id: "D-4089", name: "Sanjay Mehta",    group: "B+",  type: "Voluntary", time: "11:00 AM", status: "scheduled" },
  { id: "D-4088", name: "Meera Krishnan",  group: "O−",  type: "Voluntary", time: "11:30 AM", status: "scheduled" },
  { id: "D-4087", name: "Vikram Patil",    group: "AB+", type: "Replacement",time:"02:00 PM", status: "scheduled" },
];

// ─── Refrigerator temps ───────────────────────────────────────────────────────

const fridgeData = [
  { id: "RF-1", name: "Blood Ref. A",   temp: 4.1, ideal: "2–6°C",  status: "normal",  component: "PRBC / Whole Blood" },
  { id: "RF-2", name: "Blood Ref. B",   temp: 4.8, ideal: "2–6°C",  status: "normal",  component: "PRBC" },
  { id: "FZ-1", name: "FFP Freezer",    temp: -22, ideal: "≤ −18°C",status: "normal",  component: "FFP / Cryo" },
  { id: "RT-1", name: "Platelet Agit.", temp: 22.3,ideal: "20–24°C", status: "warning", component: "Platelets" },
];

// ─── Alerts ───────────────────────────────────────────────────────────────────

const alerts = [
  { id: 1, type: "critical", msg: "A− stock critically low — only 4 units remaining", time: "09:05 AM" },
  { id: 2, type: "critical", msg: "AB− stock critically low — only 2 units remaining", time: "08:50 AM" },
  { id: 3, type: "warning",  msg: "O− running low — 8 units, reorder recommended",    time: "08:30 AM" },
  { id: 4, type: "warning",  msg: "3 PRBC units expiring in 48 hrs — O+ batch #B2041",time: "08:00 AM" },
  { id: 5, type: "warning",  msg: "Platelet agitator RT-1 temp slightly high: 22.3°C",time: "07:45 AM" },
  { id: 6, type: "info",     msg: "B-2039 FFP batch QC passed — cleared for issue",   time: "07:00 AM" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pct = (v: number, cap: number) => Math.round((v / cap) * 100);

const urgencyBadge: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high:     "bg-orange-100 text-orange-700 border-orange-200",
  routine:  "bg-sky-100 text-sky-700 border-sky-200",
};

const xmStatusBadge: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-700",
  "in-process":"bg-blue-100 text-blue-700",
  ready:      "bg-emerald-100 text-emerald-700",
  issued:     "bg-slate-100 text-slate-600",
};

const alertIcon: Record<string, JSX.Element> = {
  critical: <TriangleAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
  warning:  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
  info:     <CircleDot     className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
};

// ─── Animated clock ───────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right hidden md:block">
      <p className="text-3xl font-bold tabular-nums">
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </p>
      <p className="text-red-100 text-sm mt-0.5">
        {time.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </p>
    </div>
  );
}

// ─── Blood-bag fill meter ─────────────────────────────────────────────────────

function BloodBagMeter({ bg }: { bg: BloodGroup }) {
  const fillPct = pct(bg.units, bg.capacity);
  const isCritical = bg.status === "critical";
  const isLow = bg.status === "low";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border ${statusBg[bg.status]} cursor-default group`}
    >
      {/* Pulsing dot for critical */}
      {isCritical && (
        <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
        </span>
      )}

      {/* Group label */}
      <span className="font-black text-base text-slate-800 tracking-tight">{bg.group}</span>

      {/* Tube / fill visual */}
      <div className="relative w-8 h-20 bg-white border-2 border-slate-200 rounded-full overflow-hidden">
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${fillPct}%` }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
          className={`absolute bottom-0 left-0 right-0 ${statusColor[bg.status]} opacity-90`}
        />
        {/* Droplet icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Droplets className="h-3.5 w-3.5 text-white/80 drop-shadow" />
        </div>
      </div>

      {/* Units count */}
      <div className="text-center">
        <p className={`text-lg font-extrabold leading-none ${statusTextColor[bg.status]}`}>{bg.units}</p>
        <p className="text-[10px] text-slate-500 leading-none mt-0.5">/ {bg.capacity}</p>
      </div>

      {/* Status badge */}
      <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${statusColor[bg.status]} text-white`}>
        {bg.status}
      </span>

      {/* Expiry indicator */}
      {bg.expiring > 0 && (
        <span className="text-[9px] text-amber-700 font-semibold">⚠ {bg.expiring} expiring</span>
      )}

      {/* Tooltip on hover */}
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl">
        {bg.group}: {bg.units} units ({fillPct}% full)
        {bg.expiring > 0 && ` · ${bg.expiring} expiring ≤3 days`}
      </div>
    </motion.div>
  );
}

// ─── Temp indicator ───────────────────────────────────────────────────────────

function TempGauge({ fridge }: { fridge: typeof fridgeData[0] }) {
  const isWarning = fridge.status === "warning";
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${isWarning ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isWarning ? "bg-amber-100" : "bg-blue-100"}`}>
        <Thermometer className={`h-4 w-4 ${isWarning ? "text-amber-700" : "text-blue-700"}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-800 truncate">{fridge.name}</p>
          <span className={`text-sm font-black tabular-nums ${isWarning ? "text-amber-700" : "text-blue-700"}`}>
            {fridge.temp}°C
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mt-0.5">{fridge.component} · ideal {fridge.ideal}</p>
        {isWarning && (
          <p className="text-[10px] text-amber-700 font-semibold mt-0.5">⚠ Outside safe range — check agitator</p>
        )}
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface KpiProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  pulse?: boolean;
  trend?: "up" | "down";
}

function KpiCard({ icon: Icon, label, value, sub, color, pulse, trend }: KpiProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className={`relative flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
              <Icon className="h-5 w-5 text-white" />
              {pulse && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
              )}
            </div>
            {trend && (
              <span className={`text-xs font-semibold flex items-center gap-0.5 ${trend === "up" ? "text-emerald-600" : "text-red-500"}`}>
                {trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              </span>
            )}
          </div>
          <p className="mt-3 text-2xl font-extrabold text-slate-900 tabular-nums">{value}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
          {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Component bar ────────────────────────────────────────────────────────────

function ComponentBar({ c }: { c: typeof components[0] }) {
  const fill = pct(c.units, c.capacity);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{c.name}</span>
        <span className="tabular-nums font-bold text-slate-900">{c.units} <span className="text-slate-400 font-normal">/ {c.capacity}</span></span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fill}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
          className="h-full rounded-full"
          style={{ backgroundColor: c.color }}
        />
      </div>
      <p className="text-[10px] text-slate-400">{fill}% stocked</p>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function BloodBankDashboard() {
  const navigate = useNavigate();
  const [activeAlert, setActiveAlert] = useState<number | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [xmFilter, setXmFilter] = useState<string>("all");

  const deptData = (() => {
    try { return JSON.parse(localStorage.getItem("blood-bankAuth") || "{}"); } catch { return {}; }
  })();
  const staffName = deptData?.name ?? deptData?.email ?? "Blood Bank Staff";

  const totalUnits = bloodGroups.reduce((s, b) => s + b.units, 0);
  const criticalCount = bloodGroups.filter(b => b.status === "critical").length;
  const expiringTotal = bloodGroups.reduce((s, b) => s + b.expiring, 0);
  const pendingXM = crossMatchQueue.filter(x => x.status === "pending" || x.status === "in-process").length;

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => { setRefreshing(false); setLastRefreshed(new Date()); }, 1200);
  };

  const filteredXM = xmFilter === "all" ? crossMatchQueue : crossMatchQueue.filter(x => x.status === xmFilter);

  return (
    <DeptStaffLayout
      deptKey="blood-bank"
      deptName="Blood Bank"
      badgeLabel="BLOOD BANK"
      DeptIcon={Droplets}
      loginPath="/blood-bank/login"
      navSections={bloodBankNav}
      copilotModule="bloodbank"
    >
      <div className="space-y-5 pb-8">

        {/* ── Hero banner ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-700 via-red-600 to-rose-700 p-6 text-white shadow-xl"
        >
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-white/5" />
            <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-white/5" />
            <div className="absolute top-4 right-32 h-24 w-24 rounded-full bg-white/5" />
          </div>

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-inner">
                <Droplets className="h-9 w-9 text-white" />
              </div>
              <div>
                <p className="text-red-100 text-sm font-medium">Welcome back,</p>
                <h2 className="text-2xl font-bold">{staffName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                    <HeartPulse className="h-3 w-3" /> Blood Bank
                  </span>
                  {criticalCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-900/60 px-2.5 py-0.5 text-xs font-bold animate-pulse">
                      <TriangleAlert className="h-3 w-3" /> {criticalCount} Critical Group{criticalCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <LiveClock />
          </div>

          {/* Hero stats strip */}
          <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Units",     value: totalUnits,    icon: Archive },
              { label: "Pending X-Match", value: pendingXM,     icon: FlaskConical },
              { label: "Expiring ≤3 Days",value: expiringTotal, icon: Timer },
              { label: "Donors Today",    value: donorsToday.length, icon: Users },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl bg-white/15 backdrop-blur-sm p-3 flex items-center gap-3">
                <Icon className="h-5 w-5 text-white/70 shrink-0" />
                <div>
                  <p className="text-xl font-extrabold tabular-nums">{value}</p>
                  <p className="text-[11px] text-red-100">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Refresh bar */}
          <div className="relative z-10 mt-4 flex items-center justify-between text-xs text-red-100">
            <span>Last updated: {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 hover:bg-white/25 transition-colors font-medium"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </motion.div>

        {/* ── KPI row ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard icon={Droplets}      label="Units Available"   value={totalUnits}         sub="across all groups"         color="bg-red-500"     trend="up" />
          <KpiCard icon={TriangleAlert} label="Critical Groups"   value={criticalCount}      sub="need urgent restock"       color="bg-rose-600"    pulse={criticalCount > 0} />
          <KpiCard icon={ArrowRightLeft}label="Issued Today"      value={12}                 sub="units across 8 depts"      color="bg-blue-600"    trend="down" />
          <KpiCard icon={FlaskConical}  label="X-Matches Done"    value={14}                 sub="avg TAT: 28 min"           color="bg-violet-600"  trend="up" />
        </div>

        {/* ── Blood group inventory + Components ───────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Blood group meters */}
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-red-500" /> Blood Group Inventory
                </CardTitle>
                <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  {(["critical", "low", "adequate", "good"] as const).map(s => (
                    <span key={s} className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${statusColor[s]}`} /> {s}
                    </span>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {bloodGroups.map(bg => <BloodBagMeter key={bg.group} bg={bg} />)}
              </div>

              {/* Summary strip */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-red-50 border border-red-100 p-2">
                  <p className="text-sm font-extrabold text-red-700">{bloodGroups.filter(b => b.status === "critical").map(b => b.group).join(", ")}</p>
                  <p className="text-[10px] text-red-500 font-medium mt-0.5">Critical — Order Immediately</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-2">
                  <p className="text-sm font-extrabold text-amber-700">{bloodGroups.filter(b => b.status === "low").map(b => b.group).join(", ")}</p>
                  <p className="text-[10px] text-amber-500 font-medium mt-0.5">Low — Plan Restock</p>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2">
                  <p className="text-sm font-extrabold text-emerald-700">{bloodGroups.filter(b => b.status === "adequate" || b.status === "good").map(b => b.group).join(", ")}</p>
                  <p className="text-[10px] text-emerald-500 font-medium mt-0.5">Adequate / Good</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Blood components */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-violet-500" /> Component Stock
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {components.map(c => <ComponentBar key={c.name} c={c} />)}

              <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">Component Summary</p>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={components} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 8 }} tickFormatter={n => n.split(" ")[0]} />
                      <YAxis tick={{ fontSize: 8 }} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Bar dataKey="units" radius={[4, 4, 0, 0]}>
                        {components.map(c => <Cell key={c.name} fill={c.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── 7-day trend + Alerts ──────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Trend chart */}
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-500" /> 7-Day Activity
                </CardTitle>
                <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Collected</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Issued</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" /> X-Matches</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend7d} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradCollect" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradIssue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradXM" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(0, 6)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="collected"  stroke="#ef4444" fill="url(#gradCollect)" strokeWidth={2} dot={{ r: 3 }} />
                    <Area type="monotone" dataKey="issued"     stroke="#3b82f6" fill="url(#gradIssue)"   strokeWidth={2} dot={{ r: 3 }} />
                    <Area type="monotone" dataKey="crossmatch" stroke="#a78bfa" fill="url(#gradXM)"      strokeWidth={2} dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Wastage indicator */}
              <div className="mt-3 flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-100 p-3">
                <TriangleAlert className="h-4 w-4 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800">Wastage This Week</p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex-1 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: "6%" }} />
                    </div>
                    <span className="text-xs font-bold text-amber-700">3 units (2.1%)</span>
                  </div>
                </div>
                <span className="text-[10px] text-amber-600 font-medium">NBTC target ≤ 3%</span>
              </div>
            </CardContent>
          </Card>

          {/* Alerts panel */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Bell className="h-4 w-4 text-rose-500" /> Live Alerts
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-bold border-rose-200 text-rose-600">
                  {alerts.filter(a => a.type === "critical").length} critical
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              <AnimatePresence>
                {alerts.map(a => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => setActiveAlert(activeAlert === a.id ? null : a.id)}
                    className={`flex gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      a.type === "critical" ? "bg-red-50 border-red-100 hover:bg-red-100" :
                      a.type === "warning"  ? "bg-amber-50 border-amber-100 hover:bg-amber-100" :
                                             "bg-blue-50 border-blue-100 hover:bg-blue-100"
                    }`}
                  >
                    {alertIcon[a.type]}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-slate-800 leading-snug">{a.msg}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{a.time}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>

        {/* ── Cross-match queue + Donors + Temperatures ─────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Cross-match queue */}
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-violet-500" /> Cross-Match Queue
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  {["all", "pending", "in-process", "ready", "issued"].map(f => (
                    <button
                      key={f}
                      onClick={() => setXmFilter(f)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors capitalize ${
                        xmFilter === f
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["Req ID", "Patient", "Ward", "Group", "Component", "Units", "Urgency", "Status", "Time"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredXM.map((row, i) => (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-700">{row.id}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.patient}</td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{row.ward}</td>
                        <td className="px-3 py-2.5">
                          <span className="font-extrabold text-red-600">{row.group}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{row.component}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-700">{row.units}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${urgencyBadge[row.urgency]}`}>
                            {row.urgency}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${xmStatusBadge[row.status]}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{row.reqTime}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[11px] text-slate-400">{filteredXM.length} requisition{filteredXM.length !== 1 ? "s" : ""} shown</p>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => navigate("/blood-bank/requisitions")}>
                  All Requisitions <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Donors + Temperatures */}
          <div className="space-y-4">

            {/* Today's donors */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-500" /> Donors Today
                  </CardTitle>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-emerald-700" onClick={() => navigate("/blood-bank/donors")}>
                    View all <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {donorsToday.map(d => (
                  <div key={d.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shrink-0 ${
                      d.status === "completed" ? "bg-emerald-500" : "bg-slate-400"
                    }`}>
                      {d.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{d.name}</p>
                      <p className="text-[10px] text-slate-400">{d.type} · {d.time}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-extrabold text-red-600">{d.group}</span>
                      <p className={`text-[9px] font-semibold mt-0.5 ${d.status === "completed" ? "text-emerald-600" : "text-slate-400"}`}>
                        {d.status}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Storage temperatures */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-blue-500" /> Storage Temps
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {fridgeData.map(f => <TempGauge key={f.id} fridge={f} />)}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Quick actions ─────────────────────────────────────────────────── */}
        <Card className="shadow-sm border-0 bg-gradient-to-r from-slate-50 to-red-50">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "View Inventory",    path: "/blood-bank/inventory",    color: "bg-red-600 hover:bg-red-700",    icon: Archive },
                { label: "New Requisition",   path: "/blood-bank/requisitions", color: "bg-blue-600 hover:bg-blue-700",  icon: ArrowRightLeft },
                { label: "Register Donor",    path: "/blood-bank/donors",       color: "bg-emerald-600 hover:bg-emerald-700", icon: UserCheck },
                { label: "Issue Blood",       path: "/blood-bank/requisitions", color: "bg-violet-600 hover:bg-violet-700", icon: Syringe },
                { label: "Reports",           path: "/blood-bank/reports",      color: "bg-slate-700 hover:bg-slate-800", icon: BarChart3 },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.path)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-sm hover:shadow-md active:scale-95 ${a.color}`}
                >
                  <a.icon className="h-4 w-4" />
                  {a.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </DeptStaffLayout>
  );
}

export default BloodBankDashboard;
