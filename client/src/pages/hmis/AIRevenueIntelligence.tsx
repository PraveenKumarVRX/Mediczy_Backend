import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, DollarSign, AlertTriangle, TrendingUp, TrendingDown, Zap, ShieldAlert, ClipboardList } from 'lucide-react';
import api from '@/services/api';

type Tab = 'gaps' | 'leakage' | 'orders' | 'denial';

interface BillingGap { admission_id: number; patient_name: string; mrn: string; gap_type: string; potential_amount: number; details: string; }
interface GapData { summary: { gap_count: number; estimated_leakage: number; gap_types: Record<string, number> }; gaps: BillingGap[]; }
interface LeakageData { collection_rate_pct: number; leakage_rate_pct: number; estimated_leakage_amount: number; health_score: string; total_billed: number; total_collected: number; benchmarks: { industry_collection_rate: number; your_collection_rate: number; gap: number }; actions: string[]; }
interface OrderItem { category: string; items: string[]; }
interface OrderResult { matched_protocol: string; order_set: OrderItem[]; safety_flags: any[]; ai_note: string; patient_context: any; }
interface DenialClaim { auth_id: number; patient_name: string; insurer: string; diagnosis_code: string; requested_amount: number; denial_risk_score: number; denial_risk_level: string; risk_flags: string[]; recommendation: string; }
interface DenialData { summary: { total_pending: number; high_risk: number; medium_risk: number; low_risk: number }; claims: DenialClaim[]; }

const HEALTH_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  excellent: { color: 'text-emerald-400', bg: 'bg-emerald-900/40 border-emerald-500/40', label: 'Excellent' },
  good:      { color: 'text-green-400',   bg: 'bg-green-900/40 border-green-500/40',   label: 'Good' },
  'needs-improvement': { color: 'text-amber-400', bg: 'bg-amber-900/40 border-amber-500/40', label: 'Needs Improvement' },
  critical:  { color: 'text-red-400',     bg: 'bg-red-900/40 border-red-500/40',       label: 'Critical' },
};

const RISK_COLOR: Record<string, string> = {
  high: 'text-red-400 bg-red-900/30',
  medium: 'text-amber-400 bg-amber-900/30',
  low: 'text-emerald-400 bg-emerald-900/30',
};

const CATG_ICON: Record<string, React.ReactNode> = {
  investigations: <ClipboardList className="h-3.5 w-3.5 text-blue-400" />,
  medications: <Zap className="h-3.5 w-3.5 text-purple-400" />,
  monitoring: <TrendingUp className="h-3.5 w-3.5 text-green-400" />,
  consults: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
};

function fmt(n: number) {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}

