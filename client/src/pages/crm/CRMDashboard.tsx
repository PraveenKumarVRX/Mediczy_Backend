import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, Users, Activity, BarChart3,
  ArrowUpRight, TrendingUp,
  Phone, Mail, Calendar, Briefcase,
  PieChart, Zap, IndianRupee,
  Sparkles, Timer, CheckCheck, Bot, GitBranch, MessageCircle,
} from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  leads: { total: string; new_leads: string; contacted: string; qualified: string; converted: string; lost: string; this_week: string; this_month: string };
  deals: { total: string; total_value: string; won_value: string; won_count: string; lost_count: string; active_count: string; avg_probability: string; weighted_pipeline: string };
  activities: { total: string; completed: string; overdue: string; upcoming: string; calls: string; emails: string; meetings: string };
  contacts: { total: string };
}

interface FunnelData {
  leads: { new_leads: string; contacted: string; qualified: string; converted: string; lost: string; new_30d: string };
  deals: { qualification: string; discovery: string; proposal: string; negotiation: string; contract: string; won: string; won_value_30d: string };
  velocity: { avg_deal_days: string; deals_won_7d: string; deals_won_30d: string; revenue_30d: string };
}

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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [crmUser, setCrmUser] = useState<any>(null);

  useEffect(() => {
    try { const ud = localStorage.getItem('crmUserData'); if (ud) setCrmUser(JSON.parse(ud)); } catch {}
    fetchAll();
  }, []);

  const fetchAll = useCallback(async () => {
    const hdrs = authHdrs();
    const results = await Promise.allSettled([
      api.get('/crm/dashboard/stats', { headers: hdrs }),
      api.get('/crm/funnel-analytics', { headers: hdrs }),
    ]);
    if (results[0].status === 'fulfilled' && results[0].value.data.success) setStats(results[0].value.data.data);
    if (results[1].status === 'fulfilled' && results[1].value.data.success) setFunnel(results[1].value.data.data);
    setLoading(false);
  }, []);

  const l = stats?.leads;
  const d = stats?.deals;
  const a = stats?.activities;
  const c = stats?.contacts;
  const f = funnel;

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
    <CRMLayout title="Command Center">
      <div className="space-y-6">
        <p className="text-xs text-slate-500 -mt-2">Welcome, {crmUser?.firstName || 'User'}</p>

        {/* ── Marketing AI Copilot Banner ───────────────────────────── */}
        <Link
          to="/crm/marketing-copilot"
          className="w-full rounded-2xl bg-gradient-to-r from-violet-600/15 via-purple-600/10 to-blue-600/15 border border-violet-500/20 px-5 py-3.5 flex items-center justify-between group hover:border-violet-500/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-violet-400" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-white">Marketing AI Copilot</div>
              <div className="text-xs text-slate-500">Chat with AI to manage campaigns, prioritize leads, and close deals faster</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-violet-400 text-xs font-medium">
            Open Copilot <Sparkles className="h-4 w-4 group-hover:scale-110 transition-transform" />
          </div>
        </Link>

        {/* ── Agentic CRM + clean-room growth tools ─────────────────── */}
        <section className="grid gap-4 md:grid-cols-3" aria-label="CRM automation tools">
          {[
            {
              to: '/crm/agent', icon: Bot, title: 'Agentic CRM operator',
              detail: 'Search CRM data and prepare audited actions for confirmation.',
              card: 'border-violet-500/20 bg-violet-500/[0.06] hover:border-violet-400/50 hover:bg-violet-500/[0.1]',
              iconWrap: 'bg-violet-500/15', iconColor: 'text-violet-300',
            },
            {
              to: '/crm/flow-builder', icon: GitBranch, title: 'Visual flow builder',
              detail: 'Create versioned automation graphs and run safe dry-runs.',
              card: 'border-emerald-500/20 bg-emerald-500/[0.06] hover:border-emerald-400/50 hover:bg-emerald-500/[0.1]',
              iconWrap: 'bg-emerald-500/15', iconColor: 'text-emerald-300',
            },
            {
              to: '/crm/social-growth', icon: MessageCircle, title: 'Social growth',
              detail: 'Manage social triggers, identities and human handoff controls.',
              card: 'border-cyan-500/20 bg-cyan-500/[0.06] hover:border-cyan-400/50 hover:bg-cyan-500/[0.1]',
              iconWrap: 'bg-cyan-500/15', iconColor: 'text-cyan-300',
            },
          ].map(({ to, icon: Icon, title, detail, card, iconWrap, iconColor }) => (
            <Link
              key={to}
              to={to}
              className={`group rounded-2xl border p-4 transition ${card}`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-xl p-2 ${iconWrap}`}><Icon className={`h-5 w-5 ${iconColor}`} /></div>
                <div>
                  <h2 className="text-sm font-semibold text-white">{title}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
                  <span className={`mt-2 inline-block text-[11px] font-medium ${iconColor}`}>Open workspace →</span>
                </div>
              </div>
            </Link>
          ))}
        </section>

        {/* ── Row 1: Hero KPI Cards ─────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              title: 'Total Leads', value: fmt(l?.total), sub: `${fmt(l?.this_week)} this week`,
              icon: Target, gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-500/10', text: 'text-violet-400',
              trend: `+${l?.new_leads || 0} new`,
            },
            {
              title: 'Active Deals', value: fmt(d?.active_count), sub: fmtCurr(d?.weighted_pipeline) + ' weighted pipeline',
              icon: Briefcase, gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-500/10', text: 'text-blue-400',
              trend: `${d?.won_count || 0} won`,
            },
            {
              title: 'Revenue Won', value: fmtCurr(d?.won_value), sub: `${fmt(d?.won_count)} deals closed`,
              icon: IndianRupee, gradient: 'from-emerald-500 to-green-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400',
              trend: `${f?.velocity?.deals_won_30d || 0} last 30d`,
            },
            {
              title: 'Contacts', value: fmt(c?.total), sub: 'in directory',
              icon: Users, gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10', text: 'text-amber-400',
              trend: `${a?.total || 0} activities`,
            },
          ].map(({ title, value, sub, icon: Icon, gradient, bg, text, trend }) => (
            <div key={title} className="relative group p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all duration-300 overflow-hidden">
              <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-500`} />
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${bg} ring-1 ring-white/[0.05]`}>
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

        {/* ── Row 2: Velocity Strip ─────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Avg Deal Cycle', value: `${f?.velocity?.avg_deal_days || 0}d`, icon: Timer, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            { label: 'Deals Won 7d', value: f?.velocity?.deals_won_7d || 0, icon: CheckCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Revenue 30d', value: fmtCurr(f?.velocity?.revenue_30d), icon: TrendingUp, color: 'text-violet-400', bg: 'bg-violet-500/10' },
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

        {/* ── Row 3: Lead Funnel + Deal Pipeline ─────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-5">

          {/* Lead funnel with conv rates */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Lead Funnel</h3>
              </div>
              <Link to="/crm/leads" className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1">View all <ArrowUpRight className="h-3 w-3 rotate-45" /></Link>
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
                const prevVal = i > 0 ? parseInt(arr[i - 1].value || '1') : parseInt(value || '0');
                const convFromPrev = prevVal > 0 ? Math.round((parseInt(value || '0') / prevVal) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">{label}</span>
                        {total > 0 && (
                          <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${convFromPrev >= 50 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            {p}% of leads
                          </span>
                        )}
                      </div>
                      <span className={`font-bold ${text}`}>{value || 0}</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between py-2 px-3 rounded-xl bg-violet-500/5 border border-violet-500/10">
              <span className="text-[11px] text-slate-500">Lead→Deal Rate</span>
              <span className="text-sm font-bold text-violet-400">
                {pct(f?.leads?.converted || 0, l?.total || 0)}%
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
              <Link to="/crm/pipeline" className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1">Pipeline <ArrowUpRight className="h-3 w-3 rotate-45" /></Link>
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
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${p}%` }} />
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
        </div>

        {/* ── Row 4: Activities + Quick Actions ────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Activities */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Activity Overview</h3>
              </div>
              <Link to="/crm/activities" className="text-[11px] text-amber-400 flex items-center gap-1">View all <ArrowUpRight className="h-3 w-3 rotate-45" /></Link>
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
                { icon: Target, label: 'New Lead', sub: 'Add prospect', path: '/crm/leads', gradient: 'from-blue-500/15 to-cyan-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
                { icon: Briefcase, label: 'New Deal', sub: 'Track opportunity', path: '/crm/deals', gradient: 'from-cyan-500/15 to-teal-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
                { icon: BarChart3, label: 'Pipeline', sub: 'View sales pipeline', path: '/crm/pipeline', gradient: 'from-violet-500/15 to-purple-500/10', border: 'border-violet-500/20', text: 'text-violet-400' },
                { icon: Users, label: 'Contacts', sub: 'View directory', path: '/crm/contacts', gradient: 'from-amber-500/15 to-orange-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
                { icon: Mail, label: 'Campaigns', sub: 'Marketing outreach', path: '/crm/campaigns', gradient: 'from-teal-500/15 to-emerald-500/10', border: 'border-teal-500/20', text: 'text-teal-400' },
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
      </div>
    </CRMLayout>
  );
};

export default CRMDashboard;
