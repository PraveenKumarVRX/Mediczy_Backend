import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import React from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  ShieldAlert,
  Users,
  Wine,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Calculator,
  Ruler,
  Scale,
  User,
  Lightbulb,
  Sparkles,
  Clock,
  Stethoscope,
  Zap,
  Target,
  Calendar,
  Gift,
  TrendingDown,
  BarChart3,
  ArrowDown,
  ArrowUp,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MAX_THEORETICAL_SCORE,
  RISK_SCORE_BANDS,
  RiskCategoryId,
  RiskResponses,
  calculateRiskScore,
  healthRiskSections,
  resolveScoreBand,
  summarizeSections,
} from '@/lib/health-risk';
import {
  BayesianEvidence,
  BayesianRiskResult,
  buildBayesianEvidence,
  computeBayesianRisk,
  EvidenceNode,
  EvidenceState,
  PosteriorState,
} from '@/lib/bayesian-risk';
import api from '@/utils/api';
import { useAuth } from '@/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

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
  const [savedAssessments, setSavedAssessments] = useState<any[]>([]);
  const [serverRecs, setServerRecs] = useState<string[]>([]);
  const [historyData, setHistoryData] = useState<any>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('weekly');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Measurement inputs for auto-calculation
  const [measurements, setMeasurements] = useState<Measurements>({
    height: '',
    weight: '',
    age: '',
    gender: 'male',
    waist: '',
    hip: '',
    neck: '',
  });

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
      const profile = currentUser as any;
      setMeasurements(prev => ({
        ...prev,
        height: profile.height?.toString() || prev.height,
        weight: profile.weight?.toString() || prev.weight,
        age: profile.age?.toString() || (profile.dateOfBirth ? 
          Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)).toString() : prev.age),
        gender: profile.gender || prev.gender,
      }));
    }
  }, [currentUser]);

  const totalQuestions = useMemo(() => {
    return healthRiskSections.reduce((sum, section) => sum + section.questions.length, 0);
  }, []);

  const completionPct = Math.round((Object.keys(responses).length / totalQuestions) * 100);
  const totalScore = calculateRiskScore(responses);
  const scoreBand = resolveScoreBand(totalScore);
  const sectionBreakdown = useMemo(() => summarizeSections(responses), [responses]);
  const bayesianEvidence = useMemo(() => buildBayesianEvidence(sectionBreakdown), [sectionBreakdown]);
  const bayesianResult = useMemo(() => computeBayesianRisk(sectionBreakdown), [sectionBreakdown]);

  // Load assessment history (all periods)
  const loadHistory = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setLoading(true);
      const res = await api.get('/health-assessment/history');
      if (res.data?.success) {
        setHistoryData(res.data);
        setSavedAssessments(res.data.assessments || []);
      }
    } catch (error) {
      // Fallback: try the single-assessment endpoint
      try {
        const res = await api.get('/health-assessment');
        if (res.data?.assessment) {
          setSavedAssessments([res.data.assessment]);
        }
      } catch (_) {
        console.log('No previous assessments found');
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

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

  const handleMeasurementChange = (field: keyof Measurements, value: string) => {
    setMeasurements(prev => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    setResponses({});
    // Keep measurements from profile
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
      const payload = {
        age: ageVal,
        gender: measurements.gender,
        height: heightVal,
        weight: weightVal,
        waist: parseFloat(measurements.waist) || undefined,
        hip: parseFloat(measurements.hip) || undefined,
        bmi: calculatedValues.bmi.value > 0 ? parseFloat(calculatedValues.bmi.value.toFixed(2)) : undefined,
        whr: calculatedValues.whr.value > 0 ? parseFloat(calculatedValues.whr.value.toFixed(3)) : undefined,
        smoking: responses.smoking || 'never',
        alcohol: responses.alcohol || 'none',
        exercise_frequency: responses.exercise_frequency || 'sedentary',
        hypertension: responses.hypertension || 'no',
        diabetes: responses.diabetes || 'no',
        heart_disease: responses.heart_disease || 'no',
        cholesterol: responses.cholesterol || 'no',
        mental_health: responses.mental_health || 'normal',
        family_heart_disease: responses.family_heart_disease || 'no',
        family_diabetes: responses.family_diabetes || 'no',
        family_cancer: responses.family_cancer || 'no',
        stress_level: responses.stress_level ? parseInt(String(responses.stress_level)) : 5,
        sleep_hours: responses.sleep_hours ? parseFloat(String(responses.sleep_hours)) : 7,
        diet_quality: responses.diet_quality || 'fair',
        responses,
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
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.response?.data?.message || 'Failed to save assessment',
      });
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

                <Separator />

                <div className="flex gap-2">
                  <Button 
                    onClick={handleSaveAssessment}
                    disabled={completionPct === 0 || submitting}
                    className="flex-1 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white shadow-lg shadow-teal-500/20"
                  >
                    {submitting ? (
                      <><span className="animate-spin mr-2">⟳</span>Saving...</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4 mr-2" />Save Assessment</>
                    )}
                  </Button>
                  <Button 
                    onClick={handleReset}
                    variant="outline"
                  >
                    Reset
                  </Button>
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
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-8">
                    {healthRiskSections.map((section) => {
                      const Icon = sectionIconMap[section.id] ?? HeartPulse;
                      return (
                        <div key={section.id} className="space-y-4 pb-6 border-b last:border-b-0">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-orange-100/50">
                              <Icon className="h-4 w-4 text-orange-600" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{section.title}</h3>
                              <p className="text-sm text-muted-foreground">{section.subtitle}</p>
                            </div>
                          </div>

                          <div className="space-y-4 ml-11">
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
                                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
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
            {/* Risk Insights */}
            {totalScore > 0 && (
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
                    { key: 'daily', label: 'Day', icon: '📅' },
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

                {/* Birthday Annual Milestone */}
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
