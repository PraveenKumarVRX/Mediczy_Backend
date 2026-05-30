/**
 * Apple Health Dashboard
 *
 * Web context: Apple HealthKit is iOS-only and cannot be accessed directly
 * from a browser. This component handles both states:
 *  - iOS device: shows deep-link instructions to open the native Mediczy app
 *    for the HealthKit sync flow (no web API bridge exists)
 *  - Desktop / Android: shows a clear explanation and any previously
 *    synced data that was uploaded by the iOS app
 *
 * All alert()/confirm() calls have been replaced with in-component state
 * (dialogs, inline banners). Raw axios replaced with the shared api util.
 */

import React, { useEffect, useState, useCallback } from 'react';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Activity, Heart, Footprints, Flame, Moon, Timer, Scale,
  Zap, RefreshCw, CheckCircle, XCircle, Clock,
  TrendingUp, AlertTriangle, Smartphone, Info, X,
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FitnessRecord {
  date: string;
  steps: number;
  calories: number;
  distance: number;
  activeMinutes: number;
  heartRate: { min: number; max: number; avg: number };
  sleep: { duration: number; efficiency: number };
  weight: number;
  height: number;
}

interface HealthStatus {
  isConnected: boolean;
  lastSyncDate: string | null;
  totalRecords: number;
}

type AlertType = 'info' | 'warning' | 'critical';

