import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Target, Users, DollarSign, TrendingUp, Activity, BarChart3,
  Clock, LogOut, Phone, Mail, Calendar, FileText,
  Briefcase, ChevronRight, ChevronLeft, LayoutGrid,
  PieChart, Settings, Plus, Search, Trash2, Edit,
  CheckCircle, X, Save, Bell, ArrowRight, UserCheck,
  Brain, Sparkles, MessageSquare, Star, ShieldCheck,
  Route, Gauge, Stethoscope, FlaskConical, Globe, Milestone, Radio, Magnet,
  UserCog, Contact, List, Bot, UserPlus, Filter,
} from 'lucide-react';
import api from '@/utils/api';
import { hasCRMCapability, CRM_ROLES, CRM_ROLE_LIST, CRM_ROLE_LABELS } from './shared/crmRoles';
import LeadDetailDrawer from './shared/LeadDetailDrawer';
import CommandPalette from './shared/CommandPalette';

// ─── Shared sidebar nav config ─────────────────────────────────────────────────
// Items with a `cap` are visible only to CRM roles that hold that capability
// (see shared/crmRoles.ts). Items with no `cap` are visible to every CRM login.

const sidebarNav = [
  { section: 'OVERVIEW', items: [
    { icon: LayoutGrid, label: 'Dashboard', path: '/crm/dashboard' },
    { icon: Route, label: 'Hospital CRM', path: '/crm/hospital', cap: 'foundation:read' },
    { icon: Gauge, label: 'Command Center · Business & Marketing Heads', path: '/crm/hospital/command-center', cap: 'dashboard:command-center' },
    { icon: MessageSquare, label: 'Communication Hub', path: '/crm/hospital/communication-hub', cap: 'communication:read' },
    { icon: Filter, label: 'Segments', path: '/crm/hospital/segments', cap: 'segments:read' },
    { icon: Bot, label: 'Automations', path: '/crm/hospital/automations', cap: 'automations:read' },
    { icon: Sparkles, label: 'Growth Automation', path: '/crm/hospital/growth', cap: 'growth:read' },
    { icon: Stethoscope, label: 'Specialty Growth', path: '/crm/hospital/specialties', cap: 'specialty:read' },
    { icon: FlaskConical, label: 'Diagnostic Growth', path: '/crm/hospital/diagnostics', cap: 'specialty:read' },
    { icon: Globe, label: 'Digital Growth Hub', path: '/crm/hospital/digital', cap: 'specialty:read' },
    { icon: Milestone, label: 'Journey Operations', path: '/crm/hospital/operations', cap: 'worldclass:read' },
    { icon: Radio, label: 'Engagement Hub', path: '/crm/hospital/engagement', cap: 'worldclass:read' },
    { icon: Magnet, label: 'Acquisition', path: '/crm/hospital/acquisition', cap: 'dashboard:marketing-head' },
    { icon: Star, label: 'Patient Experience', path: '/crm/hospital/experience', cap: 'dashboard:business-head' },
    { icon: UserCog, label: 'Team Performance', path: '/crm/hospital/people', cap: 'dashboard:people-performance' },
    { icon: ShieldCheck, label: 'Governance', path: '/crm/hospital/governance', cap: 'dashboard:business-head' },
  ]},
  { section: 'SALES', items: [
    { icon: Target, label: 'Leads', path: '/crm/leads' },
    { icon: Briefcase, label: 'Deals', path: '/crm/deals' },
    { icon: BarChart3, label: 'Pipeline', path: '/crm/pipeline' },
  ]},
  { section: 'MANAGE', items: [
    { icon: Contact, label: 'Contacts', path: '/crm/contacts' },
    { icon: Activity, label: 'Activities', path: '/crm/activities' },
  ]},
  { section: 'MARKETING', items: [
    { icon: Bot, label: 'AI Copilot', path: '/crm/marketing-copilot' },
    { icon: Mail, label: 'Campaigns', path: '/crm/campaigns' },
    { icon: List, label: 'Lists', path: '/crm/lists' },
    { icon: FileText, label: 'Templates', path: '/crm/templates' },
    { icon: UserCheck, label: 'Senders', path: '/crm/senders' },
    { icon: X, label: 'Suppressions', path: '/crm/suppressions' },
  ]},
  { section: 'INSIGHTS', items: [
    { icon: Brain,    label: 'AI Insights', path: '/crm/ai-insights' },
    { icon: PieChart, label: 'Reports', path: '/crm/reports' },
    { icon: Settings, label: 'Settings', path: '/crm/settings' },
  ]},
  { section: 'ADMIN', items: [
    { icon: UserPlus, label: 'Team', path: '/crm/team', cap: 'team:manage' },
  ]},
];

// ─── CRMLayout — premium dark sidebar layout ──────────────────────────────────

