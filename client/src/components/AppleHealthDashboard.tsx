import React, { useEffect, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Activity,
  Heart,
  Footprints,
  Flame,
  Moon,
  Timer,
  Scale,
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
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

interface HealthStatus {
  isConnected: boolean;
  lastSyncDate: string | null;
  totalRecords: number;
  lastSyncData: {
    steps: number;
    calories: number;
    distance: number;
  } | null;
}

interface HealthAlert {
  id: string;
  type: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
}

const AppleHealthDashboard: React.FC = () => {
  const [fitnessData, setFitnessData] = useState<FitnessData[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);

  const apiUrl = import.meta.env.VITE_API_URL || '/api';

  // Check if running on iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Fetch health status on component mount
  useEffect(() => {
    fetchHealthStatus();
    fetchHealthData();
  }, []);

  const fetchHealthStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${apiUrl}/apple-health/status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        setHealthStatus(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch Apple Health status:', error);
    }
  };

  const fetchHealthData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${apiUrl}/apple-health/summary?days=7`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        const records = response.data.data.records.map((record: any) => ({
          date: new Date(record.date).toLocaleDateString(),
          steps: record.steps || 0,
          calories: record.calories || 0,
          distance: record.distance || 0,
          activeMinutes: record.active_minutes || 0,
          heartRate: {
            min: record.heart_rate_min || 0,
            max: record.heart_rate_max || 0,
            avg: record.heart_rate_avg || 0,
          },
          sleep: {
            duration: record.sleep_duration || 0,
            efficiency: record.sleep_efficiency || 0,
          },
          weight: record.weight || 0,
          height: record.height || 0,
        }));

        setFitnessData(records);
        analyzeHealthAlerts(records);
      }
    } catch (error: any) {
      console.error('Failed to fetch Apple Health data:', error);
      setError(error.response?.data?.message || 'Failed to load health data');
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeHealthAlerts = (data: FitnessData[]) => {
    const newAlerts: HealthAlert[] = [];

    if (data.length === 0) return;

    const latest = data[0];

    // Check for low activity
    if (latest.steps < 5000) {
      newAlerts.push({
        id: 'low-steps',
        type: 'warning',
        title: 'Low Activity Alert',
        message: `You've only taken ${latest.steps} steps today. Try to reach 10,000 steps!`,
        timestamp: new Date(),
      });
    }

    // Check for excellent activity
    if (latest.steps >= 10000) {
      newAlerts.push({
        id: 'great-steps',
        type: 'info',
        title: 'Great Job!',
        message: `You've reached ${latest.steps} steps today! Keep it up!`,
        timestamp: new Date(),
      });
    }

    // Check heart rate
    if (latest.heartRate.max > 180) {
      newAlerts.push({
        id: 'high-hr',
        type: 'critical',
        title: 'High Heart Rate',
        message: `Your maximum heart rate of ${latest.heartRate.max} bpm is very high. Consider consulting a doctor.`,
        timestamp: new Date(),
      });
    }

    // Check sleep
    if (latest.sleep.duration < 6) {
      newAlerts.push({
        id: 'low-sleep',
        type: 'warning',
        title: 'Insufficient Sleep',
        message: `You only slept ${latest.sleep.duration} hours. Aim for 7-9 hours.`,
        timestamp: new Date(),
      });
    }

    setAlerts(newAlerts);
  };

  const requestAppleHealthAccess = () => {
    if (!isIOS) {
      alert('Apple Health is only available on iOS devices');
      return;
    }

    // This would trigger the React Native bridge to request HealthKit permissions
    // For web demonstration, we show instructions
    alert(
      'To connect Apple Health:\n\n' +
        '1. Open the Mediczy iOS app\n' +
        '2. Go to Settings > Health Integration\n' +
        '3. Enable Apple Health sync\n' +
        '4. Grant required permissions in the Health app'
    );
  };

  const disconnectAppleHealth = async () => {
    if (!confirm('Are you sure you want to disconnect Apple Health?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${apiUrl}/apple-health/disconnect`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setHealthStatus(null);
      setFitnessData([]);
      alert('Apple Health disconnected successfully');
    } catch (error) {
      console.error('Failed to disconnect Apple Health:', error);
      alert('Failed to disconnect Apple Health');
    }
  };

  const calculateTotals = () => {
    if (fitnessData.length === 0) {
      return {
        totalSteps: 0,
        totalCalories: 0,
        totalDistance: 0,
        avgHeartRate: 0,
        avgSleep: 0,
      };
    }

    const totals = fitnessData.reduce(
      (acc, day) => ({
        totalSteps: acc.totalSteps + day.steps,
        totalCalories: acc.totalCalories + day.calories,
        totalDistance: acc.totalDistance + day.distance,
        avgHeartRate: acc.avgHeartRate + day.heartRate.avg,
        avgSleep: acc.avgSleep + day.sleep.duration,
      }),
      { totalSteps: 0, totalCalories: 0, totalDistance: 0, avgHeartRate: 0, avgSleep: 0 }
    );

    return {
      ...totals,
      avgHeartRate: Math.round(totals.avgHeartRate / fitnessData.length),
      avgSleep: (totals.avgSleep / fitnessData.length).toFixed(1),
    };
  };

  const totals = calculateTotals();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p>Loading Apple Health data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="w-8 h-8 text-red-500" />
            Apple Health Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            Track your health metrics from Apple Health
          </p>
        </div>
        <div className="flex gap-3">
          {healthStatus?.isConnected ? (
            <>
              <Badge variant="default" className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Connected
              </Badge>
              <Button onClick={fetchHealthData} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={disconnectAppleHealth} variant="destructive" size="sm">
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Badge variant="secondary" className="flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Not Connected
              </Badge>
              <Button onClick={requestAppleHealthAccess} className="bg-red-500 hover:bg-red-600">
                Connect Apple Health
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Connection Status Card */}
      {healthStatus?.isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Sync Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Last Sync</p>
                <p className="text-lg font-semibold">
                  {healthStatus.lastSyncDate
                    ? new Date(healthStatus.lastSyncDate).toLocaleDateString()
                    : 'Never'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Records</p>
                <p className="text-lg font-semibold">{healthStatus.totalRecords}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="text-lg font-semibold text-green-600">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Health Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${
                    alert.type === 'critical'
                      ? 'bg-red-50 border-red-200'
                      : alert.type === 'warning'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <h4 className="font-semibold">{alert.title}</h4>
                  <p className="text-sm mt-1">{alert.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {healthStatus?.isConnected && fitnessData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Steps</p>
                  <p className="text-2xl font-bold">{totals.totalSteps.toLocaleString()}</p>
                </div>
                <Footprints className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Calories</p>
                  <p className="text-2xl font-bold">{totals.totalCalories.toLocaleString()}</p>
                </div>
                <Flame className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Distance</p>
                  <p className="text-2xl font-bold">{totals.totalDistance.toFixed(1)} km</p>
                </div>
                <Zap className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Heart Rate</p>
                  <p className="text-2xl font-bold">{totals.avgHeartRate} bpm</p>
                </div>
                <Heart className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Sleep</p>
                  <p className="text-2xl font-bold">{totals.avgSleep}h</p>
                </div>
                <Moon className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {healthStatus?.isConnected && fitnessData.length > 0 && (
        <Tabs defaultValue="steps" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="steps">Steps</TabsTrigger>
            <TabsTrigger value="calories">Calories</TabsTrigger>
            <TabsTrigger value="heart">Heart Rate</TabsTrigger>
            <TabsTrigger value="sleep">Sleep</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="steps">
            <Card>
              <CardHeader>
                <CardTitle>Daily Steps</CardTitle>
                <CardDescription>Your step count over the last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={fitnessData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="steps"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calories">
            <Card>
              <CardHeader>
                <CardTitle>Calories Burned</CardTitle>
                <CardDescription>Active energy burned over the last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={fitnessData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="calories"
                      stroke="#f97316"
                      fill="#f97316"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="heart">
            <Card>
              <CardHeader>
                <CardTitle>Heart Rate</CardTitle>
                <CardDescription>Min, Max, and Average heart rate</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={fitnessData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="heartRate.min"
                      stroke="#10b981"
                      name="Min HR"
                    />
                    <Line
                      type="monotone"
                      dataKey="heartRate.avg"
                      stroke="#3b82f6"
                      name="Avg HR"
                    />
                    <Line
                      type="monotone"
                      dataKey="heartRate.max"
                      stroke="#ef4444"
                      name="Max HR"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sleep">
            <Card>
              <CardHeader>
                <CardTitle>Sleep Duration</CardTitle>
                <CardDescription>Hours of sleep per night</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={fitnessData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="sleep.duration"
                      stroke="#8b5cf6"
                      fill="#8b5cf6"
                      fillOpacity={0.3}
                      name="Sleep (hours)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Active Minutes</CardTitle>
                <CardDescription>Exercise time over the last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={fitnessData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="activeMinutes"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.3}
                      name="Active Minutes"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Empty State */}
      {!healthStatus?.isConnected && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Activity className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold mb-2">Connect Apple Health</h3>
            <p className="text-gray-600 mb-6">
              Sync your health data from Apple Health to track your fitness journey
            </p>
            <Button onClick={requestAppleHealthAccess} className="bg-red-500 hover:bg-red-600">
              Get Started
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AppleHealthDashboard;
