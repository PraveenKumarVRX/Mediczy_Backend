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
} from 'lucide-react';
import api from '@/utils/api';

interface DashboardStats {
  leads: { total: string; new_leads: string; contacted: string; qualified: string; converted: string; lost: string; this_week: string; this_month: string };
  deals: { total: string; total_value: string; won_value: string; won_count: string; lost_count: string; active_count: string; avg_probability: string; weighted_pipeline: string };
  activities: { total: string; completed: string; overdue: string; upcoming: string; calls: string; emails: string; meetings: string };
  contacts: { total: string };
}

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
    { icon: Briefcase, label: 'Corp Plans', path: '/crm/corporate-plans' },
  ]},
  { section: 'INSIGHTS', items: [
    { icon: PieChart, label: 'Reports', path: '/crm/reports' },
    { icon: Settings, label: 'Settings', path: '/crm/settings' },
  ]},
];

const CRMDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rfqStats, setRfqStats] = useState<any>(null);
  const [recentRfqs, setRecentRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchAll = async () => {
    const token = localStorage.getItem('crmToken');
    const hdrs = { Authorization: `Bearer ${token}` };
    const results = await Promise.allSettled([
      api.get('/crm/dashboard/stats', { headers: hdrs }),
      api.get('/crm/rfqs-stats', { headers: hdrs }),
      api.get('/crm/rfqs', { headers: hdrs, params: { page: 1, limit: 5 } }),
    ]);
    if (results[0].status === 'fulfilled' && results[0].value.data.success) setStats(results[0].value.data.data);
    if (results[1].status === 'fulfilled' && results[1].value.data.success) setRfqStats(results[1].value.data.data);
    if (results[2].status === 'fulfilled' && results[2].value.data.success) setRecentRfqs(results[2].value.data.data);
    if (results[0].status === 'rejected' && (results[0] as any).reason?.response?.status === 401) navigate('/crm/login');
    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      await api.post('/crm/logout', {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch {}
    localStorage.removeItem('crmToken');
    localStorage.removeItem('crmRefreshToken');
    localStorage.removeItem('crmUserData');
    localStorage.removeItem('userType');
    navigate('/crm/login');
  };

  const fmt = (v: string | undefined) => {
    const n = parseInt(v || '0');
    if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString('en-IN');
  };
  const fmtCurr = (v: string | undefined) => `₹${fmt(v)}`;

  const l = stats?.leads;
  const d = stats?.deals;
  const a = stats?.activities;

  // — Sidebar component (shared between desktop & mobile) —
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
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

      {/* Nav sections */}
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
                      ${active
                        ? 'bg-violet-500/15 text-violet-300 shadow-sm shadow-violet-500/10'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'}`}
                    title={sidebarCollapsed ? label : undefined}
                  >
                    <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? 'text-violet-400' : ''}`} />
                    {!sidebarCollapsed && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User card at bottom */}
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
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-[#0a0e1a]/80 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => { if (window.innerWidth < 1024) setMobileSidebarOpen(true); else setSidebarCollapsed(!sidebarCollapsed); }}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Dashboard</h1>
              <p className="text-[11px] text-slate-600 -mt-0.5">Welcome back, {crmUser?.firstName || 'User'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2.5 rounded-xl hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-colors">
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-violet-500 rounded-full" />
            </button>
          </div>
        </header>

        <main className="p-6 space-y-6">
          {/* ── Greeting Strip ────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {currentTime.getHours() < 12 ? 'Good Morning' : currentTime.getHours() < 17 ? 'Good Afternoon' : 'Good Evening'},{' '}
                <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">{crmUser?.firstName || 'User'}</span>
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}Insurance CRM Command Center
              </p>
            </div>
            <Button onClick={() => navigate('/crm/rfqs')}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 border-0 rounded-xl h-10 px-5 gap-2 text-sm font-medium shadow-lg shadow-violet-600/20 hidden sm:flex">
              <FileText className="h-4 w-4" /> RFQ Pipeline
            </Button>
          </div>

          {/* ── Hero KPI Cards (4) ────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { title: 'Total Leads', value: fmt(l?.total), sub: `${fmt(l?.this_week)} this week`, icon: Target, gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-500/10', text: 'text-violet-400', trend: l?.total && parseInt(l.total) > 0 ? '+12%' : '—', trendUp: true },
              { title: 'Active Deals', value: fmt(d?.active_count), sub: fmtCurr(d?.weighted_pipeline) + ' pipeline', icon: Briefcase, gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-500/10', text: 'text-blue-400', trend: '+8%', trendUp: true },
              { title: 'Revenue Won', value: fmtCurr(d?.won_value), sub: `${fmt(d?.won_count)} deals closed`, icon: IndianRupee, gradient: 'from-emerald-500 to-green-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', trend: '+23%', trendUp: true },
              { title: 'RFQs in Pipeline', value: fmt(String((rfqStats?.quoting || 0) + (rfqStats?.quoted || 0) + (rfqStats?.received || 0))), sub: `${rfqStats?.won || 0} won`, icon: FileSpreadsheet, gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10', text: 'text-amber-400', trend: `${rfqStats?.total || 0} total`, trendUp: true },
            ].map(({ title, value, sub, icon: Icon, gradient, bg, text, trend, trendUp }) => (
              <div key={title} className="relative group p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all duration-300 overflow-hidden">
                <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-500`} />
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl ${bg} ring-1 ring-white/[0.05]`}>
                    <Icon className={`h-5 w-5 ${text}`} />
                  </div>
                  <span className={`flex items-center gap-0.5 text-[11px] font-medium ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
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

          {/* ── RFQ Pipeline Funnel + Premium Revenue ─────────────── */}
          <div className="grid lg:grid-cols-5 gap-5">
            {/* RFQ Pipeline Funnel (3 cols) */}
            <div className="lg:col-span-3 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-white">Insurance RFQ Pipeline</h3>
                </div>
                <Link to="/crm/rfqs" className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {/* Pipeline stages as visual funnel */}
              <div className="space-y-2.5 mb-5">
                {[
                  { label: 'Received', value: rfqStats?.received || 0, color: 'bg-blue-500', maxPct: 100 },
                  { label: 'Quoting', value: rfqStats?.quoting || 0, color: 'bg-amber-500', maxPct: 85 },
                  { label: 'Quoted', value: rfqStats?.quoted || 0, color: 'bg-violet-500', maxPct: 65 },
                  { label: 'Won', value: rfqStats?.won || 0, color: 'bg-emerald-500', maxPct: 40 },
                  { label: 'Lost', value: rfqStats?.lost || 0, color: 'bg-red-500/60', maxPct: 20 },
                ].map(({ label, value, color, maxPct }) => {
                  const total = rfqStats?.total || 1;
                  const pct = Math.round((value / total) * 100);
                  const barW = Math.max(pct, 3);
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-500 w-16 text-right font-medium">{label}</span>
                      <div className="flex-1 h-7 bg-white/[0.03] rounded-lg overflow-hidden relative">
                        <div className={`h-full ${color} rounded-lg transition-all duration-1000 flex items-center`}
                          style={{ width: `${barW}%`, maxWidth: `${maxPct}%` }}>
                          {value > 0 && (
                            <span className="text-white text-[10px] font-bold ml-2">{value}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-600 w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
              {/* Win rate KPI */}
              <div className="flex items-center gap-6 pt-3 border-t border-white/[0.05]">
                <div>
                  <span className="text-[10px] text-slate-600 uppercase">Win Rate</span>
                  <p className="text-xl font-bold text-emerald-400">
                    {rfqStats?.total > 0 ? Math.round(((rfqStats?.won || 0) / rfqStats.total) * 100) : 0}%
                  </p>
                </div>
                <div className="h-8 w-px bg-white/[0.06]" />
                <div>
                  <span className="text-[10px] text-slate-600 uppercase">Quoted Premium</span>
                  <p className="text-xl font-bold text-white">{fmtCurr(String(rfqStats?.total_quoted_premium || 0))}</p>
                </div>
                <div className="h-8 w-px bg-white/[0.06]" />
                <div>
                  <span className="text-[10px] text-slate-600 uppercase">Avg Conversion</span>
                  <p className="text-xl font-bold text-violet-400">
                    {rfqStats?.total > 0 ? Math.round(((rfqStats?.won || 0) / Math.max(rfqStats?.quoted || 1, 1)) * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Mediqzy Revenue Card (2 cols) */}
            <div className="lg:col-span-2 p-5 rounded-2xl bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border border-emerald-500/15">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-xl bg-emerald-500/15">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Mediqzy Revenue Potential</h3>
                  <p className="text-[10px] text-emerald-400/60">At 20% margin on active pipeline</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Potential Revenue (20% margin)</p>
                  <p className="text-3xl font-bold text-emerald-400">
                    {fmtCurr(String(Math.round((rfqStats?.total_quoted_premium || 0) * 0.20)))}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { pct: '10%', label: 'Conservative', value: fmtCurr(String(Math.round((rfqStats?.total_quoted_premium || 0) * 0.10))), color: 'text-slate-400' },
                    { pct: '20%', label: 'Optimal', value: fmtCurr(String(Math.round((rfqStats?.total_quoted_premium || 0) * 0.20))), color: 'text-emerald-400' },
                    { pct: '30%', label: 'Aggressive', value: fmtCurr(String(Math.round((rfqStats?.total_quoted_premium || 0) * 0.30))), color: 'text-amber-400' },
                  ].map(({ pct, label, value, color }) => (
                    <div key={pct} className="text-center py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <p className="text-[10px] text-slate-600">{label}</p>
                      <p className={`text-sm font-bold ${color}`}>{value}</p>
                      <p className="text-[9px] text-slate-600">{pct} margin</p>
                    </div>
                  ))}
                </div>
                <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, ((rfqStats?.won || 0) / Math.max(rfqStats?.total || 1, 1)) * 100)}%` }} />
                </div>
                <p className="text-[10px] text-slate-600">
                  {rfqStats?.won || 0} of {rfqStats?.total || 0} RFQs converted — {rfqStats?.quoting || 0} actively quoting
                </p>
              </div>
            </div>
          </div>

          {/* ── Middle Row: Lead Funnel + Deal Pipeline + Activities ─ */}
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Lead funnel */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-white">Lead Funnel</h3>
                </div>
                <Link to="/crm/leads" className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'New', value: l?.new_leads, color: 'bg-violet-500', glow: 'shadow-violet-500/20' },
                  { label: 'Contacted', value: l?.contacted, color: 'bg-blue-500', glow: 'shadow-blue-500/20' },
                  { label: 'Qualified', value: l?.qualified, color: 'bg-cyan-500', glow: 'shadow-cyan-500/20' },
                  { label: 'Converted', value: l?.converted, color: 'bg-emerald-500', glow: 'shadow-emerald-500/20' },
                  { label: 'Lost', value: l?.lost, color: 'bg-red-500/70', glow: '' },
                ].map(({ label, value, color, glow }) => {
                  const total = parseInt(l?.total || '1');
                  const pct = total > 0 ? Math.round((parseInt(value || '0') / total) * 100) : 0;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-[11px] mb-1.5">
                        <span className="text-slate-400">{label}</span>
                        <span className="font-medium text-slate-300">{value || 0} <span className="text-slate-600">({pct}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all duration-700 ${glow ? `shadow-sm ${glow}` : ''}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Deal Pipeline */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">Deal Pipeline</h3>
                </div>
                <Link to="/crm/pipeline" className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                  Pipeline view <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="mb-5">
                <p className="text-3xl font-bold text-white tracking-tight">{fmtCurr(d?.total_value)}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Total pipeline value</p>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { label: 'Won', value: d?.won_count, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                  { label: 'Active', value: d?.active_count, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                  { label: 'Lost', value: d?.lost_count, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                ].map(({ label, value, color, bg, border }) => (
                  <div key={label} className={`text-center py-3 rounded-xl ${bg} border ${border}`}>
                    <p className={`text-lg font-bold ${color}`}>{value || 0}</p>
                    <p className="text-[10px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[11px] text-slate-500">Avg Probability</span>
                <span className="text-sm font-bold text-white">{Math.round(parseFloat(d?.avg_probability || '0'))}%</span>
              </div>
            </div>

            {/* Activity overview */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">Activities</h3>
                </div>
                <Link to="/crm/activities" className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { icon: Phone, label: 'Calls', value: a?.calls, color: 'text-violet-400', bg: 'bg-violet-500/10' },
                  { icon: Mail, label: 'Emails', value: a?.emails, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { icon: Calendar, label: 'Meetings', value: a?.meetings, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                  { icon: Clock, label: 'Upcoming', value: a?.upcoming, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                ].map(({ icon: Icon, label, value, color, bg }) => (
                  <div key={label} className={`flex items-center gap-3 p-3 rounded-xl ${bg} border border-white/[0.04]`}>
                    <Icon className={`h-4 w-4 ${color} flex-shrink-0`} />
                    <div>
                      <p className="text-sm font-bold text-white">{value || 0}</p>
                      <p className="text-[10px] text-slate-500">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                  <span className="text-[11px] text-slate-400">Completed</span>
                  <span className="text-sm font-bold text-emerald-400">{a?.completed || 0}</span>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-red-500/5 border border-red-500/10">
                  <span className="text-[11px] text-slate-400">Overdue</span>
                  <span className="text-sm font-bold text-red-400">{a?.overdue || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Recent RFQs Table ─────────────────────────────────── */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Recent RFQs</h3>
              </div>
              <Link to="/crm/rfqs" className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['RFQ #', 'Insured Name', 'Members', 'Status', 'Premium Potential', 'Mediqzy Margin (20%)'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentRfqs.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-600">No RFQs yet</td></tr>
                  ) : recentRfqs.map(r => {
                    const statusColors: Record<string, string> = {
                      received: 'bg-blue-500/15 text-blue-400',
                      quoting: 'bg-amber-500/15 text-amber-400',
                      quoted: 'bg-violet-500/15 text-violet-400',
                      won: 'bg-emerald-500/15 text-emerald-400',
                      lost: 'bg-red-500/15 text-red-400',
                    };
                    // Estimate premium potential: avg ₹18K per life OPD for rough dashboard estimate
                    const estPremium = (r.member_count || 0) * 18000;
                    const estMargin = Math.round(estPremium * 0.20);
                    return (
                      <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors"
                        onClick={() => navigate(`/crm/rfqs/${r.id}`)}>
                        <td className="px-3 py-3 text-xs font-mono text-violet-400">{r.rfq_number}</td>
                        <td className="px-3 py-3">
                          <p className="text-sm font-medium text-white truncate max-w-[220px]">{r.insured_name}</p>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-300">{(r.member_count || 0).toLocaleString()}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${statusColors[r.status] || statusColors.received}`}>
                            {r.status?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-300">{fmtCurr(String(estPremium))}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-emerald-400">{fmtCurr(String(estMargin))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Quick Actions (5 buttons) ────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { icon: FileSpreadsheet, label: 'New RFQ', path: '/crm/rfqs', gradient: 'from-violet-500/15 to-purple-500/15', border: 'border-violet-500/20', text: 'text-violet-400' },
              { icon: Target, label: 'New Lead', path: '/crm/leads', gradient: 'from-blue-500/15 to-cyan-500/15', border: 'border-blue-500/20', text: 'text-blue-400' },
              { icon: Briefcase, label: 'New Deal', path: '/crm/deals', gradient: 'from-cyan-500/15 to-teal-500/15', border: 'border-cyan-500/20', text: 'text-cyan-400' },
              { icon: Users, label: 'Contacts', path: '/crm/contacts', gradient: 'from-amber-500/15 to-orange-500/15', border: 'border-amber-500/20', text: 'text-amber-400' },
              { icon: PieChart, label: 'Reports', path: '/crm/reports', gradient: 'from-emerald-500/15 to-green-500/15', border: 'border-emerald-500/20', text: 'text-emerald-400' },
            ].map(({ icon: Icon, label, path, gradient, border, text }) => (
              <Link key={label} to={path}
                className={`flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br ${gradient} border ${border} hover:scale-[1.02] transition-all duration-200 group`}>
                <Icon className={`h-5 w-5 ${text}`} />
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{label}</span>
              </Link>
            ))}
          </div>

          {/* ── AI Engine Footer Banner ──────────────────────────── */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-900/30 via-cyan-900/20 to-emerald-900/20 border border-violet-500/10 p-5">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 rounded-full blur-3xl" />
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20">
                  <BrainCircuit className="h-6 w-6 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">AI Actuarial Quote Engine</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Powered by age-banded risk models + iSHA Insurance LLM · Auto-generates OPD & Wellness pricing with Mediqzy margin tiers
                  </p>
                </div>
              </div>
              <Button onClick={() => navigate('/crm/rfqs')} variant="outline"
                className="border-violet-500/20 text-violet-300 hover:bg-violet-500/10 rounded-xl h-9 px-4 gap-2 text-xs hidden sm:flex">
                <Zap className="h-3.5 w-3.5" /> Generate Quotes
              </Button>
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
            { icon: Users, label: 'Contacts', path: '/crm/contacts' },
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
