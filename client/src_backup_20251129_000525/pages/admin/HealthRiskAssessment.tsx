import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const mockMembers = [
  {
    id: 'mem-001',
    name: 'Anita Sharma',
    segment: 'Corporate Wellness',
    age: 42,
    gender: 'Female',
    lastScore: 78,
    lastAssessed: '2025-11-16',
    chronic: ['Type 2 Diabetes (controlled)', 'Borderline Hypertension'],
  },
  {
    id: 'mem-002',
    name: 'Rahul Verma',
    segment: 'Retail Subscriber',
    age: 35,
    gender: 'Male',
    lastScore: 45,
    lastAssessed: '2025-11-15',
    chronic: ['Seasonal Asthma'],
  },
  {
    id: 'mem-003',
    name: 'Neha Kulkarni',
    segment: 'Enterprise (FinTech)',
    age: 51,
    gender: 'Female',
    lastScore: 128,
    lastAssessed: '2025-11-14',
    chronic: ['Obesity (Class I)', 'Sleep Apnea'],
  },
];

interface RiskTrendPoint {
  date: string;
  score: number;
  band: string;
}

type EvidencePayload = Partial<Record<EvidenceNode, { state: EvidenceState; ratio: number; label: string }>>;

const totalQuestions = healthRiskSections.reduce((sum, section) => sum + section.questions.length, 0);

const buildTemplate = (bias: 'low' | 'high') => {
  const template: RiskResponses = {};
  healthRiskSections.forEach((section) => {
    section.questions.forEach((question) => {
      const option = bias === 'low' ? question.options[0] : question.options[question.options.length - 1];
      template[question.id] = option.id;
    });
  });
  return template;
};

const generateMockHistory = (baseScore: number): RiskTrendPoint[] => {
  const reference = new Date();
  return Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(reference);
    date.setDate(reference.getDate() - index * 7);
    const modifier = (index - 3) * 6;
    const score = Math.max(5, Math.min(MAX_THEORETICAL_SCORE, Math.round(baseScore + modifier)));
    const band = resolveScoreBand(score);
    return {
      date: date.toISOString().split('T')[0],
      score,
      band: band.label,
    };
  });
};

