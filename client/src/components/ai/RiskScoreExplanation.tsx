/**
 * RiskScoreExplanation — SHAP + Counterfactual + Confidence panel
 * ================================================================
 * Displays the interpretability bundle from /api/ai-governance/patient/:id/explanation
 * Used in:
 *   - Doctor view: PatientEMR, DoctorPatients (full detail)
 *   - Patient view: SmartHealthDashboard (simplified counterfactual goals)
 *
 * Modes:
 *   'doctor' — full SHAP waterfall + confidence + counterfactuals
 *   'patient' — simplified goals only (no SHAP jargon)
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, CheckCircle2, Info, TrendingUp, TrendingDown,
  Shield, Target, ChevronDown, ChevronRight, Clock, Brain,
  Heart, Activity, Zap, Pill, Dumbbell, Sparkles, Lock
} from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShapDimension {
  shap: number;
  score: number;
  baseline: number;
  delta: number;
  weight: number;
  direction: 'risk' | 'protective';
  impact: 'high' | 'moderate' | 'low';
}

interface Counterfactual {
  dimension: string;
  currentScore: number;
  requiredChange: 'increase' | 'decrease';
  action: string;
  impact: 'high' | 'moderate' | 'low';
  timeframe: string;
  modifiable: boolean;
}

interface ExplanationData {
  patient: { id: number | string; name: string; gender: string };
  riskScore: {
    overall: number;
    level: string;
    subscores: Record<string, number>;
    computedAt: string;
    modelVersion: string;
  };
  interpretability: {
    shap: {
      values: Record<string, ShapDimension>;
      ranked: Array<{ dimension: string } & ShapDimension>;
      topContributor: string;
      topProtector: string;
    };
    topFeatures: Array<{ dimension: string } & ShapDimension>;
    counterfactuals: {
      currentLevel: string;
      targetLevel: string;
      counterfactuals: Counterfactual[];
      achievable: boolean;
    };
    confidenceScore: number;
    dataCompleteness: number;
    confidenceTier: 'high' | 'moderate' | 'low';
    humanSummary: string;
  };
}

interface Props {
  patientId: number | string;
  mode?: 'doctor' | 'patient';
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIMENSION_ICONS: Record<string, React.ElementType> = {
  cardiovascular:      Heart,
  diabetes:            Zap,
  hypertension:        Activity,
  medication_adherence: Pill,
  lifestyle:           Dumbbell,
  mental_health:       Brain,
};

const DIMENSION_LABELS: Record<string, string> = {
  cardiovascular:      'Cardiovascular',
  diabetes:            'Diabetes Risk',
  hypertension:        'Hypertension',
  medication_adherence: 'Medication Adherence',
  lifestyle:           'Lifestyle',
  mental_health:       'Mental Health',
};

const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low:      { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  moderate: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  high:     { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  critical: { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
};

const IMPACT_COLORS: Record<string, string> = {
  high:     'bg-red-500',
  moderate: 'bg-amber-500',
  low:      'bg-blue-400',
};

function ConfidenceBadge({ tier, score }: { tier: string; score: number }) {
  const configs = {
    high:     { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2, label: 'High Confidence' },
    moderate: { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Info, label: 'Moderate Confidence' },
    low:      { color: 'bg-red-100 text-red-800 border-red-200', icon: AlertTriangle, label: 'Low Confidence' },
  };
  const c = configs[tier as keyof typeof configs] ?? configs.moderate;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${c.color}`}>
      <Icon className="h-3 w-3" />
      {c.label} ({Math.round(score * 100)}%)
    </span>
  );
}

// ─── SHAP Waterfall Bar ───────────────────────────────────────────────────────

function ShapBar({ dim, vals }: { dim: string; vals: ShapDimension }) {
  const Icon = DIMENSION_ICONS[dim] ?? Activity;
  const label = DIMENSION_LABELS[dim] ?? dim;
  const isRisk = vals.shap > 0;
  const absVal = Math.abs(vals.shap);
  const maxBar = 1.5; // SHAP values rarely exceed this for single dimension
  const barPct = Math.min(100, (absVal / maxBar) * 100);

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-36 flex items-center gap-2 shrink-0">
        <Icon className={`h-3.5 w-3.5 ${isRisk ? 'text-red-500' : 'text-green-500'}`} />
        <span className="text-xs text-slate-600 truncate">{label}</span>
      </div>
      <div className="flex-1 flex items-center gap-2">
        {/* bar fills from center */}
        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
          <div
            className={`absolute top-0 h-full rounded-full transition-all duration-500 ${isRisk ? 'bg-red-400 left-1/2' : 'bg-green-400 right-1/2'}`}
            style={{ width: `${barPct / 2}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-px h-3 bg-slate-300" />
          </div>
        </div>
        <span className={`w-14 text-right text-xs font-mono font-semibold ${isRisk ? 'text-red-600' : 'text-green-600'}`}>
          {vals.shap > 0 ? '+' : ''}{vals.shap.toFixed(3)}
        </span>
        <span className={`w-16 text-right text-xs ${IMPACT_COLORS[vals.impact] ? '' : ''} px-1.5 py-0.5 rounded text-white text-center ${IMPACT_COLORS[vals.impact]}`}>
          {vals.impact}
        </span>
      </div>
    </div>
  );
}

// ─── Counterfactual Goal Card ─────────────────────────────────────────────────

function GoalCard({ cf, idx }: { cf: Counterfactual; idx: number }) {
  const Icon = DIMENSION_ICONS[cf.dimension] ?? Target;
  const impactColors = { high: 'text-red-600 bg-red-50', moderate: 'text-amber-600 bg-amber-50', low: 'text-blue-600 bg-blue-50' };

  return (
    <div className="flex gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:border-blue-200 transition-colors">
      <div className="mt-0.5 p-2 rounded-lg bg-blue-50 shrink-0">
        <Icon className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-800 leading-snug">{cf.action}</p>
          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${impactColors[cf.impact]}`}>
            {cf.impact} impact
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{cf.timeframe}</span>
          <span className="capitalize">{DIMENSION_LABELS[cf.dimension] ?? cf.dimension}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const RiskScoreExplanation: React.FC<Props> = ({ patientId, mode = 'doctor', className = '' }) => {
  const [data, setData] = useState<ExplanationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shapExpanded, setShapExpanded] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    api.get(`/api/ai-governance/patient/${patientId}/explanation`)
      .then(res => {
        if (res.data?.success) setData(res.data);
        else setError(res.data?.error ?? 'No explanation available');
      })
      .catch(err => {
        if (err?.response?.status === 404) setError('No risk score computed yet for this patient');
        else setError('Could not load AI explanation');
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-40 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className={`border-slate-200 ${className}`}>
        <CardContent className="py-8 text-center text-sm text-slate-500">
          <Brain className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          {error ?? 'No explanation available'}
        </CardContent>
      </Card>
    );
  }

  const { riskScore, interpretability } = data;
  const levelColors = LEVEL_COLORS[riskScore.level] ?? LEVEL_COLORS.moderate;
  const hasCounterfactuals = interpretability.counterfactuals?.counterfactuals?.length > 0;

  // ── PATIENT MODE — simplified ─────────────────────────────────────────────
  if (mode === 'patient') {
    return (
      <div className={`space-y-3 ${className}`}>
        {/* Confidence notice */}
        {interpretability.confidenceTier !== 'high' && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Your score is based on <strong>{interpretability.dataCompleteness}%</strong> of available health data.
              {interpretability.confidenceTier === 'low' && ' Complete your health profile for a more accurate assessment.'}
            </span>
          </div>
        )}

        {/* Why this score */}
        {interpretability.humanSummary && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-900">
            <span className="font-medium flex items-center gap-1.5 mb-1"><Sparkles className="h-4 w-4" />Why this score?</span>
            <p className="text-xs text-blue-700 leading-relaxed">{interpretability.humanSummary}</p>
          </div>
        )}

        {/* Goals */}
        {hasCounterfactuals && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-blue-500" />
                To reach <Badge className={`ml-1 text-xs ${levelColors.text} ${levelColors.bg} border ${levelColors.border}`}>
                  {interpretability.counterfactuals.targetLevel.toUpperCase()}
                </Badge>
              </h4>
            </div>
            <div className="space-y-2">
              {interpretability.counterfactuals.counterfactuals.slice(0, 3).map((cf, i) => (
                <GoalCard key={i} cf={cf} idx={i} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DOCTOR MODE — full SHAP + all details ────────────────────────────────
  const shapRanked = interpretability.shap?.ranked ?? [];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header: confidence + data completeness */}
      <div className="flex flex-wrap items-center gap-2">
        <ConfidenceBadge tier={interpretability.confidenceTier} score={interpretability.confidenceScore} />
        <span className="text-xs text-slate-500">
          Data completeness: {interpretability.dataCompleteness}%
        </span>
        <span className="text-xs text-slate-400 ml-auto flex items-center gap-1">
          <Lock className="h-3 w-3" />Model: {riskScore.modelVersion}
        </span>
      </div>

      {/* SHAP Waterfall */}
      {shapRanked.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Risk Factor Attribution (SHAP)
              </CardTitle>
              <Button
                variant="ghost" size="sm"
                className="h-7 text-xs text-slate-500"
                onClick={() => setShapExpanded(e => !e)}
              >
                {shapExpanded ? <><ChevronDown className="h-3.5 w-3.5 mr-1" />Less</> : <><ChevronRight className="h-3.5 w-3.5 mr-1" />More</>}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Each bar shows how much that dimension contributes to or reduces the overall risk score.
              Positive = increases risk. Negative = protective.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-0.5">
              {(shapExpanded ? shapRanked : shapRanked.slice(0, 4)).map(item => (
                <ShapBar key={item.dimension} dim={item.dimension} vals={item} />
              ))}
            </div>
            {!shapExpanded && shapRanked.length > 4 && (
              <button onClick={() => setShapExpanded(true)} className="mt-2 text-xs text-blue-600 hover:underline">
                + {shapRanked.length - 4} more dimensions
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Counterfactuals */}
      {hasCounterfactuals && (
        <Card className="border-slate-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Target className="h-4 w-4 text-green-500" />
              Pathway to{' '}
              <Badge className={`text-xs ${levelColors.text} ${levelColors.bg} border ${levelColors.border}`}>
                {interpretability.counterfactuals?.targetLevel?.toUpperCase()}
              </Badge>
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Minimum changes needed to move this patient from{' '}
              <strong>{riskScore.level}</strong> to the next lower risk level.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {interpretability.counterfactuals.counterfactuals.map((cf, i) => (
              <GoalCard key={i} cf={cf} idx={i} />
            ))}
            {interpretability.counterfactuals.achievable && (
              <div className="flex items-center gap-1.5 text-xs text-green-600 mt-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All changes are clinically achievable
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top protector callout */}
      {interpretability.shap?.topProtector && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-100 text-xs text-green-800">
          <Shield className="h-4 w-4 shrink-0 text-green-600" />
          <span>
            <strong>{DIMENSION_LABELS[interpretability.shap.topProtector] ?? interpretability.shap.topProtector}</strong>{' '}
            is this patient's strongest protective factor. Reinforce and maintain.
          </span>
        </div>
      )}

      {/* Low confidence warning */}
      {interpretability.confidenceTier === 'low' && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Low confidence ({interpretability.dataCompleteness}% data completeness).
            This patient is missing critical data sources (vitals, lab results, or medication history).
            Do not treat this risk score as clinically actionable without additional assessment.
          </span>
        </div>
      )}
    </div>
  );
};

export default RiskScoreExplanation;
