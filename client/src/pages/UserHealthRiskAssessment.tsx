import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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

const UserHealthRiskAssessment = () => {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [responses, setResponses] = useState<RiskResponses>({});
  const [savedAssessments, setSavedAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    setResponses((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleReset = () => setResponses({});

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
                  Answer the questions below to get a personalized health risk assessment.
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
                            {section.questions.map((question) => (
                              <div key={question.id} className="space-y-2">
                                <label className="text-sm font-medium">{question.title}</label>
                                {question.helper && (
                                  <p className="text-xs text-muted-foreground">{question.helper}</p>
                                )}
                                <div className="space-y-2">
                                  {question.options.map((option) => (
                                    <div
                                      key={option.id}
                                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                                      onClick={() => handleSelectOption(question.id, option.id)}
                                    >
                                      <input
                                        type="radio"
                                        name={question.id}
                                        value={option.id}
                                        checked={responses[question.id] === option.id}
                                        onChange={() => handleSelectOption(question.id, option.id)}
                                        className="w-4 h-4"
                                      />
                                      <div className="flex-1">
                                        <label className="text-sm font-medium cursor-pointer">
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
                            ))}
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
