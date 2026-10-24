import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Brain, Zap, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ChevronRight, RefreshCw, Flame, Snowflake, ThumbsUp, Target,
  BarChart3, Mail, Sparkles, ArrowUpRight, Clock, Users,
} from 'lucide-react';
import api from '@/utils/api';
import { CRMLayout } from './CRMModulePages';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoredLead {
  id: number;
  name: string;
  company?: string;
  source?: string;
  status?: string;
  score: number;
  tier: 'Hot' | 'Warm' | 'Cold' | 'Dead';
  nextAction?: string | null;
  email?: string;
}

interface PredictedDeal {
  id: number;
  title: string;
  value: number;
  currency?: string;
  stage: string;
  winProbability: number;
  healthStatus: 'On Track' | 'At Risk' | 'Stalled' | 'Critical';
}

interface ForecastData {
  weighted: number;
  optimistic: number;
  pessimistic: number;
  monthly: { month: string; amount: number }[];
  dealCount: number;
}

interface PipelineHealth {
  healthScore: number;
  status: string;
  observations: string[];
  alerts: string[];
  opportunities: string[];
}

interface HubData {
  leads: ScoredLead[];
  deals: PredictedDeal[];
  campaigns: { id: number; name: string; subject?: string; status: string }[];
  forecast: ForecastData;
  pipelineHealth: PipelineHealth;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const authHeaders = () => {
  const t = localStorage.getItem('crmToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const panel = 'rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5';
const chip = (color: string) =>
  `text-xs font-semibold px-2 py-0.5 rounded-full ${color}`;

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    Hot:  'bg-red-500/20 text-red-300',
    Warm: 'bg-amber-500/20 text-amber-300',
    Cold: 'bg-sky-500/20 text-sky-300',
    Dead: 'bg-slate-500/20 text-slate-400',
  };
  const icon: Record<string, JSX.Element> = {
    Hot:  <Flame className="inline h-3 w-3 mr-0.5" />,
    Warm: <Zap className="inline h-3 w-3 mr-0.5" />,
    Cold: <Snowflake className="inline h-3 w-3 mr-0.5" />,
    Dead: <span className="inline-block w-2 h-2 rounded-full bg-slate-500 mr-1" />,
  };
  return (
    <span className={chip(map[tier] ?? map.Cold)}>
      {icon[tier]}{tier}
    </span>
  );
}

function HealthBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'On Track': 'bg-emerald-500/20 text-emerald-300',
    'At Risk':  'bg-amber-500/20 text-amber-300',
    Stalled:    'bg-red-500/20 text-red-300',
    Critical:   'bg-rose-600/20 text-rose-300',
  };
  return <span className={chip(map[status] ?? 'bg-slate-500/20 text-slate-400')}>{status}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color =
    pct >= 70 ? 'bg-red-400' :
    pct >= 45 ? 'bg-amber-400' :
    pct >= 20 ? 'bg-sky-400' :
               'bg-slate-600';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-7 text-right">{pct}</span>
    </div>
  );
}

function WinBar({ pct }: { pct: number }) {
  const color =
    pct >= 60 ? 'bg-emerald-400' :
    pct >= 35 ? 'bg-amber-400' :
               'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

function fmt(n: number, currency = 'INR') {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000)      return `₹${(n / 1_000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}K`;
  return `₹${n}`;
}

// ─── Sub-sections ─────────────────────────────────────────────────────────────

function PipelineHealthCard({ health }: { health: PipelineHealth }) {
  const scoreColor =
    health.healthScore >= 70 ? 'text-emerald-400' :
    health.healthScore >= 50 ? 'text-amber-400' :
                               'text-red-400';
  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" /> Pipeline Health
        </h3>
        <div className={`text-2xl font-bold ${scoreColor}`}>{health.healthScore}<span className="text-sm text-slate-500">/100</span></div>
      </div>
      <p className="text-xs text-slate-400 mb-3">{health.status}</p>

      {health.observations.map((o, i) => (
        <div key={i} className="flex gap-2 text-xs text-slate-300 mb-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />{o}
        </div>
      ))}
      {health.alerts.map((a, i) => (
        <div key={i} className="flex gap-2 text-xs text-amber-300 mb-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{a}
        </div>
      ))}
      {health.opportunities.map((o, i) => (
        <div key={i} className="flex gap-2 text-xs text-emerald-300 mb-1.5">
          <TrendingUp className="h-3.5 w-3.5 shrink-0 mt-0.5" />{o}
        </div>
      ))}
    </div>
  );
}

