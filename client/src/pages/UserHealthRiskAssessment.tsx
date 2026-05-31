import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import React from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Activity,
  AlertTriangle,
  Brain,
  Briefcase,
  Droplets,
  FlaskConical,
  HeartPulse,
  LucideIcon,
  Shield,
  Users,
  Wine,
  CheckCircle2,
  TrendingUp,
  Calculator,
  Ruler,
  Scale,
  User,
  Lightbulb,
  Sparkles,
  Clock,
  Calendar,
  Gift,
  TrendingDown,
  BarChart3,
  Minus,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MAX_THEORETICAL_SCORE,
  RiskCategoryId,
  RiskResponses,
  calculateRiskScore,
  healthRiskSections,
  resolveScoreBand,
  summarizeSections,
} from '@/lib/health-risk';
import {
  BayesianRiskResult,
  computeBayesianRisk,
} from '@/lib/bayesian-risk';
import {
  ClinicalScores,
  ClinicalEnginesInput,
  computeAllClinicalScores,
  computeTrajectory,
  AssessmentDataPoint,
  TrajectoryResult,
} from '@/lib/clinical-engines';
import api from '@/utils/api';
import { useAuth } from '@/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

// ── Typed assessment record returned by /history ─────────────────────────────
interface HealthAssessmentRecord {
  id: number;
  score: number;
  riskLevel: string;
  riskFactors?: string[];
  assessedAt: string;
  age?: number;
  bmi?: number | null;
  whr?: number | null;
  risk_level?: string;
  assessed_at?: string;
  periods?: {
    daily: boolean; weekly: boolean; monthly: boolean;
    quarterly: boolean; halfYearly: boolean; annual: boolean;
  };
  birthdayMonth?: number;
  clinicalScores?: ClinicalScores;
}

// ── Clinical lab / advanced inputs ───────────────────────────────────────────
interface ClinicalLabInputs {
  ethnicity: 'south_asian' | 'white' | 'black' | 'chinese' | 'other';
  sbp: string;
  totalCholesterol_mmol: string;
  hdlCholesterol_mmol: string;
  hba1c_percent: string;
  creatinine_mgdL: string;
  urineACR_mgmmol: string;
  snoresLoudly: boolean;
  daytimeSleepiness: boolean;
  observedApneas: boolean;
  neckCm: string;
  familyPrematureCVD: boolean;
  atrialFibrillation: boolean;
}

// Questions that should be auto-calculated
const AUTO_CALCULATED_QUESTIONS = ['bmi', 'whr', 'neck', 'body_fat', 'age', 'gender'];

const sectionIconMap: Record<RiskCategoryId, LucideIcon> = {
  demographics: Users,
  lifestyle: Droplets,
  physical: Activity,
  medical: HeartPulse,
  family: Shield,
  occupational: Briefcase,
  mental: Brain,
  examination: FlaskConical,
  substance: Wine,
};

// Measurement inputs interface
interface Measurements {
  height: string; // cm
  weight: string; // kg
  age: string;
  gender: 'male' | 'female' | 'other';
  waist: string; // cm
  hip: string; // cm
  neck: string; // cm (inches will be calculated)
}

// Calculate BMI and return category
const calculateBMI = (height: number, weight: number): { value: number; category: string } => {
  if (height <= 0 || weight <= 0) return { value: 0, category: '' };
  const bmi = weight / ((height / 100) ** 2);
  let category = '';
  if (bmi < 18.5) category = 'underweight';
  else if (bmi < 25) category = 'normal';
  else if (bmi < 30) category = 'overweight';
  else if (bmi < 35) category = 'obese';
  else if (bmi < 40) category = 'severe_obese';
  else category = 'morbid_obese';
  return { value: bmi, category };
};

// Calculate WHR and return category
const calculateWHR = (waist: number, hip: number, gender: string): { value: number; category: string } => {
  if (waist <= 0 || hip <= 0) return { value: 0, category: '' };
  const whr = waist / hip;
  let category = '';
  if (gender === 'male') {
    if (whr < 0.90) category = 'ideal';
    else if (whr < 1.00) category = 'elevated';
    else category = 'high';
  } else {
    if (whr < 0.85) category = 'ideal';
    else if (whr < 0.90) category = 'elevated';
    else category = 'high';
  }
  return { value: whr, category };
};

// Calculate neck category (convert cm to inches)
const calculateNeckCategory = (neckCm: number, gender: string): { valueInches: number; category: string } => {
  if (neckCm <= 0) return { valueInches: 0, category: '' };
  const neckInches = neckCm / 2.54;
  let category = '';
  if (gender === 'male') {
    if (neckInches < 16) category = 'ideal';
    else if (neckInches <= 17) category = 'borderline';
    else category = 'high';
  } else {
    if (neckInches < 14) category = 'ideal';
    else if (neckInches <= 15) category = 'borderline';
    else category = 'high';
  }
  return { valueInches: neckInches, category };
};

// Calculate Body Fat % using US Navy method
const calculateBodyFat = (
  height: number, // cm
  waist: number, // cm
  neck: number, // cm
  hip: number, // cm (only used for females)
  gender: string
): { value: number; category: string } => {
  if (height <= 0 || waist <= 0 || neck <= 0) return { value: 0, category: '' };
  
  let bodyFat = 0;
  if (gender === 'male') {
    // US Navy formula for men: 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height)) - 450
    bodyFat = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  } else {
    // US Navy formula for women: 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.22100 * log10(height)) - 450
    if (hip <= 0) return { value: 0, category: '' };
    bodyFat = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(height)) - 450;
  }
  
  // Clamp to reasonable values
  bodyFat = Math.max(5, Math.min(50, bodyFat));
  
  let category = '';
  if (gender === 'male') {
    if (bodyFat < 20) category = 'normal';
    else if (bodyFat < 25) category = 'overweight';
    else category = 'obese';
  } else {
    if (bodyFat < 30) category = 'normal';
    else if (bodyFat < 35) category = 'overweight';
    else category = 'obese';
  }
  return { value: bodyFat, category };
};

// Get age category from age number
const getAgeCategory = (age: number): string => {
  if (age < 18) return '';
  if (age < 30) return '18_29';
  if (age < 40) return '30_39';
  if (age < 50) return '40_49';
  if (age < 60) return '50_59';
  if (age < 70) return '60_69';
  if (age < 80) return '70_79';
  return '80_plus';
};

// ─── Animated Risk Gauge (SVG donut) ────────────────────────────────────────
const RiskGauge = ({ score, max, band }: { score: number; max: number; band: { label: string; color: string; description: string } }) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const from = animatedScore;
    const to = score;
    const duration = 800;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(Math.round(from + (to - from) * ease));
      if (t < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const pct = max > 0 ? Math.min(animatedScore / max, 1) : 0;
  const r = 58;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75; // 270° arc
  const strokeDash = arc * pct;

  const gaugeColor =
    pct <= 0.33 ? '#10b981' : pct <= 0.5 ? '#f59e0b' : pct <= 0.7 ? '#f97316' : '#ef4444';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-[135deg]">
          <circle cx="70" cy="70" r={r} fill="none" stroke="currentColor" strokeWidth="10"
            className="text-slate-100 dark:text-slate-800"
            strokeLinecap="round" strokeDasharray={`${arc} ${circ}`}
          />
          <circle cx="70" cy="70" r={r} fill="none" stroke={gaugeColor} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={`${strokeDash} ${circ}`}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black" style={{ color: gaugeColor }}>{animatedScore}</span>
          <span className="text-[10px] text-muted-foreground font-medium">/ {max}</span>
        </div>
      </div>
      <Badge className={cn('mt-1 text-sm py-1 px-3 font-semibold', {
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300': band.label === 'Low Risk',
        'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300': band.label === 'Moderate Risk',
        'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300': band.label === 'High Risk',
        'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300': band.label === 'Severe Risk',
      })}>{band.label}</Badge>
      <p className="text-[11px] text-muted-foreground mt-1.5 text-center max-w-[200px]">{band.description}</p>
    </div>
  );
};

