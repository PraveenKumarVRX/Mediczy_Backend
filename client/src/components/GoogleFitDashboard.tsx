import React, { useEffect, useState, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Activity, Heart, Footprints, Flame, Moon, Timer, AlertTriangle,
  RefreshCw, CheckCircle, WifiOff, Zap, TrendingUp, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DailyFitness {
  date: string;
  steps: number;
  calories: number;
  distance: number;
  activeMinutes: number;
  sleepHours: number | null;
  heartRate: { avg: number; min: number; max: number };
}

interface FitSummary {
  totalSteps: number;
  avgSteps: number;
  totalCalories: number;
  avgActiveMinutes: number;
  avgHeartRate: number;
  avgSleepHours: number;
  sleepDaysTracked: number;
  daysTracked: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const getUserToken = () =>
  typeof window !== 'undefined' ? (localStorage.getItem('token') || '') : '';

const GOOGLE_FIT_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.body.read',
].join(' ');

// ─── Main component ────────────────────────────────────────────────────────────

const GoogleFitDashboard: React.FC = () => {
  const [connected, setConnected]         = useState(false);
  const [lastSync, setLastSync]           = useState<string | null>(null);
  const [loading, setLoading]             = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [syncWarning, setSyncWarning]     = useState<string | null>(null);
  const [dailyData, setDailyData]         = useState<DailyFitness[]>([]);
  const [summary, setSummary]             = useState<FitSummary | null>(null);
  const [activeTab, setActiveTab]         = useState('overview');
  const [scopeError, setScopeError]       = useState(false);

  // ── Check connection status on mount ──────────────────────────────────────
  const checkStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/fitness/google/status');
      setConnected(data.connected);
      setLastSync(data.lastSync);
    } catch { /* not critical */ }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  // ── Server-side data fetch after getting Google access token ──────────────
  const fetchAndSync = useCallback(async (googleAccessToken: string, days = 7) => {
    setSyncing(true);
    setError(null);
    setSyncWarning(null);
    try {
      const { data } = await api.post('/fitness/google/fetch', { googleAccessToken, days });
      setDailyData(data.dailyData || []);
      setSummary(data.summary || null);
      setConnected(true);
      setLastSync(new Date().toISOString());
      // Surface partial sync failures as a non-blocking warning
      if (data.partialFailure && data.failedCount > 0) {
        setSyncWarning(
          `${data.savedCount} data point${data.savedCount !== 1 ? 's' : ''} saved successfully, ` +
          `but ${data.failedCount} could not be stored. Your charts may show gaps — try syncing again.`
        );
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Sync failed';
      if (msg.includes('permission denied') || msg.includes('403')) {
        setScopeError(true);
        setError('Google Fit permission denied. Please reconnect and grant all fitness permissions.');
      } else if (msg.includes('expired') || msg.includes('401')) {
        setConnected(false);
        setError('Google Fit session expired. Please reconnect.');
      } else {
        setError(msg);
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  // ── Google OAuth login ─────────────────────────────────────────────────────
  const login = useGoogleLogin({
    flow: 'implicit',
    scope: GOOGLE_FIT_SCOPES,
    onSuccess: async (tokenResponse) => {
      setLoading(false);
      await fetchAndSync(tokenResponse.access_token);
    },
    onError: (err) => {
      setLoading(false);
      console.error('Google Fit auth error:', err);
      if (err.error === 'access_denied') {
        setError('Access denied. Please grant all requested Google Fit permissions and try again.');
      } else {
        setError(`Google authorization failed: ${err.error_description || err.error || 'Unknown error'}`);
      }
    },
  });

  const handleConnect = () => {
    setLoading(true);
    setError(null);
    setScopeError(false);
    login();
  };

  const handleDisconnect = async () => {
    try {
      await api.delete('/fitness/google/disconnect');
      setConnected(false);
      setDailyData([]);
      setSummary(null);
      setLastSync(null);
    } catch { /* ignore */ }
  };

  // ── Stat card ──────────────────────────────────────────────────────────────
  const StatCard = ({
    icon: Icon, label, value, unit, sub, color, bg,
  }: {
    icon: React.ElementType; label: string; value: string | number;
    unit: string; sub?: string; color: string; bg: string;
  }) => (
    <Card className="border border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-bold text-slate-900">
              {value} <span className="text-xs font-normal text-slate-500">{unit}</span>
            </p>
            {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // ── Not connected state ────────────────────────────────────────────────────
  if (!connected && !loading && dailyData.length === 0) {
    return (
      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="py-12 px-6 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
            <Activity className="h-8 w-8 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Connect Google Fit</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Sync your activity, heart rate, and sleep data from Google Fit. Requires an Android device or Google Fit app.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-left max-w-md mx-auto">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">Connection failed</p>
                <p className="text-xs text-red-600 mt-0.5">{error}</p>
                {scopeError && (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    Tip: In the Google permission screen, make sure to check all fitness permission boxes.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto text-center">
            {[
              { icon: Footprints, label: 'Steps & Activity' },
              { icon: Heart,      label: 'Heart Rate'       },
              { icon: Moon,       label: 'Sleep Tracking'   },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
              </div>
            ))}
          </div>

          <Button
            onClick={handleConnect}
            disabled={loading}
            className="h-11 px-8 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:opacity-90 shadow-md shadow-blue-500/20"
          >
            {loading ? (
              <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Connecting…</>
            ) : (
              <><Activity className="h-4 w-4 mr-2" /> Connect Google Fit</>
            )}
          </Button>
          <p className="text-[11px] text-slate-400">
            You'll be asked to grant permission for activity, heart rate, and sleep data.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Syncing / loading overlay ──────────────────────────────────────────────
  const isBusy = loading || syncing;

  // ── Connected dashboard ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">Google Fit</p>
              {connected ? (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] py-0">
                  <CheckCircle className="h-2.5 w-2.5 mr-1" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500 text-[10px] py-0">
                  <WifiOff className="h-2.5 w-2.5 mr-1" /> Disconnected
                </Badge>
              )}
            </div>
            {lastSync && (
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                Last sync: {new Date(lastSync).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleConnect}
            disabled={isBusy}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
            {isBusy ? 'Syncing…' : 'Sync Now'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            className="h-8 text-xs text-slate-400 hover:text-red-500"
          >
            Disconnect
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">{error}</p>
        </div>
      )}
      {syncWarning && (
        <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-yellow-800 font-medium">Partial sync</p>
            <p className="text-xs text-yellow-700 mt-0.5">{syncWarning}</p>
          </div>
          <button onClick={() => setSyncWarning(null)} className="text-yellow-500 hover:text-yellow-700 text-xs ml-2">✕</button>
        </div>
      )}

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Footprints} label="Avg Daily Steps"  value={summary.avgSteps.toLocaleString()} unit="steps"      color="text-blue-600"   bg="bg-blue-50" />
          <StatCard icon={Flame}      label="Total Calories"   value={summary.totalCalories.toLocaleString()} unit="kcal" color="text-orange-500" bg="bg-orange-50" />
          <StatCard icon={Timer}      label="Avg Active"       value={summary.avgActiveMinutes} unit="min/day"             color="text-green-600"  bg="bg-green-50" />
          <StatCard icon={Heart}      label="Avg Heart Rate"   value={summary.avgHeartRate || '—'} unit="bpm"             color="text-red-500"    bg="bg-red-50" />
          <StatCard icon={Moon}       label="Avg Sleep"        value={summary.avgSleepHours || '—'} unit="hrs"             color="text-purple-600" bg="bg-purple-50"
            sub={summary.sleepDaysTracked ? `${summary.sleepDaysTracked} of ${summary.daysTracked} days tracked` : 'No sleep data yet'} />
          <StatCard icon={TrendingUp} label="Days Tracked"     value={summary.daysTracked} unit="days"                   color="text-cyan-600"   bg="bg-cyan-50" />
        </div>
      )}

      {/* Charts */}
      {dailyData.length > 0 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 h-9">
            <TabsTrigger value="overview" className="text-xs">Activity</TabsTrigger>
            <TabsTrigger value="heart"    className="text-xs">Heart Rate</TabsTrigger>
            <TabsTrigger value="sleep"    className="text-xs">Sleep</TabsTrigger>
          </TabsList>

          {/* Activity chart */}
          <TabsContent value="overview">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Footprints className="h-4 w-4 text-blue-500" />
                  Steps & Calories — Last {summary?.daysTracked || 7} Days
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gfSteps" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gfCals" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f97316" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="l" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    <Area yAxisId="l" type="monotone" dataKey="steps"    name="Steps"    stroke="#3b82f6" strokeWidth={2} fill="url(#gfSteps)" />
                    <Area yAxisId="r" type="monotone" dataKey="calories" name="Calories" stroke="#f97316" strokeWidth={2} fill="url(#gfCals)" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="mt-3">
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={dailyData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="activeMinutes" name="Active Min" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] text-center text-slate-400 mt-1">Active minutes per day</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Heart rate chart */}
          <TabsContent value="heart">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Heart className="h-4 w-4 text-red-500" />
                  Heart Rate — Daily Average
                </CardTitle>
                {!dailyData.some(d => d.heartRate.avg) && (
                  <CardDescription className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    No heart rate data found. Heart rate tracking requires a compatible wearable paired with Google Fit.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={dailyData.filter(d => d.heartRate.avg > 0)} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gfHr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit=" bpm" />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => [`${v} bpm`]}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    <Area type="monotone" dataKey="heartRate.avg" name="Avg BPM" stroke="#ef4444" strokeWidth={2} fill="url(#gfHr)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sleep chart */}
          <TabsContent value="sleep">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Moon className="h-4 w-4 text-purple-500" />
                  Sleep Duration
                </CardTitle>
                {!dailyData.some(d => d.sleepHours) && (
                  <CardDescription className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    No sleep sessions found. Sleep is tracked automatically by a Wear OS watch or if you log sleep manually in Google Fit.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={dailyData.map(d => ({ ...d, sleep: d.sleepHours ?? 0 }))}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis unit="h" domain={[0, 12]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => [`${v}h`, 'Sleep']}
                    />
                    <Bar dataKey="sleep" name="Sleep (hrs)" fill="#a855f7" radius={[4, 4, 0, 0]}>
                    </Bar>
                    {/* 8-hour goal reference */}
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-center text-slate-400 mt-2">
                  Recommended: 7–9 hours per night
                </p>

                {/* Sleep summary table */}
                {dailyData.some(d => d.sleepHours) && (
                  <div className="mt-4 space-y-2">
                    {dailyData.filter(d => d.sleepHours).map(d => (
                      <div key={d.date} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                        <span className="text-slate-600 font-medium">{d.date}</span>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 rounded-full bg-purple-400"
                            style={{ width: `${Math.min((d.sleepHours! / 9) * 80, 80)}px` }}
                          />
                          <span className={`font-semibold ${
                            d.sleepHours! >= 7 ? 'text-green-600' :
                            d.sleepHours! >= 6 ? 'text-amber-600' : 'text-red-500'
                          }`}>
                            {d.sleepHours}h
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : isBusy ? (
        <Card className="border border-slate-200">
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-sm text-slate-600">Fetching your fitness data from Google Fit…</p>
            <p className="text-xs text-slate-400 mt-1">This may take a few seconds</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-slate-200">
          <CardContent className="py-10 text-center">
            <Zap className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No data yet. Click <strong>Sync Now</strong> to fetch your latest Google Fit data.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const ConfiguredGoogleFitDashboard: React.FC = () => import.meta.env.VITE_GOOGLE_CLIENT_ID
  ? <GoogleFitDashboard />
  : <Card><CardHeader><CardTitle>Google Fit</CardTitle><CardDescription>Google Fit connection is unavailable. Contact support to enable this integration.</CardDescription></CardHeader></Card>;

export default ConfiguredGoogleFitDashboard;