const HealthRiskAssessment = () => {
  const [memberId, setMemberId] = useState(mockMembers[0].id);
  const [responses, setResponses] = useState<RiskResponses>({});
  const [history, setHistory] = useState<RiskTrendPoint[]>([]);
  const [historyMeta, setHistoryMeta] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const selectedMember = mockMembers.find((member) => member.id === memberId) ?? mockMembers[0];

  const completionPct = Math.round((Object.keys(responses).length / totalQuestions) * 100);
  const totalScore = calculateRiskScore(responses);
  const scoreBand = resolveScoreBand(totalScore);

  const sectionBreakdown = useMemo(() => summarizeSections(responses), [responses]);
  const bayesianEvidence = useMemo(() => buildBayesianEvidence(sectionBreakdown), [sectionBreakdown]);
  const fallbackBayesian = useMemo(() => computeBayesianRisk(sectionBreakdown), [sectionBreakdown]);
  const [bayesianResult, setBayesianResult] = useState<BayesianRiskResult>(fallbackBayesian);
  const [bayesianMeta, setBayesianMeta] = useState<{ loading: boolean; error: string | null; synced: boolean }>({
    loading: false,
    error: null,
    synced: false,
  });

  const evidencePayload = useMemo<EvidencePayload>(() => {
    return bayesianEvidence.reduce<EvidencePayload>((acc, item) => {
      acc[item.node] = { state: item.state, ratio: item.ratio, label: item.label };
      return acc;
    }, {});
  }, [bayesianEvidence]);

  const evidenceSignature = useMemo(() => JSON.stringify(evidencePayload), [evidencePayload]);

  useEffect(() => {
    setBayesianResult({ ...fallbackBayesian, evidence: bayesianEvidence });
  }, [fallbackBayesian, bayesianEvidence]);

  useEffect(() => {
    if (!Object.keys(evidencePayload).length) {
      setBayesianMeta((prev) => ({ ...prev, loading: false, synced: false }));
      setBayesianResult(fallbackBayesian);
      return;
    }

    let ignore = false;
    const controller = new AbortController();
    const debounce = setTimeout(async () => {
      try {
        const token = localStorage.getItem('adminToken');
        if (!token) throw new Error('Missing admin token');

        const { data } = await api.post(
          '/admin/health-risk/inference',
          {
            evidence: evidencePayload,
            context: {
              completionPct,
              totalScore,
              memberId,
            },
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );

        if (ignore) return;

        const inference = data?.inference ?? {};
        const posterior = {
          ...fallbackBayesian.posterior,
          ...(inference.posterior ?? {}),
        } as Record<PosteriorState, number>;

        const remoteAlerts = Array.isArray(inference.alerts) ? inference.alerts : [];
        const enrichedAlerts = remoteAlerts
          .map((alert) => bayesianEvidence.find((item) => item.node === alert.node))
          .filter(Boolean) as BayesianEvidence[];

        setBayesianResult({
          posterior,
          prediction: (inference.prediction ?? fallbackBayesian.prediction) as PosteriorState,
          confidence:
            typeof inference.confidence === 'number' ? inference.confidence : fallbackBayesian.confidence,
          summary: inference.summary ?? fallbackBayesian.summary,
          recommendedAction: inference.recommendedAction ?? fallbackBayesian.recommendedAction,
          estimatedScore:
            typeof inference.estimatedScore === 'number'
              ? inference.estimatedScore
              : fallbackBayesian.estimatedScore,
          alerts: enrichedAlerts.length > 0 ? enrichedAlerts : fallbackBayesian.alerts,
          evidence: bayesianEvidence,
        });
        setBayesianMeta({ loading: false, error: null, synced: true });
      } catch (error) {
        if (ignore || controller.signal.aborted) return;
        console.error('Bayesian inference sync failed:', error);
        setBayesianMeta({
          loading: false,
          error: 'Using local inference until server sync completes.',
          synced: false,
        });
        setBayesianResult({ ...fallbackBayesian, evidence: bayesianEvidence });
      }
    }, 350);

    setBayesianMeta((prev) => ({ ...prev, loading: true, error: null }));

    return () => {
      ignore = true;
      controller.abort();
      clearTimeout(debounce);
    };
  }, [
    evidenceSignature,
    fallbackBayesian,
    completionPct,
    totalScore,
    memberId,
    bayesianEvidence,
    evidencePayload,
  ]);

  const selectedRisks = healthRiskSections
    .flatMap((section) =>
      section.questions.map((question) => {
        const optionId = responses[question.id];
        if (!optionId) return null;
        const option = question.options.find((opt) => opt.id === optionId);
        return option
          ? {
              section: section.title,
              question: question.title,
              score: option.score,
              label: option.label,
            }
          : null;
      }),
    )
    .filter(Boolean) as Array<{ section: string; question: string; score: number; label: string }>;

  const topFlags = selectedRisks
    .filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const handleSelectOption = (questionId: string, optionId: string) => {
    setResponses((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleReset = () => setResponses({});

  const handlePrefill = (bias: 'low' | 'high') => {
    setResponses(buildTemplate(bias));
  };

  const getBandProgress = (min: number, max: number) => {
    if (totalScore <= min) return totalScore === min ? 5 : 0;
    if (totalScore >= max) return 100;
    return ((totalScore - min) / Math.max(1, max - min)) * 100;
  };

  useEffect(() => {
    let ignore = false;
    const fetchHistory = async () => {
      setHistoryMeta({ loading: true, error: null });
      try {
        const token = localStorage.getItem('adminToken');
        if (!token) throw new Error('Missing admin token');
        const { data } = await api.get(`/admin/health-risk/members/${memberId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!ignore) {
          setHistory(Array.isArray(data?.history) ? data.history : generateMockHistory(selectedMember.lastScore));
        }
      } catch (error) {
        if (!ignore) {
          setHistoryMeta({ loading: false, error: 'Using simulated insights until backend endpoint is ready.' });
          setHistory(generateMockHistory(selectedMember.lastScore));
        }
        return;
      }
      if (!ignore) {
        setHistoryMeta({ loading: false, error: null });
      }
    };

    fetchHistory();
    return () => {
      ignore = true;
    };
  }, [memberId, selectedMember.lastScore]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Badge className="rounded-full bg-blue-500/10 text-blue-600">Clinical AI</Badge>
            <span className="text-sm text-muted-foreground">Admin • Health Risk Engine</span>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Health Risk Assessment</h1>
              <p className="text-muted-foreground">
                Comprehensive scoring across lifestyle, vitals, medical history, and diagnostic markers.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handlePrefill('low')}>
                Prefill Low Risk
              </Button>
              <Button variant="outline" onClick={() => handlePrefill('high')}>
                Prefill High Risk
              </Button>
              <Button variant="ghost" onClick={handleReset}>
                Reset Form
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardDescription>Total Score</CardDescription>
              <CardTitle className="text-4xl">{totalScore}</CardTitle>
              <div className="text-sm text-muted-foreground">
                {scoreBand.label} • {scoreBand.description}
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={(totalScore / MAX_THEORETICAL_SCORE) * 100} className="h-2" />
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>Max {MAX_THEORETICAL_SCORE}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-muted-foreground text-xs">Completion</p>
                  <p className="text-lg font-semibold">{completionPct}%</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-muted-foreground text-xs">Sections Covered</p>
                  <p className="text-lg font-semibold">
                    {sectionBreakdown.filter((section) => section.answered > 0).length}/{healthRiskSections.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>High-Risk Flags</CardDescription>
              <CardTitle>Top Drivers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topFlags.length === 0 && <p className="text-sm text-muted-foreground">Select answers to surface risk drivers.</p>}
              {topFlags.map((item) => (
                <div key={`${item.question}-${item.label}`} className="rounded-lg border border-red-200/70 bg-red-50/60 p-3">
                  <div className="flex items-center justify-between text-xs text-red-600">
                    <span className="font-medium">{item.section}</span>
                    <Badge variant="secondary" className="bg-red-100 text-red-700">
                      +{item.score}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{item.question}</p>
                  <p className="text-xs text-muted-foreground">Choice: {item.label}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Interpretation</CardDescription>
              <CardTitle>Score Bands</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {RISK_SCORE_BANDS.map((band) => (
                <div key={band.label} className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={band.color}>{band.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {band.min} – {band.max}
                    </span>
                  </div>
                  <Progress value={getBandProgress(band.min, band.max)} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardDescription>Probabilistic Outlook</CardDescription>
              <CardTitle>Bayesian Network</CardTitle>
              <p className="text-xs text-muted-foreground">{bayesianResult.summary}</p>
              <p className="text-[11px]">
                {bayesianMeta.error ? (
                  <span className="text-amber-600">{bayesianMeta.error}</span>
                ) : bayesianMeta.loading ? (
                  <span className="text-muted-foreground">Syncing Bayesian engine…</span>
                ) : bayesianMeta.synced ? (
                  <span className="text-emerald-600">Server inference live</span>
                ) : (
                  <span className="text-muted-foreground">Local inference preview</span>
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Predicted band</p>
                <p
                  className={`text-2xl font-semibold ${
                    bayesianResult.prediction === 'low'
                      ? 'text-emerald-600'
                      : bayesianResult.prediction === 'elevated'
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}
                >
                  {bayesianResult.prediction === 'low' && 'Low Risk'}
                  {bayesianResult.prediction === 'elevated' && 'Elevated Risk'}
                  {bayesianResult.prediction === 'critical' && 'Critical Risk'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Confidence {(bayesianResult.confidence * 100).toFixed(0)}% • Expected score {Math.round(bayesianResult.estimatedScore)}
                </p>
              </div>

              <div className="space-y-3">
                {(['low', 'elevated', 'critical'] as PosteriorState[]).map((state) => (
                  <div key={state}>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {state === 'low' && 'Low risk'}
                        {state === 'elevated' && 'Elevated risk'}
                        {state === 'critical' && 'Critical risk'}
                      </span>
                      <span className="font-semibold text-foreground">
                        {(bayesianResult.posterior[state] * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={bayesianResult.posterior[state] * 100} className="h-2" />
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-muted-foreground/20 p-3 text-xs text-muted-foreground">
                {bayesianResult.recommendedAction}
              </div>

              {bayesianResult.alerts.length > 0 && (
                <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 p-3">
                  <p className="text-xs font-semibold text-amber-900 mb-2">Leading contributors</p>
                  <div className="space-y-1">
                    {bayesianResult.alerts.slice(0, 3).map((alert) => (
                      <div key={alert.node} className="flex items-center justify-between text-xs">
                        <span>{alert.label}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {Math.round(alert.ratio * 100)}% load
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="questionnaire" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="questionnaire">Questionnaire</TabsTrigger>
            <TabsTrigger value="insights">Section Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="questionnaire">
            <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
              <Card className="h-max">
                <CardHeader>
                  <CardDescription>Active Member</CardDescription>
                  <CardTitle>{selectedMember.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select value={memberId} onValueChange={setMemberId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick member" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name} • {member.segment}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="rounded-lg border border-border/60 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last score</span>
                      <span className="font-semibold">{selectedMember.lastScore}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Assessed</span>
                      <span>{selectedMember.lastAssessed}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Chronic Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedMember.chronic.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Assessment history</span>
                      {historyMeta.loading && <span>Syncing…</span>}
                    </div>
                    <div className="space-y-1">
                      {history.length === 0 && (
                        <p className="text-xs text-muted-foreground">No past assessments recorded.</p>
                      )}
                      {history.slice(0, 4).map((entry) => (
                        <div
                          key={entry.date}
                          className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
                        >
                          <span>{entry.date}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{entry.score}</span>
                            <Badge variant="outline" className="text-[11px]">
                              {entry.band}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    {historyMeta.error && <p className="text-[11px] text-amber-600">{historyMeta.error}</p>}
                  </div>

                  <Separator />

                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      High-risk threshold: ≥101 points
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      Auto-escalate at ≥151 points
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ScrollArea className="h-[70vh] rounded-xl border border-border/60 p-1">
                <div className="space-y-5 pr-4">
                  {healthRiskSections.map((section) => {
                    const Icon = sectionIconMap[section.id] ?? HeartPulse;
                    const breakdown = sectionBreakdown.find((entry) => entry.id === section.id);

                    return (
                      <Card key={section.id} className="border-border/70">
                        <CardHeader className="space-y-1">
                          <div className="flex items-center gap-3">
                            <div className="rounded-full bg-primary/10 p-2">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{section.title}</CardTitle>
                              <CardDescription>{section.subtitle}</CardDescription>
                            </div>
                          </div>
                          {breakdown && (
                            <div className="text-xs text-muted-foreground">
                              Score {breakdown.weightedScore}/{breakdown.maxScore} • {breakdown.answered}/{breakdown.total} answered
                            </div>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {section.questions.map((question) => {
                            const selection = responses[question.id];
                            return (
                              <div key={question.id} className="space-y-2">
                                <div>
                                  <p className="text-sm font-medium text-foreground">{question.title}</p>
                                  {question.helper && (
                                    <p className="text-xs text-muted-foreground">{question.helper}</p>
                                  )}
                                </div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  {question.options.map((option) => {
                                    const isActive = selection === option.id;
                                    return (
                                      <button
                                        key={option.id}
                                        className={cn(
                                          'rounded-lg border p-3 text-left transition hover:border-primary/40 hover:bg-primary/5',
                                          isActive
                                            ? 'border-primary bg-primary/5 shadow-sm'
                                            : 'border-border/70 bg-background'
                                        )}
                                        onClick={() => handleSelectOption(question.id, option.id)}
                                      >
                                        <div className="flex items-center justify-between text-sm font-medium">
                                          <span>{option.label}</span>
                                          <Badge variant="secondary" className="bg-muted text-xs">
                                            +{option.score}
                                          </Badge>
                                        </div>
                                        {option.description && (
                                          <p className="text-xs text-muted-foreground">{option.description}</p>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sectionBreakdown.map((section) => (
                <Card key={section.id}>
                  <CardHeader className="pb-2">
                    <CardDescription>{section.subtitle}</CardDescription>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        Weight ×{section.weight}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Weighted score</span>
                          <span className="font-semibold">
                            {section.weightedScore}/{section.maxScore}
                          </span>
                        </div>
                        <Progress
                          value={
                            section.maxScore === 0
                              ? 0
                              : Math.min(100, (section.weightedScore / section.maxScore) * 100)
                          }
                          className="h-2"
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Coverage: {section.answered}/{section.total} • Raw score: {section.rawScore}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default HealthRiskAssessment;
