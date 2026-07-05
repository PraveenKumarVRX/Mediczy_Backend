import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Loader2 } from 'lucide-react';
import { getPatientTwin, syncPatientTwin, simulateClinical } from '@/services/hospitalOs.service';

export default function PatientTwinPage() {
  const [patientId, setPatientId] = useState('');
  const [twin, setTwin] = useState<any>(null);
  const [sim, setSim] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async (sync = false) => {
    const pid = Number(patientId);
    if (!pid) return;
    setLoading(true);
    try {
      const res = sync ? await syncPatientTwin(pid) : await getPatientTwin(pid);
      setTwin(res?.data);
    } finally {
      setLoading(false);
    }
  };

  const runClinicalSim = async () => {
    const pid = Number(patientId);
    if (!pid) return;
    const res = await simulateClinical({ patientId: pid, scenario: 'medication_change', proposedChange: 'Increase metoprolol dose' });
    setSim(res?.data);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <User className="h-5 w-5 text-teal-600" />
        Patient Digital Twin (Pillar 3)
      </h2>
      <div className="flex gap-2">
        <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} className="max-w-xs" />
        <Button onClick={() => load(false)} disabled={loading}>Load</Button>
        <Button variant="outline" onClick={() => load(true)} disabled={loading}>Sync</Button>
        <Button variant="secondary" onClick={runClinicalSim} disabled={!patientId}>Simulate change</Button>
      </div>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {twin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Twin snapshot</CardTitle></CardHeader>
          <CardContent><pre className="text-xs bg-slate-100 p-3 rounded overflow-auto max-h-80">{JSON.stringify(twin, null, 2)}</pre></CardContent>
        </Card>
      )}
      {sim && (
        <Card>
          <CardHeader><CardTitle className="text-base">Clinical what-if</CardTitle></CardHeader>
          <CardContent><pre className="text-xs bg-violet-50 p-3 rounded">{JSON.stringify(sim, null, 2)}</pre></CardContent>
        </Card>
      )}
    </div>
  );
}
