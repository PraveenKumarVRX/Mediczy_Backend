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
  ArrowLeft, Copy, IndianRupee, BrainCircuit, Zap, Activity, Target, Gauge,
} from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';
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
    <CRMLayout title="RFQs">
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
    </CRMLayout>
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
  const [tab, setTab] = useState<'overview' | 'analytics' | 'members' | 'claims' | 'quotes' | 'ai-quote'>('overview');
  const fileRef = useRef<HTMLInputElement>(null);
  const claimsFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [claimsUploading, setClaimsUploading] = useState(false);
  const [aiQuote, setAiQuote] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [claimsAnalysis, setClaimsAnalysis] = useState<any>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);

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

  const fetchClaimsAnalysis = useCallback(async () => {
    setClaimsLoading(true);
    try {
      const { data } = await api.get(`/crm/rfqs/${id}/claims-analysis`, { headers: authHeaders() });
      if (data.success && data.data) setClaimsAnalysis(data.data);
    } catch { /* */ }
    setClaimsLoading(false);
  }, [id]);

  useEffect(() => { fetchClaimsAnalysis(); }, [fetchClaimsAnalysis]);

  const handleClaimsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setClaimsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/crm/rfqs/${id}/upload-claims`, fd, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      if (data.success) {
        fetchClaimsAnalysis();
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Claims upload failed');
    }
    setClaimsUploading(false);
    if (claimsFileRef.current) claimsFileRef.current.value = '';
  };

  const generateAIQuote = useCallback(async () => {
    setAiLoading(true);
    setAiQuote(null);
    try {
      const { data } = await api.post(`/crm/rfqs/${id}/ai-generate-quote`, {}, { headers: authHeaders(), timeout: 30000 });
      if (data.success) setAiQuote(data.data);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'AI quote generation failed');
    }
    setAiLoading(false);
  }, [id]);

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
    <CRMLayout title="RFQ Detail">
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="h-6 w-6 text-violet-400 animate-spin" />
    </div>
    </CRMLayout>
  );

  if (!rfq) return (
    <CRMLayout title="RFQ Detail">
    <div className="text-center py-20">
      <AlertCircle className="h-12 w-12 text-slate-600 mx-auto mb-3" />
      <p className="text-slate-400">RFQ not found</p>
      <Button onClick={() => navigate('/crm/rfqs')} variant="outline" className="mt-4 border-white/[0.1] text-slate-300">Back to RFQs</Button>
    </div>
    </CRMLayout>
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
    { key: 'claims', label: `Claims${claimsAnalysis ? ` (${claimsAnalysis.summary.total_claims.toLocaleString()})` : ''}`, icon: Activity },
    { key: 'quotes', label: `Quotes (${quotes.length})`, icon: DollarSign },
    { key: 'ai-quote', label: 'AI Quote Engine', icon: BrainCircuit },
  ] as const;

  return (
    <CRMLayout title={rfq.insured_name || 'RFQ Detail'}>
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
          <input ref={claimsFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleClaimsUpload} className="hidden" />
          <Button onClick={() => claimsFileRef.current?.click()} disabled={claimsUploading} variant="outline"
            className="border-amber-500/20 text-amber-400 hover:bg-amber-500/10 rounded-xl h-9 text-sm gap-2">
            {claimsUploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Upload Claims
          </Button>
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
      {tab === 'claims' && <ClaimsExperienceTab analysis={claimsAnalysis} loading={claimsLoading} onUpload={() => claimsFileRef.current?.click()} uploading={claimsUploading} />}
      {tab === 'ai-quote' && <AIQuoteTab rfqId={rfq.id} aiQuote={aiQuote} aiLoading={aiLoading} onGenerate={generateAIQuote} navigate={navigate} claimsAnalysis={claimsAnalysis} />}
    </div>
    </CRMLayout>
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
                <span className="text-sm text-white font-medium">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
              </div>
            )) : <p className="text-xs text-slate-600">—</p>}
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase font-semibold mb-2">At Renewal</p>
            {Object.entries(livesRenewal).length > 0 ? Object.entries(livesRenewal).map(([k, v]) => (
              <div key={k} className="flex justify-between py-1">
                <span className="text-xs text-slate-500 capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="text-sm text-white font-medium">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
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
                <p className="text-sm text-slate-300">{typeof v === 'string' ? v : JSON.stringify(v)}</p>
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
            {conditions.map((c: any, i: number) => (
              <div key={i} className="flex gap-3 py-2 px-3 rounded-lg bg-white/[0.02]">
                <span className="text-xs font-bold text-violet-400 mt-0.5">{i + 1}.</span>
                <p className="text-sm text-slate-300">{typeof c === 'string' ? c : (c?.detail || c?.condition || JSON.stringify(c))}</p>
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
// CLAIMS EXPERIENCE TAB — Full underwriting analysis dashboard
// ═══════════════════════════════════════════════════════════════════════════════

function ClaimsExperienceTab({ analysis, loading, onUpload, uploading }: any) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-600/20 to-orange-600/20 rounded-full blur-3xl" />
          <div className="relative bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-3xl p-8">
            <FileSpreadsheet className="h-16 w-16 text-amber-400" />
          </div>
        </div>
        <div className="text-center space-y-2 max-w-lg">
          <h3 className="text-xl font-bold text-white">No Claims History Uploaded</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Upload previous year claims MIS data to enable <span className="text-amber-300">experience-based underwriting</span>. 
            The engine will analyze <span className="text-cyan-300">ICR</span>, <span className="text-emerald-300">utilization rates</span>, 
            <span className="text-violet-300">trend patterns</span>, service &amp; relationship distributions for accurate pricing.
          </p>
        </div>
        <Button onClick={onUpload} disabled={uploading}
          className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-0 rounded-xl h-11 px-8 gap-3 text-sm font-semibold shadow-lg shadow-amber-600/25">
          {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload Claims MIS
        </Button>
      </div>
    );
  }

  const a = analysis;
  const k = a.kpis;
  const icrColor = k.utilization_rate > 50 ? 'text-red-400' : k.utilization_rate > 30 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="space-y-6">
      {/* ─── KPI Strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total Claims', value: a.summary.total_claims.toLocaleString(), color: 'from-violet-600 to-indigo-600' },
          { label: 'Total Claimed', value: formatCurrency(a.summary.total_claimed), color: 'from-red-600 to-pink-600' },
          { label: 'Total Approved', value: formatCurrency(a.summary.total_approved), color: 'from-emerald-600 to-teal-600' },
          { label: 'Utilization Rate', value: `${k.utilization_rate}%`, color: k.utilization_rate > 50 ? 'from-red-600 to-orange-600' : 'from-cyan-600 to-blue-600' },
          { label: 'Claim Frequency', value: `${k.claim_frequency}/yr`, color: 'from-amber-600 to-orange-600' },
          { label: 'Approval Ratio', value: `${k.approval_ratio}%`, color: 'from-blue-600 to-indigo-600' },
          { label: 'Avg Claim Size', value: `₹${a.summary.avg_claim_size.toLocaleString()}`, color: 'from-slate-600 to-zinc-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${color}`} />
            <p className="text-[9px] text-slate-500 uppercase font-semibold tracking-wider mb-1">{label}</p>
            <p className="text-lg font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* ─── Underwriting Flags ──────────────────────────────── */}
      {a.underwriting_flags?.length > 0 && (
        <div className="space-y-2">
          {a.underwriting_flags.map((f: any, i: number) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
              f.type === 'critical' ? 'border-red-500/30 bg-red-500/5' : f.type === 'warning' ? 'border-amber-500/30 bg-amber-500/5' : 'border-blue-500/30 bg-blue-500/5'}`}>
              <AlertCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                f.type === 'critical' ? 'text-red-400' : f.type === 'warning' ? 'text-amber-400' : 'text-blue-400'}`} />
              <p className="text-xs text-slate-300">{f.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─── Claim Severity Distribution ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-violet-400" /> Claim Severity Distribution
          </h3>
          <div className="space-y-2">
            {a.severity_distribution.map((s: any) => {
              const maxCount = Math.max(...a.severity_distribution.map((x: any) => x.count));
              return (
                <div key={s.band} className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 w-16 text-right font-mono">{s.band}</span>
                  <div className="flex-1 h-5 bg-white/[0.03] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${Math.max(5, (s.count / maxCount) * 100)}%` }}>
                      <span className="text-[9px] text-white font-bold">{s.count}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 w-16 text-right">{formatCurrency(s.total)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ─── Service-Type Distribution ────────────────────── */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-cyan-400" /> Service-Type Distribution
          </h3>
          <div className="space-y-3">
            {a.service_distribution.map((s: any, i: number) => (
              <div key={s.service_type} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-xs text-white font-medium">{s.service_type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500">{s.claim_count} claims</span>
                    <span className="text-xs text-amber-400 font-semibold">{s.share_pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.share_pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Claimed: {formatCurrency(s.total_claimed)}</span>
                  <span>Approved: {formatCurrency(s.total_approved)}</span>
                  <span>Avg: ₹{s.avg_per_claim.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ─── Relationship-Wise Utilization ────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-emerald-400" /> Relationship-Wise Utilization
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Relationship', 'Claims', 'Unique Claimants', 'Members', 'Utilization %', 'Claims/Claimant', 'Total Claimed', 'Total Approved', 'Avg/Claim'].map(h => (
                  <th key={h} className="py-2 px-2 text-[10px] text-slate-500 uppercase font-semibold text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.relationship_analysis.map((r: any) => (
                <tr key={r.relationship} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2.5 px-2 text-white font-medium">{r.relationship}</td>
                  <td className="py-2.5 px-2 text-slate-300">{r.claim_count.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-slate-300">{r.unique_claimants.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-slate-400">{r.member_count.toLocaleString()}</td>
                  <td className="py-2.5 px-2">
                    <span className={`text-xs font-bold ${r.utilization_rate > 50 ? 'text-red-400' : r.utilization_rate > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {r.utilization_rate}%
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-cyan-400">{r.claims_per_claimant}</td>
                  <td className="py-2.5 px-2 text-slate-300">{formatCurrency(r.total_claimed)}</td>
                  <td className="py-2.5 px-2 text-emerald-400">{formatCurrency(r.total_approved)}</td>
                  <td className="py-2.5 px-2 text-amber-400">₹{r.avg_per_claim.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── Age Band Claims + Monthly Trend ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-400" /> Age-Band Claims Analysis
          </h3>
          {a.age_band_claims.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={a.age_band_claims}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="age_band" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v: number) => v >= 100000 ? `₹${(v/100000).toFixed(0)}L` : `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11 }} />
                <Bar dataKey="total_claimed" name="Claimed" fill="#f59e0b" radius={[4,4,0,0]} />
                <Bar dataKey="total_approved" name="Approved" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-500 text-center py-8">No age data available</p>}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cyan-400" /> Monthly Claims Trend
          </h3>
          {a.monthly_trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={a.monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 9 }} angle={-35} textAnchor="end" height={50} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v: number) => v >= 100000 ? `₹${(v/100000).toFixed(0)}L` : `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11 }} />
                <Bar dataKey="claimed" name="Claimed" fill="#8b5cf6" radius={[4,4,0,0]} />
                <Bar dataKey="approved" name="Approved" fill="#06b6d4" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-500 text-center py-8">No monthly data available</p>}
        </Card>
      </div>

      {/* ─── Top Diagnoses + Claim Status ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-red-400" /> Top Diagnoses by Cost
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {a.top_diagnoses.map((d: any, i: number) => {
              const maxClaimed = Math.max(...a.top_diagnoses.map((x: any) => x.total_claimed));
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 w-5 text-right">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-slate-300 truncate max-w-[200px]">{d.diagnosis}</span>
                      <span className="text-xs text-amber-400 font-medium">{formatCurrency(d.total_claimed)}</span>
                    </div>
                    <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-500 to-pink-500 rounded-full"
                        style={{ width: `${(d.total_claimed / maxClaimed) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 w-12 text-right">{d.claim_count} claims</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" /> Claim Status Distribution
          </h3>
          <div className="space-y-3">
            {a.claim_status_distribution.map((s: any, i: number) => {
              const total = a.summary.total_claims;
              const pct = total > 0 ? Math.round(s.count / total * 100) : 0;
              return (
                <div key={s.status} className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-xs text-white font-medium">{s.status}</span>
                    <span className="text-xs text-slate-400">{s.count.toLocaleString()} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Provider type breakdown */}
          {a.provider_type_distribution?.length > 0 && (
            <>
              <div className="border-t border-white/[0.06] mt-5 pt-4">
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Provider Type</p>
                <div className="grid grid-cols-2 gap-3">
                  {a.provider_type_distribution.map((p: any, i: number) => (
                    <div key={p.type} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 text-center">
                      <p className="text-xs text-slate-500">{p.type}</p>
                      <p className="text-lg font-bold text-white mt-1">{p.claims.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500">claims &middot; {formatCurrency(p.total_claimed)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ─── SI Utilization + Repeat Claimants ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-violet-400" /> SI Utilization Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(a.si_utilization.distribution).map(([band, count]: [string, any], i) => {
              const total = Object.values(a.si_utilization.distribution).reduce((s: number, v: any) => s + v, 0) as number;
              const pct = total > 0 ? Math.round(count / total * 100) : 0;
              return (
                <div key={band} className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-300">{band}</span>
                    <span className="text-xs text-slate-400">{count} members ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${band === '>100%' ? 'bg-red-500' : band === '75-100%' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.max(3, pct)}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-white/[0.06] pt-3 mt-3">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Avg SI Utilization</span>
                <span className={`text-sm font-bold ${a.si_utilization.avg_pct > 60 ? 'text-red-400' : a.si_utilization.avg_pct > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {a.si_utilization.avg_pct}%
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Hash className="h-4 w-4 text-cyan-400" /> Repeat Claimant Frequency
          </h3>
          <div className="space-y-3">
            {a.repeat_claimant_freq.map((r: any, i: number) => {
              const total = a.repeat_claimant_freq.reduce((s: number, x: any) => s + x.count, 0);
              const pct = total > 0 ? Math.round(r.count / total * 100) : 0;
              return (
                <div key={r.band} className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-300">{r.band}</span>
                    <span className="text-xs text-slate-400">{r.count} members ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" style={{ width: `${Math.max(3, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Top claimants preview */}
          {a.top_claimants?.length > 0 && (
            <div className="border-t border-white/[0.06] mt-4 pt-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Top 5 Claimants by Cost</p>
              {a.top_claimants.slice(0, 5).map((c: any, i: number) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-white/[0.03] last:border-0">
                  <div>
                    <span className="text-xs text-white">{c.name || c.emp_code}</span>
                    <span className="text-[10px] text-slate-500 ml-2">{c.relationship} &middot; {c.claim_count} claims</span>
                  </div>
                  <span className="text-xs text-amber-400 font-medium">{formatCurrency(c.total_claimed)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ─── Percentile Summary ──────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-amber-400" /> Claim Size Percentile Analysis
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {[
            { label: 'Average', value: a.summary.avg_claim_size },
            { label: 'Median (P50)', value: a.summary.median_claim },
            { label: 'P90', value: a.summary.p90_claim },
            { label: 'P95', value: a.summary.p95_claim },
            { label: 'P99', value: a.summary.p99_claim },
            { label: 'Maximum', value: a.summary.max_claim },
          ].map(({ label, value }) => (
            <div key={label} className="text-center bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">{label}</p>
              <p className="text-lg font-bold text-white mt-1">₹{value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Upload new claims button */}
      <div className="flex justify-center pt-2">
        <Button onClick={onUpload} disabled={uploading} variant="outline"
          className="border-amber-500/20 text-amber-400 hover:bg-amber-500/10 rounded-xl h-10 px-6 gap-2">
          {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Re-upload Claims MIS
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI QUOTE GENERATION TAB
// ═══════════════════════════════════════════════════════════════════════════════

function AIQuoteTab({ rfqId, aiQuote, aiLoading, onGenerate, navigate, claimsAnalysis }: any) {
  const [visibleSteps, setVisibleSteps] = useState(0);

  // Animate reasoning steps appearing one by one
  useEffect(() => {
    if (!aiQuote?.reasoning) return;
    setVisibleSteps(0);
    const interval = setInterval(() => {
      setVisibleSteps(prev => {
        if (prev >= aiQuote.reasoning.length) { clearInterval(interval); return prev; }
        return prev + 1;
      });
    }, 400);
    return () => clearInterval(interval);
  }, [aiQuote]);

  const applyToQuoteBuilder = () => {
    if (!aiQuote?.recommended_quote) return;
    // Store in sessionStorage so QuoteBuilderPage can pick it up
    sessionStorage.setItem('ai_quote_prefill', JSON.stringify(aiQuote.recommended_quote));
    navigate(`/crm/rfqs/${rfqId}/quote/new`);
  };

  if (!aiQuote && !aiLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 to-cyan-600/20 rounded-full blur-3xl" />
          <div className="relative bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border border-violet-500/20 rounded-3xl p-8">
            <BrainCircuit className="h-16 w-16 text-violet-400" />
          </div>
        </div>
        <div className="text-center space-y-2 max-w-lg">
          <h3 className="text-xl font-bold text-white">AI Actuarial Quote Engine</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Deep-tech pricing engine that analyzes <span className="text-violet-300">member demographics</span>,{' '}
            <span className="text-cyan-300">age-banded risk factors</span>,{' '}
            <span className="text-emerald-300">OPD utilization curves</span>, and{' '}
            <span className="text-amber-300">claims experience</span> to generate actuarially-priced OPD &amp; Wellness quotes.
          </p>
        </div>
        {/* Claims data status badge */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${claimsAnalysis 
          ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
          {claimsAnalysis ? <Check className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-amber-400" />}
          <span className={`text-xs font-medium ${claimsAnalysis ? 'text-emerald-300' : 'text-amber-300'}`}>
            {claimsAnalysis 
              ? `${claimsAnalysis.summary.total_claims.toLocaleString()} claims loaded — Experience-based pricing will be used`
              : 'No claims data — Benchmark-based pricing will be used'}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          {[
            { icon: Activity, label: 'Age-Banded Risk', color: 'text-violet-400' },
            { icon: Target, label: 'OPD Utilization', color: 'text-cyan-400' },
            { icon: TrendingUp, label: 'Claims Experience', color: claimsAnalysis ? 'text-emerald-400' : 'text-slate-600' },
            { icon: Gauge, label: 'IBNR + Margin', color: 'text-amber-400' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <Icon className={`h-5 w-5 ${color} mx-auto mb-1.5`} />
              <p className="text-[10px] text-slate-500 font-medium">{label}</p>
            </div>
          ))}
        </div>
        <Button onClick={onGenerate}
          className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 border-0 rounded-xl h-11 px-8 gap-3 text-sm font-semibold shadow-lg shadow-violet-600/25 mt-2">
          <BrainCircuit className="h-4 w-4" /> Generate AI Quote
        </Button>
      </div>
    );
  }

  if (aiLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600/30 to-cyan-600/30 rounded-full blur-3xl animate-pulse" />
          <div className="relative bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border border-violet-500/20 rounded-3xl p-8">
            <BrainCircuit className="h-16 w-16 text-violet-400 animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-bold text-white">Analyzing {(aiQuote?.population?.total_lives || '').toLocaleString() || ''} lives...</h3>
          <div className="flex flex-col gap-2 text-sm text-slate-500">
            {['Computing age-banded risk factors...', 'Modeling OPD utilization curves...', 'Applying IBNR & margin loading...', 'Generating slab-wise pricing...'].map((step, i) => (
              <p key={i} className="animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>{step}</p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const d = aiQuote;
  const riskColor = d.risk_assessment.category === 'HIGH' ? 'text-red-400' : d.risk_assessment.category === 'MODERATE' ? 'text-amber-400' : 'text-emerald-400';
  const riskBg = d.risk_assessment.category === 'HIGH' ? 'from-red-600' : d.risk_assessment.category === 'MODERATE' ? 'from-amber-600' : 'from-emerald-600';
  const impactColors: Record<string, string> = { adverse: 'border-red-500/30 bg-red-500/5', favorable: 'border-emerald-500/30 bg-emerald-500/5', neutral: 'border-slate-500/20 bg-white/[0.02]', result: 'border-violet-500/30 bg-violet-500/5' };
  const impactDots: Record<string, string> = { adverse: 'bg-red-400', favorable: 'bg-emerald-400', neutral: 'bg-slate-500', result: 'bg-violet-400' };

  return (
    <div className="space-y-6">
      {/* ─── Pricing Method Badge ─────────────────────────────── */}
      {d.risk_assessment.pricing_method && (
        <div className={`flex items-center justify-between p-4 rounded-2xl border ${
          d.risk_assessment.pricing_method === 'experience'
            ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-500/20 bg-white/[0.02]'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${d.risk_assessment.pricing_method === 'experience' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            <div>
              <span className="text-sm font-bold text-white">
                {d.risk_assessment.pricing_method === 'experience' ? 'Experience-Rated Pricing' : 'Benchmark-Based Pricing'}
              </span>
              {d.risk_assessment.pricing_method === 'experience' && (
                <span className="text-xs text-emerald-400 ml-2">Credibility: {d.risk_assessment.credibility_factor}%</span>
              )}
            </div>
          </div>
          {d.risk_assessment.icr && (
            <div className={`px-3 py-1.5 rounded-lg border ${
              d.risk_assessment.icr.verdict === 'ADVERSE' ? 'border-red-500/30 bg-red-500/10' :
              d.risk_assessment.icr.verdict === 'FAVORABLE' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'
            }`}>
              <span className="text-[10px] text-slate-500 uppercase">ICR</span>
              <span className={`text-sm font-bold ml-2 ${
                d.risk_assessment.icr.verdict === 'ADVERSE' ? 'text-red-400' :
                d.risk_assessment.icr.verdict === 'FAVORABLE' ? 'text-emerald-400' : 'text-amber-400'
              }`}>{d.risk_assessment.icr.icr}%</span>
              <span className={`text-[10px] ml-1 ${
                d.risk_assessment.icr.verdict === 'ADVERSE' ? 'text-red-400' :
                d.risk_assessment.icr.verdict === 'FAVORABLE' ? 'text-emerald-400' : 'text-amber-400'
              }`}>{d.risk_assessment.icr.verdict}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Claims Experience Summary (when available) ───────── */}
      {d.claims_experience && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Claims Analyzed', value: d.claims_experience.total_claims.toLocaleString(), color: 'from-violet-600 to-indigo-600' },
            { label: 'PMPY (Approved)', value: `₹${d.claims_experience.pmpy_approved.toLocaleString()}`, color: 'from-emerald-600 to-teal-600' },
            { label: 'Utilization Rate', value: `${d.claims_experience.utilization_rate}%`, color: d.claims_experience.utilization_rate > 50 ? 'from-red-600 to-orange-600' : 'from-cyan-600 to-blue-600' },
            { label: 'Claim Frequency', value: `${d.claims_experience.claim_frequency_pmpy}/yr`, color: 'from-amber-600 to-orange-600' },
            { label: 'Approval Ratio', value: `${d.claims_experience.approval_ratio}%`, color: 'from-blue-600 to-indigo-600' },
            { label: 'Observed Trend', value: `${d.claims_experience.observed_trend > 0 ? '+' : ''}${d.claims_experience.observed_trend}%`, color: d.claims_experience.observed_trend > 15 ? 'from-red-600 to-pink-600' : 'from-slate-600 to-zinc-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${color}`} />
              <p className="text-[9px] text-slate-500 uppercase font-semibold tracking-wider mb-1">{label}</p>
              <p className="text-lg font-bold text-white">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─── Hero Summary Strip ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'OPD Premium', value: formatCurrency(d.opd_pricing.loaded_premium), sub: `₹${d.opd_pricing.per_family.toLocaleString()}/family`, color: 'from-violet-600 to-indigo-600' },
          { label: 'Wellness Premium', value: formatCurrency(d.wellness_pricing.loaded_premium), sub: `₹${d.wellness_pricing.per_family.toLocaleString()}/family`, color: 'from-cyan-600 to-blue-600' },
          { label: 'Combined Total', value: formatCurrency(d.combined.total_premium), sub: `₹${d.combined.per_family.toLocaleString()}/family`, color: 'from-emerald-600 to-teal-600' },
          { label: 'Risk Score', value: `${d.risk_assessment.overall_score}/100`, sub: d.risk_assessment.category, color: d.risk_assessment.category === 'HIGH' ? 'from-red-600 to-orange-600' : d.risk_assessment.category === 'MODERATE' ? 'from-amber-600 to-orange-600' : 'from-emerald-600 to-green-600' },
          { label: 'Loss Ratio', value: `${d.opd_pricing.expected_loss_ratio}%`, sub: 'Expected', color: 'from-slate-600 to-zinc-600' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${color}`} />
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">{label}</p>
            <p className="text-xl font-bold text-white">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ─── AI Reasoning Chain ───────────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-violet-400" /> AI Reasoning Chain
        </h3>
        <div className="space-y-2">
          {d.reasoning.map((step: any, i: number) => (
            <div key={i}
              className={`border rounded-xl p-3.5 transition-all duration-500 ${i < visibleSteps ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} ${impactColors[step.impact] || impactColors.neutral}`}>
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${impactDots[step.impact] || impactDots.neutral}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">{step.step}</span>
                    {step.factor && step.factor !== 1 && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${step.factor > 1.01 ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                        ×{step.factor}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{step.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ─── Population Demographics ──────────────────────────── */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" /> Population Demographics
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Lives', value: d.population.total_lives.toLocaleString() },
              { label: 'Employees', value: d.population.employees.toLocaleString() },
              { label: 'Dependants', value: d.population.dependants.toLocaleString() },
              { label: 'Avg Age', value: `${d.population.avg_age} yrs` },
              { label: 'Avg Family Size', value: d.population.avg_family_size },
              { label: 'Male / Female', value: `${d.population.male_pct}% / ${d.population.female_pct}%` },
              { label: 'High-Risk (45+)', value: `${d.population.high_risk_pct}%` },
              { label: 'Composite Factor', value: `×${d.risk_assessment.composite_factor}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-1.5">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-medium text-white">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ─── Risk Gauge ───────────────────────────────────────── */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-amber-400" /> Risk Assessment
          </h3>
          <div className="flex flex-col items-center py-4">
            {/* Circular gauge */}
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                <circle cx="60" cy="60" r="50" fill="none"
                  stroke={d.risk_assessment.category === 'HIGH' ? '#ef4444' : d.risk_assessment.category === 'MODERATE' ? '#f59e0b' : '#10b981'}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${d.risk_assessment.overall_score * 3.14} ${314 - d.risk_assessment.overall_score * 3.14}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${riskColor}`}>{d.risk_assessment.overall_score}</span>
                <span className="text-[10px] text-slate-500 uppercase">/ 100</span>
              </div>
            </div>
            <span className={`mt-3 text-sm font-bold ${riskColor}`}>{d.risk_assessment.category} RISK</span>
            <div className="grid grid-cols-3 gap-4 mt-4 w-full">
              {[
                { label: 'Gender', value: `×${d.risk_assessment.gender_factor}` },
                { label: 'Family Size', value: `×${d.risk_assessment.family_size_factor}` },
                { label: 'Age Conc.', value: `×${d.risk_assessment.age_concentration_factor}` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-[10px] text-slate-600 uppercase">{label}</p>
                  <p className="text-sm font-semibold text-slate-300">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Component Breakdown ──────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" /> Claims Component Breakdown (Pure Premium)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Consultations', value: d.component_breakdown.consultation, color: 'bg-violet-500', pct: Math.round(d.component_breakdown.consultation / (d.component_breakdown.consultation + d.component_breakdown.lab_tests + d.component_breakdown.pharmacy + d.component_breakdown.wellness) * 100) },
            { label: 'Lab Tests', value: d.component_breakdown.lab_tests, color: 'bg-cyan-500', pct: Math.round(d.component_breakdown.lab_tests / (d.component_breakdown.consultation + d.component_breakdown.lab_tests + d.component_breakdown.pharmacy + d.component_breakdown.wellness) * 100) },
            { label: 'Pharmacy', value: d.component_breakdown.pharmacy, color: 'bg-amber-500', pct: Math.round(d.component_breakdown.pharmacy / (d.component_breakdown.consultation + d.component_breakdown.lab_tests + d.component_breakdown.pharmacy + d.component_breakdown.wellness) * 100) },
            { label: 'Wellness', value: d.component_breakdown.wellness, color: 'bg-emerald-500', pct: Math.round(d.component_breakdown.wellness / (d.component_breakdown.consultation + d.component_breakdown.lab_tests + d.component_breakdown.pharmacy + d.component_breakdown.wellness) * 100) },
          ].map(({ label, value, color, pct }) => (
            <div key={label} className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-medium text-slate-300">{pct}%</span>
              </div>
              <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-sm font-bold text-white">{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ─── Age Band Deep Analysis ──────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-violet-400" /> Age-Banded Risk & Cost Analysis
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Age Band', 'Lives', '% Pop', 'Risk Factor', 'OPD Visits/yr', 'Consult', 'Lab', 'Pharma', 'OPD/Person', 'Wellness/Person', 'Band Total'].map(h => (
                  <th key={h} className="py-2 px-2 text-[10px] text-slate-500 uppercase font-semibold text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.age_band_analysis.map((b: any) => {
                const barWidth = Math.min(100, b.risk_factor * 50);
                return (
                  <tr key={b.age_band} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-2 text-white font-medium">{b.age_band}</td>
                    <td className="py-2.5 px-2 text-slate-300">{b.lives.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-slate-400">{b.pct_of_total}%</td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${b.risk_factor > 1.5 ? 'bg-red-500' : b.risk_factor > 1.0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="text-xs text-slate-300 font-mono">{b.risk_factor}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-cyan-400 font-medium">{b.opd_visits_per_year}</td>
                    <td className="py-2.5 px-2 text-slate-400">₹{b.breakdown.consultation.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-slate-400">₹{b.breakdown.lab_tests.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-slate-400">₹{b.breakdown.pharmacy.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-white font-medium">₹{b.expected_opd_cost_per_person.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-emerald-400">{b.wellness_cost_per_person ? `₹${b.wellness_cost_per_person.toLocaleString()}` : '—'}</td>
                    <td className="py-2.5 px-2 text-amber-400 font-bold">{formatCurrency(b.expected_opd_total + b.wellness_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── SI Slab Pricing ─────────────────────────────────── */}
      {d.slab_pricing.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-400" /> SI Slab-wise Recommended Pricing
          </h3>
          <div className="space-y-3">
            {d.slab_pricing.map((s: any) => {
              const barWidth = Math.min(100, (s.premium_per_family / d.slab_pricing[d.slab_pricing.length - 1].premium_per_family) * 100);
              return (
                <div key={s.slab} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">{s.slab}</span>
                      <span className="text-xs text-slate-500">{s.lives.toLocaleString()} families</span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-amber-400">₹{s.premium_per_family.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-500 ml-1">/family</span>
                    </div>
                  </div>
                  <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-1000" style={{ width: `${barWidth}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>₹{s.premium_per_life.toLocaleString()}/life</span>
                    <span>Utilization cap {s.utilization_cap_pct}%</span>
                    <span>Loss ratio {s.expected_loss_ratio}%</span>
                    <span>Total {formatCurrency(s.total_premium)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ─── Confidence Interval ─────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-400" /> Pricing Summary & Confidence
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <p className="text-[10px] text-slate-600 uppercase font-semibold">OPD (Required)</p>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Pure Premium</span><span className="text-xs text-slate-300">{formatCurrency(d.opd_pricing.pure_premium)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Loaded Premium</span><span className="text-sm font-bold text-violet-400">{formatCurrency(d.opd_pricing.loaded_premium)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Per Family</span><span className="text-xs text-slate-300">₹{d.opd_pricing.per_family.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Per Life</span><span className="text-xs text-slate-300">₹{d.opd_pricing.per_life.toLocaleString()}</span></div>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] text-slate-600 uppercase font-semibold">Wellness (Optional)</p>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Uptake Assumption</span><span className="text-xs text-slate-300">{d.wellness_pricing.assumed_uptake_pct}%</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Loaded Premium</span><span className="text-sm font-bold text-cyan-400">{formatCurrency(d.wellness_pricing.loaded_premium)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Per Family</span><span className="text-xs text-slate-300">₹{d.wellness_pricing.per_family.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Per Life</span><span className="text-xs text-slate-300">₹{d.wellness_pricing.per_life.toLocaleString()}</span></div>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] text-slate-600 uppercase font-semibold">95% Confidence Interval</p>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Lower (2.5%)</span><span className="text-xs text-slate-300">{formatCurrency(d.combined.ci_95_lower)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Point Estimate</span><span className="text-sm font-bold text-emerald-400">{formatCurrency(d.combined.total_premium)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Upper (97.5%)</span><span className="text-xs text-slate-300">{formatCurrency(d.combined.ci_95_upper)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Variance</span><span className="text-xs text-slate-300">±{formatCurrency(d.combined.ci_95_upper - d.combined.total_premium)}</span></div>
          </div>
        </div>
      </Card>

      {/* ─── Actions ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <Button onClick={onGenerate} variant="outline"
          className="border-white/[0.1] text-slate-400 hover:bg-white/[0.05] rounded-xl h-10 px-5 gap-2">
          <RefreshCw className="h-4 w-4" /> Regenerate
        </Button>
        <Button onClick={applyToQuoteBuilder}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-0 rounded-xl h-10 px-6 gap-2 text-sm font-medium shadow-lg shadow-emerald-600/20">
          <Zap className="h-4 w-4" /> Apply to Quote Builder
        </Button>
      </div>
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
          // Check for AI-prefilled quote from sessionStorage
          if (isNew) {
            const aiPrefill = sessionStorage.getItem('ai_quote_prefill');
            if (aiPrefill) {
              try {
                const ai = JSON.parse(aiPrefill);
                setForm(f => ({
                  ...f,
                  total_premium: String(ai.total_premium || ''),
                  total_lives: String(ai.total_lives || m || ''),
                  per_life_cost: String(ai.per_life_cost || ''),
                  per_family_cost: String(ai.per_family_cost || ''),
                  pricing_model: ai.pricing_model || 'per_family',
                  commission_pct: String(ai.commission_pct ?? 15),
                  gst_pct: String(ai.gst_pct ?? 18),
                  discount_pct: String(ai.discount_pct ?? 0),
                  terms: ai.terms || '',
                }));
                if (ai.slab_pricing?.length > 0) {
                  setSlabs(ai.slab_pricing.map((s: any) => ({
                    slab: s.slab || '',
                    premium: String(s.premium || ''),
                    lives: String(s.lives || ''),
                  })));
                }
              } catch { /* ignore parse errors */ }
              sessionStorage.removeItem('ai_quote_prefill');
            }
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
    <CRMLayout title="Quote Builder">
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="h-6 w-6 text-violet-400 animate-spin" />
    </div>
    </CRMLayout>
  );

  return (
    <CRMLayout title={isNew ? 'Create Quote' : 'Edit Quote'}>
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
    </CRMLayout>
  );
}
