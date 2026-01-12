import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import GoogleFitDashboard from "@/components/GoogleFitDashboard";
import AppleHealthDashboard from "@/components/AppleHealthDashboard";
import DrISHAChat from "@/components/DrISHAChat";
import HealthTrendCard, { healthMetricConfigs } from "@/components/health/HealthTrendCard";
import { drIshaAPI } from "@/services/drIsha";
import { useState, useEffect } from "react";
import api from "@/utils/api";
import { healthSyncScheduler, SyncStatus } from "@/services/health/HealthSyncScheduler";
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
  Watch,
  Bluetooth,
  RefreshCw,
  Plus,
  Settings,
  Smartphone,
  CheckCircle2,
  XCircle,
  Footprints,
  Moon,
  Droplets,
  Thermometer,
  Timer,
  Bell
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

interface Device {
  id: string;
  name: string;
  type: 'smartwatch' | 'fitness_band' | 'smart_ring' | 'bp_monitor' | 'glucometer' | 'weight_scale' | string;
  brand: string;
  model: string;
  status: 'connected' | 'disconnected' | 'syncing';
  lastSync: Date | null;
  battery?: number;
  dataTypes: string[];
  icon?: string;
  isVeepooDevice?: boolean;
}

interface HealthStats {
  heartRate: number | null;
  steps: number | null;
  sleepScore: number | null;
  bloodPressure: { systolic: number; diastolic: number } | null;
  spo2: number | null;
  temperature: number | null;
  bloodGlucose: number | null;
  hrv: number | null;
  uricAcid: number | null;
  totalCholesterol: number | null;
  lastUpdated: Date | null;
}

const HealthDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [healthInsights, setHealthInsights] = useState<HealthInsight[]>([]);
  const [healthGoals, setHealthGoals] = useState<HealthGoal[]>([]);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [fitnessData, setFitnessData] = useState<any>(null);
  const [lastAnalysis, setLastAnalysis] = useState<Date | null>(null);
  const [loadingFitness, setLoadingFitness] = useState(false);
  const [fitnessError, setFitnessError] = useState<string | null>(null);
  
  // Device Management State
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthStats, setHealthStats] = useState<HealthStats>({
    heartRate: null,
    steps: null,
    sleepScore: null,
    bloodPressure: null,
    spo2: null,
    temperature: null,
    bloodGlucose: null,
    hrv: null,
    uricAcid: null,
    totalCholesterol: null,
    lastUpdated: null
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [showTrendDialog, setShowTrendDialog] = useState(false);
  const [showPairingModal, setShowPairingModal] = useState(false);

  // Load all data on mount
  useEffect(() => {
    loadDevices();
    loadHealthStats();
    updateSyncStatus();
    fetchFitnessSummary();
    
    healthSyncScheduler.autoStart();
    setAutoSyncEnabled(healthSyncScheduler.isSchedulerRunning());
    
    const handleSyncEvent = () => {
      loadHealthStats();
      updateSyncStatus();
    };
    window.addEventListener('healthDataSynced', handleSyncEvent);

    const statusInterval = setInterval(updateSyncStatus, 60000);

    return () => {
      window.removeEventListener('healthDataSynced', handleSyncEvent);
      clearInterval(statusInterval);
    };
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const storedDevices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
      setDevices(storedDevices);
    } catch (error) {
      console.error('Error loading devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHealthStats = async () => {
    try {
      setLoadingStats(true);
      const { data } = await api.get("/health/latest", {
        params: { includeAdvanced: true },
      });

      if (data) {
        setHealthStats({
          heartRate: data.heartRate || null,
          steps: data.steps || null,
          sleepScore: data.sleepScore || null,
          bloodPressure: data.bloodPressure || null,
          spo2: data.spo2 || null,
          temperature: data.temperature || null,
          bloodGlucose: data.bloodGlucose || null,
          hrv: data.hrv || null,
          uricAcid: data.uricAcid || null,
          totalCholesterol: data.totalCholesterol || null,
          lastUpdated: new Date(data.timestamp || Date.now()),
        });
      }
    } catch (error) {
      console.error('Error loading health stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchFitnessSummary = async () => {
    try {
      setLoadingFitness(true);
      setFitnessError(null);

      const { data } = await api.get("/fitness/summary", {
        params: { days: 7 },
      });

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

      const hasAnyData =
        mappedFitness.dailySteps.length > 0 &&
        (mappedFitness.dailySteps.some((s: number) => s > 0) ||
          mappedFitness.caloriesBurned.some((c: number) => c > 0));

      setFitnessData(hasAnyData ? mappedFitness : null);
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message;
      if (!errorMsg.includes('No fitness data') && !errorMsg.includes('not found')) {
        setFitnessError(errorMsg);
      }
      setFitnessData(null);
    } finally {
      setLoadingFitness(false);
    }
  };

  const updateSyncStatus = async () => {
    const status = healthSyncScheduler.getStatus();
    setSyncStatus(status);
  };

  const toggleAutoSync = async (checked: boolean) => {
    setAutoSyncEnabled(checked);
    if (checked) {
      healthSyncScheduler.start();
    } else {
      healthSyncScheduler.stop();
    }
  };

  const generateHealthInsights = async () => {
    if (!fitnessData) {
      setHealthInsights([]);
      return;
    }

    setAiAnalyzing(true);
    try {
      const aiInsights = parseAIInsights("");
      setHealthInsights(aiInsights);
      setLastAnalysis(new Date());
    } catch (error) {
      console.error('Error generating insights:', error);
      setHealthInsights(getFallbackInsights());
    } finally {
      setAiAnalyzing(false);
    }
  };

  const parseAIInsights = (aiResponse: string): HealthInsight[] => {
    const insights: HealthInsight[] = [];
    
    if (fitnessData.weeklyAverage > 10000) {
      insights.push({
        id: '1',
        type: 'achievement',
        title: 'Step Goal Consistently Achieved! 🎉',
        description: `Excellent work! You're averaging ${fitnessData.weeklyAverage.toLocaleString()} steps daily.`,
        priority: 1,
        actionable: false,
        metric: 'steps',
        trend: 'up'
      });
    }

    const highestActiveDay = Math.max(...fitnessData.activeMinutes);
    const lowestActiveDay = Math.min(...fitnessData.activeMinutes);
    insights.push({
      id: '2',
      type: 'neutral',
      title: 'Activity Pattern Analysis',
      description: `Your active minutes vary from ${lowestActiveDay} to ${highestActiveDay} minutes daily.`,
      priority: 2,
      actionable: true,
      recommendation: 'Aim for 60+ active minutes daily',
      metric: 'activity',
      trend: 'stable'
    });

    const avgSleep = fitnessData.sleepHours.length > 0 
      ? fitnessData.sleepHours.reduce((a: number, b: number) => a + b, 0) / fitnessData.sleepHours.length 
      : 0;

    insights.push({
      id: '3',
      type: avgSleep < 7 ? 'warning' : 'positive',
      title: avgSleep < 7 ? 'Sleep Duration Below Optimal' : 'Good Sleep Habits',
      description: avgSleep < 7 
        ? `Your average sleep is ${avgSleep.toFixed(1)} hours. Optimal health requires 7-9 hours nightly.`
        : `Great job maintaining ${avgSleep.toFixed(1)} hours average sleep!`,
      priority: 1,
      actionable: avgSleep < 7,
      recommendation: avgSleep < 7 ? 'Establish consistent bedtime routine' : undefined,
      metric: 'sleep'
    });

    return insights;
  };

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
      recommendation: 'Review your health data weekly',
    }
  ];

  const handleSync = async (deviceId: string) => {
    setDevices(devices.map(device => 
      device.id === deviceId 
        ? { ...device, status: 'syncing' as const }
        : device
    ));

    try {
      await healthSyncScheduler.triggerDeviceMeasurements();
      const success = await healthSyncScheduler.performSync();
      
      setDevices(prev => prev.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'connected' as const, lastSync: new Date() }
          : device
      ));
      
      if (success) {
        loadHealthStats();
      }
    } catch (error) {
      console.error('Sync error:', error);
      setDevices(prev => prev.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'connected' as const }
          : device
      ));
    }
  };

  const disconnectDevice = (deviceId: string) => {
    const updatedDevices = devices.filter(d => d.id !== deviceId);
    localStorage.setItem('connectedDevices', JSON.stringify(updatedDevices));
    setDevices(updatedDevices);
  };

  const connectedDevicesCount = devices.filter(d => d.status === 'connected').length;

  return (
    <MainLayout>
      <div className="space-y-8 animate-in fade-in duration-700">
        {/* Page Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl w-fit font-bold tracking-tight text-slate-800 dark:text-white">
                Health Dashboard
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">Monitor your health metrics and connected devices</p>
            </div>
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
                disabled={aiAnalyzing || !fitnessData}
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
                    AI Analysis
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

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <TabsTrigger value="overview" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              Overview
            </TabsTrigger>
            <TabsTrigger value="devices" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              Devices
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="insights" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              Insights
            </TabsTrigger>
            <TabsTrigger value="goals" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              Goals
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB - Quick Stats & Fitness Data */}
          <TabsContent value="overview" className="space-y-6">
            {/* Health Data Platforms */}
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
                    No fitness data found yet. Connect Google Fit or Apple Health to sync activity.
                  </p>
                )}
                
                {/* Fitness Platforms Tabs */}
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
                    <GoogleFitDashboard />
                  </TabsContent>

                  <TabsContent value="apple">
                    <AppleHealthDashboard />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DEVICES TAB - Connected Devices Management */}
          <TabsContent value="devices" className="space-y-6">
            {/* Device Header */}
            <div className="relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl overflow-hidden p-6 text-white">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl" />
              <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
                      <Watch className="w-6 h-6" />
                    </div>
                    <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                      {connectedDevicesCount} Connected
                    </Badge>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-2">Connected Devices</h2>
                  <p className="text-slate-300 text-sm md:text-base">
                    Manage smartwatches, fitness bands, and smart rings for automatic health tracking
                  </p>
                </div>
                <Button onClick={() => setShowPairingModal(true)} className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30">
                  <Bluetooth className="mr-2 h-4 w-4" />
                  Pair New Device
                </Button>
              </div>
            </div>

            {/* Quick Device Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
                      <Watch className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Devices</p>
                      <p className="text-lg font-bold text-slate-800 dark:text-white">{connectedDevicesCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-red-300 dark:hover:border-red-700 transition-all" onClick={() => { setSelectedMetric('heart_rate'); setShowTrendDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                        <Heart className="w-5 h-5 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Heart Rate</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-white">
                          {loadingStats ? '...' : healthStats.heartRate ? `${healthStats.heartRate} bpm` : '-- bpm'}
                        </p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all" onClick={() => { setSelectedMetric('steps'); setShowTrendDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <Footprints className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Steps Today</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-white">
                          {loadingStats ? '...' : healthStats.steps ? healthStats.steps.toLocaleString() : '--'}
                        </p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all" onClick={() => { setSelectedMetric('sleep'); setShowTrendDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                        <Moon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Sleep Score</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-white">
                          {loadingStats ? '...' : healthStats.sleepScore ? `${healthStats.sleepScore}%` : '--%'}
                        </p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Connected Devices List */}
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle>Your Connected Devices</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-slate-500 dark:text-slate-400">Loading devices...</p>
                ) : devices.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">No devices connected yet. Tap "Pair New Device" to get started.</p>
                ) : (
                  <div className="space-y-3">
                    {devices.map(device => (
                      <div key={device.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600">
                        <div className="flex items-center gap-4">
                          <div className="text-3xl">{device.icon || '📱'}</div>
                          <div>
                            <p className="font-medium text-slate-800 dark:text-white">{device.name}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{device.brand} {device.model}</p>
                            <div className="flex gap-2 mt-2">
                              {device.dataTypes.slice(0, 3).map((type, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">{type}</Badge>
                              ))}
                              {device.dataTypes.length > 3 && (
                                <Badge variant="outline" className="text-xs">+{device.dataTypes.length - 3}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            {device.battery !== undefined && (
                              <p className="text-sm text-slate-600 dark:text-slate-400">🔋 {device.battery}%</p>
                            )}
                            {device.lastSync && (
                              <p className="text-xs text-slate-500 dark:text-slate-500">Synced: {device.lastSync.toLocaleString()}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleSync(device.id)} disabled={syncing}>
                              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => disconnectDevice(device.id)}>
                              <XCircle className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Auto-Sync Settings */}
            <Card className="bg-gradient-to-r from-slate-50 to-teal-50/30 dark:from-slate-800/50 dark:to-teal-900/20 border-teal-200/50 dark:border-teal-700/30">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
                        <Timer className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-white">Auto-Sync</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Sync data every 30 minutes
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={autoSyncEnabled}
                      onCheckedChange={toggleAutoSync}
                      className="data-[state=checked]:bg-teal-500"
                    />
                  </div>
                  
                  {autoSyncEnabled && syncStatus && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Clock className="w-4 h-4 text-teal-500" />
                      <span>Next sync: {syncStatus.nextSync ? new Date(syncStatus.nextSync).toLocaleTimeString() : 'Soon'}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ANALYTICS TAB - Health Metrics & Trends */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-pink-300 dark:hover:border-pink-700 transition-all" onClick={() => { setSelectedMetric('blood_pressure_systolic'); setShowTrendDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30">
                        <Activity className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Blood Pressure</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-white">
                          {loadingStats ? '...' : healthStats.bloodPressure 
                            ? `${healthStats.bloodPressure.systolic}/${healthStats.bloodPressure.diastolic}` 
                            : '--/--'}
                        </p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-cyan-300 dark:hover:border-cyan-700 transition-all" onClick={() => { setSelectedMetric('spo2'); setShowTrendDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                        <Droplets className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">SpO2</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-white">
                          {loadingStats ? '...' : healthStats.spo2 ? `${healthStats.spo2}%` : '--%'}
                        </p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-orange-300 dark:hover:border-orange-700 transition-all" onClick={() => { setSelectedMetric('blood_glucose'); setShowTrendDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                        <Zap className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Blood Sugar</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-white">
                          {loadingStats ? '...' : healthStats.bloodGlucose ? `${healthStats.bloodGlucose} mg/dL` : '-- mg/dL'}
                        </p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all" onClick={() => { setSelectedMetric('hrv'); setShowTrendDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                        <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">HRV</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-white">
                          {loadingStats ? '...' : healthStats.hrv ? `${healthStats.hrv} ms` : '-- ms'}
                        </p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all" onClick={() => { setSelectedMetric('uric_acid'); setShowTrendDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                        <Droplets className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Uric Acid</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-white">
                          {loadingStats ? '...' : healthStats.uricAcid ? `${healthStats.uricAcid} mg/dL` : '-- mg/dL'}
                        </p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-rose-300 dark:hover:border-rose-700 transition-all" onClick={() => { setSelectedMetric('total_cholesterol'); setShowTrendDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30">
                        <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Cholesterol</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-white">
                          {loadingStats ? '...' : healthStats.totalCholesterol ? `${healthStats.totalCholesterol} mg/dL` : '-- mg/dL'}
                        </p>
                      </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Trend Analytics Dialog */}
            <Dialog open={showTrendDialog} onOpenChange={setShowTrendDialog}>
              <DialogContent className="max-w-2xl">
                {selectedMetric && healthMetricConfigs[selectedMetric as keyof typeof healthMetricConfigs] && (
                  <HealthTrendCard
                    dataType={selectedMetric}
                    title={healthMetricConfigs[selectedMetric as keyof typeof healthMetricConfigs].title}
                    currentValue={
                      selectedMetric === 'heart_rate' ? healthStats.heartRate :
                      selectedMetric === 'steps' ? healthStats.steps :
                      selectedMetric === 'sleep' ? healthStats.sleepScore :
                      selectedMetric === 'blood_pressure_systolic' ? healthStats.bloodPressure?.systolic ?? null :
                      selectedMetric === 'spo2' ? healthStats.spo2 :
                      selectedMetric === 'blood_glucose' ? healthStats.bloodGlucose :
                      selectedMetric === 'hrv' ? healthStats.hrv :
                      selectedMetric === 'uric_acid' ? healthStats.uricAcid :
                      selectedMetric === 'total_cholesterol' ? healthStats.totalCholesterol : null
                    }
                    unit={healthMetricConfigs[selectedMetric as keyof typeof healthMetricConfigs].unit}
                    icon={healthMetricConfigs[selectedMetric as keyof typeof healthMetricConfigs].icon}
                    color={healthMetricConfigs[selectedMetric as keyof typeof healthMetricConfigs].color}
                    onClose={() => setShowTrendDialog(false)}
                  />
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* INSIGHTS TAB - AI Analysis & Recommendations */}
          <TabsContent value="insights" className="space-y-6">
            {!fitnessData ? (
              <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-6 text-center">
                  <Bell className="h-12 w-12 text-blue-500 mx-auto mb-3" />
                  <p className="text-slate-700 dark:text-slate-300">
                    Connect Google Fit or Apple Health to see AI-powered health insights and recommendations.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {healthInsights.length === 0 ? (
                  <Card className="bg-slate-50 dark:bg-slate-800/50">
                    <CardContent className="p-6 text-center">
                      <Sparkles className="h-12 w-12 text-teal-500 mx-auto mb-3" />
                      <p className="text-slate-600 dark:text-slate-300">
                        Click "AI Analysis" to generate personalized health insights
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  healthInsights.map((insight) => (
                    <Card key={insight.id} className="bg-white dark:bg-slate-800/50 border-l-4 border-l-teal-500">
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="flex-shrink-0">
                            {insight.type === 'achievement' && <Award className="h-5 w-5 text-yellow-500" />}
                            {insight.type === 'positive' && <CheckCircle className="h-5 w-5 text-green-500" />}
                            {insight.type === 'warning' && <AlertTriangle className="h-5 w-5 text-orange-500" />}
                            {insight.type === 'neutral' && <Activity className="h-5 w-5 text-blue-500" />}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-800 dark:text-white">{insight.title}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{insight.description}</p>
                            {insight.recommendation && (
                              <p className="text-sm text-teal-600 dark:text-teal-400 mt-2 font-medium">
                                💡 {insight.recommendation}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </TabsContent>

          {/* GOALS TAB - Health Goals */}
          <TabsContent value="goals" className="space-y-6">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-teal-500" />
                  Health Goals
                </CardTitle>
              </CardHeader>
              <CardContent>
                {healthGoals.length === 0 ? (
                  <div className="text-center py-8">
                    <Target className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-600 dark:text-slate-300">
                      Set health goals to track your progress
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {healthGoals.map((goal) => (
                      <div key={goal.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-slate-800 dark:text-white">{goal.title}</h3>
                          <Badge className={goal.status === 'achieved' ? 'bg-green-100 text-green-800' : goal.status === 'on-track' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}>
                            {goal.status}
                          </Badge>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-teal-500 to-teal-600 h-2 rounded-full transition-all" 
                            style={{ width: `${Math.min(goal.progress, 100)}%` }}
                          ></div>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {goal.current} / {goal.target} {goal.unit} • Due {new Date(goal.deadline).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
    </MainLayout>
  );
};

export default HealthDashboard;
