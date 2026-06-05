/**
 * AI Governance Dashboard — Medical Director / Super Admin
 * =========================================================
 * Provides the human-in-the-loop interface required by SaMD PCCP:
 *   - Pending model change approval queue
 *   - SaMD readiness checklist
 *   - Drift monitoring alerts
 *   - Demographic parity report
 *   - Quality gate audit log
 *   - Model cards registry
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, Brain, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  TrendingDown, Users, Activity, FileText, RefreshCw, CheckCheck,
  XCircle, Info, BarChart3, Lock, AlertCircle, Sparkles, Eye
} from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingChange {
  id: number;
  model_component: string;
  change_type: string;
  change_description: string;
  previous_config: any;
  new_config: any;
  rationale: string;
  risk_assessment: 'low' | 'moderate' | 'high';
  proposed_at: string;
  proposed_by: string;
}

interface ReadinessItem {
  item: string;
  status: 'done' | 'missing';
  detail: string;
}

interface DriftResult {
  feature_name: string;
  psi_score: number;
  drift_detected: boolean;
  drift_level: string;
  measured_at: string;
}

interface GateLogEntry {
  id: number;
  gate_type: string;
  severity: string;
  passed: boolean;
  blockers: any[];
  warnings: any[];
  checked_at: string;
}

interface ModelCard {
  key: string;
  componentName: string;
  version: string;
  regulatoryClass: string;
  intendedUse: string;
  knownLimitations: string[];
  lastValidatedAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  low:      'bg-green-100 text-green-800 border-green-200',
  moderate: 'bg-amber-100 text-amber-800 border-amber-200',
  high:     'bg-red-100 text-red-800 border-red-200',
};

const SEVERITY_COLORS: Record<string, string> = {
  pass:    'bg-green-100 text-green-700',
  review:  'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  blocked: 'bg-red-100 text-red-700',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReadinessGauge({ items }: { items: ReadinessItem[] }) {
  const done = items.filter(i => i.status === 'done').length;
  const total = items.length;
  const pct = Math.round((done / total) * 100);
  const color = pct === 100 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';
  const ringColor = pct === 100 ? 'stroke-green-500' : pct >= 60 ? 'stroke-amber-500' : 'stroke-red-500';
  const r = 40, circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);

  return (
    <div className="flex items-center gap-4">
      <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="10"
          className={ringColor}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className={`text-lg font-bold fill-current ${color}`} fontSize="18">
          {pct}%
        </text>
      </svg>
      <div>
        <p className={`text-2xl font-bold ${color}`}>{done}/{total}</p>
        <p className="text-sm text-slate-500">SaMD requirements met</p>
        <p className="text-xs text-slate-400 mt-1">
          {total - done} item{total - done !== 1 ? 's' : ''} remaining
        </p>
      </div>
    </div>
  );
}

function ChangeCard({ change, onApprove, onReject }: {
  change: PendingChange;
  onApprove: (id: number, notes: string) => void;
  onReject: (id: number, reason: string) => void;
}) {
  const [notes, setNotes] = useState('');
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-xl p-4 bg-white hover:border-blue-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${RISK_COLORS[change.risk_assessment]}`}>
              {change.risk_assessment} risk
            </span>
            <Badge variant="outline" className="text-xs">{change.change_type.replace('_', ' ')}</Badge>
            <span className="text-xs text-slate-400">{change.model_component}</span>
          </div>
          <p className="mt-1.5 text-sm font-medium text-slate-800">{change.change_description}</p>
          <p className="mt-1 text-xs text-slate-500 line-clamp-2">{change.rationale}</p>
          <p className="mt-1 text-xs text-slate-400">Proposed by {change.proposed_by} · {formatDate(change.proposed_at)}</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="font-medium text-slate-600 mb-1">Current config</p>
              <pre className="text-slate-500 whitespace-pre-wrap">{JSON.stringify(change.previous_config, null, 2)}</pre>
            </div>
            <div className="rounded-lg bg-blue-50 p-2">
              <p className="font-medium text-blue-700 mb-1">Proposed change</p>
              <pre className="text-blue-600 whitespace-pre-wrap">{JSON.stringify(change.new_config, null, 2)}</pre>
            </div>
          </div>
          <Textarea
            placeholder="Add review notes (optional)..."
            className="h-16 text-xs resize-none"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs"
              onClick={() => onApprove(change.id, notes)}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1 text-xs"
              onClick={() => onReject(change.id, notes || 'Rejected by medical director')}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />Reject
            </Button>
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded(e => !e)}
        className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        <Eye className="h-3 w-3" />
        {expanded ? 'Hide details' : 'Review & decide'}
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const AIGovernanceDashboard: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [readiness, setReadiness] = useState<ReadinessItem[]>([]);
  const [driftResults, setDriftResults] = useState<DriftResult[]>([]);
  const [gateLog, setGateLog] = useState<GateLogEntry[]>([]);
  const [modelCards, setModelCards] = useState<ModelCard[]>([]);
  const [driftRunning, setDriftRunning] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, pendRes, driftRes, gateRes, cardsRes, readRes] = await Promise.allSettled([
        api.get('/api/ai-governance/dashboard'),
        api.get('/api/ai-governance/changes/pending'),
        api.get('/api/ai-governance/drift/results'),
        api.get('/api/ai-governance/quality-gates/log?limit=50'),
        api.get('/api/ai-governance/model-cards'),
        api.get('/api/ai-governance/samd-readiness'),
      ]);

      if (dashRes.status === 'fulfilled')  setDashboard(dashRes.value.data?.data);
      if (pendRes.status === 'fulfilled')  setPendingChanges(pendRes.value.data?.changes ?? []);
      if (driftRes.status === 'fulfilled') setDriftResults(driftRes.value.data?.results ?? []);
      if (gateRes.status === 'fulfilled')  setGateLog(gateRes.value.data?.entries ?? []);
      if (cardsRes.status === 'fulfilled') setModelCards(cardsRes.value.data?.cards ?? []);
      if (readRes.status === 'fulfilled')  setReadiness(readRes.value.data?.checklist ?? []);
    } catch (err) {
      toast({ title: 'Failed to load governance data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleApprove = async (changeId: number, notes: string) => {
    try {
      await api.post(`/api/ai-governance/changes/${changeId}/approve`, { notes });
      toast({ title: 'Change approved', description: `Change #${changeId} approved successfully` });
      setPendingChanges(prev => prev.filter(c => c.id !== changeId));
    } catch (err: any) {
      toast({ title: 'Approval failed', description: err?.response?.data?.error ?? 'Unknown error', variant: 'destructive' });
    }
  };

  const handleReject = async (changeId: number, reason: string) => {
    try {
      await api.post(`/api/ai-governance/changes/${changeId}/reject`, { reason });
      toast({ title: 'Change rejected', description: `Change #${changeId} rejected` });
      setPendingChanges(prev => prev.filter(c => c.id !== changeId));
    } catch (err: any) {
      toast({ title: 'Rejection failed', description: err?.response?.data?.error ?? 'Unknown error', variant: 'destructive' });
    }
  };

  const handleRunDrift = async () => {
    setDriftRunning(true);
    try {
      const res = await api.post('/api/ai-governance/drift/run');
      toast({ title: 'Drift monitor complete', description: `${res.data?.result?.alertCount ?? 0} alerts detected` });
      fetchAll();
    } catch {
      toast({ title: 'Drift monitor failed', variant: 'destructive' });
    } finally {
      setDriftRunning(false);
    }
  };

  // Summary stats
  const blockedGates  = gateLog.filter(g => g.severity === 'blocked').length;
  const driftAlerts   = driftResults.filter(d => d.drift_detected).length;
  const highRiskPending = pendingChanges.filter(c => c.risk_assessment === 'high').length;
  const readinessDone = readiness.filter(r => r.status === 'done').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-32 rounded-2xl bg-slate-200 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800 dark:text-white">AI Model Governance</h1>
              <p className="text-xs text-slate-500">SaMD PCCP · Medical Director Dashboard</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Alert banner for urgent items */}
        {(highRiskPending > 0 || driftAlerts > 0 || blockedGates > 0) && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <span className="font-semibold">Action required: </span>
              {highRiskPending > 0 && <span>{highRiskPending} high-risk model change{highRiskPending > 1 ? 's' : ''} await your review. </span>}
              {driftAlerts > 0 && <span>{driftAlerts} drift alert{driftAlerts > 1 ? 's' : ''} detected. </span>}
              {blockedGates > 0 && <span>{blockedGates} AI output{blockedGates > 1 ? 's' : ''} were blocked by safety gates. </span>}
            </div>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Pending Changes', value: pendingChanges.length, icon: Clock, color: pendingChanges.length > 0 ? 'text-amber-600' : 'text-green-600', bg: 'bg-amber-50' },
            { label: 'Drift Alerts', value: driftAlerts, icon: TrendingUp, color: driftAlerts > 0 ? 'text-red-600' : 'text-green-600', bg: 'bg-red-50' },
            { label: 'Gate Blocks (50)', value: blockedGates, icon: AlertCircle, color: blockedGates > 0 ? 'text-red-600' : 'text-green-600', bg: 'bg-red-50' },
            { label: 'SaMD Ready', value: `${readinessDone}/${readiness.length}`, icon: Shield, color: 'text-blue-600', bg: 'bg-blue-50' },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${stat.bg}`}>
                      <Icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                    <div>
                      <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-xs text-slate-500">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Main tabs */}
        <Tabs defaultValue="changes">
          <TabsList className="bg-white border border-slate-200 p-1 rounded-xl">
            <TabsTrigger value="changes" className="rounded-lg text-xs gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Clock className="h-3.5 w-3.5" />
              Pending Changes
              {pendingChanges.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-xs leading-none">
                  {pendingChanges.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="readiness" className="rounded-lg text-xs gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Shield className="h-3.5 w-3.5" />SaMD Readiness
            </TabsTrigger>
            <TabsTrigger value="drift" className="rounded-lg text-xs gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Activity className="h-3.5 w-3.5" />Drift Monitor
            </TabsTrigger>
            <TabsTrigger value="gates" className="rounded-lg text-xs gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <AlertCircle className="h-3.5 w-3.5" />Quality Gates
            </TabsTrigger>
            <TabsTrigger value="cards" className="rounded-lg text-xs gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <FileText className="h-3.5 w-3.5" />Model Cards
            </TabsTrigger>
          </TabsList>

          {/* ── Pending Changes ── */}
          <TabsContent value="changes" className="mt-4">
            {pendingChanges.length === 0 ? (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="py-10 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
                  <p className="font-medium text-green-800">No pending model changes</p>
                  <p className="text-sm text-green-600 mt-1">All AI model changes are up to date</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    {pendingChanges.length} change{pendingChanges.length !== 1 ? 's' : ''} awaiting your review
                    {highRiskPending > 0 && <span className="ml-2 text-red-600 font-medium">({highRiskPending} high risk)</span>}
                  </p>
                </div>
                {pendingChanges.map(change => (
                  <ChangeCard
                    key={change.id}
                    change={change}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── SaMD Readiness ── */}
          <TabsContent value="readiness" className="mt-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">SaMD Certification Readiness</CardTitle>
                  <a
                    href="/docs/ai/SAMD_READINESS_SCORECARD.md"
                    target="_blank"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Full scorecard →
                  </a>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6 mb-6">
                  <ReadinessGauge items={readiness} />
                  <div className="flex-1 text-sm text-slate-500 leading-relaxed">
                    <p>Software-level requirements are complete. Remaining gaps require offline organisational work:</p>
                    <ul className="mt-2 space-y-1 text-xs">
                      <li className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" />Clinical validation studies (P0 — partner hospitals needed)</li>
                      <li className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" />ISO 13485 QMS documentation (P1 — consultant engagement)</li>
                      <li className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" />ISO 14971 Risk Management File / FMEA (P1)</li>
                      <li className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" />CDSCO India Class B/C registration (P2)</li>
                    </ul>
                  </div>
                </div>
                <div className="space-y-2">
                  {readiness.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50">
                      {item.status === 'done'
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className="text-sm font-medium text-slate-700">{item.item}</p>
                        <p className="text-xs text-slate-500">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Drift Monitor ── */}
          <TabsContent value="drift" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Population Stability Index (PSI) monitoring on AI input distributions.
                Alert threshold: PSI {'>'} 0.20
              </p>
              <Button size="sm" variant="outline" onClick={handleRunDrift} disabled={driftRunning} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${driftRunning ? 'animate-spin' : ''}`} />
                Run Now
              </Button>
            </div>
            {driftResults.length === 0 ? (
              <Card className="border-slate-200">
                <CardContent className="py-8 text-center text-sm text-slate-500">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  No drift results yet. Run the monitor or wait for the scheduled weekly run.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {driftResults.map((r, i) => (
                  <Card key={i} className={`border-${r.drift_detected ? 'amber' : 'slate'}-200`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm text-slate-800">{r.feature_name.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Measured: {formatDate(r.measured_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-bold ${r.psi_score > 0.2 ? 'text-red-600' : r.psi_score > 0.1 ? 'text-amber-600' : 'text-green-600'}`}>
                            PSI {r.psi_score?.toFixed(4) ?? '—'}
                          </p>
                          <Badge className={`text-xs mt-1 ${r.drift_detected ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-green-100 text-green-800 border-green-200'} border`}>
                            {r.drift_level ?? 'none'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Quality Gates ── */}
          <TabsContent value="gates" className="mt-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quality Gate Audit Log (last 50)</CardTitle>
              </CardHeader>
              <CardContent>
                {gateLog.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">No gate events yet</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-2 mb-3 text-xs text-slate-500 font-medium px-2">
                      <span>Gate Type</span><span>Severity</span><span>Blockers</span><span>Time</span>
                    </div>
                    {gateLog.map(entry => (
                      <div key={entry.id} className={`grid grid-cols-4 gap-2 text-xs p-2.5 rounded-lg ${entry.severity === 'blocked' ? 'bg-red-50 border border-red-100' : 'bg-slate-50'}`}>
                        <span className="font-medium text-slate-700 capitalize">{entry.gate_type.replace(/_/g, ' ')}</span>
                        <span className={`px-2 py-0.5 rounded-full w-fit text-xs font-medium ${SEVERITY_COLORS[entry.severity]}`}>
                          {entry.severity}
                        </span>
                        <span className="text-slate-600">{entry.blockers?.length ?? 0} blocker{entry.blockers?.length !== 1 ? 's' : ''}</span>
                        <span className="text-slate-400">{formatDate(entry.checked_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Model Cards ── */}
          <TabsContent value="cards" className="mt-4">
            <div className="space-y-4">
              {modelCards.map(card => (
                <Card key={card.key} className="border-slate-200">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{card.componentName}</CardTitle>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">{card.version}</Badge>
                          <span className="text-xs text-slate-500">{card.regulatoryClass}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {card.lastValidatedAt
                          ? <Badge className="bg-green-100 text-green-800 border-green-200 border text-xs">Validated</Badge>
                          : <Badge className="bg-amber-100 text-amber-800 border-amber-200 border text-xs">Validation pending</Badge>
                        }
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-slate-600 leading-relaxed">{card.intendedUse}</p>
                    {card.knownLimitations && (
                      <div>
                        <p className="text-xs font-medium text-slate-700 mb-1">Known limitations</p>
                        <ul className="space-y-1">
                          {(Array.isArray(card.knownLimitations) ? card.knownLimitations : []).slice(0, 3).map((lim: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                              <Info className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                              {lim}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AIGovernanceDashboard;
