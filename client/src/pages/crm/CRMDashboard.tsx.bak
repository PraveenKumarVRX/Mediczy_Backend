import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Target, Users, DollarSign, TrendingUp, Activity, BarChart3,
  ArrowUpRight, ArrowDownRight, Clock, AlertCircle, LogOut,
  Phone, Mail, Calendar, FileText, Briefcase, ChevronRight,
  Home, UserPlus, PieChart, Settings,
} from 'lucide-react';
import api from '@/utils/api';

interface DashboardStats {
  leads: { total: string; new_leads: string; contacted: string; qualified: string; converted: string; lost: string; this_week: string; this_month: string };
  deals: { total: string; total_value: string; won_value: string; won_count: string; lost_count: string; active_count: string; avg_probability: string; weighted_pipeline: string };
  activities: { total: string; completed: string; overdue: string; upcoming: string; calls: string; emails: string; meetings: string };
  contacts: { total: string };
}

const navItems = [
  { icon: Home, label: 'Dashboard', path: '/crm/dashboard', active: true },
  { icon: Target, label: 'Leads', path: '/crm/leads' },
  { icon: Briefcase, label: 'Deals', path: '/crm/deals' },
  { icon: Users, label: 'Contacts', path: '/crm/contacts' },
  { icon: Activity, label: 'Activities', path: '/crm/activities' },
  { icon: BarChart3, label: 'Pipeline', path: '/crm/pipeline' },
  { icon: PieChart, label: 'Reports', path: '/crm/reports' },
  { icon: Settings, label: 'Settings', path: '/crm/settings' },
];

const CRMDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [crmUser, setCrmUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    if (!token) { navigate('/crm/login'); return; }
    try {
      const ud = localStorage.getItem('crmUserData');
      if (ud) setCrmUser(JSON.parse(ud));
    } catch {}
    fetchStats();
  }, [navigate]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const { data } = await api.get('/crm/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) setStats(data.data);
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/crm/login');
    } finally {
      setLoading(false);
    }
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading CRM dashboard...</p>
        </div>
      </div>
    );
  }

  const l = stats?.leads;
  const d = stats?.deals;
  const a = stats?.activities;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Mediqzy CRM</h1>
              <p className="text-[10px] text-muted-foreground -mt-0.5">Sales &amp; Pipeline Management</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ icon: Icon, label, path, active }) => (
              <Link key={path} to={path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {crmUser && <span className="text-sm text-slate-600 hidden lg:block">{crmUser.firstName} {crmUser.lastName}</span>}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-500 hover:text-red-600">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Hero metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { title: 'Total Leads', value: fmt(l?.total), sub: `${fmt(l?.this_week)} this week`, icon: Target, color: 'emerald', trend: 'up' },
            { title: 'Active Deals', value: fmt(d?.active_count), sub: fmtCurr(d?.weighted_pipeline) + ' weighted', icon: Briefcase, color: 'blue', trend: 'up' },
            { title: 'Won Revenue', value: fmtCurr(d?.won_value), sub: `${fmt(d?.won_count)} deals closed`, icon: DollarSign, color: 'green', trend: 'up' },
            { title: 'Contacts', value: fmt(stats?.contacts?.total), sub: `${fmt(l?.converted)} converted`, icon: Users, color: 'purple', trend: 'up' },
          ].map(({ title, value, sub, icon: Icon, color, trend }) => (
            <Card key={title} className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
              <div className={`absolute inset-0 bg-gradient-to-br from-${color}-50 to-transparent`} />
              <CardContent className="relative p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-lg bg-${color}-100`}>
                    <Icon className={`h-5 w-5 text-${color}-600`} />
                  </div>
                  {trend === 'up' ? (
                    <span className="flex items-center text-xs text-green-600 font-medium">
                      <ArrowUpRight className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="flex items-center text-xs text-red-500 font-medium">
                      <ArrowDownRight className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500 mt-1">{title}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Lead funnel */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-500" /> Lead Funnel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'New', value: l?.new_leads, color: 'bg-blue-500' },
                { label: 'Contacted', value: l?.contacted, color: 'bg-sky-500' },
                { label: 'Qualified', value: l?.qualified, color: 'bg-indigo-500' },
                { label: 'Converted', value: l?.converted, color: 'bg-emerald-500' },
                { label: 'Lost', value: l?.lost, color: 'bg-red-400' },
              ].map(({ label, value, color }) => {
                const total = parseInt(l?.total || '1');
                const pct = total > 0 ? Math.round((parseInt(value || '0') / total) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-medium">{value || 0} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <Link to="/crm/leads" className="flex items-center text-xs text-emerald-600 hover:text-emerald-700 mt-3 font-medium">
                View All Leads <ChevronRight className="h-3 w-3 ml-1" />
              </Link>
            </CardContent>
          </Card>

          {/* Deal stages */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-blue-500" /> Deal Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-bold text-slate-900">{fmtCurr(d?.total_value)}</span>
                <span className="text-xs text-slate-400">total pipeline</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center p-2 rounded-lg bg-green-50">
                  <p className="text-lg font-bold text-green-600">{d?.won_count || 0}</p>
                  <p className="text-[10px] text-green-600">Won</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-blue-50">
                  <p className="text-lg font-bold text-blue-600">{d?.active_count || 0}</p>
                  <p className="text-[10px] text-blue-600">Active</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-red-50">
                  <p className="text-lg font-bold text-red-500">{d?.lost_count || 0}</p>
                  <p className="text-[10px] text-red-500">Lost</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Avg probability:</span>
                <span className="font-medium text-slate-700">{Math.round(parseFloat(d?.avg_probability || '0'))}%</span>
              </div>
              <Link to="/crm/deals" className="flex items-center text-xs text-blue-600 hover:text-blue-700 mt-3 font-medium">
                View Pipeline <ChevronRight className="h-3 w-3 ml-1" />
              </Link>
            </CardContent>
          </Card>

          {/* Activity overview */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-500" /> Activities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-50">
                  <Phone className="h-4 w-4 text-purple-500" />
                  <div>
                    <p className="text-sm font-bold text-purple-700">{a?.calls || 0}</p>
                    <p className="text-[10px] text-purple-500">Calls</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50">
                  <Mail className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-bold text-blue-700">{a?.emails || 0}</p>
                    <p className="text-[10px] text-blue-500">Emails</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-cyan-50">
                  <Calendar className="h-4 w-4 text-cyan-500" />
                  <div>
                    <p className="text-sm font-bold text-cyan-700">{a?.meetings || 0}</p>
                    <p className="text-[10px] text-cyan-500">Meetings</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-50">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <div>
                    <p className="text-sm font-bold text-orange-700">{a?.upcoming || 0}</p>
                    <p className="text-[10px] text-orange-500">Upcoming</p>
                  </div>
                </div>
              </div>
              {parseInt(a?.overdue || '0') > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-100">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-600 font-medium">{a?.overdue} overdue activities</span>
                </div>
              )}
              <Link to="/crm/activities" className="flex items-center text-xs text-purple-600 hover:text-purple-700 mt-1 font-medium">
                View Activities <ChevronRight className="h-3 w-3 ml-1" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { icon: UserPlus, label: 'New Lead', path: '/crm/leads', color: 'emerald' },
                { icon: Briefcase, label: 'New Deal', path: '/crm/deals', color: 'blue' },
                { icon: Phone, label: 'Log Call', path: '/crm/activities', color: 'purple' },
                { icon: Mail, label: 'Log Email', path: '/crm/activities', color: 'sky' },
                { icon: Calendar, label: 'Schedule Meeting', path: '/crm/activities', color: 'cyan' },
                { icon: FileText, label: 'View Reports', path: '/crm/reports', color: 'orange' },
              ].map(({ icon: Icon, label, path, color }) => (
                <Link key={label} to={path}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 hover:border-${color}-200 hover:bg-${color}-50/50 transition-all group`}
                >
                  <div className={`p-2 rounded-lg bg-${color}-100 group-hover:bg-${color}-200 transition-colors`}>
                    <Icon className={`h-5 w-5 text-${color}-600`} />
                  </div>
                  <span className="text-xs font-medium text-slate-600">{label}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Mobile nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-1 z-50">
          <div className="flex justify-around">
            {navItems.slice(0, 5).map(({ icon: Icon, label, path, active }) => (
              <Link key={path} to={path} className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-[10px] ${active ? 'text-emerald-600' : 'text-slate-400'}`}>
                <Icon className="h-5 w-5" />{label}
              </Link>
            ))}
          </div>
        </nav>
      </main>
    </div>
  );
};

export default CRMDashboard;
