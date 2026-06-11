/**
 * Component Deep-Dive
 * ====================
 * Detailed quality analytics for a single AI component.
 * Shows the 7/30-day quality score, recent feedback signals,
 * and pending governance change proposals for that component.
 *
 * Route: /admin/feedback-intelligence/component/:name
 * Access: admin, medical_director
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Activity, ArrowLeft, Brain, CheckCircle2, Clock, RefreshCw,
  Shield, TrendingDown, TrendingUp, Minus, Zap, AlertTriangle,
  FileText, ThumbsDown, ThumbsUp,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComponentScore {
  ai_component: string;
  score_7d: number | null;
  score_30d: number | null;
  signal_count_7d: number;
  signal_count_30d: number;
  trend: 'improving' | 'stable' | 'degrading';
  last_proposal_at: string | null;
  computed_at: string;
}

interface Signal {
  source: string;
  feedback_type: string;
  quality_delta: number;
  weight: number;
  raw_summary: string | null;
  created_at: string;
}

interface GovernanceChange {
  change_type: string;
  change_description: string;
  proposed_by: string;
  status: string;
  created_at: string;
}

interface ComponentData {
  score: ComponentScore;
  recent_signals: Signal[];
  governance_changes: GovernanceChange[];
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

const SOURCE_LABELS: Record<string, string> = {
  patient_feedback: 'Patient',
  cdss_feedback:    'Doctor',
  ticket:           'Ticket',
  post_resolution:  'Post-Res',
};

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-amber-100 text-amber-800 border-amber-300',
  approved:       'bg-green-100 text-green-800 border-green-300',
  rejected:       'bg-red-100 text-red-800 border-red-300',
  applied:        'bg-blue-100 text-blue-800 border-blue-300',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return 'text-slate-400';
  if (score >= 8) return 'text-green-600';
  if (score >= 6) return 'text-amber-600';
  return 'text-red-600';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DeltaIcon({ delta }: { delta: number }) {
  if (delta > 0.1) return <ThumbsUp className="h-3.5 w-3.5 text-green-500" />;
  if (delta < -0.1) return <ThumbsDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreGauge({ score, label }: { score: number | null; label: string }) {
  const s   = score ?? 0;
  const pct = Math.round((s / 10) * 100);
  return (
    <div className="text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className={`text-3xl font-bold ${scoreColor(score)}`}>
        {score !== null ? score.toFixed(1) : '—'}
        <span className="text-sm text-slate-400 font-normal">/10</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
        <div
          className={`h-2 rounded-full ${s >= 8 ? 'bg-green-500' : s >= 6 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%`, transition: 'width 0.6s ease' }}
        />
      </div>
    </div>
  );
}

function SignalRow({ sig }: { sig: Signal }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <DeltaIcon delta={sig.quality_delta} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 truncate">
          {sig.raw_summary || sig.feedback_type?.replace(/_/g, ' ') || 'No summary'}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {SOURCE_LABELS[sig.source] || sig.source} · {timeAgo(sig.created_at)}
        </p>
      </div>
      <span className={`text-xs font-mono ${sig.quality_delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {sig.quality_delta >= 0 ? '+' : ''}{sig.quality_delta.toFixed(2)}
      </span>
    </div>
  );
}

function GovernanceCard({ change }: { change: GovernanceChange }) {
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <Badge className={`text-xs border ${STATUS_COLORS[change.status] || 'bg-slate-100 text-slate-700'}`}>
          {change.status.replace(/_/g, ' ')}
        </Badge>
        <span className="text-xs text-slate-400">{timeAgo(change.created_at)}</span>
      </div>
      <p className="text-sm text-slate-700 line-clamp-3">{change.change_description}</p>
      <p className="text-xs text-slate-400 mt-2">
        Proposed by: {change.proposed_by} · Type: {change.change_type.replace(/_/g, ' ')}
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ComponentDeepDive() {
  const { name }                = useParams<{ name: string }>();
  const [data, setData]         = useState<ComponentData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { toast }               = useToast();

  const load = useCallback(async () => {
    if (!name) return;
    setLoading(true);
    setNotFound(false);
    try {
      const res = await api.get(`/feedback-intelligence/component/${name}`);
      setData(res.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        toast({ title: 'Failed to load component data', description: err.message, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [name, toast]);

  useEffect(() => { load(); }, [load]);

  const label = name ? (COMPONENT_LABELS[name] || name) : '';
  const icon  = name ? (COMPONENT_ICONS[name] || <Brain className="h-5 w-5" />) : null;

  if (notFound) {
    return (
      <AdminLayout>
        <div className="p-6 text-center py-24 text-slate-400">
          <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Component not found</p>
          <p className="text-sm mt-1">No quality score data exists yet for "{name}".</p>
          <Link to="/admin/feedback-intelligence" className="mt-4 inline-block">
            <Button variant="outline" size="sm">Back to Dashboard</Button>
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/admin/feedback-intelligence">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              {icon} {label}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {name} — AI component quality analytics
            </p>
          </div>
          <Button size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* Score cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="col-span-1">
                <CardContent className="pt-5">
                  <ScoreGauge score={data.score.score_7d} label="7-day score" />
                </CardContent>
              </Card>
              <Card className="col-span-1">
                <CardContent className="pt-5">
                  <ScoreGauge score={data.score.score_30d} label="30-day score" />
                </CardContent>
              </Card>
              <Card className="col-span-1">
                <CardContent className="pt-5 text-center">
                  <p className="text-xs text-slate-500 mb-1">Signals (7d)</p>
                  <p className="text-3xl font-bold text-slate-700">{data.score.signal_count_7d}</p>
                  <p className="text-xs text-slate-400 mt-1">{data.score.signal_count_30d} in 30d</p>
                </CardContent>
              </Card>
              <Card className="col-span-1">
                <CardContent className="pt-5 text-center">
                  <p className="text-xs text-slate-500 mb-1">Trend</p>
                  <div className="flex justify-center my-1">
                    {data.score.trend === 'improving' && <TrendingUp className="h-8 w-8 text-green-500" />}
                    {data.score.trend === 'degrading' && <TrendingDown className="h-8 w-8 text-red-500" />}
                    {data.score.trend === 'stable' && <Minus className="h-8 w-8 text-slate-400" />}
                  </div>
                  <p className={`text-sm font-medium capitalize ${
                    data.score.trend === 'improving' ? 'text-green-600'
                    : data.score.trend === 'degrading' ? 'text-red-600'
                    : 'text-slate-500'
                  }`}>{data.score.trend}</p>
                </CardContent>
              </Card>
            </div>

            {/* Alerts */}
            {data.score.score_7d !== null && data.score.score_7d < 5 && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">Quality score below threshold</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Score {data.score.score_7d.toFixed(1)}/10 is below the 5.0 governance threshold.
                    A proposal should have been auto-generated for medical director review.
                  </p>
                </div>
                <Link to="/admin/ai-governance" className="ml-auto shrink-0">
                  <Button size="sm" variant="destructive">Review Proposals</Button>
                </Link>
              </div>
            )}

            {data.score.last_proposal_at && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Clock className="h-4 w-4 shrink-0" />
                Last governance proposal: {new Date(data.score.last_proposal_at).toLocaleString('en-IN')}
              </div>
            )}

            {/* Tabs: signals + governance */}
            <Tabs defaultValue="signals">
              <TabsList>
                <TabsTrigger value="signals">
                  Recent Signals ({data.recent_signals.length})
                </TabsTrigger>
                <TabsTrigger value="governance">
                  Governance Changes ({data.governance_changes.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signals" className="mt-4">
                <Card>
                  <CardContent className="pt-4">
                    {data.recent_signals.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">No signals recorded yet</p>
                    ) : (
                      <div className="divide-y">
                        {data.recent_signals.map((s, i) => (
                          <SignalRow key={i} sig={s} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="governance" className="mt-4">
                {data.governance_changes.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No governance changes proposed yet for this component.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.governance_changes.map((c, i) => (
                      <GovernanceCard key={i} change={c} />
                    ))}
                    <div className="text-right">
                      <Link to="/admin/ai-governance">
                        <Button variant="link" size="sm" className="text-xs">
                          View all in Governance Dashboard →
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
