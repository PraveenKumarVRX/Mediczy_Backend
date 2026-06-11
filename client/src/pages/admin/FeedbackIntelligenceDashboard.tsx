/**
 * Feedback Intelligence Dashboard
 * ================================
 * Overview of the self-healing AI feedback loop:
 *   - Platform health score (weighted average of all AI component scores)
 *   - Per-component quality grid (4 cards: Dr. iSHA, Triage, Drug, Health Risk)
 *   - Signal volume breakdown (patient / CDSS / ticket)
 *   - SLA summary + recent breaches
 *   - Recent S0 safety alerts
 *
 * Route: /admin/feedback-intelligence
 * Access: admin, medical_director
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Activity, AlertTriangle, Brain, CheckCircle2, Clock,
  RefreshCw, Shield, TrendingDown, TrendingUp, Minus,
  BarChart3, MessageSquare, Stethoscope, Zap, ArrowRight,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComponentScore {
  ai_component: string;
  score_7d: number | null;
  score_30d: number | null;
  signal_count_7d: number;
  trend: 'improving' | 'stable' | 'degrading';
  last_proposal_at: string | null;
  computed_at: string;
}

interface SlaSummary {
  total: number;
  breached: number;
  s0_open: number;
  s1_open: number;
  s2_open: number;
  s3_open: number;
}

interface BreachedTicket {
  ticket_id: string;
  severity: string;
  ai_component: string | null;
  evidence_quote: string;
  created_at: string;
  breach_type: string;
}

interface SignalVolume {
  source: string;
  total: string;
  last_24h: string;
  avg_delta: string;
}

interface DashboardData {
  platform_health_score: string | null;
  component_scores: ComponentScore[];
  sla_summary: SlaSummary;
  recent_breaches: BreachedTicket[];
  signal_volume: SignalVolume[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPONENT_LABELS: Record<string, string> = {
  medical_scribe_output:           'Dr. iSHA',
  emergency_triage_esi_v1:         'Emergency Triage',
  drug_interaction_checker_v1:     'Drug Checker',
  health_risk_scoring_v2_bayesian: 'Health Risk AI',
};

const COMPONENT_ICONS: Record<string, React.ReactNode> = {
  medical_scribe_output:           <Brain className="h-5 w-5" />,
  emergency_triage_esi_v1:         <Zap className="h-5 w-5" />,
  drug_interaction_checker_v1:     <Shield className="h-5 w-5" />,
  health_risk_scoring_v2_bayesian: <Activity className="h-5 w-5" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  S0: 'bg-red-100 text-red-800 border-red-300',
  S1: 'bg-orange-100 text-orange-800 border-orange-300',
  S2: 'bg-amber-100 text-amber-800 border-amber-300',
  S3: 'bg-blue-100 text-blue-800 border-blue-300',
};

const SOURCE_LABELS: Record<string, string> = {
  patient_feedback: 'Patient Ratings',
  cdss_feedback:    'Doctor Decisions',
  ticket:           'Complaint Tickets',
  post_resolution:  'Post-Resolution',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return 'text-slate-400';
  if (score >= 8) return 'text-green-600';
  if (score >= 6) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score: number | null): string {
  if (score === null) return 'border-slate-200';
  if (score >= 8) return 'border-green-200 bg-green-50';
  if (score >= 6) return 'border-amber-200 bg-amber-50';
  return 'border-red-200 bg-red-50';
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === 'degrading') return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-slate-400" />;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ComponentCard({ score }: { score: ComponentScore }) {
  const label = COMPONENT_LABELS[score.ai_component] || score.ai_component;
  const icon  = COMPONENT_ICONS[score.ai_component] || <Brain className="h-5 w-5" />;
  const s     = score.score_7d;
  const pct   = s !== null ? Math.round((s / 10) * 100) : null;

  return (
    <Link to={`/admin/feedback-intelligence/component/${score.ai_component}`}>
      <div className={`rounded-xl border-2 p-4 cursor-pointer hover:shadow-md transition-shadow ${scoreBg(s)}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-700">
            {icon}
            <span className="font-medium text-sm">{label}</span>
          </div>
          <TrendIcon trend={score.trend} />
        </div>

        {s !== null ? (
          <>
            <div className="flex items-end gap-1 mb-2">
              <span className={`text-3xl font-bold ${scoreColor(s)}`}>{s.toFixed(1)}</span>
              <span className="text-sm text-slate-400 mb-1">/10</span>
            </div>
            <div className="w-full bg-white rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all ${s >= 8 ? 'bg-green-500' : s >= 6 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-sm mb-2">No data yet</p>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{score.signal_count_7d} signals (7d)</span>
          {score.last_proposal_at && (
            <span className="text-amber-600">Proposal {timeAgo(score.last_proposal_at)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function SlaCard({ summary }: { summary: SlaSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(['S0','S1','S2','S3'] as const).map(s => {
        const count = summary[`${s.toLowerCase()}_open` as keyof SlaSummary] as number;
        return (
          <div key={s} className={`rounded-lg border px-3 py-2 ${SEVERITY_COLORS[s]}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{s}</span>
              <span className="text-lg font-bold">{count}</span>
            </div>
            <p className="text-xs opacity-80 mt-0.5">open tickets</p>
          </div>
        );
      })}
      {summary.breached > 0 && (
        <div className="col-span-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <span className="text-sm text-red-700 font-medium">
            {summary.breached} SLA breach{summary.breached !== 1 ? 'es' : ''} active
          </span>
          <Link to="/admin/feedback-intelligence/sla" className="ml-auto">
            <Button size="sm" variant="destructive" className="h-6 text-xs">View</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function SignalVolumeTable({ rows }: { rows: SignalVolume[] }) {
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.source} className="flex items-center justify-between py-2 border-b last:border-0">
          <div>
            <p className="text-sm font-medium text-slate-700">{SOURCE_LABELS[r.source] || r.source}</p>
            <p className="text-xs text-slate-400">{r.last_24h} in last 24h</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-800">{r.total}</p>
            <p className={`text-xs ${Number(r.avg_delta) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              avg Δ {Number(r.avg_delta) >= 0 ? '+' : ''}{Number(r.avg_delta).toFixed(2)}
            </p>
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">No signals in the last 7 days</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FeedbackIntelligenceDashboard() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast }             = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/feedback-intelligence/dashboard');
      setData(res.data);
    } catch (err: any) {
      toast({ title: 'Failed to load dashboard', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const score    = data?.platform_health_score ? Number(data.platform_health_score) : null;
  const allComps = Object.keys(COMPONENT_LABELS);
  // Merge known components with any that have data
  const compScores: ComponentScore[] = allComps.map(key => {
    const existing = data?.component_scores.find(c => c.ai_component === key);
    return existing ?? {
      ai_component: key,
      score_7d: null,
      score_30d: null,
      signal_count_7d: 0,
      trend: 'stable',
      last_proposal_at: null,
      computed_at: new Date().toISOString(),
    };
  });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              Feedback Intelligence
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Self-healing AI feedback loop — quality scores, SLA tracking, and governance proposals
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin/feedback-intelligence/sla">
              <Button variant="outline" size="sm">SLA Tracker</Button>
            </Link>
            <Link to="/admin/feedback-intelligence/prompts">
              <Button variant="outline" size="sm">Prompt Versions</Button>
            </Link>
            <Button size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Platform health score */}
        <Card className={`border-2 ${score !== null ? (score >= 8 ? 'border-green-300 bg-green-50' : score >= 6 ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50') : 'border-slate-200'}`}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium uppercase tracking-wide">Platform Health Score</p>
                <div className="flex items-end gap-2 mt-1">
                  <span className={`text-5xl font-bold ${scoreColor(score)}`}>
                    {score !== null ? score.toFixed(1) : '—'}
                  </span>
                  <span className="text-xl text-slate-400 mb-1">/10</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Weighted average across all AI components (last 7 days)</p>
              </div>
              <div className="text-right">
                {data?.sla_summary && (
                  <>
                    <p className="text-sm text-slate-500">Open tickets</p>
                    <p className="text-3xl font-bold text-slate-700">{data.sla_summary.total}</p>
                    {data.sla_summary.breached > 0 && (
                      <Badge variant="destructive" className="mt-1">
                        {data.sla_summary.breached} SLA breached
                      </Badge>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Component quality grid */}
        <div>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
            AI Component Quality (7-day weighted score)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-36 rounded-xl border-2 border-slate-100 bg-slate-50 animate-pulse" />
                ))
              : compScores.map(c => <ComponentCard key={c.ai_component} score={c} />)
            }
          </div>
        </div>

        {/* Middle row: signal volume + SLA summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Signal Volume (last 7 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading
                ? <div className="h-32 bg-slate-50 animate-pulse rounded" />
                : <SignalVolumeTable rows={data?.signal_volume ?? []} />
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                SLA Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading
                ? <div className="h-32 bg-slate-50 animate-pulse rounded" />
                : data?.sla_summary
                  ? <SlaCard summary={data.sla_summary} />
                  : <p className="text-sm text-slate-400 text-center py-6">No ticket SLA data yet</p>
              }
            </CardContent>
          </Card>
        </div>

        {/* Recent S0 alerts */}
        {(data?.recent_breaches?.length ?? 0) > 0 && (
          <Card className="border-red-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Recent SLA Breaches &amp; S0 Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data!.recent_breaches.map((b, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                    <Badge className={`mt-0.5 shrink-0 ${SEVERITY_COLORS[b.severity]}`}>{b.severity}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 font-medium truncate">
                        {b.evidence_quote || `Ticket ${b.ticket_id}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {b.ai_component
                          ? (COMPONENT_LABELS[b.ai_component] || b.ai_component)
                          : 'No AI component'
                        } · {timeAgo(b.created_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">{b.breach_type}</Badge>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right">
                <Link to="/admin/feedback-intelligence/sla">
                  <Button variant="link" size="sm" className="text-xs">
                    View all breaches <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!loading && !data && (
          <div className="text-center py-16 text-slate-400">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No data available yet</p>
            <p className="text-sm mt-1">The feedback aggregator runs every 15 minutes. Check back soon.</p>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