export function CRMLayout({ title, children }: { title: string; activePath?: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [crmUser, setCrmUser] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const flatNavItems = sidebarNav.flatMap(({ section, items }) =>
    items.filter((item) => !('cap' in item) || hasCRMCapability(crmUser, (item as any).cap)).map(({ label, path }) => ({ label, path, section }))
  );

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    if (!token) { navigate('/crm/login'); return; }
    try { const d = localStorage.getItem('crmUserData'); if (d) setCrmUser(JSON.parse(d)); } catch {}
  }, [navigate]);

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
        {sidebarNav.map(({ section, items }) => {
          const visibleItems = items.filter((item) => !('cap' in item) || hasCRMCapability(crmUser, (item as any).cap));
          if (!visibleItems.length) return null;
          return (
          <div key={section}>
            {!sidebarCollapsed && (
              <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.18em] px-3 mb-2">{section}</p>
            )}
            <div className="space-y-0.5">
              {visibleItems.map(({ icon: Icon, label, path }) => {
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
          );
        })}
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

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex">
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-[#0d1120] border-r border-white/[0.06] animate-in slide-in-from-left duration-200">
            <SidebarContent />
          </div>
        </div>
      )}
      <aside className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 bg-[#0d1120]/80 backdrop-blur-xl border-r border-white/[0.06] z-40 transition-all duration-300 ${sidebarCollapsed ? 'w-[72px]' : 'w-[240px]'}`}>
        <SidebarContent />
      </aside>
      <div className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]'}`}>
        <header className="sticky top-0 z-30 h-16 bg-[#0a0e1a]/80 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => { if (window.innerWidth < 1024) setMobileSidebarOpen(true); else setSidebarCollapsed(!sidebarCollapsed); }}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-white">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPaletteOpen(true)} className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-500 hover:text-slate-300 text-xs transition-colors">
              <Search className="h-3.5 w-3.5" /> Search <kbd className="text-[10px] text-slate-600 border border-white/10 rounded px-1">⌘K</kbd>
            </button>
            <button onClick={() => setPaletteOpen(true)} className="sm:hidden p-2.5 rounded-xl hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-colors">
              <Search className="h-4.5 w-4.5" />
            </button>
            <button className="relative p-2.5 rounded-xl hover:bg-white/[0.05] text-slate-500 hover:text-slate-300 transition-colors">
              <Bell className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>
        <main className="p-6 pb-24 lg:pb-6">{children}</main>
      </div>
      <CommandPalette navItems={flatNavItems} open={paletteOpen} onOpenChange={setPaletteOpen} />
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
}

function authHeaders() {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-6">
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm text-slate-500">{page} / {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Shared dark-theme table styles ─────────────────────────────────────────

const thClass = 'pb-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider';
const tdClass = 'py-3.5';

// ═══════════════════════════════════════════════════════════════════════════════
// LEADS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const SOURCE_LABELS: Record<string, string> = {
  'manual': 'Manual',
  'website': 'Website',
  'referral': 'Referral',
  'social': 'Social',
  'cold_call': 'Cold Call',
  'event': 'Event',
  'partner': 'Partner',
  'advertisement': 'Advertisement',
  'facebook-lead-ads': 'Facebook Ads',
  'marketing-website': 'Marketing',
};

function SourceBadge({ source }: { source: string }) {
  if (source === 'facebook-lead-ads') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-600/20 text-blue-400 border border-blue-500/30">
        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Facebook Ads
      </span>
    );
  }
  return <span className="text-[11px] text-slate-500">{SOURCE_LABELS[source] || source}</span>;
}

