import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, Activity, Heart, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Sparkles, RefreshCw, Download, Calendar } from 'lucide-react';
import { orchestratorAPI } from '@/services/orchestrator';
import { useToast } from '@/hooks/use-toast';
import MainLayout from '@/components/layout/MainLayout';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

interface HealthMetric {
  name: string;
  value: string;
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  trend: 'up' | 'down' | 'stable';
  lastUpdated: Date;
}

interface AIInsight {
  category: string;
  severity: 'info' | 'warning' | 'alert';
  title: string;
  description: string;
  recommendation: string;
}

interface HealthScore {
  overall: number;
  categories: {
    physical: number;
    mental: number;
    nutrition: number;
    sleep: number;
    activity: number;
  };
}

const AIHealthAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const { toast } = useToast();

  const [healthScore, setHealthScore] = useState<HealthScore>({
    overall: 82,
    categories: {
      physical: 85,
      mental: 78,
      nutrition: 80,
      sleep: 75,
      activity: 88
    }
  });

  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([
    {
      name: 'Blood Pressure',
      value: '120/80 mmHg',
      status: 'good',
      trend: 'stable',
      lastUpdated: new Date('2025-12-07')
    },
    {
      name: 'Heart Rate',
      value: '72 bpm',
      status: 'excellent',
      trend: 'stable',
      lastUpdated: new Date('2025-12-07')
    },
    {
      name: 'Blood Sugar',
      value: '95 mg/dL',
      status: 'good',
      trend: 'down',
      lastUpdated: new Date('2025-12-07')
    },
    {
      name: 'Body Temperature',
      value: '98.6°F',
      status: 'excellent',
      trend: 'stable',
      lastUpdated: new Date('2025-12-07')
    },
    {
      name: 'Oxygen Level',
      value: '98%',
      status: 'excellent',
      trend: 'up',
      lastUpdated: new Date('2025-12-07')
    },
    {
      name: 'Weight',
      value: '70 kg',
      status: 'good',
      trend: 'down',
      lastUpdated: new Date('2025-12-06')
    }
  ]);

  const [aiInsights, setAiInsights] = useState<AIInsight[]>([
    {
      category: 'Cardiovascular Health',
      severity: 'info',
      title: 'Excellent Heart Health',
      description: 'Your heart rate and blood pressure are within optimal ranges. Keep up the good work!',
      recommendation: 'Continue regular aerobic exercise (150 min/week) and maintain balanced diet.'
    },
    {
      category: 'Metabolic Health',
      severity: 'info',
      title: 'Blood Sugar Improving',
      description: 'Your fasting blood sugar has decreased by 8% over the last month.',
      recommendation: 'Continue low-carb diet and consider adding more fiber-rich foods.'
    },
    {
      category: 'Sleep Quality',
      severity: 'warning',
      title: 'Sleep Pattern Needs Attention',
      description: 'Average sleep duration is below recommended 7-8 hours. This may affect recovery and mental health.',
      recommendation: 'Establish consistent sleep schedule. Avoid screens 1 hour before bed. Consider relaxation techniques.'
    },
    {
      category: 'Physical Activity',
      severity: 'info',
      title: 'Active Lifestyle Maintained',
      description: 'You are exceeding recommended daily step count and exercise minutes.',
      recommendation: 'Excellent! Consider adding strength training 2-3 times per week for optimal fitness.'
    }
  ]);

  const runAIAnalysis = async () => {
    setAnalyzing(true);
    try {
      const patientId = 'current-user'; // Replace with actual user ID
      
      const query = `Analyze my comprehensive health data and provide detailed insights:
      
      Health Metrics:
      ${healthMetrics.map(m => `- ${m.name}: ${m.value} (${m.status}, trend: ${m.trend})`).join('\n')}
      
      Health Score Categories:
      - Physical: ${healthScore.categories.physical}/100
      - Mental: ${healthScore.categories.mental}/100
      - Nutrition: ${healthScore.categories.nutrition}/100
      - Sleep: ${healthScore.categories.sleep}/100
      - Activity: ${healthScore.categories.activity}/100
      
      Please provide:
      1. Overall health assessment
      2. Areas of concern requiring attention
      3. Positive trends to maintain
      4. Specific actionable recommendations
      5. Risk factors to monitor
      6. Preventive measures for optimal health`;

      const result = await orchestratorAPI.consult(query, 'en', {
        analysisType: 'comprehensive_health_analysis',
        patientId,
        metrics: healthMetrics,
        scores: healthScore
      });

      if (result.success && result.data) {
        toast({
          title: "AI Analysis Complete",
          description: "Your health data has been analyzed successfully.",
        });
        
        // Parse AI response and update insights
        // In production, parse the AI response to extract structured insights
        console.log('AI Analysis Result:', result.data);
      }
    } catch (error) {
      console.error('AI Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: "Unable to complete AI analysis. Please try again.",
        variant: "destructive"
      });
    }
    setAnalyzing(false);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      excellent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      good: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      fair: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      poor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
      critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    };
    return colors[status] || colors.fair;
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'alert':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      default:
        return <CheckCircle className="h-5 w-5 text-blue-600" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />;
      default:
        return <Activity className="h-4 w-4 text-slate-500 dark:text-slate-400" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <MainLayout>
    <motion.div initial="hidden" animate="show" variants={container} className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
      {/* Premium Header */}
      <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-700 via-violet-700 to-purple-800 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm shadow-lg"><Brain className="w-6 h-6" /></div>
              <Badge className="bg-white/15 text-white/90 border-white/20 font-medium">AI-Powered</Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1">AI Health Analysis</h1>
            <p className="text-purple-200 text-sm md:text-base">AI-powered comprehensive health assessment</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={runAIAnalysis} disabled={analyzing} className="bg-white/10 border-white/20 text-white hover:bg-white/20" aria-label="Run AI analysis">
              {analyzing ? (
                <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Analyzing...</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" />Run AI Analysis</>
              )}
            </Button>
            <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" aria-label="Export report">
              <Download className="mr-2 h-4 w-4" />Export Report
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Overall Health Score */}
      <motion.div variants={item}>
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 dark:border-slate-700/60">
        <CardHeader>
          <CardTitle className="dark:text-white">Overall Health Score</CardTitle>
          <CardDescription className="dark:text-slate-400">AI-calculated composite health score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-6xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                {healthScore.overall}
                <span className="text-2xl text-slate-500 dark:text-slate-400">/100</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                Your health is in <strong className="text-purple-600 dark:text-purple-400">Good</strong> condition
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(healthScore.categories).map(([key, value]) => (
                <motion.div key={key} whileHover={{ scale: 1.05 }} className="text-center p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm dark:shadow-none dark:border dark:border-slate-700">
                  <p className="text-xs text-slate-600 dark:text-slate-400 capitalize mb-1">{key}</p>
                  <p className={`text-2xl font-bold ${getScoreColor(value)}`}>{value}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {/* Health Metrics */}
      <motion.div variants={item}>
      <Card className="dark:bg-slate-800/50 dark:border-slate-700/60">
        <CardHeader>
          <CardTitle className="dark:text-white">Current Health Metrics</CardTitle>
          <CardDescription className="dark:text-slate-400">Real-time health indicators from connected devices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {healthMetrics.map((metric, index) => (
              <motion.div key={index} whileHover={{ scale: 1.03, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="p-4 border dark:border-slate-700 rounded-xl hover:shadow-lg transition-all dark:bg-slate-800/30">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{metric.name}</p>
                    <p className="text-2xl font-bold mt-1 dark:text-white">{metric.value}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={getStatusColor(metric.status)}>
                      {metric.status}
                    </Badge>
                    {getTrendIcon(metric.trend)}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-2">
                  <Calendar className="h-3 w-3" />
                  Updated: {metric.lastUpdated.toLocaleDateString()}
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {/* AI Insights */}
      <motion.div variants={item}>
      <Card className="dark:bg-slate-800/50 dark:border-slate-700/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            AI-Generated Health Insights
          </CardTitle>
          <CardDescription className="dark:text-slate-400">Personalized recommendations based on your health data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {aiInsights.map((insight, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08, duration: 0.3 }}
                className={`p-4 border-l-4 rounded-xl ${
                  insight.severity === 'alert' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' :
                  insight.severity === 'warning' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' :
                  'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  {getSeverityIcon(insight.severity)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-lg dark:text-white">{insight.title}</h4>
                      <Badge variant="outline" className="dark:border-slate-600 dark:text-slate-300">{insight.category}</Badge>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 mb-3">{insight.description}</p>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                      <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                        💡 Recommendation:
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{insight.recommendation}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {/* Health Trends */}
      <motion.div variants={item}>
      <Card className="dark:bg-slate-800/50 dark:border-slate-700/60">
        <CardHeader>
          <CardTitle className="dark:text-white">Health Trends</CardTitle>
          <CardDescription className="dark:text-slate-400">Track your health metrics over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
              <Activity className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300">Health trend charts will appear here</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Connect your devices to start tracking</p>
          </div>
        </CardContent>
      </Card>
      </motion.div>
    </motion.div>
    </MainLayout>
  );
};

export default AIHealthAnalysis;
