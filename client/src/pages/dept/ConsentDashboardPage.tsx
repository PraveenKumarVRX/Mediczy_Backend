import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { consentNav } from "./DepartmentDashboards";
import { ConsentAIAssistant } from "@/components/consent/ConsentAIAssistant";
import {
  Clock, FileCheck, AlertTriangle, BookOpen, Shield, CheckCircle2,
  TrendingUp, TrendingDown, ArrowRight, BarChart3, ClipboardCheck,
  User, Calendar, RefreshCw, Scale, Sparkles, FilePlus,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── Static mock data ──────────────────────────────────────────────────────────

const signingTrend = [
  { date: "09 May", obtained: 38, pending: 9, refused: 1 },
  { date: "10 May", obtained: 42, pending: 7, refused: 2 },
  { date: "11 May", obtained: 45, pending: 6, refused: 0 },
  { date: "12 May", obtained: 40, pending: 11, refused: 1 },
  { date: "13 May", obtained: 48, pending: 5, refused: 1 },
  { date: "14 May", obtained: 51, pending: 4, refused: 2 },
  { date: "15 May", obtained: 47, pending: 8, refused: 0 },
];

const deptBreakdown = [
  { dept: "Surgery",       consents: 58, pending: 12, refused: 2 },
  { dept: "Cardiology",    consents: 34, pending: 5,  refused: 1 },
  { dept: "Orthopaedics",  consents: 27, pending: 4,  refused: 0 },
  { dept: "OB/GYN",        consents: 22, pending: 3,  refused: 0 },
  { dept: "Oncology",      consents: 18, pending: 6,  refused: 3 },
  { dept: "Neurology",     consents: 15, pending: 2,  refused: 1 },
];

const recentActivity = [
  { id: "C-2041", patient: "Mr. Arjun Sharma",  procedure: "Laparoscopic Cholecystectomy", dept: "Surgery",    status: "signed",   time: "09:14 AM" },
  { id: "C-2040", patient: "Ms. Priya Iyer",    procedure: "Cataract Surgery (R)",          dept: "Ophthalmology", status: "pending", time: "09:02 AM" },
  { id: "C-2039", patient: "Mr. Ramesh Nair",   procedure: "Coronary Angioplasty",          dept: "Cardiology", status: "signed",   time: "08:47 AM" },
  { id: "C-2038", patient: "Ms. Sunita Verma",  procedure: "LSCS (Emergency)",              dept: "OB/GYN",     status: "signed",   time: "08:31 AM" },
  { id: "C-2037", patient: "Mr. Deepak Gupta",  procedure: "Total Knee Replacement",        dept: "Ortho",      status: "expiring", time: "08:15 AM" },
  { id: "C-2036", patient: "Ms. Kavitha Reddy", procedure: "Mastectomy",                    dept: "Oncology",   status: "pending",  time: "Yesterday" },
  { id: "C-2035", patient: "Mr. Suresh Kumar",  procedure: "Lumbar Discectomy",             dept: "Neurosurgery", status: "signed", time: "Yesterday" },
];

const expiringConsents = [
  { id: "C-1987", patient: "Mr. Deepak Gupta",    procedure: "Total Knee Replacement", expiresIn: "4 hrs",  dept: "Ortho" },
  { id: "C-1942", patient: "Ms. Ananya Singh",    procedure: "Hysteroscopy",           expiresIn: "1 day",  dept: "OB/GYN" },
  { id: "C-1918", patient: "Mr. Sunil Patil",     procedure: "TURP",                   expiresIn: "1 day",  dept: "Urology" },
  { id: "C-1876", patient: "Ms. Meera Krishnan",  procedure: "Thyroidectomy",          expiresIn: "2 days", dept: "Surgery" },
];

// ─── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color: string;
  iconBg: string;
}

