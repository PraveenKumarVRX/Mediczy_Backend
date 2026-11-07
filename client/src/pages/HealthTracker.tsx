import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import HealthConnectDashboard from "@/components/HealthConnectDashboard";
import AppleHealthDashboard from "@/components/AppleHealthDashboard";
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
  Award,
  Footprints,
  Moon,
  Flame,
  Dumbbell,
  Thermometer,
  Droplets,
  Save,
  RefreshCw
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
  const [activeTab, setActiveTab] = useState("activity");
  const [healthInsights, setHealthInsights] = useState<HealthInsight[]>([]);
  const [healthGoals, setHealthGoals] = useState<HealthGoal[]>([]);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [fitnessData, setFitnessData] = useState<any>(null);
  const [lastAnalysis, setLastAnalysis] = useState<Date | null>(null);
  const [loadingFitness, setLoadingFitness] = useState(false);
  const [fitnessError, setFitnessError] = useState<string | null>(null);

  // Activity tracker state
  const [activityForm, setActivityForm] = useState({
    steps: '', stairs: '', caloriesBurned: '', caloriesConsumed: '',
    exerciseType: '', exerciseMinutes: '', sleepHours: '', sleepQuality: '',
    heartRate: '', bpSystolic: '', bpDiastolic: '', spo2: '',
    temperature: '', weight: '', bloodSugar: '', notes: ''
  });
  const [todayActivity, setTodayActivity] = useState<any>(null);
  const [weeklySummary, setWeeklySummary] = useState<any>(null);
  const [savingActivity, setSavingActivity] = useState(false);
  const [activitySaved, setActivitySaved] = useState(false);

  // Load today's activity
  useEffect(() => {
    const loadTodayActivity = async () => {
      try {
        const { data } = await api.get('/activity-tracker/today');
        if (data.success && data.activity) {
          setTodayActivity(data.activity);
          const a = data.activity;
          setActivityForm({
            steps: a.steps?.toString() || '',
            stairs: a.stairs?.toString() || '',
            caloriesBurned: a.calories_burned?.toString() || '',
            caloriesConsumed: a.calories_consumed?.toString() || '',
            exerciseType: a.exercise_type || '',
            exerciseMinutes: a.exercise_minutes?.toString() || '',
            sleepHours: a.sleep_hours?.toString() || '',
            sleepQuality: a.sleep_quality || '',
            heartRate: a.heart_rate?.toString() || '',
            bpSystolic: a.blood_pressure_systolic?.toString() || '',
            bpDiastolic: a.blood_pressure_diastolic?.toString() || '',
            spo2: a.spo2?.toString() || '',
            temperature: a.temperature?.toString() || '',
            weight: a.weight?.toString() || '',
            bloodSugar: a.blood_sugar?.toString() || '',
            notes: a.notes || ''
          });
        }
        const { data: summary } = await api.get('/activity-tracker/summary?period=week');
        if (summary.success) setWeeklySummary(summary);
      } catch (err) {
        console.error('Failed to load activity:', err);
      }
    };
    loadTodayActivity();
  }, []);

  const saveActivity = async () => {
    setSavingActivity(true);
    setActivitySaved(false);
    try {
      const payload: any = {};
      if (activityForm.steps) payload.steps = parseInt(activityForm.steps);
      if (activityForm.stairs) payload.stairs = parseInt(activityForm.stairs);
      if (activityForm.caloriesBurned) payload.caloriesBurned = parseInt(activityForm.caloriesBurned);
      if (activityForm.caloriesConsumed) payload.caloriesConsumed = parseInt(activityForm.caloriesConsumed);
      if (activityForm.exerciseType) payload.exerciseType = activityForm.exerciseType;
      if (activityForm.exerciseMinutes) payload.exerciseMinutes = parseInt(activityForm.exerciseMinutes);
      if (activityForm.sleepHours) payload.sleepHours = parseFloat(activityForm.sleepHours);
      if (activityForm.sleepQuality) payload.sleepQuality = activityForm.sleepQuality;
      if (activityForm.heartRate) payload.heartRate = parseInt(activityForm.heartRate);
      if (activityForm.bpSystolic) payload.bpSystolic = parseInt(activityForm.bpSystolic);
      if (activityForm.bpDiastolic) payload.bpDiastolic = parseInt(activityForm.bpDiastolic);
      if (activityForm.spo2) payload.spo2 = parseInt(activityForm.spo2);
      if (activityForm.temperature) payload.temperature = parseFloat(activityForm.temperature);
      if (activityForm.weight) payload.weight = parseFloat(activityForm.weight);
      if (activityForm.bloodSugar) payload.bloodSugar = parseInt(activityForm.bloodSugar);
      if (activityForm.notes) payload.notes = activityForm.notes;

      const { data } = await api.post('/activity-tracker/log', payload);
      if (data.success) {
        setTodayActivity(data.activity);
        setActivitySaved(true);
        // Refresh summary
        const { data: summary } = await api.get('/activity-tracker/summary?period=week');
        if (summary.success) setWeeklySummary(summary);
        setTimeout(() => setActivitySaved(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save activity:', err);
    } finally {
      setSavingActivity(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setActivityForm(prev => ({ ...prev, [field]: value }));
  };

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
        const status = error?.response?.status;
        if (status === 401) {
          setFitnessError("Please log in to view your health data");
        } else if (status === 404) {
          setFitnessError("No fitness data available. Connect your fitness device or manually log activities.");
        } else if (status === 500) {
          setFitnessError("Health data service is temporarily unavailable. Your data is safe — please try again in a moment.");
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
    if (aiAnalyzing) return;
    
    setAiAnalyzing(true);
    try {
      // If no fitness data, provide general health tips
      const hasData = fitnessData && fitnessData.dailySteps && fitnessData.dailySteps.length > 0;
      
      // Check if user is authenticated
      const token = localStorage.getItem('token');
      
      if (!token) {
        // User not logged in, provide helpful fallback
        console.log('No auth token, using enhanced fallback insights');
        setHealthInsights(getEnhancedFallbackInsights());
        setLastAnalysis(new Date());
        setAiAnalyzing(false);
        return;
      }
      
      const query = hasData 
        ? `Please analyze my recent health data and provide actionable insights:
        
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

        Format as detailed health analysis with specific suggestions.`
        : `Please provide general health insights and recommendations for maintaining good health:
        
        I would like to:
        1. Get 5 practical health tips for daily wellness
        2. Learn about recommended daily activity levels
        3. Understand sleep and nutrition basics
        4. Know about preventive health measures
        
        Please provide actionable, personalized health guidance.`;

      const result = await drIshaAPI.consult(query, 'en', {
        analysisType: 'health_insights',
        fitnessData: fitnessData || {}
      });

      if (result.success && result.data) {
        // Parse AI response and generate insights
        const insights = hasData ? parseAIInsights(result.data.response) : getEnhancedFallbackInsights();
        setHealthInsights(insights);
        setLastAnalysis(new Date());
      } else {
        // Fallback insights if AI fails
        console.log('AI analysis failed, using enhanced fallback');
        setHealthInsights(getEnhancedFallbackInsights());
        setLastAnalysis(new Date());
      }
    } catch (error) {
      console.error('Health analysis error:', error);
      setHealthInsights(getEnhancedFallbackInsights());
      setLastAnalysis(new Date());
    }
    setAiAnalyzing(false);
  };

  // Enhanced fallback insights when AI is unavailable
  const getEnhancedFallbackInsights = (): HealthInsight[] => [
    {
      id: 'insight-1',
      type: 'positive',
      title: '🏃 Daily Movement Goal',
      description: 'Walking 10,000 steps daily can reduce risk of heart disease by up to 50% and improve mental health.',
      priority: 1,
      actionable: true,
      recommendation: 'Start with 5,000 steps and increase by 1,000 each week until you reach 10,000',
      metric: 'steps',
      trend: 'up'
    },
    {
      id: 'insight-2',
      type: 'positive',
      title: '💧 Hydration is Key',
      description: 'Proper hydration improves energy, brain function, and helps with weight management.',
      priority: 2,
      actionable: true,
      recommendation: 'Drink 8 glasses (2 liters) of water daily. Set reminders every 2 hours.',
      metric: 'hydration'
    },
    {
      id: 'insight-3',
      type: 'neutral',
      title: '😴 Quality Sleep Matters',
      description: '7-9 hours of quality sleep is essential for recovery, immune function, and cognitive performance.',
      priority: 3,
      actionable: true,
      recommendation: 'Maintain consistent sleep schedule. Avoid screens 1 hour before bed.',
      metric: 'sleep'
    },
    {
      id: 'insight-4',
      type: 'positive',
      title: '🥗 Balanced Nutrition',
      description: 'A diet rich in vegetables, lean proteins, and whole grains supports optimal health.',
      priority: 4,
      actionable: true,
      recommendation: 'Fill half your plate with vegetables, quarter with protein, quarter with whole grains.',
      metric: 'nutrition'
    },
    {
      id: 'insight-5',
      type: 'achievement',
      title: '🧘 Stress Management',
      description: 'Regular stress management can lower blood pressure and improve heart health.',
      priority: 5,
      actionable: true,
      recommendation: 'Practice 10 minutes of deep breathing or meditation daily.',
      metric: 'stress'
    }
  ];

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
    const avgSleep = fitnessData.sleepHours.length > 0 
      ? fitnessData.sleepHours.reduce((a, b) => a + b, 0) / fitnessData.sleepHours.length 
      : 0;
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
    const avgHR = fitnessData.heartRateAvg.length > 0 
      ? fitnessData.heartRateAvg.reduce((a, b) => a + b, 0) / fitnessData.heartRateAvg.length 
      : 0;
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

  // Compute health score from real data (0-100).
  // Each pillar contributes up to 20 points; defaults to "—" when no data yet.
  const computedHealthScore = (() => {
    if (!todayActivity && !fitnessData) return null;
    let score = 0;
    const a = todayActivity || {};
    const avgSteps = fitnessData?.weeklyAverage || 0;
    // Steps (20 pts): 10 000 step goal
    score += Math.min(20, Math.round(((avgSteps || a.steps || 0) / 10000) * 20));
    // Exercise minutes (20 pts): 30 min/day goal
    score += Math.min(20, Math.round(((a.exercise_minutes || 0) / 30) * 20));
    // Sleep (20 pts): 7-8 h optimal
    const sleep = parseFloat(a.sleep_hours) || 0;
    score += sleep >= 7 && sleep <= 9 ? 20 : sleep >= 6 ? 14 : sleep >= 5 ? 8 : 0;
    // Heart rate (20 pts): 60-100 bpm resting normal
    const hr = a.heart_rate || 0;
    score += hr === 0 ? 10 : hr >= 60 && hr <= 100 ? 20 : hr >= 50 && hr <= 110 ? 14 : 6;
    // SpO2 (20 pts): ≥95 good, ≥90 acceptable
    const spo2 = a.spo2 || 0;
    score += spo2 === 0 ? 10 : spo2 >= 95 ? 20 : spo2 >= 90 ? 12 : 4;
    return Math.min(100, Math.round(score));
  })();

  return (
    <>
      <div className="space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl w-fit font-bold tracking-tight text-slate-800 dark:text-white">
              Health Dashboard
            </h1>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowChat(true)}
                className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 dark:border-teal-400/30"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Ask Dr. iSHA
              </Button>
              <Button
                onClick={generateHealthInsights}
                disabled={aiAnalyzing}
                className="bg-gradient-to-r from-teal-500 to-teal-600 text-white hover:from-teal-600 hover:to-teal-700"
              >
                {aiAnalyzing ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
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
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Last AI analysis: {lastAnalysis.toLocaleString()}
            </p>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <TabsTrigger value="activity" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white text-slate-600 dark:text-slate-300">
              Activity
            </TabsTrigger>
            <TabsTrigger value="overview" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white text-slate-600 dark:text-slate-300">
              Devices
            </TabsTrigger>
            <TabsTrigger value="insights" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white text-slate-600 dark:text-slate-300">
              AI Insights
            </TabsTrigger>
            <TabsTrigger value="goals" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white text-slate-600 dark:text-slate-300">
              Goals
            </TabsTrigger>
            <TabsTrigger value="trends" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white text-slate-600 dark:text-slate-300">
              Trends
            </TabsTrigger>
          </TabsList>

          {/* Activity Tab — Daily Log + Stats */}
          <TabsContent value="activity" className="space-y-6">
            {/* Today's Quick Stats */}
            {todayActivity && (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {[
                  { icon: Footprints, label: 'Steps', value: todayActivity.steps?.toLocaleString() || '—', color: 'text-blue-500' },
                  { icon: Activity, label: 'Stairs', value: todayActivity.stairs || '—', color: 'text-indigo-500' },
                  { icon: Flame, label: 'Cal Burned', value: todayActivity.calories_burned || '—', color: 'text-orange-500' },
                  { icon: Moon, label: 'Sleep', value: todayActivity.sleep_hours ? `${todayActivity.sleep_hours}h` : '—', color: 'text-violet-500' },
                  { icon: Dumbbell, label: 'Exercise', value: todayActivity.exercise_minutes ? `${todayActivity.exercise_minutes}m` : '—', color: 'text-green-500' },
                  { icon: Heart, label: 'Heart Rate', value: todayActivity.heart_rate ? `${todayActivity.heart_rate}` : '—', color: 'text-red-500' },
                ].map((stat, i) => (
                  <Card key={i} className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                    <CardContent className="p-3 text-center">
                      <stat.icon className={`h-5 w-5 mx-auto mb-1 ${stat.color}`} />
                      <p className="text-lg font-bold text-slate-800 dark:text-white">{stat.value}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Log Form */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center text-slate-800 dark:text-white">
                  <Calendar className="h-5 w-5 mr-2 text-teal-500" />
                  Log Today's Activity
                  {activitySaved && <Badge className="ml-2 bg-green-500 text-white">Saved!</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Steps & Stairs & Calories */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center">
                    <Footprints className="h-4 w-4 mr-1 text-blue-500" /> Activity
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Steps</label>
                      <Input type="number" placeholder="0" value={activityForm.steps} onChange={e => updateField('steps', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Stairs (flights)</label>
                      <Input type="number" placeholder="0" value={activityForm.stairs} onChange={e => updateField('stairs', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Calories Burned</label>
                      <Input type="number" placeholder="0" value={activityForm.caloriesBurned} onChange={e => updateField('caloriesBurned', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Calories Consumed</label>
                      <Input type="number" placeholder="0" value={activityForm.caloriesConsumed} onChange={e => updateField('caloriesConsumed', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-200 dark:bg-slate-700" />

                {/* Exercise & Sleep */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center">
                    <Dumbbell className="h-4 w-4 mr-1 text-green-500" /> Exercise & Sleep
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Exercise Type</label>
                      <Select value={activityForm.exerciseType} onValueChange={v => updateField('exerciseType', v)}>
                        <SelectTrigger className="dark:bg-slate-700 dark:border-slate-600">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {['walking', 'running', 'cycling', 'swimming', 'yoga', 'gym', 'sports', 'dance', 'other'].map(t => (
                            <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Duration (min)</label>
                      <Input type="number" placeholder="0" value={activityForm.exerciseMinutes} onChange={e => updateField('exerciseMinutes', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Sleep (hours)</label>
                      <Input type="number" step="0.5" placeholder="0" value={activityForm.sleepHours} onChange={e => updateField('sleepHours', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Sleep Quality</label>
                      <Select value={activityForm.sleepQuality} onValueChange={v => updateField('sleepQuality', v)}>
                        <SelectTrigger className="dark:bg-slate-700 dark:border-slate-600">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {['poor', 'fair', 'good', 'excellent'].map(q => (
                            <SelectItem key={q} value={q}>{q.charAt(0).toUpperCase() + q.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-200 dark:bg-slate-700" />

                {/* Vitals */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center">
                    <Heart className="h-4 w-4 mr-1 text-red-500" /> Vitals
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Heart Rate (bpm)</label>
                      <Input type="number" placeholder="72" value={activityForm.heartRate} onChange={e => updateField('heartRate', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">BP Systolic</label>
                      <Input type="number" placeholder="120" value={activityForm.bpSystolic} onChange={e => updateField('bpSystolic', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">BP Diastolic</label>
                      <Input type="number" placeholder="80" value={activityForm.bpDiastolic} onChange={e => updateField('bpDiastolic', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">SpO2 (%)</label>
                      <Input type="number" placeholder="98" value={activityForm.spo2} onChange={e => updateField('spo2', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Temperature (°C)</label>
                      <Input type="number" step="0.1" placeholder="36.6" value={activityForm.temperature} onChange={e => updateField('temperature', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Weight (kg)</label>
                      <Input type="number" step="0.1" placeholder="68" value={activityForm.weight} onChange={e => updateField('weight', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">Blood Sugar (mg/dL)</label>
                      <Input type="number" placeholder="95" value={activityForm.bloodSugar} onChange={e => updateField('bloodSugar', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-200 dark:bg-slate-700" />

                {/* Notes & Save */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400">Notes</label>
                    <Input placeholder="How was your day?" value={activityForm.notes} onChange={e => updateField('notes', e.target.value)} className="dark:bg-slate-700 dark:border-slate-600" />
                  </div>
                  <Button
                    onClick={saveActivity}
                    disabled={savingActivity}
                    className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white hover:from-teal-600 hover:to-teal-700"
                  >
                    {savingActivity ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save Today's Activity</>}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Weekly Summary */}
            {weeklySummary?.summary?.days_logged > 0 && (
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="flex items-center text-slate-800 dark:text-white">
                    <BarChart3 className="h-5 w-5 mr-2 text-teal-500" />
                    Weekly Summary ({weeklySummary.summary.days_logged} days logged)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Avg Steps', value: weeklySummary.summary.avg_steps?.toLocaleString(), icon: Footprints, color: 'text-blue-500' },
                      { label: 'Avg Calories', value: weeklySummary.summary.avg_calories_burned, icon: Flame, color: 'text-orange-500' },
                      { label: 'Avg Sleep', value: `${weeklySummary.summary.avg_sleep_hours}h`, icon: Moon, color: 'text-violet-500' },
                      { label: 'Total Exercise', value: `${weeklySummary.summary.total_exercise_minutes}m`, icon: Dumbbell, color: 'text-green-500' },
                      { label: 'Avg Heart Rate', value: weeklySummary.summary.avg_heart_rate ? `${weeklySummary.summary.avg_heart_rate} bpm` : '—', icon: Heart, color: 'text-red-500' },
                      { label: 'Avg SpO2', value: weeklySummary.summary.avg_spo2 ? `${weeklySummary.summary.avg_spo2}%` : '—', icon: Droplets, color: 'text-cyan-500' },
                      { label: 'Avg BP', value: weeklySummary.summary.avg_bp_systolic ? `${weeklySummary.summary.avg_bp_systolic}/${weeklySummary.summary.avg_bp_diastolic}` : '—', icon: Activity, color: 'text-indigo-500' },
                      { label: 'Avg Weight', value: weeklySummary.summary.avg_weight ? `${weeklySummary.summary.avg_weight} kg` : '—', icon: Target, color: 'text-teal-500' },
                    ].map((stat, i) => (
                      <div key={i} className="flex items-center space-x-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/30">
                        <stat.icon className={`h-5 w-5 ${stat.color} flex-shrink-0`} />
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-white">{stat.value}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          {/* Overview Tab - Google Fit Dashboard */}
          <TabsContent value="overview" className="space-y-6">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center text-slate-800 dark:text-white">
                  <Activity className="h-5 w-5 mr-2 text-teal-500" />
                  Fitness Data Integration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingFitness && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading your recent fitness summary...
                  </p>
                )}
                {fitnessError && (
                  <p className="text-sm text-red-500 dark:text-red-400">
                    {fitnessError}
                  </p>
                )}
                {!loadingFitness && !fitnessError && !fitnessData && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No fitness data found yet. Connect Google Fit or Apple Health to sync
                    activity and see personalized trends and AI insights.
                  </p>
                )}
                
                {/* Health Data Source Tabs */}
                <Tabs defaultValue="google" className="w-full mt-6">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="google" className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Google Fit (Android)
                    </TabsTrigger>
                    <TabsTrigger value="apple" className="flex items-center gap-2">
                      <Heart className="h-4 w-4" />
                      Apple Health (iOS)
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="google">
                    <HealthConnectDashboard />
                  </TabsContent>

                  <TabsContent value="apple">
                    <AppleHealthDashboard />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Insights Tab */}
          <TabsContent value="insights" className="space-y-6">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center text-teal-600 dark:text-teal-400">
                  <Brain className="h-5 w-5 mr-2" />
                  Dr. iSHA Health Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {healthInsights.length === 0 ? (
                  <div className="text-center py-12">
                    <Sparkles className="h-12 w-12 text-teal-500 mx-auto mb-4 opacity-50" />
                    <p className="text-slate-500 dark:text-slate-400 mb-4">Get personalized health insights with AI analysis</p>
                    <Button
                      onClick={generateHealthInsights}
                      disabled={aiAnalyzing}
                      className="bg-gradient-to-r from-teal-500 to-teal-600 text-white"
                    >
                      {aiAnalyzing ? 'Analyzing...' : 'Generate Insights'}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {healthInsights
                      .sort((a, b) => a.priority - b.priority)
                      .map((insight) => (
                        <Card key={insight.id} className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                          <CardContent className="p-4">
                            <div className="flex items-start space-x-3">
                              {getInsightIcon(insight.type)}
                              <div className="flex-1">
                                <h4 className="font-semibold text-teal-600 dark:text-teal-400 mb-1">
                                  {insight.title}
                                </h4>
                                <p className="text-slate-600 dark:text-slate-300 text-sm mb-2">
                                  {insight.description}
                                </p>
                                {insight.recommendation && (
                                  <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700/50 rounded-md p-3 mt-2">
                                    <p className="text-teal-700 dark:text-teal-300 text-sm font-medium">
                                      💡 Recommendation: {insight.recommendation}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <Badge variant="outline" className="text-xs border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300">
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
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center text-teal-600 dark:text-teal-400">
                  <Target className="h-5 w-5 mr-2" />
                  Health Goals & Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {healthGoals.map((goal) => (
                  <Card key={goal.id} className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-teal-600 dark:text-teal-400">{goal.title}</h4>
                        <Badge className={getGoalStatusColor(goal.status)}>
                          {goal.status.replace('-', ' ')}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-300">Progress</span>
                          <span className="text-teal-600 dark:text-teal-400 font-medium">
                            {goal.current.toLocaleString()} / {goal.target.toLocaleString()} {goal.unit}
                          </span>
                        </div>
                        
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-teal-500 to-teal-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(goal.progress, 100)}%` }}
                          />
                        </div>
                        
                        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>Target: {new Date(goal.deadline).toLocaleDateString('en-IN')}</span>
                          <span>{goal.progress.toFixed(1)}% complete</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                <Card className="bg-teal-50 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-700/50 border-dashed">
                  <CardContent className="p-4 text-center">
                    <Target className="h-8 w-8 text-teal-500 mx-auto mb-2 opacity-50" />
                    <p className="text-slate-600 dark:text-slate-300 text-sm mb-3">Want to set a new health goal?</p>
                    <Button
                      variant="outline"
                      onClick={() => setShowChat(true)}
                      className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
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
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="flex items-center text-teal-600 dark:text-teal-400">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Weekly Activity Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {fitnessData ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                            {fitnessData.weeklyAverage.toLocaleString()}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Avg Daily Steps</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-teal-500">
                            {(fitnessData.activeMinutes.reduce((a, b) => a + b, 0) / 7).toFixed(0)}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Avg Active Minutes</p>
                        </div>
                      </div>
                      
                      <Separator className="bg-slate-200 dark:bg-slate-700" />
                      
                      <div className="space-y-2">
                        <h5 className="font-medium text-teal-600 dark:text-teal-400">This Week's Performance</h5>
                        <div className="flex items-center space-x-2">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-slate-600 dark:text-slate-300">
                            {fitnessData.lastWeekTrend === 'improving' ? 'Improving trend detected' : 'Stable performance'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400 text-center py-4">Connect Google Fit to see trends</p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="flex items-center text-teal-600 dark:text-teal-400">
                    <BarChart3 className="h-5 w-5 mr-2" />
                    Health Score
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="relative w-24 h-24 mx-auto mb-4">
                      <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-700"></div>
                      <div 
                        className="absolute inset-0 rounded-full border-4 border-teal-500 border-t-transparent transition-all duration-1000 animate-pulse"
                        style={{ 
                          transform: 'rotate(45deg)',
                          borderTopColor: 'rgb(20 184 166)'
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                          {computedHealthScore !== null ? computedHealthScore : '—'}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Overall Health Score</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">Activity Level</span>
                      <span className="text-teal-600 dark:text-teal-400">Excellent</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">Sleep Quality</span>
                      <span className="text-green-500">Good</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">Heart Health</span>
                      <span className="text-teal-500">Good</span>
                    </div>
                  </div>
                  
                  <Button
                    onClick={generateHealthInsights}
                    variant="outline"
                    size="sm"
                    className="w-full border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
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
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg w-full max-w-2xl h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400">Health Consultation with Dr. iSHA</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowChat(false)}
                  className="text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400"
                >
                  ✕
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
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
    </>
  );
};

export default HealthTracker;