interface HealthAlert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const AppleHealthDashboard: React.FC = () => {
  const [fitnessData, setFitnessData]     = useState<FitnessRecord[]>([]);
  const [healthStatus, setHealthStatus]   = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [alerts, setAlerts]               = useState<HealthAlert[]>([]);
  const [showInstructions, setShowInstructions] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectMsg, setDisconnectMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // ── Fetch status ───────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/apple-health/status');
      if (data.success) setHealthStatus(data.data);
    } catch { /* non-critical */ }
  }, []);

  // ── Fetch health data ──────────────────────────────────────────────────────
  const fetchHealthData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/apple-health/summary', { params: { days: 7 } });
      if (data.success) {
        const records: FitnessRecord[] = (data.data.records || []).map((r: any) => ({
          date: new Date(r.date).toLocaleDateString(),
          steps: r.steps || 0,
          calories: r.calories || 0,
          distance: r.distance || 0,
          activeMinutes: r.active_minutes || 0,
          heartRate: { min: r.heart_rate_min || 0, max: r.heart_rate_max || 0, avg: r.heart_rate_avg || 0 },
          sleep: { duration: r.sleep_duration || 0, efficiency: r.sleep_efficiency || 0 },
          weight: r.weight || 0,
          height: r.height || 0,
        }));
        setFitnessData(records);
        setAlerts(deriveAlerts(records));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load Apple Health data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchHealthData();
  }, [fetchStatus, fetchHealthData]);

  // ── Alert derivation ───────────────────────────────────────────────────────
  const deriveAlerts = (records: FitnessRecord[]): HealthAlert[] => {
    if (!records.length) return [];
    const latest = records[0];
    const out: HealthAlert[] = [];
    if (latest.steps > 0 && latest.steps < 5000) {
      out.push({ id: 'low-steps', type: 'warning', title: 'Low Activity', message: `${latest.steps.toLocaleString()} steps today — aim for 10,000.` });
    }
    if (latest.steps >= 10000) {
      out.push({ id: 'great-steps', type: 'info', title: 'Goal Reached!', message: `${latest.steps.toLocaleString()} steps — great work!` });
    }
    if (latest.heartRate.max > 180) {
      out.push({ id: 'high-hr', type: 'critical', title: 'High Heart Rate', message: `Max ${latest.heartRate.max} bpm detected. Consider consulting a doctor.` });
    }
    if (latest.sleep.duration > 0 && latest.sleep.duration < 6) {
      out.push({ id: 'low-sleep', type: 'warning', title: 'Insufficient Sleep', message: `${latest.sleep.duration}h recorded — aim for 7–9 hours.` });
    }
    return out;
  };

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    setDisconnecting(true);
    setDisconnectMsg(null);
    try {
      await api.delete('/apple-health/disconnect');
      setHealthStatus(null);
      setFitnessData([]);
      setAlerts([]);
      setDisconnectMsg({ ok: true, text: 'Apple Health disconnected and data cleared.' });
    } catch (err: any) {
      setDisconnectMsg({ ok: false, text: err.response?.data?.message || 'Failed to disconnect. Please try again.' });
    } finally {
      setDisconnecting(false);
      setConfirmDisconnect(false);
    }
  };

  // ── Summary totals ─────────────────────────────────────────────────────────
  const totals = fitnessData.length ? fitnessData.reduce(
    (acc, d) => ({
      steps: acc.steps + d.steps,
      calories: acc.calories + d.calories,
      distance: acc.distance + d.distance,
      heartRateSum: acc.heartRateSum + d.heartRate.avg,
      sleepSum: acc.sleepSum + d.sleep.duration,
    }),
    { steps: 0, calories: 0, distance: 0, heartRateSum: 0, sleepSum: 0 }
  ) : null;

  const avgHR   = totals ? Math.round(totals.heartRateSum / fitnessData.length) : 0;
  const avgSleep = totals ? (totals.sleepSum / fitnessData.length).toFixed(1) : '0';

  const alertBg: Record<AlertType, string> = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    warning:  'bg-yellow-50 border-yellow-200 text-yellow-800',
    info:     'bg-blue-50 border-blue-200 text-blue-800',
  };

  // ── Instructions panel (replaces alert()) ─────────────────────────────────
  if (showInstructions) {
    return (
      <Card className="border border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5 text-red-500" />
            How to Sync Apple Health
          </CardTitle>
          <CardDescription>Apple HealthKit is only accessible from the Mediczy iOS app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isIOS ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Open the <strong>Mediczy iOS app</strong> on this device and follow these steps:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
                <li>Tap <strong>Profile</strong> → <strong>Settings</strong></li>
                <li>Tap <strong>Health Integration</strong></li>
                <li>Enable <strong>Apple Health Sync</strong></li>
                <li>Grant permissions in the iOS Health app when prompted</li>
              </ol>
              <p className="text-xs text-slate-500">
                Once synced in the iOS app, your data will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg bg-slate-50 border border-slate-200 p-4">
              <Info className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
              <div className="text-sm text-slate-600 space-y-1">
                <p>Apple Health syncing is only available on <strong>iOS devices</strong> via the Mediczy mobile app.</p>
                <p>Download the Mediczy app from the App Store, then enable <em>Settings → Health Integration → Apple Health</em>.</p>
                <p>Your synced data will appear here once the iOS app has pushed it to the server.</p>
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowInstructions(false)}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Confirm disconnect panel (replaces confirm()) ──────────────────────────
  if (confirmDisconnect) {
    return (
      <Card className="border border-red-200">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-slate-900">Disconnect Apple Health?</p>
              <p className="text-sm text-slate-600 mt-1">
                This will permanently delete <strong>all {healthStatus?.totalRecords ?? 0} Apple Health records</strong> stored on this server.
                Your original data in the iOS Health app is not affected.
              </p>
            </div>
          </div>
          {disconnectMsg && (
            <p className={`text-sm px-3 py-2 rounded-lg border ${disconnectMsg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {disconnectMsg.text}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? <><RefreshCw className="h-4 w-4 animate-spin mr-1" /> Disconnecting…</> : 'Yes, Disconnect'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(false)} disabled={disconnecting}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="border border-slate-200">
        <CardContent className="py-12 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-red-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600">Loading Apple Health data…</p>
        </CardContent>
      </Card>
    );
  }

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!healthStatus?.isConnected && fitnessData.length === 0) {
    return (
      <Card className="border border-slate-200">
        <CardContent className="py-12 px-6 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center mx-auto shadow-lg shadow-red-500/20">
            <Activity className="h-8 w-8 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Connect Apple Health</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Sync your health metrics from Apple Health via the Mediczy iOS app.
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 max-w-sm mx-auto">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          {disconnectMsg?.ok && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 max-w-sm mx-auto">
              {disconnectMsg.text}
            </p>
          )}
          <Button
            onClick={() => setShowInstructions(true)}
            className="h-11 px-8 bg-gradient-to-r from-red-500 to-pink-500 hover:opacity-90 text-white font-semibold"
          >
            <Smartphone className="h-4 w-4 mr-2" /> How to Connect
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Connected dashboard ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">Apple Health</p>
              {healthStatus?.isConnected ? (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] py-0">
                  <CheckCircle className="h-2.5 w-2.5 mr-1" /> Synced
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500 text-[10px] py-0">
                  <XCircle className="h-2.5 w-2.5 mr-1" /> Not Connected
                </Badge>
              )}
            </div>
            {healthStatus?.lastSyncDate && (
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                Last sync: {new Date(healthStatus.lastSyncDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchHealthData} className="h-8 text-xs gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInstructions(true)}
            className="h-8 text-xs"
          >
            <Smartphone className="h-3.5 w-3.5 mr-1" /> Sync from App
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDisconnect(true)}
            className="h-8 text-xs text-slate-400 hover:text-red-500"
          >
            Disconnect
          </Button>
        </div>
      </div>

      {/* Feedback banners */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}
      {disconnectMsg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border text-xs ${disconnectMsg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {disconnectMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <p>{disconnectMsg.text}</p>
          <button onClick={() => setDisconnectMsg(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Health alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${alertBg[a.type]}`}>
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">{a.title}</span>
                <span className="ml-1">{a.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary stat cards */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { icon: Footprints, label: 'Total Steps',    value: totals.steps.toLocaleString(),     unit: '',     color: 'text-blue-600',   bg: 'bg-blue-50'   },
            { icon: Flame,      label: 'Total Calories', value: totals.calories.toLocaleString(),   unit: 'kcal', color: 'text-orange-500', bg: 'bg-orange-50' },
            { icon: Zap,        label: 'Distance',       value: totals.distance.toFixed(1),         unit: 'km',   color: 'text-green-600',  bg: 'bg-green-50'  },
            { icon: Heart,      label: 'Avg Heart Rate', value: avgHR || '—',                       unit: 'bpm',  color: 'text-red-500',    bg: 'bg-red-50'    },
            { icon: Moon,       label: 'Avg Sleep',      value: avgSleep,                           unit: 'hrs',  color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(({ icon: Icon, label, value, unit, color, bg }) => (
            <Card key={label} className="border border-slate-200 shadow-sm">
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
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts */}
      {fitnessData.length > 0 ? (
        <Tabs defaultValue="steps">
          <TabsList className="grid grid-cols-4 h-9">
            <TabsTrigger value="steps"    className="text-xs">Steps</TabsTrigger>
            <TabsTrigger value="calories" className="text-xs">Calories</TabsTrigger>
            <TabsTrigger value="heart"    className="text-xs">Heart Rate</TabsTrigger>
            <TabsTrigger value="sleep"    className="text-xs">Sleep</TabsTrigger>
          </TabsList>

          {[
            { key: 'steps',    label: 'Daily Steps',    dataKey: 'steps',         stroke: '#3b82f6', fill: '#3b82f6', ChartType: AreaChart, Series: Area },
            { key: 'calories', label: 'Calories Burned', dataKey: 'calories',     stroke: '#f97316', fill: '#f97316', ChartType: AreaChart, Series: Area },
          ].map(({ key, label, dataKey, stroke, fill, ChartType, Series }) => (
            <TabsContent key={key} value={key}>
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-800">{label} — Last 7 Days</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <ResponsiveContainer width="100%" height={240}>
                    {/* @ts-ignore recharts generic */}
                    <ChartType data={fitnessData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                      {/* @ts-ignore recharts generic */}
                      <Series type="monotone" dataKey={dataKey} stroke={stroke} fill={fill} fillOpacity={0.25} strokeWidth={2} />
                    </ChartType>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>
          ))}

          <TabsContent value="heart">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-800">Heart Rate — Min / Avg / Max</CardTitle>
                {!fitnessData.some(d => d.heartRate.avg) && (
                  <CardDescription className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    No heart rate data found in the synced records.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={fitnessData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit=" bpm" />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="heartRate.min" stroke="#10b981" strokeWidth={2} name="Min HR"  dot={false} />
                    <Line type="monotone" dataKey="heartRate.avg" stroke="#3b82f6" strokeWidth={2} name="Avg HR"  dot={false} />
                    <Line type="monotone" dataKey="heartRate.max" stroke="#ef4444" strokeWidth={2} name="Max HR"  dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sleep">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-800">Sleep Duration</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={fitnessData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis unit="h" domain={[0, 12]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => [`${v}h`, 'Sleep']} />
                    <Area type="monotone" dataKey="sleep.duration" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} name="Sleep (hrs)" />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-center text-slate-400 mt-2">Recommended: 7–9 hours per night</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="border border-slate-200">
          <CardContent className="py-10 text-center">
            <TrendingUp className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No data yet. Sync from the Mediczy iOS app to see your health metrics here.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowInstructions(true)}>
              <Smartphone className="h-4 w-4 mr-1.5" /> How to sync
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AppleHealthDashboard;
