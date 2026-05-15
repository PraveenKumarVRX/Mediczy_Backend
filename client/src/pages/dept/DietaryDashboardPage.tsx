/**
 * DietaryDashboardPage — world-class hospital dietary department dashboard.
 * Rich stats, live meal timeline, diet-type breakdown, allergy alerts,
 * recent orders feed, and ward-wise compliance heatmap.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { dietaryNav } from "./DepartmentDashboards";
import { DietaryAIAssistant } from "@/components/dietary/DietaryAIAssistant";
import {
  Utensils, Users, AlertTriangle, CalendarDays, ClipboardList,
  CheckCircle2, Clock, Bell, TrendingUp, TrendingDown, Minus,
  ChefHat, Leaf, Droplets, Flame, Heart, Apple, Salad,
  LayoutDashboard, RefreshCw, ArrowRight, Zap, ShieldCheck,
  Soup, Wheat, Fish, Egg, Star, Activity, BarChart3,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── Static demo data ──────────────────────────────────────────────────────────

const mealTimelineData = [
  { time: "06:00", ordered: 0,  delivered: 0  },
  { time: "07:00", ordered: 38, delivered: 35 },
  { time: "08:00", ordered: 72, delivered: 68 },
  { time: "09:00", ordered: 85, delivered: 82 },
  { time: "10:00", ordered: 92, delivered: 90 },
  { time: "11:00", ordered: 88, delivered: 85 },
  { time: "12:00", ordered: 95, delivered: 91 },
  { time: "13:00", ordered: 89, delivered: 86 },
  { time: "14:00", ordered: 42, delivered: 40 },
  { time: "15:00", ordered: 38, delivered: 36 },
  { time: "16:00", ordered: 65, delivered: 62 },
  { time: "17:00", ordered: 90, delivered: 87 },
  { time: "18:00", ordered: 94, delivered: 91 },
  { time: "19:00", ordered: 96, delivered: 93 },
  { time: "20:00", ordered: 60, delivered: 58 },
];

const dietTypeData = [
  { name: "Regular", value: 142, color: "#22c55e" },
  { name: "Diabetic", value: 48, color: "#3b82f6" },
  { name: "Low-Sodium", value: 35, color: "#f59e0b" },
  { name: "Soft Diet", value: 28, color: "#8b5cf6" },
  { name: "Liquid", value: 19, color: "#06b6d4" },
  { name: "Renal", value: 16, color: "#ef4444" },
  { name: "Cardiac", value: 12, color: "#ec4899" },
  { name: "NPO", value: 8, color: "#64748b" },
];

const wardComplianceData = [
  { ward: "ICU",     compliance: 98, meals: 24 },
  { ward: "Cardio",  compliance: 96, meals: 42 },
  { ward: "Ortho",   compliance: 94, meals: 58 },
  { ward: "General", compliance: 91, meals: 112 },
  { ward: "Maternity", compliance: 97, meals: 36 },
  { ward: "Pediatric", compliance: 99, meals: 28 },
  { ward: "Neuro",   compliance: 93, meals: 34 },
  { ward: "Onco",    compliance: 88, meals: 22 },
];

const weeklyTrendData = [
  { day: "Mon", meals: 410, waste: 18 },
  { day: "Tue", meals: 425, waste: 15 },
  { day: "Wed", meals: 398, waste: 22 },
  { day: "Thu", meals: 442, waste: 12 },
  { day: "Fri", meals: 456, waste: 14 },
  { day: "Sat", meals: 380, waste: 20 },
  { day: "Sun", meals: 362, waste: 24 },
];

const recentOrders = [
  { id: "DO-4821", patient: "Ramesh Kumar",   ward: "ICU-3",      bed: "B4",  dietType: "Cardiac",    status: "delivered", time: "08:12", allergy: null,    priority: "high" },
  { id: "DO-4820", patient: "Priya Sharma",   ward: "Maternity",  bed: "A7",  dietType: "Regular",    status: "pending",   time: "08:05", allergy: null,    priority: "normal" },
  { id: "DO-4819", patient: "Vikram Singh",   ward: "General-2",  bed: "C12", dietType: "Diabetic",   status: "preparing", time: "07:58", allergy: "Peanuts", priority: "high" },
  { id: "DO-4818", patient: "Anita Patel",    ward: "Ortho",      bed: "D3",  dietType: "Low-Sodium", status: "delivered", time: "07:45", allergy: null,    priority: "normal" },
  { id: "DO-4817", patient: "Suresh Reddy",   ward: "Cardio-1",   bed: "B8",  dietType: "Renal",      status: "delivered", time: "07:30", allergy: "Dairy", priority: "high" },
  { id: "DO-4816", patient: "Meena Joshi",    ward: "Neuro",      bed: "E2",  dietType: "Soft Diet",  status: "cancelled", time: "07:20", allergy: null,    priority: "normal" },
  { id: "DO-4815", patient: "Arun Nair",      ward: "Pediatric",  bed: "P5",  dietType: "Regular",    status: "delivered", time: "07:15", allergy: "Eggs",  priority: "normal" },
];

const allergyAlerts = [
  { patient: "Vikram Singh",  ward: "General-2", allergy: "Peanuts", severity: "severe",   bed: "C12" },
  { patient: "Suresh Reddy",  ward: "Cardio-1",  allergy: "Dairy",   severity: "moderate", bed: "B8" },
  { patient: "Arun Nair",     ward: "Pediatric", allergy: "Eggs",    severity: "moderate", bed: "P5" },
  { patient: "Kavya Menon",   ward: "General-1", allergy: "Gluten",  severity: "severe",   bed: "A3" },
  { patient: "Ravi Prasad",   ward: "ICU-1",     allergy: "Soy",     severity: "mild",     bed: "I2" },
];

const todayMealSchedule = [
  { meal: "Early Morning",  time: "06:00", icon: Droplets, items: "Warm water, herbal tea", count: 32,  done: 32,  color: "blue" },
  { meal: "Breakfast",      time: "08:00", icon: Egg,      items: "Idli, upma, dal, fruit", count: 308, done: 295, color: "amber" },
  { meal: "Mid-Morning",    time: "10:30", icon: Apple,    items: "Fruits, nuts, juice",    count: 180, done: 176, color: "green" },
  { meal: "Lunch",          time: "13:00", icon: Soup,     items: "Rice/roti, dal, sabzi",  count: 308, done: 289, color: "orange" },
  { meal: "Evening Snack",  time: "16:30", icon: Wheat,    items: "Biscuits, tea, fruit",   count: 200, done: 192, color: "purple" },
  { meal: "Dinner",         time: "19:00", icon: Fish,     items: "Chapati, curry, curd",   count: 308, done: 0,   color: "indigo" },
  { meal: "Night Snack",    time: "21:00", icon: Leaf,     items: "Warm milk, light snack", count: 85,  done: 0,   color: "slate" },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const statusConfig: Record<string, { label: string; className: string }> = {
  delivered: { label: "Delivered",  className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  pending:   { label: "Pending",    className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  preparing: { label: "Preparing",  className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  cancelled: { label: "Cancelled",  className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
};

const severityConfig: Record<string, string> = {
  severe:   "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800",
  moderate: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800",
  mild:     "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800",
};

// ─── Stat cards ────────────────────────────────────────────────────────────────

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
            <span className={`text-xs font-medium ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-slate-500"}`}>
              {trendValue}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  </motion.div>
);

// ─── Dashboard content ────────────────────────────────────────────────────────

const DietaryDashboardContent = () => {
  const navigate = useNavigate();
  const [clock, setClock] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  };

  const nowHour = clock.getHours();
  const shift = nowHour < 8 ? "Night" : nowHour < 14 ? "Morning" : nowHour < 20 ? "Afternoon" : "Night";
  const totalMeals = 308;
  const deliveredMeals = 295;
  const compliancePct = Math.round((deliveredMeals / totalMeals) * 100);

  return (
    <div className="space-y-6">

      {/* ── Hero Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-6 text-white"
        style={{ background: "linear-gradient(135deg, #052e16 0%, #166534 40%, #15803d 70%, #16a34a 100%)" }}
      >
        {/* Decorative */}
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/5 rounded-full" />
        <div className="absolute -bottom-16 -right-4 w-80 h-80 bg-white/5 rounded-full" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 shadow-lg">
              <ChefHat className="h-9 w-9 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-white/15 text-white border-white/25 text-[10px] font-semibold">
                  {shift} Shift
                </Badge>
                <Badge className="bg-green-400/20 text-green-200 border-green-400/30 text-[10px] font-semibold">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse" />
                  Live
                </Badge>
              </div>
              <h2 className="text-2xl font-bold">Dietary Services Dashboard</h2>
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
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Mini KPIs */}
        <div className="relative z-10 mt-5 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Utensils,     label: "Total Patients",     value: "308" },
            { icon: CheckCircle2, label: "Meals Delivered",    value: deliveredMeals.toString() },
            { icon: ShieldCheck,  label: "Diet Compliance",    value: `${compliancePct}%` },
            { icon: AlertTriangle,label: "Allergy Alerts",     value: allergyAlerts.length.toString() },
          ].map(({ icon: Ic, label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <Ic className="h-5 w-5 text-green-300 shrink-0" />
              <div>
                <p className="text-white font-bold text-xl leading-none">{value}</p>
                <p className="text-white/50 text-xs mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Allergy Alert Strip ── */}
      {allergyAlerts.filter(a => a.severity === "severe").length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl"
        >
          <div className="w-9 h-9 bg-red-100 dark:bg-red-900 rounded-xl flex items-center justify-center shrink-0 border border-red-200 dark:border-red-700">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700 dark:text-red-300">
              {allergyAlerts.filter(a => a.severity === "severe").length} Severe Allergy Alerts Active
            </p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70 truncate">
              {allergyAlerts.filter(a => a.severity === "severe").map(a => `${a.patient} (${a.allergy})`).join(" • ")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/dietary/patients")}
            className="shrink-0 border-red-200 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
          >
            View All
          </Button>
        </motion.div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Active Diet Orders" value="308" sub="6 wards" trend="up" trendValue="+12 since yesterday" iconBg="bg-green-100 dark:bg-green-950" iconColor="text-green-600 dark:text-green-400" />
        <StatCard icon={CheckCircle2} label="Meals Delivered" value={deliveredMeals} sub={`${compliancePct}% compliance`} trend="up" trendValue="+3% vs last week" iconBg="bg-emerald-100 dark:bg-emerald-950" iconColor="text-emerald-600 dark:text-emerald-400" />
        <StatCard icon={AlertTriangle} label="NPO Patients" value="8" sub="Nil by mouth" trend="neutral" trendValue="Same as yesterday" iconBg="bg-red-100 dark:bg-red-950" iconColor="text-red-600 dark:text-red-400" urgent />
        <StatCard icon={Salad} label="Special Diets" value="158" sub="Therapeutic diets" trend="up" trendValue="+5 new today" iconBg="bg-amber-100 dark:bg-amber-950" iconColor="text-amber-600 dark:text-amber-400" />
      </div>

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Meal Delivery Timeline */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-600" />
                Meal Delivery Timeline
              </CardTitle>
              <Badge variant="outline" className="text-xs">Today</Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Ordered vs delivered across all meal slots</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={mealTimelineData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="ordGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="delGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="ordered" name="Ordered" stroke="#22c55e" strokeWidth={2} fill="url(#ordGrad)" dot={false} />
                <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#3b82f6" strokeWidth={2} fill="url(#delGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Diet Type Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Utensils className="h-4 w-4 text-green-600" />
              Diet Type Breakdown
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">Current inpatient diet distribution</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={dietTypeData} cx="50%" cy="50%" outerRadius={65} innerRadius={38} dataKey="value" paddingAngle={2}>
                  {dietTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {dietTypeData.slice(0, 6).map(({ name, value, color }) => (
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

        {/* Ward Compliance */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Ward-wise Diet Compliance
              </CardTitle>
              <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 text-xs border-0">
                Avg {Math.round(wardComplianceData.reduce((s, w) => s + w.compliance, 0) / wardComplianceData.length)}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={wardComplianceData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="ward" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[80, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} formatter={(v) => [`${v}%`, "Compliance"]} />
                <Bar dataKey="compliance" name="Compliance %" radius={[6, 6, 0, 0]}>
                  {wardComplianceData.map((entry, index) => (
                    <Cell key={index} fill={entry.compliance >= 96 ? "#22c55e" : entry.compliance >= 92 ? "#3b82f6" : "#f59e0b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Weekly Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-600" />
              Weekly Meals & Waste
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">This week's meal output and food waste</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyTrendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="meals" name="Meals Served" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="waste"  name="Waste (portions)" fill="#fca5a5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Today's Meal Schedule ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-green-600" />
              Today's Meal Schedule
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate("/dietary/plans")} className="gap-1 text-xs">
              Full Schedule <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
            {todayMealSchedule.map((slot) => {
              const pct = slot.count > 0 ? Math.round((slot.done / slot.count) * 100) : 0;
              const isNext = slot.done === 0 && slot.count > 0;
              return (
                <div
                  key={slot.meal}
                  className={`relative p-3 rounded-xl border transition-all ${isNext ? "border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-700 ring-1 ring-green-300 dark:ring-green-700" : "border-slate-200 dark:border-slate-700"}`}
                >
                  {isNext && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-green-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                      Next
                    </span>
                  )}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${colorMap[slot.color]}`}>
                    <slot.icon className="h-4.5 w-4.5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{slot.meal}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{slot.time}</p>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-slate-500">{slot.done}/{slot.count}</span>
                      <span className={`font-bold ${pct === 100 ? "text-green-600" : pct > 0 ? "text-blue-600" : "text-slate-400"}`}>
                        {slot.done === 0 && slot.count > 0 ? "—" : `${pct}%`}
                      </span>
                    </div>
                    <div className="h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-green-500" : pct > 0 ? "bg-blue-500" : "bg-slate-200"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1.5 truncate" title={slot.items}>{slot.items}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Bottom Row: Orders + Allergy Alerts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Recent Diet Orders */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-green-600" />
                Recent Diet Orders
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate("/dietary/orders")} className="gap-1 text-xs">
                All Orders <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Order / Patient</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Ward / Bed</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Diet Type</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          {order.priority === "high" && <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                          <div>
                            <p className="font-medium text-slate-800 dark:text-white text-xs">{order.patient}</p>
                            <p className="text-[10px] text-slate-400">{order.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-700 dark:text-slate-300">{order.ward}</p>
                        <p className="text-[10px] text-slate-400">Bed {order.bed}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{order.dietType}</span>
                          {order.allergy && (
                            <Badge className="text-[9px] bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 border-0 w-fit px-1.5 py-0">
                              ⚠ {order.allergy}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] border-0 font-medium ${statusConfig[order.status].className}`}>
                          {statusConfig[order.status].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3" />
                          {order.time}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Allergy Alerts */}
        <Card className="border-red-100 dark:border-red-900/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                <Bell className="h-4 w-4" />
                Allergy Alerts
              </CardTitle>
              <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-0 text-xs">
                {allergyAlerts.length} active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {allergyAlerts.map((alert) => (
              <div
                key={`${alert.patient}-${alert.allergy}`}
                className={`flex items-start gap-3 p-3 rounded-xl border ${severityConfig[alert.severity]}`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{alert.patient}</p>
                  <p className="text-[10px] mt-0.5 opacity-80">{alert.ward} · Bed {alert.bed}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">{alert.severity}</span>
                    <span className="text-[10px] font-semibold">Allergy: {alert.allergy}</span>
                  </div>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 mt-1"
              onClick={() => navigate("/dietary/patients")}
            >
              Manage All Allergy Profiles
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Actions ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-green-600" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {[
              { icon: ClipboardList, label: "New Diet Order",   path: "/dietary/orders",   color: "text-green-600 bg-green-50 dark:bg-green-950 group-hover:bg-green-100 dark:group-hover:bg-green-900" },
              { icon: CalendarDays,  label: "Plan Meal",        path: "/dietary/plans",    color: "text-blue-600 bg-blue-50 dark:bg-blue-950 group-hover:bg-blue-100 dark:group-hover:bg-blue-900" },
              { icon: Users,         label: "Patient Profiles", path: "/dietary/patients", color: "text-amber-600 bg-amber-50 dark:bg-amber-950 group-hover:bg-amber-100 dark:group-hover:bg-amber-900" },
              { icon: AlertTriangle, label: "Allergy Alerts",   path: "/dietary/patients", color: "text-red-600 bg-red-50 dark:bg-red-950 group-hover:bg-red-100 dark:group-hover:bg-red-900" },
              { icon: BarChart3,     label: "View Reports",     path: "/dietary/reports",  color: "text-purple-600 bg-purple-50 dark:bg-purple-950 group-hover:bg-purple-100 dark:group-hover:bg-purple-900" },
            ].map((action) => (
              <button
                key={action.path + action.label}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-green-400 hover:shadow-sm transition-all duration-200 group"
              >
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

// ─── Exported page ────────────────────────────────────────────────────────────

export const DietaryDashboard = () => (
  <DeptStaffLayout
    deptKey="dietary"
    deptName="Dietary Services"
    badgeLabel="DIETARY"
    loginPath="/dietary/login"
    DeptIcon={Utensils}
    navSections={dietaryNav}
    title="Dashboard"
    subtitle="Patient nutrition & meal management"
  >
    <DietaryDashboardContent />
    <DietaryAIAssistant />
  </DeptStaffLayout>
);
