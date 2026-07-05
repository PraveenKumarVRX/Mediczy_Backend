import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Siren, Loader2 } from 'lucide-react';
import { useCommandCenterData } from '@/features/command/hooks/useCommandCenterData';
import { forecastED } from '@/services/hospitalOs.service';
import { BedStatusChip } from '@/components/clinical/BedStatusChip';

export default function EDBoard() {
  const { displayData, loading } = useCommandCenterData();
  const [forecast, setForecast] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(true);

  useEffect(() => {
    forecastED(8)
      .then((r) => setForecast(r?.data))
      .catch(() => {})
      .finally(() => setForecastLoading(false));
  }, []);

  const erWaiting = displayData?.queues?.erWaiting ?? 0;
  const opdWaiting = displayData?.queues?.opdWaiting ?? 0;
  const departments = displayData?.queues?.byDepartment ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Siren className="h-5 w-5 text-amber-600" />
          Emergency Department Board
        </h2>
        <p className="text-sm text-muted-foreground">Live queue + predictive surge forecast (Pillar 8)</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-red-600">{erWaiting}</p>
            <p className="text-xs text-muted-foreground mt-1">ER waiting</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-amber-600">{opdWaiting}</p>
            <p className="text-xs text-muted-foreground mt-1">OPD spillover</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-teal-600">
              {displayData?.incidents?.codeBlueActive ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Active code blue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-purple-600">
              {forecast?.predictedArrivals ?? forecast?.forecast?.[0]?.arrivals ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Predicted arrivals (8h)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ED Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          {forecastLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading forecast…
            </div>
          ) : forecast ? (
            <div className="space-y-2 text-sm">
              {forecast.summary && <p className="text-slate-700">{forecast.summary}</p>}
              {(forecast.forecast || forecast.hourly || []).slice(0, 8).map((h: any, i: number) => (
                <div key={i} className="flex justify-between border-b py-2">
                  <span>{h.hour || h.label || `Hour ${i + 1}`}</span>
                  <Badge variant={h.risk === 'high' ? 'destructive' : 'secondary'}>
                    {h.arrivals ?? h.predicted ?? h.value ?? '—'} arrivals
                  </Badge>
                </div>
              ))}
              {!forecast.summary && !(forecast.forecast || forecast.hourly)?.length && (
                <p className="text-muted-foreground">Forecast model ready — awaiting live ED feed.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">ED forecast unavailable</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Department queues</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && !departments.length ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : departments.length ? (
            departments.map((d) => (
              <div key={d.department} className="flex flex-wrap items-center gap-3 border rounded-lg p-3">
                <span className="font-medium flex-1">{d.department}</span>
                <BedStatusChip status={d.active > 5 ? 'alert' : d.active > 2 ? 'monitoring' : 'stable'} />
                <span className="text-xs text-muted-foreground">
                  {d.active} active · p50 {d.p50_wait}m · p90 {d.p90_wait}m
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No department queue data</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
