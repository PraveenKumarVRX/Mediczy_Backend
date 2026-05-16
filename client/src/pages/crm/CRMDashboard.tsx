import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Target, Users, DollarSign, TrendingUp, Activity, BarChart3,
  ArrowUpRight, ArrowDownRight, Clock, LogOut, FileText,
  Phone, Mail, Calendar, Briefcase, ChevronRight,
  Home, PieChart, Settings, Zap, ChevronDown, Bell,
  LayoutGrid, ArrowRight, BrainCircuit, IndianRupee, Shield,
  Sparkles, Gauge, Building2, FileSpreadsheet, Plus, Search,
  CheckCircle2, XCircle, AlertTriangle, TrendingDown, UserCheck,
  Rocket, Star, Award, ChevronLeft, Wand2, Package, ArrowDown,
  CheckCheck, Timer, BarChart2, FlameKindling, Globe2,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  leads: { total: string; new_leads: string; contacted: string; qualified: string; converted: string; lost: string; this_week: string; this_month: string };
  deals: { total: string; total_value: string; won_value: string; won_count: string; lost_count: string; active_count: string; avg_probability: string; weighted_pipeline: string };
  activities: { total: string; completed: string; overdue: string; upcoming: string; calls: string; emails: string; meetings: string };
  contacts: { total: string };
}

interface FunnelData {
  rfq: {
    total: string; s1_received: string; s2_quoting: string; s3_quoted: string;
    s4_negotiating: string; s5_won: string; s6_lost: string;
    new_30d: string; won_30d: string; avg_cycle_days: string;
    conversions: { receivedToQuoting: number; quotingToQuoted: number; quotedToNegotiating: number; negotiatingToWon: number; overallWinRate: number };
  };
  leads: { new_leads: string; contacted: string; qualified: string; converted: string; lost: string; new_30d: string };
  deals: { qualification: string; discovery: string; proposal: string; negotiation: string; contract: string; won: string; won_value_30d: string };
  velocity: { avg_deal_days: string; deals_won_7d: string; deals_won_30d: string; revenue_30d: string };
}

interface AutocaptureRFQ {
  id: number; rfq_number: string; insured_name: string; status: string;
  member_count: number; product_type: string; policy_start: string;
  best_quoted_premium: string; premium_paid: string;
}

// ─── Sidebar nav ─────────────────────────────────────────────────────────────