export function CRMLeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);
  const [detailLeadId, setDetailLeadId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', source: 'manual', status: 'new', priority: 'medium', notes: '' });
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) { setDetailLeadId(Number(openId)); setSearchParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const navigate = useNavigate();

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (sourceFilter !== 'all') params.source = sourceFilter;
      const { data } = await api.get('/crm/leads', { headers: authHeaders(), params });
      if (data.success) { setLeads(data.data); setTotalPages(data.pagination?.totalPages || 1); setTotal(data.pagination?.total || 0); }
    } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
    finally { setLoading(false); }
  }, [page, search, statusFilter, sourceFilter, navigate]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleSave = async () => {
    try {
      if (editLead) await api.put(`/crm/leads/${editLead.id}`, form, { headers: authHeaders() });
      else await api.post('/crm/leads', form, { headers: authHeaders() });
      setShowForm(false); setEditLead(null);
      setForm({ name: '', email: '', phone: '', company: '', source: 'manual', status: 'new', priority: 'medium', notes: '' });
      fetchLeads();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this lead?')) return;
    try { await api.delete(`/crm/leads/${id}`, { headers: authHeaders() }); fetchLeads(); } catch {}
  };

  const openEdit = (lead: any) => {
    setEditLead(lead);
    setForm({ name: lead.name, email: lead.email || '', phone: lead.phone || '', company: lead.company || '', source: lead.source || 'manual', status: lead.status, priority: lead.priority || 'medium', notes: lead.notes || '' });
    setShowForm(true);
  };

  const statusBadge: Record<string, string> = {
    new: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    contacted: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
    qualified: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    converted: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    lost: 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  const priorityBadge: Record<string, string> = {
    high: 'bg-red-500/15 text-red-400 border-red-500/20',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    low: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  };

  return (
    <CRMLayout title="Leads">
      <div className="space-y-5">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-2 flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[160px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              <input placeholder="Search leads..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30 transition-colors" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none focus:border-violet-500/30">
              <option value="all" className="bg-[#0d1120]">All Status</option>
              {['new', 'contacted', 'qualified', 'converted', 'lost'].map(s => <option key={s} value={s} className="bg-[#0d1120]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none focus:border-violet-500/30">
              <option value="all" className="bg-[#0d1120]">All Sources</option>
              <option value="facebook-lead-ads" className="bg-[#0d1120]">Facebook Ads</option>
              {['manual', 'website', 'referral', 'social', 'cold_call', 'event', 'partner', 'advertisement', 'marketing-website'].map(s => (
                <option key={s} value={s} className="bg-[#0d1120]">{SOURCE_LABELS[s] || s}</option>
              ))}
            </select>
            {total > 0 && <span className="self-center text-xs text-slate-500">{total} lead{total !== 1 ? 's' : ''}</span>}
          </div>
          <Button onClick={() => { setEditLead(null); setForm({ name: '', email: '', phone: '', company: '', source: 'manual', status: 'new', priority: 'medium', notes: '' }); setShowForm(true); }}
            className="h-10 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white rounded-xl shadow-lg shadow-violet-600/20">
            <Plus className="h-4 w-4 mr-1.5" /> New Lead
          </Button>
        </div>

        {/* Form modal */}
        {showForm && (
          <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{editLead ? 'Edit Lead' : 'Create New Lead'}</h3>
              <button onClick={() => { setShowForm(false); setEditLead(null); }} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Name *', field: 'name', placeholder: 'Lead name' },
                { label: 'Email', field: 'email', placeholder: 'Email', type: 'email' },
                { label: 'Phone', field: 'phone', placeholder: 'Phone' },
                { label: 'Company', field: 'company', placeholder: 'Company' },
              ].map(({ label, field, placeholder, type }) => (
                <div key={field} className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</label>
                  <input type={type || 'text'} value={(form as any)[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} placeholder={placeholder}
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Source</label>
                <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  {['manual', 'website', 'referral', 'social', 'cold_call', 'event', 'partner', 'advertisement', 'facebook-lead-ads'].map(s => (
                    <option key={s} value={s} className="bg-[#0d1120]">{SOURCE_LABELS[s] || s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  {['new', 'contacted', 'qualified', 'converted', 'lost'].map(s => <option key={s} value={s} className="bg-[#0d1120]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  {['low', 'medium', 'high'].map(p => <option key={p} value={p} className="bg-[#0d1120]">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes..."
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white rounded-xl">
                <Save className="h-4 w-4 mr-1.5" /> {editLead ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="py-20 text-center"><div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-slate-600">Loading...</p></div>
        ) : leads.length === 0 ? (
          <div className="py-20 text-center"><Target className="h-12 w-12 text-slate-700 mx-auto mb-3" /><p className="text-slate-500">No leads found</p><p className="text-xs text-slate-600 mt-1">Create your first lead to get started</p></div>
        ) : (
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/[0.06]">
                  <th className={`${thClass} pl-5 text-left`}>Name</th>
                  <th className={`${thClass} text-left`}>Company</th>
                  <th className={`${thClass} text-left`}>Status</th>
                  <th className={`${thClass} text-left`}>Priority</th>
                  <th className={`${thClass} text-left`}>Source</th>
                  <th className={`${thClass} text-left`}>Created</th>
                  <th className={`${thClass} pr-5 text-right`}>Actions</th>
                </tr></thead>
                <tbody>
                  {leads.map(l => (
                    <tr key={l.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className={`${tdClass} pl-5`}>
                        <button onClick={() => setDetailLeadId(l.id)} className="text-left hover:text-violet-300 transition-colors">
                          <p className="font-medium text-white">{l.name}</p>
                          <p className="text-[11px] text-slate-600 mt-0.5">{l.email || l.phone || ''}</p>
                        </button>
                      </td>
                      <td className={`${tdClass} text-slate-400`}>{l.company || '—'}</td>
                      <td className={tdClass}><span className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${statusBadge[l.status] || 'bg-slate-500/15 text-slate-400 border-slate-500/20'}`}>{l.status}</span></td>
                      <td className={tdClass}><span className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${priorityBadge[l.priority] || ''}`}>{l.priority}</span></td>
                      <td className={tdClass}><SourceBadge source={l.source} /></td>
                      <td className={`${tdClass} text-[11px] text-slate-600`}>{new Date(l.created_at).toLocaleDateString()}</td>
                      <td className={`${tdClass} pr-5 text-right`}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(l)} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors"><Edit className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDelete(l.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
      {detailLeadId != null && <LeadDetailDrawer leadId={detailLeadId} onClose={() => setDetailLeadId(null)} />}
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEALS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMDealsPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editDeal, setEditDeal] = useState<any>(null);
  const [form, setForm] = useState({ title: '', value: '', stage: 'qualification', probability: '10', expected_close: '', contact_name: '', contact_email: '', company: '', notes: '' });
  const navigate = useNavigate();

  const stages = ['qualification', 'discovery', 'proposal', 'negotiation', 'contract', 'won', 'lost'];
  const stageBadge: Record<string, string> = {
    qualification: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
    discovery: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    proposal: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    negotiation: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    contract: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    lost: 'bg-red-500/15 text-red-400 border-red-500/20',
  };

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      if (stageFilter !== 'all') params.stage = stageFilter;
      const { data } = await api.get('/crm/deals', { headers: authHeaders(), params });
      if (data.success) { setDeals(data.data); setTotalPages(data.pagination?.totalPages || 1); }
    } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
    finally { setLoading(false); }
  }, [page, search, stageFilter, navigate]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const handleSave = async () => {
    try {
      const payload = { ...form, value: parseFloat(form.value) || 0, probability: parseInt(form.probability) || 10 };
      if (editDeal) await api.put(`/crm/deals/${editDeal.id}`, payload, { headers: authHeaders() });
      else await api.post('/crm/deals', payload, { headers: authHeaders() });
      setShowForm(false); setEditDeal(null); fetchDeals();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this deal?')) return;
    try { await api.delete(`/crm/deals/${id}`, { headers: authHeaders() }); fetchDeals(); } catch {}
  };

  const openEdit = (deal: any) => {
    setEditDeal(deal);
    setForm({ title: deal.title, value: deal.value?.toString() || '', stage: deal.stage, probability: deal.probability?.toString() || '10', expected_close: deal.expected_close?.split('T')[0] || '', contact_name: deal.contact_name || '', contact_email: deal.contact_email || '', company: deal.company || '', notes: deal.notes || '' });
    setShowForm(true);
  };

  const fmtCurr = (v: any) => `₹${(parseFloat(v || 0)).toLocaleString('en-IN')}`;

  return (
    <CRMLayout title="Deals">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              <input placeholder="Search deals..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30 transition-colors" />
            </div>
            <select value={stageFilter} onChange={e => { setStageFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
              <option value="all" className="bg-[#0d1120]">All Stages</option>
              {stages.map(s => <option key={s} value={s} className="bg-[#0d1120]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <Button onClick={() => { setEditDeal(null); setForm({ title: '', value: '', stage: 'qualification', probability: '10', expected_close: '', contact_name: '', contact_email: '', company: '', notes: '' }); setShowForm(true); }}
            className="h-10 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl shadow-lg shadow-blue-600/20">
            <Plus className="h-4 w-4 mr-1.5" /> New Deal
          </Button>
        </div>

        {showForm && (
          <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{editDeal ? 'Edit Deal' : 'Create New Deal'}</h3>
              <button onClick={() => { setShowForm(false); setEditDeal(null); }} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Title *', field: 'title', placeholder: 'Deal title' },
                { label: 'Value (₹)', field: 'value', placeholder: '0', type: 'number' },
                { label: 'Probability (%)', field: 'probability', placeholder: '10', type: 'number' },
                { label: 'Expected Close', field: 'expected_close', type: 'date' },
                { label: 'Contact Name', field: 'contact_name', placeholder: 'Contact' },
                { label: 'Contact Email', field: 'contact_email', placeholder: 'Email', type: 'email' },
                { label: 'Company', field: 'company', placeholder: 'Company' },
              ].map(({ label, field, placeholder, type }) => (
                <div key={field} className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</label>
                  <input type={type || 'text'} value={(form as any)[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} placeholder={placeholder}
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Stage</label>
                <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  {stages.map(s => <option key={s} value={s} className="bg-[#0d1120]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes..."
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl">
                <Save className="h-4 w-4 mr-1.5" /> {editDeal ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center"><div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" /></div>
        ) : deals.length === 0 ? (
          <div className="py-20 text-center"><Briefcase className="h-12 w-12 text-slate-700 mx-auto mb-3" /><p className="text-slate-500">No deals found</p></div>
        ) : (
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/[0.06]">
                  <th className={`${thClass} pl-5 text-left`}>Title</th>
                  <th className={`${thClass} text-left`}>Value</th>
                  <th className={`${thClass} text-left`}>Stage</th>
                  <th className={`${thClass} text-left`}>Prob.</th>
                  <th className={`${thClass} text-left`}>Company</th>
                  <th className={`${thClass} text-left`}>Close Date</th>
                  <th className={`${thClass} pr-5 text-right`}>Actions</th>
                </tr></thead>
                <tbody>
                  {deals.map(d => (
                    <tr key={d.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className={`${tdClass} pl-5`}>
                        <p className="font-medium text-white">{d.title}</p>
                        <p className="text-[11px] text-slate-600 mt-0.5">{d.contact_name || d.contact_email || ''}</p>
                      </td>
                      <td className={`${tdClass} font-semibold text-emerald-400`}>{fmtCurr(d.value)}</td>
                      <td className={tdClass}><span className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${stageBadge[d.stage] || ''}`}>{d.stage}</span></td>
                      <td className={`${tdClass} text-slate-400`}>{d.probability}%</td>
                      <td className={`${tdClass} text-slate-500`}>{d.company || '—'}</td>
                      <td className={`${tdClass} text-[11px] text-slate-600`}>{d.expected_close ? new Date(d.expected_close).toLocaleDateString() : '—'}</td>
                      <td className={`${tdClass} pr-5 text-right`}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors"><Edit className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', designation: '', city: '', state: '', notes: '' });
  const navigate = useNavigate();

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      const { data } = await api.get('/crm/contacts', { headers: authHeaders(), params });
      if (data.success) { setContacts(data.data); setTotalPages(data.pagination?.totalPages || 1); }
    } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
    finally { setLoading(false); }
  }, [page, search, navigate]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleSave = async () => {
    try {
      if (editContact) await api.put(`/crm/contacts/${editContact.id}`, form, { headers: authHeaders() });
      else await api.post('/crm/contacts', form, { headers: authHeaders() });
      setShowForm(false); setEditContact(null); fetchContacts();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this contact?')) return;
    try { await api.delete(`/crm/contacts/${id}`, { headers: authHeaders() }); fetchContacts(); } catch {}
  };

  const openEdit = (c: any) => {
    setEditContact(c);
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', company: c.company || '', designation: c.designation || '', city: c.city || '', state: c.state || '', notes: c.notes || '' });
    setShowForm(true);
  };

  return (
    <CRMLayout title="Contacts">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
            <input placeholder="Search contacts..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30 transition-colors" />
          </div>
          <Button onClick={() => { setEditContact(null); setForm({ name: '', email: '', phone: '', company: '', designation: '', city: '', state: '', notes: '' }); setShowForm(true); }}
            className="h-10 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl shadow-lg shadow-amber-600/20">
            <Plus className="h-4 w-4 mr-1.5" /> New Contact
          </Button>
        </div>

        {showForm && (
          <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{editContact ? 'Edit Contact' : 'New Contact'}</h3>
              <button onClick={() => { setShowForm(false); setEditContact(null); }} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Name *', field: 'name', placeholder: 'Full name' },
                { label: 'Email', field: 'email', type: 'email' },
                { label: 'Phone', field: 'phone' },
                { label: 'Company', field: 'company' },
                { label: 'Designation', field: 'designation' },
                { label: 'City', field: 'city' },
                { label: 'State', field: 'state' },
              ].map(({ label, field, type }) => (
                <div key={field} className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</label>
                  <input type={type || 'text'} value={(form as any)[field]} onChange={e => setForm({ ...form, [field]: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
                </div>
              ))}
              <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes..."
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl">
                <Save className="h-4 w-4 mr-1.5" /> {editContact ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center"><div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin mx-auto" /></div>
        ) : contacts.length === 0 ? (
          <div className="py-20 text-center"><Users className="h-12 w-12 text-slate-700 mx-auto mb-3" /><p className="text-slate-500">No contacts found</p></div>
        ) : (
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/[0.06]">
                  <th className={`${thClass} pl-5 text-left`}>Name</th>
                  <th className={`${thClass} text-left`}>Company</th>
                  <th className={`${thClass} text-left`}>Phone</th>
                  <th className={`${thClass} text-left`}>Location</th>
                  <th className={`${thClass} pr-5 text-right`}>Actions</th>
                </tr></thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className={`${tdClass} pl-5`}><p className="font-medium text-white">{c.name}</p><p className="text-[11px] text-slate-600 mt-0.5">{c.email || c.designation || ''}</p></td>
                      <td className={`${tdClass} text-slate-400`}>{c.company || '—'}</td>
                      <td className={`${tdClass} text-slate-400`}>{c.phone || '—'}</td>
                      <td className={`${tdClass} text-[11px] text-slate-500`}>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                      <td className={`${tdClass} pr-5 text-right`}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors"><Edit className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITIES PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMActivitiesPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'call', title: '', description: '', scheduled_at: '' });
  const navigate = useNavigate();

  const types = ['call', 'email', 'meeting', 'task', 'note', 'followup'];
  const typeBadge: Record<string, { bg: string; icon: any }> = {
    call:     { bg: 'bg-violet-500/15 text-violet-400', icon: Phone },
    email:    { bg: 'bg-blue-500/15 text-blue-400', icon: Mail },
    meeting:  { bg: 'bg-cyan-500/15 text-cyan-400', icon: Calendar },
    task:     { bg: 'bg-amber-500/15 text-amber-400', icon: CheckCircle },
    note:     { bg: 'bg-slate-500/15 text-slate-400', icon: FileText },
    followup: { bg: 'bg-pink-500/15 text-pink-400', icon: Clock },
  };

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (typeFilter !== 'all') params.type = typeFilter;
      const { data } = await api.get('/crm/activities', { headers: authHeaders(), params });
      if (data.success) { setActivities(data.data); setTotalPages(data.pagination?.totalPages || 1); }
    } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
    finally { setLoading(false); }
  }, [page, typeFilter, navigate]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const handleSave = async () => {
    try {
      await api.post('/crm/activities', form, { headers: authHeaders() });
      setShowForm(false); setForm({ type: 'call', title: '', description: '', scheduled_at: '' }); fetchActivities();
    } catch {}
  };

  const handleComplete = async (id: number) => {
    try { await api.put(`/crm/activities/${id}/complete`, { outcome: 'completed' }, { headers: authHeaders() }); fetchActivities(); } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete?')) return;
    try { await api.delete(`/crm/activities/${id}`, { headers: authHeaders() }); fetchActivities(); } catch {}
  };

  return (
    <CRMLayout title="Activities">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
            <option value="all" className="bg-[#0d1120]">All Types</option>
            {types.map(t => <option key={t} value={t} className="bg-[#0d1120]">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <Button onClick={() => setShowForm(true)}
            className="h-10 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl shadow-lg shadow-violet-600/20">
            <Plus className="h-4 w-4 mr-1.5" /> Log Activity
          </Button>
        </div>

        {showForm && (
          <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Log New Activity</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  {types.map(t => <option key={t} value={t} className="bg-[#0d1120]">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Title *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Activity title"
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Scheduled At</label>
                <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Description</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description..."
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl">
                <Save className="h-4 w-4 mr-1.5" /> Log Activity
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center"><div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin mx-auto" /></div>
        ) : activities.length === 0 ? (
          <div className="py-20 text-center"><Activity className="h-12 w-12 text-slate-700 mx-auto mb-3" /><p className="text-slate-500">No activities yet</p></div>
        ) : (
          <div className="space-y-2">
            {activities.map(a => {
              const badge = typeBadge[a.type] || { bg: 'bg-slate-500/15 text-slate-400', icon: Activity };
              const Icon = badge.icon;
              const isOverdue = !a.completed_at && a.scheduled_at && new Date(a.scheduled_at) < new Date();
              return (
                <div key={a.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200
                  ${isOverdue ? 'bg-red-500/[0.04] border-red-500/20' : a.completed_at ? 'bg-emerald-500/[0.03] border-emerald-500/10' : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'}`}>
                  <div className={`p-2.5 rounded-xl ${badge.bg}`}><Icon className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${a.completed_at ? 'line-through text-slate-600' : 'text-white'}`}>{a.title}</p>
                    {a.description && <p className="text-[11px] text-slate-600 mt-0.5">{a.description}</p>}
                    {a.scheduled_at && <p className="text-[10px] text-slate-600 mt-1 flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(a.scheduled_at).toLocaleString()}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {!a.completed_at && <button onClick={() => handleComplete(a.id)} className="p-2 rounded-lg hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400 transition-colors"><CheckCircle className="h-4 w-4" /></button>}
                    <button onClick={() => handleDelete(a.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE PAGE (Kanban)
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMPipelinePage() {
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const stageConfig: Record<string, { label: string; color: string; border: string; bg: string }> = {
    qualification: { label: 'Qualification', color: 'text-slate-400', border: 'border-slate-500/20', bg: 'bg-slate-500/10' },
    discovery:     { label: 'Discovery', color: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/10' },
    proposal:      { label: 'Proposal', color: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/10' },
    negotiation:   { label: 'Negotiation', color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/10' },
    contract:      { label: 'Contract', color: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-500/10' },
  };

  useEffect(() => {
    const fetchPipeline = async () => {
      try {
        const { data } = await api.get('/crm/deals/pipeline', { headers: authHeaders() });
        if (data.success) setPipeline(data.data);
      } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
      finally { setLoading(false); }
    };
    fetchPipeline();
  }, [navigate]);

  const fmtCurr = (v: any) => `₹${(parseFloat(v || 0)).toLocaleString('en-IN')}`;
  const orderedStages = ['qualification', 'discovery', 'proposal', 'negotiation', 'contract'];
  const pipelineMap = Object.fromEntries(pipeline.map(p => [p.stage, p]));
  const totalPipeline = pipeline.reduce((s, p) => s + parseFloat(p.total_value || 0), 0);
  const totalWeighted = pipeline.reduce((s, p) => s + parseFloat(p.weighted_value || 0), 0);

  return (
    <CRMLayout title="Sales Pipeline">
      {loading ? (
        <div className="py-20 text-center"><div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-white tracking-tight">{fmtCurr(totalPipeline)}</p>
              <p className="text-sm text-slate-500 mt-0.5">Total pipeline value &middot; {fmtCurr(totalWeighted)} weighted</p>
            </div>
            <Link to="/crm/deals">
              <Button className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl shadow-lg shadow-blue-600/20">
                <Plus className="h-4 w-4 mr-1.5" /> New Deal
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {orderedStages.map(stage => {
              const cfg = stageConfig[stage];
              const data = pipelineMap[stage] || { count: 0, total_value: '0', weighted_value: '0' };
              const pct = totalPipeline > 0 ? (parseFloat(data.total_value || '0') / totalPipeline * 100) : 0;
              return (
                <div key={stage} className={`p-5 rounded-2xl bg-white/[0.03] border ${cfg.border} hover:bg-white/[0.05] transition-all duration-200`}>
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${cfg.color}`}>{cfg.label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.color}`}>{parseInt(data.count)}</span>
                  </div>
                  <p className="text-xl font-bold text-white">{fmtCurr(data.total_value)}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">Weighted: {fmtCurr(data.weighted_value)}</p>
                  <div className="mt-4 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r from-violet-500 to-blue-500`}
                      style={{ width: `${Math.max(pct, 3)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMReportsPage() {
  const [funnel, setFunnel] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [teamPerf, setTeamPerf] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [fRes, rRes, tRes] = await Promise.all([
          api.get('/crm/reports/sales-funnel', { headers: authHeaders() }),
          api.get('/crm/reports/revenue', { headers: authHeaders(), params: { period } }),
          api.get('/crm/reports/team-performance', { headers: authHeaders() }),
        ]);
        if (fRes.data.success) setFunnel(fRes.data.data);
        if (rRes.data.success) setRevenue(rRes.data.data);
        if (tRes.data.success) setTeamPerf(tRes.data.data);
      } catch (err: any) { if (err.response?.status === 401) navigate('/crm/login'); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, [period, navigate]);

  const fmtCurr = (v: any) => `₹${(parseFloat(v || 0)).toLocaleString('en-IN')}`;
  const funnelColors = ['bg-blue-500', 'bg-violet-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-amber-500', 'bg-emerald-500', 'bg-red-500'];
  const maxFunnel = Math.max(...funnel.map(f => parseInt(f.count || '0')), 1);

  return (
    <CRMLayout title="Reports">
      {loading ? (
        <div className="py-20 text-center"><div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-6">
          {/* Sales Funnel */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Sales Funnel</h3>
            </div>
            <div className="space-y-3">
              {funnel.map((f, i) => {
                const pct = maxFunnel > 0 ? Math.round((parseInt(f.count) / maxFunnel) * 100) : 0;
                return (
                  <div key={f.stage}>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="capitalize text-slate-400 font-medium">{f.stage}</span>
                      <span className="text-slate-300 font-semibold">{f.count}</span>
                    </div>
                    <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className={`h-full ${funnelColors[i] || 'bg-slate-500'} rounded-full transition-all duration-700`} style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Revenue */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Revenue Report</h3>
              </div>
              <select value={period} onChange={e => setPeriod(e.target.value)}
                className="h-8 px-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] text-slate-300 focus:outline-none">
                <option value="7" className="bg-[#0d1120]">7 days</option>
                <option value="30" className="bg-[#0d1120]">30 days</option>
                <option value="90" className="bg-[#0d1120]">90 days</option>
                <option value="365" className="bg-[#0d1120]">1 year</option>
              </select>
            </div>
            {revenue && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-2xl font-bold text-emerald-400">{fmtCurr(revenue.totals?.total_revenue)}</p>
                    <p className="text-[11px] text-emerald-500/80 mt-1">Total Revenue ({period}d)</p>
                  </div>
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <p className="text-2xl font-bold text-blue-400">{revenue.totals?.total_won || 0}</p>
                    <p className="text-[11px] text-blue-500/80 mt-1">Deals Won</p>
                  </div>
                </div>
                {revenue.daily?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Daily Breakdown</p>
                    {revenue.daily.slice(-10).map((d: any) => (
                      <div key={d.date} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
                        <span className="text-[11px] text-slate-500">{new Date(d.date).toLocaleDateString()}</span>
                        <span className="text-[11px] font-medium text-slate-300">{fmtCurr(d.revenue)} <span className="text-slate-600">({d.deals_won} deals)</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Team Performance */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-5">
              <Users className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-white">Team Performance</h3>
            </div>
            {teamPerf.length === 0 ? (
              <p className="text-sm text-slate-600 py-6 text-center">No team data yet</p>
            ) : (
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/[0.06]">
                    <th className={`${thClass} pl-4 text-left`}>Name</th>
                    <th className={`${thClass} text-center`}>Leads</th>
                    <th className={`${thClass} text-center`}>Converted</th>
                    <th className={`${thClass} text-center`}>Won</th>
                    <th className={`${thClass} text-right`}>Revenue</th>
                    <th className={`${thClass} pr-4 text-center`}>Activities</th>
                  </tr></thead>
                  <tbody>
                    {teamPerf.map((t: any) => (
                      <tr key={t.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-3 pl-4"><p className="font-medium text-white">{t.firstName} {t.lastName}</p><p className="text-[10px] text-slate-600">{t.email}</p></td>
                        <td className="py-3 text-center text-slate-400">{t.total_leads}</td>
                        <td className="py-3 text-center text-emerald-400 font-medium">{t.converted_leads}</td>
                        <td className="py-3 text-center text-blue-400 font-medium">{t.won_deals}</td>
                        <td className="py-3 text-right font-medium text-emerald-400">{fmtCurr(t.revenue)}</td>
                        <td className="py-3 pr-4 text-center text-slate-400">{t.total_activities}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMSettingsPage() {
  const navigate = useNavigate();
  const [crmUser, setCrmUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    if (!token) { navigate('/crm/login'); return; }
    const fetchProfile = async () => {
      try {
        const { data } = await api.get('/crm/profile', { headers: authHeaders() });
        if (data.success) setCrmUser(data.crmUser);
      } catch {}
    };
    fetchProfile();
  }, [navigate]);

  return (
    <CRMLayout title="Settings">
      <div className="max-w-2xl">
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <h3 className="text-base font-semibold text-white mb-5">CRM Profile</h3>
          {crmUser ? (
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center text-xl font-bold text-violet-300 flex-shrink-0">
                {(crmUser.firstName?.[0] || '') + (crmUser.lastName?.[0] || '')}
              </div>
              <div>
                <p className="text-lg font-bold text-white">{crmUser.firstName} {crmUser.lastName}</p>
                <p className="text-sm text-slate-500">{crmUser.email}</p>
                <p className="text-xs text-slate-600 mt-1">{crmUser.designation || 'CRM User'} &middot; {crmUser.department || 'Sales'}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/[0.05] animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-white/[0.05] rounded animate-pulse" />
                <div className="h-3 w-48 bg-white/[0.05] rounded animate-pulse" />
              </div>
            </div>
          )}
        </div>
      </div>
    </CRMLayout>
  );
}

// ─── Team Management — create CRM logins and assign roles ─────────────────────

interface CRMTeamMember {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  crmRole: string;
  department: string | null;
  designation: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export function CRMTeamPage() {
  const navigate = useNavigate();
  const [crmUser, setCrmUser] = useState<any>(null);
  const [members, setMembers] = useState<CRMTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', crmRole: CRM_ROLES.SALES_REP, department: '', designation: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    if (!token) { navigate('/crm/login'); return; }
    let user: any = null;
    try { const d = localStorage.getItem('crmUserData'); if (d) user = JSON.parse(d); } catch {}
    setCrmUser(user);
    if (!hasCRMCapability(user, 'team:manage')) { navigate('/crm/dashboard', { replace: true }); return; }
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const loadMembers = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/crm/team/users', { headers: authHeaders() });
      setMembers(data?.data || []);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Unable to load CRM team members.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/crm/team/users', form, { headers: authHeaders() });
      setNotice(data.message || 'CRM login created.');
      setForm({ firstName: '', lastName: '', email: '', phone: '', crmRole: CRM_ROLES.SALES_REP, department: '', designation: '' });
      setShowForm(false);
      await loadMembers();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Unable to create CRM login.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (id: number, crmRole: string) => {
    setError('');
    try {
      await api.patch(`/crm/team/users/${id}`, { crmRole }, { headers: authHeaders() });
      await loadMembers();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Unable to update role.');
    }
  };

  const handleStatusToggle = async (member: CRMTeamMember) => {
    const nextStatus = member.status === 'active' ? 'inactive' : 'active';
    setError('');
    try {
      await api.patch(`/crm/team/users/${member.id}`, { status: nextStatus }, { headers: authHeaders() });
      await loadMembers();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Unable to update status.');
    }
  };

  if (!crmUser) return null;

  return (
    <CRMLayout title="Team">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">CRM administration</p>
            <h2 className="mt-1 text-2xl font-bold text-white">Team &amp; Roles</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Create CRM logins and assign each one a role — Business Head, Marketing Head, Marketing, Telecaller,
              Conversion, or Sales Representative. Roles control which dashboards and sidebar links each login can see.
            </p>
          </div>
          <Button onClick={() => setShowForm((v) => !v)} className="gap-2 bg-violet-600 hover:bg-violet-500">
            <Plus className="h-4 w-4" /> Add team member
          </Button>
        </div>

        {notice && <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{notice}</div>}
        {error && <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div>}

        {showForm && (
          <form onSubmit={handleCreate} className="grid gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-slate-400">First name</Label>
              <Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="mt-1 border-white/10 bg-black/20 text-white" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Last name</Label>
              <Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="mt-1 border-white/10 bg-black/20 text-white" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Email</Label>
              <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 border-white/10 bg-black/20 text-white" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Phone</Label>
              <Input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91XXXXXXXXXX" className="mt-1 border-white/10 bg-black/20 text-white placeholder:text-slate-600" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Role</Label>
              <select value={form.crmRole} onChange={(e) => setForm({ ...form, crmRole: e.target.value })}
                className="mt-1 h-10 w-full rounded-md border border-white/10 bg-[#111827] px-3 text-sm text-white">
                {CRM_ROLE_LIST.map((role) => (
                  <option key={role} value={role}>{CRM_ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Department</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="e.g. Marketing" className="mt-1 border-white/10 bg-black/20 text-white placeholder:text-slate-600" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Designation</Label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}
                placeholder="e.g. Telecaller — OPD" className="mt-1 border-white/10 bg-black/20 text-white placeholder:text-slate-600" />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-500">
              No password is set here — a password-setup email is sent to the new login automatically.
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="border-white/10 text-slate-200">Cancel</Button>
              <Button type="submit" disabled={submitting} className="bg-violet-600 hover:bg-violet-500">
                {submitting ? 'Creating…' : 'Create login'}
              </Button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.03]">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] text-slate-300">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-white">{m.firstName} {m.lastName}</td>
                  <td className="px-4 py-3">{m.email}</td>
                  <td className="px-4 py-3">
                    <select value={m.crmRole} onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className="h-8 rounded-md border border-white/10 bg-[#111827] px-2 text-xs text-white">
                      {CRM_ROLE_LIST.map((role) => (
                        <option key={role} value={role}>{CRM_ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">{m.department || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={m.status === 'active' ? 'text-emerald-300' : 'text-slate-500'}>{m.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : 'Never'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleStatusToggle(m)} className="text-xs text-violet-300 hover:text-violet-200">
                      {m.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !members.length && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No CRM team members yet — add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </CRMLayout>
  );
}