function ForecastCard({ forecast }: { forecast: ForecastData }) {
  return (
    <div className={panel}>
      <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-violet-400" /> Revenue Forecast
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Weighted', value: forecast.weighted, color: 'text-violet-300' },
          { label: 'Optimistic', value: forecast.optimistic, color: 'text-emerald-300' },
          { label: 'Pessimistic', value: forecast.pessimistic, color: 'text-amber-300' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3">
            <div className={`text-lg font-bold ${color}`}>{fmt(value)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      {forecast.monthly.length > 0 && (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={forecast.monthly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: '#64748b', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
              formatter={(v: number) => [fmt(v), 'Expected']}
            />
            <Area type="monotone" dataKey="amount" stroke="#8b5cf6" fill="url(#fcGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function LeadScoreTable({
  leads, onScore, scoring,
}: { leads: ScoredLead[]; onScore: (id: number) => void; scoring: number | null }) {
  const navigate = useNavigate();
  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" /> Lead Intelligence
          <span className="text-xs text-slate-500 font-normal">({leads.length} active)</span>
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] text-slate-500">
              <th className="pb-2 text-left font-medium">Lead</th>
              <th className="pb-2 text-left font-medium">Tier</th>
              <th className="pb-2 text-left font-medium">Score</th>
              <th className="pb-2 text-left font-medium">Status</th>
              <th className="pb-2 text-left font-medium">Next Action</th>
              <th className="pb-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {leads.map(l => (
              <tr key={l.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="py-2.5 pr-3">
                  <div className="text-white font-medium truncate max-w-[160px]">{l.name}</div>
                  <div className="text-slate-500 truncate max-w-[160px]">{l.company ?? '—'}</div>
                </td>
                <td className="py-2.5 pr-3"><TierBadge tier={l.tier} /></td>
                <td className="py-2.5 pr-3"><ScoreBar score={l.score} /></td>
                <td className="py-2.5 pr-3 text-slate-400 capitalize">{l.status}</td>
                <td className="py-2.5 pr-3">
                  {l.nextAction ? (
                    <span className="text-violet-300">{l.nextAction}</span>
                  ) : (
                    <button
                      onClick={() => onScore(l.id)}
                      disabled={scoring === l.id}
                      className="text-slate-500 hover:text-violet-400 transition-colors"
                    >
                      {scoring === l.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3" /> Get next action</>}
                    </button>
                  )}
                </td>
                <td className="py-2.5">
                  <button onClick={() => navigate(`/crm/leads/${l.id}`)} className="text-slate-600 hover:text-slate-300">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DealHealthTable({ deals }: { deals: PredictedDeal[] }) {
  const navigate = useNavigate();
  const STAGE_COLORS: Record<string, string> = {
    lead: '#6366f1', qualified: '#8b5cf6', proposal: '#f59e0b',
    negotiation: '#22c55e', 'closed won': '#10b981',
  };
  return (
    <div className={panel}>
      <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-emerald-400" /> Deal Health Board
        <span className="text-xs text-slate-500 font-normal">({deals.length} open)</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] text-slate-500">
              <th className="pb-2 text-left font-medium">Deal</th>
              <th className="pb-2 text-left font-medium">Value</th>
              <th className="pb-2 text-left font-medium">Stage</th>
              <th className="pb-2 text-left font-medium">Win %</th>
              <th className="pb-2 text-left font-medium">Health</th>
              <th className="pb-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {deals.map(d => (
              <tr key={d.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="py-2.5 pr-3">
                  <div className="text-white font-medium truncate max-w-[160px]">{d.title}</div>
                </td>
                <td className="py-2.5 pr-3 text-emerald-300 font-medium">{fmt(d.value)}</td>
                <td className="py-2.5 pr-3">
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${STAGE_COLORS[d.stage?.toLowerCase()] ?? '#6366f1'}22`, color: STAGE_COLORS[d.stage?.toLowerCase()] ?? '#6366f1' }}>
                    {d.stage}
                  </span>
                </td>
                <td className="py-2.5 pr-3"><WinBar pct={d.winProbability} /></td>
                <td className="py-2.5 pr-3"><HealthBadge status={d.healthStatus} /></td>
                <td className="py-2.5">
                  <button onClick={() => navigate(`/crm/deals/${d.id}`)} className="text-slate-600 hover:text-slate-300">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignOptimizerPanel({ campaigns }: { campaigns: HubData['campaigns'] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const optimize = async (id: number) => {
    setSelected(id);
    setLoading(true);
    try {
      const { data } = await api.post(`/crm/ai/campaigns/${id}/optimize`, {}, { headers: authHeaders() });
      setResult(data.data);
    } catch { setResult(null); }
    setLoading(false);
  };

  return (
    <div className={panel}>
      <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
        <Mail className="h-4 w-4 text-sky-400" /> Campaign Optimizer
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* campaign list */}
        <div className="space-y-2">
          {campaigns.map(c => (
            <button
              key={c.id}
              onClick={() => optimize(c.id)}
              className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                selected === c.id
                  ? 'border-violet-500/40 bg-violet-500/10'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
              }`}
            >
              <div className="text-sm text-white font-medium truncate">{c.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{c.subject ?? '—'}</div>
              <span className={`text-xs mt-1 inline-block ${c.status === 'sent' ? 'text-emerald-400' : c.status === 'draft' ? 'text-amber-400' : 'text-slate-500'}`}>
                {c.status}
              </span>
            </button>
          ))}
          {campaigns.length === 0 && (
            <p className="text-xs text-slate-500 py-4 text-center">No campaigns yet.</p>
          )}
        </div>

        {/* optimization result */}
        <div>
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
              <Brain className="h-8 w-8 text-violet-400 animate-pulse" />
              <span className="text-xs">AI analysing campaign…</span>
            </div>
          )}
          {!loading && result && (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wide">Suggested subject lines</div>
                {result.subjectLines?.map((s: string, i: number) => (
                  <div key={i} className="text-sm text-white rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 mb-1.5">{s}</div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3">
                  <div className="text-xs text-slate-500">Best send</div>
                  <div className="text-sm text-white font-medium mt-0.5">{result.bestSendDay} {result.bestSendHour}:00</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3">
                  <div className="text-xs text-slate-500">Predicted open</div>
                  <div className="text-sm text-emerald-300 font-medium mt-0.5">{result.predictedOpenRate}%</div>
                </div>
              </div>
              {result.contentTips?.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wide">Content tips</div>
                  {result.contentTips.map((t: string, i: number) => (
                    <div key={i} className="text-xs text-slate-300 mb-1 flex gap-2">
                      <Sparkles className="h-3 w-3 text-violet-400 shrink-0 mt-0.5" />{t}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!loading && !result && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
              <Sparkles className="h-8 w-8" />
              <span className="text-xs">Select a campaign to optimise</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubjectLineGenerator() {
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('hospital HR and procurement managers');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!topic) return;
    setLoading(true);
    try {
      const { data } = await api.post('/crm/ai/campaigns/subject-lines', { topic, audience, count: 5 }, { headers: authHeaders() });
      setResult(data.data);
    } catch { setResult(null); }
    setLoading(false);
  };

  const inputCls = 'w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40';

  return (
    <div className={panel}>
      <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-pink-400" /> Subject Line Generator
      </h3>
      <div className="space-y-3 mb-4">
        <input className={inputCls} placeholder="Campaign topic — e.g. 'Group health insurance renewal'" value={topic} onChange={e => setTopic(e.target.value)} />
        <input className={inputCls} placeholder="Audience" value={audience} onChange={e => setAudience(e.target.value)} />
        <button
          onClick={generate}
          disabled={!topic || loading}
          className="h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium flex items-center gap-2"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          Generate
        </button>
      </div>
      {result && (
        <div className="space-y-1.5">
          {result.subjectLines?.map((s: string, i: number) => (
            <div key={i} className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-sm text-white flex items-center justify-between gap-2">
              <span>{s}</span>
              <button onClick={() => navigator.clipboard.writeText(s)} className="text-slate-600 hover:text-slate-300 shrink-0">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CRMAIInsightsPage() {
  const [hub, setHub] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'leads' | 'deals' | 'campaigns' | 'forecast'>('leads');

  const loadHub = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/ai/hub', { headers: authHeaders() });
      setHub(data.data);
      setLastRefresh(new Date());
    } catch { /* silently degrade */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadHub(); }, [loadHub]);

  const rescore = async (leadId: number) => {
    setScoring(leadId);
    try {
      const { data } = await api.post(`/crm/ai/leads/${leadId}/score`, {}, { headers: authHeaders() });
      setHub(prev => prev ? ({
        ...prev,
        leads: prev.leads.map(l => l.id === leadId
          ? { ...l, score: data.data.score, tier: data.data.tier, nextAction: data.data.nextAction?.type }
          : l),
      }) : prev);
    } catch { /* noop */ }
    setScoring(null);
  };

  const TABS = [
    { key: 'leads',     label: 'Lead Scores',    icon: <Users className="h-4 w-4" /> },
    { key: 'deals',     label: 'Deal Health',    icon: <Target className="h-4 w-4" /> },
    { key: 'campaigns', label: 'Campaigns',      icon: <Mail className="h-4 w-4" /> },
    { key: 'forecast',  label: 'Forecast',       icon: <TrendingUp className="h-4 w-4" /> },
  ] as const;

  return (
    <CRMLayout title="AI Insights">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-400" /> Sales & Marketing Intelligence
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            AI-powered lead scoring, deal prediction, campaign optimisation, and revenue forecast.
            Updated {lastRefresh.toLocaleTimeString()}.
          </p>
        </div>
        <button
          onClick={loadHub}
          disabled={loading}
          className="h-9 px-4 rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white text-sm flex items-center gap-2 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !hub ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
          <Brain className="h-12 w-12 text-violet-400 animate-pulse" />
          <p className="text-sm">AI is analysing your pipeline…</p>
        </div>
      ) : hub ? (
        <div className="space-y-5">
          {/* ── Summary KPIs ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: 'Hot Leads',
                value: hub.leads.filter(l => l.tier === 'Hot').length,
                icon: <Flame className="h-5 w-5 text-red-400" />,
                color: 'text-red-300',
              },
              {
                label: 'Pipeline',
                value: fmt(hub.deals.reduce((s, d) => s + (Number(d.value) || 0), 0)),
                icon: <BarChart3 className="h-5 w-5 text-violet-400" />,
                color: 'text-violet-300',
              },
              {
                label: 'Weighted Forecast',
                value: fmt(hub.forecast.weighted),
                icon: <TrendingUp className="h-5 w-5 text-emerald-400" />,
                color: 'text-emerald-300',
              },
              {
                label: 'Health Score',
                value: `${hub.pipelineHealth.healthScore}/100`,
                icon: <ThumbsUp className="h-5 w-5 text-sky-400" />,
                color: hub.pipelineHealth.healthScore >= 70 ? 'text-emerald-300' : hub.pipelineHealth.healthScore >= 50 ? 'text-amber-300' : 'text-red-300',
              },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-slate-500">{label}</span></div>
                <div className={`text-xl font-bold ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* ── Top row: health + forecast ────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <PipelineHealthCard health={hub.pipelineHealth} />
            <ForecastCard forecast={hub.forecast} />
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] w-fit">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === t.key
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {activeTab === 'leads' && (
            <LeadScoreTable leads={hub.leads} onScore={rescore} scoring={scoring} />
          )}
          {activeTab === 'deals' && (
            <DealHealthTable deals={hub.deals} />
          )}
          {activeTab === 'campaigns' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <CampaignOptimizerPanel campaigns={hub.campaigns} />
              <SubjectLineGenerator />
            </div>
          )}
          {activeTab === 'forecast' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ForecastCard forecast={hub.forecast} />
              <PipelineHealthCard health={hub.pipelineHealth} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-2 text-slate-500">
          <AlertTriangle className="h-8 w-8" />
          <p className="text-sm">Could not load insights. Check your connection.</p>
        </div>
      )}
    </CRMLayout>
  );
}
