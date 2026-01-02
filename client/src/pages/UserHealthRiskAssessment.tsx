import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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

const UserHealthRiskAssessment = () => {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [responses, setResponses] = useState<RiskResponses>({});
  const [savedAssessments, setSavedAssessments] = useState<any[]>([]);
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

  // Load saved assessments
  useEffect(() => {
    const loadAssessments = async () => {
      if (!currentUser?._id) return;
      try {
        setLoading(true);
        const res = await api.get(`/health-risk/${currentUser._id}/history`);
        if (res.data?.assessments) {
          setSavedAssessments(res.data.assessments);
        }
      } catch (error) {
        console.log('No previous assessments found');
      } finally {
        setLoading(false);
      }
    };
    loadAssessments();
  }, [currentUser?._id]);

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
    if (!currentUser?._id) {
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

    try {
      setSubmitting(true);
      const payload = {
        memberId: currentUser._id,
        memberName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
        responses,
        notes: null,
      };

      const res = await api.post(`/health-risk/${currentUser._id}/assessments`, payload);
      
      if (res.data?.success) {
        toast({
          title: 'Success',
          description: 'Your health risk assessment has been saved!',
        });
        // Refresh saved assessments
        if (res.data.assessment) {
          setSavedAssessments((prev) => [res.data.assessment, ...prev]);
        }
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

            {/* Progress Overview */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-white">
                  <Activity className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  Assessment Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-white">{completionPct}% Complete</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {Object.keys(responses).length} of {totalQuestions} questions
                    </span>
                  </div>
                  <Progress value={completionPct} className="h-2" />
                </div>

                <Separator />

                {/* Score Display */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Current Risk Score</h3>
                  <div className="flex items-end gap-4">
                    <div>
                      <div className="text-4xl font-bold text-orange-600">{totalScore}</div>
                      <div className="text-xs text-muted-foreground">out of {MAX_THEORETICAL_SCORE}</div>
                    </div>
                    <div className="flex-1">
                      <Badge className={cn('text-base py-2', {
                        'bg-emerald-100 text-emerald-800': scoreBand.label === 'Low Risk',
                        'bg-amber-100 text-amber-800': scoreBand.label === 'Moderate Risk',
                        'bg-orange-100 text-orange-800': scoreBand.label === 'High Risk',
                        'bg-red-100 text-red-800': scoreBand.label === 'Severe Risk',
                      })}>
                        {scoreBand.label}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-2">{scoreBand.description}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button 
                    onClick={handleSaveAssessment}
                    disabled={completionPct === 0 || submitting}
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : 'Save Assessment'}
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

            {/* Previous Assessments */}
            {savedAssessments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Assessment History</CardTitle>
                  <CardDescription>{savedAssessments.length} assessment(s) completed</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2 pr-4">
                      {savedAssessments.map((assessment, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">
                                Score: {assessment.totalScore || 0}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(assessment.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {assessment.scoreBand || 'N/A'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            <Card className="border-green-200/50 bg-gradient-to-br from-green-50/30 to-transparent">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Next Steps
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Complete the assessment regularly for better insights</span>
                  </div>
                  <div className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Consult with your doctor based on your risk level</span>
                  </div>
                  <div className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Track lifestyle changes over time</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

import { Lightbulb } from 'lucide-react';

export default UserHealthRiskAssessment;
