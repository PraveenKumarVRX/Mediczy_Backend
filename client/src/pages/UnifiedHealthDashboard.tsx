import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import GoogleFitDashboard from "@/components/GoogleFitDashboard";
import AppleHealthDashboard from "@/components/AppleHealthDashboard";
import DrISHAChat from "@/components/DrISHAChat";
import { drIshaAPI } from "@/services/drIsha";
import { useState, useEffect } from "react";
import api from "@/utils/api";
import { healthSyncScheduler } from "@/services/health/HealthSyncScheduler";
import { 
  Activity, Heart, Footprints, Moon, Droplets, Brain, TrendingUp, Target,
  CheckCircle, Sparkles, Watch, Bluetooth, RefreshCw, Plus, MessageSquare,
  BarChart3, Calendar, Award, Clock, Zap
} from "lucide-react";

interface HealthStats {
  heartRate: number | null;
  steps: number | null;
  sleepScore: number | null;
  bloodPressure: { systolic: number; diastolic: number } | null;
  spo2: number | null;
  temperature: number | null;
  bloodGlucose: number | null;
  hrv: number | null;
  lastUpdated: Date | null;
}

interface Device {
  id: string;
  name: string;
  type: string;
  brand: string;
  model: string;
  status: 'connected' | 'disconnected' | 'syncing';
  lastSync: Date | null;
  battery?: number;
  dataTypes: string[];
  icon?: string;
}

const UnifiedHealthDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [devices, setDevices] = useState<Device[]>([]);
  const [healthStats, setHealthStats] = useState<HealthStats>({
    heartRate: null,
    steps: null,
    sleepScore: null,
    bloodPressure: null,
    spo2: null,
    temperature: null,
    bloodGlucose: null,
    hrv: null,
    lastUpdated: null,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [healthScore, setHealthScore] = useState<number>(0);
  const [chatLanguage, setChatLanguage] = useState<string>('en');

  useEffect(() => {
    loadDevices();
    loadHealthStats();
    loadDailyHealthScore();
    setAutoSyncEnabled(healthSyncScheduler.isSchedulerRunning());
  }, []);

  const loadDevices = async () => {
    try {
      const storedDevices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
      setDevices(storedDevices);
    } catch (error) {
      console.error('Error loading devices:', error);
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
          lastUpdated: new Date(data.timestamp || Date.now()),
        });
      }
    } catch (error) {
      console.error('Error loading health stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadDailyHealthScore = async () => {
    try {
      const { data } = await api.get('/health-score/today');
      const score = Number(data?.score);
      setHealthScore(data?.success && data?.score !== null && data?.score !== undefined && Number.isFinite(score) ? Math.round(score) : 0);
    } catch (error) {
      console.error('Error loading daily health score:', error);
      setHealthScore(0);
    }
  };

  const toggleAutoSync = (checked: boolean) => {
    setAutoSyncEnabled(checked);
    if (checked) {
      healthSyncScheduler.start();
    } else {
      healthSyncScheduler.stop();
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return { bg: 'from-green-500 to-emerald-600', text: 'text-green-600', ring: 'ring-green-500' };
    if (score >= 60) return { bg: 'from-blue-500 to-cyan-600', text: 'text-blue-600', ring: 'ring-blue-500' };
    if (score >= 40) return { bg: 'from-yellow-500 to-orange-600', text: 'text-yellow-600', ring: 'ring-yellow-500' };
    return { bg: 'from-red-500 to-rose-600', text: 'text-red-600', ring: 'ring-red-500' };
  };

  const getHealthScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Attention';
  };

  const connectedDevicesCount = devices.filter(d => d.status === 'connected').length;

  return (
    <MainLayout>
      <div className="space-y-6 animate-in fade-in duration-700">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-white">
                Health Dashboard
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Your complete health overview in one place
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowChat(true)}
              className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Ask Dr. iSHA
            </Button>
          </div>
        </div>

        {/* Health Score Card */}
        <Card className={`bg-gradient-to-br ${getHealthScoreColor(healthScore).bg} text-white overflow-hidden relative`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
          <CardContent className="p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-white/80 text-sm font-medium mb-2">Overall Health Score</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-bold">{healthScore}</span>
                  <span className="text-2xl font-semibold text-white/80">/100</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30">
                    {getHealthScoreLabel(healthScore)}
                  </Badge>
                  {healthStats.lastUpdated && (
                    <span className="text-xs text-white/60">
                      Updated {healthStats.lastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="relative w-24 h-24">
                <svg className="transform -rotate-90 w-24 h-24">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-white/20"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - healthScore / 100)}`}
                    className="text-white transition-all duration-1000"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-red-50 to-white dark:from-red-900/20 dark:to-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <Heart className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Heart Rate</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {loadingStats ? "..." : healthStats.heartRate ? `${healthStats.heartRate} bpm` : "-- bpm"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Footprints className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Steps Today</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {loadingStats ? "..." : healthStats.steps ? healthStats.steps.toLocaleString() : "--"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Moon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Sleep Score</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {loadingStats ? "..." : healthStats.sleepScore ? `${healthStats.sleepScore}%` : "--%"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-teal-50 to-white dark:from-teal-900/20 dark:to-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
                  <Watch className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Devices</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {connectedDevicesCount} Connected
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <TabsTrigger value="overview" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              <Activity className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="devices" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              <Bluetooth className="h-4 w-4 mr-2" />
              Devices
            </TabsTrigger>
            <TabsTrigger value="fitness" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              <Zap className="h-4 w-4 mr-2" />
              Fitness
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="insights" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">
              <Brain className="h-4 w-4 mr-2" />
              Insights
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Heart className="h-5 w-5 mr-2 text-red-500" />
                    Vital Signs
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Blood Pressure</span>
                    <span className="font-semibold">
                      {healthStats.bloodPressure 
                        ? `${healthStats.bloodPressure.systolic}/${healthStats.bloodPressure.diastolic} mmHg`
                        : "--/-- mmHg"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400">SpO2</span>
                    <span className="font-semibold">{healthStats.spo2 ? `${healthStats.spo2}%` : "--%"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Temperature</span>
                    <span className="font-semibold">
                      {healthStats.temperature ? `${healthStats.temperature}°C` : "-- °C"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400">HRV</span>
                    <span className="font-semibold">{healthStats.hrv ? `${healthStats.hrv} ms` : "-- ms"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Activity className="h-5 w-5 mr-2 text-blue-500" />
                    Activity Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Daily Steps</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full" 
                          style={{ width: `${Math.min(((healthStats.steps || 0) / 10000) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="font-semibold text-sm">{healthStats.steps?.toLocaleString() || 0}/10k</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Sleep Quality</span>
                    <Badge variant={healthStats.sleepScore && healthStats.sleepScore > 70 ? "default" : "secondary"}>
                      {healthStats.sleepScore ? `${healthStats.sleepScore}%` : "No data"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Last Updated</span>
                    <span className="text-xs text-slate-500">
                      {healthStats.lastUpdated ? healthStats.lastUpdated.toLocaleTimeString() : "Never"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Devices Tab */}
          <TabsContent value="devices" className="space-y-6">
            <Card className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-2">Smart Device Management</h3>
                  <p className="text-slate-300 text-sm">
                    Connect smartwatches, fitness bands, and health monitors
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={autoSyncEnabled} onCheckedChange={toggleAutoSync} />
                    <span className="text-sm">Auto-sync</span>
                  </div>
                  <Button className="bg-teal-500 hover:bg-teal-600">
                    <Plus className="h-4 w-4 mr-2" />
                    Pair Device
                  </Button>
                </div>
              </div>
            </Card>

            {devices.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Watch className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    No Devices Connected
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-4">
                    Connect your smartwatch or fitness tracker to start tracking health metrics automatically
                  </p>
                  <Button className="bg-teal-500 hover:bg-teal-600 text-white">
                    <Bluetooth className="h-4 w-4 mr-2" />
                    Connect Your First Device
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {devices.map((device) => (
                  <Card key={device.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                          <div className="text-3xl">{device.icon || "📱"}</div>
                          <div>
                            <h4 className="font-semibold text-slate-800 dark:text-white">{device.name}</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {device.brand} {device.model}
                            </p>
                            {device.battery !== undefined && (
                              <p className="text-xs text-slate-500 mt-1">🔋 {device.battery}%</p>
                            )}
                          </div>
                        </div>
                        <Badge variant={device.status === 'connected' ? 'default' : 'secondary'}>
                          {device.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Fitness Tab */}
          <TabsContent value="fitness" className="space-y-6">
            <Tabs defaultValue="google" className="w-full">
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
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Health Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                  Advanced analytics and trend visualization coming soon...
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="h-5 w-5 mr-2 text-teal-500" />
                  AI Health Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                  Click "Ask Dr. iSHA" to get personalized health recommendations based on your data
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dr. iSHA Chat Modal */}
        {showChat && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg w-full max-w-2xl h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400">
                  Health Consultation with Dr. iSHA
                </h3>
                <div className="flex items-center gap-2">
                  <select 
                    value={chatLanguage} 
                    onChange={(e) => setChatLanguage(e.target.value)}
                    className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    <option value="en">🇬🇧 English</option>
                    <optgroup label="🇮🇳 Indian Languages">
                      <option value="hi">हिंदी (Hindi)</option>
                      <option value="ta">தமிழ் (Tamil)</option>
                      <option value="te">తెలుగు (Telugu)</option>
                      <option value="bn">বাংলা (Bengali)</option>
                      <option value="mr">मराठी (Marathi)</option>
                      <option value="gu">ગુજરાતી (Gujarati)</option>
                      <option value="kn">ಕನ್ನಡ (Kannada)</option>
                      <option value="ml">മലയാളം (Malayalam)</option>
                      <option value="pa">ਪੰਜਾਬੀ (Punjabi)</option>
                      <option value="ur">اردو (Urdu)</option>
                    </optgroup>
                    <optgroup label="🌍 Other Languages">
                      <option value="es">🇪🇸 Español</option>
                      <option value="fr">🇫🇷 Français</option>
                      <option value="ar">🇸🇦 العربية</option>
                    </optgroup>
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => setShowChat(false)}>
                    ✕
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <DrISHAChat language={chatLanguage} showVoiceInput={true} key={chatLanguage} />
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default UnifiedHealthDashboard;
