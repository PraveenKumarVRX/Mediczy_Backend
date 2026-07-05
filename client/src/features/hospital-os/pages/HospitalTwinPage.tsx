import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Loader2 } from 'lucide-react';
import { getHospitalTwin, runHospitalSimulation, listSimulationScenarios } from '@/services/hospitalOs.service';

export default function HospitalTwinPage() {
  const [twin, setTwin] = useState<any>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [sim, setSim] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getHospitalTwin().then((r) => setTwin(r?.data)),
      listSimulationScenarios().then((r) => setScenarios(r?.data || [])),
    ]).finally(() => setLoading(false));
  }, []);

  const runSim = async (key: string) => {
    const r = await runHospitalSimulation(key);
    setSim(r?.data);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Building2 className="h-5 w-5 text-blue-600" />
        Hospital Digital Twin (Pillar 2)
      </h2>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Live operational state</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto max-h-64">{JSON.stringify(twin, null, 2)}</pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">What-if scenarios</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(scenarios.length ? scenarios : [{ key: 'ed_surge_20pct' }, { key: 'icu_overflow' }]).map((s: any) => (
                  <Button key={s.key} size="sm" variant="outline" onClick={() => runSim(s.key)}>{s.label || s.key}</Button>
                ))}
              </div>
              {sim && <pre className="text-xs bg-violet-50 p-3 rounded">{JSON.stringify(sim, null, 2)}</pre>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
