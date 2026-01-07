import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Watch, Activity, Smartphone, Bluetooth, CheckCircle, XCircle, RefreshCw, Plus, Settings, Heart, Footprints, Moon, Zap, ShieldCheck, Droplets, Thermometer, Clock, Timer, TrendingUp, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/utils/api';
import { healthSyncScheduler, SyncStatus } from '@/services/health/HealthSyncScheduler';
import HealthTrendCard, { healthMetricConfigs } from '@/components/health/HealthTrendCard';

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

const DeviceIntegration: React.FC = () => {
  const [searchParams] = useSearchParams();
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

  // Load devices and health data on mount
  useEffect(() => {
    loadDevices();
    loadHealthStats();
    updateSyncStatus();
    
    // Auto-start sync scheduler if enabled
    healthSyncScheduler.autoStart();
    setAutoSyncEnabled(healthSyncScheduler.isSchedulerRunning());
    
    // Handle URL actions (from Bluetooth pairing redirect)
    const action = searchParams.get('action');
    const connect = searchParams.get('connect');
    
    if (action === 'add-manual') {
      toast.info('Manual device entry coming soon!');
    }
    if (connect === 'apple-health') {
      toast.info('Apple Health integration coming soon!');
    }

    // Listen for sync events
    const handleSyncEvent = () => {
      loadHealthStats();
      updateSyncStatus();
    };
    window.addEventListener('healthDataSynced', handleSyncEvent);

    // Update sync status every minute
    const statusInterval = setInterval(updateSyncStatus, 60000);

    return () => {
      window.removeEventListener('healthDataSynced', handleSyncEvent);
      clearInterval(statusInterval);
    };
  }, [searchParams]);

  // Update sync status
  const updateSyncStatus = () => {
    setSyncStatus(healthSyncScheduler.getStatus());
  };

  // Toggle auto sync
  const toggleAutoSync = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    if (enabled) {
      healthSyncScheduler.start();
      toast.success('Auto-sync enabled! Data will sync every 30 minutes.');
    } else {
      healthSyncScheduler.stop();
      toast.info('Auto-sync disabled');
    }
    updateSyncStatus();
  };

  // Manual sync
  const handleSyncNow = async () => {
    setSyncing(true);
    toast.info('Syncing health data...');
    try {
      const success = await healthSyncScheduler.syncNow();
      if (success) {
        toast.success('Health data synced successfully!');
        loadHealthStats();
      } else {
        toast.info('No new data to sync');
      }
    } catch (error) {
      toast.error('Sync failed. Please try again.');
    } finally {
      setSyncing(false);
      updateSyncStatus();
    }
  };

  // Format time until next sync
  const formatTimeUntilSync = (): string => {
    const ms = healthSyncScheduler.getTimeUntilNextSync();
    if (ms <= 0) return 'Now';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'Less than 1 min';
    if (minutes === 1) return '1 minute';
    return `${minutes} minutes`;
  };

  // Fetch health stats from backend
  const loadHealthStats = async () => {
    setLoadingStats(true);
    try {
      const response = await api.get('/health-data/summary');
      const data = response.data;
      
      setHealthStats({
        heartRate: data.latest?.heart_rate?.value || null,
        steps: data.latest?.steps?.value || null,
        sleepScore: data.latest?.sleep?.value ? Math.round(data.latest.sleep.value * 100 / 8) : null, // Convert hours to score
        bloodPressure: data.latest?.blood_pressure_systolic?.value ? {
          systolic: data.latest.blood_pressure_systolic.value,
          diastolic: data.latest.blood_pressure_diastolic?.value || 80
        } : null,
        spo2: data.latest?.spo2?.value || null,
        temperature: data.latest?.temperature?.value || null,
        bloodGlucose: data.latest?.blood_glucose?.value || null,
        hrv: data.latest?.hrv?.value || null,
        uricAcid: data.latest?.uric_acid?.value || null,
        totalCholesterol: data.latest?.total_cholesterol?.value || null,
        lastUpdated: data.lastSync ? new Date(data.lastSync) : null
      });
    } catch (error) {
      console.log('Health stats not available:', error);
      // Use localStorage cached data as fallback
      const cachedStats = localStorage.getItem('lastHealthStats');
      if (cachedStats) {
        try {
          setHealthStats(JSON.parse(cachedStats));
        } catch (e) {}
      }
    } finally {
      setLoadingStats(false);
    }
  };

  const loadDevices = () => {
    try {
      // Load devices from localStorage (saved by Bluetooth pairing)
      const savedDevices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
      
      // Sample devices for demo
      const sampleDevices: Device[] = [
        {
          id: 'sample-1',
          name: 'Apple Watch Series 9',
          type: 'smartwatch',
          brand: 'Apple',
          model: 'Series 9',
          status: 'connected',
          lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          battery: 85,
          dataTypes: ['Heart Rate', 'Steps', 'Sleep', 'Calories', 'Activity']
        }
      ];

      // Merge saved devices with sample (if user has paired any)
      const mergedDevices: Device[] = savedDevices.map((saved: any) => ({
        id: saved.id,
        name: saved.name || 'Unknown Device',
        type: saved.type || 'fitness_band',
        brand: getBrandFromName(saved.name),
        model: getModelFromName(saved.name),
        status: 'connected' as const,
        lastSync: saved.lastSync ? new Date(saved.lastSync) : (saved.connectedAt ? new Date(saved.connectedAt) : new Date()),
        battery: saved.battery || null,
        dataTypes: saved.dataTypes?.length > 0 ? saved.dataTypes : getDataTypesForDevice(saved.type, saved.isVeepooDevice),
        icon: saved.icon,
        isVeepooDevice: saved.isVeepooDevice || false
      }));

      // Show sample devices only if no paired devices exist
      if (mergedDevices.length === 0) {
        setDevices(sampleDevices);
      } else {
        setDevices(mergedDevices);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  const getBrandFromName = (name: string): string => {
    const nameLower = (name || '').toLowerCase();
    if (nameLower.includes('ve30') || nameLower.includes('ve20') || nameLower.includes('ve40')) return 'Veepoo';
    if (nameLower.includes('apple') || nameLower.includes('watch')) return 'Apple';
    if (nameLower.includes('samsung') || nameLower.includes('galaxy')) return 'Samsung';
    if (nameLower.includes('mi') || nameLower.includes('xiaomi')) return 'Xiaomi';
    if (nameLower.includes('fitbit')) return 'Fitbit';
    if (nameLower.includes('garmin')) return 'Garmin';
    if (nameLower.includes('oura')) return 'Oura';
    if (nameLower.includes('omron')) return 'Omron';
    return 'Generic';
  };

  const getModelFromName = (name: string): string => {
    // Try to extract model from device name
    return name || 'Unknown Model';
  };

  const getDataTypesForDevice = (type: string, isVeepooDevice?: boolean): string[] => {
    // Veepoo devices (VE30, etc.) have known capabilities
    if (isVeepooDevice) {
      return ['Heart Rate', 'Blood Pressure', 'Blood Oxygen', 'Steps', 'Calories', 'Sleep', 'HRV'];
    }
    
    switch (type) {
      case 'smartwatch':
        return ['Heart Rate', 'Steps', 'Sleep', 'Calories', 'Activity'];
      case 'fitness_band':
        return ['Steps', 'Heart Rate', 'Sleep'];
      case 'smart_ring':
        return ['Sleep', 'Heart Rate', 'Activity', 'Temperature'];
      case 'bp_monitor':
        return ['Blood Pressure', 'Heart Rate'];
      case 'glucometer':
        return ['Blood Glucose'];
      case 'weight_scale':
        return ['Weight', 'BMI', 'Body Fat'];
      default:
        return ['Heart Rate', 'Steps'];
    }
  };

  const [availableDevices] = useState([
    { type: 'smartwatch', emoji: '⌚', brands: ['Apple Watch', 'Samsung Galaxy Watch', 'Fitbit Versa', 'Garmin Venu'] },
    { type: 'fitness_band', emoji: '📱', brands: ['Mi Band', 'Fitbit Charge', 'Garmin Vivosmart', 'Honor Band'] },
    { type: 'smart_ring', emoji: '💍', brands: ['Oura Ring', 'Circular Ring', 'Ultrahuman Ring'] },
    { type: 'bp_monitor', emoji: '🩺', brands: ['Omron', 'iHealth', 'Withings BPM'] },
    { type: 'glucometer', emoji: '💉', brands: ['Accu-Chek', 'OneTouch', 'FreeStyle Libre'] },
    { type: 'weight_scale', emoji: '⚖️', brands: ['Withings Body', 'Fitbit Aria', 'Eufy Smart Scale'] }
  ]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; icon: any; color: string }> = {
      connected: { label: 'Connected', icon: CheckCircle, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400' },
      disconnected: { label: 'Disconnected', icon: XCircle, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
      syncing: { label: 'Syncing...', icon: RefreshCw, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' }
    };
    const variant = variants[status];
    const Icon = variant.icon;
    return (
      <Badge className={`${variant.color} flex items-center gap-1`}>
        <Icon className={`h-3 w-3 ${status === 'syncing' ? 'animate-spin' : ''}`} />
        {variant.label}
      </Badge>
    );
  };

  const handleSync = async (deviceId: string) => {
    setDevices(devices.map(device => 
      device.id === deviceId 
        ? { ...device, status: 'syncing' as const }
        : device
    ));

    try {
      // Trigger actual health data sync
      console.log('🔄 Syncing device:', deviceId);
      await healthSyncScheduler.triggerDeviceMeasurements();
      const success = await healthSyncScheduler.performSync();
      
      setDevices(prev => prev.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'connected' as const, lastSync: new Date() }
          : device
      ));
      
      if (success) {
        toast.success('Device synced successfully! Real health data updated.');
        loadHealthStats(); // Reload health stats after sync
      } else {
        toast.warning('No new data available. Please ensure device is connected via Bluetooth.');
      }
    } catch (error) {
      console.error('Sync error:', error);
      setDevices(prev => prev.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'connected' as const }
          : device
      ));
      toast.error('Sync failed. Please try again.');
    }
  };

  const handleConnect = (deviceId: string) => {
    setDevices(devices.map(device => 
      device.id === deviceId 
        ? { ...device, status: 'connected' as const, lastSync: new Date() }
        : device
    ));
    
    // Update localStorage
    const savedDevices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
    const updatedDevices = savedDevices.map((d: any) => 
      d.id === deviceId ? { ...d, status: 'connected' } : d
    );
    localStorage.setItem('connectedDevices', JSON.stringify(updatedDevices));
    toast.success('Device connected!');
  };

  const handleDisconnect = (deviceId: string) => {
    setDevices(devices.map(device => 
      device.id === deviceId 
        ? { ...device, status: 'disconnected' as const }
        : device
    ));
    toast.info('Device disconnected');
  };

  const handleRemoveDevice = (deviceId: string) => {
    // Remove from state
    setDevices(prev => prev.filter(d => d.id !== deviceId));
    
    // Remove from localStorage
    const savedDevices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
    const updatedDevices = savedDevices.filter((d: any) => d.id !== deviceId);
    localStorage.setItem('connectedDevices', JSON.stringify(updatedDevices));
    toast.success('Device removed');
  };

  const handleStartPairing = () => {
    // Navigate to dashboard and trigger pairing
    window.location.href = '/?action=pair-device';
  };

  const getDeviceEmoji = (type: string) => {
    switch (type) {
      case 'smartwatch': return '⌚';
      case 'fitness_band': return '📱';
      case 'smart_ring': return '💍';
      case 'bp_monitor': return '🩺';
      case 'glucometer': return '💉';
      case 'weight_scale': return '⚖️';
      default: return '📱';
    }
  };

  const connectedDevicesCount = devices.filter(d => d.status === 'connected').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 px-4 md:px-6 py-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
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
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Smart Device Integration</h1>
            <p className="text-slate-300 text-sm md:text-base">
              Connect your smartwatch, fitness band, or smart ring to automatically track your health data
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleStartPairing} className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30">
              <Bluetooth className="mr-2 h-4 w-4" />
              Pair New Device
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Stats - Real Data from Connected Devices */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
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

        <Card 
          className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-red-300 dark:hover:border-red-700 transition-all"
          onClick={() => { setSelectedMetric('heart_rate'); setShowTrendDialog(true); }}
        >
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

        <Card 
          className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all"
          onClick={() => { setSelectedMetric('steps'); setShowTrendDialog(true); }}
        >
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

        <Card 
          className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all"
          onClick={() => { setSelectedMetric('sleep'); setShowTrendDialog(true); }}
        >
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

        <Card 
          className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-pink-300 dark:hover:border-pink-700 transition-all"
          onClick={() => { setSelectedMetric('blood_pressure_systolic'); setShowTrendDialog(true); }}
        >
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

        <Card 
          className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-cyan-300 dark:hover:border-cyan-700 transition-all"
          onClick={() => { setSelectedMetric('spo2'); setShowTrendDialog(true); }}
        >
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
      </div>

      {/* Additional Health Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-orange-300 dark:hover:border-orange-700 transition-all"
          onClick={() => { setSelectedMetric('blood_glucose'); setShowTrendDialog(true); }}
        >
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

        <Card 
          className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
          onClick={() => { setSelectedMetric('hrv'); setShowTrendDialog(true); }}
        >
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

        <Card 
          className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all"
          onClick={() => { setSelectedMetric('uric_acid'); setShowTrendDialog(true); }}
        >
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

        <Card 
          className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:shadow-md hover:border-rose-300 dark:hover:border-rose-700 transition-all"
          onClick={() => { setSelectedMetric('total_cholesterol'); setShowTrendDialog(true); }}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30">
                  <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Cholesterol</p>
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

      {/* Auto-Sync Settings & Actions */}
      <Card className="bg-gradient-to-r from-slate-50 to-teal-50/30 dark:from-slate-800/50 dark:to-teal-900/20 border-teal-200/50 dark:border-teal-700/30">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Auto-sync toggle */}
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
            
            {/* Sync status info */}
            <div className="flex items-center gap-4 text-sm">
              {autoSyncEnabled && syncStatus && (
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Clock className="w-4 h-4 text-teal-500" />
                  <span>Next sync: {formatTimeUntilSync()}</span>
                </div>
              )}
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {healthStats.lastUpdated 
                  ? `Last: ${new Date(healthStats.lastUpdated).toLocaleTimeString()}`
                  : 'No data synced yet'
                }
              </div>
              {syncStatus && syncStatus.pendingReadings > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {syncStatus.pendingReadings} pending
                </Badge>
              )}
            </div>
            
            {/* Sync now button */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleSyncNow}
              disabled={loadingStats || syncing}
              className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${(loadingStats || syncing) ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log from Google Fit / Apple Health */}
      <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-500" />
              Activity Log
            </CardTitle>
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Google Fit / Apple Health
            </Badge>
          </div>
          <CardDescription>Daily activity from your smartphone</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Card 
              className="bg-slate-50 dark:bg-slate-900/50 border-0 cursor-pointer hover:shadow-md transition-all"
              onClick={() => { setSelectedMetric('walking'); setShowTrendDialog(true); }}
            >
              <CardContent className="p-3 text-center">
                <Footprints className="w-6 h-6 mx-auto text-green-500 mb-1" />
                <p className="text-xs text-slate-500">Walking</p>
                <p className="text-sm font-bold">View Trends</p>
              </CardContent>
            </Card>
            
            <Card 
              className="bg-slate-50 dark:bg-slate-900/50 border-0 cursor-pointer hover:shadow-md transition-all"
              onClick={() => { setSelectedMetric('running'); setShowTrendDialog(true); }}
            >
              <CardContent className="p-3 text-center">
                <Activity className="w-6 h-6 mx-auto text-red-500 mb-1" />
                <p className="text-xs text-slate-500">Running</p>
                <p className="text-sm font-bold">View Trends</p>
              </CardContent>
            </Card>
            
            <Card 
              className="bg-slate-50 dark:bg-slate-900/50 border-0 cursor-pointer hover:shadow-md transition-all"
              onClick={() => { setSelectedMetric('cycling'); setShowTrendDialog(true); }}
            >
              <CardContent className="p-3 text-center">
                <Activity className="w-6 h-6 mx-auto text-blue-500 mb-1" />
                <p className="text-xs text-slate-500">Cycling</p>
                <p className="text-sm font-bold">View Trends</p>
              </CardContent>
            </Card>
            
            <Card 
              className="bg-slate-50 dark:bg-slate-900/50 border-0 cursor-pointer hover:shadow-md transition-all"
              onClick={() => { setSelectedMetric('calories'); setShowTrendDialog(true); }}
            >
              <CardContent className="p-3 text-center">
                <Zap className="w-6 h-6 mx-auto text-orange-500 mb-1" />
                <p className="text-xs text-slate-500">Calories</p>
                <p className="text-sm font-bold">View Trends</p>
              </CardContent>
            </Card>
            
            <Card 
              className="bg-slate-50 dark:bg-slate-900/50 border-0 cursor-pointer hover:shadow-md transition-all"
              onClick={() => { setSelectedMetric('distance'); setShowTrendDialog(true); }}
            >
              <CardContent className="p-3 text-center">
                <Activity className="w-6 h-6 mx-auto text-teal-500 mb-1" />
                <p className="text-xs text-slate-500">Distance</p>
                <p className="text-sm font-bold">View Trends</p>
              </CardContent>
            </Card>
            
            <Card 
              className="bg-slate-50 dark:bg-slate-900/50 border-0 cursor-pointer hover:shadow-md transition-all"
              onClick={() => { setSelectedMetric('active_minutes'); setShowTrendDialog(true); }}
            >
              <CardContent className="p-3 text-center">
                <Timer className="w-6 h-6 mx-auto text-emerald-500 mb-1" />
                <p className="text-xs text-slate-500">Active Time</p>
                <p className="text-sm font-bold">View Trends</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Connected Devices */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Your Devices</h2>
          <Link to="/health-risk-assessment">
            <Button variant="outline" size="sm" className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Run Health Assessment
            </Button>
          </Link>
        </div>
        
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 text-teal-500 animate-spin" />
            <span className="ml-3 text-slate-600 dark:text-slate-400">Loading devices...</span>
          </div>
        )}
        
        {/* Empty State */}
        {!loading && devices.length === 0 && (
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-full mb-4">
                <Bluetooth className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">No Devices Connected</h3>
              <p className="text-slate-500 dark:text-slate-400 text-center mb-4 max-w-md">
                Connect your smartwatch, fitness band, or other Bluetooth health devices to start tracking your health data automatically.
              </p>
              <Button onClick={handleStartPairing} className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white">
                <Bluetooth className="mr-2 h-4 w-4" />
                Pair Your First Device
              </Button>
            </CardContent>
          </Card>
        )}
        
        {/* Device Grid */}
        {!loading && devices.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <Card key={device.id} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 transition-all">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/20 rounded-xl">
                      <span className="text-2xl">{getDeviceEmoji(device.type)}</span>
                    </div>
                    <div>
                      <CardTitle className="text-base text-slate-800 dark:text-white">{device.name}</CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-400">
                        {device.brand} • {device.model}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(device.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {device.battery !== undefined && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600 dark:text-slate-400">Battery</span>
                        <span className="font-medium text-slate-800 dark:text-white">{device.battery}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            device.battery > 50 ? 'bg-teal-500' : 
                            device.battery > 20 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${device.battery}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {device.lastSync && (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Last synced: {new Date(device.lastSync).toLocaleString()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Tracks:</p>
                    <div className="flex flex-wrap gap-2">
                      {device.dataTypes.map((dataType, index) => (
                        <Badge key={index} variant="secondary" className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {dataType}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    {device.status === 'connected' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(device.id)}
                          disabled={device.status === 'syncing'}
                          className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                        >
                          <RefreshCw className={`mr-2 h-4 w-4 ${device.status === 'syncing' ? 'animate-spin' : ''}`} />
                          Sync Now
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect(device.id)}
                          className="text-slate-600 dark:text-slate-400"
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(device.id)}
                        className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white"
                      >
                        <Bluetooth className="mr-2 h-4 w-4" />
                        Connect
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-slate-500" onClick={() => handleRemoveDevice(device.id)}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )}
      </div>

      {/* Available Device Types */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Add New Device</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableDevices.map((device, index) => (
            <Card key={index} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg transition-all group">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 rounded-xl group-hover:from-teal-50 group-hover:to-teal-100/50 dark:group-hover:from-teal-900/30 dark:group-hover:to-teal-800/20 transition-colors">
                    <span className="text-3xl">{device.emoji}</span>
                  </div>
                  <CardTitle className="text-base capitalize text-slate-800 dark:text-white">
                    {device.type.replace('_', ' ')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Supported brands:</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {device.brands.map((brand, brandIndex) => (
                    <Badge key={brandIndex} variant="outline" className="text-xs text-slate-600 dark:text-slate-400">
                      {brand}
                    </Badge>
                  ))}
                </div>
                <Button variant="outline" className="w-full border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add {device.type.replace('_', ' ')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Integration Info */}
      <Card className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-teal-400" />
            How Device Integration Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { title: 'Automatic Sync', desc: 'Connected devices automatically sync data when in range via Bluetooth' },
              { title: 'Data Privacy', desc: 'All health data is encrypted and stored securely on our servers' },
              { title: 'Health Assessment', desc: 'Synced data is used for personalized health risk assessment' },
              { title: 'Multiple Devices', desc: 'Connect multiple devices to track different health metrics' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                <CheckCircle className="w-5 h-5 text-teal-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white font-medium text-sm">{item.title}</p>
                  <p className="text-slate-400 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeviceIntegration;
