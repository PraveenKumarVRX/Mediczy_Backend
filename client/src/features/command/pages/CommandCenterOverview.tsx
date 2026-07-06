import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useCommandCenterData } from '@/features/command/hooks/useCommandCenterData';

const KPI_STYLE: Record<string, string> = {
  'on-track': 'bg-emerald-100 text-emerald-700',
  'needs-attention': 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

function TrendIcon({ trend, good }: { trend: 'up' | 'down' | 'flat'; good: 'up' | 'down' }) {
  const positive = trend === good;
  if (trend === 'flat') return <Minus className="h-4 w-4 text-slate-400" />;
  if (trend === 'up') return <TrendingUp className={`h-4 w-4 ${positive ? 'text-emerald-600' : 'text-red-500'}`} />;
  return <TrendingDown className={`h-4 w-4 ${positive ? 'text-emerald-600' : 'text-red-500'}`} />;
}

export default function CommandCenterOverview() {
  const { snapshot, ops, clinical, quality, aiRecs, loading, error } = useCommandCenterData();

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Live Snapshot</h2>
        {snapshot ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Bed Occupancy', value: `${snapshot.bedOccupancyPct}%`, cls: 'bg-blue-50 text-blue-800 border-blue-200' },
              { label: 'Active Admissions', value: snapshot.activeAdmissions, cls: 'bg-teal-50 text-teal-800 border-teal-200' },
              { label: "Today's OT Cases", value: snapshot.todayOTCases, cls: 'bg-purple-50 text-purple-800 border-purple-200' },
              {
                label: 'Critical Alerts',
                value: snapshot.criticalAlerts,
                cls: snapshot.criticalAlerts > 0 ? 'bg-red-100 text-red-800 border-red-300' : 'bg-slate-100 text-slate-700 border-slate-200',
              },
              { label: 'Pending Discharges', value: snapshot.pendingDischarges, cls: 'bg-amber-50 text-amber-800 border-amber-200' },
              { label: 'Pre-Auth Pending', value: snapshot.preAuthsPending, cls: 'bg-orange-50 text-orange-800 border-orange-200' },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border p-4 text-center ${s.cls}`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs mt-1 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-100 rounded-xl h-24 flex items-center justify-center text-muted-foreground text-sm">
            {loading ? 'Loading snapshot…' : 'No snapshot data'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Operations KPIs</CardTitle>
          </CardHeader>
          <CardContent>
            {ops.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">No KPI data</p>
            ) : (
              <div className="space-y-3">
                {ops.map((kpi) => (
                  <div key={kpi.name} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{kpi.name}</p>
                      <p className="text-sm font-bold text-slate-900">
                        {kpi.value}{' '}
                        <span className="text-xs text-muted-foreground font-normal">/ {kpi.target}</span>
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${KPI_STYLE[kpi.status]}`}>
                      {kpi.status.replace('-', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Clinical Adoption</CardTitle>
          </CardHeader>
          <CardContent>
            {clinical.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">No adoption data</p>
            ) : (
              <div className="space-y-4">
                {clinical.map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-slate-600">{m.label}</span>
                      <span className="text-xs font-bold text-slate-800">{m.value}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${m.value >= 80 ? 'bg-emerald-500' : m.value >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(m.value, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Quality Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {quality.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">No quality data</p>
            ) : (
              <div className="space-y-3">
                {quality.map((m) => (
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

      {aiRecs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">AI Operational Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3">
            {aiRecs.slice(0, 4).map((r: any, i: number) => (
              <div
                key={i}
                className={`rounded-lg border p-3 text-sm ${r.severity === 'critical' ? 'border-red-200 bg-red-50' : 'bg-white'}`}
              >
                <p className="font-medium">{r.title}</p>
                <p className="text-slate-600 mt-1">{r.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
