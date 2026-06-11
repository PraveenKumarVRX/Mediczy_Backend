/**
 * Prompt Version Manager
 * =======================
 * Lists all AI prompt versions with their lifecycle status (draft → shadow → canary → active → retired).
 * Allows promoting shadow-tested versions to canary and then to full rollout.
 * Shows shadow run pass rates.
 *
 * Route: /admin/feedback-intelligence/prompts
 * Access: admin
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, ArrowUpCircle, Brain, CheckCircle2, Clock,
  FlaskConical, RefreshCw, Rocket, XCircle, Zap, Shield, Activity,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromptVersion {
  id: number;
  prompt_name: string;
  candidate_template: string;
  status: 'draft' | 'shadow' | 'canary' | 'active' | 'retired';
  shadow_pass_rate: number | null;
  canary_pct: number | null;
  change_log_id: number | null;
  shadow_test_count: string;
  activated_at: string | null;
  retired_at: string | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPONENT_LABELS: Record<string, string> = {
  'brain-system-prompt':           'Dr. iSHA System Prompt',
  medical_scribe_output:           'Dr. iSHA',
  emergency_triage_esi_v1:         'Emergency Triage',
  drug_interaction_checker_v1:     'Drug Checker',
  health_risk_scoring_v2_bayesian: 'Health Risk AI',
};

const COMPONENT_ICONS: Record<string, React.ReactNode> = {
  'brain-system-prompt':           <Brain className="h-4 w-4" />,
  medical_scribe_output:           <Brain className="h-4 w-4" />,
  emergency_triage_esi_v1:         <Zap className="h-4 w-4" />,
  drug_interaction_checker_v1:     <Shield className="h-4 w-4" />,
  health_risk_scoring_v2_bayesian: <Activity className="h-4 w-4" />,
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:   { label: 'Draft',    color: 'bg-slate-100 text-slate-700 border-slate-300',   icon: <Clock className="h-3 w-3" /> },
  shadow:  { label: 'Shadow',   color: 'bg-purple-100 text-purple-800 border-purple-300', icon: <FlaskConical className="h-3 w-3" /> },
  canary:  { label: 'Canary',   color: 'bg-amber-100 text-amber-800 border-amber-300',    icon: <Rocket className="h-3 w-3" /> },
  active:  { label: 'Active',   color: 'bg-green-100 text-green-800 border-green-300',    icon: <CheckCircle2 className="h-3 w-3" /> },
  retired: { label: 'Retired',  color: 'bg-red-100 text-red-700 border-red-300',          icon: <XCircle className="h-3 w-3" /> },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncate(text: string, len = 100): string {
  return text.length > len ? text.slice(0, len) + '…' : text;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VersionCard({
  version,
  onPromote,
  promoting,
}: {
  version: PromptVersion;
  onPromote: (id: number) => void;
  promoting: number | null;
}) {
  const cfg  = STATUS_CONFIG[version.status] ?? STATUS_CONFIG.draft;
  const icon = COMPONENT_ICONS[version.prompt_name];
  const name = COMPONENT_LABELS[version.prompt_name] || version.prompt_name;
  const canPromote = version.status === 'shadow' || version.status === 'canary';
  const passRate   = version.shadow_pass_rate !== null ? (version.shadow_pass_rate * 100).toFixed(0) : null;

  return (
    <Card className={`${version.status === 'active' ? 'border-green-200' : ''}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Component + status */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-slate-700">
                {icon}
                <span className="font-medium text-sm">{name}</span>
              </div>
              <Badge className={`text-xs border flex items-center gap-1 ${cfg.color}`}>
                {cfg.icon} {cfg.label}
              </Badge>
              {version.canary_pct !== null && version.status === 'canary' && (
                <Badge variant="outline" className="text-xs">
                  {version.canary_pct}% traffic
                </Badge>
              )}
            </div>

            {/* Template preview */}
            <p className="text-xs text-slate-500 font-mono bg-slate-50 rounded p-2 mb-3 leading-relaxed">
              {truncate(version.candidate_template, 150)}
            </p>

            {/* Shadow test results */}
            <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
              <span>ID #{version.id}</span>
              {passRate !== null && (
                <span className={Number(passRate) >= 70 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  Shadow pass: {passRate}%
                </span>
              )}
              <span>Tests: {version.shadow_test_count}</span>
              {version.change_log_id && (
                <Link to="/admin/ai-governance" className="text-blue-500 hover:underline">
                  Change #{version.change_log_id}
                </Link>
              )}
              <span>{timeAgo(version.created_at)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="shrink-0 flex flex-col gap-2">
            {canPromote && (
              <Button
                size="sm"
                onClick={() => onPromote(version.id)}
                disabled={promoting === version.id}
                className={version.status === 'shadow' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'}
              >
                {promoting === version.id ? (
                  <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <ArrowUpCircle className="h-3 w-3 mr-1" />
                )}
                {version.status === 'shadow' ? 'Promote to Canary' : 'Full Rollout'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PromptVersionManager() {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading]   = useState(true);
  const [promoting, setPromoting] = useState<number | null>(null);
  const [filter, setFilter]     = useState<string>('all');
  const { toast }               = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/feedback-intelligence/prompt-versions');
      setVersions(res.data.data ?? []);
    } catch (err: any) {
      toast({ title: 'Failed to load prompt versions', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handlePromote = async (id: number) => {
    setPromoting(id);
    try {
      const res = await api.post(`/feedback-intelligence/prompt-versions/${id}/promote`);
      toast({
        title: 'Promotion successful',
        description: `Version #${id} promoted to ${res.data.newStatus}${res.data.canary_pct ? ` (${res.data.canary_pct}% traffic)` : ''}`,
      });
      await load();
    } catch (err: any) {
      toast({ title: 'Promotion failed', description: err.response?.data?.error || err.message, variant: 'destructive' });
    } finally {
      setPromoting(null);
    }
  };

  const filtered = filter === 'all'
    ? versions
    : versions.filter(v => v.status === filter);

  const counts = versions.reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {});

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
              <FlaskConical className="h-6 w-6 text-purple-600" />
              Prompt Version Manager
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage AI prompt lifecycle: shadow test → canary → full rollout
            </p>
          </div>
          <Button size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats summary */}
        {!loading && (
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
              counts[s] ? (
                <button
                  key={s}
                  onClick={() => setFilter(filter === s ? 'all' : s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                    filter === s ? cfg.color + ' ring-2 ring-offset-1' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {cfg.icon} {cfg.label} <span className="font-bold">{counts[s]}</span>
                </button>
              ) : null
            ))}
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-500 hover:border-slate-400"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* How it works note */}
        <div className="flex gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <Brain className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <strong>How it works:</strong> The Prompt Optimization Executor (daily 2AM IST) generates candidate prompts
            from approved governance changes, runs them in shadow mode, then auto-promotes if pass rate ≥ 70%.
            Medical directors must approve the governance change before a candidate is generated.
          </span>
        </div>

        {/* Versions list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-28 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FlaskConical className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">
              {filter === 'all' ? 'No prompt versions yet' : `No ${filter} versions`}
            </p>
            <p className="text-sm mt-1">
              {filter === 'all'
                ? 'The prompt optimizer generates versions from approved governance changes.'
                : 'Change the filter to see other versions.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(v => (
              <VersionCard
                key={v.id}
                version={v}
                onPromote={handlePromote}
                promoting={promoting}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
