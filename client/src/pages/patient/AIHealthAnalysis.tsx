import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, Activity, Heart, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Sparkles, RefreshCw, Download, Calendar } from 'lucide-react';
import { orchestratorAPI } from '@/services/orchestrator';
import { useToast } from '@/hooks/use-toast';

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
      excellent: 'bg-green-100 text-green-800',
      good: 'bg-blue-100 text-blue-800',
      fair: 'bg-yellow-100 text-yellow-800',
      poor: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
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
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-purple-600" />
            AI Health Analysis
          </h1>
          <p className="text-gray-600 mt-1">AI-powered comprehensive health assessment</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runAIAnalysis} disabled={analyzing}>
            {analyzing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Run AI Analysis
              </>
            )}
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Overall Health Score */}
      <Card className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50">
        <CardHeader>
          <CardTitle>Overall Health Score</CardTitle>
          <CardDescription>AI-calculated composite health score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-6xl font-bold text-purple-600 mb-2">
                {healthScore.overall}
                <span className="text-2xl text-gray-500">/100</span>
              </div>
              <p className="text-gray-600">
                Your health is in <strong className="text-purple-600">Good</strong> condition
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(healthScore.categories).map(([key, value]) => (
                <div key={key} className="text-center p-3 bg-white rounded-lg shadow-sm">
                  <p className="text-xs text-gray-600 capitalize mb-1">{key}</p>
                  <p className={`text-2xl font-bold ${getScoreColor(value)}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Metrics */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current Health Metrics</CardTitle>
          <CardDescription>Real-time health indicators from connected devices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {healthMetrics.map((metric, index) => (
              <div key={index} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm text-gray-600">{metric.name}</p>
                    <p className="text-2xl font-bold mt-1">{metric.value}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={getStatusColor(metric.status)}>
                      {metric.status}
                    </Badge>
                    {getTrendIcon(metric.trend)}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
                  <Calendar className="h-3 w-3" />
                  Updated: {metric.lastUpdated.toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI-Generated Health Insights
          </CardTitle>
          <CardDescription>Personalized recommendations based on your health data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {aiInsights.map((insight, index) => (
              <div 
                key={index} 
                className={`p-4 border-l-4 rounded-lg ${
                  insight.severity === 'alert' ? 'border-red-500 bg-red-50' :
                  insight.severity === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                  'border-blue-500 bg-blue-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {getSeverityIcon(insight.severity)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-lg">{insight.title}</h4>
                      <Badge variant="outline">{insight.category}</Badge>
                    </div>
                    <p className="text-gray-700 mb-3">{insight.description}</p>
                    <div className="bg-white p-3 rounded border">
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        💡 Recommendation:
                      </p>
                      <p className="text-sm text-gray-700">{insight.recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Health Trends (placeholder for future charts) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Health Trends</CardTitle>
          <CardDescription>Track your health metrics over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Health trend charts will be displayed here</p>
            <p className="text-sm mt-2">Connect your devices to start tracking</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIHealthAnalysis;
