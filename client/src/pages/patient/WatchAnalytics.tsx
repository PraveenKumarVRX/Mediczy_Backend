/**
 * WatchAnalytics — HBand-style health analytics dashboard
 *
 * Sections:
 *  1. Device status bar (name, battery, connection, last sync)
 *  2. Auto-sync controls (toggle + interval picker)
 *  3. Activity rings (steps, calories, active minutes)
 *  4. Live metrics grid (HR, SpO2, stress, temp, BP, HRV, sleep)
 *  5. 7-day trend charts per metric
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Heart, Activity, Wind, Thermometer, Footprints, Flame,
  Moon, Zap, Watch, RefreshCw, Bluetooth, BluetoothOff,
  TrendingUp, TrendingDown, Minus, Clock, Battery,
  Dumbbell, MapPin, Droplets, FlaskConical, HeartPulse,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';
import { healthSyncScheduler } from '@/services/health/HealthSyncScheduler';
import veepooService from '@/services/ble/VeepooService';
import fireBolttService from '@/services/ble/FireBolttService';

// ─── Types ───────────────────────────────────────────────────────────────────
interface HealthMetric {
  value: number | null;
  unit: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  normal?: [number, number]; // [min, max] normal range
  history: { day: string; value: number }[];
}

interface HealthData {
  heartRate:       HealthMetric;
  spo2:            HealthMetric;
  steps:           HealthMetric;
  calories:        HealthMetric;
  activeMinutes:   HealthMetric;
  sleepHours:      HealthMetric;
  sleepScore:      HealthMetric;
  bloodPressure:   { systolic: number | null; diastolic: number | null; trend?: 'up'|'down'|'stable'; history: { day: string; s: number; d: number }[] };
  hrv:             HealthMetric;
  temperature:     HealthMetric;
  stress:          HealthMetric;
  bloodGlucose:    HealthMetric;
  uricAcid:        HealthMetric;
  cholesterol:     HealthMetric;
  gymWorkout:      HealthMetric;
  outdoorActivity: HealthMetric;
  ecg:             { rhythm: string | null; lastRecorded: Date | null; history: { day: string; value: number }[] };
}

interface ConnectedDevice {
  id: string; name: string; battery?: number;
  lastSync?: string; isVeepooDevice?: boolean; isFireBolttDevice?: boolean;
  status?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STEP_GOAL       = 10000;
const CAL_GOAL        = 500;
const ACTIVE_MIN_GOAL = 30;
const SLEEP_GOAL      = 8;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Maps UI metric key → backend data_type for the /trends/:dataType endpoint
const METRIC_API_TYPE: Record<string, string> = {
  heartRate:       'heart_rate',
  spo2:            'spo2',
  steps:           'steps',
  calories:        'calories',
  activeMinutes:   'active_minutes',
  sleepHours:      'sleep',
  hrv:             'hrv',
  temperature:     'temperature',
  stress:          'stress',
  bloodGlucose:    'blood_glucose',
  bp:              'blood_pressure_systolic',
  uricAcid:        'uric_acid',
  cholesterol:     'cholesterol',
  gymWorkout:      'gym_workout',
  outdoorActivity: 'outdoor_activity',
};

function emptyMetric(unit: string, normal?: [number, number]): HealthMetric {
  return { value: null, unit, normal, trend: 'stable', history: [] };
}

function emptyData(): HealthData {
  return {
    heartRate:       emptyMetric('bpm', [60, 100]),
    spo2:            emptyMetric('%', [95, 100]),
    steps:           emptyMetric('steps'),
    calories:        emptyMetric('kcal'),
    activeMinutes:   emptyMetric('min'),
    sleepHours:      emptyMetric('hrs', [7, 9]),
    sleepScore:      emptyMetric('%'),
    bloodPressure:   { systolic: null, diastolic: null, history: [] },
    hrv:             emptyMetric('ms', [20, 80]),
    temperature:     emptyMetric('°C', [36.1, 37.2]),
    stress:          emptyMetric('%'),
    bloodGlucose:    emptyMetric('mmol/L', [3.9, 7.8]),
    uricAcid:        emptyMetric('μmol/L', [150, 420]),
    cholesterol:     emptyMetric('mmol/L', [0, 5.2]),
    gymWorkout:      emptyMetric('min'),
    outdoorActivity: emptyMetric('km'),
    ecg:             { rhythm: null, lastRecorded: null, history: [] },
  };
}

// ─── Activity Ring ────────────────────────────────────────────────────────────
const Ring: React.FC<{
  size?: number; strokeWidth?: number; progress: number; // 0-1
  color: string; bgColor: string; children?: React.ReactNode;
}> = ({ size = 120, strokeWidth = 10, progress, color, bgColor, children }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(progress, 1));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
};

// ─── Metric Card ──────────────────────────────────────────────────────────────
const MetricCard: React.FC<{
  icon: React.ReactNode; label: string; value: number | null; unit: string;
  color: string; bgColor: string; trend?: 'up'|'down'|'stable'; normal?: [number,number];
  history: {day:string; value:number}[];
  onClick?: () => void; selected?: boolean;
}> = ({ icon, label, value, unit, color, bgColor, trend, normal, history, onClick, selected }) => {
  const isNormal = value != null && normal ? value >= normal[0] && value <= normal[1] : null;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 border-2 ${selected ? 'border-teal-500 shadow-lg shadow-teal-500/20' : 'border-transparent hover:border-slate-600'} bg-slate-800/60`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-xl ${bgColor}`}>{icon}</div>
          <div className="flex flex-col items-end gap-1">
            {trend && <TrendIcon className={`w-3 h-3 ${trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-teal-400' : 'text-slate-400'}`} />}
            {isNormal !== null && (
              <Badge className={`text-[9px] px-1 py-0 h-4 ${isNormal ? 'bg-teal-500/20 text-teal-400' : 'bg-orange-500/20 text-orange-400'}`}>
                {isNormal ? 'Normal' : 'Alert'}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-1">{label}</p>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold ${color}`}>
            {value != null ? value.toLocaleString() : '—'}
          </span>
          <span className="text-xs text-slate-500">{unit}</span>
        </div>
        {history.length > 0 && (
          <div className="mt-3 h-12">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color.replace('text-','').replace('-400','')} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color.replace('text-','').replace('-400','')} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="rgba(20,184,166,0.7)" fill={`url(#g-${label})`} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const WatchAnalytics: React.FC = () => {
  const [data, setData] = useState<HealthData>(emptyData());
  const [device, setDevice] = useState<ConnectedDevice | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncIntervalState] = useState(30);
  const [syncing, setSyncing] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string>('heartRate');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [chartPeriod, setChartPeriod] = useState<'today' | '7day'>('7day');
  const [apiChartData, setApiChartData] = useState<{ label: string; value: number; min: number; max: number }[]>([]);
  const [chartStats, setChartStats] = useState<{ average: number; minimum: number; maximum: number; totalReadings: number } | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  // ── Load chart data from /trends API ─────────────────────────────────────
  const loadChartData = useCallback(async (metric: string, period: 'today' | '7day') => {
    const apiType = METRIC_API_TYPE[metric];
    if (!apiType) return;
    setChartLoading(true);
    setApiChartData([]);
    setChartStats(null);
    try {
      const res = await api.get(`/health-data/trends/${apiType}`, {
        params: { period: period === 'today' ? 'hour' : 'day' },
      });
      setApiChartData(res.data.data ?? []);
      setChartStats(res.data.stats ?? null);
    } catch (e) {
      console.error('Chart load error:', e);
    } finally {
      setChartLoading(false);
    }
  }, []);

  // ── Load device + health data ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    // Connected device from localStorage
    const stored = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
    if (stored.length > 0) setDevice(stored[0]);

    try {
      const res = await api.get('/health-data/summary');
      const d   = res.data;
      const latest = d.latest ?? {};
      const prev   = d.previous ?? {};

      // Helper to build 7-day history from backend periods
      const mkHistory = (key: string): {day:string; value:number}[] => {
        const series = d.period?.[key] ?? [];
        if (series.length > 0) {
          return series.slice(-7).map((v: number, i: number) => ({ day: DAYS[i % 7], value: v }));
        }
        return [];
      };

      const calc = (curr: number|null, prv: number|null): 'up'|'down'|'stable' => {
        if (!curr || !prv) return 'stable';
        if (curr > prv * 1.03) return 'up';
        if (curr < prv * 0.97) return 'down';
        return 'stable';
      };

      const hr  = latest.heart_rate?.value ?? null;
      const prHr = prev.heart_rate?.value ?? null;

      setData({
        heartRate:     { value: hr, unit:'bpm', normal:[60,100], trend: calc(hr, prHr), history: mkHistory('heart_rate') },
        spo2:          { value: latest.spo2?.value ?? null, unit:'%', normal:[95,100], trend:'stable', history: mkHistory('spo2') },
        steps:         { value: latest.steps?.value ?? null, unit:'steps', history: mkHistory('steps') },
        calories:      { value: latest.calories?.value ?? null, unit:'kcal', history: mkHistory('calories') },
        activeMinutes: { value: latest.active_minutes?.value ?? null, unit:'min', history: mkHistory('active_minutes') },
        sleepHours:    { value: latest.sleep?.value ?? null, unit:'hrs', normal:[7,9], history: mkHistory('sleep') },
        sleepScore:    { value: latest.sleep?.value ? Math.min(100, Math.round(latest.sleep.value / SLEEP_GOAL * 100)) : null, unit:'%', history: [] },
        bloodPressure: {
          systolic: latest.blood_pressure_systolic?.value ?? null,
          diastolic: latest.blood_pressure_diastolic?.value ?? null,
          trend: 'stable',
          history: mkHistory('blood_pressure_systolic').map((h, i) => ({
            day: h.day, s: h.value,
            d: mkHistory('blood_pressure_diastolic')[i]?.value ?? 80,
          })),
        },
        hrv:          { value: latest.hrv?.value ?? null, unit:'ms', normal:[20,80], history: mkHistory('hrv') },
        temperature:  { value: latest.temperature?.value ?? null, unit:'°C', normal:[36.1,37.2], history: mkHistory('temperature') },
        stress:       { value: latest.stress?.value ?? null, unit:'%', history: mkHistory('stress') },
        bloodGlucose: { value: latest.blood_glucose?.value ?? null, unit:'mmol/L', normal:[3.9,7.8], history: mkHistory('blood_glucose') },        uricAcid:     { value: latest.uric_acid?.value ?? null, unit:'\u03bcmol/L', normal:[150,420], history: mkHistory('uric_acid') },
        cholesterol:  { value: latest.cholesterol?.value ?? null, unit:'mmol/L', normal:[0,5.2], history: mkHistory('cholesterol') },
        gymWorkout:   { value: latest.gym_workout?.value ?? null, unit:'min', history: mkHistory('gym_workout') },
        outdoorActivity: { value: latest.outdoor_activity?.value ?? null, unit:'km', history: mkHistory('outdoor_activity') },
        ecg: {
          rhythm: latest.ecg ? (['normal','afib','irregular','unknown'][Math.round(latest.ecg.value)] ?? 'unknown') : null,
          lastRecorded: latest.ecg?.timestamp ? new Date(latest.ecg.timestamp) : null,
          history: mkHistory('ecg'),
        },      });

      if (d.lastSync) setLastSync(new Date(d.lastSync));
    } catch (e) {
      // Use cached data from localStorage
      const cached = localStorage.getItem('lastHealthStats');
      if (cached) {
        try {
          const c = JSON.parse(cached);
          setData(prev => ({
            ...prev,
            heartRate: { ...prev.heartRate, value: c.heartRate },
            spo2:      { ...prev.spo2,  value: c.spo2 },
            steps:     { ...prev.steps, value: c.steps },
          }));
        } catch {}
      }
    }
  }, []);

  // Scheduler init — runs once on mount only
  useEffect(() => {
    setAutoSync(healthSyncScheduler.isSchedulerRunning());
    setSyncIntervalState(healthSyncScheduler.getIntervalMinutes());
    healthSyncScheduler.autoStart();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
    const handleSync = () => { loadData(); loadChartData(selectedMetric, chartPeriod); setLastSync(new Date()); };
    window.addEventListener('healthDataSynced', handleSync);
    const tick = setInterval(loadData, 60_000); // refresh display every minute
    return () => {
      window.removeEventListener('healthDataSynced', handleSync);
      clearInterval(tick);
    };
  }, [loadData, loadChartData, selectedMetric, chartPeriod]);

  useEffect(() => {
    loadChartData(selectedMetric, chartPeriod);
  }, [selectedMetric, chartPeriod, loadChartData]);

  // ── Manual sync ─────────────────────────────────────────────────────────────
  const handleManualSync = async () => {
    setSyncing(true);
    try {
      // Try Veepoo auto-reconnect + measure
      const devs: ConnectedDevice[] = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
      const veepoo = devs.find(d => d.isVeepooDevice);
      const fb     = devs.find(d => d.isFireBolttDevice);

      if (veepoo) {
        if (!veepooService.getConnectionStatus()) await veepooService.reconnect();
        if (veepooService.getConnectionStatus()) {
          await veepooService.startHeartRateMeasurement();
          toast.success('Veepoo measurement started (30 s)');
        } else {
          // BLE not reachable — just re-fetch stored data from the server
          toast.info('Watch not in range — showing latest stored data');
        }
      } else if (fb) {
        const fbData = await fireBolttService.syncAll();
        toast.success(`Fire-Boltt synced — HR: ${fbData.heartRate ?? '—'} bpm`);
      } else {
        await healthSyncScheduler.syncNow();
        toast.success('Health data synced!');
      }
      await loadData();
      loadChartData(selectedMetric, chartPeriod);
      setLastSync(new Date());
      toast.success('Dashboard updated');
    } catch (e) {
      toast.error('Sync failed. Ensure watch is nearby and Bluetooth is on.');
    } finally {
      setSyncing(false);
    }
  };

  // ── Auto-sync toggle ─────────────────────────────────────────────────────────
  const handleAutoSyncToggle = (on: boolean) => {
    setAutoSync(on);
    if (on) {
      healthSyncScheduler.start(syncInterval * 60_000);
      toast.success(`Auto-sync on — every ${syncInterval} min`);
    } else {
      healthSyncScheduler.stop();
      toast.info('Auto-sync off');
    }
  };

  const handleIntervalChange = (min: number) => {
    setSyncIntervalState(min);
    healthSyncScheduler.setIntervalMinutes(min);
    if (autoSync) toast.info(`Sync interval changed to ${min} min`);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const steps     = data.steps.value ?? 0;
  const calories  = data.calories.value ?? 0;
  const activeMins = data.activeMinutes.value ?? 0;

  const formatLastSync = () => {
    if (!lastSync) return 'Never';
    const diff = Math.round((Date.now() - lastSync.getTime()) / 60000);
    if (diff < 1)  return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    return `${h}h ago`;
  };

  const selectedMeta: Record<string, { label:string; color:string; unit:string }> = {
    heartRate:     { label:'Heart Rate',       color:'#f87171', unit:'bpm'    },
    spo2:          { label:'Blood Oxygen',     color:'#60a5fa', unit:'%'     },
    steps:         { label:'Steps',            color:'#34d399', unit:'steps' },
    calories:      { label:'Calories',         color:'#fb923c', unit:'kcal'  },
    activeMinutes: { label:'Active Minutes',   color:'#a78bfa', unit:'min'   },
    sleepHours:    { label:'Sleep',            color:'#818cf8', unit:'hrs'   },
    hrv:           { label:'HRV',              color:'#2dd4bf', unit:'ms'    },
    temperature:   { label:'Temperature',      color:'#facc15', unit:'\u00b0C'    },
    stress:        { label:'Stress',           color:'#f472b6', unit:'%'     },
    bloodGlucose:  { label:'Blood Glucose',    color:'#a3e635', unit:'mmol/L'},
    uricAcid:      { label:'Uric Acid',        color:'#fb7185', unit:'\u03bcmol/L'},
    cholesterol:   { label:'Cholesterol',      color:'#f9a8d4', unit:'mmol/L'},
    gymWorkout:    { label:'Gym Workout',      color:'#86efac', unit:'min'   },
    outdoorActivity:{ label:'Outdoor Activity',color:'#67e8f9', unit:'km'    },
    bp:            { label:'Blood Pressure',   color:'#22d3ee', unit:'mmHg'  },
    ecg:           { label:'ECG Rhythm',       color:'#a78bfa', unit:''      },
  };

  const sm = selectedMeta[selectedMetric] ?? selectedMeta.heartRate;

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-4 md:px-6 py-6 animate-in fade-in duration-500">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 p-6 text-white shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_70%_50%,rgba(20,184,166,0.6),transparent)]" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-teal-500/20 border border-teal-500/30">
              <Watch className="w-8 h-8 text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{device?.name ?? 'Smart Wearables'}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-xs text-teal-300">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  {device ? 'Connected' : 'No device paired'}
                </span>
                {device?.battery != null && (
                  <span className="flex items-center gap-1 text-xs text-slate-300">
                    <Battery className="w-3 h-3" /> {device.battery}%
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="w-3 h-3" /> {formatLastSync()}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleManualSync}
              disabled={syncing}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Now
            </Button>
          </div>
        </div>
      </div>

      {/* ── Auto-sync controls ─────────────────────────────────────────────── */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${autoSync ? 'bg-teal-500/20' : 'bg-slate-700'}`}>
                {autoSync ? <Bluetooth className="w-4 h-4 text-teal-400" /> : <BluetoothOff className="w-4 h-4 text-slate-400" />}
              </div>
              <div>
                <p className="text-sm font-medium text-white">Auto-Sync</p>
                <p className="text-xs text-slate-400">Automatically sync health data from your wearables</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Every</span>
                {[10, 15, 30, 60].map(m => (
                  <button
                    key={m}
                    onClick={() => handleIntervalChange(m)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      syncInterval === m
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <Switch checked={autoSync} onCheckedChange={handleAutoSyncToggle} />
            </div>
          </div>
          {autoSync && (
            <div className="mt-3 text-xs text-slate-500">
              Next sync in {healthSyncScheduler.getTimeUntilNextSync() > 0
                ? `${Math.round(healthSyncScheduler.getTimeUntilNextSync() / 60000)} min`
                : 'just a moment'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Activity Rings ────────────────────────────────────────────────── */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-400" /> Today's Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex flex-wrap justify-around gap-6">
            {/* Steps Ring */}
            <div className="flex flex-col items-center gap-2">
              <Ring progress={steps / STEP_GOAL} color="#34d399" bgColor="#1e3a2f" size={120} strokeWidth={10}>
                <Footprints className="w-5 h-5 text-emerald-400 mb-0.5" />
                <span className="text-base font-bold text-white leading-none">
                  {steps > 999 ? `${(steps/1000).toFixed(1)}k` : steps}
                </span>
                <span className="text-[9px] text-slate-400">steps</span>
              </Ring>
              <div className="text-center">
                <p className="text-xs text-white font-medium">Move</p>
                <p className="text-[10px] text-slate-400">{steps} / {STEP_GOAL.toLocaleString()}</p>
              </div>
            </div>

            {/* Calories Ring */}
            <div className="flex flex-col items-center gap-2">
              <Ring progress={calories / CAL_GOAL} color="#fb923c" bgColor="#3a2210" size={120} strokeWidth={10}>
                <Flame className="w-5 h-5 text-orange-400 mb-0.5" />
                <span className="text-base font-bold text-white leading-none">{calories}</span>
                <span className="text-[9px] text-slate-400">kcal</span>
              </Ring>
              <div className="text-center">
                <p className="text-xs text-white font-medium">Burn</p>
                <p className="text-[10px] text-slate-400">{calories} / {CAL_GOAL}</p>
              </div>
            </div>

            {/* Active Minutes Ring */}
            <div className="flex flex-col items-center gap-2">
              <Ring progress={activeMins / ACTIVE_MIN_GOAL} color="#a78bfa" bgColor="#2e1f4a" size={120} strokeWidth={10}>
                <Zap className="w-5 h-5 text-violet-400 mb-0.5" />
                <span className="text-base font-bold text-white leading-none">{activeMins}</span>
                <span className="text-[9px] text-slate-400">min</span>
              </Ring>
              <div className="text-center">
                <p className="text-xs text-white font-medium">Stand</p>
                <p className="text-[10px] text-slate-400">{activeMins} / {ACTIVE_MIN_GOAL} min</p>
              </div>
            </div>

            {/* Sleep Ring */}
            <div className="flex flex-col items-center gap-2">
              <Ring
                progress={(data.sleepHours.value ?? 0) / SLEEP_GOAL}
                color="#818cf8" bgColor="#1f1f3a" size={120} strokeWidth={10}
              >
                <Moon className="w-5 h-5 text-indigo-400 mb-0.5" />
                <span className="text-base font-bold text-white leading-none">
                  {data.sleepHours.value ?? '—'}
                </span>
                <span className="text-[9px] text-slate-400">hrs</span>
              </Ring>
              <div className="text-center">
                <p className="text-xs text-white font-medium">Sleep</p>
                <p className="text-[10px] text-slate-400">{data.sleepHours.value ?? 0} / {SLEEP_GOAL} hrs</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Metric Grid ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <Heart className="w-4 h-4 text-teal-400" /> Health Metrics — tap a card to see 7-day chart
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Heart Rate" value={data.heartRate.value} unit="bpm"
            icon={<Heart className="w-4 h-4 text-red-400" />}
            color="text-red-400" bgColor="bg-red-500/15"
            trend={data.heartRate.trend} normal={data.heartRate.normal}
            history={data.heartRate.history}
            selected={selectedMetric === 'heartRate'}
            onClick={() => setSelectedMetric('heartRate')}
          />
          <MetricCard
            label="Blood Oxygen" value={data.spo2.value} unit="%"
            icon={<Wind className="w-4 h-4 text-blue-400" />}
            color="text-blue-400" bgColor="bg-blue-500/15"
            normal={data.spo2.normal} history={data.spo2.history}
            selected={selectedMetric === 'spo2'}
            onClick={() => setSelectedMetric('spo2')}
          />
          <MetricCard
            label="HRV" value={data.hrv.value} unit="ms"
            icon={<Activity className="w-4 h-4 text-teal-400" />}
            color="text-teal-400" bgColor="bg-teal-500/15"
            normal={data.hrv.normal} history={data.hrv.history}
            selected={selectedMetric === 'hrv'}
            onClick={() => setSelectedMetric('hrv')}
          />
          <MetricCard
            label="Temperature" value={data.temperature.value} unit="°C"
            icon={<Thermometer className="w-4 h-4 text-yellow-400" />}
            color="text-yellow-400" bgColor="bg-yellow-500/15"
            normal={data.temperature.normal} history={data.temperature.history}
            selected={selectedMetric === 'temperature'}
            onClick={() => setSelectedMetric('temperature')}
          />
          <MetricCard
            label="Stress" value={data.stress.value} unit="%"
            icon={<Zap className="w-4 h-4 text-pink-400" />}
            color="text-pink-400" bgColor="bg-pink-500/15"
            history={data.stress.history}
            selected={selectedMetric === 'stress'}
            onClick={() => setSelectedMetric('stress')}
          />
          <MetricCard
            label="Blood Glucose" value={data.bloodGlucose.value} unit="mmol/L"
            icon={<Activity className="w-4 h-4 text-lime-400" />}
            color="text-lime-400" bgColor="bg-lime-500/15"
            normal={data.bloodGlucose.normal} history={data.bloodGlucose.history}
            selected={selectedMetric === 'bloodGlucose'}
            onClick={() => setSelectedMetric('bloodGlucose')}
          />
          <MetricCard
            label="Uric Acid" value={data.uricAcid.value} unit="\u03bcmol/L"
            icon={<Droplets className="w-4 h-4 text-rose-400" />}
            color="text-rose-400" bgColor="bg-rose-500/15"
            normal={data.uricAcid.normal} history={data.uricAcid.history}
            selected={selectedMetric === 'uricAcid'}
            onClick={() => setSelectedMetric('uricAcid')}
          />
          <MetricCard
            label="Cholesterol" value={data.cholesterol.value} unit="mmol/L"
            icon={<FlaskConical className="w-4 h-4 text-pink-300" />}
            color="text-pink-300" bgColor="bg-pink-500/15"
            normal={data.cholesterol.normal} history={data.cholesterol.history}
            selected={selectedMetric === 'cholesterol'}
            onClick={() => setSelectedMetric('cholesterol')}
          />
          <MetricCard
            label="Gym Workout" value={data.gymWorkout.value} unit="min"
            icon={<Dumbbell className="w-4 h-4 text-green-400" />}
            color="text-green-400" bgColor="bg-green-500/15"
            history={data.gymWorkout.history}
            selected={selectedMetric === 'gymWorkout'}
            onClick={() => setSelectedMetric('gymWorkout')}
          />
          <MetricCard
            label="Outdoor Activity" value={data.outdoorActivity.value} unit="km"
            icon={<MapPin className="w-4 h-4 text-cyan-400" />}
            color="text-cyan-400" bgColor="bg-cyan-500/15"
            history={data.outdoorActivity.history}
            selected={selectedMetric === 'outdoorActivity'}
            onClick={() => setSelectedMetric('outdoorActivity')}
          />
          {/* ECG — special card showing rhythm label */}
          <Card
            className={`cursor-pointer transition-all duration-200 border-2 ${
              selectedMetric === 'ecg' ? 'border-teal-500 shadow-lg shadow-teal-500/20' : 'border-transparent hover:border-slate-600'
            } bg-slate-800/60`}
            onClick={() => setSelectedMetric('ecg')}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-xl bg-violet-500/15">
                  <HeartPulse className="w-4 h-4 text-violet-400" />
                </div>
                {data.ecg.rhythm && (
                  <Badge className={`text-[9px] px-1 py-0 h-4 ${
                    data.ecg.rhythm === 'normal' ? 'bg-teal-500/20 text-teal-400'
                    : data.ecg.rhythm === 'afib'  ? 'bg-red-500/20 text-red-400'
                    : 'bg-orange-500/20 text-orange-400'
                  }`}>
                    {data.ecg.rhythm === 'normal' ? 'Normal' : data.ecg.rhythm === 'afib' ? 'AFib' : 'Irregular'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400 mb-1">ECG Rhythm</p>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-violet-400 capitalize">
                  {data.ecg.rhythm ?? '\u2014'}
                </span>
              </div>
              {data.ecg.lastRecorded && (
                <p className="text-[10px] text-slate-500 mt-1">
                  {data.ecg.lastRecorded.toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
          <MetricCard
            label="Active Minutes" value={data.activeMinutes.value} unit="min"
            icon={<Flame className="w-4 h-4 text-violet-400" />}
            color="text-violet-400" bgColor="bg-violet-500/15"
            history={data.activeMinutes.history}
            selected={selectedMetric === 'activeMinutes'}
            onClick={() => setSelectedMetric('activeMinutes')}
          />
          <MetricCard
            label="Sleep" value={data.sleepHours.value} unit="hrs"
            icon={<Moon className="w-4 h-4 text-indigo-400" />}
            color="text-indigo-400" bgColor="bg-indigo-500/15"
            normal={data.sleepHours.normal} history={data.sleepHours.history}
            selected={selectedMetric === 'sleepHours'}
            onClick={() => setSelectedMetric('sleepHours')}
          />
          {/* Blood Pressure — special card */}
          <Card
            className={`cursor-pointer transition-all duration-200 border-2 ${selectedMetric==='bp' ? 'border-teal-500 shadow-lg shadow-teal-500/20' : 'border-transparent hover:border-slate-600'} bg-slate-800/60`}
            onClick={() => setSelectedMetric('bp')}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-xl bg-cyan-500/15">
                  <Heart className="w-4 h-4 text-cyan-400" />
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-1">Blood Pressure</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-cyan-400">
                  {data.bloodPressure.systolic ?? '—'}/{data.bloodPressure.diastolic ?? '—'}
                </span>
                <span className="text-xs text-slate-500">mmHg</span>
              </div>
              {data.bloodPressure.history.length > 0 && (
                <div className="mt-3 h-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.bloodPressure.history} margin={{ top:0,right:0,left:0,bottom:0 }}>
                      <Area type="monotone" dataKey="s" stroke="rgba(34,211,238,0.7)" fill="rgba(34,211,238,0.1)" strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="d" stroke="rgba(34,211,238,0.4)" fill="rgba(34,211,238,0.05)" strokeWidth={1} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Chart Panel (Today hourly / 7-Day trend) ──────────────────────── */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-400" />
              {sm.label}
              {selectedMetric === 'bp' && (
                <span className="text-xs text-slate-400 font-normal">(Systolic)</span>
              )}
            </CardTitle>
            {/* Period tabs */}
            <div className="flex items-center gap-1 bg-slate-700/60 rounded-lg p-1">
              {(['today', '7day'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    chartPeriod === p
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p === 'today' ? 'Today (hourly)' : '7 Days'}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {/* Stats row */}
          {chartStats && chartStats.totalReadings > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'Avg', val: `${chartStats.average} ${sm.unit}` },
                { label: 'Min', val: `${chartStats.minimum} ${sm.unit}` },
                { label: 'Max', val: `${chartStats.maximum} ${sm.unit}` },
                { label: 'Readings', val: String(chartStats.totalReadings) },
              ].map(s => (
                <div key={s.label} className="text-center p-2 rounded-lg bg-slate-700/40">
                  <p className="text-[10px] text-slate-400 mb-0.5">{s.label}</p>
                  <p className="text-sm font-bold text-white">{s.val}</p>
                </div>
              ))}
            </div>
          )}
          {chartLoading ? (
            <div className="h-48 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-teal-400 animate-spin" />
            </div>
          ) : apiChartData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                {chartPeriod === 'today' ? (
                  <LineChart data={apiChartData} margin={{ top:5, right:5, left:-20, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill:'#94a3b8', fontSize:10 }}
                      axisLine={false} tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fill:'#94a3b8', fontSize:11 }} axisLine={false} tickLine={false} domain={['auto','auto']} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-800 border border-slate-600 rounded-lg p-2 text-xs shadow-xl">
                            <p className="text-slate-300 mb-1 font-medium">{d.label}</p>
                            <p style={{ color: sm.color }}>
                              {sm.label}: <strong>{d.value} {sm.unit}</strong>
                            </p>
                            {d.count > 1 && (
                              <p className="text-slate-400 mt-0.5">
                                Min {d.min} · Max {d.max} {sm.unit} ({d.count} readings)
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone" dataKey="value"
                      stroke={sm.color} strokeWidth={2}
                      dot={{ fill: sm.color, r: 3 }} activeDot={{ r: 5 }}
                    />
                  </LineChart>
                ) : (
                  <AreaChart data={apiChartData} margin={{ top:5, right:5, left:-20, bottom:0 }}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={sm.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={sm.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill:'#94a3b8', fontSize:11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:'#94a3b8', fontSize:11 }} axisLine={false} tickLine={false} domain={['auto','auto']} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-800 border border-slate-600 rounded-lg p-2 text-xs shadow-xl">
                            <p className="text-slate-300 mb-1 font-medium">{d.label}</p>
                            <p style={{ color: sm.color }}>
                              Avg: <strong>{d.value} {sm.unit}</strong>
                            </p>
                            <p className="text-slate-400 mt-0.5">
                              Min {d.min} · Max {d.max} {sm.unit}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone" dataKey="value"
                      stroke={sm.color} fill="url(#trendGrad)"
                      strokeWidth={2} dot={{ fill: sm.color, r: 3 }} activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-slate-500">
              <TrendingUp className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No data for this period</p>
              <p className="text-xs mt-1">Sync your watch to see readings here</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Sleep Detail ─────────────────────────────────────────────────── */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-400" /> Sleep Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label:'Total Sleep', val: data.sleepHours.value ? `${data.sleepHours.value}h` : '—', color:'text-indigo-400' },
              { label:'Sleep Score', val: data.sleepScore.value ? `${data.sleepScore.value}%` : '—', color:'text-teal-400' },
              { label:'Deep Sleep',  val: data.sleepHours.value ? `${((data.sleepHours.value ?? 0) * 0.2).toFixed(1)}h` : '—', color:'text-violet-400' },
              { label:'REM Sleep',   val: data.sleepHours.value ? `${((data.sleepHours.value ?? 0) * 0.25).toFixed(1)}h` : '—', color:'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl bg-slate-700/40 text-center">
                <p className="text-xs text-slate-400 mb-1">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>
          {data.sleepHours.history.length > 0 && (
            <div className="mt-4 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.sleepHours.history} margin={{ top:0,right:5,left:-20,bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill:'#94a3b8', fontSize:11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:'#94a3b8', fontSize:11 }} axisLine={false} tickLine={false} domain={[0,10]} />
                  <Tooltip contentStyle={{ background:'#1e293b', border:'none', borderRadius:8, color:'#fff', fontSize:12 }} formatter={(v:any) => [`${v} hrs`, 'Sleep']} />
                  <Bar dataKey="value" fill="#818cf8" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default WatchAnalytics;
