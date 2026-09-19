/**
 * CEO Dashboard — Hospital Chief Executive Officer
 * Financial command center + strategic intelligence
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadialBarChart, RadialBar,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Bed, Activity,
  Building2, Target, AlertTriangle, CheckCircle2, Download,
  BarChart3, ArrowUpRight, ArrowDownRight, Zap, Shield,
  PieChart as PieIcon, Calendar, Bell, FileText, Star, Award,
  RefreshCw, ChevronRight, Stethoscope, Heart, Briefcase, AlertCircle,
} from 'lucide-react';
import api from '@/utils/api';
import { useHospitalAuth } from '@/hooks/useHospitalAuth';

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16'];

// ─── Seed data (replaced by live API data when available) ────────────────────
const seedRevenueTrend = [
  { month: 'Jun', revenue: 2820, target: 3000, expenses: 1980 },
  { month: 'Jul', revenue: 3140, target: 3000, expenses: 2100 },
  { month: 'Aug', revenue: 2960, target: 3100, expenses: 2040 },
  { month: 'Sep', revenue: 3380, target: 3100, expenses: 2200 },
  { month: 'Oct', revenue: 3620, target: 3200, expenses: 2340 },
  { month: 'Nov', revenue: 3810, target: 3200, expenses: 2450 },
  { month: 'Dec', revenue: 3540, target: 3300, expenses: 2280 },
  { month: 'Jan', revenue: 3920, target: 3300, expenses: 2520 },
  { month: 'Feb', revenue: 4180, target: 3400, expenses: 2610 },
  { month: 'Mar', revenue: 4350, target: 3400, expenses: 2700 },
  { month: 'Apr', revenue: 4520, target: 3500, expenses: 2780 },
  { month: 'May', revenue: 4780, target: 3500, expenses: 2860 },
];

const seedDeptRevenue = [
  { dept: 'Cardiology',    revenue: 920, share: 19.2, growth: 12.4 },
  { dept: 'Orthopaedics',  revenue: 780, share: 16.3, growth: 8.1 },
  { dept: 'Gynaecology',   revenue: 640, share: 13.4, growth: 15.2 },
  { dept: 'Neurology',     revenue: 580, share: 12.1, growth: 6.8 },
  { dept: 'General Surg',  revenue: 510, share: 10.7, growth: 4.2 },
  { dept: 'Oncology',      revenue: 480, share: 10.0, growth: 22.1 },
  { dept: 'Radiology',     revenue: 360, share: 7.5,  growth: 9.3 },
  { dept: 'Others',        revenue: 510, share: 10.7, growth: 5.6 },
];

const seedPayerMix = [
  { name: 'Insurance/TPA', value: 38 },
  { name: 'Corporate',     value: 22 },
  { name: 'Govt Schemes',  value: 18 },
  { name: 'Self Pay',      value: 22 },
];

const seedVolume = [
  { month: 'Jun', opd: 4200, ipd: 680, er: 380 },
  { month: 'Jul', opd: 4580, ipd: 720, er: 410 },
  { month: 'Aug', opd: 4120, ipd: 690, er: 390 },
  { month: 'Sep', opd: 4840, ipd: 760, er: 430 },
  { month: 'Oct', opd: 5010, ipd: 810, er: 460 },
  { month: 'Nov', opd: 5240, ipd: 840, er: 480 },
  { month: 'Dec', opd: 4980, ipd: 800, er: 450 },
  { month: 'Jan', opd: 5380, ipd: 870, er: 500 },
  { month: 'Feb', opd: 5620, ipd: 910, er: 520 },
  { month: 'Mar', opd: 5890, ipd: 940, er: 545 },
  { month: 'Apr', opd: 6120, ipd: 980, er: 570 },
  { month: 'May', opd: 6480, ipd: 1020, er: 590 },
];

const seedInitiatives = [
  { name: 'NABH Level 4 Accreditation', progress: 78, status: 'On Track', due: 'Sep 2026', owner: 'Quality Dept' },
  { name: 'Cath Lab Expansion', progress: 45, status: 'In Progress', due: 'Dec 2026', owner: 'Admin' },
  { name: 'Digital Health Records (ABDM)', progress: 92, status: 'Near Completion', due: 'Jul 2026', owner: 'IT-EDP' },
  { name: 'Oncology Day Care Centre', progress: 30, status: 'Planning', due: 'Mar 2027', owner: 'Admin' },
  { name: 'Insurance Empanelment Drive', progress: 65, status: 'On Track', due: 'Aug 2026', owner: 'Insurance' },
];

const seedAlerts = [
  { type: 'warning', msg: 'Pharmacy inventory: 3 critical drugs below reorder level', time: '1h ago' },
  { type: 'info',    msg: 'Monthly board report due in 5 days', time: '4h ago' },
  { type: 'success', msg: 'Insurance claim settlement: ₹12.4L received from Star Health', time: '6h ago' },
  { type: 'warning', msg: 'ICU bed occupancy at 94% — consider overflow protocol', time: '8h ago' },
  { type: 'info',    msg: 'NABH mock audit scheduled: 2026-06-10', time: '1d ago' },
];

const fmt = (n: number) =>
  n >= 10000000 ? `₹${(n / 10000000).toFixed(1)}Cr`
  : n >= 100000  ? `₹${(n / 100000).toFixed(1)}L`
  : `₹${(n / 1000).toFixed(0)}K`;

// ─── Sub-components ──────────────────────────────────────────────────────────
function KPI({ label, value, sub, icon: Icon, color, up }: {
  label: string; value: string; sub: string; icon: React.ElementType; color: string; up?: boolean;
}) {
  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {up === true  && <ArrowUpRight className="h-3 w-3 text-emerald-500 shrink-0" />}
              {up === false && <ArrowDownRight className="h-3 w-3 text-red-400 shrink-0" />}
              {sub}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 shrink-0 ml-3">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CEODashboard() {
  const navigate = useNavigate();
  const { hospitalData } = useHospitalAuth();
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [revenueTrend, setRevenueTrend] = useState(seedRevenueTrend);
  const [deptRevenue, setDeptRevenue]   = useState(seedDeptRevenue);
  const [payerMix, setPayerMix]         = useState(seedPayerMix);
  const [payerMixIsSample, setPayerMixIsSample] = useState(true);
  // Real revenue must never be compared against the placeholder target (that would show a bogus %).
  const [revenueLive, setRevenueLive] = useState(false);
  const [targetIsReal, setTargetIsReal] = useState(false);
  const [volume, setVolume]             = useState(seedVolume);

  // Live KPI values
  const [kpis, setKpis] = useState({
    monthlyRevenue: 4780,  // ₹L
    revenueTarget:  4200,
    bedOccupancy:   82,
    arpob:          18400, // per bed per day
    alos:           4.2,   // days
    opdToday:       312,
    ipdCensus:      284,
    ebitdaMargin:   38.2,
  });

  useEffect(() => {
    (async () => {
      try {
        const [statsRes, finRes] = await Promise.allSettled([
          api.get('/hospital/dashboard/stats'),
          api.get('/hospital/ceo/financials'),
        ]);
        if (statsRes.status === 'fulfilled') {
          const d = statsRes.value.data;
          setKpis(prev => ({
            ...prev,
            opdToday:  d.todayOPD    ?? prev.opdToday,
            ipdCensus: d.totalPatients ?? prev.ipdCensus,
          }));
        }
        // finRes was previously fetched and discarded (pre-existing dead
        // code). Now applied — but only fields the backend can genuinely
        // compute (monthlyRevenue [Rs lakhs, same unit as seed], alos). revenueTarget/ebitdaMargin/
        // arpob come back null (no expense-ledger table exists yet), so we
        // keep the existing seed/prev values for those rather than show
        // "null%" — and revenueTrend (the 12-month chart) is left as seed
        // data since the real trend has no expenses/target series yet and
        // swapping it would silently drop those two chart lines.
        if (finRes.status === 'fulfilled') {
          const f = finRes.value.data?.data ?? finRes.value.data;
          setKpis(prev => ({
            ...prev,
            monthlyRevenue: f?.monthlyRevenue ?? prev.monthlyRevenue,
            revenueTarget: f?.revenueTarget ?? prev.revenueTarget,
            alos: f?.alos ?? prev.alos,
          }));
          if (f?.monthlyRevenue != null) setRevenueLive(true);
          if (f?.revenueTarget != null) setTargetIsReal(true);
          // payerMix is null from the backend (no reliable payer-category
          // source in the schema) — the pie stays on labelled sample data.
          if (Array.isArray(f?.payerMix) && f.payerMix.length > 0) {
            setPayerMix(f.payerMix);
            setPayerMixIsSample(false);
          }
        }
      } catch { /* use seed data */ }
    })();
  }, [period]);

  const noTarget = revenueLive && !targetIsReal;
  const achievementPct: number | null = noTarget ? null : Math.round((kpis.monthlyRevenue / kpis.revenueTarget) * 100);
  const ebitda = kpis.monthlyRevenue * (kpis.ebitdaMargin / 100);

  return (
    <HospitalLayout title="CEO Dashboard" subtitle="Executive Financial & Strategic Command Centre">
      {/* ── Header Controls ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">CEO Command Centre</h1>
            <p className="text-xs text-muted-foreground">
              {hospitalData?.name || 'Hospital'} · Last updated {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['month', 'quarter', 'year'] as const).map(p => (
            <Button key={p} variant={period === p ? 'default' : 'outline'} size="sm"
              className={period === p ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
              onClick={() => setPeriod(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setLastUpdated(new Date())}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
            <Download className="h-3.5 w-3.5" /> Board Report
          </Button>
        </div>
      </div>

      {/* ── Headline KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KPI label="Monthly Revenue" value={`₹${kpis.monthlyRevenue}L`} sub={achievementPct == null ? 'No revenue target set' : `${achievementPct}% of target`} icon={DollarSign} color="text-emerald-600" up />
        <KPI label="EBITDA" value={`₹${ebitda.toFixed(0)}L`} sub={`${kpis.ebitdaMargin}% margin`} icon={TrendingUp} color="text-indigo-600" up />
        <KPI label="Bed Occupancy" value={`${kpis.bedOccupancy}%`} sub="284 / 346 beds" icon={Bed} color="text-blue-600" up />
        <KPI label="ARPOB/Day" value={`₹${(kpis.arpob/1000).toFixed(1)}K`} sub="+6.2% vs last month" icon={Target} color="text-purple-600" up />
        <KPI label="OPD Today" value={kpis.opdToday.toString()} sub="Avg 298 last 7d" icon={Users} color="text-teal-600" up />
        <KPI label="ALOS" value={`${kpis.alos}d`} sub="Target: 4.0d" icon={Activity} color="text-amber-600" />
      </div>

      <Tabs defaultValue="command" className="space-y-5">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="command">Command</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="volume">Volume & Mix</TabsTrigger>
          <TabsTrigger value="strategy">Strategy</TabsTrigger>
        </TabsList>

        {/* ── Command Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="command" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Revenue vs Target Gauge */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-indigo-500" /> Revenue vs Target
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-4">
                  <div className="relative w-40 h-40">
                    <RadialBarChart
                      width={160} height={160}
                      cx={80} cy={80}
                      innerRadius={50} outerRadius={70}
                      startAngle={180} endAngle={0}
                      data={[{ value: achievementPct ?? 0, fill: (achievementPct ?? 0) >= 100 ? '#22c55e' : '#6366f1' }]}>
                      <RadialBar dataKey="value" background={{ fill: '#f1f5f9' }} cornerRadius={6} />
                    </RadialBarChart>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-indigo-600">{achievementPct == null ? '—' : `${achievementPct}%`}</span>
                      <span className="text-xs text-muted-foreground">{achievementPct == null ? 'no target set' : 'achieved'}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Actual</span><span className="font-semibold text-emerald-600">₹{kpis.monthlyRevenue}L</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Target</span><span className="font-semibold">{noTarget ? '—' : `₹${kpis.revenueTarget}L`}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Gap</span>
                    <span className={`font-semibold ${noTarget ? 'text-muted-foreground' : kpis.monthlyRevenue >= kpis.revenueTarget ? 'text-emerald-600' : 'text-red-500'}`}>
                      {noTarget ? '—' : `${kpis.monthlyRevenue >= kpis.revenueTarget ? '+' : '-'}₹${Math.round(Math.abs(kpis.monthlyRevenue - kpis.revenueTarget) * 100) / 100}L`}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payer Mix */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <PieIcon className="h-4 w-4 text-teal-500" /> Payer Mix
                </CardTitle>
              </CardHeader>
              <CardContent>
                {payerMixIsSample && (
                  <div className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg p-2 mb-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-amber-800 dark:text-amber-200">
                      <strong>Sample data.</strong> Payer-category billing data is not yet captured; these figures are illustrative.
                    </span>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={payerMix} dataKey="value" cx="50%" cy="50%" outerRadius={60} paddingAngle={3}>
                      {payerMix.map((_, i) => <Cell key={i} fill={C[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v}%`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {payerMix.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: C[i] }} />
                      <span className="text-muted-foreground truncate">{p.name}</span>
                      <span className="font-semibold ml-auto">{p.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Alerts */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bell className="h-4 w-4 text-amber-500" /> Executive Alerts
                  <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0">{seedAlerts.filter(a=>a.type==='warning').length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {seedAlerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                    {a.type === 'warning' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />}
                    {a.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />}
                    {a.type === 'info'    && <Bell className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug">{a.msg}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.time}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Revenue Trend (12-month) */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-500" /> Revenue vs Expenses — 12 Month Trend (₹ Lakhs)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={revenueTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number, n: string) => [`₹${v}L`, n.charAt(0).toUpperCase()+n.slice(1)]} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue"  stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2.5} name="Revenue" />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} name="Expenses" />
                  <Line type="monotone" dataKey="target"   stroke="#22c55e" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Target" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Financial Tab ───────────────────────────────────────────────── */}
        <TabsContent value="financial" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Dept Revenue Bar */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Department Revenue Contribution (₹L)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={deptRevenue} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="dept" type="category" tick={{ fontSize: 11 }} width={78} />
                    <Tooltip formatter={(v: number) => [`₹${v}L`, 'Revenue']} />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {deptRevenue.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Dept Revenue Table */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Department P&L Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="pb-2 text-left font-medium">Department</th>
                        <th className="pb-2 text-right font-medium">Revenue</th>
                        <th className="pb-2 text-right font-medium">Share</th>
                        <th className="pb-2 text-right font-medium">Growth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {deptRevenue.map((d, i) => (
                        <tr key={d.dept} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C[i % C.length] }} />
                            {d.dept}
                          </td>
                          <td className="py-2.5 text-right font-semibold">₹{d.revenue}L</td>
                          <td className="py-2.5 text-right text-muted-foreground">{d.share}%</td>
                          <td className="py-2.5 text-right">
                            <span className={`text-xs font-semibold ${d.growth >= 10 ? 'text-emerald-600' : d.growth >= 5 ? 'text-blue-600' : 'text-amber-600'}`}>
                              ▲ {d.growth}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t">
                      <tr>
                        <td className="pt-2.5 font-bold">Total</td>
                        <td className="pt-2.5 text-right font-bold text-indigo-600">₹{deptRevenue.reduce((s,d)=>s+d.revenue,0)}L</td>
                        <td className="pt-2.5 text-right font-bold">100%</td>
                        <td className="pt-2.5 text-right">
                          <span className="text-xs font-bold text-emerald-600">▲ 9.8%</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Financial KPIs Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Gross Revenue (YTD)', value: '₹48.2Cr', sub: '+11.4% vs LY', color: 'text-emerald-600', up: true },
              { label: 'Net Revenue (YTD)',   value: '₹41.6Cr', sub: 'After discounts & write-offs', color: 'text-blue-600', up: true },
              { label: 'Operating Cost',      value: '₹29.4Cr', sub: '70.7% of net revenue', color: 'text-amber-600' },
              { label: 'EBITDA (YTD)',         value: '₹12.2Cr', sub: '29.3% margin', color: 'text-indigo-600', up: true },
            ].map(k => (
              <Card key={k.label} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Volume & Mix Tab ─────────────────────────────────────────────── */}
        <TabsContent value="volume" className="space-y-5">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Patient Volume Trends (12 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={volume} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    {['#6366f1','#22c55e','#f59e0b'].map((c,i) => (
                      <linearGradient key={i} id={`vg${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={c} stopOpacity={0.15}/>
                        <stop offset="95%" stopColor={c} stopOpacity={0}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="opd" stroke="#6366f1" fill="url(#vg0)" strokeWidth={2.5} name="OPD" />
                  <Area type="monotone" dataKey="ipd" stroke="#22c55e" fill="url(#vg1)" strokeWidth={2} name="IPD" />
                  <Area type="monotone" dataKey="er"  stroke="#f59e0b" fill="url(#vg2)" strokeWidth={2} name="Emergency" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'OPD (MTD)',         value: '6,480',  sub: '+8.4% vs last month',  icon: Users,       color: 'text-indigo-600' },
              { label: 'IPD Admissions',    value: '1,020',  sub: '+4.1% vs last month',  icon: Bed,         color: 'text-emerald-600' },
              { label: 'Surgeries (MTD)',   value: '312',    sub: '94% theatre utilisation', icon: Stethoscope, color: 'text-purple-600' },
              { label: 'ER Attendances',    value: '590',    sub: '92% resolved ≤4h',     icon: Heart,       color: 'text-red-500' },
            ].map(k => (
              <Card key={k.label} className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <k.icon className={`h-4 w-4 ${k.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                    <p className="text-xs text-muted-foreground">{k.sub}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Strategy Tab ────────────────────────────────────────────────── */}
        <TabsContent value="strategy" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Strategic Initiatives */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-indigo-500" /> Strategic Initiatives
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  <ChevronRight className="h-3.5 w-3.5" /> All
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {seedInitiatives.map(ini => (
                  <div key={ini.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium leading-tight">{ini.name}</p>
                        <p className="text-xs text-muted-foreground">{ini.owner} · Due {ini.due}</p>
                      </div>
                      <Badge variant="outline" className={
                        ini.status === 'On Track' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' :
                        ini.status === 'Near Completion' ? 'border-blue-300 text-blue-700 bg-blue-50' :
                        ini.status === 'Planning' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                        'border-indigo-300 text-indigo-700 bg-indigo-50'
                      }>{ini.status}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={ini.progress} className="h-1.5 flex-1" />
                      <span className="text-xs font-semibold text-muted-foreground w-8 text-right">{ini.progress}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Accreditation & Compliance */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" /> Accreditation & Compliance Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'NABH Level 4', score: 78, status: 'In Progress', color: 'text-indigo-600' },
                  { label: 'JCI Readiness', score: 62, status: 'Preparation', color: 'text-purple-600' },
                  { label: 'AERB Compliance', score: 95, status: 'Compliant', color: 'text-emerald-600' },
                  { label: 'CDSCO Licensing', score: 100, status: 'Valid', color: 'text-emerald-600' },
                  { label: 'PCB (Biomedical Waste)', score: 88, status: 'Compliant', color: 'text-blue-600' },
                  { label: 'Fire NOC', score: 100, status: 'Valid', color: 'text-emerald-600' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate">{item.label}</span>
                        <span className={`text-xs font-semibold ${item.color}`}>{item.score}%</span>
                      </div>
                      <Progress value={item.score} className="h-1.5" />
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-xs ${
                      item.status === 'Valid' || item.status === 'Compliant' ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'
                    }`}>{item.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Board Report Quick Actions */}
          <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-base">Board & Investor Reports</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Generate board-ready reports, investor decks, and regulatory submissions</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['Monthly Board Pack', 'Financial Summary', 'Ops Review', 'Quality Report'].map(r => (
                    <Button key={r} variant="outline" size="sm" className="gap-1.5 bg-white dark:bg-slate-900">
                      <Download className="h-3.5 w-3.5" /> {r}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </HospitalLayout>
  );
}
