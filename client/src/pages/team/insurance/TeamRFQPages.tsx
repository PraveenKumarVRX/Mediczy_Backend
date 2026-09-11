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
  MoreVertical, CheckCircle2, XCircle, ChevronDown, Pencil, SlidersHorizontal,
  TrendingDown, ClipboardCheck, Phone, Mail, MapPin, ShieldCheck, Wand2,
} from 'lucide-react';
import { RFQUnderwritingTab } from './RFQUnderwritingTab';
import { toast } from 'sonner';
import api from '@/utils/api';
import { TeamInsuranceLayout } from './TeamInsuranceLayout';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  INSURANCE_POLICY_CATEGORIES,
  DEFAULT_INSURANCE_POLICY_CATEGORY
} from '@/constants/insurancePolicyCategories';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders() {
  const t = localStorage.getItem('teamToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const STATUS_COLORS: Record<string, string> = {
  received: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  quoting: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  quoted: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  negotiating: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  lost: 'bg-red-500/15 text-red-400 border-red-500/20',
  expired: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  sent: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  negotiating: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  accepted: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/20',
  revised: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

const CHART_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
const POLICY_TYPE_OPTIONS = INSURANCE_POLICY_CATEGORIES.map((item) => item.value);

function getPolicyTypeOptions(currentValue?: string) {
  const normalizedCurrent = String(currentValue || '').trim();
  if (!normalizedCurrent || POLICY_TYPE_OPTIONS.includes(normalizedCurrent)) {
    return POLICY_TYPE_OPTIONS;
  }

  // Keep legacy value selectable when editing old RFQs.
  return [normalizedCurrent, ...POLICY_TYPE_OPTIONS];
}

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

// ─── Create RFQ Modal ────────────────────────────────────────────────────────

function CreateRFQModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    insured_name: '', insured_address: '',
    broker_name: '', broker_company: '', broker_email: '', broker_phone: '',
    policy_type: DEFAULT_INSURANCE_POLICY_CATEGORY, product_type: 'GMC',
    existing_insurer: '', existing_tpa: '',
    policy_start: '', policy_end: '',
    existing_coverages: '', required_coverages: '',
    notes: '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.insured_name.trim()) { toast.error('Insured name is required'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/rfq/rfqs', form, { headers: authHeaders() });
      if (data.success) {
        toast.success(`RFQ ${data.data.rfq_number} created`);
        onCreated(data.data.id);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create RFQ');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1117] border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <h3 className="text-base font-bold text-white">New RFQ</h3>
            <p className="text-xs text-slate-500 mt-0.5">Fill in the details or upload an Excel / PDF / image to auto-parse</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {/* Insured Info */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Insured Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Insured Name *</Label>
                <Input value={form.insured_name} onChange={e => set('insured_name', e.target.value)}
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="ABC Corp Pvt. Ltd." />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Address</Label>
                <Input value={form.insured_address} onChange={e => set('insured_address', e.target.value)}
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="City, State" />
              </div>
            </div>
          </div>

          {/* Broker Info */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Broker Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Broker Name</Label>
                <Input value={form.broker_name} onChange={e => set('broker_name', e.target.value)}
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="Name" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Broker Company</Label>
                <Input value={form.broker_company} onChange={e => set('broker_company', e.target.value)}
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="Company name" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Email</Label>
                <Input value={form.broker_email} onChange={e => set('broker_email', e.target.value)} type="email"
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="broker@company.com" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Phone</Label>
                <Input value={form.broker_phone} onChange={e => set('broker_phone', e.target.value)}
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="+91 98xxx" />
              </div>
            </div>
          </div>

          {/* Policy Info */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Policy Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Policy Type</Label>
                <select value={form.policy_type} onChange={e => set('policy_type', e.target.value)}
                  className="mt-1.5 w-full px-3 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none">
                  {getPolicyTypeOptions(form.policy_type).map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Product Type</Label>
                <select value={form.product_type} onChange={e => set('product_type', e.target.value)}
                  className="mt-1.5 w-full px-3 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none">
                  {['GMC', 'OPD', 'GMC + OPD', 'GPA', 'GTL', 'Wellness'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Existing Insurer</Label>
                <Input value={form.existing_insurer} onChange={e => set('existing_insurer', e.target.value)}
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="e.g. Star Health" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Existing TPA</Label>
                <Input value={form.existing_tpa} onChange={e => set('existing_tpa', e.target.value)}
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" placeholder="e.g. Paramount" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Policy Start</Label>
                <Input value={form.policy_start} onChange={e => set('policy_start', e.target.value)} type="date"
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Policy End</Label>
                <Input value={form.policy_end} onChange={e => set('policy_end', e.target.value)} type="date"
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Existing Coverages</Label>
                <textarea value={form.existing_coverages} onChange={e => set('existing_coverages', e.target.value)} rows={3}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none placeholder:text-slate-600"
                  placeholder="e.g. Room Rent: Single AC, Maternity: ₹50,000, Day Care: Yes..." />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Required Coverages</Label>
                <textarea value={form.required_coverages} onChange={e => set('required_coverages', e.target.value)} rows={3}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none placeholder:text-slate-600"
                  placeholder="e.g. Room Rent: No limit, Maternity: ₹1,00,000, OPD: ₹25,000..." />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Notes</Label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none placeholder:text-slate-600"
                  placeholder="Any special requirements or context..." />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/[0.06]">
          <Button onClick={onClose} variant="outline" className="border-white/[0.1] text-slate-400 hover:bg-white/[0.05] rounded-xl h-9 text-sm">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 border-0 rounded-xl h-9 px-5 gap-2 text-sm font-medium shadow-lg shadow-violet-600/20">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {saving ? 'Creating...' : 'Create RFQ'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Status Updater ────────────────────────────────────────────────────

function StatusChip({ rfqId, current, onUpdated }: { rfqId: number; current: string; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const statuses = ['received', 'quoting', 'quoted', 'negotiating', 'won', 'lost', 'expired'];

  const update = async (s: string) => {
    if (s === current) { setOpen(false); return; }
    setSaving(true);
    try {
      await api.put(`/rfq/rfqs/${rfqId}`, { status: s }, { headers: authHeaders() });
      toast.success(`Status updated to ${s}`);
      onUpdated();
    } catch {
      toast.error('Failed to update status');
    }
    setSaving(false);
    setOpen(false);
  };

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLORS[current] || STATUS_COLORS['received']}`}>
        {current?.toUpperCase()}
        {saving ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <ChevronDown className="h-2.5 w-2.5" />}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-[#0f1117] border border-white/[0.1] rounded-xl shadow-2xl py-1 min-w-[120px]">
          {statuses.map(s => (
            <button key={s} onClick={() => update(s)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-white/[0.05] transition-colors flex items-center gap-2 ${s === current ? 'text-white font-bold' : 'text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s] || 'bg-slate-500'}`} />
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  received: 'bg-blue-400',
  quoting: 'bg-amber-400',
  quoted: 'bg-violet-400',
  won: 'bg-emerald-400',
  lost: 'bg-red-400',
  expired: 'bg-slate-400',
};

// ═══════════════════════════════════════════════════════════════════════════════
// RFQ LIST PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function TeamRFQsPage() {
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const fetchRFQs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/rfq/rfqs', { headers: authHeaders(), params });
      if (data.success) { setRfqs(data.data); setTotalPages(data.pagination?.totalPages || 1); }
    } catch { /* */ }
    setLoading(false);
  }, [page, search, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/rfq/rfqs-stats', { headers: authHeaders() });
      if (data.success) setStats(data.data);
    } catch { /* */ }
  }, []);

  useEffect(() => { fetchRFQs(); }, [fetchRFQs]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const [uploadProgress, setUploadProgress] = useState('');

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    let lastCreatedId: number | null = null;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (files.length > 1) setUploadProgress(`Parsing ${i + 1}/${files.length}...`);
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const endpoint = isExcel ? '/rfq/rfqs/upload-excel' : '/rfq/rfqs/upload-document';
      const label = isExcel ? 'Excel' : file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'image';
      try {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post(endpoint, fd, {
          headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
        if (data.success) {
          toast.success(`${files.length > 1 ? `[${i + 1}/${files.length}] ` : ''}RFQ created from ${label}: ${data.data.insured_name || data.data.rfq_number}`);
          lastCreatedId = data.data.id;
        }
      } catch (err: any) {
        toast.error(`${files.length > 1 ? `[${i + 1}/${files.length}] ` : ''}${err?.response?.data?.message || 'Upload failed'}: ${file.name}`);
      }
    }
    setUploadProgress('');
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    fetchRFQs();
    fetchStats();
    if (lastCreatedId && files.length === 1) navigate(`/rfq/rfqs/${lastCreatedId}`);
  };

  const deleteRFQ = async (id: number) => {
    if (!confirm('Delete this RFQ and all its members/quotes?')) return;
    try {
      await api.delete(`/rfq/rfqs/${id}`, { headers: authHeaders() });
      toast.success('RFQ deleted');
      fetchRFQs();
      fetchStats();
    } catch {
      toast.error('Failed to delete RFQ');
    }
  };

  const quickCapturePlan = async (rfqId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.post(`/rfq/rfqs/${rfqId}/autocapture-plan`, {}, { headers: authHeaders() });
      if (res.data.success) {
        if (res.data.alreadyCaptured) toast.info(res.data.message);
        else { toast.success(`Plan captured: ${res.data.data.display_name}`); fetchRFQs(); }
      }
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Capture failed'); }
  };

  return (
    <TeamInsuranceLayout title="RFQs">
    <div className="space-y-6">
      {showCreateModal && (
        <CreateRFQModal
          onClose={() => setShowCreateModal(false)}
          onCreated={id => { setShowCreateModal(false); fetchRFQs(); fetchStats(); navigate(`/rfq/rfqs/${id}`); }}
        />
      )}
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total RFQs', value: stats.total || 0, icon: FileText, gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-500/10', iconColor: 'text-violet-400' },
            { label: 'Received', value: stats.received || 0, icon: Clock, gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-500/10', iconColor: 'text-blue-400' },
            { label: 'Quoting', value: stats.quoting || 0, icon: Edit, gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10', iconColor: 'text-amber-400' },
            { label: 'Quoted', value: stats.quoted || 0, icon: Send, gradient: 'from-violet-500 to-indigo-500', bg: 'bg-violet-500/10', iconColor: 'text-violet-400' },
            { label: 'Won', value: stats.won || 0, icon: Check, gradient: 'from-emerald-500 to-green-500', bg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
            { label: 'Pipeline Value', value: formatCurrency(stats.total_quoted_premium || 0), icon: IndianRupee, gradient: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
          ].map(({ label, value, icon: Icon, gradient, bg, iconColor }) => (
            <div key={label} className="relative group p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] transition-all duration-300 overflow-hidden">
              <div className={`absolute -top-4 -right-4 w-12 h-12 rounded-full bg-gradient-to-br ${gradient} opacity-[0.07] group-hover:opacity-[0.12] transition-opacity`} />
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center ring-1 ring-white/[0.05]`}>
                  <Icon className={`h-4 w-4 ${iconColor}`} />
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">{label}</p>
                  <p className="text-lg font-bold text-white">{value}</p>
                </div>
              </div>
              {label === 'Won' && stats.total > 0 && (
                <div className="mt-2 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round(((stats.won || 0) / stats.total) * 100)}%` }} />
                </div>
              )}
            </div>
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
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp" multiple onChange={handleUploadFile} className="hidden" />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 border-0 rounded-xl h-10 px-4 gap-2 text-sm font-medium shadow-lg shadow-blue-600/20">
            {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? (uploadProgress || 'Parsing...') : 'Upload Broking Slip'}
          </Button>
          <Button onClick={() => setShowCreateModal(true)}
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
                {['RFQ #', 'Insured', 'Policy', 'Broker', 'Members', 'Quoted Premium', 'Win Value (w/ GST)', 'Quotes', 'Status', 'Date', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3.5"><div className="h-4 bg-white/[0.05] rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : rfqs.length === 0 ? (
                <tr><td colSpan={11} className="px-5 py-16 text-center">
                  <FileSpreadsheet className="h-12 w-12 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No RFQs yet. Click "New RFQ" or upload a broker Excel to get started.</p>
                </td></tr>
              ) : rfqs.map(r => {
                const quotedPremium = parseFloat(r.latest_quote_premium || 0);
                const winValue = quotedPremium > 0 ? Math.round(quotedPremium * 1.18) : 0; // inc. GST
                return (
                  <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors group"
                    onClick={() => navigate(`/rfq/rfqs/${r.id}`)}>
                    <td className="px-4 py-3 text-xs font-mono text-violet-400 font-medium">{r.rfq_number}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/15 to-blue-500/15 border border-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-3.5 w-3.5 text-violet-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white truncate max-w-[180px] group-hover:text-violet-300 transition-colors">{r.insured_name}</p>
                          <p className="text-[10px] text-slate-600">{r.product_type || 'GMC'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{r.policy_type || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-300 truncate max-w-[120px]">{r.broker_company || r.broker_name || '—'}</p>
                      {r.broker_email && <p className="text-[10px] text-slate-600 truncate max-w-[120px]">{r.broker_email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-white">{(r.member_count || 0).toLocaleString()}</span>
                      <span className="text-[10px] text-slate-600 ml-1">lives</span>
                    </td>
                    <td className="px-4 py-3">
                      {quotedPremium > 0 ? (
                        <div>
                          <p className="text-sm font-bold text-emerald-400">{formatCurrency(quotedPremium)}</p>
                          {r.latest_quote_status && (
                            <p className="text-[10px] text-slate-600 capitalize">{r.latest_quote_status}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600 italic">No quote yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {winValue > 0 ? (
                        <span className="text-sm font-semibold text-violet-400">{formatCurrency(winValue)}</span>
                      ) : <span className="text-xs text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(r.quote_count || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 text-xs font-semibold">
                          {r.quote_count} <FileText className="h-3 w-3" />
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip rfqId={r.id} current={r.status} onUpdated={() => { fetchRFQs(); fetchStats(); }} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {['quoted', 'negotiating', 'won'].includes(r.status) && (
                          <button onClick={e => quickCapturePlan(r.id, e)}
                            className="p-1.5 rounded-lg hover:bg-amber-500/10 text-slate-600 hover:text-amber-400 transition-colors" title="Autocapture as Corporate Plan">
                            <Wand2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); deleteRFQ(r.id); }}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Pagination page={page} totalPages={totalPages} setPage={setPage} />
    </div>
    </TeamInsuranceLayout>
  );
}


// ─── Edit RFQ Modal ───────────────────────────────────────────────────────────

function EditRFQModal({ rfq, onClose, onSaved }: { rfq: any; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    insured_name: rfq.insured_name || '',
    insured_address: rfq.insured_address || '',
    broker_name: rfq.broker_name || '',
    broker_company: rfq.broker_company || '',
    broker_email: rfq.broker_email || '',
    broker_phone: rfq.broker_phone || '',
    policy_type: rfq.policy_type || 'Group Mediclaim',
    product_type: rfq.product_type || 'GMC',
    existing_insurer: rfq.existing_insurer || '',
    existing_tpa: rfq.existing_tpa || '',
    policy_start: rfq.policy_start ? rfq.policy_start.slice(0, 10) : '',
    policy_end: rfq.policy_end ? rfq.policy_end.slice(0, 10) : '',
    existing_coverages: rfq.existing_coverages || '',
    required_coverages: rfq.required_coverages || '',
    notes: rfq.notes || '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.insured_name.trim()) { toast.error('Insured name is required'); return; }
    setSaving(true);
    try {
      const { data } = await api.put(`/rfq/rfqs/${rfq.id}`, form, { headers: authHeaders() });
      if (data.success) { toast.success('RFQ updated'); onSaved(); }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update RFQ');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1117] border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <h3 className="text-base font-bold text-white">Edit RFQ</h3>
            <p className="text-xs text-slate-500 mt-0.5">{rfq.rfq_number}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Insured Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Insured Name *</Label>
                <Input value={form.insured_name} onChange={e => set('insured_name', e.target.value)}
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Address</Label>
                <Input value={form.insured_address} onChange={e => set('insured_address', e.target.value)}
                  className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" />
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Broker Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Broker Name</Label><Input value={form.broker_name} onChange={e => set('broker_name', e.target.value)} className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" /></div>
              <div><Label className="text-xs text-slate-400">Broker Company</Label><Input value={form.broker_company} onChange={e => set('broker_company', e.target.value)} className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" /></div>
              <div><Label className="text-xs text-slate-400">Email</Label><Input value={form.broker_email} onChange={e => set('broker_email', e.target.value)} type="email" className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" /></div>
              <div><Label className="text-xs text-slate-400">Phone</Label><Input value={form.broker_phone} onChange={e => set('broker_phone', e.target.value)} className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" /></div>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Policy Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Policy Type</Label>
                <select value={form.policy_type} onChange={e => set('policy_type', e.target.value)}
                  className="mt-1.5 w-full px-3 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none">
                  {getPolicyTypeOptions(form.policy_type).map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Product Type</Label>
                <select value={form.product_type} onChange={e => set('product_type', e.target.value)}
                  className="mt-1.5 w-full px-3 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none">
                  {['GMC', 'OPD', 'GMC + OPD', 'GPA', 'GTL', 'Wellness'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div><Label className="text-xs text-slate-400">Existing Insurer</Label><Input value={form.existing_insurer} onChange={e => set('existing_insurer', e.target.value)} className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" /></div>
              <div><Label className="text-xs text-slate-400">Existing TPA</Label><Input value={form.existing_tpa} onChange={e => set('existing_tpa', e.target.value)} className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" /></div>
              <div><Label className="text-xs text-slate-400">Policy Start</Label><Input value={form.policy_start} onChange={e => set('policy_start', e.target.value)} type="date" className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" /></div>
              <div><Label className="text-xs text-slate-400">Policy End</Label><Input value={form.policy_end} onChange={e => set('policy_end', e.target.value)} type="date" className="mt-1.5 bg-white/[0.04] border-white/[0.08] text-white h-10 rounded-xl" /></div>
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Existing Coverages</Label>
                <textarea value={form.existing_coverages} onChange={e => set('existing_coverages', e.target.value)} rows={3}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none placeholder:text-slate-600"
                  placeholder="e.g. Room Rent: Single AC, Maternity: ₹50,000, Day Care: Yes..." />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Required Coverages</Label>
                <textarea value={form.required_coverages} onChange={e => set('required_coverages', e.target.value)} rows={3}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none placeholder:text-slate-600"
                  placeholder="e.g. Room Rent: No limit, Maternity: ₹1,00,000, OPD: ₹25,000..." />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-400">Notes</Label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/[0.06]">
          <Button onClick={onClose} variant="outline" className="border-white/[0.1] text-slate-400 hover:bg-white/[0.05] rounded-xl h-9 text-sm">Cancel</Button>
          <Button onClick={handleSave} disabled={saving}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 border-0 rounded-xl h-9 px-5 gap-2 text-sm font-medium">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RFQ DETAIL PAGE (Broking Slip + Analytics + Members + Quotes)
// ═══════════════════════════════════════════════════════════════════════════════

export function TeamRFQDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Guard: if id is not numeric (e.g. "new"), redirect to RFQ list
  useEffect(() => {
    if (id && !/^\d+$/.test(id)) navigate('/rfq/rfqs', { replace: true });
  }, [id, navigate]);

  const [rfq, setRfq] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [memberPage, setMemberPage] = useState(1);
  const [memberTotalPages, setMemberTotalPages] = useState(1);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'analytics' | 'members' | 'claims' | 'quotes' | 'ai-quote' | 'intelligence' | 'deep-analytics' | 'underwriting'>('overview');
  const fileRef = useRef<HTMLInputElement>(null);
  const claimsFileRef = useRef<HTMLInputElement>(null);
  const reparseFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [claimsUploading, setClaimsUploading] = useState(false);
  const [reparseLoading, setReparseLoading] = useState(false);
  const [aiQuote, setAiQuote] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [claimsAnalysis, setClaimsAnalysis] = useState<any>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [intelligence, setIntelligence] = useState<any>(null);
  // ai_quote_data persisted in DB — load it when available
  const [savedAiQuote, setSavedAiQuote] = useState<any>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [deepAnalytics, setDeepAnalytics] = useState<any>(null);
  const [deepAnalyticsLoading, setDeepAnalyticsLoading] = useState(false);
  const [capturingPlan, setCapturingPlan] = useState(false);
  const [capturedPlan, setCapturedPlan] = useState<any>(null);

  const isValidId = id && /^\d+$/.test(id);

  const fetchRFQ = useCallback(async () => {
    if (!isValidId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/rfq/rfqs/${id}`, { headers: authHeaders() });
      if (data.success) {
        setRfq(data.data);
        // Restore persisted AI quote result from DB (replaces sessionStorage handoff)
        if (data.data.ai_quote_data && !aiQuote) {
          const raw = typeof data.data.ai_quote_data === 'string' ? JSON.parse(data.data.ai_quote_data) : data.data.ai_quote_data;
          // Normalize: old DB rows saved the outer { success, data: {...} } wrapper — unwrap if needed
          setAiQuote(raw?.risk_assessment ? raw : (raw?.data || raw));
        }
      }
    } catch { /* */ }
    setLoading(false);
  }, [id, isValidId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalytics = useCallback(async () => {
    if (!isValidId) return;
    try {
      const { data } = await api.get(`/rfq/rfqs/${id}/member-analytics`, { headers: authHeaders() });
      if (data.success) setAnalytics(data.data);
    } catch { /* */ }
  }, [id, isValidId]);

  const fetchMembers = useCallback(async () => {
    if (!isValidId) return;
    try {
      const params: any = { page: memberPage, limit: 50 };
      if (memberSearch) params.search = memberSearch;
      const { data } = await api.get(`/rfq/rfqs/${id}/members`, { headers: authHeaders(), params });
      if (data.success) { setMembers(data.data); setMemberTotalPages(data.pagination?.totalPages || 1); }
    } catch { /* */ }
  }, [id, isValidId, memberPage, memberSearch]);

  useEffect(() => { fetchRFQ(); fetchAnalytics(); }, [fetchRFQ, fetchAnalytics]);
  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // Clear on-demand analysis results when navigating to a different RFQ
  useEffect(() => {
    setDeepAnalytics(null);
    setIntelligence(null);
    setAiQuote(null);
    setClaimsAnalysis(null);
  }, [id]);

  const fetchClaimsAnalysis = useCallback(async () => {
    if (!isValidId) return;
    setClaimsLoading(true);
    try {
      const { data } = await api.get(`/rfq/rfqs/${id}/claims-analysis`, { headers: authHeaders() });
      if (data.success && data.data) setClaimsAnalysis(data.data);
    } catch { /* */ }
    setClaimsLoading(false);
  }, [id, isValidId]);

  // Lazy: only fetch claims analysis when claims tab is first opened
  const claimsAnalysisLoadedRef = useRef(false);
  useEffect(() => {
    if (tab === 'claims' && !claimsAnalysisLoadedRef.current) {
      claimsAnalysisLoadedRef.current = true;
      fetchClaimsAnalysis();
    }
  }, [tab, fetchClaimsAnalysis]);

  // Reset lazy-load flag when id changes
  useEffect(() => { claimsAnalysisLoadedRef.current = false; }, [id]);

  const handleClaimsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setClaimsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/rfq/rfqs/${id}/upload-claims`, fd, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      if (data.success) {
        toast.success(`Claims uploaded: ${data.data?.claimCount ?? ''} records`);
        if (data.data?.warnings?.length) {
          data.data.warnings.forEach((w: string) => toast.warning(w, { duration: 8000 }));
        }
        fetchClaimsAnalysis();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Claims upload failed');
    }
    setClaimsUploading(false);
    if (claimsFileRef.current) claimsFileRef.current.value = '';
  };

  const generateAIQuote = useCallback(async (params?: { additionalContext?: string; files?: File[] }) => {
    setAiLoading(true);
    setAiQuote(null);
    try {
      let requestData: any = {};
      let requestHeaders: any = { ...authHeaders() };

      if (params?.files?.length || params?.additionalContext?.trim()) {
        const fd = new FormData();
        if (params.additionalContext?.trim()) fd.append('additionalContext', params.additionalContext);
        for (const f of (params.files || [])) fd.append('files', f);
        requestData = fd;
        // Don't set Content-Type — browser sets multipart boundary automatically
      }

      const { data } = await api.post(`/rfq/rfqs/${id}/ai-generate-quote`, requestData, {
        headers: requestHeaders, timeout: 60000,
      });
      if (data.success) setAiQuote(data.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'AI quote generation failed');
    }
    setAiLoading(false);
  }, [id]);

  const fetchIntelligence = useCallback(async () => {
    setIntelligenceLoading(true);
    try {
      const { data } = await api.post(`/rfq/rfqs/${id}/ai-intelligence`, {}, { headers: authHeaders(), timeout: 45000 });
      if (data.success) setIntelligence(data.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Intelligence analysis failed');
    }
    setIntelligenceLoading(false);
  }, [id]);

  const fetchDeepAnalytics = useCallback(async () => {
    setDeepAnalyticsLoading(true);
    try {
      const { data } = await api.get(`/rfq/rfqs/${id}/deep-analytics`, { headers: authHeaders(), timeout: 30000 });
      if (data.success) setDeepAnalytics(data.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Deep analytics failed');
    }
    setDeepAnalyticsLoading(false);
  }, [id]);

  const handleReparseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setReparseLoading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post(`/rfq/rfqs/${id}/reparse`, fd, {
          headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
        if (data.success) {
          toast.success(`${files.length > 1 ? `[${i + 1}/${files.length}] ` : ''}RFQ updated from ${file.name}`);
        }
      } catch (err: any) {
        toast.error(`${files.length > 1 ? `[${i + 1}/${files.length}] ` : ''}${err?.response?.data?.message || 'Re-parse failed'}: ${file.name}`);
      }
    }
    fetchRFQ();
    fetchAnalytics();
    setReparseLoading(false);
    if (reparseFileRef.current) reparseFileRef.current.value = '';
  };

  const handleReparseFromStored = async () => {
    setReparseLoading(true);
    try {
      const { data } = await api.post(`/rfq/rfqs/${id}/reparse`, {}, {
        headers: authHeaders(),
        timeout: 120000,
      });
      if (data.success) {
        toast.success('RFQ re-parsed from stored file');
        fetchRFQ();
        fetchAnalytics();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Re-parse failed');
    }
    setReparseLoading(false);
  };

  const handleMemberUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/rfq/rfqs/${id}/upload-members`, fd, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      if (res.data.success) {
        const d = res.data.data;
        const dupeMsg = d?.duplicatesRemoved > 0 ? ` (${d.duplicatesRemoved} duplicates removed)` : '';
        toast.success(`${d?.memberCount ?? ''} members uploaded${dupeMsg}`);
      }
      fetchRFQ();
      fetchAnalytics();
      fetchMembers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Upload failed');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleAutocapturePlan = async () => {
    setCapturingPlan(true);
    try {
      const res = await api.post(`/rfq/rfqs/${id}/autocapture-plan`, {}, { headers: authHeaders() });
      if (res.data.success) {
        setCapturedPlan(res.data.data);
        if (res.data.alreadyCaptured) {
          toast.info(`Plan already exists: ${res.data.message}`);
        } else {
          toast.success(`Plan captured: "${res.data.data.display_name}" · Ref: ${res.data.data.contract_ref}`);
          fetchRFQ();
        }
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to capture plan');
    }
    setCapturingPlan(false);
  };

  if (loading) return (
    <TeamInsuranceLayout title="RFQ Detail">
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="h-6 w-6 text-violet-400 animate-spin" />
    </div>
    </TeamInsuranceLayout>
  );

  if (!rfq) return (
    <TeamInsuranceLayout title="RFQ Detail">
    <div className="text-center py-20">
      <AlertCircle className="h-12 w-12 text-slate-600 mx-auto mb-3" />
      <p className="text-slate-400">RFQ not found</p>
      <Button onClick={() => navigate('/rfq/rfqs')} variant="outline" className="mt-4 border-white/[0.1] text-slate-300">Back to RFQs</Button>
    </div>
    </TeamInsuranceLayout>
  );

  const lives = typeof rfq.lives_at_inception === 'string' ? JSON.parse(rfq.lives_at_inception || '{}') : (rfq.lives_at_inception || {});
  const livesRenewal = typeof rfq.lives_at_renewal === 'string' ? JSON.parse(rfq.lives_at_renewal || '{}') : (rfq.lives_at_renewal || {});
  const coverage = typeof rfq.coverage_scope === 'string' ? JSON.parse(rfq.coverage_scope || '{}') : (rfq.coverage_scope || {});
  const conditions = typeof rfq.special_conditions === 'string' ? JSON.parse(rfq.special_conditions || '[]') : (rfq.special_conditions || []);
  const slabs = typeof rfq.sum_insured_slabs === 'string' ? JSON.parse(rfq.sum_insured_slabs || '[]') : (rfq.sum_insured_slabs || []);
  const quotes = rfq.quotes || [];
  const rfqFiles: any[] = rfq.files || [];

  const tabs = [
    { key: 'overview', label: 'Broking Slip', icon: FileText },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'members', label: `Members (${rfq.member_count?.toLocaleString() || 0})`, icon: Users },
    { key: 'claims', label: `Claims${claimsAnalysis ? ` (${claimsAnalysis.summary.total_claims.toLocaleString()})` : ''}`, icon: Activity },
    { key: 'quotes', label: `Quotes (${quotes.length})`, icon: DollarSign },
    { key: 'underwriting', label: 'Underwriting', icon: ShieldCheck },
    { key: 'intelligence', label: 'AI Intelligence', icon: Zap },
    { key: 'deep-analytics', label: 'Deep Analytics', icon: TrendingUp },
    { key: 'ai-quote', label: 'AI Quote Engine', icon: BrainCircuit },
  ] as const;

  return (
    <TeamInsuranceLayout title={rfq.insured_name || 'RFQ Detail'}>
    <div className="space-y-6">
      {showEditModal && (
        <EditRFQModal rfq={rfq} onClose={() => setShowEditModal(false)} onSaved={() => { setShowEditModal(false); fetchRFQ(); }} />
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/rfq/rfqs')} className="p-2 rounded-xl hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{rfq.insured_name}</h2>
              <StatusChip rfqId={rfq.id} current={rfq.status} onUpdated={fetchRFQ} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{rfq.rfq_number} &middot; {rfq.policy_type} &middot; {rfq.product_type}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleMemberUpload} className="hidden" />
          <input ref={claimsFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleClaimsUpload} className="hidden" />
          <input ref={reparseFileRef} type="file" accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp" multiple onChange={handleReparseUpload} className="hidden" />
          <Button onClick={() => setShowEditModal(true)} variant="outline"
            className="border-white/[0.1] text-slate-300 hover:bg-white/[0.05] rounded-xl h-9 text-sm gap-2">
            <Pencil className="h-3.5 w-3.5" /> Edit RFQ
          </Button>
          <Button onClick={handleReparseFromStored} disabled={reparseLoading} variant="outline"
            className="border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 rounded-xl h-9 text-sm gap-2"
            title="Re-parse from stored file. Or click the arrow to upload a new file.">
            {reparseLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {reparseLoading ? 'Parsing...' : 'Re-parse Slip'}
          </Button>
          <Button onClick={() => reparseFileRef.current?.click()} disabled={reparseLoading} variant="outline"
            className="border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 rounded-xl h-9 text-sm gap-2 px-2"
            title="Upload a new file to re-parse">
            <Upload className="h-3.5 w-3.5" />
          </Button>
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
          <Button onClick={() => navigate(`/rfq/rfqs/${id}/quote/new`)}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-0 rounded-xl h-9 px-4 gap-2 text-sm font-medium shadow-lg shadow-emerald-600/20">
            <IndianRupee className="h-3.5 w-3.5" /> Create Quote
          </Button>
          {['quoted', 'negotiating', 'won'].includes(rfq.status) && (
            capturedPlan ? (
              <Button
                onClick={() => navigate('/rfq/corporate-plans')}
                className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 rounded-xl h-9 px-4 gap-2 text-sm font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Plan Captured · {capturedPlan.contract_ref}
              </Button>
            ) : (
              <Button
                disabled={capturingPlan}
                onClick={handleAutocapturePlan}
                className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-0 rounded-xl h-9 px-4 gap-2 text-sm font-medium shadow-lg shadow-amber-600/20 disabled:opacity-60">
                {capturingPlan ? (
                  <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                {capturingPlan ? 'Capturing…' : 'Autocapture Plan'}
              </Button>
            )
          )}
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
      {tab === 'overview' && <OverviewTab rfq={rfq} lives={lives} livesRenewal={livesRenewal} coverage={coverage} conditions={conditions} slabs={slabs} files={rfqFiles} rfqId={rfq.id} />}
      {tab === 'analytics' && <AnalyticsTab analytics={analytics} />}
      {tab === 'members' && (
        <MembersTab members={members} search={memberSearch} setSearch={setMemberSearch}
          page={memberPage} totalPages={memberTotalPages} setPage={setMemberPage} />
      )}
      {tab === 'quotes' && <QuotesTab quotes={quotes} rfqId={rfq.id} onRefresh={fetchRFQ} navigate={navigate} />}
      {tab === 'claims' && <ClaimsExperienceTab analysis={claimsAnalysis} loading={claimsLoading} onUpload={() => claimsFileRef.current?.click()} uploading={claimsUploading} />}
      {tab === 'underwriting' && <RFQUnderwritingTab rfqId={rfq.id} rfq={rfq} />}
      {tab === 'intelligence' && <IntelligenceTab rfqId={rfq.id} rfq={rfq} intelligence={intelligence} loading={intelligenceLoading} onAnalyze={fetchIntelligence} navigate={navigate} />}
      {tab === 'deep-analytics' && <DeepAnalyticsTab rfqId={rfq.id} rfq={rfq} deepAnalytics={deepAnalytics} loading={deepAnalyticsLoading} onAnalyze={fetchDeepAnalytics} />}
      {tab === 'ai-quote' && <AIQuoteTab rfqId={rfq.id} aiQuote={aiQuote} aiLoading={aiLoading} onGenerate={generateAIQuote} navigate={navigate} claimsAnalysis={claimsAnalysis} />}
    </div>
    </TeamInsuranceLayout>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ rfq, lives, livesRenewal, coverage, conditions, slabs, files, rfqId }: any) {
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

      {/* Existing & Required Coverages */}
      {(rfq.existing_coverages || rfq.required_coverages) && (
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-400" /> Coverages</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {rfq.existing_coverages && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Existing Coverages</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{rfq.existing_coverages}</p>
              </div>
            )}
            {rfq.required_coverages && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Required Coverages</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{rfq.required_coverages}</p>
              </div>
            )}
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

      {/* Uploaded Files */}
      <Card className="lg:col-span-2">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-violet-400" /> Stored Files</h3>
        {files && files.length > 0 ? (
          <div className="divide-y divide-white/[0.04]">
            {files.map((f: any) => {
              const category = f.category || 'other';
              const catColors: Record<string, string> = { slip: 'text-cyan-400 bg-cyan-500/10', members: 'text-emerald-400 bg-emerald-500/10', claims: 'text-amber-400 bg-amber-500/10', other: 'text-slate-400 bg-slate-500/10' };
              const cc = catColors[category] || catColors.other;
              const sizeKb = f.file_size ? (f.file_size > 1024 * 1024 ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.file_size / 1024)} KB`) : '';
              return (
                <div key={f.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${cc}`}>{category}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300 truncate max-w-xs">{f.original_name}</p>
                      <p className="text-[10px] text-slate-600">{new Date(f.uploaded_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{sizeKb ? ` · ${sizeKb}` : ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const resp = await api.get(`/rfq/rfqs/${rfqId}/files/${f.id}/download`, { headers: authHeaders(), responseType: 'blob' });
                        const url = URL.createObjectURL(resp.data);
                        const a = document.createElement('a'); a.href = url; a.download = f.original_name; a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 5000);
                      } catch { toast.error('Download failed'); }
                    }}
                    className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors ml-4 shrink-0 px-2 py-1 rounded-lg hover:bg-violet-500/10"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-600">No files stored yet. Files are saved automatically when you upload a broking slip, members, or claims.</p>
        )}
      </Card>
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
      const res = await api.put(`/rfq/quotes/${quoteId}`, { status }, { headers: authHeaders() });
      toast.success(`Quote marked as ${status}`);
      if (status === 'sent') {
        if (res.data?.email?.sent) {
          toast.success(`Email sent to ${res.data.email.recipients}`);
        } else if (res.data?.email?.error) {
          toast.warning(`Quote marked sent but email failed: ${res.data.email.error}`);
        } else if (res.data?.email && !res.data.email.recipients) {
          toast.info('Quote marked sent — no broker/contact email on file to notify.');
        }
      }
      onRefresh();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to update quote';
      toast.error(msg);
    }
  };

  const deleteQuote = async (quoteId: number) => {
    if (!confirm('Delete this quote?')) return;
    try {
      await api.delete(`/rfq/quotes/${quoteId}`, { headers: authHeaders() });
      toast.success('Quote deleted');
      onRefresh();
    } catch { toast.error('Failed to delete quote'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => navigate(`/rfq/rfqs/${rfqId}/quote/new`)}
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
                    <button onClick={() => navigate(`/rfq/rfqs/${rfqId}/quote/${q.id}`)} title="Edit Quote"
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

// ─── Intelligence Tab ─────────────────────────────────────────────────────────

function IntelligenceTab({ rfqId, rfq, intelligence, loading, onAnalyze }: any) {
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalMarkdown, setProposalMarkdown] = useState('');
  const [showProposal, setShowProposal] = useState(false);

  const generateProposal = async () => {
    setProposalLoading(true);
    try {
      const { data } = await api.post(`/rfq/rfqs/${rfqId}/ai-proposal`, { intelligence }, { headers: authHeaders(), timeout: 60000 });
      if (data.success) { setProposalMarkdown(data.data.proposal_markdown); setShowProposal(true); }
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Proposal generation failed'); }
    setProposalLoading(false);
  };

  const copyProposal = () => { navigator.clipboard.writeText(proposalMarkdown); toast.success('Proposal copied to clipboard'); };

  if (!intelligence && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/20 to-violet-600/20 rounded-full blur-3xl" />
          <div className="relative bg-gradient-to-br from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 rounded-3xl p-8">
            <Zap className="h-16 w-16 text-cyan-400" />
          </div>
        </div>
        <div className="text-center space-y-2 max-w-lg">
          <h3 className="text-xl font-bold text-white">AI Proposal Intelligence</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            RAG-powered pipeline that analyzes your <span className="text-cyan-300">historical win/loss data</span>,{' '}
            <span className="text-violet-300">market benchmarks</span>,{' '}
            <span className="text-emerald-300">competitor pricing</span>, and{' '}
            <span className="text-amber-300">pricing trends</span>.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          {([
            { icon: TrendingUp, label: 'Pricing Trends', color: 'text-cyan-400' },
            { icon: Target, label: 'Win Probability', color: 'text-emerald-400' },
            { icon: Shield, label: 'Competitor Intel', color: 'text-violet-400' },
            { icon: ClipboardCheck, label: 'Proposal Writer', color: 'text-amber-400' },
          ] as const).map(({ icon: Icon, label, color }) => (
            <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <Icon className={`h-5 w-5 ${color} mx-auto mb-1.5`} />
              <p className="text-[10px] text-slate-500 font-medium">{label}</p>
            </div>
          ))}
        </div>
        <Button onClick={onAnalyze}
          className="bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 border-0 rounded-xl h-11 px-8 gap-3 text-sm font-semibold shadow-lg shadow-cyan-600/25">
          <Zap className="h-4 w-4" /> Run AI Intelligence Analysis
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/30 to-violet-600/30 rounded-full blur-3xl animate-pulse" />
          <div className="relative bg-gradient-to-br from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 rounded-3xl p-8">
            <Zap className="h-16 w-16 text-cyan-400 animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-bold text-white">Analyzing market intelligence...</h3>
          <div className="flex flex-col gap-2 text-sm text-slate-500">
            {['Scanning historical CRM win/loss data...', 'Computing market benchmarks...', 'Running competitor analysis via LLM...', 'Generating pricing recommendations...'].map((s, i) => (
              <p key={i} className="animate-pulse" style={{ animationDelay: `${i * 0.4}s` }}>{s}</p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const d = intelligence;

  // Guard: intelligence data from older runs may be missing sub-fields
  if (!d?.win_probability || !d?.rag_analytics) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <AlertCircle className="h-9 w-9 text-amber-400" />
        <div>
          <p className="text-sm font-semibold text-white">Intelligence data is incomplete</p>
          <p className="text-xs text-slate-500 mt-1">Re-run the analysis to get the full market intelligence report.</p>
        </div>
        <Button onClick={onAnalyze}
          className="bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 border-0 rounded-xl h-10 px-6 gap-2 text-sm">
          <Zap className="h-4 w-4" /> Re-run Intelligence
        </Button>
      </div>
    );
  }

  const rag = d.rag_analytics;
  const bm = d.industry_benchmarks;
  const wp = d.win_probability;
  const llm = d.llm_intelligence;
  const trend = d.pricing_trend || [];
  const wonColor = wp.color === 'emerald' ? 'text-emerald-400' : wp.color === 'amber' ? 'text-amber-400' : 'text-red-400';
  const wonBg = wp.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20' : wp.color === 'amber' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20';

  return (
    <div className="space-y-5">
      {showProposal && proposalMarkdown && (
        <ProposalModal markdown={proposalMarkdown} insuredName={rfq.insured_name} onClose={() => setShowProposal(false)} onCopy={copyProposal} />
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">AI Intelligence Report</span>
        </div>
        <div className="flex gap-2">
          <Button onClick={onAnalyze} variant="outline" className="border-white/[0.1] text-slate-400 hover:bg-white/[0.05] rounded-xl h-8 text-xs gap-1.5">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
          <Button onClick={generateProposal} disabled={proposalLoading}
            className="bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 border-0 rounded-xl h-8 px-4 gap-1.5 text-xs font-semibold shadow-lg shadow-cyan-600/20">
            {proposalLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />}
            {proposalLoading ? 'Writing...' : 'Generate Proposal'}
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className={`p-4 rounded-2xl border ${wonBg}`}>
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Win Probability</p>
          <p className={`text-3xl font-black mt-1 ${wonColor}`}>{wp.score}%</p>
          <p className={`text-xs font-semibold mt-1 ${wonColor}`}>{wp.category}</p>
        </div>
        <div className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.03]">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Similar Deals</p>
          <p className="text-3xl font-black mt-1 text-white">{rag.similar_deals_analyzed}</p>
          <p className="text-xs text-slate-500 mt-1">{rag.won_deals}W / {rag.lost_deals}L &middot; {rag.win_rate_pct}% win</p>
        </div>
        <div className="p-4 rounded-2xl border border-violet-500/20 bg-violet-500/5">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Our Book Avg/Life</p>
          <p className="text-3xl font-black mt-1 text-violet-400">
            {rag.our_book_benchmarks.avg_per_life ? `₹${rag.our_book_benchmarks.avg_per_life.toLocaleString('en-IN')}` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">{rag.our_book_benchmarks.sample_size} won deals</p>
        </div>
        <div className="p-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Market Median/Life</p>
          <p className="text-3xl font-black mt-1 text-cyan-400">₹{bm.market_per_life.median.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500 mt-1">₹{bm.market_per_life.floor.toLocaleString()} – ₹{bm.market_per_life.ceiling.toLocaleString()}</p>
        </div>
        {d.recommended_price_per_life && (
          <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Recommended Price/Life</p>
            <p className="text-3xl font-black mt-1 text-amber-400">₹{d.recommended_price_per_life.toLocaleString('en-IN')}</p>
            <p className="text-xs text-slate-500 mt-1">AI-recommended target</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Win Probability Factors */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-emerald-400" /> Win Probability Factors</h3>
          <div className="space-y-2">
            {wp.factors.map((f: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                <span className="text-xs text-slate-300">{f.label}</span>
                <span className={`text-xs font-bold ${f.impact > 0 ? 'text-emerald-400' : f.impact < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                  {f.impact > 0 ? '+' : ''}{f.impact}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-slate-600 mb-1"><span>0%</span><span>50%</span><span>100%</span></div>
            <div className="h-3 bg-white/[0.05] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${wp.color === 'emerald' ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : wp.color === 'amber' ? 'bg-gradient-to-r from-amber-500 to-orange-400' : 'bg-gradient-to-r from-red-500 to-rose-400'}`}
                style={{ width: `${wp.score}%` }} />
            </div>
          </div>
        </Card>

        {/* Competitor Benchmarks */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Shield className="h-4 w-4 text-violet-400" /> Competitor Benchmarks</h3>
          <div className="space-y-2">
            {(llm?.competitor_benchmarks || []).map((c: any, i: number) => (
              <div key={i} className="flex items-start justify-between py-2 border-b border-white/[0.04] last:border-0 gap-3">
                <div>
                  <p className="text-xs font-semibold text-white">{c.insurer}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{c.notes}</p>
                </div>
                <span className="text-xs font-bold text-cyan-400 whitespace-nowrap">{c.estimated_per_life_range}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Pricing Recommendation */}
        {llm?.pricing_recommendation && (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-amber-400" /> Pricing Recommendation</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {([
                { label: 'Floor', value: llm.pricing_recommendation.floor_per_life, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                { label: 'Target', value: llm.pricing_recommendation.target_per_life, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                { label: 'Ceiling', value: llm.pricing_recommendation.ceiling_per_life, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
              ] as const).map(({ label, value, color, bg }) => (
                <div key={label} className={`p-3 rounded-xl border ${bg} text-center`}>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">{label}</p>
                  <p className={`text-lg font-black mt-1 ${color}`}>₹{((value as number) || 0).toLocaleString('en-IN')}</p>
                  <p className="text-[10px] text-slate-600">per life</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{llm.pricing_recommendation.rationale}</p>
          </Card>
        )}

        {/* Pricing Trend Chart */}
        {trend.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-cyan-400" /> Pricing Trend (Our Pipeline)</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v: number) => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Avg/Life']} />
                <Bar dataKey="avg_per_life" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {llm?.trend_insight && <p className="text-xs text-slate-500 mt-3 leading-relaxed">{llm.trend_insight}</p>}
          </Card>
        )}

        {/* Win Strategy */}
        {llm?.win_strategy && (
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> Win Strategy</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">{llm.win_strategy}</p>
            {llm.usp_talking_points?.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">USP Talking Points</p>
                <ul className="space-y-1.5">
                  {llm.usp_talking_points.map((p: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {/* Negotiation Levers + Risk Flags */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-400" /> Risk Flags</h3>
          <ul className="space-y-1.5 mb-4">
            {(llm?.risk_flags || []).map((f: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          {llm?.negotiation_levers?.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Negotiation Levers</p>
              <div className="flex flex-wrap gap-1.5">
                {llm.negotiation_levers.map((l: string, i: number) => (
                  <span key={i} className="px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-300">{l}</span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Executive Summary */}
        {llm?.executive_summary && (
          <Card className="lg:col-span-2">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-cyan-400" /> Executive Summary</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{llm.executive_summary}</p>
            <div className="mt-4 pt-4 border-t border-white/[0.05]">
              <Button onClick={generateProposal} disabled={proposalLoading}
                className="bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 border-0 rounded-xl h-9 px-5 gap-2 text-sm font-semibold shadow-lg shadow-cyan-600/20">
                {proposalLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                {proposalLoading ? 'Writing proposal...' : 'Generate Full Proposal Document'}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* ─── UNDERWRITING ANALYSIS SECTION ─── */}
      {d.underwriting_analysis && (() => {
        const uw = d.underwriting_analysis;
        const rc = uw.risk_classification;
        const pw = uw.premium_waterfall;
        const loadings = uw.loadings;
        const ce = uw.claims_experience;
        const mp = uw.member_profile;

        const tierColors: Record<string, string> = {
          'Preferred': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
          'Standard': 'text-amber-400 bg-amber-500/10 border-amber-500/25',
          'High Risk': 'text-red-400 bg-red-500/10 border-red-500/25',
        };
        const tierColor = tierColors[rc.tier] || tierColors['Standard'];

        const uwDecision = llm?.underwriting_decision;
        const uwDecisionColor = uwDecision?.includes('Decline') ? 'text-red-400 bg-red-500/10 border-red-500/25'
          : uwDecision?.includes('Chief') ? 'text-orange-400 bg-orange-500/10 border-orange-500/25'
          : uwDecision?.includes('Loading') ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
          : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';

        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pt-1">
              <div className="h-px flex-1 bg-white/[0.05]" />
              <span className="text-[10px] text-slate-600 uppercase font-semibold px-2">Underwriting Analysis</span>
              <div className="h-px flex-1 bg-white/[0.05]" />
            </div>

            {/* Risk Classification + UW Decision */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className={`p-4 rounded-2xl border ${tierColor}`}>
                <p className="text-[10px] uppercase font-semibold text-slate-500">Risk Tier</p>
                <p className={`text-2xl font-black mt-1 ${tierColor.split(' ')[0]}`}>{rc.tier}</p>
                <p className="text-[10px] mt-1 text-slate-500">Risk Score: {rc.score}/10</p>
              </div>
              {uwDecision && (
                <div className={`p-4 rounded-2xl border ${uwDecisionColor}`}>
                  <p className="text-[10px] uppercase font-semibold text-slate-500">UW Decision</p>
                  <p className={`text-sm font-bold mt-1 leading-tight ${uwDecisionColor.split(' ')[0]}`}>{uwDecision}</p>
                  {llm?.underwriting_notes && <p className="text-[10px] text-slate-500 mt-2 leading-relaxed line-clamp-3">{llm.underwriting_notes}</p>}
                </div>
              )}
              <div className="p-4 rounded-2xl border border-violet-500/20 bg-violet-500/5">
                <p className="text-[10px] uppercase font-semibold text-slate-500">Total Loading Factor</p>
                <p className="text-2xl font-black mt-1 text-violet-400">{loadings.total_loading}x</p>
                <p className="text-[10px] text-slate-500 mt-1">vs. base market rate</p>
              </div>
            </div>

            {rc.key_risk_drivers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {rc.key_risk_drivers.map((d: string, i: number) => (
                  <span key={i} className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-300">
                    <AlertCircle className="h-3 w-3" />{d}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Actuarial Member Profile */}
              {uw.has_member_data && mp.avg_age && (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-cyan-400" /> Actuarial Risk Profile</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { label: 'Avg Age', value: `${mp.avg_age} yrs` },
                      { label: 'Age 45+ (High Risk)', value: `${mp.high_risk_age_pct}%`, alert: mp.high_risk_age_pct > 20 },
                      { label: 'Dependency Ratio', value: `${mp.dependency_ratio}:1`, alert: mp.dependency_ratio > 1.5 },
                      { label: 'Avg SI', value: `₹${(mp.avg_si||0).toLocaleString('en-IN')}` },
                      ...(mp.male_pct !== null ? [{ label: 'Gender Split', value: `${mp.male_pct}% M / ${100-mp.male_pct}% F` }] : []),
                      { label: 'Age Loading', value: `${loadings.age_loading}x`, alert: loadings.age_loading > 1.3 },
                    ].map((item: any) => (
                      <div key={item.label} className="bg-white/[0.02] rounded-xl p-3">
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">{item.label}</p>
                        <p className={`text-sm font-bold mt-0.5 ${item.alert ? 'text-amber-400' : 'text-white'}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {uw.age_bands.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Age Band Distribution</p>
                      <div className="space-y-1.5">
                        {uw.age_bands.map((b: any) => {
                          const total = uw.age_bands.reduce((s: number, x: any) => s + x.count, 0);
                          const pct = total > 0 ? Math.round(b.count / total * 100) : 0;
                          const isHighRisk = ['45-54','55-64','65+'].includes(b.age_band);
                          return (
                            <div key={b.age_band} className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 w-12 shrink-0">{b.age_band}</span>
                              <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${isHighRisk ? 'bg-amber-500/70' : 'bg-cyan-500/60'}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] text-slate-400 w-12 text-right">{b.count} ({pct}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* Premium Waterfall */}
              <Card>
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><IndianRupee className="h-4 w-4 text-emerald-400" /> Premium Waterfall</h3>
                <div className="space-y-2 mb-4">
                  {[
                    { label: 'Base Market Rate', value: pw.base_market_per_life, color: 'bg-slate-600/60', textColor: 'text-slate-300', note: 'Industry benchmark (manual underwriting basis)' },
                    { label: 'Pure Premium', value: pw.pure_premium_per_life, color: 'bg-cyan-600/60', textColor: 'text-cyan-300', note: `Expected claims cost (${uw.has_claims_data ? 'experience-rated' : 'manually rated'})` },
                    { label: 'Gross Premium / Life', value: pw.gross_premium_per_life, color: 'bg-violet-600/70', textColor: 'text-violet-300', note: `Incl. expenses (${pw.expense_ratio_pct}%) + profit (${pw.profit_margin_pct}%) + IBNR (${pw.ibnr_cat_pct}%)` },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-slate-400">{item.label}</span>
                          <span className={`text-sm font-black ${item.textColor}`}>₹{(item.value||0).toLocaleString('en-IN')}</span>
                        </div>
                        <p className="text-[9px] text-slate-600">{item.note}</p>
                        <div className="mt-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min((item.value||0) / (pw.gross_premium_per_life||1) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-white/[0.05]">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Total Gross Premium</span>
                    <span className="text-base font-black text-emerald-400">₹{(pw.total_gross_premium||0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.05]">
                  <p className="text-[10px] text-slate-600 uppercase font-semibold mb-2">Loading Factors Applied</p>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    {[
                      ['Age Loading', `${loadings.age_loading}x`],
                      ['Dependency', `${loadings.dependency_loading}x`],
                      ['SI Adequacy', `${loadings.si_loading}x`],
                      ['Claims Experience', `${loadings.claims_loading}x`],
                      ['Medical Inflation', `${loadings.inflation_loading}x`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between px-2 py-1 rounded-lg bg-white/[0.02]">
                        <span className="text-slate-500">{k}</span>
                        <span className={`font-bold ${parseFloat(v as string) > 1.1 ? 'text-amber-400' : parseFloat(v as string) < 0.97 ? 'text-emerald-400' : 'text-slate-300'}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Claims Experience */}
              {ce && (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-amber-400" /> Claims Experience (Prior Period)</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { label: 'Incurred Claims Ratio', value: `${ce.icr_pct}%`, alert: (ce.icr_pct||0) > 85, good: (ce.icr_pct||0) < 70 },
                      { label: 'Claims Frequency', value: `${ce.claims_freq_per_100}/100 lives`, alert: (ce.claims_freq_per_100||0) > 25 },
                      { label: 'Burning Cost / Life', value: `₹${(ce.burning_cost_per_life||0).toLocaleString('en-IN')}`, alert: false },
                      { label: 'Avg Claim Severity', value: `₹${(ce.avg_severity||0).toLocaleString('en-IN')}`, alert: false },
                      { label: 'Total Claims', value: ce.total_claims?.toLocaleString() },
                      { label: 'Max Single Claim', value: `₹${(ce.max_claim||0).toLocaleString('en-IN')}`, alert: (ce.max_claim||0) > 500000 },
                    ].map((item: any) => (
                      <div key={item.label} className="bg-white/[0.02] rounded-xl p-3">
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">{item.label}</p>
                        <p className={`text-sm font-bold mt-0.5 ${item.alert ? 'text-red-400' : item.good ? 'text-emerald-400' : 'text-white'}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* ICR Bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-600 mb-1">
                      <span>0% (No claims)</span><span className="text-emerald-500">70%</span><span className="text-amber-500">100%</span><span className="text-red-500">120%+</span>
                    </div>
                    <div className="relative h-3 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 w-[58%] bg-emerald-500/20" />
                      <div className="absolute inset-y-0 left-[58%] w-[25%] bg-amber-500/20" />
                      <div className="absolute inset-y-0 left-[83%] right-0 bg-red-500/20" />
                      <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ${(ce.icr_pct||0) <= 70 ? 'bg-emerald-500' : (ce.icr_pct||0) <= 100 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min((ce.icr_pct||0) / 120 * 100, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1">ICR {(ce.icr_pct||0) <= 70 ? 'Excellent — qualifies for experience discount' : (ce.icr_pct||0) <= 85 ? 'Good — standard rating applies' : (ce.icr_pct||0) <= 100 ? 'Moderate — adverse experience loading recommended' : 'High — significant loading required'}</p>
                  </div>
                </Card>
              )}

              {/* AI Claims Prediction */}
              {llm?.claims_prediction && (
                <Card>
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-violet-400" /> AI Claims Prediction</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { label: 'Predicted ICR', value: `${llm.claims_prediction.expected_icr_pct}%` },
                      { label: 'Expected Frequency', value: `${llm.claims_prediction.expected_claims_frequency_per_100}/100 lives` },
                      { label: 'IBNR Provision', value: `${llm.claims_prediction.ibnr_provision_pct}%` },
                    ].map((item: any) => (
                      <div key={item.label} className="bg-white/[0.02] rounded-xl p-3">
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">{item.label}</p>
                        <p className="text-sm font-bold mt-0.5 text-violet-300">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{llm.claims_prediction.predicted_high_cost_claims}</p>
                  {llm.underwriting_conditions?.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Underwriting Conditions</p>
                      <ul className="space-y-1.5">
                        {llm.underwriting_conditions.map((c: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                            <Shield className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />{c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        );
      })()}

      {/* ─── BROKER ACTION PLAN ─── */}
      {llm?.broker_action_plan && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-white/[0.05]" />
            <span className="text-[10px] text-slate-600 uppercase font-semibold px-2">Broker Action Plan</span>
            <div className="h-px flex-1 bg-white/[0.05]" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" /> Immediate Actions
              </h3>
              <ul className="space-y-2">
                {(llm.broker_action_plan.immediate_actions || []).map((a: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300 py-1.5 border-b border-white/[0.04] last:border-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-cyan-400" /> Talk Tracks
              </h3>
              <ul className="space-y-2">
                {(llm.broker_action_plan.talk_tracks || []).map((t: string, i: number) => (
                  <li key={i} className="text-xs text-slate-300 leading-relaxed py-1.5 border-b border-white/[0.04] last:border-0 pl-2 border-l-2 border-l-cyan-500/40">{t}</li>
                ))}
              </ul>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-violet-400" /> Objection Handling
              </h3>
              {llm.broker_action_plan.objection_handling && (
                <div className="space-y-3">
                  {Object.entries(llm.broker_action_plan.objection_handling).map(([key, value]) => (
                    <div key={key} className="bg-white/[0.02] rounded-xl p-3">
                      <p className="text-[10px] text-violet-400 uppercase font-semibold mb-1.5">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-slate-300 leading-relaxed">{value as string}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ─── DISEASE PREDICTION ─── */}
      {llm?.disease_prediction?.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-white/[0.05]" />
            <span className="text-[10px] text-slate-600 uppercase font-semibold px-2">Disease Prediction</span>
            <div className="h-px flex-1 bg-white/[0.05]" />
          </div>
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-cyan-400" /> Expected Disease Profile — AI Prediction
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {llm.disease_prediction.map((d: any, i: number) => (
                <div key={i} className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-white">{d.disease}</p>
                    <span className="text-xs font-black text-violet-400">{d.expected_frequency_pct}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-2">
                    <div className="h-full rounded-full bg-violet-500/60" style={{ width: `${Math.min(d.expected_frequency_pct * 3, 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{d.rationale}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── DEEPTECH SIGNALS ─── */}
      {d.deeptech_signals && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-white/[0.05]" />
            <span className="text-[10px] text-slate-600 uppercase font-semibold px-2">Mediqzy DeepTech™ Signals</span>
            <div className="h-px flex-1 bg-white/[0.05]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Platform Pre-Auth Decisions</p>
              <p className="text-3xl font-black mt-1 text-cyan-400">{d.deeptech_signals.total_decisions?.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">Last 90 days · all tenants</p>
            </div>
            <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Platform Approval Rate</p>
              <p className="text-3xl font-black mt-1 text-emerald-400">{d.deeptech_signals.approval_rate_pct}%</p>
              <p className="text-xs text-slate-500 mt-1">Claims auto-approved</p>
            </div>
            <div className="p-4 rounded-2xl border border-violet-500/20 bg-violet-500/5">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Avg Pre-Auth Amount</p>
              <p className="text-3xl font-black mt-1 text-violet-400">₹{(d.deeptech_signals.avg_requested_amount || 0).toLocaleString('en-IN')}</p>
              <p className="text-xs text-slate-500 mt-1">Platform average</p>
            </div>
          </div>
          {d.deeptech_signals.top_diagnoses?.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-violet-400" /> Top Claim Categories — Mediqzy Platform (Live Data)
              </h3>
              <div className="flex flex-wrap gap-2">
                {d.deeptech_signals.top_diagnoses.slice(0, 8).map((d: any, i: number) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 font-medium">
                    {d.diagnosis_code}
                    {d.count > 1 && <span className="ml-1.5 text-[10px] text-violet-500">×{d.count}</span>}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-3">Powered by Mediqzy DeepTech™ — pre-authorization intelligence from our clinical platform</p>
            </Card>
          )}
        </div>
      )}

      {/* Won Deals from RAG */}
      {rag.won_deals_sample?.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Similar Deals Won (Our Book)</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-white/[0.05]">
                {['Company', 'Members', 'Per Life Quoted', 'Total Premium'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rag.won_deals_sample.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 text-xs text-white">{r.insured_name}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-300">{r.member_count?.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-emerald-400">₹{r.per_life_quoted?.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-xs text-violet-400">₹{r.total_premium?.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Proposal Modal ───────────────────────────────────────────────────────────

function ProposalModal({ markdown, insuredName, onClose, onCopy }: { markdown: string; insuredName: string; onClose: () => void; onCopy: () => void }) {
  const renderMd = (md: string): React.ReactNode[] =>
    md.split('\n').map((line, i) => {
      if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-black text-white mt-6 mb-3">{line.slice(2)}</h1>;
      if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-violet-300 mt-5 mb-2">{line.slice(3)}</h2>;
      if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-bold text-white mt-4 mb-2">{line.slice(4)}</h3>;
      if (line.startsWith('---')) return <hr key={i} className="border-white/[0.08] my-4" />;
      if (line.startsWith('|-')) return null;
      if (line.startsWith('| ')) {
        const cells = line.split('|').filter(c => c.trim() !== '');
        return (
          <tr key={i} className="border-b border-white/[0.05]">
            {cells.map((c, j) => <td key={j} className="px-3 py-2 text-xs text-slate-300">{c.trim().replace(/\*\*/g, '')}</td>)}
          </tr>
        );
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const content = line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
        return <li key={i} className="text-xs text-slate-300 flex items-start gap-2 my-0.5" dangerouslySetInnerHTML={{ __html: `<span class="text-violet-400">•</span> ${content}` }} />;
      }
      if (line.trim() === '') return <div key={i} className="h-2" />;
      const bold = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
      return <p key={i} className="text-xs text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: bold }} />;
    }).filter(Boolean) as React.ReactNode[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0a0d14] border border-white/[0.08] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <h3 className="text-base font-bold text-white">AI-Generated Proposal</h3>
            <p className="text-xs text-slate-500 mt-0.5">{insuredName}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={onCopy} variant="outline" className="border-white/[0.1] text-slate-400 hover:bg-white/[0.05] rounded-xl h-8 text-xs gap-1.5">
              <Copy className="h-3 w-3" /> Copy Markdown
            </Button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-6 flex-1 space-y-1">
          {renderMd(markdown)}
        </div>
        <div className="p-4 border-t border-white/[0.06] flex items-center justify-between gap-2">
          <p className="text-[10px] text-slate-600">Tip: Copy markdown and paste into Notion, Google Docs, or any markdown editor</p>
          <Button onClick={onCopy}
            className="bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 border-0 rounded-xl h-8 px-4 gap-1.5 text-xs font-semibold">
            <Copy className="h-3 w-3" /> Copy to Clipboard
          </Button>
        </div>
      </div>
    </div>
  );
}

function AIQuoteTab({ rfqId, aiQuote, aiLoading, onGenerate, navigate, claimsAnalysis }: any) {
  const [selectedMarginPct, setSelectedMarginPct] = useState(20);

  // ── Supplemental input state ────────────────────────────────────────────────
  const [additionalContext, setAdditionalContext] = useState('');
  const [supplementalFiles, setSupplementalFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_TYPES = '.xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff';
  const MAX_FILE_SIZE_MB = 50;

  const addFiles = (incoming: FileList | File[]) => {
    const newFiles = Array.from(incoming).filter(f => {
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`${f.name} exceeds ${MAX_FILE_SIZE_MB}MB limit`);
        return false;
      }
      return true;
    });
    setSupplementalFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...newFiles.filter(f => !existing.has(f.name + f.size))];
    });
  };

  const removeFile = (idx: number) =>
    setSupplementalFiles(prev => prev.filter((_, i) => i !== idx));

  const fileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
    if (ext === 'pdf') return '📄';
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(ext)) return '🖼️';
    return '📎';
  };

  const formatBytes = (b: number) =>
    b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

  const handleGenerate = () => {
    onGenerate({ additionalContext, files: supplementalFiles });
  };

  // ── Animate reasoning steps ─────────────────────────────────────────────────
  const [visibleSteps, setVisibleSteps] = useState(0);
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

  // Set default selected tier from backend recommendation
  useEffect(() => {
    if (aiQuote?.mediqzy_pricing?.recommended_tier) {
      setSelectedMarginPct(aiQuote.mediqzy_pricing.recommended_tier.margin_pct ?? aiQuote.mediqzy_pricing.recommended_tier);
    }
  }, [aiQuote]);

  const applyToQuoteBuilder = (useMargin?: boolean) => {
    if (!aiQuote?.recommended_quote) return;
    let prefill = { ...aiQuote.recommended_quote };
    if (useMargin && aiQuote?.mediqzy_pricing?.tiers) {
      const tier = aiQuote.mediqzy_pricing.tiers.find((t: any) => t.margin_pct === selectedMarginPct);
      if (tier) {
        prefill = {
          ...prefill,
          total_premium: tier.total_premium,
          per_life_cost: tier.per_life,
          per_family_cost: tier.per_family,
          slab_pricing: tier.slab_pricing?.map((s: any) => ({
            slab: s.slab,
            premium: s.quoted_premium_per_family,
            lives: s.lives,
          })),
        };
      }
    }
    sessionStorage.setItem('ai_quote_prefill', JSON.stringify(prefill));
    navigate(`/rfq/rfqs/${rfqId}/quote/new`, { state: { aiPrefill: prefill } });
  };

  if (!aiQuote && !aiLoading) {
    return (
      <div className="space-y-5">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600/30 to-cyan-600/30 rounded-xl blur-lg" />
              <div className="relative bg-gradient-to-br from-violet-500/15 to-cyan-500/15 border border-violet-500/25 rounded-2xl p-3">
                <BrainCircuit className="h-7 w-7 text-violet-400" />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">AI Actuarial Quote Engine</h3>
              <p className="text-xs text-slate-500">Optionally add context or attach files to enrich the AI pricing analysis</p>
            </div>
          </div>
          {/* Claims badge */}
          <div className={`sm:ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${claimsAnalysis
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
            {claimsAnalysis ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {claimsAnalysis
              ? `${claimsAnalysis.summary.total_claims.toLocaleString()} claims — Experience rating`
              : 'No claims — Benchmark pricing'}
          </div>
        </div>

        {/* ── Capabilities grid ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { icon: Activity, label: 'Age-Banded Risk', color: 'text-violet-400' },
            { icon: Target, label: 'OPD Utilization', color: 'text-cyan-400' },
            { icon: TrendingUp, label: 'Claims Experience', color: claimsAnalysis ? 'text-emerald-400' : 'text-slate-600' },
            { icon: Gauge, label: 'IBNR + Margin', color: 'text-amber-400' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
              <Icon className={`h-4 w-4 ${color} mx-auto mb-1.5`} />
              <p className="text-[10px] text-slate-500 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Supplemental inputs panel ────────────────────────────────────── */}
        <div className="bg-white/[0.02] rounded-2xl border border-white/[0.07] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">Additional Inputs</span>
            <span className="text-xs text-slate-500 ml-1">— optional, enriches AI analysis</span>
          </div>

          <div className="p-5 space-y-5">
            {/* Free-text notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                Notes / Context / Special Instructions
              </label>
              <textarea
                value={additionalContext}
                onChange={e => setAdditionalContext(e.target.value)}
                rows={4}
                placeholder={`Add any information that should influence the quote:\n• Specific coverage requirements or exclusions\n• Broker's special pricing request\n• Industry risk notes, hazardous occupation details\n• Renewal context (outgoing insurer, renewal premium)\n• Any special conditions or discounts requested`}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none leading-relaxed"
              />
              {additionalContext.trim() && (
                <p className="text-[10px] text-slate-600 mt-1">{additionalContext.trim().length} characters — will be included in the AI prompt</p>
              )}
            </div>

            {/* File drop zone */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                Supporting Documents
              </label>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                  isDragOver
                    ? 'border-violet-500/60 bg-violet-500/8'
                    : 'border-white/[0.1] bg-white/[0.02] hover:border-violet-500/30 hover:bg-violet-500/5'
                }`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES}
                  className="hidden"
                  onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }}
                />
                <Upload className="h-7 w-7 text-slate-600" />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-400">
                    {isDragOver ? 'Drop files here' : 'Drag & drop or click to upload'}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Excel (.xlsx, .xls, .csv) · PDF · Images (.jpg, .png, .webp)
                  </p>
                  <p className="text-[10px] text-slate-700 mt-1">Up to 10 files · Max {MAX_FILE_SIZE_MB}MB each</p>
                </div>
              </div>

              {/* What each file type does */}
              <div className="flex gap-3 mt-2.5 flex-wrap">
                {[
                  { icon: '📊', label: 'Excel/CSV', desc: 'Extracted as structured data rows' },
                  { icon: '📄', label: 'PDF', desc: 'Text content extracted and parsed' },
                  { icon: '🖼️', label: 'Images', desc: 'Vision AI reads text & tables' },
                ].map(t => (
                  <div key={t.label} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span>{t.icon}</span>
                    <span className="font-medium text-slate-500">{t.label}</span>
                    <span>→ {t.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* File list */}
            {supplementalFiles.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{supplementalFiles.length} file{supplementalFiles.length > 1 ? 's' : ''} queued</p>
                <div className="space-y-1">
                  {supplementalFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                      <span className="text-base">{fileIcon(f.name)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{f.name}</p>
                        <p className="text-[11px] text-slate-600">{formatBytes(f.size)}</p>
                      </div>
                      <button
                        onClick={() => removeFile(i)}
                        className="p-1 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Generate button ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600">
            {supplementalFiles.length > 0 || additionalContext.trim()
              ? `${supplementalFiles.length} file${supplementalFiles.length !== 1 ? 's' : ''}${additionalContext.trim() ? ' + text notes' : ''} will be included`
              : 'Running with member data only'}
          </div>
          <Button onClick={handleGenerate}
            className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 border-0 rounded-xl h-11 px-8 gap-3 text-sm font-semibold shadow-lg shadow-violet-600/25">
            <BrainCircuit className="h-4 w-4" /> Generate AI Quote
          </Button>
        </div>
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

  // Guard: cached quotes from older formats may be missing sub-fields
  if (!d?.risk_assessment || !d?.opd_pricing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <AlertCircle className="h-9 w-9 text-amber-400" />
        <div>
          <p className="text-sm font-semibold text-white">Quote data is incomplete</p>
          <p className="text-xs text-slate-500 mt-1">This quote was generated in an older format. Regenerate to get the full analysis.</p>
        </div>
        <Button onClick={() => onGenerate()}
          className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 border-0 rounded-xl h-10 px-6 gap-2 text-sm">
          <BrainCircuit className="h-4 w-4" /> Regenerate Quote
        </Button>
      </div>
    );
  }

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

      {/* ─── Data Quality & Pricing Adjustments ─────────────── */}
      {d.data_quality && (
        <div className={`p-4 rounded-2xl border ${
          d.data_quality.grade === 'A' ? 'border-emerald-500/30 bg-emerald-500/5' :
          d.data_quality.grade === 'B' ? 'border-blue-500/30 bg-blue-500/5' :
          d.data_quality.grade === 'C' ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Data Quality</span>
              <span className={`px-2 py-0.5 rounded text-xs font-black ${
                d.data_quality.grade === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                d.data_quality.grade === 'B' ? 'bg-blue-500/20 text-blue-400' :
                d.data_quality.grade === 'C' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
              }`}>Grade {d.data_quality.grade}</span>
            </div>
            <span className="text-xs text-slate-400">{d.data_quality.completeness_score}% complete</span>
          </div>
          {d.data_quality.warnings?.length > 0 && (
            <div className="space-y-1">
              {d.data_quality.warnings.map((w: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-amber-400 mt-0.5">⚠</span>
                  <span className="text-slate-400"><span className="text-white font-semibold">{w.missing}</span> missing {w.field} — {w.impact}</span>
                </div>
              ))}
            </div>
          )}
          {/* Pricing adjustments chips */}
          {d.pricing_adjustments && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/[0.06]">
              <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[10px] text-slate-400">
                🏙️ {d.pricing_adjustments.city_tier?.label || 'Metro'} ×{d.pricing_adjustments.city_tier?.multiplier}
              </span>
              {d.pricing_adjustments.medical_inflation?.factor > 1 && (
                <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[10px] text-slate-400">
                  📈 Inflation +{((d.pricing_adjustments.medical_inflation.factor - 1) * 100).toFixed(1)}%
                </span>
              )}
              <span className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[10px] text-slate-400">
                👥 Group ×{d.pricing_adjustments.group_size?.factor}
              </span>
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
          { label: 'OPD Premium', value: formatCurrency(d.opd_pricing.loaded_premium), sub: `₹${(d.opd_pricing.per_family ?? d.opd_pricing.per_life ?? 0).toLocaleString()}/family`, color: 'from-violet-600 to-indigo-600' },
          { label: 'Wellness Premium', value: formatCurrency(d.wellness_pricing.loaded_premium), sub: `₹${(d.wellness_pricing.per_family ?? d.wellness_pricing.per_life ?? 0).toLocaleString()}/family`, color: 'from-cyan-600 to-blue-600' },
          { label: 'Combined Total', value: formatCurrency(d.combined.total_premium), sub: `₹${(d.combined.per_family ?? d.combined.per_life ?? 0).toLocaleString()}/family`, color: 'from-emerald-600 to-teal-600' },
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

      {/* ─── LLM Underwriting Assessment (isha-inc.com) ──────── */}
      {d.llm_assessment && !d.llm_assessment.raw && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-emerald-400" />
            Insurance LLM Underwriting Assessment
            <span className="text-[9px] text-slate-600 bg-white/[0.05] px-2 py-0.5 rounded-full ml-auto font-mono">isha-inc.com</span>
          </h3>

          {/* Executive Summary */}
          {d.llm_assessment.executive_summary && (
            <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 border border-emerald-500/20 rounded-xl p-4 mb-4">
              <p className="text-sm text-slate-200 leading-relaxed">{d.llm_assessment.executive_summary}</p>
              {d.llm_assessment.confidence_level && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[10px] text-slate-500 uppercase">Confidence:</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    d.llm_assessment.confidence_level === 'high' ? 'bg-emerald-500/15 text-emerald-400' :
                    d.llm_assessment.confidence_level === 'low' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                  }`}>{d.llm_assessment.confidence_level.toUpperCase()}</span>
                  {d.llm_assessment.confidence_rationale && (
                    <span className="text-[10px] text-slate-500 ml-1">{d.llm_assessment.confidence_rationale}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Risk Insights */}
          {d.llm_assessment.risk_insights?.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Risk Insights</p>
              <div className="space-y-2">
                {d.llm_assessment.risk_insights.map((r: any, i: number) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
                    r.severity === 'high' ? 'border-red-500/20 bg-red-500/5' :
                    r.severity === 'medium' ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-500/10 bg-white/[0.02]'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      r.severity === 'high' ? 'bg-red-400' : r.severity === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'
                    }`} />
                    <div>
                      <p className="text-xs font-bold text-white">{r.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{r.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pricing Commentary */}
            {d.llm_assessment.pricing_commentary && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Pricing Commentary</p>
                <p className="text-xs text-slate-300 leading-relaxed">{d.llm_assessment.pricing_commentary}</p>
              </div>
            )}

            {/* Claims Commentary */}
            {d.llm_assessment.claims_commentary && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Claims Commentary</p>
                <p className="text-xs text-slate-300 leading-relaxed">{d.llm_assessment.claims_commentary}</p>
              </div>
            )}
          </div>

          {/* Negotiation Range */}
          {d.llm_assessment.negotiation_range && (
            <div className="mt-4 bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">LLM Suggested Negotiation Range</p>
              <div className="flex items-center gap-4">
                <div className="text-center flex-1">
                  <p className="text-[10px] text-slate-600">Floor</p>
                  <p className="text-lg font-bold text-red-400">₹{(d.llm_assessment.negotiation_range.floor_premium_per_family || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-600">/family</p>
                </div>
                <div className="h-8 w-px bg-white/[0.08]" />
                <div className="text-center flex-1">
                  <p className="text-[10px] text-emerald-500 font-semibold">Recommended</p>
                  <p className="text-2xl font-bold text-emerald-400">₹{(d.llm_assessment.negotiation_range.recommended_premium_per_family || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-600">/family</p>
                </div>
                <div className="h-8 w-px bg-white/[0.08]" />
                <div className="text-center flex-1">
                  <p className="text-[10px] text-slate-600">Ceiling</p>
                  <p className="text-lg font-bold text-amber-400">₹{(d.llm_assessment.negotiation_range.ceiling_premium_per_family || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-600">/family</p>
                </div>
              </div>
              {d.llm_assessment.negotiation_range.rationale && (
                <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">{d.llm_assessment.negotiation_range.rationale}</p>
              )}
            </div>
          )}

          {/* Recommendations + Special Conditions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {d.llm_assessment.recommendations?.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Recommendations</p>
                <ul className="space-y-1.5">
                  {d.llm_assessment.recommendations.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.llm_assessment.special_conditions?.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Suggested Policy Conditions</p>
                <ul className="space-y-1.5">
                  {d.llm_assessment.special_conditions.map((c: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <Shield className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Raw LLM response fallback */}
      {d.llm_assessment?.raw && d.llm_assessment.executive_summary && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-emerald-400" /> Insurance LLM Assessment
            <span className="text-[9px] text-slate-600 bg-white/[0.05] px-2 py-0.5 rounded-full ml-auto font-mono">isha-inc.com</span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{d.llm_assessment.executive_summary}</p>
        </Card>
      )}

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
            <div className="flex justify-between"><span className="text-xs text-slate-500">Per Family</span><span className="text-xs text-slate-300">₹{(d.opd_pricing.per_family ?? d.opd_pricing.per_life ?? 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Per Life</span><span className="text-xs text-slate-300">₹{(d.opd_pricing.per_life ?? 0).toLocaleString()}</span></div>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] text-slate-600 uppercase font-semibold">Wellness (Optional)</p>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Uptake Assumption</span><span className="text-xs text-slate-300">{d.wellness_pricing.assumed_uptake_pct}%</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Loaded Premium</span><span className="text-sm font-bold text-cyan-400">{formatCurrency(d.wellness_pricing.loaded_premium)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Per Family</span><span className="text-xs text-slate-300">₹{(d.wellness_pricing.per_family ?? d.wellness_pricing.per_life ?? 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-xs text-slate-500">Per Life</span><span className="text-xs text-slate-300">₹{(d.wellness_pricing.per_life ?? 0).toLocaleString()}</span></div>
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

      {/* ─── Mediqzy Revenue & Margin Pricing ─────────────── */}
      {d.mediqzy_pricing && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/20 via-teal-900/15 to-cyan-900/10">
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-full blur-3xl" />
          <div className="p-5 relative">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
                  <IndianRupee className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Mediqzy Revenue & Margin Calculator</h3>
                  <p className="text-[10px] text-emerald-400/60 mt-0.5">
                    Actuarial cost: {formatCurrency(d.mediqzy_pricing.actuarial_cost)} · Select your target margin below
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] text-emerald-400 font-semibold">RECOMMENDED</span>
                <span className="text-xs font-bold text-emerald-300">{d.mediqzy_pricing.recommended_tier?.margin_pct ?? d.mediqzy_pricing.recommended_tier}%</span>
              </div>
            </div>

            {/* Margin Tier Selector */}
            <div className="grid grid-cols-5 gap-2 mb-5">
              {d.mediqzy_pricing.tiers.map((tier: any) => {
                const isSelected = tier.margin_pct === selectedMarginPct;
                const isRecommended = tier.margin_pct === (d.mediqzy_pricing.recommended_tier?.margin_pct ?? d.mediqzy_pricing.recommended_tier);
                return (
                  <button key={tier.margin_pct} onClick={() => setSelectedMarginPct(tier.margin_pct)}
                    className={`relative p-4 rounded-2xl border-2 transition-all duration-300 text-center ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10 scale-[1.02]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                    }`}>
                    {isRecommended && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-emerald-500 text-[8px] font-bold text-white uppercase whitespace-nowrap">
                        Sweet Spot
                      </div>
                    )}
                    <p className={`text-2xl font-bold ${isSelected ? 'text-emerald-400' : 'text-slate-300'}`}>{tier.margin_pct}%</p>
                    <p className="text-[10px] text-slate-500 mt-1">Margin</p>
                    <div className="mt-2 pt-2 border-t border-white/[0.05]">
                      <p className={`text-sm font-bold ${isSelected ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {formatCurrency(tier.mediqzy_revenue)}
                      </p>
                      <p className="text-[9px] text-slate-600">Revenue</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Tier Detail */}
            {(() => {
              const tier = d.mediqzy_pricing.tiers.find((t: any) => t.margin_pct === selectedMarginPct);
              if (!tier) return null;
              return (
                <div className="space-y-4">
                  {/* Summary strip */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Client Pays (Total)', value: formatCurrency(tier.total_premium), color: 'text-white', sub: 'Inc. margin' },
                      { label: 'Per Life', value: `₹${(tier.per_life ?? 0).toLocaleString()}`, color: 'text-slate-300', sub: `Base ₹${(d.mediqzy_pricing.actuarial_per_life ?? 0).toLocaleString()}` },
                      { label: 'Per Family', value: `₹${(tier.per_family ?? 0).toLocaleString()}`, color: 'text-slate-300', sub: `Base ₹${(d.mediqzy_pricing.actuarial_per_family ?? 0).toLocaleString()}` },
                      { label: 'Mediqzy Revenue', value: formatCurrency(tier.mediqzy_revenue), color: 'text-emerald-400', sub: `${tier.margin_pct}% effective margin` },
                    ].map(({ label, value, color, sub }) => (
                      <div key={label} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3.5">
                        <p className="text-[10px] text-slate-600 uppercase font-semibold">{label}</p>
                        <p className={`text-lg font-bold ${color} mt-1`}>{value}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Slab-wise margin breakdown */}
                  {tier.slab_pricing?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Slab-wise Margin Breakdown</p>
                      <div className="space-y-2">
                        {tier.slab_pricing.map((s: any) => {
                          const marginAmt = s.margin_per_family || (s.quoted_premium_per_family - s.base_premium_per_family);
                          return (
                            <div key={s.slab} className="flex items-center justify-between bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3">
                              <div className="flex items-center gap-4">
                                <span className="text-sm font-bold text-white">{s.slab}</span>
                                <span className="text-xs text-slate-500">{s.lives?.toLocaleString()} families</span>
                              </div>
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-[10px] text-slate-600">Base</p>
                                  <p className="text-xs text-slate-400">₹{s.base_premium_per_family?.toLocaleString()}</p>
                                </div>
                                <div className="text-[10px] text-slate-600">→</div>
                                <div className="text-right">
                                  <p className="text-[10px] text-emerald-500">Quoted</p>
                                  <p className="text-sm font-bold text-emerald-400">₹{s.quoted_premium_per_family?.toLocaleString()}</p>
                                </div>
                                <div className="text-right min-w-[72px]">
                                  <p className="text-[10px] text-slate-600">Margin/family</p>
                                  <p className="text-xs font-semibold text-amber-400">+₹{marginAmt?.toLocaleString()}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Visual margin bar */}
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Revenue Composition</span>
                      <span className="text-xs text-slate-400">
                        {formatCurrency(d.mediqzy_pricing.actuarial_cost)} actuarial + {formatCurrency(tier.mediqzy_revenue)} margin = {formatCurrency(tier.total_premium)}
                      </span>
                    </div>
                    <div className="h-4 bg-white/[0.03] rounded-full overflow-hidden flex">
                      <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-500"
                        style={{ width: `${(d.mediqzy_pricing.actuarial_cost / tier.total_premium) * 100}%` }} />
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                        style={{ width: `${(tier.mediqzy_revenue / tier.total_premium) * 100}%` }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[10px] text-violet-400">Actuarial Cost ({(100 - tier.margin_pct).toFixed(0)}%)</span>
                      <span className="text-[10px] text-emerald-400">Mediqzy Margin ({tier.margin_pct}%)</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ─── Supplemental inputs used banner ─────────────────── */}
      {aiQuote?.supplemental_inputs?.files_processed?.length > 0 || aiQuote?.supplemental_inputs?.has_additional_context ? (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-xs text-cyan-400">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          <span>
            Enriched with{aiQuote.supplemental_inputs.has_additional_context ? ' manual notes' : ''}
            {aiQuote.supplemental_inputs.files_processed?.length > 0
              ? ` + ${aiQuote.supplemental_inputs.files_processed.length} file${aiQuote.supplemental_inputs.files_processed.length > 1 ? 's' : ''}: ${aiQuote.supplemental_inputs.files_processed.map((f: any) => f.name).join(', ')}`
              : ''}
          </span>
        </div>
      ) : null}

      {/* ─── Actions ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <Button onClick={handleGenerate} variant="outline"
          className="border-white/[0.1] text-slate-400 hover:bg-white/[0.05] rounded-xl h-10 px-5 gap-2">
          <RefreshCw className="h-4 w-4" /> Regenerate
        </Button>
        <div className="flex items-center gap-3">
          <Button onClick={() => applyToQuoteBuilder(false)} variant="outline"
            className="border-white/[0.1] text-slate-400 hover:bg-white/[0.05] rounded-xl h-10 px-5 gap-2 text-sm">
            <Zap className="h-4 w-4" /> Apply at Cost
          </Button>
          {d.mediqzy_pricing && (
            <Button onClick={() => applyToQuoteBuilder(true)}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-0 rounded-xl h-10 px-6 gap-2 text-sm font-medium shadow-lg shadow-emerald-600/20">
              <IndianRupee className="h-4 w-4" /> Apply at {selectedMarginPct}% Margin
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE BUILDER PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function TeamQuoteBuilderPage() {
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
        const { data } = await api.get(`/rfq/rfqs/${rfqId}`, { headers: authHeaders() });
        if (data.success) {
          setRfq(data.data);
          // Pre-populate lives
          const m = data.data.member_count || 0;
          if (isNew && m) {
            setForm(f => ({ ...f, total_lives: String(m) }));
          }
          // Check for AI-prefilled quote — first from DB (rfq.ai_quote_data), fallback to sessionStorage legacy
          if (isNew) {
            const aiFromDb = data.data.ai_quote_data
              ? (typeof data.data.ai_quote_data === 'string' ? JSON.parse(data.data.ai_quote_data) : data.data.ai_quote_data)
              : null;
            const aiPrefillJson = sessionStorage.getItem('ai_quote_prefill');
            const ai = aiFromDb?.recommended_quote || (aiPrefillJson ? JSON.parse(aiPrefillJson) : null);
            if (ai) {
              try {
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
          // If editing existing quote, load via dedicated endpoint (Fix: no longer searches embedded quotes array)
          if (!isNew) {
            const quoteRes = await api.get(`/rfq/quotes/${quoteId}`, { headers: authHeaders() }).catch(() => null);
            const q = quoteRes?.data?.data;
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
        await api.post(`/rfq/rfqs/${rfqId}/quotes`, payload, { headers: authHeaders() });
      } else {
        await api.put(`/rfq/quotes/${quoteId}`, payload, { headers: authHeaders() });
      }
      navigate(`/rfq/rfqs/${rfqId}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save quote');
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
    <TeamInsuranceLayout title="Quote Builder">
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="h-6 w-6 text-violet-400 animate-spin" />
    </div>
    </TeamInsuranceLayout>
  );

  return (
    <TeamInsuranceLayout title={isNew ? 'Create Quote' : 'Edit Quote'}>
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(`/rfq/rfqs/${rfqId}`)} className="p-2 rounded-xl hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors">
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
        <Button onClick={() => navigate(`/rfq/rfqs/${rfqId}`)} variant="outline"
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
    </TeamInsuranceLayout>
  );
}

// ─── Deep Analytics Tab ───────────────────────────────────────────────────────
function DeepAnalyticsTab({ rfqId, rfq, deepAnalytics, loading, onAnalyze }: any) {
  const d = deepAnalytics;
  const rc = d?.rfq_context;
  const uw = d?.underwriting_summary;
  const forecast = d?.claim_forecast;
  const cohort = d?.cohort_model;
  const attrition = d?.attrition_analysis;
  const product = d?.product_risk_profile;
  const empRisk = d?.employee_risk_distribution;
  const claimsExp = d?.claims_experience;
  const ageBandForecasts = d?.age_band_forecasts || [];

  const RISK_COLORS: Record<string, string> = {
    'Preferred':    'emerald',
    'Standard':     'blue',
    'Substandard':  'amber',
    'High Risk':    'red',
  };

  const LEVEL_COLORS: Record<string, string> = {
    'High':     'text-red-400 bg-red-500/10 border-red-500/20',
    'Moderate': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'Standard': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'Low':      'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  };

  if (!d && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6">
        <div className="p-6 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
          <TrendingUp className="h-14 w-14 text-cyan-400" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold text-white">AI Deep Analytics</h3>
          <p className="text-slate-400 max-w-md text-sm leading-relaxed">
            Run multi-model predictive analytics: claim forecasting, attrition impact, employee risk scoring, product-wise risk profiles and underwriting cohort analysis.
          </p>
        </div>
        <button onClick={onAnalyze}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-sm shadow-lg shadow-cyan-600/25 transition-all">
          <TrendingUp className="h-4 w-4" /> Run Deep Analytics
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <RefreshCw className="h-10 w-10 text-cyan-400 animate-spin" />
        <p className="text-slate-400 text-sm">Running 7 predictive models…</p>
        <p className="text-slate-600 text-xs">Age-band forecasting · Attrition modelling · Claim prediction · Risk scoring</p>
      </div>
    );
  }

  const riskColor = RISK_COLORS[uw?.overall_risk] || 'blue';
  const riskColorMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
    amber:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
    red:     'text-red-400 bg-red-500/10 border-red-500/20',
  };
  const riskCls = riskColorMap[riskColor] || riskColorMap.blue;

  return (
    <div className="space-y-6">
      {/* Header + Re-run */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-cyan-400" /> Deep Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {rc?.industry} · {rc?.product_type} · {rc?.member_count?.toLocaleString()} lives
            {rc?.is_renewal && ` · Renewal from ${rc?.existing_insurer}`}
          </p>
        </div>
        <button onClick={onAnalyze}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-slate-400 hover:text-white text-xs transition-all">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* ── UNDERWRITING SUMMARY ── */}
      <div className={`p-5 rounded-2xl border ${riskCls}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider opacity-70 mb-1">Overall Underwriting Risk</p>
            <p className="text-2xl font-bold">{uw?.overall_risk}</p>
            <p className="text-sm opacity-80 mt-0.5">{uw?.underwriting_decision}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(uw?.risk_factors || {}).map(([k, v]) => (
              <div key={k} className="text-center px-3 py-2 rounded-xl bg-black/20 border border-white/[0.06]">
                <p className="text-xs text-slate-500 capitalize">{k.replace(/_/g, ' ')}</p>
                <p className={`text-sm font-semibold ${v === 'HIGH' ? 'text-red-400' : v === 'MODERATE' ? 'text-amber-400' : 'text-emerald-400'}`}>{String(v)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Loadings */}
        {uw?.key_loadings && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Age Loading', value: `+${uw.key_loadings.age_loading}%` },
              { label: 'Adverse Selection', value: `+${uw.key_loadings.adverse_selection_loading}%` },
              { label: 'Industry Loading', value: `+${uw.key_loadings.industry_loading}%` },
              { label: 'Renewal Credit', value: `${uw.key_loadings.renewal_credit}%` },
              { label: 'Net Loading', value: `${uw.key_loadings.total_loading_pct > 0 ? '+' : ''}${uw.key_loadings.total_loading_pct}%`, highlight: true },
            ].map(item => (
              <div key={item.label} className={`p-3 rounded-xl ${item.highlight ? 'bg-white/10 border border-white/20' : 'bg-black/20'} text-center`}>
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="text-base font-bold mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Risk Flags */}
        {uw?.key_risk_flags?.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {uw.key_risk_flags.map((flag: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-black/20">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
                <span className="text-slate-300">{flag}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── COHORT MODEL / PREMIUM ADEQUACY ── */}
      {cohort && (
        <div className="p-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Gauge className="h-4 w-4 text-violet-400" /> Severity-Frequency Cohort Model & Premium Adequacy
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Base Burning Cost/Life', value: `₹${cohort.base_burning_cost_per_life?.toLocaleString('en-IN')}`, sub: 'Market norm' },
              { label: 'Age-Adjusted Cost/Life', value: `₹${cohort.age_adjusted_burning_cost?.toLocaleString('en-IN')}`, sub: `Loading: ${cohort.weighted_age_loading}x` },
              { label: 'Gross Premium Indication', value: `₹${cohort.gross_premium_indication?.toLocaleString('en-IN')}`, sub: 'With expenses & profit', highlight: true },
              { label: 'Prior Premium/Life', value: cohort.prior_premium_per_life > 0 ? `₹${cohort.prior_premium_per_life?.toLocaleString('en-IN')}` : 'Not provided', sub: cohort.adequacy_verdict },
            ].map(item => (
              <div key={item.label} className={`p-4 rounded-xl border ${item.highlight ? 'border-violet-500/30 bg-violet-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className={`text-lg font-bold mt-1 ${item.highlight ? 'text-violet-300' : 'text-white'}`}>{item.value}</p>
                <p className={`text-xs mt-0.5 ${cohort.adequacy_verdict?.includes('Under') ? 'text-red-400' : cohort.adequacy_verdict?.includes('Over') ? 'text-amber-400' : 'text-emerald-400'}`}>{item.sub}</p>
              </div>
            ))}
          </div>

          {/* 5-year inflation projection */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Inflation-Adjusted Burning Cost Trend</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={[
                { year: 'Base', value: cohort.age_adjusted_burning_cost },
                { year: 'Yr 1', value: cohort.inflation_adjusted_yr1 },
                { year: 'Yr 3', value: cohort.inflation_adjusted_yr3 },
                { year: 'Yr 5', value: cohort.inflation_adjusted_yr5 },
              ]} barSize={32}>
                <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `₹${Math.round(v / 1000)}k`} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Cost/Life']} contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {[0, 1, 2, 3].map(i => <Cell key={i} fill={i === 2 ? '#f59e0b' : i === 3 ? '#ef4444' : '#8b5cf6'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {cohort.stop_loss_recommendation && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {cohort.stop_loss_recommendation}
            </div>
          )}
        </div>
      )}

      {/* ── 3-YEAR CLAIM FORECAST ── */}
      {forecast && (
        <div className="p-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" /> Multi-Year Claim Forecast
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Year 1 Forecast', data: forecast.base_year, color: 'blue', inflation: null },
              { label: 'Year 3 Forecast', data: forecast.year_3, color: 'amber', inflation: forecast.year_3.inflation_impact_pct },
              { label: 'Year 5 Forecast', data: forecast.year_5, color: 'red', inflation: forecast.year_5.inflation_impact_pct },
            ].map(({ label, data, color, inflation }) => (
              <div key={label} className={`p-4 rounded-xl border border-${color}-500/20 bg-${color}-500/5 space-y-2`}>
                <p className={`text-xs font-semibold text-${color}-400 uppercase tracking-wider`}>{label}</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Expected Claims</span>
                    <span className="text-white font-medium">{data.expected_total_claims?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Burning Cost/Life</span>
                    <span className="text-white font-medium">₹{data.expected_burning_cost_per_life?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Total Outgo</span>
                    <span className={`font-bold text-${color}-300`}>₹{(data.expected_total_outgo / 100000)?.toFixed(1)}L</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Projected ICR</span>
                    <span className={`font-medium ${data.projected_icr_pct > 90 ? 'text-red-400' : data.projected_icr_pct > 80 ? 'text-amber-400' : 'text-emerald-400'}`}>{data.projected_icr_pct}%</span>
                  </div>
                  {inflation && (
                    <div className="flex justify-between text-xs pt-1 border-t border-white/[0.06]">
                      <span className="text-slate-500">Inflation Impact</span>
                      <span className="text-red-400">+{inflation}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AGE-BAND FORECAST TABLE ── */}
      {ageBandForecasts.length > 0 && (
        <div className="p-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-400" /> Age-Band Claim Forecasting
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-white/[0.06]">
                  <th className="text-left py-2 pr-4">Age Band</th>
                  <th className="text-right py-2 px-2">Count</th>
                  <th className="text-right py-2 px-2">Risk Factor</th>
                  <th className="text-right py-2 px-2">Yr 1 Claims</th>
                  <th className="text-right py-2 px-2">Yr 1 Burning/Life</th>
                  <th className="text-right py-2 px-2">Yr 1 ICR%</th>
                  <th className="text-right py-2 px-2">Yr 3 Claims</th>
                  <th className="text-right py-2 px-2">Yr 5 Claims</th>
                  <th className="text-right py-2 pl-2">Maternity Risk</th>
                </tr>
              </thead>
              <tbody>
                {ageBandForecasts.map((band: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="py-2 pr-4 font-medium text-white">{band.age_band}</td>
                    <td className="text-right py-2 px-2 text-slate-300">{band.count.toLocaleString()}</td>
                    <td className={`text-right py-2 px-2 font-medium ${band.risk_factor >= 2.0 ? 'text-red-400' : band.risk_factor >= 1.4 ? 'text-amber-400' : band.risk_factor >= 1.0 ? 'text-blue-400' : 'text-emerald-400'}`}>{band.risk_factor}x</td>
                    <td className="text-right py-2 px-2 text-slate-300">{band.forecast_yr1.expected_claims.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-slate-300">₹{band.forecast_yr1.expected_burning_cost.toLocaleString('en-IN')}</td>
                    <td className={`text-right py-2 px-2 font-medium ${band.forecast_yr1.expected_icr_pct > 90 ? 'text-red-400' : band.forecast_yr1.expected_icr_pct > 75 ? 'text-amber-400' : 'text-emerald-400'}`}>{band.forecast_yr1.expected_icr_pct}%</td>
                    <td className="text-right py-2 px-2 text-amber-300">{band.forecast_yr3.expected_claims.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-red-300">{band.forecast_yr5.expected_claims.toLocaleString()}</td>
                    <td className="text-right py-2 pl-2 text-slate-400">{Math.round(band.maternity_risk * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ATTRITION ANALYSIS ── */}
      {attrition && (
        <div className="p-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-amber-400" /> Employee Attrition Impact Modelling
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Industry Attrition Rate', value: `${attrition.industry_annual_attrition_pct}% p.a.`, sub: 'Annual average' },
              { label: 'Est. Exits in Yr 1', value: attrition.estimated_exits_yr1?.toLocaleString(), sub: 'Employee exits' },
              { label: 'Fresh Joiners (< 1 yr)', value: `${attrition.fresh_joiner_pct}%`, sub: `${attrition.fresh_joiner_count?.toLocaleString()} lives` },
              { label: 'Adverse Selection Risk', value: attrition.adverse_selection_risk, sub: `+${attrition.premium_impact_pct}% premium impact` },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className={`text-lg font-bold mt-0.5 ${item.label.includes('Adverse') ? (item.value === 'High' ? 'text-red-400' : item.value === 'Moderate' ? 'text-amber-400' : 'text-emerald-400') : 'text-white'}`}>{item.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>

          {attrition.tenure_distribution?.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Tenure Distribution</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={attrition.tenure_distribution.filter((t: any) => t.band !== 'Unknown')} barSize={28}>
                  <XAxis dataKey="band" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v: any) => [v?.toLocaleString(), 'Members']} contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            {attrition.underwriting_notes}
          </div>
        </div>
      )}

      {/* ── PRODUCT RISK PROFILE ── */}
      {product && (
        <div className="p-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan-400" /> Product-Wise Risk Profile — {product.product_type}
          </h3>

          {/* Product norms */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Normal ICR', value: `${product.norm_icr_pct}%` },
              { label: 'Claim Freq/100', value: product.norm_claims_freq_per_100 },
              { label: 'Avg Severity', value: `₹${product.norm_avg_severity?.toLocaleString('en-IN')}` },
              { label: 'Medical Inflation', value: `${product.inflation_rate_pct}% p.a.` },
              { label: 'Catastrophic Risk', value: `${product.catastrophic_claims_pct}%` },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-center">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="text-base font-bold text-cyan-300 mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Top disease predictions */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Industry Disease Risk Profile — {product.industry}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {product.top_disease_predictions?.map((d: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div>
                    <p className="text-sm font-medium text-white">{d.disease}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Expected freq: {d.expected_frequency_pct} per 100</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${LEVEL_COLORS[d.risk_level] || ''}`}>{d.risk_level}</span>
                    <span className="text-xs text-slate-500">{d.risk_multiplier}x baseline</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Product comparison table */}
          <div>
            <p className="text-xs text-slate-500 mb-2">All Product Benchmarks</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-white/[0.06]">
                    <th className="text-left py-2 pr-4">Product</th>
                    <th className="text-right py-2 px-2">Normal ICR%</th>
                    <th className="text-right py-2 px-2">Freq/100</th>
                    <th className="text-right py-2 pl-2">Avg Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {product.product_benchmarks_available?.map((p: any, i: number) => (
                    <tr key={i} className={`border-b border-white/[0.04] ${p.product === product.product_type ? 'bg-cyan-500/10' : 'hover:bg-white/[0.02]'}`}>
                      <td className={`py-2 pr-4 font-medium ${p.product === product.product_type ? 'text-cyan-300' : 'text-slate-300'}`}>{p.product} {p.product === product.product_type && '← current'}</td>
                      <td className={`text-right py-2 px-2 ${p.icr_pct > 90 ? 'text-red-400' : p.icr_pct > 80 ? 'text-amber-400' : 'text-emerald-400'}`}>{p.icr_pct}%</td>
                      <td className="text-right py-2 px-2 text-slate-400">{p.freq_per_100}</td>
                      <td className="text-right py-2 pl-2 text-slate-400">₹{p.avg_severity?.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── EMPLOYEE RISK DISTRIBUTION ── */}
      {empRisk && (
        <div className="p-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-400" /> Employee Risk Distribution
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 text-center">
              <p className="text-xs text-slate-500">Avg Risk Score</p>
              <p className="text-2xl font-bold text-violet-300 mt-1">{empRisk.avg_risk_score}</p>
              <p className={`text-xs mt-0.5 font-medium ${empRisk.risk_tier === 'High Risk' ? 'text-red-400' : empRisk.risk_tier === 'Substandard' ? 'text-amber-400' : empRisk.risk_tier === 'Standard' ? 'text-blue-400' : 'text-emerald-400'}`}>{empRisk.risk_tier}</p>
            </div>
            <div className="col-span-3 grid grid-cols-2 md:grid-cols-3 gap-2">
              {empRisk.buckets?.map((b: any) => (
                <div key={b.label} className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-xs text-slate-500">{b.label}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{b.count?.toLocaleString()}</p>
                  <div className="w-full bg-white/[0.06] rounded-full h-1.5 mt-1.5">
                    <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${Math.min(b.pct, 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{b.pct}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* Age band chart */}
          {empRisk.age_band_distribution?.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Age Band Distribution with Risk Factors</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={empRisk.age_band_distribution} barSize={28}>
                  <XAxis dataKey="age_band" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => v?.toLocaleString()} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any, name: string) => [v?.toLocaleString(), name]} contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="employees" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Employees" />
                  <Bar dataKey="dependents" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Dependents" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Gender & SI distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {empRisk.gender_distribution?.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Gender Distribution</p>
                <div className="flex gap-3">
                  {empRisk.gender_distribution.map((g: any) => (
                    <div key={g.gender} className="flex-1 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                      <p className="text-xs text-slate-500">{g.gender || 'Unknown'}</p>
                      <p className="text-lg font-bold text-white mt-0.5">{g.pct}%</p>
                      <p className="text-xs text-slate-500">{g.count?.toLocaleString()} · Avg {g.avg_age}y</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {empRisk.si_distribution?.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2">SI Slab Distribution</p>
                <div className="space-y-1.5">
                  {empRisk.si_distribution.filter((s: any) => s.slab !== 'Not set' || s.count > 0).map((s: any) => (
                    <div key={s.slab} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 w-20 shrink-0">{s.slab}</span>
                      <div className="flex-1 bg-white/[0.06] rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min((s.count / (rc?.member_count || 1)) * 100, 100)}%` }} />
                      </div>
                      <span className="text-slate-300 w-12 text-right">{s.count?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CLAIMS EXPERIENCE (if available) ── */}
      {claimsExp && (
        <div className="p-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-emerald-400" /> Claims Experience Deep Dive
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Claims', value: claimsExp.summary.total_claims?.toLocaleString() },
              { label: 'Total Approved', value: `₹${(claimsExp.summary.total_approved / 100000)?.toFixed(1)}L` },
              { label: 'Avg Severity', value: `₹${claimsExp.summary.avg_claim_severity?.toLocaleString('en-IN')}` },
              { label: 'ICR', value: claimsExp.summary.icr_pct ? `${claimsExp.summary.icr_pct}%` : 'N/A' },
              { label: 'Claims Freq/100', value: claimsExp.summary.claims_freq_per_100 || 'N/A' },
              { label: 'Approval Rate', value: `${claimsExp.summary.approval_rate_pct}%` },
              { label: 'High-Cost Claims', value: claimsExp.summary.high_cost_claims_count?.toLocaleString() },
              { label: 'HC Claims %', value: `${claimsExp.summary.high_cost_claims_pct}%` },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="text-lg font-bold text-white mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Top diagnoses */}
          {claimsExp.top_diagnoses?.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Top Diagnoses by Claim Count</p>
              <div className="space-y-1.5">
                {claimsExp.top_diagnoses.slice(0, 8).map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 truncate flex-1">{d.diagnosis || 'Not coded'}</span>
                    <span className="text-slate-300 w-12 text-right">{d.count} claims</span>
                    <span className="text-violet-300 w-24 text-right">₹{d.avg_per_claim?.toLocaleString('en-IN')}/claim</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top claimants risk heat */}
          {claimsExp.top_claimants_by_cost?.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">High-Cost Claimants Risk Heat Map (Top 10)</p>
              <div className="space-y-1.5">
                {claimsExp.top_claimants_by_cost.slice(0, 10).map((e: any, i: number) => (
                  <div key={i} className={`flex items-center gap-3 p-2 rounded-lg border text-xs ${e.risk_tier === 'Critical' ? 'border-red-500/30 bg-red-500/5' : e.risk_tier === 'High' ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/[0.06] bg-transparent'}`}>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${e.risk_tier === 'Critical' ? 'text-red-400' : e.risk_tier === 'High' ? 'text-amber-400' : e.risk_tier === 'Moderate' ? 'text-blue-400' : 'text-emerald-400'}`}>{e.risk_tier}</span>
                    <span className="text-slate-300 flex-1">{e.name || e.emp_code || `Employee ${i + 1}`}</span>
                    {e.age && <span className="text-slate-500">Age {e.age}</span>}
                    <span className="text-white font-medium">₹{e.total_approved?.toLocaleString('en-IN')}</span>
                    <span className="text-slate-500">{e.claims} claims</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* no claims data notice */}
      {!claimsExp && (
        <div className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] flex items-center gap-3 text-sm text-slate-500">
          <AlertCircle className="h-4 w-4 shrink-0 text-slate-600" />
          No claims data uploaded for this RFQ. Upload claims history to enable experience-rated deep analytics and employee-wise risk heat mapping.
        </div>
      )}

      <p className="text-xs text-slate-600 text-center">Deep Analytics powered by Mediqzy AI™ · {d?.generated_at ? new Date(d.generated_at).toLocaleString('en-IN') : ''}</p>
    </div>
  );
}
