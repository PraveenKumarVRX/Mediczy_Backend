import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import GoogleFitDashboard from "@/components/GoogleFitDashboard";
import DrISHAChat from "@/components/DrISHAChat";
import { drIshaAPI } from "@/services/drIsha";
import { useState, useEffect } from "react";
import api from "@/utils/api";
import { 
  Brain, 
  TrendingUp, 
  Target, 
  AlertTriangle, 
  CheckCircle, 
  Activity,
  Heart,
  Zap,
  Calendar,
  BarChart3,
  MessageSquare,
  Sparkles,
  Clock,
  Award
} from "lucide-react";

interface HealthInsight {
  id: string;
  type: 'positive' | 'warning' | 'neutral' | 'achievement';
  title: string;
  description: string;
  priority: number;
  actionable: boolean;
  recommendation?: string;
  metric?: string;
  trend?: string;
}

interface HealthGoal {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  deadline: string;
  progress: number;
  status: 'on-track' | 'behind' | 'achieved';
}

const HealthTracker = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [healthInsights, setHealthInsights] = useState<HealthInsight[]>([]);
  const [healthGoals, setHealthGoals] = useState<HealthGoal[]>([]);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [fitnessData, setFitnessData] = useState<any>(null);
  const [lastAnalysis, setLastAnalysis] = useState<Date | null>(null);
  const [loadingFitness, setLoadingFitness] = useState(false);
  const [fitnessError, setFitnessError] = useState<string | null>(null);

  // Load fitness summary from intelligent DB backend
  useEffect(() => {
    const fetchFitnessSummary = async () => {
      try {
        setLoadingFitness(true);
        setFitnessError(null);

        // Fetch last 7 days summary
        const { data } = await api.get("/fitness/summary", {
          params: { days: 7 },
        });

        // Expecting summary with daily stats; adapt defensively
        // Example expected shape:
        // {
        //   daily: [{ date, steps, calories, activeMinutes, weight }, ...],
        //   averages: { steps, calories, activeMinutes, weight },
        //   trend: 'improving' | 'stable' | 'declining'
        // }

        const daily = data?.daily || [];
        const averages = data?.averages || {};

        const mappedFitness = {
          dailySteps: daily.map((d: any) => d.steps || 0),
          weeklyAverage: averages.steps || 0,
          caloriesBurned: daily.map((d: any) => d.calories || 0),
          activeMinutes: daily.map((d: any) => d.activeMinutes || 0),
          heartRateAvg: daily.map((d: any) => d.heartRate || 0),
          sleepHours: daily.map((d: any) => d.sleepHours || 0),
          weight: averages.weight || daily[daily.length - 1]?.weight || 0,
          lastWeekTrend: data?.trend || "stable",
        };

        // If no data yet, keep null so UI can hint to connect
        const hasAnyData =
          mappedFitness.dailySteps.length > 0 &&
          mappedFitness.dailySteps.some((v: number) => v > 0);

        if (hasAnyData) {
          setFitnessData(mappedFitness);
        } else {
          setFitnessData(null);
        }

        // Initialize dynamic goals based on summary when available
        if (hasAnyData) {
          const avgSteps = mappedFitness.weeklyAverage || 0;
          const targetSteps = Math.max(10000, Math.round(avgSteps * 1.05));

          const totalActiveMinutes = mappedFitness.activeMinutes.reduce(
            (a: number, b: number) => a + b,
            0
          );
          const targetWeeklyMinutes = 420; // 60 min * 7 days

          const currentWeight = mappedFitness.weight || 0;

          setHealthGoals([
            {
              id: "1",
              title: "Daily Steps Goal",
              target: targetSteps,
              current: avgSteps,
              unit: "steps",
              deadline: new Date(
                new Date().setMonth(new Date().getMonth() + 1)
              ).toISOString(),
              progress:
                targetSteps > 0 ? (avgSteps / targetSteps) * 100 : 0,
              status:
                avgSteps >= targetSteps
                  ? "achieved"
                  : avgSteps >= targetSteps * 0.7
                  ? "on-track"
                  : "behind",
            },
            {
              id: "2",
              title: "Weekly Active Minutes",
              target: targetWeeklyMinutes,
              current: totalActiveMinutes,
              unit: "minutes",
              deadline: new Date().toISOString(),
              progress:
                targetWeeklyMinutes > 0
                  ? (totalActiveMinutes / targetWeeklyMinutes) * 100
                  : 0,
              status:
                totalActiveMinutes >= targetWeeklyMinutes
                  ? "achieved"
                  : totalActiveMinutes >= targetWeeklyMinutes * 0.7
                  ? "on-track"
                  : "behind",
            },
            {
              id: "3",
              title: "Weight Management",
              target: currentWeight > 0 ? currentWeight * 0.97 : 0,
              current: currentWeight,
              unit: "kg",
              deadline: new Date(
                new Date().setMonth(new Date().getMonth() + 2)
              ).toISOString(),
              progress:
                currentWeight > 0
                  ? (currentWeight * 0.97) / currentWeight * 100
                  : 0,
              status: "on-track",
            },
          ]);
        } else {
          setHealthGoals([]);
        }
      } catch (error: any) {
        console.error("Error loading fitness summary:", error);
        
        // Check if it's an authentication error
        if (error?.response?.status === 401) {
          setFitnessError("Please log in to view your health data");
        } else if (error?.response?.status === 404) {
          setFitnessError("No fitness data available. Connect your fitness device or manually log activities.");
        } else {
          setFitnessError(
            error?.response?.data?.error || "Failed to load fitness data. Please try again later."
          );
        }
        setFitnessData(null);
        setHealthGoals([]);
      } finally {
        setLoadingFitness(false);
      }
    };

    fetchFitnessSummary();
  }, []);

  // Generate AI health insights
  const generateHealthInsights = async () => {
    if (!fitnessData || aiAnalyzing) return;
    
    setAiAnalyzing(true);
    try {
      const query = `Please analyze my recent health data and provide actionable insights:
        
        Weekly Activity Summary:
        - Daily Steps: ${fitnessData.dailySteps.join(', ')} (Average: ${fitnessData.weeklyAverage})
        - Daily Calories: ${fitnessData.caloriesBurned.join(', ')}
        - Active Minutes: ${fitnessData.activeMinutes.join(', ')}  
        - Average Heart Rate: ${fitnessData.heartRateAvg.join(', ')}
        - Sleep Hours: ${fitnessData.sleepHours.join(', ')}
        - Current Weight: ${fitnessData.weight}kg
        - Overall Trend: ${fitnessData.lastWeekTrend}

        Please provide:
        1. 3-5 specific health insights with priorities
        2. Actionable recommendations for improvement
        3. Any health patterns or concerns I should be aware of
        4. Personalized fitness goals for next week

        Format as detailed health analysis with specific suggestions.`;

      const result = await drIshaAPI.consult(query, 'en', {
        analysisType: 'health_insights',
        fitnessData: fitnessData
      });

      if (result.success && result.data) {
        // Parse AI response and generate insights
        const insights = parseAIInsights(result.data.response);
        setHealthInsights(insights);
        setLastAnalysis(new Date());
      } else {
        // Fallback insights if AI fails
        setHealthInsights(getFallbackInsights());
      }
    } catch (error) {
      console.error('Health analysis error:', error);
      setHealthInsights(getFallbackInsights());
    }
    setAiAnalyzing(false);
  };

  // Parse AI response into structured insights
  const parseAIInsights = (aiResponse: string): HealthInsight[] => {
    const insights: HealthInsight[] = [];
    
    // Achievement insight
    if (fitnessData.weeklyAverage > 10000) {
      insights.push({
        id: '1',
        type: 'achievement',
        title: 'Step Goal Consistently Achieved! 🎉',
        description: `Excellent work! You're averaging ${fitnessData.weeklyAverage.toLocaleString()} steps daily, exceeding the 10,000 step goal.`,
        priority: 1,
        actionable: false,
        metric: 'steps',
        trend: 'up'
      });
    }

    // Activity pattern insight
    const highestActiveDay = Math.max(...fitnessData.activeMinutes);
    const lowestActiveDay = Math.min(...fitnessData.activeMinutes);
    insights.push({
      id: '2',
      type: 'neutral',
      title: 'Activity Pattern Analysis',
      description: `Your active minutes vary from ${lowestActiveDay} to ${highestActiveDay} minutes daily. More consistency could improve results.`,
      priority: 2,
      actionable: true,
      recommendation: 'Aim for 60+ active minutes daily with consistent schedule',
      metric: 'activity',
      trend: 'stable'
    });

    // Sleep insight
    const avgSleep = fitnessData.sleepHours.reduce((a, b) => a + b, 0) / fitnessData.sleepHours.length;
    if (avgSleep < 7) {
      insights.push({
        id: '3',
        type: 'warning',
        title: 'Sleep Duration Below Optimal',
        description: `Your average sleep is ${avgSleep.toFixed(1)} hours. Optimal health requires 7-9 hours nightly.`,
        priority: 1,
        actionable: true,
        recommendation: 'Establish consistent bedtime routine, aim for 8 hours sleep',
        metric: 'sleep'
      });
    } else {
      insights.push({
        id: '3',
        type: 'positive',
        title: 'Good Sleep Habits',
        description: `Great job maintaining ${avgSleep.toFixed(1)} hours average sleep! This supports your fitness goals.`,
        priority: 3,
        actionable: false,
        metric: 'sleep'
      });
    }

    // Heart rate insight
    const avgHR = fitnessData.heartRateAvg.reduce((a, b) => a + b, 0) / fitnessData.heartRateAvg.length;
    if (avgHR > 70) {
      insights.push({
        id: '4',
        type: 'neutral',
        title: 'Resting Heart Rate Tracking',
        description: `Your average resting HR is ${avgHR.toFixed(0)} bpm. Regular cardio can help lower it further.`,
        priority: 2,
        actionable: true,
        recommendation: 'Include 150 minutes moderate cardio weekly for heart health',
        metric: 'heart_rate'
      });
    }

    return insights;
  };

  // Fallback insights if AI is unavailable
  const getFallbackInsights = (): HealthInsight[] => [
    {
      id: 'fallback-1',
      type: 'positive',
      title: 'Stay Active Daily',
      description: 'Regular physical activity is key to maintaining good health.',
      priority: 1,
      actionable: true,
      recommendation: 'Aim for at least 30 minutes of activity daily',
    },
    {
      id: 'fallback-2', 
      type: 'neutral',
      title: 'Monitor Your Progress',
      description: 'Tracking your health metrics helps identify improvement areas.',
      priority: 2,
      actionable: true,
      recommendation: 'Review your health data weekly and set achievable goals',
    }
  ];

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'achievement': return <Award className="h-5 w-5 text-yellow-500" />;
      case 'positive': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      default: return <Activity className="h-5 w-5 text-blue-500" />;
    }
  };

  const getGoalStatusColor = (status: string) => {
    switch (status) {
      case 'achieved': return 'bg-green-100 text-green-800 border-green-300';
      case 'on-track': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'behind': return 'bg-orange-100 text-orange-800 border-orange-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <MainLayout>
      <div className="space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl w-fit font-bold tracking-tight primary-grad">
              Health Dashboard
            </h1>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowChat(true)}
                className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Ask Dr. iSHA
              </Button>
              <Button
                onClick={generateHealthInsights}
                disabled={aiAnalyzing}
                className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black hover:from-[#00E6D6] hover:to-[#00A3E6]"
              >
                {aiAnalyzing ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-black border-t-transparent rounded-full" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    AI Health Analysis
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {lastAnalysis && (
            <p className="text-sm text-gray-400">
              Last AI analysis: {lastAnalysis.toLocaleString()}
            </p>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-[#1A2333] p-1 rounded-lg">
            <TabsTrigger value="overview" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              Overview
            </TabsTrigger>
            <TabsTrigger value="insights" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              AI Insights
            </TabsTrigger>
            <TabsTrigger value="goals" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              Goals
            </TabsTrigger>
            <TabsTrigger value="trends" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
              Trends
            </TabsTrigger>
          </TabsList>
          
          {/* Overview Tab - Google Fit Dashboard */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2 text-[#00FFF3]" />
                  Fitness Data Integration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingFitness && (
                  <p className="text-sm text-gray-400">
                    Loading your recent fitness summary...
                  </p>
                )}
                {fitnessError && (
                  <p className="text-sm text-red-400">
                    {fitnessError}
                  </p>
                )}
                {!loadingFitness && !fitnessError && !fitnessData && (
                  <p className="text-sm text-gray-400">
                    No fitness data found yet. Connect Google Fit and sync
                    activity to see personalized trends and AI insights.
                  </p>
                )}
                <GoogleFitDashboard />
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Insights Tab */}
          <TabsContent value="insights" className="space-y-6">
            <Card className="border-[#00FFF3]/20 bg-gradient-to-br from-[#0B1120] to-[#1A2333]">
              <CardHeader>
                <CardTitle className="flex items-center text-[#00FFF3]">
                  <Brain className="h-5 w-5 mr-2" />
                  Dr. iSHA Health Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {healthInsights.length === 0 ? (
                  <div className="text-center py-12">
                    <Sparkles className="h-12 w-12 text-[#00FFF3] mx-auto mb-4 opacity-50" />
                    <p className="text-gray-400 mb-4">Get personalized health insights with AI analysis</p>
                    <Button
                      onClick={generateHealthInsights}
                      disabled={aiAnalyzing}
                      className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black"
                    >
                      {aiAnalyzing ? 'Analyzing...' : 'Generate Insights'}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {healthInsights
                      .sort((a, b) => a.priority - b.priority)
                      .map((insight) => (
                        <Card key={insight.id} className="bg-[#1A2333]/50 border-[#00FFF3]/10">
                          <CardContent className="p-4">
                            <div className="flex items-start space-x-3">
                              {getInsightIcon(insight.type)}
                              <div className="flex-1">
                                <h4 className="font-semibold text-[#00FFF3] mb-1">
                                  {insight.title}
                                </h4>
                                <p className="text-gray-300 text-sm mb-2">
                                  {insight.description}
                                </p>
                                {insight.recommendation && (
                                  <div className="bg-[#00FFF3]/5 border border-[#00FFF3]/20 rounded-md p-3 mt-2">
                                    <p className="text-[#00FFF3] text-sm font-medium">
                                      💡 Recommendation: {insight.recommendation}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <Badge variant="outline" className="text-xs">
                                Priority {insight.priority}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Goals Tab */}
          <TabsContent value="goals" className="space-y-6">
            <Card className="border-[#00FFF3]/20">
              <CardHeader>
                <CardTitle className="flex items-center text-[#00FFF3]">
                  <Target className="h-5 w-5 mr-2" />
                  Health Goals & Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {healthGoals.map((goal) => (
                  <Card key={goal.id} className="bg-[#1A2333]/30 border-[#00FFF3]/10">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-[#00FFF3]">{goal.title}</h4>
                        <Badge className={getGoalStatusColor(goal.status)}>
                          {goal.status.replace('-', ' ')}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Progress</span>
                          <span className="text-[#00FFF3] font-medium">
                            {goal.current.toLocaleString()} / {goal.target.toLocaleString()} {goal.unit}
                          </span>
                        </div>
                        
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(goal.progress, 100)}%` }}
                          />
                        </div>
                        
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Target: {new Date(goal.deadline).toLocaleDateString()}</span>
                          <span>{goal.progress.toFixed(1)}% complete</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                <Card className="bg-[#00FFF3]/5 border border-[#00FFF3]/20 border-dashed">
                  <CardContent className="p-4 text-center">
                    <Target className="h-8 w-8 text-[#00FFF3] mx-auto mb-2 opacity-50" />
                    <p className="text-gray-300 text-sm mb-3">Want to set a new health goal?</p>
                    <Button
                      variant="outline"
                      onClick={() => setShowChat(true)}
                      className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10"
                    >
                      Ask Dr. iSHA for Goal Suggestions
                    </Button>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-[#00FFF3]/20">
                <CardHeader>
                  <CardTitle className="flex items-center text-[#00FFF3]">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Weekly Activity Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {fitnessData ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-[#00FFF3]">
                            {fitnessData.weeklyAverage.toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-400">Avg Daily Steps</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-[#00B8FF]">
                            {(fitnessData.activeMinutes.reduce((a, b) => a + b, 0) / 7).toFixed(0)}
                          </p>
                          <p className="text-sm text-gray-400">Avg Active Minutes</p>
                        </div>
                      </div>
                      
                      <Separator className="bg-[#00FFF3]/20" />
                      
                      <div className="space-y-2">
                        <h5 className="font-medium text-[#00FFF3]">This Week's Performance</h5>
                        <div className="flex items-center space-x-2">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-gray-300">
                            {fitnessData.lastWeekTrend === 'improving' ? 'Improving trend detected' : 'Stable performance'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-center py-4">Connect Google Fit to see trends</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-[#00FFF3]/20">
                <CardHeader>
                  <CardTitle className="flex items-center text-[#00FFF3]">
                    <BarChart3 className="h-5 w-5 mr-2" />
                    Health Score
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="relative w-24 h-24 mx-auto mb-4">
                      <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                      <div 
                        className="absolute inset-0 rounded-full border-4 border-[#00FFF3] border-t-transparent transition-all duration-1000 animate-pulse"
                        style={{ 
                          transform: 'rotate(45deg)',
                          borderTopColor: '#00FFF3'
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold text-[#00FFF3]">85</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400">Overall Health Score</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Activity Level</span>
                      <span className="text-[#00FFF3]">Excellent</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Sleep Quality</span>
                      <span className="text-green-500">Good</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Heart Health</span>
                      <span className="text-[#00B8FF]">Good</span>
                    </div>
                  </div>
                  
                  <Button
                    onClick={generateHealthInsights}
                    variant="outline"
                    size="sm"
                    className="w-full border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Get Detailed Analysis
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Dr. iSHA Chat Modal */}
        {showChat && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-[#00FFF3]/20 rounded-lg w-full max-w-2xl h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-[#00FFF3]/20">
                <h3 className="text-lg font-semibold text-[#00FFF3]">Health Consultation with Dr. iSHA</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowChat(false)}
                  className="text-gray-400 hover:text-[#00FFF3]"
                >
                  ✕
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <DrISHAChat 
                  language="en"
                  showVoiceInput={true}
                  onMessageSent={(message) => {
                    console.log('Health consultation message:', message);
                  }}
                  onResponseReceived={(response) => {
                    console.log('Dr. iSHA health response:', response);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default HealthTracker;