function StatCard({ icon: Icon, label, value, sub, trend, trendValue, color, iconBg }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            {trend && trendValue && (
              <div className={`flex items-center gap-1 text-xs font-medium ${
                trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-slate-500"
              }`}>
                {trend === "up" ? <TrendingUp className="h-3 w-3" /> : trend === "down" ? <TrendingDown className="h-3 w-3" /> : null}
                {trendValue}
              </div>
            )}
          </div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-sm font-medium text-slate-700 mt-0.5">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    signed:   { label: "Signed",   className: "bg-green-100 text-green-700 border-green-200" },
    pending:  { label: "Pending",  className: "bg-amber-100 text-amber-700 border-amber-200" },
    expiring: { label: "Expiring", className: "bg-red-100 text-red-700 border-red-200" },
    refused:  { label: "Refused",  className: "bg-slate-100 text-slate-600 border-slate-200" },
  };
  const cfg = map[status] || { label: status, className: "bg-slate-100 text-slate-600 border-slate-200" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function ConsentDashboard() {
  const navigate = useNavigate();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => { setRefreshing(false); setLastRefresh(new Date()); }, 900);
  };

  useEffect(() => {
    const t = setInterval(refresh, 120_000);
    return () => clearInterval(t);
  }, []);

  const stats: StatCardProps[] = [
    {
      icon: Clock, label: "Pending Consents", value: "23",
      sub: "Awaiting patient signature",
      trend: "down", trendValue: "↓ 4 from yesterday",
      color: "text-amber-600", iconBg: "bg-amber-100",
    },
    {
      icon: FileCheck, label: "Signed Today", value: "47",
      sub: "Completed by 15:00",
      trend: "up", trendValue: "↑ 12% vs last week",
      color: "text-green-600", iconBg: "bg-green-100",
    },
    {
      icon: AlertTriangle, label: "Expiring Soon", value: "4",
      sub: "Within the next 48 hours",
      trend: "neutral", trendValue: "Action needed",
      color: "text-red-600", iconBg: "bg-red-100",
    },
    {
      icon: BookOpen, label: "Active Templates", value: "18",
      sub: "NABH-compliant forms",
      trend: "up", trendValue: "2 updated this week",
      color: "text-purple-600", iconBg: "bg-purple-100",
    },
  ];

  return (
    <DeptStaffLayout
      deptKey="consent"
      deptName="Consent Management"
      badgeLabel="CONSENT"
      loginPath="/consent/login"
      DeptIcon={ClipboardCheck}
      navSections={consentNav}
      title="Consent Dashboard"
      subtitle="Real-time patient consent tracking and compliance management"
    >
      <div className="space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Consent Overview</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Refreshed at {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="h-9 text-xs gap-1.5 border-slate-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/consent/pending")}
              className="h-9 text-xs gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90"
            >
              <FilePlus className="h-3.5 w-3.5" />
              New Consent
            </Button>
          </div>
        </div>

        {/* NABH compliance banner */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 px-4 py-3"
        >
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Shield className="h-4 w-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-purple-900">NABH Compliance: 94.2%</p>
            <p className="text-xs text-purple-600 truncate">2 consents pending witness signature · 1 template due for annual review</p>
          </div>
          <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] shrink-0">Audit Ready</Badge>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} transition={{ delay: i * 0.06 }}>
              <StatCard {...s} />
            </motion.div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Signing trend */}
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  7-Day Consent Signing Trend
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">Last 7 days</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={signingTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cgObtained" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9333ea" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#9333ea" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cgPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11 }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Area type="monotone" dataKey="obtained" name="Signed" stroke="#9333ea" strokeWidth={2} fill="url(#cgObtained)" />
                  <Area type="monotone" dataKey="pending"  name="Pending" stroke="#f59e0b" strokeWidth={2} fill="url(#cgPending)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Expiring soon */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Expiring Consents
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-3">
              {expiringConsents.map((c) => (
                <div key={c.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-red-50 border border-red-100">
                  <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-red-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 truncate">{c.patient}</p>
                    <p className="text-[10px] text-slate-500 truncate">{c.procedure}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge className="bg-red-100 text-red-700 border-0 text-[9px] px-1.5 py-0">{c.dept}</Badge>
                      <span className="text-[10px] text-red-600 font-medium">Expires in {c.expiresIn}</span>
                    </div>
                  </div>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-[11px] text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                onClick={() => navigate("/consent/pending")}
              >
                View all pending <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Department breakdown + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Department bar chart */}
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-500" />
                Consents by Department
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={deptBreakdown} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="dept" type="category" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="consents" name="Signed" fill="#9333ea" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="pending"  name="Pending" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card className="lg:col-span-3 border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-purple-500" />
                  Recent Activity
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                  onClick={() => navigate("/consent/signed")}
                >
                  View all
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left pb-2 font-semibold text-slate-500 pr-3">ID</th>
                      <th className="text-left pb-2 font-semibold text-slate-500 pr-3">Patient</th>
                      <th className="text-left pb-2 font-semibold text-slate-500 pr-3">Procedure</th>
                      <th className="text-left pb-2 font-semibold text-slate-500 pr-3">Dept</th>
                      <th className="text-left pb-2 font-semibold text-slate-500 pr-3">Status</th>
                      <th className="text-left pb-2 font-semibold text-slate-500">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.map((r, i) => (
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2 pr-3 font-mono text-[10px] text-slate-500">{r.id}</td>
                        <td className="py-2 pr-3 font-medium text-slate-800 whitespace-nowrap">{r.patient}</td>
                        <td className="py-2 pr-3 text-slate-600 max-w-[160px] truncate">{r.procedure}</td>
                        <td className="py-2 pr-3 text-slate-500">{r.dept}</td>
                        <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                        <td className="py-2 text-slate-400 whitespace-nowrap">{r.time}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-5 pt-5">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Clock,         label: "Pending Consents",  sub: "23 awaiting",    path: "/consent/pending",   color: "text-amber-600",  bg: "bg-amber-50 hover:bg-amber-100" },
                { icon: FileCheck,     label: "Signed Archive",    sub: "View history",   path: "/consent/signed",    color: "text-green-600",  bg: "bg-green-50 hover:bg-green-100" },
                { icon: BookOpen,      label: "Templates",         sub: "18 active",      path: "/consent/templates", color: "text-purple-600", bg: "bg-purple-50 hover:bg-purple-100" },
                { icon: BarChart3,     label: "Reports",           sub: "Analytics",      path: "/consent/reports",   color: "text-indigo-600", bg: "bg-indigo-50 hover:bg-indigo-100" },
              ].map(({ icon: Icon, label, sub, path, color, bg }) => (
                <button
                  key={label}
                  onClick={() => navigate(path)}
                  className={`flex flex-col items-start gap-3 rounded-xl p-4 border border-slate-100 transition-all group ${bg}`}
                >
                  <Icon className={`h-5 w-5 ${color}`} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">{label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Compliance summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: CheckCircle2, label: "Consent Rate",     value: "97.8%", sub: "Consents obtained vs required",  color: "text-green-600",  bg: "bg-green-100", detail: "2 refused this month" },
            { icon: Scale,        label: "Legal Validity",   value: "99.1%", sub: "Consents meeting all criteria",  color: "text-purple-600", bg: "bg-purple-100", detail: "3 pending witness sign" },
            { icon: Calendar,     label: "Avg. Turnaround",  value: "18 min", sub: "From request to signed form",   color: "text-blue-600",   bg: "bg-blue-100", detail: "↓ 3 min vs last month" },
          ].map(({ icon: Icon, label, value, sub, color, bg, detail }) => (
            <Card key={label} className="border-0 shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                  <Icon className={`h-6 w-6 ${color}`} />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900">{value}</p>
                  <p className="text-sm font-medium text-slate-700 leading-tight">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
                  <p className={`text-[11px] font-medium mt-1 ${color}`}>{detail}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

      </div>

      <ConsentAIAssistant />
    </DeptStaffLayout>
  );
}

export default ConsentDashboard;
