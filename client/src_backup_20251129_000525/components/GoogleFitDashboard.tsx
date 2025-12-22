import React, { useEffect, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import '../styles/animations.css';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Activity,
  Heart,
  Footprints,
  Flame,
  Moon,
  Timer,
  Scale,
  ArrowUpDown,
  Zap,
  Wifi,
  WifiOff,
  Clock,
  TrendingUp,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

interface FitnessData {
  date: string;
  steps: number;
  calories: number;
  distance: number;
  activeMinutes: number;
  heartRate: {
    min: number;
    max: number;  
    avg: number;
  };
  sleep: {
    duration: number;
    efficiency: number;
  };
  weight: number;
  height: number;
}

interface RealTimeData {
  steps: number;
  heartRate: number;
  calories: number;
  activeMinutes: number;
  lastUpdated: Date;
  isLive: boolean;
}

interface HealthAlert {
  id: string;
  type: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
}

const GoogleFitDashboard: React.FC = () => {
  const [fitnessData, setFitnessData] = useState<FitnessData[]>([]);
  const [rawData, setRawData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isSaving, setIsSaving] = useState(false);
  
  // Real-time monitoring states
  const [realTimeData, setRealTimeData] = useState<RealTimeData | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [healthAlerts, setHealthAlerts] = useState<HealthAlert[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncInterval, setSyncInterval] = useState<NodeJS.Timeout | null>(null);

  // Get the API base URL from environment or use default - ensure no trailing slash
  const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

  const storeFitnessData = async (data: FitnessData[]) => {
    try {
      setIsSaving(true);
      await axios.post(
        `${API_BASE_URL}/api/fitness/store`,
        {
          fitnessData: data.map(item => ({
            date: item.date,
            steps: item.steps,
            calories: item.calories,
            activeMinutes: item.activeMinutes,
            distance: item.distance,
          })),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          withCredentials: true
        }
      );
      console.log('Fitness data stored successfully');
    } catch (error) {
      console.error('Failed to store fitness data:', error);
      setError('Data fetched but failed to store. Some features might be limited.');
    } finally {
      setIsSaving(false);
    }
  };

  // Real-time monitoring functions
  const fetchRealTimeData = async (accessToken: string) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const result = await axios.post(
        'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
        {
          aggregateBy: [
            { dataTypeName: 'com.google.step_count.delta' },
            { dataTypeName: 'com.google.calories.expended' },
            { dataTypeName: 'com.google.active_minutes' },
            { dataTypeName: 'com.google.heart_rate.bpm' }
          ],
          startTimeMillis: todayStart.getTime(),
          endTimeMillis: now.getTime(),
          bucketByTime: { durationMillis: 3600000 } // 1 hour buckets
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: 10000
        }
      );

      if (result.data.bucket && result.data.bucket.length > 0) {
        const latestBucket = result.data.bucket[result.data.bucket.length - 1];
        const realTime: RealTimeData = {
          steps: latestBucket.dataset[0].point[0]?.value[0]?.intVal || 0,
          calories: Math.round(latestBucket.dataset[1].point[0]?.value[0]?.fpVal || 0),
          activeMinutes: latestBucket.dataset[2].point[0]?.value[0]?.intVal || 0,
          heartRate: Math.round(latestBucket.dataset[3].point[0]?.value[0]?.fpVal || 70),
          lastUpdated: new Date(),
          isLive: true
        };

        setRealTimeData(realTime);
        setLastSync(new Date());
        
        // Check for health alerts
        checkHealthAlerts(realTime);
      }
    } catch (error) {
      console.error('Real-time data fetch error:', error);
      setRealTimeData(prev => prev ? { ...prev, isLive: false } : null);
    }
  };

  const checkHealthAlerts = (data: RealTimeData) => {
    const alerts: HealthAlert[] = [];
    const now = new Date();

    // Heart rate alerts
    if (data.heartRate > 100) {
      alerts.push({
        id: `hr_${now.getTime()}`,
        type: 'warning',
        title: 'Elevated Heart Rate',
        message: `Your current heart rate is ${data.heartRate} bpm. Consider taking a break.`,
        timestamp: now
      });
    } else if (data.heartRate < 50) {
      alerts.push({
        id: `hr_low_${now.getTime()}`,
        type: 'info',
        title: 'Low Heart Rate',
        message: `Your heart rate is ${data.heartRate} bpm. This could indicate excellent fitness or potential concern.`,
        timestamp: now
      });
    }

    // Inactivity alerts (if monitoring for more than 2 hours with <100 steps)
    if (isMonitoring && data.steps < 100 && now.getHours() > 10) {
      alerts.push({
        id: `inactive_${now.getTime()}`,
        type: 'info',
        title: 'Activity Reminder',
        message: 'You\'ve been inactive for a while. Consider taking a short walk!',
        timestamp: now
      });
    }

    // Step goal progress
    if (data.steps > 8000 && now.getHours() < 16) {
      alerts.push({
        id: `steps_good_${now.getTime()}`,
        type: 'info',
        title: 'Great Progress!',
        message: `You're on track with ${data.steps.toLocaleString()} steps today!`,
        timestamp: now
      });
    }

    if (alerts.length > 0) {
      setHealthAlerts(prev => [...alerts, ...prev].slice(0, 10)); // Keep last 10 alerts
    }
  };

  const startRealTimeMonitoring = async (accessToken: string) => {
    setIsMonitoring(true);
    setHealthAlerts([]);
    
    // Initial fetch
    await fetchRealTimeData(accessToken);
    
    // Set up interval for real-time updates (every 5 minutes)
    const interval = setInterval(async () => {
      if (accessToken) {
        await fetchRealTimeData(accessToken);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    setSyncInterval(interval);
  };

  const stopRealTimeMonitoring = () => {
    setIsMonitoring(false);
    if (syncInterval) {
      clearInterval(syncInterval);
      setSyncInterval(null);
    }
    setRealTimeData(prev => prev ? { ...prev, isLive: false } : null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncInterval) {
        clearInterval(syncInterval);
      }
    };
  }, [syncInterval]);

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: [
      'https://www.googleapis.com/auth/fitness.activity.read',
      'https://www.googleapis.com/auth/fitness.heart_rate.read',
      'https://www.googleapis.com/auth/fitness.sleep.read',
      'https://www.googleapis.com/auth/fitness.body.read',
      'https://www.googleapis.com/auth/fitness.location.read'
    ].join(' '),
    onSuccess: async (response) => {
      try {
        setIsLoading(true);
        setError(null);
        
        const endTime = new Date();
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - 7);

        console.log('Making request to Google Fit API with token:', response.access_token.substring(0, 10) + '...');
        
        // First, try to directly use Google's Fitness REST API
        const result = await axios.post(
          'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
          {
            aggregateBy: [
              { dataTypeName: 'com.google.step_count.delta' },
              { dataTypeName: 'com.google.calories.expended' },
              { dataTypeName: 'com.google.distance.delta' },
              { dataTypeName: 'com.google.active_minutes' }
            ],
            startTimeMillis: startTime.getTime(),
            endTimeMillis: endTime.getTime(),
            bucketByTime: { durationMillis: 86400000 }
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${response.access_token}`
            },
            timeout: 10000
          }
        );

        console.log('Received data from Google Fit:', result.data);

        setRawData(result.data);
        
        const processedData = result.data.bucket.map((bucket: any) => {
          const date = new Date(parseInt(bucket.startTimeMillis)).toLocaleDateString();
          
          // Process each data type
          const steps = bucket.dataset[0].point[0]?.value[0]?.intVal || 0;
          const calories = Math.round(bucket.dataset[1].point[0]?.value[0]?.fpVal || 0);
          const distance = Math.round((bucket.dataset[2].point[0]?.value[0]?.fpVal || 0) * 100) / 100;
          const activeMinutes = bucket.dataset[3].point[0]?.value[0]?.intVal || 0;

          return {
            date,
            steps,
            calories,
            distance,
            activeMinutes
          };
        });

        setFitnessData(processedData);

        // Store the processed data in MongoDB
        await storeFitnessData(processedData);

        // Start real-time monitoring automatically
        await startRealTimeMonitoring(response.access_token);

      } catch (err: any) {
        console.error('Full error object:', err);
        const errorMessage = err.response?.data?.error?.message || err.message;
        setError(`Failed to fetch fitness data: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    },
    onError: (errorResponse) => {
      console.error('Google login error:', errorResponse);
      setError('Failed to login with Google. Please try again later.');
    }
  });

  useEffect(() => {
    // Add event listener for tab switching
    const handleTabSwitch = (event: CustomEvent) => {
      const tab = event.detail;
      if (tab === 'charts' || tab === 'overview') {
        setActiveTab(tab);
      }
    };

    window.addEventListener('switchGoogleFitTab', handleTabSwitch as EventListener);

    return () => {
      window.removeEventListener('switchGoogleFitTab', handleTabSwitch as EventListener);
    };
  }, []);

  const renderMetricCard = (title: string, value: any, icon: React.ReactNode, description: string) => (
    <Card className="bg-[#1A2333] border-none shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-[#00FFF3]">{title}</CardTitle>
        <div className="h-8 w-8 rounded-full bg-[#0B1120] border border-[#00FFF3]/20 flex items-center justify-center">
          {React.cloneElement(icon as React.ReactElement, {
            className: "h-5 w-5 text-[#00FFF3] drop-shadow-[0_0_8px_rgba(0,255,243,0.3)]"
          })}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-[#00FFF3] drop-shadow-[0_0_2px_rgba(0,255,243,0.3)]">
          {value}
        </div>
        <p className="text-xs text-gray-400/90">{description}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card className="border-none shadow-lg bg-[#0B1120] dark:bg-[#0B1120] relative overflow-hidden">
        {/* Continuous moving border light */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-[-1px] rounded-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00FFF3] to-transparent opacity-30 w-[50%] animate-[border-flow_3s_linear_infinite]"></div>
          </div>
        </div>
        
        {/* Card content with relative positioning and background */}
        <div className="relative z-10 bg-[#0B1120] m-[1px] rounded-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-[#00FFF3]">
              Health & Fitness Hub
            </CardTitle>
            <CardDescription className="text-gray-400">
              Your personal wellness journey, powered by Google Fit
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!fitnessData.length && (
              <div className="flex flex-col items-center justify-center py-16 space-y-8">
                <div className="relative group animate-fade-in">
                  {/* Ambient glow effect */}
                  <div className="absolute -inset-10 bg-[#00FFF3] opacity-[0.015] blur-3xl group-hover:opacity-[0.03] transition-opacity duration-700"></div>
                  
                  {/* Minimal edge lighting */}
                  <div className="absolute -inset-[2px] bg-gradient-to-r from-transparent via-[#00FFF3] to-transparent opacity-[0.15] blur-sm group-hover:opacity-[0.2] transition-all duration-700"></div>
                  
                  {/* Main container with glass effect */}
                  <div className="relative px-8 py-6 bg-[#0F172A]/80 backdrop-blur-xl rounded-lg leading-none flex flex-col items-center space-y-6 border border-[#00FFF3]/[0.08]">
                    {/* Minimalist icon container */}
                    <div className="relative w-20 h-20 mb-2">
                      {/* Subtle ring light */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#00FFF3]/10 to-transparent"></div>
                      {/* Icon container with minimal glow */}
                      <div className="relative w-full h-full rounded-full bg-[#1A2333]/50 flex items-center justify-center before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-[#00FFF3]/[0.08] before:to-transparent before:opacity-0 before:group-hover:opacity-100 before:transition-opacity before:duration-700">
                        <Activity className="w-10 h-10 text-[#00FFF3] drop-shadow-[0_0_8px_rgba(0,255,243,0.3)]" />
                      </div>
                    </div>

                    {/* Title with subtle glow */}
                    <div className="text-center space-y-2">
                      <h3 className="text-xl font-semibold text-[#00FFF3] drop-shadow-[0_0_2px_rgba(0,255,243,0.3)]">
                        Connect Your Fitness Data
                      </h3>
                      <p className="text-gray-400/90 max-w-sm">
                        Sync with Google Fit to track your health metrics and fitness progress in real-time
                      </p>
                    </div>

                    {/* Enhanced connect button */}
                    <Button
                      onClick={() => login()}
                      disabled={isLoading}
                      className="relative group/btn flex items-center space-x-3 bg-[#1A2333]/80 text-[#00FFF3] border-0 px-8 py-4 rounded-lg overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:bg-[#1E293B]/90"
                    >
                      {isLoading ? (
                        <div className="flex items-center space-x-3">
                          <div className="relative w-6 h-6">
                            <div className="absolute inset-0 rounded-full border border-[#00FFF3]/30"></div>
                            <div className="absolute inset-0 rounded-full border border-[#00FFF3] border-t-transparent animate-spin"></div>
                          </div>
                          <span className="text-lg font-medium tracking-wide text-[#00FFF3]/90">
                            Connecting to Google Fit...
                          </span>
                        </div>
                      ) : (
                        <>
                          {/* Minimal hover lighting */}
                          <div className="absolute inset-0 bg-gradient-to-r from-[#00FFF3]/[0.03] via-[#00FFF3]/[0.05] to-[#00FFF3]/[0.03] opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500"></div>
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00FFF3]/[0.02] to-transparent opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500"></div>
                          
                          {/* Button content with subtle effects */}
                          <div className="relative flex items-center space-x-3">
                            <div className="relative">
                              <Activity className="w-6 h-6 text-[#00FFF3] drop-shadow-[0_0_3px_rgba(0,255,243,0.3)]" />
                            </div>
                            <span className="text-lg font-medium tracking-wide text-[#00FFF3]/90 group-hover/btn:text-[#00FFF3] transition-colors duration-300">
                              Connect Google Fit
                            </span>
                          </div>
                        </>
                      )}
                    </Button>

                    {/* Feature highlights with minimal indicators */}
                    <div className="grid grid-cols-2 gap-4 mt-4 w-full max-w-md">
                      {[
                        { text: "Real-time Sync", color: "from-[#00FFF3]" },
                        { text: "Activity Tracking", color: "from-[#00B8FF]" },
                        { text: "Health Metrics", color: "from-[#00FFF3]" },
                        { text: "Progress Analysis", color: "from-[#00B8FF]" }
                      ].map((feature, index) => (
                        <div key={index} className="flex items-center space-x-2 text-sm text-gray-400/90">
                          <div className={`w-1 h-4 rounded-full bg-gradient-to-b ${feature.color} to-transparent opacity-50`}></div>
                          <span>{feature.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Error message with minimal styling */}
                {error && (
                  <div className="relative animate-fade-in">
                    <div className="absolute inset-0 bg-red-500/5 blur-2xl"></div>
                    <div className="relative bg-[#1A1A2E]/90 text-red-400/90 border border-red-500/10 rounded-lg px-6 py-3 text-sm backdrop-blur-sm">
                      <div className="flex items-center space-x-2">
                        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-red-500/50 to-transparent"></div>
                        <span>{error}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {fitnessData.length > 0 && (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-3 bg-[#1A2333] p-1 rounded-lg">
                  <TabsTrigger value="overview" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="realtime" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120] flex items-center space-x-1">
                    <span>Live</span>
                    {isMonitoring && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
                  </TabsTrigger>
                  <TabsTrigger value="charts" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                    Analytics
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {renderMetricCard(
                      "Daily Steps",
                      fitnessData[fitnessData.length - 1].steps.toLocaleString(),
                      <div className="h-8 w-8 rounded-full bg-[#1A2333] border border-[#00FFF3]/20 flex items-center justify-center">
                        <Footprints className="h-5 w-5 text-[#00FFF3]" />
                      </div>,
                      `Goal: ${(10000).toLocaleString()} steps`
        )}
        {renderMetricCard(
                      "Calories Burned",
                      `${fitnessData[fitnessData.length - 1].calories} kcal`,
                      <div className="h-8 w-8 rounded-full bg-[#1A2333] border border-[#00FFF3]/20 flex items-center justify-center">
                        <Flame className="h-5 w-5 text-[#00FFF3]" />
                      </div>,
                      "Daily energy expenditure"
        )}
        {renderMetricCard(
          "Active Time",
                      `${fitnessData[fitnessData.length - 1].activeMinutes} min`,
                      <div className="h-8 w-8 rounded-full bg-[#1A2333] border border-[#00FFF3]/20 flex items-center justify-center">
                        <Timer className="h-5 w-5 text-[#00FFF3]" />
                      </div>,
                      "Daily active minutes"
        )}
        {renderMetricCard(
          "Distance",
                      `${fitnessData[fitnessData.length - 1].distance} km`,
                      <div className="h-8 w-8 rounded-full bg-[#1A2333] border border-[#00FFF3]/20 flex items-center justify-center">
                        <Activity className="h-5 w-5 text-[#00FFF3]" />
                      </div>,
                      "Distance covered today"
        )}
      </div>
                </TabsContent>

                {/* Real-time Monitoring Tab */}
                <TabsContent value="realtime" className="space-y-6">
                  <div className="grid gap-4">
                    {/* Real-time Status Card */}
                    <Card className="border-[#00FFF3]/20 bg-gradient-to-br from-[#0B1120] to-[#1A2333]">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center text-[#00FFF3]">
                            <Zap className="h-5 w-5 mr-2" />
                            Real-time Health Monitoring
                          </CardTitle>
                          <div className="flex items-center space-x-2">
                            {isMonitoring ? (
                              <>
                                <Wifi className="h-4 w-4 text-green-500" />
                                <Badge className="bg-green-100 text-green-800 border-green-300">
                                  Live
                                </Badge>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={stopRealTimeMonitoring}
                                  className="border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                                >
                                  Stop Monitoring
                                </Button>
                              </>
                            ) : (
                              <>
                                <WifiOff className="h-4 w-4 text-gray-500" />
                                <Badge className="bg-gray-100 text-gray-800 border-gray-300">
                                  Offline
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                        {lastSync && (
                          <CardDescription className="flex items-center text-gray-400">
                            <Clock className="h-3 w-3 mr-1" />
                            Last sync: {lastSync.toLocaleTimeString()}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        {realTimeData ? (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-4 bg-[#1A2333]/50 rounded-lg border border-[#00FFF3]/10">
                              <Footprints className="h-6 w-6 text-[#00FFF3] mx-auto mb-2" />
                              <div className="text-2xl font-bold text-[#00FFF3]">
                                {realTimeData.steps.toLocaleString()}
                              </div>
                              <div className="text-xs text-gray-400">Steps Today</div>
                            </div>
                            <div className="text-center p-4 bg-[#1A2333]/50 rounded-lg border border-[#00FFF3]/10">
                              <Heart className="h-6 w-6 text-red-500 mx-auto mb-2" />
                              <div className="text-2xl font-bold text-red-500">
                                {realTimeData.heartRate}
                              </div>
                              <div className="text-xs text-gray-400">BPM</div>
                            </div>
                            <div className="text-center p-4 bg-[#1A2333]/50 rounded-lg border border-[#00FFF3]/10">
                              <Flame className="h-6 w-6 text-orange-500 mx-auto mb-2" />
                              <div className="text-2xl font-bold text-orange-500">
                                {realTimeData.calories}
                              </div>
                              <div className="text-xs text-gray-400">Calories</div>
                            </div>
                            <div className="text-center p-4 bg-[#1A2333]/50 rounded-lg border border-[#00FFF3]/10">
                              <Timer className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                              <div className="text-2xl font-bold text-blue-500">
                                {realTimeData.activeMinutes}
                              </div>
                              <div className="text-xs text-gray-400">Active Min</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <Activity className="h-12 w-12 text-gray-500 mx-auto mb-4 opacity-50" />
                            <p className="text-gray-400 mb-4">Connect to start real-time monitoring</p>
                            <Button 
                              onClick={() => login()}
                              className="bg-gradient-to-r from-[#00FFF3] to-[#00B8FF] text-black"
                            >
                              <Zap className="h-4 w-4 mr-2" />
                              Start Live Monitoring
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Health Alerts */}
                    {healthAlerts.length > 0 && (
                      <Card className="border-[#00FFF3]/20">
                        <CardHeader>
                          <CardTitle className="flex items-center text-[#00FFF3]">
                            <AlertTriangle className="h-5 w-5 mr-2" />
                            Health Alerts & Notifications
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3 max-h-60 overflow-y-auto">
                            {healthAlerts.map((alert) => (
                              <div
                                key={alert.id}
                                className={`p-3 rounded-lg border ${
                                  alert.type === 'critical'
                                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                                    : alert.type === 'warning'
                                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                                    : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div>
                                    <h5 className="font-medium mb-1">{alert.title}</h5>
                                    <p className="text-sm opacity-90">{alert.message}</p>
                                  </div>
                                  <span className="text-xs opacity-60">
                                    {alert.timestamp.toLocaleTimeString()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setHealthAlerts([])}
                            className="w-full mt-3 border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10"
                          >
                            Clear All Alerts
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="charts" className="space-y-6">
                  <div className="grid gap-6">
                    <Card className="bg-[#1A2333] border-none shadow-lg">
                      <CardHeader>
                        <CardTitle className="text-lg font-semibold text-[#00FFF3] drop-shadow-[0_0_2px_rgba(0,255,243,0.3)]">
                          Activity Overview
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={fitnessData}>
                            <defs>
                              <linearGradient id="stepsGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#00FFF3" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#00FFF3" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#00B8FF" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#00B8FF" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-10" />
                            <XAxis dataKey="date" stroke="#00FFF3" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis yAxisId="left" stroke="#00FFF3" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis yAxisId="right" orientation="right" stroke="#00B8FF" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(26, 35, 51, 0.9)',
                                borderRadius: '8px',
                                border: '1px solid rgba(0, 255, 243, 0.2)',
                                boxShadow: '0 4px 6px rgba(0, 255, 243, 0.1)'
                              }}
                            />
                            <Legend />
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="steps"
                              stroke="#00FFF3"
                              strokeWidth={2}
                              dot={false}
                              name="Steps"
                            />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="activeMinutes"
                              stroke="#00B8FF"
                              strokeWidth={2}
                              dot={false}
                              name="Active Minutes"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  );
};

export default GoogleFitDashboard; 