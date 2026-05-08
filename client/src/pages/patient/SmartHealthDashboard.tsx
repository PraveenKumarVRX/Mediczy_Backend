import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft, Brain, Activity, Heart, TrendingUp, TrendingDown,
  AlertCircle, CheckCircle, Sparkles, RefreshCw, Shield, Clock,
  ChevronRight, Pill, Apple, Dumbbell, Moon, Zap, AlertTriangle,
  Bell, FileText, Scan, Stethoscope, Star, ShieldAlert
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import aiHealthServices, {
  HealthRiskScore,
  SmartNotification,
  ClinicalInsight,
  HealthIntelligenceData,
  HealthAppreciation,
  HealthHazard,
} from '@/services/aiHealthServices';

const riskColors: Record<string, { text: string; bg: string; ring: string }> = {
  low: { text: 'text-green-600', bg: 'bg-green-500', ring: 'ring-green-200' },
  moderate: { text: 'text-yellow-600', bg: 'bg-yellow-500', ring: 'ring-yellow-200' },
  high: { text: 'text-orange-600', bg: 'bg-orange-500', ring: 'ring-orange-200' },
  critical: { text: 'text-red-600', bg: 'bg-red-500', ring: 'ring-red-200' },
};

const insightIcons: Record<string, any> = {
  medication: Pill,
  checkups: Stethoscope,
  lifestyle: Activity,
  diet: Apple,
  activity: Dumbbell,
  vitals: Heart,
  lab_tests: FileText,
  sleep: Moon,
};

const SmartHealthDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [riskScore, setRiskScore] = useState<HealthRiskScore | null>(null);
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [intelligence, setIntelligence] = useState<HealthIntelligenceData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'insights'>('overview');

  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchAllData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [scoreRes, notifRes, intelRes] = await Promise.all([
        aiHealthServices.getMyRiskScore(),
        aiHealthServices.getSmartNotifications({ limit: 30 }),
        aiHealthServices.getHealthIntelligence(),
      ]);

      if (scoreRes.success && scoreRes.score) {
        setRiskScore(scoreRes.score);
      }
      if (notifRes.success) {
        setNotifications(notifRes.notifications);
      }
      if (intelRes.success && intelRes.data) {
        setIntelligence(intelRes.data);
      }
    } catch (error) {
      console.error('[SmartHealth] Fetch error:', error);
      if (isRefresh) {
        toast({ title: 'Refresh failed', description: 'Could not refresh data', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return { text: 'text-green-600', stroke: 'stroke-green-500', label: 'Excellent' };
    if (score >= 60) return { text: 'text-yellow-600', stroke: 'stroke-yellow-500', label: 'Good' };
    if (score >= 40) return { text: 'text-orange-600', stroke: 'stroke-orange-500', label: 'Fair' };
    return { text: 'text-red-600', stroke: 'stroke-red-500', label: 'Needs Attention' };
  };

  const handleNotificationTap = async (notif: SmartNotification) => {
    await aiHealthServices.markNotificationRead(notif.id);
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, status: 'read' } : n));
    if (notif.action_url) {
      navigate(notif.action_url);
    }
  };

  const overallScore = riskScore?.overall_score ?? 0;
  const scoreConfig = getScoreColor(overallScore);
  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  // If loading, show shimmer
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
            <h1 className="text-lg font-semibold">AI Health Dashboard</h1>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 rounded-2xl bg-slate-200/50 dark:bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5 text-teal-600" />
              AI Health Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">Powered by clinical AI analysis</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => fetchAllData(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-2">
          {(['overview', 'alerts', 'insights'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab === 'alerts' && unreadCount > 0 ? `Alerts (${unreadCount})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-4">
        {/* ══════ OVERVIEW TAB ══════ */}
        {activeTab === 'overview' && (
          <>
            {/* Health Score Circle */}
            <Card className="border-slate-200/50 dark:border-slate-700/50 overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-6">
                  {/* Circular Score */}
                  <div className="relative w-28 h-28 shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                        className="text-slate-200 dark:text-slate-700" />
                      <motion.circle
                        cx="50" cy="50" r="40" fill="none" strokeWidth="8" strokeLinecap="round"
                        className={scoreConfig.stroke}
                        initial={{ strokeDasharray: '0 251.2' }}
                        animate={{ strokeDasharray: `${(overallScore / 100) * 251.2} 251.2` }}
                        transition={{ duration: 1.5, ease: 'easeOut' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-2xl font-bold ${scoreConfig.text}`}>
                        {riskScore ? overallScore : '--'}
                      </span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2">
                    <div>
                      <p className="font-bold text-lg">{riskScore ? scoreConfig.label : 'No Data Yet'}</p>
                      <p className="text-xs text-muted-foreground">
                        {riskScore
                          ? `Updated ${new Date(riskScore.updated_at).toLocaleDateString()}`
                          : 'AI health score will be calculated automatically'}
                      </p>
                    </div>
                    {riskScore?.risk_level && (
                      <Badge className={`${riskColors[riskScore.risk_level]?.text || ''} ${riskColors[riskScore.risk_level]?.bg.replace('bg-', 'bg-opacity-10 bg-')} border-0 text-xs`}>
                        Risk: {riskScore.risk_level.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Breakdown */}
            {riskScore && (
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-600" />
                    Risk Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {[
                    { label: 'Cardiovascular', value: riskScore.cardiovascular_risk, icon: Heart, color: 'bg-red-500' },
                    { label: 'Diabetes', value: riskScore.diabetes_risk, icon: Zap, color: 'bg-amber-500' },
                    { label: 'Respiratory', value: riskScore.respiratory_risk, icon: Activity, color: 'bg-blue-500' },
                    { label: 'Mental Health', value: riskScore.mental_health_score, icon: Brain, color: 'bg-purple-500' },
                    { label: 'Lifestyle', value: riskScore.lifestyle_score, icon: Dumbbell, color: 'bg-green-500' },
                  ].map((metric) => (
                    <div key={metric.label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <metric.icon className="h-3.5 w-3.5" />
                          {metric.label}
                        </span>
                        <span className="font-semibold">{metric.value ?? '--'}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                        <motion.div
                          className={`h-full rounded-full ${metric.color}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(metric.value ?? 0, 100)}%` }}
                          transition={{ duration: 1, delay: 0.2 }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Risk Factors */}
            {riskScore?.risk_factors && riskScore.risk_factors.length > 0 && (
              <Card className="border-orange-200/50 dark:border-orange-800/50 bg-orange-50/30 dark:bg-orange-900/10">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    Risk Factors
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {riskScore.risk_factors.map((factor, i) => (
                      <Badge key={i} variant="outline" className="text-xs text-orange-700 border-orange-300 dark:text-orange-400 dark:border-orange-700">
                        {factor}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Recommendations */}
            {riskScore?.recommendations && riskScore.recommendations.length > 0 && (
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    AI Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ul className="space-y-2">
                    {riskScore.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                        <span className="text-sm text-slate-600 dark:text-slate-400">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/report-scanner')}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-teal-50 to-blue-50 dark:from-teal-900/20 dark:to-blue-900/20 border border-teal-200/50 dark:border-teal-700/50 hover:shadow-md transition-all active:scale-95"
              >
                <Scan className="h-6 w-6 text-teal-600" />
                <span className="text-xs font-semibold text-slate-700 dark:text-white">Scan Report</span>
              </button>
              <button
                onClick={() => navigate('/symptom-checker')}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 hover:shadow-md transition-all active:scale-95"
              >
                <Stethoscope className="h-6 w-6 text-blue-600" />
                <span className="text-xs font-semibold text-slate-700 dark:text-white">Check Symptoms</span>
              </button>
            </div>

            {/* No data state */}
            {!riskScore && (
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardContent className="p-8 text-center">
                  <Brain className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <h3 className="font-semibold mb-1">Your AI health profile is building</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    As you use the app, our AI continuously analyzes your health data to provide personalized insights.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/health-tracker')}>
                    Add Health Data
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ══════ ALERTS TAB ══════ */}
        {activeTab === 'alerts' && (
          <>
            {notifications.length === 0 ? (
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardContent className="p-8 text-center">
                  <Bell className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <h3 className="font-semibold mb-1">No AI alerts yet</h3>
                  <p className="text-sm text-muted-foreground">
                    The AI system continuously monitors your health and will alert you about important changes.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {notifications.map((notif) => (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <button
                      onClick={() => handleNotificationTap(notif)}
                      className={`w-full text-left p-4 rounded-xl border transition-all hover:shadow-sm active:scale-[0.99] ${
                        notif.status === 'unread'
                          ? 'bg-teal-50/50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200/50 dark:border-slate-700/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-1.5 rounded-lg ${
                          notif.priority === 'critical' ? 'bg-red-100 text-red-600' :
                          notif.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                          notif.priority === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                          'bg-teal-100 text-teal-600'
                        }`}>
                          {notif.priority === 'critical' || notif.priority === 'high'
                            ? <AlertCircle className="h-4 w-4" />
                            : <Sparkles className="h-4 w-4" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={`text-sm font-semibold truncate ${notif.status === 'unread' ? '' : 'text-slate-500'}`}>
                              {notif.title}
                            </p>
                            {notif.status === 'unread' && <div className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{notif.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {new Date(notif.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══════ INSIGHTS TAB ══════ */}
        {activeTab === 'insights' && (
          <>
            {intelligence ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-2">
                  {intelligence.summary.overall_score !== undefined && (
                    <Card className="col-span-2 border-teal-200 bg-teal-50/30 dark:border-teal-800 dark:bg-teal-900/10">
                      <CardContent className="p-3 flex items-center gap-3">
                        <Heart className="h-8 w-8 text-teal-600 shrink-0" />
                        <div>
                          <p className="text-3xl font-bold text-teal-600">{intelligence.summary.overall_score}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
                          <p className="text-xs text-muted-foreground">Daily Health Score</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Card className="border-slate-200/50 dark:border-slate-700/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-teal-600">{intelligence.summary.total_reminders}</p>
                      <p className="text-xs text-muted-foreground">Total Items</p>
                    </CardContent>
                  </Card>
                  <Card className="border-slate-200/50 dark:border-slate-700/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-orange-600">{intelligence.summary.high_priority}</p>
                      <p className="text-xs text-muted-foreground">High Priority</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Appreciations */}
                {intelligence.appreciations && intelligence.appreciations.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-green-700 dark:text-green-400">
                      <Star className="h-4 w-4" />
                      What You're Doing Well
                    </h3>
                    {intelligence.appreciations.map((item: HealthAppreciation, i: number) => (
                      <Card key={i} className="border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-900/10">
                        <CardContent className="p-3 flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{item.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.message}</p>
                            <span className="inline-block mt-1 text-xs text-green-600 border border-green-300 rounded-full px-2 py-0.5 capitalize">{item.domain}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Hazards */}
                {intelligence.hazards && intelligence.hazards.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-orange-700 dark:text-orange-400">
                      <ShieldAlert className="h-4 w-4" />
                      Health Hazard Predictions
                    </h3>
                    {intelligence.hazards.map((item: HealthHazard, i: number) => {
                      const urgencyBg = item.urgency === 'high'
                        ? 'border-red-300 bg-red-50/40 dark:border-red-800 dark:bg-red-900/10'
                        : item.urgency === 'medium'
                        ? 'border-orange-300 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-900/10'
                        : 'border-yellow-300 bg-yellow-50/40 dark:border-yellow-800 dark:bg-yellow-900/10';
                      const badgeColor = item.urgency === 'high' ? 'bg-red-500' : item.urgency === 'medium' ? 'bg-orange-500' : 'bg-yellow-500';
                      return (
                        <Card key={i} className={`border ${urgencyBg}`}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                              <p className="text-sm font-semibold flex-1">{item.title}</p>
                              <span className={`text-xs text-white rounded-full px-2 py-0.5 ${badgeColor}`}>{item.urgency}</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{item.prediction}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">{item.recommendation}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Category Breakdown */}
                {Object.entries(intelligence.categories).map(([category, items]) => {
                  if (!items || items.length === 0) return null;
                  const Icon = insightIcons[category] || Sparkles;
                  return (
                    <Card key={category} className="border-slate-200/50 dark:border-slate-700/50">
                      <CardHeader className="pb-2 px-4 pt-4">
                        <CardTitle className="text-sm flex items-center gap-2 capitalize">
                          <Icon className="h-4 w-4 text-teal-600" />
                          {category.replace('_', ' ')}
                          <Badge variant="outline" className="ml-auto text-xs">{items.length}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="space-y-2">
                          {items.slice(0, 3).map((item: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                                item.priority >= 4 ? 'bg-red-500' : item.priority >= 3 ? 'bg-orange-500' : 'bg-green-500'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{item.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{item.message}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            ) : (
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardContent className="p-8 text-center">
                  <Sparkles className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <h3 className="font-semibold mb-1">Health Insights Loading</h3>
                  <p className="text-sm text-muted-foreground">
                    AI is continuously learning from your health data to provide personalized insights.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SmartHealthDashboard;
