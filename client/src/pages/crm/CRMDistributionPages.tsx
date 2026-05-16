import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Users, UserCheck, Building2, IndianRupee, Plus, Search,
  ChevronLeft, ChevronRight, X, CheckCircle2, Clock,
  AlertTriangle, TrendingUp, Award, BadgePercent, Banknote,
  MapPin, Phone, Mail, ShieldCheck, Star, Zap, BarChart3,
  ArrowUpRight, ArrowDownRight, RefreshCw, Download,
  FileText, CalendarDays, RotateCcw, Layers, Briefcase,
  CircleDollarSign, BadgeCheck, SquareArrowOutUpRight, Trash2, Edit,
} from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';

function authHeaders() {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-6">
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}
        className="px-3 py-1.5 rounded-lg text-sm bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm text-slate-500">{page} / {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
        className="px-3 py-1.5 rounded-lg text-sm bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

const thClass = 'pb-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-left';
const tdClass = 'py-3.5 text-sm text-slate-300';

// ─── Commission Rate Card (reference data) ────────────────────────────────────
const COMMISSION_RATES: Record<string, { y1: number; renewal: number; label: string; color: string }> = {
  BASIC_FREE:   { y1: 0,    renewal: 0,   label: 'Basic',        color: 'text-slate-400' },
  SILVER:       { y1: 150,  renewal: 0,   label: 'Silver',       color: 'text-slate-300' },
  SILVER_PLUS:  { y1: 600,  renewal: 300, label: 'Silver Plus',  color: 'text-blue-400'  },
  SILVER_ELITE: { y1: 900,  renewal: 400, label: 'Silver Elite', color: 'text-indigo-400'},
  GOLD:         { y1: 400,  renewal: 200, label: 'Gold',         color: 'text-amber-400' },
  PLATINUM:     { y1: 550,  renewal: 250, label: 'Platinum',     color: 'text-sky-400'   },
  DIAMOND:      { y1: 1800, renewal: 750, label: 'Diamond',      color: 'text-purple-400'},
};

const AGENCY_TIERS = [
  { label: 'Bronze', min: 10,  max: 49,  bonus: 0,   color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  { label: 'Silver', min: 50,  max: 99,  bonus: 5,   color: 'text-slate-300',  bg: 'bg-slate-500/10 border-slate-500/20'  },
  { label: 'Gold',   min: 100, max: 199, bonus: 10,  color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20'  },
  { label: 'Platinum',min:200, max:9999, bonus: 15,  color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20'},
];

function agencyTier(activations: number) {
  return AGENCY_TIERS.find(t => activations >= t.min && activations <= t.max) ?? AGENCY_TIERS[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const CHANNEL_TYPES = ['IFA', 'Agency', 'Clinic', 'Pharmacy', 'Affiliate', 'Corporate'];
const CITY_CODES: Record<string, string> = {
  Mumbai: 'MUM', Delhi: 'DEL', Bangalore: 'BLR', Hyderabad: 'HYD',
  Chennai: 'CHE', Pune: 'PUN', Ahmedabad: 'AMD', Kolkata: 'KOL',
};

export function CRMAgentsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editAgent, setEditAgent] = useState<any>(null);
  const [stats, setStats] = useState({ total: 0, active: 0, pendingPayout: 0, totalPaid: 0 });
  const emptyForm = { name: '', email: '', phone: '', city: 'Mumbai', channelType: 'IFA', agencyId: '', notes: '' };
  const [form, setForm] = useState(emptyForm);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (channelFilter !== 'all') params.channelType = channelFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/crm/agents', { headers: authHeaders(), params });
      if (data.success) {
        setAgents(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        if (data.stats) setStats(data.stats);
      }
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/crm/login');
      // Fallback: show empty state gracefully
      setAgents([]);
    } finally { setLoading(false); }
  }, [page, search, channelFilter, statusFilter, navigate]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const generateCode = (city: string, channel: string, seq: number) => {
    const cc = CITY_CODES[city] || 'XXX';
    const ch = { IFA: 'IFA', Agency: 'AGY', Clinic: 'CLN', Pharmacy: 'PHR', Affiliate: 'AFF', Corporate: 'CRP' }[channel] || 'IFA';
    return `MQZ-${cc}-${ch}-${String(seq).padStart(3, '0')}`;
  };

  const handleSave = async () => {
    try {
      const payload = { ...form, agentCode: editAgent?.agentCode || generateCode(form.city, form.channelType, agents.length + 1) };
      if (editAgent) await api.put(`/crm/agents/${editAgent.id}`, payload, { headers: authHeaders() });
      else await api.post('/crm/agents', payload, { headers: authHeaders() });
      setShowForm(false); setEditAgent(null); setForm(emptyForm);
      fetchAgents();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Save failed');
    }
  };

  const openEdit = (a: any) => {
    setEditAgent(a);
    setForm({ name: a.name, email: a.email || '', phone: a.phone || '', city: a.city || 'Mumbai', channelType: a.channelType || 'IFA', agencyId: a.agencyId || '', notes: a.notes || '' });
    setShowForm(true);
  };

  const deleteAgent = async (id: number, name: string) => {
    if (!window.confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/crm/agents/${id}`, { headers: authHeaders() });
      fetchAgents();
    } catch (err: any) { alert(err.response?.data?.message || 'Delete failed'); }
  };

  const tierColor = (ct: string) => ({
    IFA: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    Agency: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    Clinic: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
    Pharmacy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    Affiliate: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
    Corporate: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  }[ct] || 'bg-slate-500/15 text-slate-400');

  return (
    <CRMLayout title="Agents & Partners">
      <div className="space-y-5">

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Agents', value: stats.total, icon: Users, color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Active', value: stats.active, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Pending Payout', value: `₹${(stats.pendingPayout || 0).toLocaleString('en-IN')}`, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
            { label: 'Total Paid (YTD)', value: `₹${(stats.totalPaid || 0).toLocaleString('en-IN')}`, icon: Banknote, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
                  <div className="text-lg font-bold text-white">{value}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              <input placeholder="Search agents..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30 transition-colors" />
            </div>
            <select value={channelFilter} onChange={e => { setChannelFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none focus:border-violet-500/30">
              <option value="all" className="bg-[#0d1120]">All Channels</option>
              {CHANNEL_TYPES.map(c => <option key={c} value={c} className="bg-[#0d1120]">{c}</option>)}
            </select>
          </div>
          <button onClick={() => { setEditAgent(null); setForm(emptyForm); setShowForm(true); }}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-sm font-medium flex items-center gap-1.5 shadow-lg shadow-violet-600/20 transition-all">
            <Plus className="h-4 w-4" /> Add Agent
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{editAgent ? 'Edit Agent' : 'Register New Agent/Partner'}</h3>
              <button onClick={() => { setShowForm(false); setEditAgent(null); }} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { label: 'Full Name *', field: 'name', placeholder: 'Agent name' },
                { label: 'Email', field: 'email', placeholder: 'Email', type: 'email' },
                { label: 'Phone', field: 'phone', placeholder: 'Mobile number' },
              ].map(({ label, field, placeholder, type }) => (
                <div key={field} className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</label>
                  <input type={type || 'text'} value={(form as any)[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} placeholder={placeholder}
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">City</label>
                <select value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  {Object.keys(CITY_CODES).map(c => <option key={c} value={c} className="bg-[#0d1120]">{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Channel Type</label>
                <select value={form.channelType} onChange={e => setForm({ ...form, channelType: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  {CHANNEL_TYPES.map(c => <option key={c} value={c} className="bg-[#0d1120]">{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes"
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
            </div>
            {!editAgent && (
              <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/15">
                <p className="text-[11px] text-violet-400">Agent code will be auto-generated: <span className="font-mono font-bold">{generateCode(form.city, form.channelType, agents.length + 1)}</span></p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowForm(false); setEditAgent(null); }} className="h-9 px-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} className="h-9 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-medium hover:from-violet-500 hover:to-blue-500 transition-all">
                {editAgent ? 'Update Agent' : 'Register Agent'}
              </button>
            </div>
          </div>
        )}

        {/* Commission Rate Card Reference */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <BadgePercent className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">IFA Commission Rate Card</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            {Object.entries(COMMISSION_RATES).map(([code, r]) => (
              <div key={code} className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
                <div className={`text-[10px] font-semibold ${r.color} mb-1`}>{r.label}</div>
                <div className="text-sm font-bold text-white">₹{r.y1}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Y1</div>
                {r.renewal > 0 && <div className="text-[9px] text-slate-500 mt-0.5">₹{r.renewal}/yr renewal</div>}
                {code === 'SILVER' && <div className="text-[8px] text-amber-500 mt-0.5">Day 91 only</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-white">Agent Directory</h3>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <RefreshCw className="h-5 w-5 text-violet-400 animate-spin" />
              <span className="text-sm text-slate-500">Loading agents...</span>
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Users className="h-10 w-10 text-slate-700" />
              <p className="text-sm text-slate-500">No agents registered yet</p>
              <button onClick={() => { setEditAgent(null); setForm(emptyForm); setShowForm(true); }}
                className="h-9 px-4 rounded-xl bg-violet-500/15 text-violet-400 text-sm border border-violet-500/20 hover:bg-violet-500/20 transition-colors">
                Register First Agent
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06] px-5">
                    <th className={`${thClass} pl-5`}>Agent</th>
                    <th className={thClass}>Code</th>
                    <th className={thClass}>Channel</th>
                    <th className={thClass}>City</th>
                    <th className={thClass}>Activations</th>
                    <th className={thClass}>Earned (YTD)</th>
                    <th className={thClass}>Pending</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} pr-5`}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {agents.map((a) => (
                    <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className={`${tdClass} pl-5`}>
                        <div className="font-medium text-white">{a.name}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5">{a.email || a.phone}</div>
                      </td>
                      <td className={tdClass}><span className="font-mono text-xs text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">{a.agentCode || '—'}</span></td>
                      <td className={tdClass}><span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${tierColor(a.channelType)}`}>{a.channelType || 'IFA'}</span></td>
                      <td className={tdClass}><span className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" />{a.city || '—'}</span></td>
                      <td className={tdClass}><span className="text-white font-semibold">{a.totalActivations || 0}</span></td>
                      <td className={tdClass}><span className="text-emerald-400 font-semibold">₹{(a.totalEarned || 0).toLocaleString('en-IN')}</span></td>
                      <td className={tdClass}><span className="text-amber-400 font-semibold">₹{(a.pendingPayout || 0).toLocaleString('en-IN')}</span></td>
                      <td className={tdClass}>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${a.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                          {a.status || 'active'}
                        </span>
                      </td>
                      <td className={`${tdClass} pr-5 text-right`}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(a)} className="text-[11px] text-slate-500 hover:text-violet-400 transition-colors px-2 py-1 rounded hover:bg-violet-500/10 flex items-center gap-1">
                            <Edit className="h-3 w-3" /> Edit
                          </button>
                          <button onClick={() => deleteAgent(a.id, a.name)} className="text-[11px] text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-500/10">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENCIES PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const ONBOARDING_STEPS = [
  { step: 1, label: 'Application',     desc: 'Submitted & screened' },
  { step: 2, label: 'Agreement',       desc: 'CPA signed digitally' },
  { step: 3, label: 'Training',        desc: 'All modules completed' },
  { step: 4, label: 'Kit Dispatched',  desc: 'Digital + physical kit' },
  { step: 5, label: 'Go-Live',         desc: 'First activation done' },
];

export function CRMAgenciesPage() {
  const navigate = useNavigate();
  const [agencies, setAgencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editAgency, setEditAgency] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'directory' | 'onboarding' | 'tiers'>('directory');
  const [stats, setStats] = useState({ total: 0, active: 0, totalActivations: 0, totalOverride: 0 });
  const emptyForm = { name: '', ownerName: '', email: '', phone: '', city: 'Mumbai', territory: '', gstin: '', onboardingStep: 1, notes: '' };
  const [form, setForm] = useState(emptyForm);

  const fetchAgencies = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (tierFilter !== 'all') params.tier = tierFilter;
      const { data } = await api.get('/crm/agencies', { headers: authHeaders(), params });
      if (data.success) {
        setAgencies(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        if (data.stats) setStats(data.stats);
      }
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/crm/login');
      setAgencies([]);
    } finally { setLoading(false); }
  }, [page, search, tierFilter, navigate]);

  useEffect(() => { fetchAgencies(); }, [fetchAgencies]);

  const handleSave = async () => {
    try {
      if (editAgency) await api.put(`/crm/agencies/${editAgency.id}`, form, { headers: authHeaders() });
      else await api.post('/crm/agencies', form, { headers: authHeaders() });
      setShowForm(false); setEditAgency(null); setForm(emptyForm);
      fetchAgencies();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Save failed');
    }
  };

  const openEdit = (a: any) => {
    setEditAgency(a);
    setForm({ name: a.name, ownerName: a.ownerName || '', email: a.email || '', phone: a.phone || '', city: a.city || 'Mumbai', territory: a.territory || '', gstin: a.gstin || '', onboardingStep: a.onboardingStep || 1, notes: a.notes || '' });
    setShowForm(true);
  };

  const advanceStep = async (agency: any) => {
    if (agency.onboardingStep >= 5) return;
    try {
      await api.put(`/crm/agencies/${agency.id}`, { ...agency, onboardingStep: agency.onboardingStep + 1 }, { headers: authHeaders() });
      fetchAgencies();
    } catch {}
  };

  const deleteAgency = async (id: number, name: string) => {
    if (!window.confirm(`Delete agency "${name}"? All associated agents will be unlinked.`)) return;
    try {
      await api.delete(`/crm/agencies/${id}`, { headers: authHeaders() });
      fetchAgencies();
    } catch (err: any) { alert(err.response?.data?.message || 'Delete failed'); }
  };

  return (
    <CRMLayout title="Agencies & Channel Partners">
      <div className="space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Agencies', value: stats.total, icon: Building2, color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Active', value: stats.active, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Total Activations', value: stats.totalActivations, icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Override Paid (YTD)', value: `₹${(stats.totalOverride || 0).toLocaleString('en-IN')}`, icon: IndianRupee, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
                  <div className="text-lg font-bold text-white">{value}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-fit">
          {([['directory', 'Directory'], ['onboarding', 'Onboarding Pipeline'], ['tiers', 'Tier Structure']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === key ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Tiers Reference */}
        {activeTab === 'tiers' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {AGENCY_TIERS.map((t) => (
              <div key={t.label} className={`p-5 rounded-2xl border ${t.bg} space-y-3`}>
                <div className={`text-sm font-bold ${t.color} flex items-center gap-2`}>
                  <Award className="h-4 w-4" /> {t.label} Partner
                </div>
                <div className="space-y-2 text-xs text-slate-400">
                  <div className="flex justify-between"><span>Monthly activations</span><span className="text-white font-semibold">{t.min}–{t.max === 9999 ? '200+' : t.max}</span></div>
                  <div className="flex justify-between"><span>Bonus on commissions</span><span className={`font-semibold ${t.color}`}>{t.bonus > 0 ? `+${t.bonus}%` : 'None'}</span></div>
                  {t.bonus >= 10 && <div className="flex justify-between"><span>Marketing budget</span><span className="text-white font-semibold">₹10,000/qtr</span></div>}
                  {t.bonus >= 15 && <div className="flex justify-between"><span>Territory exclusivity</span><span className="text-emerald-400 font-semibold">Available</span></div>}
                </div>
                <div className="pt-2 border-t border-white/[0.08]">
                  <div className="text-[10px] text-slate-600">Override commission on team activations</div>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {[['Gold', 100], ['Diamond', 400]].map(([plan, base]) => (
                      <div key={plan as string} className="text-[10px] text-slate-500">
                        {plan}: <span className="text-white">₹{Math.round((base as number) * (1 + t.bonus / 100))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Onboarding Pipeline */}
        {activeTab === 'onboarding' && (
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="h-4 w-4 text-violet-400" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">5-Step Agency Onboarding Process</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {ONBOARDING_STEPS.map((s, i) => (
                  <div key={s.step} className="flex flex-col items-center text-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-sm font-bold text-violet-400">{s.step}</div>
                    <div className="text-xs font-semibold text-white">{s.label}</div>
                    <div className="text-[10px] text-slate-500">{s.desc}</div>
                    {i < ONBOARDING_STEPS.length - 1 && <div className="hidden sm:block absolute w-full h-px bg-violet-500/10 top-4 left-1/2" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Agencies in pipeline */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white">Agencies in Onboarding</h3>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12 gap-3"><RefreshCw className="h-4 w-4 text-violet-400 animate-spin" /><span className="text-sm text-slate-500">Loading...</span></div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {agencies.filter(a => (a.onboardingStep || 5) < 5).map(a => {
                    const step = a.onboardingStep || 1;
                    return (
                      <div key={a.id} className="px-5 py-4 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-white">{a.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{a.ownerName} · {a.city}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            {ONBOARDING_STEPS.map(s => (
                              <div key={s.step} className={`w-6 h-1.5 rounded-full ${s.step <= step ? 'bg-violet-500' : 'bg-white/[0.08]'}`} title={s.label} />
                            ))}
                          </div>
                          <span className="text-[11px] text-slate-400">{ONBOARDING_STEPS[step - 1]?.label}</span>
                          {step < 5 && (
                            <button onClick={() => advanceStep(a)}
                              className="h-7 px-3 rounded-lg bg-violet-500/15 text-violet-400 text-[11px] border border-violet-500/20 hover:bg-violet-500/25 transition-colors">
                              Advance
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {agencies.filter(a => (a.onboardingStep || 5) < 5).length === 0 && (
                    <div className="flex items-center justify-center py-10 text-sm text-slate-500">No agencies in onboarding pipeline</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Directory */}
        {activeTab === 'directory' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <div className="flex gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
                  <input placeholder="Search agencies..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
                </div>
                <select value={tierFilter} onChange={e => { setTierFilter(e.target.value); setPage(1); }}
                  className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  <option value="all" className="bg-[#0d1120]">All Tiers</option>
                  {AGENCY_TIERS.map(t => <option key={t.label} value={t.label} className="bg-[#0d1120]">{t.label}</option>)}
                </select>
              </div>
              <button onClick={() => { setEditAgency(null); setForm(emptyForm); setShowForm(true); }}
                className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-sm font-medium flex items-center gap-1.5 shadow-lg shadow-violet-600/20 transition-all">
                <Plus className="h-4 w-4" /> Add Agency
              </button>
            </div>

            {showForm && (
              <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{editAgency ? 'Edit Agency' : 'Onboard New Agency Partner'}</h3>
                  <button onClick={() => { setShowForm(false); setEditAgency(null); }} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { label: 'Agency / Firm Name *', field: 'name', placeholder: 'Agency name' },
                    { label: 'Owner / POC Name', field: 'ownerName', placeholder: 'Contact person' },
                    { label: 'Email', field: 'email', placeholder: 'Email', type: 'email' },
                    { label: 'Phone', field: 'phone', placeholder: 'Mobile' },
                    { label: 'GSTIN', field: 'gstin', placeholder: 'GST registration number' },
                    { label: 'Territory', field: 'territory', placeholder: 'e.g. South Mumbai, Bandra' },
                  ].map(({ label, field, placeholder, type }) => (
                    <div key={field} className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</label>
                      <input type={type || 'text'} value={(form as any)[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} placeholder={placeholder}
                        className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">City</label>
                    <select value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                      className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                      {Object.keys(CITY_CODES).map(c => <option key={c} value={c} className="bg-[#0d1120]">{c}</option>)}
                    </select>
                  </div>
                  {editAgency && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Onboarding Step</label>
                      <select value={form.onboardingStep} onChange={e => setForm({ ...form, onboardingStep: Number(e.target.value) })}
                        className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                        {ONBOARDING_STEPS.map(s => <option key={s.step} value={s.step} className="bg-[#0d1120]">Step {s.step}: {s.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setShowForm(false); setEditAgency(null); }} className="h-9 px-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={handleSave} className="h-9 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-medium hover:from-violet-500 hover:to-blue-500 transition-all">
                    {editAgency ? 'Update Agency' : 'Onboard Agency'}
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06]"><h3 className="text-sm font-semibold text-white">Agency Partners</h3></div>
              {loading ? (
                <div className="flex items-center justify-center py-20 gap-3"><RefreshCw className="h-5 w-5 text-violet-400 animate-spin" /><span className="text-sm text-slate-500">Loading...</span></div>
              ) : agencies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Building2 className="h-10 w-10 text-slate-700" />
                  <p className="text-sm text-slate-500">No agency partners yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={`${thClass} pl-5`}>Agency</th>
                        <th className={thClass}>Territory</th>
                        <th className={thClass}>Tier</th>
                        <th className={thClass}>Agents</th>
                        <th className={thClass}>Activations/mo</th>
                        <th className={thClass}>Override (YTD)</th>
                        <th className={thClass}>Onboarding</th>
                        <th className={`${thClass} pr-5`}></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {agencies.map((a) => {
                        const tier = agencyTier(a.monthlyActivations || 0);
                        return (
                          <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className={`${tdClass} pl-5`}>
                              <div className="font-medium text-white">{a.name}</div>
                              <div className="text-[11px] text-slate-600 mt-0.5">{a.ownerName}</div>
                            </td>
                            <td className={tdClass}><span className="text-xs text-slate-400">{a.territory || a.city || '—'}</span></td>
                            <td className={tdClass}>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tier.bg} ${tier.color}`}>{tier.label}</span>
                            </td>
                            <td className={tdClass}><span className="text-white font-semibold">{a.agentCount || 0}</span></td>
                            <td className={tdClass}>
                              <span className="text-white font-semibold">{a.monthlyActivations || 0}</span>
                              {tier.bonus > 0 && <span className={`ml-1.5 text-[10px] ${tier.color}`}>+{tier.bonus}% bonus</span>}
                            </td>
                            <td className={tdClass}><span className="text-emerald-400 font-semibold">₹{(a.totalOverride || 0).toLocaleString('en-IN')}</span></td>
                            <td className={tdClass}>
                              <div className="flex gap-1">
                                {ONBOARDING_STEPS.map(s => (
                                  <div key={s.step} className={`w-4 h-1 rounded-full ${s.step <= (a.onboardingStep || 1) ? 'bg-violet-500' : 'bg-white/[0.08]'}`} title={s.label} />
                                ))}
                              </div>
                              <div className="text-[10px] text-slate-600 mt-0.5">{ONBOARDING_STEPS[(a.onboardingStep || 1) - 1]?.label}</div>
                            </td>
                            <td className={`${tdClass} pr-5 text-right`}>
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEdit(a)} className="text-[11px] text-slate-500 hover:text-violet-400 transition-colors px-2 py-1 rounded hover:bg-violet-500/10 flex items-center gap-1">
                                  <Edit className="h-3 w-3" /> Edit
                                </button>
                                <button onClick={() => deleteAgency(a.id, a.name)} className="text-[11px] text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-500/10">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          </>
        )}
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMISSIONS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const PAYOUT_STATUS_STYLE: Record<string, string> = {
  pending:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  paid:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  clawback:  'bg-red-500/10 text-red-400 border-red-500/20',
  on_hold:   'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export function CRMCommissionsPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'ledger' | 'ratecard' | 'summary'>('ledger');
  const [summary, setSummary] = useState({ totalPending: 0, totalApproved: 0, totalPaid: 0, clawbacks: 0, nextPayoutDate: '15 May 2026' });

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (planFilter !== 'all') params.planCode = planFilter;
      const { data } = await api.get('/crm/commissions', { headers: authHeaders(), params });
      if (data.success) {
        setRecords(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        if (data.summary) setSummary(data.summary);
      }
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/crm/login');
      setRecords([]);
    } finally { setLoading(false); }
  }, [page, search, statusFilter, planFilter, navigate]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  const markPaid = async (id: number) => {
    try {
      await api.put(`/crm/commissions/${id}`, { status: 'paid', paidAt: new Date().toISOString() }, { headers: authHeaders() });
      fetchCommissions();
    } catch {}
  };

  const markClawback = async (id: number) => {
    if (!window.confirm('Mark this commission as clawback?')) return;
    try {
      await api.put(`/crm/commissions/${id}`, { status: 'clawback' }, { headers: authHeaders() });
      fetchCommissions();
    } catch {}
  };

  return (
    <CRMLayout title="Commissions & Payouts">
      <div className="space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Pending Payout', value: `₹${(summary.totalPending || 0).toLocaleString('en-IN')}`, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', trend: 'Due ' + summary.nextPayoutDate },
            { label: 'Approved (this month)', value: `₹${(summary.totalApproved || 0).toLocaleString('en-IN')}`, icon: CheckCircle2, color: 'text-blue-400', bg: 'bg-blue-500/10', trend: '' },
            { label: 'Total Paid (YTD)', value: `₹${(summary.totalPaid || 0).toLocaleString('en-IN')}`, icon: Banknote, color: 'text-emerald-400', bg: 'bg-emerald-500/10', trend: '' },
            { label: 'Clawbacks (YTD)', value: `₹${(summary.clawbacks || 0).toLocaleString('en-IN')}`, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', trend: '' },
          ].map(({ label, value, icon: Icon, color, bg, trend }) => (
            <div key={label} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
                  <div className="text-lg font-bold text-white">{value}</div>
                  {trend && <div className="text-[10px] text-slate-600 mt-0.5">{trend}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-fit">
          {([['ledger', 'Commission Ledger'], ['ratecard', 'Rate Card'], ['summary', 'Payout Rules']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === key ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Rate Card */}
        {activeTab === 'ratecard' && (
          <div className="space-y-4">
            {/* Personal Plans */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-4">
                <Star className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Personal Plans — IFA Commission</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['Plan', 'Monthly Price', 'IFA Y1', 'IFA Renewal', 'Agency Override', 'Affiliate', 'Condition'].map(h => (
                        <th key={h} className={thClass}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {[
                      { plan: 'Basic',        price: '₹0',     y1: '₹0',     renewal: '—',     agency: '₹0',    aff: '₹0',    note: 'Acquisition only' },
                      { plan: 'Silver',       price: '₹299',   y1: '₹150',   renewal: '—',     agency: '₹50',   aff: '₹150',  note: 'Paid on Day 91' },
                      { plan: 'Silver Plus',  price: '₹499',   y1: '₹600',   renewal: '₹300',  agency: '₹150',  aff: '₹500',  note: 'Paid on Day 31' },
                      { plan: 'Silver Elite', price: '₹699',   y1: '₹900',   renewal: '₹400',  agency: '₹200',  aff: '₹500',  note: 'Paid on Day 31' },
                      { plan: 'Gold',         price: '₹399',   y1: '₹400',   renewal: '₹200',  agency: '₹100',  aff: '₹150',  note: 'Paid on Day 31' },
                      { plan: 'Platinum',     price: '₹499',   y1: '₹550',   renewal: '₹250',  agency: '₹125',  aff: '₹150',  note: 'Paid on Day 31' },
                      { plan: 'Diamond',      price: '₹1,499', y1: '₹1,800', renewal: '₹750',  agency: '₹400',  aff: '₹1,000',note: 'Paid on Day 31' },
                    ].map(r => (
                      <tr key={r.plan} className="hover:bg-white/[0.02] transition-colors">
                        <td className={tdClass}><span className="font-semibold text-white">{r.plan}</span></td>
                        <td className={tdClass}>{r.price}</td>
                        <td className={`${tdClass} font-semibold text-emerald-400`}>{r.y1}</td>
                        <td className={tdClass}>{r.renewal}</td>
                        <td className={`${tdClass} text-blue-400`}>{r.agency}</td>
                        <td className={`${tdClass} text-pink-400`}>{r.aff}</td>
                        <td className={tdClass}><span className="text-[10px] text-slate-500">{r.note}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Corporate */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Corporate Plans — B2B Broker Commission (% of ACV)</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { size: '10–49 employees', rate: '12%', timing: '100% on receipt' },
                  { size: '50–199 employees', rate: '15%', timing: '50% on signing + 50% at M6' },
                  { size: '200+ employees', rate: '18%', timing: 'Custom schedule' },
                  { size: 'Renewal (any)', rate: '8%', timing: 'On renewal payment' },
                ].map(r => (
                  <div key={r.size} className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <div className="text-xs text-slate-400 mb-1">{r.size}</div>
                    <div className="text-2xl font-bold text-blue-400">{r.rate}</div>
                    <div className="text-[10px] text-slate-600 mt-1">{r.timing}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Annual billing bonus */}
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/15 flex items-center gap-3">
              <Zap className="h-5 w-5 text-amber-400 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-amber-400">Annual Billing Bonus: +₹200 flat on any plan</div>
                <div className="text-xs text-slate-500 mt-0.5">Paid to IFA when subscriber commits to annual billing at point of sale</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Payout Rules */}
        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { title: 'Payout Cycle', icon: Clock, color: 'text-violet-400', items: ['Commissions paid on 15th of following month', 'Cooling-off window: 30 days post activation', 'Silver IFA: held 90 days (retention trigger)', 'Annual billing payout: after Day 31'] },
              { title: 'Clawback Rules', icon: AlertTriangle, color: 'text-red-400', items: ['Annual plan cancelled within 3 months: 50% clawback', 'Clawback deducted from next payout cycle', 'Fraudulent activations: full clawback + suspension', 'Silver clawback if cancelled before Day 91'] },
              { title: 'Commission Calculation', icon: BarChart3, color: 'text-blue-400', items: ['Calculated on standard face price only', 'Discounted price: commission on discounted amount', 'No double attribution (first-touch wins)', 'Stacking not permitted (one channel per activation)'] },
              { title: 'Disqualification', icon: AlertTriangle, color: 'text-amber-400', items: ['Self-referral or fake account creation', 'Misrepresentation of plan benefits', 'Active competing platform representation', 'No activation for 60 consecutive days (agency)'] },
            ].map(({ title, icon: Icon, color, items }) => (
              <div key={title} className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="text-sm font-semibold text-white">{title}</span>
                </div>
                <ul className="space-y-2">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs text-slate-400">
                      <div className="w-1 h-1 rounded-full bg-slate-600 mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Commission Ledger */}
        {activeTab === 'ledger' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <div className="flex gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
                  <input placeholder="Search agent or subscriber..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
                </div>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                  className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  <option value="all" className="bg-[#0d1120]">All Status</option>
                  {['pending', 'approved', 'paid', 'clawback', 'on_hold'].map(s => <option key={s} value={s} className="bg-[#0d1120]">{s.replace('_', ' ').toUpperCase()}</option>)}
                </select>
                <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
                  className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  <option value="all" className="bg-[#0d1120]">All Plans</option>
                  {Object.keys(COMMISSION_RATES).map(c => <option key={c} value={c} className="bg-[#0d1120]">{COMMISSION_RATES[c].label}</option>)}
                </select>
              </div>
              <button className="h-10 px-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors">
                <Download className="h-4 w-4" /> Export
              </button>
            </div>

            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06]"><h3 className="text-sm font-semibold text-white">Commission Ledger</h3></div>
              {loading ? (
                <div className="flex items-center justify-center py-20 gap-3"><RefreshCw className="h-5 w-5 text-violet-400 animate-spin" /><span className="text-sm text-slate-500">Loading...</span></div>
              ) : records.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <IndianRupee className="h-10 w-10 text-slate-700" />
                  <p className="text-sm text-slate-500">No commission records yet</p>
                  <p className="text-xs text-slate-600">Records appear automatically when agents activate subscribers</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={`${thClass} pl-5`}>Subscriber</th>
                        <th className={thClass}>Agent</th>
                        <th className={thClass}>Plan</th>
                        <th className={thClass}>Amount</th>
                        <th className={thClass}>Type</th>
                        <th className={thClass}>Activation Date</th>
                        <th className={thClass}>Eligible Date</th>
                        <th className={thClass}>Status</th>
                        <th className={`${thClass} pr-5`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {records.map((r) => (
                        <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className={`${tdClass} pl-5`}>
                            <div className="font-medium text-white">{r.subscriberName || '—'}</div>
                            <div className="text-[11px] text-slate-600">{r.subscriberPhone || r.subscriberEmail}</div>
                          </td>
                          <td className={tdClass}>
                            <div className="text-sm text-slate-300">{r.agentName || '—'}</div>
                            <div className="text-[10px] text-slate-600 font-mono">{r.agentCode || ''}</div>
                          </td>
                          <td className={tdClass}>
                            <span className={`text-[11px] font-semibold ${(COMMISSION_RATES[r.planCode] || {}).color || 'text-slate-400'}`}>
                              {(COMMISSION_RATES[r.planCode] || {}).label || r.planCode}
                            </span>
                          </td>
                          <td className={tdClass}><span className="text-white font-bold">₹{(r.amount || 0).toLocaleString('en-IN')}</span></td>
                          <td className={tdClass}><span className="text-[11px] text-slate-400 capitalize">{r.commissionType || 'y1'}</span></td>
                          <td className={tdClass}><span className="text-xs text-slate-400">{r.activationDate ? new Date(r.activationDate).toLocaleDateString('en-IN') : '—'}</span></td>
                          <td className={tdClass}><span className="text-xs text-slate-400">{r.eligibleDate ? new Date(r.eligibleDate).toLocaleDateString('en-IN') : '—'}</span></td>
                          <td className={tdClass}>
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${PAYOUT_STATUS_STYLE[r.status] || PAYOUT_STATUS_STYLE.pending}`}>
                              {(r.status || 'pending').replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className={`${tdClass} pr-5`}>
                            <div className="flex items-center gap-1 justify-end">
                              {r.status === 'approved' && (
                                <button onClick={() => markPaid(r.id)} className="h-7 px-2.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-[10px] border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors">Mark Paid</button>
                              )}
                              {(r.status === 'pending' || r.status === 'approved') && (
                                <button onClick={() => markClawback(r.id)} className="h-7 px-2.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] border border-red-500/20 hover:bg-red-500/20 transition-colors">Clawback</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          </>
        )}
      </div>
    </CRMLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORPORATE HEALTH PLANS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const PLAN_TEMPLATES = [
  {
    code: 'CORP_BASIC', label: 'Corporate Basic', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/15',
    family: 2, consultations: '3 online + 5 audio/mo', badge: null,
    benefits: ['3 online consultations/month', '5 audio calls/month', 'Pharmacy ₹1,000/month', 'Lab tests ₹1,000/month', 'Basic annual health screening', '2 family members covered', 'Employee health dashboard', 'Wellness programs access'],
    notIncluded: ['Home care', 'Ambulance', 'Dental'],
  },
  {
    code: 'CORP_BASIC_PLUS', label: 'Corporate Basic Plus', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/15',
    family: 3, consultations: '8 online + 12 audio/mo', badge: null,
    benefits: ['8 online consultations/month', '12 audio calls/month', 'Pharmacy ₹2,000/month', 'Lab tests ₹2,000/month', 'Home care ₹2,000/month', 'Preventive health panel', 'Dental ₹500/month', '3 family members covered', 'Bulk appointment booking', 'Health analytics reports'],
    notIncluded: ['Ambulance'],
  },
  {
    code: 'CORP_PREMIUM', label: 'Corporate Premium', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/15',
    family: 4, consultations: '15 online + unlimited audio/mo', badge: 'Most Popular',
    benefits: ['15 online consultations/month', '6 physical consultations/month', 'Pharmacy ₹4,000/month', 'Lab tests ₹4,000/month', 'Home care ₹5,000/month', 'Ambulance ₹3,000/month', 'Comprehensive diagnostics panel', 'Dental ₹2,000/month', '4 family members covered', 'On-site clinic support', '5 mental health sessions/month', 'Unlimited AI chat + scribe'],
    notIncluded: [],
  },
  {
    code: 'CORP_ELITE', label: 'Corporate Elite', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/15',
    family: 6, consultations: '25 online + unlimited audio/mo', badge: null,
    benefits: ['25 online consultations/month', '10 physical consultations/month', 'Pharmacy ₹7,000/month', 'Lab tests ₹7,000/month', 'Home care ₹10,000/month', 'Ambulance ₹8,000/month', 'Advanced diagnostics panel', 'Dental ₹4,000/month', '6 family members covered', 'Dedicated account manager', 'HR health analytics dashboard', 'Claims management support', 'Priority appointment booking'],
    notIncluded: [],
  },
  {
    code: 'CORP_SIGNATURE', label: 'Corporate Signature', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/15',
    family: 8, consultations: '40 online + unlimited audio/mo', badge: null,
    benefits: ['40 online consultations/month', '15 physical consultations/month', 'Pharmacy ₹10,000/month', 'Lab tests ₹10,000/month', 'Home care ₹15,000/month', 'Ambulance ₹12,000/month', 'Premium diagnostics panel', 'Dental ₹6,000/month', '8 family members covered', 'Branded wellness programs', 'Quarterly health checkups', 'Priority emergency line', 'Insurance coordination support'],
    notIncluded: [],
  },
  {
    code: 'CORP_EXCLUSIVE', label: 'Corporate Exclusive', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/15',
    family: 'Unlimited', consultations: 'Unlimited online + audio/mo', badge: 'Enterprise',
    benefits: ['Unlimited online consultations', 'Unlimited physical consultations', 'Pharmacy ₹20,000/month', 'Lab tests ₹20,000/month', 'Home care ₹30,000/month', 'Ambulance ₹25,000/month', 'Executive full body checkup', 'Dental ₹12,000/month', 'Unlimited family members', 'White-glove concierge health team', '24/7 priority emergency line', 'Custom wellness programs', 'Full insurance coordination', 'Annual predictive health report'],
    notIncluded: [],
  },
];

const CORP_PLAN_STATUS_STYLE: Record<string, string> = {
  draft:     'bg-slate-500/10 text-slate-400 border-slate-500/20',
  active:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  expired:   'bg-red-500/10 text-red-400 border-red-500/20',
  renewed:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const CORP_STATUS_FLOW = ['draft', 'active', 'expired', 'renewed', 'cancelled'];

export function CRMCorporatePlansPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editPlan, setEditPlan] = useState<any>(null);
  const [stats, setStats] = useState({ total: 0, active: 0, totalLives: 0, totalAcv: 0 });

  const currentYear = new Date().getFullYear();
  const emptyForm = {
    corporateName: '', planTemplateCode: 'CORP_BASIC', displayName: '',
    planYear: currentYear, planGrade: '', negotiatedPricePerEmp: '',
    employeeHeadcount: '', corporateShare: 100, employeeShare: 0,
    startDate: '', endDate: '', notes: '', rfqId: '', rfqNumber: '',
  };
  const [form, setForm] = useState(emptyForm);

  // Pre-fill form when navigated from a Won RFQ
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rfqId = params.get('rfq_id');
    const rfqNumber = params.get('rfq_number');
    const insuredName = params.get('insured_name');
    const headcount = params.get('headcount');
    if (rfqId && rfqNumber && insuredName) {
      const autoName = `${insuredName} Basic Plan ${currentYear}`;
      setForm(prev => ({
        ...prev,
        rfqId, rfqNumber,
        corporateName: insuredName,
        employeeHeadcount: headcount || '',
        displayName: autoName,
      }));
      setShowForm(true);
    }
  }, [location.search, currentYear]);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (yearFilter !== 'all') params.planYear = yearFilter;
      const { data } = await api.get('/crm/corporate-plans', { headers: authHeaders(), params });
      if (data.success) {
        setPlans(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        if (data.stats) setStats(data.stats);
      }
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/crm/login');
      setPlans([]);
    } finally { setLoading(false); }
  }, [page, search, statusFilter, yearFilter, navigate]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const autoDisplayName = (corpName: string, templateCode: string, year: number) => {
    const tmpl = PLAN_TEMPLATES.find(t => t.code === templateCode);
    if (corpName && tmpl) return `${corpName} ${tmpl.label.replace('Corporate ', '')} Plan ${year}`;
    return '';
  };

  const handleFormChange = (field: string, value: any) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (['corporateName', 'planTemplateCode', 'planYear'].includes(field) && !editPlan) {
        next.displayName = autoDisplayName(next.corporateName, next.planTemplateCode, Number(next.planYear));
      }
      if (field === 'corporateShare') next.employeeShare = 100 - Number(value);
      if (field === 'employeeShare') next.corporateShare = 100 - Number(value);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      if (editPlan) await api.put(`/crm/corporate-plans/${editPlan.id}`, form, { headers: authHeaders() });
      else await api.post('/crm/corporate-plans', form, { headers: authHeaders() });
      setShowForm(false); setEditPlan(null); setForm(emptyForm);
      fetchPlans();
    } catch (err: any) { alert(err.response?.data?.message || 'Save failed'); }
  };

  const handleRenew = async (plan: any) => {
    if (!window.confirm(`Create renewal plan for ${plan.plan_year + 1}?`)) return;
    try {
      await api.post(`/crm/corporate-plans/${plan.id}/renew`, {}, { headers: authHeaders() });
      fetchPlans();
    } catch (err: any) { alert(err.response?.data?.message || 'Renewal failed'); }
  };

  const handleStatusChange = async (plan: any, newStatus: string) => {
    try {
      await api.put(`/crm/corporate-plans/${plan.id}`, { status: newStatus }, { headers: authHeaders() });
      fetchPlans();
    } catch {}
  };

  const handleDeletePlan = async (id: number, name: string) => {
    if (!window.confirm(`Delete corporate plan "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/crm/corporate-plans/${id}`, { headers: authHeaders() });
      fetchPlans();
    } catch (err: any) { alert(err.response?.data?.message || 'Delete failed'); }
  };

  const openEdit = (p: any) => {
    setEditPlan(p);
    setForm({
      corporateName: p.corporate_name, planTemplateCode: p.plan_template_code || 'CORP_BASIC',
      displayName: p.display_name, planYear: p.plan_year, planGrade: p.plan_grade || '',
      negotiatedPricePerEmp: p.negotiated_price_per_emp || '', employeeHeadcount: p.employee_headcount || '',
      corporateShare: p.corporate_share || 100, employeeShare: p.employee_share || 0,
      startDate: p.start_date ? p.start_date.split('T')[0] : '',
      endDate: p.end_date ? p.end_date.split('T')[0] : '', notes: p.notes || '',
      rfqId: p.rfq_id ? String(p.rfq_id) : '', rfqNumber: p.rfq_number || '',
    });
    setShowForm(true);
  };

  const templateFor = (code: string) => PLAN_TEMPLATES.find(t => t.code === code);

  return (
    <CRMLayout title="Corporate Health Plans">
      <div className="space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Plans',         value: stats.total,                                   icon: Layers,          color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Active Plans',        value: stats.active,                                  icon: CheckCircle2,    color: 'text-emerald-400',bg: 'bg-emerald-500/10'},
            { label: 'Total Lives Covered', value: stats.totalLives.toLocaleString('en-IN'),      icon: Users,           color: 'text-blue-400',   bg: 'bg-blue-500/10'  },
            { label: 'Total ACV',           value: `₹${(stats.totalAcv / 100000).toFixed(1)}L/yr`,icon: CircleDollarSign,color: 'text-amber-400',  bg: 'bg-amber-500/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
                  <div className="text-lg font-bold text-white">{value}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Plan Templates Reference */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan Templates — Benefit Bundles</span>
            </div>
            <span className="text-[10px] text-slate-600">Benefit bundles only · Pricing is tailormade per contract</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {PLAN_TEMPLATES.map(t => (
              <div key={t.code} className={`p-3 rounded-xl ${t.bg} border ${t.border} flex flex-col gap-2`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-1">
                  <div className={`text-[12px] font-bold ${t.color}`}>{t.label.replace('Corporate ', '')}</div>
                  {t.badge && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${t.bg} ${t.color} border ${t.border} whitespace-nowrap`}>{t.badge}</span>}
                </div>
                {/* Key numbers */}
                <div className="flex gap-1.5 text-[9px]">
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">{t.consultations}</span>
                </div>
                <div className="text-[9px] text-slate-500">👨‍👩‍👧 {t.family} family members</div>
                {/* Benefits */}
                <ul className="space-y-0.5 mt-1">
                  {t.benefits.map((b, i) => (
                    <li key={i} className="flex items-start gap-1 text-[10px] text-slate-300">
                      <span className={`mt-0.5 shrink-0 ${t.color}`}>✓</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                {/* Not included */}
                {t.notIncluded.length > 0 && (
                  <ul className="space-y-0.5 border-t border-white/[0.06] pt-1.5 mt-0.5">
                    {t.notIncluded.map((b, i) => (
                      <li key={i} className="flex items-start gap-1 text-[10px] text-slate-600">
                        <span className="mt-0.5 shrink-0">✕</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              <input placeholder="Search company or plan name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30 transition-colors" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
              <option value="all" className="bg-[#0d1120]">All Status</option>
              {CORP_STATUS_FLOW.map(s => <option key={s} value={s} className="bg-[#0d1120]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select value={yearFilter} onChange={e => { setYearFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
              <option value="all" className="bg-[#0d1120]">All Years</option>
              {[currentYear + 1, currentYear, currentYear - 1].map(y => <option key={y} value={y} className="bg-[#0d1120]">{y}</option>)}
            </select>
          </div>
          <button onClick={() => { setEditPlan(null); setForm(emptyForm); setShowForm(!showForm); }}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-sm font-medium flex items-center gap-1.5 shadow-lg shadow-violet-600/20 transition-all">
            <Plus className="h-4 w-4" /> New Corporate Plan
          </button>
        </div>

        {/* Create / Edit Form */}
        {showForm && (
          <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{editPlan ? `Edit: ${editPlan.display_name}` : 'Create Corporate Health Plan'}</h3>
              <button onClick={() => { setShowForm(false); setEditPlan(null); }} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            {/* RFQ Source Banner */}
            {form.rfqNumber && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-violet-500/8 border border-violet-500/15">
                <FileText className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Source RFQ</span>
                  <span className="ml-2 text-xs font-mono font-semibold text-violet-400">{form.rfqNumber}</span>
                  <span className="ml-2 text-[10px] text-emerald-400">· Won</span>
                </div>
                <button onClick={() => navigate(`/crm/rfqs/${form.rfqId}`)} className="text-[10px] text-slate-600 hover:text-violet-400 transition-colors flex items-center gap-1">
                  <SquareArrowOutUpRight className="h-3 w-3" /> View RFQ
                </button>
              </div>
            )}
            {!form.rfqNumber && !editPlan && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500/70 flex-shrink-0" />
                <span className="text-[11px] text-slate-500">Corporate plans should flow through an <button onClick={() => navigate('/crm/rfqs')} className="text-amber-400 hover:text-amber-300 underline underline-offset-2">RFQ</button> — Win an RFQ first, then create the plan from it.</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Company Name *</label>
                <input value={form.corporateName} onChange={e => handleFormChange('corporateName', e.target.value)}
                  placeholder="e.g. Equitas Small Finance Bank"
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Plan Template *</label>
                <select value={form.planTemplateCode} onChange={e => handleFormChange('planTemplateCode', e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  {PLAN_TEMPLATES.map(t => <option key={t.code} value={t.code} className="bg-[#0d1120]">{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Plan Instance Name *</label>
                <input value={form.displayName} onChange={e => handleFormChange('displayName', e.target.value)}
                  placeholder="e.g. Equitas Staff Plan 2026"
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Plan Year</label>
                <select value={form.planYear} onChange={e => handleFormChange('planYear', Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-slate-300 focus:outline-none">
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y} className="bg-[#0d1120]">{y}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Grade / Segment</label>
                <input value={form.planGrade} onChange={e => handleFormChange('planGrade', e.target.value)}
                  placeholder="e.g. Staff / Management / Executive"
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Employee Headcount</label>
                <input type="number" value={form.employeeHeadcount} onChange={e => handleFormChange('employeeHeadcount', e.target.value)}
                  placeholder="500"
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Contracted Price / Emp / Mo (₹) *</label>
                <input type="number" value={form.negotiatedPricePerEmp} onChange={e => handleFormChange('negotiatedPricePerEmp', e.target.value)}
                  placeholder="Enter negotiated rate (tailormade per contract)"
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Corporate Pays %</label>
                <input type="number" min={0} max={100} value={form.corporateShare} onChange={e => handleFormChange('corporateShare', Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Employee Pays %</label>
                <input type="number" min={0} max={100} value={form.employeeShare} onChange={e => handleFormChange('employeeShare', Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Start Date</label>
                <input type="date" value={form.startDate} onChange={e => handleFormChange('startDate', e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">End Date</label>
                <input type="date" value={form.endDate} onChange={e => handleFormChange('endDate', e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-violet-500/30" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Notes</label>
                <input value={form.notes} onChange={e => handleFormChange('notes', e.target.value)} placeholder="Internal notes..."
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/30" />
              </div>
            </div>

            {form.negotiatedPricePerEmp && form.employeeHeadcount && (
              <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/15 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-violet-400 uppercase tracking-wider mb-0.5">Estimated Annual Contract Value</div>
                  <div className="text-sm font-semibold text-white">
                    ₹{(Number(form.negotiatedPricePerEmp) * Number(form.employeeHeadcount) * 12).toLocaleString('en-IN')} / year
                    <span className="text-slate-500 text-xs font-normal ml-2">(₹{Number(form.negotiatedPricePerEmp).toLocaleString('en-IN')}/emp × {form.employeeHeadcount} emp × 12 mo)</span>
                  </div>
                </div>
                {!editPlan && <div className="text-[10px] text-slate-500">Contract ref auto-generated on save</div>}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowForm(false); setEditPlan(null); }} className="h-9 px-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} className="h-9 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-medium hover:from-violet-500 hover:to-blue-500 transition-all">
                {editPlan ? 'Update Plan' : 'Create Plan'}
              </button>
            </div>
          </div>
        )}

        {/* Plans Table */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Corporate Plan Registry</h3>
            <div className="text-[11px] text-slate-500">Versioned yearly · Contract ref auto-generated · Multiple plans per company supported</div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <RefreshCw className="h-5 w-5 text-violet-400 animate-spin" />
              <span className="text-sm text-slate-500">Loading...</span>
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Briefcase className="h-10 w-10 text-slate-700" />
              <p className="text-sm text-slate-500">No corporate health plans yet</p>
              <button onClick={() => { setEditPlan(null); setForm(emptyForm); setShowForm(true); }}
                className="h-9 px-4 rounded-xl bg-violet-500/15 text-violet-400 text-sm border border-violet-500/20 hover:bg-violet-500/20 transition-colors">
                Create First Plan
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className={`${thClass} pl-5`}>Plan</th>
                    <th className={thClass}>Contract Ref</th>
                    <th className={thClass}>Template</th>
                    <th className={thClass}>Year</th>
                    <th className={thClass}>Headcount</th>
                    <th className={thClass}>Price/Emp</th>
                    <th className={thClass}>ACV</th>
                    <th className={thClass}>RFQ</th>
                    <th className={thClass}>Split</th>
                    <th className={thClass}>Validity</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} pr-5`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {plans.map((p) => {
                    const tmpl = templateFor(p.plan_template_code);
                    const pricePerEmp = p.negotiated_price_per_emp ? Number(p.negotiated_price_per_emp) : null;
                    const acv = pricePerEmp ? pricePerEmp * (p.employee_headcount || 0) * 12 : null;
                    return (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className={`${tdClass} pl-5`}>
                          <div className="font-medium text-white">{p.display_name}</div>
                          <div className="text-[11px] text-slate-600 mt-0.5">{p.corporate_name}{p.plan_grade ? ` · ${p.plan_grade}` : ''}</div>
                          {p.renewal_of_name && (
                            <div className="text-[10px] text-blue-400 mt-0.5 flex items-center gap-1">
                              <RotateCcw className="h-2.5 w-2.5" />Renewal of {p.renewal_of_name}
                            </div>
                          )}
                        </td>
                        <td className={tdClass}>
                          <span className="font-mono text-xs text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">{p.contract_ref || '—'}</span>
                        </td>
                        <td className={tdClass}>
                          <span className={`text-[11px] font-semibold ${tmpl?.color || 'text-slate-400'}`}>
                            {tmpl?.label?.replace('Corporate ', '') || p.plan_template_code}
                          </span>
                        </td>
                        <td className={tdClass}><span className="text-white font-semibold">{p.plan_year}</span></td>
                        <td className={tdClass}><span className="text-white font-semibold">{(p.employee_headcount || 0).toLocaleString('en-IN')}</span></td>
                        <td className={tdClass}>
                          {pricePerEmp ? (
                            <span className="text-white font-medium">₹{pricePerEmp.toLocaleString('en-IN')}<span className="text-slate-600 text-[10px]">/emp/mo</span></span>
                          ) : (
                            <span className="text-slate-600 text-[11px] italic">TBD</span>
                          )}
                        </td>
                        <td className={tdClass}>
                          {acv ? (
                            <span className="text-emerald-400 font-semibold">₹{(acv / 100000).toFixed(1)}L/yr</span>
                          ) : (
                            <span className="text-slate-600 text-[11px] italic">—</span>
                          )}
                        </td>
                        <td className={tdClass}>
                          {p.rfq_number ? (
                            <button onClick={() => navigate(`/crm/rfqs/${p.rfq_id}`)}
                              className="font-mono text-[11px] text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1">
                              {p.rfq_number}
                              <SquareArrowOutUpRight className="h-2.5 w-2.5 opacity-50" />
                            </button>
                          ) : (
                            <span className="text-slate-700 text-[11px] italic">—</span>
                          )}
                        </td>
                        <td className={tdClass}>
                          <div className="text-[11px]">
                            <span className="text-blue-400">{p.corporate_share}%</span>
                            <span className="text-slate-600"> corp</span>
                            {Number(p.employee_share) > 0 && (
                              <><span className="text-slate-500"> + </span>
                              <span className="text-amber-400">{p.employee_share}%</span>
                              <span className="text-slate-600"> emp</span></>
                            )}
                          </div>
                        </td>
                        <td className={tdClass}>
                          <div className="text-[11px] text-slate-400">
                            {p.start_date ? new Date(p.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                            {p.end_date && <> → {new Date(p.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</>}
                          </div>
                        </td>
                        <td className={tdClass}>
                          <select value={p.status} onChange={e => handleStatusChange(p, e.target.value)}
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border cursor-pointer bg-transparent ${CORP_PLAN_STATUS_STYLE[p.status] || CORP_PLAN_STATUS_STYLE.draft}`}>
                            {CORP_STATUS_FLOW.map(s => <option key={s} value={s} className="bg-[#0d1120] text-white">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                          </select>
                        </td>
                        <td className={`${tdClass} pr-5`}>
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit(p)}
                              className="text-[11px] text-slate-500 hover:text-violet-400 px-2 py-1 rounded hover:bg-violet-500/10 transition-colors flex items-center gap-1">
                              <Edit className="h-3 w-3" /> Edit
                            </button>
                            {p.status === 'active' && (
                              <button onClick={() => handleRenew(p)}
                                className="text-[11px] text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 flex items-center gap-1 transition-colors">
                                <RotateCcw className="h-3 w-3" />Renew
                              </button>
                            )}
                            <button onClick={() => handleDeletePlan(p.id, p.display_name)}
                              className="text-[11px] text-slate-600 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-colors">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
    </CRMLayout>
  );
}
