import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/utils/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import {
  Shield, FileText, Clock, AlertTriangle, CheckCircle2, XCircle,
  CreditCard, Search, Upload, Gavel, ClipboardList, BarChart3,
  Building2, Bell, ArrowRight, RefreshCw, TrendingUp, TrendingDown,
  IndianRupee, Timer, UserRound, Siren, MessageSquare, FilePlus2,
  Stethoscope, LogIn
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', approved: '#22c55e', rejected: '#ef4444',
  query: '#f97316', settled: '#3b82f6', sent: '#8b5cf6',
};
const AGING_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#ef4444'];
const INSURER_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const fmt = (n: number) => n >= 10_00_000 ? `₹${(n / 10_00_000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(0)}K` : `₹${n}`;

const normalizeAgingBuckets = (payload: any) => {
  if (Array.isArray(payload?.agingBuckets)) return payload.agingBuckets;
  if (!payload?.agingReport) return [];

  const labels: Record<string, string> = {
    '<7days': '< 7 days',
    '7-15days': '7-15 days',
    '15-30days': '15-30 days',
    '>30days': '> 30 days',
  };

  return Object.entries(payload.agingReport).map(([bucket, count]) => ({
    bucket: labels[bucket] || bucket,
    count: Number(count) || 0,
    amount: 0,
  }));
};

const normalizeTrendTimeline = (payload: any) => {
  if (Array.isArray(payload?.timeline) && payload.timeline.length > 0) return payload.timeline;
  if (Array.isArray(payload?.trends)) return payload.trends;
  return [];
};

const normalizeTatReport = (payload: any) => {
  if (Array.isArray(payload?.report) && payload.report.length > 0) return payload.report;
  if (Array.isArray(payload?.tatReport?.byInsurer) && payload.tatReport.byInsurer.length > 0) return payload.tatReport.byInsurer;
  return [];
};

