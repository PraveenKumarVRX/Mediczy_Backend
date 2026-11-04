/**
 * Google Health Connect Dashboard
 *
 * Web context: Health Connect is Android-only. This dashboard:
 *  - Shows data that was synced to the server by the Mediczy Android app
 *  - Shows connection / last-sync status from the server
 *  - Provides "How to sync" instructions (Settings → Health → Health Connect)
 *  - No OAuth flow needed — there is no web API for Health Connect
 */

import React, { useEffect, useState, useCallback } from 'react';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Activity, Heart, Footprints, Flame, Moon, Timer,
  RefreshCw, CheckCircle, WifiOff, Zap, TrendingUp, Clock,
  Smartphone, X, AlertTriangle, Info,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DailyRecord {
  date: string;
  steps: number;
  calories: number;
  distance: number;
  activeMinutes: number;
  sleepHours: number | null;
  heartRate: { avg: number; min: number; max: number };
}

interface SummaryData {
  totalSteps: number;
  avgSteps: number;
  totalCalories: number;
  avgActiveMinutes: number;
  avgHeartRate: number;
  avgSleepHours: number;
  sleepDaysTracked: number;
  daysTracked: number;
}

// ─── Main component ────────────────────────────────────────────────────────────

const HealthConnectDashboard: React.FC = () => {
  const [connected, setConnected]   = useState(false);
  const [lastSync, setLastSync]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [dailyData, setDailyData]   = useState<DailyRecord[]>([]);
  const [summary, setSummary]       = useState<SummaryData | null>(null);
  const [activeTab, setActiveTab]   = useState('overview');
  const [showInstructions, setShowInstructions] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Check server-side connection status ────────────────────────────────────
  const checkStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/fitness/health-connect/status');
      setConnected(data.connected ?? false);
      setLastSync(data.lastSync ?? null);
    } catch { /* non-critical */ }
  }, []);

  // ── Load stored data from server ───────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSyncWarning(null);
    try {
      const { data } = await api.get('/fitness/summary', { params: { days: 7 } });

      const daily: DailyRecord[] = (data.dailyData || data.daily || []).map((d: any) => ({
        date: d.date,
        steps: d.steps || 0,
        calories: d.calories || 0,
        distance: d.distance || 0,
        activeMinutes: d.activeMinutes || d.active_minutes || 0,
        sleepHours: d.sleepHours ?? d.sleep_duration ?? null,
        heartRate: d.heartRate ?? {
          avg: d.heart_rate_avg || 0,
          min: d.heart_rate_min || 0,
          max: d.heart_rate_max || 0,
        },
      }));

      setDailyData(daily);
      setSummary(data.summary ?? buildLocalSummary(daily));
      if (daily.length > 0) setConnected(true);
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 404
          ? 'No Health Connect data found. Sync from the Mediczy Android app to get started.'
          : status === 500
          ? 'Health data service temporarily unavailable. Please try again.'
          : err?.response?.data?.error || 'Failed to load health data.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    loadData();
  }, [checkStatus, loadData]);

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.delete('/fitness/health-connect/disconnect?deleteData=true');
      setConnected(false);
      setDailyData([]);
      setSummary(null);
      setLastSync(null);
      setConfirmDisconnect(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to disconnect. Please try again.');
      setConfirmDisconnect(false);
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Stat card component ────────────────────────────────────────────────────
  const StatCard = ({ icon: Icon, label, value, unit, sub, color, bg }: {
    icon: React.ComponentType<any>; label: string; value: string | number;
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

  // ── Instructions overlay ───────────────────────────────────────────────────
  if (showInstructions) {
    return (
      <Card className="border border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5 text-green-500" />
            How to Sync with Google Health Connect
          </CardTitle>
          <CardDescription>
            Health Connect is Android-only. Sync happens through the Mediczy Android app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg bg-green-50 border border-green-200 p-4">
            <Info className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div className="text-sm text-green-800 space-y-1">
              <p>
                <strong>Google Health Connect</strong> is an Android platform feature that aggregates
                health data from wearables and fitness apps (Samsung Health, Fitbit, Wear OS, etc.)
                into a single secure store. It cannot be read from a web browser.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Steps on your Android device:</p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
              <li>Install the <strong>Mediczy</strong> app from the Google Play Store</li>
              <li>Install the <strong>Health Connect</strong> app (if not pre-installed on Android 14+)</li>
              <li>Open the Mediczy app → <strong>Settings</strong> → <strong>Health &amp; Fitness</strong></li>
              <li>Tap <strong>Connect Google Health Connect</strong></li>
              <li>Grant the required permissions (steps, heart rate, sleep, etc.)</li>
              <li>Tap <strong>Sync Now</strong> — data will appear here within seconds</li>
            </ol>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500 space-y-1">
            <p>Data sources synced: Samsung Health, Fitbit, Garmin, Polar, Wear OS, Google Fit, and 50+ other apps that write to Health Connect.</p>
            <p>Syncs automatically in the background when the Mediczy Android app is running.</p>
          </div>

          <Button variant="outline" size="sm" onClick={() => setShowInstructions(false)}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Confirm disconnect ─────────────────────────────────────────────────────
  if (confirmDisconnect) {
    return (
      <Card className="border border-red-200">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-slate-900">Disconnect Health Connect?</p>
              <p className="text-sm text-slate-600 mt-1">
                This will delete all Health Connect data stored on this server.
                Your data in the Health Connect app on Android is not affected.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <><RefreshCw className="h-4 w-4 animate-spin mr-1" />Disconnecting…</> : 'Yes, Disconnect'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(false)} disabled={disconnecting}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Not connected / empty state ────────────────────────────────────────────
  if (!connected && !loading && dailyData.length === 0) {
    return (
      <Card className="border border-slate-200">
        <CardContent className="py-12 px-6 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center mx-auto shadow-lg shadow-green-500/20">
            <Activity className="h-8 w-8 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Connect Google Health Connect</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Sync steps, heart rate, sleep and more from any Health Connect-compatible app on Android.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 max-w-sm mx-auto text-left">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto text-center">
            {[
              { icon: Footprints, label: 'Steps & Activity' },
              { icon: Heart, label: 'Heart Rate' },
              { icon: Moon, label: 'Sleep' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
              </div>
            ))}
          </div>

          <Button
            onClick={() => setShowInstructions(true)}
            className="h-11 px-8 font-semibold bg-gradient-to-r from-green-600 to-teal-500 hover:opacity-90 text-white shadow-md"
          >
            <Smartphone className="h-4 w-4 mr-2" /> How to Connect
          </Button>
          <p className="text-[11px] text-slate-400">
            Requires the Mediczy Android app. Works with Samsung Health, Fitbit, Wear OS, and more.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="border border-slate-200">
        <CardContent className="py-12 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-green-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600">Loading Health Connect data…</p>
        </CardContent>
      </Card>
    );
  }

  const isBusy = loading;

  // ── Connected dashboard ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">Health Connect</p>
              {connected ? (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] py-0">
                  <CheckCircle className="h-2.5 w-2.5 mr-1" /> Synced
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500 text-[10px] py-0">
                  <WifiOff className="h-2.5 w-2.5 mr-1" /> Not Synced
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
          <Button variant="outline" size="sm" onClick={loadData} disabled={isBusy} className="h-8 text-xs gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
            {isBusy ? 'Loading…' : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInstructions(true)} className="h-8 text-xs gap-1.5">
            <Smartphone className="h-3.5 w-3.5" /> Sync from App
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(true)} className="h-8 text-xs text-slate-400 hover:text-red-500">
            Disconnect
          </Button>
        </div>
      </div>

      {/* Banners */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">{error}</p>
        </div>
      )}
      {syncWarning && (
        <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-yellow-800 font-medium">Partial sync</p>
            <p className="text-xs text-yellow-700 mt-0.5">{syncWarning}</p>
          </div>
          <button onClick={() => setSyncWarning(null)} className="text-yellow-500 hover:text-yellow-700 ml-2 text-xs">✕</button>
        </div>
      )}

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Footprints} label="Avg Daily Steps"  value={summary.avgSteps.toLocaleString()}           unit="steps"    color="text-blue-600"   bg="bg-blue-50" />
          <StatCard icon={Flame}      label="Total Calories"   value={summary.totalCalories.toLocaleString()}       unit="kcal"     color="text-orange-500" bg="bg-orange-50" />
          <StatCard icon={Timer}      label="Avg Active"       value={summary.avgActiveMinutes}                     unit="min/day"  color="text-green-600"  bg="bg-green-50" />
          <StatCard icon={Heart}      label="Avg Heart Rate"   value={summary.avgHeartRate || '—'}                  unit="bpm"      color="text-red-500"    bg="bg-red-50" />
          <StatCard icon={Moon}       label="Avg Sleep"        value={summary.avgSleepHours || '—'}                 unit="hrs"      color="text-purple-600" bg="bg-purple-50"
            sub={summary.sleepDaysTracked ? `${summary.sleepDaysTracked} of ${summary.daysTracked} days` : 'No sleep data'} />
          <StatCard icon={TrendingUp} label="Days Tracked"     value={summary.daysTracked}                          unit="days"     color="text-cyan-600"   bg="bg-cyan-50" />
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

          <TabsContent value="overview">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Footprints className="h-4 w-4 text-blue-500" />
                  Steps &amp; Calories — Last {summary?.daysTracked || 7} Days
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hcSteps" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="hcCals" x1="0" y1="0" x2="0" y2="1">
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
                    <Area yAxisId="l" type="monotone" dataKey="steps"    name="Steps"    stroke="#3b82f6" strokeWidth={2} fill="url(#hcSteps)" />
                    <Area yAxisId="r" type="monotone" dataKey="calories" name="Calories" stroke="#f97316" strokeWidth={2} fill="url(#hcCals)" />
                  </AreaChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={90} className="mt-3">
                  <BarChart data={dailyData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="activeMinutes" name="Active Min" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-center text-slate-400 mt-1">Active minutes per day</p>
              </CardContent>
            </Card>
          </TabsContent>

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
                    No heart rate data. A paired wearable that writes to Health Connect is required.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={dailyData.filter(d => d.heartRate.avg > 0)} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hcHr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit=" bpm" />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => [`${v} bpm`]} />
                    <Area type="monotone" dataKey="heartRate.avg" name="Avg BPM" stroke="#ef4444" strokeWidth={2} fill="url(#hcHr)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

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
                    No sleep data. Enable sleep tracking in your wearable or a Health Connect-compatible app.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dailyData.map(d => ({ ...d, sleep: d.sleepHours ?? 0 }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis unit="h" domain={[0, 12]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => [`${v}h`, 'Sleep']} />
                    <Bar dataKey="sleep" name="Sleep (hrs)" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-center text-slate-400 mt-2">Recommended: 7–9 hours per night</p>
                {dailyData.some(d => d.sleepHours) && (
                  <div className="mt-4 space-y-1.5">
                    {dailyData.filter(d => d.sleepHours).map(d => (
                      <div key={d.date} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                        <span className="text-slate-600 font-medium">{d.date}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-purple-400" style={{ width: `${Math.min((d.sleepHours! / 9) * 80, 80)}px` }} />
                          <span className={`font-semibold ${d.sleepHours! >= 7 ? 'text-green-600' : d.sleepHours! >= 6 ? 'text-amber-600' : 'text-red-500'}`}>
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
      ) : (
        <Card className="border border-slate-200">
          <CardContent className="py-10 text-center">
            <Zap className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No data yet — sync from the Mediczy Android app to see your Health Connect metrics.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowInstructions(true)}>
              <Smartphone className="h-4 w-4 mr-1.5" /> How to sync
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── Helper: build local summary when server doesn't return one ───────────────
function buildLocalSummary(daily: DailyRecord[]): SummaryData {
  if (!daily.length) return { totalSteps: 0, avgSteps: 0, totalCalories: 0, avgActiveMinutes: 0, avgHeartRate: 0, avgSleepHours: 0, sleepDaysTracked: 0, daysTracked: 0 };
  const n = daily.length;
  const totalSteps    = daily.reduce((s, d) => s + d.steps, 0);
  const totalCalories = daily.reduce((s, d) => s + d.calories, 0);
  const totalActive   = daily.reduce((s, d) => s + d.activeMinutes, 0);
  const hrDays        = daily.filter(d => d.heartRate.avg > 0);
  const sleepDays     = daily.filter(d => d.sleepHours);
  return {
    totalSteps, totalCalories,
    avgSteps:          Math.round(totalSteps / n),
    avgActiveMinutes:  Math.round(totalActive / n),
    avgHeartRate:      hrDays.length ? Math.round(hrDays.reduce((s, d) => s + d.heartRate.avg, 0) / hrDays.length) : 0,
    avgSleepHours:     sleepDays.length ? Math.round(sleepDays.reduce((s, d) => s + d.sleepHours!, 0) / sleepDays.length * 10) / 10 : 0,
    sleepDaysTracked:  sleepDays.length,
    daysTracked:       n,
  };
}

export default HealthConnectDashboard;
