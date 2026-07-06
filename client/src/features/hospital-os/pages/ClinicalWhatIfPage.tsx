import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FlaskConical } from 'lucide-react';
import { listSimulationScenarios, runHospitalSimulation, simulateClinical } from '@/services/hospitalOs.service';
import { Input } from '@/components/ui/input';

export default function ClinicalWhatIfPage() {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [patientId, setPatientId] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    listSimulationScenarios().then((r) => setScenarios(r?.data || []));
  }, []);

  const runHospital = async (key: string) => {
    const r = await runHospitalSimulation(key);
    setResult(r?.data);
  };

  const runPatient = async () => {
    const pid = Number(patientId);
    if (!pid) return;
    const r = await simulateClinical({ patientId: pid, scenario: 'discharge_timing', proposedChange: 'Discharge in 24h' });
    setResult(r?.data);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-purple-600" />
        What-If Simulator (Pillar 20)
      </h2>
      <Card>
        <CardHeader><CardTitle className="text-base">Hospital scenarios</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {scenarios.map((s: any) => (
            <Button key={s.key} size="sm" variant="outline" onClick={() => runHospital(s.key)}>{s.label || s.key}</Button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Patient clinical scenario</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          <Button onClick={runPatient}>Simulate discharge</Button>
        </CardContent>
      </Card>
      {result && <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