const InsurancePortalDashboard = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const base = `/hospital/${slug || localStorage.getItem('hospitalInsuranceSlug') || 'hospital'}/insurance`;
  const [stats, setStats] = useState<any>({ pending: 0, approved: 0, rejected: 0, query: 0, total: 0, totalAmount: 0, approvedAmount: 0, pendingAmount: 0 });
  const [recentClaims, setRecentClaims] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any>({});
  const [agingData, setAgingData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [insurerData, setInsurerData] = useState<any[]>([]);
  const [tatData, setTatData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    setRefreshing(true);
    setDashboardError(null);
    try {
      const [dashRes, agingRes, trendRes, tatRes] = await Promise.allSettled([
        api.get('/hospital/insurance/dashboard'),
        api.get('/hospital/insurance/reports/claims-aging'),
        api.get('/hospital/insurance/reports/query-rejection-trends'),
        api.get('/hospital/insurance/reports/tat'),
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value.data.success) {
        const d = dashRes.value.data.dashboard || {};
        setStats({ pending: 0, approved: 0, rejected: 0, query: 0, total: 0, totalAmount: 0, approvedAmount: 0, pendingAmount: 0, ...(d.stats || {}) });
        setRecentClaims(Array.isArray(d.recentActivity) ? d.recentActivity : []);
        setAlerts({ queriesNeedingResponse: 0, pendingDocuments: 0, expiringSoon: 0, ...(d.alerts || {}) });
        setInsurerData(Array.isArray(d.insurerBreakdown) ? d.insurerBreakdown : []);
      } else {
        setDashboardError('Dashboard data is temporarily unavailable.');
        setStats({ pending: 0, approved: 0, rejected: 0, query: 0, total: 0, totalAmount: 0, approvedAmount: 0, pendingAmount: 0 });
        setRecentClaims([]);
        setAlerts({ queriesNeedingResponse: 0, pendingDocuments: 0, expiringSoon: 0 });
        setInsurerData([]);
      }
      setAgingData(agingRes.status === 'fulfilled' && agingRes.value.data.success ? normalizeAgingBuckets(agingRes.value.data) : []);
      setTrendData(trendRes.status === 'fulfilled' && trendRes.value.data.success ? normalizeTrendTimeline(trendRes.value.data) : []);
      setTatData(tatRes.status === 'fulfilled' && tatRes.value.data.success ? normalizeTatReport(tatRes.value.data) : []);
    } catch (err) {
      console.warn('Dashboard fetch error', err);
      setDashboardError('Dashboard data is temporarily unavailable.');
      setStats({ pending: 0, approved: 0, rejected: 0, query: 0, total: 0, totalAmount: 0, approvedAmount: 0, pendingAmount: 0 });
      setRecentClaims([]);
      setAlerts({ queriesNeedingResponse: 0, pendingDocuments: 0, expiringSoon: 0 });
      setAgingData([]);
      setTrendData([]);
      setInsurerData([]);
      setTatData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const displayAging = agingData;
  const displayTrend = trendData;
  const displayInsurer = insurerData;
  const displayTat = tatData;

  const statusPieData = [
    { name: 'Pending', value: stats.pending || 0 },
    { name: 'Approved', value: stats.approved || 0 },
    { name: 'Rejected', value: stats.rejected || 0 },
    { name: 'Query', value: stats.query || 0 },
  ];
  const hasStatusData = statusPieData.some((item) => item.value > 0);

  const kpiCards = [
    { label: 'Total Claims', value: loading ? '—' : (stats.total || 0), icon: FileText, color: 'bg-indigo-500', trend: 'Live count', up: true, href: `${base}/claims` },
    { label: 'Pending', value: loading ? '—' : (stats.pending || 0), icon: Clock, color: 'bg-amber-500', trend: 'SLA risk', up: false, href: `${base}/claims?status=pending` },
    { label: 'Approved', value: loading ? '—' : (stats.approved || 0), icon: CheckCircle2, color: 'bg-emerald-500', trend: 'Live count', up: true, href: `${base}/claims?status=approved` },
    { label: 'Queries', value: loading ? '—' : (stats.query || 0), icon: MessageSquare, color: 'bg-orange-500', trend: 'Respond now', up: false, href: `${base}/tasks` },
    { label: 'Rejected', value: loading ? '—' : (stats.rejected || 0), icon: XCircle, color: 'bg-red-500', trend: 'Live count', up: false, href: `${base}/denials` },
    { label: 'Billed', value: loading ? '—' : fmt(stats.totalAmount || 0), icon: IndianRupee, color: 'bg-blue-500', trend: 'This month', up: true, href: `${base}/reconciliation` },
    { label: 'Approved Amt', value: loading ? '—' : fmt(stats.approvedAmount || 0), icon: TrendingUp, color: 'bg-teal-500', trend: 'Live amount', up: true, href: `${base}/reconciliation` },
    { label: 'Outstanding', value: loading ? '—' : fmt(stats.pendingAmount ?? Math.max(0, (stats.totalAmount || 0) - (stats.approvedAmount || 0))), icon: Timer, color: 'bg-violet-500', trend: 'Pending recv.', up: false, href: `${base}/reconciliation` },
  ];

  const quickActions = [
    { label: 'New Pre-Auth', icon: Shield, href: `${base}/pre-auth/new`, bg: 'bg-indigo-50 dark:bg-indigo-900/30', color: 'text-indigo-600 dark:text-indigo-400' },
    { label: 'New Admission', icon: LogIn, href: `${base}/admission`, bg: 'bg-blue-50 dark:bg-blue-900/30', color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Discharge', icon: UserRound, href: `${base}/discharge`, bg: 'bg-teal-50 dark:bg-teal-900/30', color: 'text-teal-600 dark:text-teal-400' },
    { label: 'Claims Queue', icon: FileText, href: `${base}/claims`, bg: 'bg-emerald-50 dark:bg-emerald-900/30', color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Query Reply', icon: MessageSquare, href: `${base}/messages`, bg: 'bg-orange-50 dark:bg-orange-900/30', color: 'text-orange-600 dark:text-orange-400' },
    { label: 'Escalations', icon: Siren, href: `${base}/sla`, bg: 'bg-red-50 dark:bg-red-900/30', color: 'text-red-600 dark:text-red-400' },
    { label: 'Upload Docs', icon: Upload, href: `${base}/bulk-upload`, bg: 'bg-amber-50 dark:bg-amber-900/30', color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Denials', icon: Gavel, href: `${base}/denials`, bg: 'bg-pink-50 dark:bg-pink-900/30', color: 'text-pink-600 dark:text-pink-400' },
    { label: 'Reconcile', icon: CreditCard, href: `${base}/reconciliation`, bg: 'bg-cyan-50 dark:bg-cyan-900/30', color: 'text-cyan-600 dark:text-cyan-400' },
    { label: 'Reports', icon: BarChart3, href: `${base}/reports`, bg: 'bg-violet-50 dark:bg-violet-900/30', color: 'text-violet-600 dark:text-violet-400' },
    { label: 'Tariff Mgmt', icon: FilePlus2, href: `${base}/tariff`, bg: 'bg-slate-100 dark:bg-slate-800', color: 'text-slate-600 dark:text-slate-400' },
    { label: 'Govt Schemes', icon: Stethoscope, href: `${base}/govt-schemes`, bg: 'bg-lime-50 dark:bg-lime-900/30', color: 'text-lime-600 dark:text-lime-400' },
  ];

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      query: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
      settled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  const hasActionAlerts = alerts.queriesNeedingResponse > 0 || alerts.pendingDocuments > 0 || alerts.expiringSoon > 0;

  return (
    <InsurancePortalLayout title="Dashboard" subtitle="Hospital Insurance Claims Management Portal">
      <div className="space-y-5">

        {/* Hero banner */}
        <div
          className="relative rounded-2xl overflow-hidden p-6"
          style={{ background: 'linear-gradient(130deg, #0b0f1e 0%, #1e1b4b 50%, #1e3a5f 100%)' }}
        >
          {/* ambient orb */}
          <div className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 65%)', transform: 'translate(30%, -30%)' }} />
          <div className="absolute bottom-0 left-1/3 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 65%)' }} />
          <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(165,180,252,0.6)' }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h2 className="text-2xl font-bold text-white leading-tight">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}</h2>
              <p className="text-[13px] mt-1" style={{ color: 'rgba(148,163,184,0.8)' }}>Live insurance claims overview for today</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px] font-medium" style={{ color: 'rgba(165,180,252,0.6)' }}>Total Billed</p>
                <p className="text-2xl font-bold text-white">{fmt(stats.totalAmount || 0)}</p>
              </div>
              <div className="w-px h-12" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <div className="text-right">
                <p className="text-[11px] font-medium" style={{ color: 'rgba(165,180,252,0.6)' }}>Approved</p>
                <p className="text-2xl font-bold" style={{ color: '#86efac' }}>{fmt(stats.approvedAmount || 0)}</p>
              </div>
              <div className="w-px h-12" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <Button
                variant="outline"
                size="sm"
                onClick={fetchDashboard}
                disabled={refreshing}
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 h-8 text-xs font-medium"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {dashboardError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            {dashboardError}
          </div>
        )}

        {/* Action alerts */}
        {hasActionAlerts && (
          <div
            className="rounded-xl p-4"
            style={{ background: 'rgba(239,68,68,0.04)', border: '1.5px solid rgba(239,68,68,0.15)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <Siren className="h-3.5 w-3.5 text-red-500" />
              </div>
              <span className="font-bold text-red-700 text-sm">Urgent Action Required</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {alerts.queriesNeedingResponse > 0 && (
                <button onClick={() => navigate(`${base}/tasks`)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                  <MessageSquare className="h-3 w-3" />
                  {alerts.queriesNeedingResponse} queries need reply
                </button>
              )}
              {alerts.pendingDocuments > 0 && (
                <button onClick={() => navigate(`${base}/claims`)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}>
                  <Upload className="h-3 w-3" />
                  {alerts.pendingDocuments} claims missing docs
                </button>
              )}
              {alerts.expiringSoon > 0 && (
                <button onClick={() => navigate(`${base}/pre-auth?status=approved`)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
                  style={{ background: 'rgba(249,115,22,0.1)', color: '#ea580c' }}>
                  <Clock className="h-3 w-3" />
                  {alerts.expiringSoon} pre-auths expiring soon
                </button>
              )}
            </div>
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.label}
                onClick={() => navigate(card.href)}
                className="bg-card border border-border shadow-sm hover:shadow-lg rounded-xl p-4 text-left transition-all duration-200 group hover:-translate-y-0.5"
              >
                <div className={`${card.color} w-8 h-8 rounded-lg flex items-center justify-center mb-3`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <p className="text-xl font-bold tabular-nums text-foreground">{card.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium leading-tight mt-0.5">{card.label}</p>
                <div className={`flex items-center gap-0.5 mt-2 text-[10px] font-semibold ${card.up ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {card.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {card.trend}
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="bg-card border border-border shadow-sm rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold text-foreground tracking-tight">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => navigate(action.href)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl ${action.bg} transition-all duration-150 group/qa hover:scale-105 active:scale-95`}
                >
                  <Icon className={`h-5 w-5 ${action.color}`} />
                  <span className="text-[10px] font-semibold text-center leading-tight text-muted-foreground">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Charts Row 1: Trend + Status Pie */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border shadow-sm rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <BarChart3 className="h-4 w-4 text-indigo-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">Claims Trend — Last 6 Months</h3>
            </div>
            {displayTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={displayTrend} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', fontSize: 12 }}
                  formatter={(v, name) => [v, String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="submitted" name="Submitted" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" name="Rejected" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">No trend data yet</div>
            )}
          </div>

          <div className="bg-card border border-border shadow-sm rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <Shield className="h-4 w-4 text-indigo-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">Status Breakdown</h3>
            </div>
            {hasStatusData ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusPieData} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value">
                  {statusPieData.map((entry, index) => (
                    <Cell key={index} fill={Object.values(STATUS_COLORS)[index]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', fontSize: 12 }}
                  formatter={(v) => [`${v} claims`]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">No claim status data yet</div>
            )}
          </div>
        </div>

        {/* Charts Row 2: Aging + Insurer + TAT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Aging buckets */}
          <div className="bg-card border border-border shadow-sm rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)' }}>
                <Timer className="h-4 w-4 text-amber-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">Claim Aging — ₹ Outstanding</h3>
            </div>
            <div className="space-y-3.5">
              {displayAging.length > 0 ? displayAging.map((row, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold text-foreground">{row.bucket}</span>
                    <span className="font-bold tabular-nums text-foreground">{fmt(row.amount || 0)} <span className="font-normal text-muted-foreground">({row.count})</span></span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ background: 'rgba(0,0,0,0.05)' }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, ((row.count) / (displayAging.reduce((a, r) => a + r.count, 0) || 1)) * 100)}%`,
                        background: AGING_COLORS[i],
                      }}
                    />
                  </div>
                </div>
              )) : <div className="flex h-28 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">No aging data yet</div>}
            </div>
            <button onClick={() => navigate(`${base}/reports`)}
              className="mt-5 text-xs font-semibold flex items-center gap-1 transition-colors hover:gap-2"
              style={{ color: '#6366f1' }}>
              Full aging report <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {/* Insurer breakdown pie */}
          <div className="bg-card border border-border shadow-sm rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">Claims by Insurer</h3>
            </div>
            {displayInsurer.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={displayInsurer} cx="50%" cy="50%" outerRadius={75} dataKey="value">
                  {displayInsurer.map((_, i) => (
                    <Cell key={i} fill={INSURER_COLORS[i % INSURER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }}
                  formatter={(v) => [`${v}%`]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">No insurer split yet</div>
            )}
          </div>

          {/* TAT by insurer */}
          <div className="bg-card border border-border shadow-sm rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                <Clock className="h-4 w-4 text-violet-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">Avg TAT by Insurer (hrs)</h3>
            </div>
            <div className="space-y-3">
              {displayTat.length > 0 ? displayTat.map((row, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="text-xs w-28 truncate font-medium text-foreground">{row.insurer}</span>
                  <div className="flex-1 rounded-full h-2" style={{ background: 'rgba(0,0,0,0.05)' }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (row.avgHrs / 12) * 100)}%`,
                        background: row.avgHrs > 6 ? '#f43f5e' : row.avgHrs > 4 ? '#f59e0b' : '#10b981',
                      }}
                    />
                  </div>
                  <span className={`text-xs font-bold w-10 text-right ${row.avgHrs > 6 ? 'text-red-600' : row.avgHrs > 4 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {row.avgHrs}h
                  </span>
                </div>
              )) : <div className="flex h-28 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">No TAT data yet</div>}
            </div>
            <button onClick={() => navigate(`${base}/sla`)}
              className="mt-4 text-xs font-semibold flex items-center gap-1 hover:gap-2 transition-all"
              style={{ color: '#8b5cf6' }}>
              SLA dashboard <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Recent Claims */}
        <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <FileText className="h-4 w-4 text-indigo-600" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground">Recent Claims</h3>
            </div>
            <button
              onClick={() => navigate(`${base}/claims`)}
              className="flex items-center gap-1 text-xs font-semibold transition-colors hover:gap-2"
              style={{ color: '#6366f1' }}
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {recentClaims.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-left py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Claim #</th>
                    <th className="text-left py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Patient</th>
                    <th className="text-left py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Insurer</th>
                    <th className="text-right py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Billed</th>
                    <th className="text-right py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Approved</th>
                    <th className="text-left py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClaims.map((claim: any) => (
                    <tr
                      key={claim.id}
                      className="cursor-pointer transition-colors hover:bg-muted/40 group/row"
                      onClick={() => navigate(`${base}/claims`)}
                      style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}
                    >
                      <td className="py-3 px-5 font-mono text-xs font-semibold" style={{ color: '#6366f1' }}>{claim.claimNumber || claim.id}</td>
                      <td className="py-3 px-5 text-xs font-medium text-foreground">{claim.patientName || '—'}</td>
                      <td className="py-3 px-5 text-xs text-muted-foreground">{claim.insurer || '—'}</td>
                      <td className="py-3 px-5 text-xs text-right font-mono font-semibold text-foreground">₹{(claim.claimAmount || 0).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-5 text-xs text-right font-mono font-semibold text-emerald-600">
                        {claim.approvedAmount ? `₹${claim.approvedAmount.toLocaleString('en-IN')}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-5">
                        <span
                          className="inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-full"
                          style={{
                            background: getStatusBadge(claim.status).includes('green') ? 'rgba(16,185,129,0.1)' :
                                        getStatusBadge(claim.status).includes('red') ? 'rgba(239,68,68,0.1)' :
                                        getStatusBadge(claim.status).includes('amber') ? 'rgba(245,158,11,0.1)' :
                                        getStatusBadge(claim.status).includes('blue') ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.05)',
                            color: getStatusBadge(claim.status).includes('green') ? '#059669' :
                                   getStatusBadge(claim.status).includes('red') ? '#dc2626' :
                                   getStatusBadge(claim.status).includes('amber') ? '#d97706' :
                                   getStatusBadge(claim.status).includes('blue') ? '#2563eb' : '#64748b',
                          }}
                        >
                          {claim.status}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-xs text-muted-foreground">
                        {new Date(claim.submittedAt || claim.createdAt || Date.now()).toLocaleDateString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-14">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.06)' }}>
                <FileText className="h-6 w-6 text-indigo-300" />
              </div>
              <p className="font-semibold text-foreground mb-1">No recent claims</p>
              <p className="text-sm text-muted-foreground mb-4">Start by adding new admissions or pre-auth requests</p>
              <Button variant="outline" size="sm" onClick={() => navigate(`${base}/claims`)} className="text-xs rounded-lg">
                Go to Claims Queue
              </Button>
            </div>
          )}
        </div>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsurancePortalDashboard;
