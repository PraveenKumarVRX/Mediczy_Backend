import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { useCommandCenterData } from '@/features/command/hooks/useCommandCenterData';
import { listSimulationScenarios, runHospitalSimulation } from '@/services/hospitalOs.service';
import { useEffect, useState } from 'react';

export default function AIRecommendations() {
  const { aiRecs, loading, refresh } = useCommandCenterData();
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    listSimulationScenarios()
      .then((r) => setScenarios(r?.data?.scenarios || r?.data || []))
      .catch(() => {});
  }, []);

  const runSim = async (key: string) => {
    setSimLoading(true);
    try {
      const r = await runHospitalSimulation(key);
      setSimResult(r?.data);
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            AI Recommendations
          </h2>
          <p className="text-sm text-muted-foreground">Operational intelligence — human approval required for actions</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      {aiRecs.length ? (
        <div className="grid md:grid-cols-2 gap-3">
          {aiRecs.map((r: any, i: number) => (
            <Card key={i} className={r.severity === 'critical' ? 'border-red-200' : ''}>
              <CardContent className="pt-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{r.title}</p>
                  {r.severity && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {r.severity}
                    </span>
                  )}
                </div>
                <p className="text-slate-600 mt-2">{r.message}</p>
                {r.action && <p className="text-xs text-teal-700 mt-2">Suggested: {r.action}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground text-center">
            {loading ? 'Loading AI recommendations…' : 'No active recommendations — hospital operating within normal parameters.'}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What-if simulation (Digital Twin)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(scenarios.length ? scenarios : [{ key: 'ed_surge_20pct', label: 'ED surge +20%' }, { key: 'icu_overflow', label: 'ICU overflow' }]).map(
              (s: any) => (
                <Button
                  key={s.key || s.scenarioKey}
                  variant="outline"
                  size="sm"
                  disabled={simLoading}
                  onClick={() => runSim(s.key || s.scenarioKey)}
                >
                  {s.label || s.name || s.key}
                </Button>
              )
            )}
          </div>
          {simResult && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm">
              <p className="font-medium">{simResult.scenario || 'Simulation result'}</p>
              <p className="text-slate-600 mt-1">{simResult.summary || JSON.stringify(simResult).slice(0, 200)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