export default function AIRevenueIntelligence() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('gaps');
  const [gaps, setGaps] = useState<GapData | null>(null);
  const [leakage, setLeakage] = useState<LeakageData | null>(null);
  const [orders, setOrders] = useState<OrderResult | null>(null);
  const [denial, setDenial] = useState<DenialData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Order set form
  const [orderForm, setOrderForm] = useState({ diagnosisCode: '', admissionType: 'general' });
  const [orderLoading, setOrderLoading] = useState(false);

  const loadTab = useCallback(async (tab: Tab) => {
    setLoading(true);
    try {
      if (tab === 'gaps') {
        const r = await api.get('/api/v1/ai-revenue/billing-gaps');
        setGaps(r.data?.data ?? null);
      } else if (tab === 'leakage') {
        const r = await api.get('/api/v1/ai-revenue/leakage-score');
        setLeakage(r.data?.data ?? null);
      } else if (tab === 'denial') {
        const r = await api.get('/api/v1/ai-revenue/denial-risk');
        setDenial(r.data?.data ?? null);
      }
      setLastUpdated(new Date());
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTab(activeTab); }, [activeTab, loadTab]);

  const fetchOrders = async () => {
    if (!orderForm.diagnosisCode.trim()) return;
    setOrderLoading(true);
    setOrders(null);
    try {
      const r = await api.post('/api/v1/ai-revenue/smart-orders', orderForm);
      setOrders(r.data?.data ?? null);
    } finally {
      setOrderLoading(false);
    }
  };

  const tabs = [
    { id: 'gaps' as Tab, label: 'Billing Gaps', icon: <DollarSign className="h-3.5 w-3.5" /> },
    { id: 'leakage' as Tab, label: 'Revenue Health', icon: <TrendingDown className="h-3.5 w-3.5" /> },
    { id: 'orders' as Tab, label: 'Smart Orders', icon: <Zap className="h-3.5 w-3.5" /> },
    { id: 'denial' as Tab, label: 'Denial Risk', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  ];

  const hc = leakage ? HEALTH_CONFIG[leakage.health_score] ?? HEALTH_CONFIG.good : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-purple-400" />
                <h1 className="text-lg font-bold">AI Revenue Intelligence</h1>
              </div>
              <p className="text-xs text-purple-300">Billing gaps, smart orders & denial prevention</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && <span className="text-xs text-slate-400">{lastUpdated.toLocaleTimeString()}</span>}
            <Button variant="ghost" size="icon" onClick={() => loadTab(activeTab)} disabled={loading} className="text-white hover:bg-white/10">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === t.id ? 'bg-purple-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-6 space-y-3">
        {/* ── BILLING GAPS ── */}
        {activeTab === 'gaps' && gaps && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-red-300">{gaps.summary.gap_count}</p>
                <p className="text-xs text-slate-400">Revenue Gaps Found</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-300">{fmt(gaps.summary.estimated_leakage)}</p>
                <p className="text-xs text-slate-400">Estimated Leakage</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {Object.entries(gaps.summary.gap_types).map(([type, count]) => (
                <div key={type} className="bg-white/5 rounded-lg p-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400 capitalize">{type.replace('_', ' ')}</span>
                  <span className="text-sm font-bold">{count as number}</span>
                </div>
              ))}
            </div>

            {gaps.gaps.length === 0 ? (
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4 text-center">
                <p className="text-emerald-300">No billing gaps detected in the past 30 days</p>
              </div>
            ) : (
              <div className="space-y-2">
                {gaps.gaps.map((g, i) => (
                  <Card key={i} className="bg-white/10 border-white/20 text-white">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium">{g.patient_name}</p>
                          <p className="text-xs text-slate-400">MRN: {g.mrn}</p>
                        </div>
                        <span className="text-sm font-bold text-amber-300">{fmt(g.potential_amount)}</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{g.gap_type}</p>
                      {g.details && <p className="text-xs text-slate-500 mt-0.5">{g.details}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── REVENUE HEALTH ── */}
        {activeTab === 'leakage' && leakage && hc && (
          <>
            <Card className={`border ${hc.bg} text-white`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-300">Revenue Health Score</p>
                  <span className={`text-lg font-bold ${hc.color}`}>{hc.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-bold">{leakage.collection_rate_pct}%</p>
                    <p className="text-xs text-slate-400">Collection Rate</p>
                  </div>
                  <div>
                    <p className={`text-3xl font-bold ${hc.color}`}>{leakage.leakage_rate_pct}%</p>
                    <p className="text-xs text-slate-400">Leakage Rate</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{fmt(leakage.total_billed)}</p>
                    <p className="text-xs text-slate-400">Total Billed (30d)</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-red-300">{fmt(leakage.estimated_leakage_amount)}</p>
                    <p className="text-xs text-slate-400">Estimated Leakage</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20 text-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">vs Industry Benchmark</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Your rate</span>
                    <span className="font-bold">{leakage.benchmarks.your_collection_rate}%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Industry avg</span>
                    <span className="font-bold">{leakage.benchmarks.industry_collection_rate}%</span>
                  </div>
                  <div className={`flex items-center justify-between text-sm ${leakage.benchmarks.gap > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                    <span>Gap vs industry</span>
                    <span className="font-bold">{leakage.benchmarks.gap > 0 ? '-' : '+'}{Math.abs(leakage.benchmarks.gap)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {leakage.actions.map((a, i) => (
              <div key={i} className="bg-blue-500/20 border border-blue-500/30 rounded-lg px-3 py-2 text-xs text-blue-200 flex items-start gap-2">
                <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {a}
              </div>
            ))}
          </>
        )}

        {/* ── SMART ORDER SETS ── */}
        {activeTab === 'orders' && (
          <>
            <Card className="bg-white/10 border-white/20 text-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Zap className="h-4 w-4 text-purple-400" />AI Order Set Generator</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Primary Diagnosis (ICD-10)</label>
                  <input
                    type="text"
                    placeholder="e.g. I21, K80, J18, N20, G40, E11"
                    value={orderForm.diagnosisCode}
                    onChange={e => setOrderForm(f => ({ ...f, diagnosisCode: e.target.value.toUpperCase() }))}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Supported: I21 (ACS), I10 (HTN crisis), K80 (cholecystitis), J18 (pneumonia), N20 (renal colic), G40 (seizure), E11 (diabetes)</p>
                </div>
                <Button onClick={fetchOrders} disabled={orderLoading || !orderForm.diagnosisCode.trim()} className="w-full bg-purple-600 hover:bg-purple-700">
                  {orderLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                  Generate Smart Order Set
                </Button>
              </CardContent>
            </Card>

            {orders && (
              <>
                {orders.safety_flags?.length > 0 && (
                  <div className="bg-red-900/40 border border-red-500/40 rounded-xl p-3 space-y-1">
                    {orders.safety_flags.map((f: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-red-300">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{f.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {orders.matched_protocol ? (
                  <>
                    <div className="bg-purple-900/40 border border-purple-500/40 rounded-xl px-3 py-2">
                      <p className="text-xs text-purple-300 font-medium">{orders.matched_protocol}</p>
                    </div>
                    {orders.order_set.map((section, i) => (
                      <Card key={i} className="bg-white/10 border-white/20 text-white">
                        <CardHeader className="pb-1 pt-3 px-3">
                          <CardTitle className="text-xs flex items-center gap-1.5 capitalize">
                            {CATG_ICON[section.category] ?? <Zap className="h-3.5 w-3.5" />}
                            {section.category}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3">
                          <ul className="space-y-1">
                            {section.items.map((item, j) => (
                              <li key={j} className="text-xs text-slate-300 flex items-start gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ))}
                  </>
                ) : (
                  <div className="bg-slate-800/50 border border-slate-600 rounded-xl p-4 text-center">
                    <p className="text-slate-400 text-sm">{orders.ai_note}</p>
                  </div>
                )}

                <p className="text-xs text-slate-500 italic px-1">{orders.ai_note}</p>
              </>
            )}
          </>
        )}

        {/* ── DENIAL RISK ── */}
        {activeTab === 'denial' && denial && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'High Risk', value: denial.summary.high_risk, color: 'text-red-300' },
                { label: 'Medium', value: denial.summary.medium_risk, color: 'text-amber-300' },
                { label: 'Low Risk', value: denial.summary.low_risk, color: 'text-emerald-300' },
              ].map((s, i) => (
                <div key={i} className="bg-white/10 rounded-xl p-2 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>

            {denial.claims.length === 0 ? (
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4 text-center">
                <p className="text-emerald-300">No pending pre-auth claims to score</p>
              </div>
            ) : (
              <div className="space-y-2">
                {denial.claims.slice(0, 15).map(claim => (
                  <Card key={claim.auth_id} className="bg-white/10 border-white/20 text-white">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="text-sm font-medium">{claim.patient_name}</p>
                          <p className="text-xs text-slate-400">{claim.insurer} · {claim.diagnosis_code}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLOR[claim.denial_risk_level]}`}>{claim.denial_risk_level} ({claim.denial_risk_score})</span>
                          <p className="text-xs text-slate-400 mt-0.5">{fmt(claim.requested_amount)}</p>
                        </div>
                      </div>
                      {claim.risk_flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {claim.risk_flags.map((f, i) => (
                            <span key={i} className="text-xs bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded">{f.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-300 italic">{claim.recommendation}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
