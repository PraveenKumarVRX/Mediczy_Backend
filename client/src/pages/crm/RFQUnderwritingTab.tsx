/**
 * RFQ Underwriting Pipeline Tab
 * Full underwriting workflow: product selection → slip parse → coverage matrix →
 * gap analysis → AI underwriting decision → terms generation
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck, ShieldX, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, RefreshCw, Zap, FileText, TrendingUp,
  BookOpen, ClipboardCheck, MessageSquare, Send, Loader2, Download,
  AlertCircle, Info, Percent, Target, Activity, Users, IndianRupee,
  BarChart3, Lock, Unlock, Star, BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import api from '@/utils/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const PRODUCTS = [
  { code: 'GMC',   name: 'Group Mediclaim',          color: 'violet',  icon: '🏥' },
  { code: 'GPA',   name: 'Group Personal Accident',  color: 'amber',   icon: '⚡' },
  { code: 'GTL',   name: 'Group Term Life',          color: 'blue',    icon: '🛡️' },
  { code: 'OPD',   name: 'Group OPD Benefits',       color: 'teal',    icon: '🩺' },
  { code: 'TOPUP', name: 'Top-Up / Super Top-Up',    color: 'emerald', icon: '↑' },
  { code: 'CI',    name: 'Critical Illness',         color: 'rose',    icon: '❤️' },
  { code: 'EWS',   name: 'Employee Wellness Suite',  color: 'green',   icon: '🌿' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  included:    { label: 'Included',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  excluded:    { label: 'Excluded',    color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         icon: XCircle },
  conditional: { label: 'Conditional', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',     icon: AlertTriangle },
  'sub-limited':{ label: 'Sub-Limited', color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',       icon: ShieldAlert },
};

const GAP_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  STANDARD_MATCH:    { label: 'Standard Match',  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  OPTIONAL_ADDON:    { label: 'Optional Add-on', color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  CONDITIONAL:       { label: 'Conditional',     color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  NON_STANDARD:      { label: 'Non-Standard',    color: 'text-orange-400',  bg: 'bg-orange-500/10' },
  NOT_COVERABLE:     { label: 'Not Coverable',   color: 'text-red-400',     bg: 'bg-red-500/10' },
};

const CATEGORY_LABELS: Record<string, string> = {
  hospitalization: 'Hospitalization',
  critical: 'Critical Illness Treatment',
  surgery: 'Surgical Procedures',
  maternity: 'Maternity & Newborn',
  limits: 'Sub-Limits & Caps',
  waiting_period: 'Waiting Periods',
  outpatient: 'Outpatient (OPD)',
  dental: 'Dental',
  optical: 'Optical / Vision',
  cosmetic: 'Cosmetic & Elective',
  dme: 'DME & Prosthetics',
  exclusion: 'Standard Exclusions',
  core: 'Core Benefits',
  benefit: 'Additional Benefits',
  opd: 'OPD Consultations',
  diagnostics: 'Diagnostics',
  pharmacy: 'Pharmacy',
  therapy: 'Therapy',
  preventive: 'Preventive Health',
  mental_health: 'Mental Health',
  digital: 'Digital Health',
  alternative: 'Alternative Medicine',
  accident: 'Accident Benefits',
  life: 'Life Benefits',
  rider: 'Riders',
  regulatory: 'Regulatory',
  ci_condition: 'CI Conditions Covered',
  chronic: 'Chronic Disease Management',
  wellness: 'Wellness',
};

function riskScoreColor(score: number) {
  if (score >= 70) return 'text-red-400';
  if (score >= 45) return 'text-amber-400';
  return 'text-emerald-400';
}

function decisionColor(d: string) {
  if (d?.includes('Decline')) return 'text-red-400 bg-red-500/10 border-red-500/25';
  if (d?.includes('Refer')) return 'text-orange-400 bg-orange-500/10 border-orange-500/25';
  if (d?.includes('Loading')) return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
}

function formatCurrency(n: number) {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RFQUnderwritingTab({ rfqId, rfq }: { rfqId: number; rfq: any }) {
  const [selectedProduct, setSelectedProduct] = useState('GMC');
  const [activeSection, setActiveSection] = useState<'matrix' | 'analyze' | 'chat' | 'terms'>('matrix');

  // Coverage matrix state
  const [matrix, setMatrix] = useState<any>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['hospitalization', 'maternity', 'limits', 'exclusion', 'core', 'ci_condition']));

  // Filter
  const [statusFilter, setStatusFilter] = useState<'all' | 'included' | 'excluded' | 'conditional' | 'sub-limited'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Underwriting analysis
  const [uwData, setUwData] = useState<any>(null);
  const [uwLoading, setUwLoading] = useState(false);
  const [savedAssessments, setSavedAssessments] = useState<any[]>([]);

  // Slip parse
  const [parsedSlip, setParsedSlip] = useState<any>(null);
  const [parseLoading, setParseLoading] = useState(false);

  // Chat
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Terms
  const [terms, setTerms] = useState<string>('');
  const [termsLoading, setTermsLoading] = useState(false);

  // ── Load coverage matrix ────────────────────────────────────────────────────
  const loadMatrix = useCallback(async (code: string) => {
    setMatrixLoading(true);
    try {
      const { data } = await api.get(`/crm/underwriting/products/${code}/matrix`, { headers: authHeaders() });
      if (data.success) setMatrix(data);
    } catch (err: any) {
      toast.error('Failed to load coverage matrix');
    } finally {
      setMatrixLoading(false);
    }
  }, []);

  // ── Load saved assessments ──────────────────────────────────────────────────
  const loadAssessments = useCallback(async () => {
    try {
      const { data } = await api.get(`/crm/underwriting/rfqs/${rfqId}`, { headers: authHeaders() });
      if (data.success) setSavedAssessments(data.assessments || []);
    } catch { /* silent */ }
  }, [rfqId]);

  useEffect(() => {
    loadMatrix(selectedProduct);
    loadAssessments();
  }, [selectedProduct, loadMatrix, loadAssessments]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // ── Parse RFQ slip ──────────────────────────────────────────────────────────
  const parseSlip = async () => {
    setParseLoading(true);
    try {
      const { data } = await api.post(`/crm/underwriting/rfqs/${rfqId}/parse-slip`, {}, { headers: authHeaders() });
      if (data.success) {
        setParsedSlip(data.parsed);
        toast.success(`Slip parsed — ${data.parsed.coverages?.length || 0} coverage items extracted`);
        if (activeSection === 'matrix') setActiveSection('analyze');
      }
    } catch (err: any) {
      toast.error('Slip parse failed');
    } finally {
      setParseLoading(false);
    }
  };

  // ── Run full underwriting pipeline ─────────────────────────────────────────
  const runUnderwriting = async () => {
    setUwLoading(true);
    setActiveSection('analyze');
    try {
      const payload: any = { productCode: selectedProduct, forcedReParse: true };
      if (parsedSlip?.coverages?.length) {
        payload.requestedCoverages = parsedSlip.coverages.map((c: any) => c.head);
      }
      const { data } = await api.post(`/crm/underwriting/rfqs/${rfqId}/analyze`, payload, {
        headers: authHeaders(), timeout: 45000,
      });
      if (data.success) {
        setUwData(data.underwriting);
        await loadAssessments();
        toast.success(`Underwriting complete — ${data.underwriting.decision}`);
      }
    } catch (err: any) {
      toast.error('Underwriting analysis failed: ' + (err?.response?.data?.error || err.message));
    } finally {
      setUwLoading(false);
    }
  };

  // ── Chat with iSHA-UW ───────────────────────────────────────────────────────
  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg) return;
    const newHistory = [...chatHistory, { role: 'user', content: msg }];
    setChatHistory(newHistory);
    setChatInput('');
    setChatLoading(true);
    try {
      const { data } = await api.post(`/crm/underwriting/rfqs/${rfqId}/ai-chat`, {
        message: msg, history: newHistory.slice(-6), productCode: selectedProduct,
      }, { headers: authHeaders(), timeout: 30000 });
      if (data.success) setChatHistory(h => [...h, { role: 'assistant', content: data.reply }]);
    } catch {
      setChatHistory(h => [...h, { role: 'assistant', content: 'iSHA-UW is temporarily unavailable. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Generate terms letter ───────────────────────────────────────────────────
  const generateTerms = async () => {
    setTermsLoading(true);
    setActiveSection('terms');
    try {
      const { data } = await api.post(`/crm/underwriting/rfqs/${rfqId}/generate-terms`, {
        productCode: selectedProduct,
      }, { headers: authHeaders(), timeout: 30000 });
      if (data.success) {
        setTerms(data.termsLetter);
        toast.success('Underwriting terms letter generated');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to generate terms');
    } finally {
      setTermsLoading(false);
    }
  };

  // Get saved assessment for current product
  const savedForProduct = savedAssessments.find(a => a.product_code === selectedProduct);

  // Compute filtered matrix rows
  const allRows: any[] = (matrix?.matrix || []).filter(Boolean);
  const filteredRows = allRows.filter(r => {
    const statusOk = statusFilter === 'all' || r.status === statusFilter;
    const searchOk = !searchTerm || r.coverage_head.toLowerCase().includes(searchTerm.toLowerCase()) || (r.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    return statusOk && searchOk;
  });

  const groupedFiltered: Record<string, any[]> = {};
  for (const row of filteredRows) {
    if (!groupedFiltered[row.category]) groupedFiltered[row.category] = [];
    groupedFiltered[row.category].push(row);
  }

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const n = new Set(prev);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });
  };

  const included = allRows.filter(r => r.status === 'included').length;
  const excluded = allRows.filter(r => r.status === 'excluded').length;
  const conditional = allRows.filter(r => ['conditional', 'sub-limited'].includes(r.status)).length;

  return (
    <div className="space-y-5">
      {/* ── Product selector ───────────────────────────────────────────────── */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-white">Insurance Product Underwriting Pipeline</h3>
            <p className="text-xs text-slate-500 mt-0.5">Select a product to view the coverage matrix, run gap analysis and get AI underwriting decisions</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={parseSlip} disabled={parseLoading} variant="outline"
              className="border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 rounded-xl h-9 text-sm gap-2">
              {parseLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Parse Slip
            </Button>
            <Button onClick={runUnderwriting} disabled={uwLoading}
              className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 border-0 rounded-xl h-9 text-sm gap-2 shadow-lg shadow-violet-600/20">
              {uwLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {uwLoading ? 'Underwriting...' : 'Run Underwriting'}
            </Button>
          </div>
        </div>

        {/* Product tabs */}
        <div className="flex gap-2 flex-wrap mt-4">
          {PRODUCTS.map(p => (
            <button key={p.code} onClick={() => setSelectedProduct(p.code)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                selectedProduct === p.code
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                  : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}>
              <span>{p.icon}</span> {p.code}
              {savedAssessments.find(a => a.product_code === p.code) && (
                <BadgeCheck className="h-3 w-3 text-emerald-400" />
              )}
            </button>
          ))}
        </div>

        {/* Product info + saved assessment banner */}
        {matrix?.product && (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm text-white font-medium">{matrix.product.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{matrix.product.description}</p>
            </div>
            {savedForProduct && (
              <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium ${decisionColor(savedForProduct.decision)}`}>
                <Target className="h-4 w-4" />
                <span>{savedForProduct.decision}</span>
                <span className="text-xs opacity-70">· Risk {savedForProduct.risk_score}/100 · Load {savedForProduct.loading_pct}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section nav ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] w-fit flex-wrap">
        {[
          { key: 'matrix',  label: 'Coverage Matrix',  icon: ShieldCheck },
          { key: 'analyze', label: 'UW Assessment',    icon: ClipboardCheck },
          { key: 'chat',    label: 'iSHA-UW Chat',     icon: MessageSquare },
          { key: 'terms',   label: 'UW Terms Letter',  icon: FileText },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveSection(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeSection === key
                ? 'bg-violet-500/15 text-violet-300 shadow-sm'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
            }`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ── COVERAGE MATRIX ─────────────────────────────────────────────────── */}
      {activeSection === 'matrix' && (
        <div className="space-y-4">
          {/* Stats row */}
          {!matrixLoading && matrix && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Inclusions', value: included, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', Icon: CheckCircle2 },
                { label: 'Conditional / Sub-Limited', value: conditional, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', Icon: ShieldAlert },
                { label: 'Standard Exclusions', value: excluded, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', Icon: XCircle },
              ].map(s => (
                <div key={s.label} className={`flex items-center gap-3 p-4 rounded-xl border ${s.bg}`}>
                  <s.Icon className={`h-5 w-5 ${s.color} flex-shrink-0`} />
                  <div>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-3 flex-wrap items-center">
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search coverage items..."
              className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
            />
            <div className="flex gap-1">
              {(['all', 'included', 'excluded', 'conditional', 'sub-limited'] as const).map(f => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                    statusFilter === f
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                      : 'text-slate-500 hover:text-slate-300 bg-white/[0.03] border border-white/[0.06]'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {matrixLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(groupedFiltered).map(([cat, rows]) => (
                <div key={cat} className="bg-white/[0.02] rounded-xl border border-white/[0.05] overflow-hidden">
                  {/* Category header */}
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors">
                    <div className="flex items-center gap-2.5">
                      <BookOpen className="h-4 w-4 text-violet-400/70" />
                      <span className="text-sm font-semibold text-slate-300">
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-xs text-slate-500 border border-white/[0.06]">
                        {rows.length}
                      </span>
                    </div>
                    {expandedCategories.has(cat)
                      ? <ChevronDown className="h-4 w-4 text-slate-600" />
                      : <ChevronRight className="h-4 w-4 text-slate-600" />}
                  </button>

                  {/* Coverage rows */}
                  {expandedCategories.has(cat) && (
                    <div className="divide-y divide-white/[0.04]">
                      {rows.map((row: any) => {
                        const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.conditional;
                        const StatusIcon = cfg.icon;
                        return (
                          <div key={row.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-start gap-3">
                              <StatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-white">{row.coverage_head}</span>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>
                                    {cfg.label}
                                  </span>
                                  {row.is_optional && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 uppercase tracking-wide">
                                      OPTIONAL
                                    </span>
                                  )}
                                  {row.is_standard_excl && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 uppercase tracking-wide">
                                      STD EXCL
                                    </span>
                                  )}
                                </div>
                                {row.description && (
                                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{row.description}</p>
                                )}
                                <div className="flex flex-wrap gap-3 mt-1.5">
                                  {row.limit_value && (
                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                      <IndianRupee className="h-3 w-3 text-slate-600" />
                                      {row.limit_value}
                                    </span>
                                  )}
                                  {row.waiting_period && (
                                    <span className="text-xs text-amber-500/80 flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      Waiting: {row.waiting_period}
                                    </span>
                                  )}
                                  {row.regulatory_ref && (
                                    <span className="text-xs text-slate-600 flex items-center gap-1">
                                      <Info className="h-3 w-3" />
                                      {row.regulatory_ref}
                                    </span>
                                  )}
                                </div>
                                {row.sub_limit_notes && (
                                  <p className="text-xs text-orange-400/70 mt-1 italic">{row.sub_limit_notes}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {Object.keys(groupedFiltered).length === 0 && (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No coverage items match your filter.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── UNDERWRITING ASSESSMENT ─────────────────────────────────────────── */}
      {activeSection === 'analyze' && (
        <div className="space-y-4">
          {/* Parsed slip banner */}
          {parsedSlip && (
            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-semibold text-cyan-400">Slip Parsed — {parsedSlip.coverages?.length || 0} coverage items extracted</span>
                <span className="text-xs text-slate-500">(Confidence: {parsedSlip.confidence || 0}%)</span>
              </div>
              {parsedSlip.coverages?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {parsedSlip.coverages.map((c: any, i: number) => (
                    <span key={i} className="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs text-slate-300">
                      {c.head}
                    </span>
                  ))}
                </div>
              )}
              {parsedSlip.extractionNotes && (
                <p className="text-xs text-slate-500 mt-2 italic">{parsedSlip.extractionNotes}</p>
              )}
            </div>
          )}

          {/* Run button if no data yet */}
          {!uwData && !uwLoading && (
            <div className="bg-white/[0.03] rounded-2xl border border-dashed border-white/[0.1] p-10 text-center">
              <Zap className="h-10 w-10 text-violet-400/50 mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Run Underwriting Analysis</p>
              <p className="text-sm text-slate-500 mb-4">The AI will analyse member profile, claims experience, requested coverages against the {selectedProduct} product matrix and return a full underwriting decision.</p>
              <Button onClick={runUnderwriting}
                className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 border-0 rounded-xl gap-2">
                <Zap className="h-4 w-4" /> Run Underwriting Pipeline
              </Button>
            </div>
          )}

          {uwLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
              <p className="text-slate-400 text-sm">iSHA-UW is analysing member profile, claims experience, and coverage requirements...</p>
            </div>
          )}

          {uwData && !uwLoading && (
            <div className="space-y-4">
              {/* Decision card */}
              <div className={`p-5 rounded-2xl border ${decisionColor(uwData.decision)}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-wider opacity-60 mb-1">Underwriting Decision</p>
                    <p className="text-xl font-bold">{uwData.decision}</p>
                    <p className="text-xs opacity-60 mt-1">Product: {uwData.productName} · Generated {new Date(uwData.generatedAt).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className={`text-3xl font-bold ${riskScoreColor(uwData.riskScore)}`}>{uwData.riskScore}</p>
                      <p className="text-xs opacity-60">/100 Risk Score</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold">{uwData.loadingPct}%</p>
                      <p className="text-xs opacity-60">Loading</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Lives', value: uwData.memberProfile?.totalLives?.toLocaleString() || '—', Icon: Users, color: 'text-violet-400' },
                  { label: 'Average Age', value: `${uwData.memberProfile?.avgAge || '—'} yrs`, Icon: Activity, color: 'text-blue-400' },
                  { label: 'Loss Ratio', value: `${uwData.claimsProfile?.lossRatio || 0}%`, Icon: TrendingUp, color: uwData.claimsProfile?.lossRatio > 80 ? 'text-red-400' : 'text-emerald-400' },
                  { label: 'Est. GWP', value: formatCurrency(uwData.memberProfile?.estimatedGWP || 0), Icon: IndianRupee, color: 'text-amber-400' },
                ].map(m => (
                  <div key={m.label} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
                    <m.Icon className={`h-4 w-4 ${m.color} mb-2`} />
                    <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                    <p className="text-xs text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Risk flags */}
              {uwData.riskFlags?.length > 0 && (
                <div className="bg-white/[0.02] rounded-xl border border-white/[0.05] p-4">
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" /> Risk Flags
                  </h4>
                  <div className="space-y-2">
                    {uwData.riskFlags.map((f: any, i: number) => (
                      <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg ${
                        f.severity === 'HIGH' ? 'bg-red-500/8 border border-red-500/15' :
                        f.severity === 'MEDIUM' ? 'bg-amber-500/8 border border-amber-500/15' :
                        'bg-white/[0.03] border border-white/[0.06]'
                      }`}>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          f.severity === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                          f.severity === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>{f.severity}</span>
                        <div>
                          <span className="text-xs font-semibold text-slate-300">{f.flag?.replace(/_/g, ' ')}</span>
                          <p className="text-xs text-slate-500">{f.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coverage gap analysis */}
              {uwData.gapAnalysis?.length > 0 && (
                <div className="bg-white/[0.02] rounded-xl border border-white/[0.05] overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/[0.05]">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-violet-400" />
                      Coverage Gap Analysis — Requested vs {selectedProduct} Product Matrix
                    </h4>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {uwData.gapAnalysis.map((g: any, i: number) => {
                      const gCfg = GAP_CONFIG[g.gap] || { label: g.gap, color: 'text-slate-400', bg: 'bg-white/[0.03]' };
                      return (
                        <div key={i} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-white">{g.requested}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${gCfg.bg} ${gCfg.color} border border-current/20`}>
                                  {gCfg.label}
                                </span>
                                {g.isOptional && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                    ADD-ON AVAILABLE
                                  </span>
                                )}
                              </div>
                              {g.matrixItem && g.matrixItem !== g.requested && (
                                <p className="text-xs text-slate-600 mt-0.5">Maps to: {g.matrixItem}</p>
                              )}
                              {g.recommendation && (
                                <p className="text-xs text-slate-500 mt-1">{g.recommendation}</p>
                              )}
                            </div>
                            <div className="flex gap-3 text-xs text-slate-600 shrink-0">
                              {g.limitValue && <span className="text-slate-400">{g.limitValue}</span>}
                              {g.waitingPeriod && <span className="text-amber-600">{g.waitingPeriod}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Conditions */}
              {uwData.conditions?.length > 0 && (
                <div className="bg-white/[0.02] rounded-xl border border-amber-500/15 p-4">
                  <h4 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                    <Lock className="h-4 w-4" /> Underwriting Conditions
                  </h4>
                  <ol className="space-y-2">
                    {uwData.conditions.map((c: string, i: number) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-300">
                        <span className="text-amber-500/60 font-bold shrink-0">{i + 1}.</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* AI narrative */}
              {uwData.aiNarrative && (
                <div className="bg-white/[0.02] rounded-xl border border-white/[0.05] p-5">
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-violet-400" /> iSHA-UW Underwriting Narrative
                  </h4>
                  <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {uwData.aiNarrative}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 flex-wrap">
                <Button onClick={runUnderwriting} variant="outline"
                  className="border-white/[0.1] text-slate-300 hover:bg-white/[0.05] rounded-xl h-9 gap-2 text-sm">
                  <RefreshCw className="h-3.5 w-3.5" /> Re-run Analysis
                </Button>
                <Button onClick={generateTerms} disabled={termsLoading}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-0 rounded-xl h-9 gap-2 text-sm shadow-lg shadow-emerald-600/20">
                  {termsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  Generate UW Terms Letter
                </Button>
              </div>
            </div>
          )}

          {/* Saved assessments for other products */}
          {savedAssessments.filter(a => a.product_code !== selectedProduct).length > 0 && (
            <div className="bg-white/[0.02] rounded-xl border border-white/[0.05] p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Other Product Assessments</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {savedAssessments.filter(a => a.product_code !== selectedProduct).map((a: any) => (
                  <button key={a.id} onClick={() => { setSelectedProduct(a.product_code); setUwData(null); }}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] text-left transition-all">
                    <div>
                      <p className="text-sm font-medium text-white">{a.product_code}</p>
                      <p className="text-xs text-slate-500">{a.decision}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${riskScoreColor(a.risk_score)}`}>{a.risk_score}/100</p>
                      <p className="text-xs text-slate-600">{a.loading_pct}% load</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── iSHA-UW CHAT ────────────────────────────────────────────────────── */}
      {activeSection === 'chat' && (
        <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] flex flex-col" style={{ height: '600px' }}>
          {/* Chat header */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">iSHA-UW</p>
              <p className="text-xs text-slate-500">Intelligent Specialized Health Actuarial — Underwriting AI · {selectedProduct}</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {chatHistory.length === 0 && (
              <div className="text-center py-8">
                <Zap className="h-8 w-8 text-violet-400/40 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Ask iSHA-UW anything about underwriting this RFQ</p>
                <div className="grid grid-cols-2 gap-2 mt-4 max-w-md mx-auto">
                  {[
                    'What loading should I apply for this risk?',
                    'Explain the PED waiting period rules',
                    'Is maternity cover standard under GMC?',
                    'What are the IRDAI room rent guidelines?',
                  ].map(q => (
                    <button key={q} onClick={() => { setChatInput(q); }}
                      className="text-left px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatHistory.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                {m.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-lg bg-violet-600/20 border border-violet-600/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="h-3.5 w-3.5 text-violet-400" />
                  </div>
                )}
                <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-violet-600/20 border border-violet-600/25 text-white rounded-br-sm'
                    : 'bg-white/[0.04] border border-white/[0.08] text-slate-200 rounded-bl-sm'
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-3">
                <div className="h-7 w-7 rounded-lg bg-violet-600/20 border border-violet-600/30 flex items-center justify-center shrink-0">
                  <Loader2 className="h-3.5 w-3.5 text-violet-400 animate-spin" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-slate-400 text-sm rounded-bl-sm">
                  Analysing...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/[0.06]">
            <div className="flex gap-3">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }}}
                placeholder="Ask iSHA-UW about underwriting, coverage, loading, IRDAI rules..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
              />
              <Button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                className="bg-violet-600 hover:bg-violet-500 border-0 rounded-xl h-10 w-10 p-0 flex items-center justify-center">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── UNDERWRITING TERMS LETTER ────────────────────────────────────────── */}
      {activeSection === 'terms' && (
        <div className="space-y-4">
          {!terms && !termsLoading && (
            <div className="bg-white/[0.03] rounded-2xl border border-dashed border-white/[0.1] p-10 text-center">
              <FileText className="h-10 w-10 text-emerald-400/50 mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Generate Underwriting Terms Letter</p>
              <p className="text-sm text-slate-500 mb-4">Creates a formal underwriting terms letter with coverage offered, conditions, exclusions and validity period.</p>
              {!savedForProduct && (
                <p className="text-xs text-amber-400 mb-4">⚠ Run underwriting analysis for {selectedProduct} first before generating terms.</p>
              )}
              <Button onClick={generateTerms} disabled={!savedForProduct}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-0 rounded-xl gap-2">
                <FileText className="h-4 w-4" /> Generate Terms Letter
              </Button>
            </div>
          )}

          {termsLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
              <p className="text-slate-400 text-sm">Generating formal underwriting terms letter...</p>
            </div>
          )}

          {terms && !termsLoading && (
            <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-white">Underwriting Terms Letter — {selectedProduct}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const blob = new Blob([terms], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `UW-Terms-${rfq?.insured_name || rfqId}-${selectedProduct}.txt`;
                      a.click();
                    }}
                    variant="outline"
                    className="border-white/[0.1] text-slate-300 hover:bg-white/[0.05] rounded-xl h-8 text-xs gap-1.5">
                    <Download className="h-3 w-3" /> Download
                  </Button>
                  <Button onClick={generateTerms} variant="outline"
                    className="border-white/[0.1] text-slate-300 hover:bg-white/[0.05] rounded-xl h-8 text-xs gap-1.5">
                    <RefreshCw className="h-3 w-3" /> Regenerate
                  </Button>
                </div>
              </div>
              <div className="p-6">
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{terms}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RFQUnderwritingTab;
