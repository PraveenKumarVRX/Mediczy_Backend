import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react';
import api from '@/utils/api';

interface Snapshot { bedOccupancyPct: number; activeAdmissions: number; todayOTCases: number; criticalAlerts: number; pendingDischarges: number; preAuthsPending: number; }
interface KPI { name: string; value: string; target: string; status: 'on-track' | 'needs-attention' | 'critical'; }
interface ClinicalAdoption { label: string; value: number; }
interface QualityMetric { label: string; value: string; trend: 'up' | 'down' | 'flat'; good: 'up' | 'down'; }

const KPI_STYLE: Record<string, string> = {
  'on-track':        'bg-emerald-100 text-emerald-700',
  'needs-attention': 'bg-amber-100 text-amber-700',
  'critical':        'bg-red-100 text-red-700',
};

function TrendIcon({ trend, good }: { trend: 'up' | 'down' | 'flat'; good: 'up' | 'down' }) {
  const positive = trend === good;
  if (trend === 'flat') return <Minus className="h-4 w-4 text-slate-400" />;
  if (trend === 'up') return <TrendingUp className={`h-4 w-4 ${positive ? 'text-emerald-600' : 'text-red-500'}`} />;
  return <TrendingDown className={`h-4 w-4 ${positive ? 'text-emerald-600' : 'text-red-500'}`} />;
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot]   = useState<Snapshot | null>(null);
  const [ops, setOps]             = useState<KPI[]>([]);
  const [clinical, setClinical]   = useState<ClinicalAdoption[]>([]);
  const [quality, setQuality]     = useState<QualityMetric[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ccRes, opsRes, clinRes, qualRes] = await Promise.allSettled([
        api.get('/v1/analytics/command-center'),
        api.get('/v1/analytics/operational'),
        api.get('/v1/analytics/clinical'),
        api.get('/v1/analytics/quality'),
      ]);
      if (ccRes.status === 'fulfilled')  setSnapshot(ccRes.value.data?.data ?? null);
      if (opsRes.status === 'fulfilled') setOps(opsRes.value.data?.data ?? []);
      if (clinRes.status === 'fulfilled') setClinical(clinRes.value.data?.data ?? []);
      if (qualRes.status === 'fulfilled') setQuality(qualRes.value.data?.data ?? []);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-teal-600" /> Leadership Command Center
            </h1>
            {lastUpdated && <p className="text-xs text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString('en-IN')} · auto-refreshes every 60s</p>}
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {/* Section 1: Live Snapshot */}
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Live Snapshot</h2>
        {snapshot ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { label: 'Bed Occupancy', value: `${snapshot.bedOccupancyPct}%`, cls: 'bg-blue-50 text-blue-800 border-blue-200' },
              { label: 'Active Admissions', value: snapshot.activeAdmissions, cls: 'bg-teal-50 text-teal-800 border-teal-200' },
              { label: "Today's OT Cases", value: snapshot.todayOTCases, cls: 'bg-purple-50 text-purple-800 border-purple-200' },
              { label: 'Critical Alerts', value: snapshot.criticalAlerts, cls: snapshot.criticalAlerts > 0 ? 'bg-red-100 text-red-800 border-red-300' : 'bg-slate-100 text-slate-700 border-slate-200' },
              { label: 'Pending Discharges', value: snapshot.pendingDischarges, cls: 'bg-amber-50 text-amber-800 border-amber-200' },
              { label: 'Pre-Auth Pending', value: snapshot.preAuthsPending, cls: 'bg-orange-50 text-orange-800 border-orange-200' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 text-center ${s.cls}`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs mt-1 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-100 rounded-xl h-24 mb-6 flex items-center justify-center text-muted-foreground text-sm">
            {loading ? 'Loading snapshot…' : 'No snapshot data'}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Section 2: Ops KPIs */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Operations KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              {ops.length === 0 && !loading ? (
                <p className="text-sm text-muted-foreground">No KPI data</p>
              ) : (
                <div className="space-y-3">
                  {ops.map(kpi => (
                    <div key={kpi.name} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{kpi.name}</p>
                        <p className="text-sm font-bold text-slate-900">{kpi.value} <span className="text-xs text-muted-foreground font-normal">/ {kpi.target}</span></p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${KPI_STYLE[kpi.status]}`}>{kpi.status.replace('-', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Clinical Adoption */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Clinical Adoption</CardTitle>
            </CardHeader>
            <CardContent>
              {clinical.length === 0 && !loading ? (
                <p className="text-sm text-muted-foreground">No adoption data</p>
              ) : (
                <div className="space-y-4">
                  {clinical.map(m => (
                    <div key={m.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-slate-600">{m.label}</span>
                        <span className="text-xs font-bold text-slate-800">{m.value}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${m.value >= 80 ? 'bg-emerald-500' : m.value >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(m.value, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 4: Quality */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Quality Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              {quality.length === 0 && !loading ? (
                <p className="text-sm text-muted-foreground">No quality data</p>
              ) : (
                <div className="space-y-3">
                  {quality.map(m => (
                    <div key={m.label} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
                      <div className="flex-1">
                        <p className="text-xs text-slate-500">{m.label}</p>
                        <p className="text-lg font-bold text-slate-800">{m.value}</p>
                      </div>
                      <TrendIcon trend={m.trend} good={m.good} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
