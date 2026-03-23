import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Target, Users, DollarSign, TrendingUp, Activity, BarChart3,
  ArrowUpRight, ArrowDownRight, Clock, LogOut,
  Phone, Mail, Calendar, Briefcase, ChevronRight,
  Home, PieChart, Settings, Zap, ChevronDown, Bell,
  LayoutGrid, ArrowRight,
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
  const [loading, setLoading] = useState(true);
  const [crmUser, setCrmUser] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    if (!token) { navigate('/crm/login'); return; }
    try { const ud = localStorage.getItem('crmUserData'); if (ud) setCrmUser(JSON.parse(ud)); } catch {}
    fetchStats();
  }, [navigate]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const { data } = await api.get('/crm/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } });
      if (data.success) setStats(data.data);
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/crm/login');
    } finally { setLoading(false); }
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
          {/* Hero metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { title: 'Total Leads', value: fmt(l?.total), sub: `${fmt(l?.this_week)} this week`, icon: Target, gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-500/10', text: 'text-violet-400', trend: '+12%' },
              { title: 'Active Deals', value: fmt(d?.active_count), sub: fmtCurr(d?.weighted_pipeline) + ' weighted', icon: Briefcase, gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-500/10', text: 'text-blue-400', trend: '+8%' },
              { title: 'Revenue Won', value: fmtCurr(d?.won_value), sub: `${fmt(d?.won_count)} deals closed`, icon: DollarSign, gradient: 'from-emerald-500 to-green-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', trend: '+23%' },
              { title: 'Contacts', value: fmt(stats?.contacts?.total), sub: `${fmt(l?.converted)} converted`, icon: Users, gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10', text: 'text-amber-400', trend: '+5%' },
            ].map(({ title, value, sub, icon: Icon, gradient, bg, text, trend }) => (
              <div key={title} className="relative group p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] hover:bg-white/[0.05] transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl ${bg}`}>
                    <Icon className={`h-5 w-5 ${text}`} />
                  </div>
                  <span className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-400">
                    <ArrowUpRight className="h-3 w-3" /> {trend}
                  </span>
                </div>
                <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
                <p className="text-[11px] text-slate-500 mt-1">{title}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
                <div className={`absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-60 transition-opacity duration-300`} />
              </div>
            ))}
          </div>

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

          {/* Quick actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Target, label: 'New Lead', path: '/crm/leads', gradient: 'from-violet-500/15 to-purple-500/15', border: 'border-violet-500/20', text: 'text-violet-400' },
              { icon: Briefcase, label: 'New Deal', path: '/crm/deals', gradient: 'from-blue-500/15 to-cyan-500/15', border: 'border-blue-500/20', text: 'text-blue-400' },
              { icon: Users, label: 'Add Contact', path: '/crm/contacts', gradient: 'from-amber-500/15 to-orange-500/15', border: 'border-amber-500/20', text: 'text-amber-400' },
              { icon: PieChart, label: 'View Reports', path: '/crm/reports', gradient: 'from-emerald-500/15 to-green-500/15', border: 'border-emerald-500/20', text: 'text-emerald-400' },
            ].map(({ icon: Icon, label, path, gradient, border, text }) => (
              <Link key={label} to={path}
                className={`flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br ${gradient} border ${border} hover:scale-[1.02] transition-all duration-200 group`}>
                <Icon className={`h-5 w-5 ${text}`} />
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{label}</span>
              </Link>
            ))}
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
