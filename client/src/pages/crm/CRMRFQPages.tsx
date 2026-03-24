import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText, Upload, Search, Plus, Trash2, Edit, Eye, Download,
  ChevronLeft, ChevronRight, Filter, Users, DollarSign, TrendingUp,
  BarChart3, PieChart, Send, Check, X, Clock, AlertCircle, RefreshCw,
  FileSpreadsheet, Building2, Shield, Calendar, Hash, Layers, Save,
  ArrowLeft, Copy, IndianRupee,
} from 'lucide-react';
import api from '@/utils/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, Legend,
} from 'recharts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders() {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const STATUS_COLORS: Record<string, string> = {
  received: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  quoting: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  quoted: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  lost: 'bg-red-500/15 text-red-400 border-red-500/20',
  expired: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  sent: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  accepted: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/20',
  revised: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

const CHART_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

function formatCurrency(n: number) {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${map[status] || map['received']}`}>
      {status?.toUpperCase()}
    </span>
  );
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

// Card wrapper
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RFQ LIST PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMRFQsPage() {
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const fetchRFQs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/crm/rfqs', { headers: authHeaders(), params });
      if (data.success) { setRfqs(data.data); setTotalPages(data.pagination?.totalPages || 1); }
    } catch { /* */ }
    setLoading(false);
  }, [page, search, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/crm/rfqs-stats', { headers: authHeaders() });
      if (data.success) setStats(data.data);
    } catch { /* */ }
  }, []);

  useEffect(() => { fetchRFQs(); }, [fetchRFQs]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/crm/rfqs/upload-excel', fd, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      if (data.success) {
        fetchRFQs();
        fetchStats();
        navigate(`/crm/rfqs/${data.data.id}`);
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Upload failed');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const deleteRFQ = async (id: number) => {
    if (!confirm('Delete this RFQ and all its members/quotes?')) return;
    try {
      await api.delete(`/crm/rfqs/${id}`, { headers: authHeaders() });
      fetchRFQs();
      fetchStats();
    } catch { /* */ }
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total RFQs', value: stats.total || 0, icon: FileText, color: 'violet' },
            { label: 'Received', value: stats.received || 0, icon: Clock, color: 'blue' },
            { label: 'Quoting', value: stats.quoting || 0, icon: Edit, color: 'amber' },
            { label: 'Quoted', value: stats.quoted || 0, icon: Send, color: 'violet' },
            { label: 'Won', value: stats.won || 0, icon: Check, color: 'emerald' },
            { label: 'Premium', value: formatCurrency(stats.total_quoted_premium || 0), icon: IndianRupee, color: 'emerald' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="!p-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl bg-${color}-500/10 flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 text-${color}-400`} />
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">{label}</p>
                  <p className="text-lg font-bold text-white">{value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search RFQs..." className="pl-10 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl" />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none">
            <option value="all">All Status</option>
            <option value="received">Received</option>
            <option value="quoting">Quoting</option>
            <option value="quoted">Quoted</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleUploadExcel} className="hidden" />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 border-0 rounded-xl h-10 px-4 gap-2 text-sm font-medium shadow-lg shadow-blue-600/20">
            {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Parsing...' : 'Upload RFQ Excel'}
          </Button>
          <Button onClick={() => navigate('/crm/rfqs/new')}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 border-0 rounded-xl h-10 px-4 gap-2 text-sm font-medium shadow-lg shadow-violet-600/20">
            <Plus className="h-4 w-4" /> New RFQ
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['RFQ #', 'Insured Name', 'Policy Type', 'Broker', 'Members', 'Quotes', 'Status', 'Date', ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-4 bg-white/[0.05] rounded animate-pulse w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : rfqs.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-16 text-center">
                  <FileSpreadsheet className="h-12 w-12 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No RFQs yet. Upload a broker Excel to get started.</p>
                </td></tr>
              ) : rfqs.map(r => (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors"
                  onClick={() => navigate(`/crm/rfqs/${r.id}`)}>
                  <td className="px-5 py-3.5 text-sm font-mono text-violet-400">{r.rfq_number}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-white truncate max-w-[200px]">{r.insured_name}</p>
                    <p className="text-[11px] text-slate-600">{r.product_type || 'GMC'}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-400">{r.policy_type || '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-400 truncate max-w-[140px]">{r.broker_company || '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-300 font-medium">{r.member_count?.toLocaleString() || 0}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-300 font-medium">{r.quote_count || 0}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={r.status} map={STATUS_COLORS} /></td>
                  <td className="px-5 py-3.5 text-sm text-slate-500">{formatDate(r.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <button onClick={e => { e.stopPropagation(); deleteRFQ(r.id); }}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Pagination page={page} totalPages={totalPages} setPage={setPage} />
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// RFQ DETAIL PAGE (Broking Slip + Analytics + Members + Quotes)
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMRFQDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [rfq, setRfq] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [memberPage, setMemberPage] = useState(1);
  const [memberTotalPages, setMemberTotalPages] = useState(1);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'analytics' | 'members' | 'quotes'>('overview');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const fetchRFQ = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/crm/rfqs/${id}`, { headers: authHeaders() });
      if (data.success) setRfq(data.data);
    } catch { /* */ }
    setLoading(false);
  }, [id]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const { data } = await api.get(`/crm/rfqs/${id}/member-analytics`, { headers: authHeaders() });
      if (data.success) setAnalytics(data.data);
    } catch { /* */ }
  }, [id]);

  const fetchMembers = useCallback(async () => {
    try {
      const params: any = { page: memberPage, limit: 50 };
      if (memberSearch) params.search = memberSearch;
      const { data } = await api.get(`/crm/rfqs/${id}/members`, { headers: authHeaders(), params });
      if (data.success) { setMembers(data.data); setMemberTotalPages(data.pagination?.totalPages || 1); }
    } catch { /* */ }
  }, [id, memberPage, memberSearch]);

  useEffect(() => { fetchRFQ(); fetchAnalytics(); }, [fetchRFQ, fetchAnalytics]);
  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleMemberUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/crm/rfqs/${id}/upload-members`, fd, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      fetchRFQ();
      fetchAnalytics();
      fetchMembers();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Upload failed');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="h-6 w-6 text-violet-400 animate-spin" />
    </div>
  );

  if (!rfq) return (
    <div className="text-center py-20">
      <AlertCircle className="h-12 w-12 text-slate-600 mx-auto mb-3" />
      <p className="text-slate-400">RFQ not found</p>
      <Button onClick={() => navigate('/crm/rfqs')} variant="outline" className="mt-4 border-white/[0.1] text-slate-300">Back to RFQs</Button>
    </div>
  );

  const lives = typeof rfq.lives_at_inception === 'string' ? JSON.parse(rfq.lives_at_inception || '{}') : (rfq.lives_at_inception || {});
  const livesRenewal = typeof rfq.lives_at_renewal === 'string' ? JSON.parse(rfq.lives_at_renewal || '{}') : (rfq.lives_at_renewal || {});
  const coverage = typeof rfq.coverage_scope === 'string' ? JSON.parse(rfq.coverage_scope || '{}') : (rfq.coverage_scope || {});
  const conditions = typeof rfq.special_conditions === 'string' ? JSON.parse(rfq.special_conditions || '[]') : (rfq.special_conditions || []);
  const slabs = typeof rfq.sum_insured_slabs === 'string' ? JSON.parse(rfq.sum_insured_slabs || '[]') : (rfq.sum_insured_slabs || []);
  const quotes = rfq.quotes || [];

  const tabs = [
    { key: 'overview', label: 'Broking Slip', icon: FileText },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'members', label: `Members (${rfq.member_count?.toLocaleString() || 0})`, icon: Users },
    { key: 'quotes', label: `Quotes (${quotes.length})`, icon: DollarSign },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/crm/rfqs')} className="p-2 rounded-xl hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{rfq.insured_name}</h2>
              <StatusBadge status={rfq.status} map={STATUS_COLORS} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{rfq.rfq_number} &middot; {rfq.policy_type} &middot; {rfq.product_type}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleMemberUpload} className="hidden" />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} variant="outline"
            className="border-white/[0.1] text-slate-300 hover:bg-white/[0.05] rounded-xl h-9 text-sm gap-2">
            {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload Members
          </Button>
          <Button onClick={() => navigate(`/crm/rfqs/${id}/quote/new`)}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-0 rounded-xl h-9 px-4 gap-2 text-sm font-medium shadow-lg shadow-emerald-600/20">
            <IndianRupee className="h-3.5 w-3.5" /> Create Quote
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key ? 'bg-violet-500/15 text-violet-300 shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
            }`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab rfq={rfq} lives={lives} livesRenewal={livesRenewal} coverage={coverage} conditions={conditions} slabs={slabs} />}
      {tab === 'analytics' && <AnalyticsTab analytics={analytics} />}
      {tab === 'members' && (
        <MembersTab members={members} search={memberSearch} setSearch={setMemberSearch}
          page={memberPage} totalPages={memberTotalPages} setPage={setMemberPage} />
      )}
      {tab === 'quotes' && <QuotesTab quotes={quotes} rfqId={rfq.id} onRefresh={fetchRFQ} navigate={navigate} />}
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ rfq, lives, livesRenewal, coverage, conditions, slabs }: any) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Insured & Broker Info */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-violet-400" /> Insured Details</h3>
        <div className="space-y-3">
          {[
            ['Insured Name', rfq.insured_name],
            ['Address', rfq.insured_address],
            ['Existing Insurer', rfq.existing_insurer],
            ['Existing TPA', rfq.existing_tpa],
            ['Premium Paid', rfq.premium_paid ? formatCurrency(rfq.premium_paid) : null],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k as string} className="flex justify-between">
              <span className="text-xs text-slate-500">{k}</span>
              <span className="text-sm text-slate-300 text-right max-w-[60%]">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Shield className="h-4 w-4 text-blue-400" /> Broker & Policy</h3>
        <div className="space-y-3">
          {[
            ['Broker', rfq.broker_name || rfq.broker_company],
            ['Broker Company', rfq.broker_company],
            ['Broker Email', rfq.broker_email],
            ['Broker Phone', rfq.broker_phone],
            ['Policy Period', rfq.policy_start && rfq.policy_end ? `${formatDate(rfq.policy_start)} – ${formatDate(rfq.policy_end)}` : null],
            ['Policy Type', rfq.policy_type],
            ['Product Type', rfq.product_type],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k as string} className="flex justify-between">
              <span className="text-xs text-slate-500">{k}</span>
              <span className="text-sm text-slate-300 text-right max-w-[60%]">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Lives */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-emerald-400" /> Lives</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-slate-600 uppercase font-semibold mb-2">At Inception</p>
            {Object.entries(lives).length > 0 ? Object.entries(lives).map(([k, v]) => (
              <div key={k} className="flex justify-between py-1">
                <span className="text-xs text-slate-500 capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="text-sm text-white font-medium">{(v as number)?.toLocaleString?.() || v as string}</span>
              </div>
            )) : <p className="text-xs text-slate-600">—</p>}
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase font-semibold mb-2">At Renewal</p>
            {Object.entries(livesRenewal).length > 0 ? Object.entries(livesRenewal).map(([k, v]) => (
              <div key={k} className="flex justify-between py-1">
                <span className="text-xs text-slate-500 capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="text-sm text-white font-medium">{(v as number)?.toLocaleString?.() || v as string}</span>
              </div>
            )) : <p className="text-xs text-slate-600">—</p>}
          </div>
        </div>
      </Card>

      {/* Sum Insured Slabs */}
      {slabs.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Layers className="h-4 w-4 text-amber-400" /> Sum Insured Slabs</h3>
          <div className="space-y-2">
            {slabs.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]">
                <span className="text-sm text-slate-300">{s.label || s.slab || `Slab ${i + 1}`}</span>
                <span className="text-sm font-medium text-amber-400">{s.value ? formatCurrency(s.value) : s.amount || '—'}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Coverage */}
      {Object.keys(coverage).length > 0 && (
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-cyan-400" /> Coverage Scope</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(coverage).map(([k, v]) => (
              <div key={k} className="py-2 px-3 rounded-lg bg-white/[0.02]">
                <p className="text-xs text-slate-500 capitalize mb-1">{k.replace(/_/g, ' ')}</p>
                <p className="text-sm text-slate-300">{v as string}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Special Conditions */}
      {conditions.length > 0 && (
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-400" /> Special Conditions</h3>
          <div className="space-y-2">
            {conditions.map((c: string, i: number) => (
              <div key={i} className="flex gap-3 py-2 px-3 rounded-lg bg-white/[0.02]">
                <span className="text-xs font-bold text-violet-400 mt-0.5">{i + 1}.</span>
                <p className="text-sm text-slate-300">{c}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Exclusions */}
      {rfq.exclusions && (
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><X className="h-4 w-4 text-red-400" /> Exclusions</h3>
          <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{rfq.exclusions}</p>
        </Card>
      )}

      {/* Notes */}
      {rfq.notes && (
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-4">Notes</h3>
          <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{rfq.notes}</p>
        </Card>
      )}
    </div>
  );
}

// ─── Analytics Tab ───────────────────────────────────────────────────────────

function AnalyticsTab({ analytics }: { analytics: any }) {
  if (!analytics) return (
    <div className="text-center py-16">
      <BarChart3 className="h-12 w-12 text-slate-700 mx-auto mb-3" />
      <p className="text-slate-500">No member data uploaded yet</p>
    </div>
  );

  const { summary, gender_distribution, relation_distribution, age_bands, band_distribution, si_distribution, family_size_distribution, avg_family_size } = analytics;

  const ageBandData = (age_bands || []).map((b: any) => ({ name: b.age_band, count: parseInt(b.count) }));
  const genderData = (gender_distribution || []).map((g: any) => ({ name: g.gender || 'Unknown', value: parseInt(g.count) }));
  const relationData = (relation_distribution || []).map((r: any) => ({ name: r.relation_type || 'Unknown', value: parseInt(r.count) }));
  const bandData = (band_distribution || []).map((b: any) => ({ name: b.band, members: parseInt(b.count), employees: parseInt(b.emp_count) }));
  const siData = (si_distribution || []).map((s: any) => ({ name: formatCurrency(s.si_proposed), count: parseInt(s.count) }));
  const familyData = Object.entries(family_size_distribution || {}).map(([k, v]) => ({ name: k === '1' ? 'Single' : `${k} members`, count: v as number }));

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Members', value: parseInt(summary?.total || 0).toLocaleString() },
          { label: 'Employees', value: parseInt(summary?.employees || 0).toLocaleString() },
          { label: 'Avg Age', value: parseFloat(summary?.avg_age || 0).toFixed(1) },
          { label: 'Age Range', value: `${summary?.min_age || 0}–${summary?.max_age || 0}` },
          { label: 'Total SI (Exp)', value: formatCurrency(parseFloat(summary?.total_si_expiring || 0)) },
          { label: 'Avg Family', value: avg_family_size || '—' },
        ].map(({ label, value }) => (
          <Card key={label} className="!p-3.5 text-center">
            <p className="text-[10px] text-slate-500 font-semibold uppercase">{label}</p>
            <p className="text-lg font-bold text-white mt-1">{value}</p>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Age Band */}
        {ageBandData.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-4">Age Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ageBandData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Gender Pie */}
        {genderData.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-4">Gender Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <RePieChart>
                <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} strokeWidth={0}>
                  {genderData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              </RePieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Relations Pie */}
        {relationData.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-4">Relationship Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <RePieChart>
                <Pie data={relationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} strokeWidth={0}>
                  {relationData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              </RePieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Band Distribution */}
        {bandData.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-4">Band Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bandData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Bar dataKey="members" fill="#3b82f6" name="Total Members" radius={[6, 6, 0, 0]} />
                <Bar dataKey="employees" fill="#10b981" name="Employees" radius={[6, 6, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Charts Row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* SI Distribution */}
        {siData.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-4">Sum Insured Distribution (Employees)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={siData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Family Size */}
        {familyData.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-4">Family Size Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={familyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Bar dataKey="count" fill="#ec4899" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Members Tab ─────────────────────────────────────────────────────────────

function MembersTab({ members, search, setSearch, page, totalPages, setPage }: any) {
  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <Input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name, emp code..." className="pl-10 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl" />
      </div>
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Sr', 'Emp Code', 'Name', 'Relation', 'Gender', 'Age', 'DOB', 'SI Expiring', 'SI Proposed', 'Band', 'Designation'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-500">No members found</td></tr>
              ) : members.map((m: any) => (
                <tr key={m.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 text-xs text-slate-500">{m.sr_no}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-violet-400">{m.emp_code}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-300">{m.employee_name || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{m.relationship || m.relation_type}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{m.gender}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-300">{m.age}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{m.dob ? formatDate(m.dob) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-amber-400 font-medium">{m.si_expiring ? formatCurrency(m.si_expiring) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-emerald-400 font-medium">{m.si_proposed ? formatCurrency(m.si_proposed) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{m.band || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 truncate max-w-[120px]">{m.designation || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Pagination page={page} totalPages={totalPages} setPage={setPage} />
    </div>
  );
}

// ─── Quotes Tab ──────────────────────────────────────────────────────────────

function QuotesTab({ quotes, rfqId, onRefresh, navigate }: any) {
  const updateQuoteStatus = async (quoteId: number, status: string) => {
    try {
      await api.put(`/crm/quotes/${quoteId}`, { status }, { headers: authHeaders() });
      onRefresh();
    } catch { /* */ }
  };

  const deleteQuote = async (quoteId: number) => {
    if (!confirm('Delete this quote?')) return;
    try {
      await api.delete(`/crm/quotes/${quoteId}`, { headers: authHeaders() });
      onRefresh();
    } catch { /* */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => navigate(`/crm/rfqs/${rfqId}/quote/new`)}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-0 rounded-xl h-9 px-4 gap-2 text-sm font-medium shadow-lg shadow-emerald-600/20">
          <Plus className="h-3.5 w-3.5" /> New Quote
        </Button>
      </div>
      {quotes.length === 0 ? (
        <Card className="text-center py-12">
          <DollarSign className="h-12 w-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No quotes created yet</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map((q: any) => {
            const slabPricing = typeof q.slab_pricing === 'string' ? JSON.parse(q.slab_pricing || '[]') : (q.slab_pricing || []);
            const coverageDetails = typeof q.coverage_details === 'string' ? JSON.parse(q.coverage_details || '{}') : (q.coverage_details || {});
            return (
              <Card key={q.id}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-mono text-violet-400">{q.quote_number}</span>
                      <StatusBadge status={q.status} map={QUOTE_STATUS_COLORS} />
                      <span className="text-xs text-slate-600">v{q.version}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                      <div>
                        <p className="text-[10px] text-slate-600 uppercase">Total Premium</p>
                        <p className="text-lg font-bold text-emerald-400">{formatCurrency(q.total_premium)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-600 uppercase">Per Life</p>
                        <p className="text-sm font-medium text-white">{formatCurrency(q.per_life_cost)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-600 uppercase">Per Family</p>
                        <p className="text-sm font-medium text-white">{formatCurrency(q.per_family_cost)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-600 uppercase">Lives</p>
                        <p className="text-sm font-medium text-white">{q.total_lives?.toLocaleString() || '—'}</p>
                      </div>
                    </div>
                    {slabPricing.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[10px] text-slate-600 uppercase">Slab Pricing</p>
                        <div className="flex flex-wrap gap-2">
                          {slabPricing.map((s: any, i: number) => (
                            <span key={i} className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-300">
                              {s.slab || s.label}: <span className="text-amber-400">{formatCurrency(s.premium || s.amount)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-600">
                      <span>GST: {q.gst_pct || 18}%</span>
                      <span>Commission: {q.commission_pct || 0}%</span>
                      {q.discount_pct > 0 && <span>Discount: {q.discount_pct}%</span>}
                      {q.valid_until && <span>Valid till: {formatDate(q.valid_until)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {q.status === 'draft' && (
                      <button onClick={() => updateQuoteStatus(q.id, 'sent')} title="Mark as Sent"
                        className="p-2 rounded-lg hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-colors">
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                    {q.status === 'sent' && (
                      <>
                        <button onClick={() => updateQuoteStatus(q.id, 'accepted')} title="Mark Accepted"
                          className="p-2 rounded-lg hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-colors">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => updateQuoteStatus(q.id, 'rejected')} title="Mark Rejected"
                          className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button onClick={() => navigate(`/crm/rfqs/${rfqId}/quote/${q.id}`)} title="Edit Quote"
                      className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteQuote(q.id)} title="Delete"
                      className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE BUILDER PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function CRMQuoteBuilderPage() {
  const { id: rfqId, quoteId } = useParams<{ id: string; quoteId: string }>();
  const navigate = useNavigate();
  const [rfq, setRfq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isNew = quoteId === 'new';

  const [form, setForm] = useState({
    total_premium: '',
    total_lives: '',
    per_life_cost: '',
    per_family_cost: '',
    pricing_model: 'per_family',
    commission_pct: '15',
    gst_pct: '18',
    discount_pct: '0',
    valid_until: '',
    terms: '',
    notes: '',
  });

  const [slabs, setSlabs] = useState<{ slab: string; premium: string; lives: string }[]>([
    { slab: '', premium: '', lives: '' },
  ]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/crm/rfqs/${rfqId}`, { headers: authHeaders() });
        if (data.success) {
          setRfq(data.data);
          // Pre-populate lives
          const m = data.data.member_count || 0;
          if (isNew && m) {
            setForm(f => ({ ...f, total_lives: String(m) }));
          }
          // Pre-populate slabs from RFQ SI slabs
          const rfqSlabs = typeof data.data.sum_insured_slabs === 'string'
            ? JSON.parse(data.data.sum_insured_slabs || '[]')
            : (data.data.sum_insured_slabs || []);
          if (isNew && rfqSlabs.length > 0) {
            setSlabs(rfqSlabs.map((s: any) => ({
              slab: s.label || s.slab || '',
              premium: '',
              lives: '',
            })));
          }
          // If editing existing quote, load data
          if (!isNew && data.data.quotes) {
            const q = data.data.quotes.find((qt: any) => String(qt.id) === quoteId);
            if (q) {
              setForm({
                total_premium: String(q.total_premium || ''),
                total_lives: String(q.total_lives || ''),
                per_life_cost: String(q.per_life_cost || ''),
                per_family_cost: String(q.per_family_cost || ''),
                pricing_model: q.pricing_model || 'per_family',
                commission_pct: String(q.commission_pct ?? 15),
                gst_pct: String(q.gst_pct ?? 18),
                discount_pct: String(q.discount_pct ?? 0),
                valid_until: q.valid_until ? q.valid_until.slice(0, 10) : '',
                terms: q.terms || '',
                notes: q.notes || '',
              });
              const sp = typeof q.slab_pricing === 'string' ? JSON.parse(q.slab_pricing || '[]') : (q.slab_pricing || []);
              if (sp.length > 0) setSlabs(sp.map((s: any) => ({ slab: s.slab || s.label || '', premium: String(s.premium || s.amount || ''), lives: String(s.lives || '') })));
            }
          }
        }
      } catch { /* */ }
      setLoading(false);
    })();
  }, [rfqId, quoteId, isNew]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        total_premium: parseFloat(form.total_premium) || 0,
        total_lives: parseInt(form.total_lives) || 0,
        per_life_cost: parseFloat(form.per_life_cost) || 0,
        per_family_cost: parseFloat(form.per_family_cost) || 0,
        pricing_model: form.pricing_model,
        commission_pct: parseFloat(form.commission_pct) || 0,
        gst_pct: parseFloat(form.gst_pct) || 18,
        discount_pct: parseFloat(form.discount_pct) || 0,
        valid_until: form.valid_until || null,
        terms: form.terms || null,
        notes: form.notes || null,
        slab_pricing: slabs.filter(s => s.slab).map(s => ({
          slab: s.slab,
          premium: parseFloat(s.premium) || 0,
          lives: parseInt(s.lives) || 0,
        })),
        coverage_details: {},
      };
      if (isNew) {
        await api.post(`/crm/rfqs/${rfqId}/quotes`, payload, { headers: authHeaders() });
      } else {
        await api.put(`/crm/quotes/${quoteId}`, payload, { headers: authHeaders() });
      }
      navigate(`/crm/rfqs/${rfqId}`);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to save quote');
    }
    setSaving(false);
  };

  // Auto-calc per life / per family when total premium & lives change
  useEffect(() => {
    const premium = parseFloat(form.total_premium) || 0;
    const lives = parseInt(form.total_lives) || 0;
    if (premium > 0 && lives > 0) {
      setForm(f => ({
        ...f,
        per_life_cost: (premium / lives).toFixed(2),
      }));
    }
  }, [form.total_premium, form.total_lives]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="h-6 w-6 text-violet-400 animate-spin" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(`/crm/rfqs/${rfqId}`)} className="p-2 rounded-xl hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">{isNew ? 'Create Quote' : 'Edit Quote'}</h2>
          <p className="text-sm text-slate-500">{rfq?.insured_name} &middot; {rfq?.rfq_number}</p>
        </div>
      </div>

      {/* Pricing */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><IndianRupee className="h-4 w-4 text-emerald-400" /> Pricing</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-slate-400">Total Premium (₹)</Label>
            <Input value={form.total_premium} onChange={e => setForm({ ...form, total_premium: e.target.value })} type="number"
              className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="0" />
          </div>
          <div>
            <Label className="text-xs text-slate-400">Total Lives</Label>
            <Input value={form.total_lives} onChange={e => setForm({ ...form, total_lives: e.target.value })} type="number"
              className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="0" />
          </div>
          <div>
            <Label className="text-xs text-slate-400">Per Life Cost (auto)</Label>
            <Input value={form.per_life_cost} readOnly
              className="mt-1.5 bg-white/[0.02] border-white/[0.06] text-emerald-400 h-10 rounded-xl cursor-default" />
          </div>
          <div>
            <Label className="text-xs text-slate-400">Per Family Cost (₹)</Label>
            <Input value={form.per_family_cost} onChange={e => setForm({ ...form, per_family_cost: e.target.value })} type="number"
              className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="0" />
          </div>
          <div>
            <Label className="text-xs text-slate-400">Pricing Model</Label>
            <select value={form.pricing_model} onChange={e => setForm({ ...form, pricing_model: e.target.value })}
              className="mt-1.5 w-full px-3 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none">
              <option value="per_family">Per Family</option>
              <option value="per_life">Per Life</option>
              <option value="flat">Flat</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Valid Until</Label>
            <Input value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} type="date"
              className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" />
          </div>
        </div>
      </Card>

      {/* Slab Pricing */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Layers className="h-4 w-4 text-amber-400" /> Slab Pricing</h3>
          <Button onClick={() => setSlabs([...slabs, { slab: '', premium: '', lives: '' }])} variant="outline"
            className="border-white/[0.1] text-slate-400 hover:bg-white/[0.05] rounded-xl h-8 text-xs gap-1.5">
            <Plus className="h-3 w-3" /> Add Slab
          </Button>
        </div>
        <div className="space-y-3">
          {slabs.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-5">
                {i === 0 && <Label className="text-[10px] text-slate-500 mb-1 block">Slab / SI Band</Label>}
                <Input value={s.slab} onChange={e => { const n = [...slabs]; n[i].slab = e.target.value; setSlabs(n); }}
                  className="bg-white/[0.04] border-white/[0.08] text-white h-9 rounded-xl text-sm" placeholder="e.g. ₹3,000" />
              </div>
              <div className="col-span-3">
                {i === 0 && <Label className="text-[10px] text-slate-500 mb-1 block">Premium (₹)</Label>}
                <Input value={s.premium} onChange={e => { const n = [...slabs]; n[i].premium = e.target.value; setSlabs(n); }} type="number"
                  className="bg-white/[0.04] border-white/[0.08] text-white h-9 rounded-xl text-sm" placeholder="0" />
              </div>
              <div className="col-span-3">
                {i === 0 && <Label className="text-[10px] text-slate-500 mb-1 block">Lives</Label>}
                <Input value={s.lives} onChange={e => { const n = [...slabs]; n[i].lives = e.target.value; setSlabs(n); }} type="number"
                  className="bg-white/[0.04] border-white/[0.08] text-white h-9 rounded-xl text-sm" placeholder="0" />
              </div>
              <div className="col-span-1">
                {slabs.length > 1 && (
                  <button onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Commission & Taxes */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-400" /> Commission & Taxes</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-slate-400">Commission %</Label>
            <Input value={form.commission_pct} onChange={e => setForm({ ...form, commission_pct: e.target.value })} type="number" step="0.1"
              className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs text-slate-400">GST %</Label>
            <Input value={form.gst_pct} onChange={e => setForm({ ...form, gst_pct: e.target.value })} type="number" step="0.1"
              className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs text-slate-400">Discount %</Label>
            <Input value={form.discount_pct} onChange={e => setForm({ ...form, discount_pct: e.target.value })} type="number" step="0.1"
              className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" />
          </div>
        </div>
      </Card>

      {/* Terms & Notes */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4">Terms & Notes</h3>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-slate-400">Terms & Conditions</Label>
            <textarea value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} rows={3}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none placeholder:text-slate-600"
              placeholder="Enter terms..." />
          </div>
          <div>
            <Label className="text-xs text-slate-400">Internal Notes</Label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none placeholder:text-slate-600"
              placeholder="Notes..." />
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button onClick={() => navigate(`/crm/rfqs/${rfqId}`)} variant="outline"
          className="border-white/[0.1] text-slate-400 hover:bg-white/[0.05] rounded-xl h-10 px-5">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-0 rounded-xl h-10 px-6 gap-2 text-sm font-medium shadow-lg shadow-emerald-600/20">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : isNew ? 'Create Quote' : 'Update Quote'}
        </Button>
      </div>
    </div>
  );
}