// ─── Bayesian Posterior Bar ─────────────────────────────────────────────────
const BayesianBar = ({ result }: { result: BayesianRiskResult }) => {
  const segments = [
    { key: 'low', label: 'Low', pct: result.posterior.low, color: 'bg-emerald-500' },
    { key: 'elevated', label: 'Elevated', pct: result.posterior.elevated, color: 'bg-amber-500' },
    { key: 'critical', label: 'Critical', pct: result.posterior.critical, color: 'bg-red-500' },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Bayesian Risk Posterior</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {segments.map(s => (
          <div key={s.key} className={cn(s.color, 'transition-all duration-700')}
            style={{ width: `${(s.pct * 100).toFixed(1)}%` }}
            title={`${s.label}: ${(s.pct * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {segments.map(s => (
          <span key={s.key}>{s.label} {(s.pct * 100).toFixed(0)}%</span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground italic">{result.summary}</p>
    </div>
  );
};

// ─── Clinical Scores Dashboard ──────────────────────────────────────────────
const ClinicalScoresDashboard = ({ scores, trajectory }: { scores: ClinicalScores; trajectory: TrajectoryResult | null }) => {
  const cvColor = scores.qrisk3?.riskCategory === 'high' ? 'text-red-600' : scores.qrisk3?.riskCategory === 'intermediate' ? 'text-amber-600' : 'text-emerald-600';
  const dmColor = scores.findrisc?.riskCategory === 'very_high' || scores.findrisc?.riskCategory === 'high' ? 'text-red-600' : scores.findrisc?.riskCategory === 'moderate' ? 'text-amber-600' : 'text-emerald-600';
  const osaColor = scores.stopBang?.riskCategory === 'high' ? 'text-red-600' : scores.stopBang?.riskCategory === 'intermediate' ? 'text-amber-600' : 'text-emerald-600';
  const compositeColor = scores.compositeRisk.level === 'very_high' || scores.compositeRisk.level === 'high' ? 'text-red-600' : scores.compositeRisk.level === 'moderate' ? 'text-amber-600' : 'text-emerald-600';

  const trendIcon = trajectory
    ? trajectory.trend === 'improving' ? <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
    : trajectory.trend === 'worsening' ? <TrendingUp className="h-3.5 w-3.5 text-red-500" />
    : <Minus className="h-3.5 w-3.5 text-slate-400" />
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-bold text-slate-800 dark:text-white">Clinical Risk Engines</span>
        <Badge variant="outline" className="text-[9px] border-violet-300 text-violet-600">Evidence-Based</Badge>
      </div>

      {/* Composite Risk */}
      <div className={cn('flex items-center justify-between rounded-xl p-3 border',
        scores.compositeRisk.level === 'very_high' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700' :
        scores.compositeRisk.level === 'high' ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-700' :
        scores.compositeRisk.level === 'moderate' ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700' :
        'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700'
      )}>
        <div>
          <p className="text-[11px] text-muted-foreground font-medium">Composite Clinical Risk</p>
          <p className={cn('text-lg font-black capitalize', compositeColor)}>
            {scores.compositeRisk.level.replace('_', ' ')}
          </p>
        </div>
        <div className="text-right">
          <span className={cn('text-3xl font-black', compositeColor)}>{scores.compositeRisk.score}</span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>

      {/* Urgent Flags */}
      {scores.compositeRisk.urgentFlags.length > 0 && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-2.5 space-y-1">
          <p className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">Urgent Flags</p>
          {scores.compositeRisk.urgentFlags.map((flag, i) => (
            <p key={i} className="text-[11px] text-red-700 dark:text-red-300 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {flag}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {/* QRISK3-SA */}
        {scores.qrisk3 && (
          <div className="rounded-xl border p-3 bg-white dark:bg-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">QRISK3-SA</p>
              {scores.qrisk3.statin_indicated && <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-300">Statin indicated</Badge>}
            </div>
            <p className={cn('text-3xl font-black', cvColor)}>{scores.qrisk3.tenYearRisk}%</p>
            <p className="text-[10px] text-muted-foreground">10-yr CV risk</p>
            <div className="flex items-center gap-1">
              <HeartPulse className="h-3 w-3 text-slate-400" />
              <p className="text-[10px] text-slate-600 dark:text-slate-400">Heart age: <strong>{scores.qrisk3.heartAge}y</strong></p>
            </div>
            {scores.qrisk3.southAsianMultiplier > 1 && (
              <p className="text-[9px] text-violet-600 dark:text-violet-400">SA ×{scores.qrisk3.southAsianMultiplier}</p>
            )}
            <Badge variant="outline" className={cn('text-[9px]', cvColor === 'text-red-600' ? 'border-red-300' : cvColor === 'text-amber-600' ? 'border-amber-300' : 'border-emerald-300')}>
              {scores.qrisk3.riskCategory.charAt(0).toUpperCase() + scores.qrisk3.riskCategory.slice(1)} risk
            </Badge>
          </div>
        )}

        {/* FINDRISC */}
        {scores.findrisc && (
          <div className="rounded-xl border p-3 bg-white dark:bg-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">FINDRISC</p>
              {scores.findrisc.icmrAdjusted && <Badge className="text-[9px] bg-violet-100 text-violet-700 border-violet-300">ICMR</Badge>}
            </div>
            <p className={cn('text-3xl font-black', dmColor)}>{scores.findrisc.tenYearDiabetesRisk_percent}%</p>
            <p className="text-[10px] text-muted-foreground">10-yr DM risk</p>
            <Progress value={(scores.findrisc.score / 26) * 100} className="h-1.5" />
            <p className="text-[10px] text-slate-600 dark:text-slate-400">Score: {scores.findrisc.score}/26</p>
            <Badge variant="outline" className={cn('text-[9px]', dmColor === 'text-red-600' ? 'border-red-300' : dmColor === 'text-amber-600' ? 'border-amber-300' : 'border-emerald-300')}>
              {scores.findrisc.interpretation}
            </Badge>
          </div>
        )}

        {/* STOP-BANG */}
        {scores.stopBang && (
          <div className="rounded-xl border p-3 bg-white dark:bg-slate-800 space-y-1.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">STOP-BANG</p>
            <div className="flex items-end gap-1">
              <p className={cn('text-3xl font-black', osaColor)}>{scores.stopBang.score}</p>
              <p className="text-sm text-muted-foreground mb-1">/8</p>
            </div>
            <p className="text-[10px] text-muted-foreground">Sleep apnea risk</p>
            <div className="flex gap-0.5 flex-wrap">
              {Object.entries(scores.stopBang.components).map(([k, v]) => (
                <span key={k} className={cn('text-[10px] font-bold rounded px-1', v ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400')}>
                  {k}
                </span>
              ))}
            </div>
            <Badge variant="outline" className={cn('text-[9px]', osaColor === 'text-red-600' ? 'border-red-300' : osaColor === 'text-amber-600' ? 'border-amber-300' : 'border-emerald-300')}>
              {scores.stopBang.riskCategory.charAt(0).toUpperCase() + scores.stopBang.riskCategory.slice(1)} OSA risk
            </Badge>
          </div>
        )}

        {/* CKD-EPI */}
        {scores.ckdEpi && (
          <div className="rounded-xl border p-3 bg-white dark:bg-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">CKD-EPI 2021</p>
              {scores.ckdEpi.needsNephrologistReferral && <Badge className="text-[9px] bg-red-100 text-red-700 border-red-300">Refer</Badge>}
            </div>
            <p className={cn('text-2xl font-black', scores.ckdEpi.eGFR < 45 ? 'text-red-600' : scores.ckdEpi.eGFR < 60 ? 'text-amber-600' : 'text-emerald-600')}>
              {scores.ckdEpi.eGFR}
            </p>
            <p className="text-[10px] text-muted-foreground">eGFR mL/min/1.73m²</p>
            <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{scores.ckdEpi.ckdStage}: {scores.ckdEpi.ckdStageName}</p>
            {scores.ckdEpi.acrCategory && <p className="text-[10px] text-slate-500">ACR: {scores.ckdEpi.acrCategory}</p>}
            <p className="text-[10px] text-slate-500">CV risk ×{scores.ckdEpi.cvRiskMultiplier}</p>
          </div>
        )}
      </div>

      {/* Trajectory */}
      {trajectory && (
        <div className="rounded-xl border p-3 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Risk Trajectory</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {trendIcon}
              <p className="text-sm font-semibold capitalize text-slate-700 dark:text-slate-300">{trajectory.trend}</p>
              {trajectory.riskEscalationWarning && <Badge className="text-[9px] bg-red-100 text-red-700">Escalating</Badge>}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{trajectory.recommendation}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">90-day forecast</p>
            <p className="text-lg font-black text-slate-700 dark:text-slate-300">{trajectory.projectedScoreIn90Days}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Section completion indicators ──────────────────────────────────────────
const SectionDots = ({ sections, responses: resp }: { sections: typeof healthRiskSections; responses: RiskResponses }) => (
  <div className="flex gap-1.5 flex-wrap">
    {sections.map(section => {
      const answered = section.questions.filter(q => resp[q.id]).length;
      const total = section.questions.length;
      const pct = total > 0 ? answered / total : 0;
      const color = pct === 0 ? 'bg-slate-200 dark:bg-slate-700' :
        pct < 1 ? 'bg-amber-400 dark:bg-amber-500' : 'bg-emerald-500 dark:bg-emerald-400';
      return (
        <div key={section.id} className="flex items-center gap-1" title={`${section.title}: ${answered}/${total}`}>
          <div className={cn('w-2 h-2 rounded-full transition-colors duration-300', color)} />
          <span className="text-[10px] text-muted-foreground hidden md:block">{section.title}</span>
        </div>
      );
    })}
  </div>
);

const UserHealthRiskAssessment = () => {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [responses, setResponses] = useState<RiskResponses>({});
  const [savedAssessments, setSavedAssessments] = useState<HealthAssessmentRecord[]>([]);
  const [serverRecs, setServerRecs] = useState<string[]>([]);
  const [historyData, setHistoryData] = useState<Record<string, unknown> | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('weekly');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clinicalScores, setClinicalScores] = useState<ClinicalScores | null>(null);
  const [trajectory, setTrajectory] = useState<TrajectoryResult | null>(null);
  const [showClinicalInputs, setShowClinicalInputs] = useState(false);
  const [clinicalInputs, setClinicalInputs] = useState<ClinicalLabInputs>({
    ethnicity: 'south_asian',
    sbp: '', totalCholesterol_mmol: '', hdlCholesterol_mmol: '',
    hba1c_percent: '', creatinine_mgdL: '', urineACR_mgmmol: '',
    snoresLoudly: false, daytimeSleepiness: false, observedApneas: false,
    neckCm: '', familyPrematureCVD: false, atrialFibrillation: false,
  });
  
  // Measurement inputs for auto-calculation
  const [measurements, setMeasurements] = useState<Measurements>(() => {
    try {
      const draft = localStorage.getItem('hra_measurements_draft');
      if (draft) return JSON.parse(draft);
    } catch {}
    return { height: '', weight: '', age: '', gender: 'male', waist: '', hip: '', neck: '' };
  });

  // Restore responses draft from localStorage
  const [responsesLoaded, setResponsesLoaded] = useState(false);

  // Calculated values for display
  const calculatedValues = useMemo(() => {
    const height = parseFloat(measurements.height) || 0;
    const weight = parseFloat(measurements.weight) || 0;
    const age = parseInt(measurements.age) || 0;
    const waist = parseFloat(measurements.waist) || 0;
    const hip = parseFloat(measurements.hip) || 0;
    const neck = parseFloat(measurements.neck) || 0;
    const gender = measurements.gender;

    const bmi = calculateBMI(height, weight);
    const whr = calculateWHR(waist, hip, gender);
    const neckResult = calculateNeckCategory(neck, gender);
    const bodyFat = calculateBodyFat(height, waist, neck, hip, gender);
    const ageCategory = getAgeCategory(age);

    return { bmi, whr, neck: neckResult, bodyFat, ageCategory, gender };
  }, [measurements.height, measurements.weight, measurements.age, measurements.waist, measurements.hip, measurements.neck, measurements.gender]);

  // Use ref to track previous calculated values and avoid infinite loops
  const prevCalculatedRef = useRef<string>('');

  // Auto-update responses when measurements change
  useEffect(() => {
    // Create a stable key to compare if values actually changed
    const currentKey = JSON.stringify({
      age: calculatedValues.ageCategory,
      gender: measurements.gender,
      bmi: calculatedValues.bmi.category,
      whr: calculatedValues.whr.category,
      neck: calculatedValues.neck.category,
      bodyFat: calculatedValues.bodyFat.category,
    });

    // Skip if nothing changed
    if (currentKey === prevCalculatedRef.current) {
      return;
    }
    prevCalculatedRef.current = currentKey;

    // Build new responses object
    const updates: RiskResponses = {};

    // Auto-set age
    if (calculatedValues.ageCategory) {
      updates.age = calculatedValues.ageCategory;
    }

    // Auto-set gender
    if (measurements.gender) {
      updates.gender = measurements.gender;
    }

    // Auto-set BMI
    if (calculatedValues.bmi.category) {
      updates.bmi = calculatedValues.bmi.category;
    }

    // Auto-set WHR
    if (calculatedValues.whr.category) {
      updates.whr = calculatedValues.whr.category;
    }

    // Auto-set neck girth
    if (calculatedValues.neck.category) {
      updates.neck = calculatedValues.neck.category;
    }

    // Auto-set body fat
    if (calculatedValues.bodyFat.category) {
      updates.body_fat = calculatedValues.bodyFat.category;
    }

    // Only update if we have any values to set
    if (Object.keys(updates).length > 0) {
      setResponses(prev => ({ ...prev, ...updates }));
    }
  }, [calculatedValues, measurements.gender]);

  // Load profile data on mount
  useEffect(() => {
    if (currentUser) {
      const profile = currentUser as { height?: number; weight?: number; age?: number; dateOfBirth?: string; gender?: string };
      setMeasurements(prev => ({
        ...prev,
        height: profile.height?.toString() ?? prev.height,
        weight: profile.weight?.toString() ?? prev.weight,
        age: profile.age?.toString() ?? (profile.dateOfBirth
          ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)).toString()
          : prev.age),
        gender: (profile.gender as Measurements['gender']) ?? prev.gender,
      }));
    }
  }, [currentUser]);

  const totalQuestions = useMemo(() => {
    return healthRiskSections.reduce((sum, section) => sum + section.questions.length, 0);
  }, []);

  const completionPct = Math.round((Object.keys(responses).length / totalQuestions) * 100);
  const totalScore = calculateRiskScore(responses);
  const scoreBand = resolveScoreBand(totalScore);
  const latestAssessment = savedAssessments[0];
  const sectionBreakdown = useMemo(() => summarizeSections(responses), [responses]);
  const bayesianResult = useMemo(() => computeBayesianRisk(sectionBreakdown), [sectionBreakdown]);

  // Load assessment history (all periods)
  const loadHistory = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setLoading(true);
      const res = await api.get('/health-assessment/history', { params: { limit: 50, offset: 0 } });
      if (res.data?.success) {
        setHistoryData(res.data as Record<string, unknown>);
        const records: HealthAssessmentRecord[] = res.data.assessments || [];
        setSavedAssessments(records);
        // Compute trajectory from stored history
        const histPoints: AssessmentDataPoint[] = records.map((a) => ({
          assessedAt: a.assessedAt,
          score: a.score,
          riskLevel: a.riskLevel,
          bmi: a.bmi ?? undefined,
          clinicalScores: a.clinicalScores ?? undefined,
        }));
        setTrajectory(computeTrajectory(histPoints));
      }
    } catch {
      // Fallback: try the single-assessment endpoint
      try {
        const res = await api.get('/health-assessment');
        if (res.data?.assessment) {
          setSavedAssessments([res.data.assessment as HealthAssessmentRecord]);
        }
      } catch {
        // No previous assessments found — silent
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Restore responses from localStorage on mount
  useEffect(() => {
    try {
      const draft = localStorage.getItem('hra_responses_draft');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (Object.keys(parsed).length > 0) {
          setResponses(parsed);
          toast({ title: 'Draft Restored', description: 'Your previous in-progress assessment has been restored.' });
        }
      }
    } catch {}
    setResponsesLoaded(true);
  }, []);

  // Persist drafts to localStorage
  useEffect(() => {
    if (!responsesLoaded) return;
    try {
      localStorage.setItem('hra_responses_draft', JSON.stringify(responses));
    } catch {}
  }, [responses, responsesLoaded]);

  useEffect(() => {
    try {
      localStorage.setItem('hra_measurements_draft', JSON.stringify(measurements));
    } catch {}
  }, [measurements]);

  const handleSelectOption = (questionId: string, optionId: string) => {
    // Don't allow manual selection for auto-calculated questions
    if (AUTO_CALCULATED_QUESTIONS.includes(questionId)) {
      toast({
        title: 'Auto-calculated',
        description: 'This value is calculated automatically from your measurements.',
      });
      return;
    }
    setResponses((prev) => ({ ...prev, [questionId]: optionId }));
  };

  // Measurement validation constraints
  const MEASUREMENT_LIMITS: Record<string, { min: number; max: number }> = {
    age: { min: 1, max: 120 },
    height: { min: 50, max: 250 },
    weight: { min: 10, max: 300 },
    waist: { min: 30, max: 200 },
    hip: { min: 30, max: 200 },
    neck: { min: 15, max: 70 },
  };

  const handleMeasurementChange = (field: keyof Measurements, value: string) => {
    const limits = MEASUREMENT_LIMITS[field];
    if (limits && value !== '') {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) return;
      if (num > limits.max) value = String(limits.max);
    }
    setMeasurements(prev => ({ ...prev, [field]: value }));
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = () => {
    if (Object.keys(responses).length === 0) return;
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    setResponses({});
    setShowResetConfirm(false);
    try {
      localStorage.removeItem('hra_responses_draft');
      localStorage.removeItem('hra_measurements_draft');
    } catch {}
  };

  const handleSaveAssessment = async () => {
    if (!currentUser?.id) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'User information not found. Please log in again.',
      });
      return;
    }

    if (completionPct < 50) {
      toast({
        variant: 'destructive',
        title: 'Incomplete Assessment',
        description: 'Please answer at least 50% of the questions before saving.',
      });
      return;
    }

    const heightVal = parseFloat(measurements.height);
    const weightVal = parseFloat(measurements.weight);
    const ageVal = parseInt(measurements.age);

    if (!ageVal || !heightVal || !weightVal) {
      toast({
        variant: 'destructive',
        title: 'Missing measurements',
        description: 'Please enter your age, height and weight before saving.',
      });
      return;
    }

    try {
      setSubmitting(true);
      // Compute clinical scores client-side for instant display
      const clinicalInput: ClinicalEnginesInput = {
        age: ageVal,
        sex: measurements.gender === 'male' ? 'male' : 'female',
        ethnicity: clinicalInputs.ethnicity,
        bmi: calculatedValues.bmi.value > 0 ? calculatedValues.bmi.value : undefined,
        waistCm: parseFloat(measurements.waist) || undefined,
        neckCircumferenceCm: clinicalInputs.neckCm ? parseFloat(clinicalInputs.neckCm) : undefined,
        sbp: clinicalInputs.sbp ? parseFloat(clinicalInputs.sbp) : undefined,
        bpTreated: responses.hx_hypertension === 'controlled' || responses.hx_hypertension === 'uncontrolled',
        smoking: (() => {
          const s = responses.smoking;
          if (s === 'never') return 'never';
          if (s === 'occasional') return 'light';
          if (s === 'regular_lt10') return 'moderate';
          if (s === 'heavy_gte10') return 'heavy';
          return 'never';
        })() as ClinicalEnginesInput['smoking'],
        diabetes: responses.hx_diabetes !== undefined && responses.hx_diabetes !== 'none' ? 'type2' : 'none',
        hypertension: responses.hx_hypertension !== undefined && responses.hx_hypertension !== 'none',
        atrialFibrillation: clinicalInputs.atrialFibrillation,
        familyHistoryPrematureCVD: clinicalInputs.familyPrematureCVD,
        familyDiabetes: responses.fh_diabetes === 'yes' ? 'first_degree' : 'none',
        physicalActivityMinPerDay: responses.activity === '150_mod' ? 60 : responses.activity === '75_150_mod' ? 40 : responses.activity === 'lt75' ? 15 : 0,
        eatsVegetablesFruitsDaily: responses.food === 'balanced',
        bpMedication: responses.hx_hypertension === 'controlled',
        historyHighGlucose: responses.hx_diabetes !== undefined && responses.hx_diabetes !== 'none',
        snoresLoudly: clinicalInputs.snoresLoudly,
        daytimeSleepiness: clinicalInputs.daytimeSleepiness,
        observedApneas: clinicalInputs.observedApneas,
        hba1c_percent: clinicalInputs.hba1c_percent ? parseFloat(clinicalInputs.hba1c_percent) : undefined,
        totalCholesterol_mmol: clinicalInputs.totalCholesterol_mmol ? parseFloat(clinicalInputs.totalCholesterol_mmol) : undefined,
        hdlCholesterol_mmol: clinicalInputs.hdlCholesterol_mmol ? parseFloat(clinicalInputs.hdlCholesterol_mmol) : undefined,
        serumCreatinine_mgdL: clinicalInputs.creatinine_mgdL ? parseFloat(clinicalInputs.creatinine_mgdL) : undefined,
        urineACR_mgmmol: clinicalInputs.urineACR_mgmmol ? parseFloat(clinicalInputs.urineACR_mgmmol) : undefined,
      };
      const newClinicalScores = computeAllClinicalScores(clinicalInput);
      setClinicalScores(newClinicalScores);

      const payload = {
        age: ageVal,
        gender: measurements.gender,
        height: heightVal,
        weight: weightVal,
        waist: parseFloat(measurements.waist) || undefined,
        hip: parseFloat(measurements.hip) || undefined,
        bmi: calculatedValues.bmi.value > 0 ? parseFloat(calculatedValues.bmi.value.toFixed(2)) : undefined,
        whr: calculatedValues.whr.value > 0 ? parseFloat(calculatedValues.whr.value.toFixed(3)) : undefined,
        smoking: (() => {
          switch (responses.smoking) {
            case 'occasional':
            case 'regular_lt10':
            case 'heavy_gte10':
              return 'current';
            default:
              return 'never';
          }
        })(),
        alcohol: (() => {
          switch (responses.alcohol) {
            case 'occasional': return 'occasionally';
            case 'moderate': return 'weekly';
            case 'heavy_daily':
            case 'binge':
              return 'daily';
            default:
              return 'none';
          }
        })(),
        exercise_frequency: (() => {
          switch (responses.activity) {
            case '150_mod': return 'active';
            case '75_150_mod': return 'moderate';
            case 'lt75': return 'light';
            default: return 'sedentary';
          }
        })(),
        hypertension: responses.hx_hypertension && responses.hx_hypertension !== 'none' ? 'yes' : 'no',
        diabetes: responses.hx_diabetes && responses.hx_diabetes !== 'none' ? 'yes' : 'no',
        heart_disease: responses.hx_heart && responses.hx_heart !== 'none' ? 'yes' : 'no',
        cholesterol: responses.hx_cholesterol && responses.hx_cholesterol !== 'none' ? 'yes' : 'no',
        mental_health: (() => {
          switch (responses.mental_depression) {
            case 'managed': return 'stressed';
            case 'unmanaged': return 'depressed';
            default: return 'normal';
          }
        })(),
        family_heart_disease: responses.fh_heart === 'yes' ? 'yes' : 'no',
        family_diabetes: responses.fh_diabetes === 'yes' ? 'yes' : 'no',
        family_cancer: responses.fh_cancer === 'yes' ? 'yes' : 'no',
        stress_level: (() => {
          switch (responses.stress) {
            case 'low': return 3;
            case 'moderate': return 6;
            case 'high': return 9;
            default: return 5;
          }
        })(),
        sleep_hours: (() => {
          switch (responses.sleep) {
            case '7_8': return 7.5;
            case '5_6': return 5.5;
            case 'lt5_gt9': return 4.5;
            default: return 7;
          }
        })(),
        diet_quality: (() => {
          switch (responses.food) {
            case 'balanced': return 'good';
            case 'fastfood_1_2': return 'fair';
            default: return 'poor';
          }
        })(),
        responses,
        // Clinical inputs sent to backend for persistence
        ethnicity: clinicalInputs.ethnicity,
        sbp: clinicalInputs.sbp || undefined,
        neck_cm: clinicalInputs.neckCm || undefined,
        snores_loudly: clinicalInputs.snoresLoudly ? 'yes' : 'no',
        daytime_sleepiness: clinicalInputs.daytimeSleepiness ? 'yes' : 'no',
        observed_apneas: clinicalInputs.observedApneas ? 'yes' : 'no',
        hba1c: clinicalInputs.hba1c_percent || undefined,
        total_chol_mmol: clinicalInputs.totalCholesterol_mmol || undefined,
        hdl_mmol: clinicalInputs.hdlCholesterol_mmol || undefined,
        creatinine_mgdl: clinicalInputs.creatinine_mgdL || undefined,
        urine_acr: clinicalInputs.urineACR_mgmmol || undefined,
        af: clinicalInputs.atrialFibrillation ? 'yes' : 'no',
        family_heart_disease_premature: clinicalInputs.familyPrematureCVD ? 'yes' : 'no',
      };

      const res = await api.post('/health-assessment/save', payload);
      
      if (res.data?.success) {
        toast({
          title: 'Assessment Saved',
          description: `Risk level: ${res.data.riskAssessment?.riskLevel || 'N/A'} — Score: ${res.data.riskAssessment?.score ?? 0}/100`,
        });
        // Merge riskAssessment into the saved assessment object
        const merged = {
          ...res.data.assessment,
          riskAssessment: res.data.riskAssessment,
        };
        setSavedAssessments((prev) => [merged, ...prev]);
        // Capture server-generated recommendations
        if (res.data.riskAssessment?.recommendations) {
          setServerRecs(res.data.riskAssessment.recommendations);
        }
        // Reload full history to refresh period summaries
        loadHistory();
        // Clear draft since assessment was saved
        try {
          localStorage.removeItem('hra_responses_draft');
          localStorage.removeItem('hra_measurements_draft');
        } catch {}
      }
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save assessment';
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 px-4 md:px-6 py-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
                <Shield className="w-6 h-6" />
              </div>
              <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                Health Assessment
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Your Health Risk Assessment</h1>
            <p className="text-slate-300 text-sm md:text-base">
              Personalized health evaluation across lifestyle, vitals, medical history, and wellness factors.
              {currentUser && <span className="text-teal-300"> (Account: {currentUser.firstName})</span>}
            </p>
            {/* Quick Stats */}
            {savedAssessments.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-4">
                <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
                  <Activity className="h-3.5 w-3.5 text-teal-300" />
                  <span className="text-xs font-medium">{savedAssessments.length} Assessment{savedAssessments.length > 1 ? 's' : ''}</span>
                </div>
                {(latestAssessment?.riskLevel || latestAssessment?.risk_level) && (
                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
                    <Shield className="h-3.5 w-3.5 text-teal-300" />
                    <span className="text-xs font-medium">Latest: {latestAssessment?.riskLevel || latestAssessment?.risk_level}</span>
                  </div>
                )}
                {(latestAssessment?.assessedAt || latestAssessment?.assessed_at) && (
                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
                    <Clock className="h-3.5 w-3.5 text-teal-300" />
                    <span className="text-xs font-medium">
                      {new Date((latestAssessment?.assessedAt || latestAssessment?.assessed_at) as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Assessment */}
          <div className="lg:col-span-2 space-y-6">
            {/* Body Measurements - Auto Calculator */}
            <Card className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-800/80 border-teal-200/80 dark:border-teal-700/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-white">
                  <Calculator className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  Body Measurements
                </CardTitle>
                <CardDescription>
                  Enter your measurements and we'll automatically calculate BMI, WHR, Body Fat %, and more
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic Info Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="age" className="text-sm font-medium flex items-center gap-1">
                      <User className="h-3 w-3" /> Age
                    </Label>
                    <Input
                      id="age"
                      type="number"
                      placeholder="Years"
                      min={1}
                      max={120}
                      value={measurements.age}
                      onChange={(e) => handleMeasurementChange('age', e.target.value)}
                      className="bg-white dark:bg-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender" className="text-sm font-medium">Gender</Label>
                    <select
                      id="gender"
                      value={measurements.gender}
                      onChange={(e) => handleMeasurementChange('gender', e.target.value as any)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-white dark:bg-slate-700 text-sm"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height" className="text-sm font-medium flex items-center gap-1">
                      <Ruler className="h-3 w-3" /> Height (cm)
                    </Label>
                    <Input
                      id="height"
                      type="number"
                      placeholder="cm"
                      min={50}
                      max={250}
                      value={measurements.height}
                      onChange={(e) => handleMeasurementChange('height', e.target.value)}
                      className="bg-white dark:bg-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight" className="text-sm font-medium flex items-center gap-1">
                      <Scale className="h-3 w-3" /> Weight (kg)
                    </Label>
                    <Input
                      id="weight"
                      type="number"
                      placeholder="kg"
                      min={10}
                      max={300}
                      value={measurements.weight}
                      onChange={(e) => handleMeasurementChange('weight', e.target.value)}
                      className="bg-white dark:bg-slate-700"
                    />
                  </div>
                </div>

                {/* Body Measurements Row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="waist" className="text-sm font-medium">Waist (cm)</Label>
                    <Input
                      id="waist"
                      type="number"
                      placeholder="At navel level"
                      min={30}
                      max={200}
                      value={measurements.waist}
                      onChange={(e) => handleMeasurementChange('waist', e.target.value)}
                      className="bg-white dark:bg-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hip" className="text-sm font-medium">Hip (cm)</Label>
                    <Input
                      id="hip"
                      type="number"
                      placeholder="Widest point"
                      min={30}
                      max={200}
                      value={measurements.hip}
                      onChange={(e) => handleMeasurementChange('hip', e.target.value)}
                      className="bg-white dark:bg-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="neck" className="text-sm font-medium">Neck (cm)</Label>
                    <Input
                      id="neck"
                      type="number"
                      placeholder="Below larynx"
                      min={15}
                      max={70}
                      value={measurements.neck}
                      onChange={(e) => handleMeasurementChange('neck', e.target.value)}
                      className="bg-white dark:bg-slate-700"
                    />
                  </div>
                </div>

                <Separator />

                {/* Calculated Results */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-300">
                    Auto-Calculated Values
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className={cn(
                      "p-3 rounded-lg border text-center",
                      calculatedValues.bmi.category === 'normal' ? 'bg-green-50 border-green-200 dark:bg-green-900/20' :
                      calculatedValues.bmi.category === 'overweight' ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20' :
                      calculatedValues.bmi.category ? 'bg-red-50 border-red-200 dark:bg-red-900/20' : 'bg-slate-50 border-slate-200 dark:bg-slate-700'
                    )}>
                      <p className="text-xs text-muted-foreground">BMI</p>
                      <p className="text-xl font-bold">{calculatedValues.bmi.value ? calculatedValues.bmi.value.toFixed(1) : '--'}</p>
                      <p className="text-xs capitalize">{calculatedValues.bmi.category?.replace('_', ' ') || 'Enter height & weight'}</p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-lg border text-center",
                      calculatedValues.whr.category === 'ideal' ? 'bg-green-50 border-green-200 dark:bg-green-900/20' :
                      calculatedValues.whr.category === 'elevated' ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20' :
                      calculatedValues.whr.category ? 'bg-red-50 border-red-200 dark:bg-red-900/20' : 'bg-slate-50 border-slate-200 dark:bg-slate-700'
                    )}>
                      <p className="text-xs text-muted-foreground">Waist-Hip Ratio</p>
                      <p className="text-xl font-bold">{calculatedValues.whr.value ? calculatedValues.whr.value.toFixed(2) : '--'}</p>
                      <p className="text-xs capitalize">{calculatedValues.whr.category || 'Enter waist & hip'}</p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-lg border text-center",
                      calculatedValues.neck.category === 'ideal' ? 'bg-green-50 border-green-200 dark:bg-green-900/20' :
                      calculatedValues.neck.category === 'borderline' ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20' :
                      calculatedValues.neck.category ? 'bg-red-50 border-red-200 dark:bg-red-900/20' : 'bg-slate-50 border-slate-200 dark:bg-slate-700'
                    )}>
                      <p className="text-xs text-muted-foreground">Neck Girth</p>
                      <p className="text-xl font-bold">{calculatedValues.neck.valueInches ? `${calculatedValues.neck.valueInches.toFixed(1)}"` : '--'}</p>
                      <p className="text-xs capitalize">{calculatedValues.neck.category || 'Enter neck measurement'}</p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-lg border text-center",
                      calculatedValues.bodyFat.category === 'normal' ? 'bg-green-50 border-green-200 dark:bg-green-900/20' :
                      calculatedValues.bodyFat.category === 'overweight' ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20' :
                      calculatedValues.bodyFat.category ? 'bg-red-50 border-red-200 dark:bg-red-900/20' : 'bg-slate-50 border-slate-200 dark:bg-slate-700'
                    )}>
                      <p className="text-xs text-muted-foreground">Body Fat %</p>
                      <p className="text-xl font-bold">{calculatedValues.bodyFat.value ? `${calculatedValues.bodyFat.value.toFixed(1)}%` : '--'}</p>
                      <p className="text-xs capitalize">{calculatedValues.bodyFat.category || 'Enter all measurements'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Clinical Lab Values — Optional Advanced Section */}
            <Card className="border-violet-200/70 dark:border-violet-700/40">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-white text-base">
                    <FlaskConical className="h-4 w-4 text-violet-500" />
                    Lab Values &amp; Advanced Inputs
                    <Badge variant="outline" className="text-[9px] border-violet-300 text-violet-600">Unlocks QRISK3 / FINDRISC / STOP-BANG / CKD-EPI</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowClinicalInputs(p => !p)} className="text-violet-600 hover:text-violet-700 text-xs">
                    {showClinicalInputs ? 'Hide' : 'Add Lab Values'}
                  </Button>
                </div>
                <CardDescription className="text-[11px]">Optional. Enables validated clinical algorithms calibrated for South Asian populations.</CardDescription>
              </CardHeader>
              {showClinicalInputs && (
                <CardContent className="space-y-4">
                  {/* Ethnicity */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium">Ethnicity</Label>
                      <select
                        value={clinicalInputs.ethnicity}
                        onChange={(e) => setClinicalInputs(p => ({ ...p, ethnicity: e.target.value as ClinicalLabInputs['ethnicity'] }))}
                        className="mt-1 w-full text-sm rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      >
                        <option value="south_asian">South Asian (Indian/Pakistani/Sri Lankan)</option>
                        <option value="white">White / European</option>
                        <option value="black">Black / Afro-Caribbean</option>
                        <option value="chinese">East Asian / Chinese</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Systolic BP (mmHg)</Label>
                      <Input type="number" placeholder="e.g. 130" value={clinicalInputs.sbp} min={60} max={250}
                        onChange={(e) => setClinicalInputs(p => ({ ...p, sbp: e.target.value }))} className="mt-1 text-sm" />
                    </div>
                  </div>
                  {/* Lipids */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Lipid Panel (optional, improves QRISK3 accuracy)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Total Cholesterol (mmol/L)</Label>
                        <Input type="number" placeholder="e.g. 5.2" step="0.1" value={clinicalInputs.totalCholesterol_mmol}
                          onChange={(e) => setClinicalInputs(p => ({ ...p, totalCholesterol_mmol: e.target.value }))} className="mt-1 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">HDL Cholesterol (mmol/L)</Label>
                        <Input type="number" placeholder="e.g. 1.3" step="0.1" value={clinicalInputs.hdlCholesterol_mmol}
                          onChange={(e) => setClinicalInputs(p => ({ ...p, hdlCholesterol_mmol: e.target.value }))} className="mt-1 text-sm" />
                      </div>
                    </div>
                  </div>
                  {/* Metabolic */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Metabolic Panel (improves FINDRISC)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">HbA1c (%)</Label>
                        <Input type="number" placeholder="e.g. 5.8" step="0.1" value={clinicalInputs.hba1c_percent}
                          onChange={(e) => setClinicalInputs(p => ({ ...p, hba1c_percent: e.target.value }))} className="mt-1 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Serum Creatinine (mg/dL)</Label>
                        <Input type="number" placeholder="e.g. 0.9" step="0.01" value={clinicalInputs.creatinine_mgdL}
                          onChange={(e) => setClinicalInputs(p => ({ ...p, creatinine_mgdL: e.target.value }))} className="mt-1 text-sm" />
                        <p className="text-[10px] text-muted-foreground mt-0.5">Enables CKD-EPI eGFR calculation</p>
                      </div>
                      <div>
                        <Label className="text-xs">Urine ACR (mg/mmol)</Label>
                        <Input type="number" placeholder="e.g. 2.5" step="0.1" value={clinicalInputs.urineACR_mgmmol}
                          onChange={(e) => setClinicalInputs(p => ({ ...p, urineACR_mgmmol: e.target.value }))} className="mt-1 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Neck Circumference (cm)</Label>
                        <Input type="number" placeholder="e.g. 38" value={clinicalInputs.neckCm}
                          onChange={(e) => setClinicalInputs(p => ({ ...p, neckCm: e.target.value }))} className="mt-1 text-sm" />
                        <p className="text-[10px] text-muted-foreground mt-0.5">Used in STOP-BANG scoring</p>
                      </div>
                    </div>
                  </div>
                  {/* STOP-BANG sleep questions */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Sleep &amp; OSA Screening (STOP-BANG)</p>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { key: 'snoresLoudly' as const, label: 'S — Do you snore loudly (heard through closed door)?' },
                        { key: 'daytimeSleepiness' as const, label: 'T — Do you often feel tired, fatigued or sleepy during the day?' },
                        { key: 'observedApneas' as const, label: 'O — Has anyone observed you stop breathing during sleep?' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2.5 cursor-pointer rounded-lg border p-2.5 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors">
                          <input type="checkbox" checked={clinicalInputs[key]}
                            onChange={(e) => setClinicalInputs(p => ({ ...p, [key]: e.target.checked }))}
                            className="rounded border-slate-300 accent-violet-600 h-4 w-4"
                          />
                          <span className="text-xs text-slate-700 dark:text-slate-300">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* Cardiac history */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Cardiac History (improves QRISK3)</p>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { key: 'familyPrematureCVD' as const, label: 'Family member had heart attack before age 55 (men) or 65 (women)?' },
                        { key: 'atrialFibrillation' as const, label: 'Diagnosed with atrial fibrillation (AF/AFib)?' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2.5 cursor-pointer rounded-lg border p-2.5 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors">
                          <input type="checkbox" checked={clinicalInputs[key]}
                            onChange={(e) => setClinicalInputs(p => ({ ...p, [key]: e.target.checked }))}
                            className="rounded border-slate-300 accent-violet-600 h-4 w-4"
                          />
                          <span className="text-xs text-slate-700 dark:text-slate-300">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Progress + Risk Score */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 transition-colors overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-white">
                  <Activity className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  Assessment Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Progress bar + section dots */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-white">{completionPct}% Complete</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {Object.keys(responses).length} of {totalQuestions} questions
                    </span>
                  </div>
                  <Progress value={completionPct} className="h-2" />
                  <div className="mt-2">
                    <SectionDots sections={healthRiskSections} responses={responses} />
                  </div>
                </div>

                <Separator />

                {/* Animated risk gauge */}
                <RiskGauge score={totalScore} max={MAX_THEORETICAL_SCORE} band={scoreBand} />

                {/* Bayesian Risk Bar */}
                {Object.keys(responses).length >= 3 && (
                  <>
                    <Separator />
                    <BayesianBar result={bayesianResult} />
                  </>
                )}

                {/* Clinical Scores Dashboard */}
                {clinicalScores && (
                  <>
                    <Separator />
                    <ClinicalScoresDashboard scores={clinicalScores} trajectory={trajectory} />
                  </>
                )}

                <Separator />

                <div className="flex gap-2">
                  <Button 
                    onClick={handleSaveAssessment}
                    disabled={completionPct === 0 || submitting}
                    className="flex-1 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white shadow-lg shadow-teal-500/20"
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4 mr-2" />Save Assessment</>
                    )}
                  </Button>
                  {showResetConfirm ? (
                    <div className="flex gap-1">
                      <Button onClick={confirmReset} variant="destructive" size="sm">
                        Confirm
                      </Button>
                      <Button onClick={() => setShowResetConfirm(false)} variant="ghost" size="sm">
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      onClick={handleReset}
                      variant="outline"
                      disabled={Object.keys(responses).length === 0}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Assessment Form */}
            <Card>
              <CardHeader>
                <CardTitle>Health Questionnaire</CardTitle>
                <CardDescription>
                  Answer the questions below to get a personalized health risk assessment. Questions marked with ✓ are auto-calculated from your measurements.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] lg:h-[calc(100vh-260px)] pr-4">
                  <div className="space-y-8">
                    {healthRiskSections.map((section) => {
                      const Icon = sectionIconMap[section.id] ?? HeartPulse;
                      return (
                        <div key={section.id} className="space-y-4 pb-6 border-b last:border-b-0">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-teal-100/50 dark:bg-teal-900/30">
                              <Icon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{section.title}</h3>
                              <p className="text-sm text-muted-foreground">{section.subtitle}</p>
                            </div>
                          </div>

                          <div className="space-y-4 ml-0 md:ml-11">
                            {section.questions.map((question) => {
                              const isAutoCalculated = AUTO_CALCULATED_QUESTIONS.includes(question.id);
                              return (
                              <div key={question.id} className={cn(
                                "space-y-2 p-3 rounded-lg",
                                isAutoCalculated && "bg-teal-50/50 dark:bg-teal-900/10 border border-teal-200/50 dark:border-teal-800/50"
                              )}>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm font-medium">{question.title}</label>
                                  {isAutoCalculated && (
                                    <Badge variant="outline" className="text-[10px] bg-teal-100 text-teal-700 border-teal-300">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Auto-calculated
                                    </Badge>
                                  )}
                                </div>
                                {question.helper && (
                                  <p className="text-xs text-muted-foreground">{question.helper}</p>
                                )}
                                {isAutoCalculated && !responses[question.id] && (
                                  <p className="text-xs text-amber-600 dark:text-amber-400">
                                    Enter your measurements above to auto-calculate this value
                                  </p>
                                )}
                                <div className="space-y-2">
                                  {question.options.map((option) => (
                                    <div
                                      key={option.id}
                                      className={cn(
                                        "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                        isAutoCalculated 
                                          ? responses[question.id] === option.id 
                                            ? 'bg-teal-100 dark:bg-teal-800/30' 
                                            : 'opacity-60'
                                          : responses[question.id] === option.id
                                            ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-300 dark:border-teal-700 shadow-sm'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent'
                                      )}
                                      onClick={() => handleSelectOption(question.id, option.id)}
                                    >
                                      <input
                                        type="radio"
                                        name={question.id}
                                        value={option.id}
                                        checked={responses[question.id] === option.id}
                                        onChange={() => handleSelectOption(question.id, option.id)}
                                        disabled={isAutoCalculated}
                                        className="w-4 h-4"
                                      />
                                      <div className="flex-1">
                                        <label className={cn(
                                          "text-sm font-medium",
                                          isAutoCalculated ? "cursor-default" : "cursor-pointer"
                                        )}>
                                          {option.label}
                                        </label>
                                        {option.description && (
                                          <p className="text-xs text-muted-foreground">{option.description}</p>
                                        )}
                                      </div>
                                      {option.badge && (
                                        <Badge variant="outline" className="text-[10px]">
                                          +{option.score}
                                        </Badge>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Insights & History */}
          <div className="space-y-6">
            {/* Loading indicator */}
            {loading && (
              <Card className="border-slate-200/50">
                <CardContent className="py-8 flex flex-col items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                  <p className="text-sm text-muted-foreground">Loading your health data...</p>
                </CardContent>
              </Card>
            )}

            {/* Risk Insights */}
            {!loading && totalScore > 0 && (
              <Card className="border-amber-200/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-600" />
                    Key Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {bayesianResult?.alerts && bayesianResult.alerts.length > 0 ? (
                    <div className="space-y-2">
                      {bayesianResult.alerts.slice(0, 3).map((alert) => (
                        <div
                          key={alert.node}
                          className="flex items-start gap-2 p-2 rounded bg-amber-50/50 border border-amber-200/50"
                        >
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{alert.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {Math.round(alert.ratio * 100)}% contribution to risk
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Answer more questions to get personalized insights.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Period-Based Score Tracking */}
            <Card className="border-slate-200/80 dark:border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Score Tracker
                </CardTitle>
                <CardDescription>
                  {historyData?.total || savedAssessments.length} assessment(s) recorded
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Period Selector */}
                <div className="flex flex-wrap gap-1">
                  {([
                    { key: 'daily', label: '24h', icon: '🌙' },
                    { key: 'weekly', label: 'Week', icon: '📊' },
                    { key: 'monthly', label: 'Month', icon: '🗓️' },
                    { key: 'quarterly', label: 'Quarter', icon: '📈' },
                    { key: 'halfYearly', label: '6 Months', icon: '⏳' },
                    { key: 'annual', label: 'Annual', icon: '🎂' },
                  ] as const).map(p => {
                    const summary = historyData?.periodSummaries?.[p.key];
                    const isActive = selectedPeriod === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => setSelectedPeriod(p.key)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border',
                          isActive
                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm shadow-teal-500/20'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-teal-300',
                          summary?.count > 0 && !isActive && 'border-teal-200 dark:border-teal-800'
                        )}
                      >
                        <span className="mr-1">{p.icon}</span>{p.label}
                        {summary?.count > 0 && (
                          <span className={cn(
                            'ml-1 px-1 py-0.5 rounded text-[9px]',
                            isActive ? 'bg-white/20' : 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300'
                          )}>{summary.count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Daily cycle indicator */}
                {selectedPeriod === 'daily' && historyData?.dailyCycle && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/50 dark:border-indigo-800/30 text-[11px] text-indigo-700 dark:text-indigo-400">
                    <Clock className="h-3 w-3" />
                    <span className="font-medium">24h cycle: {historyData.dailyCycle.label}</span>
                  </div>
                )}

                {/* Period Summary Card */}
                {(() => {
                  const summary = historyData?.periodSummaries?.[selectedPeriod];
                  if (!summary || summary.count === 0) {
                    return (
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No assessments in this period yet.
                        <br />
                        <span className="text-xs">Take an assessment to start tracking!</span>
                      </div>
                    );
                  }
                  const TrendIcon = summary.trend === 'improving' ? TrendingDown : summary.trend === 'worsening' ? TrendingUp : Minus;
                  const trendColor = summary.trend === 'improving' ? 'text-emerald-600' : summary.trend === 'worsening' ? 'text-red-500' : 'text-slate-400';
                  const trendLabel = summary.trend === 'improving' ? 'Improving' : summary.trend === 'worsening' ? 'Worsening' : 'Stable';
                  const levelColors: Record<string, string> = {
                    LOW: 'text-emerald-600',
                    MILD: 'text-blue-600',
                    MODERATE: 'text-amber-600',
                    HIGH: 'text-orange-600',
                    VERY_HIGH: 'text-red-600',
                  };

                  return (
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold text-slate-800 dark:text-white">{summary.avgScore}</div>
                          <div className="text-xs text-muted-foreground">avg score / 100</div>
                        </div>
                        <div className="text-right">
                          <div className={cn('text-sm font-semibold', levelColors[summary.latestLevel] || 'text-slate-600')}>
                            {summary.latestLevel?.replace('_', ' ') || '—'}
                          </div>
                          <div className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
                            <TrendIcon className="h-3 w-3" /> {trendLabel}
                          </div>
                        </div>
                      </div>

                      {/* Mini sparkline of scores in this period */}
                      {(() => {
                        const periodItems = (historyData?.assessments || [])
                          .filter((a: any) => a.periods?.[selectedPeriod])
                          .reverse(); // oldest first for chart
                        if (periodItems.length < 2) return null;
                        const scores = periodItems.map((a: any) => a.score);
                        const maxS = Math.max(...scores, 100);
                        const minS = Math.min(...scores, 0);
                        const range = maxS - minS || 1;
                        const width = 200;
                        const height = 40;
                        const points = scores.map((s: number, i: number) => {
                          const x = (i / (scores.length - 1)) * width;
                          const y = height - ((s - minS) / range) * (height - 4) - 2;
                          return `${x},${y}`;
                        }).join(' ');
                        return (
                          <div className="pt-1">
                            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10 overflow-visible">
                              <polyline
                                points={points}
                                fill="none"
                                stroke="url(#sparkGrad)"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <defs>
                                <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
                                  <stop offset="0%" stopColor="#14b8a6" />
                                  <stop offset="100%" stopColor="#0891b2" />
                                </linearGradient>
                              </defs>
                              {/* Last point dot */}
                              {(() => {
                                const last = points.split(' ').pop()?.split(',');
                                if (!last) return null;
                                return <circle cx={last[0]} cy={last[1]} r="3" fill="#0891b2" />;
                              })()}
                            </svg>
                            <div className="flex justify-between text-[10px] text-muted-foreground -mt-1">
                              <span>{new Date(periodItems[0].assessedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                              <span>{scores.length} assessments</span>
                              <span>{new Date(periodItems[periodItems.length - 1].assessedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Birthday Annual Milestone + Monthly Monitoring */}
                {historyData?.birthday && (
                  <div className="bg-gradient-to-r from-violet-50 via-pink-50 to-amber-50 dark:from-violet-900/20 dark:via-pink-900/10 dark:to-amber-900/10 rounded-xl p-3 border border-violet-200/50 dark:border-violet-800/30">
                    <div className="flex items-center gap-2 mb-1">
                      <Gift className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      <span className="text-sm font-semibold text-violet-800 dark:text-violet-300">Birthday Health Year</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">
                        {historyData.birthday.daysUntilBirthday === 0
                          ? '🎉 Happy Birthday!'
                          : `${historyData.birthday.daysUntilBirthday} days until your birthday`}
                      </span>
                      <span className="text-violet-600 dark:text-violet-400 font-medium">
                        {historyData.periodSummaries?.annual?.count || 0} check-ups this year
                      </span>
                    </div>
                    {/* Birthday year progress bar */}
                    {(() => {
                      const bday = historyData.birthday;
                      if (!bday.annualPeriodStart || !bday.annualPeriodEnd) return null;
                      const start = new Date(bday.annualPeriodStart).getTime();
                      const end = new Date(bday.annualPeriodEnd).getTime();
                      const now = Date.now();
                      const pct = Math.round(((now - start) / (end - start)) * 100);
                      return (
                        <div className="mt-2">
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                            <span>{new Date(bday.annualPeriodStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                            <span>{pct}% of health year</span>
                            <span>{new Date(bday.annualPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          </div>
                          <div className="h-1.5 bg-violet-100 dark:bg-violet-900/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Monthly Monitoring Grid — 12 birthday-month buckets */}
                    {historyData.birthday.monthlyMonitoring && historyData.birthday.monthlyMonitoring.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] font-medium text-violet-700 dark:text-violet-400 mb-1.5">Monthly Monitoring (Birthday → Birthday)</div>
                        <div className="grid grid-cols-6 gap-1">
                          {historyData.birthday.monthlyMonitoring.map((m: any) => {
                            const hasData = m.count > 0;
                            const scoreColor = !hasData ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                              : m.avgScore < 15 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                              : m.avgScore < 30 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                              : m.avgScore < 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                              : m.avgScore < 70 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
                            return (
                              <div
                                key={m.month}
                                className={cn(
                                  'rounded-md px-1 py-1.5 text-center transition-all',
                                  scoreColor,
                                  m.isCurrent && 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-1'
                                )}
                                title={`${m.label}: ${hasData ? `${m.avgScore}/100 (${m.count} assessments)` : 'No data'}`}
                              >
                                <div className="text-[9px] font-medium leading-none">{m.label}</div>
                                <div className="text-[11px] font-bold leading-tight mt-0.5">
                                  {hasData ? m.avgScore : '—'}
                                </div>
                                {hasData && (
                                  <div className="text-[8px] opacity-70">{m.count}×</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Assessment list for selected period */}
                {(() => {
                  const items = (historyData?.assessments || savedAssessments)
                    .filter((a: any) => a.periods ? a.periods[selectedPeriod] : true)
                    .slice(0, 10);
                  if (items.length === 0) return null;
                  const levelColors: Record<string, string> = {
                    LOW: 'bg-emerald-100 text-emerald-700',
                    MILD: 'bg-blue-100 text-blue-700',
                    MODERATE: 'bg-amber-100 text-amber-700',
                    HIGH: 'bg-orange-100 text-orange-700',
                    VERY_HIGH: 'bg-red-100 text-red-700',
                  };
                  return (
                    <ScrollArea className="h-[180px]">
                      <div className="space-y-1.5 pr-2">
                        {items.map((a: any, idx: number) => {
                          const score = a.score ?? a.riskAssessment?.score ?? 0;
                          const level = a.riskLevel ?? a.riskAssessment?.riskLevel ?? 'N/A';
                          const date = new Date(a.assessedAt || a.created_at);
                          return (
                            <div key={a.id || idx} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold w-8 text-slate-800 dark:text-white">{Math.round(score)}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  <span className="ml-1 text-[10px]">{date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </div>
                              <Badge className={cn('text-[9px] px-1.5 py-0.5', levelColors[level] || 'bg-gray-100 text-gray-600')}>
                                {level.replace('_', ' ')}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card className="border-teal-200/50 dark:border-teal-800/30 bg-gradient-to-br from-teal-50/40 to-transparent dark:from-teal-900/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  {serverRecs.length > 0 ? 'Personalized Recommendations' : 'Next Steps'}
                </CardTitle>
                {serverRecs.length > 0 && (
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <Sparkles className="h-3 w-3" /> Based on your risk profile
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  {(serverRecs.length > 0 ? serverRecs : [
                    'Complete the assessment regularly for better insights',
                    'Consult with your doctor based on your risk level',
                    'Track lifestyle changes over time',
                  ]).map((rec, i) => (
                    <div key={i} className="flex gap-2">
                      <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-700 dark:text-slate-300">{rec}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default UserHealthRiskAssessment;
