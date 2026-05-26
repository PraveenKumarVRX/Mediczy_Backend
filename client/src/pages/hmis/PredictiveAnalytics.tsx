import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertTriangle, TrendingUp, Clock, Activity } from 'lucide-react';
import api from '@/services/api';

interface ReadmissionRisk { patient_name: string; mrn: string; risk_score: number; risk_level: 'low' | 'medium' | 'high'; primary_factors: string[]; }
interface PredictedLOS { patient_name: string; mrn: string; days_so_far: number; predicted_remaining: number; expected_discharge: string; status: 'on_track' | 'due_soon' | 'overdue'; }
interface DischargeDelay { patient_name: string; mrn: string; readiness_pct: number; delay_risk: 'low' | 'medium' | 'high'; blockers: string[]; }
interface Anomaly { metric: string; current_value: number; baseline: number; z_score: number; severity: 'warning' | 'critical'; direction: string; }
interface Benchmark { metric: string; your_7d: number; your_30d: number; industry: number; unit: string; status: 'good' | 'needs-improvement'; }

const RISK_COLOR: Record<string, string> = {
  low:    'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high:   'bg-red-100 text-red-700',
};

const STATUS_COLOR: Record<string, string> = {
  on_track:  'bg-emerald-100 text-emerald-700',
  due_soon:  'bg-amber-100 text-amber-700',
  overdue:   'bg-red-100 text-red-700',
  good:      'bg-emerald-100 text-emerald-700',
  'needs-improvement': 'bg-amber-100 text-amber-700',
};

export default function PredictiveAnalytics() {
  const navigate = useNavigate();
  const [readmission, setReadmission]   = useState<ReadmissionRisk[]>([]);
  const [losData, setLosData]           = useState<PredictedLOS[]>([]);
  const [delays, setDelays]             = useState<DischargeDelay[]>([]);
  const [anomalies, setAnomalies]       = useState<Anomaly[]>([]);
  const [benchmarks, setBenchmarks]     = useState<Benchmark[]>([]);
  const [loading, setLoading]           = useState(true);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.allSettled([
        api.get('/api/v1/analytics/readmission-risk?limit=10'),
        api.get('/api/v1/analytics/predicted-los'),
        api.get('/api/v1/analytics/discharge-delay-forecast'),
        api.get('/api/v1/analytics/anomalies'),
        api.get('/api/v1/analytics/benchmarks'),
      ]);
      if (r1.status === 'fulfilled') setReadmission(r1.value.data?.data ?? []);
      if (r2.status === 'fulfilled') setLosData(r2.value.data?.data ?? []);
      if (r3.status === 'fulfilled') setDelays(r3.value.data?.data ?? []);
      if (r4.status === 'fulfilled') setAnomalies(r4.value.data?.data?.anomalies ?? []);
      if (r5.status === 'fulfilled') setBenchmarks(r5.value.data?.data?.comparisons ?? []);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Predictive Analytics</h1>
            <p className="text-sm text-slate-500">AI-powered clinical forecasts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-xs text-slate-400">{lastUpdated.toLocaleTimeString()}</span>}
          <Button variant="outline" size="icon" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
      </div>

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />KPI Anomalies Detected</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {anomalies.map((a, i) => (
              <div key={i} className={`flex justify-between items-center p-2 rounded text-sm ${a.severity === 'critical' ? 'bg-red-100' : 'bg-amber-100'}`}>
                <span className="font-medium capitalize">{a.metric.replace(/_/g, ' ')}</span>
                <span>Current: <strong>{a.current_value}</strong> vs baseline {a.baseline} (z={a.z_score.toFixed(1)} {a.direction})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Readmission Risk */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-red-500" />Readmission Risk — Top Patients</CardTitle></CardHeader>
        <CardContent>
          {readmission.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No high-risk patients currently</p> : (
            <div className="space-y-2">
              {readmission.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center justify-between p-2 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{p.patient_name}</p>
                    <p className="text-xs text-slate-500">MRN: {p.mrn}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLOR[p.risk_level]}`}>{p.risk_level} risk — {p.risk_score}%</span>
                    {p.primary_factors?.length > 0 && <p className="text-xs text-slate-400">{p.primary_factors.slice(0, 2).join(', ')}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Predicted LOS */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-blue-500" />Predicted Length of Stay</CardTitle></CardHeader>
        <CardContent>
          {losData.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No active admissions</p> : (
            <div className="space-y-2">
              {losData.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center justify-between p-2 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{p.patient_name}</p>
                    <p className="text-xs text-slate-500">Day {p.days_so_far} · Est. +{p.predicted_remaining}d · Discharge: {p.expected_discharge}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[p.status]}`}>{p.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discharge Delay Forecast */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-purple-500" />Discharge Delay Forecast</CardTitle></CardHeader>
        <CardContent>
          {delays.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No discharge delays forecasted</p> : (
            <div className="space-y-2">
              {delays.slice(0, 8).map((p, i) => (
                <div key={i} className="p-2 border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{p.patient_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLOR[p.delay_risk]}`}>{p.delay_risk} risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${p.readiness_pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-500">{p.readiness_pct}% ready</span>
                  </div>
                  {p.blockers?.length > 0 && <p className="text-xs text-slate-400 mt-1">Blocking: {p.blockers.join(', ')}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Benchmarks */}
      {benchmarks.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">LOS Benchmarks vs Industry</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {benchmarks.map((b, i) => (
                <div key={i} className="flex items-center justify-between p-2 border rounded-lg text-sm">
                  <span className="font-medium capitalize">{b.metric.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500">7d: {b.your_7d}{b.unit}</span>
                    <span className="text-slate-500">30d: {b.your_30d}{b.unit}</span>
                    <span className="text-slate-400">Industry: {b.industry}{b.unit}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[b.status]}`}>{b.status.replace('-', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