const sidebarNav = [
  { section: 'OVERVIEW', items: [
    { icon: LayoutGrid, label: 'Dashboard', path: '/crm/dashboard' },
  ]},
  { section: 'SALES', items: [
    { icon: Target, label: 'Leads', path: '/crm/leads' },
    { icon: Briefcase, label: 'Deals', path: '/crm/deals' },
    { icon: BarChart3, label: 'Pipeline', path: '/crm/pipeline' },
  ]},
  { section: 'MANAGE', items: [
    { icon: Users, label: 'Contacts', path: '/crm/contacts' },
    { icon: Activity, label: 'Activities', path: '/crm/activities' },
    { icon: Mail, label: 'Email Inbox', path: '/crm/emails' },
  ]},
  { section: 'INSURANCE', items: [
    { icon: FileText, label: 'RFQs', path: '/crm/rfqs' },
  ]},
  { section: 'DISTRIBUTION', items: [
    { icon: UserCheck, label: 'Agents', path: '/crm/agents' },
    { icon: Building2, label: 'Agencies', path: '/crm/agencies' },
    { icon: IndianRupee, label: 'Commissions', path: '/crm/commissions' },
    { icon: Package, label: 'Corp Plans', path: '/crm/corporate-plans' },
  ]},
  { section: 'INSIGHTS', items: [
    { icon: PieChart, label: 'Reports', path: '/crm/reports' },
    { icon: Settings, label: 'Settings', path: '/crm/settings' },
  ]},
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const authHdrs = () => {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const fmt = (v: string | number | undefined) => {
  const n = typeof v === 'number' ? v : parseInt(String(v || '0'));
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('en-IN');
};
const fmtCurr = (v: string | number | undefined) => `₹${fmt(v)}`;
const pct = (a: string | number, b: string | number) => {
  const na = parseInt(String(a || 0)), nb = parseInt(String(b || 1));
  return nb === 0 ? 0 : Math.round((na / nb) * 100);
};

// ─── Component ───────────────────────────────────────────────────────────────

const CRMDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rfqStats, setRfqStats] = useState<any>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [recentRfqs, setRecentRfqs] = useState<any[]>([]);
  const [autocaptureInbox, setAutocaptureInbox] = useState<AutocaptureRFQ[]>([]);
  const [corpPlansStats, setCorpPlansStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [capturingId, setCapturingId] = useState<number | null>(null);
  const [crmUser, setCrmUser] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    if (!token) { navigate('/crm/login'); return; }
    try { const ud = localStorage.getItem('crmUserData'); if (ud) setCrmUser(JSON.parse(ud)); } catch {}
    fetchAll();
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, [navigate]);

  const fetchAll = useCallback(async () => {
    const hdrs = authHdrs();
    const results = await Promise.allSettled([
      api.get('/crm/dashboard/stats', { headers: hdrs }),
      api.get('/crm/rfqs-stats', { headers: hdrs }),
      api.get('/crm/rfqs', { headers: hdrs, params: { page: 1, limit: 6 } }),
      api.get('/crm/funnel-analytics', { headers: hdrs }),
      api.get('/crm/rfqs-autocapture-inbox', { headers: hdrs }),
      api.get('/crm/corporate-plans', { headers: hdrs, params: { limit: 5 } }),
    ]);
    if (results[0].status === 'fulfilled' && results[0].value.data.success) setStats(results[0].value.data.data);
    if (results[1].status === 'fulfilled' && results[1].value.data.success) setRfqStats(results[1].value.data.data);
    if (results[2].status === 'fulfilled' && results[2].value.data.success) setRecentRfqs(results[2].value.data.data);
    if (results[3].status === 'fulfilled' && results[3].value.data.success) setFunnel(results[3].value.data.data);
    if (results[4].status === 'fulfilled' && results[4].value.data.success) setAutocaptureInbox(results[4].value.data.data);
    if (results[5].status === 'fulfilled' && results[5].value.data.success) setCorpPlansStats(results[5].value.data.stats);
    if (results[0].status === 'rejected' && (results[0] as any).reason?.response?.status === 401) navigate('/crm/login');
    setLoading(false);
  }, [navigate]);

  const handleAutocapture = async (rfqId: number, insuredName: string) => {
    setCapturingId(rfqId);
    try {
      const res = await api.post(`/crm/rfqs/${rfqId}/autocapture-plan`, {}, { headers: authHdrs() });
      if (res.data.success) {
        if (res.data.alreadyCaptured) {
          toast.info(`Already captured: ${res.data.message}`);
        } else {
          toast.success(`Plan created: "${res.data.data.display_name}" · Ref: ${res.data.data.contract_ref}`);
          setAutocaptureInbox(prev => prev.filter(r => r.id !== rfqId));
          fetchAll();
        }
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to capture plan');
    } finally {
      setCapturingId(null);
    }
  };

  const handleLogout = async () => {
    try { await api.post('/crm/logout', {}, { headers: authHdrs() }); } catch {}
    localStorage.removeItem('crmToken');
    localStorage.removeItem('crmRefreshToken');
    localStorage.removeItem('crmUserData');
    localStorage.removeItem('userType');
    navigate('/crm/login');
  };

  const l = stats?.leads;
  const d = stats?.deals;
  const a = stats?.activities;
  const f = funnel;

  // ─── Sidebar ────────────────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-5 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20 flex-shrink-0">
            <Target className="h-4.5 w-4.5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <span className="text-sm font-bold text-white block">Mediqzy CRM</span>
              <span className="text-[9px] text-violet-400/60 uppercase tracking-[0.15em]">Sales Hub</span>
            </div>
          )}
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-5 overflow-y-auto">
        {sidebarNav.map(({ section, items }) => (
          <div key={section}>
            {!sidebarCollapsed && (
              <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.18em] px-3 mb-2">{section}</p>
            )}
            <div className="space-y-0.5">
              {items.map(({ icon: Icon, label, path }) => {
                const active = location.pathname === path;
                return (
                  <Link key={path} to={path} onClick={() => setMobileSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200
                      ${active ? 'bg-violet-500/15 text-violet-300 shadow-sm shadow-violet-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'}`}
                    title={sidebarCollapsed ? label : undefined}>
                    <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? 'text-violet-400' : ''}`} />
                    {!sidebarCollapsed && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {crmUser && (
        <div className="p-3 mt-auto">
          <div className={`flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center text-xs font-bold text-violet-300 flex-shrink-0">
              {(crmUser.firstName?.[0] || 'C').toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-300 truncate">{crmUser.firstName} {crmUser.lastName}</p>
                <p className="text-[10px] text-slate-600 truncate">{crmUser.email}</p>
              </div>
            )}
            <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-600 hover:text-red-400 transition-colors flex-shrink-0" title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a]">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-[#0d1120] border-r border-white/[0.06] animate-in slide-in-from-left duration-200">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 bg-[#0d1120]/80 backdrop-blur-xl border-r border-white/[0.06] z-40 transition-all duration-300 ${sidebarCollapsed ? 'w-[72px]' : 'w-[240px]'}`}>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]'}`}>
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-16 bg-[#0a0e1a]/80 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => { if (window.innerWidth < 1024) setMobileSidebarOpen(true); else setSidebarCollapsed(!sidebarCollapsed); }}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Command Center</h1>
              <p className="text-[11px] text-slate-600 -mt-0.5">
                {currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                {' · '}Welcome, {crmUser?.firstName || 'User'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Autocapture alert badge */}
            {autocaptureInbox.length > 0 && (
              <button onClick={() => document.getElementById('autocapture-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/15 transition-colors">
                <Wand2 className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold hidden sm:block">{autocaptureInbox.length} RFQ{autocaptureInbox.length > 1 ? 's' : ''} to Capture</span>
                <span className="w-4 h-4 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">{autocaptureInbox.length}</span>
              </button>
            )}
            <button className="relative p-2.5 rounded-xl hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-colors">
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-violet-500 rounded-full" />
            </button>
            <Button onClick={() => navigate('/crm/rfqs')}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 border-0 rounded-xl h-9 px-4 gap-2 text-xs font-medium shadow-lg shadow-violet-600/20 hidden sm:flex">
              <Plus className="h-3.5 w-3.5" /> New RFQ
            </Button>
          </div>
        </header>

        <main className="p-6 space-y-6 pb-24">

          {/* ── Row 1: Hero KPI Cards ─────────────────────────────────── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                title: 'Total Leads', value: fmt(l?.total), sub: `${fmt(l?.this_week)} this week`,
                icon: Target, gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-500/10', text: 'text-violet-400',
                trend: `+${l?.new_leads || 0} new`, trendUp: true,
              },
              {
                title: 'Active Deals', value: fmt(d?.active_count), sub: fmtCurr(d?.weighted_pipeline) + ' pipeline',
                icon: Briefcase, gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-500/10', text: 'text-blue-400',
                trend: `${d?.won_count || 0} won`, trendUp: true,
              },
              {
                title: 'Revenue Won', value: fmtCurr(d?.won_value), sub: `${fmt(d?.won_count)} deals closed`,
                icon: IndianRupee, gradient: 'from-emerald-500 to-green-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400',
                trend: `${f?.velocity?.deals_won_30d || 0} last 30d`, trendUp: true,
              },
              {
                title: 'RFQs Won', value: rfqStats?.won || 0, sub: `${rfqStats?.total || 0} total in pipeline`,
                icon: FileSpreadsheet, gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10', text: 'text-amber-400',
                trend: `${f?.rfq?.conversions?.overallWinRate || 0}% win rate`, trendUp: (f?.rfq?.conversions?.overallWinRate || 0) > 20,
              },
            ].map(({ title, value, sub, icon: Icon, gradient, bg, text, trend, trendUp }) => (
              <div key={title} className="relative group p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all duration-300 overflow-hidden">
                <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-500`} />
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl ${bg} ring-1 ring-white/[0.05]`}>
                    <Icon className={`h-5 w-5 ${text}`} />
                  </div>
                  <span className={`flex items-center gap-0.5 text-[11px] font-medium ${trendUp ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {trend}
                  </span>
                </div>
                <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
                <p className="text-[11px] text-slate-500 mt-1">{title}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
                <div className={`absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-60 transition-opacity duration-300`} />
              </div>
            ))}
          </div>

          {/* ── Row 2: Velocity Strip ─────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Avg Deal Cycle', value: `${f?.velocity?.avg_deal_days || 0}d`, icon: Timer, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
              { label: 'Deals Won 7d', value: f?.velocity?.deals_won_7d || 0, icon: CheckCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { label: 'Revenue 30d', value: fmtCurr(f?.velocity?.revenue_30d), icon: TrendingUp, color: 'text-violet-400', bg: 'bg-violet-500/10' },
              { label: 'Avg RFQ Cycle', value: `${f?.rfq?.avg_cycle_days || 0}d`, icon: Gauge, color: 'text-amber-400', bg: 'bg-amber-500/10' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${bg} border border-white/[0.04]`}>
                <Icon className={`h-5 w-5 ${color} flex-shrink-0`} />
                <div>
                  <p className={`text-base font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-slate-500">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Row 3: RFQ Funnel (full-width, conversion arrows) ──────── */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Insurance RFQ Conversion Funnel</h3>
                <span className="text-[10px] text-slate-600 ml-1">— stage-by-stage conversion rates</span>
              </div>
              <Link to="/crm/rfqs" className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                All RFQs <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Funnel stages */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[
                { label: 'Received', value: rfqStats?.received || 0, color: 'from-blue-600 to-blue-500', ring: 'ring-blue-500/30', text: 'text-blue-400', sub: 'Inbox' },
                { label: 'Quoting', value: rfqStats?.quoting || 0, color: 'from-amber-600 to-amber-500', ring: 'ring-amber-500/30', text: 'text-amber-400', sub: 'Pricing' },
                { label: 'Quoted', value: rfqStats?.quoted || 0, color: 'from-violet-600 to-violet-500', ring: 'ring-violet-500/30', text: 'text-violet-400', sub: 'Sent' },
                { label: 'Negotiating', value: rfqStats?.negotiating || 0, color: 'from-orange-600 to-orange-500', ring: 'ring-orange-500/30', text: 'text-orange-400', sub: 'In-talks' },
                { label: 'Won', value: rfqStats?.won || 0, color: 'from-emerald-600 to-emerald-500', ring: 'ring-emerald-500/30', text: 'text-emerald-400', sub: 'Closed' },
              ].map(({ label, value, color, ring, text, sub }, i) => {
                const total = parseInt(rfqStats?.total || '1');
                const stagePct = total > 0 ? Math.round((value / total) * 100) : 0;
                const barH = Math.max(stagePct * 1.2, 8);
                return (
                  <div key={label} className="flex flex-col items-center gap-2">
                    {/* Bar */}
                    <div className="w-full flex flex-col items-center justify-end h-24 bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden relative">
                      <div className={`w-full bg-gradient-to-t ${color} transition-all duration-1000 flex items-end justify-center pb-1.5`}
                        style={{ height: `${Math.min(barH, 100)}%` }}>
                        <span className="text-white text-xs font-bold">{value}</span>
                      </div>
                    </div>
                    {/* Label */}
                    <div className="text-center">
                      <p className={`text-xs font-semibold ${text}`}>{label}</p>
                      <p className="text-[9px] text-slate-600">{sub} · {stagePct}%</p>
                    </div>
                    {/* Conversion arrow to next */}
                    {i < 4 && (
                      <div className="absolute" style={{ display: 'none' }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Conversion rate arrows row */}
            <div className="flex items-center gap-2 py-3 px-2 bg-white/[0.02] rounded-xl border border-white/[0.04] mb-4">
              <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider w-20">Conv. Rate</span>
              {[
                { label: 'Recv→Quot', value: f?.rfq?.conversions?.receivedToQuoting || 0, good: 60 },
                { label: 'Quot→Sent', value: f?.rfq?.conversions?.quotingToQuoted || 0, good: 70 },
                { label: 'Sent→Neg', value: f?.rfq?.conversions?.quotedToNegotiating || 0, good: 40 },
                { label: 'Neg→Won', value: f?.rfq?.conversions?.negotiatingToWon || 0, good: 50 },
              ].map(({ label, value, good }) => (
                <div key={label} className="flex-1 flex items-center gap-2">
                  <ArrowRight className="h-3 w-3 text-slate-700 flex-shrink-0" />
                  <div className="flex-1 text-center">
                    <div className={`text-sm font-bold ${value >= good ? 'text-emerald-400' : value > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{value}%</div>
                    <div className="text-[9px] text-slate-600">{label}</div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 border-l border-white/[0.06] pl-3 ml-1">
                <div className="text-center">
                  <div className={`text-sm font-bold ${(f?.rfq?.conversions?.overallWinRate || 0) >= 25 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {f?.rfq?.conversions?.overallWinRate || 0}%
                  </div>
                  <div className="text-[9px] text-slate-600">Overall Win</div>
                </div>
              </div>
            </div>

            {/* Win/Lost/Quoted KPIs */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Quoted Premium', value: fmtCurr(String(rfqStats?.total_quoted_premium || 0)), color: 'text-white' },
                { label: 'Mediqzy 20% Rev', value: fmtCurr(String(Math.round((rfqStats?.total_quoted_premium || 0) * 0.20))), color: 'text-emerald-400' },
                { label: 'RFQs This Week', value: rfqStats?.this_week || 0, color: 'text-violet-400' },
                { label: 'Lost', value: rfqStats?.lost || 0, color: 'text-red-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center py-3 px-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Row 4: Lead Funnel + Deal Pipeline + Corp Plans ────────── */}
          <div className="grid lg:grid-cols-3 gap-5">

            {/* Lead funnel with conv rates */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-white">Lead Funnel</h3>
                </div>
                <Link to="/crm/leads" className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'New', value: f?.leads?.new_leads, color: 'bg-violet-500', text: 'text-violet-400' },
                  { label: 'Contacted', value: f?.leads?.contacted, color: 'bg-blue-500', text: 'text-blue-400' },
                  { label: 'Qualified', value: f?.leads?.qualified, color: 'bg-cyan-500', text: 'text-cyan-400' },
                  { label: 'Converted', value: f?.leads?.converted, color: 'bg-emerald-500', text: 'text-emerald-400' },
                  { label: 'Lost', value: f?.leads?.lost, color: 'bg-red-500/70', text: 'text-red-400' },
                ].map(({ label, value, color, text }, i, arr) => {
                  const total = parseInt(l?.total || '1');
                  const p = total > 0 ? Math.round((parseInt(value || '0') / total) * 100) : 0;
                  // conv rate from previous stage
                  const prevVal = i > 0 ? parseInt(arr[i - 1].value || '1') : parseInt(value || '0');
                  const convFromPrev = prevVal > 0 ? Math.round((parseInt(value || '0') / prevVal) * 100) : 0;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-[11px] mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">{label}</span>
                          {i > 0 && (
                            <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${convFromPrev >= 50 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                              {convFromPrev}%↓
                            </span>
                          )}
                        </div>
                        <span className={`font-bold ${text}`}>{value || 0}</span>
                      </div>
                      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${Math.max(p, 2)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between py-2 px-3 rounded-xl bg-violet-500/5 border border-violet-500/10">
                <span className="text-[11px] text-slate-500">Lead→Deal Rate</span>
                <span className="text-sm font-bold text-violet-400">
                  {pct(f?.leads?.converted || 0, f?.leads?.new_leads || 1)}%
                </span>
              </div>
            </div>

            {/* Deal Pipeline */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">Deal Pipeline</h3>
                </div>
                <Link to="/crm/pipeline" className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1">Pipeline <ArrowRight className="h-3 w-3" /></Link>
              </div>
              <p className="text-3xl font-bold text-white tracking-tight">{fmtCurr(d?.total_value)}</p>
              <p className="text-[11px] text-slate-500 mb-4">Total pipeline value</p>
              <div className="space-y-2 mb-4">
                {[
                  { label: 'Qualification', value: f?.deals?.qualification, color: 'bg-slate-500' },
                  { label: 'Discovery', value: f?.deals?.discovery, color: 'bg-blue-500' },
                  { label: 'Proposal', value: f?.deals?.proposal, color: 'bg-violet-500' },
                  { label: 'Negotiation', value: f?.deals?.negotiation, color: 'bg-orange-500' },
                  { label: 'Contract', value: f?.deals?.contract, color: 'bg-emerald-500' },
                ].map(({ label, value, color }) => {
                  const total = parseInt(d?.total || '1');
                  const v = parseInt(value || '0');
                  const p = total > 0 ? Math.round((v / total) * 100) : 0;
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-500 w-24">{label}</span>
                      <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.max(p, 2)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-300 w-6 text-right">{v}</span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Won', value: d?.won_count, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                  { label: 'Active', value: d?.active_count, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                  { label: 'Lost', value: d?.lost_count, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                ].map(({ label, value, color, bg, border }) => (
                  <div key={label} className={`text-center py-2.5 rounded-xl ${bg} border ${border}`}>
                    <p className={`text-base font-bold ${color}`}>{value || 0}</p>
                    <p className="text-[10px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Corporate Plans snapshot */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-900/20 to-teal-900/10 border border-emerald-500/15">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Corporate Plans</h3>
                </div>
                <Link to="/crm/corporate-plans" className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1">Manage <ArrowRight className="h-3 w-3" /></Link>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { label: 'Total Plans', value: corpPlansStats?.total || 0, color: 'text-white' },
                  { label: 'Active', value: corpPlansStats?.active || 0, color: 'text-emerald-400' },
                  { label: 'Total Lives', value: fmt(corpPlansStats?.totalLives || 0), color: 'text-cyan-400' },
                  { label: 'Annual Value', value: fmtCurr(corpPlansStats?.totalAcv || 0), color: 'text-amber-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="py-3 px-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center">
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                    <p className="text-[10px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              <div className="py-2 px-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
                <p className="text-[10px] text-slate-500 mb-1">Mediqzy Revenue Potential (20%)</p>
                <p className="text-xl font-bold text-emerald-400">
                  {fmtCurr(Math.round((rfqStats?.total_quoted_premium || 0) * 0.20))}
                </p>
                <p className="text-[9px] text-slate-600 mt-0.5">on quoted pipeline</p>
              </div>
              <Link to="/crm/corporate-plans" className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/15 transition-colors">
                <Plus className="h-3.5 w-3.5" /> New Corporate Plan
              </Link>
            </div>
          </div>

          {/* ── Row 5: Autocapture Inbox ──────────────────────────────── */}
          {autocaptureInbox.length > 0 && (
            <div id="autocapture-section" className="p-5 rounded-2xl bg-gradient-to-br from-amber-900/20 to-orange-900/10 border border-amber-500/20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/15">
                    <Wand2 className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">RFQ Autocapture Inbox</h3>
                    <p className="text-[11px] text-amber-400/60">{autocaptureInbox.length} quoted/negotiating RFQs ready to convert into Corporate Plans</p>
                  </div>
                </div>
                <Link to="/crm/rfqs" className="text-[11px] text-amber-400 flex items-center gap-1 hover:text-amber-300">
                  View all RFQs <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="space-y-2">
                {autocaptureInbox.map(rfq => {
                  const estPremium = parseFloat(rfq.best_quoted_premium || rfq.premium_paid || '0') || (rfq.member_count * 18000);
                  const isCapturing = capturingId === rfq.id;
                  return (
                    <div key={rfq.id}
                      className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-amber-500/10 hover:border-amber-500/25 transition-all group">
                      {/* Corp initial */}
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-sm font-bold text-amber-400 flex-shrink-0">
                        {rfq.insured_name?.[0]?.toUpperCase() || '?'}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{rfq.insured_name}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-mono text-violet-400">{rfq.rfq_number}</span>
                          <span className="text-[10px] text-slate-500">{rfq.member_count?.toLocaleString()} lives</span>
                          {rfq.product_type && <span className="text-[10px] text-slate-500">{rfq.product_type}</span>}
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${rfq.status === 'won' ? 'bg-emerald-500/15 text-emerald-400' : rfq.status === 'negotiating' ? 'bg-orange-500/15 text-orange-400' : 'bg-violet-500/15 text-violet-400'}`}>
                            {rfq.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Premium */}
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-bold text-emerald-400">{fmtCurr(String(estPremium))}</p>
                        <p className="text-[9px] text-slate-600">est. premium</p>
                      </div>

                      {/* Auto-generate plan name preview */}
                      <div className="hidden lg:block text-right max-w-[200px]">
                        <p className="text-[10px] text-slate-500 truncate">
                          {rfq.insured_name} – {rfq.product_type || 'Health'} Plan FY{rfq.policy_start ? new Date(rfq.policy_start).getFullYear() : new Date().getFullYear()}
                        </p>
                        <p className="text-[9px] text-amber-400/60">Auto-generated name</p>
                      </div>

                      {/* CTA */}
                      <button
                        disabled={isCapturing}
                        onClick={() => handleAutocapture(rfq.id, rfq.insured_name)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
                        {isCapturing ? (
                          <div className="w-3.5 h-3.5 border border-amber-400/50 border-t-amber-400 rounded-full animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5" />
                        )}
                        {isCapturing ? 'Capturing…' : 'Capture Plan'}
                      </button>

                      <Link to={`/crm/rfqs/${rfq.id}`} className="p-2 rounded-xl hover:bg-white/[0.05] text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0" title="View RFQ">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-600 mt-3 text-center">
                Autocapture reads insured name, product type, member count, and policy dates from each RFQ and creates a uniquely named Corporate Health Plan.
              </p>
            </div>
          )}

          {/* ── Row 6: Recent RFQs ────────────────────────────────────── */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Recent RFQs</h3>
              </div>
              <Link to="/crm/rfqs" className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['RFQ #', 'Corporate / Insured', 'Members', 'Product', 'Status', 'Est. Premium', 'Margin 20%', ''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentRfqs.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-600">No RFQs yet. <Link to="/crm/rfqs" className="text-violet-400 underline">Create one →</Link></td></tr>
                  ) : recentRfqs.map(r => {
                    const statusColors: Record<string, string> = {
                      received: 'bg-blue-500/15 text-blue-400',
                      quoting: 'bg-amber-500/15 text-amber-400',
                      quoted: 'bg-violet-500/15 text-violet-400',
                      negotiating: 'bg-orange-500/15 text-orange-400',
                      won: 'bg-emerald-500/15 text-emerald-400',
                      lost: 'bg-red-500/15 text-red-400',
                    };
                    const estPremium = (r.member_count || 0) * 18000;
                    const estMargin = Math.round(estPremium * 0.20);
                    const canCapture = ['quoted', 'negotiating', 'won'].includes(r.status);
                    return (
                      <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                        <td className="px-3 py-3 text-xs font-mono text-violet-400 cursor-pointer" onClick={() => navigate(`/crm/rfqs/${r.id}`)}>{r.rfq_number}</td>
                        <td className="px-3 py-3 cursor-pointer" onClick={() => navigate(`/crm/rfqs/${r.id}`)}>
                          <p className="text-sm font-medium text-white truncate max-w-[180px]">{r.insured_name}</p>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-300">{(r.member_count || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-xs text-slate-400">{r.product_type || '—'}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${statusColors[r.status] || statusColors.received}`}>
                            {r.status?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-300">{fmtCurr(String(estPremium))}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-emerald-400">{fmtCurr(String(estMargin))}</td>
                        <td className="px-3 py-3">
                          {canCapture && (
                            <button
                              disabled={capturingId === r.id}
                              onClick={() => handleAutocapture(r.id, r.insured_name)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold hover:bg-amber-500/20 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50">
                              <Wand2 className="h-3 w-3" />
                              {capturingId === r.id ? '…' : 'Capture'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Row 7: Activities + Quick Actions ────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Activities */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">Activity Overview</h3>
                </div>
                <Link to="/crm/activities" className="text-[11px] text-amber-400 flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { icon: Phone, label: 'Calls', value: a?.calls, color: 'text-violet-400', bg: 'bg-violet-500/10' },
                  { icon: Mail, label: 'Emails', value: a?.emails, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { icon: Calendar, label: 'Meetings', value: a?.meetings, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                ].map(({ icon: Icon, label, value, color, bg }) => (
                  <div key={label} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl ${bg} border border-white/[0.04]`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                    <p className={`text-lg font-bold ${color}`}>{value || 0}</p>
                    <p className="text-[10px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Completed', value: a?.completed, color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/10' },
                  { label: 'Upcoming', value: a?.upcoming, color: 'text-blue-400', bg: 'bg-blue-500/5 border-blue-500/10' },
                  { label: 'Overdue', value: a?.overdue, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/10' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`flex items-center justify-between py-2 px-3 rounded-xl border ${bg}`}>
                    <span className="text-[11px] text-slate-400">{label}</span>
                    <span className={`text-sm font-bold ${color}`}>{value || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-4 w-4 text-yellow-400" />
                <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: FileSpreadsheet, label: 'New RFQ', sub: 'Start insurance quote', path: '/crm/rfqs', gradient: 'from-violet-500/15 to-purple-500/10', border: 'border-violet-500/20', text: 'text-violet-400' },
                  { icon: Target, label: 'New Lead', sub: 'Add prospect', path: '/crm/leads', gradient: 'from-blue-500/15 to-cyan-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
                  { icon: Briefcase, label: 'New Deal', sub: 'Track opportunity', path: '/crm/deals', gradient: 'from-cyan-500/15 to-teal-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
                  { icon: Package, label: 'Corp Plans', sub: 'Manage health plans', path: '/crm/corporate-plans', gradient: 'from-emerald-500/15 to-green-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
                  { icon: Users, label: 'Contacts', sub: 'View directory', path: '/crm/contacts', gradient: 'from-amber-500/15 to-orange-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
                  { icon: PieChart, label: 'Reports', sub: 'Analytics & insights', path: '/crm/reports', gradient: 'from-pink-500/15 to-rose-500/10', border: 'border-pink-500/20', text: 'text-pink-400' },
                ].map(({ icon: Icon, label, sub, path, gradient, border, text }) => (
                  <Link key={label} to={path}
                    className={`flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br ${gradient} border ${border} hover:scale-[1.02] transition-all duration-200 group`}>
                    <Icon className={`h-5 w-5 ${text} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">{label}</p>
                      <p className="text-[9px] text-slate-500">{sub}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ── Row 8: AI Engine Banner ───────────────────────────────── */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-900/30 via-cyan-900/20 to-emerald-900/20 border border-violet-500/10 p-5">
            <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 rounded-full blur-3xl" />
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20">
                  <BrainCircuit className="h-6 w-6 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">AI Actuarial Quote Engine</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Age-banded risk models + iSHA Insurance LLM · Auto-generates OPD & Wellness pricing with Mediqzy margin tiers · Autocaptures RFQs as named corporate plans
                  </p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <Button onClick={() => navigate('/crm/rfqs')} variant="outline"
                  className="border-violet-500/20 text-violet-300 hover:bg-violet-500/10 rounded-xl h-9 px-4 gap-2 text-xs">
                  <Zap className="h-3.5 w-3.5" /> Generate Quotes
                </Button>
                {autocaptureInbox.length > 0 && (
                  <Button onClick={() => document.getElementById('autocapture-section')?.scrollIntoView({ behavior: 'smooth' })}
                    className="bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 rounded-xl h-9 px-4 gap-2 text-xs">
                    <Wand2 className="h-3.5 w-3.5" /> {autocaptureInbox.length} to Capture
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0d1120]/95 backdrop-blur-xl border-t border-white/[0.06] px-2 py-1.5 z-40">
        <div className="flex justify-around">
          {[
            { icon: LayoutGrid, label: 'Home', path: '/crm/dashboard' },
            { icon: Target, label: 'Leads', path: '/crm/leads' },
            { icon: Briefcase, label: 'Deals', path: '/crm/deals' },
            { icon: FileText, label: 'RFQs', path: '/crm/rfqs' },
            { icon: PieChart, label: 'Reports', path: '/crm/reports' },
          ].map(({ icon: Icon, label, path }) => {
            const active = location.pathname === path;
            return (
              <Link key={path} to={path} className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-colors ${active ? 'text-violet-400' : 'text-slate-600 hover:text-slate-400'}`}>
                <Icon className="h-5 w-5" />
                <span className="text-[9px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default CRMDashboard;
